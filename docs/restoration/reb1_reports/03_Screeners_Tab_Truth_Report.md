# REB 1 Report: Screeners Tab Configuration Audit
**Report ID**: REB1-03  
**Component**: Screeners Tab (Goals Engine)  
**Date**: November 22, 2025  
**Priority**: 🔴 HIGH  
**Status**: ❌ **PHASE 8.7.1 FEATURES ROLLED BACK**

---

## Executive Summary

**VERDICT**: ❌ **PARTIAL ROLLBACK** — Phase 8.7.1 History Filter promotion missing

The Screeners Tab configuration has experienced a partial rollback. The "Data Quality" section with Minimum History filter documented in Phase 8.7.1 (Nov 19, 2025) is completely absent from the current codebase.

**Key Finding**: The `minHistoryDays` field and entire "Data Quality" section are missing from the ScreenerFilters interface and UI.

---

## Truth State (Phase 8.7.1 - November 19, 2025)

### Source Document
- **File**: `docs/restoration/truth/phase_8.7.1_completion_1763829567737.md`
- **SHA-256**: `74300d52e15ede0d751a3fdc9f9fa5ff6bd33fc1bbae1f652ac6fd62815d3836`
- **Size**: 18 KB (494 lines)
- **Date**: November 19, 2025
- **Status**: ✅ COMPLETE

### Expected Implementation

**Component**: `client/src/components/goals/screener-filters-tab.tsx`

#### 1. ScreenerFilters Interface

**Expected** (Phase 8.7.1, Line 66):
```typescript
interface ScreenerFilters {
  minVolume: number | string;
  minPrice: number | string;
  maxPrice: number | string;
  minMarketCap: number | string;
  maxBidAskSpread: number | string;
  rsiMin: number;
  rsiMax: number;
  volatilityMin: number | string;
  volatilityMax: number | string;
  minLiquidity: number | string;
  excludeStablecoins: boolean;
  allowRegulatedOnly: boolean;
  universeSize?: number;
  activeTimeframes?: string[];
  confidenceThreshold?: number;
  minHistoryDays?: number;  // ✅ ADDED IN PHASE 8.7.1
}
```

#### 2. Data Quality UI Section

**Expected Location** (Phase 8.7.1, Lines 117-129):
```
Goals Engine → Screeners Tab
└─ Volume & Liquidity
└─ Price Range
└─ Market Quality
└─ RSI Filters
└─ Volatility Range
└─ Asset Type Filters
└─ 🟢 Data Quality  ← NEW SECTION (Teal dot)
   └─ Minimum History: [30/60/90/180 Days ▼]
   └─ "Excludes pairs without sufficient price history"
└─ Advanced Signal Controls
```

**Expected Dropdown Options**:
- 30 days
- 60 days
- 90 days
- 180 days

**Expected UI Code** (Phase 8.7.1, Lines 485-500):
```tsx
{/* Data Quality Section */}
<Card>
  <CardHeader>
    <div className="flex items-center gap-2">
      <div className="h-2 w-2 rounded-full bg-teal-500" />
      <CardTitle>Data Quality</CardTitle>
    </div>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="minHistoryDays">Minimum History (Days)</Label>
      <Select
        value={filters.minHistoryDays?.toString() || "30"}
        onValueChange={(value) => handleChange("minHistoryDays", parseInt(value))}
      >
        <SelectTrigger id="minHistoryDays">
          <SelectValue placeholder="Select days" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="30">30 days</SelectItem>
          <SelectItem value="60">60 days</SelectItem>
          <SelectItem value="90">90 days</SelectItem>
          <SelectItem value="180">180 days</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">
        Excludes pairs without sufficient price history for backtesting and analysis
      </p>
    </div>
  </CardContent>
</Card>
```

#### 3. Backend Integration

**Expected API Responses**:

**GET /api/screeners**:
```json
{
  "minHistoryDays": 30,
  "minVolume": "500000.00",
  "maxBidAskSpread": "2.50"
  // ... other filters
}
```

