# B-EXPECTANCY-TUNING-ROWS-RETIRE — Completion Report

change-class: `non_architecture` · sprint plan row 4a2 · `#1156` · owner CC-C (Analyst Claude) · **STEP 11 — closes on Langston's confirm**

## 1. What it was for
Row 4a (`B-VTS-TELEMETRY-AGGREGATES`) deleted `getAdjustedMinROI`, the only reader of the three `expectancy_tuning` rows in `module_constants` (win-rate floor 0.4, medium 0.5, high 0.6). With no reader, the rows were settings that looked live and did nothing, and the boot warm-up still prefetched the module. This batch removes the rows, with a rollback in git and the deploy/rollback order stated, so nothing appears tunable that is not.

## 2. What shipped
- `drizzle/migrations/2026-10-07-b-expectancy-tuning-rows-retire.sql` — deletes exactly the three rows; registered in `MANIFEST.txt`; header states the order (ships with row 4a or later, never with pre-4a code).
- `…-rows-retire-rollback.sql` (tracked) — restores the three rows with their values and `updated_by`, and deletes its own `_migrations` row. **A code rollback to before `d4c688b88` runs this rollback first, or the older code refuses boot** (it prefetches `expectancy_tuning` and fails on 0 rows).
- Code `2fee017cc` (Step-4 APPROVED by Langston 2026-10-07 03:48Z); his condition `ff5a21d39` (a test assertion + a migration header comment, SQL byte-identical).
- Deployed in today's release, `0c8ef5da2582e03effd21070fb09b9ad5715ed77`, at 2026-10-07T15:56:00Z by CC-B (`dt-deploy`, migration in-chain at 15:55:49Z). CI run `37566679783` success on that head.

## 3. Objectives
| # | objective | result | evidence |
|---|---|---|---|
| 1 | Forward migration deletes exactly the three rows | **YES** | staging after deploy: `expectancy_tuning` 0 rows; control `roi_gating` 10 (Step 7, CC-C 16:02Z; Step 8, Langston 22:52Z, stronger control: 99 modules / 1,022 rows, `ILIKE '%expectancy%'` still finds `expectancy_kernel` + `expectancy_gates`) |
| 2 | Rollback in git, restores values + `updated_by`, removes its own `_migrations` row | **YES** | rollback text read against the scope table at Step 4 |
| 3 | Deploy and rollback order stated | **YES** | migration header + change list; Step 2 read `b72-warmup.ts` at the parent sha for the boot refusal |
| 4 | Docs: registry, lever inventory, deletion log, `#1156` | **YES** | registry + `LEVER_INVENTORY.md:60-62` in-batch; deletion log + `#1156` close at Step 10 (this commit) |
| 5 | Clean boot | **YES** | 69 `[B72][warmup]` lines after the restart, 0 naming `expectancy_tuning`, 0 refusals (now in `out__2026-10-07_17-19-54.log` after rotation; a later grep of `out.log` reads 0/0 — a rotation false-zero) |

## 4. Reviews
Step 1 scope r1 APPROVED (Langston 2026-10-06 23:13Z, three conditions) · Step 2 pre-audit APPROVED · Step 4 APPROVED 03:48Z at `2fee017cc` · Step 8 CONFIRMED 22:52Z (re-derived, not reported fact).

## 5. Numeric corrections
None.

## 6. New findings / dispositions
None from this batch.

## 7. Governance ledger
CHANGE-CLASS: `non_architecture`

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry: what was retired, the rollback order, result |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 4a2) | ✅ | status STEP 11 with this report linked; closes on the confirm |
| T1 | PHASE_19_PLAN.md | N/A — no row there | the row is sprint row 4a2 |
| T1 | shared MEMORY.md + MEMORY_CC_C.md | ✅ mine / N/A shared | mine: position line; no shared truth changed |
| T1 | the batch SCOPE | ✅ | written at Step 1 |
| T1 | the batch PRE_AUDIT | ✅ | written at Step 2 |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | Observation column | N/A | the scope names no observation window; the result was read at deploy |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-C: row 4a2 at Step 11 |
| T1 | Langston's MEMORY.md | **OWED** | one close line, written net-zero after his Step-11 confirm |
| T2 | SYSTEM_MANUAL.md | N/A | no mention of `expectancy_tuning` (grep, 2026-10-08); no architecture or math changed — three unread rows removed |
| T2 | SYSTEM_IMPACT_MAP.md | N/A | no mention of the module; the reader and the prefetch were removed by row 4a, whose Step 10 carries the SIM change |
| T2 | RUNNING_ISSUES.md | ✅ | `#1156` closed |
| T2 | CHANGES_AND_FIXES.md | N/A | legacy-row removal, not a trading-system bug or risk |
| T2 | DELETED_COMPONENTS_LOG.md | ✅ | entry for the three rows, the census and the rollback |
| T2 | CURRENT_SETTINGS_REGISTRY.md | ✅ | in-batch: the section marked RETIRED with the history kept |
| T2 | LEVER_INVENTORY.md | ✅ | in-batch: rows B72-CORE-008/009/010 struck as retired |
| T2 | ADJUSTMENT_FRAMEWORK.md · POST_AUDIT_ROADMAP.md · AUTHORITY_BASELINE.md · STORAGE_POLICY.md · MULTI_ASSET_VTS_EXPANSION_PLAN.md · ASSET_CLASS_ONBOARDING_WORKFLOW.md · BUILD_METHOD_PLAYBOOK.md · LANGSTON_ARCHITECTURE.md · CLAUDE.md / CONDUCT.md · rule history · GOVERNANCE_EXCEPTIONS.md · ALERT_HANDLING_PROTOCOL.md · DELIVERY_BOARD_PROTOCOL.md · CLAUDE_CODE_FEATURE_WATCH.md | N/A | none mentions `expectancy_tuning`; no tunable, roadmap, retention, method, reviewer, rule, exception, alert or board change |
| T2 | MISTAKE_PATTERNS.md | N/A | no `MISTAKE:` trailer in this batch |

## 8. Honest residual
The three values (0.4 / 0.5 / 0.6) are recoverable only from the rollback file and git; if a future win-rate gate wants them, it must be re-specified, not resurrected.
