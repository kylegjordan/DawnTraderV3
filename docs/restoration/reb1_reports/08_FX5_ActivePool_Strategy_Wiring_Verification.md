# REB 1.2 Report: FX5 → ActivePool → Strategy Wiring Verification
**Report ID**: REB1-08  
**Phase**: REB 1.2 (Backend Pipeline Wiring Verification)  
**Date**: November 22, 2025  
**Status**: ⚠️ **ARCHITECTURAL DIVERGENCE DETECTED**

---

## Executive Summary

**VERDICT**: ⚠️ **PARTIAL COMPLIANCE** — FX5 pipeline exists but does not feed Strategy Engine as expected

The FX5 → ActivePool → Strategy wiring audit has revealed a **fundamental architectural disconnect**. While the FX5 Scanner produces an `activeFilteredPool` of eligible pairs every 30 seconds, this data **does not feed directly into the Strategy Engine** for evaluation. Instead, the Strategy Engine operates independently via a `SignalOrchestrator` that generates its own signals.

**Key Finding**: FX5's `activeFilteredPool` is used only for WebSocket emission and Stage-3 cache updates, **not** for driving Ready-To-Buy strategy evaluations.

---

## Expected Truth Pipeline (Nov 18-20, 2025)

### Anticipated Data Flow

```
┌───────────────┐
│  FX5 Scanner  │ (30s intervals)
│  Service      │
└───────┬───────┘
        │
        ├──> Evaluate Kraken universe
        ├──> Apply FX5 filters
        ├──> Generate eligible pairs list
        │
        ▼
┌────────────────────┐
│ Active Filter Pool │ (dedupe + expiry logic)
│  Management        │
└────────┬───────────┘
         │
         ├──> Add new eligible pairs
         ├──> Remove expired entries
         ├──> Apply cooldown logic
         │
         ▼
┌─────────────────┐
│ Strategy Engine │ (evaluate each active pair)
│  Evaluation     │
└────────┬────────┘
         │
         ├──> VWAP Pullback
         ├──> ABCD Long
         ├──> SMA Trend Ride
         ├──> etc.
         │
         ▼
┌──────────────────┐
│  Ready-To-Buy    │ (signals with confidence scores)
│  Generation      │
└──────────────────┘
```

---

## Actual Current Pipeline (November 22, 2025)

### Observed Data Flow

```
┌───────────────┐
│  FX5 Scanner  │ (30s intervals)
│  Service      │
└───────┬───────┘
        │
        ├──> FilteredPairsService.getValidPairs()
        ├──> Compute breakdown
        ├──> Build activeFilteredPool (top 60 pairs)
        │
        ▼
┌────────────────────┐
│ Stage-3 Cache      │
│ Update             │
└────────┬───────────┘
         │
         ├──> updateStage3Cache(mode, { activeFilteredPool, ... })
         │
         ▼
┌─────────────────┐
│ WebSocket Emit  │
│ scan_tick       │
└─────────────────┘
         
         ❌ DISCONNECTED FROM STRATEGY ENGINE ❌

┌─────────────────┐
│ Trading Engine  │ (INDEPENDENT)
│  Service        │
└────────┬────────┘
         │
         ├──> SignalOrchestrator.start()
         ├──> Generates signals independently
         │    (NOT from FX5's activeFilteredPool)
         │
         ▼
┌──────────────────┐
│  Strategy Engine │
│  Evaluation      │
└──────────────────┘
```

**Critical Gap**: No connection between FX5's `activeFilteredPool` and Strategy Engine's signal generation.

---

## I. FX5 Scanner Output Path

### A. FX5 Scanner Architecture

**File**: `server/services/fx5-scanner.ts` (368 lines)

**Scan Interval**: 30 seconds (SCAN_INTERVAL_MS = 30 * 1000)

