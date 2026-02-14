# Phase 38: Reference Inventory
## Pre-Refactor Filtering & Insights Functions

**Report Date:** October 31, 2025  
**Phase:** 38 - Unified Filtering & Insights Refactor  
**Purpose:** Document all filtering/insight functions before refactor for reference

---

## Services

### 1. FilteredPairsService (`server/services/filtered-pairs-service.ts`)
**Purpose**: Primary filtering service used by SignalOrchestrator  
**Methods**:
- `getValidPairs(mode, filters, forceRefresh)` - Returns filtered pairs that pass all criteria
- `getEligibleCount(mode, filters)` - Returns count only (faster)
- Cache: 1-minute TTL per mode

**Used By**:
- SignalOrchestrator (trading engine)
- Market Evaluation SSOT (Phase 38)

**Filtering Criteria**:
- Quote currency filtering (USDC/USDT)
- Volume threshold (min 24h volume)
- Spread filter (max bid-ask spread)
- Price range validation
- Market data freshness (<12 minutes)

---

### 2. PaperSimDiagnosticService (`server/services/paper-sim-diagnostic.ts`)
**Purpose**: Broader diagnostic universe scanning  
**Methods**:
- `performUniverseScan(params)` - Full universe evaluation with detailed filtering breakdown

**Parameters**:
```typescript
{
  userId: string;
  mode: 'paper' | 'live';
  limit: number;      // Max pairs to return (default 500)
  trace: boolean;     // Enable detailed trace logging
  strategies: boolean // Include strategy evaluation
}
```

**Used By**:
- `/api/paper-sim/diagnostics/scan` endpoint (admin-only)
- Filtered Pairs tab UI (deprecated in Phase 38)

**Filtering Criteria**:
- Volume filter
- Spread filter
- Daily range filter
- **Does NOT apply quote currency restriction** (key difference)

---

## Endpoints

### 1. `/api/paper-sim/filtered-pairs`
**Before Phase 38**:
- Used `paperSimDiagnosticService.performUniverseScan()`
- Returned ~658 eligible pairs (no quote currency filter)

**After Phase 38**:
- Uses `MarketEvaluationService.evaluateMarketOnce()`
- Returns ~2-17 eligible pairs (with quote currency filter)
- Source tag: `market_evaluation_ssot`

---

### 2. `/api/paper-sim/diagnostics/scan`
**Status**: Retained for admin debugging  
**Access**: Admin/owner only  
**Uses**: `paperSimDiagnosticService.performUniverseScan()`  
**Note**: Still uses broader filtering (useful for diagnostics)

---

## Key Discrepancies (Pre-Phase 38)

| Service | Eligible Pairs | Quote Currency Filter | Filtering Strictness |
|---------|---------------|----------------------|---------------------|
| **FilteredPairsService** | ~17 | ✅ Applied (USDC/USDT) | Strict (multi-tier) |
| **PaperSimDiagnosticService** | ~658 | ❌ Not applied | Broad (basic filters) |

**Root Cause**: Two separate filtering implementations with different criteria

**Impact**: 
- SignalOrchestrator evaluated 17 pairs
- UI "Filtered Pairs" tab showed 658 pairs
- User confusion about actual tradable universe

---

## WebSocket Events

### `trading_data_updated`
**Before Phase 38**:
- Source: `filtered_pairs_endpoint`
- Multiple sources reporting different counts

**After Phase 38**:
- Source: `market_evaluation_ssot`
- Single authoritative source

---

## React Query Hooks

### Frontend Queries (to be audited)
Potential duplicate hooks fetching filtered pairs:
- Dashboard widgets polling `/api/paper-sim/filtered-pairs`
- Insights tab polling same endpoint
- Filter diagnostics polling `/api/filters/diagnostics`

**Phase 38 Optimization**: Consolidated to single SSOT query with shared cache

---

## Cache Strategy

### Pre-Phase 38
- FilteredPairsService: 1-minute cache per mode
- PaperSimDiagnosticService: No caching (always fresh)
- Result: Inconsistent data freshness

### Post-Phase 38
- MarketEvaluationService: 15-second unified cache
- Result: Consistent 15s freshness across all consumers

---

## Migration Notes

### Deprecated (Phase 38)
- ❌ Direct calls to `performUniverseScan()` from filtered-pairs endpoint
- ❌ Separate universe evaluation logic in PaperSimDiagnosticService for user-facing endpoints

### Retained
- ✅ FilteredPairsService (now wrapped by MarketEvaluationService)
- ✅ PaperSimDiagnosticService (admin diagnostics only)
- ✅ Diagnostic scan endpoint (admin debugging tool)

### New Additions
- ✅ MarketEvaluationService (SSOT)
- ✅ WalterCompatAdapter (analytics bridge)

---

## Validation Checkpoints

Before Phase 38:
- [ ] SignalOrchestrator: ~17 pairs
- [ ] Filtered Pairs endpoint: ~658 pairs
- [ ] **Discrepancy**: 641 pairs difference

After Phase 38:
- [ ] All endpoints return identical counts from SSOT
- [ ] SignalOrchestrator uses same evaluation logic as UI
- [ ] **Target**: <1 pair difference across all sources

---

**Next Steps**: See `phase-38-walter-compat-parity-report.md` for payload comparison and `phase-38-unified-validation-metrics.md` for final validation results.
