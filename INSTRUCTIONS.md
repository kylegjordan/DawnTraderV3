# Batch 19G: DB-Driven Filter Architecture

## Summary
Moves all filter thresholds from hardcoded constants to the `screener_filters` database table.
Each mode (paper/live) now has 4 filter path rows: `active_quant`, `active_pattern`, `vts_quant`, `vts_pattern`.
Also integrates the hybrid confluence buffer into the VTS runner and expands the 4-column UI table.

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `shared/schema.ts` | MODIFY | Add `filterPath`, `lqMin`, `vnMax`, `corrMax`, `diMin` columns; change unique index |
| `server/storage.ts` | MODIFY | `getScreenerFilters` and `upsertScreenerFilters` now accept `filterPath` parameter |
| `server/routes.ts` | MODIFY | `GET/PUT /api/filters-v2` accept `filterPath` param; add IMF fields to response |
| `server/routes/vts.ts` | MODIFY | `/api/vts/imf-status` reads all 4 DB rows instead of hardcoded constants |
| `server/services/fx5-scanner.ts` | MODIFY | Load filter thresholds from DB; remove static constant imports |
| `server/services/market-scanner.ts` | NO CHANGE | Interface already compatible with DB-mapped values |
| `server/config/system-guards.ts` | MODIFY | Mark filter constants as `@deprecated`; update version to `Phase14_Batch19G` |
| `server/config/pattern-global-filters.ts` | DELETE | All values now in DB |
| `server/config/pattern-filter-profile.ts` | MODIFY | Mark `PATTERN_POOL_THRESHOLDS` as `@deprecated`; keep regime overrides |
| `server/config/hybrid-compatibility-registry.ts` | CREATE | Shared hybrid compatibility map + `findHybridMatch` (Fix 5 per Langston review) |
| `server/services/signal-orchestrator.ts` | MODIFY | Import from shared hybrid-compatibility-registry; remove local HYBRID_COMPATIBILITY + findHybridMatch |
| `server/services/vts-runner.ts` | MODIFY | Integrate hybrid confluence buffer; import from shared registry instead of local VTS_HYBRID_COMPATIBILITY |
| `client/src/components/goals/filters-with-override.tsx` | MODIFY | Expand FilterColumnData interface + FilterColumn component with all DB fields |

## DB Migration Commands

Run these SQL commands **in order** on the Replit PostgreSQL database.

### Step 1: Add new columns

```sql
-- Batch 19G: Add filter path discriminator
ALTER TABLE screener_filters ADD COLUMN filter_path VARCHAR(20) NOT NULL DEFAULT 'active_quant';

-- Batch 19G: Add IMF threshold columns
ALTER TABLE screener_filters ADD COLUMN lq_min DECIMAL(5,2) DEFAULT 35.00;
ALTER TABLE screener_filters ADD COLUMN vn_max DECIMAL(5,4) DEFAULT 0.9300;
ALTER TABLE screener_filters ADD COLUMN corr_max DECIMAL(5,4) DEFAULT 0.9200;
ALTER TABLE screener_filters ADD COLUMN di_min DECIMAL(5,2) DEFAULT 55.00;
```

### Step 2: Drop old unique index, create new composite index

```sql
-- Drop old mode-only unique index
DROP INDEX IF EXISTS screener_filters_mode_idx;

-- Create new composite unique index on (mode, filter_path)
CREATE UNIQUE INDEX screener_filters_mode_path_idx ON screener_filters (mode, filter_path);
```

### Step 3: Update existing rows to active_quant (should already be default)

```sql
-- Ensure existing paper row is tagged as active_quant
UPDATE screener_filters SET filter_path = 'active_quant' WHERE mode = 'paper' AND (filter_path IS NULL OR filter_path = '');

-- Fix per Langston review: Ensure existing live row is also tagged as active_quant
UPDATE screener_filters SET filter_path = 'active_quant' WHERE mode = 'live' AND (filter_path IS NULL OR filter_path = '');
```

### Step 4: Insert seed rows for all 4 filter paths (paper mode)

