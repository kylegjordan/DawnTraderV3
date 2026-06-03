# B.4 Foundation — Code-Surface Map (Step-2 pre-audit input, current file:line)

> Read-only architectural sweep (2026-06-03) confirming + refining the W1 §3 blast-radius with current line numbers. Feeds the Step-2 pre-audit. **Central finding: regime THRESHOLDS are already per-class (edit the xStock file only), but the LOOKBACK LITERALS and the DBS config are SHARED/global and must be migrated to per-class — that is the core implementation challenge.**

## 1 — Regime lookbacks (SHARED literals)
- `server/core/metrics/market-regime.ts:108-120` — `computeMomentum` `lookback = Math.min(30, …)`. Carries the explicit **B79.0n.MCE bar-interval invariant comment (2026-05-21)**: "30 bars × 60-min = 30 hours, identical for crypto_spot and xstock_spot… If a future asset class introduces a non-60-min bar interval… this invariant breaks and per-class lookback constants must migrate to module_constants." ← THE boundary condition this sub-batch trips.
- `market-regime.ts:132-136` — `computeADX(period = 14)`, same invariant. SHARED.
- 30 bars → 7.5h at 15m; 14 bars → 3.5h at 15m. Must re-express per-class.

## 2 — xStock regime thresholds (ALREADY per-class — edit xStock file only)
- `server/asset_classes/xstock_spot/regime-thresholds.ts` — 14 xStock-specific constants: `RBS_VOL_MAX_XSTOCK=0.006`, `RBS_DX_MAX_XSTOCK=35`, `RBS_DBS_MAX_XSTOCK=0.10`, `IE_VOL_MIN_PATH_A_XSTOCK=0.010`, `IE_DX_MIN_PATH_A_XSTOCK=40`, `IE_VOL_MIN_PATH_B_XSTOCK=0.0075`, `IE_DBS_STRONG_XSTOCK=0.50`, `TFS_MOM_MIN_PATH_A_XSTOCK=0.0015`, `TFS_DX_MIN_XSTOCK=35`, `TFS_DBS_MODERATE_XSTOCK=0.30`, `HVU_VOL_MIN_XSTOCK=0.0075`, `HVU_MOM_NEG_PATH_A_XSTOCK=-0.0015`, `HVU_DX_STRONG_XSTOCK=45`, `HVU_MOM_NEG_PATH_B_XSTOCK=-0.0025`.
- Crypto parallel: `server/asset_classes/crypto_spot/regime-thresholds.ts` (e.g. `RBS_VOL_MAX=0.012`). Dispatch: `market-regime.ts:245-267` branches on `assetClass === 'xstock_spot'`. **Recalibration edits the xStock file; crypto untouched by construction.**

## 3 — Shared bar-count literals in the indicator path (the per-class-branching work)
- SMA-20: `signal-orchestrator.ts:1226`, `vts-runner.ts:145`, `routes.ts:6865/6897` — SHARED.
- ATR-14 / RSI-14: `strategy-helpers.ts:78` (`calculateRSI`/`calculateADX` defaults) — SHARED.
- VWAP 24h: `signal-orchestrator.ts:1496` `slice(-24)` — SHARED (24 bars → 6h at 15m).
- High/Low 24h: `strategy-validator.ts:191` `slice(-24)` — SHARED.
- xStock snapshot caps: `xstock-ohlc-cache.ts:83` `MAX_BARS_60M=60`, `:84` `MAX_BARS_240M=30`, `:82/:68` `NARROW_OVERLAY_HOURS_60M=24` — xStock-specific.

## 4 — DBS (SHARED global config — needs per-class)
- `server/core/metrics/directional-bias.ts:56-117` `computeDirectionalBias(ohlc, atr, config=DEFAULT_DBS_CONFIG)`.
- `server/types/directional-bias.types.ts:83-101` — `DEFAULT_DBS_CONFIG`: `lookbackPeriod:48` (:96), EMA `fast:12, slow:26` (:98-99). **Global/SHARED — no per-class override exists.** 48 bars → 12h at 15m. Called from `scanner.ts:47`; B-PHASE-A2 backfill computes DBS at 60m. ← per-class override + recompute + epoch-stamp + retain 60m `_archive`.

## 5 — Aggregator interval typing (xStock-specific)
- `server/asset_classes/xstock_spot/ohlc-aggregator.ts:62` `export type XstockAggregationInterval = 60 | 240;` → add `| 15`.
- `:83 MAX_BARS_60M=60`, `:84 MAX_BARS_240M=30`, `:116 LOOKBACK_HOURS_60M=120`, `:169` interval dispatch, `:194` bucketExpr `floor(epoch/3600)*3600` → 900 for 15m.
- Call site `scanner.ts:533` `getOHLCDataBatch(symbolList, 60)` → 15.

## 6 — ORB defect + window (CONFIRMED defect, pre-existing)
- `server/strategies/orb.ts:101-135` `computeOpeningRange(PriceData[])` — designed for 1-min candles; `:114` `endMs = startMs + openRangeMinutes*60*1000` (30-min window); `:64-71` RTH `14:30–17:00 UTC` fixed boundaries.
- Wrong feed: `signal-orchestrator.ts:1885-1890` `detectORB(symbol, ohlcAsAny, …)` where `ohlcAsAny` = `getOHLCData(symbol, 60)` at `:1477` → 60m bars, not 1-min. → repoint to fine bars + re-derive window in 15m terms + enable LAST.

## 7 — Snapshot storage tables
- `drizzle/migrations/2026-05-18-b-new-34b-xstock-60m-snapshot.sql` → `xstock_spot_ohlc_60m_snapshot (symbol, bucket_ts, o/h/l/c, volume, source_bar_count, captured_at)`. Read `xstock-ohlc-cache.ts:282-296`; write-back `:391-400` (`WRITE_BACK_RECENT_BUCKETS=24`). → add parallel `xstock_spot_ohlc_15m_snapshot`.

## 8 — Weekend off-hours controller + prewarm + 1m retention
- `server/services/session-lifecycle-controller.ts:68-70` cron `0 20 * * 5` (Fri) / `0 20 * * 0` (Sun) ET; prewarm `:123-146` via `scripts/b-new-34b-prewarm-snapshot.js` (`lookbackDays` param).
- 1m retention: `module_constants` `xstock_spot_ohlc_1m.hot_retention_days=365` (migration `2026-05-06-b75-data-lifecycle.sql:99-101`); sweep `scripts/b75-retention-sweep.ts:75`. → prewarm depth must cover the longest 15m lookback (DBS 48-bar=12h, regime/MCE) at reopen; 365d 1m retention is ample.

## 9 — Crypto isolation (confirmed)
- Thresholds branched `market-regime.ts:245-267`; ORB xStock-only guard `orb.ts:156-157`; separate scanners `xstock_spot/scanner.ts` vs `fx5-scanner.ts`. **Risk vectors = the SHARED literals (§3) + DBS global config (§4)** — those are where a careless edit leaks into crypto. Per-class branching there is the Step-4 hard-fail gate's focus.
