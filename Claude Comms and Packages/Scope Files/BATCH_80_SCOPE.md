# BATCH_80 — TEC per-trade keying + Open Simulated Trades UI category label

**Status:** DRAFT (awaiting Langston design review)
**Surfaced:** 2026-05-13 from FET/USD CSV export showing engine stop ≠ displayed stop on multi-trade-per-symbol pairs.
**RUNNING_ISSUES reference:** #105
**Affected paths:** VTS, paper, live (all three trading paths share the same TEC engine and `trailingStates` map)
**Doctrine:** CLAUDE.md §5 #15 — NO PATCHES. Long-term sustainable, scalable, stable solution. Design documented BEFORE implementation. Langston review BEFORE code.

---

## 1. Problem statement

`server/services/trailing-exit-controller.ts` stores TEC state in `trailingStates: Map<string, TrailingState>` keyed by **symbol**. Multiple concurrent open trades on the same symbol (different strategies, different lanes) all share ONE TEC state entry.

Concrete observation from `vts_open_trades_2026-05-13.csv`:

| Symbol | Strategy | Entry | Displayed Stop | Engine Stop | Original Stop | Current Price | Age |
|---|---|---|---|---|---|---|---|
| FET/USD | range_trade | 0.23694 | 0.22863 | 0.21176 | 0.21176 | 0.22500 | 58h 18m |
| FET/USD | support_bounce | 0.23694 (similar) | (different) | 0.21176 | 0.21176 | 0.22500 | 54h 53m |
| FET/USD | morning_star | (similar) | (different) | 0.21176 | 0.21176 | 0.22500 | 54h 12m |

All three FET/USD trades share `engine.currentStopPrice = 0.21176`. Current price 0.225 is BELOW the displayed stop 0.22863 (would trigger on per-trade-keyed engine) but ABOVE the shared engine stop 0.21176 (so trade stays alive). Result: trades stay open past their displayed stops indefinitely or until the 7-day MAX_HOLD_MS safety valve fires.

## 2. Root-cause analysis

### Key code paths

| File:line | Behavior | Bug surface |
|---|---|---|
| `trailing-exit-controller.ts:601` | `trailingStates.set(symbol, state)` on init | Symbol-keyed |
| `trailing-exit-controller.ts:613` | `getTrailingState(symbol)` accessor | Symbol-keyed |
| `trailing-exit-controller.ts:870` | `trailingStates.set(update.symbol, state)` on ratchet | Symbol-keyed |
| `trailing-exit-controller.ts:1098` | `clearTrailingState(symbol)` on close | Wipes shared state for all concurrent trades on symbol |
| `trailing-exit-controller.ts:1172` | `trailingStates.set(state.symbol, state)` on rehydrate | Symbol-keyed |
| `vts-runner.ts:2113-2128` | `evaluateTECExit({ symbol, entryPrice, stopPrice: trade.stopLoss, ... })` | Passes per-trade stopLoss but the engine ignores it after first init |
| `vts-runner.ts:2148` | `if (decision.newStopPrice > trade.stopLoss) trade.stopLoss = decision.newStopPrice` | Per-trade ratchet, but the source `decision.newStopPrice` is the shared-state value |
| `vts-runner.ts:2500` | `clearTrailingState(trade.symbol)` on VTS trade close | Wipes shared state |
| `paper-execution-engine.ts:929` | `evaluateTECExit({ symbol: position.symbol, ... })` | Same shared engine |
| `paper-execution-engine.ts:1352` | `clearTrailingState(position.symbol)` on paper/live close | Wipes shared state |

### How divergence happens

Sequence (FET/USD with 3 trades):

