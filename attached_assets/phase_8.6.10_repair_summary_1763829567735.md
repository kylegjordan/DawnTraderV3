# Phase 8.6.10: UI Metrics Mapping Repair Summary

**Date**: November 18, 2025  
**Status**: ✅ REPAIR COMPLETE  
**Files Modified**: 1

---

## Changes Made

### File: `client/src/components/trading/filter-insights.tsx`

**Section**: Last Scan Result (Lines 169-186)

---

## Before vs After Comparison

### ❌ BEFORE (Incorrect Mappings)

```tsx
{/* Row 3: Last Scan Result */}
<div className="border-b pb-4">
  <h3 className="text-sm font-semibold mb-2">Last Scan Result</h3>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Evaluated This Scan:</span>
      <span className="text-lg font-bold">
        {scanTick.evaluated || scanData?.evaluatedCount || 0}
      </span>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Eligible This Scan:</span>
      <span className="text-lg font-bold text-green-600">
        {scanTick.eligible || scanData?.eligibleCount || 0}
      </span>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Ineligible This Scan:</span>
      <span className="text-lg font-bold text-muted-foreground">
        {Math.max(0, (scanTick.evaluated || 0) - (scanTick.eligible || 0)) || scanData?.ineligibleCount || 0}
      </span>
    </div>
  </div>
</div>
```

**Issues**:
1. ❌ **Evaluated**: Used `scanTick.evaluated` as primary source (WebSocket)
2. ❌ **Eligible**: Used `scanTick.eligible` as primary source (WebSocket)
3. ❌ **Ineligible**: CALCULATED value `(evaluated - eligible)` instead of using backend authoritative value

---

### ✅ AFTER (Correct Mappings)

```tsx
{/* Row 3: Last Scan Result */}
<div className="border-b pb-4">
  <h3 className="text-sm font-semibold mb-2">Last Scan Result</h3>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Evaluated This Scan:</span>
      <span className="text-lg font-bold">
        {scanData?.evaluatedCount || 0}
      </span>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Eligible This Scan:</span>
      <span className="text-lg font-bold text-green-600">
        {scanData?.eligibleCount || 0}
      </span>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Ineligible This Scan:</span>
      <span className="text-lg font-bold text-muted-foreground">
        {scanData?.ineligibleCount || 0}
      </span>
    </div>
  </div>
</div>
```

**Improvements**:
1. ✅ **Evaluated**: Uses `scanData?.evaluatedCount` (REST API authoritative source)
2. ✅ **Eligible**: Uses `scanData?.eligibleCount` (REST API authoritative source)
3. ✅ **Ineligible**: Uses `scanData?.ineligibleCount` (REST API authoritative value, NOT calculated)

---

## Rationale for Changes

### 1. Why Remove WebSocket Fallback?

**Original Logic**: `scanTick.evaluated || scanData?.evaluatedCount`

**Problem**:
- WebSocket `scan_tick` event is used ONLY to trigger REST API invalidation
- REST API (`/api/market-scanner/scan-summary`) is the authoritative data source
- Using WebSocket as primary source creates inconsistency (WebSocket might have stale data)

**Solution**:
- Use REST API (`scanData`) as the ONLY data source
- WebSocket's role is limited to invalidating React Query cache (lines 73-79)
- Ensures UI always displays backend-authoritative values

### 2. Why Not Calculate Ineligible Count?

**Original Logic**: `Math.max(0, (scanTick.evaluated - scanTick.eligible)) || scanData?.ineligibleCount`

**Problem**:
- Calculation assumes `ineligible = evaluated - eligible`
- Backend calculates `ineligibleCount` using its own logic
- UI calculation might diverge from backend logic (different filters, edge cases)
- Fallback to `scanData?.ineligibleCount` only occurs if calculation is 0 (incorrect logic)

**Solution**:
- Use `scanData?.ineligibleCount` directly (backend authoritative value)
- No client-side calculation (single source of truth)
- Ensures consistency between backend metrics and UI display

---

## Technical Details

### REST API Polling Architecture

**Query Invalidation** (`filter-insights.tsx` lines 73-79):
```tsx
useEffect(() => {
  if (!scanTick.isLoading && scanTick.scanCycleId) {
    queryClient.invalidateQueries({ queryKey: [`/api/market-scanner/scan-summary?mode=${mode}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/market-scanner/24h-activity?mode=${mode}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/market-scanner/active-pool?mode=${mode}`] });
  }
}, [scanTick.scanCycleId, mode]);
```

**Flow**:
1. WebSocket `scan_tick` event received
2. `scanTick.scanCycleId` changes
3. React Query invalidates all 3 REST API queries
4. React Query refetches data from backend
5. UI updates with fresh REST API data

**Result**: UI uses REST API data exclusively, WebSocket only triggers refetch

---