**Scan Flow** (lines 113-213):
```typescript
private async scanMode(mode: 'paper' | 'live'): Promise<ScanResult | null> {
  // 1. Load screener filters
  const filters = await storage.getScreenerFilters({ mode });
  
  // 2. Execute FX5 filtering via FilteredPairsService
  const result = await this.filteredPairsService.getValidPairs(mode, filters, true);
  
  // 3. Compute breakdown from filter results
  const diagnosticData = await this.computeBreakdown(mode, filters);
  const breakdown = diagnosticData.breakdown;
  
  // 4. Calculate eligible count
  const eligibleCount = breakdown.passed_all_filters + breakdown.already_active;
  
  // 5. Get active trades count
  const activeTrades = await storage.getActiveTrades(mode);
  const activePoolCount = activeTrades.length;
  
  // 6. Build activeFilteredPool (TOP 60 PAIRS ONLY)
  const activeFilteredPool: ActiveFilteredPair[] = result.filteredPairs
    .slice(0, 60)
    .map(pair => ({
      symbol: pair.symbol,
      price: pair.currentPrice,
      volume24h: pair.volume24h,
      dailyRange: pair.dailyRange || 0,
      firstSeen: pair.lastUpdate.toISOString(),
      lastUpdated: pair.lastUpdate.toISOString(),
    }));
  
  // 7. Update Stage-3 cache FIRST
  await updateStage3Cache(mode, {
    activeFilteredPool,
    // ... other fields
  });
  
  // 8. Emit Stage-3 WebSocket events SECOND
  await emitStage3Events(mode, breakdown, { evaluatedSymbols, survivedSymbols });
}
```

**Key Observations**:
1. ✅ FX5 filtering logic exists
2. ✅ `activeFilteredPool` built from top 60 filtered pairs
3. ✅ Stage-3 cache updated with pool data
4. ✅ WebSocket events emitted
5. ❌ **NO connection to Strategy Engine**

---

### B. FilteredPairsService Integration

**File**: `server/services/filtered-pairs-service.ts` (212 lines)

**Method**: `getValidPairs(mode, filters, forceRefresh)`

**Flow** (lines 61-174):
```typescript
async getValidPairs(
  mode: 'live' | 'paper',
  filters: ScreenerFilters,
  forceRefresh = false
): Promise<FilteredPairsStats> {
  // 1. Check cache
  const cached = this.cache.get(cacheKey);
  if (!forceRefresh && cached) return cached.data;
  
  // 2. Get eligible pairs from Kraken using current filters
  const eligiblePairs = await this.kraken.getEligiblePairs({
    minVolume: filters.minVolume,
    minDailyRange: "0",
    minPrice: filters.minPrice,
    maxBidAskSpread: filters.maxBidAskSpread,
    // ... other filter criteria
  });
  
  // 3. Transform to FilteredPairResult format
  const filteredPairs: FilteredPairResult[] = eligiblePairs.map(pair => ({
    symbol: pair.symbol,
    baseCurrency: pair.baseCurrency,
    quoteCurrency: pair.quoteCurrency,
    currentPrice: pair.currentPrice,
    volume24h: pair.volume24h,
    dailyRange: pair.dailyRange,
    vwap: pair.vwap ?? null,
    lastUpdate: new Date(),
  }));
  
  // 4. Return stats
  return {
    totalPairs: allPairs.length,
    eligiblePairs: filteredPairs.length,
    filteredPairs,
    lastScanAt,
    nextScanAt,
    dataFreshness: 'fresh',
    freshnessAgeMs: 0,
  };
}
```

**Key Observations**:
1. ✅ Calls `kraken.getEligiblePairs()` with filter criteria
2. ✅ Returns list of eligible pairs
3. ✅ Caches results (1 minute TTL)
4. ❌ **NO direct connection to Strategy Engine**

---

### C. Eligible Pairs Output

**Data Structure**:
```typescript
interface FilteredPairResult {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  currentPrice: number;
  volume24h: number;
  dailyRange: number;
  vwap: number | null;
  lastUpdate: Date;
}
```

**Destination**:
- ✅ Stored in `FilteredPairsService` cache
- ✅ Sliced to top 60 for `activeFilteredPool`
- ✅ Sent to Stage-3 cache
- ✅ Emitted via WebSocket `scan_tick` event
- ❌ **NOT sent to Strategy Engine**

---

## II. Active Filter Pool Logic

### A. Active Pool Construction

**Location**: `server/services/fx5-scanner.ts` lines 167-175

**Code**:
```typescript
// Phase 8.8.2-MAP-FINAL: Build activeFilteredPool with full pair details
const activeFilteredPool: ActiveFilteredPair[] = result.filteredPairs.slice(0, 60).map(pair => ({
  symbol: pair.symbol,
  price: pair.currentPrice,
  volume24h: pair.volume24h,
  dailyRange: pair.dailyRange || 0,
  firstSeen: pair.lastUpdate.toISOString(),
  lastUpdated: pair.lastUpdate.toISOString(),
}));
```

