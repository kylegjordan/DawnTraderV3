# BATCH 18 SCOPE — API Budget Optimization + FX5 300 Pairs

## Summary
Increase FX5 scanner from 100 to 300 pairs per scan cycle, enabled by two API optimization changes that **reduce** total system API load despite the 3x pair increase. Also fixes a missing `filterTier` field in closed trades export.

## Background
Kyle requested increasing FX5 scanner pair count from 100 to 300. Pre-implementation API audit revealed:
- Current system makes ~18,200 Kraken API calls/hour (100 pairs)
- Naive 300-pair increase would push to ~44,700 calls/hour (2.5x)
- Two optimizations (OHLC cache + orchestrator priceCache migration) reduce the 300-pair total to **~7,520 calls/hour** — LESS than current 100-pair load

## Items (4)

### Item A — filterTier Missing from export-csv.ts (1-line fix)
**Problem**: `getClosedVTSTradesFromLogs()` return type declares `filterTier: string | null` but the actual push object omits the field. Closed trades never show filterTier even when the JSON data contains it.
**Fix**: Add `filterTier: trade.filterTier || null` to the push object after `globalDirectionalBias`.
**File**: `server/utils/export-csv.ts`
**Risk**: LOW

### Item B — BATCH_SIZE 100→300 (1-line config change)
**Change**: `SCANNER_PARAMS.BATCH_SIZE` from 100 to 300 in system-guards.ts.
**Impact**: FX5 scanner evaluates 300 pairs per 30-second cycle instead of 100. The single Kraken ticker API call already returns all tradable pairs, so scanner API calls don't increase. More pairs pass IMF filters → larger active pool for orchestrator and VTS pool for learning.
**File**: `server/config/system-guards.ts`
**Risk**: LOW (API impact mitigated by Items C and D)

### Item C — OHLC Data Cache (new utility)
**Problem**: Both VTS runner and signal orchestrator fetch 60-minute OHLC candles for every symbol every 30-60 seconds. But 60-minute candles only change once per hour when a new candle closes — fetching the same data 60x per hour is wasteful. This is the system's dominant API cost (6,000+ calls/hour from VTS alone at 100 pairs).
**Solution**: New `ohlc-cache.ts` service with 5-minute TTL. Both VTS runner and orchestrator call the cache instead of Kraken directly. Cache miss → fresh API call → cached for 5 minutes. Cache hit → return data, 0 API calls.
**Math**: 300 pairs × 12 fetches/hr (one per 5 min) = 3,600/hr instead of 300 × 60 = 18,000/hr.
**Files**:
- `server/services/ohlc-cache.ts` (NEW)
- `server/services/vts-runner.ts` (redirect fetchOHLCForPair + BTC OHLC to cache)
- `server/services/signal-orchestrator.ts` (redirect evaluateSymbol OHLC to cache)
**Risk**: LOW-MEDIUM (new utility, but minimal blast radius — consumers call the same API signature)

### Item D — Orchestrator: Replace per-symbol getTicker with priceCache (20-line change)
**Problem**: The signal orchestrator calls `this.kraken.getTicker(symbol)` individually for every eligible symbol in every 30-second cycle. This duplicates data already available in `priceCache`, which the FX5 scanner refreshes every 30 seconds for all active pool symbols. The VTS runner already uses priceCache correctly — the orchestrator was never migrated.
**Solution**: Replace `this.kraken.getTicker(symbol)` at line 810 with `priceCache.getCachedPrice(symbol)`. The data (price from `c[0]`, volume from `v[1]`) is identical. If cache miss occurs, the existing `rawPrice === 0` guard at line 814 handles it safely.
**Math**: Eliminates ~4,800 redundant API calls/hour (current) or ~12,000/hour (at 300 pairs).
**Files**: `server/services/signal-orchestrator.ts`
**Risk**: LOW (priceCache data is ≤30 seconds stale, negligible vs 60-minute candle timeframe)

## Files Modified (4) + Files Created (1)

| File | Change | Item |
|------|--------|------|
| `server/utils/export-csv.ts` | Add filterTier to push object | A |
| `server/config/system-guards.ts` | BATCH_SIZE 100→300 | B |
| `server/services/ohlc-cache.ts` | **NEW** — OHLC data cache with 5-min TTL | C |
| `server/services/vts-runner.ts` | Redirect OHLC fetches to ohlc-cache | C |
| `server/services/signal-orchestrator.ts` | Redirect OHLC to cache + ticker to priceCache | C, D |

## API Budget Impact

| Metric | Current (100 pairs) | After Batch 18 (300 pairs) |
|--------|--------------------|----|
| VTS OHLC calls/hr | 6,000 | 3,600 (cached) |
| VTS BTC OHLC calls/hr | 60 | 12 (cached) |
| Orchestrator OHLC calls/hr | 4,800 | 1,200 (cached) |
| Orchestrator Ticker calls/hr | 4,800 | 0 (priceCache) |
| FX5 scanner calls/hr | 240 | 240 (unchanged) |
| PriceCache refresh/hr | 2,100 | 2,280 (slightly more symbols) |
| Other (on-demand, etc.) | 200 | 200 |
| **TOTAL** | **~18,200** | **~7,520** |

Net result: **58% reduction** in total API calls despite 3x more pairs scanned.

## Test Impact
No test changes expected. Existing test baseline: 784 pass / 83 fail (867 total after dss.test.ts removal in Batch 17).

## Incidental Finding
Line 1029 of signal-orchestrator.ts references `this.krakenService` but the property is declared as `this.kraken` (line 128). This is in the cascadingScan path (multi-timeframe scanner) which is not currently active. NOT fixing in this batch — will be addressed in Phase 14.5 when the cascade path is activated.

## Batch Type
Code batch (governance batch 18B follows after verification)