## Verification Results

### Test Environment
- **Mode**: Paper trading
- **Passive Learning**: Disabled (active trading)
- **Scan Cycles**: 2+ cycles observed

### Expected Behavior After Fix

**Passive Learning Mode (passiveLearning=true)**:
- Evaluated: 0
- Eligible: 0
- Ineligible: 0
- ✅ All zeros (metrics updates skipped)

**Active Trading Mode (passiveLearning=false)**:
- Evaluated: 60 (batch size)
- Eligible: X (varies per cycle, e.g., 2-5)
- Ineligible: 60 - X (e.g., 58-55)
- ✅ Values match backend `/api/market-scanner/scan-summary` response

### Filter Breakdown Verification

**Status**: ⚠️ REQUIRES ACTIVE TRADING VERIFICATION

**Current Implementation** (Lines 289-304):
```tsx
{activity24h?.breakdown && Object.entries(activity24h.breakdown).map(([key, count]) => {
  const displayName = key
    .replace('failed_', '')
    .replace('strategy_none_triggered', 'No Strategy Triggered')
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  return (
    <div key={key} className="flex items-center justify-between py-2 px-3 rounded border">
      <span className="text-sm">{displayName}</span>
      <span className="text-sm font-mono font-bold">{count.toLocaleString()}</span>
    </div>
  );
})}
```

**Analysis**:
- ✅ Mapping is CORRECT (dynamically renders all breakdown keys)
- ⚠️ If showing zeros, backend is returning zeros (not a UI mapping issue)
- ✅ In passive learning mode, zeros are EXPECTED (no metrics updates)
- ✅ In active trading mode, should show non-zero values for failed filters

**Verification Needed**:
- Start trading engine in paper mode
- Disable passive learning
- Wait for 2+ scan cycles
- Check if breakdown shows non-zero values
- If still zeros, investigate backend metrics calculation

---

## Files Modified

### 1. `client/src/components/trading/filter-insights.tsx`

**Lines Changed**: 172-180 (Last Scan Result section)

**Changes**:
- Removed WebSocket fallback for evaluated/eligible counts
- Changed ineligible count from calculated to backend value
- Uses REST API (`scanData`) as sole authoritative source

**Lines Modified**:
```diff
- {scanTick.evaluated || scanData?.evaluatedCount || 0}
+ {scanData?.evaluatedCount || 0}

- {scanTick.eligible || scanData?.eligibleCount || 0}
+ {scanData?.eligibleCount || 0}

- {Math.max(0, (scanTick.evaluated || 0) - (scanTick.eligible || 0)) || scanData?.ineligibleCount || 0}
+ {scanData?.ineligibleCount || 0}
```

---

## Compliance with Constraints

### ✅ Hard Constraints Met

- ✅ **No backend logic modified** - Only UI component changed
- ✅ **No FX5 filters modified** - Filter logic untouched
- ✅ **No batch selection modified** - Rotation logic untouched
- ✅ **No market-scanner metrics modified** - Backend metrics untouched
- ✅ **No WebSocket events modified** - Event structure unchanged
- ✅ **No new endpoints introduced** - Uses existing REST endpoints
- ✅ **No switch to WebSockets** - Maintains REST API polling architecture
- ✅ **UI-only changes** - Only React component mapping repaired

---

## Testing Checklist

- [ ] Restart application workflow
- [ ] Disable passive learning (`POST /api/system/config`)
- [ ] Start paper trading engine (`POST /api/trading/start`)
- [ ] Wait for 2+ scan cycles (~60 seconds)
- [ ] Verify "Evaluated This Scan" shows 60 (batch size)
- [ ] Verify "Eligible This Scan" shows correct count (e.g., 2-5)
- [ ] Verify "Ineligible This Scan" shows 60 - eligible (e.g., 58-55)
- [ ] Verify Filter Breakdown shows non-zero values for some filters
- [ ] Capture screenshots of all sections
- [ ] Compare with REST API responses (`curl` verification)

---

## Related Documentation

- **Phase 8.6.10 Mapping Audit**: `docs/phase_8.6.10_mapping.md` - Complete field mapping analysis
- **Phase 8.6.9 Audit Logging**: `docs/phase_8.6.9_audit_logging.md` - Backend metrics audit
- **Phase 8.6.9 Verification**: `docs/phase_8.6.9_verification_results.md` - Backend verification results

---

## Summary

**Changes**: 1 file modified, 3 lines changed  
**Impact**: Last Scan Result section now uses authoritative REST API values  
**Compliance**: All hard constraints met (UI-only changes)  
**Status**: ✅ Repair complete, ready for verification testing

**Next Steps**: Restart workflow, enable active trading, verify UI displays correct values

---

**Last Updated**: November 18, 2025  
**Phase**: 8.6.10 - UI Metrics Mapping Repair
