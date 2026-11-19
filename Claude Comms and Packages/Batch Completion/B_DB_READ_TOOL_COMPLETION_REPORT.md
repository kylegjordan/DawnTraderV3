# B-DB-READ-TOOL — COMPLETION REPORT

**Owner:** Infra Claude (CC-INFRA) · **Kyle decision:** KD-96 (2026-11-16, interrupting `B-TOKEN-WATCH-BIRTH-CAP`) · **Issue:** `#1259` (PREVENT) · **Plan:** pre-sprint table, Infra order 5a0 · **change-class:** `non_architecture`
**Record:** `Scope Files/B_DB_READ_TOOL_SCOPE.md` (r2), `Scope Files/B_DB_READ_TOOL_PRE_AUDIT.md` (r2 + §5), `Change Lists/B_DB_READ_TOOL_CHANGE_LIST.md`
**Installed:** staging, 2026-11-16T16:46Z from `b9ad4f026`; `dt-sql` re-installed 2026-11-19T23:06Z from `07bcfeb17` (sha256 `e56fb089…7c582c`), `dt-install-drift` PASS after each.
**CI:** run `44631018417`, head `96114da21` (contains `07bcfeb17`) — TypeScript Check (baseline gate) success · Test Suite success · Build success · Docker Build success.
**Langston:** Step 1 SENT BACK → r2 approved; Step 2 PROCEED; Step 4 cleared with fold-ins; **Step 8 PROCEED 2026-11-19, Discord `1573113474391871669`** (four audit-log legs measured by him as `deploy`; installed binary hashed against the ref).

---

## ⛔ OPEN AT CLOSE — THE BAN RISK IS REDUCED, NOT DISCHARGED

This batch stops a session or reviewer from sending a wrong password twice by hand. It does not stop the other routes. Each is a placed item on Kyle's list, all before live:

| item | owner | placed home | closes when |
|---|---|---|---|
| `B-DB-APP-TLS` — encrypt the app's own Supabase connections and verify the server's certificate (10 of 10 measured `ssl = f`) | OLD Claude | folded into `B-DB-POOL-GUARD` (pre-sprint stage 00, order 3; KD-100) | `pg_stat_ssl` shows the app's connections `ssl = t` under `verify-full` |
| `B-DB-READONLY-ROLE` — a login that can only read, for dt-sql and every crew read | Infra Claude | Infra order 5a1, after this batch and `B-TOKEN-WATCH-BIRTH-CAP` (KD-100) | a write through dt-sql is refused by the role, not by a session setting |
| `B-DB-MAP` — the standard database map, through the read-only login; read/write column from the repo at a named commit | Infra Claude | Infra order 5a2 (KD-101; Langston confirmed the slot, Discord `1571946800859054132`) | the map is checked in and regenerated on a schedule |
| `B-DB-HELPER-RETIRE` — the ~50 hand-written scripts that log in for themselves (now one attempt each, through the wrapper) | Infra Claude | Infra order 5a3, after `B-DB-MAP` (KD-100) | no script on staging builds its own database login |

