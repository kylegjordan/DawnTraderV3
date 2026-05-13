# BATCH_80 — TEC per-trade keying + Open Simulated Trades UI category label

**Status:** rev2 (post-Langston design review) — awaiting Langston final green-light to Step 4
**Surfaced:** 2026-05-13 from FET/USD CSV export showing engine stop ≠ displayed stop on multi-trade-per-symbol pairs.
**RUNNING_ISSUES reference:** #105
**Affected paths:** VTS, paper, live (all three trading paths share the same TEC engine and `trailingStates` map)
**Doctrine:** CLAUDE.md §5 #15 — NO PATCHES. Long-term sustainable, scalable, stable solution. Design documented BEFORE implementation. Langston review BEFORE code.
**Rev history:**
- rev1 (2026-05-13 ~12:00 UTC): initial scope, 8 design questions to Langston.
- rev2 (2026-05-13 ~13:00 UTC): Langston review incorporated. Option C → Option C+ migration. NO feature flag. 3 missed entry points added (shouldClosePosition / getDiagnostics / B79 freeze guard). 5 extra tests. tradeId in every TEC log line. Estimate bumped 6-8h → 10-14h. CSV `engineStopPrice` retained with invariant assertion.

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

### Key code paths (UPDATED rev2 — Langston flagged 3 missed entry points)

| File:line | Behavior | Bug surface |
|---|---|---|
| `trailing-exit-controller.ts:601` | `trailingStates.set(symbol, state)` on init | Symbol-keyed |
| `trailing-exit-controller.ts:613` | `getTrailingState(symbol)` accessor | Symbol-keyed |
| `trailing-exit-controller.ts:656` | **B79 xstock_spot market-hour freeze guard** — reads `trailingStates.get(update.symbol)` to return existing-state stop | Symbol-keyed (lookup); LOGGING is correctly symbol-driven (market hours per symbol, not per trade) |
| `trailing-exit-controller.ts:870` | `trailingStates.set(update.symbol, state)` on ratchet | Symbol-keyed |
| `trailing-exit-controller.ts:1088` | **`shouldClosePosition(symbol, currentPrice)`** — called from tec-evaluator.ts:337 | Symbol-keyed |
| `trailing-exit-controller.ts:1098` | `clearTrailingState(symbol)` on close | Wipes shared state for all concurrent trades on symbol |
| `trailing-exit-controller.ts:1172` | `trailingStates.set(state.symbol, state)` on rehydrate | Symbol-keyed |
| `trailing-exit-controller.ts:1187` | **`getDiagnostics()`** — returns `{symbol, mode, stop, latches}[]` | Symbol-unique semantics; post-fix same symbol can appear N times |
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
- **Line 838:** Editing `trailing-exit-controller.ts` requires checking: tec-evaluator (caller), vts-runner exit loop, paper-execution-engine.checkExitConditions, parity test `b65-tec-parity.test.ts`. PositionUpdate carries optional strategy/sourcePool/regime/callerMode/moonbagAllowed/moonbagQualified. **rev2 SIM diff:** PositionUpdate gains required `tradeId: string` field.
- **Line 852:** `TrailingState` interface extended in B65.4 with three fields (`ladderRung`, `currentRungTarget`, `currentRungFloor`).
- **Line 882:** Persistence migration via `importStates` handles missing fields with defaults.
- **Line 884:** Moonbag concurrency counter unchanged from B65.2; increments on rung-1 entry, decrements on `clearTrailingState`. **rev2 SIM diff:** semantic shift from per-symbol to per-trade keying. Counter math is unchanged conceptually but cap-enforcement BEHAVIOR changes: 3 concurrent same-symbol trades transitioning now produce 3 counter increments instead of 1. Cap may start rejecting moonbag entries that previously slipped through (which is the cap finally enforcing its declared semantics, not a regression).
- **Line 908-913:** `TrailingState` extended in B65.4.2 with `originalStopPrice`, `latchTriggerPrice`, `rungTargetHistory`. Propagation: `TrailingUpdateResult` → `tec-evaluator.ts::TECExitDecision` → `vts-runner.ts::OpenVirtualTrade` → `vts-service.ts::persistRealPriceTrade` → JSON log + `paper-execution-engine.ts::closePosition` → `paper_sim_trades` row. Also via `getOpenVirtualTradesForML`.
- **Line 1090:** `regime-phase.ts::regimePhaseStore` follows the same persistence pattern as `trailing-exit-controller.ts`'s state file — both are symbol-keyed in-memory maps with disk persistence. Migration discipline must apply to both.
- **Line 1144-1151:** B73 baseline isolation reads from `b73_baseline_be_trigger_r=1.0` and `b73_baseline_trail_distance_atr=1.0` snapshot constants — NOT live `trailing_exit` keys. Editing live TEC config does NOT affect Variant A in B73 (snapshot isolation). The BATCH_80 architectural refactor of TEC state keying does NOT touch config — it changes the in-memory Map key only.

