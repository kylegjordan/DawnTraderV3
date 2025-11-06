# ADR-001: Multi-User + Mode Isolation Architecture

**Date:** November 6, 2025  
**Status:** ACCEPTED  
**Decision:** DawnTrader V1.9 operates as multi-user system with per-user mode isolation

---

## Context

Phase 2 verification discovered that DawnTrader V1 contains:
- 81 database tables with `user_id` foreign key columns
- 3,125 source code references to `userId/user_id`
- Composite indexes combining `userId` + `mode` (e.g., `safety_telemetry_user_mode_timestamp_idx`)

Initial Phase 2 directive assumed the system had been refactored from user-scoped to purely mode-scoped (single-user) architecture. Verification revealed this assumption was incorrect.

## Decision

**We accept multi-user + mode isolation as the intentional architecture** for DawnTrader V1.9.

### Architectural Model

**Each authenticated user has:**
- Independent paper mode portfolio + strategies + trading history
- Independent live mode portfolio + strategies + trading history
- Personal AI conversations, reports, and lessons
- Individual Walter memory, preferences, and pending approvals
- User-specific safety telemetry and audit logs

**Isolation Boundaries:**
1. **User Isolation:** User A cannot access User B's portfolios, trades, or strategies
2. **Mode Isolation:** User A's paper mode data is isolated from User A's live mode data
3. **Cross-User + Mode:** Complete isolation between all user-mode combinations

### Database Schema Design

**User-scoped tables with mode column:**
```sql
CREATE TABLE portfolio_state (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id),  -- User isolation
  mode VARCHAR CHECK (mode IN ('paper', 'live')),  -- Mode isolation
  total_value NUMERIC,
  ...
);

CREATE UNIQUE INDEX ON portfolio_state(user_id, mode);
```

**Expected pattern:** Most tables filter by `WHERE user_id = ? AND mode = ?`

## Consequences

### Positive
- ✅ Supports multiple users (real-world deployment scenario)
- ✅ Each user has isolated paper/live environments
- ✅ Preserves user-specific AI learning and Walter memory
- ✅ Enables multi-tenant deployments
- ✅ Schema matches actual requirements

### Negative
- ⚠️ More complex data model than single-user mode-only
- ⚠️ Requires careful query filtering (must always include user_id + mode)
- ⚠️ Larger database footprint for multi-user data

### Neutral
- 🔄 Phase 2 success criteria must be redefined
- 🔄 Verification focus shifts from "eliminate userId" to "validate isolation"
- 🔄 Documentation must clarify multi-user design

## Updated Phase 2 Objectives

### Original (Incorrect) Objective
"Prove all non-auth uses of userId have been eliminated"

### Revised (Correct) Objective
"Verify multi-user + mode isolation prevents cross-user and cross-mode data leakage"

## Verification Criteria

### Schema Contract Verification
- ✅ All user-scoped tables have `user_id` foreign key
- ✅ All mode-aware tables have `mode` column with CHECK constraint
- ✅ Composite unique indexes enforce user+mode uniqueness where appropriate

### API Contract Verification
- ✅ API endpoints extract `userId` from authenticated session
- ✅ Database queries filter by `req.session.userId` + `req.body.mode`
- ❌ API responses never leak other users' data
- ❌ Mode switching cannot access wrong mode's data

### Runtime Isolation Verification
- ✅ User A's requests return only User A's data
- ✅ Paper mode queries return only paper data
- ✅ Live mode queries return only live data
- ❌ No cross-user data exposure in API responses
- ❌ No cross-mode data mixing in portfolios/trades

## Implementation Notes

### Authentication Flow (Correct Usage)
```typescript
// Session middleware extracts userId
app.use(session({ ... }));
app.use(passport.initialize());

// Protected routes require authentication
router.get('/api/portfolio/state', ensureAuthenticated, async (req, res) => {
  const userId = req.session.userId; // From auth
  const mode = req.query.mode || 'paper';
  
  // Query filters by userId + mode
  const portfolio = await db.query.portfolioState.findFirst({
    where: and(
      eq(portfolioState.userId, userId),
      eq(portfolioState.mode, mode)
    )
  });
  
  res.json(portfolio);
});
```

### Multi-User Deployment Pattern
```
User Alice (authenticated as alice@example.com):
  - Paper Portfolio: $5,000 starting balance
  - Live Portfolio: $834.11 balance
  - Alice's Walter memory
  - Alice's AI conversations

User Bob (authenticated as bob@example.com):
  - Paper Portfolio: $5,000 starting balance
  - Live Portfolio: $1,250.00 balance
  - Bob's Walter memory (separate from Alice)
  - Bob's AI conversations (isolated from Alice)
```

## Alternatives Considered

### Alternative 1: Single-User Mode-Only (Rejected)
**Why rejected:** Would require:
- Drop user_id from 81 tables
- Rewrite 3,125 code references
- Complete schema restructure
- Data migration for existing users
- **Estimated effort:** 3-4 weeks intensive refactor

### Alternative 2: Hybrid (Keep Schema, Enforce Single-User) (Rejected)
**Why rejected:** 
- Maintains complexity without benefits
- Still requires validation of unused multi-user paths
- Confusing to future developers ("why have user_id if single-user?")

### Alternative 3: Multi-User + Mode Isolation (ACCEPTED)
**Why accepted:**
- Matches current implementation
- Supports real-world deployment
- No schema refactor needed
- Clear isolation boundaries
- Pragmatic and maintainable

## References

- `audit/phase2-userid-verification.md` — Verification findings
- `diagnostics/phase2-summary.json` — Schema analysis results
- `shared/schema.ts` — Database schema with user_id columns

## Tags

`#architecture` `#multi-user` `#mode-isolation` `#phase2` `#adr`

---

**Approved By:** Architect  
**Status:** ACCEPTED  
**Effective:** November 6, 2025
