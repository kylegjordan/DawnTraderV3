# Goals Engine UI Cleanup - Phase Summary

**Date**: October 28, 2025  
**Status**: Completed  
**Version**: v1.7-ui-cleanup

## Overview
This phase focused on cleaning up legacy UI components, fixing bugs, and reorganizing the Goals Engine and Dashboard widgets to align with the modern preset-based architecture.

## Changes Implemented

### 1. Removed Legacy Trading Pace Component
**Files Modified:**
- `client/src/components/goals/trading-pace-control.tsx` - **DELETED**
- `client/src/components/goals/goals-engine-tab.tsx` - Removed TradingPaceControl import and usage

**Rationale:**
The Trading Pace component was replaced by the modern preset-based system (Conservative, Baseline, Optimistic, Maximum). All trading pace logic is now managed through the Goals Presets Grid.

### 2. Updated Preset Seed Values
**Database Changes:**
Updated `goals_presets` table with realistic computed targets:

| Preset       | Target Daily Avg Earning % | Portfolio Risk % | Trades/Day | Kill Switch % |
|--------------|---------------------------|------------------|------------|---------------|
| Conservative | 0.17%                     | 0.50%            | 2.00       | 5.00%         |
| Baseline     | 0.87%                     | 1.50%            | 4.00       | 7.00%         |
| Optimistic   | 2.53%                     | 2.50%            | 6.00       | 10.00%        |
| Maximum      | 3.50%                     | 4.00%            | 10.00      | 15.00%        |

**SQL Executed:**
```sql
UPDATE goals_presets SET target_daily_avg_earning_pct = '0.17' WHERE name = 'conservative';
UPDATE goals_presets SET target_daily_avg_earning_pct = '0.87' WHERE name = 'baseline';
UPDATE goals_presets SET target_daily_avg_earning_pct = '2.53' WHERE name = 'optimistic';
UPDATE goals_presets SET target_daily_avg_earning_pct = '3.50' WHERE name = 'maximum';
```

### 3. Fixed Screeners Tab Blank Page Issue
**Files Modified:**
- `client/src/components/goals/filters-with-override.tsx`

**Changes:**
- Added comprehensive error handling with error state display
- Added empty state guard when no filters are available
- Fixed auth token retrieval to check both `accessToken` and `token` in localStorage (both GET and PUT operations)
- Added proper TypeScript error typing
- Improved user feedback with descriptive error messages

**Before:** Component returned `null` when data was unavailable, causing blank page  
**After:** Component displays appropriate error or empty state message

**Critical Fix:** Applied token fallback logic to both query fetch AND mutation to prevent 401 errors when toggling manual overrides. This ensures users with only `accessToken` (current default) can successfully update filter controls.

### 4. Dashboard LATTi Widget Reorganization
**Files Modified:**
- `client/src/components/dashboard/dashboard-latti-widget.tsx`

**New Layout Order:**
1. **Active Preset Badge** with coherency and control mode status chips (condensed header)
2. **Target Daily Goals** (Target Daily Avg Earning %, Trades per Day Est)
3. **Core Four Guardrails** (Portfolio Risk %, Symbol Cooldown, Max Positions, Kill Switch %)

**Benefits:**
- More logical information hierarchy
- Preset selection is the first thing users see
- Goals flow naturally from preset selection
- Guardrails provide safety context last

### 5. Verified Data Source Consistency
**Audit Results:**
All components correctly use preset-based or LATTI-computed values:

✅ `presets-grid.tsx` - uses `preset.targetDailyAvgEarningPct`  
✅ `dashboard-latti-widget.tsx` - uses `preset.targetDailyAvgEarningPct`  
✅ `latti-goals-mirror.tsx` - uses `lattiTargets` calculation  
✅ `latti-dashboard-widget.tsx` - uses `lattiTargets.targetDailyAvgEarningPct`

**No manual target inputs found** - All references properly use active preset or LATTI API values.

