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

## ★★ OBJ-1 REFRAMED — honest freshness SLI + regression detector (crew-locked 2026-07-08, Langston + CC-B)
**The throttle-caused-vs-native-slow SPLIT is RETIRED — it is a CATEGORY ERROR for a steady-state monitor.** It was a one-time causal estimate that required the pre/post A/B counterfactual, which no longer exists. Ground truth proved it: `xstock_spot_ticker_snap.metadata = {"schema_version":1}` (ingest-`captured_at` only, NO venue quote-ts) ⇒ per-fetch attribution is UNDEFINED; a heuristic re-derivation over a fixed-throttle window returned 474 vs a ~10 ground truth (a lying metric). Killed.

**OBJ-1 is now a freshness SLI + regression detector:**
- **Metrics (per symbol, over the analysis window):** median inter-capture gap, p95 gap, RTH breach-rate (count + fraction of gaps ≥ the live freshness gate). Universe-level median/p95 too.
- **Window PINNED to post-2026-07-08-cutover ONLY** (throttle=4000). No 1000ms regime — mixing regimes is the self-inflicted confound that produced 474.
- **The throttle's OWN contribution = a COMPUTED, deterministic floor, not a measured value.** EXACT arithmetic (Langston — load-bearing, state precisely): a single 4000 ms interval caps single-poll staleness at 4 s; successive-gap = (missed+1)×4000 ms → 0 missed = 4 s, 1 = 8 s, 2 = 12 s, **3 missed = 16 s (first to cross 15 s)**. So a ≥15 s breach requires **≥3 consecutive missed polls** — structurally impossible for one interval to self-inflict. **Therefore, by construction, EVERY ≥15 s breach is feed / native-thin / #439-stall, NEVER the throttle.** That deterministic one-liner is the honest replacement for the split. (The 4 s floor lives inside median/p95 as a constant offset — cancels in the WoW delta; don't let the absolute SLI be read as all-native staleness.)
- **Regression = the alerting signal, with guard bands (Langston):** WoW trend/delta on median/p95/breach-rate + the ABSOLUTE band ("a name crosses into frequently-stale"). **Cold-start:** cutover is 2026-07-08, so WoW delta CANNOT fire until ~2026-07-22 — weeks 1–2 are baseline-collection; lean on the absolute band (fires without a prior week) in the interim; the report states this explicitly. **Min-sample guard:** a trend/delta/breach-rate alert for a symbol only fires if it has ≥ `MIN_SAMPLES_PER_SYMBOL` captures in the window (thin-book xStocks with RTH halts give noisy ≥15 s fractions on tiny n — the regressor must not alert on small-n noise). Documented SLI target = the live 15 s gate; documented min-sample floor.
- **#439 stall-window QUARANTINE (explicit + logged + calendar-guarded, Langston):** a window is suspected-#439 when **≥ `STALL_UNIVERSE_FRACTION` (e.g. 0.5) of the universe is simultaneously stale AND OHLC bar coverage in that window is NORMAL** (universe-wide staleness WITH near-zero OHLC = a market holiday/half-day, NOT a feed stall → the calendar guard; a data-driven calendar via OHLC coverage, no external source needed). Suspected-#439 windows are EXCLUDED from the SLI baseline and LOGGED per exclusion (`excluded_windows` jsonb) so a later reader never mistakes a quarantined window for a coverage gap. #439 stays its own series, never folded into the baseline.

**Revised `xstock_freshness_report` schema (drop the split columns):** `throttle_caused_symbols`/`native_slow_symbols` → `universe_median_gap_ms, universe_p95_gap_ms, breach_rate_pct, frequently_stale_symbols int, new_frequently_stale jsonb, computed_throttle_floor_ms int, excluded_windows jsonb, min_samples_floor int` + keep `worst jsonb` (top-N by breach-rate w/ per-symbol median/p95), depth/coverage/range fields. The alert body keeps the "could-have-been-blocked, NOT actual loss until active trading is live" framing lock.

**§13 NAMED HOME for the attribution gap (Langston — a home, not a candidate list): PRIMARY = add a venue/source quote timestamp to the xStock ticker capture** (a schema + capture-path change → its own batch **`B-XSTOCK-VENUE-TS`**, dated to the Phase-25 xStock-calibration arc) so per-fetch throttle-vs-native attribution becomes measurable going forward; FALLBACK = a Wave-D-style controlled A/B if we ever need to re-derive the split retroactively. Recorded as **RUNNING_ISSUES #442**.

## Step-2 questions for Langston (now RESOLVED — see OBJ-1 REFRAMED above)
1. Table shape above OK, or want a per-symbol detail table too (vs the `worst jsonb` rollup)? I lean rollup-in-one-row for v1 (trend is the deliverable; per-symbol detail lives in the dated file).
2. Depth-sample floor: flag < ~30 samples/20-min-window? (nominal ~240 at 4000.)
3. Range-compression: compare the throttled-10's `trade_count` + `(high-low)/open` distribution in a post-Wave-D week vs a pre-Wave-D week (before 2026-07-08). Median + p10 shift as the flag trigger. Agree on the metric?
