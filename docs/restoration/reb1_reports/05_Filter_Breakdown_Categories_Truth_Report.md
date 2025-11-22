# REB 1 Report: Filter Breakdown Categories Audit
**Report ID**: REB1-05  
**Component**: FX5 Filter Breakdown Categories  
**Date**: November 22, 2025  
**Priority**: 🔴 HIGH  
**Status**: ❌ **CATEGORY COUNT MISMATCH DETECTED**

---

## Executive Summary

**VERDICT**: ❌ **FAIL** — 11 categories displayed instead of 8

The Filter Breakdown Categories audit has detected a critical mismatch. Phase 8.7.1 (Nov 19, 2025) reduced the FX5 filter breakdown from 10 to 8 active categories by hiding backend-only filters. The current implementation displays **11 categories**, including filters that should be hidden and adding unexpected categories.

**Key Finding**: Current `ALLOWED_FILTER_CATEGORIES` array contains 11 categories vs expected 8 from Phase 8.7.1.

---

## Truth State (Phase 8.7.1 - November 19, 2025)

### Source Document
- **File**: `docs/restoration/truth/phase_8.7.1_completion_1763829567737.md`
- **SHA-256**: `74300d52e15ede0d751a3fdc9f9fa5ff6bd33fc1bbae1f652ac6fd62815d3836`
- **Size**: 18 KB (494 lines)
- **Date**: November 19, 2025

### Expected Categories (8 Total)

**Phase 8.7.1 Breakdown** (Lines 44-60):
```typescript
{
  failed_min_volume: 0,
  failed_spread: 0,
  failed_daily_range: 0,
  failed_min_price: 0,
  failed_stablecoin: 0,
  failed_quote_currency: 0,
  failed_history: 0,
  already_active: 0  // Cooldown tracking (not a filter failure)
}

// Backend-only filters (excluded from FX5 breakdown):
// - failed_market_cap (Phase 8.7 - data unavailable)
// - failed_guardrail_risk (moved to separate guardrails system)
// - failed_universe_size (batch construction, not filtering)
```

**Expected Display Categories** (8):
1. `failed_min_volume` - Minimum trading volume requirement not met
2. `failed_spread` - Bid-ask spread too wide for safe execution
3. `failed_daily_range` - Daily price movement outside acceptable range
4. `failed_min_price` - Price below minimum threshold
5. `failed_stablecoin` - Stablecoin pairs excluded by filter settings
6. `failed_quote_currency` - Quote currency not in allowed list
7. `failed_history` - Insufficient price history data available (PROMOTED in Phase 8.7.1)
8. `already_active` - Currently in active trade (cooldown period)

**Hidden Categories** (3):
- ❌ `failed_market_cap` - Hidden (backend only, no Kraken data)
- ❌ `failed_guardrail_risk` - Hidden (moved to separate guardrails system)
- ❌ `failed_universe_size` - Hidden (batch construction, not FX5 filter)

---

## Current Workspace State (November 22, 2025)

### Actual Implementation

**File**: `client/src/components/trading/filter-insights.tsx` (662 lines)

**Lines 131-143**:
```typescript
const ALLOWED_FILTER_CATEGORIES: (keyof FilterBreakdown)[] = [
  'failed_min_volume',
  'failed_spread',
  'failed_daily_range',
  'failed_min_price',
  'failed_stablecoin',
  'failed_quote_currency',
  'failed_history',
  'failed_market_cap',        // ❌ SHOULD BE HIDDEN
  'failed_guardrail_risk',    // ❌ SHOULD BE HIDDEN
  'already_active',
  'passed_all_filters',       // ⚠️ Not a category (summary stat)
];
```

**Category Count**: 11 (should be 8)

---

## Gap Analysis

### 🚨 Critical Discrepancies

#### 1. Category Count
- **Truth**: 8 visible categories
- **Current**: 11 entries in ALLOWED_FILTER_CATEGORIES
- **Gap**: +3 categories

#### 2. Hidden Filters Still Visible
- **Truth**: `failed_market_cap` hidden (backend only)
- **Current**: ✅ Present in ALLOWED_FILTER_CATEGORIES (Line 138)
- **Impact**: Users see "Market Cap" filter failures (should be hidden)

