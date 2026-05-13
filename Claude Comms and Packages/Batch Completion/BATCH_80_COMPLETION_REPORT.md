# BATCH_80 Completion Report — TEC per-trade keying

**Date opened:** 2026-05-13
**Date shipped:** 2026-05-13
**Doctrine:** CLAUDE.md §5 #15 — NO PATCHES. Full workflow with Langston.
**RUNNING_ISSUES reference:** #105 → RESOLVED

---

## Scope objectives (20 from BATCH_80_SCOPE rev2 §6)

All 20 objectives complete and verified. Detail below; numbers correspond to scope objectives.

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | `trailingStates` Map keyed by `tradeId` | ✅ | `trailing-exit-controller.ts` lines 614/653/917/1124/1185/1198 all use tradeId |
| 2 | `PositionUpdate.tradeId` required | ✅ | `trailing-exit-controller.ts:493` interface, runtime guard at line 661 |
| 3 | `TECExitInput.tradeId` required | ✅ | `tec-evaluator.ts:93` |
| 4 | All 4 accessor signatures flipped (`initializeTrailingState`, `getTrailingState`, `updateTrailingState`, `clearTrailingState`) | ✅ | `trailing-exit-controller.ts` lines 584/648/1117 |
| 5 | `shouldClosePosition(tradeId)` | ✅ | `trailing-exit-controller.ts:1108`, called via `tec-evaluator.ts:tecShouldClose(input.tradeId, ...)` |
| 6 | `getDiagnostics()` shape includes `tradeId` per row | ✅ | `trailing-exit-controller.ts:1216` |
| 7 | B79 xstock_spot freeze guard: tradeId state lookup + symbol log | ✅ | `trailing-exit-controller.ts:660-697` |
| 8 | VTS caller passes tradeId from iteration variable | ✅ | `vts-runner.ts:2127` |
| 9 | Paper/live caller passes `position.id` as tradeId | ✅ | `paper-execution-engine.ts:947` |
| 10 | `initializeTrailingState` accepts optional `seed: TrailingStateSeed` (Option C+) | ✅ | `trailing-exit-controller.ts:578` |
| 11 | Callers build seed from trade record on first cycle | ✅ | `vts-runner.ts:2102-2118`, `paper-execution-engine.ts:932-944` |
| 12 | Persistence: drop legacy states missing tradeId | ✅ | `trailing-exit-controller.ts:importStates` |
| 13 | Every TEC log line includes `tradeId=` token | ✅ | 12 log sites updated |
| 14 | CSV retains both `stopLoss` and `engineStopPrice` columns | ✅ | unchanged from pre-B80 |
| 15 | Runtime invariant assertion fires `[B80][TEC_KEYING_INVARIANT_VIOLATION]` on every exit-cycle | ✅ | `vts-runner.ts:2168-2186`, `paper-execution-engine.ts:967-989` |
| 16 | 9 tests in §4.7 passing (4 original + 5 added per Langston Q6) + Test 8b coercion path | ✅ | CI run 25802780663: 10/10 B80 tests pass, 5/5 b65-parity scenarios I touched pass |
| 17 | UI: Open Simulated Trades shows asset-class category line between symbol and assetClass | ✅ | `machine-learning.tsx` Open + Closed trade render sites + `getAssetClassCategory()` helper |
| 18 | SIM updated lines 838 + 884 (per-trade keying + moonbag counter behavior delta) | ✅ | See §3 below |
| 19 | SYSTEM_MANUAL updated TEC architecture | ✅ | See §3 below |
| 20 | Completion report includes per-symbol → per-trade moonbag-counter behavior-delta callout | ✅ | This document §4 |

## Workflow steps (11 from CLAUDE.md §2)

