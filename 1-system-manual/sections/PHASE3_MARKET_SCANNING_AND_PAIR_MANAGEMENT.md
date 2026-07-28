# Phase 3: Market Scanning & Pair Management — Version 1.1

> **Phase**: 3 of 11
> **Author**: Claude Code (System Cartographer)
> **Date**: 2026-02-16
> **Version**: 1.1 — ChatGPT review corrections applied (2026-02-16)
> **Status**: REVISED — ChatGPT review corrections applied
> **Covers Replit Items**: #25 Market Scanner, #56 Adaptive Pool Config, #57 Adaptive Scan Manager

---

## Overview

This section documents how trading pairs enter the DawnTrader system — from the initial scan of Kraken's full asset universe, through multi-stage filtering, into the Active Filter Pool, and ultimately to the Signal Orchestrator for strategy evaluation. The scanning pipeline is the system's "intake valve": it determines which pairs are eligible for signal generation on every 30-second cycle.

**Key principle**: The scanner runs continuously, but the Active Filter Pool is only populated when the trading engine is active. In passive learning mode, pairs are scanned for data collection (IMF metrics, cost cache) but never enter the pool.

---

## 1. Architecture Overview: The Scanning Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     MARKET SCANNING PIPELINE (30-second cycle)              │
└─────────────────────────────────────────────────────────────────────────────┘

CENTRAL CLOCK (1-second ticks)
    │ (every 30 ticks = 30 seconds)
    ▼
FX5 SCANNER (fx5-scanner.ts)
    │ Calls ──▶ collectAdaptiveBatch() (market-scanner.ts)
    │              │
    │              ├─ STEP 1: Fetch Kraken Universe
    │              │   └─ getTicker() + getTradablePairs() → all pairs
    │              │
    │              ├─ STEP 2: Adaptive Batch Selection
    │              │   └─ AdaptiveScanManager.getNextScanBatch()
    │              │       ├─ TelemetryAggregator → top performers (Ideal pool)
    │              │       ├─ Kraken universe remainder → exploration (Rotational pool)
    │              │       ├─ AdaptiveRatioManager → dynamic Ideal/Rotational split
    │              │       └─ PairFailureTracker → cooldown exclusions
    │              │
    │              ├─ STEP 3: Build 100-Pair Batch
    │              │   ├─ Pool type tracking (ideal/rotational)
    │              │   ├─ Benchmark injection (BTC/ETH/SOL)
    │              │   ├─ Cost cache population (spread data for ALL pairs)
    │              │   └─ M64 underflow protection (if ideal < target, expand rotational)
    │              │
    │              └─ STEP 4: FX5 Filter Pipeline
    │                  ├─ Already active check (dedup with pool + open trades)
    │                  ├─ Stablecoin filter (strict Base/Quote regex)
    │                  ├─ Volume filter (min volume threshold)
    │                  ├─ Price filter (min price threshold)
    │                  ├─ Spread filter (max bid-ask spread)
    │                  ├─ History filter (min trading days, async Kraken OHLC)
    │                  └─ Benchmark exemption (passive learning mode only)
    │
    ▼ Survivors (passed all filters)
FX5 SCANNER POST-PROCESSING
    ├─ Classify survivors: volume class (SMALL/MID/LARGE)
    ├─ Compute core metrics: LQ, DI, VolNoise, Sigma
    ├─ Apply IMF metric filter (LQ ≥ threshold, VN ≤ threshold)
    ├─ Benchmark bypass (volatility/boring filters)
    │
    ├─── IF Engine ACTIVE ──▶ Active Filter Pool (5-min TTL, deduped)
    │                            └─ Survivors available for Signal Orchestrator
    │
    ├─── IF Engine STOPPED ─▶ Pool cleared (passive learning mode)
    │                            └─ IMF metrics still persisted
    │
    ├─ Update Stage-3 Cache (cycle metrics, pool snapshot)
    ├─ Emit WebSocket events (scan_tick, scanner_breakdown)
    ├─ Record 24h window metrics (FX5-24h-window.ts)
    ├─ Update current scan batch (for VTS consumption)
    └─ Capture to DataAggregator (async, non-blocking)

FEEDBACK LOOP
    TelemetryAggregator ◀── VTS trade outcomes (M70: only VTS writes)
        │
        ▼
    AdaptiveRatioManager → adjusts Ideal/Rotational ratio for next cycle
        │
        ▼
    AdaptiveScanManager → uses new ratio for next batch construction
