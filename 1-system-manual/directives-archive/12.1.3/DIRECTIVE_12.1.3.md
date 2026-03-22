# Directive 12.1.3: Security Hardening — JWT Fallback Removal + Auth Bypass Removal

> **Phase**: 12.1 — Critical Math & Security Fixes
> **Status**: COMPLETE
> **Date Issued**: 2026-02-23
> **Date Complete**: 2026-02-23
> **Batch**: 3 (combined with 12.1.4 + 12.1.5)
> **Commit**: `0ddc8db1`
> **Review Cycles**: 1

---

## Problem Statement

DawnTrader's API authentication had three critical security vulnerabilities:

### 1. Hardcoded JWT Fallback Secrets (RISK-049, RISK-050)

12 route files contained JWT_SECRET initialization with hardcoded fallback strings:

```typescript
// 10 files used this fallback:
const JWT_SECRET = process.env.JWT_SECRET || 'jwt-development-secret-do-not-use-in-production';

// 1 file (regime-archive.ts) used a DIFFERENT fallback:
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// 1 file (routes.ts) used yet another fallback for BOTH secrets:
const JWT_SECRET = process.env.JWT_SECRET || "development_secret_change_in_production";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "development_refresh_secret_change_in_production";
```

If the `JWT_SECRET` environment variable was not set, any attacker who knew the fallback string (visible in source code) could forge valid JWT tokens to access all authenticated endpoints. The inconsistent fallback in `regime-archive.ts` also meant cross-file token incompatibility.

### 2. Auth Bypass Headers (RISK-051)

4 route files contained bypass headers that allowed unauthenticated access:

```typescript
function auditOrAuth(req, res, next) {
  if (req.headers['x-internal-audit'] === 'true') {
    return next(); // Skip authentication entirely
  }
  // ... normal JWT check
}
```

Any HTTP client could send `x-internal-audit: true` to bypass JWT authentication entirely. `calibration.ts` and `regime-archive.ts` also accepted `x-validation-session: true` as a second bypass vector.

### 3. Kyle's Decision

Per Phase 8 Addendum ADD-2: "Eliminate fallback values entirely. Fail hard if `JWT_SECRET` is not defined. Server must not start without `JWT_SECRET` set."

Per Phase 8 Addendum ADD-3: "Remove `x-internal-audit` bypass entirely."

Replit confirmed no dependency on fallback secrets or bypass headers before implementation.

---

## Resolution

### JWT Fallback Removal (12 files)

Replaced all fallback patterns with fail-hard initialization:

```typescript
// Directive 12.1.3: JWT_SECRET must come from environment — no fallback
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start without it.');
}
```

**Files modified**: `calibration.ts`, `paper_validation.ts`, `pricing.ts`, `regime-archive.ts`, `market.ts`, `maco.ts`, `m3b.ts`, `rl.ts`, `vts.ts`, `vts-audit.ts`, `tlva.ts`, `routes.ts`

The server now refuses to start if `JWT_SECRET` or `JWT_REFRESH_SECRET` are not configured.

### Auth Bypass Header Removal (4 files)

Removed all `x-internal-audit` and `x-validation-session` bypass checks from `auditOrAuth` / `requireAuth` functions. All requests now require valid JWT authentication.

**Files modified**: `calibration.ts`, `paper_validation.ts`, `pricing.ts`, `regime-archive.ts`

---

## Impact Analysis

- **Blast Radius**: LOW — no functional logic changed, only authentication enforcement
- **Behavioral Change**: Server fails to start without JWT env vars (correct behavior); all endpoints now require valid JWT (correct behavior)
- **Risk**: If JWT_SECRET env var is accidentally removed from deployment, server won't start — this is by design (fail-closed vs. fail-open)
- **Tests**: 816 pass, 81 fail (unchanged from baseline — zero regressions)

---

## Registry Items Resolved

| Item | Type | Resolution |
|------|------|------------|
| RISK-049 | Hardcoded JWT fallback in 9 files | RESOLVED — all fallbacks removed |
| RISK-050 | Inconsistent JWT secret in regime-archive.ts | RESOLVED — no fallback, consistent behavior |
| RISK-051 | Auth bypass via x-internal-audit header | RESOLVED — all bypass headers removed |
| RISK-053 | Duplicated auth middleware | PARTIALLY ADDRESSED — fallbacks removed from all copies; full middleware consolidation deferred to auth refactor |
| ADD-2 | Kyle directive: fail hard if JWT_SECRET missing | RESOLVED — implemented |
| ADD-3 | Kyle directive: remove x-internal-audit bypass | RESOLVED — implemented |

---

## Files Not In Scope

- `server/config/index.ts` — has JWT_SECRET reference but needs separate blast radius investigation
- `server/routes/walter-data-pipeline.ts` — Wave 3 deletion target
- `server/routes/walter-health-monitor.ts` — Wave 3 deletion target
- 13 unauthenticated route files (RISK-052) — separate directive needed for auth addition

---

## Rollback

```bash
git reset --hard 67dd76d1  # Reverts to SNAPSHOT-005 (pre-Batch 3)
```