```sql
-- Active Quant (paper) — update existing row with correct IMF values
UPDATE screener_filters
SET lq_min = 35.00, vn_max = 0.9300, corr_max = 0.9200, di_min = 55.00,
    min_volume = 500000.00, min_liquidity = 500000.00, min_price = 0.25000000,
    max_price = 100000.00, max_bid_ask_spread = 0.50, min_market_cap = 250000000.00,
    exclude_stablecoins = true, min_history_days = 30,
    active_timeframes = '["5m","15m","1h"]'::jsonb
WHERE mode = 'paper' AND filter_path = 'active_quant';

-- Active Pattern (paper)
INSERT INTO screener_filters (
  mode, filter_path, min_volume, min_liquidity, min_price, max_price,
  max_bid_ask_spread, min_market_cap, exclude_stablecoins, min_history_days,
  active_timeframes, universe_size, confidence_threshold, final_score_min,
  regime_weight_min, lq_min, vn_max, corr_max, di_min,
  managed_by_lottie, manual_override_enabled, quote_currencies, allow_regulated_only
) VALUES (
  'paper', 'active_pattern', 250000.00, 250000.00, 0.25000000, 100000.00,
  1.00, 100000000.00, true, 14,
  '["5m","15m","1h"]'::jsonb, 100, 60, 0.3500,
  0.3000, 20.00, 0.9800, 0.9500, 30.00,
  false, true, '["USD"]'::jsonb, false
);

-- VTS Quant (paper)
INSERT INTO screener_filters (
  mode, filter_path, min_volume, min_liquidity, min_price, max_price,
  max_bid_ask_spread, min_market_cap, exclude_stablecoins, min_history_days,
  active_timeframes, universe_size, confidence_threshold, final_score_min,
  regime_weight_min, lq_min, vn_max, corr_max, di_min,
  managed_by_lottie, manual_override_enabled, quote_currencies, allow_regulated_only
) VALUES (
  'paper', 'vts_quant', 300000.00, 250000.00, 0.05000000, 100000.00,
  0.75, 100000000.00, true, 21,
  '["5m","15m","1h"]'::jsonb, 100, 60, 0.3500,
  0.3000, 25.00, 0.9800, 0.9500, 35.00,
  false, true, '["USD"]'::jsonb, false
);

-- VTS Pattern (paper)
INSERT INTO screener_filters (
  mode, filter_path, min_volume, min_liquidity, min_price, max_price,
  max_bid_ask_spread, min_market_cap, exclude_stablecoins, min_history_days,
  active_timeframes, universe_size, confidence_threshold, final_score_min,
  regime_weight_min, lq_min, vn_max, corr_max, di_min,
  managed_by_lottie, manual_override_enabled, quote_currencies, allow_regulated_only
) VALUES (
  'paper', 'vts_pattern', 150000.00, 150000.00, 0.05000000, 100000.00,
  1.50, 50000000.00, true, 14,
  '["5m","15m","1h","4h"]'::jsonb, 100, 60, 0.3500,
  0.3000, 18.00, 0.9900, 0.9700, 20.00,
  false, true, '["USD"]'::jsonb, false
);
```

### Step 5: Insert seed rows for all 4 filter paths (live mode)

Fix per Langston review: live mode must also have all 4 filter path rows, with identical thresholds to paper.

```sql
-- Active Quant (live) — update existing row with correct IMF values
UPDATE screener_filters
SET lq_min = 35.00, vn_max = 0.9300, corr_max = 0.9200, di_min = 55.00,
    min_volume = 500000.00, min_liquidity = 500000.00, min_price = 0.25000000,
    max_price = 100000.00, max_bid_ask_spread = 0.50, min_market_cap = 250000000.00,
    exclude_stablecoins = true, min_history_days = 30,
    active_timeframes = '["5m","15m","1h"]'::jsonb
WHERE mode = 'live' AND filter_path = 'active_quant';

-- Active Pattern (live)
INSERT INTO screener_filters (
  mode, filter_path, min_volume, min_liquidity, min_price, max_price,
  max_bid_ask_spread, min_market_cap, exclude_stablecoins, min_history_days,
  active_timeframes, universe_size, confidence_threshold, final_score_min,
  regime_weight_min, lq_min, vn_max, corr_max, di_min,
  managed_by_lottie, manual_override_enabled, quote_currencies, allow_regulated_only
) VALUES (
  'live', 'active_pattern', 250000.00, 250000.00, 0.25000000, 100000.00,
  1.00, 100000000.00, true, 14,
  '["5m","15m","1h"]'::jsonb, 100, 60, 0.3500,
  0.3000, 20.00, 0.9800, 0.9500, 30.00,
  false, true, '["USD"]'::jsonb, false
);

-- VTS Quant (live)
INSERT INTO screener_filters (
  mode, filter_path, min_volume, min_liquidity, min_price, max_price,
  max_bid_ask_spread, min_market_cap, exclude_stablecoins, min_history_days,
  active_timeframes, universe_size, confidence_threshold, final_score_min,
  regime_weight_min, lq_min, vn_max, corr_max, di_min,
  managed_by_lottie, manual_override_enabled, quote_currencies, allow_regulated_only
) VALUES (
  'live', 'vts_quant', 300000.00, 250000.00, 0.05000000, 100000.00,
  0.75, 100000000.00, true, 21,
  '["5m","15m","1h"]'::jsonb, 100, 60, 0.3500,
  0.3000, 25.00, 0.9800, 0.9500, 35.00,
  false, true, '["USD"]'::jsonb, false
);

-- VTS Pattern (live)
INSERT INTO screener_filters (
  mode, filter_path, min_volume, min_liquidity, min_price, max_price,
  max_bid_ask_spread, min_market_cap, exclude_stablecoins, min_history_days,
  active_timeframes, universe_size, confidence_threshold, final_score_min,
  regime_weight_min, lq_min, vn_max, corr_max, di_min,
  managed_by_lottie, manual_override_enabled, quote_currencies, allow_regulated_only
) VALUES (
  'live', 'vts_pattern', 150000.00, 150000.00, 0.05000000, 100000.00,
  1.50, 50000000.00, true, 14,
  '["5m","15m","1h","4h"]'::jsonb, 100, 60, 0.3500,
  0.3000, 18.00, 0.9900, 0.9700, 20.00,
  false, true, '["USD"]'::jsonb, false
);
```

