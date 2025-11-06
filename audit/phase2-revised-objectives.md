# Phase 2 Revised Objectives — Multi-User + Mode Isolation Verification

**Date:** November 6, 2025  
**Branch:** dt-v1-revival-bootstrap  
**Version:** 1.9.0  
**Status:** IN PROGRESS (objectives revised after ADR-001)

---

## Architectural Decision

Following ADR-001, DawnTrader V1.9 is confirmed as a **multi-user system** where each user operates in isolated paper/live modes. Phase 2 objectives have been updated to verify isolation boundaries rather than eliminate userId.

---

## Original Phase 2 Directive (Superseded)

**Original Objective:**
> "Prove conclusively that all non-auth uses of userId have been eliminated and that every table and service now operates purely under mode-scoped isolation (paper | live)."

**Status:** ❌ **INVALID** — Based on incorrect architectural assumptions

**Finding:** System is intentionally multi-user with 81 tables containing user_id columns. Eliminating userId would require complete architectural refactor (3-4 weeks effort).

---

## Revised Phase 2 Objectives

### Primary Objective

**Verify multi-user + mode isolation prevents cross-user and cross-mode data leakage**

### Success Criteria

#### 1. Schema Contract Verification ✅
- [x] Confirm all user-scoped tables have `user_id` foreign keys
- [x] Confirm mode-aware tables have `mode` column with constraints
- [x] Document composite indexes enforcing user+mode uniqueness
- [x] Verify schema design supports isolation boundaries

**Status:** ✅ COMPLETED (81 tables documented, schema validated)

#### 2. API Contract Verification 🔄
- [ ] Audit API routes extract `userId` from authenticated session
- [ ] Verify database queries filter by `userId` + `mode`
- [ ] Confirm API responses never leak other users' data
- [ ] Test mode switching cannot access wrong mode data

**Status:** 🔄 IN PROGRESS

#### 3. Runtime Isolation Tests 🔄
- [ ] User A's requests return only User A's data
- [ ] Paper mode queries return only paper data
- [ ] Live mode queries return only live data
- [ ] No cross-user data exposure detected
- [ ] No cross-mode data mixing in responses

**Status:** 🔄 IN PROGRESS

#### 4. External Validation ⏸️
- [ ] Package verification artifacts for external AI review
- [ ] Update context prompt with revised objectives
- [ ] Obtain 2+ independent AI confirmations
- [ ] Incorporate external feedback

**Status:** ⏸️ PENDING (awaiting completion of 2-3)

---

## Verification Subtasks

### Subtask A: API Route Audit

**Scan API routes for userId injection:**
```bash
# Find all API routes that query database
rg "await db" server/routes server/routes.ts -A 5 -B 2

# Check for userId extraction from session
rg "req.session.userId|req.user" server/routes server/routes.ts

# Verify mode parameter usage
rg "req.query.mode|req.body.mode" server/routes server/routes.ts
```

**Expected Pattern:**
```typescript
router.get('/api/portfolio/state', ensureAuthenticated, async (req, res) => {
  const userId = req.session.userId; // ✅ From auth session
  const mode = req.query.mode || 'paper'; // ✅ From request
  
  const data = await db.query.portfolioState.findFirst({
    where: and(
      eq(portfolioState.userId, userId), // ✅ User isolation
      eq(portfolioState.mode, mode) // ✅ Mode isolation
    )
  });
  
  res.json(data);
});
```

**Red Flags:**
- ❌ Queries without `userId` filter (cross-user leak)
- ❌ Hardcoded userId values
- ❌ Missing `ensureAuthenticated` middleware
- ❌ Mode parameter not validated

### Subtask B: Cross-User Isolation Test

**Create test script:** `diagnostics/phase2-cross-user-test.ts`

**Test Scenario:**
1. Create two test users: `testuser123` and `testuser456`
2. Authenticate as User A, create paper portfolio
3. Authenticate as User B, request User A's portfolio
4. **Expected:** 404 or empty result (no cross-user access)
5. **Failure:** User B receives User A's data

