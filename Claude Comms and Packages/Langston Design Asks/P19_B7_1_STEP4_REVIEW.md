# P19-B7.1 — Step-4 code-review dispatch (the ranking fix)

**From:** NEW Claude (CC-B) · **Reviewer:** Langston (Step-4, diff-BEFORE-push) · **Status:** 2 local commits, NOT pushed (this gate). tsc-baseline GREEN (0 regressions), **16 new + 51 affected tests PASS**.

**INFRASTRUCTURE NOTE: DO NOT `cd /mnt/gdrive` or run git on the gdrive mount.** The full unified diff is staged at `/home/langston/inbox/P19-B7.1/P19_B7_1_STEP4_DIFF.patch` (read it directly — local FS). The load-bearing snippets are embedded below. For any repo inspection use `ssh staging`.

Diffstat: 14 files, +727/−19. Scope = `/home/langston/inbox/P19-B7.1/P19_B7_1_SCOPE.md` (already signed off). This is the AS-BUILT against that scope.

---

## What landed, per OBJ (all 5)

**OBJ-1 — pluggable ranker, default R-multiple (no hidden default).** `getRankedSignals` now reads the active ranker fail-hard from `module_constants` and sorts by a memoized per-candidate key. New fail-hard string reader added (mirrors `getCachedNumberRequired`).
```ts
// ready_to_buy_service.ts
export const RANKER_STRATEGIES = ['r_multiple', 'confidence', 'ranking_score'] as const;
function getActiveRanker(): RankerStrategy {
  return getCachedStringRequired('rtb_ranking', 'active_ranker', _RTB_GK, RANKER_STRATEGIES) as RankerStrategy;
}
// ...in getRankedSignals, after the pair-guard, BEFORE the sort:
validSignals = validSignals.filter(s => this.passesGeometryFloor(s));         // OBJ-3 reject (primary)
const ranker = getActiveRanker();
const rankKey = new Map<string, number>();
for (const s of validSignals) rankKey.set(s.signalId, this.computeRankKey(s, ranker, assetClass));
validSignals.sort((a, b) => (rankKey.get(b.signalId) ?? -Infinity) - (rankKey.get(a.signalId) ?? -Infinity)); // plain DESC, no abs/clamp
```

**OBJ-2 — surface the kernel's own R-multiple; rank-time REUSES the wrapper (your + CC-A's endorsed call).** `netRewardToRisk` is now passed through `TradeExpectancyResult` (4 touch points incl. the unclassifiable early-return literal). `evaluateTradeExpectancy` gained an optional `quiet` to suppress the per-candidate pool log. Rank-time calls the wrapper (NOT the bare kernel) — confirmed sample-free because `recordEvInputSample` lives ONLY in the open path:
```ts
// expectancy.ts — pass-through, not re-derived:
const { netEV, rawEV, pWin, pLoss, netRewardToRisk } = kernelResult;
// ...result literal gains: netRewardToRisk,
```
```ts
// ready_to_buy_service.ts — the rank-time R-multiple (mirrors the open-path tradeMeta build):
private signalRMultiple(signal: RtbSignal, assetClass?: AssetClass): number {
  const entry = parseFloat(signal.entryPrice), stop = parseFloat(signal.stopPrice);
  if (!Number.isFinite(entry) || !Number.isFinite(stop)) return -Infinity;
  // ...target default, di/dbs via Number(), assetClass resolve...
  const result = evaluateTradeExpectancy(signal.symbol, { entryPrice: entry, targetPrice: target, stopPrice: stop,
    DI: ..., VolNoise: meta.VolNoise, prices: meta.prices, sourcePool: ..., dbsScore: ... }, ac, /* quiet */ true);
  return Number.isFinite(result.netRewardToRisk) ? result.netRewardToRisk : -Infinity;
}
```
*No-double-sample test (your Step-4 anchor):* proven structurally — the unit suite asserts `recordEvInputSample` does NOT appear in `expectancy.ts` (the wrapper) and DOES in `paper-execution-engine.ts` (open path only). The empirical row-count-unchanged check runs at Step-7 on the staging diagnostics surface (evInput count stays flat across a ranking cycle).

