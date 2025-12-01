# Phase 8.8.3-H6 — Kill Switch Origin & State Coherency Audit

**Date**: December 1, 2025  
**Phase**: REB 8.8.3-H6  
**Status**: DIAGNOSIS COMPLETE — NO CODE CHANGES MADE

---

## 1. Executive Summary

**TWO SEPARATE KILL SWITCH SYSTEMS EXIST** that are NOT synchronized:

1. **`kill_switch` table** (SafetyGuardrails global): `is_enabled = TRUE`, manually activated from UI on October 18, 2025
2. **`guardrails_v2` table** (per-mode): `killSwitchTripped = FALSE` for both paper and live modes

The trading engine successfully starts because it only checks `guardrails_v2.killSwitchTripped`. However, the SafetyGuardrails service (used by AutonomyController) still sees the global kill switch as ENABLED, causing self-check failures and safety event broadcasts.

---

## 2. API Response Captures

### 2.1 GET /api/guardrails-v2?mode=paper

```json
{
  "ok": true,
  "data": {
    "id": "aead28bb-11f4-415e-a472-a4feb671c8da",
    "mode": "paper",
    "portfolioRiskPerTradePct": 3,
    "symbolCooldownMinutes": 5,
    "maxOpenPositions": 10,
    "dailyLossKillSwitchPct": 10,
    "maxPositionPercentPct": 30,
    "lowPriceMinStopAtrMult": 3,
    "lowPriceMinPositionNotional": 25,
    "lowPriceThreshold": 0.5,
    "isManualOverride": false,
    "tunedByLatti": true,
    "managedByLottie": true,
    "killSwitchTripped": false,
    "killSwitchReason": null,
    "killSwitchTrippedAt": null,
    "lastUpdated": "2025-12-01T17:43:31.162Z"
  }
}
```

### 2.2 GET /api/guardrails-v2?mode=live

```json
{
  "ok": true,
  "data": {
    "id": "31bec456-e8ca-422e-ba87-0ccbe08949f9",
    "mode": "live",
    "portfolioRiskPerTradePct": 4,
    "symbolCooldownMinutes": 5,
    "maxOpenPositions": 12,
    "dailyLossKillSwitchPct": 15,
    "maxPositionPercentPct": 30,
    "killSwitchTripped": false,
    "killSwitchReason": null,
    "killSwitchTrippedAt": null,
    "lastUpdated": "2025-10-29T20:56:40.371Z"
  }
}
```

### 2.3 GET /api/kill-switch/status?mode=paper

```json
{
  "killSwitchTripped": false,
  "dailyLossKillSwitch": 10,
  "mode": "paper",
  "current24hPL": null,
  "latestEvent": null
}
```

### 2.4 GET /api/kill-switch/status?mode=live

```json
{
  "killSwitchTripped": false,
  "dailyLossKillSwitch": 15,
  "mode": "live",
  "current24hPL": null,
  "latestEvent": null
}
```

### 2.5 GET /api/kill-switch/events?limit=10

```json
[]
```

**Note**: Empty array - no kill switch events recorded in this table.

---

## 3. Database State — The Root Cause

### 3.1 Direct Query: `kill_switch` Table

```sql
SELECT * FROM kill_switch;
```

| id | is_enabled | reason | updated_at |
|----|------------|--------|------------|
| global_kill_switch | **t** (TRUE) | Manual activation from UI | 2025-10-18 12:27:04.276+00 |

**KEY FINDING**: The global_kill_switch is ENABLED since October 18, 2025!

### 3.2 SafetyGuardrails Uses This Table

From `server/services/safety-guardrails.ts`:

```typescript
async getKillSwitchStatus(): Promise<{ isEnabled: boolean; reason: string | null; updatedAt: Date }> {
  const result = await db
    .select()
    .from(killSwitch)
    .where(eq(killSwitch.id, 'global_kill_switch'))
    .limit(1);

  if (result.length === 0) {
    return { isEnabled: false, reason: null, updatedAt: new Date() };
  }

  return {
    isEnabled: result[0].isEnabled,  // <-- This is TRUE
    reason: result[0].reason,
    updatedAt: result[0].updatedAt,
  };
}
```

