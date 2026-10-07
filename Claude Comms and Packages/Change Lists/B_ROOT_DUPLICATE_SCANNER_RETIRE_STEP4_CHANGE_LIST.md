# B-ROOT-DUPLICATE-SCANNER-RETIRE — Step-4 change list (Langston code review)

**Batch:** `B-ROOT-DUPLICATE-SCANNER-RETIRE` · `#1161` (absorbs `PHASE_19_PLAN` 3n.a) · sprint row 2a0d · owner CC-B.
**Graded ref:** commit `5674c012bea7ff35afcfcdd4717481598a45024a` on `origin/migration/aws-supabase` (one commit; git shows 23 paths because each deletion pairs with its archive copy as a rename).
**CI:** run recorded in the dispatch post.

## DISPATCH HEADER
**(i) CHANGE-CLASS:** `non_architecture`.
**(ii) DOC SET for `non_architecture`, at this ref:**
| document | state |
|---|---|
| batch `SCOPE` | present — `Scope Files/B_ROOT_DUPLICATE_SCANNER_RETIRE_SCOPE.md` r2 |
| batch `PRE_AUDIT` | present — `Scope Files/B_ROOT_DUPLICATE_SCANNER_RETIRE_PRE_AUDIT.md` (§D your Step-2 conditions) |
| `DELETED_COMPONENTS_LOG.md` | **updated in this commit** — the 2026-10-07 entry |
| `SYSTEM_IMPACT_MAP.md` | OWED at Step 10 — a one-line note under the Central Clock entry that no non-live copy subscribes; the 2a0b pre-audit's 7-site census corrected to 8 |
| `SYSTEM_MANUAL.md` | N/A — judged: no live behaviour changes |
| `COMPLETION_REPORT`, `BATCH_CATALOG`, `PHASE_HISTORY`, plan, task list, MEMORYs | Steps 10-11 |
**(iii) STEP-2 REFERENCE:** the pre-audit plan items 1-9 and §D C-1..C-4.

## 1. Condition → change
| condition | change |
|---|---|
| C-1 | the log entry carries each file's introducing commit and intent: `behavioral-template` `a099a27ee` (2025-10-12, Walter's response shaping), `schema-audit` + `provenance-governance` `357354d34` (2025-10-16, BoB/Cortex/Walter freshness), both scrubbed rather than removed by `B55` `f52c87e17`; `system-truth-diagnostic.ts` (`behavioral-template`'s last importer) deleted in `053080ace` 2026-02-26 with no record — recorded retroactively in the same entry; `nlai-interpreter` removed `080078bd8` 2026-02-23. Disposition (5) stated from the commits |
| C-2 | the log keeps the mechanisms apart: the two FX5 copies would REPLACE the live handler (same id `'FX5Scanner'`); the scheduler would ADD a fan-out (own id `'TradingScheduler'` + `centralClock.start()`); runtime evidence is the load-time constructor line (0 hits; controls 3 / 2) |
| C-3 | `server/tests/unit/b-root-duplicate-scanner-retire.test.ts`: enumerates every `centralClock.subscribe(` in `server/**` + `shared/**` (comments stripped, tests excluded); asserts exactly five sites (`xstock_spot/scanner.ts` `'XstockSpotScanner'`, `rtb/tcl_watchdog.ts` `` `TCL_${mode}` ``, `services/fx5-scanner.ts` `'FX5Scanner'`, `rtb-refresh-service.ts` `'RTBRefreshService'`, `utils/market-events.ts` `'MarketEventScheduler'`); asserts every id unique; positive control (finds `RTBRefreshService`); absence fences for all 15 deleted paths; the docs export asserted PRESENT (left intentionally) |
| C-4 | vitest include and the zero `.tsc-baseline.json` entries stated in the log; `tsc` 337 = 337, no sync. The importer census was re-run scoped to `server/`, `client/`, `shared/`, `scripts/` with control `rtb-refresh-service` 8 — zero references remain |
| C5 (Step 1) | none of the nine scripts executed |
| obj 3 | four Replit-era docs (`task-10-1-adjustable-guardrails`, `task-10-behavioral-integration-report`, `task-7-validation-final-report`, `task-7-completion-summary`) get a header note pointing at the log; **`docs/audits/phase-8.8.1-8.8.2-audit.json` is left untouched** — adding a field to an audit artifact would alter the record it is; it is named here, and the Step-10 log addendum will list it under LEFT INTENTIONALLY |

## 2. Mutation
A planted `server/zz-mutation-twin.ts` with `centralClock.subscribe('FX5Scanner', h)` FAILS both the five-sites assertion and the unique-id assertion (run, removed). 19/19 otherwise.

## 3. Residual
Runtime no-change control (labelled, not the test): after the next deploy the clock's subscriber list still reads the same five. This batch carries no runtime change; it sits after `b523c86bf` on the branch, so it rides whichever deploy carries 2a0c.
