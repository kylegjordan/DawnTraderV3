# B-DB-READ-TOOL — SCOPE r1: one server-held, read-only database query command on staging that can never send a wrong password twice

change-class: non_architecture
**Owner:** Infra Claude (CC-INFRA) · **Opened:** 2026-11-16 · **Kyle decision:** KD-96 (`pm/DECISIONS.md:120`, relayed by PM Claude; Kyle, Desktop ~12:35Z: *"Let's make the first fix now for preventing the issue that took down the Superbase connection. That should interrupt the token batch that he's currently working on."*) · **Issue:** `#1259` (the 11-16 ban; trigger confirmed under KD-93).
**Interrupts:** `B-TOKEN-WATCH-BIRTH-CAP` at a safe point — the cap is live (installed `eb20f86f6`, switched on 10:37Z, today truncated, the timetable starts 00:00Z); its pending Step-9 fix `390b7e91c` waits on Langston. No credit-deadline risk (told PM).

---

## 0. WHY (measured; `#1259` holds the full record)
- **Supabase bans an address after two wrong passwords in a row** (Supabase troubleshooting, *"Connection refused when trying to connect"*; ~30 min, ours lasted ~60).
- **The trigger was ours:** Langston's session `3113524e` ran `psql` ON STAGING twice (results 04:20:12Z and 04:20:29Z) with the password cut out of `.env` by `sed`. The stored URL's password is **percent-encoded** (measured: it contains `%`), so `sed` sent the encoded form — and **each `psql` call made TWO login attempts** (the error is printed twice per call). Four wrong passwords in 17 s; the app's first refused connection 11 s later; ~60 min of no database for the whole app (no paper entries, exit checks not running, up to 132,466 archive rows dropped).
- **There is no governed way to read the database from staging.** `workflow-07-verify-cc` says *"psql to Supabase"* and nothing more; sessions improvise. Of the 18 helper scripts in `/home/deploy`, two reach the database (`w166b-pgq.py`, `pgq_pooler.py`), both through `psql` with a correct `unquote` — the 11-16 failure came from a hand-built login outside any helper. `dt-api` (B-CREDENTIALS-PRIVATE-REPO OBJ-1, `#1023`) is the existing pattern for the web API; there is none for the database.
- **Why each `psql` call tried twice (to be confirmed at Step 2):** libpq's default `sslmode=prefer` retries WITHOUT SSL after a failed SSL attempt, and it iterates every address the host name resolves to. Either doubles a wrong password.

## 1. PROVENANCE AND DISPOSITIONS
- **Tier 2 — `dt-api`** (`comms-infra/staging/dt-api`, B-CREDENTIALS-PRIVATE-REPO OBJ-1): read only, as the PATTERN (one command, a held credential, exit codes, a stated accident-guard-not-boundary). **Disposition (1): relevant and correct, unchanged.**
- **Tier 2 — the app's `.env` `DATABASE_URL`** (`/home/deploy/dawntrader/.env`, `deploy` 0600): read at run time, never copied. Unchanged.
- **Tier 2 — the ad-hoc helpers** in `/home/deploy` (`w166b-pgq.py` is mine, from the 166b evidence; `pgq_pooler.py` from the 11-16 incident): **disposition (5) once this lands** — superseded; named in the Step-10 note for their owners, not deleted by this batch (not mine to delete, except my own).

## 2. OBJECTIVES

| # | objective | verified by |
|---|---|---|
| **OBJ-1** | **`dt-sql` on staging (`/usr/local/bin/dt-sql`), runnable as `root` or `deploy`** (as root it re-runs itself as `deploy`), reading `DATABASE_URL` from the app's `.env` AT RUN TIME (no second copy to drift), decoding user and password with `urllib.parse.unquote`, and passing the password through the environment (`PGPASSWORD`), never the command line. | Unit tests on the parse (encoded `%`, `@`, `:` and `/` in the password); a live read returns a row; `ps` during a call shows no password. |
| **OBJ-2** | **Exactly ONE login attempt per call.** `sslmode=require` (no non-SSL retry), `hostaddr` pinned to ONE resolved address, `connect_timeout`. Calls are serialised by a lock, so two callers can never fail one after the other. | A local TCP listener counts connection attempts: `dt-sql`'s connection string → 1; the same call with `sslmode=prefer` → 2 (the positive control that the counter sees a retry). |
| **OBJ-3** | **One login failure locks it.** On `password authentication failed` (SQLSTATE 28P01/28000) it writes a `LOCKED` marker (time, caller, the error line), pages a critical alert, and REFUSES every later call (exit 4) until `dt-sql --unlock --by <actor>`. A refused connection (`Connection refused`, the ban's symptom) exits 3 with *"the address may be banned — do not retry"*, and does not retry. | Tests with a fake `psql` for each path; the lock checked inside the serialising lock (two queued callers: the second refuses). No live wrong-password test against Supabase. |
| **OBJ-4** | **Read-only by default:** `PGOPTIONS` sets `default_transaction_read_only=on` and a `statement_timeout`; SQL that tries to switch read-only off is refused. **Stated as an accident guard, not a boundary** (the password is the superuser's; `deploy` can read `.env`). A read-only database role is the boundary — named as a follow-on proposal for Kyle, not built here. | A write (`CREATE TEMP TABLE` / `INSERT`) refuses live with SQLSTATE 25006; a `SET default_transaction_read_only = off` is refused before connecting. |
| **OBJ-5** | **It is the one documented way.** `CLAUDE.md` §7 staging commands gain `dt-sql` beside `dt-api`; `workflow-07-verify-cc`'s *"psql to Supabase"* points at it; Langston's and Coltrane's own files carry the rule (through their write tools). | The four documents at the ref. |
| **OBJ-6** | Tests and mutants in `comms-infra/staging/tests/`, run in CI. | CI 4/4; every safety rule has a mutant that a test kills. |

## 3. OUT OF SCOPE
- **(b) RECOVER** — the unban-API watcher (KD-93 proposal (b)): needs Kyle's management token and an IPv6 test; stays a proposal.
- **A read-only database role** — the real boundary for OBJ-4; a database change, proposed for Kyle's list.
- Deleting other sessions' helper scripts.

## 4. GOVERNANCE (judged at Step 10)
Required (non_architecture): scope · pre-audit · completion report · `BATCH_CATALOG` · `PHASE_HISTORY`. Expected: `RUNNING_ISSUES` `#1259` · `SYSTEM_IMPACT_MAP` (a new staging tool that touches the database) · `CLAUDE.md` §7 · `workflow-07-verify-cc` · Langston's and Coltrane's files · memory, task list. A plan row: PM records KD-96's slot.
