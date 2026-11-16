# B-DB-READ-TOOL — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (r2)

change-class: non_architecture · **Owner:** Infra Claude (CC-INFRA) · **Scope:** r2 `1f815ebb9` (Step 1 PROCEED, Langston, Discord queue id `1571876416885104713`) · **Kyle:** KD-96
**r1 → r2:** r1 (`8162ce7e3`) was written against scope r1; this is rewritten against r2 — A-1's intent-before-attempt lockout, OBJ-7, and Langston's Step-1 conditions C-1, C-2 and C-3.
**Audit first, plan second; every plan item cites its finding; anything with no audit treatment is marked `UNAUDITED`.**

## 0. PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (scope r1 §0):** "Of the 18 helper scripts in `/home/deploy`, two reach the database." **NOW:** 18 was the `.py` count and two its `PGPASSWORD` subset; **~50 reach the database** (top-level `*.py *.sh *.mjs *.js *.ts`: 86-88 files, `psql` in 50-51, whole-`$DATABASE_URL` in 48, `PGPASSWORD` in 2, `sslmode` set in 0 — Langston's re-derivation; same-day churn between his and my counts). **REASON:** wrong population; corrected in the scope at Step 2.
- **PREVIOUSLY STATED (scope r1 §0, a hypothesis):** two attempts per call came from the non-SSL retry or several addresses. **NOW: MEASURED — the non-SSL retry** (A1); one address only (A2). **REASON:** the listener.
- **PREVIOUSLY STATED (pre-audit r1 P1d):** the LOCKED marker is written on a failure. **NOW:** an INTENT record is written BEFORE the attempt (A-1). **REASON:** a call killed between connect and record left no marker.

## 1. SOURCES READ
| # | source | read |
|---|---|---|
| 1 | code | `comms-infra/staging/dt-api` (pattern), `token-watch/ops/alert_mint.py` (the alert argv), `scripts/system-alerts.ts` `cmdAdd`, `server/db.ts` `POOL_CONFIG`/`DIAG_POOL_CONFIG` (`:87-106`, `:157-172`), `node_modules/pg/lib/connection-parameters.js` (8.13.1, staging) |
| 2 | runtime | staging: `.env` mode and URL shape (secret never printed), `psql` 17.10, DNS of the DB host, the fake-server attempt counts, PATH for root / deploy (login) / deploy (non-interactive ssh), `pg_stat_ssl` per application (A10) |
| 3 | SIM | no entry for a staging database-read tool (the `dt-api` crew-login entry is the neighbour) — **a gap filled at Step 10** |
| 4 | System Manual | silent on how sessions read the database, and on the app's database TLS — **two gaps**: the first filled at Step 10, the second is §4's finding |
| 5 | ledger | `#1259`, `#1023`; no earlier batch for a DB read tool (`psql`, `dt-sql`, `read-only` in `RUNNING_ISSUES`, `BATCH_CATALOG`: none) |
| 6 | `bridge/canonical/` | predates the staging box: no coverage, expected |

## 2. AUDIT

**A1 — two attempts per call is libpq's non-SSL retry (MEASURED).** A fake Postgres server on `127.0.0.1` (`/root/birthcap/fakepg.py`: TLS on `SSLRequest`, a cleartext-password request, then `FATAL 28P01`) counts TCP connections per `psql` call, `PGPASSWORD=wrong`: `sslmode=prefer` (libpq's default) **2** (`ssl`, then `plain`), the error printed twice — the 11-16 shape; `sslmode=require` **1**. ⚠️ This is the CLIENT's attempt count, measured locally; Supabase's own counter is never observed (scope A-3).

**A2 — one address.** The DB host resolves to exactly one address (IPv6, no A record); `hostaddr` is still pinned per call, because one address today does not guarantee one tomorrow.

**A3 — the credential.** `.env` `deploy` 0600; one `DATABASE_URL`, direct endpoint `db.<ref>.supabase.co:5432`, **no `sslmode`**; the password carries one `%40` escape (18 bytes stored, 16 decoded). Read at run time with `urllib.parse.urlsplit` + `unquote`; never copied.

**A4 — the client.** `psql` 17.10; no Python Postgres driver. ⇒ the tool wraps `psql`.

**A5 — who calls it.** CC sessions as `root`, Langston and Coltrane as `deploy`. ⇒ runnable as either; as `root` it re-runs as `deploy`.

