# Phase 11.8B — Deletion Manifest

**Directive**: 11.8B Authority Cleanup & Legacy Removal  
**Date**: 2026-02-03  
**Status**: COMPLETE  

---

## 1. Files Deleted

| File | Size | Reason |
|------|------|--------|
| `server/services/cwqi-service.ts` | 8.8KB | Legacy Goals ML - functionality migrated to expectancy.ts |
| `server/services/latti-manager.ts` | 21KB | Parallel adaptive system - replaced by Phase 11 Predictive Learning |
| `server/services/goals-learning-engine.ts` | 9.7KB | Parallel adaptive system - replaced by Phase 11 Predictive Learning |
| `server/routes/ara.ts` | 19.7KB | Parallel adaptive system (ARA) - replaced by Phase 11 Predictive Learning |
| `server/tests/unit/cwqi.test.ts` | ~10KB | Tests for deleted cwqi-service.ts |
| `server/tests/integration/parity.test.ts` | ~5KB | Integration tests depending on cwqiService |

**Total Removed**: ~74KB of legacy code

---

## 2. Files Modified

### 2.1 Core Expectancy Migration

| File | Changes |
|------|---------|
| `server/core/calculations/expectancy.ts` | Added `TradeMeta`, `TradeExpectancyResult` interfaces and `evaluateTradeExpectancy` function - migrated from cwqi-service.ts |
| `server/services/paper-execution-engine.ts` | Replaced cwqiService import with evaluateTradeExpectancy, updated log messages to use EV_REJECT/EV_PASS |

### 2.2 System Startup

| File | Changes |
|------|---------|
| `server/index.ts` | Removed LATTI startup block |
| `server/startup.ts` | Removed LATTI initialization, Updated getInitializedServices() to report 'PredictiveLearning' instead of 'LATTI'/'GoalsEngine' |
| `server/startup/lazy-loader.ts` | Removed LATTIManager lazy loading |

### 2.3 Routes

| File | Changes |
|------|---------|
| `server/routes.ts` | Removed LATTI routes (heuristic-trader/*), deprecated goals-learning trigger route, removed ARA mount |

---

## 3. Authority Chain After 11.8B

```
User → Phase 11 Predictive Learning → SQE → Execution Engine
                ↓
         Single Source of Truth for:
         - Regime-Weight adjustments
         - Strategy Confidence adjustments  
         - Risk threshold calibration
```

### Removed Parallel Authorities

| System | Former Role | Replacement |
|--------|-------------|-------------|
| CWQI | Net Expectancy Gate in execution | evaluateTradeExpectancy() in expectancy.ts |
| LATTi | Local parameter tuning | Phase 11 ML Calibration |
| Goals ML | Preset auto-expansion | Phase 11 Telemetry + Manual presets |
| ARA | Adaptive risk optimization | Phase 11 Predictive Learning |

---

## 4. Verification Checklist

- [x] Application boots without errors
- [x] No cwqi-service.ts imports remain
- [x] No latti-manager.ts imports remain
- [x] No goals-learning-engine.ts imports remain
- [x] No ara.ts route mount
- [x] evaluateTradeExpectancy function works (same math as CWQI)
- [x] Logs show `[11.8B]` removal messages

---

## 5. PRESERVED Systems (DO NOT TOUCH)

| System | Location | Purpose |
|--------|----------|---------|
| ML Calibration | `server/services/ml-calibration.ts` | Phase 11 Predictive Learning |
| Telemetry | `server/core/logging/vts-telemetry.ts` | Learning data collection |
| Governance | `server/core/governance/*` | Regime transition governance |
| ml.*_weight params | `system-guards.ts`, storage | Predictive weight parameters |

---

## 6. Runtime Log Evidence

```
[11.8B] LATTI system removed - Predictive Learning is single authority
[Lazy] [11.8B] LATTIManager removed - Predictive Learning is single authority
[11.8B] ARA routes removed - Predictive Learning is single authority
```

---

**Signed**: Agent Claude  
**Reviewed**: Pending Architect Review