```

### System Invariants

| ID | Invariant | Enforced By |
|----|-----------|-------------|
| M27 | AdaptiveScanManager is the sole batch generator | Code structure — `collectAdaptiveBatch()` is the only batch function |
| M29 | Batch size = 100 pairs; default split = 60% Ideal / 40% Rotational | `SCANNER_PARAMS.BATCH_SIZE = 100` + `AdaptiveRatioManager` |
| M31 | Scan cycle runtime ≤ 30 seconds | 25-second timeout + runtime warning |
| M64 | Underflow protection — batch always totals 100 | If Ideal < target, Rotational expands to compensate |
| M65 | Initialization guard with retry | `getNextScanBatch()` retries if batch < 100 |
| M70 | Only VTS writes telemetry | Guard in TelemetryAggregator rejects non-VTS callers |

---

## 2. Central Clock

**File**: `server/services/central-clock.ts`
**Directive**: 8.8.4-A4.R10R-4 (LOCKED MODULE)
**Status**: ACTIVE

The Central Clock is a 1-second tick source that synchronizes all time-dependent subsystems. It emits `ClockTick` events with a monotonic tick counter, timestamp, and measured drift.

### Tick Model

```typescript
interface ClockTick {
  timestamp: number;      // Unix milliseconds
  tickNumber: number;     // Monotonic counter
  drift: number;          // Actual vs expected (ms)
}
```

### Subscribers

| Subscriber | Interval | Purpose |
|-----------|----------|---------|
| FX5 Scanner | Every 30 ticks (30s) | Trigger scan cycle |
| RTB Refresh | Every tick (1s) | Check signal TTL expiration |
| TCL (Temporal Coherence Layer) | Every tick (1s) | Check promotion timing |

### Health Monitoring

- Tracks last 60 ticks of drift history
- Reports average and max drift
- Alerts if drift exceeds 100ms

**Cross-reference**: FX5 Scanner (Section 3) subscribes to the Central Clock as its timing source. The 30-second interval is not configurable at runtime.

---

## 3. FX5 Scanner

**File**: `server/services/fx5-scanner.ts` (887 lines)
**Status**: ACTIVE — LOCKED (core scanning service)
**Singleton**: `fx5Scanner`

The FX5 Scanner is the always-on 30-second market scanner that drives pair selection. It subscribes to the Central Clock and triggers `collectAdaptiveBatch()` from `market-scanner.ts` on every 30-tick interval.

### Lifecycle

1. **Start**: Subscribes to Central Clock with 30-tick interval handler
2. **Each cycle**: Calls `this.runScanCycle(mode)` → `collectAdaptiveBatch()` → post-processing
3. **Timeout**: 25-second safety timeout per scan — if exceeded, cycle is aborted
4. **Stop**: Unsubscribes from Central Clock

### Post-Processing Pipeline (After collectAdaptiveBatch Returns)

After receiving survivors from `collectAdaptiveBatch()`, FX5 Scanner applies additional processing:

1. **Volume Classification**: Assigns each survivor to SMALL, MID, or LARGE volume class
2. **Core Metric Computation**:
   - `LQ` = Log Liquidity (from volumeUSD, tradeCount, spread)
   - `DI` = Directional Integrity (from price history)
   - `VolNoise` = Volatility Noise (from price data, clamped: VN > 2 or VN < 0 defaults to 0.6)
   - `Sigma` = Standard deviation of returns
3. **IMF Source Selection** (Directive 11.4H.6A):
   - In passive learning mode: prefer cached OHLC data from VTS (if ≥ 10 candles available)
   - Otherwise: use ticker-based calculation
   - Source is tagged (`ohlc_cache` vs `ticker`) for telemetry
4. **IMF Metric Filter**: Survivors must pass `LQ ≥ LQ_MIN` AND `VolNoise ≤ VN_MAX`
5. **Benchmark Bypass** (Directive 11.4H.6 Task 4): Benchmark symbols bypass volatility/boring rejection
6. **Active Pool Gate** (REB 2.8.7):
   - Engine ACTIVE → add to Active Filter Pool
   - Engine STOPPED → pool cleared (passive learning enforcement)

### Cost Cache Population

**Critical detail**: `setCostMetrics(symbol, { spread })` is called for every evaluated pair — not just survivors. This ensures friction scores in the cost model vary based on actual market spread data rather than cache-miss defaults (which previously caused a "50 Moderate Liquidity" artifact — Directive 11.4H.3).

### Spread Calculation Logic

```typescript
// Priority 1: Compute from ask/bid directly
spread = (ask - bid) / bid;

// Priority 2: Use pre-calculated spread (convert if percentage)
spread = s.spread > 1 ? s.spread / 100 : s.spread;

// Priority 3: Use bidAskSpread (ALWAYS percentage, divide by 100)
spread = bidAskSpread / 100;

