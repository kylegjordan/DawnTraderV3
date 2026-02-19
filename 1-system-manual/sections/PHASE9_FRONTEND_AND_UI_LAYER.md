# Phase 9: Frontend Architecture & UI Layer

> **Audit Date**: 2026-02-17
> **Auditor**: Claude Code (System Cartographer)
> **Scope**: All files under `client/src/` — 189 total files: 25 pages, 133 components (in subdirectories), 14 hooks, 9 lib files, 2 contexts, 2 utils, 48 shadcn/ui primitives
> **Includes**: ADD-5 Endpoint Census (cross-referencing frontend API usage against ~750 server endpoints)

---

## Table of Contents

1. [Technology Stack & Build System](#1-technology-stack--build-system)
2. [Application Shell & Routing](#2-application-shell--routing)
3. [Authentication & Token Management](#3-authentication--token-management)
4. [Server State Management (React Query)](#4-server-state-management-react-query)
5. [Real-Time Communication (WebSocket)](#5-real-time-communication-websocket)
6. [Trading Mode Context](#6-trading-mode-context)
7. [Role-Based Access Control (Frontend RBAC)](#7-role-based-access-control-frontend-rbac)
8. [Core Hooks](#8-core-hooks)
9. [Layout Architecture](#9-layout-architecture)
10. [Page Inventory & Routing Map](#10-page-inventory--routing-map)
11. [Component Inventory](#11-component-inventory)
12. [Walter AI Integration Points](#12-walter-ai-integration-points)
13. [Performance Monitoring](#13-performance-monitoring)
14. [Dead Code & Dead Pages](#14-dead-code--dead-pages)
15. [ADD-5 Endpoint Census](#15-add-5-endpoint-census)
16. [Production Readiness Concerns](#16-production-readiness-concerns)
17. [Architectural Patterns & Conventions](#17-architectural-patterns--conventions)

---

## 1. Technology Stack & Build System

| Layer | Technology | Version Source |
|-------|-----------|---------------|
| **Framework** | React 18 | TypeScript, JSX |
| **Build Tool** | Vite | HMR error suppression in `main.tsx` |
| **Routing** | wouter | Lightweight, NOT React Router |
| **Server State** | @tanstack/react-query | v5+ (TanStack Query) |
| **UI Components** | shadcn/ui | 48 primitives under `components/ui/` |
| **Styling** | Tailwind CSS | Via `tailwind-merge` + `clsx` in `cn()` |
| **Charts** | Recharts | Used in portfolio-chart.tsx, analytics |
| **Icons** | lucide-react | Throughout all pages |

**Entry Point**: `client/src/main.tsx` (17 lines)
- Mounts React root to `#root`
- Suppresses Vite HMR overlay errors via `console.error` interception

**Utility Foundation**: `client/src/lib/utils.ts` (21 lines)
- `cn()` — `twMerge(clsx(...inputs))` for conditional class merging
- `formatNumberWithCommas()` / `parseCommaFormattedNumber()` — locale-aware number display

---

## 2. Application Shell & Routing

**File**: `client/src/App.tsx` (270 lines)

### Provider Hierarchy (outermost → innermost)

```
QueryClientProvider
  └─ TradingModeProvider
       └─ RequestTraceProvider
            └─ TooltipProvider
                 └─ Router (wouter)
                      └─ Routes
```

### Route Table

| Path | Component | Auth | Notes |
|------|-----------|------|-------|
| `/login` | `LoginPage` | No | Eager-loaded |
| `/register` | `RegisterPage` | No | Eager-loaded, UI link **commented out** |
| `/` | `Dashboard` | Yes | Eager-loaded, default redirect |
| `/dashboard` | `Dashboard` | Yes | Eager-loaded |
| `/active-trades` | `ActiveTradesPage` | Yes | Lazy |
| `/walter` | `WalterPage` | Yes | Lazy |
| `/watchlist` | `WatchlistPage` | Yes | Lazy |
| `/reports` | `ReportsPage` | Yes | Lazy |
| `/daily-brief` | `DailyBriefPage` | Yes | Lazy |
| `/briefings` | `BriefingsPage` | Yes | Lazy |
| `/goals-engine` | `GoalsEnginePage` | Yes | Lazy |
| `/ai-transparency` | `AITransparencyPage` | Yes | Lazy |
| `/analytics` | `AnalyticsPage` | Yes | Lazy |
| `/machine-learning` | `MachineLearningPage` | Yes | Lazy |
| `/insights` | `FilterInsightsPage` | Yes | Lazy |
| `/settings` | `SettingsPage` | Yes | Lazy |
| `/system/config` | `SystemConfigPage` | Yes | Lazy |
| `/systems` | `SystemsPage` | Yes | Lazy |
| `/:rest*` | `NotFound` | No | Catch-all 404 |

### Global Overlays

1. **KillSwitchBanner** — Fixed red banner when `settings.killSwitchTripped === true`. Polls `/api/settings` every 15 seconds.
2. **WalterFloatingAssistant** — Appears on ALL authenticated pages except `/walter`. Context-aware chat widget.
3. **DatabaseAlert** — Warns when Neon database storage exceeds 50%/70% thresholds. Polls hourly.

### RequireAuth Guard

```typescript
function RequireAuth({ children }) {
  const [isValid, setIsValid] = useState(false);
  useEffect(() => {
    ensureValidToken()
      .then(() => setIsValid(true))
      .catch(() => navigate('/login'));
  }, []);
  return isValid ? children : <Loading />;
}
```

Calls `ensureValidToken()` from `lib/auth.ts` on every route transition. If token refresh fails, redirects to `/login`.

---

## 3. Authentication & Token Management

### Token Flow

**File**: `client/src/lib/auth.ts` (118 lines)

```
Login → POST /api/auth/login → { accessToken, refreshToken }
  ↓
saveTokens() → localStorage: accessToken, refreshToken, token (legacy compat)
  ↓
Every API call → ensureValidToken() → check expiry with 5-min buffer
  ↓
If near-expiry → refreshAccessToken() → POST /api/auth/refresh
  ↓
Singleton lock: only ONE refresh request at a time across all tabs/hooks
```

**Key Design**:
- **12-hour access tokens**, 7-day refresh tokens
- **5-minute expiry buffer**: proactive refresh before expiration
- **Singleton refresh lock**: `let refreshPromise: Promise<string | null> | null = null` prevents concurrent refresh requests
- **Backward compatibility**: Stores token as both `accessToken` (new) and `token` (legacy) in localStorage
- On refresh failure: clears all tokens and returns null (caller redirects to login)

### Token Storage Security Concern (Phase 9 Addendum ADD-1)

> **Kyle Directive (Phase 9 Addendum ADD-1)**: Document XSS exposure risk. Recommend future migration to secure cookie or hybrid approach.

**Current state**: JWT tokens are stored in `localStorage`. This is the simplest storage mechanism but has a known security trade-off:

| Storage Method | XSS Risk | CSRF Risk | Current |
|---|---|---|---|
| `localStorage` | **Exposed** — any XSS vector can read tokens | Safe — not auto-sent with requests | **Yes** |
| `httpOnly` cookie | Safe — JavaScript cannot access | Exposed — auto-sent with requests | No |
| Hybrid (short-lived memory + httpOnly refresh) | Minimal | Minimal | No |

**Exposure**: If an XSS vulnerability exists anywhere in the application (including in third-party dependencies), an attacker could read the JWT from `localStorage` and exfiltrate it. The 12-hour access token lifetime gives a large window for exploitation.

**Recommended migration path** (future, not urgent):
1. Move `refreshToken` to an `httpOnly`, `Secure`, `SameSite=Strict` cookie
2. Keep `accessToken` in memory only (not localStorage) — short-lived, re-obtained via refresh cookie
3. Add CSRF protection if cookie-based auth is adopted
4. Reduce access token lifetime from 12 hours to 15–30 minutes when refresh cookie is available

### Biometric Authentication (WebAuthn)

**Files**: `client/src/hooks/useBiometricAuth.ts` (107 lines) — used by login.tsx

- Uses WebAuthn API (`PublicKeyCredential`) for Face ID / Touch ID
- Platform authenticator only (`authenticatorAttachment: "platform"`)
- Stores `biometricUser` and `biometricEnabled` flags in localStorage
- Login flow: `tryBiometricLogin()` → credential verification → returns username
- **Security fix applied**: `disableBiometricLogin()` clears legacy password storage (`biometric_${username}_password`)

**Dead file**: `client/src/hooks/use-biometric-auth.ts` (82 lines) — placeholder, never imported. See [Dead Code](#14-dead-code--dead-pages).

---

## 4. Server State Management (React Query)

**File**: `client/src/lib/queryClient.ts` (144 lines)

### Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| `staleTime` | 15,000ms | Data considered fresh for 15 seconds |
| `retry` | 1 | Single retry on failure |
| `gcTime` | Infinity | Never garbage-collect cached data |
| `refetchOnWindowFocus` | false | No refetch on tab switch |

### Default Query Function: `apiFetch`

**File**: `client/src/lib/api.ts` (118 lines) — Phase 33.C

Every React Query `useQuery` call automatically uses `apiFetch` as the default fetcher. The query key's first element is used as the API URL.

**apiFetch Flow**:
1. `ensureValidToken()` — proactive refresh if near expiry
2. Build request with JWT `Authorization: Bearer ${token}` header
3. Add `x-app-mode: live|paper` header from `getGlobalTradingMode()`
4. Add `Cache-Control: no-store` for mutations
5. 30-second timeout via `AbortController`
6. On 401: attempt token refresh → retry once
7. Parse JSON response

### Mutation Helper: `apiRequest`

```typescript
export async function apiRequest(method: string, url: string, data?: unknown) {
  // Uses apiFetch for the request
  // Records request trace in dev mode (via import.meta.env.DEV)
}
```

### Query Function Factory: `getQueryFn`

Provides configurable 401 behavior:
- `on401: "returnNull"` — returns `null` instead of throwing (used for optional data)
- `on401: "throw"` — throws error (default, used for required data)

---

## 5. Real-Time Communication (WebSocket)

**File**: `client/src/hooks/use-websocket.tsx` (192 lines) — Phase 34.A

### Singleton Pattern

```
Global variables (module scope):
  - globalWs: WebSocket | null
  - globalIsConnected: boolean
  - globalMessages: any[] (last 50, FIFO)
  - globalListeners: Set<(msg) => void>
  - subscriberCount: number
```

The WebSocket is a **true singleton** — shared across all components that call `useWebSocket()`. Connection lifecycle is managed by subscriber counting:

- **First subscriber** (`subscriberCount: 0 → 1`): Opens connection to `ws://host/ws?userId=${userId}`
- **Last unsubscribe** (`subscriberCount: 1 → 0`): Closes connection
- **Multiple subscribers**: All share the same `globalWs` instance

### Heartbeat & Reconnect

| Feature | Value |
|---------|-------|
| Ping interval | 25 seconds |
| Pong timeout | 3 missed pongs → close |
| Reconnect strategy | Exponential backoff |
| Min delay | 1 second |
| Max delay | 30 seconds |

### Message Types Consumed by Frontend

| Message Type | Consumer Components |
|---|---|
| `trading_state_changed` | TradingModeContext, TopBar |
| `trade_update` | FilterHealthWidget, AlertBanner |
| `alerts_updated` | AlertBanner |
| `aj17_report_ready` | AJ17DiagnosticCard |
| `override_state_changed` | useOverrideState hook |
| Context Bridge updates | WalterPage, WalterFloatingAssistant |

---

## 6. Trading Mode Context

**File**: `client/src/contexts/trading-mode-context.tsx` (107 lines) — Phase 27.F.24

### Mode: `'live'` | `'paper'`

**Persistence stack** (multi-layer):
1. **localStorage**: `trading_mode_preference` key
2. **Cross-tab sync**: `StorageEvent` listener detects mode changes in other tabs
3. **WebSocket sync**: `trading_state_changed` event from server overrides local state
4. **Cache invalidation**: Full `queryClient.invalidateQueries()` on every mode change

**Memoized context value** prevents unnecessary re-renders:
```typescript
const value = useMemo(() => ({
  mode, setMode, isLive: mode === 'live', isPaper: mode === 'paper'
}), [mode]);
```

### Trading Mode Singleton

**File**: `client/src/lib/tradingMode.ts` (14 lines)

Global getter/setter (`getGlobalTradingMode()` / `setGlobalTradingMode()`) to avoid circular dependency between `api.ts` and TradingModeContext. Used by `apiFetch` to set `x-app-mode` header.

---

## 7. Role-Based Access Control (Frontend RBAC)

**File**: `client/src/hooks/useUserRole.ts` (109 lines)

### Roles (5 levels)

| Role | Level | Special |
|------|-------|---------|
| `owner` | Highest | Bypasses all permission checks |
| `admin` | High | Bypasses all permission checks |
| `editor` | Medium | Standard permissions |
| `trader` | Low | Trading-specific permissions |
| `viewer` | Lowest | Read-only |

### Permissions (28 types)

Organized into 5 categories:
- **Trading** (6): `start_trading`, `stop_trading`, `close_trade`, `modify_trade`, `approve_trade`, `reject_trade`
- **Settings** (6): `view_settings`, `edit_settings`, `manage_users`, `reset_settings`, `edit_config`, `manage_api_keys`
- **Approval** (4): `approve_actions`, `reject_actions`, `manage_approvals`, `override_approvals`
- **System** (6): `view_system`, `manage_system`, `view_logs`, `export_data`, `run_diagnostics`, `manage_alerts`
- **Data** (6): `view_trades`, `view_portfolio`, `view_analytics`, `view_reports`, `view_ai`, `manage_watchlist`

### Usage Pattern

```typescript
const { can, canAny, canAll, role, isOwner, isAdmin } = useUserRole();

// Permission check
if (can('start_trading')) { /* show button */ }
if (canAny('edit_settings', 'manage_system')) { /* show section */ }
```

**Storage**: Role loaded from `localStorage.getItem('user')` parsed JSON. Synced across tabs via `StorageEvent` listener.

---

## 8. Core Hooks

### use-trading.tsx (461 lines) — Central Trading Hook

The most important hook in the application. Provides all trading-related data and mutations.

**Queries** (all use React Query with auto-refresh):

| Hook | Endpoint | Refresh |
|------|----------|---------|
| `useTradingStatus()` | `/api/trading/status` | 5s polling + WebSocket |
| `useTrading().portfolio` | `/api/portfolio/overview` | 60s |
| `useTrading().activeTrades` | `/api/trades/active` or `/api/paper/trades/active` | 30s |
| `useTrading().recentTrades` | `/api/trades?limit=10` | 60s |
| `useTrading().settings` | `/api/settings` | 300s |
| `useTrading().watchlist` | `/api/watchlist` | 60s |

**Mutations**:
- `startTrading(mode)` — `POST /api/trading/start` (paper-new, paper-continue, live)
- `stopTrading()` — `POST /api/trading/stop`
- `resetPaperSim()` — `POST /api/paper-sim/reset`
- `closeTrade(id)` — `POST /api/trades/${id}/close`
- `updateSettings(data)` — `PUT /api/settings`
- `addToWatchlist(pair)` / `removeFromWatchlist(pair)` — POST/DELETE `/api/watchlist`

**Debounced Invalidation** (Phase 35.3.A): 500ms debounce on `queryClient.invalidateQueries()` to reduce render bursts after WebSocket updates.

**deriveIsActive()** (Phase 32.D-Fix.Final): The authoritative method for determining if trading is active. Uses the `active` boolean from status response.

### use-system-health.tsx (69 lines)

- Polls `/api/system/health` every 15 seconds
- Auto-resync: triggers re-fetch when paper trading status or goals count changes

### use-portfolio-balance.tsx (61 lines)

- Dedicated hook optimized to prevent unnecessary re-renders
- Uses React Query's `select` and `notifyOnChangeProps` for surgical updates

### use-override-state.tsx (89 lines)

- WebSocket listener for `override_state_changed` messages
- Tracks guardrail/filter override state changes from server

### use-throttle-data.ts (45 lines)

- Generic data throttling for chart components
- Prevents high-frequency chart redraws from overwhelming the renderer

### useAudioRecorder.ts (101 lines)

- WebM audio recording for Walter voice input
- Uses `MediaRecorder` API with `audio/webm;codecs=opus`

### useWalterPreferences.tsx (38 lines)

- Manages Walter chat preferences: `viewMode`, `theme`, `tone`, `sendKeyPreference`, `sidebarCollapsed`
- Queries `GET /api/walter/preferences`, mutates via `PUT /api/walter/preferences`

### use-request-trace.tsx (65 lines)

- Dev-mode only (`import.meta.env.DEV`)
- Records API call traces for observability overlay

### use-mobile.tsx (19 lines)

- Simple 768px breakpoint detection via `matchMedia`

### use-toast.ts (191 lines)

- Reducer-pattern toast notification system
- Supports add/update/dismiss/remove operations with auto-dismiss timers

---

## 9. Layout Architecture

### Sidebar (152 lines)

**File**: `client/src/components/layout/sidebar.tsx`

11 navigation items, permission-gated:

| Item | Path | Permission |
|------|------|-----------|
| Dashboard | `/dashboard` | — |
| Active Trades | `/active-trades` | — |
| Walter AI | `/walter` | — |
| Watchlist | `/watchlist` | — |
| Reports | `/reports` | — |
| Daily Brief | `/daily-brief` | — |
| Briefings | `/briefings` | — |
| Goals Engine | `/goals-engine` | — |
| AI Transparency | `/ai-transparency` | `view_ai` |
| Analytics | `/analytics` | `view_analytics` |
| Machine Learning | `/machine-learning` | `view_ai` |

Active trade count badge displayed on "Active Trades" item.

### TopBar (1,042 lines)

**File**: `client/src/components/layout/top-bar.tsx`

The largest layout component. Contains:

1. **Trading Toggle** — Start/Stop trading with confirmation modals
2. **Mode Switch** — Live/Paper toggle with confirmation for live mode
3. **Dual Time Display** — UTC + local time (configurable timezone)
4. **Walter Approvals Bell** — Badge count of pending approvals from `/api/walter/pending-approvals`
5. **Paper Portfolio Metrics Row** — Balance, P/L, active trade count (paper mode only)
6. **Confirmation Modals** — Live trading start confirmation, stop confirmation

**Notable**: 30 `console.log` statements — highest of any component. Production logging concern.

---

## 10. Page Inventory & Routing Map

### Actively Routed Pages (18 pages)

| Page | Lines | Primary API Endpoints | Key Features |
|------|-------|----------------------|-------------|
| `dashboard.tsx` | 146 | Delegates to child components | Portfolio charts, active trades, strategy performance, filter health, alerts, daily brief card |
| `active-trades.tsx` | 141 | Delegates to tabs | 4-tab funnel: Filter Insights → Ready to Buy → Open Trades → Trade History |
| `walter.tsx` | 1,386 | `/api/walter/chats/*`, `/api/transcribe`, `/api/walter/analyze-file` | Full AI chat interface with voice, file upload, approval workflow, conversation management |
| `watchlist.tsx` | 519 | `/api/symbols/search`, `/api/symbols/details` | 3 tabs: AI Opportunities, User Watchlists, Search & Analysis |
| `goals-engine.tsx` | 97 | Delegates to tabs | 5 tabs: Guardrails, Screeners/Filters, Strategies, Diagnostics, Coherency Rules |
| `analytics.tsx` | 1,939 | 8+ endpoints | Market indicators, narrative feed, batch analysis, benchmarks, governance, predictive diagnostics |
| `machine-learning.tsx` | 1,985 | 15+ endpoints | ML scores, predictive adjustments, stability analysis, safety signals, regime archive |
| `ai-transparency.tsx` | 2,074 | 20+ endpoints | Transparency logs, screener calibration, error logs, autonomy confidence, semantic memories, orchestrator |
| `settings.tsx` | 1,122 | `/api/user/profile`, `/api/admin/users/*` | 6 tabs: General, Walter Approvals, Users, API Keys, Audit Log, Config Snapshots |
| `reports.tsx` | 570 | `/api/trades`, `/api/ai/reports`, `/api/reports/export` | Canned reports (tax, performance), custom reports, CSV/PDF export |
| `briefings.tsx` | 527 | `/api/daily-briefs`, `/api/daily-briefs/today` | Current brief + historical briefs with date range navigation |
| `daily-brief.tsx` | 419 | `/api/daily-briefs/today`, `/api/daily-briefs/:date` | Individual brief detail with metrics grid, narrative, trade highlights |
| `systems.tsx` | 29 | Delegates to EnhancedSystemMonitoring | Thin wrapper for system monitoring dashboard |
| `system-config.tsx` | 312 | `/api/config` | Runtime config editor (booleans, numbers, strings) |
| `filter-insights.tsx` | 17 | Delegates to FilterInsights | Minimal wrapper — same component also rendered as tab in active-trades |
| `login.tsx` | 292 | `POST /api/auth/login` | Username/password + optional biometric |
| `register.tsx` | 191 | `POST /api/auth/register` | Account creation — **orphaned** (UI link commented out) |
| `not-found.tsx` | 22 | None | 404 catch-all |

### Dead/Unrouted Pages (7 pages)

See [Dead Code & Dead Pages](#14-dead-code--dead-pages) for full details.

---

## 11. Component Inventory

### Goal Widgets (`components/goals/`)

| Component | Lines | API Endpoints | Notes |
|-----------|-------|--------------|-------|
| `portfolio-value-widget.tsx` | 137 | None (context) | Memoized (35.2A). Dead vars: `availableForTrading`, `inOpenTrades` |
| `earnings-widget.tsx` | 265 | `/api/earnings/summary`, earnings-chart | Hand-rolled SVG sparkline |
| `trading-activity-widget.tsx` | 170 | `/api/trading/activity`, trades/active | 6-option period selector |
| `averages-widget.tsx` | 183 | `/api/trading/averages` | Period options differ from trading-activity |
| `aj17-diagnostic-card.tsx` | 194 | `/api/diagnostics/aj17/*` | Paper-only. AJ16/AJ17 naming inconsistency |

### Trading Components (`components/trading/`)

| Component | Lines | API Endpoints | Notes |
|-----------|-------|--------------|-------|
| `active-trades.tsx` | 254 | `/api/paper/trades/active`, `/api/settings` | Current price simulated as `entryPrice * 1.02` |
| `portfolio-chart.tsx` | 146 | `/api/portfolio/history`, `/api/paper/metrics/history` | Recharts line chart. Dead conditional in `formatDate` |
| `watchlist.tsx` | 219 | `/api/paper-sim/diagnostics/scan` | 4-pair grid with countdown timer |
| `confirm-live-trading-modal.tsx` | 69 | None | Pure presentational confirmation dialog |

### Dashboard Components (`components/dashboard/`)

| Component | Lines | API Endpoints | Notes |
|-----------|-------|--------------|-------|
| `filter-health-widget.tsx` | 143 | `/api/filters/diagnostics`, `/api/trading/status` | WebSocket-synced, adaptive refresh rate |

### Strategy Components (`components/strategy/`)

| Component | Lines | API Endpoints | Notes |
|-----------|-------|--------------|-------|
| `strategy-performance-widget.tsx` | 321 | `/api/metrics/strategies`, `/api/strategy/parameters` | SVG mini bar charts, DHMA params subsection |

### AI Components (`components/ai/`)

| Component | Lines | API Endpoints | Notes |
|-----------|-------|--------------|-------|
| `InteractiveNotification.tsx` | 315 | `/api/intent/approve|reject|dismiss|clear` | Core Walter approval workflow. Legacy/new field fallbacks |

### System Components

| Component | Lines | API Endpoints | Notes |
|-----------|-------|--------------|-------|
| `DailyBriefCard.tsx` | 332 | `/api/daily-briefs/today`, `/api/market-context/latest`, `/api/walter/auto-resolved-today` | 7 market regime configs. Walter auto-maintenance stats |
| `alert-banner.tsx` | 288 | `/api/alerts`, `/api/alerts/*/acknowledge` | Full alert management with WebSocket sync. Dead `user` variable |
| `database-alert.tsx` | 69 | `/api/database/status` | Storage threshold warnings (50%/70%) |
| `maintenance-banner.tsx` | 32 | `/api/maintenance/status` | Conditional maintenance mode banner |
| `mode-banner.tsx` | 71 | None (hooks) | Phase 41.2 trading mode/status display |

### Walter Components

| Component | Lines | Notes |
|-----------|-------|-------|
| `walter-floating-assistant.tsx` | 501 | Floating chat on all pages except /walter. Context-aware, voice input, file upload, Bob Core prefetch, data provenance footer |

---

## 12. Walter AI Integration Points

Despite Walter being deprecated on the backend, the frontend has extensive Walter integration that remains active:

### Pages with Walter Dependencies

| Page/Component | Walter Integration |
|---|---|
| `walter.tsx` | **Entire page** — Full Walter chat interface (1,386 lines) |
| `settings.tsx` | Walter memory config (depth/limit/auto-summarize), Walter Approvals tab |
| `top-bar.tsx` | Walter pending approvals notification bell |
| `walter-floating-assistant.tsx` | Floating Walter chat widget on all authenticated pages |
| `DailyBriefCard.tsx` | Fetches `/api/walter/auto-resolved-today` |
| `InteractiveNotification.tsx` | Walter approval workflow (approve/reject/dismiss/clear) |
| `ai-transparency.tsx` | "Walter Command" and "Walter Action" log categories |

### Walter API Endpoints Referenced by Frontend

- `/api/walter/chats` (GET, POST)
- `/api/walter/chats/:id` (GET, PATCH, DELETE)
- `/api/walter/chats/:id/messages` (POST)
- `/api/walter/chats/:id/pin` / `/unpin` (POST)
- `/api/walter/chats/:id/export` (GET)
- `/api/walter/pending-approvals` (GET)
- `/api/walter/approvals/:id/approve` (POST)
- `/api/walter/approvals/:id/reject` (POST)
- `/api/walter/analyze-file` (POST)
- `/api/walter/preferences` (GET, PUT)
- `/api/walter/auto-resolved-today` (GET)

**Implication**: When the Walter backend is removed (Wave 3), the entire `/walter` page, the floating assistant, the notification bell in TopBar, the Walter Approvals tab in settings, and the auto-maintenance section in DailyBriefCard will all break or become non-functional. A coordinated frontend cleanup wave is required.

---

## 13. Performance Monitoring

### React Profiler Integration

**File**: `client/src/utils/performance-profiler.ts` (262 lines)
**File**: `client/src/components/profiled-route.tsx` (27 lines)

Every authenticated route is wrapped in a `<Profiler>` component via `ProfiledRoute`. The profiler captures:

| Metric | Threshold | Behavior |
|--------|-----------|----------|
| First-paint latency | 800ms | Warning logged if exceeded |
| Per-update duration | 60ms | Warning logged if exceeded |
| Cumulative update time | 120ms | Warning logged if exceeded |

**Console access** (production-exposed via `window.__PERFORMANCE_PROFILER__`):
- `exportPerformanceReport()` — Full metrics report
- `checkPerformanceThresholds()` — Validate against targets

---

## 14. Dead Code & Dead Pages

### Dead/Unrouted Pages (7 files, 2,771 total lines)

| File | Lines | Superseded By | Status |
|------|-------|---------------|--------|
| `walter-approvals.tsx` | 366 | Walter Approvals tab in `settings.tsx` | Dead — not in router |
| `history.tsx` | 253 | Trade History tab in `active-trades.tsx` | Dead — imported in App.tsx but never rendered |
| `admin.tsx` | 303 | Users tab in `settings.tsx` | Dead — not in router |
| `search.tsx` | 187 | Search & Analysis tab in `watchlist.tsx` | Dead — not in router |
| `command-center.tsx` | 901 | Absorbed into `ai-transparency.tsx` | Dead — not in router |
| `analysis.tsx` | 512 | Never wired into router | Dead — unique stock search features lost |
| `settings-old-backup.tsx` | 249 | Current `settings.tsx` | Dead — explicit backup file |

### Orphaned Route

- `register.tsx` (191 lines) — Route exists (`/register`) but UI link to it is commented out. Only reachable via direct URL. Admin-only user creation now.

### Dead Imports

| File | Dead Import | Notes |
|------|-------------|-------|
| `App.tsx` line 7 | `History` from `@/pages/history` | Imported but never rendered in any route |
| `active-trades.tsx` line 4 | `Watchlist` from `@/components/trading/watchlist` | Imported but never rendered in JSX |
| `active-trades.tsx` | `useQuery` from `@tanstack/react-query` | Imported but never called |

### Dead Hook File

| File | Lines | Superseded By |
|------|-------|---------------|
| `use-biometric-auth.ts` | 82 | `useBiometricAuth.ts` (used by login.tsx) |

### Dead Variables in Active Components

| File | Variable(s) | Notes |
|------|-------------|-------|
| `portfolio-value-widget.tsx` lines 67-68 | `availableForTrading`, `inOpenTrades` | Computed but never used in JSX |
| `alert-banner.tsx` line 32 | `user` from `localStorage.getItem('user')` | Defined but never referenced |
| `portfolio-chart.tsx` lines 33-38 | `formatDate` branches | Identical branches for 7D and non-7D (dead conditional) |

### Simulated Data in Active Components

| File | Line | Issue |
|------|------|-------|
| `active-trades.tsx` (component) line 30 | `currentPrice = entryPrice * 1.02` | Hardcoded 2% gain simulation instead of real-time price |

---

## 15. ADD-5 Endpoint Census

> **Directive**: Phase 8 Addendum ADD-5 — Cross-reference frontend API usage against all ~750 server endpoints. Mark unused for removal.

### Census Summary

| Metric | Count |
|--------|-------|
| **Unique API endpoints referenced by frontend** | **~291** |
| **Server endpoints (estimated from Phase 8)** | **~750** |
| **Server endpoints with NO frontend consumer** | **~460** |
| **Frontend coverage of server API** | **~39%** |

### Frontend API Usage by Category

| Category | Count | Key Endpoints |
|----------|-------|--------------|
| Trading | 44 | `/api/trading/*`, `/api/trades/*`, `/api/paper-sim/*`, `/api/paper/*`, `/api/pairs/*`, `/api/trading-signals` |
| System | 21 | `/api/system/*`, `/api/health/*`, `/api/maintenance/*`, `/api/database/*`, `/api/config` |
| AI / Orchestrator | 21 | `/api/orchestrator/*`, `/api/ai/*`, `/api/semantic/*`, `/api/actuation/*` |
| Filter / Diagnostics | 20 | `/api/filters/*`, `/api/diagnostics/*`, `/api/screeners/*`, `/api/schedulers/*` |
| Walter / Bob / Chats | 18 | `/api/walter/*`, `/api/transcribe`, `/api/intent/*` |
| VTS / ML | 16 | `/api/vts/*`, `/api/metrics/*` |
| Learning | 9 | `/api/learning/*`, `/api/historic-signals/*` |
| Auth | 3 | `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh` |
| Portfolio | 4 | `/api/portfolio/*`, `/api/earnings/*` |
| Goals | 5 | `/api/goals/*` |
| Settings | 2 | `/api/settings`, `/api/user/profile` |
| Export / Reports | 2 | `/api/reports/export`, `/api/system/mapping-drift/export` |
| Market | 5 | `/api/market-events`, `/api/market-context/*`, `/api/market-indicators` |
| Admin | 3 | `/api/admin/users`, `/api/admin/users/:id`, `/api/admin/users/:id/reset-password` |
| Other / Misc | 118 | Various endpoints across pages |

### Top Files by API Density

| File | Unique Endpoints | Notes |
|------|-----------------|-------|
| `enhanced-system-monitoring.tsx` | ~60 | **Massive consumer** — includes speculative/aspirational API namespaces |
| `ai-transparency.tsx` | ~27 | Central observability hub |
| `use-trading.tsx` | ~24 | Core trading hook |
| `top-bar.tsx` | ~22 | Layout header with trading controls |
| `machine-learning.tsx` | ~15 | ML dashboard |
| `walter.tsx` | ~14 | Walter chat interface |

### Speculative/Aspirational Endpoints (enhanced-system-monitoring.tsx)

The `enhanced-system-monitoring.tsx` component references ~60 endpoints, many of which appear to be aspirational — API namespaces that likely do NOT exist on the server:

- `/api/ethics/*` — AI ethics endpoints
- `/api/collaboration/*` — Multi-agent collaboration
- `/api/federation/*` — Federated learning
- `/api/knowledge/*` — Knowledge management
- `/api/oversight/*` — System oversight
- `/api/alignment/*` — AI alignment
- `/api/introspection/*` — Self-analysis
- `/api/reasoning/*` — Reasoning chain endpoints

These endpoints were likely added as UI scaffolding for features that were never implemented on the backend. They will return 404s. The component handles this gracefully (React Query error states), but the dead API references should be cleaned up.

### Direct Window/Location API Calls

Two pages bypass React Query and use direct browser navigation for API calls:

| File | Endpoint | Method |
|------|----------|--------|
| `analytics.tsx` | `/api/system/mapping-drift/export` | `window.open()` |
| `reports.tsx` | `/api/reports/export` | `window.open()` |

### system-config.tsx Bypasses apiFetch

`system-config.tsx` uses raw `fetch()` with `localStorage.getItem('token')` instead of the `apiRequest` utility. This bypasses the centralized auth flow, token refresh, timeout handling, and request tracing.

---

## 16. Production Readiness Concerns

### Excessive Console Logging

**Total**: 123 `console.log` statements across the frontend codebase.

| File | Count | Debug Tags |
|------|-------|-----------|
| `top-bar.tsx` | 30 | Various |
| `api.ts` | 16 | `[11.7E]` |
| `performance-profiler.ts` | 12 | `[35.1]` |
| `use-websocket.tsx` | 11 | Various |
| `active-trades-v2.tsx` | 11 | Various |
| Goal widgets (4 files) | ~8 | `[35.2A]` — log on every render |

**Impact**: Performance degradation on high-frequency components (goal widgets re-render every data refresh). Information leakage in production (API tokens, trading states, internal metrics visible in browser console).

**Recommendation**: Replace all `console.log` debug statements with either:
- Conditional dev-mode logging (`import.meta.env.DEV && console.log(...)`)
- Remove entirely for production builds

### Window-Exposed Debug Objects

| Global | Purpose | Risk |
|--------|---------|------|
| `window.__PERFORMANCE_PROFILER__` | Profiler metrics | Low — performance data only |
| `window.exportPerformanceReport` | Full profiler report | Low |
| `window.checkPerformanceThresholds` | Threshold validation | Low |

---

## 17. Architectural Patterns & Conventions

### Patterns Observed

1. **Paper/Live Mode Branching**: Nearly all data hooks use separate API paths for paper (`/api/paper/*`) vs live (`/api/*`) mode. The `useTradingMode()` context drives this branching.

2. **Lazy Loading**: All authenticated pages except Dashboard and LoginPage use `React.lazy()` for code splitting.

3. **Tab Consolidation Pattern**: The codebase shows an evolution from standalone pages to tabbed consolidation:
   - Search → watchlist tab
   - History → active-trades tab
   - Admin → settings tab
   - Walter Approvals → settings tab
   - Command Center → ai-transparency (absorbed)

4. **Widget Memoization**: Phase 35.2A widgets use `React.memo()` to prevent unnecessary re-renders, with debug logging on each render.

5. **WebSocket + Polling Hybrid**: Critical data (trading status) uses both 5s polling AND WebSocket for real-time updates. Non-critical data uses polling only.

6. **Debounced Invalidation**: Phase 35.3.A pattern — 500ms debounce on query invalidation after WebSocket updates to batch re-renders.

7. **Error Boundaries**: Class-based `ErrorBoundary` components wrap critical pages (active-trades.tsx).

### Technology Decisions

| Decision | Rationale |
|----------|-----------|
| wouter over React Router | Lightweight, minimal bundle size |
| React Query over Redux/Zustand | Server state management fits query/mutation model |
| shadcn/ui over Material/Ant | Copy-paste component ownership, full customization control |
| Recharts over D3 | React-native chart library, simpler API |
| localStorage for auth/preferences | Simple persistence, no external dependency |

### File Size Distribution

| Category | Largest Files | Concern |
|----------|--------------|---------|
| Pages | ai-transparency (2,074), machine-learning (1,985), analytics (1,939) | These are borderline monolithic — should consider component extraction |
| Components | top-bar (1,042), walter-floating-assistant (501) | TopBar is the largest single component |
| Hooks | use-trading (461) | Acceptable for a central data hook |

---

## Phase 9 Registry Summary

| Finding Type | Count |
|---|---|
| Dead/unrouted pages | 7 |
| Orphaned route | 1 (register.tsx) |
| Dead imports in active files | 3 |
| Dead hook file | 1 |
| Dead variables in active components | 3 locations |
| Simulated data in active components | 1 (active-trades currentPrice) |
| Console.log statements (production) | 123 |
| Frontend API endpoints referenced | ~291 |
| Server endpoints with NO frontend consumer | ~460 |
| Speculative/aspirational endpoints (never implemented) | ~60 (enhanced-system-monitoring.tsx) |
| Walter-dependent frontend files | 7+ (will break when Walter backend removed) |
| Files bypassing apiFetch | 1 (system-config.tsx uses raw fetch) |

---

## Phase 9 Addendum — Kyle's Directives (2026-02-17)

> **Kyle's Final Position**: "Phase 9 is mostly accurate. No fabricated claims. No phantom issues. No hidden code misrepresentation. Frontend is stable but: bloated, Walter-heavy, security-light on token handling, and in need of cleanup after audit."

### ADD-1: Token Storage Security Review

JWT tokens stored in `localStorage` create XSS exposure risk. No `httpOnly` cookie protection. Documented in [Section 3 — Token Storage Security Concern](#token-storage-security-concern-phase-9-addendum-add-1).

**Recommendation**: Future migration to secure cookie or hybrid approach (httpOnly refresh cookie + in-memory access token).

### ADD-2: Monolithic Page Refactor Plan

The following pages/components are flagged for component decomposition:

| File | Lines | Decomposition Strategy |
|------|-------|----------------------|
| `ai-transparency.tsx` | 2,074 | Extract each section (transparency logs, calibration, error logs, semantic memories, orchestrator, formula audit, feed health) into standalone components |
| `machine-learning.tsx` | 1,985 | Extract ML scores, predictive adjustments, stability analysis, safety signals, regime archive into individual tab components |
| `analytics.tsx` | 1,939 | Extract narrative feed, batch analysis, benchmarks, governance, predictive diagnostics into standalone components |
| `top-bar.tsx` | 1,042 | Extract trading toggle, mode switch, time display, approvals bell, portfolio metrics row into individual components |

**Timing**: Post-audit cleanup. These pages are functional but unmaintainable at their current size. Each should be decomposed into focused components with clear data contracts.

### ADD-3: Centralized Polling Policy

The frontend uses ad-hoc polling intervals with no centralized policy. Kyle directs defining standard refresh tiers:

| Tier | Interval | Use Case | Current Examples |
|------|----------|----------|-----------------|
| **Critical** | 5s | Trading status, real-time state | `useTradingStatus()` (5s) |
| **Semi-critical** | 15–30s | Health, active trades, alerts | `useSystemHealth()` (15s), active trades (30s), alerts (30s) |
| **Informational** | 60s+ | Portfolio, briefs, settings | Portfolio (60s), settings (300s), database status (3600s) |

**Current inconsistencies**:
- Filter health polls at 10s (paper active) or 60s (inactive) — adaptive, acceptable
- Watchlist scan diagnostics polls at 10s — arguably too aggressive for informational data
- KillSwitchBanner polls `/api/settings` at 15s — could be WebSocket-driven instead
- Goal widgets have no standardized refresh — each sets its own interval

**Recommendation**: Create a `POLLING_TIERS` constant in `lib/` that all hooks reference. Enforce via code review that new queries use the appropriate tier.

### ADD-4: Remove Speculative Endpoints

`enhanced-system-monitoring.tsx` must be cleaned. The ~60 speculative/aspirational API endpoints across `/api/ethics/*`, `/api/collaboration/*`, `/api/federation/*`, `/api/knowledge/*`, `/api/oversight/*`, `/api/alignment/*`, `/api/introspection/*`, `/api/reasoning/*` generate unnecessary 404 network requests. These should be removed and the component simplified to match actual system capabilities.

**Timing**: Post-audit cleanup (can be bundled with ADD-2 decomposition).

### ADD-5: Remove Simulated Price Display

The `entryPrice * 1.02` hardcoded simulation in `components/trading/active-trades.tsx` (line 30) must be replaced with a real price feed. Active trades should display current market price from the price cache or WebSocket price stream.

**Timing**: Pre-MCE — important for accurate paper trading UI.

---

*Phase 9 complete (with addendum). Next: Phase 10 (Testing & Quality Assurance) and Phase 11 (Database Schema & Migrations).*
