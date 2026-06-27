# reorg-B2.3 — Step-4 code diff review (CC-B → Langston)

**INFRASTRUCTURE NOTE: do NOT `cd /mnt/gdrive` or run `git` on the gdrive mount. Read THIS file + the staged `.diff` directly (local FS). For repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.**

Bench (C:\dev): **tsc-baseline GREEN (no regressions)** · **9/9 new tests PASS** · **30/30 affected existing PASS** (canonical_source_lock, reorg-b2-2 tracker rekey, 11.4C.3 harmonization). Full diff staged alongside: `reorg-b2-3-step4.diff`. Diff stat = 384 insertions / 31 deletions (after a line-ending re-normalize — 7 strategy files were CRLF; restored + re-edited preserving CRLF so the diff shows ONLY the real 1-line changes).

---

## NEW/MODIFIED — load-bearing snippets

### 1. SSOT canonicalization (`server/config/canonical-regime-strategy-map.ts`) — the approved normalizeStrategy reuse
```ts
// added to LEGACY_TO_CANONICAL (checked BEFORE the lowercase pass — exact snake_case drift):
  range_trading: 'range_trade',

// new fail-closed wrapper (does NOT touch normalizeStrategy's identity-return contract):
export function resolveCanonicalStrategy(strategy: string): string | null {
  const normalized = normalizeStrategy(strategy);
  return Object.prototype.hasOwnProperty.call(STRATEGY_DISPLAY_NAMES, normalized) ? normalized : null;
}
```

### 2. The gate chokepoint (`server/core/calculations/expectancy.ts`)
```ts
export function getPerClassTargetGate(assetClass: string, strategy?: string): {...} {
  const _classKey = { exchange: '*', assetClass, strategy: '*', regime: '*' };
  return {
    floorPct:    getCachedNumberRequired('expectancy_gates', 'target_floor_pct', _classKey),
    minRR:       _resolvePerStrategyMinRR(assetClass, strategy),     // ← only min_rr goes per-strategy
    reachAtrMax: getCachedNumberRequired('expectancy_gates', 'reach_atr_max',    _classKey),
  };
}
function _resolvePerStrategyMinRR(assetClass: string, strategy?: string): number {
  if (strategy === undefined || strategy === null || strategy === '') {
    return getCachedNumberRequired('expectancy_gates', 'min_rr', { exchange:'*', assetClass, strategy:'*', regime:'*' });
  }
  const canonical = resolveCanonicalStrategy(strategy);
  if (canonical === null) {                                          // ← fail CLOSED
    recordUnknownStrategyAtGate(assetClass, strategy);
    return getCachedNumberRequired('expectancy_gates', 'min_rr_unknown_floor', { exchange:'*', assetClass, strategy:'*', regime:'*' });
  }
  return getCachedNumberRequired('expectancy_gates', 'min_rr', { exchange:'*', assetClass, strategy:canonical, regime:'*' });
}
```
`getCachedNumberRequired` is most-specific-wins: a seeded `(assetClass, canonical)` row wins, else the per-class `*`; for `min_rr_unknown_floor`, an unresolved asset_class falls to the global `*` row (2.88). The whole `expectancy_gates` module is prefetched (whole-module SELECT), so the new constants are auto-cached — no new prefetch registration.

### 3. Unknown-token tripwire (`server/core/observability/unknown-strategy-counter.ts`, NEW) — sync + fail-safe
- `recordUnknownStrategyAtGate(assetClass, rawToken)`: sync increment + throttled (≤1/30s) LOUD `console.warn` + a fire-and-forget §13 alert ONCE per asset_class (`void _raise(...).catch(...)` — never awaited, never throws on the gate path). Queryable `getUnknownStrategyCounts()` for Step-8 to assert zero. **Bench proof of the fail-safe: the test env has no DB, the fire-and-forget alert's `getAllUsers()` throws ECONNREFUSED → the `.catch` logs it → the gate STILL returns + the test passes.** Safety (the max-per-class floor substitution) is independent of the counter/alert.

