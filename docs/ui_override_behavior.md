# UI Override Behavior Documentation

**Phase 3b: Lottie-Managed Mode + Manual Override UI**

## Overview

This document describes the user interface behavior for the Lottie-Managed / Manual Override system in the Goals Engine. This system allows users to toggle between autonomous LATTi optimization and manual control for both Core Four Guardrails and Filter parameters.

## Architecture

### Components

1. **CoreFourGuardrails** (`client/src/components/goals/core-four-guardrails.tsx`)
   - Displays the four critical risk parameters: Portfolio Risk per Trade %, Symbol Cooldown, Max Open Positions, and Daily Loss Kill Switch %
   - Integrates with `/api/guardrails-v2` backend endpoint
   - Provides per-parameter lock/unlock toggles

2. **FiltersWithOverride** (`client/src/components/goals/filters-with-override.tsx`)
   - Displays all 16 filter parameters grouped by category
   - Integrates with `/api/filters-v2` backend endpoint
   - Provides per-filter Lottie/Manual checkboxes

3. **useOverrideState** (`client/src/hooks/use-override-state.tsx`)
   - Custom React hook for WebSocket subscription and cache invalidation
   - Listens for `guardrail.override.changed` and `filters.override.changed` events
   - Automatically invalidates React Query caches for sub-1-second UI updates

### Data Flow

```
User Action (Toggle Switch/Checkbox)
    ↓
React Component State Update
    ↓
PUT Request to Backend (/api/guardrails-v2 or /api/filters-v2)
    ↓
Backend Updates Database + Broadcasts WebSocket Event
    ↓
useOverrideState Hook Receives Event
    ↓
React Query Cache Invalidated
    ↓
Component Re-renders with Fresh Data
```

## User Interface Behavior

### Core Four Guardrails

#### Toggle Flow (Locked/Unlocked)

Each Core Four parameter has a **Switch toggle** that controls whether it's managed by LATTi or manually controlled:

- **Switch OFF (Left Position)** = LATTi Managed 🔒
  - Parameter is automatically optimized by LATTi
  - Input field is disabled and shows current LATTi-calculated value
  - Green lock icon displayed
  - Badge: "Auto-tuned by LATTi" (green)

- **Switch ON (Right Position)** = Manual Override 🔓
  - User has full control over the parameter
  - Input field is enabled for editing
  - Amber unlock icon displayed
  - Badge: "Manual Override Active" (amber)

#### Visual Language

| State | Icon | Badge | Input Field |
|-------|------|-------|-------------|
| LATTi Managed | 🔒 Green Lock | "Auto-tuned by LATTi" | Disabled (gray background) |
| Manual Override | 🔓 Amber Unlock | "Manual Override Active" | Enabled (white background) |

#### Save Workflow

1. User toggles parameter to Manual Override (switch ON)
2. Toast notification: "Manual Override Activated"
3. Input field becomes editable
4. User modifies value
5. "Save Changes" button appears
6. User clicks Save
7. PUT request sent to `/api/guardrails-v2`
8. Success toast: "Core Four Guardrails updated"
9. WebSocket broadcast triggers cache refresh

### Filters Automation Control

#### Toggle Flow

Each filter parameter has a **Checkbox** labeled "Managed by LATTi":

- **Checkbox CHECKED** = LATTi Managed
  - Filter automatically optimized
  - Badge: "🟢 Auto (LATTi)" (green)
  - Input field displays current value (read-only)

- **Checkbox UNCHECKED** = Manual Control
  - User controls filter value in Screener Filters tab
  - Badge: "🟡 Manual" (amber)
  - Input field displays current value (read-only)

#### Status Badges

- **🟢 Auto (LATTi)**: Filter is being automatically tuned by LATTi based on market conditions
- **🟡 Manual**: Filter value is manually set and will not be changed by LATTi

#### Category Grouping

Filters are organized into visual categories with color coding:

| Category | Icon | Color |
|----------|------|-------|
| Volume & Liquidity | 💧 | Blue |
| Price Range | 💰 | Green |
| Market Quality | ⭐ | Purple |
| Technical Indicators | 📊 | Orange |
| Volatility | 📈 | Yellow |
| Asset Type | 🏷️ | Red |

## Error Handling

### RULE_005 Conflict

**Rule**: `is_manual_override` and `tuned_by_latti` cannot both be true simultaneously.

**UI Behavior:**
- If backend returns RULE_005 violation error
- Error toast displayed with detailed message
- Toggle switch/checkbox reverts to previous state
- User must resolve conflict before proceeding

**Example Error Message:**
```
Error: RULE_005 violation
Manual override and LATTi tuning cannot both be active.
Please choose one control mode.
```

### Network Errors

- If API request fails, error toast is displayed
- Component state is not updated
- User can retry the action
- Previous values are preserved

### WebSocket Disconnection

- useOverrideState hook automatically reconnects (exponential backoff)
- UI continues to function but may show stale data
- Connection status can be monitored via WebSocket hook

## Real-Time Synchronization

### WebSocket Events

The system broadcasts the following events:

1. **`guardrail.override.changed`**
   - Triggered when any Core Four parameter lock state changes
   - Payload includes `mode` (paper/live) and updated guardrail data
   - All connected clients receive update within 1 second

2. **`filters.override.changed`**
   - Triggered when any filter's Lottie/Manual state changes
   - Payload includes `mode` and updated filter data
   - All connected clients receive update within 1 second