- **Truth**: `failed_guardrail_risk` hidden (separate system)
- **Current**: ✅ Present in ALLOWED_FILTER_CATEGORIES (Line 139)
- **Impact**: Users see "Guardrail Risk" filter failures (should be hidden)

#### 3. Unexpected Categories

- **Truth**: `passed_all_filters` is a summary stat, not a breakdown category
- **Current**: ✅ Present in ALLOWED_FILTER_CATEGORIES (Line 141)
- **Impact**: May cause confusion or duplicate display

#### 4. Missing Category: `failed_universe_size`

- **Truth**: `failed_universe_size` should be HIDDEN (batch construction, not FX5 filter)
- **Current**: ❌ NOT in ALLOWED_FILTER_CATEGORIES
- **Impact**: Good! Correctly omitted (as expected)

---

## Detailed Comparison

### Expected vs Actual

| Category | Truth State | Current State | Status |
|----------|-------------|---------------|--------|
| `failed_min_volume` | ✅ Visible (1/8) | ✅ Present (Line 132) | ✅ **CORRECT** |
| `failed_spread` | ✅ Visible (2/8) | ✅ Present (Line 133) | ✅ **CORRECT** |
| `failed_daily_range` | ✅ Visible (3/8) | ✅ Present (Line 134) | ✅ **CORRECT** |
| `failed_min_price` | ✅ Visible (4/8) | ✅ Present (Line 135) | ✅ **CORRECT** |
| `failed_stablecoin` | ✅ Visible (5/8) | ✅ Present (Line 136) | ✅ **CORRECT** |
| `failed_quote_currency` | ✅ Visible (6/8) | ✅ Present (Line 137) | ✅ **CORRECT** |
| `failed_history` | ✅ Visible (7/8) | ✅ Present (Line 138) | ✅ **CORRECT** |
| `already_active` | ✅ Visible (8/8) | ✅ Present (Line 140) | ✅ **CORRECT** |
| `failed_market_cap` | ❌ **HIDDEN** | ❌ **VISIBLE** (Line 139) | ❌ **WRONG** |
| `failed_guardrail_risk` | ❌ **HIDDEN** | ❌ **VISIBLE** (Line 140) | ❌ **WRONG** |
| `failed_universe_size` | ❌ **HIDDEN** | ✅ Absent | ✅ **CORRECT** |
| `passed_all_filters` | N/A (summary) | ⚠️ Present (Line 141) | ⚠️ **UNEXPECTED** |

**Compliance**: 8/11 correct (73%)

---

## Phase 8.7.1 Compliance Analysis

### Phase 8.7.1 Objectives

From `phase_8.7.1_completion.md`:

1. **FX5 Refinement**: Reduced active filter breakdown from 10 to 8 categories
   - **Status**: ❌ **VIOLATED** (11 categories displayed)

2. **Hide Backend-Only Filters**:
   - Hide `failed_market_cap` (no Kraken data)
     - **Status**: ❌ **VIOLATED** (still visible)
   
   - Hide `failed_guardrail_risk` (separate guardrails system)
     - **Status**: ❌ **VIOLATED** (still visible)
   
   - Hide `failed_universe_size` (batch construction)
     - **Status**: ✅ **COMPLIANT** (correctly hidden)

3. **Human-Readable Descriptions**: Added to all filter rows
   - **Status**: ⚠️ **NEEDS VERIFICATION** (requires checking display labels)

**Compliance**: 1/3 objectives met (33%)

---

## Restoration Requirements

### Phase 1: Update ALLOWED_FILTER_CATEGORIES

**File**: `client/src/components/trading/filter-insights.tsx`

**Change Lines 131-143**:
```typescript
// BEFORE (Current - WRONG):
const ALLOWED_FILTER_CATEGORIES: (keyof FilterBreakdown)[] = [
  'failed_min_volume',
  'failed_spread',
  'failed_daily_range',
  'failed_min_price',
  'failed_stablecoin',
  'failed_quote_currency',
  'failed_history',
  'failed_market_cap',        // ❌ REMOVE
  'failed_guardrail_risk',    // ❌ REMOVE
  'already_active',
  'passed_all_filters',       // ❌ REMOVE (summary stat)
];

// AFTER (Phase 8.7.1 - CORRECT):
const ALLOWED_FILTER_CATEGORIES: (keyof FilterBreakdown)[] = [
  'failed_min_volume',
  'failed_spread',
  'failed_daily_range',
  'failed_min_price',
  'failed_stablecoin',
  'failed_quote_currency',
  'failed_history',           // Phase 8.7.1: Promoted to visible
  'already_active',           // Cooldown tracking
];
```

