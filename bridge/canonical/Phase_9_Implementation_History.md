# Phase 9 — Complete Implementation History

**Document Created:** January 02, 2026  
**Scope:** All Phase 9 work from 9.0 through 9.9  
**Purpose:** Comprehensive record of Phase 9 Math Core Finalization

---

# Table of Contents

1. [Phase 9 Overview](#1-phase-9-overview)
2. [Phase 9.0-9.6: Foundation Prep & Parity](#2-phase-90-96-foundation-prep--parity)
3. [Phase 9.7: Guardrails Migration](#3-phase-97-guardrails-migration)
4. [Phase 9.8: Validation & Legacy Purge](#4-phase-98-validation--legacy-purge)
5. [Phase 9.9: CWQI Net Expectancy & Friction Standardization](#5-phase-99-cwqi-net-expectancy--friction-standardization)
6. [Technical Deliverables Summary](#6-technical-deliverables-summary)
7. [Test Suite Summary](#7-test-suite-summary)

---

# 1. Phase 9 Overview

## 1.1 Mission Statement

Phase 9's mission was to **finalize the mathematical core** of DawnTrader V3, establishing single sources of truth for all quantitative calculations used in trade evaluation, position sizing, and risk management.

## 1.2 Phase 9 Timeline

| Sub-Phase | Description | Status | Completion |
|-----------|-------------|--------|------------|
| 9.0-FP | Foundation Prep & Deprecated File Cleanup | ✅ COMPLETED | December 2025 |
| 9.1-9.5 | Core Math Standardization | ✅ COMPLETED | December 2025 |
| 9.6 | Sim-to-Live Parity Test Suite | ✅ COMPLETED | December 2025 |
| 9.7 | Guardrails v2 Migration | ✅ COMPLETED | December 2025 |
| 9.8 | Validation & Legacy Purge | ✅ COMPLETED | January 2026 |
| 9.9 | CWQI Net Expectancy & Friction Standardization | ✅ COMPLETED | January 2026 |

## 1.3 Key Achievements

- **SYSTEM_GUARDS Configuration Lock**: Centralized all mathematical constants
- **Guardrails v2 Migration**: Percentage-based risk management
- **Unified Filter Gateway**: Single source of truth for filtered pairs
- **CWQI Net EV Model**: Standardized friction and expectancy calculations
- **Comprehensive Test Suite**: 31+ tests covering parity and regression

---

# 2. Phase 9.0-9.6: Foundation Prep & Parity

## 2.1 Phase 9.0-FP — Foundation Prep

**Purpose:** Clean deprecated files and establish deprecated file quarantine locations.

**Implementation:**
- Created `/server/_deprecated/` quarantine folder
- Created `/client/src/components/_deprecated/` quarantine folder
- Moved legacy files to quarantine instead of deletion
- Updated repo-map.json with deprecated locations

**Outcome:** Clean separation of active and deprecated code.

## 2.2 Phase 9.1-9.5 — Core Math Standardization

**Purpose:** Establish SYSTEM_GUARDS as single source of mathematical truth.

**Implementation:**
- Created `server/config/system-guards.ts` with all key thresholds
- Migrated all hardcoded constants to SYSTEM_GUARDS
- Added version tracking: `VERSION: "Phase9_Final"`

**Key Constants Centralized:**
```typescript
SYSTEM_GUARDS = {
  VERSION: "Phase9_Final",
  MIN_LIQUIDITY_SCORE: 40,
  MAX_VOL_NOISE: 0.6,
  BASE_FEE_SLIPPAGE: 0.005,  // 0.5%
  MIN_PWIN: 0.40,
  MAX_PWIN: 0.60,
  PARITY_TOLERANCE: 0.000001,
  // ... additional constants
}
```

## 2.3 Phase 9.6 — Sim-to-Live Parity

**Purpose:** Ensure paper simulation and live trading use identical mathematical models.

**Implementation:**
- Created `server/tests/integration/parity.test.ts`
- 5 parity tests covering determinism, entry/stop calculations, friction, pWin bounds
- Configuration version verification

**Test Categories:**
1. CWQI evaluation determinism under identical inputs
2. Entry/Stop/Target calculation determinism
3. Friction calculation uses centralized SYSTEM_GUARDS
4. Win probability bounded by MIN_PWIN and MAX_PWIN
5. Configuration version matches Phase9_Final

---

# 3. Phase 9.7: Guardrails Migration

## 3.1 Problem Statement

The legacy `guardrails` table used dollar-based risk values that didn't scale with portfolio size. The system needed percentage-based risk management.

## 3.2 Implementation

**Database Changes:**
- Created `guardrails_v2` table with percentage-based fields
- Deprecated legacy `guardrails` table

**Key Field Differences:**

| Legacy (guardrails) | V2 (guardrails_v2) |
|---------------------|---------------------|
| `riskPerTrade` (dollars) | `portfolioRiskPerTradePct` (%) |
| `cooldownMinutes` | `symbolCooldownMinutes` |
| `maxDailyLoss` (dollars) | `dailyLossKillSwitchPct` (%) |
| — | `maxPositionPercentPct` |
| — | `maxTotalExposurePct` |

**Deprecated Methods (Now Throw Errors):**
- `storage.getGuardrails()` → Use `storage.getGuardrailsV2()`
- `storage.upsertGuardrails()` → Use `storage.upsertGuardrailsV2()`
- `updateGuardrails()` → Use `updateGuardrailsV2()`

**Read-Only Legacy Access:**
- `storage.getGuardrailsLegacy()` — For debugging/audit only

## 3.3 Migrated Files

- `server/storage.ts`
- `server/services/trade-safety.ts`
- `server/services/goal-feasibility.ts`
- `server/services/heuristic-trader.ts`
- `server/services/baseline-indicator.ts`
- `server/services/config-update-service.ts`
- `server/services/execution-policy-controller.ts`
- `server/services/micro-execution-service.ts`
- `server/services/state-awareness.ts`
- `server/services/bob-config.ts`
- `server/routes.ts`

---

# 4. Phase 9.8: Validation & Legacy Purge

## 4.1 Directive 9.8.A — Integrity Verification

**Deliverable:** Created `server/scripts/verify-phase-9.ts`

**Verification Checks (6/6 Pass):**
1. ✅ Guardrails_v2 table active and accessible
2. ✅ Legacy getGuardrails() blocked (throws error)
3. ✅ Legacy upsertGuardrails() blocked (throws error)
4. ✅ SYSTEM_GUARDS.VERSION === "Phase9_Final"
5. ✅ SYSTEM_GUARDS constants consistent
6. ✅ UnifiedFilterGateway operational

**Run Command:**
```bash
npx tsx server/scripts/verify-phase-9.ts
```

## 4.2 Directive 9.8.B — Garbage Collection

**Deleted Legacy Files:**
- `server/services/filtered-pairs.legacy.service.ts`
- `client/src/components/_deprecated/rtb-queue-panel.legacy.tsx`
- `server/_deprecated/market-data-ws.legacy.ts`
- `server/_deprecated/kraken-websocket-adapter.legacy.ts`

## 4.3 Directive 9.8.C — Unified Filtering

**Deliverable:** Created `server/services/unified-filter-gateway.ts`

**Filter Architecture (Post-9.8):**

```
┌─────────────────────────────────────────────────────────────────┐
│                    FILTER ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐    ┌───────────────────────────────┐  │
│  │   FX5 Scanner       │───▶│   ActiveFilterPoolService      │  │
│  │   (30s cycle)       │    │   (TTL-based, trading only)    │  │
│  └─────────────────────┘    └───────────────┬───────────────┘  │
│                                              │                   │
│                                              ▼                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                  UnifiedFilterGateway                        ││
│  │                  (Single Source of Truth)                    ││
│  │                                                              ││
│  │   • Wraps ActiveFilterPoolService                           ││
│  │   • Exposes to UI + Analytics + Trading                     ││
│  │   • TTL hydration from Kraken on cold start                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────┐                                        │
│  │   screener_filters  │    User-configurable in Screeners tab │
│  │   (database table)  │                                        │
│  └─────────────────────┘                                        │
│                                                                  │
│  ❌ Legacy FilteredPairsService — DELETED                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 4.4 Directive 9.8.D — Simulator Hardening

**Fix:** Null handling in `server/services/paper-sim-service.ts` line 631

**Issue:** Potential null reference when accessing portfolio state
**Solution:** Added null coalescing and validation checks

---

# 5. Phase 9.9: CWQI Net Expectancy & Friction Standardization

## 5.1 Problem Statement

CWQI (Confidence-Weighted Quality Index) calculations were using inconsistent friction/cost models. The Gate check and Score calculation needed to use identical Net Expectancy (netEV) values.

## 5.2 Directive 9.9.A — Friction Standardization

**Deliverable:** Added `calculateFriction()` in `server/utils/analysis-utils.ts`

**Formula:**
```typescript
Friction = (entryPrice + exitPrice) × quantity × BASE_FEE_SLIPPAGE
```

**Configuration:**
- Uses `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` (0.5% = 0.005)
- Applies to both entry and exit sides of trade

## 5.3 Directive 9.9.B — CWQI Net EV Upgrade

**File:** `server/services/cwqi-service.ts`

**Updated CWQIResult Interface:**
```typescript
interface CWQIResult {
  ev: number;        // Legacy alias for netEV
  netEV: number;     // Net Expectancy after friction
  rawEV: number;     // Raw Expectancy before friction
  friction: number;  // Total transaction friction
  score: number;     // Quality score (0-1)
  pWin: number;      // Win probability
  isTradeable: boolean;
  // ... additional fields
}
```

**Net EV Computation:**
```typescript
// Raw EV = (Pwin × DistTarget) - (Ploss × DistStop)
const rawEV = (pWin * distToTarget) - (pLoss * distToStop);

// Friction = (entry + target) × BASE_FEE_SLIPPAGE
const friction = calculateFriction(entry, target, 1);

// Net EV = Raw EV - Friction
const netEV = rawEV - friction;
```

## 5.4 Directive 9.9.C — Gate & Score Alignment

**Gate Logic:**
```typescript
isTradeable = netEV > 0
```

**Score Formula:**
```typescript
score = normalize(netEV / risk) × DI × (1 - VolNoise) × (1 - ρ̄)
```

**Enforcement:**
```typescript
if (netEV <= 0) {
  score = 0;  // No exceptions
}
```

## 5.5 Directive 9.9.D — Regression Tests

**File:** `server/tests/unit/cwqi.test.ts`

**Test Categories (26 tests):**
1. Micro-scalp trades (tight stops, small targets)
2. Normal trades (standard 2% target, 1% stop)
3. Swing trades (wider targets and stops)
4. Edge cases (zero DI, max DI, high volatility)
5. Friction dominance scenarios
6. Score-gate consistency verification

**Debug Mode:**
```typescript
calculateTradeExpectancy(symbol, meta, true)  // Enables diagnostic output
```

---

# 6. Technical Deliverables Summary

## 6.1 New Files Created

| File | Purpose |
|------|---------|
| `server/config/system-guards.ts` | Centralized mathematical constants |
| `server/services/unified-filter-gateway.ts` | Single source for filtered pairs |
| `server/scripts/verify-phase-9.ts` | Phase 9 integrity verification |
| `server/tests/unit/cwqi.test.ts` | CWQI unit tests (26 tests) |
| `server/tests/integration/parity.test.ts` | Sim-to-Live parity tests (5 tests) |

## 6.2 Modified Files

| File | Changes |
|------|---------|
| `server/services/cwqi-service.ts` | Net EV model, friction integration |
| `server/utils/analysis-utils.ts` | Added calculateFriction() helper |
| `server/storage.ts` | Guardrails v2 migration |
| `server/services/trade-safety.ts` | Guardrails v2 integration |
| `server/services/market-evaluation.ts` | UnifiedFilterGateway integration |

## 6.3 Deleted Files

| File | Reason |
|------|--------|
| `server/services/filtered-pairs.legacy.service.ts` | Replaced by UnifiedFilterGateway |
| `client/src/components/_deprecated/rtb-queue-panel.legacy.tsx` | Legacy UI component |
| `server/_deprecated/market-data-ws.legacy.ts` | Legacy WebSocket adapter |
| `server/_deprecated/kraken-websocket-adapter.legacy.ts` | Legacy WebSocket adapter |

---

# 7. Test Suite Summary

## 7.1 CWQI Unit Tests

**File:** `server/tests/unit/cwqi.test.ts`  
**Count:** 26 tests  
**Run Command:** `npx vitest run server/tests/unit/cwqi.test.ts`

## 7.2 Parity Tests

**File:** `server/tests/integration/parity.test.ts`  
**Count:** 5 tests  
**Run Command:** `npx vitest run server/tests/integration/parity.test.ts`

## 7.3 Phase 9 Verification

**Script:** `server/scripts/verify-phase-9.ts`  
**Count:** 6 checks  
**Run Command:** `npx tsx server/scripts/verify-phase-9.ts`

## 7.4 Combined Test Results

```
✅ 26 CWQI unit tests passing
✅ 5 Parity tests passing
✅ 6 Phase 9 verification checks passing
─────────────────────────────────
   Total: 37 tests/checks passing
```

---

# Phase 9 Completion Statement

Phase 9 (Math Core Finalization) is **COMPLETE** as of January 02, 2026.

The mathematical foundation of DawnTrader V3 is now:
- **Centralized**: All constants in SYSTEM_GUARDS
- **Standardized**: Net EV model with canonical friction
- **Validated**: 37 tests/checks confirming correctness
- **Documented**: Complete implementation history

**Ready for Phase 10:** ML Training Runs with validated mathematical core.