**Commands:**
```bash
# Login as User A
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser123","password":"SecurePass123!"}'

# Get User A's paper portfolio (returns data)
curl http://localhost:5000/api/portfolio/state?mode=paper \
  -H "Cookie: connect.sid=<user-a-session>"

# Login as User B
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser456","password":"SecurePass456!"}'

# Try to get User A's data using User B's session (should fail)
curl http://localhost:5000/api/portfolio/state?mode=paper \
  -H "Cookie: connect.sid=<user-b-session>"
```

**Success:** User B sees their own portfolio, NOT User A's

### Subtask C: Cross-Mode Isolation Test

**Test Scenario:**
1. Authenticate as User A
2. Create paper portfolio ($5,000 balance)
3. Create live portfolio ($834.11 balance)
4. Request paper portfolio → should show $5,000
5. Request live portfolio → should show $834.11
6. **Failure:** Portfolios mixed or merged

**Commands:**
```bash
# Get paper portfolio
curl http://localhost:5000/api/portfolio/state?mode=paper \
  -H "Cookie: connect.sid=<session>"

# Get live portfolio
curl http://localhost:5000/api/portfolio/state?mode=live \
  -H "Cookie: connect.sid=<session>"

# Verify they are distinct
```

**Success:** Paper and live data remain isolated per user

### Subtask D: Update Diagnostic Scripts

**Modify:** `diagnostics/phase2-userid-verification.sh`

**Old Logic (Incorrect):**
```bash
# Count userId references (goal: 0)
rg "(userId|user_id)" server client shared --glob '!**/auth*'
```

**New Logic (Correct):**
```bash
# Find queries WITHOUT userId filter (potential cross-user leak)
rg "await db.query.*findFirst|findMany" server -A 3 | \
  grep -v "userId" > diagnostics/missing_userid_filters.txt

# Find API responses that might leak userId
rg "res.json.*userId|res.send.*userId" server > diagnostics/userid_leaks.txt
```

---

## Updated Deliverables

### Core Verification Pack
- [x] `diagnostics/phase2-summary.json` — Schema analysis
- [x] `audit/phase2-userid-verification.md` — Initial findings
- [x] `audit/ADR-001-multi-user-mode-isolation.md` — Architectural decision
- [x] `audit/phase2-revised-objectives.md` — This document
- [ ] `diagnostics/phase2-api-audit.txt` — API route analysis
- [ ] `diagnostics/phase2-cross-user-test.ts` — Isolation test script
- [ ] `diagnostics/phase2-isolation-report.md` — Final verification

### External Validation Pack
- [ ] `diagnostics/phase2-context-prompt-v2.md` — Updated AI prompt
- [ ] `audit/phase2-verification-feedback.md` — External AI reviews

---

## Exit Criteria (Revised)

| Criterion | Expected | Status |
|-----------|----------|--------|
| Schema has user_id columns | ✅ YES (81 tables) | ✅ CONFIRMED |
| API routes filter by userId | ✅ YES (all protected routes) | 🔄 IN PROGRESS |
| Cross-user isolation verified | ✅ PASS (User A ≠ User B) | ⏸️ PENDING TEST |
| Cross-mode isolation verified | ✅ PASS (paper ≠ live) | ⏸️ PENDING TEST |
| External AI validation | ✅ 2+ confirmations | ⏸️ BLOCKED |

**Overall:** 🔄 **PHASE 2 IN PROGRESS** (objectives clarified, subtasks defined)

---

## Timeline

- ✅ **Nov 6, 2025 05:00** — Initial verification (found architectural mismatch)
- ✅ **Nov 6, 2025 05:15** — Architect review (confirmed multi-user design)
- ✅ **Nov 6, 2025 05:20** — ADR-001 issued (multi-user + mode isolation accepted)
- 🔄 **Nov 6, 2025 05:30** — API audit in progress
- ⏸️ **TBD** — Cross-user/mode isolation tests
- ⏸️ **TBD** — External AI validation
- ⏸️ **TBD** — Phase 2 completion

---

## References

- ADR-001: Multi-User + Mode Isolation Architecture
- Phase 2 Initial Findings: `audit/phase2-userid-verification.md`
- Schema Analysis: `diagnostics/phase2-summary.json`
- Database Schema: `shared/schema.ts`

---

**Status:** 🔄 **IN PROGRESS**  
**Next Steps:** Execute API audit and isolation tests  
**Blocking:** None (objectives clarified, proceeding with verification)