**PUT /api/screeners** (request body):
```json
{
  "minHistoryDays": 60,
  "minVolume": "500000.00"
  // ... other updates
}
```

---

## Current Workspace State (November 22, 2025)

### Actual Implementation

**File**: `client/src/components/goals/screener-filters-tab.tsx` (578 lines)

### Current ScreenerFilters Interface

**Lines 38-55**:
```typescript
interface ScreenerFilters {
  minVolume: number | string;
  minPrice: number | string;
  maxPrice: number | string;
  minMarketCap: number | string;
  maxBidAskSpread: number | string;
  rsiMin: number;
  rsiMax: number;
  volatilityMin: number | string;
  volatilityMax: number | string;
  minLiquidity: number | string;
  excludeStablecoins: boolean;
  allowRegulatedOnly: boolean;
  // Phase 27.F.14.UI-SYNC.2: Advanced Universe & Signal Controls
  universeSize?: number;
  activeTimeframes?: string[];
  confidenceThreshold?: number;
  // ❌ minHistoryDays MISSING
}
```

### Data Quality Section Status

**Grep Search Results**:
```bash
grep -i "Data Quality\|minHistoryDays\|min_history_days\|Minimum History" \
  client/src/components/goals/screener-filters-tab.tsx
# Result: 0 matches
```

**Finding**: ❌ **COMPLETELY MISSING**

- No "Data Quality" section in UI
- No `minHistoryDays` field in interface
- No Minimum History dropdown
- No teal color dot indicator
- No descriptive text about history filtering

---

## Gap Analysis

### 🚨 Critical Missing Components

#### 1. `minHistoryDays` Field
- **Truth**: Added to ScreenerFilters interface (Phase 8.7.1, Line 66)
- **Current**: ❌ **DOES NOT EXIST** in interface (Lines 38-55)
- **Impact**: History filter cannot be configured via UI

#### 2. Data Quality Section
- **Truth**: New Card section with teal dot indicator
- **Current**: ❌ **DOES NOT EXIST** (0 grep matches)
- **Impact**: Users cannot set minimum history requirement

#### 3. Dropdown Control
- **Truth**: Select dropdown with 30/60/90/180 day options
- **Current**: ❌ **DOES NOT EXIST**
- **Impact**: No UI control for history filter

#### 4. State Management
- **Truth**: `filters.minHistoryDays` state tracking, hasChanges detection
- **Current**: ❌ **NOT IMPLEMENTED**
- **Impact**: Changes cannot be saved/tracked

#### 5. Backend Integration
- **Truth**: GET/PUT to `/api/screeners` with `minHistoryDays` field
- **Current**: **UNKNOWN** (need to verify if backend still supports this field)
- **Impact**: May break if frontend tries to send this field

---

## Verification Evidence

### Search Commands Executed

```bash
# 1. Check for minHistoryDays in interface
grep -n "minHistoryDays" client/src/components/goals/screener-filters-tab.tsx
# Result: 0 matches

# 2. Check for Data Quality section
grep -n "Data Quality" client/src/components/goals/screener-filters-tab.tsx
# Result: 0 matches

# 3. Check for Minimum History label
grep -n "Minimum History" client/src/components/goals/screener-filters-tab.tsx
# Result: 0 matches

# 4. File size verification
wc -l client/src/components/goals/screener-filters-tab.tsx
# Result: 578 lines
```

**Analysis**: 
- Current file has 578 lines
- Phase 8.7.1 should have added ~20-30 lines for Data Quality section
- No evidence of this section in current code

---

## Phase 8.7.1 Compliance Analysis

### Phase 8.7.1 Objectives

From `phase_8.7.1_completion.md`:

1. **History Filter Promotion**: Elevated from backend-only to first-class dropdown UI control
   - **Status**: ❌ **NOT IMPLEMENTED**

2. **FX5 Refinement**: Reduced active filter breakdown from 10 to 8 categories
   - **Status**: ⚠️ **NEEDS VERIFICATION** (will be checked in Task 5: Filter Breakdown Categories)