**Blast radius rating:** **HIGH** — TEC is a core service consumed by VTS, paper, live. The Map-key change is structurally invasive but logically simple. The risk is in the persistence migration path (state files written under the old symbol-key scheme need to be migrated to trade-id-key — addressed via Option C+) and in any caller that assumed symbol-level state. Langston flagged 3 missed callers in rev1; all addressed in rev2 §4.3.

## 4. Fix design

### 4.1 Engine state keying — change from symbol to trade.id

`trailingStates: Map<string, TrailingState>` key changes from `symbol` to `tradeId` (or `positionId` for paper/live). `TrailingState.symbol` field stays for display + log clarity.

### 4.2 Plumb `tradeId` through TEC API

`TECUpdate` interface (in `trailing-exit-controller.ts`) and `TECExitDecisionInput` (in `tec-evaluator.ts`) add a required `tradeId: string` field. Callers pass `tradeId` (VTS: from the `[tradeId, trade]` iteration variable in `resolveOpenVirtualTrades`; paper/live: from `position.id`).

**rev2 addition (Langston Q1):** plumb `tradeId` into every TEC log line. Current TEC logs lead with `${symbol}` only (e.g., `[9.2][EXIT] FET/USD cleared`). Post-refactor format: `[9.2][EXIT] FET/USD tradeId=vts_crypto_spot_... cleared`. This is operational debuggability — the original bug partially hid because three trades collapsed into one log stream.

### 4.3 Update reads/writes (rev2 — 3 missed entry points added)

- `initializeTrailingState(tradeId, symbol, entryPrice, targetPrice, initialStopPrice, DI, VolNoise, ATR, seed?)` — accept tradeId as first arg, key the Map by it. `symbol` becomes a display-only field in `TrailingState`. **rev2:** add optional `seed: TrailingStateSeed` parameter for Option C+ rehydrate (see §4.4).
- `getTrailingState(tradeId)` — flip signature.
- `clearTrailingState(tradeId)` — flip signature. Only clears the closing trade's state, not the symbol's.
- `updateTrailingState(update: { tradeId, symbol, ... })` — Map ops use tradeId.
- **`shouldClosePosition(tradeId, currentPrice)`** at line 1088 — flip signature. Called from `tec-evaluator.ts:337` (`tecShouldClose(input.symbol, currentPrice)` → `tecShouldClose(input.tradeId, currentPrice)`).
- **`getDiagnostics()`** at line 1187 — returns one row per trade post-fix. Same symbol can appear N times. Add `tradeId` to the shape. Audit consumers for symbol-unique semantics — if any consumer dedupes by symbol, that's a downstream fix.
- **B79 xstock_spot market-hour freeze guard** at line 656 — currently does `trailingStates.get(update.symbol)` to return existing-state stop unchanged when market is closed. Switch the state lookup to `update.tradeId`. Keep the freeze LOG line keyed by symbol because market hours are a symbol-level property, not a trade-level one (`[B79][TEC_FREEZE] ${symbol} (xstock_spot, market closed)`). Per Langston: this is one of the places per-symbol vs per-trade semantics actually has texture — keep it explicit.

### 4.4 Persistence migration — Option C+ (rev2 update)

**rev1 proposed Option C** (drop persisted state file on first boot, re-initialize from `trade.stopLoss` only). **Langston pushback:** pure Option C silently downgrades any in-flight TRAILING_TAKE (moonbag) trade back to TARGET mode, losing the ratcheting-trailing-stop protection. Regression for moonbag trades at deploy time.

