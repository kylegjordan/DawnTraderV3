# Phase 41F-K: Environment Configuration

## Required Environment Variables

To enable dry-run mode, add the following to your `.env` file or set as environment variables:

```bash
# Phase 41F-K: Dry-Run Mode Configuration
DRYRUN_TRADING=true
ENABLE_AUTO_RECOVERY=true
AUTO_RECOVERY_DRYRUN=false
```

## Environment Variable Details

### DRYRUN_TRADING
- **Type**: boolean (`"true"` | `"false"`)
- **Default**: `false`
- **Purpose**: When set to `"true"`, all trade executions are simulated without writing to the database
- **Behavior**:
  - ✅ Executes full trade validation logic
  - ✅ Runs all strategy, risk, and telemetry hooks
  - ✅ Records telemetry events for tracking
  - ❌ Skips database persistence (`storage.createTrade`)
  - ❌ Does not modify portfolio balances
  - ❌ Does not create open positions

### ENABLE_AUTO_RECOVERY
- **Type**: boolean (`"true"` | `"false"`)
- **Default**: `true`
- **Purpose**: Enables automatic recovery for engine anomalies

### AUTO_RECOVERY_DRYRUN
- **Type**: boolean (`"true"` | `"false"`)
- **Default**: `false`
- **Purpose**: When `true`, auto-recovery actions are simulated only

## Testing Without Modifying .env

You can test dry-run mode without editing `.env` by setting the environment variable when starting the server:

```bash
DRYRUN_TRADING=true npm run dev
```

Or for a one-time test:

```bash
# In one terminal, restart server with dry-run enabled
DRYRUN_TRADING=true npm run dev

# In another terminal, run validation
./diagnostic-reports/phase-41F-K-dryrun-test.sh
```

## Implementation Details

### Trading Engine Check (server/services/trading-engine.ts)
The dry-run check occurs at line 382, before database persistence:

```typescript
if (process.env.DRYRUN_TRADING === 'true') {
  // Simulate trade execution
  // Record telemetry
  // Return simulated trade object
  // Skip storage.createTrade()
}
```

### Test Endpoint (server/routes.ts)
New endpoint added at line 3833:

```
POST /api/dryrun/trade/test
```

Accepts:
- `symbol`: Trading pair (e.g., "BTC/USD")
- `action`: "buy" or "sell"
- `amount`: Quantity to trade
- `price`: (optional) Override price

Returns:
```json
{
  "ok": true,
  "simulated": true,
  "dryrun": true,
  "trade": {
    "id": "dryrun-...",
    "symbol": "BTC/USD",
    "action": "buy",
    "quantity": 0.01,
    "entryPrice": 43250.00,
    "stopPrice": 42385.00,
    "targetPrice": 44547.50,
    "strategy": "manual_dryrun_test",
    "timestamp": "2025-11-02T21:34:00Z"
  }
}
```

## Validation Script

Run the comprehensive validation:

```bash
chmod +x diagnostic-reports/phase-41F-K-dryrun-test.sh
./diagnostic-reports/phase-41F-K-dryrun-test.sh | tee diagnostic-reports/phase-41F-K-console.txt
```

The script will:
1. Authenticate as testuser123
2. Capture initial portfolio state
3. Execute 3 dry-run trades
4. Verify portfolio unchanged
5. Check for anomalies
6. Provide pass/fail summary

## Expected Results

With `DRYRUN_TRADING=true`:
- ✅ All trades execute successfully
- ✅ All trades marked as `simulated: true` and `dryrun: true`
- ✅ Portfolio value unchanged (< 0.01% variance)
- ✅ No critical/warning anomalies
- ✅ Telemetry events recorded with `dryrun_trade` type

Without `DRYRUN_TRADING` (or `=false`):
- ✅ Trades execute normally
- ❌ Trades NOT marked as simulated
- ❌ Portfolio value changes
- ❌ Database records created

## Security Note

This is a **configuration flag**, not a secret credential. It's safe to commit to version control as it only affects the runtime behavior of the trading engine for testing purposes.

---

**Created**: Phase 41F-K  
**Last Updated**: 2025-11-02  
**Status**: Ready for validation