3. **UI Enhancements**: Added human-readable descriptions to all filter rows
   - **Status**: ⚠️ **NEEDS VERIFICATION** (requires checking Filter Insights component)

4. **Backend Integration**: Full CRUD support for minHistoryDays via /api/screeners
   - **Status**: ⚠️ **UNKNOWN** (frontend missing, backend status unclear)

5. **Zero Breaking Changes**: All existing filters remain functional
   - **Status**: ⚠️ **UNKNOWN** (need to test if existing filters work)

**Compliance**: 0/5 objectives confirmed implemented

---

## Database Schema Status

### Expected Schema (Phase 8.7.1)

**Table**: `screener_filters`

**Field**: `min_history_days integer DEFAULT 30`

**Verification Needed**: Check if this column exists in current database schema

```sql
-- Query to check if column exists
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'screener_filters'
  AND column_name = 'min_history_days';
```

**Status**: ⚠️ **REQUIRES DATABASE VERIFICATION**

---

## Backend API Route Status

### Expected Routes (Phase 8.7.1)

From `phase_8.7.1_completion.md` (Lines 80-86):

1. **GET /api/screeners**:
   - Should include `minHistoryDays: 30` in default object
   - **Status**: ⚠️ **REQUIRES VERIFICATION**

2. **GET /api/filters-v2**:
   - Should include `minHistoryDays` filter entry:
     - Category: "Data Quality"
     - Display Name: "Minimum History (Days)"
     - Default value: 30
   - **Status**: ⚠️ **REQUIRES VERIFICATION**

3. **PUT /api/screeners**:
   - Should handle `minHistoryDays` via spread syntax
   - **Status**: ⚠️ **REQUIRES VERIFICATION**

---

## Restoration Requirements

### Phase 1: Restore minHistoryDays Interface Field

**File**: `client/src/components/goals/screener-filters-tab.tsx`

**Add to ScreenerFilters interface** (after line 54):
```typescript
interface ScreenerFilters {
  // ... existing fields ...
  confidenceThreshold?: number;
  minHistoryDays?: number;  // Phase 8.7.1: Minimum history filter
}
```

**Add to DEFAULTS** (after line 35):
```typescript
const DEFAULTS = {
  // ... existing defaults ...
  confidenceThreshold: 60,
  minHistoryDays: 30,  // Default: 30 days
};
```

---

### Phase 2: Add Data Quality Section UI

**Insert after "Asset Type Filters" section** (~line 450):

```tsx
{/* Data Quality Section */}
<Card>
  <CardHeader>
    <div className="flex items-center gap-2">
      <div className="h-2 w-2 rounded-full bg-teal-500" />
      <CardTitle>Data Quality</CardTitle>
    </div>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="minHistoryDays">Minimum History (Days)</Label>
      <Select
        value={filters.minHistoryDays?.toString() || "30"}
        onValueChange={(value) => handleChange("minHistoryDays", parseInt(value))}
      >
        <SelectTrigger id="minHistoryDays">
          <SelectValue placeholder="Select days" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="30">30 days</SelectItem>
          <SelectItem value="60">60 days</SelectItem>
          <SelectItem value="90">90 days</SelectItem>
          <SelectItem value="180">180 days</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">
        Excludes pairs without sufficient price history for backtesting and analysis
      </p>
    </div>
  </CardContent>
</Card>
```

---

### Phase 3: Update State Management

**Add minHistoryDays to state initialization** (line 139):
```typescript
setFilters({
  // ... existing fields ...
  confidenceThreshold: currentFilters.confidenceThreshold ?? DEFAULTS.confidenceThreshold,
  minHistoryDays: currentFilters.minHistoryDays ?? DEFAULTS.minHistoryDays,
});
```

---

### Phase 4: Verify Backend Support

**Check these endpoints**:

1. **GET /api/screeners**:
   - Returns `minHistoryDays` field?
   - Defaults to 30 if not set?

