# Guardrail Policy Service — Phase 5 Overview

**Version**: 1.0  
**Date**: October 28, 2025  
**Status**: Core Implementation Complete

## Purpose

The GuardrailPolicy service provides a single backend source of truth for guardrail values, enforcing coherency at runtime across all trading engines (RiskManager, StrategyEngine, LATTI). It resolves effective values (Lottie vs Manual), validates against coherency rules, and provides circuit breaker functionality.

## Architecture

### Service Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    GuardrailPolicy Service                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Effective    │  │ Coherency    │  │ Kill Switch  │       │
│  │ Value        │  │ Validation   │  │ Management   │       │
│  │ Resolution   │  │ Engine       │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │
                 ┌───────────┴───────────┐
                 │                       │
        ┌────────▼────────┐    ┌────────▼────────┐
        │  guardrails_v2  │    │  coherency_     │
        │  (database)     │    │  rules.yaml     │
        └─────────────────┘    └─────────────────┘
                 │
        ┌────────┴────────┬────────────────┬───────────────┐
        │                 │                │               │
   ┌────▼────┐     ┌──────▼─────┐   ┌─────▼─────┐   ┌────▼────┐
   │ Risk    │     │ Strategy   │   │  LATTI    │   │   UI    │
   │ Manager │     │  Engine    │   │  Manager  │   │  Layer  │
   └─────────┘     └────────────┘   └───────────┘   └─────────┘
```

## Core Components

### 1. Effective Value Resolution

**Purpose**: Determines which guardrail values to use (Manual vs Lottie-managed)

**Resolution Logic**:
```typescript
if (is_manual_override = true OR locked_by_user[param] = true) {
  // Use current DB value (manual control)
} else {
  // Use current DB value (LATTI-managed)
}
```

**Output Structure**:
```typescript
{
  mode: 'paper' | 'live',
  portfolioRiskPerTradePct: number,
  symbolCooldownMinutes: number,
  maxOpenPositions: number,
  dailyLossKillSwitchPct: number,
  management: {
    isManualOverride: boolean,
    tunedByLatti: boolean,
    lockedByUser: { [param: string]: boolean }
  }
}
```

### 2. Coherency Validation

**Purpose**: Validates guardrail values against 8 coherency rules defined in `audit/coherency_rules.yaml`

**Rules Enforced**:
- **RULE_001** (ERROR): Portfolio Risk ≤ Kill Switch / 10
- **RULE_002** (WARN): Total Exposure ≤ 100%
- **RULE_003** (ERROR): Symbol Cooldown ≥ 1 minute
- **RULE_004** (WARN): Symbol Cooldown ≤ 90 minutes
- **RULE_005** (ERROR): Manual Override Exclusivity (no conflicting flags)
- **RULE_006** (ERROR): Portfolio Risk Range (0.10% - 5.00%)
- **RULE_007** (ERROR): Kill Switch Range (1.00% - 20.00%)
- **RULE_008** (ERROR): Max Positions Range (1 - 20)

**Validation Status**:
- **PASS**: All rules satisfied
- **WARN**: Warnings present, errors absent
- **FAIL**: One or more ERROR-severity rules violated

**Output Structure**:
```typescript
{
  status: 'PASS' | 'WARN' | 'FAIL',
  failures: [
    {
      ruleId: string,
      ruleName: string,
      severity: 'error' | 'warn',
      message: string,
      param?: string,
      value?: number,
      expected?: string
    }
  ],
  timestamp: string
}
```

### 3. Kill Switch Management

**Purpose**: Implements circuit breaker pattern for emergency trading halts

**Features**:
- Per-mode kill switch state (paper/live independent)
- `tripKillSwitch(mode, reason)`: Activate circuit breaker
- `resetKillSwitch(mode)`: Deactivate circuit breaker
- `isKillSwitchTripped(mode)`: Check current status
- Metrics tracking: `killSwitchTrips` counter per mode

**Usage**:
```typescript
// Trip kill switch
guardrailPolicy.tripKillSwitch('paper', 'Daily loss limit exceeded');

// Check status
const isTripped = guardrailPolicy.isKillSwitchTripped('paper');