**rev2 adopts Option C+:**
1. Drop `/tmp/trailing-states.json` on first post-deploy boot (no migration code).
2. Extend `initializeTrailingState` with an optional `seed: TrailingStateSeed` parameter:
   ```ts
   interface TrailingStateSeed {
     tradeMode?: 'TARGET' | 'TRAILING_TAKE';
     ladderRung?: number;
     originalStopPrice?: number;
     breakEvenLatched?: boolean; // optional, can be re-derived from stopLoss vs netBreakeven
   }
   ```
3. On the first exit-cycle for each open trade, the calling code (vts-runner / paper-execution-engine) builds the seed from the trade record in memory:
   ```ts
   const seed: TrailingStateSeed = {
     tradeMode: trade.tradeMode ?? 'TARGET',
     ladderRung: trade.ladderRungsHit ?? (trade.tradeMode === 'TRAILING_TAKE' ? 1 : 0),
     originalStopPrice: trade.originalStopPrice ?? trade.stopLoss,
     // breakEvenLatched can be left undefined and re-derived if needed
   };
   ```
4. `initializeTrailingState` applies the seed when constructing the new state:
   - `currentStopPrice` = `initialStopPrice` (= trade.stopLoss, already engine-ratcheted)
   - `targetLatched` = `seed.tradeMode === 'TRAILING_TAKE'` (derived)
   - `ladderRung` = `seed.ladderRung ?? 0`
   - `currentRungTarget` = `targetPrice` (or computed from rung offset if rung > 0)
   - `originalStopPrice` = `seed.originalStopPrice ?? initialStopPrice`
   - `highWaterMark` = `currentPrice` (passed in via update)
   - `breakEvenLatched` = `seed.breakEvenLatched ?? false` (or derived: `stopLoss >= netBreakeven`)
5. Default seed = current behavior, so the regression surface is bounded. Callers that don't pass a seed get exactly the rev1 Option C behavior.

~30 extra lines. Protects in-flight moonbag trades at deploy time.

### 4.5 Moonbag concurrency counter

`concurrentMoonbagByMode` increments on mode transition `TARGET → TRAILING_TAKE` and decrements on `clearTrailingState`. With per-trade keying, this counter behavior is unchanged conceptually — each trade transitions independently (correct per-trade semantics).

**rev2 behavior-delta note (Langston Q3):** under symbol-keying today, three FET/USD trades transitioning collapsed into ONE counter increment. After the fix, the same scenario increments by THREE. This changes effective cap-enforcement: it's now harder to fit N moonbag trades into `currentSlotTotal - moonbagReservedSlots`. Per Langston: this is the right answer — the cap was always *supposed* to count per trade. Verify on staging that this doesn't suddenly start rejecting moonbag entries that were previously sneaking through. If it does, that's the cap finally enforcing its declared semantics, not a regression. **Document the behavior delta in the completion report.**

### 4.6 UI / CSV: keep both `stopLoss` and `engineStopPrice` + invariant assertion (rev2 update)

**rev1 proposed collapsing the two fields** into a single source of truth. **Langston pushback:** the bug surfaced because of the divergence between displayed and engine stop. Removing one of the two fields makes future regressions invisible.

**rev2 plan:**
- **CSV export:** keep both `stopLoss` and `engineStopPrice` columns for at least 30 days post-deploy.
- **Runtime invariant assertion:** at CSV export time (and ideally on every exit-cycle iteration), assert `Math.abs(stopLoss - engineStopPrice) < epsilon` (epsilon = `0.0001 * entryPrice` or similar tick-relative bound). On violation, log:
  ```
  [B80][TEC_KEYING_INVARIANT_VIOLATION] tradeId=${tradeId} symbol=${symbol} displayed=${stopLoss} engine=${engineStopPrice} delta=${delta}
  ```
  Surface in the next batch's pre-audit if any rows fire.
- **UI display:** collapse to one visual column with a tooltip on hover showing the engine-side value. UI doesn't expose both visually, but the underlying data carries both for diagnostic purposes.
- **Column drop:** deferred to a follow-up batch (B81+) once we have observation time.

### 4.7 Tests (rev2 — 5 cases added per Langston Q6)