---

## 4. Trading Status Comparison

### 4.1 Before Start (Engine STOPPED)

```json
{
  "mode": "paper",
  "active": false,
  "engineStatus": "STOPPED",
  "isEngineActive": false,
  "isEngineActivePaper": false,
  "isEngineActiveLive": false,
  "passiveLearning": true
}
```

### 4.2 After Start (Engine ACTIVE)

```json
{
  "mode": "paper",
  "active": true,
  "engineStatus": "ACTIVE",
  "isEngineActive": true,
  "isEngineActivePaper": true,
  "isEngineActiveLive": false,
  "passiveLearning": false
}
```

**KEY FINDING**: Trading engine starts successfully, despite global_kill_switch being ENABLED.

---

## 5. Start-Trading Flow Trace

### 5.1 POST /api/trading/start Response

```json
{
  "success": true,
  "mode": "paper",
  "active": true,
  "sessionId": "paper_LBPsH49_ou",
  "startTimeMs": 1246,
  "lastStartedBy": "6c591801-3072-431d-b192-30aaf426f15e",
  "lastHeartbeat": "2025-12-01T22:26:05.276Z"
}
```

### 5.2 Server Log Excerpts

```
[TradingStart] User 6c591801-3072-431d-b192-30aaf426f15e requesting start in paper mode
[ENGINE_VALIDATED_MODE] { mode: 'paper' }
[ENGINE_DB_CHECKPOINT_1] Creating paper sim session in database...
[ENGINE_DB_CHECKPOINT_2] Session created in database: paper_LBPsH49_ou
[PaperExecution:paper] Starting paper trading engine
[ENGINE_START_COMPLETED] { mode: 'paper', sessionId: 'paper_LBPsH49_ou' }
[ENGINE_ACTIVE][DEBUG] Engine reached ACTIVE state
[TradingStart] Completed start for user 6c591801-3072-431d-b192-30aaf426f15e mode=paper active=true
```

**NO SafetyGuardrails KILL_SWITCH block messages in start-trading flow!**

### 5.3 After Start: Global Kill Switch Still ENABLED

```sql
SELECT * FROM kill_switch WHERE id = 'global_kill_switch';

         id         | is_enabled |          reason           |         updated_at         
--------------------+------------+---------------------------+----------------------------
 global_kill_switch | t          | Manual activation from UI | 2025-10-18 12:27:04.276+00
```

---

## 6. State Coherency Analysis

### 6.1 Two Kill Switch Systems

| Kill Switch | Table | Scope | Current State | Used By |
|-------------|-------|-------|---------------|---------|
| SafetyGuardrails | `kill_switch` | Global | **ENABLED** | AutonomyController, SafetyGuardrails.evaluateAction() |
| Guardrails V2 | `guardrails_v2` | Per-Mode | **NOT TRIPPED** | TradingEngine, MarketScanner, guardrailPolicy |

### 6.2 Sync Behavior

| Event | guardrails_v2.killSwitchTripped | kill_switch.is_enabled |
|-------|----------------------------------|-------------------------|
| Daily loss exceeds threshold | Set to TRUE | NOT changed |
| User starts trading | Reset to FALSE | **NOT reset** (BUG) |
| Manual UI toggle | Unknown | Set to TRUE/FALSE |

### 6.3 REB 8.8.3-KS-B Implementation

From `server/routes.ts`:

```typescript
// REB 8.8.3-KS-B: Clear kill switch AFTER successful engine start (atomic truth)
if (wasKillSwitchTripped) {
  console.log(`[KS-B] Engine started successfully - now clearing kill switch for ${mode} mode`);
  await guardrailPolicy.resetKillSwitch(mode);  // <-- Only resets guardrails_v2, NOT kill_switch table!
  console.log(`[KS-B] Kill switch cleared for ${mode} mode`);
}
```

**The `guardrailPolicy.resetKillSwitch(mode)` only clears `guardrails_v2.killSwitchTripped`, NOT the `kill_switch.global_kill_switch`!**

---

## 7. Impact Assessment

### 7.1 What's Working

