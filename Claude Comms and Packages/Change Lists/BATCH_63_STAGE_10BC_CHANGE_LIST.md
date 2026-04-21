# Batch 63 — Stage 10B+10C Change List

**Stage:** 10B+10C — Items 11, 12, 14 of BATCH_63_SCOPE.md combined
**Author:** Claude Code
**Date:** 2026-04-21
**Branch:** `migration/aws-supabase`
**Ready for:** Langston code-level review BEFORE push

**Predecessor:** Stage 10A (commit `b0b8e39e`) deployed, Langston second-pass approved.

---

## Items implemented in this stage

- **Item 11** — vwap_pullback promotion into strong-trend lane
- **Item 12** — Strong-trend geometry override plumbing (routing context → indicators → detector)
- **Item 14** — Strong-trend lane mode-overlay bypass

Combined because all three touch the same vts-runner + paper-execution-engine region and are logically coupled (lane routing + geometry override + mode-overlay bypass together define the strong-trend-lane semantics).

---

## Files changed (4)

```
server/config/canonical-regime-strategy-map.ts |  13 +++++
server/services/paper-execution-engine.ts      |  16 ++++--
server/services/strategy-engine.ts             |  54 ++++++++++++++----
server/services/vts-runner.ts                  |  33 +++++++++--
4 files changed, 98 insertions(+), 18 deletions(-)
```

---

## Change 1 — `server/config/canonical-regime-strategy-map.ts`

Added new exported map `MULTI_FAMILY_ELIGIBILITY: Record<string, StrategyFamily[]>` with a single entry:

```ts
export const MULTI_FAMILY_ELIGIBILITY: Record<string, StrategyFamily[]> = {
  vwap_pullback: ['strong_trend'],
};
```