2. **PUT /api/screeners**:
   - Accepts `minHistoryDays` in request body?
   - Saves to database correctly?

3. **Database schema**:
   - `screener_filters.min_history_days` column exists?
   - Default value is 30?

**If backend missing**: Restore backend changes from Phase 8.7.1 (server/routes.ts, shared/schema.ts)

---

### Phase 5: Validation

1. **UI Rendering**: Data Quality section appears in Screeners tab
2. **Dropdown Functionality**: Can select 30/60/90/180 days
3. **State Management**: Changes trigger hasChanges tracking
4. **Save Functionality**: PUT request includes minHistoryDays
5. **Persistence**: Reload page, value persists per mode
6. **Mode Isolation**: Paper and Live modes have separate settings

---

## Related Components to Verify

### 1. Filter Breakdown (Filter Insights)

**Expected** (Phase 8.7.1, Lines 72-77):
- Hidden `failed_market_cap` row (backend filter, no data)
- Hidden `failed_guardrail_risk` row (separate guardrails system)
- Hidden `failed_universe_size` row (batch construction, not FX5 filter)
- Shows `failed_history` row (promoted to visible FX5 filter)

**Status**: ⚠️ **REQUIRES VERIFICATION** (Task 5: Filter Breakdown Categories)

---

### 2. Backend Services

**Expected** (Phase 8.7.1, Lines 89-96):

**File**: `server/services/kraken.ts`
- Uses `settings.minHistoryDays` for failed_history exclusions
- Logs when pairs fail history requirement

**File**: `server/services/market-scanner.ts`
- Debug logging: `[8.6.7][AlreadyActive]` when cooldownCount > 0

**Status**: ⚠️ **REQUIRES VERIFICATION**

---

## Evidence Summary

### Truth Files Referenced
- `docs/restoration/truth/phase_8.7.1_completion_1763829567737.md` (494 lines)

### Current Code Files Audited
- `client/src/components/goals/screener-filters-tab.tsx` (578 lines)

### Search Commands Executed
```bash
# Check for Data Quality section
grep -i "Data Quality" client/src/components/goals/screener-filters-tab.tsx
# Result: 0 matches (❌ MISSING)

# Check for minHistoryDays field
grep -i "minHistoryDays\|min_history_days" client/src/components/goals/screener-filters-tab.tsx
# Result: 0 matches (❌ MISSING)

# Check for Minimum History dropdown
grep -i "Minimum History" client/src/components/goals/screener-filters-tab.tsx
# Result: 0 matches (❌ MISSING)

# File size
wc -l client/src/components/goals/screener-filters-tab.tsx
# Result: 578 lines
```

---

## Compliance Status

### Phase 8.7.1 UI Requirements
- [ ] minHistoryDays field in ScreenerFilters interface
- [ ] Data Quality section with teal dot indicator
- [ ] Dropdown with 30/60/90/180 day options
- [ ] Descriptive help text
- [ ] State management for minHistoryDays
- [ ] hasChanges tracking
- [ ] GET/PUT API integration

**Compliance**: 0/7 (0%)

---

## Risk Assessment

**Severity**: 🔴 **HIGH**

**Impact**:
1. **User Experience**: Cannot configure history filter via UI
2. **Data Quality**: May include pairs with insufficient history
3. **Backtesting Accuracy**: Can't exclude pairs with limited data
4. **Feature Completeness**: Phase 8.7.1 incomplete

**Mitigation**: Restore Data Quality section as documented in Phase 8.7.1

---

## Next Steps

1. **REB 1 continues** — This audit is complete, moving to Task 4 (Active Filter Pool)
2. **Restoration deferred** — REB 1 is read-only, restoration occurs in REB 2+
3. **Master Gap Analysis** — This finding will be included in final consolidated report
4. **Backend Verification** — Check if backend still supports minHistoryDays field

---

**Report Generated**: November 22, 2025  
**Audit Phase**: REB 1 (Truth State Extraction)  
**Next Audit**: Active Filter Pool Logic (Task 4)