// Default fallback: 0.001 (0.1%)
```

### VTS Integration (Directive 11.4C.1)

FX5 Scanner does NOT write to the TelemetryAggregator (M70 compliance — only VTS writes pair performance telemetry). FX5 does produce persistent data via other channels: DataAggregator captures (`FX5_SCAN`), cost cache writes, Stage-3 state cache, and WebSocket emissions. The distinction is that telemetry (pair performance scores that drive adaptive ratio) is VTS-only.

FX5 exposes `getCurrentScanBatch(mode)` which returns raw pair data:

```typescript
interface ScanBatchPair {
  symbol: string;
  pool: 'ideal' | 'rotational';
  price: number;
  volume24h: number;
  dailyRange: number;
  spread?: number;
  liquidity?: number;
  volatility?: number;
  isBenchmark?: boolean;  // Directive 11.6F: propagated for VTS filtering
}
```

VTS consumes this batch directly for signal evaluation — no telemetry intermediary.

### Diagnostic Output (Early Cycles)

The first 20 cycles produce detailed diagnostic logging including:
- Batch composition (Ideal vs Rotational counts)
- 24h cumulative metrics (unique evaluated/survived)
- Active Pool size vs Unique Survived validation
- Spread audit (first 3 cycles, 5 sample survivors)

---

## 4. Adaptive Batch Construction (collectAdaptiveBatch)

**File**: `server/services/market-scanner.ts` — `collectAdaptiveBatch()` function (lines 1085-1363)
**Directive**: 11.4C.1
**Status**: ACTIVE

This is the core batch construction function called by FX5 Scanner every 30 seconds. It replaces the legacy `collectMixedBatch()` architecture.

### 4-Step Pipeline

#### Step 1: Fetch Kraken Universe
```
Promise.all([krakenService.getTicker(), krakenService.getTradablePairs()])
→ Map each ticker to { pairName, symbol (wsname), volume24h, ticker, pairInfo }
→ Filter: only pairs with valid pairInfo
→ Result: krakenUniverseSize (typically 500+ pairs)
```

#### Step 2: Adaptive Batch from AdaptiveScanManager
```
adaptiveScanManager.getNextScanBatch(allSymbols)
→ Returns: { idealPairs[], rotationalPairs[], benchmarkPairs[], excludedPairs[], totalBatch[] }
```

#### Step 3: Build 100-Pair Batch with Pool Tracking
- Each pair tagged with `poolType: 'ideal' | 'rotational'`
- **Directive 11.4C-R2**: If batch < 100, refill from Kraken universe sorted by volume (tagged as rotational)
- **Directive 11.4H.4 Task 1**: Populate cost cache with spread data for ALL evaluated pairs (not just survivors)

#### Step 4: Apply FX5 Filter Pipeline

For each pair in the 100-pair batch:

| Filter | Check | Rejection Counter |
|--------|-------|-------------------|
| Already active | In pool or open trade? | `already_active` |
| Stablecoin | Base/Quote regex match? | `failed_stablecoin` |
| Min volume | `volume24h < minVolume`? | `failed_min_volume` |
| Min price | `currentPrice < minPrice`? | `failed_min_price` |
| Bid-ask spread | `bidAskSpread > maxBidAskSpread`? | `failed_spread` |
| History | `days < minHistoryDays`? (async) | `failed_history` |

**Stablecoin Regex** (Directive 11.4H.4 Task 3):
```
/^(USDT|USDC|DAI|PYUSD|USDE)\/(USD|EUR|USDT|USDC|DAI)$/i
```
This is strict Base/Quote matching — only excludes true stablecoin-to-stablecoin pairs. A pair like `FARTCOIN/USDC` does NOT match (correctly kept).

**Benchmark Exemption** (Directive 11.4H.4 Task 5):
In passive learning mode, benchmark pairs (BTC/USD, ETH/USD, SOL/USD, XBT/USD, BTC/EUR, ETH/EUR) bypass ALL filters for correlation tracking. They still check for already-active duplicates.

### Filter Configuration (Default Values)

```typescript
minVolume:         1,000,000 USD
minPrice:          0.01
maxBidAskSpread:   1.00%
minHistoryDays:    30
excludeStablecoins: true
universeSize:      100
```

These values come from the screener filters stored in the database, fetched before each scan cycle.

### Return Value: BatchResult

```typescript
interface BatchResult {
  survivors: Array<{
    symbol: string;
    currentPrice: number;
    volume24h: number;
    dailyRange: number;
    fromTopN: boolean;        // Legacy compat (= poolType === 'ideal')
    poolType: 'ideal' | 'rotational';
    bidAskSpread: number;     // Directive 11.4H.3
  }>;
  evaluatedSymbols: string[];
  breakdown: { /* per-filter rejection counts */ };
  metrics: {
    evaluatedCount: number;
    eligibleCount: number;
    ineligibleCount: number;
    idealCount: number;
    rotationalCount: number;
    krakenUniverseSize: number;
  };
}
```

---

## 5. Adaptive Scan Manager

**File**: `server/services/adaptive-scan-manager.ts` (405 lines)
**Directive**: 11.4B.2-R1, 11.2 R1
**Status**: ACTIVE
**Singleton**: `getAdaptiveScanManager()` (lazy-initialized)

The Adaptive Scan Manager controls HOW the 100-pair batch is composed — how many pairs come from the Ideal pool (top performers) vs the Rotational pool (exploration candidates).

### Components

#### PairFailureTracker

Maintains a cooldown blacklist of pairs that failed filters. After a pair fails, it enters cooldown and is excluded from the next batch.

```typescript
interface FailedPairEntry {
  symbol: string;
  lastFailure: number;        // Timestamp
  consecutiveFailures: number;
  failureReason?: string;
  cooldownUntil: number;      // When cooldown expires
}
```

- **Normal cooldown**: After 1 failure
- **Extended cooldown**: After repeated consecutive failures
- **Success clears**: `recordSuccess(symbol)` removes from tracker

#### AdaptiveScanManager.getNextScanBatch()

This method builds the 100-pair batch:

1. **Get current ratio** from `AdaptiveRatioManager.getCurrentRatio()`
   - Defaults to 70/30 (Ideal/Rotational) when adaptive ratio is disabled
   - When enabled, ratio is dynamically computed from pool performance telemetry

2. **M64 Underflow Protection**:
   ```
   targetIdealCount = ceil(100 × idealRatio)
   availableIdealCount = telemetry.getAvailableIdealPoolCount()
   actualIdealCount = min(targetIdealCount, availableIdealCount)
   actualRotationalCount = 100 - actualIdealCount  // Always totals 100
   ```
   If not enough pairs exist in the Ideal pool, Rotational expands to fill.

3. **Fetch pools**:
   - Ideal: `telemetry.getTopPairs(actualIdealCount)` — ranked by performance
   - Rotational: `telemetry.getRotationalPairs(actualRotationalCount, allPairs)` — deduplicated against Ideal

4. **Benchmark injection** (Directive 11.4H.5):
   Benchmark pairs (BTC/ETH/SOL) are force-included regardless of telemetry scores.

5. **Failure filtering**: Remove any pairs in cooldown via PairFailureTracker

6. **Retry guard** (Directive 11.4C-R2, M65):
   If `filteredBatch.length < 100` and retries < MAX_RETRIES, wait 5 seconds and retry.

#### AdaptiveScanBatch Return

```typescript
interface AdaptiveScanBatch {
  idealPairs: string[];
  rotationalPairs: string[];
  benchmarkPairs: string[];
  excludedPairs: string[];      // In cooldown
  totalBatch: string[];
  timestamp: number;
  ratioUsed: number;
  retryCount: number;
}
```

### Scan Result Recording

`recordScanResult(symbol, success, data)` — ONLY tracks pass/fail for failure cooldown management. Does NOT record telemetry (Directive 11.4C-R2: VTS is the single source of truth for telemetry).

---

## 6. Adaptive Ratio Manager

**File**: ~~`server/services/adaptive-ratio-manager.ts`~~ — ★ **DELETED 2026-07-28 (B-ARM-REMOVAL, `e3a22c15a`).** The dynamic split is gone; the scanner uses the fixed config SSOT `SCANNER_PARAMS.DUAL_POOL.IDEAL_RATIO`. The pools themselves survive. See `SYSTEM_MANUAL.md` §6 and `DELETED_COMPONENTS_LOG.md`.
**Directive**: 11.2 R1
**Status**: ACTIVE

The Adaptive Ratio Manager dynamically adjusts the Ideal/Rotational split based on which pool is producing better trade outcomes.

### Ratio Computation Algorithm

```
STEP 1: Fetch pool performance from TelemetryAggregator
        Fallback: SQL-backed telemetry-repository if insufficient in-memory data

STEP 2: Compute pool scores
        score = (winRate × 0.6) + (avgEdge × 0.4)
        where avgEdge = avgFinalScore

