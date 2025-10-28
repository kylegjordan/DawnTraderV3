# Guardrails V2 Schema Overview

## Purpose

The `guardrails_v2` table is the **single source of truth** for the Core Four guardrails that govern risk management across The Dawn Trader application. This schema replaces the fragmented legacy approach (guardrails + trading_settings + tuning_policy) with a unified, percent-based, mode-global design.

## Core Principles

1. **Mode-Global Architecture**: One record per mode (paper/live), shared by ALL users
2. **Percent-Based Values**: All risk metrics expressed as % of portfolio equity (no absolute dollars)
3. **Core Four Focus**: Only essential guardrails visible in UI, advanced params managed by LATTI
4. **Single Source of Truth**: Eliminates duplication and sync conflicts from Phase 1 audit

## Table Structure

### Primary Key & Mode Isolation

```typescript
id: varchar (UUID)              // Primary key
mode: trading_mode_enum         // 'paper' | 'live' (UNIQUE)
```

**Unique Constraint**: `UNIQUE (mode)` ensures exactly one record per mode.

### Core Four Guardrails

#### 1. Portfolio Risk per Trade (%)

```typescript
portfolio_risk_per_trade_pct: decimal(5,2)  // Range: 0.10% - 5.00%, Default: 1.50%
```

**Definition**: Percentage of total portfolio value risked on each individual trade.

**Example**: 
- Portfolio: $10,000
- Risk per trade: 0.90%
- Dollar risk: $90 per trade

**Why Percent-Based**: 
- Scales automatically with portfolio growth
- Consistent across all account sizes
- No manual recalculation needed

**Coherency Rule**: `portfolio_risk_per_trade_pct <= daily_loss_kill_switch_pct / 10` (RULE_001)

**Used By**:
- RiskManager: Calculates position size
- TradingEngine: Validates trade before execution
- LATTI: Auto-tunes within safe bounds

#### 2. Symbol Cooldown (minutes)

```typescript
symbol_cooldown_minutes: integer  // Range: 1 - 90 minutes, Default: 15
```

**Definition**: Minimum wait time before re-trading the same symbol after closing a position.

**Example**:
- Cooldown: 15 minutes
- Close BTC/USD trade at 10:00 AM
- Cannot open new BTC/USD trade until 10:15 AM

**Purpose**:
- Prevents overtrading the same symbol
- Reduces emotional revenge trading
- Allows time for price action to develop

**Coherency Rule**: `symbol_cooldown_minutes >= 1` (RULE_003)

**Used By**:
- TradingEngine: Blocks trades within cooldown window
- LATTI: Optimizes cooldown based on trading velocity
- StrategyEngine: Considers cooldown in signal generation

#### 3. Max Open Positions (count)

```typescript
max_open_positions: integer  // Range: 1 - 20, Default: 5
```

**Definition**: Maximum number of concurrent open trades allowed.

**Example**:
- Max positions: 5
- Currently have 5 open trades
- New buy signal → rejected (no capacity)

**Purpose**:
- Limits portfolio diversification complexity
- Prevents over-exposure across multiple positions
- Manageable trade monitoring

**Coherency Rule**: 
- `max_open_positions >= 1 AND max_open_positions <= 20` (RULE_008)
- `max_open_positions * portfolio_risk_per_trade_pct <= 100` (RULE_002, warning)

**Used By**:
- RiskManager: Enforces position limit before trade
- TradingEngine: Blocks new trades when at capacity
- LATTI: May adjust dynamically based on market conditions

**Note**: Phase 1 audit flagged this as potentially redundant if LATTI fully controls position count. Under review for Phase 3.

#### 4. Daily Loss Kill Switch (%)

```typescript
daily_loss_kill_switch_pct: decimal(5,2)  // Range: 1.00% - 20.00%, Default: 7.00%
```

**Definition**: Portfolio loss percentage that triggers automatic trading shutdown for the day.

**Example**:
- Portfolio: $10,000
- Kill switch: 7.00%
- Threshold: $700 loss
- If daily realized losses reach -$700, engine auto-stops

**Purpose**:
- Emergency brake to prevent catastrophic drawdowns
- Protects against emotional decision-making
- Enforces disciplined risk management

