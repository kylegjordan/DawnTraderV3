# Batch 19G HF2: Fix Pattern Filter DB Field Mapping

## Summary

The pattern global filter path in BOTH active trading AND VTS only mapped 3 fields from the DB row (volume, spread, history). All other DB fields (minPrice, maxPrice, excludeStablecoins, minLiquidity, minMarketCap) fell back to the quant path's values. This meant changing pattern filter values in the DB had no effect for those fields.

This hotfix maps ALL DB fields for the pattern filter in fx5-scanner.ts, and updates market-scanner.ts to use pattern-specific values (instead of quant fallbacks) for stablecoin exclusion, minPrice, and maxPrice filtering.

## Modified Files

1. `server/services/fx5-scanner.ts` — Map all DB fields when building `activePatternGlobalFilters`
2. `server/services/market-scanner.ts` — Use pattern-specific values in pattern filter section; expand `patternFilters` type

## File Placement

Copy files from this package into the repo, preserving directory structure:

```
server/services/fx5-scanner.ts    → server/services/fx5-scanner.ts
server/services/market-scanner.ts → server/services/market-scanner.ts
```

## Commit Message

```
Batch 19G HF2: Fix pattern filter DB field mapping — all fields now load from DB for both active and VTS paths
```

## Push Command

```bash
bash REPLIT_PUSH_SCRIPT.sh "Batch 19G HF2: Fix pattern filter DB field mapping — all fields now load from DB for both active and VTS paths"
```

## Verification

After restart, check Replit diagnostic logs. The pattern global filter log line should now show all fields:

```
[19G][FX5] Pattern global filters from DB (vts_pattern): { MIN_VOLUME_USD: ..., MAX_BID_ASK_SPREAD: ..., MIN_HISTORY_DAYS: ..., MIN_PRICE: ..., MAX_PRICE: ..., EXCLUDE_STABLECOINS: ..., MIN_LIQUIDITY: ..., MIN_MARKET_CAP: ... }
```

If the VTS pattern DB row has `minPrice = 0.05`, the log should show `MIN_PRICE: 0.05` (not the quant default of `0.25`).

Also check `[DIAG_PATTERN] THRESHOLDS:` log line — it should now show `minPrice`, `maxPrice`, and `excludeStablecoins` values from the pattern filter row rather than quant defaults.