Original rev1 tests:
1. **Multi-trade-per-symbol decision isolation** — open 3 trades on the same symbol with different stops, run exit cycle, assert each trade's TEC decision uses ITS own stop.
2. **Persistence per-trade independence** — write 2 states for same symbol with different tradeIds, restart, verify both restore independently.
3. **VTS single-trade-per-symbol regression** — existing behavior unchanged.
4. **Paper single-trade-per-symbol regression** — existing behavior unchanged.

**rev2 additions:**
5. **BE-latch boolean isolation** — BE-latch on trade A leaves trade B's `breakEvenLatched=false` (assert the boolean, not just the stop price).
6. **Moonbag concurrency math** — open 2 same-symbol trades, both qualify, both transition. Counter goes from 0→1→2. Close one. Counter = 1. (Catches the §4.5 behavior change explicitly.)
7. **TEC config TTL consistency within cycle** — simulate a config TTL expiry between trade A's update and trade B's update in the same cycle. Assert both use the same snapshot (consistency-within-cycle, already a B79.TEC invariant).
8. **3-trade rehydrate independence (Option C+)** — restart with persisted state for 3 same-symbol trades. Each restores with its own `ladderRung`, `originalStopPrice`, and `tradeMode`. Validates the Option C+ seed path.
9. **Negative: 4th trade on a 3-already-open symbol doesn't poison existing states** — open trade 4, assert trades 1/2/3's TEC states are unchanged.

## 5. Bundled UI fix — Open Simulated Trades asset-class category line (rev2 — separate commit)

Kyle directive 2026-05-13: in the Open Simulated Trades UI (and CSV export), add a row/column showing the asset-class category label BETWEEN the symbol and the asset-class type (per CSV column placement: between `symbol` column and `assetClass` column).

Mapping:
- `crypto_spot` / `crypto_perp` / `crypto_futures` → "crypto"
- `xstock_spot` / `xstock_perp` / `xstock_futures` → "xstock"

Implementation: derive the label from `assetClass.split('_')[0]` (lowercase) or via a small helper `getAssetClassCategory(assetClass)`. Add as a new CSV column (between `symbol` and `assetClass`). UI display: render under the symbol cell in the Open Simulated Trades table.

**rev2 sequencing note (Langston Q7):** ship as separate commit AFTER the engine refactor lands. Keeps `git bisect` clean if a regression appears post-deploy.

## 6. Numbered objectives (verification checklist) — rev2

1. `trailingStates` Map keyed by `tradeId` (or `positionId` for paper). All reads + writes updated.
2. `TECUpdate` interface adds required `tradeId: string` field.
3. `TECExitDecisionInput` in tec-evaluator.ts adds `tradeId: string` field.
4. `initializeTrailingState`, `getTrailingState`, `clearTrailingState`, `updateTrailingState` signatures updated.
5. **`shouldClosePosition` signature updated to `(tradeId, currentPrice)`.**
6. **`getDiagnostics()` return shape includes `tradeId` per row.**
7. **B79 xstock_spot market-hour freeze guard at line 656 uses `update.tradeId` for state lookup; freeze LOG line keeps symbol context.**
8. VTS callers pass `tradeId` from `[tradeId, trade]` iteration variable in `resolveOpenVirtualTrades`.
9. Paper/live callers pass `position.id` as tradeId.
10. **`initializeTrailingState` accepts optional `seed: TrailingStateSeed` parameter (Option C+ rehydrate).**
11. **Callers build seed from trade-record fields on first exit-cycle: `tradeMode`, `ladderRungsHit`, `originalStopPrice`.**
12. **Persistence rehydrate drops `/tmp/trailing-states.json` on first post-deploy boot (no migration code).**
13. **Every TEC log line includes `tradeId=` token for operational debuggability.**
14. **CSV export retains both `stopLoss` and `engineStopPrice` columns. UI collapses visually with tooltip.**
15. **Runtime invariant assertion `Math.abs(stopLoss - engineStopPrice) < epsilon` fires `[B80][TEC_KEYING_INVARIANT_VIOLATION]` on violation.**
16. **9 tests in §4.7 passing (4 original + 5 added per Langston Q6).**
17. UI: Open Simulated Trades table shows asset-class category line between symbol and assetClass (bundled, separate commit).
18. SIM updated with per-trade keying architecture and moonbag-counter behavior delta call-out at lines 838 + 884.
19. SYSTEM_MANUAL updated with the TEC engine state model.
20. Completion report includes before/after CSV snippet showing FET/USD-style multi-trade-per-symbol case resolved + **per-trade vs per-symbol moonbag-counter behavior delta noted explicitly per §4.5**.