**Coherency Rule**: `daily_loss_kill_switch_pct >= 1.00 AND daily_loss_kill_switch_pct <= 20.00` (RULE_007)

**Used By**:
- RiskManager: Monitors cumulative daily P/L
- TradingEngine: Executes shutdown when breached
- MetricsCore: Calculates daily loss metrics

**Migrated From**: `trading_settings.dailyLossKillSwitch` (was per-user, now mode-global)

### Phase 3 Control Flags (Lottie vs Manual)

#### Manual Override Flag

```typescript
is_manual_override: boolean  // Default: false (LATTI controls)
```

**Purpose**: Indicates whether user has manually set guardrails (true) or LATTI manages them (false).

**Phase 3 Feature**: Not enforced until "Lottie Controls" UI implemented.

**Coherency Rule**: `NOT (is_manual_override AND tuned_by_latti)` (RULE_005)

#### LATTI-Tuned Flag

```typescript
tuned_by_latti: boolean  // Default: true
```

**Purpose**: Indicates whether LATTI is actively auto-tuning these guardrails.

**Mutual Exclusivity**: Cannot be both manual override AND LATTI-tuned simultaneously.

### Metadata

```typescript
last_updated: timestamp  // Auto-updated on every PUT
```

**Purpose**: Tracks when guardrails were last modified (user or LATTI).

## Coherency Rules

### RULE_001: Risk ≤ KillSwitch/10
```yaml
portfolio_risk_per_trade_pct <= daily_loss_kill_switch_pct / 10
```
**Ensures**: At least 10 consecutive losing trades before hitting kill switch.

**Example**:
- Kill switch: 7.00%
- Max risk: 0.70%
- If risk per trade is 0.90%, violates rule

### RULE_002: Total Exposure Cap (Warning)
```yaml
max_open_positions * portfolio_risk_per_trade_pct <= 100
```
**Ensures**: Aggregate risk doesn't exceed 100% of portfolio.

**Example**:
- Max positions: 5
- Risk per trade: 1.50%
- Total exposure: 7.50% (PASS)

### RULE_003: Cooldown Minimum
```yaml
symbol_cooldown_minutes >= 1
```
**Ensures**: Minimum 1-minute cooldown between trades on same symbol.

### RULE_005: Manual Override Exclusivity
```yaml
NOT (is_manual_override AND tuned_by_latti)
```
**Ensures**: Clear ownership - either user OR LATTI controls, not both.

### RULE_006: Risk Range
```yaml
portfolio_risk_per_trade_pct >= 0.10 AND <= 5.00
```
**Ensures**: Sane risk bounds (not too low, not too high).

### RULE_007: Kill Switch Range
```yaml
daily_loss_kill_switch_pct >= 1.00 AND <= 20.00
```
**Ensures**: Kill switch neither too sensitive nor too permissive.

### RULE_008: Positions Range
```yaml
max_open_positions >= 1 AND <= 20
```
**Ensures**: Reasonable position count limits.

### RULE_009: Mode Isolation
```yaml
Exactly one record per mode (enforced by UNIQUE constraint)
```
**Ensures**: No duplicate or missing records per mode.

## Migration from Legacy Schema

### Phase 1 Issues Resolved

| Legacy Problem | V2 Solution |
|---------------|-------------|
| Risk params in `trading_settings` (per-user) | Migrated to `guardrails_v2` (mode-global) |
| `cooldownMinutes` duplicated in `tuningPolicy` | Single source in `guardrails_v2.symbol_cooldown_minutes` |
| Absolute dollar values (`maxDailyLoss`) | Percent-based (`daily_loss_kill_switch_pct`) |
| `maxDrawdown` redundant with kill switch | Deprecated - use `daily_loss_kill_switch_pct` only |
| `maxPositionSize` absolute $ | Deprecated - compute from `portfolio_risk_per_trade_pct` |
| `aiCanAdjust` boolean flag | Replaced by `tuned_by_latti` boolean |

### Data Migration Logic