3. **`config_update`**
   - Generic config change event (backward compatibility)
   - Includes `configType` field (guardrails_v2 or filters_v2)

### Cache Invalidation

When a WebSocket event is received, `useOverrideState` automatically invalidates the following React Query caches:

- `/api/guardrails-v2` (for guardrail changes)
- `/api/filters-v2` (for filter changes)
- Backward compatibility caches: `/api/guardrails`, `/api/screeners`

**Cache Refetch Strategy:**
- `refetchType: 'all'` ensures all queries are refreshed, even inactive tabs
- `staleTime: Infinity` in queries ensures data is only updated via invalidation

## User Experience Guidelines

### When to Use Manual Override (Guardrails)

✅ **Good Use Cases:**
- Testing specific risk parameters during paper trading
- Temporarily tightening controls during volatile markets
- Overriding a single parameter while keeping others auto-tuned

❌ **Avoid:**
- Setting all parameters to manual override (defeats LATTi's purpose)
- Frequent toggling (creates operational overhead)
- Using manual mode without understanding parameter impact

### When to Use Manual Control (Filters)

✅ **Good Use Cases:**
- Focusing on specific asset classes (e.g., only BTC/ETH)
- Testing conservative filter thresholds
- Temporarily excluding certain market conditions

❌ **Avoid:**
- Manually setting all 16 filters (reduces opportunity discovery)
- Contradictory filter combinations (e.g., minPrice > maxPrice)

## Accessibility

- All toggles have descriptive labels and tooltips
- Keyboard navigation supported (Tab/Space/Enter)
- ARIA labels for screen readers
- Color is not the only indicator of state (icons + text used)
- High contrast mode compatible

## Testing

### Manual UI Testing

1. **Toggle Lock State**
   - Navigate to Goals Engine > Guardrails tab
   - Toggle a Core Four parameter switch
   - Verify input field enables/disables
   - Verify badge updates
   - Verify toast notification appears

2. **Save Changes**
   - Enable manual override
   - Modify parameter value
   - Click "Save Changes"
   - Verify success toast
   - Verify new value persists after refresh

3. **Real-Time Sync**
   - Open two browser windows
   - Toggle a parameter in Window 1
   - Verify Window 2 updates within 1 second
   - Check WebSocket logs for event broadcast

4. **Filter Toggle**
   - Navigate to Goals Engine > Screeners tab
   - Toggle "Managed by LATTi" checkbox
   - Verify badge changes (Auto ↔ Manual)
   - Verify success toast
   - Verify state persists

### Automated Testing

See `tests/ui/guardrails_controls.test.tsx` and `tests/ui/filters_controls.test.tsx` for Playwright test suites.

**Test Coverage:**
- Toggle state transitions
- API request/response handling
- Error handling (RULE_005, network errors)
- WebSocket event reception
- Cache invalidation timing

## Technical Reference

### API Endpoints

- **GET /api/guardrails-v2?mode=paper|live**
  - Returns Core Four guardrails with `lockedByUser` state
  
- **PUT /api/guardrails-v2?mode=paper|live**
  - Accepts partial updates: `{ lockedByUser: { symbolCooldownMinutes: true } }`
  - Emits `guardrail.override.changed` WebSocket event

- **GET /api/filters-v2?mode=paper|live**
  - Returns all 16 filters with `managedByLottie` and `manualOverrideEnabled` flags

- **PUT /api/filters-v2?mode=paper|live**
  - Accepts: `{ filterName: string, manualOverrideEnabled: boolean }`
  - Emits `filters.override.changed` WebSocket event

### React Query Keys

```typescript
// Guardrails V2
['/api/guardrails-v2', mode]

// Filters V2
['/api/filters-v2', mode]
```

### TypeScript Interfaces

```typescript
// Core Four Guardrails
interface GuardrailsV2 {
  mode: string;
  portfolioRiskPerTradePct: number;
  symbolCooldownMinutes: number;
  maxOpenPositions: number;
  dailyLossKillSwitchPct: number;
  isManualOverride: boolean;
  tunedByLatti: boolean;
  lockedByUser: Record<string, boolean>;
}

// Filters
interface FilterV2 {
  name: string;
  value: number;
  managedByLottie: boolean;
  manualOverrideEnabled: boolean;
  displayName: string;
  category: string;
}
```

## Migration Notes

### Backward Compatibility

- Old `/api/guardrails` endpoint remains functional for legacy parameters
- Old `/api/screeners` endpoint remains functional for filter values
- New components are added **alongside** existing tabs, not replacing them
- Users can continue using old guardrails while transitioning to Core Four

### Deprecation Timeline

- **Phase 3b (Current)**: Both old and new systems coexist
- **Phase 4 (Future)**: Migrate remaining guardrail parameters to V2 schema
- **Phase 5 (Future)**: Deprecate old endpoints

## Related Documentation

- `docs/manual_override_behavior.md` - Backend behavior specification
- `audit/coherency_rules.yaml` - Validation rules (RULE_001, RULE_005, etc.)
- `docs/schema_guardrails_v2_overview.md` - Database schema documentation
- `audit/migration_checklist.md` - Phase 2/3 migration tracking

## Support

For issues or questions:
1. Check browser console for WebSocket connection status
2. Verify backend `/api/guardrails-v2` endpoint is accessible
3. Review coherency rule validation logs
4. Check telemetry broadcasts in backend logs