STEP 3: Calculate target ratio (performance-weighted)
        IF both scores zero → defaultRatio (0.7)
        IF rotational zero → maximize ideal (0.9)
        IF ideal zero → minimize ideal (0.3)
        ELSE → targetRatio = idealScore / (idealScore + rotationalScore)

STEP 4: Apply confidence adjustment
        confidence = min(1.0, totalSamples / 100)
        adjustedTarget = (targetRatio × confidence) + (defaultRatio × (1 - confidence))
        Low confidence biases toward default; high confidence trusts the data.

STEP 5: Enforce bounds [0.3, 0.9]
        Never less than 30% Ideal, never more than 90% Ideal

STEP 6: Smooth adjustment (max 0.1 per cycle)
        Prevents oscillation — ratio can only change by ±10% per scan cycle
```

### Configuration

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `minIdealRatio` | 0.3 | Minimum 30% Ideal |
| `maxIdealRatio` | 0.9 | Maximum 90% Ideal |
| `defaultRatio` | 0.7 | Starting/fallback (70% Ideal) |
| `adjustmentRate` | 0.1 | Max change per cycle |
| `minSamples` | 10 | Minimum before ratio adjustment |

### Why This Matters

Without the ratio manager, the system would always use a fixed 70/30 split regardless of performance. If Ideal pool pairs consistently outperform Rotational pool pairs, the ratio manager shifts allocation toward Ideal — concentrating on what works. Conversely, if Rotational pool discovers high-performing new pairs, their representation increases.

**Cross-reference**: The pool scores (winRate, avgEdge) are computed by TelemetryAggregator (Section 10), which receives data exclusively from VTS (M70).

---

## 7. Active Filter Pool

**File**: `server/services/active-filter-pool.ts` (413 lines)
**Status**: ACTIVE
**Singleton**: `activeFilterPool`

The Active Filter Pool is the in-memory holding area for pairs that passed all filters. The Signal Orchestrator pulls from this pool when evaluating which pairs to generate signals for.

### Key Properties

| Property | Value | Purpose |
|----------|-------|---------|
| TTL | 5 minutes | Pairs expire after 5 min without refresh |
| Dedup | Strict | Non-expired symbols are SKIPPED, not refreshed |
| Modes | Separate paper/live pools | Complete data isolation |
| Gate | Engine status | Pool only populated when engine ACTIVE |

### Entry Structure

```typescript
interface ActiveFilteredPair {
  symbol: string;
  price: number;
  volume24h: number;
  dailyRange: number;
  firstSeen: string;      // ISO timestamp
  lastUpdated: string;     // ISO timestamp
  expiresAt: number;       // Unix timestamp (TTL = 5 min)
  source: 'paper' | 'live';
  fx5Snapshot?: {
    volume24h: number;
    dailyRange: number;
    price: number;
  };
}
```

### Deduplication Logic (REB 2.2)

When `addSurvivors()` is called with a new batch of survivors:

```
FOR each survivor:
  IF symbol exists in pool AND NOT expired → SKIP (do NOT refresh TTL)
  IF symbol exists in pool AND IS expired  → REPLACE with new entry (reset TTL)
  IF symbol NOT in pool                    → ADD with new TTL
```

**Design decision**: Non-expired symbols are intentionally NOT refreshed. This prevents pool churn where the same pair constantly resets its TTL. A pair enters the pool, has 5 minutes to be evaluated for signals, then must re-qualify in a future scan cycle.

**Temporal windowing effect**: Because TTL is not refreshed, a pair that continuously passes filters every 30 seconds will still expire after 5 minutes. It then re-enters on the next cycle with a fresh TTL. This creates intentional evaluation windows — a pair is eligible for exactly one 5-minute window per pool entry, regardless of how many scan cycles it survives during that window. This is by design, not a bug.

### Passive Mode Enforcement (REB 2.2)

```typescript
enforcePassiveModeIfStopped(mode, isEngineRunning):
  IF engine is stopped AND pool is not empty → clear pool
