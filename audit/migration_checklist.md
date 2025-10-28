# Phase 2 Migration Checklist
## LATTi Goals + Guardrails Modernization - Schema Consolidation

**Migration Goal**: Consolidate guardrails into Core Four with percent-based values, eliminating redundancy and establishing single source of truth.

**Migration Type**: Schema change + data migration (non-destructive - preserves legacy tables for analytics)

**Estimated Duration**: 30-45 minutes

**Test Credentials**:
- Username: `testuser123`
- Password: `SecurePass123!`

---

## Pre-Migration Checklist

### 1. Backup & Verification
- [ ] **Verify development database connection**
  ```bash
  echo $DATABASE_URL
  ```
- [ ] **Document current guardrails state**
  ```sql
  SELECT mode, max_daily_loss, max_drawdown, max_position_size, 
         max_open_positions, risk_per_trade, cooldown_minutes 
  FROM guardrails;
  ```
- [ ] **Document current trading_settings risk params**
  ```sql
  SELECT user_id, daily_loss_kill_switch, max_position_percent 
  FROM trading_settings;
  ```
- [ ] **Count active modes**
  ```sql
  SELECT COUNT(DISTINCT trading_mode) FROM system_context;
  ```
  Expected: 2 (paper + live)

### 2. Code Preparation
- [ ] **Update shared/schema.ts with guardrails_v2 table definition**
  - Core Four columns only
  - Mode-scoped (unique index on mode)
  - Percent-based values (no absolute dollars)
  - Manual override flags for Phase 3

- [ ] **Create transitional view SQL**
  - File: `audit/transitional_view_guardrails_v1.sql`
  - Purpose: Analytics continuity during migration

### 3. Dependency Check
- [ ] **Identify services reading guardrails table**
  - RiskManager ✓
  - TradingEngine ✓
  - StrategyEngine ✓
  - LATTIManager ✓
  - HeuristicTraderService ✓
  - ConfigBob (caching) ✓

- [ ] **Identify API endpoints using guardrails**
  - `/api/guardrails` (GET/PUT) ✓
  - `/api/tuning/policy` (GET) ✓
  - `/api/tuning/enable` (POST) ✓

---

## Migration Steps

### Step 1: Schema Deployment ✅

**Action**: Deploy guardrails_v2 table to development database

**Commands**:
```bash
# Push schema changes (Drizzle will generate migration)
npm run db:push --force
```

**Verification**:
```sql
-- Verify table exists
\d guardrails_v2

-- Check columns
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'guardrails_v2';
```

**Expected Output**:
- Table `guardrails_v2` exists
- Columns: id, mode, portfolio_risk_per_trade_pct, symbol_cooldown_minutes, max_open_positions, daily_loss_kill_switch_pct, is_manual_override, tuned_by_latti, last_updated
- Unique index on `mode` column

### Step 2: Data Migration ✅

**Action**: Migrate existing guardrails + trading_settings risk params to guardrails_v2

**SQL Script**: (Execute via execute_sql_tool)