1. **range_trade opens FET/USD trade #1.** First exit-cycle call to `evaluateTECExit('FET/USD', stopPrice=0.21176, ...)`. `trailingStates.get('FET/USD')` returns undefined → `initializeTrailingState` runs. State: `{ currentStopPrice: 0.21176, originalStopPrice: 0.21176, highWaterMark: 0.23694, breakEvenLatched: false, targetLatched: false }`.
2. **support_bounce opens FET/USD trade #2** (different entry, different stop). First exit-cycle call to `evaluateTECExit('FET/USD', stopPrice=trade2.stopLoss, ...)`. `trailingStates.get('FET/USD')` returns the existing state (from trade #1). `update.currentStopPrice = trade2.stopLoss` is **only used at init**; for subsequent calls the engine reads/writes its own `state.currentStopPrice`. Engine returns `decision.newStopPrice = state.currentStopPrice = 0.21176` (trade #1's stop). vts-runner: `0.21176 > trade2.stopLoss?` → if yes, ratchets trade2 up; if no (typical), leaves trade2's stop alone.
3. **morning_star opens FET/USD trade #3**. Same pattern — inherits trade #1's TEC state. trade #3's own `trade.stopLoss` never reaches the engine.
4. **Any FET/USD trade closes** (e.g., trade #1 hits trade #1's stop). `clearTrailingState('FET/USD')` wipes the shared state for the symbol — even though trades #2 and #3 are still open.
5. **Next exit-cycle** iterates trades #2 and #3 in some order. The first one iterated re-initializes TEC state with ITS own `trade.stopLoss`. The other one now follows that trade's stop. Until another close, repeat.

### Downstream incorrect behavior

- **Stop trigger price is wrong** — engine evaluates current price vs shared `state.currentStopPrice`, not the per-trade `trade.stopLoss`.
- **BE-latch and target-latch fire on one trade's geometry but apply to ALL concurrent trades on the symbol.** A target-hit on trade #2 (with target T2) moves `state.currentStopPrice` to BE; that BE becomes the trigger for trades #1 and #3 too, even though trade #1 was opened with a wider stop and target geometry.
- **Moonbag mode entered by one trade is shared.** `state.tradeMode = 'TRAILING_TAKE'` applies to all concurrent trades on the symbol. The concurrency counter `concurrentMoonbagByMode` increments once per symbol-state-transition, not per trade.
- **Ladder rungs are conflated.** `state.ladderRung += 1` counts rungs per symbol, not per trade. CSV `ladderRungsHit` field for a non-first trade on the symbol shows the FIRST trade's rung count.
- **highWaterMark is conflated** — single HWM per symbol, but each trade has its own entry point. Trailing-stop calculations use the same HWM for all trades on the symbol.
- **TEC state persistence** — saves and restores by symbol, so the bug survives restarts. A restored state may belong to a trade that's already closed if `clearTrailingState` was missed during a crash.

## 3. SIM (System Impact Map) consultation

Touchpoints from `1-system-manual/SYSTEM_IMPACT_MAP.md`:

- **Line 809:** TEC engaged from VTS exit loop AND paper `checkExitConditions` via `tec-evaluator.ts` centralizer.
- **Line 817:** `paper_sim_open_positions.stop_loss` written on every engine ratchet (debounced 5s via `trade-safety.ts::persistTrailingStates`).
- **Line 824:** `client/src/pages/machine-learning.tsx` renders TEC State column on both Open + Closed Simulated Trades tables.
- **Line 838:** Editing `trailing-exit-controller.ts` requires checking: tec-evaluator (caller), vts-runner exit loop, paper-execution-engine.checkExitConditions, parity test `b65-tec-parity.test.ts`. PositionUpdate carries optional strategy/sourcePool/regime/callerMode/moonbagAllowed/moonbagQualified.
- **Line 852:** `TrailingState` interface extended in B65.4 with three fields (`ladderRung`, `currentRungTarget`, `currentRungFloor`).
- **Line 882:** Persistence migration via `importStates` handles missing fields with defaults.
- **Line 884:** Moonbag concurrency counter unchanged from B65.2; increments on rung-1 entry, decrements on `clearTrailingState`.
- **Line 908-913:** `TrailingState` extended in B65.4.2 with `originalStopPrice`, `latchTriggerPrice`, `rungTargetHistory`. Propagation: `TrailingUpdateResult` → `tec-evaluator.ts::TECExitDecision` → `vts-runner.ts::OpenVirtualTrade` → `vts-service.ts::persistRealPriceTrade` → JSON log + `paper-execution-engine.ts::closePosition` → `paper_sim_trades` row. Also via `getOpenVirtualTradesForML`.
- **Line 1090:** `regime-phase.ts::regimePhaseStore` follows the same persistence pattern as `trailing-exit-controller.ts`'s state file — both are symbol-keyed in-memory maps with disk persistence. Migration discipline must apply to both.
- **Line 1144-1151:** B73 baseline isolation reads from `b73_baseline_be_trigger_r=1.0` and `b73_baseline_trail_distance_atr=1.0` snapshot constants — NOT live `trailing_exit` keys. Editing live TEC config does NOT affect Variant A in B73 (snapshot isolation). The BATCH_80 architectural refactor of TEC state keying does NOT touch config — it changes the in-memory Map key only.

**Blast radius rating:** **HIGH** — TEC is a core service consumed by VTS, paper, live. The Map-key change is structurally invasive but logically simple. The risk is in the persistence migration path (state files written under the old symbol-key scheme need to be migrated to trade-id-key) and in any caller that assumed symbol-level state (e.g., the moonbag concurrency counter, which is currently keyed by callerMode but increments based on the symbol-state-transition; verify whether the per-symbol semantics intentionally differ from per-trade).

## 4. Fix design

### 4.1 Engine state keying — change from symbol to trade.id

`trailingStates: Map<string, TrailingState>` key changes from `symbol` to `tradeId` (or `positionId` for paper/live). `TrailingState.symbol` field stays for display + log clarity.

### 4.2 Plumb `tradeId` through TEC API

`TECUpdate` interface (in `trailing-exit-controller.ts`) and `TECExitDecisionInput` (in `tec-evaluator.ts`) add a required `tradeId: string` field. Callers pass `tradeId` (VTS: from the `[tradeId, trade]` iteration variable in `resolveOpenVirtualTrades`; paper/live: from `position.id`).

### 4.3 Update reads/writes

- `initializeTrailingState(tradeId, symbol, entryPrice, ...)` — accept tradeId as first arg, key the Map by it. `symbol` becomes a display-only field in `TrailingState`.
- `getTrailingState(tradeId)` — flip signature.
- `clearTrailingState(tradeId)` — flip signature. Only clears the closing trade's state, not the symbol's.
- `updateTrailingState(update: { tradeId, symbol, ... })` — Map ops use tradeId.

### 4.4 Persistence migration

Existing persisted state file is symbol-keyed. On first boot post-deploy:

**Option A — drop and rebuild.** Wipe the persisted file on first boot. TEC re-initializes from each open trade's current `trade.stopLoss` on its first exit-cycle. Simple, but loses any in-progress trailing state (HWM, ladder rung count) on existing open trades.

**Option B — migration helper.** On hydrate, for each symbol-keyed state in the persisted file: find ALL open trades for that symbol in `vts_open_trades` + `paper_sim_open_positions`. Pair the symbol-state with the OLDEST open trade for the symbol (assumption: it was the first to initialize). For other concurrent trades on the same symbol, freshly initialize with each trade's own `trade.stopLoss` on its next exit-cycle.

**Option C — bootstrap from current trade.stopLoss.** Skip the persisted file entirely on first boot post-deploy. For each open trade in the DB, initialize a fresh per-trade TEC state from `trade.stopLoss + entry + target + atrAtOpen`. Loses HWM history but is the cleanest.

**Recommend Option C.** Simple, deterministic, no migration code complexity. Trailing HWM gets reset on the first cycle but the trade record's own `stopLoss` (which has been ratcheted by the engine during the trade's lifetime) is preserved — and that ratcheted value is what the new per-trade state initializes from. The new state will not roll BACK below the trade's current `stopLoss` because of `Math.max` in the engine update path.

