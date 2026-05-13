# Langston design ask — B80 TEC per-trade keying

**From:** Claude Code
**Date:** 2026-05-13
**Re:** RUNNING_ISSUES #105 + BATCH_80 scope
**Action requested:** review the architectural design before we touch code. Per CLAUDE.md §5 #15 NO PATCHES — every architectural decision discussed must be documented + reviewed BEFORE implementation.

---

## 1. What you need to read first

1. `1-system-manual/RUNNING_ISSUES.md` row #105 — the issue statement and impact summary.
2. `Claude Comms and Packages/Scope Files/BATCH_80_SCOPE.md` — full scope, root-cause analysis, SIM consultation, fix design, sequencing.
3. `vts_open_trades_2026-05-13.csv` evidence (Kyle's export this morning) — shows FET/USD with three concurrent trades all converging on the same `engineStopPrice = 0.21176` while each trade's `stopLoss` field reflects its own value.

## 2. The bug, in one paragraph

`server/services/trailing-exit-controller.ts` stores `trailingStates: Map<string, TrailingState>` keyed by **symbol**. VTS + paper + live all share that map. When multiple concurrent trades exist on one symbol (different strategies, different lanes — common in `quant-strong_trend` and across regime transitions), only the FIRST trade's stop initializes the shared engine state. Subsequent trades on the same symbol inherit that state and the engine evaluates ALL of them against the first trade's stop. When any one trade closes, `clearTrailingState(symbol)` wipes the shared state and the next-iterated surviving trade re-initializes from ITS own stop, swapping the trigger basis for all the remaining trades. Displayed `trade.stopLoss` (per-trade, ratcheted via `decision.newStopPrice > trade.stopLoss`) diverges from engine `state.currentStopPrice` (shared). BE-latch / target-latch / moonbag / HWM / ladder rung counts all conflate across concurrent trades on the same symbol.

Live evidence: FET/USD range_trade, displayed stop = 0.22863, engine stop = 0.21176, current = 0.225. Trade is BELOW its displayed stop but ABOVE the engine's shared stop → still alive after 58h.

## 3. Proposed fix

Re-key `trailingStates` from `symbol` to `tradeId` (VTS) / `positionId` (paper, live). Plumb the id through `TECUpdate` interface. Update all four read/write entry points (`initializeTrailingState`, `getTrailingState`, `clearTrailingState`, `updateTrailingState`). Persistence migration via Option C (bootstrap from current `trade.stopLoss` on first boot post-deploy — simplest, deterministic, no migration complexity). Collapse `trade.stopLoss` and `engine.currentStopPrice` into a single source of truth (display always = engine trigger) in the open trades CSV/UI. Bundle a separate small UI fix: add asset-class category line between symbol and assetClass in the Open Simulated Trades table.

Behind feature flag `module_constants.trailing_exit.per_trade_keying_enabled` for first deploy given the HIGH blast radius (TEC is core, affects VTS + paper + live).

## 4. Questions for your review (please answer in your reply)

**Q1 — Map key choice.** TradeId / positionId is unique across (VTS + paper + live) by construction (VTS: `vts_${assetClass}_${ts}_${rand}`; paper/live: UUID from DB). Any concern with using the raw id as the Map key, or do you want a composite key like `(callerMode, id)` for namespace-safety?

**Q2 — Persistence migration.** I proposed three options (drop-and-rebuild, oldest-trade-pairing, bootstrap-from-current-stopLoss). Recommended Option C. Do you concur, or do you want Option B's pairing to preserve in-flight HWM / ladder rung counts for trades currently in trailing mode?

**Q3 — Moonbag concurrency counter.** `concurrentMoonbagByMode` currently increments on state transition `TARGET → TRAILING_TAKE` per symbol-state. With per-trade keying, each trade transitions independently — counter increments correctly per-trade. Confirm this is the desired semantics, or do you want symbol-level moonbag caps preserved (e.g., "max 1 moonbag-mode trade per symbol")?

**Q4 — Stop field collapse in CSV / UI.** Post-fix, `trade.stopLoss` and `engine.currentStopPrice` will always equal (engine state is per-trade, ratchets `trade.stopLoss` via line 2148). I propose dropping `engineStopPrice` column from CSV and UI, keeping `stopLoss` as the trigger and `originalStopPrice` as the at-open diagnostic. Concur, or do you want to keep both fields for the verification window then drop later?

**Q5 — Feature flag vs no-flag deploy.** I proposed `module_constants.trailing_exit.per_trade_keying_enabled` (default OFF on deploy, flip ON after 24h verification). Alternative: ship without flag, rely on the regression test + monitoring. Your call.

**Q6 — Tests required for sign-off.** I'm planning:
  - multi-trade-per-symbol decision isolation (3 trades, 3 different stops, assert each gets evaluated against its own)
  - BE-latch on one trade does not move the stop of concurrent same-symbol trades
  - target-latch on one trade does not enter moonbag for concurrent same-symbol trades
  - persistence: write 2 states for same symbol with different tradeIds, restart, verify both restore independently
  - existing single-trade-per-symbol regression coverage maintained

  Anything else you want before sign-off?

**Q7 — Bundled UI label change.** The asset-class category line (between symbol and assetClass) is a small derivable-field addition. Reasonable to land in the same batch, or do you want it pulled out as its own commit / sub-batch for cleanliness?

**Q8 — UI rollback safety.** If the feature flag is OFF on deploy, the UI's displayed `stopLoss` still shows per-trade-ratcheted values from line 2148 (legacy behavior — diverged from engine). When flag flips ON, `stopLoss` and `engineStopPrice` will collapse to identical values. Do you want the UI to ALSO render conditionally on the flag (show both fields when OFF, collapse when ON), or always render both during the transition and document the collapse in the completion report?

## 5. Out of scope (deferred to other batches)

- B-NEW-23 — ReferenceError distinguishing in `db.execute` try/catch (filed as Phase 16/19 hardening).
- B-NEW-21 — `/api/xstocks/freshness` Supabase statement-timeout (filed in xStocks diagnostic tracker; observation-only endpoint).
- Mode-overlay multiplier semantics (NORMAL/DEFENSIVE/SURVIVAL × stop distance) stay as-is.
- `originalStopPrice` raw-vs-adjusted semantics — separate audit if it bothers anyone post-fix.

## 6. Sequencing

If you green-light the design as-is, I proceed to Step 4 (implementation behind feature flag). If you have revisions, I iterate the scope to consensus.

Estimated work: 6–8 hours of code, ~2h tests, ~1h staging verification, ~1h governance updates. Single batch, single ship target.

Reply with your review on questions Q1-Q8 + any architectural pushback. I'll keep BATCH_80 scope file in sync as we iterate.

---

*End of B80_TEC_per_trade_keying_design_ask_rev1.md.*