### 4. OBJ-6 rrSumSq (`server/strategies/guard-eval-tracker.ts`)
```ts
// interface GuardEvalRecord: + rrSumSq: number;
// _blank(): + rrSumSq: 0
// recordGuardEval, INSIDE the existing `reachedRR && Number.isFinite(rr)` block (same rrEvals sample as rrSum):
    r.rrSum += rr;
    r.rrSumSq += rr * rr;
// _accumulate (read-side fold): into.rrSumSq += from.rrSumSq;
```

### 5. Migration `2026-06-27-p19-reorg-b2-3-per-strategy-minrr.sql` (+ rollback, MANIFEST)
Idempotent `DO UPDATE` upsert. Lowers crypto/xstock `*` min_rr 2.5→2.0; seeds 13 per-strategy floors (crypto 8: mean_reversion 2.88 / vwap_pullback 2.44 / strong_bull_trend 1.95 / range_trade 1.71 / reverse_impulse 2.40 / morning_star 1.39 / support_bounce 1.0 / volatility_edge 1.0; xStock 5: vwap_pullback 1.96 / sma_trend_ride 1.95 / pivot_shift 2.16 / vwap_bounce 1.95 / morning_star 1.0); seeds min_rr_unknown_floor crypto 2.88 / xstock 2.16 / global 2.88. A `DO $$` block fails the migration loudly if the seed count is short.

---

## CF-1 (your carry-forward) — every gate caller passes a STRATEGY token (tsc-locked, concrete)
All 21 live call sites, each arg traced to a strategy token (verified by tsc — eval-cycle initially failed TS2304 on a wrong var `strategy`, corrected to the in-scope `strategyKey`; that's the proof the trace is real, not asserted):
- **literals (strategy-engine ×8):** :299 `'vwap_pullback'`, :434 `'abcd_long'`, :568 `'sma_trend_ride'`, :680 `'breakout'`, :781 `'mean_reversion'`, :890 `'range_trade'`, :993 `'vwap_bounce'`, :1615 `'dhma'`
- **literals (strategy files ×8):** adaptive-flow `'adaptive_flow'`, defensive-hedge `'defensive_hedge'`, inside-bar-reversal `'inside_bar_reversal'`, morning-star `'morning_star'`, pivot-shift `'pivot_shift'`, reverse-impulse `'reverse_impulse'`, support-bounce `'support_bounce'`, volatility-edge `'volatility_edge'`
- **constants ×2:** strong-bull-trend `STRATEGY_KEY`(='strong_bull_trend'), orb `STRATEGY_KEY`(='orb')
- **variables ×3:** orchestrator :1224 `strategyId` (StrategyType), vts-runner :1465 `strategy`, eval-cycle :651 `strategyKey`
No caller passes a non-strategy arg. The chokepoint canonicalizes whatever arrives, so the literals don't need to be pre-canonical — the CI tripwire test asserts they ARE (each ∈ STRATEGY_DISPLAY_NAMES, read live) so a future rename trips CI, not Step-8.

## CF-2 (your carry-forward) — rrSumSq + rrSum evicted by the SAME atomic path (concrete)
The tracker has NO per-field eviction. Its ONLY reset is `_stats.clear()` (guard-eval-tracker.ts ~:211, the full-map clear) + per-record (re)creation via `_blank()`. So rrSum and rrSumSq are ALWAYS evicted together (one `.clear()`) and ALWAYS re-initialised together (one `_blank()` = both 0). There is no parallel-eviction code path that could drift them. Persistence: the checkpoint serializes `Object.fromEntries(_stats)` (rrSumSq rides along, JSON-safe, no Infinity sentinel) and restores via `{ ..._blank(), ...v }` (an old checkpoint without rrSumSq → 0). Consumer = Phase-25 25-20 (σ reconstruction); this batch only instruments.

## Open
- (D) RESOLVED (Kyle 2026-06-27 KEEP ACTIVE → 25-20); changes zero floors here.
- Governance (Step-10, named in pre-audit §6): SIM cross-cutting-singletons registry (the canonicalizer) + System Manual signal-pipeline/gate chapter + Tier-1.

Review when you can — iterate on anything; I push only on your clear + after CI 4-green.