## 7. Out of scope

- The 7-day MAX_HOLD_MS safety valve stays as-is (separate concern).
- Mode-overlay multipliers (NORMAL/DEFENSIVE/SURVIVAL × stop distance) stay as-is (separate semantic).
- The `originalStopPrice` semantics (raw strategy stop vs adjusted) stays as-is — that's a separate audit if it bothers anyone post-fix.
- B-NEW-23 (observability: distinguish ReferenceError from operational errors in try/catch around `db.execute` calls) is filed separately as a Phase 16/19 hardening fix.

## 8. Risk + rollback (rev2 — NO feature flag)

**rev1 proposed a feature flag.** **Langston pushback:** the flag introduces complexity that itself is bug-prone — two persistence formats (symbol-keyed vs trade-id-keyed), conditional code paths, runtime branch divergence. A live-toggle flag is the worst version (state corruption on flip). A boot-time-only flag is cleaner but still doubles the deploy surface.

**rev2 plan (Langston Q5):**
- **Deploy-blocking regression test.** The multi-trade-per-symbol test from §4.7 is a CI deploy gate — fails → no merge. Single source of truth: if the test passes locally + CI, the keying is correct.
- **Runtime CSV invariant assertion** from §4.6 acts as the canary. Any post-deploy regression that causes `stopLoss ≠ engineStopPrice` divergence fires the `[B80][TEC_KEYING_INVARIANT_VIOLATION]` log.
- **Rollback path:** `git revert` + `pm2 restart`. The persistence file gets wiped on revert too (since the previous build expects symbol-keys); Option C+ rehydrate kicks in cleanly.
- **Deploy timing:** low-volume window. Active log monitoring for first hour post-flip.

**Kyle override:** if you insist on a boot-time-read-only flag (NOT live-toggle), acceptable. Live-toggle is explicitly off the table per Langston — state corruption on flip risk.

**Per CC current call: NO flag**, per Langston's recommendation. Will revise on Kyle's directive.

## 9. Sequencing

- **Step 1 (this session):** scope drafted rev1 → Langston review → scope rev2 (this file). RUNNING_ISSUES #105 entered. Langston design ask answered.
- **Step 2 (rev2 review):** stage rev2 to Langston's inbox, send via SSH+claude-cli, verbatim relay reply to Telegram. Langston green-lights through to Step 4 (or pushes further revisions; iterate).
- **Step 3 (Kyle final approval if needed):** if Langston has additional pushback that requires Kyle's call (e.g., flag override), escalate. Otherwise proceed directly to Step 4.
- **Step 4 (implementation):** code the TEC keying change + Option C+ seed path + log-line plumbing + invariant assertion. Separate commit for the bundled UI label change. All test cases pass locally + CI green.
- **Step 5 (Langston code review):** diff review pre-push.
- **Step 6 (GitHub push + CI):** all 4 checks green, multi-trade-per-symbol test gates the merge.
- **Step 7 (staging deploy):** PM2 restart. First-hour active monitoring for `[B80][TEC_KEYING_INVARIANT_VIOLATION]` log lines.
- **Step 8 (verification):** Kyle confirms on staging UI that displayed stop = engine stop on all open trades. FET/USD multi-trade-per-symbol case resolves.
- **Step 9 (governance):** SIM lines 838 + 884 updated. SYSTEM_MANUAL TEC section refreshed. RUNNING_ISSUES #105 marked RESOLVED.
- **Step 10 (completion report):** filed in `Claude Comms and Packages/Batch Completion/BATCH_80_COMPLETION_REPORT.md`. Includes the per-symbol → per-trade moonbag-counter behavior-delta call-out.

## 10. Effort estimate (rev2 update)

**rev1: 6-8h.** **Langston rev2: 10-14h** (Option C+ rehydrate + log-line plumbing + invariant assertion + 3 missed entry points + 5 added tests add real work beyond the core Map-key change).

Solo batch (not absorbed into the xStocks UI work — that sprint is closed).

---

*End of BATCH_80_SCOPE.md rev2.*