// Reset
guardrailPolicy.resetKillSwitch('paper');
```

### 4. Conflict Detection

**Purpose**: Detects attempts to override LATTI-managed parameters without proper locking

**Detection Logic**:
```typescript
if (tuned_by_latti = true AND locked_by_user[param] = false) {
  // Conflict: User trying to override unlocked LATTI-managed param
  emit('guardrail.override.conflict')
}
```

## API Endpoints

### GET /api/guardrails-v2/effective?mode=paper|live

Returns computed effective guardrails with coherency status.

**Response**:
```json
{
  "ok": true,
  "data": {
    "mode": "paper",
    "portfolioRiskPerTradePct": 1.50,
    "symbolCooldownMinutes": 15,
    "maxOpenPositions": 5,
    "dailyLossKillSwitchPct": 7.00,
    "management": {
      "isManualOverride": false,
      "tunedByLatti": true,
      "lockedByUser": {}
    },
    "coherency": {
      "status": "PASS",
      "failures": [],
      "timestamp": "2025-10-28T16:00:00.000Z"
    },
    "killSwitchTripped": false
  }
}
```

### PUT /api/guardrails-v2?mode=paper|live

Enhanced with comprehensive GuardrailPolicy validation.

**Validation Flow**:
1. Parse incoming payload
2. Build validation payload with management flags
3. Call `guardrailPolicy.validate(payload)`
4. If status = FAIL → Return 400 with rule violations
5. If status = WARN → Log warnings, proceed
6. If status = PASS → Save to database

**Error Response (Validation Failure)**:
```json
{
  "ok": false,
  "code": "COHERENCY_VIOLATION",
  "failures": [
    {
      "ruleId": "RULE_001",
      "ruleName": "Risk ≤ KillSwitch/10",
      "severity": "error",
      "message": "Portfolio risk per trade (1.50%) cannot exceed 10% of daily loss kill switch (7.00%). Maximum allowed: 0.70%",
      "param": "portfolioRiskPerTradePct",
      "value": 1.50,
      "expected": "<= 0.70%"
    }
  ],
  "detail": "Portfolio risk per trade (1.50%) cannot exceed 10% of daily loss kill switch (7.00%). Maximum allowed: 0.70%"
}
```

### POST /api/guardrails-v2/kill-switch/trip?mode=paper|live

Trips the circuit breaker for a specific mode.

**Request**:
```json
{
  "reason": "Daily loss limit exceeded"
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "mode": "paper",
    "tripped": true,
    "reason": "Daily loss limit exceeded",
    "timestamp": "2025-10-28T16:00:00.000Z"
  }
}
```

### POST /api/guardrails-v2/kill-switch/reset?mode=paper|live

Resets the circuit breaker for a specific mode.

**Response**:
```json
{
  "ok": true,
  "data": {
    "mode": "paper",
    "tripped": false,
    "timestamp": "2025-10-28T16:00:00.000Z"
  }
}
```

## Telemetry & Events

### WebSocket Events

The GuardrailPolicy service broadcasts the following events via ContextBridge:

1. **guardrail.kill_switch.tripped**
   - Emitted when kill switch is activated
   - Payload: `{ mode, reason, timestamp, tripCount }`

2. **guardrail.kill_switch.reset**
   - Emitted when kill switch is reset
   - Payload: `{ mode, timestamp }`

3. **guardrail.override.conflict**
   - Emitted when override conflict detected
   - Payload: `{ mode, conflicts: string[], timestamp }`

4. **guardrail.policy.updated**
   - Emitted when guardrails are successfully updated
   - Payload: `{ mode, effectiveValues, coherency, timestamp }`

### Metrics Counters

```typescript
{
  ruleFailures: { [ruleId: string]: number },
  ruleWarnings: { [ruleId: string]: number },
  killSwitchTrips: { paper: number, live: number },
  overrideConflicts: { paper: number, live: number }
}
```

**Access via**:
```typescript
const metrics = guardrailPolicy.getMetrics();
```

## Runtime Integration (Planned)

### RiskManager

**Before (Legacy)**:
```typescript
const guardrails = await storage.getGuardrails({ mode });
const riskPct = parseFloat(guardrails.riskPerTrade);
```

**After (GuardrailPolicy)**:
```typescript
const guardrails = await storage.getGuardrailsV2({ mode });
const effective = guardrailPolicy.getEffective(guardrails);

// Check kill switch before trade execution
if (guardrailPolicy.isKillSwitchTripped(mode)) {
  console.log('[RiskManager] ⛔ Kill switch active - aborting trade');
  return { blocked: true, reason: 'Kill switch active' };
}

// Use effective values
const riskPct = effective.portfolioRiskPerTradePct;
```

### StrategyEngine / HeuristicTrader

**Usage**:
```typescript
// Get effective guardrails for order sizing
const guardrails = await storage.getGuardrailsV2({ mode });
const effective = guardrailPolicy.getEffective(guardrails);

// Respect cooldown
const cooldownMs = effective.symbolCooldownMinutes * 60 * 1000;