**Expected Result**: 8 visible categories (down from 11)

---

### Phase 2: Verify Human-Readable Labels

**Expected Labels** (Phase 8.7.1, Lines 158-171):
```typescript
const FILTER_LABELS = {
  'failed_min_volume': 'Minimum trading volume requirement not met',
  'failed_spread': 'Bid-ask spread too wide for safe execution',
  'failed_daily_range': 'Daily price movement outside acceptable range',
  'failed_min_price': 'Price below minimum threshold',
  'failed_stablecoin': 'Stablecoin pairs excluded by filter settings',
  'failed_quote_currency': 'Quote currency not in allowed list (USD, EUR, etc.)',
  'failed_history': 'Insufficient price history data available',
  'already_active': 'Currently in active trade (cooldown period)',
};
```

**Verification**: Check if current implementation uses these labels

---

### Phase 3: Validate Backend Breakdown

**Backend Services to Check**:
1. **`server/services/fx5-scanner.ts`**:
   - Verify breakdown initialization includes all 8 categories
   - Confirm `failed_market_cap`, `failed_guardrail_risk`, `failed_universe_size` are NOT in breakdown

2. **`server/services/kraken.ts`**:
   - Verify history filter uses `settings.minHistoryDays`
   - Confirm `failed_history` counter increments correctly

**Expected Backend Breakdown**:
```typescript
const breakdown = {
  failed_min_volume: 0,
  failed_spread: 0,
  failed_daily_range: 0,
  failed_min_price: 0,
  failed_stablecoin: 0,
  failed_quote_currency: 0,
  failed_history: 0,
  already_active: 0,
};
```

---

## Evidence Summary

### Current Code Files Audited
- `client/src/components/trading/filter-insights.tsx` (Lines 131-143)

### Truth Files Referenced
- `docs/restoration/truth/phase_8.7.1_completion_1763829567737.md` (494 lines)

### Grep Searches Conducted
```bash
# Check ALLOWED_FILTER_CATEGORIES array
grep -A 15 "ALLOWED_FILTER_CATEGORIES" client/src/components/trading/filter-insights.tsx
# Result: 11 categories found (should be 8)
```

---

## Impact Assessment

### User Experience Impact

**Current State Issues**:
1. **Confusing UI**: Users see "Market Cap" filter failures but cannot configure market cap thresholds
2. **Noise**: "Guardrail Risk" appears in FX5 breakdown but is part of separate guardrails system
3. **Misleading Metrics**: Extra categories dilute the clarity of core FX5 filtering

**After Restoration**:
1. **Cleaner UI**: Only 8 relevant FX5 filters displayed
2. **Clear Attribution**: Each filter has a corresponding UI control
3. **Better UX**: Descriptive labels explain why pairs were excluded

---

## Risk Assessment

**Severity**: 🔴 **HIGH**

**Impact**:
1. **User Confusion**: Extra categories without corresponding UI controls
2. **Inconsistency**: UI doesn't match Phase 8.7.1 design
3. **Maintenance**: Harder to maintain with extra categories

**Mitigation**: Restore 8-category breakdown as documented in Phase 8.7.1

---

## Compliance Status

### Phase 8.7.1 Filter Breakdown Requirements
- [ ] 8 visible FX5 filter categories
- [ ] `failed_market_cap` hidden from UI
- [ ] `failed_guardrail_risk` hidden from UI
- [ ] `failed_universe_size` hidden from UI
- [ ] `failed_history` promoted to visible (with UI control)
- [ ] Human-readable descriptions for all filters
- [ ] `already_active` shown as cooldown tracking

**Compliance**: 2/7 (29%)

---

## Next Steps

1. **REB 1 continues** — This audit is complete, moving to Task 6 (Metrics Pipeline)
2. **Restoration deferred** — REB 1 is read-only, restoration occurs in REB 2+
3. **Master Gap Analysis** — This finding will be included in final consolidated report

---

**Report Generated**: November 22, 2025  
**Audit Phase**: REB 1 (Truth State Extraction)  
**Next Audit**: Metrics Pipeline (Task 6)
