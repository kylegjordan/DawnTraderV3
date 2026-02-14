# 🧩 Clarification Report: Default Values Origin

**Date:** November 3, 2025  
**Investigation:** Portfolio Value ($800) and Risk Per Trade ($150) origins

---

## 💵 Clarification #1: Portfolio Value Default = $800

### **SCHEMA-LEVEL DEFAULT: $50,000**

**File:** `shared/schema.ts`  
**Line:** 219

```typescript
portfolioValue: decimal("portfolio_value", { precision: 15, scale: 2 })
  .default("50000.00"), // Base portfolio value for calculations
```

**Impact:** When a new `trading_settings` record is created WITHOUT specifying `portfolioValue`, the database defaults to **$50,000**, NOT $800.

---

### **APPLICATION-LEVEL OVERRIDE: $800**

#### **Source #1: paper-trading-start.ts (Standalone Script)**

**File:** `server/paper-trading-start.ts`  
**Lines:** 10-12, 26

```typescript
// Line 10-12: Environment variable or default
const STARTING_BALANCE = process.env.STARTING_BALANCE_USD 
  ? parseFloat(process.env.STARTING_BALANCE_USD)
  : 800;  // ← HARDCODED $800 DEFAULT

// Line 26: Used when creating default settings
riskPerTrade: '150.00', // $150 risk per trade (~18.75% of $800)
```

**When Used:** 
- This script is a **standalone 48-hour paper trading runner**
- NOT part of the main web application
- Used for automated testing and simulations
- Sets both `portfolioValue: 800` AND `riskPerTrade: 150`

---

#### **Source #2: paper-sim-service.ts (Balance Confirmation Fallback)**

**File:** `server/services/paper-sim-service.ts`  
**Lines:** 89, 108

```typescript
// Line 89: Fallback when checking balance confirmation
const currentBalance = portfolioState 
  ? parseFloat(portfolioState.balance) 
  : 800; // ← Default to $800

// Line 108: Error handler fallback
return { required: true, currentBalance: 800 }; // ← Default to $800
```

**When Used:**
- When `checkBalanceConfirmationRequired()` is called
- If `portfolioState` is missing or `balance` is null
- Error handling fallback

**Impact:** This is a **READ OPERATION** only - it does NOT write $800 to the database.

---

#### **Source #3: routes.ts (Reset Endpoint)**

**File:** `server/routes.ts`  
**Line:** 5480

```typescript
// POST /api/paper-sim/reset endpoint
const balance = parseFloat(newBalance) || 800; // ← Default to $800 if not provided
```

**When Used:**
- When calling `/api/paper-sim/reset` API endpoint
- If `newBalance` parameter is missing or invalid
- Directly sets portfolio balance to $800

**Impact:** This DOES write $800 to `portfolio_state` table.

---

### **DATABASE STATE: testuser123**

**Query Results:**
```sql
SELECT portfolio_value, updated_at 
FROM trading_settings 
WHERE user_id = (SELECT id FROM users WHERE username = 'testuser123');

-- Results:
portfolio_value | updated_at         
----------------+--------------------
800.00          | 2025-10-27 16:05:50
```

**Age:** 7 days old (created October 27, 2025)

**Origin Analysis:**
This value was written **7 days ago**, likely during one of these events:
1. Running `paper-trading-start.ts` script (most likely)
2. Manual database seed/migration
3. Calling `/api/paper-sim/reset` endpoint

---

### **Does $800 Override User-Entered Values?**

**Answer: NO** - with caveats:

1. **Normal Flow (Web App):**
   - User registration creates settings with schema default ($50,000)
   - User can update `portfolioValue` via `/api/settings` PUT endpoint
   - Value persists in database

2. **Reset Flow (`/api/paper-sim/reset`):**
   - ⚠️ **YES** - If user calls reset without `newBalance` parameter, it OVERWRITES to $800
   - If user provides `newBalance`, it uses that value

3. **Standalone Script (`paper-trading-start.ts`):**
   - ⚠️ **YES** - Script always updates to $800 (or env var `STARTING_BALANCE_USD`)
   - Line 34-36: `storage.updateTradingSettings(userId, { portfolioValue: STARTING_BALANCE })`

---

## 💸 Clarification #2: Risk Per Trade = $150

### **SCHEMA-LEVEL DEFAULT: $150.00**

**File:** `shared/schema.ts`  
**Line:** ~204 (in `tradingSettings` table)

```typescript
riskPerTrade: decimal("risk_per_trade", { precision: 10, scale: 2 })
  .default("150.00"),
```