**Pool Construction Logic**:
1. ✅ Takes top 60 pairs from `filteredPairs` array
2. ✅ Maps to `ActiveFilteredPair` interface
3. ✅ Includes: symbol, price, volume, dailyRange, timestamps
4. ⚠️ **NO deduplication logic** (fresh build every 30s)
5. ⚠️ **NO expiry tracking** (timestamps set to current time)
6. ⚠️ **NO cooldown enforcement** (rebuilt from scratch)

**Finding**: Active pool is **re-constructed from scratch every cycle**, not managed as a persistent pool with dedupe/expiry.

---

### B. Deduplication Logic

**Expected**: Prevent duplicate symbols from appearing in active pool

**Actual**: ❌ **NOT IMPLEMENTED**

**Evidence**:
```bash
$ grep -rn "dedupe\|dedup\|unique" server/services/fx5-scanner.ts
# No matches found
```

**Current Behavior**: Active pool rebuilt from `filteredPairs.slice(0, 60)` every 30 seconds without checking for duplicates across cycles.

**Impact**: Same symbol can appear multiple times if it remains in top 60.

---

### C. Expiry Logic

**Expected**: Remove pairs from active pool after configurable expiry time

**Actual**: ❌ **NOT IMPLEMENTED**

**Evidence**:
```bash
$ grep -rn "expiry\|expire\|expiration" server/services/fx5-scanner.ts
# No matches found for dedicated expiry functions
```

**Code Review**: `activeFilteredPool` rebuilt every cycle with fresh timestamps (`firstSeen` and `lastUpdated` set to current time).

**Finding**: No persistence of `firstSeen` timestamp across cycles, making expiry tracking impossible.

---

### D. Cooldown Logic

**Expected**: Pairs recently exited from trades should be excluded from active pool for cooldown period

**Actual**: ⚠️ **PARTIAL** — `already_active` tracking exists but cooldown unclear

**Evidence** (lines 238-252):
```typescript
// Get active trades to exclude from eligible pool
const activeTrades = await storage.getActiveTrades(mode);
const activeSymbols = new Set(activeTrades.map(t => t.symbol));

const breakdown: FilterBreakdown = {
  // ... other counters
  already_active: 0,
  passed_all_filters: 0,
};
```

**Later in breakdown logic** (lines 345-347):
```typescript
// Check if already active
if (activeSymbols.has(symbol)) {
  breakdown.already_active++;
  rejected = true;
}
```

**Finding**: 
- ✅ Active trades are excluded from eligible pool
- ✅ `already_active` counter increments correctly
- ❌ **NO cooldown period after trade exit** (only excludes currently active trades)

---

### E. Passive Learning Mode Handling

**Expected**: In passive mode, active pool should remain EMPTY (no active trades)

**Actual**: ⚠️ **UNCLEAR** — Pool built regardless of mode

**Evidence**:
```typescript
// FX5 Scanner runs for both modes
await this.scanMode('paper');
await this.scanMode('live');

// Active pool built from filtered pairs (no mode check)
const activeFilteredPool: ActiveFilteredPair[] = result.filteredPairs.slice(0, 60).map(pair => ({
  // ... mapping logic
}));
```

**Finding**: FX5 Scanner builds `activeFilteredPool` for both paper and live modes without checking if passive learning is enabled.

**Risk**: Active pool may populate in passive mode, which should not allow active trades.

---

## III. Strategy Engine Wiring

### A. Trading Engine Architecture

**File**: `server/services/trading-engine.ts` (738 lines)

**Class**: `TradingEngine`

**Start Method** (lines 48-85):
```typescript
async start(): Promise<void> {
  this.isRunning = true;
  console.log(`[ENGINE][mode=${this.mode}] Trading engine started`);
  
  // Phase 37: Start signal orchestrator for automatic signal generation
  this.signalOrchestrator = new SignalOrchestrator({
    mode: this.mode,
    evaluationIntervalMs: 30000, // 30 seconds
    enabledStrategies: [
      'vwap_pullback',
      'abcd_long',
      'sma_trend_ride',
      'breakout',
      'mean_reversion',
      'range_trading',
      'vwap_bounce',
      'liquidity_trap',
      'dhma'
    ]
  });
  
  await this.signalOrchestrator.start(async (signal: StrategySignal) => {
    // Forward generated signals to processSignal for trade execution
    await this.processSignal(signal as TradeSignal);
  });
}
```

