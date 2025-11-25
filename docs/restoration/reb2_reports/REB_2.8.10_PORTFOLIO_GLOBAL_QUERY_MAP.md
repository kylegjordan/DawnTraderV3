# REB 2.8.10 - Portfolio Global Query Mapping

## Complete Inventory of Portfolio-Related Queries

This document maps every React Query that loads portfolio data across the application.

| File | Component | Query Key | Endpoint | Current Refresh | Needs Update |
|------|-----------|-----------|----------|-----------------|--------------|
| **Dashboard & Main Portfolio** |
| `client/src/pages/dashboard.tsx` | Dashboard (Live) | `/api/portfolio/overview?mode=live` | GET | ✅ 5s, staleTime 0 | No |
| `client/src/pages/dashboard.tsx` | Dashboard (Paper) | `/api/paper/portfolio/state` | GET | ✅ 5s, staleTime 0 | No |
| `client/src/components/trading/portfolio-overview.tsx` | Portfolio Overview (Paper) | `/api/paper/metrics/portfolio` | GET | ❌ Default | **Yes** |
| `client/src/components/trading/portfolio-overview.tsx` | Portfolio Overview (Earnings - Paper) | `/api/paper/metrics/earnings` | GET | ❌ Default | **Yes** |
| `client/src/components/trading/portfolio-overview.tsx` | Portfolio Overview (Earnings - Live) | `/api/portfolio/earnings` | GET | ❌ Default | **Yes** |
| **Portfolio Balance Hook** |
| `client/src/hooks/use-portfolio-balance.tsx` | usePortfolioBalance | `/api/portfolio/overview?mode=${mode}` | GET | ❌ 30s staleTime, no polling | **Yes** |
| **Goals Engine & LATTI** |
| `client/src/components/goals/goals-summary-widget.tsx` | Goals Summary Widget | `/api/goals/summary?mode=${mode}` | GET | ❌ Default | **Yes** |
| `client/src/components/goals/goals-table.tsx` | Goals Table | `/api/goals/summary?mode=${mode}` | GET | ❌ Default | **Yes** |
| `client/src/components/goals/goals-engine-tab.tsx` | Goals Engine Tab (Portfolio Value Usage) | via `usePortfolioBalance` | GET | ❌ 30s staleTime | **Yes** |
| `client/src/components/goals/target-daily-goals.tsx` | Target Daily Goals | `/api/goals/summary?mode=${mode}` | GET | ❌ Default | **Yes** |
| `client/src/components/goals/target-daily-goals.tsx` | Target Daily Goals (Portfolio Balance) | via `usePortfolioBalance` | GET | ❌ 30s staleTime | **Yes** |
| `client/src/components/dashboard/latti-goals-mirror.tsx` | LATTI Goals Mirror | `/api/system/trading-pace` | GET | ❌ No polling | **Yes** |
| `client/src/components/dashboard/latti-goals-mirror.tsx` | LATTI Goals Mirror (Targets) | `/api/latti/targets?mode=${mode}&preset=${pace}` | GET | ❌ No polling | **Yes** |
| `client/src/components/dashboard/latti-goals-mirror.tsx` | LATTI Goals Mirror (Portfolio) | via `usePortfolioBalance` | GET | ❌ 30s staleTime | **Yes** |
| `client/src/components/goals/portfolio-tab.tsx` | Portfolio Tab (Paper Metrics) | `/api/paper/metrics/portfolio` | GET | ❌ Default | **Yes** |
| **Trading Status & Simulation** |
| `client/src/hooks/use-trading.tsx` | useTradingStatus | `/api/trading/status` | GET | ❌ staleTime Infinity, no polling | **Yes** |
| `client/src/hooks/use-trading.tsx` | usePaperSimStatus | `/api/paper-sim/status` | GET | ✅ 5s, staleTime 0 | No |
| `client/src/pages/ai-transparency.tsx` | AI Transparency (Paper Sim) | `/api/paper-sim/metrics` | GET | ✅ 5s, staleTime 0 | No |
| `client/src/pages/ai-transparency.tsx` | AI Transparency (Positions) | `/api/paper-sim/positions` | GET | ✅ 5s, staleTime 0 | No |
| `client/src/components/trading/watchlist.tsx` | Watchlist (Diagnostics) | `/api/paper-sim/diagnostics/scan?mode=paper...` | GET | ✅ 10s | No |
| **Walter & Command Center** |
| `client/src/pages/walter.tsx` | Walter (invalidates) | `/api/trading/status` | Invalidation | N/A | **Add** |
| `client/src/pages/walter.tsx` | Walter (invalidates) | `/api/portfolio/overview` | Invalidation | N/A | **Add** |
| `client/src/pages/walter.tsx` | Walter (invalidates) | `/api/goals/summary` | Invalidation | N/A | **Add** |
| `client/src/pages/command-center.tsx` | Command Center (invalidates) | `/api/goals` | Invalidation | N/A | **Add** |

