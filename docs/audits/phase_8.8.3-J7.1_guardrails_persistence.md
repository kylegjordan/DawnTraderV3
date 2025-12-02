# Phase 8.8.3-J7.1: Guardrails Persistence & Sizing Consistency Audit

## Date: 2025-12-02

## Overview
This audit documents the investigation and fix for guardrails persistence issues where manual mode values were silently reverting after save.

---

## 1. Root Cause Analysis

### Symptoms
- Changing "Portfolio Risk per Trade %" from 3 to another value → field reverts to 3
- Changing "Max Position Percent %" from 30 to another value → field reverts to 30
- Changing Low Price Coin Protection threshold from 0.50 to 0.075 → field reverts to 0.50
- Toggle was on Manual mode, but values still reverted

### Root Cause Identified
The **PUT /api/guardrails-v2** endpoint in `server/routes.ts` was **missing field extraction** for:
1. `maxPositionPercentPct` (5th core guardrail)
2. `lowPriceThreshold` (LPCP threshold)
3. `lowPriceMinStopAtrMult` (LPCP min stop ATR multiple)
4. `lowPriceMinPositionNotional` (LPCP min notional)

The endpoint only extracted and processed these fields:
- `portfolioRiskPerTradePct` ✓
- `symbolCooldownMinutes` ✓
- `maxOpenPositions` ✓
- `dailyLossKillSwitchPct` ✓
- `isManualOverride` ✓
- `tunedByLatti` ✓
- `lockedByUser` ✓

Similarly, `storage.ts::upsertGuardrailsV2()` was missing these fields in its merge logic.

---

## 2. Source of Truth Mapping

### Database Schema: `guardrails_v2` table (shared/schema.ts)

| Field | Column | Type | Default |
|-------|--------|------|---------|
| portfolioRiskPerTradePct | portfolio_risk_per_trade_pct | decimal(5,2) | 1.50 |
| symbolCooldownMinutes | symbol_cooldown_minutes | integer | 15 |
| maxOpenPositions | max_open_positions | integer | 5 |
| dailyLossKillSwitchPct | daily_loss_kill_switch_pct | decimal(5,2) | 7.00 |
| maxPositionPercentPct | max_position_percent_pct | decimal(5,2) | 30.00 |
| lowPriceThreshold | low_price_threshold | decimal(10,4) | 0.5000 |
| lowPriceMinStopAtrMult | low_price_min_stop_atr_mult | decimal(6,3) | 3.000 |
| lowPriceMinPositionNotional | low_price_min_position_notional | decimal(12,2) | 25.00 |
| isManualOverride | is_manual_override | boolean | false |
| tunedByLatti | tuned_by_latti | boolean | true |
| lockedByUser | locked_by_user | jsonb | {} |

### API Endpoints

| Operation | Endpoint | Handler |
|-----------|----------|---------|
| Read | GET /api/guardrails-v2?mode=paper\|live | routes.ts line 1321 |
| Write | PUT /api/guardrails-v2?mode=paper\|live | routes.ts line 1346 |

### LATTi vs Manual Logic
- `isManualOverride: boolean` - true = user controls all parameters
- `tunedByLatti: boolean` - true = LATTi can adjust parameters
- `lockedByUser: Record<string, boolean>` - Per-parameter lock status

LATTi only overwrites values when:
1. `isManualOverride` is false AND
2. `tunedByLatti` is true AND
3. The specific parameter is not in `lockedByUser` map

In the bug scenario, LATTi was **NOT** overwriting - the values simply weren't being extracted from the request body.

---

## 3. Fix Applied

### Changes to `server/routes.ts` (PUT /api/guardrails-v2)

**Added field extraction (lines 1402-1417):**
```typescript
const maxPositionPercentPct = rawPayload.maxPositionPercentPct !== undefined
  ? parseFloat(String(rawPayload.maxPositionPercentPct))
  : undefined;

const lowPriceThreshold = rawPayload.lowPriceThreshold !== undefined
  ? parseFloat(String(rawPayload.lowPriceThreshold))
  : undefined;
const lowPriceMinStopAtrMult = rawPayload.lowPriceMinStopAtrMult !== undefined
  ? parseFloat(String(rawPayload.lowPriceMinStopAtrMult))
  : undefined;
const lowPriceMinPositionNotional = rawPayload.lowPriceMinPositionNotional !== undefined
  ? parseFloat(String(rawPayload.lowPriceMinPositionNotional))
  : undefined;
```

**Added to validation payload (lines 1428-1431):**
```typescript
if (maxPositionPercentPct !== undefined) validationPayload.maxPositionPercentPct = maxPositionPercentPct;
if (lowPriceThreshold !== undefined) validationPayload.lowPriceThreshold = lowPriceThreshold;
if (lowPriceMinStopAtrMult !== undefined) validationPayload.lowPriceMinStopAtrMult = lowPriceMinStopAtrMult;
if (lowPriceMinPositionNotional !== undefined) validationPayload.lowPriceMinPositionNotional = lowPriceMinPositionNotional;
```

