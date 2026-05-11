# xStocks Pipeline + Diagnostics — Issue Tracker

> **HANDOFF DOCUMENT — read this first in any new session.**
>
> Original purpose: track UI issues Kyle raised against the xStocks tab on the Machine Learning page. Scope expanded as the audit revealed the underlying pipeline was missing pieces that Kyle's intent specified in pre-B79.0a discussions but were never built.
>
> **Kyle's stated intent (multiple times across the day):**
> > "X stocks should have the same architecture as the cryptos. So when you tell me your eval cycle runs inline with quant path, that doesn't make me excited and think wow you've come up with some sort of brilliant revision. No, it just makes me angry that you haven't listened to me and haven't carried out my instructions."
> >
> > "X stocks should have their own 5-quant family filter paths and their own pattern path."
> >
> > "Pairs scanned in should go through all six paths — the five quant paths plus the one pattern path. Pairs can be in multiple paths."
> >
> > "The architecture should be copy-paste from crypto. Differences are only in filter thresholds, family + strategy mapping, classification, and per-strategy gates — all of which should be DB-resolved variables."
>
> **Architectural commitment (locked, no more debate):**
> The xstock pipeline mirrors crypto's `fx5-scanner.ts` + `vts-runner.ts` exactly. Same six filter paths (5 quant families + 1 pattern), same fan-out (pairs in multiple paths get duplicate entries), same family-routed strategy iteration via `STRATEGY_FAMILY_MAP`, same per-pair post-detect math (`computeFinalScore` + `computeNetExpectancyKernel` + `VTS_NET_EV_FLOOR`), same exit-cycle TEC. Differences live in DB (`screener_filters` rows + `module_constants` rows) — NOT in code.
>
> ---

## TL;DR — current state on 2026-05-11

The xstock pipeline as currently shipped on staging (HEAD `c0a69fb7d`):
- ✅ Quant-side: 5 family IMF gates exist + run (B79.0m.a seeded rows + B79.0m.b code)
- ❌ Pattern path: NOT BUILT. Pattern detection runs inline within the quant loop. No parallel pattern-global-filter + pattern-IMF + pattern-routed strategy execution. The `pattern-pool-filters.ts` file exists as dormant scaffolding only — no imports, no orchestration.
- ❌ Family fan-out: pairs are NOT fanned out (1 pair × N qualifying families = N batch entries). Currently each pair is iterated once, with the family-eligibility gate applied per-strategy.
- ❌ UI diagnostics surfacing: many fields broken (see UI section below)
- ❌ Zero actual xstock VTS trades have opened (0 rows in `vts_open_trades WHERE asset_class='xstock_spot'`)
- ✅ Banner removed (commit `1badd5391`)
- ✅ Exit-side price routing added — when a trade eventually opens, exit cycle now reads xstock prices from `xstock_spot_ticker_snap` instead of Kraken crypto REST (commit `c0a69fb7d`)

The pipeline diverges from crypto architecture in shape, not just calibration. The work to bring it to true parity is below.

---

## SECTION A — Pipeline architecture gaps (the BIG fixes Kyle has been asking for)

### A1 — Parallel pattern path: not built (code + DB rows + thresholds all missing)

**State:** Pattern strategies (`morning_star`, `inside_bar_reversal`, `pivot_shift`) currently invoke from within the quant-path loop in `eval-cycle.ts`. They receive a `patternInput` built from `scanPatterns()` and can fire signals, but they fire as quant-path-tagged events, not pattern-path-tagged. No separate global filter + IMF gate runs for them.

**DB state (verified 2026-05-11):** No `vts_pattern` row, no `active_pattern` row in `screener_filters` for `asset_class='xstock_spot'`. Both code AND thresholds need to be added together since neither exists. Reference what crypto has: `SELECT * FROM screener_filters WHERE asset_class='crypto_spot' AND filter_path IN ('vts_pattern', 'active_pattern')` — clone those values for the xstock seeding.

**Crypto reference** (`fx5-scanner.ts:745`):
- `patternFilterPath = isPassiveLearningMode ? 'vts_pattern' : 'active_pattern'`
- Pattern survivors built separately from quant survivors (`patternPoolSurvivors`)
- Pattern global filter applied (lines 743-770)
- Pattern IMF gate applied (lines 1242-1272)
- Pattern survivors tagged `sourcePool='pattern'` and added to VTS batch
- VTS batch can contain a pair in BOTH `quant-trend` and `pattern` simultaneously