**OBJ-3 — degenerate-geometry REJECT primary, floor secondary (capital-independent).** Reject happens before the sort; the floor is the pure exported `computeRankRiskFloor`:
```ts
export function computeRankRiskFloor(entryPrice: number, atr: number|null, minAtrFrac: number, minAbsFrac: number): number {
  const atrFloor = (atr !== null && Number.isFinite(atr) && atr > 0) ? minAtrFrac * atr : 0;
  const absFloor = minAbsFrac * entryPrice;
  return Math.max(atrFloor, absFloor);   // min-ATR-fraction PRIMARY; entry-fraction = absolute floor / ATR-missing fallback
}
```
NOTE (the one scope-text point to confirm): the sizer has NO explicit min-ATR constant (only its `stopDistance===0` zero-guard, verified), so the ranker ESTABLISHES the canonical `min_atr_fraction_floor` (DB-seeded 0.10) rather than reading one from the sizer. The reject/floor is microstructure-derived + capital-independent, DISTINCT from the OBJ-5 clamp-bind (your Q1 final). Seeded defaults are conservative degenerate-only (0.10 ATR-frac, 0.0005 entry-frac), DB-tunable for Phase-25.

**OBJ-4 — shadow capture + selection-IC harness.** 3 columns on BOTH shadow grains (`predicted_r_multiple`, `pwin_floored`, `cross_class_promotion`) threaded through the input types + both INSERTs + the capture loop. `pwin_floored` = derived from the documented xStock gap (`sourcePool==='quant-strong_trend' && dbsScoreAtQueue===null`); the raw di/dbs columns stay as the auditable backstop. `cross_class_promotion` = per-cycle (rank-0 class ≠ rank-1 class). NEW pure `core/metrics/selection-ic.ts`: per-cycle cross-sectional tie-aware Spearman → distribution of per-cycle ICs → window-CLUSTERED SE → per-regime-family → min-N gate (the Grinold formulation; GO/NO-GO runs in Phase-25).

**OBJ-5 — sizing-coherence invariant (≤R upper-bound) + clamp-bind telemetry (the wired deliverable).**
```ts
// paper-position-sizing.ts — after notional clamp + correlationScale:
const effectiveRiskFractionRatio = riskAmount > 0 ? (quantity * stopDistance) / riskAmount : 0;
if (effectiveRiskFractionRatio > 1.01) console.warn(`[OBJ-5][SIZING_INVARIANT] ... risked MORE than intended ...`);
// returned in sizingDetails.
```
The ratio absorbs BOTH the notional clamp AND `correlationScale` (your A.2b point — it never flips `wasClamped`). Recorded per SIZED signal at the open path into a new bounded rtb-metrics buffer; `getSizingClampProof()` exposes `{ totalSamples, boundCount, boundRate, meanRatio }` — the Phase-25 bind-rate input (>~15-20% → switch the honest ranker to realized-$EV; §13 home).

---

## Verification done
- `node scripts/check-tsc-baseline.mjs` — **OK, no regressions** (the one TS2353 I hit, on the diagnostics return type, is fixed).
- `vitest` new suite `p19-b7-1-ranking.test.ts` — **16/16 pass** (R-multiple identity `netRewardToRisk===netEV/distStop`; dimensionless cross-asset $0.50-vs-$200 equality; negative-EV→negative-R sign; distStop=0→0 guard; OBJ-3 floor ATR-primary + abs-fallback + reject/keep; Spearman ±1/tie/zero-var-null; computeSelectionIC min-N/degenerate/per-regime/clustered-SE; no-double-sample source proof; RANKER_STRATEGIES set).
- Affected existing suites (reorg-b4 shadow isolation, reorg-b3 ev-input, b6.5d asset-class) — **51/51 pass**, no regression.

## Open points for your verdict
1. **OBJ-3 floor-as-canonical** (since the sizer exposes no constant) — agree the ranker owning `min_atr_fraction_floor` is the right call vs forcing a sizer constant that doesn't exist?
2. **`pwin_floored` derivation** (`strong-trend && null dbs`) vs a kernel-reported flag — I chose the derivation + kept raw di/dbs as backstop (no kernel change). OK, or do you want the kernel to report it?
3. Anything in the full patch you want changed before I push. After your APPROVE: push → CI 4-green → deploy → Step-7 (incl. the empirical no-double-sample row-count check) → your Step-8. Governance docs (SysManual Ch1+Ch4, SIM, 5 §13 homes, catalog/history/plan/completion) land in the same close.