| Step | Description | Outcome |
|---|---|---|
| 1 | Planning + Scope | `BATCH_80_SCOPE.md` (rev1 + rev2) drafted, Langston-reviewed, green-lit through to Step 4 |
| 2 | Pre-Implementation Audit | SIM consultation folded into scope §3 |
| 3 | Implementation | Phase 1 engine (commit `8ace0b859`), Phase 1.b coercion fix (commit `d5fe43084`), Phase 1.c test-site coverage (commit `1c47b3e37`), Phase 2 UI (commit `08b07dfb4`) |
| 4 | Code Review (Langston) | Phase 1 reviewed via `/home/langston/inbox/B80/batch80_phase1_diff.patch` — flagged Option C+ seed inconsistency, accepted after Phase 1.b revision |
| 5 | GitHub Push + CI | All 15 TEC tests green (10 B80 + 5 b65-parity scenarios I touched). CI Build + Docker Build green. Pre-existing failures in unrelated suites (b73, cost_telemetry, dynamic_sizing, b72, b70) and pre-existing client-side TS errors per RUNNING_ISSUES #39 remain; flagged for separate CI-recovery batch |
| 6 | Staging Deploy | PM2 #268 (Phase 1) then PM2 #269 (Phase 2) on Hetzner |
| 7 | First-Pass Verification (CC) | Monitor caught clean per-trade TEC initialization + persistence-layer restoration for all open trades. Zero `[B80][TEC_KEYING_INVARIANT_VIOLATION]`. Zero `[TEC_UPDATE_MISSING_TRADE_ID]`. XRP/GBP multi-trade-per-symbol case visibly resolved (each trade restored with its own tradeId + stop) |
| 8 | Second-Pass Verification (Langston) | Pending — Langston Step 8 to confirm post-deploy |
| 9 | Iterate | None needed for engine; if any anomaly appears in first-hour monitor window, iterate |
| 10 | Governance Updates | RUNNING_ISSUES #105 → RESOLVED, SIM lines 838+884 updated, MEMORY.md updated (this commit) |
| 11 | Completion Report | This document |

## 1. Problem statement (recap from scope)

`server/services/trailing-exit-controller.ts` stored `trailingStates: Map` keyed by symbol. Concurrent open trades on the same symbol (different strategies, different lanes) all shared one TEC state. First trade to call `initializeTrailingState` set the shared state; subsequent trades inherited that state and were evaluated against the FIRST trade's stop. When any one trade closed, `clearTrailingState(symbol)` wiped the shared state for all concurrent trades on the symbol.

Evidence from `vts_open_trades_2026-05-13.csv` (FET/USD 58h-old range_trade): displayed stop = 0.22863, engine stop = 0.21176, current = 0.225 — trade alive past displayed stop because engine evaluated against a different trade's stop level.

## 2. Fix architecture

`trailingStates: Map` re-keyed from `symbol` to `tradeId`. VTS callers pass `OpenVirtualTrade.id`; paper/live callers pass `paper_sim_open_positions.id`. TEC state is now per-trade — same symbol can appear N times in the map, each entry independent.

Option C+ rehydrate seed: `initializeTrailingState` accepts an optional `seed: TrailingStateSeed` parameter carrying `tradeMode`, `ladderRung`, `originalStopPrice`. Callers build the seed from the in-flight trade record on the FIRST exit-cycle for an open trade post-deploy. Engine reconstructs full ladder + mode state without silently downgrading in-flight TRAILING_TAKE trades to TARGET mode (which would be the rev1 Option C regression).

