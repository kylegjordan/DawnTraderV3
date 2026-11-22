# DT_SQL_RUNBOOK — the staging database read tool: re-keying, recovery, unlocking

> **Owner: Infra Claude (CC-INFRA).** Every procedure here needs **root on staging** (`188.245.193.8`).
> Built by `B-DB-READONLY-ROLE` (row 5a1, KD-100; pre-audit plan row P9). The tools' own headers are the
> operating record for flags and exit codes — `comms-infra/staging/dt-sql`, `dt-sql-login`,
> `dt-sql-role-setup`; the install map is `comms-infra/staging/README.md`. This file holds the procedures
> that are run by hand, rarely, under pressure.

## 0. The one risk that shapes every step — the ban (`#1259`)

Supabase bans an address after **two wrong passwords in a row**. The ban is per address, so it is shared
with the app: on 2026-11-16 a hand-built `psql` sent two wrong passwords and **the whole app lost its
database for ~60 minutes.** `dt-sql` exists so that a session can never send a wrong password twice: one
refused login locks it (`credential`), and anything it cannot classify locks it too (`ambiguous`).

⇒ **Never test a password you are unsure of.** Every recovery below re-keys the read-only login through
the app's own login (known good, because the app is running on it) instead of guessing which password
the database holds.
⇒ **Never run a hand-built `psql`.** `/usr/local/bin/psql` is a wrapper that refuses while dt-sql is LOCKED.

## 1. The pieces

| piece | what it is |
|---|---|
| `dt-sql` | the only hand-run read; keeps the lock, the INTENT record and LOCKED; holds no password |
| `dt-sql-login` | runs as the `dtsql` account, reads `/etc/dt-sql/reader.env`, makes ONE TLS-checked login as `dt_reader` |
| `dt_reader` | the read-only database role (no superuser, no create, no replication, no RLS bypass; `pg_read_all_data` + `pg_monitor`; read-only by default) |
| `/etc/dt-sql/reader.env` | `dt_reader`'s login, `0600 dtsql:dtsql` |
| `dt-sql-role-setup` | root-only: `--create`, `--rotate`, `--recover`, `--verify` |

Alerts it raises: `credential` lock = **critical**, `ambiguous` lock = warning, a failed TLS check
(`dt-sql-transport`, exit 6) = **critical**. Infra Claude owns them.

## 2. Unlocking (exit 4, LOCKED)

1. `dt-sql --status` — it names the arm.
2. **Find out WHY before anything else.** `/var/lib/dt-sql/log.jsonl` holds each call's outcome.
   - **`ambiguous`** — a timeout, a signal, or a failure dt-sql could not classify. No password was
     judged wrong. Read the log line; if the cause is understood and gone (a slow query, a killed
     session), unlock: `dt-sql --unlock --by cc-infra`.
   - **`credential`** — the database **refused the password in `reader.env`.** One wrong password is
     already spent. ⛔ **Do NOT unlock and retry: the next call would send the same password — the
     second wrong one, and the ban.** Run §4 (recovery) instead; it unlocks as part of the procedure.
3. `--by` must be one of dt-sql's own actors (its `ACTORS` list: `cc-a`, `cc-b`, `cc-c`, `cc-infra`,
   `cc-pm`, `kyle`, `langston`, `coltrane`) — a local list in the tool, not the alert queue's `ALERT_ACTORS`.
4. Resolve the alert with the evidence of the cause.

## 3. Re-keying (`--rotate`) — routine, both files present

```
dt-sql --status                       # must be unlocked, no left-over INTENT
dt-sql-role-setup --rotate
dt-sql-role-setup --verify            # exit 0 = every check passed
```
`--rotate` writes the new password to `reader.env.new` (0600, fsynced) **before** it logs in, sends the
database only the password's SCRAM verifier, and replaces `reader.env` only after the database said yes.

**If `--rotate` exits 4 (LOCKED):** the login ended without a clear answer, so **the database may or may
not hold the new password.** `reader.env.new` is KEPT, because it may be the only copy of the password
the database now holds. Do not try either password. Run §4 — it sets a third password through the app's
login, so it does not matter which of the two the database took.
**Any other failure** removes `reader.env.new`; the old `reader.env` is untouched and still works.

## 4. Recovery (`--recover`) — `reader.env` lost, refused, or in doubt

Use when `reader.env` is missing, when dt-sql locked `credential`, or after a `--rotate` that exited 4.
`--recover` refuses while `reader.env` or `reader.env.new` exists, so move both aside first — which also
means no other session's dt-sql can send the doubtful password meanwhile (with no reader file the login
step refuses before connecting, and nothing locks).

```
D=$(date -u +%Y%m%dT%H%M%SZ)
[ -e /etc/dt-sql/reader.env ]     && mv /etc/dt-sql/reader.env     /etc/dt-sql/reader.env.aside-$D
[ -e /etc/dt-sql/reader.env.new ] && mv /etc/dt-sql/reader.env.new /etc/dt-sql/reader.env.kept-$D
dt-sql --status                       # if LOCKED: find the cause (§2), then
dt-sql --unlock --by cc-infra
dt-sql-role-setup --recover           # new password via the app's own login; reader.env written afresh
dt-sql-role-setup --verify            # exit 0 = every check passed
```
Then remove the `.aside-` / `.kept-` copies (they hold dead passwords) and resolve the alert.
`--recover` promotes with a link that never overwrites: if a `reader.env` appeared while it ran, it exits
66 and leaves the new password in `reader.env.new` — find out who wrote the other file before moving it.

**If the app's own login fails (exit 67, or the setup locks `credential`):** stop. The app's `.env` is the
problem, not the read-only role, and the app itself is at risk — tell Kyle and the crew.

## 5. Rollback of the batch

Reinstall the previous `dt-sql` blob (it reads the app's `.env` again) and its drift row. `DROP ROLE
dt_reader` (through the app's login) only on a Langston or Kyle ruling — dropping it is not needed to roll back.

## 6. What this tool does NOT prove

- **Row-level security makes 26 tables (16 in `auth`, 10 in `storage`) read as EMPTY to `dt_reader`.** An
  empty result there is not an absence.
- `deploy` can still read the app's write login in `.env`, so read-only binds dt-sql, not the deploy account
  (until `#1102` removes deploy's `NOPASSWD: ALL`).
