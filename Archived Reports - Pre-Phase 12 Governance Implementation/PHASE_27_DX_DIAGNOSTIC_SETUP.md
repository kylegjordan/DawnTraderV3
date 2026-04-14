# Phase 27.DX Diagnostic Infrastructure - Setup Complete

## Overview
Comprehensive diagnostic trace logging system has been implemented to investigate:
1. **Goals Reversion Issue**: Why goal values revert after save
2. **Trading Mode Toggle Issue**: Why trading mode selector may be disabled or unresponsive

## What Was Implemented

### 1. Request Correlation Middleware (`diagnosticTraceMiddleware`)
- **Location**: `server/routes.ts` (lines 204-242, 321)
- **Features**:
  - Generates unique UUID for every request (`req.traceId`)
  - Logs `[TRACE-IN]` and `[TRACE-OUT]` for all `/api/goals/*` and `/api/trading/*` requests
  - Disables caching (`Cache-Control: no-store`) when `DIAGNOSTIC_MODE=true`
  - Tracks request duration and status codes

### 2. Enhanced Goals Endpoint Logging (`/api/goals/update`)
- **Location**: `server/routes.ts` (lines 6312-6397)
- **Logs**:
  - Request payload (userId, mode, goals array)
  - `db.before` state for each goal
  - `db.after` state for each goal after upsert
  - Immediate verification read to confirm persistence
  - All logs tagged with `[DX-GOALS]` and request ID

### 3. Enhanced Trading Endpoint Logging (`/api/trading/set-mode`)
- **Location**: `server/routes.ts` (lines 1012-1091)
- **Logs**:
  - Request payload (userId, username, mode, reason)
  - `system_context.before` state
  - `system_context.after` state  
  - Response payload
  - WebSocket event notification
  - All logs tagged with `[DX-TRADING]` and request ID

### 4. Database Diagnostic Queries
- **Location**: `server/diagnostics/phase27dx_queries.sql`
- **Includes**:
  - Current goals state (paper/live)
  - Goals audit log (recent changes)
  - System context (trading state)
  - Active paper sim sessions
  - Ghost sessions (active without context link)
  - Broken references (context pointing to missing session)
  - Session counts
  - User permissions

### 5. Documentation & Scripts
- **Files Created**:
  - `server/diagnostics/README.md` - Complete diagnostic guide
  - `server/diagnostics/run_phase27dx.sh` - Guided test runner
  - `server/diagnostics/phase27dx_queries.sql` - SQL queries
  - `reports/PHASE_27_DX_DIAGNOSTIC_SETUP.md` - This file

## How to Use

### Enable Diagnostic Mode

The diagnostic mode has been added to `.env`:
```bash
DIAGNOSTIC_MODE=true
```

Server is currently running with diagnostic mode enabled.

### Run Diagnostic Tests

#### Method 1: Manual Testing (Recommended)
1. Open the application in your browser
2. Login as user `kylegjordan`
3. Perform the following actions while watching server console:

**Goals Test:**
- Navigate to Goals Engine tab
- Change "Earnings per Day" to 507
- Click "Save Goals"
- Watch console for `[DX-GOALS]` traces

**Trading Toggle Test:**
- Click Trading toggle to start Paper mode
- Watch console for `[DX-TRADING]` traces
- Try to switch to Live mode (note if disabled)

#### Method 2: Guided Script
```bash
./server/diagnostics/run_phase27dx.sh
```

### Expected Log Output

