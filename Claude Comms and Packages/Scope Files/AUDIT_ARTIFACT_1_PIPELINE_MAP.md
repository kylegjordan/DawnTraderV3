# Artifact 1 — Dependency / Order-of-Operations Map

**Audit**: Strategy-Family Filter Profiles
**Date**: 2026-03-23
**Status**: Complete

---

## Current Pipeline (Active Trading Path)

```
FX5 Scanner Start (every 30 seconds)
│
├─ [1] OHLC Fetch — 300 pairs from Kraken API
│   └─ Populates ohlcCache (5-min TTL) + priceCache
│
├─ [2] Quant Global Filters (from DB: active_quant row)
│   ├─ minVolume: $500,000
│   ├─ maxBidAskSpread: 0.50%
│   ├─ minPrice: $0.25
│   ├─ minMarketCap: $250M
│   ├─ minHistoryDays: 30
│   ├─ excludeStablecoins: true
│   └─ Output: ~150-200 survivors → quantGlobalSurvivors[]
│
├─ [3] Pattern Global Filters (from DB: active_pattern row)
│   ├─ minVolume: $250,000
│   ├─ maxBidAskSpread: 1.00%
│   ├─ minPrice: $0.25
│   ├─ minMarketCap: $100M
│   ├─ minHistoryDays: 14
│   ├─ excludeStablecoins: true
│   └─ Output: ~100-150 survivors → patternGlobalSurvivors[]
│
├─ [4] Quant IMF Filters (from DB: active_quant row)
│   ├─ LQ ≥ 35
│   ├─ VN ≤ 0.93
│   ├─ CORR ≤ 0.92
│   ├─ (DI not applied in quant IMF — only in pattern IMF)
│   └─ Output: ~60-80 survivors → activeFilterPool.quantPool
│
├─ [5] Pattern IMF Filters (from DB: active_pattern row + regime override)
│   ├─ LQ ≥ 20
│   ├─ VN ≤ 0.98
│   ├─ DI ≥ 30 (regime-adjusted: 20-35)
│   └─ Output: ~3-10 survivors → activeFilterPool.patternPool
│
├─ [6] Tag pairs with sourcePool ('quant' or 'pattern')
│   └─ Current behavior: pairs surviving both → tagged 'quant' (higher quality path)
│   └─ **OPEN DESIGN QUESTION**: With family-aware filtering, a pair surviving
│       multiple family paths should retain ALL family tags, not be forced into one.
│       This is a design decision for the implementation batch, not an audit finding.
│
Signal Orchestrator Start
│
├─ [7] VN Veto (from DB: active_quant.vnMax = 0.93)
│   └─ Reject pairs with VolNoise > vnMaxVeto BEFORE MCE
│
├─ [8] MCE Computation (per pair, 60s cache TTL)
│   ├─ Inputs: OHLC data, currentPrice, volume24h
│   ├─ Outputs: regime, allowedStrategies, indicators, directionalBias
│   └─ Pure compute — no DB, no API calls
│
├─ [9] Regime-Strategy Intersection
│   ├─ regimeStrategies = CANONICAL_REGIME_STRATEGY_MAP[regime]
│   ├─ activeStrategies = enabledStrategies ∩ regimeStrategies
│   └─ Typically 3-4 strategies per regime (not all 17)
│
├─ [10] QUANT PATH — Strategy Evaluation Loop
│   ├─ For each pair in quantPool:
│   │   └─ For each strategy in activeStrategies:
│   │       ├─ Call strategyEngine.detect(indicators, ohlc, patternInput?)
│   │       ├─ Pattern detection runs (optional context for 8 strategies)
│   │       ├─ If signal: compute FinalScore, check NetEV, ADX guard
│   │       └─ If null: log reason via logSkippedSignal()
│   └─ Outputs: quant signals[] tagged sourcePool='quant'
│
├─ [11] PATTERN PATH — Pattern Pool Evaluation Loop
│   ├─ For each pair in patternPool:
│   │   ├─ MCE regime (for context/indicators only)
│   │   ├─ scanPatterns() — attempts all 5 pattern types
│   │   ├─ Filter to BUY patterns only
│   │   ├─ patternToTradeSignal() — each pattern → strategy
│   │   └─ Tag with sourcePool='pattern'
│   └─ Outputs: pattern signals[]
│
├─ [12] Hybrid Confluence (TWO mechanisms)
│   ├─ Intra-cycle: detectConfluence(quantSignals, patternSignals)
│   └─ Cross-cycle: hybridConfluenceBuffer (5-min TTL, linear decay)
│
├─ [13] SQE Quality Evaluation
│   ├─ FinalScore ≥ 0.35 (quant) / 0.45 (pattern)
│   ├─ RegimeWeight ≥ 0.30
│   ├─ ROI > dynamic threshold
│   └─ Confidence floor + governance gate
│
├─ [14] RTB Queue
│   ├─ Queue with FinalScore + decay penalty
│   ├─ Dedup key: symbol:strategy
│   ├─ Per-signal refresh every 30s (SQE revalidation)
│   └─ Promotion: top-ranked + no active trade for pair
│
└─ [15] Trade Execution
```

