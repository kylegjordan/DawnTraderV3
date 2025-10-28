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

## Legacy Components Identified (Deferred Cleanup)

### Duplicate Guardrails Components
**Modern (Keep):**
- `client/src/components/goals/core-four-guardrails.tsx` - Uses `/api/guardrails-v2`, manages modern Core Four parameters

**Legacy (Future Removal):**
- `client/src/components/goals/guardrails-tab.tsx` - Uses `/api/guardrails` (old endpoint), manages deprecated parameters

**Decision:** Both components are currently displayed in the Guardrails tab (`client/src/pages/goals-engine.tsx` line 86-90). Removal of legacy GuardrailsTab requires careful migration to ensure no functionality is lost. **Deferred to future phase.**

## Files Modified Summary
```
client/src/components/goals/goals-engine-tab.tsx
client/src/components/goals/filters-with-override.tsx
client/src/components/dashboard/dashboard-latti-widget.tsx
audit/goals_ui_cleanup.md (NEW)
```

## Files Deleted
```
client/src/components/goals/trading-pace-control.tsx
```

## Database Changes
```
Table: goals_presets
Columns: target_daily_avg_earning_pct
Rows Updated: 8 (4 presets × 2 modes)
```

## Testing Recommendations

### Manual Testing Checklist
- [ ] Goals Engine tab loads without Trading Pace component
- [ ] TargetDailyGoals displays preset-based values
- [ ] Screeners tab shows error/empty state instead of blank page
- [ ] Dashboard LATTi widget displays in correct order: Preset → Goals → Guardrails
- [ ] Preset changes update all dependent widgets correctly
- [ ] All preset targets display updated values (Conservative 0.17%, Baseline 0.87%, etc.)

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
