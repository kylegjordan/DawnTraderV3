# Phase 8.8.3-H8: Autonomy and Safety Cleanup Audit

**Date**: December 2, 2025  
**Phase**: 8.8.3-H8  
**Objective**: Remove SafetyGuardrails from runtime and strip AutonomyController of any ability to influence trading or kill the engine.

---

## 1. Before H8 Architecture

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BEFORE H8 ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      AUTONOMY SUBSYSTEM                               │  │
│  │                                                                       │  │
│  │  AutonomyController.selfCheck()                                      │  │
│  │         │                                                            │  │
│  │         ▼                                                            │  │
│  │  safetyGuardrails.evaluateAction()                                   │  │
│  │         │                                                            │  │
│  │         ▼                                                            │  │
│  │  ┌───────────────────────────────────┐                              │  │
│  │  │ SafetyGuardrails.getKillSwitchStatus() │                         │  │
│  │  │     └─► GuardrailPolicy (guardrails_v2) │ [H7 delegation]       │  │
│  │  └───────────────────────────────────┘                              │  │
│  │         │                                                            │  │
│  │         ▼                                                            │  │
│  │  Returns policyHits: ['KILL_SWITCH'] if active                      │  │
│  │  H7 change: Kill switch is "informational only" but still           │  │
│  │             logs "blocking" messages for non-KS violations          │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      TRADING SUBSYSTEM                                │  │
│  │                                                                       │  │
│  │  checkGuardrailRisk() [trade-safety.ts]                              │  │
│  │         │                                                            │  │
│  │         ▼                                                            │  │
│  │  buildSettingsFromGuardrails()                                       │  │
│  │         │                                                            │  │
│  │         ▼                                                            │  │
│  │  guardrails_v2.killSwitchTripped ◄─── SINGLE SOURCE OF TRUTH        │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      API ROUTES                                       │  │
│  │                                                                       │  │
│  │  /api/safety/status      → safetyGuardrails.getKillSwitchStatus()   │  │
│  │  /api/safety/policies    → safetyGuardrails.applyPolicy()           │  │
│  │  /api/safety/kill-switch → safetyGuardrails.toggleKillSwitch()      │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      SCHEDULER                                        │  │
│  │                                                                       │  │
│  │  safety_sweeper task (2h)                                            │  │
│  │         │                                                            │  │
│  │         ▼                                                            │  │
│  │  safetyGuardrails.archiveOldEvents()                                │  │
│  │  safetyGuardrails.getHighSeverityEvents()                           │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. H8.1: Deep Audit - SafetyGuardrails & Kill-Switch References

### 2.1 SafetyGuardrails Import/Instantiation Locations

| File | Line(s) | Usage | Can Block Trading? | Legacy? |
|------|---------|-------|-------------------|---------|
| `server/services/safety-guardrails.ts` | 33, 392 | Class definition & export | N/A | Yes (Walter-era) |
| `server/services/autonomy-controller.ts` | 20, 309-339 | `safetyGuardrails.evaluateAction()` | Yes (logs blocking) | Yes |
| `server/routes.ts` | 16458-16513 | API routes for status, policies, toggle | No (admin UI only) | Yes |
| `server/services/autonomy-scheduler.ts` | 547-556 | `archiveOldEvents()`, `getHighSeverityEvents()` | No (housekeeping) | Yes |
| `server/services/trade-safety.ts` | 99 | Comment reference only | No | N/A |
| `server/services/task-worker.ts` | 298 | Comment reference only | No | N/A |

### 2.2 kill_switch References

| File | Line(s) | Usage | Runtime Decision? |
|------|---------|-------|-------------------|
| `server/routes.ts` | 14399 | Log entry: `actionType: 'kill_switch_denied'` | No (logging) |
| `server/routes.ts` | 17140 | Column list reference | No (metadata) |
| `server/services/trade-safety.ts` | 103-106 | H7 audit logging + KILL_SWITCH code | Yes (trade blocking) |
| `server/services/autonomy-controller.ts` | 325 | `actionsTriggered.push('kill_switch_active_diagnostic_mode')` | No (diagnostic) |
| `server/services/safety-guardrails.ts` | 275, 288 | Event types for Context Bridge | No (events) |
| `server/services/risk-manager.ts` | 1200, 1234, 1255 | Legacy eventType definitions | No (deprecated) |
| `server/services/paper-execution-engine.ts` | 347 | `skippedReason: 'kill_switch_tripped'` | No (logging) |
| `server/services/guardrail-policy.ts` | 241, 442, 481, 580 | Event emissions for KS trip/reset | No (events) |
| `server/services/alert-action-handler.ts` | 45 | Case handler for reset alerts | No (handler) |
| `server/services/paper-sim-diagnostic.ts` | 463 | Diagnostic reason string | No (diagnostic) |
| `server/services/trading-state-sync.ts` | 347 | ClusterBus event listener | No (sync) |
| `server/services/context-bridge.ts` | 9 | Type definition for event types | No (types) |

### 2.3 policyHits / KILL_SWITCH in Decision Logic

