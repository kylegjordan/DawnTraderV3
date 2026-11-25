# B-DB-HELPER-RETIRE — COMPLETION REPORT

**Batch:** B-DB-HELPER-RETIRE · **Owner:** Infra Codex for CC-INFRA · **Decision:** KD-100 · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row 5a3 · **Issue:** `#1259` · **Change class:** `non_architecture`

**NO SCOPE OBJECTIVE IS OPEN.** The one `OWNER_HOLD` is the intended OBJ-6 outcome, not unfinished work in this batch: `scripts/xstock-hollow-recut.ts` remains owned by ANALYST / B-XSTOCK-FEED-SANITY P6. Its release condition is a reviewed historical relabel or a reviewed formal withdrawal; editing, routing or retiring it before that release is the failure condition. `reviewer_staging_access.py` is not the hold: it is an exact `RETAIN_GOVERNED_DIRECT` exception owned by B-CREW-ACCESS-HARDEN.

**OUTSIDE THIS BATCH:** KD-93 RECOVER, the proposed unban-API watcher, remains an undecided response to `#1259`. It is not silently absorbed or closed here.

---

## Result

The older helper population no longer forms a parallel crew-read system. Thirty-three obsolete checked-in connection surfaces and their sole-use processor are retired into a non-executable Git archive; 53 reviewed top-level staging helpers are removed under a durable journal and receipt; both surviving operator reads use the governed `dt-sql` / `dt_reader` path. Exact-file governed exceptions preserve migrations, credential/role tools, application pools, isolated tests and the one owner hold.

No governed `dt-deploy` or DawnTrader PM2 restart occurred during the live-retirement/verification interval. The deployment record and current process both start at the real 00:02–00:03Z deployment, more than 15 hours before the 15:03:49Z helper removal: record `deployed_at=2026-11-24T00:03:08Z`, process `pm_uptime=2026-11-24T00:02:58.039Z`, PID 2822823, restart count 715. `dt-deploy` necessarily restarts the process and rewrites that record, so a governed deploy-and-rollback in the interval would change both controls. The retirement mechanism itself opened no database connection and performed no schema or data write; this is not a claim that the normally running application stopped writing ordinary trading data.

## Scope objectives

| objective | result | evidence |
|---|---|---|
| OBJ-1 — exact two-source census | **YES** | The immutable disposition ledger covers 92 checked-in connection surfaces; the live manifest covers the reviewed 53 top-level helper paths. The validator also pins 97 currently classified marker-bearing paths by marker class and occurrence count. Step 7 used the 53 archived bodies as a positive control and then inspected all 541 immediate `/home/deploy` entries, not only suffix-selected scripts. |
| OBJ-2 — one disposition per helper | **YES** | The checked-in population reconciles exactly: 33 `RETIRE` + 36 `RETAIN_GOVERNED_DIRECT` + 20 `RETAIN_TEST_LOCAL` + 2 `ROUTE_DT_SQL` + 1 `OWNER_HOLD` = 92. Schema validation rejects missing, duplicate, unknown or reasonless retained/held rows. |
| OBJ-3 — retire obsolete one-off login paths | **YES** | The 33 checked-in sources and sole-use processor are absent from executable paths and preserved byte-for-byte under `1-system-manual/_archive/deleted-code/b-db-helper-retire/2026-11-24/`. The root remover verified, journalled and removed all 53 reviewed live paths; journal and receipt carry the same ordered population, and none reappeared in the replay. |
| OBJ-4 — route still-needed crew reads through `dt-sql` | **YES** | Both `ROUTE_DT_SQL` rows carry no application credential. The price-side alias census ran live, printed `database role: dt_reader`, read 499 universe rows and reached its `DASH/USD` control. After the Step-9 correction, the AMR audit used `dt-api` for all API reads and `dt-sql` for its database leg; all 13 scored legs passed and the role control printed `dt_reader`. |
| OBJ-5 — preserve legitimate exceptions | **YES** | Migrations, role/credential bootstrap, `dt-sql` internals, application pools, CI-local databases and isolated result-shape tests have exact-file governed dispositions and reasons. The validator allowlists exact surface/kind/count, never a directory wildcard. `reviewer_staging_access.py` remains an exact B-CREW-ACCESS-HARDEN governed-direct exception. |
| OBJ-6 — do not steal active-batch evidence | **YES** | Every initial conditional path received an owner decision. The one surviving hold is `scripts/xstock-hollow-recut.ts`, with ANALYST's B-XSTOCK-FEED-SANITY P6 duty and release condition recorded. All other initial holds were released, retained exactly or retired only after owner evidence. |
| OBJ-7 — close the live bypass surface without disturbing the app | **YES** | Positive control: 53/53 archived bodies carried a direct-login marker. After removal, 36/36 surviving suffix files had zero markers and zero read errors; the all-entry census found 500 regular files + 41 directories, zero symlinks/other types/read errors, zero extensionless executable/shebang candidates and zero recreated reviewed paths. The app remained clean and online at `e3a96a8126f0280a9568bb1823b9210783f0afe0`, PID 2822823, restart count 715; the environment, pool source, built artifact and deploy-record hashes stayed unchanged. The deployment record (`deployed_at` 00:03:08Z) and current PM2 process uptime (00:02:58.039Z) both precede the 15:03:49Z removal and settle the governed no-deploy/no-restart interval. |
| OBJ-8 — durable prevention and operator record | **YES** | The CI validator covers bare/absolute `psql`, credential markers, literal/aliased/namespace/CommonJS node-postgres constructors and `dt-sql`; 30/30 mutations passed at the final correction, including route removal and obsolete-login restoration. The B-DB-MAP inventory remains honest; this batch adds the disposition layer rather than deleting retained evidence from the map. |