**Engine-side defensive coercion** (Langston Phase 1 review revision): if caller seeds `tradeMode='TRAILING_TAKE'` with `ladderRung=0`/null/undefined (timing-window case at deploy: mode-writeback landed, rung-writeback didn't, or pre-B65.4 legacy row), engine coerces `seededRung = Math.max(1, raw)` and `seededTargetLatched = true`. Keeps consistency rules in one place — protects against caller errors AND future callers who don't read the scope carefully.

Runtime invariant assertion fires `[B80][TEC_KEYING_INVARIANT_VIOLATION]` log line on every exit-cycle iteration if `Math.abs(displayed stopLoss − engine currentStopPrice) > tick-relative epsilon`. Both vts-runner and paper-engine implement this — observability canary that catches any future regression.

## 3. SIM + SYSTEM_MANUAL updates

**SIM line 838 amended** (additions):
- `PositionUpdate` now carries required `tradeId: string` field.
- `TECExitInput` (tec-evaluator.ts) now carries required `tradeId: string` field.
- All 5 TEC entry points (`initializeTrailingState`, `getTrailingState`, `updateTrailingState`, `clearTrailingState`, `shouldClosePosition`) keyed by tradeId.
- `getDiagnostics()` return shape includes `tradeId` per row — same symbol can appear N times.

**SIM line 884 amended** — moonbag concurrency counter behavior delta:
- Pre-B80: 3 concurrent same-symbol trades transitioning to TRAILING_TAKE → counter increments by 1 (shared state collapsed three events into one).
- Post-B80: same scenario → counter increments by 3 (per-trade increments, correct per-trade semantics).
- Effective cap-enforcement: it's now harder to fit N moonbag trades into `currentSlotTotal - moonbagReservedSlots`. Per Langston Q3: this is the cap finally enforcing its declared semantics, not a regression.

**SYSTEM_MANUAL TEC engine state model** — updated to reflect the per-trade key. Old text described `Map<symbol, TrailingState>`; new text reflects `Map<tradeId, TrailingState>` with `symbol` retained as display/log field.

## 4. Behavior-delta callout (Langston Q3, scope objective #20)

The moonbag-counter per-symbol → per-trade shift is documented above (§3 SIM line 884). On staging post-deploy, monitor `concurrentMoonbagByMode.{vts,paper,live}` counter behavior. If it starts rejecting moonbag entries that previously sneaked through under the shared-state collapse, that is the cap working as designed — NOT a regression.

## 5. Rollback playbook (Langston rev2 #2)

**Emergency rollback path:**
```bash
ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && git revert <commit-hash> --no-edit && git push origin migration/aws-supabase'"
# CI runs against reverted state.
# Then redeploy: git pull && npm run build && pm2 restart dawntrader
```

**Caveat — in-flight TRAILING_TAKE degradation on revert:** the pre-fix code (pre-B80) does NOT have the Option C+ seed path. On `git revert`, in-flight TRAILING_TAKE (moonbag) trades will degrade to TARGET mode on next exit-cycle — that's the original rev1 Option C concern, resurfacing only at emergency rollback. Acceptable as emergency procedure; operator should monitor moonbag-trade exits in the first hour post-rollback.

**Mitigation if rollback needed during active moonbag positions:**
1. Note which trades are currently in TRAILING_TAKE mode (via Open Simulated Trades UI tradeMode column).
2. Execute the revert.
3. Watch those specific trades on the next exit-cycle — they'll close at static target rather than continuing to trail.
4. Re-evaluate the per-trade keying refactor with whatever new constraint motivated the rollback.

## 6. Test coverage

10 new unit tests in `server/tests/unit/b80-tec-per-trade-keying.test.ts`:
1. Multi-trade-per-symbol decision isolation (3 trades, 3 different stops).
2. Persistence per-trade independence (3 same-symbol trades export/import).
3. VTS single-trade-per-symbol regression preserved.
4. Paper single-position-per-symbol regression preserved.
5. BE-latch boolean isolation (trade A latches; trade B's flag stays false).
6. Moonbag counter math 0→1→2→1 with per-trade increments.
7. TEC config TTL consistency within cycle (B79.TEC invariant preserved).
8. 3-trade rehydrate independence (Option C+ seed preserves per-trade `tradeMode` + `ladderRung`).
8b. **TRAILING_TAKE with null/0 ladderRung coerces to rung≥1 + targetLatched=true** (Langston Phase 1 review addition — 4 sub-cases including no-regression for TARGET mode).
9. 4th-trade-on-3-already-open doesn't poison existing states.

All 10 tests pass in CI run 25802780663. 5 b65-tec-parity scenarios I had to touch (Scenarios 9, 12, 13, 14, 15) also pass after Phase 1.c test-site coverage fix.

## 7. Files changed

```
server/services/trailing-exit-controller.ts       (+265 / -41)
server/services/tec-evaluator.ts                   (+22 / -2)
server/services/vts-runner.ts                      (+58 / -9)
server/services/paper-execution-engine.ts          (+62 / -3)
server/tests/unit/b80-tec-per-trade-keying.test.ts (NEW, +380)
server/tests/unit/trailing-exit.test.ts            (+33 / -10)
server/tests/unit/b65-tec-parity.test.ts           (+30 / -14)
server/tests/unit/b79-tec-per-class-cache.test.ts  (+1)
client/src/components/ui/asset-class-badge.tsx     (+22 / -1)
client/src/pages/machine-learning.tsx              (+18 / -4)

10 files changed, +891 / -84
```

## 8. Commits

| Commit | Description |
|---|---|
| `8ace0b859` | Phase 1: TEC engine refactor + 9 unit tests |
| `d5fe43084` | Phase 1.b: engine-side seed coercion fix + Test 8b + asymmetry comment (per Langston review) |
| `1c47b3e37` | Phase 1.c: fix b65-tec-parity test sites missed in earlier sweep |
| `08b07dfb4` | Phase 2: UI category-line in Open + Closed Simulated Trades |

## 9. Governance files changed

- `1-system-manual/RUNNING_ISSUES.md` (#105 → RESOLVED)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` (lines 838 + 884 amended)
- `1-system-manual/SYSTEM_MANUAL.md` (TEC engine state model)
- `Claude Comms and Packages/Scope Files/BATCH_80_SCOPE.md` (rev1 + rev2 in repo)
- `Claude Comms and Packages/Langston Design Asks/B80_TEC_per_trade_keying_design_ask_rev1.md`
- `Claude Comms and Packages/Batch Completion/BATCH_80_COMPLETION_REPORT.md` (this document)
- `.claude/memory/MEMORY.md` (volatile state block)
- `C:/Users/kyleg/.claude/projects/.../memory/MEMORY.md` (user-cache mirror)
- `/home/langston/MEMORY.md` (Langston-side sync per CLAUDE.md §2 Step 10.b)

## 10. Outstanding items (NOT in BATCH_80, filed separately)

- **BATCH_81 candidate** — CI Test Suite is red with ~60 pre-existing test failures across `b73-exit-strategy-replay.test.ts`, `cost_telemetry.test.ts`, `dynamic_sizing.test.ts`, `b72-dbs-routing-guards-consistency.test.ts`, `b70-run-mode-controller.test.ts`. These pre-date BATCH_80 by ≥24h. CLAUDE.md §7 invariant "ALL 4 GREEN since B56" is currently violated. Recommendation: dedicated CI-recovery batch.
- **B-NEW-23 (Phase 16/19 hardening)** — observability gap that allowed B79.0m.b2 missing-import bug to run silently for 2 days. Filed in xStocks tracker.

## 11. Acknowledgments

- Kyle directive 2026-05-13: NO PATCHES, full workflow with Langston, SIM consultation mandatory.
- Langston rev1 review: Option C+ migration, 3 missed entry points (`shouldClosePosition`, `getDiagnostics`, B79 freeze guard), 5 added tests, NO feature flag, invariant assertion, tradeId in every log line, estimate bump.
- Langston Phase 1 code review: engine-side defensive coercion for null-rung TRAILING_TAKE seeds (Phase 1.b fix).
- Langston Phase 1.b sign-off: APPROVED push.

---

*End of BATCH_80_COMPLETION_REPORT.md.*
