# External Data Architecture Placement

**Author:** Claude Code, 2026-04-22
**Status:** Architectural Decision Record. Pre-scope for B67/B68. Not an implementation spec.
**Supersedes:** §5 of `EXTERNAL_DATA_SOURCES_INVENTORY.md` — retains the decision, adds audit-backed detail.

---

## 1. Decision in one sentence

External data sources feed the **Market Context Engine (MCE), extended** — they do NOT feed the SQE, individual strategy detectors, or the RegimeClassifier directly. MCE becomes the single distribution point for all market-condition inputs (internal OHLC + external context), consumed by every downstream module.

## 2. Why NOT SQE

Reinforced by audit findings landed 2026-04-22:

- **SQE is currently broken.** Item 18 found FinalScore is anti-predictive in TFS regime (Pearson r = −0.017 overall, decile-9 WR 15.3% vs decile-1 WR 50.8%). PredictiveConfidence self-cancels (feeds both FinalScore gate easing AND ROI gate tightening). Adding external inputs to an anti-predictive scorer amplifies the failure mode, does not fix it.
- **SQE is the FINAL gate**, not a context layer. Feeding external data here means strategies and regime classifier remain blind to macro context — a well-informed gate filtering poorly-informed signals.
- **Modularization dividing line.** Item 15 §E.5 proposed 5 modules: Eligibility / Scoring Kernel / Threshold / Profitability / Ranking. Binding external-data ingestion to the Scoring Kernel couples two modules that should be independent.
- **Cadence mismatch.** SQE runs per-signal (sub-second). External sources run at their native cadences (funding rates: 30s, BTC dominance: 1h, DXY: 1m during market hours, OI: 60s). MCE already handles diverse cadences via per-symbol caching — that is its job.

## 3. Why NOT per-strategy

- Each strategy would re-implement ingestion, rate limiting, caching, staleness handling, and error paths. Massive duplication.
- Inter-strategy consistency would be impossible — two strategies using different staleness windows on the same funding-rate series would disagree on context.
- Rate-limit exhaustion — each strategy hitting an external API multiplies calls beyond any sensible budget.
- Testability — per-strategy API calls are harder to mock than a centralized context reader.

## 4. Why MCE extension IS the right placement

### 4.1 MCE is already the context distribution layer

Per `server/services/market-context-engine.ts`:
- `mce.computeContext(symbol, ohlcData, currentPrice, volume24h, smaPeriod, propagatedDbs)` is the canonical context read
- 60-second per-symbol cache (`cacheTTLMs: 60_000`)
- Consumers include `signal-orchestrator.ts` (3 call sites), `vts-runner.ts` (2 call sites), and scanner paths
- Already produces the `MarketContext` object that carries indicators, regime, DBS, volatility, momentum — every downstream consumer reads from here

Adding external fields to `MarketContext` extends the schema **without rewiring consumers.** Any module that already reads from MCE automatically has access to the new fields.

### 4.2 The directional-bias-store pattern proves this works

B63 Item 16 shipped `server/core/metrics/directional-bias-store.ts` — a persistent store for DBS with explicit staleness semantics (isStale flag, age-in-seconds, 5-row behavior spec). That pattern is already the template for how external data should be handled:

- Persistent, deterministic state
- Explicit staleness surfacing (not silent reuse)
- Ring-buffer history for audit / rolling-window consumers
- Cold-start / degraded / happy-path handling

External-data ingestion modules should implement the same pattern. Each source gets its own store (or registers into a shared external-context store), exposes the same isStale / ageSeconds semantics, and MCE consumes from it.

### 4.3 Cadence-awareness is already built in

MCE's per-symbol cache handles the common case of "recompute if data is stale." Extending MCE to consume external context with per-source cadences is a natural generalization — each external source registers its expected refresh interval, MCE reads the cached value if fresh, or re-fetches from the source store if expired.

## 5. Proposed architecture (extension diagram)

```
┌──────────────────────────────────────────────────────────────┐
│                  External Data Sources                       │
│  BTC dominance │ Funding rates │ OI │ DXY │ SPX │ News ...  │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│          External Context Store (NEW in B67)                 │
│  Per-source: latest value, timestamp, isStale, cadence       │
│  Pattern mirrors directional-bias-store.ts                   │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│       Market Context Engine (EXISTING, extended)             │
│  INPUTS:                                                     │
│   • OHLC, volume (existing)                                  │
│   • DBS from directional-bias-store (existing)               │
│   • External context from External Context Store (NEW)       │
│  OUTPUT: MarketContext object (schema extended with          │
│          external fields, isStale-flagged per source)        │
└──────────────────────────┬───────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┬──────────────┬─────────────┐
         ▼                 ▼                 ▼              ▼             ▼
   ┌───────────┐    ┌───────────┐    ┌───────────┐   ┌───────────┐ ┌───────────┐
   │  Regime   │    │  DBS      │    │ Strategy  │   │   SQE     │ │   Mode    │
   │Classifier │    │ routing   │    │ detect()  │   │           │ │ Overlay   │
   └───────────┘    └───────────┘    └───────────┘   └───────────┘ └───────────┘
```

## 6. Asset-class routing (required because Kyle wants x-stocks + perpetuals + FX)

**Key insight from the modularization discussion:** DawnTrader will soon add x-stocks and perpetual futures as Kraken-available asset classes, and eventually FX. Each has different applicable external sources:

| Asset class | Applicable external context | Not applicable |
|---|---|---|
| **Crypto spot** | BTC dominance, total crypto mcap, funding rates (related assets), on-chain flows | Equity market hours, SPX sessions, central bank calendar |
| **Crypto perpetuals** | All crypto spot sources PLUS funding rate of THIS contract, OI, liquidation cascades | Equity sources |
| **X-stocks** | DXY, SPX, sector ETF momentum, equity market hours, earnings calendar, central bank calendar | Crypto funding, on-chain flows, crypto dominance (mostly) |
| **FX (future)** | DXY, central bank calendar, rate differentials, risk-on/off indexes | Crypto-specific sources |

**Therefore:** MCE extension must route external fields by asset class. A crypto-spot trade's `MarketContext` should not include funding rates for a perpetual it's not related to, and a stock trade's context should not include BTC dominance.

**Proposed routing pattern:** the MCE consumes ALL external sources (single ingestion path) but presents a per-pair `MarketContext` that filters to asset-class-applicable fields. The asset class is a property of the pair (resolved from `screener_filters` or the pair's metadata) that selects which external fields appear in the context.

This satisfies both goals: single ingestion layer (no per-strategy plumbing) + asset-class-correct context at the consumption site.

## 7. Phasing

### Phase 1 — Shadow ingestion (B67 initial)

- Implement External Context Store for Tier 1 sources (multi-TF OHLC for same pair, BTC dominance, crypto mcap, funding rates)
- Extend `MarketContext` schema with the new fields — **default to null or isStale=true** until consumers opt in
- MCE starts populating the fields
- **No consumer branches on the new fields yet.** Data flows through, but behavior is unchanged.
- Observation: verify data quality, cadence correctness, staleness handling, no performance regression

### Phase 2 — Consumer wiring (B67 later + B68)

- Regime classifier optionally consumes BTC dominance as a secondary input (alts-regime adjustment)
- Strategies can gate on funding-rate extremes
- Mode overlay gets macro-stability as an additional input alongside regime stability
- Each consumer wiring is a separate PR with its own observation window

### Phase 3 — Calibration (post-B68)

- Measure lift of external-data consumers against baselines
- Drop sources that don't contribute
- Tier 2 sources (exchange flows, liquidations, DXY, SPX) enter scope conditional on Tier 1 showing lift

### Phase 4 — Asset class expansion (Phase 21.5 or later)

- Add asset-class routing to MarketContext presentation layer
- Per-asset-class module instances consume asset-class-appropriate fields
- X-stocks module can be built on top of the existing context surface because the routing dimension already exists

## 8. Cadence matrix (reference, not prescriptive)

| Source | Native cadence | Suggested MCE refresh | Notes |
|---|---|---|---|
| BTC dominance | Free API rate-limited | 1h | Slow-moving; hourly is plenty |
| Total crypto mcap | Same | 1h | Same |
| Funding rates (Binance/Bybit) | 8h settlement, but rate updates continuously | 30s | Fast-moving in volatile markets |
| Open interest | Per-exchange, free | 60s | Faster than funding because it accumulates positioning |
| Exchange flows (on-chain) | Block time (12s Eth, 10min BTC) | 2min | Per-chain |
| Liquidation cascades | Event-driven | Push via WS | Real-time ingestion; MCE reads cached latest |
| DXY | Every 1s during market hours, static nights/weekends | 1m | Market-hour aware |
| SPX | Same | 1m | Same |
| News sentiment | Varies (batch or streaming) | 5min | Noisy source; batch is fine |

The External Context Store holds the latest value per source with its cadence metadata. MCE reads the store; it does not fetch from external APIs directly.

## 9. Invariants (do not violate without governance update)

1. **MCE is the single distribution point for market context.** No consumer (SQE, strategy, regime, DBS, mode overlay) reads external APIs directly or holds its own external-data cache.
2. **Staleness flags propagate.** Every external field in `MarketContext` carries an isStale flag and age-in-seconds. Consumers must check isStale before branching on a value.
3. **Asset class routes.** Pair metadata determines which external fields appear in the pair's `MarketContext`. No crypto context for a stock trade; no equity context for a crypto trade.
4. **Default-null during shadow phase.** New fields are null until the source is validated and wired to a consumer. Never populate a field with a "reasonable default" — this violates the "no fallback" directive Kyle issued 2026-04-20.
5. **Rolling windows over snapshots for external distributions.** Per CLAUDE.md §5 rule 13 — if an external source produces a distribution (e.g. funding rate across exchanges), rolling-window measurement is required.

## 10. Dependencies

- **Requires:** B65 asset class schema work (formalizes the asset-class dimension on pair metadata)
- **Requires:** B66 SQE recalibration (do not extend SQE's surface while it's still broken — land B66 first, then allow SQE to optionally consume external fields)
- **Enables:** Phase 21.5 asset class expansion (x-stocks, perpetuals) because the context-routing dimension already exists
- **Follows on:** Item 19 cadence audit (when finalized — confirms MCE refresh cadences are compatible with external-source cadences)

## 11. Cross-references

- `Claude Comms and Packages/Scope Files/EXTERNAL_DATA_SOURCES_INVENTORY.md` — Tier 1-4 source catalog with cost/effort estimates
- `Claude Comms and Packages/Scope Files/B63_ITEM18_SQE_AUDIT.md` — evidence that SQE is the wrong placement
- `Claude Comms and Packages/Scope Files/B63_ITEM15_ADAPTIVE_FRAMEWORK_AUDIT.md` — 5-module proposal that this doc extends with a 6th "Context Provider" module
- `1-system-manual/SYSTEM_MANUAL.md` §B63.3 — directional-bias-store pattern that External Context Store mirrors

---

*End of Architecture Placement. This is the decision. B67 implementation scope can proceed without relitigating placement. When B67 scope doc is drafted, it should cite this as the architectural anchor.*
