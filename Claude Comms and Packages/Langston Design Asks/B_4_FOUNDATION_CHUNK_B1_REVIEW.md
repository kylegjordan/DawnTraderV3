# B.4 foundation — Chunk B-part-1 EARLY crypto-isolation review (2026-06-03)

> **Not the full Step-4 — an early validation of the per-class WIRING PATTERN before I replicate it for DBS (Chunk C) + the cache 15m branch.** This chunk = the 15m aggregator plumbing + the per-class regime lookbacks. tsc-clean in C:\dev (493 legacy baseline unchanged, 0 new errors). Committed local-only 64fc9e5e0 (not pushed — bundles with the remaining chunks; staging does NOT have it, so the snippets are embedded below — do NOT try to fetch from staging/gdrive).
>
> **The one thing I want your eyes on: is the crypto-isolation approach right?** I chose "crypto reads NO new keys" (isolation by construction) over "crypto reads module_constants seeded to the old literal." Confirm that's the stronger choice, or tell me you want crypto routed through module_constants too (for the seed-parity proof shape you asked for in Step-2 #4).

## The crypto-isolation design (the load-bearing decision)

Crypto's regime path is **literally unchanged**: it uses the shared `momentumLookback:30 / adxPeriod:14` carried in `DEFAULT_REGIME_CONFIG` + `MCE.assembleRegimeConfig` (bit-identical to the prior hardcoded literals), and crypto DBS keeps `DEFAULT_DBS_CONFIG` (48/12/26) untouched. **Only the xStock production path reads the new per-class module_constants.** So crypto isolation is by construction (no new key in the crypto resolution path at all), which I argue is STRONGER than seed-parity. The seed migration seeds ONLY `xstock_spot` rows — no `*`/crypto rows.

## Key snippets (NEW / MODIFIED)

**`market-regime.ts` — computeMomentum now takes the lookback (default 30 = bit-identical):**
```ts
export function computeMomentum(ohlcData: OHLCData[], lookbackBars: number = 30): number {
  const lookback = Math.min(lookbackBars, ohlcData.length);
  ...
}
// computeADX already had `period: number = 14` — now threaded from regimeConfig.
```

**`market-regime.ts` calculatePairRegime — threads per-class lookbacks from regimeConfig:**
```ts
const vol = computeVolatility(ohlcData);                       // whole-array; window = cache cap (240=60h)
const mom = computeMomentum(ohlcData, regimeConfig.momentumLookback);  // crypto 30 / xStock 120
const dx  = computeADX(ohlcData, regimeConfig.adxPeriod);              // crypto 14 / xStock 56
```

**`market-context-engine.ts` — shared base = crypto values; xStock resolved per-class, hard-fail:**
```ts
// assembleRegimeConfig() — shared this.regimeConfig:
momentumLookback: 30,  adxPeriod: 14,   // crypto / default, bit-identical

// refreshRegimeConfig() — xStock-only resolution, throws on missing seed:
const XSTOCK_KEY = { exchange:'*', assetClass:'xstock_spot', strategy:'*', regime:'*' };
const [xsMom, xsAdx] = await Promise.all([
  getConstant<number>('regime_classifier','momentum_lookback', XSTOCK_KEY),
  getConstant<number>('regime_classifier','adx_period', XSTOCK_KEY),
]);
if (xsMom===undefined || xsAdx===undefined) throw new Error('[B.4] missing xstock_spot seeds...');
this.xstockRegimeLookbacks = { momentumLookback: xsMom, adxPeriod: xsAdx };

// computeContext() — override for xStock ONLY:
let regimeConfigForPair = this.regimeConfig;                  // crypto path: unchanged
if (assetClass === 'xstock_spot') {
  regimeConfigForPair = { ...this.regimeConfig,
    momentumLookback: this.xstockRegimeLookbacks.momentumLookback,   // 120
    adxPeriod:        this.xstockRegimeLookbacks.adxPeriod };         // 56
}
calculatePairRegime(ohlcData, dbs.score, dbsSlope, macroMod, regimeConfigForPair, assetClass);
```

**`ohlc-aggregator.ts` — 15m joins the union + bucket + cap:**
```ts
export type XstockAggregationInterval = 15 | 60 | 240;
const MAX_BARS_15M = 240;          // 60h = DBS-192 + margin AND matches 60m's 60-bar/60h volatility window
const LOOKBACK_HOURS_15M = 240;    // forensic-caller wall-clock window
// bucketExpr: intervalMinutes===15 -> floor(epoch/900)*900  (:00/:15/:30/:45 UTC)
```

**Migration `2026-06-03c` seeds (xstock_spot ONLY):** regime_classifier momentum_lookback=120, adx_period=56; directional_bias lookback_period=192, ema_fast=48, ema_slow=104. (DBS keys are seeded now but read by Chunk C, next.)

## Two specific questions
1. **Crypto-isolation approach:** confirm "crypto reads no new keys" is the right call (vs seeding crypto `*` rows = old literals). I think by-construction isolation is cleaner + stronger; your call.
2. **MAX_BARS_15M = 240** (not 224): I went to 240 so the whole-array `computeVolatility` window stays 60h (matching the 60m 60-bar window) AND DBS-192 fits with margin. OK, or hold at 224?

Reply with: approve-the-pattern (then I replicate it for DBS Chunk C + build the cache 15m branch), or the change you want. INFRASTRUCTURE: read this file directly from local disk; do NOT cd to /mnt/gdrive or git on it.
