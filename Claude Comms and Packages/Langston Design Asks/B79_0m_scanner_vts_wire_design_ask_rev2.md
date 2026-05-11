# B79.0m rev2 — Wire xstockSpotScanner through the VTS pipeline (passive learning)

**For:** Langston
**From:** Claude Code
**Date:** 2026-05-11
**Trigger:** Kyle 2026-05-11 directive correcting my rev1 framing. **VTS-only scope. Strip everything about signal-orchestrator / active-trading from rev1.** Passive learning is the only thing operating right now; it needs to work for xstock_spot.

## Why rev1 was off

Rev1 conflated active-trading-path-readiness with passive-learning-readiness. That confused the architecture and the prioritization. The signal-orchestrator is the active-trading dispatch surface; VTS observation is independent and is what produces the Layer-3 evidence we need NOW. Discard rev1's Option A/B/C framing — wrong frame.

## The corrected intention (Kyle's direct words, restated)

xstock_spot was always supposed to have its OWN 5-path pipeline mirroring crypto's pattern:

1. **Scanner cycle** (xstock-specific — already exists, line 240+ in `xstockSpotScanner.runCycle`, but currently exits at line 327 with telemetry-only)
2. **Global filter set** (xstock-specific config — what fields apply, what thresholds — **never built**)
3. **Quant family IMF filters** (asset-class-scoped thresholds; family taxonomy TFS/RBS/IE/HVU/ST is regime-based and unchanged)
4. **Pattern global filter** (xstock-specific stub of crypto's pattern-global)
5. **Pattern IMF filters** (asset-class-scoped)

From STRATEGY DETECT onward (MCE, SQE, persist, regime computation) the pipeline is IDENTICAL to crypto. What needs to be xstock-specific stops at the IMF gate.

**NO adaptive scan, NO ranking, NO ideal-vs-rotational pool split.** All 250 xstock pairs scanned in batched cycles — 50 or 100 per cycle is fine. Cycle cadence is the existing 30s tick subscription.

## What's actually missing (audit)

- **`xstockSpotScanner.runCycle` line 292 TODO** — never routes to anything past the freshness gate.
- **No xstock-specific global filter set authored.** `screener_filters` table has an xstock_spot row but is stub-quality (no max_price cap was applied; other fields not validated).
- **No xstock-specific quant-IMF / pattern-IMF threshold seeds** — module_constants has crypto-spot IMF rows but nothing for xstock_spot.
- **No shared per-pair "evaluate through VTS pipeline" entry point** — `runPhase10SimulationCycle` (`vts-runner.ts:2513`) hardcodes `getIdealPoolPairs()` (line 2545, "SOLE pair source for VTS") which is crypto-only.

## Corrected architecture

```
xstockSpotScanner.runCycle (existing cadence: every 30s)
    ↓ batch = next 50 symbols from XSTOCK_SPOT_SYMBOLS (full universe round-robin every 5 cycles = 2.5 min)
    ↓ freshness gate per pair (already exists)
    ↓
For each fresh pair: evaluateXstockPairForVTS(symbol, ohlcSlice, indicators)
    ↓ XSTOCK GLOBAL FILTER (new config, see §"Global filter field set" below)
    ↓ MCE compute (regime, DBS, family classification) — same code as crypto, asset-class-aware lookups
    ↓ QUANT IMF + PATTERN IMF (existing logic, threshold lookups asset-class-scoped)
    ↓ Strategy detect per regime (existing logic — ORB is xstock-only via internal guard; crypto strategies guard internally too)
    ↓ SQE evaluate (existing logic, asset-class-scoped thresholds)
    ↓ Persist signal_eval_archive + vts_open_trades with asset_class='xstock_spot'
```

The carve-out: extract everything from "global filter" through "persist" out of `runPhase10SimulationCycle` into a parameterized `evaluatePairForVTS(symbol, assetClass, ohlcSlice, indicators, regimeCtx)`. Crypto's existing autonomous-simulation loop calls the same function per its crypto pair. xstock scanner calls the same function per its xstock pair.

## Global filter field set proposal (xstock_spot)

From crypto's filter list, my pass at what applies vs doesn't:

| Field | Applies to xstock | Note |
|---|---|---|
| `min_volume` (USD daily volume floor) | YES | Different threshold — equity volumes are typically lower than top-tier crypto but higher than illiquid alts. Lean ~$100k/day starter. |
| `max_spread` (bid-ask spread cap) | YES | Equity spreads tight during RTH, looser pre/post. Use B74-archived tick data to set p95 ceiling. |
| `daily_range` (% daily range floor) | YES | Lower threshold than crypto — equities run 0.5-2% ATR vs crypto 2-8%. Lean 0.3% floor starter. |
| `min_price` ($ floor) | YES | $1 floor fits xstocks-as-tokenized-equity (fractional, $1 min). |
| `max_price` | **NO** | Kyle directive: no max_price cap for xstock. Already correct in current screener_filters row. |
| `history` (min candles available) | YES | Same as crypto — need enough OHLC for indicators. ~50 candles. |
| `stablecoin` gate | **NO** | N/A. |
| `quote_currency` gate | **NO** | All USD anyway. |
| `market_cap` (crypto on-chain mcap) | **NO** | Equity market-cap is a different concept; deferred to B79.6/B79.7 sector + fundamentals batch. |
| `guardrail_risk` (system-level position-concentration cap) | YES | Same logic; applies. |
| `correlation` (intra-pool correlation cap) | YES | But sector-aware version is deferred (RUNNING_ISSUES #96). Day 1 use symbol-similarity like crypto. |
| `already_active` (don't double-trade same symbol) | YES | Same logic. |

**Net new fields to seed:** 0 — all reusable. **Fields to wire NOT-APPLICABLE for xstock:** stablecoin, quote_currency, market_cap (return `applicable=false` from the filter function for xstock_spot).

## What I need from you

This needs to be **one round to consensus, not multiple.** Kyle is frustrated about iteration cost. Please reply concisely with:

**Q1.** Endorse or push back on the carve-out target: extract VTS evaluation body (global filter → MCE → IMF → strategy detect → SQE → persist) out of `runPhase10SimulationCycle` into `evaluatePairForVTS(symbol, assetClass, ohlcSlice, indicators, regimeCtx)`. Crypto's existing simulation loop becomes a wrapper that pulls crypto pairs + calls the same entry point per pair.

**Q2.** Endorse or push back on the global filter field set in §"Global filter field set proposal" above. Specifically:
   - `min_volume` $100k/day starter
   - `daily_range` 0.3% floor starter
   - 3 NOT-APPLICABLE gates (stablecoin / quote_currency / market_cap) handled by returning applicable=false rather than always-pass
   - threshold tuning deferred to Layer-3 evidence (post-shadow-mode-observation calibration)

**Q3.** Batch size: my lean is **50 pairs per cycle, full-universe sweep every 5 cycles (2.5 min)**. Alternative: 100 per cycle, full sweep every 3 cycles (1.5 min). Either fits Kyle's "I don't care, frequent enough" directive. Pick one — I'll seed it.

**Q4.** The 4 hidden assumptions you flagged in rev1 — DBS asymmetry, BTC-OHLC ref for defensive_hedge, setup-hash key collision, `_resolvedAssetClass` fallback to crypto_spot. Confirm they all still apply under the VTS-only scope. My answers:
   - DBS: shared eval entry point accepts `dbs: number | null`; xstock path passes `null`; downstream multipliers treat `null` as neutral (multiplier=1.0). Document explicitly.
   - BTC OHLC ref: gate by `assetClass !== 'xstock_spot'` inside defensive_hedge (single-line guard).
   - Setup-hash: change global Map key from `${symbol}:${strategy}` → `${assetClass}:${symbol}:${strategy}`. Mandatory fix in this batch.
   - `_resolvedAssetClass` fallback: verify XSTOCK_SPOT_SYMBOLS resolver entries exist before wiring (B79.0f collision work should have handled this — sanity-check anyway).

**Q5.** Scope size: with active-trading and signal-orchestrator stripped, my revised estimate is **200-300 LOC** (down from 350-500). Mostly: carve-out of `evaluatePairForVTS`, xstock global filter config + plumbing, scanner.ts integration, the 4 fixes above, unit tests. Reasonable single batch?

**Q6.** Verification post-deploy: `signal_eval_archive` accumulates xstock_spot rows over 24h (any non-zero count = wiring works), `vts_open_trades` gets xstock entries when strategies fire, Filter Diagnostics tab shows real (non-zero) counts in IMF / family / SQE / strategy-eval columns, crypto no-touch fence holds (factor cadence ±10%).

Reply: "Q1-Q6 endorsed" or numbered revisions. **Target: one round to consensus.**

## Read path

- Confirm rev1's diagnosis still stands (it does — scanner.ts:292 TODO + DB confirms zero xstock signal_eval_archive rows lifetime).
- `/mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/server/asset_classes/xstock_spot/scanner.ts` line 292
- `/mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/server/services/vts-runner.ts:2513` (runPhase10SimulationCycle, the carve-out target)
- `/mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/server/routes.ts:7036-7159` (the mis-wired diagnostics endpoint to fix)