## Summary

### Queries Already Updated (REB 2.8.9)
- ✅ Dashboard portfolio queries (both paper and live)
- ✅ Paper simulation status
- ✅ AI Transparency metrics

### Queries Needing Updates (REB 2.8.10)

#### High Priority - Portfolio Values
1. **`usePortfolioBalance` hook** - Used by 6+ components
   - Current: 30s staleTime, no polling
   - Target: 5s polling, staleTime 0

2. **Portfolio Overview components**
   - `/api/paper/metrics/portfolio`
   - `/api/portfolio/earnings`
   - `/api/paper/metrics/earnings`

#### High Priority - Goals Engine
3. **Goals summary queries** (3 components)
   - `/api/goals/summary?mode=${mode}`

4. **LATTI components** (2 components)
   - `/api/latti/targets`
   - `/api/system/trading-pace`

#### Medium Priority - Trading Status
5. **useTradingStatus hook**
   - `/api/trading/status`
   - Current: staleTime Infinity
   - Target: 5s polling, staleTime 0

## Query Key Patterns Identified

### Paper Mode
```typescript
'/api/paper/portfolio/state'
'/api/paper/metrics/portfolio'
'/api/paper/metrics/earnings'
'/api/paper-sim/status'
'/api/paper-sim/metrics'
'/api/paper-sim/positions'
```

### Live Mode
```typescript
'/api/portfolio/overview?mode=live'
'/api/portfolio/overview'      // mode-agnostic
'/api/portfolio/earnings'
'/api/portfolio/metrics'
'/api/trading/status'
```

### Goals & LATTI
```typescript
'/api/goals/summary?mode=${mode}'
'/api/latti/targets?mode=${mode}&preset=${pace}'
'/api/system/trading-pace'
'/api/goals-engine/state'      // Not yet found, may need to be created
```

### Mode-Agnostic (usePortfolioBalance)
```typescript
'/api/portfolio/overview?mode=${mode}'  // Dynamically switches based on mode
```

## Invalidation Points Needed

### TopBar Trading Operations
Currently invalidates:
- `/api/paper/portfolio/state` (paper mode)
- `/api/portfolio/overview?mode=live` (live mode)
- `/api/paper-sim/status` (paper mode)
- `/api/trading/status` (live mode)

**Missing invalidations**:
- `/api/portfolio/overview` (mode-agnostic)
- `/api/portfolio/metrics`
- `/api/goals/summary?mode=${mode}`
- `/api/latti/targets` (with mode parameter)
- `/api/goals-engine/state`

### Goals Engine Components
**Need to add invalidations in**:
- goals-engine-tab.tsx
- goals-summary-widget.tsx
- latti-goals-mirror.tsx
- target-daily-goals.tsx

## Standard Query Configuration Target

All portfolio-related queries should use:
```typescript
{
  refetchInterval: 5000,           // 5-second polling
  staleTime: 0,                    // Always consider stale
  refetchOnWindowFocus: true,      // Refetch on tab focus
  refetchOnReconnect: true,        // Refetch on network reconnect
}
```

**Exception**: Paper sim status and metrics already use this configuration.

## Components Using Portfolio Values

### Direct Portfolio Queries
1. Dashboard (main portfolio display)
2. Portfolio Overview component
3. Portfolio Tab in Goals Engine

### Via usePortfolioBalance Hook
1. Goals Engine Tab (projected portfolio growth)
2. Target Daily Goals
3. LATTI Goals Mirror
4. LATTI Dashboard Widget
5. System Truth Panel
6. Dashboard LATTI Widget

**Critical**: Updating `usePortfolioBalance` hook will cascade to all 6+ components.

## Next Steps (Implementation Order)

1. **Update usePortfolioBalance hook** (affects 6+ components)
2. **Update Portfolio Overview queries** (3 endpoints)
3. **Update Goals summary queries** (3 components)
4. **Update LATTI queries** (2 endpoints)
5. **Update useTradingStatus hook**
6. **Add TopBar invalidations** (5 new query keys)
7. **Add backend events** (portfolio_balance_updated)
8. **Add WebSocket listener** (frontend global refresh)

---
**REB 2.8.10 Query Mapping Complete** - Ready for implementation
