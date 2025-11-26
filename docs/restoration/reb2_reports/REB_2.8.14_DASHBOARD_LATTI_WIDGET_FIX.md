# REB 2.8.14 Dashboard LATTi Widget Fix

## Issue Summary
The Dashboard "LATTi Goals & Guardrails" widget was showing "Failed to fetch" errors, while the Goals Engine "Projected Portfolio Growth" section was working correctly.

## Root Cause
The Dashboard LATTi widget (`dashboard-latti-widget.tsx`) had different query configurations compared to the Goals Engine:
- Missing `retry: 2` option on all three queries
- Deprecated `onError` callbacks (React Query v5 incompatibility)
- No error logging for debugging

## Changes Made

### Frontend (`client/src/components/dashboard/dashboard-latti-widget.tsx`)
1. **Added retry logic**: All three queries now use `retry: 2` matching the Goals Engine pattern
2. **Removed deprecated onError callbacks**: React Query v5 no longer supports `onError` on useQuery
3. **Added useEffect error logging**: Errors are now logged to console for debugging without using deprecated callbacks

```typescript
// Before
const { data, isLoading, error } = useQuery<{ ok: boolean; data: GuardrailsV2 }>({
  queryKey: [`/api/guardrails-v2?mode=${mode}`],
  enabled: !!mode,
});

// After
const { data, isLoading, error } = useQuery<{ ok: boolean; data: GuardrailsV2 }>({
  queryKey: [`/api/guardrails-v2?mode=${mode}`],
  enabled: !!mode,
  retry: 2,
});

useEffect(() => {
  if (error) {
    console.error('[DashboardLATTiWidget] Query error:', error);
  }
}, [error]);
```

### Backend (`server/routes.ts`)
Added comprehensive logging to three API endpoints for debugging:
1. **GET /api/guardrails-v2**: Logs userId and mode on request entry
2. **GET /api/goals-presets/active**: Logs userId and mode on request entry
3. **GET /api/analytics/guardrails-compliance**: Logs userId and mode on request entry

```typescript
// Example logging pattern
console.log(`[REB 2.8.14][/api/guardrails-v2] GET request - userId: ${userId}, mode: ${mode}`);
```

## Testing Results

### E2E Test 1: Dashboard Widget Functionality
✅ **PASSED**
- Login successful with test credentials
- Dashboard loaded without errors
- LATTi Goals & Guardrails widget displays data correctly:
  - Active Preset: Maximum
  - Target Daily Avg Earning %: 3.5%
  - Trades per Day: 10
- All three API endpoints returning 200 OK:
  - `/api/guardrails-v2?mode=paper`
  - `/api/goals-presets/active?mode=paper`
  - `/api/analytics/guardrails-compliance?mode=paper`
- No "Failed to fetch" errors

### E2E Test 2: Three Surface Consistency
✅ **PASSED**
- **Dashboard LATTi Widget**: Active Preset = Maximum, 3.5%, 10 trades/day
- **Portfolio Widget**: Shows balance $888.00 (SIMULATED)
- **Goals Engine**: Active Preset = maximum, 3.5%, 10 trades/day
- **Consistency**: All values match exactly (case-insensitive)

## Architecture Notes

### React Query v5 Compatibility
The queries rely on the global `defaultQueryFn` configured in `client/src/lib/queryClient.ts`:

```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Use apiFetch as default fetcher - automatically includes credentials and timeout
      queryFn: ({ queryKey }) => apiFetch(queryKey[0] as string),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 15000,
      retry: 1, // Global default (overridden by individual queries)
      gcTime: Infinity,
    },
  },
});
```

This means queries only need to specify `queryKey` - the default queryFn automatically fetches from the URL in `queryKey[0]`.

### Nov 6-15 Truth Architecture (Unchanged)
Dashboard continues to use LOCAL WebSocket listener for `trading_state_changed` events to update portfolio data instantly via React Query's global cache. The LATTi widget uses REST polling for Goals/Guardrails data.

## Files Modified
1. `client/src/components/dashboard/dashboard-latti-widget.tsx` - Added retry and error logging
2. `server/routes.ts` - Added logging to three endpoints

## Verification Checklist
- [x] Dashboard LATTi widget loads without errors
- [x] All three API endpoints return 200 OK
- [x] Dashboard widget shows correct preset data
- [x] Goals Engine shows identical data
- [x] Portfolio widget shows correct balance
- [x] No "Failed to fetch" error messages
- [x] React Query v5 compatible (no deprecated callbacks)
- [x] Backend logging added for debugging
- [x] E2E tests pass successfully

## Regression Safety
- **REB 2.8.13 startingBalance fix**: Unchanged and protected
- **Nov 6-15 WebSocket architecture**: Unchanged and protected
- **Goals Engine**: Working correctly, used as reference pattern
- **Portfolio widget**: Working correctly with balance display

## Test Credentials Used
- Username: testuser123
- Password: SecurePass123!

## Status
✅ **COMPLETE** - Dashboard LATTi widget now matches Goals Engine pattern and displays data correctly without errors.
