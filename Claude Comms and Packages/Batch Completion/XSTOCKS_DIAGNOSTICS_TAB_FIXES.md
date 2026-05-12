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

## TL;DR — current state on 2026-05-12 EOD (refreshed post-B79.0m.b2 + 6 follow-up commits)

The xstock pipeline as currently shipped on staging (HEAD `f31fc18d6`, PM2 #235):
- ✅ Quant-side: 5 family IMF gates exist + run (B79.0m.a seeded rows + B79.0m.b code)
- ✅ Pattern path: BUILT in B79.0m.b2 (commits `4c60d259e` + follow-ups). Parallel pattern-global-filter + pattern-IMF + pattern-routed strategy execution wired. Pair-fan-out via lane × strategy. `pattern-pool-filters.ts` consumable; threshold rows seeded in `screener_filters` for both modes.
- ✅ Family fan-out: BUILT in B79.0m.b2 — lanes array per pair (passing families + pattern), nested iteration. Symbol-pool-union eligibility: pattern strategies now eligible in family lanes too (matches crypto, follow-up commit `dd0466c7e`).
- ❌ UI diagnostics surfacing: still broken in many places. Kyle's 2026-05-12 EOD catalog (Section B below — refreshed).
- ❌ Zero actual xstock VTS trades have opened (0 rows in `vts_open_trades WHERE asset_class='xstock_spot'`) — pending Tuesday 2026-05-13 RTH 13:30 UTC observation.
- ✅ Banner removed (commit `1badd5391`)
- ✅ Exit-side price routing (commit `c0a69fb7d`)
- ✅ xStocks tab load time: 60s → 0.94s (commit `f31fc18d6` — endpoint switched to in-memory counters from `scanner.diag.evalCountersLifetime`)

Architectural parity with crypto is COMPLETE. Remaining work = pure UI surfacing + counter-wiring + Layer-3 calibration. No more Section A architecture batches expected.

---

## SECTION A — Pipeline architecture gaps (the BIG fixes Kyle has been asking for)

### A1 — Parallel pattern path: ✅ SHIPPED in B79.0m.b2 (2026-05-12)

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

### A2 — Family fan-out: ✅ SHIPPED in B79.0m.b2 (2026-05-12)

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

## SECTION B — UI diagnostics issues (fresh consolidated list, Kyle catalog 2026-05-12 EOD post-compact)

> **Workflow per Kyle directive 2026-05-12:** lightweight, one-by-one. Diagnose → fix → Kyle verifies on staging → mark done → next item. NOT the full batch workflow. Each item gets a single short commit.
>
> **Stale B1–B10 entries from 2026-05-11 either resolved by B79.0m.b2 follow-up commits or deduplicated into the fresh list below.** Mapping recorded at the bottom of this section.

### B-NEW-1 — Global Filters Passed shows 100% for both quant + pattern (Pipeline Summary)

**Symptom:** Both quant + pattern paths display 100% (or 99.x rounded up). Quant IMF passes > global filters passed (mathematically impossible — IMF runs AFTER global).

**Root-cause investigation (started 2026-05-12 EOD):** DB rows for `screener_filters WHERE asset_class='xstock_spot'` are partially seeded:
- **Live mode missing:** `vts_breakout`, `vts_oscillator`, `vts_quant`, `vts_reversal`, `vts_strong_trend`, `vts_trend` (only `vts_pattern` exists)
- **Paper mode missing:** `active_breakout`, `active_oscillator`, `active_reversal`, `active_strong_trend`, `active_trend` (also missing `vts_quant`)
- **`active_quant` / `vts_quant` xstock rows have NULL** for `lq_min` / `vn_max` / `di_min` / `di_max` — so they don't IMF-filter at all
- **3 stray rows with NULL `filter_path`** (`b79.0m.a-layer1-starter-cloned-from-paper-mode` + one with empty `last_updated_by`)

**Action:** seed the missing rows (clone from crypto) + clean up the NULL-path stray rows + investigate whether the % display is rounding or genuinely-passes-everything. Diagnose-and-fix this first — it determines whether other "100%" symptoms are real or display-only.

**Status:** OPEN — IN PROGRESS

### B-NEW-2 — "Universe scanned" total absent from Pipeline Summary

Want a top-line row showing total pairs the scanner has examined in the window. Currently the universe figure is unbacked.

**Status:** OPEN

### B-NEW-3 — Family-qualified unique pairs shows 0 (quant) / "—" (pattern)

Counter either not wired in endpoint or panel reads wrong field. Likely a counter that exists for crypto but never added to xstock's `evalCountersLifetime`.

**Status:** OPEN — was B4 in old list

### B-NEW-4 — Pair-pool evaluations 0 in 24h Pipeline Summary

Either not incrementing in `eval-cycle.ts` for xstock_spot, or aggregated to a different field than the endpoint reads. Same class as B-NEW-3.

**Status:** OPEN — was B5 in old list

### B-NEW-5 — Last Scan Filter Breakdown header: "Paper · undefined pairs scanned"

Want total pairs scanned in the top row next to last-scan timestamp. `undefined` indicates the field the panel reads doesn't exist on endpoint response.

**Status:** OPEN — was B1 in old list

### B-NEW-6 — Family IMF Passed hardcoded at 29% in Pipeline Summary 24h

Both quant + pattern paths show 29%. Quant's IMF passes > global filters passed (impossible). The 29% value appears literal — locate either the hardcode in `routes.ts` xstocks endpoint or in `FilterDiagnosticsPanel`/`xstocks-tab.tsx`.

**Status:** OPEN

### B-NEW-7 — "applicable [object Object][object Object]…" garbage row in 24h Rolling Aggregates

Object-stringification artifact after the "passed all" global-filter row. Likely something rendered as `${value}` where value is the `{imf, survivors}` shape from `buildFamilyPaths`. Remove the row.

**Status:** OPEN — was B6 in old list

### B-NEW-8 — Family path IMF totals broken in 24h Rolling Aggregates

Family fan-out total = 37k+; IMF survivors + VTS destination both = 18,492 = strong_trend_pass alone. Survivors row aggregates only one family (strong_trend) instead of summing all 5. Per-family field-name mismatch — aggregation loop only finds `strong_trend.survivors` and other 4 read undefined.

**Status:** OPEN

### B-NEW-9 — VTS Evaluation Detail math impossible

`total_strategy_evaluations − true_strategy_nulls − rejected_signals` > 0 (so some signals should generate), but `signals_generated = 0` AND `rejected = 0`. Counter-bucketing bug: signals being categorized into `true_nulls` even though they passed `strategy.detect()`, OR denominator overcounting fan-out. Map every increment site against field names the endpoint reads.

**Status:** OPEN

### B-NEW-10 — By Strategy panel shows only 6 of 10 strategies for xstock_spot

Missing 4 strategies — either their `detect()` returns null early before any counter call, or they're skipped by `isStrategyEligibleForLane`. Audit which 4 are missing on the panel against the canonical strategy list.

**Status:** OPEN — was B7 in old list (Kyle now sees 6, was 7 yesterday)

### B-NEW-11 — Setup Nulls % sum > 100% in 24h Rolling Aggregates

"Not yet instrumented" 14% + "No pattern detected" 93.3% = 107.3% (more buckets exist too). Percentages calculated against wrong denominator — likely each bucket divides by `non_eligible_strategies` (partial) rather than `total_strategy_nulls` (full pool).

**Status:** OPEN

### B-NEW-12 — Family Filter Mismatch denominator still off (frontend math)

Endpoint emits correct `vtsEvaluation.familyMismatchDenominatorTotal` since `f31fc18d6`, but frontend `client/src/pages/machine-learning.tsx` still divides `nullReasons.familyFilterMismatch` by `strategiesEvaluated` (eligibility-pass only).

**Status:** OPEN — was RUNNING_ISSUES #101 (Tier 3 cleanup) — reraised by Kyle EOD

### B-NEW-13 — No xstocks in open or closed simulated trades

Downstream consequence of B-NEW-9 (math impossible). If B-NEW-9 fixed → signals actually generate → trades flow. Verify-only after B-NEW-9 ships.

**Status:** OPEN — depends on B-NEW-9

### Sequencing plan (one-by-one per Kyle directive 2026-05-12 EOD)

| Step | Item | Why this order |
|---|---|---|
| 1 | B-NEW-1 (Global Filters 100%) | First — determines whether downstream symptoms are real or display-only. DB-row reseeding is the diagnose-then-fix path. |
| 2 | B-NEW-5 (undefined pairs scanned header) | Quick win; field-name fix. |
| 3 | B-NEW-2 (universe scanned total absent) | Same field-name class as B-NEW-5. |
| 4 | B-NEW-3 (family-qualified 0/—) | Counter-wiring class. |
| 5 | B-NEW-4 (pair-pool evals 0) | Same class as B-NEW-3. |
| 6 | B-NEW-6 (Family IMF 29% hardcoded) | Endpoint or panel hardcode. |
| 7 | B-NEW-7 ([object Object] row) | Quick render-bug fix. |
| 8 | B-NEW-8 (family path totals only strong_trend) | Endpoint aggregation bug. |
| 9 | B-NEW-9 (math impossible — signals=0) | Bigger investigation; counter audit. |
| 10 | B-NEW-10 (only 6 of 10 strategies) | Cleanest after B-NEW-9 maps counter sites. |
| 11 | B-NEW-11 (Setup Nulls > 100%) | Denominator fix. |
| 12 | B-NEW-12 (Family Filter Mismatch frontend) | Quick frontend swap. |
| 13 | B-NEW-13 (no xstock trades) | Verify-only after B-NEW-9 ships. |

### Mapping from old B1–B10 to new list / status

| Old | Disposition |
|---|---|
| B1 (undefined pairs scanned) | → B-NEW-5 |
| B2 (per-family detail rows missing — old "FAMILY PATH IMF BREAKDOWN") | Resolved by `8fd97b16e`/`ac38ac194`/`a7f494cc0` (familyPaths shape + prefix strip). Re-verify on staging. |
| B3 (Per-Family Breakdown T:0 R:0…) | Resolved or absorbed into B-NEW-3 / B-NEW-4 / B-NEW-8 — re-verify panel reads. |
| B4 (Family-Qualified Unique Pairs = 0) | → B-NEW-3 |
| B5 (Pair-Pool Evaluations = 0) | → B-NEW-4 |
| B6 ([object Object][object Object]) | → B-NEW-7 |
| B7 (only N of 10 strategies) | → B-NEW-10 |
| B8 (Crypto "Benchmarks Removed" mislabel) | Out of scope for xStocks tab session — separate ticket, leave for later. |
| B9 (static descriptive paragraph outdated) | Resolved by `1dd6b9e45` (description text updated). Re-verify on staging. |
| B10 (Universe Scanned 24h semantics — since-process-start) | Acceptable per prior agreement; B-NEW-2 separately wants the total displayed. |

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