### 4.5 Moonbag concurrency counter

`concurrentMoonbagByMode` increments on mode transition `TARGET → TRAILING_TAKE` and decrements on `clearTrailingState`. With per-trade keying, this counter behavior is unchanged conceptually — but verify each trade's transition is now counted independently (correct semantics) and each trade's close decrements the counter (correct semantics).

### 4.6 UI / CSV: collapse `stopLoss` and `engineStopPrice`

Currently the open trades CSV has both fields (line 4070 and 4112 in vts-runner.ts). Post-fix, with per-trade keying, both fields should ALWAYS equal each other (engine state is per-trade). Recommend collapsing to one field — `stopLoss` represents the trigger price, sourced from `engine.currentStopPrice`. Drop `engineStopPrice` column from CSV and UI.

Optionally keep `originalStopPrice` (the value at trade open, never modified) for diagnostic purposes.

### 4.7 Tests

- New unit test in `b65-tec-parity.test.ts` (or a new file `tec-multi-trade-per-symbol.test.ts`): open 3 trades on the same symbol with different stops, run an exit cycle, assert each trade's TEC decision uses ITS own stop, not a shared one. BE-latch on trade #2 should NOT affect trade #1 or #3.
- Persistence test: write states for two trade IDs on the same symbol, restart, verify both states restore independently.
- VTS regression: existing single-trade-per-symbol behavior remains unchanged.
- Paper regression: same.