**Key Observations**:
1. ✅ Trading Engine starts `SignalOrchestrator`
2. ✅ SignalOrchestrator runs on 30-second intervals (same as FX5)
3. ✅ Evaluates 9 strategies
4. ❌ **NO reference to FX5's `activeFilteredPool`**
5. ❌ **NO connection to Stage-3 cache**

---

### B. Signal Generation Path

**Expected**: Strategy Engine receives `activeFilteredPool` from FX5 and evaluates each symbol

**Actual**: SignalOrchestrator **generates signals independently** without FX5 input

**Evidence**:
```bash
$ grep -rn "activeFilteredPool\|Stage-3\|stage3" server/services/trading-engine.ts
# No matches found
```

**Finding**: Trading Engine operates **completely independently** of FX5 Scanner's output.

---

### C. Strategy Evaluation Trigger

**Question**: How does Strategy Engine know which pairs to evaluate?

**Investigation Needed**: Search `SignalOrchestrator` implementation

**Current Understanding**:
- SignalOrchestrator runs on 30s intervals
- Likely fetches filtered pairs independently (not from FX5)
- May call `FilteredPairsService.getValidPairs()` directly

**Finding**: Parallel universe — FX5 Scanner and Strategy Engine both run every 30s but **don't communicate**.

---

### D. Ready-To-Buy Generation

**Method**: `TradingEngine.processSignal(signal: TradeSignal)`

**Flow** (lines 204-225):
```typescript
async processSignal(signal: TradeSignal): Promise<Trade | null> {
  if (!this.isRunning) {
    return null;
  }
  
  try {
    // Get mode-level settings
    const settings = await buildSettingsFromModeLevel(this.mode);
    
    // Calculate goal alignment score
    const goalAlignmentScore = await this.calculateGoalAlignmentScore(signal, this.mode);
    signal.goalAlignmentScore = goalAlignmentScore;
    signal.finalScore = (signal.confidence * 0.7) + (goalAlignmentScore * 0.3);
    
    console.log(`[mode=${this.mode}] Signal: ${signal.symbol}, Strategy: ${signal.strategy}`);
    console.log(`[mode=${this.mode}] Signal Confidence: ${(signal.confidence * 100).toFixed(1)}%`);
    console.log(`[mode=${this.mode}] Goal Alignment Score: ${(goalAlignmentScore * 100).toFixed(1)}%`);
    console.log(`[mode=${this.mode}] Final Score: ${(signal.finalScore * 100).toFixed(1)}%`);
    
    // ... continue with trade execution logic
  }
}
```

**Input**: `TradeSignal` from `SignalOrchestrator`

**Output**: `Trade` object (if signal passes all checks)

**Finding**: 
- ✅ Strategy signals processed correctly
- ✅ Goal alignment calculated
- ❌ **NO connection to FX5's `activeFilteredPool`**

---

## IV. Stage-3 Contamination Check

### Expected (Phase 8 Truth Files)

**Stage-3** should be:
- Part of later architecture phases
- NOT present in FX5 → Strategy wiring
- Introduced in future enhancement

### Actual

**Stage-3 References Found**:
- ✅ `updateStage3Cache()` in `fx5-scanner.ts` line 182
- ✅ `emitStage3Events()` in `fx5-scanner.ts` line 205
- ✅ `stage3-state-cache.ts` service exists
- ✅ `stage3-emitter.ts` service exists

**Finding**: ⚠️ **Stage-3 architecture already implemented** in FX5 Scanner

**Impact**: 
- Stage-3 cache stores `activeFilteredPool` data
- WebSocket events emit Stage-3 state
- **BUT**: Stage-3 data not consumed by Strategy Engine

**Assessment**: Stage-3 exists as **data storage and emission layer** but not integrated into trading logic.

---

## V. Wiring Discrepancy Analysis

### Expected Wiring (Truth Files)

```
FX5 Scanner
    ↓ (produces)
activeFilteredPool[]
    ↓ (feeds into)
Strategy Engine
    ↓ (evaluates)
Ready-To-Buy signals
```

### Actual Wiring (Current Code)