**A6 — the connecting population.** The app (node `pg`, its pool), cron scripts (the app's db module), and ~50 `psql` callers in `/home/deploy` (A0) — **every one on libpq's `prefer`**, so each doubles a wrong password. Hand-run `psql` (the 11-16 trigger) is the same client.

**A7 — read-only.** `PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=60s'` on the direct port (the session pooler drops startup options, `#1259`). Superuser credential, and `SET` can undo it ⇒ an accident guard, not a boundary; the SQL refusal list is described as incomplete, never complete.

**A8 — the alert.** `npm run system-alerts -- add … --category health_check --severity critical --dedupe-key …` as `deploy`; the queue is a file, so it works while the database is unreachable.

**A9 — classifying the outcome.** Credential: `password authentication failed` (28P01), `no pg_hba.conf entry` (28000). Pre-auth refusal: `Connection refused`. Everything else that is not `rc 0` — a timeout, a signal, any other text — is AMBIGUOUS.

**A10 — what a `PGSSLMODE` default would reach (MEASURED, OBJ-7(b) pricing).**
- The app's pools set only `connectionString: DATABASE_URL` (`server/db.ts:88`, `:158`), no `ssl`. node `pg` 8.13.1 then takes `ssl` from `PGSSLMODE` (`connection-parameters.js:22-33`: `require` → `true`), and with nothing set uses the default `ssl: false`.
- **Measured live (`pg_stat_ssl` joined to `pg_stat_activity`, one login, `sslmode=require`):** `dawntrader_main` 9 connections, `dawntrader_pool_monitor` 1 — **all `ssl = f`**. The app talks to Supabase WITHOUT TLS today.
- ⇒ a `PGSSLMODE=require` in any environment the app inherits would switch it to TLS **with certificate verification** (node's `rejectUnauthorized` default), never tested against Supabase's chain — a possible app-wide database outage. **An environment default is REJECTED.**
- **A `psql`-only wrapper reaches libpq and nothing else.** `/usr/local/bin` precedes `/usr/bin` for `root`, for `deploy` (login) and for `deploy` over non-interactive ssh (the reviewers' path); there is no `/usr/local/bin/psql` today. Measured against the fake server, a wrapper that defaults `PGSSLMODE=require` and `PGCONNECT_TIMEOUT=15` only when unset: a URL with no `sslmode` (the 48 callers' form) → **1 attempt** (raw `psql`: 2); a URL that sets `sslmode=prefer` → 2 (an explicit setting wins; 0 of the callers set one).

## 3. PLAN (each item → its finding)
- **P1 — `comms-infra/staging/dt-sql`** (Python, stdlib only; A4):
  - **P1a** credential (A3): parse and `unquote`; password only via `PGPASSWORD` in the child's environment.
  - **P1b** one attempt (A1, A2): `host=… hostaddr=<first resolved> port=… dbname=… user=… sslmode=require connect_timeout=15 application_name=dt-sql`.
  - **P1c** read-only (A7): `PGOPTIONS`; refuse SQL naming `transaction_read_only` before connecting; documented as an incomplete accident guard.
  - **P1d** fail-closed lockout (scope A-1, A9; C-1, C-2): an exclusive `flock` on `/var/lib/dt-sql/lock` for the whole call. Inside it: (1) a `LOCKED` file → refuse, exit 4, print its arm; (2) a left-over `INTENT` file → write `LOCKED` with arm `ambiguous` ("a previous call ended without a result"), refuse, exit 4; (3) write `INTENT` (time, caller, pid); (4) run `psql`; (5) classify — **clean success → `INTENT` removed; `Connection refused` before any credential was judged → `INTENT` removed, exit 3** *"the address may be banned — do not retry"* (C-1's wording); **28P01/28000 → `LOCKED` arm `credential` + a critical alert, exit 4; anything else (timeout, signal, unparsed non-zero) → `LOCKED` arm `ambiguous`, exit 4** (the alert is raised for `credential` only; `ambiguous` prints its reason). `--status` prints the arm and the time (C-2). `--unlock --by <canonical actor>` clears it and logs who.
  - **P1e** interface: `dt-sql -c "<sql>"` · `dt-sql -f <file>` · SQL on stdin · `--csv` · `--status` · `--unlock --by`; as `root` it re-runs as `deploy` (A5).
- **P2 — `comms-infra/staging/psql-wrapper` → `/usr/local/bin/psql`** (OBJ-7(b), A10): POSIX sh, sets `PGSSLMODE=require` and `PGCONNECT_TIMEOUT=15` ONLY when unset, then `exec /usr/bin/psql "$@"`. It reaches `psql` alone, never the app.
- **P3 — install** `dt-sql` (root 0755), the wrapper (root 0755) and `/var/lib/dt-sql` (`deploy` 0750) from the blobs at the reviewed sha (the dt-api installer form); the live checks are Step 7.
- **P4 — tests** `comms-infra/staging/tests/dt_sql_tests.py` + `dt_sql_mutations.py`, in CI: the parse (`%40`, `%2F`, `%3A`); the connection string carries `sslmode=require` and `hostaddr`; no password in argv; read-only refusal; **every P1d outcome with a fake `psql`**, including a fake killed by SIGKILL mid-call leaving `INTENT` (the next call locks `ambiguous`), and two queued callers (the second refuses); the wrapper's defaults and that an explicit setting wins. The fake server proves 1-vs-2 attempts where `psql` exists; `UNAUDITED`: whether the CI runner has `psql` — checked at Step 3; if it does not, that check is skipped and stated, and runs live on staging at Step 7.
- **P5 — governance (OBJ-5, C-3):** `CLAUDE.md` §7 staging commands (`dt-sql` beside `dt-api`, **with `--status` and `--unlock --by`**); `workflow-07-verify-cc:92`; Langston's file via `langston-memory-write`; Coltrane's via `coltrane-memory`; the SIM entry; a System Manual line in staging operations; `RUNNING_ISSUES #1259`; `DELETED_COMPONENTS_LOG` (`w166b-pgq.py`, deleted at Step 3).

## 4. OUT-OF-SCOPE FINDINGS (§9.4)
- **The app connects to Supabase WITHOUT TLS** (A10: 10 of 10 app connections `ssl = f`; `server/db.ts:88`, `:158` set no `ssl`). DISPOSITION: decision required — no work here; proposed to PM for Kyle's list (turning it on needs the certificate chain tested first, or the app loses its database).
- **The ~48 `psql` callers stay one-attempt-per-call clients after P2, not zero** — two consecutive runs after a password rotation still ban the address. DISPOSITION: retiring the helper set is OBJ-7(c), a proposal for Kyle via PM; **the completion report states that `#1259`'s ban risk is reduced, not discharged** (Langston's Step-1 note).
- **A read-only database role** (A7). DISPOSITION: decision required — proposed to PM for Kyle's list.

`REVIEWER:` none spawned. A1 and A10 are measured with positive controls (prefer → 2; the probe's own `ssl = t` row beside the app's `f` rows); `NOT RE-READ` by a fresh reader.
