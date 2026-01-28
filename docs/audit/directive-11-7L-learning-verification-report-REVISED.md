# Directive 11.7L — Phase 11 Learning Verification Audit (REVISED)

**Audit Date:** 2026-01-28  
**Revision:** 2.0 (Corrected for active VTS trade discovery)  
**Schema Reference:** audit/v1.1  
**Status:** COMPLETE

---

## Executive Summary

**CRITICAL CORRECTION:** The initial audit incorrectly concluded "0 trades created." This revision confirms:

| Metric | Initial Report | Revised Finding |
|--------|----------------|-----------------|
| VTS Trades Created | 0 | **1,547 trades** (Jan 21-28) |
| HYBRID Trades Available | 0 | **316 HYBRID trades** |
| ML Calibration Receiving Data | No | **NO** (case sensitivity bug) |
| Other Learning Systems | No data | **NO** (wrong data source) |

**Root Cause:** VTS simulated trades ARE being created and stored correctly, but **NO learning system is consuming them** due to wiring gaps.

---

## Trade Data Inventory (Corrected)

### VTS File-Based Trades (`logs/virtual_trades/`)

| Date | Total Trades | HYBRID | QUANT | PATTERN |
|------|-------------|--------|-------|---------|
| Jan 21 | 131 | 35 | - | - |
| Jan 22 | 356 | 54 | - | - |
| Jan 23 | 500 | 100 | 396 | 4 |
| Jan 24 | 253 | 56 | - | - |
| Jan 26 | 79 | 23 | - | - |
| Jan 27 | 149 | 30 | - | - |
| Jan 28 | 79 | 21 | 57 | 1 |
| **TOTAL** | **1,547** | **316** | **~600+** | **~10** |

### Database `paper_sim_trades` Table

| Date Range | Count | Signal Types |
|------------|-------|--------------|
| Dec 29-31, 2025 | 107 | QUANT only |

**Note:** Database contains LEGACY data from ~1 month ago. NOT current VTS trades. Current trades are stored in file logs only.

---

## Learning System Data Flow Audit

### System 1: ML Calibration Service

**Expected Data Flow:**
```
VTS File Logs → loadHistoricalTrades() → getRecentTrades(50, 'Hybrid') → MLCalibrationService.analyzePerformance()
```

**Actual Status: ❌ BLOCKED**

**Evidence from logs (2026-01-28):**
```json
{
  "timestamp": "2026-01-28T08:00:00.076Z",
  "parameter": "ml.scheduler_run",
  "reason": "Calibration skipped: No Hybrid trades found for calibration"
}
```

**Root Cause: Case Sensitivity Mismatch**

| Location | Code | Value |
|----------|------|-------|
| `ml-calibration.ts` line 96 | `getRecentTradesFn(windowSize, 'Hybrid')` | `'Hybrid'` (Title case) |
| `vts-service.ts` line 416 | `t.signal.signalType === signalType` | Exact match comparison |
| VTS Trade Data | `signal.signalType` | `'HYBRID'` (UPPERCASE) |

**Result:** `'HYBRID' === 'Hybrid'` → `false` → All 316 HYBRID trades filtered out.

**Fix Required:**
- Change `'Hybrid'` to `'HYBRID'` in `server/services/ml-calibration.ts` line 96
- OR make comparison case-insensitive in `server/services/vts-service.ts` line 416

---

### System 2: Heuristic Trader

**Expected Data Source:** VTS trades during passive learning  
**Actual Data Source:** `storage.getTrades(mode)` - Database trades table

**Status: ❌ WRONG DATA SOURCE**

The Heuristic Trader reads from:
```typescript
// server/services/heuristic-trader.ts line 151
allTrades = await storage.getTrades(mode);
```

This queries the `trades` database table (live/paper trades), NOT VTS file logs.

**During passive learning:** The `trades` table is empty (no real trades), so Heuristic Trader has zero data.

**Fix Required:** Wire Heuristic Trader to read from VTS file logs or add VTS trades to database.

---

### System 3: Adaptive Guardrails

**Expected Data Source:** VTS trades during passive learning  
**Actual Data Source:** `behavioralLog` database table

**Status: ❌ WRONG DATA SOURCE**

```typescript
// server/services/adaptive-guardrails.ts line 118
.from(behavioralLog)
```

Adaptive Guardrails learns from the behavioral log table, which records user/system actions, NOT trade outcomes.

**During passive learning:** No behavioral entries are being generated from VTS outcomes.

**Fix Required:** Generate behavioral log entries from VTS trade outcomes.

---

### System 4: Signal Weight Optimizer

**Expected Data Source:** VTS trades during passive learning  
**Actual Data Source:** `storage.getPredictionOutcomes()` - Database

**Status: ❌ WRONG DATA SOURCE**

```typescript
// server/services/signal-weight-optimizer.ts line 90
const outcomes = await storage.getPredictionOutcomes(userId, {...});
```