| Component | Status | Notes |
|-----------|--------|-------|
| Trading Engine Start | ✅ WORKS | Checks only guardrails_v2.killSwitchTripped |
| FX5 Scanner | ✅ WORKS | Checks guardrailPolicy.isKillSwitchTripped() |
| Paper Trading | ✅ WORKS | Engine runs successfully |

### 7.2 What's Broken

| Component | Status | Notes |
|-----------|--------|-------|
| AutonomyController Self-Check | ❌ BLOCKED | Calls SafetyGuardrails.evaluateAction() which sees global kill switch ENABLED |
| Safety Event Broadcasts | ⚠️ NOISY | Constant KILL_SWITCH safety events broadcasted |
| Decision Audits | ❌ FAILING | Blocked by SafetyGuardrails + numeric overflow |

### 7.3 User Experience Impact

- UI shows engine ACTIVE ✅
- Trading works ✅
- Background AutonomyController self-checks fail silently ❌
- WebSocket receives KILL_SWITCH safety events ⚠️

---

## 8. Origin Determination

### 8.1 When Was It Activated?

**Timestamp**: 2025-10-18 12:27:04.276 UTC

### 8.2 How Was It Activated?

**Reason**: "Manual activation from UI"

This indicates a user manually toggled the kill switch ON via the UI on October 18, 2025.

### 8.3 Why Was It Never Reset?

1. No automatic reset logic exists for `kill_switch.global_kill_switch`
2. The REB 8.8.3-KS-B auto-reset only affects `guardrails_v2.killSwitchTripped`
3. The UI toggle probably only affects the `kill_switch` table, not `guardrails_v2`

---

## 9. Recommendations (NO CODE)

### 9.1 Immediate Action

**Option A: Manual Database Fix**
```sql
UPDATE kill_switch 
SET is_enabled = false, 
    reason = 'Manual reset via SQL (Phase 8.8.3-H6 audit)', 
    updated_at = NOW() 
WHERE id = 'global_kill_switch';
```

**Option B: Use Existing API**
Find and call the toggle endpoint that sets `kill_switch.is_enabled = false`.

### 9.2 Code Fix (Future Phase)

1. **Unify kill switch systems** - Either:
   - Remove `kill_switch` table and use only `guardrails_v2.killSwitchTripped`
   - OR sync both tables on any kill switch state change

2. **Update REB 8.8.3-KS-B** to also reset `kill_switch.global_kill_switch` when trading starts:
   ```typescript
   // In routes.ts start-trading flow:
   await guardrailPolicy.resetKillSwitch(mode);
   await safetyGuardrails.toggleKillSwitch(false, 'Auto-cleared on trading start');
   ```

3. **Add monitoring** for state coherency between the two kill switch systems

---

## 10. Artifacts

### Log Files Captured
- `/tmp/logs/Start_application_20251201_222609_965.log`

### API Endpoints Queried
- `GET /api/guardrails-v2?mode=paper`
- `GET /api/guardrails-v2?mode=live`
- `GET /api/kill-switch/status?mode=paper`
- `GET /api/kill-switch/status?mode=live`
- `GET /api/kill-switch/events?limit=10`
- `GET /api/trading/status?mode=paper`
- `GET /api/trading/status?mode=live`
- `POST /api/trading/start` (mode=paper)

### Database Queries
- `SELECT * FROM kill_switch;`
- `SELECT * FROM guardrails_v2 WHERE mode = 'paper';`

---

## 11. Conclusion

**The kill switch state incoherence is caused by having TWO separate kill switch systems:**

1. `kill_switch.global_kill_switch` (SafetyGuardrails) - **ENABLED since Oct 18, 2025**
2. `guardrails_v2.killSwitchTripped` (per-mode) - **NOT TRIPPED**

The trading engine bypasses SafetyGuardrails and only checks guardrails_v2, so trading works. However, AutonomyController uses SafetyGuardrails, so its self-checks are blocked.

**No code changes were made in this phase.** This report is for human review before implementing fixes.

---

**Signed**: Replit Agent  
**Date**: December 1, 2025  
**Phase**: 8.8.3-H6 Diagnosis Complete
