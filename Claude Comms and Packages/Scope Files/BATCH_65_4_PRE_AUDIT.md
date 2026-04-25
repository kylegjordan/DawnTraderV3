# Batch 65.4 — Pre-Audit (System Impact Map Walk)

**Author:** Claude Code, 2026-04-25
**Status:** Step 2 pre-audit. Paired with `BATCH_65_4_SCOPE.md`. Ready for Langston review.

---

## 1. Engine surface area to be modified

`server/services/trailing-exit-controller.ts` is the only file with non-trivial logic changes. Three exported types extended (`TrailingState`, `PositionUpdate`, `TrailingUpdateResult`), one function rewritten (`updatePosition` ladder block replaces target-latch block), `importStates` extended for backward compatibility.

## 2. SIM walk — consumers of the engine surface

I grepped for every importer and direct caller. Full list:

| Consumer | What it imports | What changes for it in B65.4 |
|---|---|---|
| `server/services/tec-evaluator.ts` | `updatePosition`, `shouldClosePosition`, `isMoonbagQualifier`, `canEnterMoonbag`, `getConcurrentMoonbagCount`, types `TrailingUpdateResult`, `CallerMode` | Reads `update.ladderRungsHit` from the engine return. Surfaces it on `TECExitDecision`. Behavioral: no change to existing branches. |
| `server/services/vts-runner.ts` | `getTrailingState` (top-level) + dynamic imports of `getTrailingState`, `clearTrailingState` in close path | Reads `state.ladderRung` for closed-trade write. Adds field to `OpenVirtualTrade` interface. No structural change. |
| `server/services/paper-execution-engine.ts` | dynamic imports of `getTrailingState`, `clearTrailingState` in close path | Reads `state.ladderRung` for closed-trade write. Adds field to position metadata. No structural change. |
| `server/services/trade-safety.ts` | `exportAllStates`, `importStates`, `TrailingState` type | New fields added to TrailingState, persistence file format extended. Backward-compat handled in `importStates`. |
| `server/index.ts` | Dynamic imports `loadTrailingStates`, `persistTrailingStates` from trade-safety | No change — calls unchanged. |
| `server/tests/unit/b65-tec-parity.test.ts` | Mocks the engine; calls evaluator | Test file gets new ladder scenarios. Does NOT mock the engine internals — exercises real engine with mocked DB. New scenarios cover ladder rungs. |

## 3. Schema changes

### 3.1 New migration

`drizzle/migrations/2026-04-25-b65-4-add-ladder-rungs-to-paper-sim-trades.sql`:

```sql
ALTER TABLE paper_sim_trades
  ADD COLUMN IF NOT EXISTS ladder_rungs_hit INTEGER NOT NULL DEFAULT 0;

UPDATE paper_sim_trades SET ladder_rungs_hit = 0 WHERE ladder_rungs_hit IS NULL;

COMMENT ON COLUMN paper_sim_trades.ladder_rungs_hit IS
  'B65.4 (2026-04-25): number of ladder-rung target ratchets the trade hit before closing. 0 = closed at original target/stop without entering moonbag (or qualifier rejected). 1+ = trade ran past N rung targets in moonbag mode before reversing through the ratcheted stop.';
```

Rollback: `2026-04-25-b65-4-rollback.sql` — drop column.

### 3.2 Schema definition update

`shared/schema.ts :: paperSimTrades` adds:
```typescript
ladderRungsHit: integer("ladder_rungs_hit").notNull().default(0),
```

### 3.3 No new module_constants rows in this batch

The ladder uses the existing `target_lock_r` value as the rung step (same R-distance per rung). No new tunable constants needed for the basic functionality. If future tuning shows the rung step should be different (e.g. 1R per rung instead of 1.5R), we add a `module_constants.trailing_exit.rung_step_r` row in a follow-up.

## 4. Persistence format change

The trailing-state JSON file at `/tmp/trailing-states.json` will gain three new fields per state object:
- `ladderRung` (number)
- `currentRungTarget` (number)
- `currentRungFloor` (number)

