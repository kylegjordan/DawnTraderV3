# Batch 65.2 — Pre-Audit (System Impact Map Walk)

**Author:** Claude Code, 2026-04-23
**Status:** Step 2 pre-audit. Paired with `BATCH_65_2_SCOPE.md`. Ready for Langston review.
**Purpose:** Walk the full dependency graph before touching code. Identify every live consumer of anything we plan to delete or change. Spec the signal-source paths the trailing engine needs. Avoid a repeat of the first B65.2 where the impact map was not actually walked.

---

## 1. Deletion-target orphan check (Phase-11 TEC removal)

Executed a full-codebase grep for every Phase-11 symbol listed in scope §4 Step D. Results:

### 1.1 Files safe to delete outright

- `server/services/execution-controller.ts` — 0 external imports beyond itself and its own unit test.
- `server/config/execution-config.ts` — see §1.2 for LIVE consumers. File deletable only after migration.
- `server/tests/unit/tco-tec-tcl.test.ts` — only tests the deleted files.
- `server/tests/unit/execution-config.test.ts` — only tests the deleted constants.
- `server/types/trade-flow.ts` — only imported by `execution-controller.ts`. Safe to delete entire file.

### 1.2 LIVE production consumers of `EXECUTION_CONFIG` outside the deletion set

These blocked a naive deletion and must be handled before the file can go:

| File | Line | Constant used | Handling |
|---|---|---|---|
| `server/core/adaptive-manager.ts` | 26 | imports EXECUTION_CONFIG but never references it (dead import) | Remove import line. |
| `server/core/boot_orchestrator.ts` | 24, 91 | exposes entire EXECUTION_CONFIG object via `executionConfig` diagnostic field for a boot-time telemetry event | Replace the diagnostic with values pulled fresh from `moduleConstantsService` at boot. Field name in payload stays `executionConfig` for downstream compatibility but its content is now the trailing-exit module's resolved constants. |
| `server/core/risk/dynamic-sizing-engine.ts` | 27, 211 | reads `EXECUTION_CONFIG.MAX_POSITION_RISK ?? 0.1` as the hard cap on entry-time position size | **Migrate.** `MAX_POSITION_RISK` moves to `module_constants` under a new module `risk_sizing` with constant_name `max_position_risk = 0.02`. DSE reads via `getConstant('risk_sizing', 'max_position_risk', key)` with the same 0.1 fallback. |
| `server/services/telemetry-aggregator.ts` | 22, 1551-1556 | exposes 6 TEC constants in a `tecConfig` diagnostic field | Replace with fresh reads from `moduleConstantsService` for the trailing_exit module. Keep the field shape stable for any downstream UI that consumes it. |
| `client/src/components/goals/diagnostics-tab.tsx` | 452 | UI text reads "Directive 11.0C: SQE & TEC Stabilization complete — EXECUTION_CONFIG centralized, adaptive sizing factors normalized (1.10x/0.90x)" | Text update only. Rewrite to reflect B65.1 + B65.2 reality: "TEC modernized to ATR-based trailing; constants sourced from module_constants." |

### 1.3 Plan: order of operations for the deletion

Step A in the scope must execute in this order or the build will break:

1. Add a `risk_sizing` module row set to `module_constants` seeds with `max_position_risk = 0.02` (global wildcard).
2. Update `dynamic-sizing-engine.ts` to read `max_position_risk` via `moduleConstantsService`.
3. Update `telemetry-aggregator.ts` to read TEC constants via `moduleConstantsService`.
4. Update `boot_orchestrator.ts` to read the TEC diagnostic payload from `moduleConstantsService`.
5. Remove the unused import in `adaptive-manager.ts`.
6. Update the UI text in `diagnostics-tab.tsx`.
7. **Only now:** delete `execution-controller.ts`, `execution-config.ts`, `trade-flow.ts`, `tco-tec-tcl.test.ts`, `execution-config.test.ts`.
8. Run full codebase grep again. Zero hits for `EXECUTION_CONFIG`, `ExecutionControllerImpl`, `TradeExecutionController`, `Trendline`, `AdaptiveSizeResult`, `TECConfig`, `updateAdaptiveSize`, `ActiveTrade.trailingStop`, `ActiveTrade.trendline` required before PR ships.

