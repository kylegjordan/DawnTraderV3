# B79.0m — Wire xstockSpotScanner through VTS evaluation pipeline (resolves #92, REPRIORITIZED to top)

**For:** Langston
**From:** Claude Code
**Date:** 2026-05-11
**Trigger:** Kyle directive 2026-05-11 — xStocks open Monday post-weekend, scanner runs, but **zero xstock entries in `signal_eval_archive` (151 rows in 24h, all crypto_spot)** and **zero xstock entries in `vts_open_trades`**. Filter Diagnostics tab shows 0 IMF / 0 VTS evaluations / 0 signals / 0 trades for xstock_spot. Top priority — Kyle wants this fixed before any other deferred work (including B79.3 macro modifiers).

## What I confirmed at the keyboard

1. **`server/asset_classes/xstock_spot/scanner.ts:292`** has the explicit TODO:
   ```ts
   // TODO B79.x: route fresh pairs into signal-orchestrator / strategy-engine.
   // Day 1 = observability only; Layer-3 threshold calibration drives the
   // downstream wiring decision.
   ```
   `runCycle` does freshness gating + telemetry counters; never dispatches.

2. **DB confirmation (staging Supabase):**
   - `signal_eval_archive` lifetime xstock_spot rows: **0**
   - `signal_eval_archive` last 24h: 151 rows, all `crypto_spot`
   - `vts_open_trades WHERE closed=false`: all `crypto_spot` (verified via Kyle's CSV + DB query)

3. **PM2 log:** `[HF6][VTS] <crypto-pair>: Strategy orb returned null` floods every cycle. ORB is being dispatched against CRYPTO pairs in the VTS runner because `activeStrategies` contains `'orb'` globally; ORB returns null via its internal asset-class guard. Wasted compute, correct output. Reading the runner's source line ~1028 confirms `callStrategyDetect(strategy, ..., symbol, _resolvedAssetClass)` does threadassetClass through (B79.0j followup landed) but the runner's pair-iteration set never includes xstock symbols — they're only in `xstockSpotScanner`'s parallel cycle.

4. **The Filter Diagnostics "Global Filters Passed: 380" is mis-labeled** — `routes.ts:7144` puts `passed_all_filters: universe24h` (= `COUNT(DISTINCT symbol) FROM xstock_spot_ticker_snap WHERE captured_at > NOW() - INTERVAL '24 hours'`) into a field labeled as a filter-pass count. The 322,985 "Universe Scanned" is `COUNT(*)` of ticker snap rows. Both are archive-feed metrics, not pipeline-pass metrics. Labels lie about HONEST signaling.

## Why #92 was mis-deferred

RUNNING_ISSUES #92 was re-tagged from B79.x → "Phase 19 prerequisite" on 2026-05-10 with rationale "active trading doesn't turn on until Phase 19, so funnel-rejection counters can't be meaningfully tested until then." That rationale was wrong. **VTS observation is independent of active trading.** Layer-3 ablation evidence — which Phase 19 active-trading decisions key off (per-asset-class TEC config, friction calibration, regime threshold tuning, B73 + B67.0 ablation panels) — REQUIRES the VTS pipeline to actually run for xstock pairs. Deferring to Phase 19 makes the deferral self-contradictory. Kyle is correct to repriorize.

## Architectural options for the fix

### Option A — scanner-drives-VTS (clean, asset-class-encapsulated)

In `xstockSpotScanner.runCycle`, after the freshness gate, iterate the fresh-pair list and call into a shared VTS evaluation entry point (e.g., a new `evaluatePairForVTS(symbol, assetClass, ohlcSlice, indicators, regimeContext)` exported from `vts-runner.ts`) with `assetClass='xstock_spot'`. Each asset class's scanner remains responsible for its own freshness + universe; the shared eval entry point owns IMF/family-filter/SQE/strategy-detect/persist.

- **Pros:** clean asset-class encapsulation; future asset classes follow the same pattern; no fork in cycle ownership.
- **Cons:** requires a shared eval entry point in `vts-runner.ts` if one doesn't already exist (current path is the autonomous-simulation loop, which owns its own pair batching).
- **Risk:** the shared entry point becomes the single integration surface for all future asset classes — needs to be designed cleanly first time.

### Option B — vts-runner-pulls-from-scanner (lighter, less encapsulated)

Have `vts-runner`'s autonomous-simulation loop pull from BOTH `marketScanner` (crypto) AND `xstockSpotScanner` outputs each cycle, evaluating each fresh pair with the resolved assetClass.

- **Pros:** minimal scanner-side change; the runner already owns the eval-pair loop.
- **Cons:** runner becomes asset-class-aware in a way that breaks the encapsulation pattern Phase 24 established (each asset class owns its own scanner). Adds a "second source of truth" for which pairs to evaluate.
- **Risk:** every future asset class onboarding has to remember to wire into the runner's pull loop, not just stand up its own scanner.

### Option C — hybrid: scanner-pushes-into-runner queue (Day 1) + shared eval entry point promotion (later)

Day 1: `xstockSpotScanner.runCycle` pushes fresh xstock pairs into a shared in-process queue the runner drains each cycle. Future cleanup: promote the queue into a proper shared eval entry point.

- **Pros:** ships fastest; preserves both ownership patterns short-term.
- **Cons:** queue-based coupling is a transitional pattern; technical debt unless promoted.
- **Risk:** "we'll promote later" patterns rarely get promoted. **§15 NO PATCHES would lean against this.**

## My recommendation: Option A

The Phase 24 architectural pattern is "each asset class owns its own scanner; shared services accept `assetClass` param." Option A extends that pattern cleanly. The shared `evaluatePairForVTS(symbol, assetClass, ...)` entry point is the natural next surface — and we can use the same factory pattern as `getXstockSpotInstances()` if any per-asset-class triad state matters.

**Sub-objectives in scope:**
1. **Carve out shared eval entry point** in `vts-runner.ts` — `evaluatePairForVTS(...)` that runs IMF + family filter + SQE + strategy-detect + persist for a single (symbol, assetClass) pair given pre-fetched OHLC + indicators. Refactor existing autonomous-simulation loop to call this same entry point per pair.
2. **xstockSpotScanner.runCycle integration** — after freshness gate, fetch OHLC + indicators per fresh xstock pair (5-min lookback from the same `xstock_spot_ticker_snap` source already used by the scanner), call `evaluatePairForVTS(symbol, 'xstock_spot', ...)`.
3. **Remove cosmetic `[HF6][VTS] Strategy orb returned null` log spam** — ORB should only be dispatched when `resolvedAssetClass === 'xstock_spot'` at `vts-runner.ts:1028`-ish call site. Move the asset-class guard up the call chain so we don't even call `detectORB` for crypto pairs.
4. **Fix Filter Diagnostics endpoint labels** at `routes.ts:7044-7159` — `passed_all_filters: universe24h` is dishonest. Replace with actual orchestrator-side filter-pass counts (will be populated once orchestration runs). The "Universe Scanned 322,985" should remain as ticker-snap count (truthful descriptor) but the column header should say "Ticker Snaps (24h)" not "Universe Scanned."
5. **Verification post-deploy:**
   - `signal_eval_archive` accumulates xstock_spot rows
   - `vts_open_trades` gets xstock_spot entries when ORB or any xstock-eligible strategy fires
   - Filter Diagnostics tab shows real non-zero IMF / family / SQE / strategy-eval counts
   - Crypto path unchanged (regression-locked by no-touch fence query)

## Questions for you

**Q1.** Does a shared eval entry point already exist somewhere in `vts-runner.ts` that I missed? If yes, Option A is cheaper than I assumed.

**Q2.** Are there hidden assumptions in the current crypto-only VTS loop that would break if we pass `assetClass='xstock_spot'` through? Specific candidates: friction lookup (already asset-class-scoped per B69), regime threshold lookup (already asset-class-scoped per B79 work), SQE thresholds (already asset-class-scoped per B79.0a). I think we're clean but want your sanity check.

**Q3.** Pre-fetch path for xstock OHLC: the crypto VTS loop uses live-pricing-adapter + cached 1m OHLC. xstock uses `xstock_spot_ticker_snap` (last-tick only) + `xstock_spot_ohlc_1m` (archive). Should I:
- (a) build the OHLC slice on demand from `xstock_spot_ohlc_1m` per fresh pair per cycle (5-min lookback); or
- (b) maintain a cached in-memory OHLC slice updated from B74 archive cycle?

Lean (a) for Day 1 — simpler, archive lookup is fast on partitioned table with index — but want your design call.

**Q4.** ORB direct-dispatch path: B79.0d shipped ORB through strategy-engine's direct dispatch with triple-defense guard, NOT through signal-orchestrator. B79.0j followup added it to VTS-runner's callStrategyDetect. Now if we route xstock through the full VTS pipeline, ORB should fire via that path. Should we **deprecate the strategy-engine direct dispatch path for ORB** as part of this batch, or leave it (with a comment) for a future cleanup? Leaning DEPRECATE — two dispatch paths is a foot-gun.

**Q5.** Scope size estimate: I'm guessing ~150-250 LOC across 4-5 files (`vts-runner.ts` carve-out, `scanner.ts` integration, `routes.ts` label fix, ORB dispatch consolidation, unit tests). Probably 2 separate review cycles (Step 1 scope, Step 2 pre-audit) given the surface. Reasonable, or should I split into 2 sub-batches?

**Q6.** Sequencing vs B79.3 (macro modifiers): Kyle confirmed B79.0m is top priority over B79.3. Should B79.3 sequence after B79.0m closes, or can they run in parallel (different files)? They touch different code; technically parallel-safe. Lean sequential to keep scope-of-change small per batch.

## Read path for you

Confirm my line-citations:
- `/mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/server/asset_classes/xstock_spot/scanner.ts` lines 240-335 (specifically the TODO at line 292)
- `/mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/server/services/vts-runner.ts` autonomous-simulation entry around line 3291 + callStrategyDetect at line 782 + the call site at line 1028
- `/mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/server/routes.ts:7036-7159` (the xstocks filter-diagnostics endpoint with the misleading labels)
- `/mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/1-system-manual/RUNNING_ISSUES.md` #92 + #94 (newly-added B79.3 tracker) + the new Tier-1 audit section

Reply with: pick of A/B/C; answers to Q1-Q6; any other blast-radius concerns I haven't surfaced.
