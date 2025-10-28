# Manual Override Behavior Guide - Phase 3

## Overview
This document describes the behavior and interaction model for the **Lottie-Managed vs Manual Override UI** control system introduced in Phase 3 of the LATTi Goals + Guardrails Modernization initiative.

## Purpose
The manual override system allows users to:
1. **Toggle control authority** between LATTi's autonomous optimization (default) and manual user control
2. **Lock/unlock individual parameters** to prevent LATTi from modifying specific guardrail values
3. **Maintain full transparency** about who/what last modified each setting

## Control Hierarchy

### Guardrails (Core Four)
Each guardrail parameter can have three control states:

| Control State | Description | UI Behavior | LATTi Behavior |
|--------------|-------------|-------------|----------------|
| **Lottie-Managed** (default) | LATTi has full control | Toggle switch OFF, values auto-update from LATTi | Can modify value freely via tuning policy |
| **Manual Override (Global)** | User has full control over ALL parameters | Toggle switch ON, all values editable | Cannot modify ANY parameters |
| **Manual Override (Per-Parameter Lock)** | User locks specific parameters only | Individual lock icons ON | Can modify unlocked parameters only |

### Filters (Universe & Signal Controls)
Each filter can be toggled between:

| Control State | Description | UI Behavior | LATTi Behavior |
|--------------|-------------|-------------|----------------|
| **Lottie-Managed** | LATTi manages the filter threshold | Toggle switch OFF, value auto-updates | Can modify value via optimization runs |
| **Manual Override** | User sets the filter threshold | Toggle switch ON, value locked from LATTi | Cannot modify this specific filter |

## Database Schema

### guardrails_v2 Table
```sql
-- Global override flag (applies to all parameters)
is_manual_override BOOLEAN DEFAULT FALSE

-- LATTi tuning flag (cannot be true if is_manual_override is true)
tuned_by_latti BOOLEAN DEFAULT FALSE

-- Per-parameter locks (JSONB object tracking individual parameter overrides)
-- Example: {"portfolioRiskPerTradePct": true, "symbolCooldownMinutes": false}
locked_by_user JSONB DEFAULT '{}'::jsonb
```

**Important:** The `locked_by_user` column stores a JSON object where:
- Keys = parameter names (camelCase: `portfolioRiskPerTradePct`, `symbolCooldownMinutes`, etc.)
- Values = boolean (true = locked by user, false or absent = not locked)

### screener_filters Table
- **No schema changes in Phase 3** - control metadata is computed on-the-fly in the `/api/filters-v2` endpoint
- Future phases may add `managed_by_lottie JSONB` column for persistent storage

## API Endpoints

### GET /api/guardrails-v2?mode=paper|live
Returns guardrails with control state:
```json
{
  "ok": true,
  "data": {
    "mode": "paper",
    "portfolioRiskPerTradePct": "0.60",
    "symbolCooldownMinutes": 10,
    "maxOpenPositions": 6,
    "dailyLossKillSwitchPct": "7.00",
    "isManualOverride": false,
    "tunedByLatti": true,
    "lockedByUser": {
      "portfolioRiskPerTradePct": false,
      "symbolCooldownMinutes": true
    }
  }
}
```

### PUT /api/guardrails-v2?mode=paper|live
Supports partial updates including:
- **Core Four values** (portfolioRiskPerTradePct, symbolCooldownMinutes, maxOpenPositions, dailyLossKillSwitchPct)
- **Control flags** (isManualOverride, tunedByLatti)
- **Per-parameter locks** (lockedByUser as JSONB object)

**Example: Toggle global manual override**
```json
{
  "isManualOverride": true,
  "tunedByLatti": false
}
```

**Example: Lock specific parameter**
```json
{
  "lockedByUser": {
    "portfolioRiskPerTradePct": true,
    "symbolCooldownMinutes": true
  }
}
```

**Telemetry Event:** When `isManualOverride` or `lockedByUser` changes, the endpoint broadcasts:
```javascript
{
  type: 'guardrail.override.changed',
  mode: 'paper',
  payload: {
    isManualOverride: true,
    tunedByLatti: false,
    lockedByUser: { ... },
    changedBy: userId,
    timestamp: "2025-10-28T..."
  }
}
```