**Impact:** When a new `trading_settings` record is created WITHOUT specifying `riskPerTrade`, the database defaults to **$150.00**.

---

### **CRITICAL ISSUE: Dollar Amount vs Percentage**

**Schema Comment Says:**
```typescript
// Base portfolio value for calculations
portfolioValue: decimal("portfolio_value", ...).default("50000.00"),
```

**But the actual calculation should be:**
- Expected: `riskPerTrade` = **4%** (percentage)
- Actual: `riskPerTrade` = **$150** (dollar amount)

**Math Check:**
- If intended as percentage: $150 ÷ 100 = 1.5% (reasonable)
- If intended as dollars on $50,000 portfolio: $150 ÷ $50,000 = 0.3% (too conservative)
- If intended as dollars on $800 portfolio: $150 ÷ $800 = 18.75% (too aggressive!)

**Developer Comment Evidence:**
```typescript
// server/paper-trading-start.ts line 26
riskPerTrade: '150.00', // $150 risk per trade (~18.75% of $800)
```

**Conclusion:** The schema stores **DOLLAR AMOUNTS**, but:
- $150 was calibrated for a $800 portfolio (18.75%)
- $150 is TOO LARGE for testuser123's actual $823 portfolio
- This explains the 1658% position sizing errors

---

### **Application Usage of riskPerTrade**

**Search Results:**

1. **Fallback Values in Code:**

```typescript
// server/routes.ts line 7199
const riskAmount = parseFloat(settings.riskPerTrade || '150');

// server/routes.ts line 7388
const riskAmount = parseFloat(settings.riskPerTrade || '150');

// server/routes.ts line 17158
const maxRiskPerTrade = guardrails 
  ? parseFloat(guardrails.riskPerTrade) 
  : 150;
```

**Impact:** These use `riskPerTrade` directly as a **DOLLAR AMOUNT**.

2. **Trading Bob (Percentage Calculation):**

```typescript
// server/services/bobs/trading-bob.ts line 114
(openTrades.length * parseFloat(settings?.riskPerTrade || '150') 
  / portfolioHealth.totalEquity) * 100
```

**Impact:** This treats `riskPerTrade` as **DOLLARS** and converts to percentage.

---

### **Database State: testuser123**

**Query Results:**
```sql
SELECT username, risk_per_trade, portfolio_value, updated_at
FROM trading_settings ts
JOIN users u ON ts.user_id = u.id
WHERE u.username = 'testuser123';

-- Results (4 duplicate rows?):
username    | risk_per_trade | portfolio_value | updated_at         
------------+----------------+-----------------+--------------------
testuser123 | 150.00         | 800.00          | 2025-10-27 16:05:50
testuser123 | 100.00         | 800.00          | 2025-10-27 16:05:50
testuser123 | 100.00         | 800.00          | 2025-10-27 16:05:50
testuser123 | 150.00         | 800.00          | 2025-10-27 16:05:50
```

**⚠️ DATA INTEGRITY ISSUE:** testuser123 has **4 different `trading_settings` records**!
- 2 records with `riskPerTrade: 150`
- 2 records with `riskPerTrade: 100`

**Expected:** ONE record per user (userId should have UNIQUE constraint)

---

### **Is $150 Stored in Database or Applied from Defaults?**

**Answer: BOTH**

1. **Schema Default:** Database uses `default("150.00")` when creating new records
2. **Stored Value:** testuser123 has $150 **stored in the database** (created 7 days ago)
3. **Re-applied:** `paper-trading-start.ts` script ALWAYS sets it to $150 when initializing

**Origin for testuser123:**
- Created: October 27, 2025 (7 days ago)
- Source: Likely `paper-trading-start.ts` script or manual seed
- Value: Persists in database, NOT recalculated on each request

---

### **Does $150 Get Re-Applied on Simulation Start?**

**Answer: DEPENDS on how you start**

1. **Web App Start (`/api/paper-sim/start`):**
   - Uses EXISTING `riskPerTrade` from database
   - Does NOT override with $150

2. **Standalone Script (`paper-trading-start.ts`):**
   - Line 23-31: Creates NEW settings with `riskPerTrade: '150.00'`
   - Line 34-36: Does NOT update `riskPerTrade` if settings exist
   - **Conclusion:** Only sets $150 on FIRST RUN, then uses existing value

3. **Reset Endpoint (`/api/paper-sim/reset`):**
   - Does NOT modify `riskPerTrade`
   - Only resets portfolio balance

