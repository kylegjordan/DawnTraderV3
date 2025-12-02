# Phase 8.8.3-J – Execution Attempt Metrics & RTB/Execution Diagnostics

## J.1 Backend Audit: Decision Points Identified

### Trading Flow Summary

```
FX5 Scanner (30s intervals)
    ↓
Active Filter Pool (deduped, 5-min TTL)
    ↓
Strategy Evaluation (per symbol in pool)
    ↓
RTB Signal Generation (saved to trading_signals)
    ↓
Execution Attempt (checkGuardrailRisk)
    ↓
Trade Opened OR Blocked (with reason)
```

### P1 – Active Filter Pool → RTB Signal

**Location:** `server/services/paper-execution-engine.ts` lines 540-669

**Flow:**
1. `scanForSignals()` gets active pool from `activeFilterPool.getActivePool(mode)`
2. For each symbol, calls `checkSymbolForSignal(symbol, settings)`
3. Runs all 9 strategy detectors:
   - vwap_pullback
   - abcd_long
   - sma_trend_ride
   - breakout
   - mean_reversion
   - range_trading
   - vwap_bounce
   - liquidity_trap
   - dhma
4. Best confidence signal is selected and saved to `trading_signals` table

**Hook Point for Metrics:**
- After strategy evaluation at line 562 (signal selection)
- Already has logging: `[8.8.3-I][RTB_ENQUEUE]`

### P2 – RTB → Execution Attempt

**Location:** `server/services/paper-execution-engine.ts` line 671

**Flow:**
1. After RTB signal is saved, immediately calls `executeSimulatedTrade(bestSignal, settings)`
2. This is inline - every RTB signal = one execution attempt

**Current Logging:**
- `[Exec] signal_snapshot` at line 568
- `[27.F.14.B][PaperSim] candidate_selected` at line 571

### P3 – Execution Attempt → Opened / Blocked

**Location:** `server/services/paper-execution-engine.ts` lines 746-897 (`executeSimulatedTrade`)

**Flow:**
1. Builds `TradeCandidate` object (lines 752-758)
2. Calls `checkGuardrailRisk(mode, tradeCandidate)` (line 760)
3. If blocked (`!riskCheck.ok`):
   - Logs at line 763-774: `[8.8.3-H4][GUARDRAIL_BLOCK]`
   - Broadcasts `risk_check_failed` event
   - Creates trade log entry (line 795)
   - Returns without opening trade
4. If passed:
   - Logs at line 811: `risk_check_passed`
   - Calculates position size (lines 824-833)
   - Creates trade record (line 870)
   - Creates open position (line 886)

**checkGuardrailRisk() Checks (trade-safety.ts lines 401-432):**
1. `checkKillSwitch()` → KILL_SWITCH
2. `checkStopLossRequired()` → NO_STOP_LOSS, INVALID_STOP_LOSS
3. `checkMaxPositionsPerAsset()` → POSITION_LIMIT
4. `checkSymbolCooldown()` → COOLDOWN
5. `checkPositionSizeCap()` → MAX_POSITION
6. `checkLowPricedCoinProtection()` → LPCP_LOW_PRICE, LPCP_MIN_NOTIONAL, FX_CONVERSION_FAILED
7. `checkMaxOpenTrades()` → MAX_TRADES

---

## Files Audited

| File | Purpose | Hook for J |
|------|---------|------------|
| `server/services/fx5-scanner.ts` | 30-second market scanner | No changes needed |
| `server/services/active-filter-pool.ts` | Deduped symbol pool with TTL | No changes needed |
| `server/services/paper-execution-engine.ts` | Main execution loop | **P3 hook: executeSimulatedTrade()** |
| `server/services/trade-executor.ts` | Abstraction layer for trade execution | Uses checkGuardrailRisk via validateSignal() |
| `server/services/trade-safety.ts` | Guardrail checks | Already returns codes for block_reason |
| `server/storage.ts` | Database access | Will add execution_attempt_audit methods |

---

## Strategy Catalog Verification

**Strategy Engine Type Definition (strategy-engine.ts line 9):**
```typescript
strategy: 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride' | 'breakout' | 
          'mean_reversion' | 'range_trading' | 'vwap_bounce' | 'liquidity_trap' | 'dhma';
```

**Count: 9 strategies including DHMA** ✓

---

## Implementation Status

### J.2 - Schema ✓ COMPLETE
Created `execution_attempt_audit` table with:
- id (VARCHAR PRIMARY KEY)
- created_at (TIMESTAMPTZ)
- mode (trading_mode enum)
- symbol (VARCHAR)
- strategy (VARCHAR)
- decision (execution_decision enum: BLOCKED | OPENED)
- block_reason (execution_block_reason enum)
- block_detail (TEXT)
- entry_price, stop_price, target_price (NUMERIC)
- confidence, portfolio_value, risk_amount, position_size (NUMERIC)
- trade_id (VARCHAR, for OPENED decisions)
- metadata (JSONB)

Indexes created on: mode, symbol, decision, created_at, strategy

### J.3 - Backend Wiring ✓ COMPLETE
Added non-blocking audit logging in `executeSimulatedTrade()`:
- **BLOCKED path (lines 810-822):** Logs with guardrail rejection code and detail
- **OPENED path (lines 982-996):** Logs after trade creation with position sizing details

Storage methods added:
- `createExecutionAttemptAudit(audit)` - Non-blocking insert
- `getExecutionAttempts(mode, options)` - Fetch with filters
- `getExecutionAttemptStats(mode, hours)` - Aggregated statistics

### J.4 - API ✓ COMPLETE
Added read-only endpoints (server/routes.ts lines 10636-10679):
- `GET /api/metrics/execution-attempts` - List attempts with filters (mode, symbol, strategy, decision)
- `GET /api/metrics/execution-attempts/stats` - Aggregated stats (24h window)

### J.5 - UI ✓ COMPLETE
Created `ExecutionMetricsPanel` component (client/src/components/trading/execution-metrics.tsx):
- 4-stat grid: Total Attempts, Opened, Blocked, Open Rate
- Block reasons breakdown by category
- Recent attempts list with decision indicators
- Empty state when no execution attempts

Added to Ready to Buy tab in active-trades.tsx.

---

**Audit Date:** 2025-12-02
**Last Updated:** 2025-12-02
**Auditor:** DawnTrader Agent

## Constraints Verification

| Constraint | Status |
|------------|--------|
| No changes to Walter/Autonomy | ✓ Verified |
| No changes to behavioral-template | ✓ Verified |
| No changes to kill-switch logic | ✓ Verified |
| No changes to guardrails_v2 rules | ✓ Verified |
| Read-only metrics/logging only | ✓ Verified |
| Strategy count = 9 (incl. DHMA) | ✓ Verified |