### GET /api/filters-v2?mode=paper|live
Returns filters with control metadata:
```json
{
  "ok": true,
  "data": {
    "mode": "paper",
    "filters": {
      "minVolume": {
        "value": 500000,
        "managedByLottie": true,
        "manualOverrideEnabled": false,
        "displayName": "Min Volume ($)",
        "category": "Volume & Liquidity"
      },
      // ... 15 more filters
    },
    "lastUpdated": "2025-10-28T..."
  }
}
```

### PUT /api/filters-v2?mode=paper|live
**Phase 3 Status:** Stub endpoint for future implementation
- Currently returns success message but does NOT persist changes
- Will support toggle updates in Phase 3b (UI integration)

## Coherency Rules

### RULE_001: Risk ≤ Kill Switch / 10
- **Validation:** `portfolioRiskPerTradePct` must not exceed `dailyLossKillSwitchPct / 10`
- **Enforced in:** `/api/guardrails-v2` PUT endpoint
- **Error Response:**
```json
{
  "ok": false,
  "code": "COHERENCY_VIOLATION",
  "rule": "RULE_001",
  "detail": "Portfolio risk per trade (0.80%) cannot exceed 10% of daily loss kill switch (7.00%). Maximum allowed: 0.70%"
}
```

### RULE_005: Manual Override Exclusivity
- **Validation:** `isManualOverride` and `tunedByLatti` cannot both be `true`
- **Enforced in:** `/api/guardrails-v2` PUT endpoint
- **Error Response:**
```json
{
  "ok": false,
  "code": "COHERENCY_VIOLATION",
  "rule": "RULE_005",
  "detail": "Conflicting control flags: is_manual_override and tuned_by_latti cannot both be true"
}
```

## UI Implementation (Phase 3b - Deferred)

### Guardrails Tab (guardrails-tab.tsx)
**Planned Components:**
1. **Global Toggle Switch** - "Lottie-Managed vs Manual Override"
   - When OFF (Lottie-Managed): All parameters show auto-update badges, lock icons disabled
   - When ON (Manual Override): All parameters editable, lock icons enabled
   
2. **Per-Parameter Lock Icons** - Individual padlock icons next to each guardrail
   - Only enabled when `isManualOverride = false` (Lottie-Managed mode)
   - Clicking sets `lockedByUser[parameterName] = true`
   - Shows badge "Locked by User" when active

3. **Last Modified Badge** - Shows "Auto-tuned by LATTi" or "Manual Override Active"
   - Updates based on `tunedByLatti` and `isManualOverride` flags

### Filters Tab (TBD)
- Similar toggle pattern for individual filter thresholds
- Category-based grouping (Volume & Liquidity, Price Range, Risk & Volatility, etc.)
- Lock/unlock individual filters while keeping others under LATTi control

## Behavior Scenarios

### Scenario 1: Enable Global Manual Override
**User Action:** Toggle "Lottie-Managed" switch to "Manual Override"

**Backend:**
1. PUT `/api/guardrails-v2?mode=paper` with `{ isManualOverride: true, tunedByLatti: false }`
2. Validates RULE_005 (coherency check)
3. Updates database
4. Broadcasts `guardrail.override.changed` event
5. Invalidates config caches

**Frontend:**
1. All guardrail inputs become editable
2. Badge changes to "Manual Override Active"
3. Lock icons become inactive (global override takes precedence)

**LATTi Behavior:**
- Stops all autonomous tuning for this mode
- Does not modify any guardrail values until override is disabled

### Scenario 2: Lock Single Parameter (Symbol Cooldown)
**User Action:** Click lock icon next to "Symbol Cooldown (minutes)"

**Backend:**
1. PUT `/api/guardrails-v2?mode=paper` with `{ lockedByUser: { "symbolCooldownMinutes": true } }`
2. Updates `locked_by_user` JSONB column
3. Broadcasts `guardrail.override.changed` event

**Frontend:**
1. Lock icon becomes solid/filled
2. Badge appears: "Locked by User"
3. Other parameters remain under LATTi control

**LATTi Behavior:**
- Continues tuning other three guardrails (Risk, Positions, Kill Switch)
- Skips Symbol Cooldown during optimization runs
- Respects locked value in all calculations

### Scenario 3: Violation - Set Risk Too High
**User Action:** Tries to set Portfolio Risk = 1.0% while Kill Switch = 7%

