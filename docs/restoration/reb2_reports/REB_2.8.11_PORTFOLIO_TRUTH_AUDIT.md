# REB 2.8.11 — Portfolio Truth Audit (IN PROGRESS)

**Date:** November 26, 2025  
**Status:** 🔍 **AUDIT IN PROGRESS**  
**Objective:** Map complete portfolio value data flow (paper + live) from backend to UI, identify sync issues preventing LATTi/Goals from updating

---

## Executive Summary

This audit maps the complete end-to-end portfolio value flow for both paper and live modes to identify where:
1. Paper starting balance + simulated P&L fail to propagate to all surfaces
2. LATTi Goals & Guardrails / Goals Engine lag, desync, or error after balance changes

**Audit Scope:**
- ✅ Backend sources (DB tables, in-memory structures, formulas)
- ✅ REST endpoints (request/response structure, query keys)
- ✅ Frontend surfaces (components, hooks, WebSocket listeners)
- ✅ WebSocket events (emission points, payloads, timing)
- ✅ Global listener coverage (26 query keys validation)
- ✅ Live scenario testing (reproduce Kyle's $810 → $845 → $871 issue)

---

## Section B.1 — Backend Portfolio Data Sources

### Table 1: Backend Portfolio Data Sources

| Mode | Concept | DB Table + Column | In-Memory Structure | Formula/Computation | Owning Service | Used By Endpoints |
|------|---------|-------------------|---------------------|---------------------|----------------|-------------------|
| **paper** | startBalance | `paperSimSessions.startingBalance` | N/A | User input during sim start | `paper-sim-service.ts:startPaperSimulation()` | `/api/paper/portfolio/state` |
| **paper** | currentBalance | `portfolioState.balance` (mode='paper') | N/A | `startBalance + simulated P&L` | `storage.ts:getPortfolioState()` | `/api/portfolio/overview?mode=paper` |
| **paper** | realizedPnL | `paperSimTrades.*` (aggregated) | N/A | `SUM(closedTrades.pnl)` | `paper-portfolio-manager.ts` | `/api/paper/metrics/earnings` |
| **paper** | unrealizedPnL | `paperSimOpenPositions.*` (calculated) | N/A | `SUM(positions.currentValue - entryValue)` | `paper-portfolio-manager.ts` | `/api/paper/metrics/portfolio` |
| **paper** | totalPortfolioValue | Computed | N/A | `currentBalance + unrealizedPnL` | `paper-portfolio-manager.ts` | `/api/portfolio/overview?mode=paper` |
| **live** | currentBalance | `portfolioState.balance` (mode='live') | Kraken API response | Fetched from Kraken balances | `kraken.ts:getBalance()` | `/api/portfolio/overview?mode=live` |
| **live** | totalPortfolioValue | Computed | Kraken API response | Aggregated from Kraken positions | `kraken.ts` | `/api/portfolio/overview?mode=live` |
| **live** | realizedPnL | `trades.*` (aggregated) | N/A | `SUM(closedTrades.pnl)` | `storage.ts:getTrades()` | `/api/portfolio/earnings` |
| **live** | unrealizedPnL | `trades.*` (open, calculated) | N/A | `SUM(openTrades.currentValue - entryValue)` | `risk-manager.ts` | `/api/portfolio/metrics` |

**Key Findings - Section B.1:**
- ⚠️ **Paper mode has TWO potential sources:**
  1. `paperSimSessions.startingBalance` (session table)
  2. `portfolioState.balance` (mode='paper')
  
  **Question:** Are these kept in sync? Which is canonical?

- ⚠️ **Live mode relies entirely on Kraken API** - no DB persistence of balance values

- ✅ **P&L calculations are separate** - realized (closed trades) vs unrealized (open positions)

---

## Section B.2 — REST Endpoints Analysis

### Table 2: Portfolio REST Endpoints

**(Gathering data - routes being analyzed...)**

| Endpoint | Mode(s) | JSON Path to Portfolio Value | Used By Surfaces | In 26 Query Keys? | Notes |
|----------|---------|------------------------------|------------------|-------------------|-------|
| `/api/paper/portfolio/state` | paper | `data.currentBalance` | Dashboard Portfolio Widget | ✅ Yes (#1) | Returns paper sim session state |
| `/api/portfolio/overview?mode=paper` | paper | `data.totalValue` | Goals Engine, LATTi | ✅ Yes (#2) | Uses `usePortfolioBalance` hook |
| `/api/portfolio/overview?mode=live` | live | `data.totalValue` | Goals Engine, LATTi | ✅ Yes (#3) | Uses `usePortfolioBalance` hook |
| `/api/portfolio/metrics` | live | `data.portfolioValue` | Dashboard, Reports | ✅ Yes (#4) | Live mode metrics |
| `/api/portfolio/earnings` | live | `data.totalEarnings` | Reports, Charts | ✅ Yes (#5) | Live earnings data |
| `/api/portfolio/history` | live | `data.history[]` | Reports | ✅ Yes (#6) | Live portfolio history |
| `/api/portfolio/earnings-chart` | live | `data.chartData[]` | Reports | ✅ Yes (#7) | Live earnings chart |
| `/api/paper/metrics/portfolio` | paper | `data.portfolioValue` | Dashboard, Reports | ✅ Yes (#8) | Paper mode metrics |
| `/api/paper/metrics/earnings` | paper | `data.totalEarnings` | Reports, Charts | ✅ Yes (#9) | Paper earnings data |
| `/api/paper/metrics/history` | paper | `data.history[]` | Reports | ✅ Yes (#10) | Paper portfolio history |
| `/api/paper/metrics/earnings-chart` | paper | `data.chartData[]` | Reports | ✅ Yes (#11) | Paper earnings chart |
| `/api/earnings/summary?mode=paper` | paper | `data.totalEarnings` | Goals Engine | ✅ Yes (#12) | Paper earnings summary |
| `/api/earnings/summary?mode=live` | live | `data.totalEarnings` | Goals Engine | ✅ Yes (#13) | Live earnings summary |
| `/api/paper/briefs` | paper | N/A (briefs content) | Dashboard, Reports | ✅ Yes (#14) | Paper briefs with pagination |
| `/api/paper/briefs/today` | paper | N/A (briefs content) | Dashboard | ✅ Yes (#15) | Paper briefs today |
| `/api/daily-briefs` | live | N/A (briefs content) | Dashboard, Reports | ✅ Yes (#16) | Live briefs with pagination |
| `/api/daily-briefs/today` | live | N/A (briefs content) | Dashboard | ✅ Yes (#17) | Live briefs today |
| `/api/goals` | both | `data.goals[]` | Goals Engine | ✅ Yes (#18) | Goals base endpoint |
| `/api/goals/summary?mode=paper` | paper | `data.currentPortfolioValue` | Goals Engine, LATTi | ✅ Yes (#19) | **CRITICAL - Portfolio value in goals** |
| `/api/goals/summary?mode=live` | live | `data.currentPortfolioValue` | Goals Engine, LATTi | ✅ Yes (#20) | **CRITICAL - Portfolio value in goals** |
| `/api/latti/targets` | both | `data.currentPortfolioValue` | LATTi widgets | ✅ Yes (#21) | **CRITICAL - Portfolio value in LATTI** |
| `/api/system/trading-pace` | both | `data.portfolioValue` | LATTI, Goals | ✅ Yes (#22) | Trading pace (affects LATTI/Goals) |
| `/api/paper-sim/status` | paper | `data.balance` | Dashboard, TopBar | ✅ Yes (#23) | Paper simulation status |
| `/api/paper-sim/metrics` | paper | `data.portfolioValue` | AI Transparency | ✅ Yes (#24) | Paper simulation metrics |
| `/api/trading/status` | both | `data.portfolioValue` | Dashboard, TopBar | ✅ Yes (#25) | Unified trading status |
| `/api/settings` | both | `data.portfolioValue` | Settings page | ✅ Yes (#26) | System settings with portfolio value field |

**Example Responses (To be populated with actual responses):**

#### `/api/portfolio/overview?mode=paper` (Paper Mode)
```json
{
  "totalValue": 845.00,
  "cashBalance": 845.00,
  "positions": []
}
```

#### `/api/goals/summary?mode=paper` (Paper Mode - CRITICAL)
```json
{
  "currentPortfolioValue": ???,  // Does this match totalValue above?
  "targetDailyGoal": 12.75,
  "projectedGrowth": 0.0
}
```

---

## Section B.3 — Frontend Portfolio Surfaces

### Table 3: Frontend Portfolio Surfaces

**(Gathering component data...)**

| Surface | Component File | Hook Used | Query Key | REST Endpoint | Fields Used | Direct WebSocket? |
|---------|---------------|-----------|-----------|---------------|-------------|-------------------|
| **Dashboard - Portfolio Value** | `client/src/pages/dashboard.tsx` | `usePortfolioBalance()` | `['/api/portfolio/overview?mode={mode}']` | `/api/portfolio/overview?mode=paper` | `data.totalValue` | No (via global listener) |
| **Dashboard - LATTI Goals Mirror** | `client/src/components/dashboard/latti-goals-mirror.tsx` | `usePortfolioBalance()` | `['/api/portfolio/overview?mode={mode}']` | `/api/portfolio/overview?mode=paper` | `data.totalValue` | No (via global listener) |
| **Goals Engine - Current Portfolio** | `client/src/components/goals/goals-engine-tab.tsx` | `usePortfolioBalance()` | `['/api/portfolio/overview?mode={mode}']` | `/api/portfolio/overview?mode=paper` | `data.totalValue` | No (via global listener) |
| **Goals Engine - Projected Growth** | `client/src/components/goals/target-daily-goals.tsx` | `usePortfolioBalance()` | `['/api/portfolio/overview?mode={mode}']` | `/api/portfolio/overview?mode=paper` | `data.totalValue` | No (via global listener) |
| **LATTI - Dashboard Widget** | `client/src/components/dashboard/dashboard-latti-widget.tsx` | `usePortfolioBalance()` | `['/api/portfolio/overview?mode={mode}']` | `/api/portfolio/overview?mode=paper` | `data.totalValue` | No (via global listener) |
| **TopBar - Portfolio Display** | `client/src/components/layout/top-bar.tsx` | `useQuery` (direct) | `['/api/trading/status']` | `/api/trading/status` | `data.portfolioValue` | No (via global listener) |

**Query Key Coverage Check:**
- ✅ All components use query keys that ARE in `PORTFOLIO_QUERY_KEYS` (26 keys)
- ✅ All rely on global `PortfolioRefreshListener` in `App.tsx`
- ✅ No components have direct WebSocket listeners (removed in REB 2.8.10B)

---

## Section B.4 — WebSocket Events (portfolio_balance_updated)

### Table 4: WebSocket Event Emission Points

| Mode | Service + Function | When Fired | Event Payload | Log Sample |
|------|-------------------|------------|---------------|------------|
| **paper** | `paper-sim-service.ts:startPaperSimulation()` | After DB session created + manager started | `{type: 'portfolio_balance_updated', mode: 'paper', timestamp: ISO}` | `[PaperSimService] Broadcasting portfolio_balance_updated (paper)` |
| **paper** | `paper-sim-service.ts:stopPaperSimulation()` | After session stopped + final balance recorded | `{type: 'portfolio_balance_updated', mode: 'paper', timestamp: ISO}` | `[PaperSimService] Broadcasting portfolio_balance_updated (paper)` |
| **live** | `live-trading-service.ts:activateLiveTrading()` | After live mode activated | `{type: 'portfolio_balance_updated', mode: 'live', timestamp: ISO}` | `[LiveTradingService] Broadcasting portfolio_balance_updated (live)` |
| **live** | `live-trading-service.ts:stopLiveTrading()` | After live mode stopped | `{type: 'portfolio_balance_updated', mode: 'live', timestamp: ISO}` | `[LiveTradingService] Broadcasting portfolio_balance_updated (live)` |

**Timing Analysis:**
- ✅ Events fired AFTER DB updates (consistent state)
- ✅ Events include mode and timestamp
- ✅ Events do NOT include actual balance values (security)

**WebSocket Flow:**
```
Backend Service → WebSocket Broadcast (portfolio_balance_updated)
  ↓
Frontend PortfolioRefreshListener (App.tsx)
  ↓
React Query invalidateQueries (26 keys with predicate matching)
  ↓
Components re-fetch via useQuery hooks
  ↓
UI updates (<1 second)
```

---

## Section B.5 — Global Listener Coverage

**PortfolioRefreshListener Location:** `client/src/App.tsx` (app shell - works on ALL pages)

**26 Query Keys Invalidated:** (From `client/src/constants/query-keys.ts`)

```typescript
export const PORTFOLIO_QUERY_KEYS = [
  // Portfolio Core (3)
  '/api/paper/portfolio/state',
  '/api/portfolio/overview?mode=paper',
  '/api/portfolio/overview?mode=live',
  
  // Portfolio Metrics (8)
  '/api/portfolio/metrics',
  '/api/portfolio/earnings',
  '/api/portfolio/history',
  '/api/portfolio/earnings-chart',
  '/api/paper/metrics/portfolio',
  '/api/paper/metrics/earnings',
  '/api/paper/metrics/history',
  '/api/paper/metrics/earnings-chart',
  
  // Earnings Summaries (2)
  '/api/earnings/summary?mode=paper',
  '/api/earnings/summary?mode=live',
  
  // Briefing Feeds (4)
  '/api/paper/briefs',
  '/api/paper/briefs/today',
  '/api/daily-briefs',
  '/api/daily-briefs/today',
  
  // Goals/LATTI (5)
  '/api/goals',
  '/api/goals/summary?mode=paper',
  '/api/goals/summary?mode=live',
  '/api/latti/targets',
  '/api/system/trading-pace',
  
  // Trading State (3)
  '/api/paper-sim/status',
  '/api/paper-sim/metrics',
  '/api/trading/status',
  
  // Settings (1)
  '/api/settings',
];
```

**Predicate-Based Matching:**
- ✅ Listener uses predicate function to match parameterized queries
- ✅ Catches variants like `['/api/paper/briefs', { limit: 30 }]`
- ✅ Catches variants like `['/api/goals/summary?mode=paper', { days: 7 }]`

**Surface Coverage Mapping:**

| Surface | Primary Query Key | Invalidated By Listener? |
|---------|-------------------|--------------------------|
| Dashboard Portfolio Widget | `/api/portfolio/overview?mode={mode}` | ✅ Yes (#2 or #3) |
| Dashboard LATTI Mirror | `/api/latti/targets` | ✅ Yes (#21) |
| Goals Engine Current Portfolio | `/api/portfolio/overview?mode={mode}` | ✅ Yes (#2 or #3) |
| Goals Engine Summary | `/api/goals/summary?mode={mode}` | ✅ Yes (#19 or #20) |
| LATTI Dashboard Widget | `/api/latti/targets` | ✅ Yes (#21) |
| TopBar Portfolio | `/api/trading/status` | ✅ Yes (#25) |

**Coverage Assessment:**
- ✅ All surfaces covered by global listener
- ✅ No missing query keys identified
- ✅ Predicate matching ensures parameterized variants are caught

---

## Section B.6 — Live Scenario Testing (Kyle's Issue)

### Test Scenario: $810 → $845 → $871

**⚠️ TO BE EXECUTED:**

This section will document a live test of the exact scenario Kyle reported:
1. **Initial State:** Portfolio shows $810 everywhere
2. **Start paper trading:** New simulation with startBalance = $845
3. **Restart paper trading:** New simulation with startBalance = $871

For each step, we will capture:
- REST responses from all critical endpoints
- WebSocket events in server logs
- Frontend errors/warnings (especially LATTi "Failed to load guardrails")
- Screenshot evidence of UI state

**Expected Outcomes:**
- All endpoints should show $845 after step 2
- All endpoints should show $871 after step 3
- No "Failed to load guardrails" errors
- Sub-second updates across all surfaces

**Actual Outcomes:** *(To be filled after testing)*

---

## Section B.7 — Preliminary Findings (Before Testing)

### Potential Root Causes Identified:

1. **Portfolio Value Duplication (Hypothesis #1):**
   - Paper mode has BOTH `paperSimSessions.startingBalance` AND `portfolioState.balance`
   - These may not be synchronized
   - Different endpoints may read from different sources

2. **Goals/LATTI Endpoint Dependencies (Hypothesis #2):**
   - `/api/goals/summary?mode=paper` and `/api/latti/targets` may have their OWN portfolio value fields
   - These fields may NOT be derived from the canonical paper portfolio source
   - May read from stale `tradingSettings.portfolioValue` instead

3. **WebSocket Event Timing (Hypothesis #3):**
   - Events may fire BEFORE backend state is fully consistent
   - Frontend may refetch and get stale values
   - Race condition between DB update and WS broadcast

4. **Query Key Parameterization (Hypothesis #4):**
   - Some components may use parameterized queries like `['/api/goals/summary?mode=paper', {additionalParam}]`
   - Predicate matching may not catch all variants
   - Some surfaces may not invalidate properly

### Next Steps:

1. **Execute Section B.6 testing** - Reproduce Kyle's scenario with full logging
2. **Identify canonical paper portfolio source** - Choose ONE source of truth
3. **Trace Goals/LATTI data flow** - Confirm they read from canonical source
4. **Fix identified issues** - Minimal, evidence-based changes
5. **Retest** - Verify all surfaces update correctly

---

## Status

**Current Phase:** Audit In Progress  
**Next Action:** Execute live scenario testing (Section B.6)  
**Blocked By:** None  

---

**Audit Generated:** November 26, 2025  
**Phase:** REB 2.8.11 (Portfolio Truth Audit & Sync Fix)