```sql
-- ==========================================
-- Phase 2 Data Migration
-- ==========================================

-- Get reference portfolio balance for percent conversion
-- Use latest portfolio balance from paper mode as reference
WITH portfolio_ref AS (
  SELECT 800.00 AS balance  -- Paper trading default balance
)

-- Insert PAPER mode guardrails
INSERT INTO guardrails_v2 (
  mode,
  portfolio_risk_per_trade_pct,
  symbol_cooldown_minutes,
  max_open_positions,
  daily_loss_kill_switch_pct,
  is_manual_override,
  tuned_by_latti,
  last_updated
)
SELECT 
  g.mode,
  -- riskPerTrade already stored as % in guardrails (e.g., 1.5 = 1.5%)
  COALESCE(g.risk_per_trade, 1.50)::decimal(5,2) as portfolio_risk_per_trade_pct,
  COALESCE(g.cooldown_minutes, 15) as symbol_cooldown_minutes,
  COALESCE(g.max_open_positions, 5) as max_open_positions,
  -- Migrate dailyLossKillSwitch from trading_settings (first user's value as global)
  COALESCE((
    SELECT daily_loss_kill_switch 
    FROM trading_settings 
    LIMIT 1
  ), 7.00)::decimal(5,2) as daily_loss_kill_switch_pct,
  false as is_manual_override,  -- Default: LATTI controls all
  true as tuned_by_latti,
  NOW() as last_updated
FROM guardrails g
WHERE g.mode = 'paper'
ON CONFLICT (mode) DO NOTHING;

-- Insert LIVE mode guardrails (if exists)
INSERT INTO guardrails_v2 (
  mode,
  portfolio_risk_per_trade_pct,
  symbol_cooldown_minutes,
  max_open_positions,
  daily_loss_kill_switch_pct,
  is_manual_override,
  tuned_by_latti,
  last_updated
)
SELECT 
  g.mode,
  COALESCE(g.risk_per_trade, 1.50)::decimal(5,2) as portfolio_risk_per_trade_pct,
  COALESCE(g.cooldown_minutes, 15) as symbol_cooldown_minutes,
  COALESCE(g.max_open_positions, 5) as max_open_positions,
  COALESCE((
    SELECT daily_loss_kill_switch 
    FROM trading_settings 
    LIMIT 1
  ), 7.00)::decimal(5,2) as daily_loss_kill_switch_pct,
  false as is_manual_override,
  true as tuned_by_latti,
  NOW() as last_updated
FROM guardrails g
WHERE g.mode = 'live'
ON CONFLICT (mode) DO NOTHING;

-- If no live record exists in guardrails, create with defaults
INSERT INTO guardrails_v2 (
  mode,
  portfolio_risk_per_trade_pct,
  symbol_cooldown_minutes,
  max_open_positions,
  daily_loss_kill_switch_pct,
  is_manual_override,
  tuned_by_latti,
  last_updated
)
SELECT 
  'live'::trading_mode as mode,
  1.50 as portfolio_risk_per_trade_pct,
  15 as symbol_cooldown_minutes,
  5 as max_open_positions,
  7.00 as daily_loss_kill_switch_pct,
  false as is_manual_override,
  true as tuned_by_latti,
  NOW() as last_updated
WHERE NOT EXISTS (
  SELECT 1 FROM guardrails_v2 WHERE mode = 'live'
);
```

**Verification**:
```sql
-- Verify both modes migrated
SELECT mode, portfolio_risk_per_trade_pct, symbol_cooldown_minutes, 
       max_open_positions, daily_loss_kill_switch_pct 
FROM guardrails_v2 
ORDER BY mode;
```

**Expected Output**: 2 rows (paper + live)

### Step 3: Create Transitional View ✅

**Action**: Deploy analytics view for legacy comparison

**SQL Script**: (Execute via execute_sql_tool)

```sql
CREATE OR REPLACE VIEW v_guardrails_transitional AS
SELECT
  g.mode,
  g.portfolio_risk_per_trade_pct AS risk_pct,
  g.daily_loss_kill_switch_pct AS kill_switch_pct,
  g.symbol_cooldown_minutes AS cooldown,
  g.max_open_positions AS positions,
  g.is_manual_override,
  g.tuned_by_latti,
  g.last_updated,
  -- Legacy columns for comparison
  legacy.max_daily_loss,
  legacy.max_drawdown,
  legacy.max_position_size,
  legacy.risk_per_trade AS legacy_risk_pct,
  legacy.cooldown_minutes AS legacy_cooldown,
  legacy.max_open_positions AS legacy_positions
FROM guardrails_v2 g
LEFT JOIN guardrails legacy
  ON legacy.mode = g.mode;
```

**Verification**:
```sql
SELECT * FROM v_guardrails_transitional;
```

### Step 4: Coherency Rules Validation ✅

**Action**: Validate migrated data against coherency rules

**Validation Queries**:

```sql
-- RULE_001: Risk ≤ KillSwitch/10
SELECT mode, 
       portfolio_risk_per_trade_pct,
       daily_loss_kill_switch_pct,
       daily_loss_kill_switch_pct / 10 AS max_allowed_risk,
       CASE 
         WHEN portfolio_risk_per_trade_pct <= daily_loss_kill_switch_pct / 10 
         THEN 'PASS' 
         ELSE 'FAIL' 
       END AS rule_001_status
FROM guardrails_v2;

-- RULE_002: Total Exposure Cap (warn)
SELECT mode,
       max_open_positions,
       portfolio_risk_per_trade_pct,
       max_open_positions * portfolio_risk_per_trade_pct AS total_exposure,
       CASE 
         WHEN max_open_positions * portfolio_risk_per_trade_pct <= 100 
         THEN 'PASS' 
         ELSE 'WARN' 
       END AS rule_002_status
FROM guardrails_v2;

-- RULE_003: Cooldown Minimum
SELECT mode,
       symbol_cooldown_minutes,
       CASE 
         WHEN symbol_cooldown_minutes >= 1 
         THEN 'PASS' 
         ELSE 'FAIL' 
       END AS rule_003_status
FROM guardrails_v2;

-- RULE_005: Manual Override Exclusivity
SELECT mode,
       is_manual_override,
       tuned_by_latti,
       CASE 
         WHEN NOT (is_manual_override AND tuned_by_latti) 
         THEN 'PASS' 
         ELSE 'FAIL' 
       END AS rule_005_status
FROM guardrails_v2;

-- RULE_009: Mode Isolation (should return 2 rows)
SELECT mode, COUNT(*) as count
FROM guardrails_v2
GROUP BY mode
HAVING COUNT(*) > 1;  -- Should return empty (no duplicates)
```

**Expected Result**: All rules PASS

### Step 5: Update Storage Interface ✅

**Action**: Update `server/storage.ts` to include guardrails_v2 methods

**Files to Update**:
- `server/storage.ts` - Add IStorage methods for guardrails_v2
- `server/db.ts` - Implement guardrails_v2 CRUD operations

**New Methods**:
```typescript
// IStorage interface additions
getGuardrailsV2(mode: 'live' | 'paper'): Promise<GuardrailsV2 | null>;
upsertGuardrailsV2(data: InsertGuardrailsV2): Promise<GuardrailsV2>;
```

**Verification**: TypeScript compilation succeeds

### Step 6: Update API Endpoints ✅

**Action**: Update `/api/guardrails` to read from guardrails_v2

**Files to Update**:
- `server/routes.ts` - Update GET/PUT /api/guardrails endpoints
- Maintain backward compatibility during transition

**Changes**:
- GET /api/guardrails - Read from guardrails_v2 table
- PUT /api/guardrails - Write to guardrails_v2 table
- Add coherency rules validation before save

**Verification**: API endpoints return new schema structure

### Step 7: Integration Testing ✅

**Action**: Test updated endpoints with development database

**Test Cases**:

1. **GET /api/guardrails?mode=paper**
   - Should return guardrails_v2 record
   - Verify all Core Four fields present
   
2. **PUT /api/guardrails?mode=paper**
   - Update portfolio_risk_per_trade_pct to 0.80%
   - Verify coherency rules enforced
   - Check WebSocket broadcast sent

3. **Coherency Violation Test**
   - Try to set portfolio_risk_per_trade_pct = 1.50% with daily_loss_kill_switch_pct = 7.00%
   - Should FAIL with RULE_001 error message

**Test Script**:
```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser123","password":"SecurePass123!"}'

# Extract JWT token and test GET
curl -X GET "http://localhost:5000/api/guardrails?mode=paper" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Test PUT with valid data
curl -X PUT "http://localhost:5000/api/guardrails?mode=paper" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "portfolioRiskPerTradePct": 0.80,
    "symbolCooldownMinutes": 20,
    "maxOpenPositions": 5,
    "dailyLossKillSwitchPct": 7.00
  }'
```

---

## Post-Migration Checklist

