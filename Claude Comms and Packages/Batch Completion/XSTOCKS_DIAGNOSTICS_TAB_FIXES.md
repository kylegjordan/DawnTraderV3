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
| 2026-05-12 | **Pinned-benchmarks cleanup** — drop IWM/DIA (not in universe), keep SPY/QQQ/GLD | _next push_ | `scanner.ts` PINNED_BENCHMARKS reduced to 3 names that exist as xstocks |
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
| **B-NEW-3** | Family-qualified unique pairs shows 0 (quant) / "—" (pattern) | Counter not wired in endpoint OR panel reads wrong field |
| **B-NEW-4** | Pair-pool evaluations still 0 in 24h Pipeline Summary | Same class as B-NEW-3 — counter wiring |
| **B-NEW-6** | Family IMF Passed hardcoded at 29% in Pipeline Summary 24h | Suspected hardcode in `routes.ts` or panel |
| **B-NEW-7** | `applicable [object Object][object Object]…` garbage row in 24h Aggregate AND Last Scan | Object stringification — `${value}` rendering an `{imf, survivors}` shape |
| **B-NEW-8** | Family path IMF totals broken — survivors = strong_trend pass alone | Aggregation loop finds only one family key; per-family field-name mismatch |
| **B-NEW-9** | VTS Evaluation Detail math off (small drift, not zero now) | 9484 evals − 946 nulls − rejected ≠ signals_generated. Counter-bucketing audit |
| **B-NEW-10** | By Strategy panel shows 6 of 10 strategies | 4 strategies never get an `evaluated++` increment site for xstocks |
| **B-NEW-11** | Setup Nulls % sum > 100% | Per-bucket denominator is wrong (probably divides by partial set) |
| **B-NEW-12** | Family Filter Mismatch frontend math (RUNNING_ISSUES #101) | Panel reads `strategiesEvaluated` should be `familyMismatchDenominatorTotal` |
| **B-NEW-13** | Trade count discrepancy: 33 in pipeline summary vs 3 in `vts_open_trades` | Trades-opened counter increments on signal generation but actual DB-write happens later. Race or missing-write path. |
| **B-NEW-14** | Max Spread row shows 0 — vestigial state after `max_bid_ask_spread` revert | Two options: (a) re-implement bid/ask filter via separate batched query (proper); (b) relabel/document the zero clearly. |
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