**Added to update payload (lines 1474-1477):**
```typescript
if (maxPositionPercentPct !== undefined) updatePayload.maxPositionPercentPct = String(maxPositionPercentPct);
if (lowPriceThreshold !== undefined) updatePayload.lowPriceThreshold = String(lowPriceThreshold);
if (lowPriceMinStopAtrMult !== undefined) updatePayload.lowPriceMinStopAtrMult = String(lowPriceMinStopAtrMult);
if (lowPriceMinPositionNotional !== undefined) updatePayload.lowPriceMinPositionNotional = String(lowPriceMinPositionNotional);
```

**Added audit logging for new fields (lines 1538-1581).**

### Changes to `server/storage.ts` (upsertGuardrailsV2)

**Added field merge logic (lines 796-800):**
```typescript
maxPositionPercentPct: data.maxPositionPercentPct ?? existing.maxPositionPercentPct,
lowPriceThreshold: data.lowPriceThreshold ?? existing.lowPriceThreshold,
lowPriceMinStopAtrMult: data.lowPriceMinStopAtrMult ?? existing.lowPriceMinStopAtrMult,
lowPriceMinPositionNotional: data.lowPriceMinPositionNotional ?? existing.lowPriceMinPositionNotional,
```

---

## 4. J7 Sizing Helper Alignment Check

### Fields Read by sizePaperPositionForSignal()

| Field | Source | Line |
|-------|--------|------|
| portfolioRiskPerTradePct | guardrails.portfolioRiskPerTradePct | paper-position-sizing.ts:86 |
| maxPositionPercentPct | guardrails.maxPositionPercentPct | paper-position-sizing.ts:87 |

The sizing helper reads these values from the `guardrails` object passed via `cycleContext`.

### Guardrails Loading (paper-execution-engine.ts)

```typescript
// Line 387: Load guardrails once per cycle
paperGuardrails = await storage.getGuardrailsV2({ mode: 'paper' }) || null;
```

This now reads the **fixed, persisted values** from the database.

### No Fallbacks Found

Verified no $50k or other hardcoded fallbacks in:
- `paper-position-sizing.ts` - Uses 1.50% and 10.00% only as safe defaults when guardrails are null/invalid
- `trade-safety.ts` - Uses skip logic when portfolioValue is invalid (J7 change)
- `paper-execution-engine.ts` - No hardcoded portfolio values

---

## 5. LPCP Threshold Consistency

### Where LPCP Threshold is Read

| Location | Field Used | Source |
|----------|------------|--------|
| Guardrails UI | lowPriceThreshold | GET /api/guardrails-v2 |
| trade-safety.ts | lpcpLowPriceThresholdUsd | TradingSettings (NOT guardrails_v2) |

**Current Status:** The LPCP check in `trade-safety.ts` reads from `TradingSettings.lpcpLowPriceThresholdUsd` with a fallback of 0.50, NOT from `guardrails_v2.lowPriceThreshold`.

**Per J7.1 Spec:** This is acceptable for J7.1. LPCP-specific sizing tweaks will be addressed in a later J phase.

**Note:** The sizing helper (`paper-position-sizing.ts`) does NOT currently use LPCP threshold for any behavior.

---

## 6. Engine-Gated Metrics Verification

### logExecutionAttempt() Gating

```typescript
// paper-execution-engine.ts lines 1190-1195
private async logExecutionAttempt(audit: ...): Promise<void> {
  if (!this.isRunning) {
    console.log(`[8.8.3-J7][AUDIT_SKIP] Engine not running - skipping execution audit for ${audit.symbol}`);
    return;
  }
  // ... actual logging
}
```

**Status:** No regression. RTB metrics only accumulate while trading is ACTIVE.

### Affected Endpoints (No Changes)

- `/api/metrics/rtb-summary` - Unchanged
- `/api/metrics/rtb-blocked-summary` - Unchanged
- `/api/metrics/rtb-opened-summary` - Unchanged

---

## 7. Test Results

### Guardrails Edit & Persistence Test

1. **Before Fix (Database State):**
   - portfolioRiskPerTradePct: 3.00
   - maxPositionPercentPct: 30.00
   - lowPriceThreshold: 0.5000

2. **Test API Request:**
   ```bash
   PUT /api/guardrails-v2?mode=paper
   {
     "portfolioRiskPerTradePct": 2.5,
     "maxPositionPercentPct": 10.0,
     "lowPriceThreshold": 0.075
   }
   ```

3. **After Fix (Database State):**
   - portfolioRiskPerTradePct: 2.50 ✓
   - maxPositionPercentPct: 10.00 ✓
   - lowPriceThreshold: 0.0750 ✓

4. **Reload Verification:** GET request returns persisted values correctly.

### No Legacy Re-enablement

Confirmed no new references added to:
- risk-manager.ts legacy methods
- Old getSettings() patterns
- Pre-guardrails modules

---

## 8. Summary

| Issue | Resolution |
|-------|------------|
| Values snap back after save | Fixed - missing field extraction in PUT handler |
| maxPositionPercentPct not saving | Added to routes.ts and storage.ts |
| lowPriceThreshold not saving | Added to routes.ts and storage.ts |
| J7 sizing uses wrong values | N/A - already reads from guardrails object |
| Engine-gated metrics | No regression confirmed |

**Files Changed:**
- `server/routes.ts` - Added field extraction, validation, update payload, and audit logging
- `server/storage.ts` - Added field merge in upsertGuardrailsV2

**Phase Status:** Complete