```
FX5 Scanner                        Trading Engine (INDEPENDENT)
    ↓                                   ↓
activeFilteredPool[]              SignalOrchestrator
    ↓                                   ↓
Stage-3 Cache                     Strategy Evaluation
    ↓                                   ↓
WebSocket Emit                    Ready-To-Buy signals
    ↓
(consumed by UI only)
```

**Critical Gap**: **ZERO connection** between FX5's output and Strategy Engine's input.

---

## VI. Missing Logic Identification

### A. Active Pool Management Functions

**Expected Functions**:
1. `addToActivePool(symbol, mode)` - Add eligible pair to pool
2. `removeFromActivePool(symbol, mode)` - Remove pair from pool
3. `pruneExpiredEntries(mode)` - Remove expired pairs
4. `applyDeduplication(pool)` - Remove duplicate symbols
5. `enforceCooldown(symbol, mode)` - Check cooldown period

**Actual Functions**: ❌ **NONE FOUND**

**Evidence**:
```bash
$ grep -rn "addToActivePool\|removeFromActivePool\|pruneExpired\|enforceCooldown" server/services/
# No matches found
```

**Finding**: Active pool is **rebuilt from scratch** every cycle, not managed as persistent entity.

---

### B. FX5 → Strategy Bridge

**Expected Bridge**:
- Function to pass `activeFilteredPool` to Strategy Engine
- Event emitter for "new eligible pairs ready"
- Callback or hook for Strategy Engine to fetch latest pool

**Actual Bridge**: ❌ **NONE FOUND**

**Evidence**:
```bash
$ grep -rn "activeFilteredPool" server/services/trading-engine.ts
$ grep -rn "activeFilteredPool" server/services/signal-orchestrator.ts
# No matches found in either file
```

**Finding**: **Complete architectural disconnect** between FX5 and Strategy Engine.

---

### C. Cooldown Tracking

**Expected**:
- Database table or in-memory store for cooldown periods
- Check before adding symbols to active pool
- Configurable cooldown duration

**Actual**: ⚠️ **PARTIAL** — Only active trades excluded

**Current Logic**:
```typescript
// Exclude currently active trades from eligible pool
const activeTrades = await storage.getActiveTrades(mode);
const activeSymbols = new Set(activeTrades.map(t => t.symbol));

if (activeSymbols.has(symbol)) {
  breakdown.already_active++;
  rejected = true;
}
```

**Finding**: 
- ✅ Active trades excluded
- ❌ **NO cooldown after trade exit**
- ❌ **NO configurable cooldown period**

---

## VII. Passive Learning Mode Verification

### Expected Behavior

**Passive Learning Mode**:
- Trading engine STOPPED (no active trades)
- FX5 Scanner RUNNING (evaluates universe)
- Active Filter Pool EMPTY (no eligible pairs for trading)
- Strategy Engine NOT evaluating (or evaluating in read-only mode)

### Actual Behavior

**FX5 Scanner** (always runs):
```typescript
// FX5 scanner starts regardless of engine state
fx5Scanner.start().catch((error) => {
  console.error('[FX5Scanner] Failed to start:', error);
});
```

**Trading Engine** (started independently):
```typescript
// Trading engine started manually (not automatically)
const globalLiveEngine = new TradingEngine('live');
const globalPaperEngine = new TradingEngine('paper');
```

**Finding**: 
- ✅ FX5 Scanner runs independently of engine state
- ⚠️ Active pool built regardless of passive/active mode
- ❌ **NO check for passive mode before populating pool**

**Risk**: Active pool may populate in passive mode when it should be empty.

---

## VIII. Confidence Threshold & minHistoryDays Checks

### A. Phase 8.7.x Repair Verification

**Expected** (Phase 8.7.x):
- Confidence threshold filtering before trade execution
- `minHistoryDays` filter for data quality
- History filter promoted to FX5 breakdown

**Verification Needed**: Check if these repairs persist in current code

#### Confidence Threshold

**Search**:
```bash
$ grep -rn "confidence.*threshold\|minConfidence" server/services/
```

**Finding**: Confidence check exists in `TradingEngine.processSignal()`:
```typescript
signal.finalScore = (signal.confidence * 0.7) + (goalAlignmentScore * 0.3);
```

**Status**: ✅ **Confidence scoring implemented** (but threshold check unclear)

