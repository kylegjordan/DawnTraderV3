# P19-B7.2b — Completion Report

**Batch:** P19-B7.2b — Complete the shared maker/taker service: VTS wiring + fee-mode visibility + model correction
**Owner:** CC-B (NEW Claude) · **Reviewer:** Langston (Step-1/2/4/8) · **2nd-eyes:** CC-A · **change-class: architecture**
**Date closed:** 2026-07-01 · **Commits:** `a9480e4f8` (main) + `8dc63772a` (Langston Step-4 confirm-B canonicalize fix)
**CI:** runs `28526892658` + `28527184200` — all 4 jobs GREEN on both. **Deploy:** staging restart #429, HTTP 200, migration applied clean.

---

## Objectives — checklist (YES / NO / PARTIAL + evidence)

**OBJ-A — VTS calls the shared `decideMakerTaker` + symmetric active-path placement.** ✅ YES.
- `vts-runner.ts`: `decideMakerTaker` runs before the VTS Net-EV gate; the gate now consumes `_vtsMtDecision.chosenNetEV` (best-of-both). The VTS open-trade record carries `chosenEntryMode` + `entryFeeRate`.
- Active path (`signal-orchestrator.ts`): the decision runs standalone BEFORE the SQE (the SQE stays calculation-free — Kyle directive). Proven pure-reorder (`signalStrength = finalScore` computed before the SQE evaluate).
- **Evidence:** live — the VTS is opening trades post-deploy with the chosen mode stamped (see UI verification).

**OBJ-E — RTB refresh re-runs the decision each cycle (load-bearing) + score-timing.** ✅ YES.
- `ready_to_buy_service.ts`: the geometry-refresh block captures inputs (`_b72bMTInputs`); the `decideMakerTaker` call is DEFERRED to AFTER `refreshedFinalScore` is computed, so `signalStrength` consumes the DECAYED score (Langston Step-4 gate #3). The re-decide writes `chosen_entry_mode` + `chosen_net_ev` + `taker_net_ev` + `maker_net_ev_adjusted` + decayed `finalScore` in a SINGLE `updateRtbSignal` (atomic — Langston gate #4; `distStop` is not mutated on this path, so the ranker's `r = chosen_net_ev/distStop` has an atomic numerator + invariant denominator).

**maker_pending STRIP (wrong-stage removal).** ✅ YES.
- Removed `processMakerPending`/`markMakerPending`, the `refreshSingleSignal` maker-pending early-branch, the `getRankedSignals` mutual-exclusion filter, and the promotion-loop maker-POST branch; dropped the 4 `maker_pending`/`maker_posted_at`/`maker_limit_price`/`maker_budget_expires_at` columns (migration).
- **Blast-radius (Langston gate #2):** zero remaining refs to the methods, zero readers of the 4 columns (drizzle defs removed from `schema.ts`; no `select *`/ORM/view), tsc-clean, forward-only migration + honest recreate-as-nullable down-migration.
- Recorded in `DELETED_COMPONENTS_LOG.md` (§15).

**OBJ-B — fee-mode carried onto all 4 trade stores.** ✅ YES.
- `paper_sim_open_positions` + `paper_sim_trades` (typed columns, written at `createPaperSimOpenPosition`/`createPaperSimTrade`; fee rate = class per-side rate for the chosen mode, fail-hard via cost-model).
- `vts_open_trades` (typed columns, promoted out of the `context` jsonb → single home; rehydrate reads column with legacy-context fallback).
- `vts_trades_*.json` (carried onto `Phase10TradeRecord` + through `persistRealPriceTrade` → read back by `getClosedVTSTradesFromLogs`).
- NULL-not-guessed: a pre-B7.2 row stays NULL, never coerced to 'taker'. Entry-leg only.

**OBJ-C — uniform "Entry Fee Mode" UI column on the 4 surfaces.** ✅ YES (see §9.3 verification + scope-correction below).
- ONE shared `formatEntryFeeMode()` (`client/src/lib/utils.ts`): renders `Maker (0.40%)` / `Taker (0.80%)`, NULL → em-dash, never a guessed taker.
- Surfaces: RTB (`ready-to-buy-table.tsx`), paper-open (`active-trades-v2.tsx`), paper-closed (`trade-history-tab.tsx`), VTS open+closed (`machine-learning.tsx` OpenTradesTable + ClosedTradesTable). APIs: `/api/trading-signals` (spread), `/api/paper-sim/active-trades` (whitelist +2), `/api/paper-sim/trades` (raw rows), `/api/vts/ml/open` + `/api/vts/ml/closed` (explicit mapping).

---

## Scope correction (OBJ-C surfaces)
The scope said "3 components for both VTS + paper-active views," and the plan doc loosely named `shadow-trades-tab`. On tracing the data: `active-trades-v2` + `trade-history-tab` are paper-only (no VTS toggle), and `shadow-trades-tab` is the reorg-B4 selection-quality layer (rows are pool-members-per-cycle, no per-trade fee mode). The actual VTS per-trade view is **`machine-learning.tsx`** (Open/Closed Simulated Trades). So the four real surfaces are RTB + paper-open + paper-closed + VTS(ML page). Langston agreed with dropping shadow-trades-tab.

## §9.3 UI verification (Claude-in-Chrome — honest scope)
- **VTS Open Simulated Trades — LIVE-VERIFIED.** The "Entry Fee Mode" column renders correctly between Source Pool and TEC State. NEW crypto trades opened post-deploy show **Taker (0.80%)** (NIL/USD, KAS/USD, SOL/USDC, SOL/EUR, SOL/AUD); the pre-B7.2b xStock trade (XYL/USD) shows the em-dash. Open count climbed live (116→118) — the VTS is actively opening trades with the fee mode stamped, proving the full chain end-to-end. It sensibly chose taker given crypto Tier-1 fees.
- **The other three surfaces (RTB, paper-open, paper-closed)** render the table (and the column) ONLY when populated; paper is STOPPED + active-trading OFF, so they are empty and cannot be exercised with rows until **paper-active turns on (B8)**. They use the IDENTICAL shared `formatEntryFeeMode` + the same column pattern (colspans + wiring Langston-verified in the diff; benched tsc-clean). VTS Closed (570 rows, all pre-B7.2b → em-dash) is the same page/formatter as the verified Open table.
- **Net:** one surface live-verified with real maker/taker data + null handling; the paper/RTB three are build-now, exercise-at-B8.

## Langston Step-4 confirmations (logged)
- **A) `_b72ChosenMode`** binds to the pre-existing def in the paper trade-create path (`paper-execution-engine.ts` [11.8B] block), reads the promoted signal's `chosen_entry_mode`, and `_b72EntryFeeRate` derives from it → recorded rate matches the actual entry mode. (Langston independently verified.)
- **B) Urgency-class vintage — FIXED (not just confirmed).** The orchestrator stores the RAW `strategy` on `rtb_signals` (e.g. `range_trading`) but keys gen-time on `_canonicalStrategy` (`range_trade`); a bare `STRATEGY_FAMILY_MAP[signal.strategy]` in the refresh returned undefined → default urgency → a possibly different maker/taker mode than gen-time. Fixed in `8dc63772a`: both the RTB refresh AND the VTS decision now key on `STRATEGY_FAMILY_MAP[normalizeStrategy(strategy)]` (the SSOT normalizer cures the drift, identity on canonical tokens) → same-vintage with gen-time. Dormant until paper-active.
- **VTS-volume note:** the OBJ-A gate flip admits taker-marginal/maker-better signals VTS previously skipped → VTS volume ticks up (the live 116→118 climb is consistent) — intended best-of-both parity, to be called out at B8 so it isn't misread as a regression.

