# Phase 41F-L.E2E-AUDIT — Executive Summary

**Status:** ✅ AUDIT COMPLETE  
**Date:** November 3, 2025  
**Test User:** testuser123  
**Portfolio:** $823 ($823 cash, $0 crypto)

---

## Critical Findings (4)

### 🔥 Finding #1: Data Source Chaos (648 vs 7 eligible pairs)

**What Users See:**
- Filter Insights: **648 eligible pairs**
- Filtered Pairs Tab: **7 eligible pairs**
- Discrepancy: **641 pairs missing (99% data loss)**

**Root Cause:**
Three different services returning different data:
1. `paperSimDiagnosticService` → 648 pairs
2. `MarketEvaluationService` → 7 pairs
3. Database `trading_signals` → 0 pairs

**Impact:** Users cannot trust ANY numbers in the UI.

---

### 🔥 Finding #2: Risk Per Trade Stored as Dollars ($150)

**What Breaks:**
- Settings table: `riskPerTrade: 150` (dollars, not percent!)
- Expected: `riskPerTrade: 4` (percent)
- Position sizing: $150 risk ÷ $0.0006 stop = **250,000 shares**
- Notional: 250,000 × $0.05 = **$13,650** (1658% of $823 portfolio)

**Impact:** Guardrails correctly reject ALL trades as "position exceeds 10% limit".

**Fix:** Migrate `riskPerTrade` from dollars to percentage in database.

---

### 🔥 Finding #3: Signals Generated But Not Saved

**What Happens:**
- StrategyEngine generates signals (PARTIEUR, PARTIUSD, SAHARAEUR)
- Signals forwarded to execution engine
- Risk manager REJECTS before database save
- Result: `trading_signals` table is **EMPTY**

**Impact:** "Ready to Buy" table shows 0 signals despite active trading.

**Fix:** Save signals to database IMMEDIATELY upon generation, mark as 'rejected' after risk check.

---

### 🔥 Finding #4: Portfolio Value Triple Discrepancy

**Three Different Sources:**
1. Settings table: $800 (stale)
2. Live portfolio API: $823 (current)
3. Logs fallback: "Using settings.portfolioValue: $800"

**Impact:** Risk calculations use wrong base value.

**Fix:** Always use live portfolio value from API, never fallback to settings.

---

## Minor Findings (2)

### 🟡 Finding #5: Filter Insights vs Filters Diagnostics (648 vs 642)
**Cause:** Different `strategies` parameter (all vs false)  
**Impact:** Small UI inconsistency between widgets

### 🟡 Finding #6: Misleading "No Signals Detected" Message
**Cause:** UI shows "not detected" when signals ARE detected but rejected  
**Impact:** UX clarity issue

---

## Recommended Fixes (Priority Order)

### Priority 1: Fix Risk Calculation 🔥
- Migrate `riskPerTrade` from dollars ($150) to percent (4%)
- Use guardrails value instead of settings value
- Always calculate risk from LIVE portfolio value

### Priority 2: Persist Signals Before Risk Checks
- Save all signals to database immediately
- Mark status as 'pending' → 'rejected' or 'executed'
- Provides full signal visibility to users

### Priority 3: Unify Data Sources
- Make ALL UI elements use `MarketEvaluationService`
- Deprecate `paperSimDiagnosticService` for filtering
- Keep diagnostics endpoint for admin debugging only

### Priority 4: Add Exchange Constraints
- Check Kraken minimum notional ($10-$50)
- Skip signals that violate exchange limits
- Add explicit rejection reason

---

## Files Modified

- ✅ `diagnostic-reports/phase-41F-L.E2E-AUDIT.md` (comprehensive audit)
- ✅ `diagnostic-reports/AUDIT-SUMMARY.md` (this summary)

---

## Next Phase

**Phase 41F-L.E2E-FIX** - Apply all fixes identified in this audit.

---

**Audit Complete:** All discrepancies documented with root causes identified.
