# Daily Loss Kill Switch - Integration Documentation

## Overview
The Daily Loss Kill Switch is a portfolio protection mechanism that automatically suspends trading when rolling 24-hour losses exceed a configurable threshold (default: 7%).

## Integration Points

### 1. Risk Gate (Portfolio Layer)
**File**: `server/services/risk-manager.ts`  
**Function**: `checkPreTradeRisk()` (lines 11-49)

```typescript
// Check 0: Trading suspended (kill switch)
if (settings.tradingSuspended) {
  return {
    approved: false,
    reason: '🚨 Trading suspended due to Kill Switch activation. Reset required before resuming trades.'
  };
}
```

**Purpose**: First line of defense - prevents ANY trade execution when kill switch is active.

### 2. Signal Stage (Strategy Runner)
**File**: `server/services/market-scanner.ts`  
**Function**: `scanForSignals()` (lines 160-182)

```typescript
// Check if trading is suspended by kill switch
if (settings.tradingSuspended) {
  console.log('🚨 Trading suspended by Kill Switch — strategies skipped.');
  return;
}
```

**Purpose**: Prevents strategy analysis and signal generation when kill switch is active.

### 3. Kill Switch Monitoring
**File**: `server/services/risk-manager.ts`  
**Functions**: 
- `checkDailyLossKillSwitch()` (lines 192-299) - Main kill switch logic
- `calculate24hPL()` (lines 301-341) - Rolling 24-hour P/L calculation
- `triggerKillSwitch()` (lines 343-397) - Emergency closure and suspension

**Trigger Logic**:
1. Calculates rolling 24-hour P/L from all trades
2. Compares against user settings:
   - Warning threshold: `dailyLossKillSwitch * (dailyLossWarningTrigger / 100)` (default: -5.25%)
   - Kill threshold: `dailyLossKillSwitch` (default: -7%)
3. On warning: Emits warning log only
4. On kill:
   - Sets `tradingSuspended = true`
   - Closes all open positions at market
   - Creates event log with full context
   - Persists suspension state to database

## Kill Switch Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    HOURLY MARKET SCAN                        │
│                  (MarketScanner.performScan)                 │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                 ┌───────────────────────┐
                 │  Get User Settings    │
                 └───────┬───────────────┘
                         │
                         ▼
                 ┌─────────────────────────────┐
                 │ Check tradingSuspended?      │
                 │ (MarketScanner.scanForSignals)│
                 └───────┬──────────┬───────────┘
                         │          │
                    YES  │          │  NO
                         │          │
                         ▼          ▼
            ┌────────────────┐  ┌────────────────────────┐
            │ Skip Strategies │  │  Run Strategies        │
            │ Log: "🚨 Skipped"│  │  Generate Signals      │
            └────────────────┘  └───────┬────────────────┘
                                        │
                                        ▼
                           ┌──────────────────────────────┐
                           │  Signal → TradingEngine      │
                           │  (processSignal)             │
                           └────────────┬─────────────────┘
                                        │
                                        ▼
                           ┌──────────────────────────────┐
                           │  RiskManager.checkPreTradeRisk│
                           │  Check #0: tradingSuspended?  │
                           └───────┬──────────┬───────────┘
                                   │          │
                              YES  │          │  NO
                                   │          │
                                   ▼          ▼
                        ┌─────────────┐  ┌────────────────┐
                        │ Reject Trade │  │ Continue Checks │
                        └─────────────┘  │ (Balance, Risk, │
                                        │  Exposure, etc.) │
                                        └────────┬───────────┘
                                                 │
                                                 ▼
                                        ┌───────────────────┐
                                        │  Execute Trade    │
                                        └────────┬──────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────────┐
                                    │ Post-Trade: Check Kill      │
                                    │ Switch (checkDailyLossKS)  │
                                    └─────┬──────────┬───────────┘
                                          │          │
                                     Loss │          │ Profit/OK
                                          │          │
                                          ▼          ▼
                              ┌───────────────────┐  ┌────────────┐
                              │ Warning or Kill?  │  │  Continue  │
                              └─────┬─────────────┘  └────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
              Warning│                         Kill │
                    ▼                               ▼
        ┌──────────────────────┐    ┌──────────────────────────────┐
        │ Log Warning Only     │    │ 1. Close All Open Positions  │
        │ "⚠️ -5.25% reached"  │    │ 2. Set tradingSuspended=true │
        └──────────────────────┘    │ 3. Create Event Log          │
                                    │ 4. Redirect to Kill Screen   │
                                    └──────────────────────────────┘
