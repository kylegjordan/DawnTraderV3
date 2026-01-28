# Directive 11.7M – Phase A: Learning Data Path Verification

**Date:** 2026-01-28  
**Schema Reference:** directive/v11.7M  
**Status:** COMPLETE - Awaiting Approval Before Phase B

---

## A1. Authoritative Learning Data Source

### Declaration

**The authoritative source for simulated trade outcomes during passive learning is:**

```
logs/virtual_trades/{YYYY-MM-DD}.json
```

### Evidence

| Metric | Value |
|--------|-------|
| Active Files | 8 files (Jan 21-28, 2026) |
| Total Trades | ~1,547 closed trades |
| Total Lines | 95,020 |
| Schema Version | 1.6.7 |

### Schema Definition

```typescript
interface VirtualTrade {
  id: string;                    // Format: "vts_{SYMBOL}_{timestamp}"
  signal: {
    id: string;                  // Signal ID
    symbol: string;              // Trading pair (e.g., "BTC/USD")
    entryPrice: number;          // Entry price
    takeProfit: number;          // TP target
    stopLoss: number;            // SL target
    strategy: string;            // Canonical strategy (snake_case)
    signalType: string;          // "QUANT" | "PATTERN" | "HYBRID"
    patternType: string | null;  // Pattern name if applicable
    regime: string;              // Market regime (uppercase)
    finalScore: number;          // Combined score [0-1]
    hybridScore: number;         // Hybrid component [0-1]
    predictiveConfidence: number;// ML confidence [0-1]
    regimeWeight: number;        // Regime alignment [0-1]
    pool: string;                // "ideal" | "rotational"
    source: string;              // Always "simulation" for VTS
  };
  status: string;                // "open" | "closed"
  resultType: string;            // "take_profit" | "stop_loss" | "timeout"
  entryTime: number;             // Unix timestamp (ms)
  exitTime: number;              // Unix timestamp (ms)
  exitPrice: number;             // Actual exit price
  grossProfit: number;           // P&L before fees (percentage)
  netProfit: number;             // P&L after fees (percentage)
  fees: number;                  // Fee amount
  positionSize: number;          // Position size in USD
  calibrated: boolean;           // Whether calibration was applied
  schemaVersion: string;         // "1.6.7"
}
```

### Fields Required by Learning Systems

| Field | ML Calibration | Heuristic Trader | Signal Optimizer | Cognitive Adjuster |
|-------|----------------|------------------|------------------|--------------------|
| signalType | **Required** | - | Required | - |
| patternType | Required | - | - | - |
| pnl/netProfit | **Required** | Required | Required | Required |
| regime | - | Required | Required | - |
| strategy | - | Required | Required | - |
| finalScore | - | - | Required | Required |
| hybridScore | - | - | - | Required |

### Retention Policy

- **Location:** `logs/virtual_trades/`
- **Naming:** One file per UTC day (`YYYY-MM-DD.json`)
- **Retention:** Indefinite (no automatic cleanup)
- **Persistence:** File-based, survives restart

### Concrete Example Trade Object (Reference)

