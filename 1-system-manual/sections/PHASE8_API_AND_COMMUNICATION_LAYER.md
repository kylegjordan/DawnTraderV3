# Phase 8: API Surface, Routes & Communication Layer

> **Version**: 1.1
> **Date**: 2026-02-17
> **Author**: Claude Code (System Cartographer)
> **Scope**: API architecture, authentication, middleware, route catalog, WebSocket protocol, security findings
> **Files Audited**: `server/routes.ts` (23,349 lines), 26 route files in `server/routes/*`, 4 middleware files, `server/services/auth-service.ts`, `server/services/market-data-ws.ts`
> **Status**: Complete — Kyle Phase 8 Addendum applied (v1.1)
>
> **Kyle's Phase 8 Position**: "Infrastructure is functional. Security hygiene is inconsistent. Legacy L-Series routes remain exposed. Auth layer requires consolidation. routes.ts is an architectural accumulation risk."

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [API Architecture Overview](#2-api-architecture-overview)
3. [Authentication System](#3-authentication-system)
4. [Middleware Stack](#4-middleware-stack)
5. [The Monolithic Router — routes.ts](#5-the-monolithic-router--routests)
6. [Route File Catalog — 26 Modular Route Files](#6-route-file-catalog--26-modular-route-files)
7. [WebSocket Protocol](#7-websocket-protocol)
8. [Market Data WebSocket — Kraken v2 Adapter](#8-market-data-websocket--kraken-v2-adapter)
9. [Route Mounting & Registration Patterns](#9-route-mounting--registration-patterns)
10. [Security Architecture & Findings](#10-security-architecture--findings)
11. [Deprecated & Legacy Endpoints](#11-deprecated--legacy-endpoints)
12. [L-Series Route Files — Legacy API Surface](#12-l-series-route-files--legacy-api-surface)
13. [Data Flow: Request Lifecycle](#13-data-flow-request-lifecycle)
14. [Critical Findings & Kyle Decision Points](#14-critical-findings--kyle-decision-points)
15. [Phase 8 Addendum — Kyle Directives](#15-phase-8-addendum--kyle-directives)
16. [File Catalog](#16-file-catalog)
17. [Revision History](#17-revision-history)

---

## 1. Executive Summary

DawnTrader's API layer is a **single monolithic Express router** (`routes.ts` at 23,349 lines with ~635 inline endpoints) plus **26 modular route files** mounted via dynamic imports. The combined API surface exposes approximately **750+ endpoints** covering authentication, trading engine control, guardrails, filters, portfolio management, VTS, diagnostics, telemetry, Walter/Bob chat, admin, and system health.

### Key Architectural Observations

1. **routes.ts is the largest file in the entire codebase** — 23,349 lines containing ~635 endpoints, 40+ service imports, full JWT auth middleware, rate limiting, WebSocket server, CSV generation, tax reporting, and the complete route registration for all 26 modular route files. This is the single most extreme monolithic accumulation point in DawnTrader.

2. **Authentication is inconsistent** — routes.ts uses a database-backed `authenticateToken` middleware (fail-closed, fetches user from DB on every request). The 26 modular route files use one of four different auth approaches: (a) copy-pasted JWT-only `requireAuth` with hardcoded fallback secret, (b) `x-internal-audit` header bypass, (c) centralized middleware import, or (d) no authentication at all.

3. **Security findings are significant** — hardcoded JWT fallback secrets, unauthenticated diagnostic/audit endpoints, auth bypass headers, and inconsistent secret values across files. These are documented in detail in §10.

4. **WebSocket is minimal** — A simple 3-message handler (subscribe_prices, subscribe_trades, ping/pong) for frontend real-time updates. The heavier Kraken market data WebSocket is a separate singleton service.

5. **L-Series route files expose dead backend systems** — 8 route files (dce, gasp, mof, maco, pdc-ecs, apr-sle, rl, plus portions of audit/m3b/tlva) expose L-Series autonomy cluster endpoints already confirmed legacy in Phase 4.

---

## 2. API Architecture Overview

### Transport

| Protocol | Path/Port | Purpose |
|----------|-----------|---------|
| HTTP/Express | `/api/*` | All REST endpoints (JSON API) |
| WebSocket | `/ws` | Frontend real-time updates (prices, trades, system events) |
| WebSocket | `wss://ws.kraken.com/v2` | Kraken market data (ticker + order book) — outbound only |

### Express Application Structure

```
Express App
├── Static middleware (Vite dev server in development)
├── JSON body parser (50mb limit)
├── Cookie parser
├── CORS (permissive)
├── Rate limiter (15min window, 1000 req limit)
├── Single-tenant guard middleware
├── Canonical validation middleware
├── Bob routing middleware (transparent interception)
│
├── /api/* ─── apiRouter
│   ├── Inline endpoints (~635 in routes.ts)
│   │   ├── /api/auth/* (register, login, verify, refresh)
│   │   ├── /api/admin/* (users, roles)
│   │   ├── /api/trading/* (start, stop, status)
│   │   ├── /api/guardrails-v2/* (CRUD, kill switch)
│   │   ├── /api/filters-v2/* (filter config, SQE thresholds)
│   │   ├── /api/paper-sim/* (status, portfolio, trades)
│   │   ├── /api/telemetry/* (strategy perf, VTP)
│   │   ├── /api/walter/* (chat, memory, summaries)
│   │   ├── /api/system/* (health, config, events)
│   │   ├── /api/governance/* (regime, strategy, mapping)
│   │   └── ... (~60+ endpoint groups)
│   │
│   └── Mounted route files (26 files via dynamic import)
│       ├── /api/status/* → routes/status.ts
│       ├── /api/health/* → routes/health.ts
│       ├── /api/vts/* → routes/vts.ts
│       ├── /api/market/* → routes/market.ts
│       └── ... (22 more, see §6)
│
├── /api/* (registered on app directly, not apiRouter)
│   ├── /api/diagnostics/dse/* → routes/dse.ts (via index.ts)
│   ├── /api/walter/*, /api/learning/*, /api/governance/* → routes/phase-8.6.5.ts (via index.ts)
│   └── /api/provenance/debug/* → routes/provenance-debug.ts (via index.ts)
│
├── WebSocket Server (/ws)
│
└── 404 catch-all (returns JSON for /api/*, HTML for others)
```

### Endpoint Scale

| Category | Approximate Count |
|----------|-------------------|
| Inline endpoints in routes.ts | ~635 |
| Endpoints in 26 route files | ~115 |
| **Total API surface** | **~750** |

---

## 3. Authentication System

### JWT Token Architecture

| Parameter | Value |
|-----------|-------|
| Access token lifetime | 12 hours |
| Refresh token lifetime | 7 days |
| Signing algorithm | HS256 (default jsonwebtoken) |
| Secret source | `JWT_SECRET` environment variable |
| Password hashing | bcrypt (10 rounds) |
| Password requirements | 8+ chars, uppercase, number, special character |

### Role-Based Access Control (RBAC)

DawnTrader implements Phase 27.3 permission-based access control:

| Role | Permissions |
|------|-------------|
| `owner` | Full access — all read/write operations, user management, system configuration |
| `editor` | Read + write — can modify guardrails, start/stop trading, manage filters |
| `viewer` | Read-only — can view dashboards, trades, telemetry but cannot modify |

### Authentication Middleware in routes.ts — `authenticateToken()`

The main router uses a **database-backed, fail-closed** authentication middleware:

1. Extracts JWT from `Authorization: Bearer <token>` header
2. Verifies token against `JWT_SECRET` (or `JWT_REFRESH_SECRET` for refresh tokens)
3. **Fetches user record from database on every request** — never trusts stale token data
4. If user not found in DB → reject (fail-closed)
5. Attaches `req.userId`, `req.userRole`, `req.userPermissions` to request

**Critical: This is NOT the same middleware used by the 26 route files.** See §10 for the security implications.

### Auth Service — `server/services/auth-service.ts`

Minimal utility module (47 lines):
- `validatePasswordStrength()` — enforces 8+ chars with uppercase, number, special character
- `hashPassword()` — bcrypt with 10 rounds
- `verifyPassword()` — bcrypt compare
- `getPasswordStrengthMessage()` — human-readable requirements

### Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | None | **DISABLED** — returns 410 "Registration is disabled" |
| POST | `/api/auth/login` | None | Email/password login → access + refresh tokens |
| GET | `/api/auth/verify` | Token | Validates token, returns user info |
| POST | `/api/auth/refresh` | Refresh | Exchanges refresh token for new access token |

---

## 4. Middleware Stack

### Global Middleware (Applied to All Requests)

| Middleware | File | Purpose |
|-----------|------|---------|
| Express JSON | Built-in | Body parsing (50MB limit) |
| Cookie Parser | `cookie-parser` | Cookie handling |
| CORS | `cors` | Cross-origin (permissive configuration) |
| Rate Limiter | `express-rate-limit` | 1000 requests per 15-minute window |

### Specialized Middleware

#### 4.1 Single-Tenant Guard — `server/middleware/singleTenantGuard.ts`
- **57 lines**, Directive 11.4G
- Scans request body, query params, and route params for `userId`/`user_id` violations
- Case-insensitive regex: `/user[_\-]?id/i`
- Exempts `/api/auth` routes (which legitimately handle user identification)
- Logs violations to `diagnostics/runtime_guard_violations.log`
- Throws error on violation (passed to Express error handler)

#### 4.2 Canonical Validation — `server/middleware/canonical-validation.ts`
- **214 lines**, Directive 11.4F.1
- Validates regime/strategy/signalType against canonical map
- Three violation levels:
  - **WARN**: Ghost regime normalization (e.g., `EXTREME_NOISE` → `CHOPPY`)
  - **ERROR**: signalType mismatch (non-canonical signal type)
  - **CRITICAL**: Non-canonical regime/strategy combination → **request rejected**
- Normalizes ghost regimes and legacy strategy names in-place
- Logs all violations to `audit/logs/canonical_violation.log`
- Exports: `validateAndNormalizeTrade()`, `getViolationStats()`, `clearViolationLog()`

#### 4.3 Bob Routing — `server/middleware/bob-routing.ts`
- **101 lines**, Phase 7.2
- Transparent interception for 2 high-frequency endpoints:
  - `/api/system/health` → MetricsBob cached response
  - `/api/paper-sim/status` → MetricsBob cached response
- Falls back to original handler on Bob failure
- 10% sampling for verbose logs (Phase 4A noise reduction)
- Status: Part of Walter/Bob ecosystem (confirmed dead per Kyle)

#### 4.4 Chat Logging — `server/middleware/chat-logging.ts`
- **317 lines**, Phase 6.3
- Walter conversation persistence layer
- File-based storage: daily JSON logs, summaries, chat index
- Capabilities: log messages, rename chats, save summaries, search, list user chats
- Singleton export: `chatLogging`
- Status: Part of Walter/Bob ecosystem (confirmed dead per Kyle)

---

## 5. The Monolithic Router — routes.ts

### File Statistics

| Metric | Value |
|--------|-------|
| Total lines | 23,349 |
| Inline endpoints | ~635 |
| Service imports | 40+ |
| Contains | Auth middleware, rate limiting, WebSocket server, CSV generation, tax reporting, full route registration for 26 modular files |

### Major Endpoint Groups (Inline in routes.ts)

| Group | Prefix | Auth | Approx. Endpoints | Purpose |
|-------|--------|------|-------------------|---------|
| Auth | `/api/auth/*` | Mixed | 4 | Login, register (disabled), verify, refresh |
| Admin | `/api/admin/*` | Owner-only | ~8 | User CRUD, role management |
| Settings | `/api/settings/*` | Token | ~3 | **DEPRECATED** — returns 410 |
| Trading Engine | `/api/trading/*` | Token+Editor | ~6 | Start/stop engine, preflight checks, status |
| Guardrails V2 | `/api/guardrails-v2/*` | Token | ~12 | CRUD, coherency validation, kill switch, audit |
| Filters V2 | `/api/filters-v2/*` | Token | ~8 | SQE thresholds, filter config, enable/disable |
| Paper Sim | `/api/paper-sim/*` | Token | ~15 | Status, portfolio, trades, positions, RTB |
| Telemetry | `/api/telemetry/*` | Token | ~10 | Strategy performance, VTP, regime distribution |
| Walter Chat | `/api/walter/*` | Token | ~20 | Chat sessions, messages, memory, summaries |
| System | `/api/system/*` | Token | ~8 | Health, config, events, entropy |
| Governance | `/api/governance/*` | Token | ~10 | Regime stats, strategy mapping, drift |
| Diagnostics | `/api/diagnostics/*` | Token | ~15 | REB buffers, signal flow, execution trace |
| Config | `/api/config/*` | Token+Editor | ~6 | Score weights, filter thresholds |
| Market Events | `/api/market-events/*` | Token | ~4 | Event detection, MBIM status |
| Predictive Diagnostics | `/api/predictive/*` | Token | ~5 | Confidence breakdown, DSS audit |
| CSV/Reports | `/api/trades/csv`, `/api/trades/tax-report` | Token | ~4 | Trade history export |
| State Debug | `/api/state/*` | Token | ~3 | System state snapshots |
| Passive Learning | `/api/passive-learning/*` | Token | ~2 | REB 2.10 diagnostic buffers |
| Goals (Legacy) | `/api/goals-learning/*` | Token | ~2 | Goals ML — **Walter-era legacy** |
| Screeners (Deprecated) | `/api/screeners/*` | Token | 1 | Returns 410 → use filters-v2 |

### Trading Engine Start/Stop — Critical Path

**POST `/api/trading/start`** (Phase 27.F.2):

Performs comprehensive preflight checks before engine activation:
1. Validates filter configuration (SQE thresholds populated)
2. Validates guardrail configuration (guardrails_v2 rows exist)
3. Validates portfolio state (paper_portfolio_state exists)
4. Tests Kraken API connectivity
5. Clears kill switch automatically (REB 8.8.3-KS-B)
6. Activates paper execution engine → starts FX5 scanning
7. Mode-level configuration only (Phase 41F-L.E2E-PURGE — no per-pair activation)

**POST `/api/trading/stop`**: Stops paper execution engine, stops FX5 scanning.

### Guardrails V2 — Full CRUD with Coherency

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/guardrails-v2/config` | Token | Read guardrail configuration |
| PUT | `/api/guardrails-v2/config` | Token+Editor | Update guardrails with coherency validation |
| GET | `/api/guardrails-v2/kill-switch/status` | Token | Kill switch state |
| POST | `/api/guardrails-v2/kill-switch/toggle` | Token+Editor | Toggle kill switch |
| POST | `/api/guardrails-v2/kill-switch/reset` | N/A | **DEPRECATED** (410) — auto-cleared on start |
| GET | `/api/guardrails-v2/audit-log` | Token | Phase 28.C audit trail |

Coherency validation: PUT requests pass through `GuardrailPolicy.validateCoherency()` before saving. Violations return 422 with specific rule violation details.

---

## 6. Route File Catalog — 26 Modular Route Files

### Active Diagnostic/Trading Route Files

| # | File | Mount Point | Endpoints | Auth | Lines | Directive | Status |
|---|------|-------------|-----------|------|-------|-----------|--------|
| 1 | `health.ts` | `/api/health` | 9 | **NONE** | ~692 | 41F-D | ⚠️ ACTIVE — No auth on any endpoint |
| 2 | `status.ts` | `/api/status` | 2 | None (intentional) | ~91 | Phase 1 | ACTIVE — health probe endpoints |
| 3 | `vts.ts` | `/api/vts` | 37 | Mixed | ~1,425 | 8.8.4-L8 | ⚠️ ACTIVE — LOCKED, oversized |
| 4 | `market.ts` | `/api/market` | 8 | JWT | ~281 | 8.8.4-L12 | ACTIVE — LOCKED |
| 5 | `vts-audit.ts` | `/api/vts` | 6 | JWT | ~186 | 8.8.4-M3B.2 | ACTIVE — overlaps with vts.ts |
| 6 | `vts-predictive-adjustments.ts` | `/api/vts/predictive-adjustments` | 7 | **NONE** | ~287 | 11.7D.1 | ACTIVE — read-only |
| 7 | `dse.ts` | `/api/diagnostics` | 5 | **NONE** | ~87 | 11.3 | ACTIVE — DSE diagnostics |
| 8 | `calibration.ts` | `/api/calibration` | 8 | Bypass | ~239 | 8.8.4-M5-R1 | ACTIVE — has audit bypass |
| 9 | `pricing.ts` | `/api/pricing` | 3 | Bypass | ~110 | 8.8.4-M5 | ACTIVE — has audit bypass |
| 10 | `regime-archive.ts` | `/api` (empty prefix) | 9 | JWT (different secret!) | ~302 | 11.7E | ⚠️ ACTIVE — LOCKED, security issues |
| 11 | `paper_validation.ts` | `/api/validation` | 6 | Bypass | ~157 | 8.8.4-M5 | ACTIVE — has audit bypass |
| 12 | `signal-audit.ts` | `/api/signal-audit` | 3 | **NONE** | ~62 | 8.8.4-M2 | ACTIVE — unauthenticated |
| 13 | `audit.ts` | `/api/audit` | 4 | **NONE** | ~146 | 8.8.4-M1 | ⚠️ ACTIVE — no auth, GET mutates state |
| 14 | `back_audit.ts` | `/api/back-audit` | 5 | **NONE** | ~134 | 8.8.4-M4 | ACTIVE — unauthenticated |
| 15 | `learning.ts` | **UNMOUNTED** | 8 | Centralized | ~180 | Phase 18.0 | ⚠️ NOT MOUNTED — route file exists but not imported |
| 16 | `phase-8.6.5.ts` | `/api/*` (direct on app) | 13 | Upstream | ~277 | Phase 8.6.5 | ACTIVE — Walter/learning routes |
| 17 | `provenance-debug.ts` | `/api/*` (direct on app) | 12 | **NONE** | ~293 | Phase 8.6.5 | ⚠️ ACTIVE — fully unauthenticated debug |

### L-Series Legacy Route Files

| # | File | Mount Point | Endpoints | Auth | Lines | Directive | Status |
|---|------|-------------|-----------|------|-------|-----------|--------|
| 18 | `dce.ts` | `/api/dce` | 5 | **NONE** | ~123 | 8.8.4-L16 | ⚠️ LEGACY — L-Series |
| 19 | `gasp.ts` | `/api/gasp` | 10 | **NONE** | ~183 | 8.8.4-L20 | ⚠️ LEGACY — L-Series, destructive unauth |
| 20 | `mof.ts` | `/api/mof` | 9 | **NONE** | ~163 | 8.8.4-L19 | ⚠️ LEGACY — L-Series |
| 21 | `maco.ts` | `/api/maco` | 4 | JWT | ~203 | 8.8.4-L15 | LEGACY — L-Series, LOCKED |
| 22 | `pdc-ecs.ts` | `/api/pdc-ecs` | 6 | **NONE** | ~162 | 8.8.4-L18 | ⚠️ LEGACY — L-Series |
| 23 | `apr-sle.ts` | `/api/apr-sle` | 5 | **NONE** | ~122 | 8.8.4-L17 | ⚠️ LEGACY — L-Series |
| 24 | `rl.ts` | `/api/rl` | 5 | JWT | ~186 | 8.8.4-L14 | LEGACY — L-Series, LOCKED |
| 25 | `m3b.ts` | `/api/m3b` | 7 | JWT | ~160 | 8.8.4-M3B | ACTIVE — validation audit |
| 26 | `tlva.ts` | `/api/tlva` | 6 | JWT | ~166 | 8.8.4-M3A | ACTIVE — training loop audit |

### Authentication Summary Across Route Files

| Auth Method | Files | Count |
|------------|-------|-------|
| **No authentication** | health, status, dse, signal-audit, audit, back_audit, provenance-debug, vts-predictive-adjustments, dce, gasp, mof, pdc-ecs, apr-sle | 13 |
| **Copy-pasted JWT** (`requireAuth` with hardcoded fallback) | market, vts, vts-audit, maco, rl, m3b, tlva, regime-archive | 8 |
| **Audit bypass headers** (`x-internal-audit`, `x-validation-session`) | pricing, calibration, paper_validation | 3 |
| **Centralized middleware import** | learning (unmounted) | 1 |
| **Upstream auth** (registered on app, not apiRouter) | phase-8.6.5 | 1 |

---

## 7. WebSocket Protocol

### Server-Side WebSocket (Frontend Communication)

**Location**: `routes.ts` — WebSocket server created on the HTTP server at path `/ws`

**Protocol**: Simple JSON message exchange

| Message Type | Direction | Purpose |
|-------------|-----------|---------|
| `subscribe_prices` | Client → Server | Subscribe to price updates |
| `subscribe_trades` | Client → Server | Subscribe to trade updates |
| `ping` | Client → Server | Heartbeat |
| `pong` | Server → Client | Heartbeat response |

**Context Bridge Integration**: The Context Bridge (Walter-era service) registers WebSocket clients for real-time broadcast of system events, trade updates, and price changes. Despite Walter being deprecated, this broadcast mechanism may still serve the frontend dashboard.

**Implementation Note**: The WebSocket handler is minimal — only 15 lines. The actual real-time data delivery relies on Context Bridge broadcasting to registered clients, not on the WebSocket handler processing subscriptions.

---

## 8. Market Data WebSocket — Kraken v2 Adapter

### File: `server/services/market-data-ws.ts`

**Directive**: 8.9.0-B (Secondary WebSocket Adapter — Analytics)
**Lines**: ~410
**Status**: ACTIVE

### Purpose

Secondary outbound WebSocket connection to Kraken's v2 API (`wss://ws.kraken.com/v2`). Used by FeedIntegrityMonitor, MarketDataCoordinator, and SlippageFeeModel for analytics-quality market data.

### Architecture

```
MarketDataWebSocket (singleton)
    │
    ├── Connects to wss://ws.kraken.com/v2
    ├── Subscribes to:
    │   ├── ticker channel (trade-based price updates)
    │   └── book channel (order book, depth=10)
    │
    ├── Processes:
    │   ├── v2 ticker updates → translateV2ToV1() → TickData events
    │   ├── v2 book updates → stateful mini-book → OrderBookSnapshot events
    │   └── v2 heartbeats → staleness tracking
    │
    └── Emits:
        ├── 'tick' (TickData) — bid, ask, last, source, volumes
        ├── 'orderbook' (OrderBookSnapshot) — top 10 bids/asks
        ├── 'stale' (ageMs) — data freshness alert
        ├── 'connected' / 'disconnected'
        └── 'error'
```

### Key Features

1. **v2→v1 Translation**: Uses `kraken-v2-translator.ts` to convert Kraken v2 ticker format to v1 format for backward compatibility with existing consumers.

2. **Stateful Mini-Book** (Directive 8.9.4-Patch): Maintains in-memory order book per symbol. Applies delta updates from Kraken book channel. Computes best bid/ask from sorted book entries. Emits midpoint price as `last` in tick data for stable pricing.

3. **Sequence Validation** (Directive 8.9.4-Patch): Tracks checksum per symbol. Detects out-of-order deltas and triggers book resync (delete + rebuild).

4. **Auto-Reconnect**: Exponential backoff (1s base, 30s max). Automatic resubscription to all pairs on reconnect.

5. **Staleness Detection**: Heartbeat interval (30s) checks time since last tick. Emits 'stale' event when data age exceeds threshold (2s default).

### Data Types

```typescript
interface TickData {
  symbol: string;
  bid: number;
  ask: number;
  last: number;      // Midpoint from book, or last trade from ticker
  timestamp: string;
  source: 'ws' | 'rest_fallback';
  bidVolume?: number;
  askVolume?: number;
}

interface OrderBookSnapshot {
  symbol: string;
  bids: [number, number][];  // [price, volume], sorted descending
  asks: [number, number][];  // [price, volume], sorted ascending
  timestamp: string;
}
```

### Configuration

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `url` | `wss://ws.kraken.com/v2` | Kraken WebSocket v2 endpoint |
| `heartbeatInterval` | 30,000ms | Heartbeat check interval |
| `reconnectDelayBase` | 1,000ms | Base reconnect delay |
| `reconnectDelayMax` | 30,000ms | Maximum reconnect delay |
| `staleThresholdMs` | 2,000ms | Data freshness threshold |

---

## 9. Route Mounting & Registration Patterns

### Three Registration Patterns (Inconsistent)

DawnTrader uses **three different patterns** for registering route files, creating architectural inconsistency:

#### Pattern 1: Dynamic Import to apiRouter (Standard — 22 files)
```typescript
// In routes.ts (bottom of file, ~line 22465+)
const { healthRouter } = await import('./routes/health.js');
apiRouter.use('/health', healthRouter);
```
Routes define paths relative to mount point (e.g., `/status` becomes `/api/health/status`).

#### Pattern 2: Direct Registration on Express App (3 files)
```typescript
// In index.ts (~line 356)
const { registerPhase865Routes } = await import('./routes/phase-8.6.5');
registerPhase865Routes(app);
// phase-8.6.5.ts defines full paths: /api/walter/secure-core/enable, etc.

app.use(provenanceDebugRoutes.default);
// provenance-debug.ts defines full paths: /api/provenance/debug/enable, etc.
```
These bypass the apiRouter entirely and register directly on the Express app.

#### Pattern 3: Eager Import in index.ts (1 file)
```typescript
// In index.ts (top-level import)
import dseRouter from "./routes/dse.js";
// Later:
app.use('/api/diagnostics', dseRouter);
```
DSE is eagerly imported (not dynamic) and mounted at `/api/diagnostics`. The route file defines paths as `/dse/status`, making the full path `/api/diagnostics/dse/status`.

### Mounting Anomaly: regime-archive.ts

```typescript
// In routes.ts (~line 22575)
apiRouter.use('', regimeArchiveRouter.default);
```

The regime-archive router is mounted with an **empty prefix** on apiRouter. However, the route file itself defines full paths like `/api/vts/regime-archive/*`. Since apiRouter is already mounted at `/api`, this creates a potential double-prefix issue where paths could resolve as `/api/api/vts/regime-archive/*` depending on how Express resolves the empty mount.

### Unmounted Route File: learning.ts

`server/routes/learning.ts` (Phase 18.0, ~180 lines, 8 endpoints) exists in the codebase but **is not imported or mounted anywhere** — not in routes.ts, not in index.ts. This file is dead code. It is notable as the **only route file that correctly imports authentication from centralized middleware** (`../middleware/auth`).

---

## 10. Security Architecture & Findings

### FINDING-1: Hardcoded JWT Fallback Secret (CRITICAL)

**Affected files** (9 route files):
- `market.ts`, `vts.ts`, `vts-audit.ts`, `maco.ts`, `rl.ts`, `m3b.ts`, `tlva.ts`, `calibration.ts`, `paper_validation.ts`

**Code pattern** (identical in all 9 files):
```typescript
const JWT_SECRET = process.env.JWT_SECRET || 'jwt-development-secret-do-not-use-in-production';
```

**Impact**: If `JWT_SECRET` environment variable is not set, authentication across all 9 route files is trivially bypassable. Any attacker who knows the fallback string (visible in source code) can forge valid JWT tokens.

**Note**: The main routes.ts also uses `JWT_SECRET` from env but the fallback behavior was not observed in the sampled sections.

### FINDING-2: Inconsistent JWT Secret in regime-archive.ts (HIGH)

**File**: `regime-archive.ts`
```typescript
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
```

**Impact**: Uses a **different** fallback secret than all other files (`'your-secret-key'` vs `'jwt-development-secret-do-not-use-in-production'`). If `JWT_SECRET` env var is not set, tokens valid for regime-archive would be invalid for all other endpoints, and vice versa. This creates inconsistent authentication behavior.

### FINDING-3: Auth Bypass via `x-internal-audit` Header (HIGH)

**Affected files**: `pricing.ts`, `calibration.ts`, `regime-archive.ts`, `paper_validation.ts`

**Code pattern**:
```typescript
function auditOrAuth(req, res, next) {
  if (req.headers['x-internal-audit'] === 'true') {
    return next(); // Skip authentication entirely
  }
  return requireAuth(req, res, next);
}
```

**Impact**: Any request with header `x-internal-audit: true` bypasses JWT authentication completely. This header is not validated against any secret or source — any client can send it.

**Additional bypass**: `calibration.ts` and `regime-archive.ts` also accept `x-validation-session` header as an auth bypass.

### FINDING-4: Unauthenticated Endpoint Groups (MEDIUM-HIGH)

| Route File | Endpoints | Includes Mutating Operations |
|------------|-----------|------------------------------|
| `health.ts` | 9 endpoints | **YES** — POST `/recovery/trigger`, POST `/fault-injection/*` |
| `dse.ts` | 5 endpoints | **YES** — POST `/dse/reset` (clears history + caches) |
| `signal-audit.ts` | 3 endpoints | No (read-only) |
| `audit.ts` | 4 endpoints | **YES** — GET `/trigger` (state-changing GET!) |
| `back_audit.ts` | 5 endpoints | **YES** — POST endpoints |
| `provenance-debug.ts` | 12 endpoints | **YES** — POST `/enable`, POST `/clear`, POST `/trace/new` |
| `vts-predictive-adjustments.ts` | 7 endpoints | No (read-only) |
| `dce.ts` | 5 endpoints | **YES** — POST `/compute`, POST `/recalibrate` |
| `gasp.ts` | 10 endpoints | **YES** — POST `/reset`, `/rollback`, `/recalibrate`, `/adjust` |
| `mof.ts` | 9 endpoints | **YES** — POST `/evolve`, `/reset`, `/weights` |
| `pdc-ecs.ts` | 6 endpoints | **YES** — POST `/reset`, `/recalibrate` |
| `apr-sle.ts` | 5 endpoints | **YES** — POST `/reset`, `/recalibrate` |

**Of particular concern**: `gasp.ts` exposes destructive operations (reset, rollback, recalibrate with unbounded weight inputs) without any authentication. While GASP is L-Series legacy, these endpoints are actively mounted and reachable.

### FINDING-5: Duplicated Auth Middleware (MEDIUM)

The `requireAuth` function is **copy-pasted** identically in 8+ route files instead of being imported from a shared module. Each copy:
- Duplicates JWT verification logic
- Duplicates the hardcoded fallback secret
- Duplicates the `AuthenticatedRequest` interface
- Is NOT equivalent to the routes.ts `authenticateToken` middleware (which fetches user from DB)

Only `learning.ts` (unmounted) correctly imports from `../middleware/auth`.

### FINDING-6: REST Violation — GET Mutates State (LOW)

**File**: `audit.ts`
**Endpoint**: GET `/api/audit/trigger`
**Problem**: Uses GET method for a state-changing operation (triggers audit). GET requests should be idempotent per HTTP specification.

### FINDING-7: Internal Service Key Bypass in rl.ts (MEDIUM)

**File**: `rl.ts`
**Endpoint**: GET `/api/rl/internal/buffer`

```typescript
const expectedKey = process.env.INTERNAL_SERVICE_KEY;
if (expectedKey && internalKey !== expectedKey) { ... }
```

If `INTERNAL_SERVICE_KEY` is empty string or not set, the guard is bypassed entirely (empty string is falsy in JavaScript).

### FINDING-8: Path Traversal Risk in tlva.ts (LOW)

**File**: `tlva.ts`
**Endpoint**: GET `/api/tlva/reports/:filename`

Filename validation only checks prefix (`TLVA_Report_`) and suffix (`.json`). A crafted filename like `TLVA_Report_../../etc/passwd.json` could potentially traverse paths, though the `.json` suffix makes exploitation unlikely on most systems.

### FINDING-9: RBAC Not Enforced in Modular Route Files (HIGH) — Phase 8 Addendum ADD-1

**Affected files**: All 8 route files with copy-pasted `requireAuth` middleware (`market.ts`, `vts.ts`, `vts-audit.ts`, `maco.ts`, `rl.ts`, `m3b.ts`, `tlva.ts`, `regime-archive.ts`)

**Problem**: The copy-pasted `requireAuth` function in modular route files verifies JWT token validity but **never checks the user's role or permissions**. It decodes the token and attaches `req.user = { id, username }` — no role field is extracted or validated. This means any authenticated user (including `viewer` role) can access mutating endpoints.

**Contrast with routes.ts**: The main router's `authenticateToken` middleware fetches the full user record from the database, extracts `userRole` and `userPermissions`, and applies role-specific guards (`requireEditor`, `requireOwner`) on mutating endpoints.

**Impact**: 8 route files with ~90+ authenticated endpoints have JWT verification but zero role enforcement. Any valid JWT (including viewer tokens) grants full access to all endpoints in these files.

**Kyle Directive (ADD-1)**: Standardize permission enforcement across all routes. Consolidate to centralized auth middleware with RBAC.

---

## 11. Deprecated & Legacy Endpoints

### Endpoints Returning HTTP 410 (Gone)

DawnTrader correctly uses HTTP 410 with migration instructions for deprecated endpoints:

| Deprecated Endpoint | Migration Target | Directive |
|---------------------|-----------------|-----------|
| PUT `/api/settings` | Use Guardrails tab (guardrails-v2 API) | Phase 8.8.3 |
| POST `/api/guardrails-v2/kill-switch/reset` | Auto-cleared on engine start | REB 8.8.3-KS-B |
| `*` `/api/screeners/*` | Use `/api/filters-v2` | Phase 11 |
| POST `/api/auth/register` | Registration disabled (single-tenant) | — |

### Walter/Bob Endpoints (Legacy — Dead Per Kyle)

The following endpoint groups in routes.ts serve the Walter/Bob AI system confirmed dead by Kyle:

- `/api/walter/*` (~20 endpoints) — Chat sessions, messages, memory, summaries
- `/api/goals-learning/*` — Goals ML learning triggers
- Bob routing middleware intercepts (`/api/system/health`, `/api/paper-sim/status`)

### Phase 8.6.5 Endpoints (Walter-Adjacent)

- `/api/walter/secure-core/*` — Secure-Core mode toggle
- `/api/walter/corpus-domain/*` — Corpus domain management
- `/api/learning/alignment/*` — Learning alignment weights
- `/api/learning/cross-mode-lessons` — Paper-to-live knowledge transfer
- `/api/learning/promote` — Paper learning promotion

---

## 12. L-Series Route Files — Legacy API Surface

Eight route files expose the L-Series autonomy cluster confirmed legacy in Phase 4:

| File | Mount | Backend Service | Legacy Status |
|------|-------|----------------|---------------|
| `dce.ts` | `/api/dce` | Decision Confidence Engine | Confirmed legacy (Phase 4) |
| `gasp.ts` | `/api/gasp` | GASP Coordinator | Confirmed legacy (Phase 4) |
| `mof.ts` | `/api/mof` | MOF Orchestrator | Confirmed legacy (Phase 4) |
| `maco.ts` | `/api/maco` | MACO Coordinator | Confirmed legacy (Phase 4) |
| `pdc-ecs.ts` | `/api/pdc-ecs` | PDC Engine + ECS | Confirmed legacy (Phase 4) |
| `apr-sle.ts` | `/api/apr-sle` | APR-SLE Engine | Confirmed legacy (Phase 4) |
| `rl.ts` | `/api/rl` | Reinforcement Learning | Confirmed legacy (Phase 4) |
| `m3b.ts` | `/api/m3b` | M3B Validation Service | Active (validates VTS/DCE coupling) |

**Note**: `m3b.ts` and `tlva.ts` are validation/audit tools that monitor L-Series systems. When L-Series is removed, these audit routes lose their purpose and should be removed alongside.

### L-Series Route Endpoints Summary

Combined, the L-Series route files expose **~52 endpoints**:
- 10 endpoints in gasp.ts (reset, rollback, recalibrate — destructive)
- 9 endpoints in mof.ts (evolve, reset, weights — destructive)
- 8 endpoints in market.ts (regime profiling, retrain)
- 7 endpoints in m3b.ts (validation metrics)
- 6 endpoints in pdc-ecs.ts (drawdown containment)
- 6 endpoints in tlva.ts (training loop audit)
- 5 endpoints in dce.ts (decision confidence)
- 5 endpoints in rl.ts (reinforcement learning, ML service calls)
- 5 endpoints in apr-sle.ts (adaptive profit/risk)
- 4 endpoints in maco.ts (multi-agent coordination)

---

## 13. Data Flow: Request Lifecycle

### Authenticated API Request Flow

```
Client HTTP Request
    │
    ├── Express Global Middleware
    │   ├── JSON body parser (50MB limit)
    │   ├── CORS
    │   ├── Rate limiter (1000/15min)
    │   ├── Single-tenant guard (userId violation scan)
    │   └── Canonical validation (regime/strategy normalization)
    │
    ├── Bob Routing Check (transparent interception for health/status)
    │   ├── If Bob enabled → return cached response
    │   └── If Bob disabled or failed → continue to handler
    │
    ├── Route Matching
    │   ├── apiRouter inline endpoints (routes.ts)
    │   │   └── authenticateToken() → DB lookup → req.userId/userRole
    │   │
    │   └── Mounted route files (26 files)
    │       ├── Files with requireAuth → JWT verify only (no DB lookup)
    │       ├── Files with auditOrAuth → x-internal-audit bypass OR JWT
    │       └── Files with no auth → direct handler execution
    │
    ├── Handler Execution
    │   ├── Service calls (import from server/services/*)
    │   ├── Database queries (via storage layer)
    │   └── Response generation (JSON)
    │
    └── Response
        ├── 200 OK (success)
        ├── 401 Unauthorized (auth failure)
        ├── 403 Forbidden (role insufficient)
        ├── 410 Gone (deprecated endpoint)
        ├── 422 Unprocessable (coherency violation)
        └── 404 Not Found (catch-all JSON response)
```

### WebSocket Connection Flow

```
Client WebSocket Connection (/ws)
    │
    ├── WSS upgrade on HTTP server
    ├── Connection registered with Context Bridge
    │
    ├── Client Messages:
    │   ├── subscribe_prices → (handler is empty/stub)
    │   ├── subscribe_trades → (handler is empty/stub)
    │   └── ping → pong response
    │
    └── Server Broadcasts (via Context Bridge):
        ├── Price updates
        ├── Trade updates
        ├── System events
        └── Engine status changes
```

---

## 14. Critical Findings & Kyle Decision Points

### FINDING PRIORITY | Kyle Decision Required

| # | Finding | Severity | Kyle Decision (Phase 8 Addendum) |
|---|---------|----------|----------------------------------|
| F-1 | **Hardcoded JWT fallback secret** in 9 route files | CRITICAL | **ADD-2**: Eliminate fallback values entirely. Fail hard if `JWT_SECRET` is not defined. |
| F-2 | **Inconsistent JWT secret** in regime-archive.ts | HIGH | **ADD-2**: Remove all fallback secrets (superseded by fail-hard directive). |
| F-3 | **`x-internal-audit` header bypass** in 4 files | HIGH | **ADD-3**: Replace with proper internal service key validation, signed internal JWT, or remove entirely. |
| F-4 | **13 route files with no authentication** | MEDIUM-HIGH | **ADD-1**: Standardize permission enforcement across all routes. L-Series files removed with Wave 6. |
| F-5 | **Duplicated auth middleware** in 8+ files | MEDIUM | **ADD-1**: Part of auth consolidation. Centralize RBAC enforcement. |
| F-6 | **routes.ts at 23,349 lines** | INFORMATIONAL | Kyle: "routes.ts is an architectural accumulation risk." Post-audit cleanup. |
| F-7 | **learning.ts is unmounted** | LOW | Dead code — remove with Wave 8. |
| F-8 | **regime-archive.ts empty mount prefix** | LOW | Verify paths resolve correctly or fix mount point. |
| F-9 | **vts.ts at 1,425 lines / 37 endpoints** | LOW | Oversized route file — split candidate during VTS refactor. |
| F-10 | **RBAC not enforced in modular route files** | HIGH | **ADD-1**: JWT-only auth without role checks allows any authenticated user to access mutating endpoints. |

### Forward Audit Notes

- **Phase 9 (Frontend)** will reveal which API endpoints the frontend actually consumes. Many of the 750+ endpoints may be unreferenced.
- **Phase 9: ADD-5 Post-Audit Endpoint Census** — Kyle directive: Cross-reference frontend usage against all endpoints. Mark unused endpoints for removal.
- **ADD-4: API Versioning Plan** — Introduce `/api/v1/` namespace before next major refactor.
- **Walter/Bob endpoint removal** should be bundled with Wave 3 (Walter/Bob ecosystem removal).
- **L-Series route file removal** should be bundled with Wave 6 (L-Series cluster removal).

---

## 15. Phase 8 Addendum — Kyle Directives

> **Kyle's Phase 8 Position**: "Infrastructure is functional. Security hygiene is inconsistent. Legacy L-Series routes remain exposed. Auth layer requires consolidation. routes.ts is an architectural accumulation risk."

### ADD-1: RBAC Enforcement Inconsistency

**Problem**: Many modular route files verify JWT only but do not enforce role-based permission checks. The main routes.ts uses `authenticateToken` (which fetches user from DB including role/permissions), plus role-specific guards (`requireEditor`, `requireOwner`). The 8 route files with copy-pasted `requireAuth` verify the JWT signature but **never check the user's role**. This means any authenticated user — including `viewer` role — can access mutating endpoints like mode changes, recalibration triggers, and configuration updates.

**Examples of RBAC gaps**:
- `vts-audit.ts` — POST `/update-mode` allows any authenticated user to switch system mode (IDLE/PAPER/LIVE)
- `market.ts` — POST `/regime/refresh` allows any authenticated user to force regime recheck
- `calibration.ts` — POST `/ml/trigger` allows any authenticated user (or audit header bypass) to trigger ML calibration

**Kyle Directive**: Standardize permission enforcement across all routes. All mutating endpoints must enforce at minimum `editor` role. All admin/destructive operations must enforce `owner` role.

**Implementation path**:
1. Consolidate all route-file auth to use the centralized middleware (learning.ts is the template)
2. Add `requireEditor` / `requireOwner` guards to mutating endpoints
3. Remove all inline `requireAuth` copies

### ADD-2: Remove JWT Fallback Secrets

**Kyle Directive**: Eliminate fallback values entirely. Fail hard if `JWT_SECRET` is not defined.

**Current state**: 9 route files use `process.env.JWT_SECRET || 'jwt-development-secret-do-not-use-in-production'`. regime-archive.ts uses `|| 'your-secret-key'`. If the environment variable is not set, authentication is trivially bypassable.

**Implementation**:
```typescript
// BEFORE (current — insecure):
const JWT_SECRET = process.env.JWT_SECRET || 'jwt-development-secret-do-not-use-in-production';

// AFTER (Kyle directive — fail-closed):
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Cannot start server.');
}
```

**Affected files** (10 total): `market.ts`, `vts.ts`, `vts-audit.ts`, `maco.ts`, `rl.ts`, `m3b.ts`, `tlva.ts`, `calibration.ts`, `paper_validation.ts`, `regime-archive.ts`

**Note**: If auth is consolidated per ADD-1, this becomes a single-point fix in the centralized middleware.

### ADD-3: Remove Header-Based Auth Bypass

**Kyle Directive**: Replace `x-internal-audit` with proper internal service key validation, signed internal JWT, or remove entirely.

**Current state**: 4 route files (`pricing.ts`, `calibration.ts`, `regime-archive.ts`, `paper_validation.ts`) accept `x-internal-audit: 'true'` header to bypass JWT auth completely. Additional `x-validation-session` bypass in `calibration.ts` and `regime-archive.ts`. No secret validation — any HTTP client can set these headers.

**Replacement options** (Kyle to decide):
1. **Proper internal service key**: Require `x-internal-key` header validated against `INTERNAL_SERVICE_KEY` env var (fail-closed, not the falsy-bypass pattern in rl.ts)
2. **Signed internal JWT**: Internal services use a dedicated JWT signed with a separate `INTERNAL_JWT_SECRET`
3. **Remove entirely**: If no internal service actually uses these bypasses, remove them

**Implementation**: Replace `auditOrAuth` middleware with either the chosen internal auth mechanism or standard `requireAuth`.

### ADD-4: API Versioning Plan

**Kyle Directive**: Introduce `/api/v1/` namespace before next major refactor.

**Current state**: All endpoints use unversioned `/api/*` paths. Any breaking change to endpoint contracts requires coordinating frontend and backend deployments simultaneously.

**Implementation plan**:
1. **During post-audit cleanup**: Introduce `/api/v1/` as the new canonical prefix
2. Mount existing `apiRouter` at both `/api/v1` and `/api` (backward-compatible phase)
3. Frontend migrates to `/api/v1` paths
4. After migration: deprecate unversioned `/api/*` paths
5. Future breaking changes can introduce `/api/v2/` without disrupting active consumers

**Timing**: Post-audit cleanup phase, bundled with routes.ts refactoring (RISK-048).

### ADD-5: Post-Audit Endpoint Census

**Kyle Directive**: During Phase 9, cross-reference frontend usage against all endpoints. Mark unused endpoints for removal.

**Method**:
1. Phase 9 audits frontend `fetch()` / `axios` / API calls to catalog all consumed endpoints
2. Cross-reference against the ~750 server-side endpoint registrations
3. Any endpoint not consumed by the frontend AND not consumed by internal service-to-service calls is flagged as a removal candidate
4. Walter/Bob and L-Series endpoints are pre-flagged for removal (Waves 3 and 6) regardless of frontend usage

**Expected outcome**: Significant reduction in API surface — many diagnostic, audit, and legacy endpoints likely have zero consumers.

---

## 16. File Catalog

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| `server/routes.ts` | 23,349 | ACTIVE | Monolithic router — 635 inline endpoints + 26 route file mounts |
| `server/services/auth-service.ts` | 47 | ACTIVE | Password utilities (bcrypt, validation) |
| `server/services/market-data-ws.ts` | 410 | ACTIVE | Kraken WebSocket v2 adapter (analytics) |
| `server/middleware/singleTenantGuard.ts` | 57 | ACTIVE | userId violation detection |
| `server/middleware/canonical-validation.ts` | 214 | ACTIVE | Regime/strategy canonical enforcement |
| `server/middleware/bob-routing.ts` | 101 | LEGACY | Bob Core transparent interception (Walter-era) |
| `server/middleware/chat-logging.ts` | 317 | LEGACY | Walter chat persistence |
| `server/routes/health.ts` | 692 | ACTIVE | Health monitoring endpoints (no auth) |
| `server/routes/status.ts` | 91 | ACTIVE | Health probe endpoints |
| `server/routes/vts.ts` | 1,425 | ACTIVE (LOCKED) | VTS endpoints (oversized) |
| `server/routes/market.ts` | 281 | ACTIVE (LOCKED) | Market regime endpoints |
| `server/routes/vts-audit.ts` | 186 | ACTIVE | VTS passive feed audit |
| `server/routes/vts-predictive-adjustments.ts` | 287 | ACTIVE | Predictive adjustment queries |
| `server/routes/dse.ts` | 87 | ACTIVE | DSE diagnostics |
| `server/routes/calibration.ts` | 239 | ACTIVE | Calibration reports |
| `server/routes/pricing.ts` | 110 | ACTIVE | Feed latency/cache |
| `server/routes/regime-archive.ts` | 302 | ACTIVE (LOCKED) | Regime archive queries |
| `server/routes/paper_validation.ts` | 157 | ACTIVE | Paper mode validation |
| `server/routes/signal-audit.ts` | 62 | ACTIVE | Signal audit (no auth) |
| `server/routes/audit.ts` | 146 | ACTIVE | System audit (no auth) |
| `server/routes/back_audit.ts` | 134 | ACTIVE | Back-audit integrity (no auth) |
| `server/routes/learning.ts` | 180 | DEAD | Unmounted Phase 18.0 learning routes |
| `server/routes/phase-8.6.5.ts` | 277 | ACTIVE | Walter/learning enhancement routes |
| `server/routes/provenance-debug.ts` | 293 | ACTIVE | Provenance debug (no auth) |
| `server/routes/dce.ts` | 123 | LEGACY | DCE routes (L-Series) |
| `server/routes/gasp.ts` | 183 | LEGACY | GASP routes (L-Series) |
| `server/routes/mof.ts` | 163 | LEGACY | MOF routes (L-Series) |
| `server/routes/maco.ts` | 203 | LEGACY (LOCKED) | MACO routes (L-Series) |
| `server/routes/pdc-ecs.ts` | 162 | LEGACY | PDC-ECS routes (L-Series) |
| `server/routes/apr-sle.ts` | 122 | LEGACY | APR-SLE routes (L-Series) |
| `server/routes/rl.ts` | 186 | LEGACY (LOCKED) | RL routes (L-Series) |
| `server/routes/m3b.ts` | 160 | ACTIVE | M3B validation audit |
| `server/routes/tlva.ts` | 166 | ACTIVE | TLVA training audit |

---

## 17. Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-17 | Initial Phase 8 audit complete |
| 1.1 | 2026-02-17 | Phase 8 Addendum applied — Kyle directives ADD-1 through ADD-5. RBAC enforcement gap documented (ADD-1). JWT fallback removal mandated (ADD-2). Header bypass removal mandated (ADD-3). API versioning plan added (ADD-4). Post-audit endpoint census directive added (ADD-5). All Finding decisions updated with Kyle directives. New §15 added. ToC renumbered (16→17 sections). |
