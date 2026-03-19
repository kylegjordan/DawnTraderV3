# Batch 19F HF3 — Pattern-Only OHLC Pre-Fetch Fix

## Root Cause
Pattern-only pairs (passed pattern global filter, failed quant global filter) had no OHLC data pre-fetched. The OHLC pre-fetch at lines 459-484 only iterates over `survivors` (quant global survivors). Without OHLC data, pattern-only pairs get DI=0 (empty array default), which is below the pattern IMF threshold of DI ≥ 30. Result: ALL pattern-only pairs rejected at IMF stage.

## Fix
Added OHLC pre-fetch for pattern global survivors that aren't already in the ohlcDataMap. Inserted after the existing quant OHLC pre-fetch, before `classifiedSurvivors` computation. Pattern-only pairs now get proper OHLC candle data for VN, DI, and LQ computation.

## Files Modified (1)

### server/services/fx5-scanner.ts
- Added pattern-only OHLC pre-fetch block after line 485
- Filters to only fetch for pairs NOT already in ohlcDataMap (avoids duplicate fetches)
- Same OHLC processing logic as quant path (close prices + avg volume USD)
- Diagnostic logging: `[19F][PATTERN_OHLC]` for pre-fetch counts

## Commit Message
```
Batch 19F HF3: Pre-fetch OHLC data for pattern-only pairs — fixes DI=0 rejection
```

## Verification
After deployment, check:
1. Server logs for `[19F][PATTERN_OHLC] Pre-fetched OHLC for X/Y pattern-only pairs`
2. Guardrails Screeners tab: pattern count should be > 0
3. Machine Learning page: should see PATTERN sourcePool trades within minutes

## Push Command
```
cd /home/runner/DawnTraderV3 && git add -A && git commit -m "Batch 19F HF3: Pre-fetch OHLC data for pattern-only pairs — fixes DI=0 rejection" && git push origin dawntrader-v4
```