**Backend:**
1. PUT `/api/guardrails-v2?mode=paper` with `{ portfolioRiskPerTradePct: 1.0 }`
2. Validates RULE_001: 1.0% > (7.0% / 10) = 0.7%
3. Returns 400 error with `COHERENCY_VIOLATION` code

**Frontend:**
1. Displays error toast: "Portfolio risk per trade (1.00%) cannot exceed 10% of daily loss kill switch (7.00%). Maximum allowed: 0.70%"
2. Input field shows validation error
3. Does not update value

**User Resolution:**
- Either lower Risk to ≤ 0.7%, OR
- Raise Kill Switch to ≥ 10% (to allow 1.0% risk)

## WebSocket Integration

### Real-Time Updates
The system broadcasts config changes via WebSocket to ensure all connected clients stay synchronized:

**Event Types:**
- `guardrails_v2_updated` - Broadcasted on every guardrails save (value or control changes)
- `guardrail.override.changed` - Broadcasted specifically when override state changes

**Frontend Subscription Pattern:**
```typescript
useEffect(() => {
  const handleGuardrailUpdate = (data) => {
    if (data.mode === currentMode) {
      queryClient.invalidateQueries(['/api/guardrails-v2', currentMode]);
    }
  };

  // Subscribe to WebSocket events
  ws.on('guardrails_v2_updated', handleGuardrailUpdate);
  ws.on('guardrail.override.changed', handleGuardrailUpdate);

  return () => {
    ws.off('guardrails_v2_updated', handleGuardrailUpdate);
    ws.off('guardrail.override.changed', handleGuardrailUpdate);
  };
}, [currentMode]);
```

## Testing Checklist

### Backend API Tests
- [x] GET `/api/guardrails-v2` returns `lockedByUser` field
- [x] PUT `/api/guardrails-v2` accepts partial `lockedByUser` updates
- [x] PUT broadcasts `guardrail.override.changed` event when override state changes
- [x] RULE_001 validation rejects risk > kill switch / 10
- [x] RULE_005 validation rejects conflicting control flags
- [ ] GET `/api/filters-v2` returns all 16 filters with control metadata
- [ ] PUT `/api/filters-v2` stub returns success message (Phase 3b will implement persistence)

### Frontend UI Tests (Phase 3b - Deferred)
- [ ] Global toggle switch updates `isManualOverride` and `tunedByLatti`
- [ ] Lock icons update `lockedByUser[parameterName]`
- [ ] Validation errors display coherency rule violations
- [ ] WebSocket events trigger cache invalidation and UI refresh
- [ ] Badges reflect current control state correctly

### Integration Tests
- [ ] Changing from Lottie-Managed to Manual Override stops LATTi tuning
- [ ] Locking a single parameter allows LATTi to tune others
- [ ] Unlocking a parameter re-enables LATTi tuning for that parameter
- [ ] Mode switching (paper ↔ live) preserves control state per mode

## Phase 3 Status

### ✅ Completed (Phase 3a - Backend)
- [x] `locked_by_user` JSONB column added to `guardrails_v2` table
- [x] `filters_v2` TypeScript schema with control metadata flags
- [x] GET `/api/guardrails-v2` returns `lockedByUser`
- [x] PUT `/api/guardrails-v2` supports `lockedByUser` partial updates
- [x] PUT `/api/guardrails-v2` broadcasts `guardrail.override.changed` telemetry event
- [x] GET `/api/filters-v2` returns filters with control metadata
- [x] PUT `/api/filters-v2` stub endpoint (returns success, no persistence yet)
- [x] Coherency validation enforced (RULE_001, RULE_005)
- [x] Documentation created (`manual_override_behavior.md`)

### 📋 Deferred (Phase 3b - UI Implementation)
- [ ] Update `guardrails-tab.tsx` with global toggle switch
- [ ] Add per-parameter lock icons to guardrails UI
- [ ] Implement filter toggle switches in filters tab
- [ ] Add badges for "Auto-tuned by LATTi" vs "Manual Override Active"
- [ ] Wire up WebSocket subscriptions for real-time updates
- [ ] Implement `PUT /api/filters-v2` persistence logic

## References
- **Coherency Rules:** `audit/coherency_rules.yaml`
- **Schema Documentation:** `docs/schema_guardrails_v2_overview.md`
- **Migration Checklist:** `audit/migration_checklist.md`
- **Database Schema:** `audit/schema_guardrails_v2.sql`
- **Project Documentation:** `replit.md`