Signal Weight Optimizer reads prediction outcomes from database, NOT VTS file logs.

**During passive learning:** No prediction outcomes exist (no live trades), so optimizer has zero data.

**Fix Required:** Wire prediction outcomes from VTS trades to storage.

---

### System 5: Cognitive Weight Adjuster

**Expected Data Source:** VTS trades during passive learning  
**Actual Data Source:** `storage.getLearningSources()` - Database

**Status: ❌ WRONG DATA SOURCE**

```typescript
// server/services/cognitive-weight-adjuster.ts line 38
const learningSources = await storage.getLearningSources(userId);
```

Cognitive Weight Adjuster reads learning sources from database, NOT VTS file logs.

**During passive learning:** No learning sources populated from VTS.

**Fix Required:** Populate learning sources from VTS trade outcomes.

---

### System 6: Telemetry Aggregator

**Expected Data Flow:**
```
VTS Runner → telemetry.recordPairTelemetry() → In-memory telemetry store
```

**Actual Status: ✅ WORKING (Partial)**

VTS Runner DOES write telemetry:
```typescript
// server/services/vts-runner.ts line 760
telemetry.recordPairTelemetry(trade.symbol, {...});
```

**However:** Telemetry is stored in memory, not persisted. The `logs/telemetry/` directory shows last write on Jan 22:
```
-rw-r--r-- 1 runner runner 2998 Jan 22 18:44 regime_performance_2026-01-22_VTS_449.json
```

Telemetry data is available for real-time decisions but may be lost on restart.

---

## Skipped Signals Analysis (Jan 28)

| Outcome | Count | Percentage |
|---------|-------|------------|
| **Trades Created** | 79 | 1.8% |
| **Skipped: Duplicate_Position** | 2,737 | 64.9% |
| **Skipped: Low_ROI** | 1,404 | 33.3% |
| **Skipped: Net_EV_Negative** | 77 | 1.8% |
| **TOTAL EVALUATED** | 4,297 | 100% |

**Key Finding:** Most signals are skipped due to `Duplicate_Position` (already have an open position for that symbol). This is expected behavior during active simulation.

---

## Summary of Wiring Gaps

| # | Learning System | Data Source Issue | Fix Location |
|---|-----------------|-------------------|--------------|
| 1 | ML Calibration | Case sensitivity: `'Hybrid'` vs `'HYBRID'` | `ml-calibration.ts:96` |
| 2 | Heuristic Trader | Reads database, not VTS logs | `heuristic-trader.ts:151` |
| 3 | Adaptive Guardrails | Reads behavioralLog, not VTS | Need new wiring |
| 4 | Signal Weight Optimizer | Reads predictionOutcomes, not VTS | Need new wiring |
| 5 | Cognitive Weight Adjuster | Reads learningSources, not VTS | Need new wiring |
| 6 | Telemetry Aggregator | Works but in-memory only | Consider persistence |

---

## Recommended Fixes (Priority Order)

### Priority 1: ML Calibration Case Fix (Immediate Impact)
**Location:** `server/services/ml-calibration.ts` line 96  
**Current:** `const trades = await getRecentTradesFn(windowSize, 'Hybrid');`  
**Fix:** `const trades = await getRecentTradesFn(windowSize, 'HYBRID');`  
**Impact:** Enables ML Calibration to process 316 existing HYBRID trades immediately.

### Priority 2: Alternative - Case-Insensitive Comparison
**Location:** `server/services/vts-service.ts` line 416  
**Current:** `allTrades.filter(t => t.signal.signalType === signalType)`  
**Fix:** `allTrades.filter(t => t.signal.signalType.toUpperCase() === signalType.toUpperCase())`  
**Impact:** More robust, handles any case variations.

### Priority 3: Include All Signal Types in ML Calibration
**Location:** `server/services/ml-calibration.ts` line 96  
**Option:** Remove signal type filter entirely or add QUANT/PATTERN  
**Impact:** Enables learning from all 1,547 trades, not just 316 HYBRID.

### Priority 4: Wire Other Learning Systems to VTS
**Scope:** Heuristic Trader, Adaptive Guardrails, Signal Weight Optimizer, Cognitive Weight Adjuster  
**Approach:** Create adapter layer to expose VTS file logs as data source for these systems  
**Impact:** Full learning pipeline activation during passive learning mode.

---

## Conclusion

The VTS is successfully creating 1,547 simulated trades with proper metrics (finalScore, hybridScore, regimeWeight, etc.). However, **ZERO learning systems are consuming this data** due to:

1. **Case sensitivity bug** blocking ML Calibration (single character fix)
2. **Wrong data sources** - Other learning systems read from database tables that are empty during passive learning

The most impactful immediate fix is the case sensitivity correction in `ml-calibration.ts`, which would enable ML Calibration to immediately process 316 HYBRID trades.

---

**Report Generated:** 2026-01-28T14:30:00Z  
**Auditor:** Replit Agent  
**Schema:** audit/v1.1