**What's required for xstock:**
1. DB: seed `vts_pattern` + `active_pattern` rows in `screener_filters` for `asset_class='xstock_spot'` — **thresholds also need to be assigned** (`lq_min`, `vn_max`, `di_min`, `di_max`, `min_volume`, `min_price`, plus pattern-specific knobs like `final_score_floor`). Clone from crypto's `vts_pattern`/`active_pattern` row values initially, tag `last_updated_by='b79.0m.b2-pattern-path-starter-cloned-from-crypto'`. Also seed the pattern-pool guardrails (`pattern_pool_gates.xstock_spot.*.final_score_floor`, `*.max_position_pct`) in `module_constants` if not already present — `pattern-pool-filters.ts` defines TS fallback constants (0.45 / 0.50) but the runtime authority is module_constants per the file's own docstring.
2. Code: in `server/asset_classes/xstock_spot/eval-cycle.ts`, run the pattern global filter + pattern IMF gate IN PARALLEL with the quant path
3. Pattern survivors get tagged `sourcePool='pattern'` and run ONLY pattern strategies
4. Quant survivors continue to run quant strategies (and may ALSO be pattern survivors if they pass the pattern filter — duplicate entry per Kyle confirmation)

### A2 — Family fan-out: not built

**State:** In `eval-cycle.ts`, each fresh pair is iterated once. For each pair, the family-eligibility gate filters strategies (`STRATEGY_FAMILY_MAP[strategy]` must be in the pair's `passedFamilies` set). This is gate-filtering, NOT fan-out. A pair that passes 3 family IMFs is iterated once, not 3×.

**Crypto reference** (`fx5-scanner.ts:1491`): `const allSurvivors = [...classifiedSurvivors, ...patternPoolSurvivors];` — survivors are flat-listed where one symbol can appear multiple times under different `sourcePool` tags (one per family lane it qualified for, plus separately under pattern).

**What's required for xstock:** Replace the single-iteration loop with a fan-out loop — for each family the pair qualified for, treat it as a separate evaluation entry tagged with that family's sourcePool. Same shape as crypto.

### A3 — Five quant family paths: rows + thresholds present (cloned from crypto)

DB query result (psql, verified 2026-05-11):
```
xstock_spot rows in screener_filters:
  vts_trend       vts_reversal       vts_breakout       vts_oscillator       vts_strong_trend       (paper)
  active_trend    active_reversal    active_breakout    active_oscillator    active_strong_trend    (live)
  active_quant    (global filter row, paper + live; B79.0m.b added)
```
Thresholds populated for all 10 family rows (paper paths VN_MAX=0.95 / 0.98 for strong_trend; live paths VN_MAX=0.85 / 0.95 for strong_trend; LQ_MIN=43 across non-strong-trend, 30/35 for strong_trend; DI bands per family). Tagged `last_updated_by='b79.0m.a-layer1-starter-cloned-from-crypto'`.

**Pattern row missing for both modes — see A1.**

**Calibration follow-up (not blocking pipeline correctness):**
Family thresholds are crypto clones — VN dominance in current diagnostics (44k of 85k family-row failures) suggests xstock intraday tape has higher VN than crypto-tuned VN_MAX=0.95 tolerates. Layer-1 ships with the clones; xstock-specific recalibration drives off Layer-3 evidence post-architecture-completion. Track per-strategy thresholds in `module_constants` (e.g. RSI bands for `pivot_shift`, ATR multipliers for `morning_star`) similarly — most are still wildcard, see B79.0m.b2 deferred list.

### A4 — Eval-cycle wrongly invoked SQE — FIXED (commit `404a76428`)

Earlier I had `eval-cycle.ts` call `evaluateSignalQuality()` to gate signals. This was wrong: crypto VTS does NOT call SQE (verified — `grep evaluateSignalQuality server/services/vts-runner.ts` returns zero). SQE only runs in active trading via `signal-orchestrator`. The 14 "SQE-rejected" archive rows were artifacts of this bug. Removed in commit `404a76428`.

### A5 — finalScore not computed caller-side — FIXED (commit `404a76428`)

Strategy detect functions return signals without finalScore populated; crypto computes finalScore caller-side via `computeFinalScore(hybridScore, predictiveConfidence, regimeWeight, decayPenalty)` after detect succeeds. My eval-cycle was passing `strategySignal.finalScore` (undefined → 0) to SQE. Fixed by adding the caller-side computation. `computeFinalScore` + `VTS_NET_EV_FLOOR` now exported from `vts-runner.ts`.

### A6 — Exit-side price routing — FIXED (commit `c0a69fb7d`)

`resolveOpenVirtualTrades` in `vts-runner.ts` was fetching prices via `priceCache` which only knows Kraken crypto REST. For xstock symbols, this returned no data; xstock trades would never close cleanly. Fixed by partitioning open trades by `assetClass` and routing xstock symbols to `xstock_spot_ticker_snap` (5-min window, DISTINCT ON symbol DESC).

### A7 — Pre-open gates added — FIXED (commit `c0a69fb7d`)

Added `checkPreOpenGates(assetClass, symbol, strategy, currentPrice, stop, target, friction)` helper in `vts-runner.ts` and wired into `eval-cycle.ts`. Mirrors the crypto generatePhase10Signal gates: re-entry cooldown, duplicate position guard, price-past-stop/target, max open trades cap. `recentCloses` key namespace is now `${assetClass}:${symbol}:${strategy}` to avoid xstock/crypto cross-pollution; crypto close site dual-writes legacy + new format.

### A8 — `recentCloses` legacy key collision (mitigated, not cleaned up)

Crypto's `generatePhase10Signal` at line 1259 still reads the legacy `${symbol}:${strategy}` key. Crypto close site dual-writes BOTH formats during the transition. Future cleanup: migrate generatePhase10Signal to assetClass-keyed format and drop the legacy write.

### A9 — Per-underlying-cap (B67.3) — NOT applied to xstock

Crypto runs a shadow-mode B67.3 per-underlying cap check at vts-runner:1345-1361. Xstock skipped this. Lower priority because crypto's version is still in shadow-mode (logs would-reject without actually rejecting until module_constants flag flips).

### A10 — `XSTOCK_SPOT_PATTERN_POOL_GUARDRAILS` constants are dormant scaffolding

The file `server/asset_classes/xstock_spot/pattern-pool-filters.ts` defines two pattern-pool guardrails (`finalScoreFloor=0.45`, `maxPositionPct=0.50`). Zero imports — never used at runtime. Will become consumable once the pattern path is built (A1).

---

## SECTION B — UI diagnostics issues (lower priority per Kyle: fix pipeline first, UI will follow)

These are all consequences of B-1 through B-10 below. Kyle's directive: secondary concern.

### B1 — "Last Scan" header shows "undefined pairs scanned"
React component reads a field name that doesn't match the API's `lastScan.scannedCount`. Renders as literal "undefined".

### B2 — Per-family detail rows missing from xStocks tab "FAMILY PATH IMF BREAKDOWN" section
API returns `lastScan.familyPerMetric` populated; React component on xStocks tab doesn't iterate it. Crypto tab does — works there.

### B3 — Pipeline Summary "Per-Family Breakdown T:0 R:0 B:0 O:0 S:0"
Reads from a per-family sum field that doesn't exist in the API response. Need to compute `sum(perFamily[X].passed)` and surface.

### B4 — Pipeline Summary "Family-Qualified (Unique Pairs)" = 0 while data is non-zero
API has `lastScan.familyQualifiedUnique`; UI reads a different name (or doesn't read).

### B5 — Pipeline Summary "Pair-Pool Evaluations" = 0 but 24-Hour Rolling section below shows 25,105
Two different fields wired to two different aggregates. Should be consistent.

### B6 — `applicable` rendering as literal `[object Object][object Object]`
UI tries to stringify the applicability flags object instead of using it to render N/A markers. Bug.

### B7 — 7 strategies showing in BY STRATEGY table, 10 enabled in DB
Missing: `breakout`, `sma_trend_ride`, `vwap_bounce`. The `byStrategy` aggregate only includes strategies that have been invoked at least once. Likely those 3 strategies' regime-mapping doesn't currently hit any active xstock regime. Needs DB audit + regime-strategy map review.

### B8 — Crypto Filter Diagnostics "Benchmarks Removed: 181,360" is mislabeled
Field on backend is `benchmarkBypassed` (counts benchmarks that PASSED filters and are in the survivor pool — NOT removed). Crypto benchmark removal has been disabled since B62 directive 2026-04-16. UI label is wrong. Also: UI computes `VTS Destination = survivors − benchmarkBypassed` which understates VTS destination by the benchmark count.

Fix per Kyle directive 2026-05-11:
- (1) Rename existing UI cell "↳ Benchmarks Removed" → "↳ Benchmarks Surviving Filters" (or similar)
- (2) Remove broken subtraction in VTS Destination computation
- (3) Add a NEW "↳ Benchmarks Removed (benchmark-specific exclusion)" line wired to actual removal counter (currently always zero — desired state — ready for when removal is re-enabled)

### B9 — Static descriptive paragraph at top of "Filter Pipeline Diagnostics (xstock_spot)" section is outdated
Currently reads: "Funnel-stage rejection counters are zero until xstockSpotScanner is wired through signal-orchestration in a future B79.x batch — strategy-level + null-reason aggregates are real (from signal_eval_archive)."
- Inaccurate now (scanner IS wired, counters are populating)
- Should be replaced with accurate description after the pattern path + fan-out (A1, A2) ship

### B10 — Universe Scanned 24h semantics
Currently uses scanner-lifetime `pairsEntered` (since-process-start counter). Earlier had raw tick `COUNT(*)` (618k overcounts). The "since-process-start" replacement resets on every PM2 restart — not a true rolling 24h. Acceptable for now; flag as known limitation.

---

## SECTION C — Calibration issues (downstream of pipeline correctness)

### C1 — Volume = 0 killing VWAP signals
VWAP strategy logs: `volume=0, avg=805, multiplier=1.5x, confirmed=false`. Xstock OHLC has volume in shares; strategies expect dollar-volume or different threshold. Layer-1 calibration tweak needed once pipeline is right.

### C2 — VolNoise (VN) threshold too tight for equity intraday
Diagnostic shows VN rejection dominant (e.g., 28,040 out of ~85k across families). Cloned-from-crypto VN_MAX=0.93 likely needs adjustment for equity tape.

### C3 — DI band check in `vts_reversal` + `vts_oscillator` rejecting 100% pre-RTH
Both families want LOW DI (range-bound tape). Currently trending xstocks fail. Either threshold is wrong or these families won't fire pre-RTH (expected).

---

## SECTION D — Things I've claimed "fixed" but Kyle should re-verify

This is a list of items I told Kyle were fixed in commits over the day. Each needs honest UI re-verification (not API curl) per CLAUDE.md §9.3 before being trusted.

| Item | Claim | Commit | Re-verify how |
|---|---|---|---|
| Banner removed | UI-verified gone | `1badd5391` | Claude-in-Chrome navigate to xStocks tab, confirm no banner |
| SQE call removed | `grep evaluateSignalQuality server/asset_classes/xstock_spot/eval-cycle.ts` returns zero | `404a76428` | Code review |
| finalScore caller-side | Computed via `computeFinalScore(...)` post-detect, before any gate | `404a76428` | Code review + check `signal_eval_archive.final_score` for non-zero values when signals fire |
| Exit-path xstock price routing | `resolveOpenVirtualTrades` partitions by `assetClass`, xstock reads `xstock_spot_ticker_snap` | `c0a69fb7d` | Open a synthetic xstock trade in DB, watch exit cycle log for non-null currentPrice |
| Pre-open gates (cooldown, dup, max-trades, price-past-stop) | `checkPreOpenGates` invoked between Net EV pass and trade-open | `c0a69fb7d` | Code review |
| `recentCloses` assetClass-keyed | Crypto close site dual-writes legacy + new format | `c0a69fb7d` | Code review |

---

## SECTION E — Resolution discipline for the new session

Per Kyle directive 2026-05-11:
1. Read this entire document BEFORE writing any code
2. The architectural commitment in TL;DR is LOCKED — no more "should we...?" architectural questions. Copy-paste from crypto, swap in `xstock_spot` asset class + DB-resolved variables
3. Items in Section A are the priority. UI (Section B) is secondary.
4. For each Section A item: implement → deploy → **UI-verify via Claude-in-Chrome per CLAUDE.md §9.3** → mark as Done in this file
5. No "Q1-Q5 to Kyle" — answer architectural questions from the code, not from Kyle
6. If genuinely stuck on something, escalate to Langston, not Kyle

---

*End of tracker. Next session: pick up at A1 (parallel pattern path implementation).*
