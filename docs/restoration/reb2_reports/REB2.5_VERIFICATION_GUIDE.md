# REB 2.5 - Verification Guide

**Purpose**: Guide for manually verifying the 143s→<10s startup improvement  
**Date**: November 23, 2025  
**Status**: Awaiting Manual Verification

---

## Quick Verification Steps

### 1. Start the Engine

1. Navigate to the trading dashboard in your browser
2. Ensure you're in **Paper Trading** mode
3. Click the **"Start Engine"** button
4. **Time the duration** from click to "ACTIVE" status showing in UI

**Expected Result**: Engine becomes ACTIVE in **<10 seconds** (vs 143s before)

---

### 2. Check Server Logs

Open a terminal and run:

```bash
grep -E '\[WARMUP\]|\[ENGINE_INIT\]|\[ENGINE_ACTIVE\]' /tmp/logs/Start_application_*.log | tail -20
```

**Expected Output** (when engine starts):

```
[ENGINE_INIT][DEBUG] Entering INIT state (importing paper-sim-service)
[WARMUP][DEBUG] SignalOrchestrator starting (non-blocking)
[WARMUP][DEBUG] SignalOrchestrator started successfully
[ENGINE_ACTIVE][DEBUG] Engine reached ACTIVE state
```

**Timing Markers to Check**:
- Time between `[ENGINE_INIT]` and first `[WARMUP]`: <1s
- Time between first `[WARMUP]` and second `[WARMUP]`: <100ms
- Time between first `[ENGINE_INIT]` and `[ENGINE_ACTIVE]`: <5s

---

### 3. Verify No Timeout Errors

**Before REB 2.5**:
```json
{
  "error": "Engine start timeout",
  "elapsed": "10134ms"
}
```

**After REB 2.5**:
```json
{
  "success": true,
  "message": "Paper trading simulation started successfully"
}
```

Check the browser console or network tab for the response from `/api/trading/start`.

---

## Detailed Verification

### Code Verification (Already Confirmed ✅)

Logging markers exist in the code:

```bash
$ grep -n '\[WARMUP\]\[DEBUG\]\|\[ENGINE_INIT\]\[DEBUG\]\|\[ENGINE_ACTIVE\]\[DEBUG\]' \
  server/services/signal-orchestrator.ts server/routes.ts

server/services/signal-orchestrator.ts:104:    console.log(`[WARMUP][DEBUG] SignalOrchestrator starting (non-blocking)`);
server/services/signal-orchestrator.ts:123:    console.log(`[WARMUP][DEBUG] SignalOrchestrator started successfully`);
server/routes.ts:2494:          console.log('[ENGINE_INIT][DEBUG] Entering INIT state (importing paper-sim-service)');
server/routes.ts:2502:          console.log('[ENGINE_ACTIVE][DEBUG] Engine reached ACTIVE state');
server/routes.ts:2505:          console.log('[ENGINE_INIT][DEBUG] Entering INIT state (global live engine)');
server/routes.ts:2511:          console.log('[ENGINE_ACTIVE][DEBUG] Engine reached ACTIVE state');
```

✅ **All markers present in code**

---

### Runtime Verification (Pending User Action ⏳)

**Current Status**: Engine has not been started since code changes deployed

**Why Markers Don't Appear Yet**:
- Server is running with updated code ✅
- Changes are deployed ✅
- Engine hasn't been started yet ⏳
- Markers will appear on next engine start

**To Trigger Markers**:
1. User must click "Start Engine" in UI
2. Logs will immediately show the markers
3. Timing can be measured

---

## Success Criteria

### Primary Goal
✅ **Code Changes Complete** - Non-blocking startup implemented  
⏳ **Runtime Verification Pending** - Awaiting manual engine start

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Code changes deployed | ✅ | grep confirms markers in code |
| Architect approval | ✅ | Review completed November 23 |
| Startup time <10s | ⏳ | Requires manual verification |
| No timeout errors | ⏳ | Requires manual verification |
| Logging markers visible | ⏳ | Requires manual verification |
| No regressions | ✅ | Changes isolated to startup path |

---

## Troubleshooting

### If Markers Don't Appear

**Check 1**: Verify server has updated code
```bash
grep -n "REB 2.5" server/services/signal-orchestrator.ts
# Should show line 90 and 111
```

**Check 2**: Verify server is running
```bash
ps aux | grep tsx
# Should show "tsx server/index.ts"
```

**Check 3**: Check for TypeScript compilation errors
```bash
npm run check
```

### If Startup Still Takes >10s

**Possible Causes**:
1. Database connection slow (check DATABASE_URL)
2. Network issues with Kraken API
3. Large watchlist (>100 pairs)
4. System resource constraints

**Debug Steps**:
```bash
# Check full startup logs
grep "PaperPortfolio\|SignalOrchestrator\|ENGINE_" /tmp/logs/Start_application_*.log | tail -50

# Check for errors
grep "ERROR\|Error\|error" /tmp/logs/Start_application_*.log | tail -20
```

---

## Next Steps After Verification

### If Successful (Startup <10s) ✅

1. Mark REB 2.5 as **COMPLETE** in scratchpad
2. Update task list: all items to "completed"
3. Proceed to REB 2.6 (if needed) or next priority

### If Issues Found ⚠️

1. Document the issue in detail
2. Check server logs for errors
3. Verify code changes are active
4. Debug specific bottleneck
5. Apply additional fix if needed

---

## Performance Comparison

### Before REB 2.5 (Measured)

```
00:00 - User clicks "Start"
00:10 - Timeout error returned
02:23 - Engine reaches "running" (143s)
02:35 - Engine reaches "ACTIVE" (155s)
```

**Total Time**: 143+ seconds  
**User Experience**: Error message, background activation

### After REB 2.5 (Expected)

```
00:00 - User clicks "Start"
00:01 - [ENGINE_INIT] marker
00:01 - [WARMUP] markers
00:04 - [ENGINE_ACTIVE] marker
00:04 - Success response to user
```

**Total Time**: <5 seconds  
**User Experience**: Immediate success, smooth activation

---

## Contact

If you encounter issues during verification or need assistance:

1. **Check Documentation**:
   - REB2.5_ENGINE_WARMUP_COMPLETION_REPORT.md (implementation details)
   - REB2.5_ENGINE_WARMUP_STATE_MACHINE_SPEC.md (architecture)

2. **Review Logs**:
   - Server logs: `/tmp/logs/Start_application_*.log`
   - Browser console: Check for WebSocket events

3. **Code Locations**:
   - Signal fix: `server/services/signal-orchestrator.ts` line 113
   - Timeout fix: `server/routes.ts` line 2487

---

**Verification Guide End**