#### Goals Save Trace
```
[TRACE-IN] req.id=abc123... endpoint=/api/goals/update user=14e0809e... mode=paper method=POST
[DX-GOALS] ========== GOALS SAVE TRACE START (req.id=abc123...) ==========
[DX-GOALS] Request payload: {
  "userId": "14e0809e-3ca8-413d-878f-c55f9d837fae",
  "mode": "paper",
  "goalsCount": 1,
  "goals": [
    {
      "metricName": "EarningsPerDay",
      "goalValue": "507",
      "actualValue": "0",
      "percentAchieved": "0"
    }
  ]
}
[DX-GOALS] db.before for EarningsPerDay: {
  "id": "...",
  "userId": "14e0809e-3ca8-413d-878f-c55f9d837fae",
  "metricName": "EarningsPerDay",
  "goalValue": "500",
  "actualValue": "0",
  "percentAchieved": "0",
  "lastUpdated": "2025-10-19T20:30:00.000Z"
}
[DX-GOALS] db.after for EarningsPerDay: {
  "id": "...",
  "userId": "14e0809e-3ca8-413d-878f-c55f9d837fae",
  "metricName": "EarningsPerDay",
  "goalValue": "507",
  "actualValue": "0",
  "percentAchieved": "0",
  "lastUpdated": "2025-10-19T20:52:00.000Z"
}
[DX-GOALS] Immediate verification read (count: 4): [...]
[DX-GOALS] ========== GOALS SAVE TRACE END (req.id=abc123...) ==========
[TRACE-OUT] req.id=abc123... status=200 duration=125ms endpoint=/api/goals/update
```

#### Trading Mode Switch Trace
```
[TRACE-IN] req.id=def456... endpoint=/api/trading/set-mode user=14e0809e... mode=paper method=POST
[DX-TRADING] ========== MODE SWITCH TRACE START (req.id=def456...) ==========
[DX-TRADING] Request payload: {
  "userId": "14e0809e-3ca8-413d-878f-c55f9d837fae",
  "username": "kylegjordan",
  "mode": "paper",
  "reason": "User started paper trading"
}
[DX-TRADING] system_context.before: {
  "tradingMode": "paper",
  "isEngineActive": false,
  "sessionId": null,
  ...
}
[DX-TRADING] system_context.after: {
  "tradingMode": "paper",
  "isEngineActive": true,
  "sessionId": "session_abc123",
  ...
}
[DX-TRADING] Response payload: {
  "success": true,
  "mode": "paper",
  ...
}
[DX-TRADING] WS event will be emitted: trading_state_changed
[DX-TRADING] ========== MODE SWITCH TRACE END (req.id=def456...) ==========
[TRACE-OUT] req.id=def456... status=200 duration=85ms endpoint=/api/trading/set-mode
```

### Database Queries

Run diagnostic SQL queries:
```bash
cat server/diagnostics/phase27dx_queries.sql | psql $DATABASE_URL
```

### Disable Diagnostic Mode

When testing is complete:
```bash
# Remove from .env or set to false
sed -i '/DIAGNOSTIC_MODE/d' .env
# Restart server
npm run dev
```

## Next Steps

1. **Run the diagnostic test sequence** following the instructions above
2. **Capture all logs**:
   - Server console output (goals and trading traces)
   - Frontend browser console (DevTools → Console tab)
   - Network requests (DevTools → Network tab)
   - SQL query results
3. **Compile findings** into `reports/PHASE_27_DX_TRACE.md`
4. **Analyze traces** to identify:
   - Where goals values diverge (request → DB → response)
   - Where trading mode state breaks (UI → API → DB)
   - Any ghost sessions or broken references
5. **Create fix plan** based on findings

## Files Modified

- `server/routes.ts` - Added diagnostic middleware and enhanced logging
- `.env` - Added `DIAGNOSTIC_MODE=true`

## Files Created

- `server/diagnostics/README.md`
- `server/diagnostics/run_phase27dx.sh`
- `server/diagnostics/phase27dx_queries.sql`
- `reports/PHASE_27_DX_DIAGNOSTIC_SETUP.md`

## Status

✅ Diagnostic infrastructure complete
✅ Server running with DIAGNOSTIC_MODE enabled
⏳ Awaiting manual test execution
⏳ Awaiting trace compilation into final report
