# Phase 2E - OpenAPI Contract Notes
## Single-Tenant Endpoint Contracts

**Date:** 2025-11-06  
**Status:** ✅ Documented

---

## Key Endpoints (Mode-Based)

### Portfolio State
**Endpoint:** `GET /api/portfolio/overview`  
**Query Params:** `mode=paper|live`  
**Body:** None  
**Auth:** Required (Bearer token)  
**Contract:** No userId in URL or body. Global portfolio accessed by mode only.

**Example:**
```bash
curl "http://localhost:5000/api/portfolio?mode=paper" \
  -H "Authorization: Bearer <token>"
```

---

### Guardrails
**Endpoint:** `GET /api/guardrails-v2`  
**Query Params:** `mode=paper|live`  
**Body:** None  
**Auth:** Required  
**Contract:** No userId. Global guardrails accessed by mode.

**Endpoint:** `PUT /api/guardrails-v2`  
**Query Params:** `mode=paper|live`  
**Body:**  
```json
{
  "portfolio_risk_per_trade_pct": 4.0,
  "max_open_positions": 3,
  "daily_loss_kill_switch_pct": 10.0
}
```
**Contract:** Body excludes userId. Updates global guardrails for specified mode.

---

### Strategies
**Endpoint:** `GET /api/strategies`  
**Query Params:** `mode=paper|live`  
**Body:** None  
**Auth:** Required  
**Contract:** No userId. Returns global strategies for mode.

**Endpoint:** `PUT /api/strategies`  
**Query Params:** `mode=paper|live`  
**Body:**  
```json
{
  "strategy": "momentum",
  "enabled": true,
  "params": { "threshold": 0.02 }
}
```
**Contract:** Body excludes userId. Updates global strategy for mode.

---

### Trading Status
**Endpoint:** `GET /api/trading/status`  
**Query Params:** None (uses X-App-Mode header)  
**Body:** None  
**Auth:** Required  
**Contract:** No userId. Returns global trading status.

**Endpoint:** `POST /api/trading/start`  
**Query Params:** None  
**Body:**
```json
{
  "mode": "paper"
}
```
**Contract:** Body includes mode only (no userId). Starts global trading engine.

---

### Paper Simulation
**Endpoint:** `GET /api/paper-sim/status`  
**Query Params:** None  
**Body:** None  
**Auth:** Required  
**Contract:** No userId. Returns global paper simulation status.

**Endpoint:** `POST /api/paper-sim/start`  
**Query Params:** None  
**Body:**
```json
{
  "duration_minutes": 60,
  "starting_balance": 10000
}
```
**Contract:** No userId. Starts global paper simulation.

---

## Deprecated Endpoints

### Walter Purpose Layer (DISABLED)
~~**Endpoint:** `GET /api/walter/purpose/:userId/:mode`~~  
**Status:** ❌ DEPRECATED & DISABLED (Phase 2E)  
**Reason:** Violates single-tenant architecture (userId in URL)  
**Migration:** Create new route `GET /api/walter/purpose?mode=paper|live` if needed

---

## Admin Endpoints (Acceptable)

### User Management
**Endpoint:** `PATCH /admin/users/:userId`  
**Status:** ✅ ACCEPTABLE (admin-only, non-operational)  
**Reason:** Admin user management, does not touch trading state

**Endpoint:** `POST /admin/users/:userId/reset-password`  
**Status:** ✅ ACCEPTABLE (admin-only, non-operational)  
**Reason:** Admin password reset, does not touch trading state

---

## Contract Verification

### ✅ Pass Criteria
- No operational endpoints accept `:userId` in URL path
- All trading/state endpoints use query param `mode=paper|live`
- Request bodies exclude `userId` (auth via token only)
- Admin endpoints with `:userId` are non-operational only

### ❌ Violations
- None found (as of Phase 2E)

---

## Authentication

**Method:** Bearer token in Authorization header  
**Format:** `Authorization: Bearer <JWT_TOKEN>`  
**User Context:** Derived from token, not passed in URL/body  
**Global Context:** Always `"default"` for operational data

---

## Mode Isolation

**Modes:** `paper` | `live`  
**Isolation:** Complete database-level separation  
**Switching:** Front-end `X-App-Mode` header or query param `mode=...`  
**Validation:** Middleware validates mode parameter

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-06  
**Maintained By:** Phase 2E Attestation Pack
