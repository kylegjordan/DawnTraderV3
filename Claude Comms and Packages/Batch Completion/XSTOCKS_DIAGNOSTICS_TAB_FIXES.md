# xStocks Pipeline + Diagnostics — Issue Tracker

> **HANDOFF DOCUMENT — read this first in any session touching the xStocks tab or pipeline.**

---

## Maintenance rules (Kyle directive 2026-05-12)

This file is an **all-time changelog**, not a snapshot. Keep all history.

1. **Every UI / pipeline fix gets logged here** — date, commit hash, exact change, status (✅ FIXED / 🔄 IN PROGRESS / ❌ OPEN / ↩️ REVERTED).
2. **Every issue Kyle raises** against the xStocks tab gets a new `B-NEW-N` entry (incrementing N).
3. **One-by-one workflow** — fix → Kyle verifies on staging → mark FIXED with commit + date → move to next. No batching multiple fixes per commit unless they're truly tightly coupled.
4. **When the xStocks tab UI work is FULLY closed** (all B-NEW items FIXED + verified), update MEMORY.md to remove the xStocks-tracker maintenance rule.
5. **Architectural learnings** (crypto-parity defenses, substrate-forced parameter divergences, etc.) get distilled into `ASSET_CLASS_ONBOARDING_WORKFLOW.md` separately. This file stays UI/data-surfacing focused.

---

## Architectural commitment (locked, no more debate)

The xstock pipeline mirrors crypto's `fx5-scanner.ts` + `vts-runner.ts` exactly. Same six filter paths (5 quant families + 1 pattern), same fan-out (pairs in multiple paths get duplicate entries), same family-routed strategy iteration via `STRATEGY_FAMILY_MAP`, same per-pair post-detect math (`computeFinalScore` + `computeNetExpectancyKernel` + `VTS_NET_EV_FLOOR`), same exit-cycle TEC. Differences live in DB (`screener_filters` rows + `module_constants` rows) and substrate-forced parameters (candle interval, data source type) — NOT in code shape.

---

## Current state on 2026-05-12 EOD (after architecture sprint + crypto-parity defenses)

Staging HEAD: `dd5810c32`, PM2 #244.

- ✅ Quant-side: 5 family IMF gates exist + run, parallel pattern path built
- ✅ Family fan-out: lane × strategy iteration, pattern strategies eligible in family lanes
- ✅ Parallel quant + pattern global filters (B-NEW-1 architecture fix)
- ✅ Crypto-parity scanner defenses: config-cache, 25s timeout, 75-pair round-robin rotation
- ✅ xStocks tab load time: 60s → 0.94s
- 🔄 UI diagnostics surfacing: ~half resolved, ~half open (see Open Items)
- ❌ Trade-count discrepancy: 33 in pipeline summary vs 3 in `vts_open_trades` (B-NEW-13)
- ❌ Zero net xstock trades during pre-RTH; some pinning during RTH window (under verification)

---

## CHANGELOG — all fixes shipped, most-recent first

### 2026-05-12 — Phase 24 sprint (xstock UI catalog response)