```sql
-- Paper mode
INSERT INTO guardrails_v2 (mode, portfolio_risk_per_trade_pct, symbol_cooldown_minutes, max_open_positions, daily_loss_kill_switch_pct)
SELECT 
  'paper',
  COALESCE(g.risk_per_trade, 1.50),  -- Already percent-based
  COALESCE(g.cooldown_minutes, 15),
  COALESCE(g.max_open_positions, 5),
  COALESCE((SELECT daily_loss_kill_switch FROM trading_settings LIMIT 1), 7.00)  -- Migrate global value
FROM guardrails g WHERE g.mode = 'paper';

-- Live mode (similar logic)
```

## API Integration

### Endpoints

**GET /api/guardrails?mode=paper**
- Reads from `guardrails_v2` table
- Returns Core Four + control flags
- Cached by ConfigBob

**PUT /api/guardrails?mode=paper**
- Validates against coherency rules
- Writes to `guardrails_v2` table
- Invalidates caches
- Broadcasts `config_changed` WebSocket event

### Request/Response Schema

```typescript
// Request body
interface GuardrailsV2Update {
  portfolioRiskPerTradePct: number;    // 0.10 - 5.00
  symbolCooldownMinutes: number;       // 1 - 90
  maxOpenPositions: number;            // 1 - 20
  dailyLossKillSwitchPct: number;      // 1.00 - 20.00
  isManualOverride?: boolean;          // Phase 3
  tunedByLatti?: boolean;              // Phase 3
}

// Response
interface GuardrailsV2 {
  id: string;
  mode: 'paper' | 'live';
  portfolioRiskPerTradePct: number;
  symbolCooldownMinutes: number;
  maxOpenPositions: number;
  dailyLossKillSwitchPct: number;
  isManualOverride: boolean;
  tunedByLatti: boolean;
  lastUpdated: string;  // ISO timestamp
}
```

## Service Integration

### RiskManager

**Reads**:
- `portfolio_risk_per_trade_pct` - Calculates position size
- `daily_loss_kill_switch_pct` - Monitors for breach
- `max_open_positions` - Validates capacity

**Enforces**:
- RULE_001 (risk ≤ kill switch / 10)
- RULE_007 (kill switch range)
- Emergency shutdown on kill switch breach

### TradingEngine

**Reads**:
- `symbol_cooldown_minutes` - Blocks premature re-trades
- `max_open_positions` - Rejects trades when at capacity

**Enforces**:
- RULE_003 (cooldown minimum)
- RULE_008 (positions range)

### LATTI Manager

**Reads**: All Core Four

**Adjusts** (if `is_manual_override = false`):
- `portfolio_risk_per_trade_pct` (within safe bounds)
- `symbol_cooldown_minutes` (optimizes trading velocity)
- `max_open_positions` (dynamic capacity adjustment)

**Respects**: `is_manual_override` flag (skips locked parameters)

**Enforces**: RULE_001, RULE_006

### HeuristicTraderService

**Reads**: All Core Four

**Optimizes**: Adjusts parameters based on historical performance

**Skips**: Parameters where `is_manual_override = true`

## UI Surfaces

### Goals Engine > Guardrails Tab

**Displays**: All Core Four with input fields

**Editing**:
- Paper mode: Always editable
- Live mode: Requires confirmation modal

**Validation**: Frontend enforces coherency rules before submit

**Features**:
- Real-time coherency check (OK / WARN / BLOCK)
- "Copy to Live" button for paper→live migration
- Phase 3: Toggle switches for manual override per parameter

### Dashboard > LATTI Goals Mirror

**Displays**: Read-only Core Four values

**Purpose**: Quick reference for current guardrails without navigation

**Syncs**: Auto-updates via WebSocket when guardrails change

## Deprecated Fields (Not in V2)

### From `guardrails` table:
- `maxDailyLoss` (absolute $) → Use `daily_loss_kill_switch_pct`
- `maxDrawdown` (%) → Redundant with kill switch
- `maxPositionSize` (absolute $) → Compute from risk %
- `maxRiskPerTradeLimit` (absolute $) → Use `portfolio_risk_per_trade_pct`
- `maxRequiredCapital` (absolute $) → Unused
- `aiCanAdjust` (boolean) → Use `tuned_by_latti`
- `microLoopInterval` (seconds) → Kept in legacy table (LATTI-managed)
- `priceDeltaTrigger` (%) → Kept in legacy table (LATTI-managed)