## Reviewed implementation and live evidence

- Approved implementation: `5e223c8a1e19db10cdea3c55479b4ff4656a45bf`.
- Step-8 confirmation record: `1421ea45b5badb040499c47f62997fe9d38d2414`.
- Step-9 AMR correction: `40d06d3661da2690a58ea10e2a2e832555030d70`; completion record `f10afef4f079be693e36b891b6e7c00ebcd71712`.
- CI run `45430808680` at exact correction ref: **TypeScript Check SUCCESS · Test Suite SUCCESS · Build SUCCESS · Docker Build SUCCESS**.
- Installed remover SHA-256: `ec917e4956a27ee156199be86777dcab3ca895994dc42cffc4defd18685383f1`.
- Installed manifest SHA-256: `1f4d690832a0953db0603cc3e4831618de45899ee0c4cc516c44bbdd680014ec`, byte-identical to the graded Git blob after the Step-8 line-ending correction.
- Removal journal SHA-256: `8689a639baa161ac7b647f199075ba276dc54e9beef564b2c70c25a397f724f6`; receipt SHA-256: `881edd1b5438d34a712698d998a138cefbe8f48991f813d6392b7337df165a8b`; both root-owned mode `0600`.
- AMR exact script SHA-256: `529e0eb7c7ad95b2ea7fdae92e99d8c10a5f03d25c0b19f2b61316150a6a4d4d`; the private streamed copy was removed after its one run.
- AMR live result: 13/13 scored legs PASS, 0 FAIL, 0 SKIP, every exact/float maximum deviation 0, database role `dt_reader`.
- No UI check was applicable: no application route, response, page or browser asset changed.

## Findings closed inside the batch

1. The first Step-7 census selected script suffixes and could not support an unqualified top-level absence claim. The correction inspected all 541 immediate entries and separately named the three non-executable marker-word artifacts; the report claims only the measured top-level population.
2. The first Windows-side manifest transfer changed LF bytes to CRLF. Canonical JSON was unchanged, but exact artifact identity was not. The raw graded blob was streamed and installed; the replay then passed with exact byte identity.
3. The retained AMR audit still used a hard-coded test-account login and returned HTTP 401. Step 9 removed the caller-held login/token path, required `dt-api` for all three API reads, added default-deny mutations and reran the complete audit live.

## Governance files changed — copied from the Step-10 tier ledger

CHANGE-CLASS: `non_architecture`