// Respect max positions
if (openPositions >= effective.maxOpenPositions) {
  return { blocked: true, reason: 'Max positions reached' };
}
```

### LATTI Manager

**Auto-Tuning with Locked Parameter Respect**:
```typescript
const guardrails = await storage.getGuardrailsV2({ mode });
const effective = guardrailPolicy.getEffective(guardrails);

// Skip locked parameters
const lockedParams = effective.management.lockedByUser;

if (lockedParams['portfolioRiskPerTradePct']) {
  console.log('[LATTI] Skipping portfolioRiskPerTradePct (locked by user)');
  guardrailPolicy.emitEvent('latti.autotune.skipped_locked', {
    mode,
    param: 'portfolioRiskPerTradePct',
    reason: 'Parameter locked by user'
  });
}

// Validate before applying adjustments
const proposed = { ...effective, portfolioRiskPerTradePct: newValue };
const coherency = guardrailPolicy.validate(proposed);

if (coherency.status === 'FAIL') {
  console.log('[LATTI] ⛔ Proposed adjustment fails coherency - aborting');
  guardrailPolicy.emitEvent('latti.autotune.blocked_by_policy', {
    mode,
    failures: coherency.failures,
    reason: 'Coherency validation failed'
  });
  return;
}
```

## Lifecycle

### Initialization
```typescript
// Service auto-loads coherency_rules.yaml on startup
const { guardrailPolicy } = await import('./services/guardrail-policy');
```

### Hot-Reload Rules
```typescript
// Manually reload coherency rules from file
guardrailPolicy.reloadRules();
```

### Policy Event Logging
```typescript
guardrailPolicy.logPolicyEvent({
  mode: 'paper',
  ruleId: 'RULE_001',
  param: 'portfolioRiskPerTradePct',
  oldValue: 1.50,
  newValue: 0.70,
  status: 'PASS',
  message: 'Risk reduced to comply with kill switch'
});
```

## Testing

### Unit Tests (Planned)
- Effective value resolution (manual vs Lottie) per-parameter
- RULE_001, RULE_003, RULE_006, RULE_007, RULE_008 validation
- RULE_005 exclusivity enforcement
- Kill switch tripping & readback

### API Tests (Planned)
- PUT reject on FAIL with rule details array
- GET /effective returns coherent structure & status
- Kill switch POST triggers state and event

### Integration Tests (Planned)
- Strategy sizing respects riskPct
- New trades blocked when kill switch tripped
- LATTI autotune skips locked params

## Migration Path

### From Legacy Guardrails
1. Read from `guardrails_v2` instead of `guardrails`
2. Call `guardrailPolicy.getEffective()` instead of direct DB read
3. Call `guardrailPolicy.validate()` before saving changes
4. Use `guardrailPolicy.isKillSwitchTripped()` before trade execution

### Removed Endpoints
- None (all endpoints additive, no breaking changes)

## Files Modified

- `server/services/guardrail-policy.ts` (NEW)
- `server/services/context-bridge.ts` (event types added)
- `server/routes.ts` (enhanced PUT, added GET /effective and POST /kill-switch)
- `audit/coherency_rules.yaml` (version 2.0, unchanged)

## Performance Considerations

- **Coherency rules** loaded once at startup, cached in memory
- **Hot-reload** available via `reloadRules()` without service restart
- **Validation** is synchronous, typically <1ms per call
- **Kill switch state** stored in-memory Map for instant access

## Future Enhancements (Phase 5+)

1. **Engine Integration**: Complete RiskManager, StrategyEngine, LATTI integrations
2. **Metrics Dashboard**: Real-time visualization of rule failures and kill switch events
3. **Rule Versioning**: Support multiple coherency rule versions
4. **Custom Rules**: User-defined validation rules via UI
5. **Audit Trail**: Database logging of all policy events for compliance

## Support & Troubleshooting

### Common Issues

**Q**: Validation fails with RULE_001 but values look correct?  
**A**: Remember RULE_001 is `risk ≤ killSwitch / 10`. If killSwitch = 7.00%, max risk = 0.70%, not 7.00%.

**Q**: Kill switch won't reset?  
**A**: Check if there's an active trade blocking reset. Kill switch reset requires manual intervention.

**Q**: LATTI keeps trying to adjust locked parameters?  
**A**: Ensure `locked_by_user` JSONB column is properly set in `guardrails_v2` table.

## References

- **Coherency Rules**: `audit/coherency_rules.yaml`
- **Schema**: `shared/schema.ts` (`guardrailsV2` table)
- **Phase 2 Docs**: `docs/schema_guardrails_v2_overview.md`
- **Phase 3 Docs**: `docs/manual_override_behavior.md`
- **Phase 4 Docs**: `docs/dashboard_integration_overview.md`