| File | Line(s) | Pattern | Blocking? | Action Required |
|------|---------|---------|-----------|-----------------|
| `server/services/autonomy-controller.ts` | 323 | `policyHits.includes('KILL_SWITCH')` | Was blocking, now diagnostic (H7) | Convert to pure diagnostic |
| `server/services/autonomy-controller.ts` | 328-334 | Other violations still block | Yes | Remove blocking behavior |
| `server/services/safety-guardrails.ts` | 49, 62, 72 | Returns `policyHits: ['KILL_SWITCH']` | Service returns blocking result | Deprecate service |

### 2.4 AutonomyController Safety/Kill Decision Points

| Location | Lines | Behavior | H8 Action |
|----------|-------|----------|-----------|
| `selfCheck()` | 309-339 | Calls `safetyGuardrails.evaluateAction()` | Remove call, replace with diagnostic log |
| `selfCheck()` | 323-326 | Kill switch detection (now diagnostic) | Keep as diagnostic, remove SafetyGuardrails call |
| `selfCheck()` | 327-334 | Other policy violations block self-check | Remove blocking, convert to diagnostic |

---

## 3. H8.2: SafetyGuardrails Removal Actions

### 3.1 Files to Modify

1. **server/services/safety-guardrails.ts**
   - Add deprecation header comment
   - Keep file for reference but mark as LEGACY MODULE

2. **server/services/autonomy-controller.ts**
   - Remove import of `safetyGuardrails`
   - Replace `evaluateAction()` call with diagnostic logging
   - Remove any blocking behavior related to safety

3. **server/services/autonomy-scheduler.ts**
   - Keep `safety_sweeper` task but remove safetyGuardrails dependency
   - Replace with direct DB queries for event archival (or disable task)

4. **server/routes.ts** (Phase 11.0 Safety Routes)
   - These routes are admin-only and don't affect trading runtime
   - Keep for backward compatibility but document as legacy
   - Add deprecation comments

---

## 4. H8.3: AutonomyController Stripping Actions