### 1. Data Integrity Verification
- [ ] **Verify record count**
  ```sql
  SELECT COUNT(*) FROM guardrails_v2;  -- Expected: 2
  SELECT COUNT(*) FROM v_guardrails_transitional;  -- Expected: 2
  ```

- [ ] **Verify no null Core Four values**
  ```sql
  SELECT * FROM guardrails_v2 
  WHERE portfolio_risk_per_trade_pct IS NULL
     OR symbol_cooldown_minutes IS NULL
     OR max_open_positions IS NULL
     OR daily_loss_kill_switch_pct IS NULL;
  ```
  Expected: 0 rows

- [ ] **Verify mode isolation (unique constraint)**
  ```sql
  SELECT mode, COUNT(*) FROM guardrails_v2 GROUP BY mode;
  ```
  Expected: 2 rows (1 paper, 1 live)

### 2. Service Integration Verification
- [ ] **RiskManager reads from guardrails_v2**
  - Check logs for guardrails_v2 queries
  
- [ ] **TradingEngine respects symbol_cooldown_minutes**
  - Test trade execution with cooldown active
  
- [ ] **LATTI skips manual override parameters**
  - Set is_manual_override = true for a parameter
  - Verify LATTI doesn't adjust it

### 3. UI Verification
- [ ] **Goals Engine > Guardrails Tab displays Core Four**
  - Portfolio Risk per Trade (%)
  - Symbol Cooldown (minutes)
  - Max Open Positions
  - Daily Loss Kill Switch (%)

- [ ] **Dashboard LATTI widget reflects new values**
  - Risk per trade shows portfolio %
  - Trading pace calculations use guardrails_v2

### 4. Documentation Updates
- [ ] **Update audit/README.md**
  - Append "Phase 2 Schema Simplification Summary"
  
- [ ] **Create docs/schema_guardrails_v2_overview.md**
  - Column definitions
  - Coherency rules
  - Migration notes

- [ ] **Update replit.md**
  - Phase 2 completion status
  - Schema changes summary

---

## Rollback Plan (If Needed)

### Emergency Rollback Steps

1. **Revert API endpoints to read from legacy guardrails table**
   ```typescript
   // server/routes.ts
   const guardrailsData = await storage.getGuardrails({ mode });  // Old method
   ```

2. **Drop guardrails_v2 table** (preserves legacy data)
   ```sql
   DROP TABLE IF EXISTS guardrails_v2 CASCADE;
   DROP VIEW IF EXISTS v_guardrails_transitional;
   ```

3. **Restart application**
   ```bash
   npm run dev
   ```

### Rollback Verification
- API endpoints return legacy schema
- No references to guardrails_v2 in logs
- Application functions normally

---

## Success Criteria

### ✅ Migration Complete When:

1. **Schema**:
   - guardrails_v2 table exists with Core Four columns
   - Unique index on mode column enforced
   - CHECK constraints on ranges active

2. **Data**:
   - Both paper and live modes have records
   - All coherency rules PASS validation
   - Legacy data preserved in transitional view

3. **Code**:
   - Storage interface includes guardrails_v2 methods
   - API endpoints read/write to guardrails_v2
   - Coherency rules enforced on PUT

4. **Testing**:
   - All API tests pass
   - UI displays new schema
   - Services read from guardrails_v2

5. **Documentation**:
   - Migration checklist completed
   - Schema overview documented
   - replit.md updated

---

## Phase 2 Handover to Phase 3

Once this checklist is complete, proceed to:

**Phase 3**: Lottie Controls UI - Manual Override Toggles
- Add toggle switches to Goals Engine > Guardrails Tab
- Implement per-parameter manual override tracking
- Update LATTI to respect `is_manual_override` flag
- WebSocket broadcasts for LATTI auto-adjustments

**Phase 4**: Legacy Deprecation
- Drop deprecated columns from guardrails table
- Drop tuning_policy.cooldown_minutes column
- Drop strategy_parameters table
- Finalize analytics transition

---

**Migration Owner**: Replit Agent  
**Created**: October 28, 2025  
**Status**: Ready for Execution  
**Test Environment**: Development Database Only
