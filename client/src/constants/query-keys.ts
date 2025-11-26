// REB 2.8.10B - Portfolio Query Keys Constants
// Centralized query key definitions to prevent drift between implementation and documentation

/**
 * REB 2.8.10B: Complete Portfolio Query Keys (24 total)
 * 
 * Portfolio-related query keys that should be invalidated
 * when portfolio_balance_updated WebSocket events are received.
 * 
 * This ensures sub-second updates across:
 * - Dashboard (Portfolio Value Widget, LATTI Goals Mirror)
 * - Goals Engine (Goals Table, Target Daily Goals, Projected Growth)
 * - LATTI (Dashboard widget, standalone page)
 * - Reports (Trading Activity, Earnings Charts)
 * - TopBar (Portfolio display)
 * 
 * Coverage breakdown:
 * - Portfolio queries (8): Base endpoints + history/charts
 * - Paper metrics (4): Paper trading simulation data
 * - Earnings summaries (2): Mode-specific earnings
 * - Daily briefs (2): Mode-specific briefs
 * - Goals Engine (4): Goals summaries (mode-specific + agnostic)
 * - Trading status (2): Engine status and metrics
 * - LATTI (1): Daily targets
 * - Settings (1): System settings with portfolio values
 * 
 * IMPORTANT: This list was compiled by auditing ALL React Query consumers
 * in the codebase using grep searches. Do not remove entries without verifying
 * they're unused across Dashboard, Goals Engine, LATTI, Reports, and TopBar.
 */
export const PORTFOLIO_QUERY_KEYS = [
  // Portfolio queries (8) - mode-specific and mode-agnostic
  '/api/paper/portfolio/state',
  '/api/portfolio/overview?mode=live',
  '/api/portfolio/overview?mode=paper',
  '/api/portfolio/overview',
  '/api/portfolio/metrics',
  '/api/portfolio/earnings',
  '/api/portfolio/earnings-chart',
  '/api/portfolio/history',
  
  // Paper portfolio metrics queries (4)
  '/api/paper/metrics/portfolio',
  '/api/paper/metrics/earnings',
  '/api/paper/metrics/earnings-chart',
  '/api/paper/metrics/history',
  
  // Earnings summaries (2) - mode-specific
  '/api/earnings/summary?mode=paper',
  '/api/earnings/summary?mode=live',
  
  // Daily briefs (2) - EXACT endpoints from workflow logs
  '/api/paper/briefs/today',
  '/api/daily-briefs/today',
  
  // Goals Engine queries (4) - mode-specific and mode-agnostic
  '/api/goals',
  '/api/goals/summary',
  '/api/goals/summary?mode=paper',
  '/api/goals/summary?mode=live',
  
  // Trading status queries (2)
  '/api/paper-sim/status',
  '/api/paper-sim/metrics',
  
  // LATTI queries (1)
  '/api/latti/targets',
  
  // Settings and configuration (1) - contains portfolioValue field
  '/api/settings',
] as const;

/**
 * Total count of portfolio-related queries
 */
export const PORTFOLIO_QUERY_COUNT = PORTFOLIO_QUERY_KEYS.length;

/**
 * Paper trading query keys (subset used for paper mode operations)
 */
export const PAPER_QUERY_KEYS = [
  '/api/paper/portfolio/state',
  '/api/paper-sim/status',
  '/api/goals/summary?mode=paper',
  '/api/latti/targets',
  '/api/system/trading-pace',
] as const;

/**
 * Live trading query keys (subset used for live mode operations)
 */
export const LIVE_QUERY_KEYS = [
  '/api/portfolio/overview?mode=live',
  '/api/trading/status',
  '/api/goals/summary?mode=live',
  '/api/portfolio/metrics',
  '/api/latti/targets',
  '/api/system/trading-pace',
] as const;