#### minHistoryDays Filter

**Search**:
```bash
$ grep -rn "minHistoryDays\|min.*history" server/services/fx5-scanner.ts
```

**Finding**: ❌ **NOT FOUND** in FX5 Scanner breakdown logic

**Expected Location**: In `computeBreakdown()` method as `failed_history` counter

**Actual**: `failed_history` counter exists in breakdown but logic unclear:
```typescript
const breakdown: FilterBreakdown = {
  // ... other counters
  failed_history: 0,
  // ...
};
```

**Status**: ⚠️ **COUNTER EXISTS BUT LOGIC UNCERTAIN**

---

## IX. Restoration Requirements

### Phase 1: Implement FX5 → Strategy Bridge

**Create Bridge Service**: `server/services/fx5-strategy-bridge.ts`

```typescript
export class FX5StrategyBridge {
  private activePool: Map<string, ActiveFilteredPair> = new Map();
  
  /**
   * Receive updated active pool from FX5 Scanner
   */
  async updateActivePool(mode: 'paper' | 'live', pool: ActiveFilteredPair[]): Promise<void> {
    // Store pool in memory/cache
    this.activePool.set(mode, pool);
    
    // Emit event for Strategy Engine
    this.emit('active_pool_updated', { mode, pool });
  }
  
  /**
   * Provide active pool to Strategy Engine
   */
  async getActivePool(mode: 'paper' | 'live'): Promise<ActiveFilteredPair[]> {
    return this.activePool.get(mode) || [];
  }
}
```

**Modify FX5 Scanner** (`fx5-scanner.ts` line 200):
```typescript
// BEFORE (current):
await updateStage3Cache(mode, {
  activeFilteredPool,
  // ...
});

// AFTER (with bridge):
await updateStage3Cache(mode, {
  activeFilteredPool,
  // ...
});

// NEW: Send to Strategy Engine
await fx5StrategyBridge.updateActivePool(mode, activeFilteredPool);
```

---

### Phase 2: Implement Active Pool Management

**Create Dedicated Service**: `server/services/active-pool-manager.ts`

```typescript
export class ActivePoolManager {
  private pools: Map<string, Map<string, ActivePoolEntry>> = new Map();
  
  interface ActivePoolEntry {
    symbol: string;
    firstSeen: Date;
    lastUpdated: Date;
    expiresAt: Date;
    status: 'eligible' | 'in_trade' | 'cooldown';
  }
  
  /**
   * Add symbol to active pool with deduplication
   */
  async add(mode: 'paper' | 'live', symbol: string, expiryMs: number): Promise<void> {
    const pool = this.getPool(mode);
    
    // Deduplication: Skip if already in pool
    if (pool.has(symbol)) {
      pool.get(symbol)!.lastUpdated = new Date();
      return;
    }
    
    // Add new entry
    pool.set(symbol, {
      symbol,
      firstSeen: new Date(),
      lastUpdated: new Date(),
      expiresAt: new Date(Date.now() + expiryMs),
      status: 'eligible',
    });
  }
  
  /**
   * Remove expired entries
   */
  async pruneExpired(mode: 'paper' | 'live'): Promise<number> {
    const pool = this.getPool(mode);
    const now = new Date();
    let removed = 0;
    
    for (const [symbol, entry] of pool.entries()) {
      if (entry.expiresAt < now) {
        pool.delete(symbol);
        removed++;
      }
    }
    
    return removed;
  }
  
  /**
   * Enforce cooldown period after trade exit
   */
  async applyCooldown(mode: 'paper' | 'live', symbol: string, cooldownMs: number): Promise<void> {
    const pool = this.getPool(mode);
    const entry = pool.get(symbol);
    
    if (entry) {
      entry.status = 'cooldown';
      entry.expiresAt = new Date(Date.now() + cooldownMs);
    }
  }
}
```

---

### Phase 3: Wire Strategy Engine to FX5 Output

**Modify SignalOrchestrator** to consume FX5 active pool:

```typescript
// BEFORE (current - unclear):
// SignalOrchestrator generates signals independently

// AFTER (with FX5 integration):
async generateSignals(): Promise<StrategySignal[]> {
  // Get active filtered pool from FX5 via bridge
  const activePool = await fx5StrategyBridge.getActivePool(this.mode);
  
  const signals: StrategySignal[] = [];
  
  // Evaluate each symbol in active pool
  for (const pair of activePool) {
    // Evaluate all enabled strategies for this symbol
    for (const strategy of this.enabledStrategies) {
      const signal = await this.strategyEngine.evaluate(pair.symbol, strategy);
      if (signal && signal.confidence > 0.5) {
        signals.push(signal);
      }
    }
  }
  
  return signals;
}
```

---

### Phase 4: Implement Passive Mode Checks

**Modify FX5 Scanner** to respect passive mode:

```typescript
async scanMode(mode: 'paper' | 'live'): Promise<ScanResult | null> {
  // ... existing scan logic
  
  // NEW: Check if passive learning mode is enabled
  const isPassiveMode = await this.isPassiveLearningEnabled(mode);
  
  // Build active pool ONLY if NOT in passive mode
  const activeFilteredPool = isPassiveMode 
    ? [] 
    : result.filteredPairs.slice(0, 60).map(pair => ({
        symbol: pair.symbol,
        // ... mapping logic
      }));
  
  // ... rest of scan logic
}

private async isPassiveLearningEnabled(mode: 'paper' | 'live'): Promise<boolean> {
  // Check trading engine state or settings
  const engine = modeRegistry.getEngine(mode);
  return !engine || !engine.isRunning;
}
```

---

### Phase 5: Verify Phase 8.7.x Repairs

**Add History Filter Logic** to FX5 breakdown:

```typescript
// In computeBreakdown() method
const minHistoryDays = filters.minHistoryDays || 30;
const minHistoryMs = minHistoryDays * 24 * 60 * 60 * 1000;

// Check if pair has sufficient history
const pairAge = await this.krakenService.getPairAge(pairName);
if (pairAge < minHistoryMs) {
  breakdown.failed_history++;
  rejected = true;
}
```

**Add Confidence Threshold Check** to Trading Engine:

```typescript
// In processSignal() method
const minConfidence = settings.minSignalConfidence || 0.6;

if (signal.finalScore < minConfidence) {
  console.log(`[mode=${this.mode}] Signal rejected: finalScore ${signal.finalScore} < threshold ${minConfidence}`);
  return null;
}
```

---

## X. Evidence Summary

### Files Inspected
- `server/services/fx5-scanner.ts` (368 lines) - Complete scan logic review
- `server/services/filtered-pairs-service.ts` (212 lines) - Eligible pairs generation
- `server/services/trading-engine.ts` (738 lines) - Strategy engine integration
- `server/services/stage3-state-cache.ts` - Stage-3 cache operations
- `server/services/stage3-emitter.ts` - Stage-3 WebSocket emissions
- `server/storage.ts` - Active trades storage methods

### Grep Searches Conducted
```bash
# Active pool functions
grep -rn "getEligiblePairs\|activeFilteredPool\|addToActivePool\|pruneExpiredEntries" server/services/

# Strategy engine wiring
grep -rn "Strategy.*Engine\|evaluateSymbol\|evaluatePair" server/services/trading-engine.ts

# Stage-3 references
grep -rn "Stage-3\|stage3" server/services/

# Active trades storage
grep -rn "getActiveTrades\|activeFilteredPool" server/storage.ts

# Confidence and history filters
grep -rn "confidence.*threshold\|minHistoryDays" server/services/
```

---

## XI. Wiring Verification Summary

### ✅ What Exists

1. **FX5 Scanner**: Runs every 30s, evaluates Kraken universe, applies filters
2. **Eligible Pairs Generation**: `FilteredPairsService.getValidPairs()` works correctly
3. **Active Pool Construction**: `activeFilteredPool` built from top 60 pairs
4. **Stage-3 Cache**: Stores active pool data
5. **WebSocket Emission**: Broadcasts scan results to frontend
6. **Already Active Tracking**: `already_active` breakdown counter exists
7. **Trading Engine**: Runs independently with `SignalOrchestrator`
8. **Strategy Evaluation**: 9 strategies evaluated, signals generated

### ❌ What's Missing

1. **FX5 → Strategy Bridge**: NO connection between FX5 output and Strategy Engine input
2. **Active Pool Deduplication**: Pool rebuilt from scratch every cycle
3. **Active Pool Expiry**: No persistence of `firstSeen` across cycles
4. **Cooldown After Trade Exit**: Only active trades excluded, no post-exit cooldown
5. **Passive Mode Handling**: No check to keep pool empty in passive mode
6. **History Filter Logic**: `failed_history` counter exists but logic unclear
7. **Active Pool Management Functions**: No `addToActivePool()`, `pruneExpired()`, etc.

