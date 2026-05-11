# BATCH 79.0m.b2 — Pre-Implementation Audit

> **Status:** DRAFT — awaiting Kyle review, then Langston Step 2 review per CLAUDE.md §2.
> **Author:** Claude Code
> **Created:** 2026-05-11 (immediately after the B79.0m.b banner-removal commit `1badd5391`)
> **Resolves:** All open issues in `Claude Comms and Packages/Batch Completion/XSTOCKS_DIAGNOSTICS_TAB_FIXES.md`, plus the architectural gap that should have been built in B79.0a.

## 🚨 PREVIOUSLY-STATED-VS-NOW (per CLAUDE.md §9.2)

| Topic | Previously stated | Now | Reason |
|---|---|---|---|
| B79.0m.b "pipeline wired" status | "Pipeline is wired and 14 trades opened on staging" (claimed multiple turns) | **Pipeline is wired but ZERO actual xstock VTS trades have opened.** All 14 signal_eval_archive rows are artifacts of my eval-cycle wrongly calling SQE — see below. | Verified against `vts_open_trades WHERE asset_class='xstock_spot' = 0 rows`. |
| Whether VTS calls SQE | (implicit assumption) eval-cycle gates signals through SQE before opening VTS trade | **VTS DOES NOT CALL SQE. Hasn't in months. Confirmed via grep: `vts-runner.ts` has zero references to `evaluateSignalQuality` or `getSQEThresholds`.** My xstock eval-cycle was wrongly invoking SQE; that produced all 14 archive rows labeled `reject_stage='sqe'`. Remove the SQE call → signals flow through to trade-open. | Kyle correction 2026-05-11. Crypto VTS path runs strategy detect → Net-EV-floor check → `registerOpenVtsTrade`. SQE is exclusively in the active-trading signal-orchestrator path. |
| Asset-class architecture parity with crypto | "xstock has the family IMF gates (5 paths × thresholds)" — true | **xstock is missing the parallel pattern path AND the family-fanout routing.** Crypto has both; xstock has only the IMF-gate-check (any-family-passes admits). | Pre-B79.0a Kyle+Langston design discussion explicitly included parallel pattern + 5 quant family paths. Missed in implementation. |
| Crypto Filter Diagnostics "Benchmarks Removed" stat | "Mislabeled excludedByRouting counter" (my earlier turn claim) | **CORRECTED:** Field is `benchmarkBypassed` (fx5-scanner.ts:1377): `Object.values(familyPoolSurvivors).reduce((s, arr) => s + arr.filter(s => s.isBenchmark).length, 0)` — counts benchmark pairs that PASSED global + IMF filters and are in the survivor pool. UI label "Benchmarks Removed" is wrong; those benchmarks are NOT removed (B62 directive 2026-04-16 included them in VTS), they survived. The UI further compounds the error by computing `VTS Destination = survivors - benchmarkBypassed` — a subtraction that doesn't match reality. | Kyle hypothesis correct 2026-05-11. The counter conflates "benchmarks that passed filters" with "benchmarks removed by benchmark-specific functionality". Actual benchmark-removal counter (when re-enabled) needs a separate field. |

---

## 1. Verified ground truth (DOM-extracted from staging UI 2026-05-11)

### Open VTS trades + closed VTS trades 7d (from Kyle's CSV exports)
- Open: 151 rows, **all `crypto_spot`** (zero xstock). Includes benchmarks: BTC/USD ×1, ETH/USDT ×2.
- Closed 7d: 1087 rows, **all `crypto_spot`** (zero xstock). Includes benchmarks: BTC/USD ×2, multiple ETH variants ×28+.
- **Conclusion:** Benchmark trades exist in production VTS (confirms removal is off); xstock pipeline has produced zero closed-loop trades.