## Phase-21 named homes (re-cited per Langston gate #1)
- **RUNNING_ISSUES #410** — the REAL Kraken post-only place/reprice/timeout/cancel resting-order lifecycle → Phase-21; haircut calibration → Phase-25.
- **RUNNING_ISSUES #412** — the post-promotion PENDING maker-fill (paper+VTS, BUILD NOW = B7.2c) + tiered timeout; Phase-21 = the real Kraken resting-order + the fill-timeout profitability calibration.

## 🚨 SCAFFOLDING-VS-FUNCTIONAL (§9.1)
The maker/taker DECISION is functional now (running live in the VTS). The maker-order FILL lifecycle (a promoted maker order holding a PENDING slot until filled) is **NOT built in this batch** — it is B7.2c (paper+VTS simulated fill, build-now) and Phase-21 (live Kraken). Until B7.2c + B8, no maker order is worked; a maker decision has no execution path exercised (dormant, active trading OFF).

## Governance files changed
- **Tier-1:** `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `PHASE_19_PLAN.md` (§1 board + §5 log), `.claude/memory/MEMORY.md`-mirror + `MEMORY_CC_B.md`, this completion report, `Scope Files/P19_B7_2b_{SCOPE,PRE_AUDIT}.md`.
- **Tier-2:** `SYSTEM_MANUAL.md` (signal-pipeline: decision-before-SQE + in-queue-lifecycle removal + VTS best-of-both gate), `SYSTEM_IMPACT_MAP.md` (rtb_signals shape + ready_to_buy refresh + fee-mode cols on 3 trade tables + VTS decision), `RUNNING_ISSUES.md` (#410/#412 status), `DELETED_COMPONENTS_LOG.md` (§15 strip), Langston `/home/langston/MEMORY.md` (§10.b sync).
- Migration `2026-07-01-p19-b7-2b-fee-mode-columns.sql` (+ rollback) registered in `MANIFEST.txt`.

## Verification evidence
- Bench: `check-tsc-baseline.mjs` = OK (no regressions; touched files reduced pre-existing baseline errors, e.g. vts-runner TS2339 25→3); `p19-b7-2-maker-taker.test.ts` 13/13; full vitest 2122 pass (9 fails all no-DB-on-bench pg-pool, none in touched files).
- CI: 4-green on both commits.
- DB (Supabase): fee-mode cols present on the 3 trade tables; rtb_signals kept chosen_entry_mode; the 4 maker_pending cols dropped (confirmed absent).
- UI (§9.3): VTS Open surface live-verified (Taker 0.80% + em-dash).

**Status:** Awaiting Langston Step-8 sign-off + Kyle acknowledgment.