`importStates` handles the missing-fields case (old persistence file from before B65.4 deploy):
- If `ladderRung` is undefined → set to 0 if `targetLatched=false`, else 1 (best-effort migration: trades that were target-latched pre-B65.4 are treated as having hit rung 1).
- If `currentRungTarget` is undefined → set to `state.targetPrice` (the original target).
- If `currentRungFloor` is undefined → set to 0 (won't bind because the dynamic HWM trail dominates).

Logged when migration happens so we have a record.

## 5. Upstream and downstream signal flow

### 5.1 Upstream (inputs to the engine that could cause ladder to fire incorrectly)

- `currentPrice` — same as today. From priceCache.
- `state.currentRungTarget` — new. Engine maintains it.
- `state.targetPrice` — original target, preserved for reference.

`isTargetLockTriggered(currentPrice, state.currentRungTarget)` (existing function, new argument) checks whether the CURRENT rung's target was hit. Function is pure; just changes which target value it's comparing against.

### 5.2 Downstream (consumers of ladder rung count)

- VTS closed-trade JSON log (via `vts-service.persistRealPriceTrade`)
- Paper closed-trade row (`paper_sim_trades.ladder_rungs_hit`)
- VTS open-trades endpoint (`/api/vts/ml/open` adds `ladderRungsHit` field)
- VTS closed-trades endpoint (`/api/vts/ml/closed` adds `ladderRungsHit` field)
- ML page UI (`machine-learning.tsx` Closed Simulated Trades — TEC State column shows rung count for moonbag trades)
- Trade History tab (`trade-history-tab.tsx` — close-reason cell shows rung count)
- CSV export — both endpoints' export paths include the new field

No other systems consume the engine state directly. Telemetry aggregator only reads the resolved constants (mirror); doesn't care about per-trade engine state.

## 6. Cross-cutting concerns

### 6.1 Concurrency cap counter

The cap counter (`concurrentMoonbagByMode`) increments on first target latch and decrements on `clearTrailingState`. In ladder mode, the counter still tracks "trades currently in TRAILING_TAKE mode" — once a trade enters moonbag (rung 1), it's counted as one moonbag regardless of subsequent rungs. The counter does NOT increment on rung 2, rung 3, etc. (Each trade occupies one moonbag slot, not N slots based on rung count.)

### 6.2 Duration cap (4h)

Starts at first target latch (rung 1). Continues across rung ratchets. If a trade is at rung 3 when the 4h cap fires, exits with `moonbag_timeout` and `ladderRungsHit=3`. The duration cap does NOT reset per rung.

### 6.3 Stage 1.5 (BE-latched, not target-latched)

Unchanged. The ladder only changes behavior AFTER the first target hit (transition from rung 0 to rung 1). All BE-latch logic and dynamic stop trailing between BE and original target stays exactly as it is in B65.2.

### 6.4 Backwards-compat for trades opened pre-deploy

Trades that were opened under the pure-trail design and are still open at deploy:
- If they're in TARGET mode (not target-latched yet): unchanged. They run on the new ladder logic from this point forward — when they hit target, they'll ratchet to rung 1.
- If they're in TRAILING_TAKE mode (target-latched in pure-trail mode): persistence migration sets `ladderRung=1`, `currentRungTarget = targetPrice`, `currentRungFloor=0`. Next cycle, the engine evaluates the ladder logic with rung=1 already set. If price has continued past `targetPrice + R_step`, the engine will detect the missed rung-2 hit on the next cycle and ratchet correctly. If price has reversed below `targetPrice`, the engine's existing dynamic stop (which already reflects HWM-based ratchet from pure-trail's logic) catches the exit.

Result: no in-flight trade is misbehaved by the upgrade.

## 7. Test strategy

`b65-tec-parity.test.ts` extended with new scenarios. The existing 11-scenario test suite stays — those scenarios should all still pass under ladder logic (since none of them rely on multi-rung behavior; they test single-target-latch behavior which the ladder preserves at rung 1).

New scenarios added:

1. **Rung 1 hit + reverse before rung 2:** Trade opens at $100 entry, $95 stop, $107.50 target (1.5R). Price climbs past $107.50, latches rung 1 (new target = $115, new stop floor = $107.50 × 0.995). Price reverses to $107.10 (below stop floor). Exit at $107.10 with `trailing_stop_hit` and `ladderRungsHit=1`.
2. **Rung 2 hit + reverse before rung 3:** Same setup, price runs to $115, latches rung 2 (new target = $122.50, new floor = $115 × 0.995). Reverses to $114.40. Exit at $114.40 with `trailing_stop_hit` and `ladderRungsHit=2`.
3. **Rung 3 hit + reverse:** Price hits $122.50, rung 3 (new target = $130). Reverses to $121.85. Exit with `ladderRungsHit=3`.
4. **HWM dynamic floor takes over:** Price runs to $113 (between rung-1 target $107.50 and rung-2 target $115). HWM is $113. Dynamic trail at HWM − 1×ATR = $111. Effective stop = max($107.50 × 0.995, $111) = $111. Reverses to $110.50. Exit at $110.50 (above the rung-floor, captured upside via dynamic floor).
5. **Qualifier reject at rung 0:** Strategy not in qualifier list. Price hits target. Closes at target with `target_hit` and `ladderRungsHit=0` (no ladder).
6. **Concurrency cap reject at rung 0:** Cap exhausted. Price hits target. Closes at target with `target_hit` and `ladderRungsHit=0`.
7. **Backward-compat persistence migration:** Load a state with `targetLatched=true` but no `ladderRung` field. Confirm imported state has `ladderRung=1`, `currentRungTarget=targetPrice`, `currentRungFloor=0`.
8. **Duration cap with ladderRungsHit captured:** Trade runs to rung 2 then sits at $116 for 5 hours. Duration cap fires. Exit with `moonbag_timeout` and `ladderRungsHit=2`.

## 8. Open questions for Langston

1. **Rung step size:** scope chooses same R-distance as original target (1.5R per rung if original is 1.5R). Alternatives: fixed 1R per rung, fixed 0.5×ATR per rung, HWM + N×ATR per rung. Which matches Kyle's intent best?
2. **Rung floor cost factor:** scope uses `previous_target × 0.995` (~0.5% buffer for costs). Should this be cost-aware via `getCachedCostMetrics(symbol)` like the BE floor? Probably yes for consistency — flagging.
3. **Backward-compat migration:** is "pre-existing target-latched state → rung=1, currentRungTarget=targetPrice" the right migration, or should we drop those states entirely and let trades restart fresh on next price update?
4. **Moonbag persistence on PM2 restart at rung > 1:** state IS persisted, so a restart preserves `ladderRung=2` in the trade. Confirm this is desired behavior (vs. "reset to rung 1 on restart for safety").
5. **Test scenarios — anything missing?** Specifically considering: target hit on the same cycle as concurrency cap state changes (race), duration cap firing exactly at rung-N boundary, persistence-loaded state with stale rung value (engine should reconcile from current price).

Once Langston signs off on scope + this pre-audit, I proceed with implementation. Step 4 code review on the diff before push.