### xstock signal_eval_archive (2-hour window, queried directly)
```
xstock_spot | inside_bar_reversal | strategy_internal |   517
xstock_spot | mean_reversion      | strategy_internal |   517
xstock_spot | morning_star        | strategy_internal |  9526
xstock_spot | orb                 | strategy_internal |  8363
xstock_spot | pivot_shift         | strategy_internal |  9526
xstock_spot | range_trade         | sqe               |    14
xstock_spot | range_trade         | strategy_internal |  5522
xstock_spot | vwap_pullback       | strategy_internal |  1163
```
- 7 strategies firing in archive (matches UI display).
- Only `range_trade` has produced signals that passed strategy detect (14 SQE-stage rows = passed detect → SQE evaluation).
- ALL 14 were rejected by SQE with reason `"FinalScore 0.0000 < 0.35 (quant threshold)"`. **finalScore=0 means strategy detect is returning signals without a populated finalScore field, OR eval-cycle isn't reading the field correctly.**
- Pattern strategies (`morning_star`, `inside_bar_reversal`, `pivot_shift`) NEVER produce signals because patternInput=null — they always return `no_pattern`.

### crypto Filter Diagnostics tab — what the "Benchmarks Removed" stat actually shows
From `fx5-scanner.ts` lines 1298-1342, the `familyImfDiagnostics` aggregate has a field `excludedByRouting` that counts pairs skipped because of DBS-based routing (e.g., non-strong-DBS pairs skipping the `strong_trend` family lane). This is **NOT benchmark removal**. The UI labeling on the Filter Diagnostics tab maps this field to "Benchmarks Removed" — incorrect mapping.

---

## 2. Scope of B79.0m.b2

This batch implements what should have shipped in B79.0a per the pre-batch design discussion Kyle + Langston had:

### 2.1 — Architectural rework of `eval-cycle.ts` (xstock_spot)

Bring xstock-side eval to crypto-parity. Required changes:

#### (a) Parallel pattern path
- Build `server/asset_classes/xstock_spot/pattern-filter.ts` (~60 LOC) — global filter scoped to xstock pattern path, reading from `screener_filters` rows with `filter_path='vts_pattern'` / `'active_pattern'` (must seed these rows; B79.0m.a only seeded quant rows).
- In `eval-cycle.ts`, for each fresh pair, run `scanPatterns()` on the OHLC (already imported by crypto's `runPhase10SimulationCycle`).
- Pairs with detected patterns → pattern global filter → pattern IMF gate → pattern strategies (`morning_star`, `inside_bar_reversal`, `pivot_shift`) invoked with `patternInput = the detected pattern signature`.
- Pairs without patterns → skip pattern path; quant path only.

#### (b) Family-fanout routing in quant path
- Currently: pair passes any 1 of 5 family IMF gates → admitted, then all regime-eligible strategies evaluated.
- New: for each family the pair passes, fan-out a separate evaluation entry. Strategy iteration becomes per-family-tagged. Strategy's `STRATEGY_FAMILY_MAP` determines whether it runs for this family-routed entry (e.g., `range_trade` is in `reversal` family — only runs on entries tagged with reversal-pass).
- This matches crypto's `taggedVtsSurvivors` from `collectAdaptiveBatch` where each entry is one pair × one family.

#### (c) Remove the SQE call entirely from eval-cycle (corrected scope)
- **Crypto VTS does not call SQE.** My xstock eval-cycle wrongly invoked `evaluateSignalQuality` — that's where the artificial 14 "rejections" came from.
- Replace the SQE call with the crypto pattern: strategy detect → Net-EV-floor check (`VTS_NET_EV_FLOOR`) → `registerOpenVtsTrade`.
- After the SQE removal, finalScore still matters because the open-trade record stores it and TEC + downstream ML reads it. Call `computeFinalScore(symbol, regime, indicators, ...)` caller-side AFTER detect returns a signal (mirrors crypto `generatePhase10Signal` line ~1057). This populates the trade record correctly even without SQE in the path.

### 2.2 — Seed missing screener_filters rows
- `(mode='paper', asset_class='xstock_spot', filter_path='vts_pattern')` — pattern global config
- `(mode='live',  asset_class='xstock_spot', filter_path='active_pattern')` — pattern global config (for future)
- Pattern IMF row: also under same paths if pattern IMF uses different thresholds than quant; otherwise the family-IMF rows already cover.

### 2.3 — UI fixes on xStocks tab (`client/src/components/machine-learning/xstocks-tab.tsx` and sub-components)

| UI bug | Root cause | Fix |
|---|---|---|
| "**undefined** pairs scanned" in Last Scan header | Component reads `lastScan.scannedCount` but the field name in the response is something the React component doesn't recognize, OR the value is undefined at render time | Identify the exact field-name match between API response and React prop; ensure render fallback to 0 if undefined |
| "Family-Qualified (Unique Pairs) **0**" while crypto shows real number | API field `familyQualifiedUnique` exists; UI is reading a different field name OR not reading at all | Map UI prop to `lastScan.familyQualifiedUnique` (and the 24h equivalent) |
| Per-family detail rows MISSING entirely from xStocks "FAMILY PATH IMF BREAKDOWN" (crypto shows 5 rows: Trend/Reversal/Breakout/Oscillator/strong_trend with LQ/VN/DI splits) | UI component doesn't iterate the API's `lastScan.familyPerMetric` object | Add per-family row iteration in the React component, mirroring crypto component's family-paths rendering |
| Pipeline Summary "Per-Family Breakdown T:0 R:0 B:0 O:0 S:0" | UI reads from a non-existent per-family sum field | Sum `rolling24h.aggregated.familyPerMetric.<fam>.passed` and surface |
| "Pair-Pool Evaluations 0" in Pipeline Summary vs 25,105 in 24-Hour Rolling Aggregates below | UI reads two different fields for the same concept | Route both UI cells to the same in-memory aggregate field |
| `[object Object][object Object]` for `applicable` cell | UI tries to render the applicability flags object as a string label | Hide the row when `applicable` object is present (it should suppress render of the parent row entirely, not display) |
| 7 strategies shown when 10 are enabled | `byStrategy` aggregate only includes strategies that have been called at least once. Strategies `breakout`, `sma_trend_ride`, `vwap_bounce` are enabled (DB strategy_gates row) but never invoked because their regime-mapping doesn't currently route into them | INVESTIGATE: query xstock regime classifier outputs over 24h; identify which regimes are hit; cross-reference `CANONICAL_REGIME_STRATEGY_MAP` to see if the 3 missing strategies appear in any of those regime sets. If not, document why; if yes, debug regime-routing pipeline |

### 2.4 — UI fix on crypto Filter Diagnostics tab + xstocks tab (parallel fix)

| UI bug | Root cause | Fix |
|---|---|---|
| "Benchmarks Removed: 181,360" rendering when crypto benchmark removal has been disabled since B62 (2026-04-16). Same mislabel will land on xStocks tab once benchmark counter is wired there. | UI label maps to `benchmarkBypassed` field which counts benchmarks IN the survivor pool (i.e., not removed — survived filters). UI further computes `VTS Destination = survivors − benchmarkBypassed` which understates VTS destination by the benchmark count. | Two-part fix per Kyle directive 2026-05-11: (1) Rename the existing UI cell from "↳ Benchmarks Removed" to "↳ Benchmarks Surviving Filters" (or "Benchmarks in Pool") — accurate; remove the broken subtraction in VTS Destination computation. (2) Add a NEW "↳ Benchmarks Removed (benchmark-specific exclusion)" line that reads from an actual benchmark-removal counter (currently always zero on both crypto and xstock since the removal function is off — that's the desired state per Kyle, so the metric is visible-but-zero, ready to count if removal is ever re-enabled). |

### 2.5 — `getOHLCSourceForTrade` exit-path helper (Langston R1, deferred from B79.0m.b)

When the first xstock trade does eventually open, the TEC exit loop currently reads OHLC from crypto's live-pricing cache. Will silently fail / look up wrong cache for xstock. Helper needs to dispatch by `trade.assetClass`. Required BEFORE any xstock trade can be safely held to close.

---

## 3. Verification gates (post-implementation)

| Gate | Acceptance criterion |
|---|---|
| G1 CI | Build + Docker green; new b79-0m-b2 unit tests green |
| G2 DB seeds | Pattern path screener_filters rows confirmed via psql for both mode='paper' and mode='live' |
| G3 PM2 logs | New per-cycle log includes `pattern_path=` and `family_fanout=` counters; finalScore propagation visible in log |
| G4 xstock signals fire | After RTH open, signal_eval_archive accumulates `reject_stage='admitted'` rows (= SQE-passed) with finalScore > 0.35. At least one trade opens AND closes within 24h **OR** synthetic-injection test demonstrates exit path |
| G5 UI panels populate correctly | UI-verified via Claude-in-Chrome: scannedCount renders integer (not "undefined"); per-family rows render in FAMILY PATH IMF BREAKDOWN; per-family Pipeline Summary breakdown shows real T/R/B/O/S numbers; pair-pool evaluations consistent between Pipeline Summary and 24h Rolling sections; applicable object suppressed (not [object Object]); 10 strategies visible OR investigation comment if 3 are genuinely never invoked |
| G6 Crypto Filter Diagnostics relabel | UI shows "DBS Routing Excluded" with the 181k+ count; separate "Benchmarks Removed" line shows 0 |
| G7 Exit-path helper unit-tested | xstock branch and crypto branch both pass |
| G8 Crypto no-touch fence | 10 factor families × 7-8/hr ±10% unchanged |

---

## 4. Open questions for Langston

**Q1.** **Pattern IMF thresholds**: clone from crypto's `vts_pattern` row, OR seed xstock-specific values? Lean clone-then-iterate (Layer-1 starter pattern matches the family-IMF approach in B79.0m.a).

**Q2.** **Family-fanout duplicate-counting semantics**: in crypto, "fan-out" means a pair admitted by 3 families = 3 entries in the VTS batch. Each entry runs its family's strategies. If multiple families admit the same pair AND the families share an eligible strategy (rare via STRATEGY_FAMILY_MAP), should the strategy run multiple times or be deduped? Crypto's behavior assumed.

**Q3.** **finalScore computation for xstock**: `computeFinalScore` in vts-runner takes regime + strategy + indicators. Confirmed asset-class-agnostic, OR does it have hidden crypto assumptions we need to surface?

**Q4.** **VTS Net-EV-floor for xstock**: crypto uses `VTS_NET_EV_FLOOR` (single global constant). Reasonable for xstock to share, OR per-asset-class? Lean share.

**Q5.** **Banner state**: removed per Kyle directive 2026-05-11. Confirmed.

---

## 5. Out of scope for this batch (defer)

- Per-strategy threshold authoring for 9 non-ORB strategies (still wildcard; B79.0m.b2 ships with wildcard rows, calibration happens post-RTH evidence)
- Regime classifier 4 remaining branches (RBS/IE/HVU/ST) — TFS authored only; others use wildcard
- Asset-class log tagging refactor (consistent `[B79.0m.b2][EVAL][xstock_spot]` prefix everywhere)
- Skipped-signals asset_class filter (Filter Diagnostics tab co-mingling) — separate small fix
- 18-strategy null-DBS unit-test matrix
- Comprehensive G1-G9 verification doc

---

## 6. Implementation order

1. Seed pattern screener_filters rows (paper + live)
2. Build `pattern-filter.ts` + `pattern-imf-evaluator.ts` 
3. Refactor `eval-cycle.ts` for family-fanout routing
4. Fix finalScore propagation (call `computeFinalScore` post-detect)
5. Add `getOHLCSourceForTrade` exit-path helper
6. UI fixes on xStocks tab component (field names, per-family rendering, applicable object suppress, scannedCount)
7. Crypto Filter Diagnostics tab relabel
8. Investigate strategy count 7-vs-10 (regime mapping audit)
9. Deploy + UI verification via Claude-in-Chrome (no curl-only verification per CLAUDE.md §9.3)
10. Tests + completion report + governance

---

*End of pre-audit. Awaiting Kyle approval to send to Langston for Step 2 review.*