```

Called by FX5 Scanner before adding survivors. Ensures the pool is empty when the engine is not actively trading — passive learning does NOT populate the pool.

### Volume Bucketing (Phase 8.8.3-I9)

The pool provides volume classification for downstream consumers:

| Bucket | Threshold |
|--------|-----------|
| High | > $50M |
| Medium | ≥ $10M |
| Low | ≥ $1M |
| Very Low | < $1M |

**Symbol normalization**: Handles both `AVAX/USD` and `AVAXUSD` formats via quote-currency suffix detection (longest-first to prevent `USD` matching before `USDT`).

---

## 8. Benchmark Symbol Handling

**File**: `server/config/benchmark-regex.ts` (48 lines)
**Status**: ACTIVE — LOCKED

Benchmark symbols (BTC, ETH, SOL, and major stablecoins) receive special treatment throughout the scanning pipeline. The strict regex prevents misclassification (e.g., FARTCOIN being matched by a naive "contains COIN" check).

### Benchmark Assets

**Base coins**: BTC, XBT, ETH, SOL
**Stablecoins**: USDT, USDC, DAI, BUSD, TUSD
**Valid quote currencies**: USD, USDT, USDC, DAI, BUSD, EUR

### Validation

Two-tier check:
1. Regex match against the full symbol
2. Explicit Base + Quote combination validation

### Where Benchmarks Are Special

| Stage | Behavior | Directive |
|-------|----------|-----------|
| Adaptive Scan Manager | Force-included in batch regardless of telemetry scores | 11.4H.5 Task 1 |
| collectAdaptiveBatch (passive mode) | Bypass ALL filters for correlation tracking | 11.4H.4 Task 5 |
| FX5 Scanner (active mode) | Bypass volatility/boring rejection, but must still pass metric filters | 11.4H.6 Task 4 |
| VTS | Benchmark flag propagated for filtering decisions | 11.6F |

---

## 9. Kraken Symbol Resolution

**File**: `server/markets/kraken-symbol-resolver.ts`
**Directive**: 8.8.4-A4.R10R-4 (LOCKED MODULE)
**Status**: ACTIVE

Single source of truth for symbol translation between DawnTrader's internal format and Kraken's various formats.

### Symbol Formats

| Format | Example | Used By |
|--------|---------|---------|
| Internal | `AVAX/USD` | DawnTrader everywhere |
| Kraken REST | `XAVAXZUSD` | Kraken REST API |
| Kraken WebSocket | `AVAX/USD` | Kraken WS feeds |
| Compact | `AVAXUSD` | Some legacy code |

### Resolution Tiers

| Tier | Source | Trust Level |
|------|--------|-------------|
| 0 | Static map (KRAKEN_SYMBOL_MAP) | Highest — manually verified |
| 1 | Auto-map verified (matches static) | High |
| 2 | Auto-map derived (Kraken API normalization) | Medium |
| 3 | Auto-map uncertain (not safe for auto-use) | Low |

### Kraken-Specific Translations

```
BTC ↔ XBT   (Kraken uses XBT in WebSocket for Bitcoin)
```

**Cross-reference**: Used by `collectAdaptiveBatch()` for survivor symbol normalization, by `cost-cache.ts` for friction lookups, and by `market-volume-cache.ts` for Kraken REST ticker calls.

---

## 10. Telemetry Aggregator

**File**: `server/services/telemetry-aggregator.ts`
**Status**: ACTIVE

The Telemetry Aggregator collects per-pair and per-pool performance data that drives the adaptive scanning feedback loop. It provides ranked pair lists (for Ideal pool selection) and pool-level performance comparisons (for ratio adjustment).

### Per-Pair Telemetry

```typescript
{
  finalScore: number;           // Composite performance
  hybridScore: number;          // Strategy-weighted
  regimeScore: number;          // 0-100 regime-adjusted (Directive 11.4H.4A)
  regimeWeight: number;         // Market regime contribution
  predictiveConfidence: number; // Signal confidence
  successRate: number;          // Win rate
  avgDecayedStrength: number;   // Time-weighted strength
  volZ: number;                 // Volatility Z-score (50-sample rolling)
  trendZ: number;               // Momentum Z-score (50-sample rolling)
}
```

### Pool-Level Aggregates (Directive 11.2 R1)

Per pool (Ideal vs Rotational):
- `winRate` — success rate
- `sampleCount` — number of completed trades
- `avgFinalScore` — mean final score (= "avgEdge" in ratio computation)
- `lastUpdated` — timestamp

### Key Methods

| Method | Purpose | Consumer |
|--------|---------|----------|
| `getTopPairs(n)` | Return top n pairs ranked by score | AdaptiveScanManager (Ideal pool) |
| `getRotationalPairs(n, all)` | Return n exploration pairs | AdaptiveScanManager (Rotational pool) |
| `getPoolPerformanceComparison()` | Ideal vs Rotational performance | AdaptiveRatioManager |
| `getAvailableIdealPoolCount()` | Count of available Ideal pairs | M64 underflow protection |

### Write Guard (M70)

Only calls from `caller='vts'` are accepted. All other callers are rejected. This prevents FX5 Scanner, market-scanner, or any other component from contaminating telemetry data.

### Data Segregation (Directive 11.0E.2)

Simulation (paper) telemetry is kept separate from live telemetry. Source is tracked per record.

### Rolling Window

24-hour window controlled by `SCANNER_PARAMS.historyWindowMs`. Records outside the window are auto-trimmed.

---

## 11. FX5 24-Hour Window

**File**: `server/services/fx5-24h-window.ts` (343 lines)
**Status**: ACTIVE

Maintains a rolling 24-hour record of scan cycles — but ONLY for active trading cycles (not passive learning). This provides:

1. **Cycles per hour** computation (used in scan_tick WebSocket payload)
2. **Filter-level breakdown** aggregated over 24 hours
3. **Unique pair tracking** (evaluated and survived)

### Tracked Filter Types

```
volume, spread, daily_range, price, stablecoin, history,
correlation_guard, market_cap, guardrail_risk, quote_currency
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `recordScanCompletion(mode, isActive)` | Only records when engine is ACTIVE (REB 2.8.5C) |
| `recordScanFor24h(mode, data, isActive)` | Records cycle metrics + filter breakdown |
| `getCyclesPerHour(mode)` | Computes from active-only recorded cycles |
| `get24hSummary(mode)` | Returns aggregate metrics for 24h window |

**Design decision**: Cycles-per-hour measures "trading activity" not "FX5 health." When the engine is stopped, cycles are not counted even though FX5 continues scanning for data collection.

---

## 12. Market Volume Cache

**File**: `server/services/market-volume-cache.ts` (241 lines)
**Status**: ACTIVE
**Singleton**: `marketVolumeCache`

Lightweight volume lookup cache used as a fallback when FX5 metadata is unavailable at order creation time.

### Cache Properties

| Property | Value |
|----------|-------|
| TTL | 5 minutes |
| Source | Kraken REST ticker (on cache miss) |
| Scope | Volume is a trade-time attribute, NOT live |

### Volume Bucketing (Phase 8.8.3-I10)

| Bucket | Threshold |
|--------|-----------|
| High | ≥ $5M |
| Medium | ≥ $500K |
| Low | ≥ $50K |
| Very Low | < $50K |

**Note**: These thresholds differ from Active Filter Pool's volume buckets ($50M/$10M/$1M). The market-volume-cache uses smaller thresholds because it's classifying individual trade-time volumes, while the Active Filter Pool classifies 24h aggregates.

---

## 13. Stage-3 State Cache and Emitter

**Files**: `server/services/stage3-state-cache.ts` (151 lines), `server/services/stage3-emitter.ts`
**Status**: ACTIVE

### Stage-3 State Cache

In-memory snapshot of the current scan cycle, providing atomic reads for the WebSocket layer and diagnostics.

```typescript
type Stage3State = {
  cycleId: number;
  scanCycleId: string;
  stateVersion?: number;        // REB 2.4: timestamp-based atomicity
  krakenUniverseSize: number;
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  activePoolCount: number;
  idealCount: number;
  rotationalCount: number;
  cyclesPerHour: number;
  cycleFrequencyMs: number;     // Default: 30,000ms
  nextScanInMs: number;
  activeFilteredPool: ActiveFilteredPair[];
  latestEligibleSymbols?: string[];
}
```