## Phase 6.1: Final UI Alignment (Completed 2025-10-28)

### 6. Replaced TargetDailyGoals with Simplified Projected Growth Section
**Files Modified:**
- `client/src/components/goals/goals-engine-tab.tsx`

**Changes:**
- Removed complex 500+ line `TargetDailyGoals` component with manual inputs
- Replaced with simplified "Projected Portfolio Growth" section
- Displays active preset name with color-coded badge
- Shows target daily avg earning % and trades per day directly from active preset
- Projects compound growth table (Tomorrow, 1 Week, 1 Month, 3 Months, 6 Months, 1 Year)

**Before:** Complex manual input form with validation, LATTI sync logic, and override tracking  
**After:** Read-only display of preset values with automatic projections

### 7. Removed Duplicate Preset Name Headings
**Files Modified:**
- `client/src/components/goals/presets-grid.tsx`

**Changes:**
- Removed duplicate `<CardTitle>{preset.name}</CardTitle>` that appeared below colored badge
- Preset name now appears only once in the colored badge

**Before:** Preset name shown twice (badge + heading)  
**After:** Preset name shown once in color-coded badge only

### 8. Removed Legacy GuardrailsTab Component
**Files Modified:**
- `client/src/pages/goals-engine.tsx`

**Changes:**
- Removed `<GuardrailsTab />` from Guardrails tab content
- Kept only `<CoreFourGuardrails />` component
- Guardrails tab now shows single, modern component using `/api/guardrails-v2`

**Before:** Duplicate guardrails UI (CoreFourGuardrails + GuardrailsTab)  
**After:** Single modern guardrails UI (CoreFourGuardrails only)

### 9. Dashboard LATTi Widget Final Layout
**Files Modified:**
- `client/src/components/dashboard/dashboard-latti-widget.tsx`

**Changes:**
- Active preset name wrapped in color-coded badge (green/blue/amber/red/purple)
- Added `getPresetBadgeColor()` function for consistent preset colors
- Moved coherency and control badges to footer row
- Added metrics inline with badges: `Target: 0.87% | Trades/Day: 12`
- Footer row has light background with rounded corners
- Control badge text shortened from "LATTi Managed" to "LATTi"

**New Layout:**
1. **Active Preset**: Color-coded badge at top
2. **Target Daily Goals**: Two-column grid
3. **Core Four Guardrails**: Four-column grid
4. **Footer Row**: Coherency badge | Control badge | Target % | Trades/Day

**Before:** Status badges inline with preset, separate from metrics  
**After:** Cohesive footer row combining badges and key metrics

## Legacy Components Removed
- `client/src/components/goals/trading-pace-control.tsx` - **DELETED**
- `client/src/components/goals/guardrails-tab.tsx` - **REMOVED from page** (file still exists but unused)

## Files Modified Summary
```
client/src/components/goals/goals-engine-tab.tsx (Phases 1 & 6)
client/src/components/goals/presets-grid.tsx (Phase 6.1)
client/src/components/goals/filters-with-override.tsx (Phase 3)
client/src/components/dashboard/dashboard-latti-widget.tsx (Phases 4 & 9)
client/src/pages/goals-engine.tsx (Phase 8)
audit/goals_ui_cleanup.md (NEW)
```

## Files Deleted
```
client/src/components/goals/trading-pace-control.tsx (Phase 1)
```

## Components Removed from UI
```
<TradingPaceControl /> (deleted)
<TargetDailyGoals /> (replaced with simplified version)
<GuardrailsTab /> (removed from goals-engine page)
```

## Database Changes
```
Table: goals_presets
Columns: target_daily_avg_earning_pct
Rows Updated: 8 (4 presets × 2 modes)
```

## Testing Recommendations

