# Phase 27.DX Diagnostic Mode

## Overview
This directory contains diagnostic tools for tracing goals persistence and trading mode toggle issues.

## Quick Start

### Option 1: Manual Enable (Recommended)
```bash
# Set environment variable
export DIAGNOSTIC_MODE=true

# Restart the application
npm run dev
```

### Option 2: Guided Script
```bash
# Run the diagnostic test runner
./server/diagnostics/run_phase27dx.sh
```

## What Happens in Diagnostic Mode

When `DIAGNOSTIC_MODE=true`, the application:

1. **Request Correlation**: Every API request gets a unique UUID (`req.id`)
2. **Trace Logging**: All `/api/goals/*` and `/api/trading/*` requests log:
   - `[TRACE-IN]` - Request start with req.id, endpoint, user, mode
   - `[TRACE-OUT]` - Request end with req.id, status, duration
3. **Cache Disabled**: All trading/goals endpoints return fresh data (no ETag caching)
4. **Detailed Logging**:
   - **Goals**: Request payload, db.before, db.after, verification read
   - **Trading**: Request payload, system_context.before, system_context.after, WS events

## Log Markers to Look For

### Goals Save Trace
```
[TRACE-IN] req.id=<uuid> endpoint=/api/goals/update user=<userId> mode=paper
[DX-GOALS] ========== GOALS SAVE TRACE START (req.id=<uuid>) ==========
[DX-GOALS] Request payload: { userId, mode, goals: [...] }
[DX-GOALS] db.before for EarningsPerDay: { ... }
[DX-GOALS] db.after for EarningsPerDay: { ... }
[DX-GOALS] Immediate verification read (count: X): [...]
[DX-GOALS] ========== GOALS SAVE TRACE END (req.id=<uuid>) ==========
[TRACE-OUT] req.id=<uuid> status=200 duration=<ms>
```

### Trading Mode Switch Trace
```
[TRACE-IN] req.id=<uuid> endpoint=/api/trading/set-mode user=<userId> mode=paper
[DX-TRADING] ========== MODE SWITCH TRACE START (req.id=<uuid>) ==========
[DX-TRADING] Request payload: { userId, username, mode, reason }
[DX-TRADING] system_context.before: { trading_mode: "paper", is_engine_active: false, ... }
[DX-TRADING] system_context.after: { trading_mode: "live", is_engine_active: false, ... }
[DX-TRADING] Response payload: { success: true, mode: "live", ... }
[DX-TRADING] WS event will be emitted: trading_state_changed
[DX-TRADING] ========== MODE SWITCH TRACE END (req.id=<uuid>) ==========
[TRACE-OUT] req.id=<uuid> status=200 duration=<ms>
```

## Database Diagnostic Queries

Run the queries in `phase27dx_queries.sql` to check:
- Current goals state
- Goals audit log
- System context trading state
- Active paper sim sessions
- Ghost sessions (active without context link)
- Broken references (context pointing to missing session)

```bash
# Connect to database and run queries
cat server/diagnostics/phase27dx_queries.sql | psql $DATABASE_URL
```

## Test Sequence

### 1. Goals Persistence Test
1. Navigate to Goals Engine tab
2. Change "Earnings per Day" to 507
3. Click "Save Goals"
4. Watch console for `[DX-GOALS]` traces
5. Verify immediate verification read shows new value

### 2. Trading Mode Toggle Test
1. Click Trading toggle to start Paper mode
2. Watch console for `[DX-TRADING]` traces
3. Verify system_context.after shows correct mode
4. Try to switch to Live mode
5. Note if buttons are disabled

### 3. Collect Logs
1. Server logs: Check console output
2. Frontend logs: Open DevTools → Console
3. Network logs: DevTools → Network tab
4. Database logs: Run diagnostic SQL queries

## Output Location

Compile all findings into:
```
reports/PHASE_27_DX_TRACE.md
```

## Disable Diagnostic Mode

```bash
unset DIAGNOSTIC_MODE
# Or restart server without the env var
```

## Files

- `run_phase27dx.sh` - Guided test runner
- `phase27dx_queries.sql` - Database diagnostic queries
- `README.md` - This file
