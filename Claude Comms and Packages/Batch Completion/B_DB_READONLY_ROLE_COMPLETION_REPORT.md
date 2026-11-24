# B-DB-READONLY-ROLE — COMPLETION REPORT

**Owner:** Infra Codex (standing in for Infra Claude / CC-INFRA) · **Kyle decision:** KD-100 (2026-11-16) · **Issue:** `#1259` · **Plan:** pre-sprint Infra order 5a1 · **change-class:** `non_architecture`
**Record:** `Scope Files/B_DB_READONLY_ROLE_SCOPE.md` (r2) · `Scope Files/B_DB_READONLY_ROLE_PRE_AUDIT.md` · `Change Lists/B_DB_READONLY_ROLE_CHANGE_LIST.md`
**Installed:** staging 2026-11-23. The reviewed seven-file bundle is from `377147369b96af37d5349a0d79f31c7174bb30b2`; the drift-checker correction is `9d79dfda5103e67c29f0e979b341e60bad6a9979`; main integration is `26078081ddd5cea8c8d86c34b8e0e21fe7a40a7a`.
**Independent verification:** Coltrane Step 8 **PROCEED** 2026-11-24T00:02:33Z at exact record ref `85b101adecb65ec24dfdd2f493785bfe58fc4e59`.
**CI:** implementation run `45286024519` at `9d79dfda5` and governance run `45301131115` at `710046bc7` each passed all four jobs: TypeScript Check, Test Suite, Build and Docker Build.

**NO SCOPE OBJECTIVE IS OPEN.** `B-DB-MAP` and `B-DB-HELPER-RETIRE` remain separate, placed batches in Infra orders 5a2 and 5a3; they do not weaken this batch's `dt-sql` boundary.

**Delivery-record reconciliation:** `POST_AUDIT_ROADMAP` has no row for this batch; the active plan, INFRA task list and this report close 5a1 and place 5a2 then 5a3; the delivery board holds 5a1 in Governance blocked on the reviewer until this exact close bundle is confirmed, with both successor cards in Backlog, after which the owner moves 5a1 to Complete.

---

## Outcome

`dt-sql` no longer carries the app's write-capable database login. It uses dedicated role `dt_reader`; database privileges refuse all seven governed persistent-write classes even when the session read-only setting is switched off. The one-attempt lock, verified TLS, read-only session setting and SQL guard remain as independent layers.

Among non-root accounts, the credential is readable only by locked system account `dtsql`; `deploy` and the ordinary caller cannot read it or fall back to the app credential. Root remains able to read it, as the scope states, so root discipline and the governed setup path—not file mode—cover that authority. The governed setup and rotation path uses the same one-attempt safety instrument, and the full installation is watched for drift.

---

## PREVIOUSLY STATED → NOW

- **PREVIOUSLY STATED:** the early audit counted one RLS-protected table. **NOW:** the verified population is 26 tables — 16 in `auth` and 10 in `storage`. **REASON:** the complete live catalog census replaced the early sample; `dt_reader` can query them but sees an RLS-shaped zero.
- **PREVIOUSLY STATED:** the first repaired drift mutation run reported 67 applied-and-killed mutations plus one anchor that no longer applied. **NOW:** the exact population is 68 of 68 applied and killed. **REASON:** the split mapping changed the old anchor; it was re-anchored to the corrected object and rerun.

---

## Objectives

