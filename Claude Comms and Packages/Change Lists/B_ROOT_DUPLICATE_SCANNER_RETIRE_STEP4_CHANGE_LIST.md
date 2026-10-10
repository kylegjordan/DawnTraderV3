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
| C-3 | `server/tests/unit/b-root-duplicate-scanner-retire.test.ts`: enumerates every `centralClock.subscribe(` in every `.ts`/`.tsx` file from the REPO ROOT, skipping directories named `node_modules`, `.git`, `dist`, `tests` (block and full-line `//` comments stripped; r2 — at r1 it walked `server/**` + `shared/**` only, see the r2 table); asserts exactly five sites (`xstock_spot/scanner.ts` `'XstockSpotScanner'`, `rtb/tcl_watchdog.ts` `` `TCL_${mode}` ``, `services/fx5-scanner.ts` `'FX5Scanner'`, `rtb-refresh-service.ts` `'RTBRefreshService'`, `utils/market-events.ts` `'MarketEventScheduler'`); asserts every id unique; positive control (finds `RTBRefreshService`); absence fences for all 15 deleted paths; the docs export asserted PRESENT (left intentionally) |
| C-4 | vitest include and the zero `.tsc-baseline.json` entries stated in the log; `tsc` 337 = 337, no sync. The importer census was re-run scoped to `server/`, `client/`, `shared/`, `scripts/` with control `rtb-refresh-service` 8 — zero references remain |
| C5 (Step 1) | none of the nine scripts executed |
| obj 3 | four Replit-era docs (`task-10-1-adjustable-guardrails`, `task-10-behavioral-integration-report`, `task-7-validation-final-report`, `task-7-completion-summary`) get a header note pointing at the log; **`docs/audits/phase-8.8.1-8.8.2-audit.json` is left untouched** — adding a field to an audit artifact would alter the record it is; it is named here, and the Step-10 log addendum will list it under LEFT INTENTIONALLY |

## 2. Mutation
**r1 run, at `5674c012b` (history — true then, superseded):** a planted `server/zz-mutation-twin.ts` with `centralClock.subscribe('FX5Scanner', h)` FAILED both the five-sites assertion and the unique-id assertion (run, removed). It was planted inside the reachable scope, so it proved only that half. **The current mutation is the r2 root-level plant — see the r2 table.**

## 3. Residual
Runtime no-change control (labelled, not the test): after the next deploy the clock's subscriber list still reads the same five. This batch carries no runtime change; it sits after `b523c86bf` on the branch, so it rides whichever deploy carries 2a0c.

## r2 — Langston Step-4 condition 1 (PROCEED, conditional)
| item | change |
|---|---|
| **Condition 1** — the census walked `server/`+`shared/` only, and both retired copies lived outside them | `census()` now walks every `.ts`/`.tsx` from the REPO ROOT, skipping `node_modules`, `.git`, `dist`, `tests` (by directory-entry type, so a skipped directory is never `stat`ed and symlinks are not followed — a local `dawntrader-v2/frontend/node_modules` refused `stat` with EPERM). The test header and `DELETED_COMPONENTS_LOG` state the scope. 19/19 on the clean tree |
| mutation, re-planted at the root | `BATCH_19H_HF1/server/services/fx5-scanner.ts` with `centralClock.subscribe('FX5Scanner', …)` FAILS the five-sites assertion and the unique-id assertion (run, removed). **What it reaches:** a copy anywhere under the root outside the four skipped directory names. **What it cannot:** a copy under a directory named `tests`, `dist`, `.git` or `node_modules`; a SYMLINKED directory or file (Dirent typing neither descends nor reads it — fail-closed); or a site whose id is not a literal/identifier the regex captures. **Local vs CI:** the walk covers untracked local siblings too, so a developer-local `.ts` with a subscribe call reds the fence locally while CI stays green — fail-closed; a local-only red is that, not a regression |
| record 1 | header now says block comments and FULL-LINE `//` comments are stripped; a trailing `// centralClock.subscribe(...)` counts as a site — fail-closed |
| record 3 | **15 fence entries cover 17 archive files**: `BATCH_19G_HF2` is fenced as one directory standing for its three files |
| anchor token `862436977` | does not reproduce for me either (worktree `cksum` 3330793276 / 4066 B, blob 2544158531 / 4032 B). I cannot name the instrument that produced it — **withdrawn**; identify the file by content and ref |

## Step-4 VERDICT — Langston, recorded by CC-C at the 2026-10-10 release (CC-B was not running)
Langston gave this verdict in Discord at 11:57:24Z (message `1558448355061792849`) and RE-AFFIRMED it on substance at 14:16:05Z, after a separate stateless run (12:02Z) had read only this file, found no verdict here, and said hold. He ruled that the 12:02 finding (the record did not carry the verdict) was real and its HOLD vacated; nothing withdrawn, no rollback. Shipped in release `ad01f5339b558ee968a7686d719e98b66e5fd01d` (2026-10-10T11:59:29Z, `RELEASE_DEPLOY_2026-10-10_PLAN.md`). Step 7 is CC-B's.
- **APPROVED (condition 1 discharged) at `91407e6c9`.** Re-derived at the deployed sha: `SKIP_DIRS` at `:23` (includes `'tests'`), the Dirent walk from the repo root at `:27-29`, symlinks neither descended nor read. The record-fix commit `91407e6c9` changed only header prose (6 lines, no assertion or logic).