```

## Database Schema

### Kill Switch Settings (in `tradingSettings` table)
```sql
dailyLossKillSwitch     varchar(10)  DEFAULT '7.00'   -- Max loss % (e.g., '7.00' = 7%)
dailyLossWarningTrigger varchar(10)  DEFAULT '75.00'  -- % of kill switch for warning (e.g., '75.00' = 75% of limit)
tradingSuspended        boolean      DEFAULT false    -- Trading suspension flag
```

### Kill Switch Events Table
```sql
CREATE TABLE killSwitchEvents (
  id                serial PRIMARY KEY,
  userId            varchar(255) NOT NULL,
  triggeredAt       timestamptz NOT NULL,
  lossPercent       varchar(10) NOT NULL,    -- e.g., '7.25' for 7.25%
  lossAmount        varchar(20) NOT NULL,    -- Actual $ loss
  accountEquity     varchar(20) NOT NULL,    -- Equity before closure
  portfolioValue    varchar(20) NOT NULL,    -- Value after closure
  tradesClosed      text,                    -- JSON array of closed trades
  killSwitchLimit   varchar(10) NOT NULL,    -- Setting at time of trigger
  warningTrigger    varchar(10) NOT NULL     -- Setting at time of trigger
);
```

## API Endpoints

### Kill Switch Status
```
GET /api/kill-switch/status
Response: {
  tradingSuspended: boolean,
  dailyLossKillSwitch: string,
  dailyLossWarningTrigger: string,
  current24hPL: number,
  latestEvent: KillSwitchEvent | null
}
```

### Check Kill Switch (with trigger logic)
```
POST /api/kill-switch/check
Response: {
  triggered: boolean,
  type: 'none' | 'warning' | 'kill',
  current24hPL: number,
  threshold: number,
  tradingSuspended: boolean
}
```

### Reset Kill Switch
```
POST /api/kill-switch/reset
Response: {
  success: boolean,
  message: string,
  tradingSuspended: boolean
}
```

### Get Event History
```
GET /api/kill-switch/events
Response: KillSwitchEvent[]
```

## UI Components

### Settings Page (`client/src/pages/settings.tsx`)
**Tab**: Portfolio Guardrails  
**Section**: Daily Loss Kill Switch

- **Daily Loss Kill Switch %**: Maximum rolling 24h loss before suspension
- **Warning Trigger %**: Percentage of kill switch that triggers warning alert
- **Trading Suspended**: Read-only indicator (set by system)

**Defaults**:
- Kill Switch: 7.00%
- Warning Trigger: 75.00%

### Kill Switch Screen (`client/src/pages/kill-switch.tsx`)
**Route**: `/kill-switch`  
**Trigger**: Auto-redirect when `tradingSuspended === true`

**Features**:
- Red alert banner
- Event summary (loss %, amount, equity impact)
- Portfolio breakdown (before/after values)
- Closed trades list with P/L details
- Reset button (requires user action)
- "View Analysis in ChatGPT" button

**Auto-Redirect Logic** (`client/src/App.tsx`):
```typescript
// Only allows /kill-switch and /settings when suspended
useEffect(() => {
  const allowedPaths = ['/kill-switch', '/settings'];
  if (settings?.tradingSuspended && !allowedPaths.includes(location)) {
    setLocation('/kill-switch');
  }
}, [settings, location, setLocation]);
```

## Notification System (Current Implementation)

### In-App Toast Notifications ✅
- **Implemented**: Yes
- **Technology**: shadcn/ui Toast component
- **Trigger Points**:
  - Warning threshold reached
  - Kill switch activated
  - Trades closed
  - Reset successful/failed

### External Notifications ⏳
- **Push Notifications**: Settings toggle exists, backend not implemented
- **Email Notifications**: Settings toggle exists, backend not implemented  
- **Telegram Notifications**: Not implemented

**Note**: Full external notifications would require integration with:
- Push: Firebase Cloud Messaging or OneSignal
- Email: SendGrid, AWS SES, or Mailgun
- Telegram: Telegram Bot API

## Testing Kill Switch

### Manual Testing
1. **Set Low Threshold**: Go to Settings → Portfolio Guardrails → Set Kill Switch to 0.50%
2. **Execute Losing Trades**: Paper trade positions with immediate losses
3. **Monitor Console**: Watch for warning/kill logs
4. **Verify Suspension**: Check if strategies are skipped and trades are rejected
5. **Test Reset**: Use Kill Switch screen to resume trading

### Automated Testing (Coming Soon)
See Phase 2 in the verification plan for automated test endpoints.

## Key Safety Features

1. **Dual-Layer Protection**:
   - Risk Gate: Blocks trade execution
   - Signal Stage: Blocks signal generation

2. **Atomic Updates**:
   - `tradingSuspended` flag updated in single database transaction
   - Event logging includes full context snapshot

3. **Safe JSON Parsing**:
   - Kill Switch screen uses try-catch for `tradesClosed` parsing
   - Prevents UI crashes from malformed data

4. **User Control**:
   - Manual reset required (no automatic resumption)
   - Settings accessible during suspension for threshold adjustment

## Audit Trail

Every kill switch event is logged with:
- Exact trigger timestamp (UTC)
- Loss percentage and dollar amount
- Account equity before/after
- List of all closed trades
- Active settings at time of trigger
- User ID for multi-user systems

Query event history:
```sql
SELECT * FROM "killSwitchEvents" 
WHERE "userId" = '...' 
ORDER BY "triggeredAt" DESC;
```

## Maintenance Notes

### Changing Defaults
Edit `shared/schema.ts`:
```typescript
dailyLossKillSwitch: varchar('daily_loss_kill_switch', { length: 10 })
  .default('7.00'),  // Change default here
```

### Adding New Notification Channels
1. Add toggle to Settings UI
2. Create notification service (e.g., `NotificationService.ts`)
3. Call from `RiskManager.triggerKillSwitch()`
4. Log notification success/failure

### Debugging Kill Switch
Enable detailed logging:
```typescript
// In RiskManager.checkDailyLossKillSwitch()
console.log('[Kill Switch Debug]', {
  current24hPL,
  killThreshold,
  warningThreshold,
  triggered: result.triggered,
  type: result.type
});
```
