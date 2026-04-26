# B67 / B68 External Data Integration — Design Analysis

**Date:** 2026-04-26
**Status:** Pre-scope design analysis. Per Kyle directive 2026-04-26: "this can't just be something that we add in to say, look, we've got external sources feeding into our system that we're considering, but not know how it helps us." Goal of this doc is to build the case for the work BEFORE writing the formal scope. Once Kyle is satisfied with the case, the actual scope is the next deliverable.
**Audience:** Kyle, Langston.
**Reference investigation:** codebase-wide review 2026-04-26 (agent report archived in this session's transcript).

---

## 1. The case in two paragraphs

The current system reads only OHLC data per pair. It can detect that a pair is moving up, down, or sideways, but it cannot detect WHY — whether the move is driven by sector capital rotating in (broad bullish backdrop) vs being squeezed by overleveraged positioning (reversal-prone) vs being dragged along by BTC's own move (no idiosyncratic edge). The 04-22 hostile-day evidence (B65.6 Phase A) showed exactly this blind spot — every pair looked moderately bullish per pair-level inputs, the classifier confidently routed to trend strategies, and the market reversed against the system because the bullishness was unsustainable at the macro level. No per-pair input could have caught this; the signal lived at the cross-asset level.

External data closes this gap by adding a thin layer of macro and microstructure context that the system currently has zero visibility into. Specifically: BTC dominance (sector rotation), perpetual funding rates (crowd positioning / squeeze risk), crypto market-cap momentum (capital inflow direction). These are not new strategies — they are filters and confidence weights that adjust how much we trust existing-strategy signals based on whether the market environment supports them. The work is small in code surface (most of the integration hooks already exist as dormant placeholders) but high in expected value because it addresses a failure mode that's already cost the system real money in observable cases.

---

## 2. What's already in the codebase (and why double-counting risk is low)

The agent investigation found that BTC is acknowledged in the system architecture but no actual BTC-correlation logic is active.

### What exists

- **`server/config/ranking-weights.ts:64-65`**: dormant BTC bonus rules in the ranking formula
  - `BTC_CONFIRMS_GLOBAL: +0.03` when pair regime aligns with BTC regime
  - `BTC_DISAGREES_GLOBAL: -0.02` when misaligned
  - **Currently never fires** because no code computes BTC regime separately
- **`server/config/benchmark-regex.ts`**: BTC recognized as Tier-A benchmark in the universe definition. Used for portfolio segmentation only, not for correlation logic.
- **`server/config/canonical-regime-strategy-map.ts`**: Some strategy descriptions mention "BTC Corr < 0.3" as a qualification. Purely descriptive — not enforced in code.

### What does NOT exist

- No code fetches BTC dominance, funding rates, open interest, or exchange flows.
- No code computes BTC-altcoin correlation in real time.
- No filter or score adjustment based on macro context.
- The Market Context Engine (`server/services/market-context-engine.ts`) docstring explicitly says: "MCE does NOT add new math beyond regime + indicators + directional bias."

### Double-counting risk assessment

**Low.** The two places BTC currently appears (ranking-weights bonus, benchmark classification) are inactive or descriptive. Once we activate the BTC regime computation as part of B67, the existing ranking-weights bonus naturally becomes the consumer of that computation — no new code path competes with it. The risk to manage is the inverse: we should DECOUPLE the filter use of BTC dominance (e.g., "pause new entries on alts when BTC dominance > 60%") from the ranking-weights bonus use, so we don't end up applying the same signal twice. This is a single-decision design choice, not a structural problem.

---

## 3. The specific gaps in current global state

`globalRegime` and `globalDBS` together capture intra-crypto sectoral direction (TREND_FRIENDLY_STABLE, RANGE_BOUND_STABLE, IMPULSE_EXPANSION, etc.) and the directional bias magnitude across the pair universe. They do NOT capture:

| Gap | What's missing | Why it matters | Concrete failure mode in our data |
|---|---|---|---|
| **Macro risk regime (risk-on/off)** | Whether capital is rotating IN or OUT of crypto as an asset class | A "bullish across all alts" reading from globalDBS can mean either real demand or capital being pushed temporarily into alts before flowing back to BTC. The system can't distinguish. | 04-22: 98% of pairs UP_MODERATE/STRONG, system routed to trend strategies, market reversed. Macro context (BTC dominance trending up) would have flagged risk-off rotation. |
| **Crowd leverage positioning** | Whether perpetual funding rates indicate overleveraged longs / shorts | Squeeze events happen when crowd is one-sided and price reverses. Per-pair vol doesn't see funding. | Some 04-22 trades stopped out within minutes of entry — pattern consistent with funding-driven liquidation cascade. |
| **Sector momentum direction** | Whether total crypto market cap is expanding (capital inflow) or contracting (outflow) | Per-pair momentum is local; total mcap momentum is the leading indicator for sector-wide moves | When mcap is contracting, even strong-looking trend setups fail because the broader pool is shrinking. |
| **Cross-asset risk regime (DXY)** | USD strength inversely correlates with crypto risk appetite | Crypto-only view misses USD-driven regime shifts | Several historical hostile days correlate with DXY breakouts; system has no view of this. |
| **Exchange flows (on-chain)** | BTC/ETH flowing TO exchanges = sell pressure incoming; OFF = accumulation | Leading indicator that price doesn't yet reflect | Tier-2; not in B67 scope but documented for B68. |

The summary point: the current system has high resolution on what individual pairs are doing and zero resolution on what the broader market regime is. External data is specifically the layer that fills this gap.

---

## 4. B67 — Tier-1 sources (the case for each)

### 4.1 BTC dominance

**What it adds:** The percentage of total crypto market cap held by BTC. A rising BTC dominance number means BTC is appreciating faster than alts (or alts are depreciating faster than BTC) — capital is rotating from alts INTO BTC. This is the canonical "risk-off within crypto" signal.

**Where it plugs in:**
- Activates the dormant `BTC_CONFIRMS_GLOBAL` / `BTC_DISAGREES_GLOBAL` ranking bonus in `ranking-weights.ts:64-65`. When BTC regime aligns with the pair's signal direction, +0.03 to ranking score; misalignment, −0.02.
- New SQE pre-filter gate (optional, tunable as `module_constants` entry): when BTC dominance is rising sharply (>X% in last N hours), throttle alt-trade entries since alts are likely losing relative value regardless of their per-pair signal.

**How it changes signals:** doesn't kill any signal outright; it adjusts ranking-weight (RTB queue priority) and optionally SQE gating. A pair with a strong individual signal but weak BTC alignment still trades but ranks lower; another pair with both individual + BTC alignment ranks higher.

**Effectiveness measurement (per §6 below):** in the drift dashboard, segment trades by `dataInputs.btcDominance` value bucket (e.g., dominance rising / flat / falling). Compare per-strategy WR across buckets. Hypothesis: alt-targeting strategies (vwap_pullback, mean_reversion) show higher WR in the dominance-falling bucket, lower WR in dominance-rising. If hypothesis holds, the filter has explanatory power.

**Source / cost:** CoinGecko free public endpoint (`/global` returns BTC dominance + total mcap + 24h change). Rate limit ~30 calls/min free tier — easily fits as a 60-second poll. No account required.

### 4.2 Crypto market-cap momentum

**What it adds:** The 24-hour and 7-day rate of change in total crypto market cap. Distinguishes "everything looks up because mcap is expanding" (real demand) from "everything looks up because there's a bubble in stables/BTC pulling alts" (synthetic).

**Where it plugs in:** mcap momentum becomes an MCE-level context value passed alongside `globalDBS` and `globalRegime` to strategy entry conditions. Strategies can optionally consume it; trend-rider strategies in particular gain a "mcap-confirmation" multiplier on signal confidence.

**How it changes signals:** a signal generated when mcap momentum is strongly positive (capital flowing in) gets a confidence bump; a signal generated when mcap momentum is negative (capital flowing out) gets a confidence reduction or a tighter gate.

**Effectiveness measurement:** correlate mcap-momentum bucket with realized trade outcome. If positive-mcap-momentum trades have materially higher WR than negative-mcap-momentum trades on the same strategies, the signal is real.

**Source / cost:** CoinGecko `/global` (same endpoint as dominance — free, one call covers both).

### 4.3 Perpetual funding rates

**What it adds:** Funding rates indicate which side of a perpetual market is paying which. Deeply positive funding = longs paying shorts, indicating overcrowded long positioning. Deeply negative = the inverse. Extreme readings on either side are reversal-risk signals.

**Where it plugs in:** new SQE pre-filter gate that downgrades or rejects entries when funding for the pair's perpetual market is in the top/bottom 5% of recent distribution. For pairs without a perpetual (some Kraken-only listings), the filter is a no-op.

**How it changes signals:** in the most squeeze-prone setups (long signal when funding is extremely positive), the filter rejects the entry entirely. Less extreme funding readings produce a confidence adjustment rather than a hard reject.

**Effectiveness measurement:** for trades that closed via stop_hit within the first 30 minutes (likely squeeze-driven), check what funding was at entry. If short-life stop-outs cluster at extreme funding readings, the filter has predictive power and would have prevented those entries.

**Source / cost:** Binance Futures public endpoint (`/fapi/v1/premiumIndex`) returns funding for all perpetuals. Free, 1200 weight units/min. Covers most-traded crypto perpetuals.

---

## 5. B68 — Tier-2 sources (briefer; conditional on B67 lift)

### 5.1 Exchange inflows / outflows (BTC, ETH on-chain)

Large flows from cold storage TO exchanges precede sell pressure; large flows OFF exchanges = accumulation. Leading indicator that price doesn't yet reflect.

**Where it plugs in:** macro signal layer same as BTC dominance. Affects ranking-weight bonus and optionally SQE gate.

**Source / cost:** CryptoQuant (paid, $30+/mo at lowest tier) OR Glassnode (paid, similar). No reliable free option for on-chain flow data.

### 5.2 Liquidation cascades

Real-time liquidation feeds from Coinglass or similar. When BTC liquidations spike on one side, expect contagion to alts within minutes.

**Where it plugs in:** circuit-breaker style — pause new entries for N minutes after a major liquidation event detected.

**Source / cost:** Coinglass (free tier limited; paid ~$50+/mo for full feed).

### 5.3 DXY + SPX cross-asset

US Dollar Index and S&P 500 as macro context for risk regime.

**Where it plugs in:** another input to the macro-regime-detection signal. Used at MCE level alongside BTC dominance and mcap momentum.

**Source / cost:** Alpha Vantage free tier (5 calls/min — sufficient for 60s polling of two symbols), or yfinance.

**B68 conditionality:** B68 should only be greenlit if B67 demonstrably moves the WR needle. If B67 produces a measurable lift in the drift-dashboard A/B comparison, B68 extends the same pattern. If B67 doesn't move the needle, B68 likely won't either and the work doesn't ship.

---

## 6. Measurement approach (how we know if this actually helps)

The agent investigation found that the drift dashboard infrastructure is ~80% ready for A/B measurement of external-data effectiveness.

### What's already there

- **`server/services/drift-dashboard-aggregator.ts`** already groups closed trades by `(strategy, regime)` and computes `winRate`, `avgNetPct`, `sumNetValue` per group.
- Closed trades are persisted to disk at `/home/deploy/dawntrader/logs/virtual_trades/*.json` per day.
- API endpoint `/api/analytics/drift-dashboard?window=rolling_24h|7d|30d|cohort_latest` already serves the segregated stats.

### What needs to be added (small)

- **Trade-log annotation:** add an `externalDataInputs` field to each closed-trade record:
  ```json
  {
    "strategy": "vwap_pullback",
    "regime": "TREND_FRIENDLY_STABLE",
    "netProfit": 1.50,
    "externalDataInputs": {
      "btcDominance": 45.2,
      "btcDominanceChange24h": 0.8,
      "fundingRate": 0.012,
      "mcapMomentum24h": 0.03
    }
  }
  ```
- **Drift-dashboard query enhancement:** segment results by `externalDataInputs` value buckets (e.g., dominance rising / flat / falling × funding extreme / normal). Output side-by-side WR comparison.
- **Optional UI:** add a "External Data A/B" tab to the existing Drift Dashboard page showing the segmented WR table.

### The A/B test that would justify B67 shipping

Run the system with B67 sources fetched + persisted to trade logs but NOT yet consumed by ranking/SQE. Collect 1-2 weeks of trades. Then:

1. Compute the would-have outcomes if the proposed gates had been active (counterfactual based on the persisted external data values at trade time).
2. Compare counterfactual WR to actual WR per (strategy, regime).
3. If counterfactual WR is materially higher than actual (say >3pp on a representative cohort), the gates have predictive power and should ship for active consumption.
4. If counterfactual WR is at or below actual, the gates aren't predictive and shouldn't ship — even though we collected the data.

This pattern is exactly what we should have done for the B65.4 ladder if we had the framework in place — collect data, validate counterfactual, ship only if validated.

### Why this matters for the case

This measurement design is the safety net Kyle's asking for. We don't ship blind. We collect data, validate against actual outcomes, and only enable the gates / weights that demonstrably improve outcomes. Worst case: B67 ships the data-collection layer, the validation shows no lift, we don't activate the gates, and we've spent effort on infrastructure that B68 (or future ML work) can still use.

---

## 7. Integration architecture (the natural plug-in points)

Per the agent investigation, the cleanest integration:

```
┌────────────────────────────────────────────────────────────────────┐
│ NEW (B67): External Data Service                                    │
│ - Fetches BTC dominance, mcap momentum, funding rates every 60s    │
│ - Persists to a per-day JSONL log + in-memory cache (60s TTL)      │
│ - Exposes getMacroContext() returning current values + recent      │
│   change deltas                                                    │
└────────────────────────────┬───────────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│ EXISTING: Market Context Engine (market-context-engine.ts)          │
│ - Add: subscribe to MacroContext at MCE init                       │
│ - Add: expose macroContext in MarketContext object alongside       │
│   regime / DBS / indicators                                        │
└────────────────────────────┬───────────────────────────────────────┘
                             │
        ┌────────────────────┴─────────────────────┐
        ▼                                          ▼
┌────────────────────────┐                ┌──────────────────────────┐
│ EXISTING: SQE pre-      │                │ EXISTING: Ranking-        │
│ filter gates            │                │ Weights formula           │
│ (signal_quality_eval)   │                │ (ranking-weights.ts)      │
│                         │                │                           │
│ NEW: optional gates     │                │ ACTIVATE: dormant BTC     │
│ on extreme funding      │                │ confirms/disagrees        │
│ or rising dominance     │                │ bonuses (already in code) │
└────────────────────────┘                └──────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│ EXISTING: Trade outcome telemetry                                   │
│ NEW: persist macroContext snapshot at trade entry → A/B measurement │
└────────────────────────────────────────────────────────────────────┘
```

**Decoupling discipline:** any external-data signal feeds either the SQE gate OR the ranking-weights bonus, never both. This avoids double-counting (the same signal influencing the same trade twice).

---

## 8. Decision points for Kyle before scope-writing

1. **Greenlight the case in §3 (the gap analysis)?** If the gap framing isn't right, the rest of B67/B68 should be re-thought.
2. **Tier-1 source selection: drop, swap, or keep all three?** BTC dominance + mcap momentum + funding rates is my recommendation. If you want to start narrower (just dominance + funding) to reduce surface area, that's a smaller batch.
3. **Ship-data-then-validate pattern (per §6) acceptable?** This is the "collect first, activate only if validated" approach. The alternative is "ship gates immediately and observe" which is faster but less safe.
4. **Decoupling discipline (§7) — agree that each external signal feeds either gate or bonus, never both?**
5. **Effort estimate:** B67 ~2 weeks (external data service + MCE integration + SQE/ranking hooks + telemetry annotation + drift-dashboard A/B segmentation). B68 conditional on B67 lift, additional 2-3 weeks.

If you're satisfied with the case, I'll write `BATCH_67_SCOPE.md` next. The scope will reference this doc as the design rationale.

---

## 9. References

- `server/config/ranking-weights.ts:64-65` — dormant BTC bonus
- `server/services/market-context-engine.ts` — natural integration point
- `server/services/drift-dashboard-aggregator.ts` — measurement infrastructure
- `Claude Comms and Packages/Scope Files/EXTERNAL_DATA_SOURCES_INVENTORY.md` — Tier 1 / Tier 2 source list
- `Claude Comms and Packages/Scope Files/EXTERNAL_DATA_ARCHITECTURE_PLACEMENT.md` — earlier design note (CC + Langston, B63 era)
- `B65_6_PHASE_A_CLASSIFIER_INPUT_AUDIT.md` and `B65_6_FINDINGS_PAPER.md` — evidence that per-pair-only inputs miss macro signals (the 04-22 case)

---

*Design analysis complete 2026-04-26. Awaiting Kyle decisions on §8 before writing `BATCH_67_SCOPE.md`.*