## 5. Bundled UI fix — Open Simulated Trades asset-class category line

Kyle directive 2026-05-13: in the Open Simulated Trades UI (and CSV export), add a row/column showing the asset-class category label BETWEEN the symbol and the asset-class type (per CSV column placement: between `symbol` column and `assetClass` column).

Mapping:
- `crypto_spot` / `crypto_perp` / `crypto_futures` → "crypto"
- `xstock_spot` / `xstock_perp` / `xstock_futures` → "xstock"

Implementation: derive the label from `assetClass.split('_')[0]` (lowercase) or via a small helper `getAssetClassCategory(assetClass)`. Add as a new CSV column (between `symbol` and `assetClass`). UI display: render under the symbol cell in the Open Simulated Trades table.

This is a small additive UI change; bundled in BATCH_80 because Kyle requested it inline. Decoupled from the TEC keying refactor — can ship as a single commit within the batch or as a separate commit.

## 6. Numbered objectives (verification checklist)

1. `trailingStates` Map keyed by `tradeId` (or `positionId` for paper). All reads + writes updated.
2. `TECUpdate` interface adds required `tradeId: string` field.
3. `initializeTrailingState`, `getTrailingState`, `clearTrailingState`, `updateTrailingState` signatures updated.
4. VTS callers pass `tradeId` from `[tradeId, trade]` iteration variable.
5. Paper/live callers pass `position.id` as tradeId.
6. Persistence rehydrate uses Option C (bootstrap from current `trade.stopLoss`).
7. Unit test for multi-trade-per-symbol decision isolation passes.
8. Existing single-trade-per-symbol regression test passes.
9. CSV export: `engineStopPrice` collapsed into `stopLoss` (or kept as a coherent secondary diagnostic).
10. UI: Open Simulated Trades table shows asset-class category line between symbol and assetClass.
11. SIM updated with the new per-trade keying architecture.
12. SYSTEM_MANUAL updated with the TEC engine state model.
13. Completion report includes before/after CSV snippet showing FET/USD-style multi-trade-per-symbol case resolved.

## 7. Out of scope

- The 7-day MAX_HOLD_MS safety valve stays as-is (separate concern).
- Mode-overlay multipliers (NORMAL/DEFENSIVE/SURVIVAL × stopLossDistanceMultiplier) stay as-is (separate semantic).
- The `originalStopPrice` semantics (raw strategy stop vs adjusted) stays as-is — that's a separate audit if it bothers anyone post-fix.
- B-NEW-23 (observability: distinguish ReferenceError from operational errors in try/catch around `db.execute` calls) is filed separately as a Phase 16/19 hardening fix.

## 8. Risk + rollback

**Risk:** TEC is a core service. A bug in the per-trade-keying refactor could break exit cycles for ALL trades (VTS + paper + live). Mitigation:
- Land the Map-key change behind a feature flag (`module_constants.trailing_exit.per_trade_keying_enabled`) for a verification window.
- Run with flag OFF in production for 24h post-deploy; verify no regression. Flip to ON; verify multi-trade-per-symbol behavior resolves.
- Rollback: flip flag OFF.

Alternative simpler approach (no flag): bundle a unit test that exercises multi-trade-per-symbol and BLOCKS deploy if it fails. Deploy and monitor closely.

Recommend the feature-flag approach for first deploy given the blast radius is HIGH.

## 9. Sequencing

- **Step 1 (this session):** scope drafted, RUNNING_ISSUES #105 entered, Langston design ask staged.
- **Step 2 (Langston review):** Langston reads scope + design ask, returns review comments.
- **Step 3 (consensus):** iterate scope to consensus.
- **Step 4 (implementation):** code the TEC keying change + bundled UI label change, behind feature flag.
- **Step 5 (Langston code review):** diff review pre-push.
- **Step 6 (GitHub push + CI):** all 4 checks green.
- **Step 7 (staging deploy with flag OFF):** verify no regression.
- **Step 8 (flag flip ON):** verify multi-trade-per-symbol resolves on FET/USD-style cases.
- **Step 9 (Kyle verification):** staging UI confirms displayed stop = engine stop on all open trades.
- **Step 10 (governance):** SIM + SYSTEM_MANUAL updated. RUNNING_ISSUES #105 closed.
- **Step 11 (completion report):** filed in `Claude Comms and Packages/Batch Completion/`.

---

*End of BATCH_80_SCOPE.md.*
