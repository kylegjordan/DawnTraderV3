# Dashboard Integration Overview - Phase 4

## Summary
Phase 4 of the LATTi Goals + Guardrails Modernization integrates a unified dashboard widget displaying live guardrails, coherency status, and active preset configurations. This replaces the legacy `LATTIGoalsMirror` widget with a comprehensive, real-time view of the system's risk management state.

## Architecture

### Database Schema
**Table: `goals_presets`**
- Stores 4+1 presets per mode (Conservative, Baseline, Optimistic, Maximum, Custom)
- Each preset contains Core Four guardrail values + target daily goals
- `is_active` flag identifies the currently active preset per mode

**SQL View: `v_guardrails_compliance`**
- Real-time coherency analytics
- Calculates RULE_001 compliance: `portfolioRiskPerTradePct ≤ dailyLossKillSwitchPct / 10`
- Returns status: `PASS`, `WARN`, or `FAIL`

### Backend API Endpoints

#### GET /api/goals-presets?mode=paper|live
Fetches all available presets for the specified mode.

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "mode": "paper",
      "name": "baseline",
      "portfolioRiskPerTradePct": "1.50",
      "dailyLossKillSwitchPct": "7.00",
      "symbolCooldownMinutes": 15,
      "maxOpenPositions": 5,
      "tradesPerDayEst": "4.00",
      "targetDailyAvgEarningPct": "0.90",
      "isActive": true,
      "createdAt": "2025-10-28T...",
      "updatedAt": "2025-10-28T..."
    }
  ]
}
```

#### GET /api/goals-presets/active?mode=paper|live
Fetches the currently active preset for the specified mode.

**Response:**
```json
{
  "ok": true,
  "data": { /* preset object */ }
}
```

#### PUT /api/goals-presets/select
Applies a preset to the current mode's guardrails.

**Request Body:**
```json
{
  "mode": "paper",
  "presetName": "optimistic"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "preset": { /* preset object */ },
    "guardrails": { /* updated guardrails_v2 object */ }
  }
}
```

**Side Effects:**
1. Deactivates all presets for the mode
2. Activates the selected preset
3. Applies preset values to `guardrails_v2` table
4. Sets `tunedByLatti = true` for non-custom presets
5. Sets `isManualOverride = true` for custom preset
6. Broadcasts `goals_preset_changed` and `guardrails_v2_updated` WebSocket events

#### GET /api/analytics/guardrails-compliance?mode=paper|live
Fetches coherency status from the `v_guardrails_compliance` view.

**Response:**
```json
{
  "ok": true,
  "data": {
    "mode": "paper",
    "portfolio_risk_per_trade_pct": "1.50",
    "daily_loss_kill_switch_pct": "7.00",
    "max_open_positions": 5,
    "symbol_cooldown_minutes": 15,
    "coherency_status": "PASS",
    "is_manual_override": false,
    "tuned_by_latti": true,
    "locked_by_user": null,
    "last_updated": "2025-10-28T..."
  }
}
```

### Frontend Components

#### DashboardLATTiWidget
**Location:** `client/src/components/dashboard/dashboard-latti-widget.tsx`

**Features:**
- Displays Core Four guardrails with live values
- Shows coherency status badge (🟢 PASS / 🟡 WARN / 🔴 FAIL)
- Displays active preset name
- Shows control mode (LATTi Managed vs Manual Override)
- Displays Target Daily Goals from active preset
- Link to Goals Engine for configuration

**Data Sources:**
- `/api/guardrails-v2?mode={mode}` - Live guardrail values
- `/api/goals-presets/active?mode={mode}` - Active preset
- `/api/analytics/guardrails-compliance?mode={mode}` - Coherency status

**Position:** Second section on Dashboard, immediately after 4-widget overview

#### PresetsGrid
**Location:** `client/src/components/goals/presets-grid.tsx`

**Features:**
- 3-column grid layout (responsive: 1 col mobile, 2 cols tablet, 3 cols desktop)
- Visual preset cards with color-coded badges:
  - Conservative: Green
  - Baseline: Blue
  - Optimistic: Amber
  - Maximum: Red
  - Custom: Purple
- Active preset indicator (checkmark icon + border highlight)
- Per-preset display of Core Four + Target Goals
- "Apply Preset" button with mutation handling
- Real-time WebSocket sync via query invalidation

**Data Sources:**
- `/api/goals-presets?mode={mode}` - All presets

**Position:** Top of Goals Engine > Goals tab

## WebSocket Event Integration

### Broadcast Events
1. **`goals_preset_changed`**
   - Emitted when a preset is applied
   - Payload includes preset object, updated guardrails, userId, timestamp
   
2. **`guardrails_v2_updated`**
   - Emitted after preset application
   - Payload includes updated guardrails object

### Frontend Subscriptions
The dashboard widget and presets grid use React Query to automatically invalidate and refetch data when WebSocket events are received, ensuring <1 second latency for UI updates.

## Coherency Status Mapping

### Status Calculation (RULE_001)
```
PASS: portfolioRiskPerTradePct ≤ dailyLossKillSwitchPct / 10
WARN: portfolioRiskPerTradePct ≤ dailyLossKillSwitchPct / 5
FAIL: portfolioRiskPerTradePct > dailyLossKillSwitchPct / 5
```

### Visual Indicators
- **PASS:** 🟢 Green badge, normal operation
- **WARN:** 🟡 Amber badge, approaching risk limits
- **FAIL:** 🔴 Red badge, guardrails are incoherent

## Default Presets Configuration

### Paper Mode
| Preset | Risk/Trade % | Kill Switch % | Cooldown (min) | Max Positions | Target Earning % | Trades/Day |
|--------|--------------|---------------|----------------|---------------|------------------|------------|
| Conservative | 0.50 | 5.00 | 30 | 3 | 0.30 | 2.00 |
| **Baseline (Active)** | 1.50 | 7.00 | 15 | 5 | 0.90 | 4.00 |
| Optimistic | 2.50 | 10.00 | 10 | 8 | 1.80 | 6.00 |
| Maximum | 4.00 | 15.00 | 5 | 12 | 3.50 | 10.00 |
| Custom | 1.50 | 7.00 | 15 | 5 | 0.90 | 4.00 |

### Live Mode
| Preset | Risk/Trade % | Kill Switch % | Cooldown (min) | Max Positions | Target Earning % | Trades/Day |
|--------|--------------|---------------|----------------|---------------|------------------|------------|
| **Conservative (Active)** | 0.50 | 5.00 | 30 | 3 | 0.30 | 2.00 |
| Baseline | 1.50 | 7.00 | 15 | 5 | 0.90 | 4.00 |
| Optimistic | 2.50 | 10.00 | 10 | 8 | 1.80 | 6.00 |
| Maximum | 4.00 | 15.00 | 5 | 12 | 3.50 | 10.00 |
| Custom | 1.50 | 7.00 | 15 | 5 | 0.90 | 4.00 |

## User Experience Flow

1. **Dashboard View:**
   - User sees unified LATTi widget displaying current guardrails + coherency status
   - One-click access to Goals Engine via "Open Goals Engine" button
   
2. **Goals Engine - Presets Selection:**
   - User navigates to Goals Engine > Goals tab
   - Reviews all 5 available presets in grid layout
   - Compares Core Four values and Target Daily Goals
   - Clicks "Apply Preset" button
   
3. **Preset Application:**
   - Backend validates preset name and mode
   - Deactivates all presets for mode
   - Activates selected preset
   - Applies values to `guardrails_v2`
   - Broadcasts WebSocket events
   
4. **Real-Time Sync:**
   - Dashboard widget refreshes automatically (<1s latency)
   - Presets grid updates to show new active preset
   - Coherency status recalculates and displays
   
5. **Manual Override:**
   - User can select "Custom" preset for manual control
   - Sets `isManualOverride = true`
   - Disables LATTi autonomous tuning
   - Widget displays "Manual Override" badge

## Testing Checklist

### Backend Tests
- [x] GET /api/goals-presets returns all presets for mode
- [x] GET /api/goals-presets/active returns active preset
- [x] PUT /api/goals-presets/select applies preset correctly
- [x] GET /api/analytics/guardrails-compliance returns coherency status
- [x] WebSocket broadcasts sent after preset application

### Frontend Tests
- [ ] Dashboard widget displays Core Four values
- [ ] Dashboard widget shows coherency badge
- [ ] Dashboard widget displays active preset name
- [ ] Presets grid renders all 5 presets
- [ ] Preset application mutation succeeds
- [ ] Query invalidation triggers UI refresh
- [ ] WebSocket sync updates widgets in <1s

### Integration Tests
- [ ] Preset application updates guardrails_v2
- [ ] Coherency status calculation is accurate
- [ ] Manual override toggles correctly
- [ ] Mode switching preserves preset state

## Migration Notes

### Database Migration
Due to drizzle-kit JSON parsing bug ("RAY" token error), the schema was applied manually:

```sql
-- Create enum
CREATE TYPE goals_preset_name AS ENUM ('conservative', 'baseline', 'optimistic', 'maximum', 'custom');