```json
{
  "id": "vts_PRIME_USD_1769582814043",
  "signal": {
    "id": "vs_1769581497841_s1h1u31c7",
    "symbol": "PRIME/USD",
    "entryPrice": 0.697,
    "takeProfit": 0.7135,
    "stopLoss": 0.6871,
    "strategy": "adaptive_flow",
    "signalType": "HYBRID",
    "patternType": "TRI_STAR",
    "regime": "LOW_VOL_CHOP",
    "finalScore": 0.4538,
    "hybridScore": 0.4890,
    "predictiveConfidence": 0.5418,
    "regimeWeight": 0.4911,
    "pool": "rotational",
    "source": "simulation"
  },
  "status": "closed",
  "resultType": "stop_loss",
  "entryTime": 1769581497841,
  "exitTime": 1769582814043,
  "exitPrice": 0.6871,
  "grossProfit": -0.0142,
  "netProfit": -0.0218,
  "fees": 1.9092,
  "positionSize": 250,
  "calibrated": true,
  "schemaVersion": "1.6.7"
}
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        VTS DATA FLOW DIAGRAM                            │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│   VTS Runner     │
│  (vts-runner.ts) │
└────────┬─────────┘
         │ executePhase10Session()
         ▼
┌──────────────────┐
│  Process Signals │──────────────────────────────────────────┐
│  Open/Close      │                                          │
│  Virtual Trades  │                                          │
└────────┬─────────┘                                          │
         │                                                    │
         ├─────────────────────────┐                          │
         ▼                         ▼                          ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   VTS Service    │    │    Telemetry     │    │   In-Memory      │
│ persistRealPrice │    │   Aggregator     │    │ phase10Session   │
│     Trade()      │    │ recordPairTelemetry│  │     Trades       │
└────────┬─────────┘    └────────┬─────────┘    └──────────────────┘
         │                       │
         ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│  logs/virtual_   │    │   In-Memory      │
│  trades/         │    │   (24h rolling)  │
│  {date}.json     │    │                  │
└────────┬─────────┘    └──────────────────┘
         │                              
         │  AUTHORITATIVE SOURCE
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    LEARNING SYSTEM CONSUMERS                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐        │
│  │ ML Calibration │    │Heuristic Trader│    │Signal Optimizer│        │
│  │                │    │                │    │                │        │
│  │ getRecentTrades│    │ storage.get    │    │ storage.get    │        │
│  │ (CASE BUG) ❌  │    │ Trades() ❌    │    │ Predictions ❌ │        │
│  └────────────────┘    └────────────────┘    └────────────────┘        │
│                                                                         │
│  ┌────────────────┐    ┌────────────────┐                              │
│  │Cognitive Adj.  │    │Adaptive Guards │                              │
│  │                │    │                │                              │
│  │ storage.get    │    │ behavioralLog  │                              │
│  │ Learning ❌    │    │ table ❌       │                              │
│  └────────────────┘    └────────────────┘                              │
│                                                                         │
│  Legend: ✅ = Consuming VTS data, ❌ = Not consuming VTS data          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## A2. Learning System Intake Audit

### System 1: ML Calibration Service

| Attribute | Value |
|-----------|-------|
| **File** | `server/services/ml-calibration.ts` |
| **Expected Input** | VTS closed trades via `getRecentTrades()` |
| **Actual Input** | VTS closed trades via `getRecentTrades()` |
| **Code Reference** | Line 96: `getRecentTradesFn(windowSize, 'Hybrid')` |
| **Filtering Logic** | Exact string match on signalType |
| **VTS Trade Visibility** | ❌ **INVISIBLE** |
| **Exact Reason** | Case mismatch: `'Hybrid'` vs `'HYBRID'` |

**Evidence (Log Entry):**
```json
{
  "timestamp": "2026-01-28T08:00:00.076Z",
  "parameter": "ml.scheduler_run",
  "reason": "Calibration skipped: No Hybrid trades found for calibration"
}
```

---

### System 2: Heuristic Trader

| Attribute | Value |
|-----------|-------|
| **File** | `server/services/heuristic-trader.ts` |
| **Expected Input** | VTS trades during passive learning |
| **Actual Input** | Database `trades` table |
| **Code Reference** | Line 151: `storage.getTrades(mode)` |
| **Filtering Logic** | Mode-based (paper/live) |
| **VTS Trade Visibility** | ❌ **INVISIBLE** |
| **Exact Reason** | Reads database table, not VTS file logs |

---

### System 3: Signal Weight Optimizer

| Attribute | Value |
|-----------|-------|
| **File** | `server/services/signal-weight-optimizer.ts` |
| **Expected Input** | VTS prediction outcomes |
| **Actual Input** | Database `predictionOutcomes` |
| **Code Reference** | Line 90: `storage.getPredictionOutcomes()` |
| **Filtering Logic** | User-based, time window |
| **VTS Trade Visibility** | ❌ **INVISIBLE** |
| **Exact Reason** | Reads database table, not VTS file logs |

---

### System 4: Cognitive Weight Adjuster

| Attribute | Value |
|-----------|-------|
| **File** | `server/services/cognitive-weight-adjuster.ts` |
| **Expected Input** | VTS learning sources |
| **Actual Input** | Database `learningSources` |
| **Code Reference** | Line 38: `storage.getLearningSources()` |
| **Filtering Logic** | User-based |
| **VTS Trade Visibility** | ❌ **INVISIBLE** |
| **Exact Reason** | Reads database table, not VTS file logs |

---

### System 5: Adaptive Guardrails

| Attribute | Value |
|-----------|-------|
| **File** | `server/services/adaptive-guardrails.ts` |
| **Expected Input** | VTS behavioral outcomes |
| **Actual Input** | Database `behavioralLog` table |
| **Code Reference** | Line 118: `.from(behavioralLog)` |
| **Filtering Logic** | Time-based, action type |
| **VTS Trade Visibility** | ❌ **INVISIBLE** |
| **Exact Reason** | Reads behavioral log, not trade outcomes |

---

### System 6: Telemetry Aggregator

| Attribute | Value |
|-----------|-------|
| **File** | `server/services/telemetry-aggregator.ts` |
| **Expected Input** | VTS trade metrics |
| **Actual Input** | VTS Runner calls `recordPairTelemetry()` |
| **Code Reference** | vts-runner.ts Line 760 |
| **Filtering Logic** | None (accepts all) |
| **VTS Trade Visibility** | ✅ **VISIBLE** |
| **Note** | Data is in-memory only, not persisted |

---

### Summary Table

| System | Data Source | VTS Visibility | Reason |
|--------|-------------|----------------|--------|
| ML Calibration | VTS getRecentTrades() | ❌ Invisible | Case mismatch `'Hybrid'` vs `'HYBRID'` |
| Heuristic Trader | DB trades table | ❌ Invisible | Wrong data source |
| Signal Weight Optimizer | DB predictionOutcomes | ❌ Invisible | Wrong data source |
| Cognitive Weight Adjuster | DB learningSources | ❌ Invisible | Wrong data source |
| Adaptive Guardrails | DB behavioralLog | ❌ Invisible | Wrong data source |
| Telemetry Aggregator | VTS Runner direct call | ✅ Visible | In-memory only |

---

## A3. Minimal Viability Fix Identification

### Unblock Candidates (Ordered by Priority)

#### Fix #1: ML Calibration Case Sensitivity (PRIORITY 1)

| Attribute | Value |
|-----------|-------|
| **Location** | `server/services/ml-calibration.ts` line 96 |
| **Current Code** | `getRecentTradesFn(windowSize, 'Hybrid')` |
| **Fixed Code** | `getRecentTradesFn(windowSize, 'HYBRID')` |
| **Characters Changed** | 1 (lowercase 'y' to uppercase 'Y', 'H' stays) |
| **Impact** | Enables 316 HYBRID trades to flow into ML Calibration |
| **Risk** | **LOW** |
| **Safe** | Yes - changes filter value only |
| **Reversible** | Yes - single line revert |
| **Isolated** | Yes - affects only ML Calibration intake |

#### Fix #2: Case-Insensitive Comparison (Alternative)

| Attribute | Value |
|-----------|-------|
| **Location** | `server/services/vts-service.ts` line 416 |
| **Current Code** | `t.signal.signalType === signalType` |
| **Fixed Code** | `t.signal.signalType.toUpperCase() === signalType.toUpperCase()` |
| **Impact** | Makes all signal type lookups case-insensitive |
| **Risk** | **LOW** |
| **Safe** | Yes - defensive programming |
| **Reversible** | Yes - single line revert |
| **Isolated** | Yes - affects only VTS trade retrieval |

**Recommendation:** Implement Fix #1 (simpler, more targeted).

---

### Future Fixes (Not For Phase B)

These require more extensive changes and should be addressed after ML Calibration is proven working:

| System | Required Change | Risk | Scope |
|--------|-----------------|------|-------|
| Heuristic Trader | Wire to VTS file logs | Medium | Multiple files |
| Signal Weight Optimizer | Create VTS prediction mapper | Medium | New adapter |
| Cognitive Weight Adjuster | Create VTS learning mapper | Medium | New adapter |
| Adaptive Guardrails | Generate behavioral entries from VTS | Medium | New integration |

---

## Phase A Deliverables Checklist

| Deliverable | Status |
|-------------|--------|
| Data flow diagram | ✅ Complete |
| Concrete example trade object | ✅ Complete |
| Table: system → data source → visibility | ✅ Complete |
| Code references (file + line numbers) | ✅ Complete |
| Ordered list of unblock candidates | ✅ Complete |
| Risk assessment for each fix | ✅ Complete |

---

## Recommendation

**Proceed to Phase B (B1 Only):**

1. Implement Fix #1 (case sensitivity in `ml-calibration.ts`)
2. Restart system
3. Wait for next calibration cycle (8-hour intervals: 0:00, 8:00, 16:00 UTC)
4. Verify logs show "Trades loaded" instead of "No Hybrid trades found"
5. Confirm predictive adjustment is generated

**Do NOT proceed with:**
- Other learning system fixes (Phase B is ML Calibration only)
- UI changes
- Threshold adjustments
- Behavioral changes

---

**Document Prepared:** 2026-01-28T15:00:00Z  
**Schema:** directive/v11.7M
