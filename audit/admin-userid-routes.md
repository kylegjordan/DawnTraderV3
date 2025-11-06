# Admin Routes with :userId Parameters
## Single-Tenant Architecture Exception Report

**Date:** 2025-11-06  
**Scope:** Admin user management endpoints (non-operational)  
**ADR Exception:** Admin routes excluded from single-tenant migration

---

## Summary

**Total :userId routes:** 2  
**Classification:** Admin-only (non-operational)  
**Protected by:** `authenticateToken` + `requireAdmin` middleware

---

## Route Inventory

```diff
! Admin User Management Routes (ADR-001 Exception)

+ PATCH   /api/admin/users/:userId
  Purpose: Update user account details
  Auth:    Bearer token + admin role required
  Scope:   User management (non-trading)
  
+ POST    /api/admin/users/:userId/reset-password
  Purpose: Reset user password (admin action)
  Auth:    Bearer token + admin role required
  Scope:   User management (non-trading)
```

---

## Compliance Notes

### ✅ Acceptable Exception
These routes are **non-operational** and exempt from single-tenant restrictions:
- Not involved in trading operations
- Used only for user account administration
- Protected by admin-only middleware
- Do not access operational tables (portfolio, trades, strategies, etc.)

### 🔒 Security Posture
```
Request Flow:
┌─────────────────────────────────────────────┐
│ authenticateToken (JWT validation)          │
│ ↓                                           │
│ requireAdmin (role check)                   │
│ ↓                                           │
│ Route handler (admin operations only)       │
└─────────────────────────────────────────────┘
```

### 📊 Operational Routes Status
```diff
- 0 operational trading routes use :userId
- 0 portfolio routes use :userId  
- 0 strategy routes use :userId
- 0 guardrail routes use :userId

✓ All operational routes use mode-based isolation (paper|live)
```

---

## Migration Context

**Phase:** 2C Single-Tenant Cutover  
**Decision:** Preserve admin :userId routes (ADR-001 Section 4.2)  
**Rationale:** User management is separate from trading operations

**Verification:** Phase 2F Route Manifest  
**Evidence:** `diagnostics/external-pack-v2/proofs/phase2f_route_manifest.json`  
**Total routes scanned:** 480

---

## Release Notes Entry

```markdown
### Architecture Change: Single-Tenant Consolidation

DawnTrader v1.9 migrated to single-tenant architecture (ADR-001):

**Removed:**
- Multi-user portfolio isolation
- User-specific operational routes
- `:userId` path parameters from trading endpoints

**Preserved:**
- 2 admin-only routes for user management:
  - `PATCH /api/admin/users/:userId`
  - `POST /api/admin/users/:userId/reset-password`

**New Isolation:**
- All operational data partitioned by mode: `paper` | `live`
- Single global portfolio per mode
- Query pattern: `WHERE mode = ?` (no user_id predicates)

**Impact:** Trading operations now mode-based only (single tenant)
```

---

**Document Version:** 1.0  
**Classification:** Public - Release Documentation  
**Source:** Phase 2F Runtime Proof Package