| tier | document | verdict |
|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ records Step 10, the exact disposition, live retirement, verification and residual |
| T1 | `PHASE_HISTORY.md` | ✅ records the plain-language retirement boundary and unchanged app |
| T1 | `SPRINT_TO_LIVE_PLAN.md` | ✅ row 5a3 updated |
| T1 | `PHASE_19_PLAN.md` | N/A — no B-DB-HELPER-RETIRE row exists there |
| T1 | shared `MEMORY.md` + `MEMORY_CC_INFRA.md` | ✅ durable invariant and Step-11 hand-off |
| T1 | scope | ✅ `B_DB_HELPER_RETIRE_SCOPE.md` |
| T1 | pre-audit | ✅ `B_DB_HELPER_RETIRE_PRE_AUDIT.md` |
| T1 | completion report | ✅ this file |
| T1 | Observation | N/A — no post-governance observation or decision window was specified |
| T1 | `CC_A_SESSION_TASK_LIST.md` | N/A — no CC-A task created |
| T1 | `CC_B_SESSION_TASK_LIST.md` | N/A — no CC-B task created |
| T1 | `CC_C_SESSION_TASK_LIST.md` | N/A — the existing B-XSTOCK-FEED-SANITY P6 duty is preserved, not created or changed here |
| T1 | `CC_INFRA_SESSION_TASK_LIST.md` | ✅ records Step 10 complete and Step 11 next |
| T1 | Langston `/home/langston/MEMORY.md` | ✅ closed-batch mechanics replaced with the helper-retirement invariant; loaded set decreased 139,228 → 139,096 bytes against the live 143,856-byte ceiling; reviewer-ledger/retraction counts stayed 31/0 |
| T2 | `SYSTEM_MANUAL.md` | ✅ exact-file route, exception, hold and default-deny contract |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ disposition validator, archives, remover, journal, receipt and downstream boundary |
| T2 | `RUNNING_ISSUES.md` | ✅ `#1259` PREVENT chain discharged; separate undecided RECOVER proposal remains |
| T2 | `CHANGES_AND_FIXES.md` | ✅ risk, fix, proof and residual |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A — roadmap sequencing unchanged; active sprint row is the authority |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A — no trading parameter, threshold or calibration changed |
| T2 | `AUTHORITY_BASELINE.md` | N/A — existing `dt_reader` authority consumed, not changed |
| T2 | `STORAGE_POLICY.md` | N/A — no storage tier or retention policy changed |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A — no asset-class, VTS, epoch or reset behavior changed |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A — no asset class or onboarding invariant changed |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A — no build method, role or workflow gate changed |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A — reviewer architecture unchanged |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A — no stable crew or conduct rule changed |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A — no rule added, replaced or retired |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ records the live 53-path removal, durable state, reconstruction path and unchanged app boundary |
| T2 | `MISTAKE_PATTERNS.md` | N/A — no `MISTAKE:` trailer or weekly recurring-pattern pass |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ Coltrane-confirmed `non_architecture` class override recorded for alert `51525c52…` |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A — alert lifecycle and routing unchanged |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A — protocol unchanged; existing card moved under it |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A — no model or feature evaluation ran |

## Honest residuals

- The all-entry census is bounded to the immediate `/home/deploy` population. It does not claim that no database-capable program exists elsewhere on the host.
- The marker validator is a default-deny fence for the recognized source surfaces and constructor forms. It is not a proof over arbitrary generated code, ignored dependencies or every possible dynamic alias chain.
- The deploy record plus continuous PM2 start identity exclude a governed `dt-deploy` or PM2 restart during the interval. They do not exclude an adversarial out-of-band manual rewrite that also forges/restores the governing records, and the batch does not claim that broader security property.
- `dt_reader` remains subject to RLS-shaped visibility; an empty result in protected schemas is not absence. TEMP tables and advisory locks remain the read-only-role residuals recorded by B-DB-READONLY-ROLE.
- The one owner hold remains intentionally executable until B-XSTOCK-FEED-SANITY P6 releases it. That is governed preservation, not an unclassified bypass.

## Fresh-reader record

`REVIEWER: claim-only · B-DB-HELPER-RETIRE completion/mechanism/absence claim · HIT — endpoint equality permits deploy-and-rollback/restart-reset, and snapshot-bound inventories permit later recreation or drift · re-derived y (the authoritative deploy record is timestamped 00:03:08Z and the current PM2 process began 00:02:58.039Z, both before the 15:03:49Z removal; the report binds inventories to their review/ref and observation time and retains the later-drift residual)`

## Final reviewer confirmation

Coltrane **CONFIRMED** Step 11 on 2026-11-25 at 09:50:29 UTC, at exact report ref `c38e3c23fd8e6542a4d3c3775f447922bf2a7fb5` (redispatch `1575085506297991251`). He reconciled all eight objectives, accepted the one governed xStock hold and the bounded census, and independently verified all four CI jobs on the completion report (run `45439825237`) and implementation correction (run `45430808680`). The PM2 start identity and deploy record both predated the removal, which excludes a governed deploy and rollback during the operation.

The catalog, active sprint row 5a3, phase history, Infra task list and Infra current position record the close. The separate post-audit roadmap has no dedicated row. The verdict of record is Coltrane’s Discord confirmation. He reported that his lane cannot write the delivery card’s reviewer-owned `Review` field.