-- Create table
CREATE TABLE goals_presets (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  mode trading_mode NOT NULL,
  name goals_preset_name NOT NULL,
  portfolio_risk_per_trade_pct DECIMAL(5, 2) NOT NULL,
  daily_loss_kill_switch_pct DECIMAL(5, 2) NOT NULL,
  symbol_cooldown_minutes INTEGER NOT NULL,
  max_open_positions INTEGER NOT NULL,
  trades_per_day_est DECIMAL(5, 2) NOT NULL,
  target_daily_avg_earning_pct DECIMAL(5, 2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique index
CREATE UNIQUE INDEX goals_presets_mode_name_idx ON goals_presets(mode, name);

-- Create SQL view
CREATE OR REPLACE VIEW v_guardrails_compliance AS
SELECT
  mode,
  portfolio_risk_per_trade_pct,
  daily_loss_kill_switch_pct,
  max_open_positions,
  symbol_cooldown_minutes,
  CASE
    WHEN portfolio_risk_per_trade_pct <= daily_loss_kill_switch_pct / 10 THEN 'PASS'
    WHEN portfolio_risk_per_trade_pct <= daily_loss_kill_switch_pct / 5 THEN 'WARN'
    ELSE 'FAIL'
  END AS coherency_status,
  is_manual_override,
  tuned_by_latti,
  locked_by_user,
  last_updated
FROM guardrails_v2;
```

### Legacy Component Removal
The `LATTIGoalsMirror` component was replaced but the component file still exists. Future cleanup:
- Remove `client/src/components/dashboard/latti-goals-mirror.tsx`
- Remove unused imports in `dashboard.tsx`

## Future Enhancements

1. **Preset Customization UI**
   - Allow users to create custom presets with specific values
   - Preset templates for different trading strategies
   
2. **Preset History & Rollback**
   - Track preset changes in audit log
   - One-click rollback to previous preset
   
3. **Coherency Alerts**
   - Auto-notify when coherency status = FAIL
   - Suggested corrective actions
   
4. **Preset Performance Analytics**
   - Track actual vs target performance per preset
   - LATTi learns optimal preset for user's trading style

## Documentation Cross-References
- Phase 2: `docs/schema_guardrails_v2_overview.md`
- Phase 3: `docs/manual_override_behavior.md`, `docs/ui_override_behavior.md`
- Coherency Rules: `audit/coherency_rules.yaml`
- Migration Checklist: `audit/migration_checklist.md`