**Update Logic (REB 2.4)**: Shallow merge — metadata-only updates don't wipe scan data. Cycle counter only increments on full scan updates.

### Stage-3 Emitter

Emits two WebSocket event types:

1. **`scan_tick`**: Real-time cycle summary (cycle ID, universe size, evaluated/eligible counts, pool composition, timestamps)
2. **`scanner_breakdown`**: Filter diagnostic breakdown (per-filter counts for the Filter Insights widget)

Both events include a `stateVersion` for consistency tracking.

---

## 14. Data Aggregator

**File**: `server/services/data-aggregator.ts`
**Directive**: 10.0.B (LOCKED MODULE)
**Status**: ACTIVE

Non-blocking async framework for capturing signal-level, strategy-level, and market-level metrics during scanning and trading.

### Properties

| Property | Value |
|----------|-------|
| Flush interval | 30 seconds |
| Aggregate interval | 15 minutes |
| Mode detection | Auto-detects passive vs active |

### What It Captures From Scanning

```typescript
dataAggregator.capture('FX5_SCAN', {
  mode,
  pairsScanned,
  survivors,
  metricFilteredSurvivors,
  eligibleCount,
  idealCount,
  rotationalCount,
  avgDailyRange,
  isEngineActive,
  volumeStats: { SMALL, MID, LARGE }
});
```

This capture is fire-and-forget (`.catch(() => {})`) — scanning never blocks on aggregation.

---

## 15. Adaptive Pool Config (ACT)

**File**: `server/services/adaptive-pool-config.ts` (40 lines)
**Status**: ACTIVE

⚠️ **Naming clarification**: Despite the file name suggesting scanning pool configuration, this file configures the **Adaptive Concurrency Tuner (ACT)** — which controls how many signals are processed concurrently, NOT the scanning pool composition.

### Configuration

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `MIN_POOL` | 3 | Minimum concurrent signal processing slots |
| `MAX_POOL` | 10 | Maximum concurrent signal processing slots |
| `TARGET_DURATION` | 5,000ms | Target processing time per signal |
| `INITIAL` | 5 | Starting concurrency level |

**Cross-reference**: The scanning pool composition (Ideal/Rotational ratio, batch size) is configured in `SCANNER_PARAMS` within `adaptive-scan-manager.ts`, NOT in this file. See Section 5.

---

## 16. ⚠️ CRITICAL: MarketScanner Class — NOT Dead, Runs In Parallel With FX5

**File**: `server/services/market-scanner.ts` — class `MarketScanner` (lines 385-1013)
**Status**: LEGACY — but **ACTIVELY RUNNING IN PRODUCTION** (BUG-009)

**ChatGPT review correction**: The initial Phase 3 audit stated this class was "believed to be disconnected from boot sequence." Code verification proves this wrong:

1. `server/routes.ts` line 87: `const marketScanner = new MarketScanner();` — **instantiated at module scope**
2. `server/routes.ts` line 371: `marketScanner.startHourlyScanning()` — **actively started during boot**
3. `server/startup.ts` lines 36, 57: Listed as core initialized service in health checks

**This means DawnTrader is running TWO parallel scanning systems simultaneously:**
- **FX5 Scanner**: 30-second cycles via `collectAdaptiveBatch()` → Active Filter Pool → Signal Orchestrator
- **MarketScanner class**: 10-minute cycles → per-user watchlists → direct StrategyEngine signal generation → database signal storage

These two scanners:
- Both call Kraken APIs (doubling API load)
- Both generate trading signals (through completely different pipelines)
- Both perform cleanup operations (potentially conflicting)
- Have no cross-referencing or coordination

