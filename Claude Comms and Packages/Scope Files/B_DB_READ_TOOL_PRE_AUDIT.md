# B-DB-READ-TOOL — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (r1)

change-class: non_architecture · **Owner:** Infra Claude (CC-INFRA) · **Scope:** r1 `aa4073101` · **Kyle:** KD-96
**Audit first, plan second; every plan item cites its finding; anything with no audit treatment is marked `UNAUDITED`.**

## 0. PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (scope §0, a hypothesis):** each 11-16 `psql` call tried twice because of `sslmode=prefer`'s non-SSL retry or several resolved addresses. **NOW: MEASURED — it is the non-SSL retry.** **REASON:** A1.

## 1. SOURCES READ
| # | source | read |
|---|---|---|
| 1 | code | `comms-infra/staging/dt-api` (pattern), `token-watch/ops/alert_mint.py` (the alert argv), `scripts/system-alerts.ts` `cmdAdd` |
| 2 | runtime | staging: `.env` mode and URL shape (secret never printed), `psql --version`, DNS of the DB host, the fake-server attempt count, `/home/deploy/*.py` census |
| 3 | SIM | no entry for a staging database-read tool exists (the `dt-api` crew-login entry is the neighbour) — **a gap this batch fills at Step 10** |
| 4 | System Manual | silent on how sessions read the database — **the same gap**; the app's own pool is documented, a human/agent read path is not |
| 5 | ledger | `#1259` (the ban, trigger confirmed KD-93), `#1023` (dt-api); no earlier batch for a DB read tool (grep `RUNNING_ISSUES`, `BATCH_CATALOG` for `psql`, `dt-sql`, `read-only`: none) |
| 6 | `bridge/canonical/` | predates the staging box: no coverage, expected |

## 2. AUDIT