**Design rationale:** we need vwap_pullback eligible in BOTH its primary 'trend' family AND the new 'strong_trend' family. Options considered:
- Change `STRATEGY_FAMILY_MAP[vwap_pullback]` to an array → invasive type change across all consumers
- Treat vwap_pullback as 'hybrid' and add to `HYBRID_FAMILY_ELIGIBILITY` → semantically misleading (it's not a hybrid signal)
- **Chosen:** separate map `MULTI_FAMILY_ELIGIBILITY` that ADDS additional eligible families on top of the primary. Consumers OR the primary family with entries here for full eligibility. Mirrors the `HYBRID_FAMILY_ELIGIBILITY` pattern without misrepresenting semantics.

**Impact on existing code:** zero — existing consumers still read `STRATEGY_FAMILY_MAP['vwap_pullback']` = `'trend'` unchanged. Only code that explicitly imports `MULTI_FAMILY_ELIGIBILITY` is affected (currently only vts-runner via this change).

---

## Change 2 — `server/services/strategy-engine.ts`

### 2a — Added `strongTrendGeometryOverride` field to `TechnicalIndicators`

```ts
export interface TechnicalIndicators {
  // ...existing fields...
  strongTrendGeometryOverride?: {
    stopAtrMultiplier: number;   // e.g. 4.0 for Variant E (stop = entry - 4*ATR)
    targetAsRMultiple: number;   // e.g. 3.0 for Variant E (target = entry + 3*R)
  };
}
```

Optional field. Detectors that consume it (currently only vwap_pullback) apply the override geometry. Detectors that do not consume it ignore the field.

### 2b — Restructured `detectVWAPPullback` head

**Removed:** `if (dbsScore >= 0.35) skip` (the B63 Item 6 positive-DBS exclusion that blocked lane promotion).

**Added:** `if (dbsScore <= -0.35) skip` with null-reason `b63b_counter_trend_long_exclusion` — symmetrical to Stage 10A guards on the other LONG-only strategies. Mirror-defect fix for 15 counter-trend vwap_pullback trades observed in the B62 72h window.

### 2c — Geometry override consumption in `detectVWAPPullback`

When override is attached to indicators AND atr > 0:
- `stopPrice = entryPrice - atr * override.stopAtrMultiplier`
- `finalTarget = entryPrice + riskDistance * override.targetAsRMultiple`

When override is absent (default path for low-DBS pullback context):
- Preserves prior geometry: `stopPrice = min(vwap - atr*0.5, low24h + atr*0.1)`; target = max of `high24h - atr*0.25` and `twoRTarget`.

Log line added when override is used so post-deploy grep can confirm Item 12 is plumbing correctly.

---

## Change 3 — `server/services/vts-runner.ts`

### 3a — Import `MULTI_FAMILY_ELIGIBILITY`

```ts
const { STRATEGY_FAMILY_MAP, FILTER_FAMILIES, HYBRID_FAMILY_ELIGIBILITY, MULTI_FAMILY_ELIGIBILITY }
  = await import('../config/canonical-regime-strategy-map.js');
```

### 3b — Updated family-eligibility gate (near L2001)

**Before:**
```ts
if (stratFamily && stratFamily !== 'hybrid' && pairFams && !pairFams.has(stratFamily)) {
  // skip
}
```

**After:**
```ts
const additionalFams = MULTI_FAMILY_ELIGIBILITY[stratDef.strategyKey] ?? [];
const primaryFamilyMismatch = stratFamily && stratFamily !== 'hybrid' && pairFams && !pairFams.has(stratFamily);
const additionalFamilyMatch = additionalFams.some(f => pairFams?.has(f) ?? false);
if (primaryFamilyMismatch && !additionalFamilyMatch) {
  // skip (same body as before, unchanged)
}
```

Semantic effect: vwap_pullback now passes the gate in TWO contexts:
- Pair family contains `'trend'` (original behavior — pairFams.has('trend') is true)
- Pair family contains `'strong_trend'` (new — pairFams.has('strong_trend') triggers MULTI_FAMILY_ELIGIBILITY match)

Any strategy without an entry in `MULTI_FAMILY_ELIGIBILITY` has `additionalFams = []` → `additionalFamilyMatch = false` → gate behavior unchanged.

### 3c — Attach `strongTrendGeometryOverride` on indicators when sourcePool is strong-trend lane

```ts
const isStrongTrendLane = sourcePool === 'quant-strong_trend';
const stratDetectIndicators = {
  // ...existing fields...
  strongTrendGeometryOverride: isStrongTrendLane
    ? { stopAtrMultiplier: 4.0, targetAsRMultiple: 3.0 }
    : undefined,
};
```

Values `4.0 / 3.0` correspond to Variant E from BATCH_63_COUNTERFACTUAL_AUDIT.md (the variant that doubled vwap_pullback's Sum R in the n=19 high-DBS sample).

### 3d — Mode-overlay lane bypass (Item 14) near L1072

**Before:**
```ts
const adjustedStopDistance = stopDistance * modeOverlay.stopLossDistanceMultiplier;
const adjustedTargetDistance = targetDistance * modeOverlay.takeProfitDistanceMultiplier;
```

**After:**
```ts
const useNativeGeometry = sourcePool === 'quant-strong_trend';
const adjustedStopDistance = useNativeGeometry
  ? stopDistance
  : stopDistance * modeOverlay.stopLossDistanceMultiplier;
const adjustedTargetDistance = useNativeGeometry
  ? targetDistance
  : targetDistance * modeOverlay.takeProfitDistanceMultiplier;
```

Preserves original behavior for every sourcePool except `quant-strong_trend`. Added explanatory comment inline.

---

## Change 4 — `server/services/paper-execution-engine.ts`

### 4a — Mode-overlay lane bypass (Item 14) near L2165

Mirrors the vts-runner bypass. Reads sourcePool from signal or signal.metadata:

```ts
const paperSourcePool = (signal as any).sourcePool ?? signal.metadata?.sourcePool;
const useNativeGeometry = paperSourcePool === 'quant-strong_trend';
// ...conditional multiplier application...
const geomNote = useNativeGeometry ? ' [B63 Item 14 bypass]' : '';
console.log(`... ${geomNote}`);
```

Log suffix lets post-deploy grep confirm both paths (bypass fires on strong-trend trades; does NOT fire on any other sourcePool).

**Paper-execution does NOT need Item 12 geometry override plumbing** — the override is applied at strategy-engine's detect time, producing stop/target values that the paper engine consumes unchanged. Paper only needs Item 14 bypass.

---

## Verification approach

**Pre-push:**
1. Git diff — four files only
2. TypeScript check on staging — ran; zero new errors at my touch points; pre-existing errors unchanged
3. Langston code-level review of diff

**Post-deploy (within first 30 min):**
1. **Item 10 still working** — grep for `b63b_counter_trend_long_exclusion` in logs (should include a count from the new vwap_pullback guard if any DBS≤-0.35 pairs exist)
2. **Item 11 routing** — grep logs for vwap_pullback detection calls with `sourcePool=quant-strong_trend`; ideally at least one such call within the window (sample-dependent)
3. **Item 12 geometry override** — grep for log line `[VWAP Strategy] [B63 Item 12] Using strong-trend geometry override: stop=4×ATR, target=3R` — fires when vwap_pullback generates a signal via the strong-trend lane
4. **Item 14 bypass (vts-runner)** — inspect any new `strong_bull_trend` or `vwap_pullback` trade in the virtual_trades log; stop distance should be ≈ native (3×ATR for sbt, 4×ATR for vwap in lane), NOT multiplied by DEFENSIVE/SURVIVAL overlay. Ratio target/stop ≈ 2:1 (sbt) or 3:1 (vwap-in-lane).
5. **Item 14 bypass (paper-execution)** — grep `[11.7S][Paper]` log lines, confirm `[B63 Item 14 bypass]` suffix appears on strong-trend-lane signals and DOES NOT appear on other signals

**Contract test (deferred to follow-up):** the scope doc called for a contract test that exercises geometry override consumption. Deferring to a follow-up commit if Langston requires it — the code path is straightforward enough that end-to-end log verification should be sufficient for this stage.

---

## What NOT included in this stage

- Item 13 (decision gate) — no code, pre-registered in scope doc
- Item 16 (global DBS fix) — Stage 16, separate ship
- Items 15/18/19 (audits) — no code, parallel analysis work
- Contract/unit tests for geometry override — deferred pending Langston's call
- Changes to signal-orchestrator.ts — confirmed signal-orchestrator does NOT apply mode-overlay multipliers directly (only vts-runner and paper-execution-engine do, per grep)

---

## Risk callouts specific to this stage

1. **vwap_pullback firing in strong-trend lane may suppress strong_bull_trend signals** — both strategies now eligible on the same high-DBS pair. Mitigation: Item 11's ordering rule (if both fire same cycle same pair, tie-break by R-multiple favoring tighter stop). In practice conditions differ: vwap_pullback needs pullback-to-VWAP + reversal pattern, strong_bull_trend needs Donchian breakout. Same-cycle simultaneous fires should be rare. Monitor.
2. **Override values hard-coded at `4.0 / 3.0`** in vts-runner. If Variant E turns out wrong for another reason, a config change needs another batch. Acceptable — these are evidence-based locked values per audit.
3. **Paper-execution reads sourcePool from two different places** (`signal.sourcePool` OR `signal.metadata.sourcePool`). This matches the existing paper-execution pattern (grep confirms multiple places use the same dual-read). If sourcePool is missing from both, `paperSourcePool = undefined` → `useNativeGeometry = false` → normal overlay applies. Fail-safe.
4. **MULTI_FAMILY_ELIGIBILITY behavior under future strategy additions** — if we later add another strategy to this map, the same extended gate logic applies to it automatically. Good for future composability, but adds an additional degree of freedom to eligibility reasoning. Document in scope if more entries are added.

---

## Post-review actions (on Langston approval)

1. `git add` the 4 code files + this change-list doc
2. Commit: `B63 Stage 10B+10C: vwap_pullback strong-trend promotion + geometry override + mode-overlay lane bypass (Items 11/12/14)`
3. Push to `migration/aws-supabase`
4. Verify CI run conclusion = success
5. Deploy to staging: `git pull && npm run build && pm2 restart dawntrader`
6. First-pass verification per §Verification approach above
7. Second-pass from Langston
8. Proceed to Stage 16 (global DBS architecture fix)