### Current State (After H7)
- Kill switch: Informational only (doesn't block)
- Other policy violations: STILL BLOCKING

### Target State (After H8)
- Kill switch: Diagnostic logging only
- Other policy violations: Diagnostic logging only
- No blocking of any kind
- No calls to SafetyGuardrails

### Code Transformation

**Before** (Lines 306-341):
```typescript
// Phase 11.0: Safety Guardrails Pre-Execution Check
try {
  const safetyEval = await safetyGuardrails.evaluateAction({...});
  
  if (!safetyEval.allowed) {
    if (safetyEval.policyHits.includes('KILL_SWITCH')) {
      // H7: Informational only
      console.warn('[8.8.3-H7][AUTONOMY] Kill switch active...');
    } else {
      // Still blocks!
      console.error(`[AutonomyController] ⛔ SAFETY GUARDRAILS VIOLATION - blocking`);
      issuesDetected.push(`SAFETY VIOLATION: ${safetyEval.reason}`);
    }
  }
}
```

**After** (H8):
```typescript
// [8.8.3-H8] SafetyGuardrails removed; AutonomyController is diagnostic-only.
// Kill switch state is read-only from guardrails_v2 for telemetry purposes.
try {
  const { GuardrailPolicy } = await import('./guardrail-policy');
  const gp = new GuardrailPolicy('paper');
  const ksActive = await gp.isKillSwitchActive();
  
  if (ksActive) {
    console.log('[8.8.3-H8][AUTONOMY] Kill switch active (diagnostic telemetry)');
    actionsTriggered.push('kill_switch_active_diagnostic');
  }
  console.log('[8.8.3-H8][AUTONOMY] Safety check: diagnostic-only mode');
} catch (err) {
  console.warn('[8.8.3-H8][AUTONOMY] Kill switch status check failed (non-blocking):', err);
}
```

---

## 5. H8.4: Legacy Kill-Switch Cleanup

### Confirmed Safe (No Runtime Decisions)
- `server/services/risk-manager.ts` - eventType definitions only (deprecated)
- `server/services/paper-execution-engine.ts` - Logging only
- `server/services/paper-sim-diagnostic.ts` - Diagnostic reasons only
- `server/services/trading-state-sync.ts` - Event sync only
- `server/services/context-bridge.ts` - Type definitions only
- `server/services/alert-action-handler.ts` - Alert handler only
- `server/services/guardrail-policy.ts` - Event emissions only (source of truth)

### Only Active Enforcer
- `server/services/trade-safety.ts` - `checkGuardrailRisk()` using `guardrails_v2.killSwitchTripped`

---

## 6. After H8 Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AFTER H8 ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      AUTONOMY SUBSYSTEM                               │  │
│  │                                                                       │  │
│  │  AutonomyController.selfCheck()                                      │  │
│  │         │                                                            │  │
│  │         ▼                                                            │  │
│  │  [8.8.3-H8] DIAGNOSTIC-ONLY MODE                                    │  │
│  │  - Reads kill switch state from GuardrailPolicy                     │  │
│  │  - Logs telemetry ONLY                                              │  │
│  │  - CANNOT block trading                                              │  │
│  │  - CANNOT toggle kill switch                                         │  │
│  │  - NO SafetyGuardrails calls                                         │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      TRADING SUBSYSTEM                                │  │
│  │                                                                       │  │
│  │  checkGuardrailRisk() [trade-safety.ts]                              │  │
│  │         │                                                            │  │
│  │         ▼                                                            │  │
│  │  buildSettingsFromGuardrails()                                       │  │
│  │         │                                                            │  │
│  │         ▼                                                            │  │
│  │  guardrails_v2.killSwitchTripped ◄─── ONLY ENFORCER                 │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      SafetyGuardrails [DEPRECATED]                    │  │
│  │                                                                       │  │
│  │  [Phase 8.8.3-H8] LEGACY MODULE                                      │  │
│  │  - NOT used for runtime decisions                                    │  │
│  │  - Kept for reference only                                           │  │
│  │  - API routes preserved for backward compatibility                   │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Verification Checklist (H8.5)

- [ ] Server starts cleanly with no TypeScript/runtime errors
- [ ] No new imports failing from SafetyGuardrails removal
- [ ] Paper trading works without SafetyGuardrails blocking
- [ ] FX5 scan cycles update normally
- [ ] Kill switch only enforced by trade-safety.ts via guardrails_v2
- [ ] AutonomyController logs are diagnostic-only
- [ ] No "[SafetyGuardrails] ⛔ Kill switch is ENABLED - blocking" messages in trading path

---

## 8. Out of Scope (Documented Only)

### 8.1 decision_quality_audit Schema Issue
- **Problem**: `accuracy_score` column has precision (3,2) but receives values like 57.14
- **Location**: `server/services/reflective-intelligence.ts:248`
- **Impact**: Numeric overflow on audit insertions
- **Status**: Deferred to Phase 8.9 schema migration

### 8.2 Legacy RiskManager Usage
- **Files**: routes.ts, heuristic-trader.ts, daily-brief.ts, behavioral-template.ts, paper-sim-diagnostic.ts
- **Status**: Non-critical services, deferred to Phase 8.9

---

## 9. Changes Log

| Task | File | Change | Status |
|------|------|--------|--------|
| H8.2 | safety-guardrails.ts | Added LEGACY MODULE deprecation header | ✅ Complete |
| H8.2 | autonomy-controller.ts | Removed safetyGuardrails import, added guardrailPolicy import | ✅ Complete |
| H8.3 | autonomy-controller.ts | Converted safety check to diagnostic-only using `guardrailPolicy.isKillSwitchTripped()` | ✅ Complete |
| H8.4 | autonomy-scheduler.ts | Removed safetyGuardrails from safety_sweeper, using direct DB queries | ✅ Complete |
| H8.4 | routes.ts | Added deprecation comments to /api/safety/* routes | ✅ Complete |
| H8.4 | safety-guardrails.ts | Added deprecation warning logs to evaluateAction() method | ✅ Complete |
| H8.4 | autonomy-scheduler.ts | Improved delete count logging for safety_sweeper task | ✅ Complete |
| H8.5 | - | Runtime verification: Server starts cleanly, no SafetyGuardrails blocking | ✅ Complete |

---

## 10. Verification Evidence (H8.5)

### Server Startup (Dec 2, 2025 06:37 UTC)
- ✅ No TypeScript/runtime errors related to SafetyGuardrails removal
- ✅ AutonomyController self-check runs without SafetyGuardrails dependency
- ✅ No `[SafetyGuardrails] ⛔ Kill switch is ENABLED - blocking` messages
- ✅ LATTI, HeuristicTrader, and FX5 Scanner running normally

### Autonomy Behavior
- AutonomyController now uses `guardrailPolicy.isKillSwitchTripped('paper')` for diagnostic telemetry only
- Self-check continues regardless of kill switch state (no blocking)
- All safety decisions are purely informational

### Kill Switch Enforcement
- Only active enforcer: `checkGuardrailRisk()` in `trade-safety.ts`
- Sources from: `guardrails_v2.killSwitchTripped`
- No other hidden risk managers or safety layers

---

## 11. Final Statements

**After Phase 8.8.3-H8:**

1. **SafetyGuardrails** is deprecated and NOT used for runtime enforcement.
   - Kept only for backward compatibility with admin API routes
   - Event logging to safety_event_log table preserved

2. **AutonomyController** is now **diagnostic-only**.
   - Cannot block trading
   - Cannot toggle, trip, or reset kill switch
   - Reads kill switch state for telemetry purposes only

3. **The only active kill switch** is `guardrails_v2.killSwitchTripped`.

4. **The only risk/kill-switch enforcer** is `checkGuardrailRisk()` in `trade-safety.ts`.

5. **There are no remaining hidden risk managers** or safety layers making go/no-go trading decisions.

---

**Document Created**: 2025-12-02  
**Phase**: 8.8.3-H8  
**Last Updated**: 2025-12-02 06:37 UTC  
**Author**: Agent