| Date | Item | Commit | What changed |
|---|---|---|---|
| 2026-05-13 | **B-NEW-22: Centralize trade-open context fields in registerOpenVtsTrade** | `f6b147108` | Kyle observed (CSV 2026-05-13) that xstock open-trade records had EMPTY `globalRegime`, `pairFriction`, `globalFriction`, `globalDirectionalBias`, `globalDirectionalBiasScore` while crypto rows had them populated. Root cause: crypto trades use the inline `openVirtualTrades.set()` path in vts-runner.ts:~1408-1476 which resolves these via `getTelemetryAggregator()`, `getCachedCostMetrics()`, `getGlobalFriction()`, `getLastGlobalDBSCategory()`, `getLastGlobalDBSScore()`. xstock trades go through `registerOpenVtsTrade()` (vts-runner.ts:2714) which only used fields the caller passed — xstock eval-cycle passes only `pairDirectionalBias` + `pairDirectionalBiasScore`. Fix: added `globalRegime` + `pairFriction` + `globalFriction` to `RegisterOpenVtsTradeInput` interface AND default-resolve all 5 fields inside `registerOpenVtsTrade` via the same helpers the crypto inline path uses, when caller omits them. xstock caller is unchanged — defaults kick in automatically. Per CLAUDE.md §5 #15 "no patches": canonical, centralized resolution at the entry point so every future asset class that calls `registerOpenVtsTrade` gets these fields populated automatically. PM2 #265 deployed. **Existing open trades have empty context (immutable post-open); new trades from this point forward populate fully.** |
| 2026-05-13 | **B-NEW-20: CRITICAL FIX — `db is not defined` in xstock exit-side price-fetch — VERIFIED LIVE** | `56dfe293c` | Kyle's CSV export 2026-05-13 showed 21 open xstock trades, NONE closed, all with `currentPrice=` empty. Root cause: `resolveOpenVirtualTrades()` B79.0m.b2 xstock leg (vts-runner.ts:2034) used `db.execute(sql.raw(...))` to query `xstock_spot_ticker_snap`, but `db` and `sql` were never imported at the top of the file. The try/catch swallowed `ReferenceError: db is not defined` every exit cycle (every minute), silently emitting `[B79.0m.b2][EXIT_XSTOCK_PRICE_FETCH] failed for N symbols: db is not defined` to PM2 logs and returning an empty price map. Every xstock open trade had `currentPrice=null` since B79.0m.b2 shipped (2026-05-11) → target/stop/TEC could not evaluate → trades sat open indefinitely (oldest open trade in CSV was 1210 minutes / 20+ hours). Fix: add `import { db } from '../db.js'` + `import { sql } from 'drizzle-orm'` near top of vts-runner.ts (canonical pattern used across 100+ other service files). No other code changes. PM2 #264 (commit `56dfe293c`) deployed; monitoring for first xstock trade closure post-fix. |
| 2026-05-13 | **B-NEW-19: Possible Strategy Iterations row + subtractive flow + per-lane Pre-Eval Skips split + remove negative signs** | `3451bb9c8` | Kyle directive 2026-05-13: pre-eval-skips math was confusing because the panel placed Pre-Eval Skips between VTS Destination and Pair-Pool Evaluations as if subtraction, and rendered them with leading `−` signs. Root cause: Pre-Eval Skips lives at a deeper granularity (pair × lane × strategy iteration) than VTS Destination / Pair-Pool Evaluations (pair × lane). For each pair-lane entry, eval-cycle iterates through every asset-class-enabled strategy in the regime's pool; each non-matching family becomes a pre-eval skip. **New panel flow across all three sections** (Pipeline Summary 24h, Last Scan VTS Signal Funnel, 24-Hour Rolling Aggregates VTS Evaluation): Pair-Pool Evaluations → **Possible Strategy Iterations** (NEW row = Pre-Eval Skips + Strategy Evaluations) → ↳ Pre-Eval Skips (per-lane Quant/Pattern split) → = Strategy Evaluations → ↳ Strategy Nulls → Trades Opened. Last Scan section had `colSpan={2}` placeholder cells; now wired with real per-lane values from `lc.quantNullReasonDetail` / `lc.patternNullReasonDetail`. 24h Aggregates block was rendering pairsSkippedNoPrice in quant col and pairsSkippedInsufficientOHLC in pattern col (semantically wrong); now uses real per-lane split. routes.ts xstock endpoint `lastCycleVtsEval` now emits `quantNullReasonDetail` + `patternNullReasonDetail` (was missing — crypto's vts-runner snapshot already had them via `getLastVTSCycleSnapshot()`). Applies to BOTH crypto and xstock tabs because `FilterDiagnosticsPanel` is shared. |
| 2026-05-13 | **B-NEW-17: Pre-Eval Skips total includes ALL pre-detect rejections** | `84183086c` | Pre-Eval Skips summary row showed only `pairsSkippedNoPrice + pairsSkippedInsufficientOHLC` (often 0), while the section's Family Filter Mismatch row showed 92K. Both totals at lines 2014 + 2425 now include all 6 pre-eval-skip sources: noPrice + ohlc + familyMismatch + dupPos + maxOpen + regimeNoStrats. Tooltip lists each component count. |
| 2026-05-13 | **B-NEW-12.b: per-lane null-reason aggregates** (real fix for >100% sums in pool columns) | `cf260480b` | Kyle screenshot showed Quant column 92.3% no_pattern + 16.4% not_yet_instrumented = 108.7% (impossible). Endpoint was emitting combined nullReasonAggregate in quant slot + {} in pattern slot — panel rendered combined total in Quant column. Fix: eval-cycle now maintains `quant/patternNullReasonAggregate` separately with lane-aware branching at both family_filter_mismatch (line 437) and strategy-null (line 510) increment sites. Scanner lifetime accumulator sums both maps. Endpoint emits real per-lane aggregates. Math now coherent: pool column %s ≤ 100%. |
| 2026-05-13 | **B-NEW-12 (RUNNING_ISSUES #101): Family Filter Mismatch reads correct denominator** | `9c9d14b47` | Row was using `pct()` which divides by `totalStratNulls`, but `family_filter_mismatch` is a pre-eval skip not in totalStratNulls. Pre-fix showed 158%/177%. Panel now reads endpoint's `familyMismatchDenominatorTotal = strategiesEvaluated + family_filter_mismatch` (eligibility pass + fail). Math is now meaningful: "% of total iterations rejected by family eligibility gate." |
| 2026-05-13 | **Workflow doc Step 6b: Calibration cycle** added as MANDATORY onboarding step | `0bfc50242` | Three sub-cycles required before declaring asset class production-ready: regime classifier calibration (Sub-cycle 1), filter threshold reality check (Sub-cycle 2), strategy gate testing (Sub-cycle 3). Distilled from crypto + xstock onboarding experience — initial Layer-1 seeds are domain-knowledge starters, not production-tuned. Workflow procedural checklist updated. |
| 2026-05-13 | **B-NEW-11: Setup Nulls Section Total row + drift indicator** | `a6da4aaec` | Added "Section Total" row at bottom of Setup Nulls table summing all displayed counts + showing % of `totalStratNulls`. Amber-highlighted with ⚠ when section sum > 100% (double-counting) or < 95% (uncategorized nulls). Preserves existing "% of Strategy Nulls" column semantics while surfacing data drift. Current live data: 99.9% (healthy). |
| 2026-05-13 | **B-NEW-10: all 10 xstock-enabled strategies appear in By Strategy panel** | `b87635ec8` | Pre-populate `byStrategy` with zero-rows for every xstock-enabled strategy that hasn't iterated yet. DB-driven via existing `strategy_gates` rows (10 enabled + 9 disabled). Regime-gated dormant strategies (e.g. mean_reversion, sma_trend_ride, vwap_bounce, breakout, inside_bar_reversal) now visible-but-zero instead of invisible. |
| 2026-05-13 | **B-NEW-9 relabel: scope clarity** | `1027485c6` | Kyle directive 2026-05-13: status-quo + relabel chosen over persistent counters / materialized view. Strategy Evaluations / Nulls / Signals Rejected labeled "since process start" (in-memory, resets on PM2 restart). Trades Opened labeled "DB-backed, 24h rolling". Both 24h Pipeline Summary + VTS Evaluation Detail. Math is internally coherent within each scope; cross-scope comparison now explicit. |
| 2026-05-13 | **B-NEW-9 path A signal_type fix** — quant/pattern split column | `1d06a6832` | Pattern Trades Opened was reading 0 despite morning_star trades existing. DB `pool` column = 'rotational' (regime/stage label, not lane source). Correct split is `signal_type` ('QUANT' vs 'PATTERN'). Verified: 14 trades = 13 QUANT + 1 PATTERN. |
| 2026-05-13 | **B-NEW-9 path A: DB-backed 24h trades-opened** (xstock endpoint) | `5569e9cc7` | In-memory counters reset on PM2 restart so panel was showing "since-process-start" instead of true 24h rolling. Endpoint now queries `vts_open_trades` (B79.0g-tx soft-delete keeps closed rows) for 24h count. Per-cycle Last Scan row keeps in-memory counter (correct scope). DB query < 50ms expected; logs warning if > 1s. |
| 2026-05-12 | **B-NEW-9 + B-NEW-13: Trades Opened row reads post-gate counter** (not post-detect) | `54f9286bf` + `e3811aba4` | Symptom: panel displayed 128 trades while DB had 12. Root cause: "Trades Opened" row read `quant/patternSignalsGenerated` which is incremented post-detect (BEFORE Net EV gate + pre-open gates + dedupe). Fix: new `quant/patternTradesOpened` counters incremented ONLY at successful `registerOpenVtsTrade` (where `tradeId` is truthy). All 3 sections (Pipeline Summary, Last Scan, VTS Evaluation Detail) updated to read post-gate counter. |
| 2026-05-12 | **B-NEW-8 per-cycle parity**: Last Scan Pair-Pool reads fan-out | `257bc5752` | `lastCycleVtsEval` block in `routes.ts` now also emits `quantPairPoolEvaluations` / `patternPairPoolEvaluations` from `ec.familyFanOutSum` + `ec.patternFanOut`. Was relying on the legacy `quantPairsEvaluated` fallback (unique-pair count, 67 in screenshot) instead of fan-out (208 = IMF Survivors). |
| 2026-05-12 | **B-NEW-8: IMF Survivors + VTS Destination read fan-out** (not unique-pair) | `7d7b61ff1` | `routes.ts`: `survivors` now reads `familyFanOutSum` (sum across families); `destinationCount` reads `familyFanOutSum + patternFanOut`. Matches crypto's allSurvivors semantics. Both per-cycle + 24h. Unique-pair count remains accessible via `Family-Qualified (Unique Pairs)` row reading `familyQualifiedUnique`. |
| 2026-05-12 | **B-NEW-7: `[object Object]` row removed** from Last Scan + 24h Aggregate tables | `494db9b65` | `machine-learning.tsx`: `Object.entries(global).filter(([k,v]) => typeof v === 'number').map(...)` at both call sites. `applicable` object still drives N/A rendering via a separate code path. |
| 2026-05-12 | **B-NEW-6 closed (incidentally fixed)** — Family IMF Passed % no longer hardcoded 29% | _earlier wiring_ | After parallel-architecture + config-cache + counter-rename commits, `Family IMF Passed` now shows real computed percentages (55%/71% in live screenshots) from real numerators+denominators. No literal `0.29` anywhere in routes.ts. Verified 2026-05-12. |
| 2026-05-12 | **B-NEW-4: Pair-Pool Evaluations** field-name fix | `92f4d8ef9` | `routes.ts`: emit `quant/patternPairPoolEvaluations` for the crypto-parity panel field. Source from xstock's `familyFanOutSum` (pair × passed-family count) and `patternFanOut` (pair-admitted-to-pattern-lane). Backend was emitting `quant/patternPairsEvaluated` (unique pair count, different metric). |
| 2026-05-12 | **Max Price row → "—" (N/A)** — fractional ownership means no upper price limit | `1835fb03b` | `routes.ts`: added `failed_max_price: false` to applicable flags on both quant + pattern emptyGlobal templates. Panel renders "—" same as Daily Range / Market Cap. UI row preserved for cross-asset consistency. |
| 2026-05-12 | **B-NEW-3: Family-Qualified Unique Pairs** field-name fix | `38878c59a` | `routes.ts`: xstock endpoint now emits `totalFamilyQualifiedUnique` (crypto-parity name expected by shared panel). Same pattern as B-NEW-5. Also added `totalFamilyFanOutSum` for symmetry. |
| 2026-05-12 | **Pinned-benchmarks cleanup** — drop IWM/DIA (not in universe), keep SPY/QQQ/GLD | `2deb4259a` | `scanner.ts` PINNED_BENCHMARKS reduced to 3 names that exist as xstocks |
| 2026-05-12 | **DB `max_price` set to 0 for xstocks** (fractional ownership → no upper limit) | DB UPDATE only | `screener_filters` `active_quant` + `vts_pattern` xstock rows: `max_price=0`. Code already short-circuits when `max_price=0`. UI row preserved for asset-class consistency. |
| 2026-05-12 | **75-pair round-robin rotation** — 70 rotated + 5 pinned (3 actually-existing) benchmarks per cycle | `dd5810c32` | scanner.ts adds `rotationCursor` + `selectCycleBatch` step before SQL build. Full universe sweep ~1m 45s. |
| 2026-05-12 | **25s `SCAN_TIMEOUT_MS` + Promise.race** (crypto-parity defense) | `73ff21052` | scanner.ts wraps `runCycle` in `Promise.race([cycleP, timeoutP])`. Forces `isScanning=false` on timeout. No more wedged-forever state. |
| 2026-05-12 | **Cycle-scoped config cache** — pre-load 7 `screener_filters` rows ONCE per cycle | `e3e8492bf` | New `XstockFilterConfigBundle` + `loadXstockFilterConfigs(mode)`. Filter functions accept optional pre-loaded config; fall back to DB lookup for unit tests only. 1638 redundant lookups per cycle → 7. |
| 2026-05-12 | **Constant-name typo fix**: `di_to_pwin_scaling_factor` → `di_pwin_factor` | `f86295cb9` | `eval-cycle.ts:546` lookup matched no DB row → kernel-fail spam on every pattern-lane eval → log noise saturated event loop. |
| 2026-05-12 | ↩️ **max_bid_ask_spread wiring REVERTED** | `7892af79a` | Added bid/ask SELECT in ticker_snap query → unexpected 130× query slowdown (~150ms → 18.5s). Needs redesign before retry (separate batched bid/ask query, not in main SELECT). Threshold stays in DB at 3.0 but code path doesn't read it. |
| 2026-05-12 | **B-NEW-5: `lastScan.totalPairsScanned`** field rename | `305129326` | Shared `FilterDiagnosticsPanel` reads `lastScan.totalPairsScanned`; xstock endpoint emitted `scannedCount`. Endpoint now emits both names. |
| 2026-05-12 | **B-NEW-1 follow-up: parallel quant+pattern global** | `73ab29eb5` | `eval-cycle.ts` refactored: quant global short-circuit `return` removed. Both filters always run; pair rejected only if BOTH fail. Pattern admits ~4 pairs/cycle that quant rejects (PLUG, BLDP, OPEN @ $2-5 price band). |
| 2026-05-12 | **B-NEW-1: VTS quant global tightening** + `volume24hUSD` wired from ticker_snap | `37dc1cee7` | DB: `active_quant.min_price` $1→$5, `min_volume` $100k→$1M; `vts_pattern.min_price` $0.05→$2, `max_price` $99M→$10k, `min_volume` $150k→$300k. Scanner now SELECTs `volume_24h` + computes USD; was hardcoded to 0 (gate silently skipped). |

### 2026-05-11 — B79.0m.b2 main ship

| Date | Item | Commit | What changed |
|---|---|---|---|
| 2026-05-11 | Parallel pattern path built | `4c60d259e` | `evaluateXstockPatternFilter` (global + IMF combined) + lane × strategy fanout in eval-cycle |
| 2026-05-11 | Family fan-out built | `4c60d259e` | Pairs passing N families produce N+1 lane entries (incl. pattern if pattern-global passed) |
| 2026-05-11 | Exit-side price routing | `c0a69fb7d` | `resolveOpenVirtualTrades` partitioned by assetClass; xstock symbols route to `xstock_spot_ticker_snap` |
| 2026-05-11 | Pre-open gates | `c0a69fb7d` | `checkPreOpenGates` helper with re-entry cooldown, dup-position, max-trades guards |
| 2026-05-11 | Banner removed | `1badd5391` | xstock tab banner gone |

### Earlier — B79.0m.a/b setup

| Date | Item | Commit | What changed |
|---|---|---|---|
| 2026-05-10 | xstock 5-family IMF rows seeded | B79.0m.a | `screener_filters` cloned from crypto baseline |
| 2026-05-10 | xstock_spot global filter wiring | B79.0m.b | `evaluateXstockGlobalFilter` reads from `active_quant` row |

---

## OPEN ITEMS — to fix one-by-one

> **Sequencing per Kyle directive 2026-05-12:** one item at a time. Diagnose → fix → push → Kyle verifies on staging → mark FIXED with commit + date → next.

| ID | Issue | Notes / next step |
|---|---|---|
| **B-NEW-21** | `/api/xstocks/freshness` statement-timeout on Supabase | Returns `{ok:false, error:"canceling statement due to statement timeout"}`. Query iterates all ~260 xstock symbols joining against `xstock_spot_ticker_snap` (large partitioned table). Likely needs (a) index on `(symbol, captured_at DESC)` if missing, OR (b) per-symbol `DISTINCT ON` pattern in chunks, OR (c) materialized latest-per-symbol view refreshed on each archive write. Same pattern that exit-cycle B-NEW-20 uses works because it filters to only the ~20 open-trade symbols (small IN list). Freshness endpoint is observation-only — not blocking trade flow — defer to follow-up batch. |
| **B-NEW-14** | Max Spread row shows 0 — vestigial state after `max_bid_ask_spread` revert | Two options: (a) re-implement bid/ask filter via separate batched query (proper); (b) relabel/document the zero clearly. |
| **B-NEW-18** (Layer-3 calibration) | xstock regime + family classification calibration | Same exercise we did with crypto. After initial crypto calibration there was a big shift from trades concentrating in range_bound families to predominantly strong_trend. Expect a similar redistribution for xstocks once we tune the regime classifier thresholds + family-IMF bands for equity microstructure. Tied to B-NEW-15 (DI ranges for reversal/oscillator) and B-NEW-16 (trend/breakout threshold differentiation). Also: validate that IMPULSE_EXPANSION-gated strategies (sma_trend_ride, breakout, vwap_bounce) fire when the IE regime hits — currently dormant even though ORB (also IE-mapped) fires, suggests a separate IE-routing path worth auditing. |
| **B-NEW-15** (Layer-3 calibration) | DI killing reversal + oscillator families on xstock | Live 24h aggregate: reversal_family DI failures = 16,413/25,112 (65%), oscillator_family DI = 16,553/25,112 (66%). These families look for LOW DI (range-bound tape); xstock RTH tape is trending → high DI → mass rejection. Either (a) intentional and these families won't fire during trending RTH (acceptable), or (b) DI_MAX threshold too tight for equity microstructure. **Investigate after UI is trusted.** |
| **B-NEW-16** (Layer-3 calibration) | Trend + Breakout family IMF thresholds IDENTICAL on xstock | Live 24h: both show LQ:1,605 / VN:6,948 / DI:0 — exactly the same numbers because vts_trend + vts_breakout DB rows have identical `lq_min=43, vn_max=0.95, di_min=10, di_max=100` (cloned from crypto baseline). Crypto's trend + breakout differentiate via different DI bands. For xstock, **trend should want moderate-high DI**, **breakout should want different (volatility-expansion) thresholds**. Decide whether to differentiate at Layer-3. |
| **L3-NEW-1** (Layer-3 / post UI) | Investigate `no_pattern_detected` and `family_filter_mismatch` rejection rates — legitimate or over-blocking? | Run after all UI items closed and we trust the numbers |

---

## Earlier sections — preserved for history

### SECTION A — Pipeline architecture gaps (FIXED, kept for narrative reference)

(Architectural items A1–A10 from the 2026-05-11 snapshot were all resolved in B79.0m.b2 and subsequent commits — see CHANGELOG above. The earlier in-line A-section detail is now historical and lives in commit messages + completion reports.)

### SECTION B — Original UI list (2026-05-11)

(Stale entries B1–B10 from the 2026-05-11 snapshot were either resolved by B79.0m.b2 follow-ups or remapped into B-NEW-N entries. Mapping recorded in 2026-05-12 EOD restructure commit.)

### SECTION C — Calibration (deferred, post-UI)

- C1: Volume=0 killing VWAP — xstock OHLC has share-volume not dollar-volume; strategy threshold may need recalibration
- C2: VolNoise threshold may be too tight for equity intraday
- C3: DI band check in `vts_reversal` / `vts_oscillator` rejects ~100% pre-RTH (trending tape doesn't fit range-bound families)

These move forward only AFTER the UI shows trustworthy numbers. Layer-3 work.