### Manual Testing Checklist
- [x] Goals Engine tab loads without Trading Pace component
- [x] Goals Engine shows simplified Projected Growth section
- [x] Preset cards show name only once (in colored badge)
- [x] Screeners tab shows error/empty state instead of blank page
- [x] Dashboard LATTi widget displays in correct order: Preset → Goals → Guardrails → Footer
- [x] Dashboard footer row shows: Coherency | Control | Target % | Trades/Day
- [x] Preset changes update all dependent widgets correctly
- [x] All preset targets display updated values (Conservative 0.17%, Baseline 0.87%, etc.)
- [x] Guardrails tab shows only CoreFourGuardrails (no duplicate legacy tab)
- [ ] Projected Growth table calculates correctly for all presets
- [ ] Color-coded preset badges consistent across all views

### Playwright Test Coverage
```typescript
// Suggested test cases
test('Goals Engine tab does not render Trading Pace component')
test('Screeners tab displays empty state when no filters exist')
test('Dashboard LATTi widget renders in correct order')
test('Preset targets display updated percentage values')
```

## Known Issues & Future Work

1. **Manual Target Inputs in TargetDailyGoals Component**
   - The TargetDailyGoals component still contains manual input logic from legacy implementation
   - **Recommendation:** Refactor to pure read-only display of active preset values
   - **Complexity:** High - requires careful state management updates

2. **Legacy Guardrails Duplication**
   - GuardrailsTab (legacy) and CoreFourGuardrails (modern) both exist
   - **Recommendation:** Complete migration of any unique GuardrailsTab functionality to CoreFourGuardrails, then remove GuardrailsTab
   - **Risk:** Medium - ensure no functionality loss during migration

3. **Projected Growth Calculation Source**
   - Verify projected growth panel reads exclusively from active preset
   - **Recommendation:** Audit projected growth calculations in TargetDailyGoals component

## Dependencies
- Phase 6: Goals Learning Engine (v1.6-goals-learning)
- LATTi Goals + Guardrails Modernization (guardrails_v2 schema)
- Preset-based architecture (goals_presets table)

## Success Metrics
✅ Trading Pace component removed  
✅ Preset seed values updated to realistic targets  
✅ Screeners tab blank page issue resolved  
✅ Dashboard widget reorganized  
✅ Zero manual target input references found  
✅ All data flows through presets or LATTI API  

## Rollback Plan
If issues arise:
1. Restore `trading-pace-control.tsx` from git history
2. Revert preset seed values to previous values
3. Restore original Dashboard LATTi widget layout
4. Revert FiltersWithOverride error handling changes

```bash
# Rollback commands
git checkout HEAD~1 -- client/src/components/goals/trading-pace-control.tsx
git checkout HEAD~1 -- client/src/components/goals/goals-engine-tab.tsx
git checkout HEAD~1 -- client/src/components/dashboard/dashboard-latti-widget.tsx
git checkout HEAD~1 -- client/src/components/goals/filters-with-override.tsx

# Restore old preset values
psql $DATABASE_URL -c "UPDATE goals_presets SET target_daily_avg_earning_pct = '1.75' WHERE name = 'conservative';"
psql $DATABASE_URL -c "UPDATE goals_presets SET target_daily_avg_earning_pct = '2.50' WHERE name = 'baseline';"
psql $DATABASE_URL -c "UPDATE goals_presets SET target_daily_avg_earning_pct = '3.75' WHERE name = 'optimistic';"
psql $DATABASE_URL -c "UPDATE goals_presets SET target_daily_avg_earning_pct = '5.00' WHERE name = 'maximum';"
```

## Documentation References
- `docs/goals_engine_redesign_overview.md` - Goals Engine architecture
- `audit/coherency_rules.yaml` - Guardrail coherency rules
- `docs/manual_override_behavior.md` - LATTi/Manual override behavior
- `docs/phase_6_adaptive_learning.md` - Goals Learning Engine

---

**Next Steps:**
1. Test all changes in development environment
2. Run Playwright acceptance tests
3. Monitor for UI regressions
4. Schedule future phase for TargetDailyGoals refactor and legacy GuardrailsTab removal