### From `tuning_policy` table:
- `cooldownMinutes` → Duplicate of `guardrails_v2.symbol_cooldown_minutes`

### From `trading_settings` table:
- `dailyLossKillSwitch` → Migrated to `guardrails_v2.daily_loss_kill_switch_pct`
- `maxPositionPercent` → Compute from `max_open_positions * portfolio_risk_per_trade_pct`

## Transitional Analytics View

**View**: `v_guardrails_transitional`

**Purpose**: Compare V2 (new) with legacy guardrails during migration

**Columns**:
- All Core Four from V2
- Legacy fields for comparison
- Coherency check results
- Migration status indicators

**Usage**: Analytics only - do NOT use for operational queries

**Lifecycle**: Created in Phase 2, deprecated in Phase 4

## Phase 3 Additions (Planned)

### Per-Parameter Manual Override

```typescript
locked_by_user: {
  portfolioRiskPerTradePct: boolean,
  symbolCooldownMinutes: boolean,
  maxOpenPositions: boolean,
  dailyLossKillSwitchPct: boolean
}
```

**Purpose**: Track which specific parameters are user-controlled vs LATTI-controlled

**UI**: Toggle switch per Core Four parameter in Guardrails Tab

### LATTI Adjustment Audit Log

**Table**: `latti_adjustment_log`

**Purpose**: Log all LATTI automatic adjustments with before/after values

**Columns**: timestamp, mode, parameter_name, old_value, new_value, reason

## Testing

### Valid Scenarios

```typescript
// Baseline Configuration
{
  mode: 'paper',
  portfolioRiskPerTradePct: 0.90,
  symbolCooldownMinutes: 15,
  maxOpenPositions: 5,
  dailyLossKillSwitchPct: 7.00,
  isManualOverride: false,
  tunedByLatti: true
}
// Expected: PASS all rules

// Conservative Configuration
{
  mode: 'paper',
  portfolioRiskPerTradePct: 0.50,
  symbolCooldownMinutes: 30,
  maxOpenPositions: 3,
  dailyLossKillSwitchPct: 5.00
}
// Expected: PASS all rules

// Aggressive Configuration
{
  mode: 'live',
  portfolioRiskPerTradePct: 2.00,
  symbolCooldownMinutes: 5,
  maxOpenPositions: 10,
  dailyLossKillSwitchPct: 20.00,
  isManualOverride: true,
  tunedByLatti: false
}
// Expected: PASS all rules
```

### Invalid Scenarios

```typescript
// Risk exceeds kill switch threshold
{
  portfolioRiskPerTradePct: 1.50,  // FAIL
  dailyLossKillSwitchPct: 7.00
}
// Violates RULE_001: 1.50 > 7.00/10 (0.70)

// Conflicting control flags
{
  isManualOverride: true,
  tunedByLatti: true  // FAIL
}
// Violates RULE_005: Cannot be both manual AND LATTI-controlled

// Risk out of range
{
  portfolioRiskPerTradePct: 6.00  // FAIL
}
// Violates RULE_006: Must be 0.10 - 5.00

// Total exposure exceeds 100%
{
  maxOpenPositions: 100,
  portfolioRiskPerTradePct: 1.50  // WARN
}
// Violates RULE_002: 100 * 1.50 = 150% > 100%
```

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2025-10-28 | Initial V2 schema defined from Phase 1 audit |
| 2.1 | TBD | Phase 3 - Add per-parameter manual override tracking |
| 3.0 | TBD | Phase 4 - Drop legacy guardrails table, finalize schema |

## Related Documentation

- [Phase 1 Audit Recommendations](../audit/Phase1_recommendations.md)
- [Coherency Rules](../audit/coherency_rules.yaml)
- [Migration Checklist](../audit/migration_checklist.md)
- [Transitional View SQL](../audit/transitional_view_guardrails_v1.sql)

---

**Author**: Architect  
**Phase**: 2 - Schema Consolidation  
**Status**: Ready for Implementation  
**Last Updated**: October 28, 2025