---

## 🔍 Root Cause Summary

### **Portfolio Value = $800**

| Source | Type | When Applied | Overrides User? |
|--------|------|--------------|-----------------|
| Schema default | $50,000 | New record creation | ❌ No |
| `paper-trading-start.ts` | $800 | Script execution | ⚠️ YES |
| `paper-sim-service.ts` | $800 | Fallback (read-only) | ❌ No |
| `/api/paper-sim/reset` | $800 | Reset API call | ⚠️ YES (if no newBalance) |

**testuser123 Value:** $800 (stored 7 days ago, likely from script)

---

### **Risk Per Trade = $150**

| Source | Type | When Applied | Overrides User? |
|--------|------|--------------|-----------------|
| Schema default | $150 | New record creation | ❌ No |
| `paper-trading-start.ts` | $150 | Script first run only | ⚠️ YES (first time) |
| Fallback values in code | $150 | If DB value is null | ❌ No |

**testuser123 Value:** $150 (stored 7 days ago in database)

**Critical Issue:** Value is stored as **DOLLARS** but should be **PERCENTAGE** (4%)!

---

## ✅ Verification Summary

### **Question 1: Where does $800 come from?**

**Answer:**
- **Primary Source:** `paper-trading-start.ts` line 12 (hardcoded default)
- **Secondary Sources:** 
  - `paper-sim-service.ts` line 89 (read-only fallback)
  - `routes.ts` line 5480 (reset endpoint)

**For testuser123:** Database record created 7 days ago with `portfolioValue: 800`, likely from running `paper-trading-start.ts` script.

---

### **Question 2: Where does $150 come from?**

**Answer:**
- **Primary Source:** `shared/schema.ts` (database schema default)
- **Application Usage:** Treated as **DOLLAR AMOUNT**, not percentage
- **Design Flaw:** Should be stored as **4** (percent), not **150** (dollars)

**For testuser123:** Database has FOUR records (data integrity issue), all created 7 days ago with `riskPerTrade: 150` or `100`.

---

## 🚨 Critical Issues Identified

### **Issue #1: Multiple trading_settings Records per User**

testuser123 has **4 records** instead of 1.

**Expected Schema:**
```typescript
userId: varchar("user_id").references(() => users.id), // ← Missing UNIQUE constraint!
```

**Required Fix:**
```sql
-- Add unique constraint
ALTER TABLE trading_settings ADD CONSTRAINT unique_user_settings UNIQUE (user_id);

-- Clean up duplicates (keep most recent)
DELETE FROM trading_settings 
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id 
  FROM trading_settings 
  ORDER BY user_id, updated_at DESC
);
```

---

### **Issue #2: riskPerTrade Semantic Mismatch**

**Problem:** Field name suggests "risk **PER TRADE**" but stores:
- A fixed dollar amount ($150)
- Not a percentage (4%)
- Not a dynamic calculation

**Impact:**
- $150 risk is correct for $800 portfolio (18.75%)
- $150 risk is TOO HIGH for $823 portfolio (18.23%)
- Creates extreme position sizing errors

**Required Fix:**
1. **Rename field:** `riskPerTradePct` (percentage)
2. **Store as:** `4.00` (percent)
3. **Calculate at runtime:** `portfolioValue × (riskPerTradePct / 100)`

---

## 📋 Recommended Actions

### **Priority 1: Fix riskPerTrade Semantic Issue**

```sql
-- Option A: Migrate existing data
UPDATE trading_settings 
SET risk_per_trade = (risk_per_trade / portfolio_value) * 100
WHERE risk_per_trade > 100;  -- Assume values >100 are dollars

-- Option B: Add new column with percentage
ALTER TABLE trading_settings 
  ADD COLUMN risk_per_trade_pct DECIMAL(5,2) DEFAULT 4.00;
```

### **Priority 2: Add Unique Constraint**

```sql
ALTER TABLE trading_settings 
  ADD CONSTRAINT unique_user_settings UNIQUE (user_id);
```

### **Priority 3: Clean Up testuser123 Duplicates**

```sql
-- Delete all but most recent record
DELETE FROM trading_settings 
WHERE user_id = (SELECT id FROM users WHERE username = 'testuser123')
  AND id NOT IN (
    SELECT id FROM trading_settings 
    WHERE user_id = (SELECT id FROM users WHERE username = 'testuser123')
    ORDER BY updated_at DESC LIMIT 1
  );
```

---

**Report Complete:** All default value origins traced and documented.