| # | result | evidence |
|---|---|---|
| **OBJ-1 — a read-only login with the intended read surface** | **YES** | Live role attributes: login only, no superuser/create-db/create-role/replication/RLS-bypass; exactly `pg_read_all_data` and `pg_monitor`; 0 owned relations and 0 direct write grants. Both `session_user` and `current_user` were `dt_reader`. All eight pre-registered representative crew-read objects succeeded; the historical statement census was a lower bound, not proof that every past object was enumerated. |
| **OBJ-2 — database privilege refuses every governed write class** | **YES** | With role/session read-only switched off, INSERT, UPDATE, DELETE, TRUNCATE, schema CREATE, sequence `nextval` and a PUBLIC-executable writing function each returned SQLSTATE `42501`. SELECT passed as the positive control. TEMP-table and advisory-lock ability are declared residuals. |
| **OBJ-3 — one server-held credential, never printed** | **YES** | `reader.env` is a regular `0600 dtsql:dtsql` file behind `0750 root:dtsql`, with no symlink or ACL grant. `deploy` is refused and `dtsql` can read it; root also can, as expected. A fixed-string control first found the value in that file, then found no occurrence in the repo or `dt-sql` log. The directory, file, account and modes are in `dt-install-drift`. |
| **OBJ-4 — `dt-sql` uses the role and fails closed without fallback** | **YES** | Production returned `session_user=current_user=dt_reader` over TLS. Missing-file live drill exited before a connection with no LOCKED or INTENT state, then recovered after restore. Installed helper strips inherited `PG*`, supplies the validated reader credential explicitly and has no usable home credential source. |
| **OBJ-5 — the parent batch's close condition** | **YES** | Live `dt-sql-role-setup --verify` used the same login path with read-only off and received `42501` for every governed write class; the production second layer separately returned `25006`. The refusal therefore comes from the role, not only a setting. |
| **OBJ-6 — governed setup, not hand-typed SQL** | **YES** | Reviewed root-only setup created the role in one transaction using a SCRAM verifier, then verified the first login under the one-attempt lock. The setup output redacts verifier/password material. |
| **OBJ-7 — rotation and ban-risk procedure written and exercised** | **YES** | `DT_SQL_RUNBOOK` records rotation and recovery. One live rotation completed under the one-attempt instrument, followed by the full verifier; a second verifier passed. |
| **OBJ-8 — every reader of the old fact updated** | **YES** | The System Impact Map, System Manual, `dt-sql` record, CLAUDE database-read rule, Step-7 verification skill, reviewer staging-access notes, RUNNING_ISSUES, both reviewer memories and `dt-install-drift` now describe or enforce the dedicated-role boundary. This batch also replaced the central app-role page that could no longer see `dt-sql` with `dt-sql`'s own per-call verified-TLS check and transport alert; the already-closed B-DB-POOL-GUARD continues to own the app-role page. |
| **OBJ-9 — one instrument for the four governed non-production role-login paths** | **YES** | The pre-registered setup, write-class/close-condition verifier, first login and rotation all use the same INTENT-before-attempt, one-attempt classification and fail-closed lock. Refused or unclear outcomes lock; a killed attempt is ambiguous; the skip-INTENT mutant is killed. Root can deliberately read the credential and invoke another client, so this is a governed-path control, not a boundary against root. |

---

## Verification record

- Final live role verifier: PASS. Seven governed writes refused with `42501`; positive SELECT passed; second read-only layer returned `25006`; TEMP-table residual passed.
- Read census: 8 of 8 distinct crew-read objects executed; `auth.users` returned the documented RLS-shaped zero.
- Installation: 7 of 7 required paths `OK`, with 0 PERM, 0 PENDING, 0 STATE and 0 SOURCE findings; whole drift check PASS.
- Tests at the reviewed tree: root runs `dt_sql` 63, login 88, role setup 87 and drift 107, each with 0 failures. The non-root-only credential refusals are separately present in the suites and were not relabelled as root results.
- Mutation evidence: `dt-sql` 87 of 87 killed; drift 68 of 68 applied and killed. CI also ran the real TLS fake-server leg rather than skipping it.
- Independent pass: Coltrane re-ran the seven write refusals, positive read, eight-object census, role attributes/memberships/grants, both refusal layers, credential boundary and whole installed-object check before his Step-8 PROCEED.

---

## Governance files changed — copied from the Step-10 tier ledger

CHANGE-CLASS: `non_architecture`