**Key legacy patterns in the running MarketScanner**:
- Fetches OHLC data per-pair sequentially (vs FX5's batch approach)
- Only evaluates 8 quant strategies (not 17 canonical)
- Uses `StrategyEngine` directly instead of Signal Orchestrator pipeline
- Has its own cleanup routines (expire signals, clean stale pairs, archive old trades)
- Per-user watchlist management (legacy multi-user architecture, but still executing)
- Auto-start paper simulation (disabled: Phase 41F-L.E2E-PURGE, but class still runs)
- Conflict resolution: BEST SCORE WINS (weight × confidence ranking, 1 signal per asset)

**Removal note**: File comments state "TODO: Remove in Phase 8.12" — but removal has never been executed. This is now BUG-009.

### Diagnostic Infrastructure (REB 2.10/2.11) — API-Exposed

The same `market-scanner.ts` file also hosts extensive diagnostic buffers. These are NOT dead — they are **actively served via API routes**:

**Verified API exposure** (from `server/routes.ts`):
- `getPassiveLearningBuffer()` → served at API endpoint (line 6463)
- `getREB211DriftBuffer()` → served at API endpoint (line 6508)
- `getREB211IntegrityBuffer()` → served at API endpoint (line 6509)
- `getREB211TimingBuffer()` → served at API endpoint (line 6510)
- `getREB211MismatchBuffer()` → served at API endpoint (line 6511)
- `getREB211StressBuffer()` → served at API endpoint (line 6512)
- `getActiveAuditBuffer()` → served at API endpoint (line 6587)
- `getReb211bSymbolTraces()` → served at API endpoint (line 6607)

Additionally imported by:
- `reb-2-12-test-harness.ts` (test infrastructure)
- `reb-2-15-certification.ts` (certification suite)

**Memory consideration**: Buffers are FIFO-capped (20 entries for most, 100 for mismatches, 400 for symbol traces). Memory growth is bounded. However, the stress test mode (`REB_2_11_STRESS` env var) should never be active in production — it injects artificial latency into scan cycles.

**Decision**: These diagnostics are development/validation tools with API exposure. If the MarketScanner class is removed, these diagnostic buffers and their API routes must be evaluated for retention or migration.

---

## Active Files Summary

| File | Lines | Status | Role |
|------|-------|--------|------|
| `server/services/central-clock.ts` | ~100+ | ACTIVE (LOCKED) | 1-second tick source for all timing |
| `server/services/fx5-scanner.ts` | 887 | ACTIVE (LOCKED) | 30-second scanner, post-processing, pool gate |
| `server/services/market-scanner.ts` | 1,364 | MIXED | `collectAdaptiveBatch()` = ACTIVE; `MarketScanner` class = LEGACY |
| `server/services/adaptive-scan-manager.ts` | 405 | ACTIVE | Batch composition: Ideal/Rotational pools, failure tracker |
| `server/services/active-filter-pool.ts` | 413 | ACTIVE | In-memory 5-min TTL holding pool |
| `server/services/telemetry-aggregator.ts` | 200+ | ACTIVE | Per-pair/per-pool performance tracking, VTS-only writes |
| `server/services/fx5-24h-window.ts` | 343 | ACTIVE | 24h rolling scan metrics (active cycles only) |
| `server/services/market-volume-cache.ts` | 241 | ACTIVE | 5-min volume fallback cache |
| `server/services/stage3-state-cache.ts` | 151 | ACTIVE | In-memory scan cycle snapshot |
| `server/services/stage3-emitter.ts` | 100+ | ACTIVE | WebSocket events (scan_tick, scanner_breakdown) |
| `server/services/data-aggregator.ts` | 100+ | ACTIVE (LOCKED) | Non-blocking metric aggregation |
| `server/services/adaptive-pool-config.ts` | 40 | ACTIVE | ACT concurrency config (NOT scanning pool) |
| `server/config/benchmark-regex.ts` | 48 | ACTIVE (LOCKED) | Benchmark symbol validation |
| `server/markets/kraken-symbol-resolver.ts` | 100+ | ACTIVE (LOCKED) | Symbol format translation (SSOT) |

---

## Critical Findings (Phase 3)

### BUG-009: Two Parallel Scanning Systems Running Simultaneously
- **Severity**: CRITICAL
- **Locations**:
  - `server/services/market-scanner.ts` — `MarketScanner` class (lines 385-1013)
  - `server/routes.ts` — line 87: `const marketScanner = new MarketScanner();` (instantiated at boot)
  - `server/routes.ts` — line 371: `marketScanner.startHourlyScanning()` (actively started)
  - `server/startup.ts` — lines 36, 57: Listed as core initialized service
- **Problem**: DawnTrader runs TWO independent scanning systems simultaneously:
  1. **FX5 Scanner** (30-second cycles): `collectAdaptiveBatch()` → Active Filter Pool → Signal Orchestrator. This is the modern, adaptive, telemetry-driven pipeline.
  2. **MarketScanner class** (10-minute cycles): Kraken OHLC → direct StrategyEngine → database signal storage. This is the legacy pipeline with per-user watchlists and only 8 quant strategies.
- **Impact**:
  - **Double Kraken API load**: Both scanners call `getTicker()`, `getOHLCData()`, and other Kraken endpoints independently
  - **Conflicting signal generation**: MarketScanner generates signals through a completely different pipeline (StrategyEngine direct) than FX5/Signal Orchestrator. Signals from both systems may coexist in the database with no deconfliction.
  - **Conflicting cleanup**: MarketScanner runs its own cleanup (expire signals, clean stale pairs, archive trades). This could interfere with cleanup operations performed by the modern pipeline.
  - **Wasted computation**: 10-minute scanner evaluates pairs that FX5 already evaluates every 30 seconds, but with less sophisticated filtering (no adaptive ratio, no failure tracking, no IMF metrics)
- **Verified**: Yes — code-confirmed 2026-02-16 (ChatGPT review prompted verification)
- **Fix**: Stop instantiating MarketScanner class in `server/routes.ts`. Remove `startHourlyScanning()` call. Remove from `startup.ts` service list. The `collectAdaptiveBatch()` function in the same file must NOT be removed.
- **Timing**: Pre-MCE — this is a standalone fix. The legacy scanner adds API load and potential signal conflicts with zero benefit.
- **Phase Found**: Phase 3 (ChatGPT review correction)

### RISK-021: Volume Bucket Threshold Inconsistency Between Modules
- **Severity**: LOW-MEDIUM (context-dependent — LOW today if buckets are never cross-compared, but MEDIUM if risk guardrails, position sizing, UI dashboards, drift detector, or ML features ever reference bucket labels)
- **Location**: `active-filter-pool.ts` vs `market-volume-cache.ts`
- **Problem**: Two different volume bucketing schemes:
  - Active Filter Pool: High > $50M, Medium ≥ $10M, Low ≥ $1M, Very Low < $1M
  - Market Volume Cache: High ≥ $5M, Medium ≥ $500K, Low ≥ $50K, Very Low < $50K
- **Impact**: A pair classified as "High" by market-volume-cache ($5M+) would be classified as "Low" by the Active Filter Pool (which requires $50M+ for "High"). If any downstream consumer compares volume buckets across these sources, it will get inconsistent results.
- **Fix**: Consolidate to a single volume bucketing function with explicit scope parameters, or document that these serve intentionally different scopes (24h aggregate vs trade-time volume).

### RISK-022: adaptive-pool-config.ts Name Misleads About Its Purpose
- **Severity**: LOW
- **Location**: `server/services/adaptive-pool-config.ts`
- **Problem**: File name suggests scanning pool configuration (Ideal/Rotational ratio, batch size). Actual content is ACT (Adaptive Concurrency Tuner) — controls concurrent signal processing slots (3-10), completely unrelated to scanning. A developer looking for scanning pool config will find the wrong file.
- **Fix**: Rename to `act-concurrency-config.ts` or `signal-processing-pool-config.ts`. The actual scanning pool configuration is in `SCANNER_PARAMS` within `adaptive-scan-manager.ts`.

### RISK-023: Adaptive Scanning Pipeline Depends on VTS Telemetry Integrity
- **Severity**: MEDIUM
- **Status**: ★ **SUPERSEDED 2026-07-28 (B-ARM-REMOVAL)** — the component is deleted, and measurement showed this risk had ALREADY MATERIALISED permanently by a different mechanism than predicted (the ratio never reached allocation at all). Full record: `SYSTEM_MANUAL.md` RISK-023. The surviving concern — outcome-blind pool membership — is re-homed to **#597**.
- **Location**: ~~`adaptive-ratio-manager.ts`~~ → `telemetry-aggregator.ts` → VTS
- **Problem**: The entire adaptive scanning feedback loop depends on VTS telemetry health. If VTS is paused, misconfigured, or data-lagged:
  - Ideal pool quality degrades (no fresh performance data to rank pairs)
  - Ratio manager biases toward `defaultRatio` (0.7) due to low confidence
  - Batch composition becomes stale — system effectively runs on fixed 70/30 split
- **Impact**: Adaptive scanning degrades gracefully (falls back to defaults), but the adaptive benefit is silently lost. There is no health check or alert when VTS telemetry stops flowing.
- **Fix**: Add telemetry freshness check — if `getPoolPerformanceComparison()` returns data older than X cycles, emit a warning. Consider adding VTS telemetry health to the system health endpoint.
- **Timing**: Pre-MCE or during MCE

### RISK-024: Cost Cache Synchronization Coupling
- **Severity**: LOW-MEDIUM
- **Location**: FX5 Scanner → `cost-cache.ts` (TTL: 5 minutes) → `cost-model.ts`
- **Problem**: FX5 writes spread data to cost cache every 30-second scan cycle. Cost cache has a 5-minute TTL. Cost model friction calculations depend on fresh cache entries. If:
  - Cost cache TTL expires between scan cycles (shouldn't happen with 30s refresh, but possible during scan errors/restarts)
  - Symbol normalization between FX5's `setCostMetrics(symbol, ...)` and cost-model's `getCostMetrics(symbol)` diverges
  Then friction scores revert to defaults, producing incorrect cost estimates.
- **Current mitigations**: 30-second scan refresh rate is much faster than 5-minute TTL, and `setCostMetrics` is called for ALL evaluated pairs (not just survivors), so cache is well-populated.
- **Fix**: Verify symbol normalization consistency between FX5's cost cache writes and cost-model's reads. Consider adding a "cache miss" metric to detect silent fallback to defaults.

### RISK-025: History Filter Sequential Async Risk
- **Severity**: LOW
- **Location**: `market-scanner.ts` `collectAdaptiveBatch()` lines 1280-1286, `kraken.ts` `getPairHistoryDays()`
- **Problem**: The history filter calls `passesHistoryFilter()` inside a sequential `for` loop over 100 pairs. Each call potentially hits Kraken's REST API for daily OHLC data. While results are cached for 24 hours (`HISTORY_CACHE_TTL_MS`), the first scan cycle after restart (cold cache) makes up to 100 sequential Kraken API calls.
- **Mitigations**: Results are cached per-pair for 24 hours. On cache hit, the filter is instant. On cache miss with Kraken error, the pair conservatively fails (null = fail). After the first cycle, nearly all pairs are cached.
- **Fix**: Consider batching history checks or pre-warming the cache during boot. The M31 invariant (30-second runtime limit) already protects against unbounded latency.

### RISK-026: Symbol Resolver Tier 3 Handling
- **Severity**: LOW
- **Location**: `server/markets/kraken-symbol-resolver.ts` lines 147-152
- **Problem**: When resolving symbols for Kraken REST format, Tier 3 (uncertain) symbols are explicitly rejected: `if (entry && entry.tier <= 2)` — only Tiers 0-2 produce a mapping. Tier 3 symbols return `null`, triggering a WARN log and fallback to compact format (`symbol.replace("/","").toUpperCase()`). For WebSocket resolution, same logic applies.
- **Impact**: Tier 3 symbols are NOT silently allowed — they are rejected from precise resolution and fall back to string manipulation. This is correct behavior but means some legitimate new pairs may fail to resolve until added to the static map.
- **Risk level**: LOW — the fallback is reasonable and logged. The symbol is not silently corrupted.

---

## Cross-References to Other Phases

| This Phase | Connects To | Relationship |
|-----------|-------------|--------------|
| FX5 Scanner → Cost Cache | Phase 1: Cost Model | Spread data from scanning populates cost-model's cache for friction calculations |
| FX5 Scanner → IMF | Phase 1: IMF Metrics | LQ, VolNoise computed during scanning using IMF formulas |
| Active Filter Pool → Signal Orchestrator | Phase 4 (upcoming) | Signal Orchestrator pulls pairs from the pool for strategy evaluation |
| collectAdaptiveBatch → Screener Filters | Phase 5 (upcoming) | Filter thresholds come from database (screener_filters table) |
| TelemetryAggregator → VTS | Phase 6 (upcoming) | VTS writes telemetry; scanning reads it for adaptive ratio |
| Central Clock → Boot Sequence | Phase 7 (upcoming) | Clock starts during boot; FX5 subscribes during initialization |
| Stage-3 Emitter → WebSocket | Phase 8/9 (upcoming) | scan_tick and scanner_breakdown events drive Filter Insights widget |
| MCP/ARE consumers | Phase 2: BUG-008 | 14+ services still consume MCP regime output — none involve scanning pipeline |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-02-16 | Initial Phase 3 audit: all scanning pipeline files deep-read, architecture documented, 2 risks + 2 legacy items identified |
| 1.1 | 2026-02-16 | ChatGPT review corrections: BUG-009 (two parallel scanners — CRITICAL, verified), RISK-023 (VTS telemetry dependency — MEDIUM), RISK-024 (cost cache coupling — LOW-MEDIUM), RISK-025 (history filter async — LOW), RISK-026 (Tier 3 symbol handling — LOW). RISK-021 upgraded LOW→LOW-MEDIUM. MarketScanner reclassified from "dead code" to "actively running." M70 wording clarified. Active Filter TTL windowing documented. REB diagnostics confirmed API-exposed. |

---

*Phase 3 complete. Next: Phase 4 — Guardrails, Risk, Portfolio, & Trade Safety.*