If this ordering is violated (e.g. delete before migrate), the TypeScript build fails in CI and blocks the push. That's the safety net.

---

## 2. Signal-source mapping for the trailing engine

The 9.2 trailing engine (`trailing-exit-controller.ts`) requires three inputs per cycle it was not receiving in the prior B65.2: ATR, DI (Directional Integrity), VolNoise. Plus the engine's state-machine inputs (current price, hold duration, mode).

### 2.1 ATR

**Producers in the system:**
- `analysis-utils.ts::calculateATR` — computes from a prices+highs+lows array.
- `mceContext.indicators.atr` — available at trade-open time via MCE snapshot.
- Strategy engines already use ATR for initial stop placement (e.g. `strongTrendGeometryOverride: { stopAtrMultiplier: 4.0 }`).

**Decision:** Store ATR at trade-open time and carry it through the trade's lifecycle as an immutable snapshot. Rationale: ATR is relatively stable across a few-hour trade; recomputing each cycle adds cost with little precision gain; using the open-time value matches the trailing engine's mental model (the engine's Kprime multiplier produces trailing distance relative to the trade's characteristic volatility, not the moment's).

**Storage:**
- **VTS:** Add `atr` field to the `OpenVirtualTrade` interface in `vts-runner.ts`. Captured from `mceContext.indicators.atr` at the moment `openVirtualTrades.set(...)` is called. In-memory only; VTS doesn't persist open trades to DB.
- **Paper:** Add `atr_at_open` to the existing `metadata` jsonb column on `paper_sim_open_positions`. Captured at position creation. No migration needed (metadata is already jsonb).

### 2.2 DI (Directional Integrity)

**Producer:** `analysis-utils.ts::calculateDirectionalIntegrity(prices)` — returns 0–100.

**Existing callers:** `expectancy.ts` already uses DI for scoring. VTS's MCE-context flow has DI available.

**Decision:** Store snapshot at trade-open (same rationale as ATR). Default to 50 if unavailable. The engine's default is already 50, so a missing value is a no-op on the math.

**Storage:** Same shape as ATR — `di_at_open` on VTS's `OpenVirtualTrade` and in paper metadata.

### 2.3 VolNoise

**Producer:** `analysis-utils.ts::calculateVolNoise(prices)` — returns 0–1.

**Decision:** Snapshot at open, default 0.3 if missing. Matches engine defaults.

**Storage:** `vol_noise_at_open` on VTS `OpenVirtualTrade` and in paper metadata.

### 2.4 Snapshot computation cost

All three derive from the same `prices` array, which is already computed upstream for strategy evaluation. No new compute cost — we're just capturing values that are being computed anyway and discarding.

---

## 3. Upstream dependencies of the trailing engine

| Dependency | Source | Where it's consumed in the engine | Impact if missing |
|---|---|---|---|
| Current price | `priceCache.getBatch(bucketType, symbols)` (VTS) or live WS price feed (paper) | `updatePosition({ currentPrice })` | Engine returns no-op. Stale-cleanup gate handles at the evaluator layer (B65.2 commit). |
| ATR | Snapshot at open, per §2.1 | `updatePosition({ ATR })` → Kprime × ATR trailing distance + break-even 1×ATR gate | `ATR=0` disables trailing math entirely (scope §3.5 issue that's being fixed). |
| DI | Snapshot at open, per §2.2 | `calculateDynamicStopDistance(DI, VolNoise)` → Kprime multiplier | Defaults to 50 → Kprime tilts slightly wider. Non-fatal. |
| VolNoise | Snapshot at open, per §2.3 | Same | Defaults to 0.3. Non-fatal. |
| Cost metrics | `getCachedCostMetrics(symbol)` from `cost-model.ts` | Net-breakeven & net-target-floor computation | Falls back to zero-cost (gross entry / target). Floor still works, just slightly optimistic. |
| Entry, target, stop | Trade record itself | State machine | Fatal if missing — engine requires them. Currently guaranteed at trade creation. |

---

## 4. Downstream consumers of trailing engine output

| Consumer | Data it needs | Wire path |
|---|---|---|
| Exit gate (VTS `resolveOpenVirtualTrades` loop) | Current stop price; close decision | Today: reads `trade.stopLoss` static. Change: reads the engine's writeback OR reads the engine's in-memory state. Scope §3.6 chooses writeback to DB for paper, in-memory for VTS (since VTS doesn't DB-persist open trades). |
| Exit gate (paper `checkExitConditions`) | Current stop price; close decision | Paper reads `position.stopLoss` from DB. Engine writes back to `paper_sim_open_positions.stopLoss` on every stop change (debounced). |
| Paper open-positions table | `trade_mode`, `stop_loss` | Engine writeback via `storage.updatePaperSimOpenPosition(mode, id, { tradeMode, stopLoss })`. Debounced at `persistence_debounce_ms` (5000ms default). |
| Sim closed-trades table | `trade_mode`, `exit_reason` | On close, the VTS persists `tradeMode` and the new `exit_reason` values (`trailing_stop_hit`, `moonbag_timeout`). Requires schema column addition (scope §3.7). |
| Paper closed-trades tables (`paper_sim_trades` + `trades` mode=paper) | `trade_mode` | On close, the paper engine already writes many fields; add `tradeMode`. `paper_sim_trades` needs migration to add the column. `trades` already has it. |
| UI badge (`active-trades-v2.tsx`) | `trade_mode === 'TRAILING_TAKE'` flag on each row | Already works; just needs the data flowing. |
| UI closed-trade views | `trade_mode` | Add badge rendering to closed-trade views (pre-audit §7 inventories the components). |

---

## 5. Shared state and background execution

### 5.1 Shared state

- **`trailingStates` Map inside `trailing-exit-controller.ts`** — keyed by symbol. Currently global process memory. Already has `exportAllStates()` + `importStates()` for persistence via `trade-safety.ts::persistTrailingStates`. No schema change needed.
- **`module_constants` 60s cache** — re-used from B65.1. Adding new rows does not affect cache behavior; rows are read under existing TTL.
- **In-memory concurrent-moonbag counter** — new. Service-level counter that increments on mode flip to `TRAILING_TAKE`, decrements on close. Separate counters for VTS, paper, live modes. Reset on process restart; recovered from the persisted trailing states on boot.

### 5.2 Background execution

- **VTS cycle cadence:** 60s. Trailing engine called per cycle per open trade. For 500 open trades, 500 calls × (1 module_constants read + 1 price lookup + math) = negligible. No cadence change.
- **Paper exit cadence:** Driven by WS price ticks + periodic poll. Engine called per tick. Debounced writeback prevents DB hammering.
- **Persistence debounce:** 5000ms default. Multiple stop changes within 5s produce one write. Tunable via module_constants.

---

## 6. Schema changes

### 6.1 New migration: `2026-04-2x-b65-2-add-trade-mode-to-paper-sim-trades.sql`

```sql
-- Add trade_mode to closed simulated trades
ALTER TABLE paper_sim_trades
  ADD COLUMN trade_mode VARCHAR(20) NOT NULL DEFAULT 'TARGET';

-- Explicit value domain
ALTER TABLE paper_sim_trades
  ADD CONSTRAINT paper_sim_trades_trade_mode_chk
  CHECK (trade_mode IN ('TARGET', 'TRAILING_TAKE'));

-- Backfill: every historical sim trade closed in TARGET mode (trailing was never engaged)
UPDATE paper_sim_trades SET trade_mode = 'TARGET' WHERE trade_mode IS NULL;
```

Rollback removes the constraint and column.

### 6.2 Exit reason enum addition

`exit_reason` column today accepts values like `'stop_hit'`, `'target_hit'`, `'timeout'`, `'trailing_stop_hit'` (already present in paper), plus the new `'moonbag_timeout'`.

Grep confirms `exit_reason` is a plain TEXT column in the tables (not a PG enum), so no type migration needed. The evaluator + engine code changes add the new string value; downstream consumers (telemetry aggregator, UI) gracefully accept any string.

### 6.3 New module_constants seed rows

Migration appends to `2026-04-2x-b65-2-trailing-exit-seeds.sql`:

```sql
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value) VALUES
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_qualifying_strategies',
   '["strong_bull_trend","sma_trend_ride","vwap_pullback","breakout"]'::jsonb),
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_qualifying_source_pools',
   '{"vwap_pullback":["quant-strong_trend"]}'::jsonb),
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_max_duration_ms',
   '14400000'::jsonb),
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_cap_mode',
   '"reserved_slots"'::jsonb),
  -- VTS override: unlimited concurrency
  ('trailing_exit', '*', '*', '*', 'vts_override', 'moonbag_cap_mode',
   '"unlimited"'::jsonb),
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_reserved_slots',
   '1'::jsonb),
  ('risk_sizing', '*', '*', '*', '*', 'max_position_risk',
   '0.02'::jsonb)
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;
```

Note on the VTS override: `regime = 'vts_override'` is a hack; proper approach is a new dimension `mode` on `module_constants`. That's a schema change I don't want to do in B65.2. Fallback: service-layer logic detects VTS caller and overrides `moonbag_cap_mode → 'unlimited'` regardless of the DB row. Add `moonbag_cap_mode: 'unlimited'` as a hardcoded override for VTS callers; DB row is informational. Clean up in a future batch that adds the `mode` dimension.

---

## 7. UI component inventory

Grep across `client/src/` for closed-trade views and open-trade views:

| Component | Purpose | Trade mode handling |
|---|---|---|
| `components/trading/active-trades-v2.tsx` | Paper/live active OPEN trades | **Already renders** `MOONBAG` badge on `trade_mode === 'TRAILING_TAKE'` (L355-359). Verified. |
| `components/trading/closed-trades-*.tsx` | Paper/live CLOSED trades | **Needs badge added.** Pre-audit identifies exact file during implementation. |
| `components/vts/sim-open-positions-*.tsx` or equivalent | VTS open simulated trades | **Needs badge added.** Component path TBD — VTS does not currently expose open-trades UI; may need new endpoint + view. |
| `components/vts/sim-closed-trades-*.tsx` or equivalent | VTS closed simulated trades | **Needs badge added** plus badge styling consistent with paper. |

Pre-audit action item: confirmed component file paths will be listed in the per-file change-list at Step 4.

---

## 8. Blast-radius summary

| Component | Before | After | Blast |
|---|---|---|---|
| `trailing-exit-controller.ts` | Dormant | Called from VTS + paper exit loops; reads module_constants; exposes moonbag-qualifier + concurrency-cap methods | Medium — first time this code runs in production. Tests cover it. |
| `execution-controller.ts` | Dormant, unit-tested only | Deleted | Low — unit tests verify deletion doesn't break live path. |
| `execution-config.ts` | Dormant constants used by 4 live files for diagnostics + 1 DSE cap | Deleted, values migrated to module_constants | Low — diagnostic payloads stay stable; DSE cap stays at 0.02 via module_constants. |
| `vts-runner.ts` exit loop | Simple SL/TP + MAX_HOLD_MS | Full trailing with qualifier, cap, writeback | Medium — core VTS path. Parity tests cover. VTS runs live, will observe immediately. |
| `paper-execution-engine.ts::checkExitConditions` | Simple SL/TP + legacy percentage-trailing | Full trailing; percentage-trailing removed | Medium — paper is currently off, but this is the path that runs when paper turns on. Parity tests cover. |
| `paper_sim_open_positions.trade_mode` | Exists, unpopulated | Populated on mode change | Low — write-only, no reads elsewhere depend on the absence of the value. |
| `paper_sim_open_positions.stop_loss` | Set at trade open, static | Updated on each stop ratchet | **Medium-high.** The exit gate's core input. If writeback breaks, trades close at the wrong stop. Mitigation: debounced writes + integration test that drives a full price path and verifies final stop matches expected trailing value. |
| `paper_sim_trades.trade_mode` | Missing column | Added; populated on close | Low — new column, backfill is deterministic. |
| `module_constants` table | Has trailing_exit module with 4 seed rows | Adds 6 more rows for trailing_exit + 1 for risk_sizing | Low — additive only. Resolution hierarchy handles new rows gracefully. |
| UI active-trades badge | Works but never sees TRAILING_TAKE | Starts seeing TRAILING_TAKE | Low — badge logic unchanged. |
| UI closed-trade views | No badge | Badge added | Low — pure rendering change. |

---

## 9. Risks I could not fully resolve in pre-audit

1. **VTS open-trade UI surfacing.** VTS does not currently persist open trades to DB — the `openVirtualTrades` Map is process-memory. To show trailing state in a VTS open-trades UI, we either (a) start DB-persisting open VTS trades (migration + write path on every open/close), or (b) expose a new read-only endpoint that serializes the Map on demand. Scope §3.7 F.5 leans toward (b) for scope-containment. I want Langston to confirm — is there already a UI surface for open VTS trades that needs the badge, or is it fine to skip that for B65.2 and come back in a later batch?

2. **Trailing-engine persistence across process restart.** The engine already has `exportAllStates` / `importStates`; `trade-safety.ts::persistTrailingStates` wires it. Pre-audit confirms the path exists but does not confirm it runs in production. Need to grep for actual callers of `persistTrailingStates` and make sure it's invoked on shutdown and recovered on startup. If broken, a staging restart mid-observation would lose all trailing state, causing apparent discontinuity in the verification data.

3. **Concurrency cap under burst target-hits.** Scope §3.4 assumes cap is checked deterministically per cycle. If the VTS cycle produces 10 target-hits simultaneously on paper mode with `N − 1 = 3` slots available for moonbag, 3 enter moonbag and 7 close at target. Order of selection: alphabetical by symbol (deterministic, not preference-weighted). Confirming with Langston that deterministic-alpha is fine as a tie-breaker for B65.2 — more sophisticated selection (highest DBS, highest confidence) is a future refinement.

4. **`risk_sizing` module naming.** Creating a new module for a single constant (`max_position_risk`) feels thin. Alternative: fold it into a more general `risk` or `sizing` module and add related constants from DSE (`MIN_MULTIPLIER`, `MAX_MULTIPLIER` in `DSE_CONFIG`) at the same time. Scope creep concern — I'd rather ship B65.2 narrow and add more risk constants in a dedicated batch. Confirming with Langston.

---

## 10. Langston review asks

1. Green-light the deletion ordering in §1.3 — confirm we're not leaving any symbol stranded.
2. Approve snapshot-at-open for ATR/DI/VolNoise (§2) vs. per-cycle recompute.
3. Decision on VTS open-trade UI surfacing — §9 risk 1.
4. Confirm `persistTrailingStates` runs on shutdown AND recovers on startup (§9 risk 2). If not, escalate this as a blocker.
5. Confirm deterministic alphabetical tie-break on concurrent-moonbag cap (§9 risk 3) is acceptable for B65.2.
6. Ruling on `risk_sizing` module vs. folding into a broader risk module (§9 risk 4).
7. Any additional impact-map node you want walked before I start implementation.