**A1 — why one `psql` call sent two wrong passwords (MEASURED, staging, 2026-11-16).** A fake Postgres server on `127.0.0.1` (TLS on `SSLRequest`, then a cleartext-password request, then `FATAL 28P01`) counted TCP connections per `psql` call with `PGPASSWORD=wrong`:
- `sslmode=prefer` (libpq's default) → **2 attempts** (`ssl`, then `plain`), the error printed twice — the 11-16 shape exactly;
- `sslmode=require` → **1 attempt**, the error once.
⇒ the second attempt is libpq retrying without SSL. Fixture: `/root/birthcap/fakepg.py` (to move into the batch's tests).

**A2 — the address.** `db.<ref>.supabase.co` resolves to ONE address (IPv6 `2a05:d018:135e:16c7:82b8:28a7:565c:6ebf`). One address today does not guarantee one tomorrow, so `hostaddr` is pinned to the first resolved address per call (libpq iterates every address of `host`).

**A3 — the credential.** `/home/deploy/dawntrader/.env` is `deploy` 0600; `DATABASE_URL` is `postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres`; **the password contains `%`** (percent-encoded), 18 characters as stored. `sed` sends the encoded form; `urllib.parse.unquote` gives the real one. Read at run time, never copied, so a rotation reaches the tool at once.

**A4 — the client.** `psql` 17.10 on staging; no Python Postgres driver (`psycopg2` absent). ⇒ the tool wraps `psql`.

**A5 — who calls it.** CC sessions reach staging as `root`; Langston and Coltrane as `deploy` (their staging keys). `.env` is readable by both. ⇒ runnable as `root` or `deploy`; as `root` it re-runs itself as `deploy` (`runuser -u deploy`), so the lock and state files have one owner.

**A6 — the census of database connections from staging** (who CONNECTS, repo-wide and on the box): the app (pm2, its pool, correct credential), the cron scripts (`npx tsx server/scripts/*`, the app's db module), the two helpers (`w166b-pgq.py`, `pgq_pooler.py`, both `unquote` correctly but `psql` with the default `sslmode=prefer` — **each still doubles a failure**), and hand-built `psql` lines (the 11-16 trigger). `dt-api` and the governance checker do not connect. ⇒ the tool covers the hand-built path; the two helpers are named for their owners (and mine is retired).

**A7 — read-only.** `PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=60s'` is honoured on the DIRECT port (the session pooler drops startup options — `#1259`), and `DATABASE_URL` is the direct host. A statement can still `SET` it off, and the credential is the superuser's ⇒ an **accident guard, not a boundary** (stated in the tool and the docs, the `dt-api` C11 form).

**A8 — the alert.** `npm run system-alerts -- add --triggers-at … --category health_check --severity critical --dedupe-key … --title … --body …` as `deploy` (the `alert_mint` form). The alert queue is a file (`/var/log/dawntrader/system-alerts.jsonl`), so it works while the database is unreachable.

**A9 — what identifies a login failure.** `psql` prints `FATAL:  password authentication failed for user …` (28P01) or `no pg_hba.conf entry` (28000); a ban prints `Connection refused`. Matched on that text (A1's fixture prints the same line).

## 3. PLAN (each item → its finding)
- **P1 — `comms-infra/staging/dt-sql`** (Python, stdlib only; A4):
  - **P1a** credential: parse `DATABASE_URL` from `.env` with `urllib.parse.urlsplit`, `unquote` user and password (A3); password to `psql` only via `PGPASSWORD` in the child's environment (never argv).
  - **P1b** one attempt: connection string `host=<host> hostaddr=<first resolved> port=… dbname=… user=… sslmode=require connect_timeout=15 application_name=dt-sql` (A1, A2).
  - **P1c** read-only: `PGOPTIONS` as A7; refuse SQL matching `transaction_read_only|default_transaction_read_only` before connecting.
  - **P1d** serialisation and lockout: an exclusive `flock` on `/var/lib/dt-sql/lock` around the whole call; the `LOCKED` marker checked INSIDE it (A6: two queued callers cannot fail in a row). On a login failure (A9): write `LOCKED` (time, caller, error line), mint a critical alert (A8), exit 4. `Connection refused`: exit 3, *"the address may be banned — do not retry"*, no marker (a ban is not a credential fault). `--unlock --by <actor>` clears it, logged.
  - **P1e** interface: `dt-sql -c "<sql>"`, `dt-sql -f <file>`, or SQL on stdin; `--csv`; `--status`; `--unlock --by`. As `root` it re-runs as `deploy` (A5).
- **P2 — install** to `/usr/local/bin/dt-sql` (root 0755) and `/var/lib/dt-sql` (`deploy` 0750), by a small installer from the blob at the reviewed sha (the dt-api install form).
- **P3 — tests** `comms-infra/staging/tests/dt_sql_tests.py` (+ mutants), in CI: the parse; the connection string has `sslmode=require` and `hostaddr`; no password in argv; read-only refusal; lockout and the queued second caller; `Connection refused` → exit 3 with no marker. **The fake server (A1) proves "one attempt" on Linux where `psql` exists**; where it does not (the CI runner may lack `psql`), that check is skipped and stated, and it runs live on staging as Step 7 evidence. `UNAUDITED`: whether the CI runner has `psql` — checked at Step 3.
- **P4 — governance:** `CLAUDE.md` §7 staging commands (beside `dt-api`); `workflow-07-verify-cc` line 92's *"psql to Supabase"*; Langston's and Coltrane's files (their write tools); SIM entry (A-gap from source 3); System Manual: a line in the staging-operations section (A-gap from source 4); `RUNNING_ISSUES #1259`.

## 4. OUT-OF-SCOPE FINDINGS (§9.4)
- **The two helpers double a failure** (A6). DISPOSITION: folded into this batch as a Step-10 note to their owners pointing at `dt-sql`; my own (`w166b-pgq.py`) is retired by me.
- **A read-only database role** (A7). DISPOSITION: decision required — proposed to PM for Kyle's list; not built here.

`REVIEWER:` none spawned. Load-bearing claim A1 is measured with a positive control (prefer → 2 is the control that the counter sees a retry); `NOT RE-READ` by a fresh reader.