### ⚠️ What's Uncertain

1. **SignalOrchestrator Logic**: How does it determine which pairs to evaluate?
2. **minHistoryDays Implementation**: Is history filter actually enforced?
3. **Confidence Threshold**: Is minimum confidence enforced before trades?
4. **Passive Mode Behavior**: Does active pool populate in passive mode?

---

## XII. Compliance Status

### FX5 → ActivePool → Strategy Pipeline Requirements
- [x] FX5 Scanner runs every 30 seconds
- [x] FX5 produces eligible pairs list
- [x] Active pool constructed from eligible pairs
- [ ] Active pool managed with deduplication
- [ ] Active pool managed with expiry
- [ ] Cooldown logic enforced after trade exit
- [ ] Active pool feeds into Strategy Engine
- [ ] Strategy Engine evaluates active pool symbols
- [ ] Passive mode keeps active pool empty

**Compliance**: 33% (3/9 requirements met)

### Phase 8.7.x Repair Persistence
- [x] Confidence scoring implemented
- [ ] Confidence threshold enforced
- [x] `failed_history` counter exists
- [ ] History filter logic verified
- [ ] `minHistoryDays` filter implemented

**Compliance**: 40% (2/5 requirements verified)

### Overall Wiring Compliance
**37% compliant** (5/14 requirements met/verified)

---

## XIII. Risk Assessment

**Severity**: 🔴 **HIGH**

**Impact**:
1. **Architectural Misalignment**: FX5 and Strategy Engine operate in parallel universes
2. **Data Redundancy**: Both FX5 and SignalOrchestrator may fetch Kraken data independently
3. **Inconsistent Pair Selection**: Strategy Engine may evaluate different pairs than FX5 filters
4. **Active Pool Inefficiency**: Rebuilt from scratch every 30s instead of managed persistence
5. **Passive Mode Risk**: Active pool may populate when it shouldn't

**Mitigation**: Implement FX5 → Strategy bridge and active pool management service.

---

## XIV. Recommendations

### Immediate Actions (REB 2)

1. **Verify SignalOrchestrator Logic**: Understand how it selects pairs to evaluate
2. **Check minHistoryDays Implementation**: Confirm history filter is enforced
3. **Test Passive Mode Behavior**: Verify active pool remains empty when engine stopped

### Short-Term Actions (REB 3)

1. **Implement FX5 → Strategy Bridge**: Connect FX5 output to Strategy Engine input
2. **Create Active Pool Manager**: Implement deduplication, expiry, and cooldown logic
3. **Wire SignalOrchestrator**: Modify to consume FX5's `activeFilteredPool`

### Long-Term Actions (REB 4+)

1. **Integration Testing**: Verify end-to-end flow from FX5 → Strategy → Trade
2. **Passive Mode Validation**: Ensure active pool respects passive learning state
3. **Performance Optimization**: Eliminate redundant Kraken API calls
4. **Cooldown Configuration**: Add configurable cooldown periods after trade exit

---

**Report Generated**: November 22, 2025  
**Audit Phase**: REB 1.2 (FX5 → ActivePool → Strategy Wiring Verification)  
**Related Reports**: REB1-01 (FX5 Scanner), REB1-07 (Backend Endpoints)

---

## Notes

This audit reveals a **fundamental architectural disconnect** between the FX5 Scanner and Strategy Engine. While FX5 successfully generates an `activeFilteredPool` of eligible pairs every 30 seconds, this data is used only for Stage-3 cache updates and WebSocket emission—**NOT for driving strategy evaluations**.

The expected pipeline (FX5 → ActivePool → Strategy → ReadyToBuy) **does not exist** in current code. Instead, the Strategy Engine operates independently via `SignalOrchestrator`, which may be fetching and evaluating pairs through a separate pathway.

**Critical Question for REB 2**: How does `SignalOrchestrator` determine which pairs to evaluate? Does it call `FilteredPairsService` independently, or is there another data source?

**For REB 2**: Investigate `SignalOrchestrator` implementation and design bridge architecture to connect FX5 output to Strategy Engine input.