| tier | document | verdict |
|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ records the dedicated-role boundary, non-root credential access, live verification and named residuals |
| T1 | `PHASE_HISTORY.md` | ✅ records the installed and independently verified Step-10 outcome and the remaining placed database batches |
| T1 | `SPRINT_TO_LIVE_PLAN.md` | ✅ row 5a1 updated |
| T1 | `PHASE_19_PLAN.md` | N/A — no row and not a P19 batch |
| T1 | shared `MEMORY.md` + `MEMORY_CC_INFRA.md` | ✅ record the live `dt_reader` boundary, RLS empty-read hazard and Step-11 hand-off |
| T1 | scope | ✅ `B_DB_READONLY_ROLE_SCOPE.md` |
| T1 | pre-audit | ✅ `B_DB_READONLY_ROLE_PRE_AUDIT.md` |
| T1 | completion report | ✅ this file |
| T1 | Observation | N/A — scope and pre-audit define no observation window; every close criterion is an immediate live check |
| T1 | session task lists | ✅ INFRA; N/A for OLD, NEW and ANALYST — not their batch |
| T1 | Langston memory | ✅ existing database-read mechanics line replaced through the governed writer; loaded set moved 139,333 → 139,321 bytes against ceiling 143,856, with ledger and retraction counts unchanged |
| T2 | System Manual | ✅ documents the role privileges, credential path, verified-TLS login, write refusals and RLS empty-read hazard |
| T2 | System Impact Map | ✅ maps the crew-read dependency, ordinary and root access boundary, blast radius and drift coverage |
| T2 | RUNNING_ISSUES | ✅ `#1259` updated |
| T2 | CHANGES_AND_FIXES | ✅ new settled-fix entry |
| T2 | POST_AUDIT_ROADMAP | N/A — no roadmap item |
| T2 | ADJUSTMENT_FRAMEWORK | N/A — no trading parameter |
| T2 | AUTHORITY_BASELINE | N/A — no constitutional authority change |
| T2 | STORAGE_POLICY | N/A — no database schema or retention change |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN | N/A — no VTS or asset-class change |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW | N/A — no onboarding learning |
| T2 | BUILD_METHOD_PLAYBOOK | N/A — build method unchanged |
| T2 | Langston Architecture | ✅ current reviewer/read boundary updated outside the immutable history block |
| T2 | CLAUDE / CONDUCT | ✅ CLAUDE database-read rule now requires `dt_reader`, verified TLS and non-absence treatment for RLS-shaped zeroes; N/A CONDUCT because no conduct rule changed |
| T2 | CLAUDE Rule History | ✅ current rule change recorded |
| T2 | DELETED_COMPONENTS_LOG | N/A — nothing deleted |
| T2 | MISTAKE_PATTERNS | N/A — no new pattern threshold reached |
| T2 | GOVERNANCE_EXCEPTIONS | N/A — no exception granted |
| T2 | ALERT_HANDLING_PROTOCOL | N/A — alert process unchanged |
| T2 | DELIVERY_BOARD_PROTOCOL | N/A — board process unchanged |
| T2 | CLAUDE_CODE_FEATURE_WATCH | N/A — no feature-watch event |

**Other changed records within scope:** `DT_SQL_RUNBOOK`, the Step-7 verification skill, reviewer staging-access notes, Coltrane memory, the INFRA task list, and the batch Change List.

---

## New finding settled in the batch

The live drift checker falsely treated `dtmint`'s reviewed rule in its designated sudo file as a forbidden stray rule. The mapping and its diagnostic were corrected, mutation-tested, reviewed by Coltrane and installed from exact ref `9d79dfda5`; the whole checker then passed. This was folded into the batch because an incorrect drift result would have made the new read boundary impossible to verify honestly.

---

## Honest residual

- `CREATE TEMP TABLE` and transaction-scoped advisory locks remain possible. They cannot change persistent app data and are recorded as deliberate residuals, not described as write refusal.
- RLS makes 26 `auth`/`storage` tables appear empty. A zero from those tables is not evidence of absence; B-DB-MAP must preserve that warning.
- The older direct-login helpers are outside this batch. They remain placed in B-DB-HELPER-RETIRE after B-DB-MAP; production `dt-sql` and the reviewer read path already use `dt_reader`.
- A certificate failure locks `ambiguous` even though the password is not sent. This is deliberate fail-closed behavior; the runbook permits one unlock after the certificate cause is established.
- Root can read the credential and bypass the four governed login paths. The scope explicitly treats root restraint as discipline rather than a file-permission boundary.
- The eight-object crew-read census is a pre-registered representative set. The historical statement census had eviction and attribution limits, so B-DB-MAP remains the placed comprehensive inventory.

`REVIEWER: claim-only · nine-objective completion and changed-vs-N/A tier ledger · HIT root-only credential overclaim, OBJ-8 TLS misattribution, CLAUDE/CONDUCT ledger conflation; LIMIT eight-object census reach and root bypass of absolute OBJ-9 wording · re-derived y (live root/deploy/dtsql readability control; exact implementation diff; Step-10 ledger and scope)`
