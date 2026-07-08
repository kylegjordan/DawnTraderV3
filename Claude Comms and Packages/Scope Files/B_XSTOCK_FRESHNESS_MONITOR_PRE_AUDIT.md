# B-XSTOCK-FRESHNESS-MONITOR — Pre-Audit (Step-2)

change-class: non_architecture
**Owner:** CC-A · **Reviewer:** Langston · **Date:** 2026-07-08 · **#441**
**Scope:** `B_XSTOCK_FRESHNESS_MONITOR_SCOPE.md` (Step-1 APPROVED — table + range-compression + alert-framing-lock folded in).

## Components touched (SIM consult)
- **`xstock_spot_ticker_snap` (READ only):** the quote-capture stream. Per-symbol consecutive-`captured_at` gaps vs the 15 s fill-freshness gate = the OBJ-1 exposure metric. Partitioning (Wave D daily) is transparent to a `captured_at`-range query. No write.
- **`xstock_spot_ohlc_1m` (READ only):** the 1-min decision bars (Kraken `ohlc` WS channel — **throttle-INDEPENDENT**, confirmed Wave D: held ~400/min through the 8000 window). Columns confirmed: `interval_begin, open, high, low, close, volume, vwap, trade_count`. `trade_count` = ticks-per-bar; `high-low` = intrabar range. The OBJ-2 range-compression check compares these pre-vs-post-Wave-D — since the bars are NOT throttle-controlled, the expected result is NO compression, and the check EMPIRICALLY CONFIRMS the capture cut didn't leak into the ATR/volatility-regime inputs (a reassurance for Kyle; a positive result would be a red flag). *Note: verify at build whether ATR/volatility-regime reads these Kraken-fed bars (throttle-independent) vs any ticker-derived range — if the latter existed it would be the real compression risk; the `ohlc-aggregator.ts` decision bars roll up from `xstock_spot_ohlc_1m`, so the decision path is Kraken-fed.*
- **Freshness gate constant:** `xstock_fill_safety.active_fill_max_age_ms` / `fill_depth_gate.warmth_max_age_ms` (xstock_spot = 15 s). READ for the threshold (don't hard-code 15000 — resolve from `module_constants` so the report tracks the live gate).
- **20-min depth-median consumer (scanner B.1.5):** the granularity-sensitive reader. OBJ-2 checks per-symbol sample count in a 20-min window stays above a safe floor at 4000 (≈ 20min ÷ ~5s ≈ 240 samples nominal; flag < ~30).
- **`module_constants` (READ):** the `xstock_freshness_monitor.enabled` flag (fail-LOUD on unreadable per Q2) + the freshness-gate value.
- **`system-alerts` (`addAlert`, §10.5) (WRITE an alert):** delivery. Category `verification`/report, severity `info`, body = plain-language summary WITH the framing lock ("could-have-been-blocked, not actual loss until active trading is live"). Auto-posts to Discord via the alerts webhook + surfaces to a CC.
- **NEW `xstock_freshness_report` table (WRITE):** the durable week-over-week trend SSOT (Q3). Written/read ONLY by this job — observability-scope, no live-pipeline coupling. SIM observability-component entry (NOT System Manual, per Q4).

## New table design (`xstock_freshness_report`)
One row per weekly run: `id`, `run_at timestamptz`, `window_start/window_end`, `throttle_ms` (the live cadence at run time), `total_breach_moments int`, `throttle_caused_symbols int`, `native_slow_symbols int`, `worst jsonb` (top-N names + their breach counts), `depth_sample_min int`, `ohlc_coverage_pct numeric`, `range_compression_flag bool` + `range_detail jsonb`, `notes text`. Trend = `ORDER BY run_at`.

## Blast radius
ZERO live-pipeline impact: a read-only weekly batch (cron, off-hours) + one new self-owned table + one alert row. No engine/strategy/regime/filter/signal-pipeline/schema-of-a-live-table change. Fail-loud on the flag; a crash fires a §10.5 alert (never silent). Idempotent-ish (one row per run; safe to re-run).

## Build plan
1. Migration: `CREATE TABLE xstock_freshness_report …` + seed `module_constants` `xstock_freshness_monitor.enabled=true`.
2. `server/scripts/b-xstock-freshness-monitor.ts`: the weekly analysis (exposure split throttle-caused vs native-slow; depth-sample floor; OHLC coverage; range/trade_count pre-vs-post) → write table row + dated `/var/log/dawntrader/` report → `addAlert` plain-language summary (framing-locked). Fail-loud on unreadable flag. `import 'dotenv/config'` FIRST (the #438 lesson).
3. Cron: `0 6 * * 0` (Sunday 06:00 UTC) root crontab.
4. Verify on staging over real 7-day data; CI green; governance (SIM observability entry + completion + #441 + BATCH_CATALOG).

## Step-2 questions for Langston
1. Table shape above OK, or want a per-symbol detail table too (vs the `worst jsonb` rollup)? I lean rollup-in-one-row for v1 (trend is the deliverable; per-symbol detail lives in the dated file).
2. Depth-sample floor: flag < ~30 samples/20-min-window? (nominal ~240 at 4000.)
3. Range-compression: compare the throttled-10's `trade_count` + `(high-low)/open` distribution in a post-Wave-D week vs a pre-Wave-D week (before 2026-07-08). Median + p10 shift as the flag trigger. Agree on the metric?