**RECOVER** (a watcher that calls Supabase's unban API, KD-93 (b)) stays a proposal: it needs a management token from Kyle and is documented for IPv4 only, while staging was banned on IPv6.

---

## PREVIOUSLY STATED → NOW

- **PREVIOUSLY STATED:** the scope (OBJ-4) called the credential "the superuser's". **NOW:** the app's `postgres` login is **not** a superuser (`rolsuper = f`); it bypasses row security and can write. **REASON:** measured at Step 8 on Langston's prompt; corrected in the System Manual and the tool's docstring at `d2d0ec91a`. The read-only setting is an accident guard either way.
- **PREVIOUSLY STATED:** the audit field rename `rc` → `psql_rc` applies to "rows written before 2026-11-16". **NOW:** the boundary is the **2026-11-19T23:06Z install**. **REASON:** Langston counted the log — 22 rows carry `rc`, two of them at 22:57Z on 11-19, and none of the 15 rows after the install.

---

## OBJECTIVES

| # | objective | result | evidence |
|---|---|---|---|
| OBJ-1 | `dt-sql` runnable as root or deploy, reading `DATABASE_URL` at run time, decoding user and password, password via `PGPASSWORD` only | **YES** | tests: decode of `%40 %2F %3A %25`, no password in the child's argv, PG* stripped; live reads as root and as deploy (Step 7, `7e099d503`). A live `ps` capture during a call was not taken; the argv test is the evidence for that leg. |
| OBJ-2 | exactly ONE login attempt per call | **YES** | against a fake TLS Postgres server that rejects every password: dt-sql → 1 connection; raw `psql` with libpq's default → 2 (the control that the counter sees the retry); the wrapper → 1. In CI. |
| OBJ-3 | fail-closed lock, intent written before the attempt | **YES** | tests with a stand-in `psql` for every outcome: credential → LOCKED + critical page, exit 4; refused → exit 3, intent cleared; SIGKILL mid-call → next call LOCKED `ambiguous` with no attempt; timeout → process group killed → `ambiguous`; second caller → BUSY exit 5. **No live wrong-password test against Supabase, by design.** |
| OBJ-4 | read-only by default; switching it off refused | **YES** | live: `CREATE TEMP TABLE` refused by the server; Langston's refusal leg: `set_config('default_transaction_read_only' …)` → `refused_readonly_sql` row + exit 2, before any connection. |
| OBJ-5 | the one documented way | **YES** | `CLAUDE.md` §7 and `workflow-07-verify-cc` (`1ce73d5b8`); Langston's memory (one line, through `langston-memory-write`, 2026-11-19); Coltrane's memory (reference entry, through `coltrane-memory`, 2026-11-19). |
| OBJ-6 | tests and mutants, in CI | **YES** | `dt_sql_tests.py` 50/0; `dt_sql_mutations.py` 35 of 35 killed (every safety rule has a mutant a test kills); both in CI's Test Suite, run `44631018417`. |
| OBJ-7 | the existing `psql` callers | **YES** | (a) dt-sql documented (OBJ-5); (b) priced at Step 2: a box-wide `PGSSLMODE` default was **rejected** because node-postgres reads it too and would change the app's connections; a `psql`-only wrapper ships instead (helper-shaped call measured `ssl = t`, one attempt); (c) retiring the helpers went to Kyle and is placed (`B-DB-HELPER-RETIRE`, above). |

---

## GOVERNANCE FILES CHANGED — copied from the Step 10 ledger (`b07a4379d` commit message)

CHANGE-CLASS: `non_architecture`

| tier | document | verdict | line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | new entry: why, what it built, verified, what it does not discharge |
| T1 | `PHASE_HISTORY.md` | ✅ | plain-language entry 2026-11-19 |
| T1 | `SPRINT_TO_LIVE_PLAN.md` (Infra order 5a0) | ✅ | status Step 11; CLOSED with this report linked at close |
| T1 | `PHASE_19_PLAN.md` | N/A — no row there | not a P19-* batch and no in-flight row there |
| T1 | shared `MEMORY.md` + `MEMORY_CC_INFRA.md` | ✅ | mine: position at Step 11; shared: no line added — `CLAUDE.md` §7 (auto-loaded) carries the rule, file at 24,544 of 24,576 B |
| T1 | SCOPE | ✅ | `Scope Files/B_DB_READ_TOOL_SCOPE.md` (r2) |
| T1 | PRE_AUDIT | ✅ | `Scope Files/B_DB_READ_TOOL_PRE_AUDIT.md` (r2 + §5) |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | Observation column | N/A | the scope names no observation window and no `DEPLOY_WINDOWS` row |
| T1 | session task lists (`CC_A`, `CC_B`, `CC_C`, `CC_INFRA` `_SESSION_TASK_LIST.md`) | ✅ mine / N/A ×3 | mine: read tool at Step 11, birth-cap paused at Step 9, three queued database rows added; the other three not mine |
| T1 | Langston's `MEMORY.md` | ✅ | one closed-batch line (124 B) replaced by the dt-sql rule (115 B); loaded set 143,851 → 143,842 of 143,856 |
| T2 | `SYSTEM_MANUAL.md` | ✅ | "Crew Database Reads" section (`6f624ee9f`; superuser wording corrected `d2d0ec91a`) |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | "Crew database reads" row (`6f624ee9f`) |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1259`: PREVENT verified at Step 8; follow-ons slotted (KD-100/101); stays open |
| T2 | `CHANGES_AND_FIXES.md` | N/A | no app or engine code changed; the incident's registry home is `#1259` |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | no phase-level change; the follow-ons are pre-sprint rows |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | no trading parameter touched |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional change |
| T2 | `STORAGE_POLICY.md` | N/A | no table or retention changed (`/var/lib/dt-sql` is a small audit log) |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | nothing VTS or asset-class touched |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no onboarding learning |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | the method did not change |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | his build unchanged |
| T2 | `CLAUDE.md` / `CONDUCT.md` | ✅ | `CLAUDE.md` §7 dt-sql commands (`1ce73d5b8`); `CONDUCT.md` unchanged |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | ✅ | 2026-11-16 entry for the §7 rule |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | `w166b-pgq.py` and `pgq_pooler.py` archived and deleted (`7e099d503`) |
| T2 | `MISTAKE_PATTERNS.md` | N/A | three `MISTAKE:` trailers (`b14550a63`, `ef0816603`, `d2d0ec91a`) are instances in git; the weekly pass (CC-A) groups them |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A | no exception granted |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | process unchanged (the two new alert keys use it as is) |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | board unchanged |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | no daily check run in this batch |
| — | Coltrane's memory | ✅ | reference entry: staging database reads by hand go only through dt-sql |
| — | `workflow-07-verify-cc` skill | ✅ | dt-sql in the live list (`1ce73d5b8`) |

---

## NEW FINDINGS (settled during the batch)

- **`psql`'s exit code depends on how SQL is fed.** Measured on staging: with `-c`, a SQL error, a refused write and a statement timeout all exit 1; with `-f` and `ON_ERROR_STOP=1` they exit 3. dt-sql therefore always feeds SQL through `-f -`, so a SQL error can never be mistaken for a login failure. (Folded into the build, Step 3.)
- **The app's own database connections are not encrypted** (10 of 10 `ssl = f`, re-measured 2026-11-16 with dt-sql). Already on `#1259`; now `B-DB-APP-TLS`, placed above.

## HONEST RESIDUAL

- The one-attempt guarantee rests on libpq's behaviour plus the fake-server count; it was deliberately never tested with a wrong password against Supabase. Live silence (no lock, no ban since) is not evidence for it.
- The wrapper's lock check sees `/var/lib/dt-sql` only as root or deploy (0750); another account's `psql` would not see a lock. Only root and deploy run `psql` on staging today.
- A post-login connection drop locks `ambiguous` and needs a manual unlock (fail-closed by Langston's ruling).
- The installed-record and drift legs at Step 8 were reported by me; Langston could not read them as deploy and hashed the binary against the ref instead.
- REVIEWER: none spawned for this report; every objective's evidence above was re-derived by Langston at Step 4 or Step 8 except the OBJ-1 live-`ps` leg, which no one ran (stated in its row).