## Current Pipeline (VTS / Passive Learning Path)

```
FX5 Scanner (same as active — 300 pairs)
│
├─ [1-6] Same global + IMF filters but uses vts_quant / vts_pattern rows
│   ├─ VTS Quant: LQ ≥ 25, VN ≤ 0.98, CORR ≤ 0.95, DI ≥ 35
│   ├─ VTS Pattern: LQ ≥ 18, VN ≤ 0.99, DI ≥ 20
│   └─ Source: FX5 scanner batch (NOT activeFilterPool)
│
VTS Runner Start
│
├─ [7-9] MCE + Regime-Strategy Intersection (same as active)
│
├─ [10] VTS Quant Path
│   └─ Same as active but with VTS-specific guards
│       ├─ VTS_NET_EV_FLOOR (Net EV minimum)
│       ├─ VTS_MAX_CONCURRENT_PER_COMBO = 1 (pair+strategy)
│       └─ MAX_OPEN_TRADES limit
│
├─ [11] VTS Pattern Path
│   └─ scanPatterns() → normalizePatternToCanonical() → REGIME_STRATEGY_MAP lookup
│
├─ [12] VTS Hybrid Confluence (same buffer mechanism)
│
└─ [13] Virtual trade creation (no SQE/RTB — direct to openVirtualTrades)
```

## Where Family Classification COULD Occur

### Architecture A (Early MCE)
Insert between steps [3] and [4]:
```
[3.5] MCE on all ~200 global survivors
[3.6] Family Classifier using MCE regime + indicators
[4]   Family-specific IMF filters (trend vs reversal vs breakout vs oscillator)
```

### Architecture B (Brute-Force Fan-Out)
Replace step [4] with:
```
[4a] Trend-family IMF filters → trend survivors
[4b] Reversal-family IMF filters → reversal survivors
[4c] Breakout-family IMF filters → breakout survivors
[4d] Oscillator-family IMF filters → oscillator survivors
[5]  Union of all family survivors → activeFilterPool (tagged with familyPath)
```

---

## Data Availability at Each Stage

| Stage | OHLC | Price | Volume | LQ | VN | DI | CORR | MCE Regime | MCE Indicators |
|-------|------|-------|--------|----|----|----|------|------------|----------------|
| Post-FX5 Scan | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No | No |
| Post-Global Filters | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No | No |
| Post-IMF Filters | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No | No |
| Post-MCE (current) | Yes | Yes | Yes | Yes | Yes | Yes | Yes | **Yes** | **Yes** |
| Post-Strategy Eval | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |

**Key Insight**: MCE requires OHLC + price + volume, all available at Post-FX5 Scan. No blocking dependency on filters.