### Step 6: Verify seed data

```sql
SELECT mode, filter_path, min_volume, min_price, lq_min, vn_max, corr_max, di_min, max_bid_ask_spread, min_history_days
FROM screener_filters
ORDER BY mode, filter_path;
```

Expected output: 8 rows total — 4 per mode (active_pattern, active_quant, vts_pattern, vts_quant) with distinct threshold values. Paper and live rows should have identical thresholds.

## Design Notes

### minPrice Values Are Intentional (Kyle-Approved)

The minPrice seed values differ between active and VTS paths by design:
- **Active Quant: $0.25** — Kyle's original floor, consensus to keep for active trading.
- **Active Pattern: $0.25** — Same floor for active trading paths.
- **VTS Quant: $0.05** — Kyle approved testing $0.05 in VTS to observe micro-cap behavior in virtual trades.
- **VTS Pattern: $0.05** — Same lower floor for VTS exploration.

This is not a bug. The lower VTS floor allows passive learning to gather data on cheaper assets without risking real capital.

### Regime Overrides Are Intentional Hybrid Architecture

Pattern IMF thresholds use a **HYBRID architecture**: DB values serve as defaults, but regime-aware overrides from `pattern-filter-profile.ts` `REGIME_PATTERN_THRESHOLDS` take precedence when MCE has regime data. This is intentional — moving 5 regimes x 6 fields to per-regime DB rows is deferred to Phase 2. The current architecture is: **DB-driven base + code-driven regime overrides**.

The flow is:
1. FX5 loads base pattern thresholds from the DB (`active_pattern` or `vts_pattern` row).
2. If MCE provides a regime for the pair, `getPatternPoolThresholds(regime)` from `pattern-filter-profile.ts` returns regime-specific overrides.
3. Regime overrides take precedence over DB defaults — this is the correct behavior.
4. If no regime data is available, DB defaults are used as-is.

## Commit Message

```
Batch 19G: DB-driven filter architecture — 4-path filter profiles, VTS hybrid confluence, system-guards cleanup
```

## Push Command (Replit)

```bash
cd /home/runner/DawnTraderV3
git pull origin dawntrader-v4
# Apply all file changes from the staged zip
git add -A
git commit -m "Batch 19G: DB-driven filter architecture — 4-path filter profiles, VTS hybrid confluence, system-guards cleanup"
git push origin dawntrader-v4
```

## Post-Deployment Verification Checklist

1. [ ] Run SQL migration commands (Steps 1-4) in Replit PostgreSQL
2. [ ] Verify seed data (Step 6) — 4 rows per mode (8 total) with correct values
3. [ ] Delete `server/config/pattern-global-filters.ts`
4. [ ] Build succeeds (`npm run build`)
5. [ ] Server starts without errors
6. [ ] `GET /api/vts/imf-status` returns all 4 columns with DB values (schema `vts-imf-status/v3.0`)
7. [ ] `GET /api/filters-v2?mode=paper` returns `active_quant` row by default
8. [ ] `GET /api/filters-v2?mode=paper&filterPath=active_pattern` returns pattern row
9. [ ] `PUT /api/filters-v2?mode=paper` with `filterPath=vts_quant` updates the correct row
10. [ ] Guardrails & Filters page shows expanded 4-column table with all fields (Global + IMF sections)
11. [ ] FX5 scanner log shows `[19G][FX5] Pattern global filters from DB` at cycle start
12. [ ] VTS runner log shows `[19G][VTS_HYBRID]` when confluence is detected
13. [ ] No references to `pattern-global-filters.js` in server logs (import removed)
14. [ ] `getSystemGuardsInfo()` log line shows `[19G][CONFIG]` with `(legacy)` markers

## Deprecated Constants (to remove in future batch)

These constants remain in code with `@deprecated` tags for backward compatibility:
- `SYSTEM_GUARDS.MIN_LIQUIDITY_SCORE` — used by signal-orchestrator, analysis-utils
- `SYSTEM_GUARDS.MAX_VOL_NOISE` — used by signal-orchestrator
- `SYSTEM_GUARDS.CORRELATION_THRESHOLD` — used by signal-orchestrator
- `SYSTEM_GUARDS.MIN_VOLUME_THRESHOLD_USD` — unused but kept for safety
- `IMF_THRESHOLDS` — used by imf-metrics.ts
- `VTS_IMF_THRESHOLDS` — no longer used after this batch (can be removed immediately)
- `PATTERN_POOL_THRESHOLDS` — used as fallback by `getPatternPoolThresholds()`

These will be cleaned up when signal-orchestrator and imf-metrics.ts are updated to accept DB values.
