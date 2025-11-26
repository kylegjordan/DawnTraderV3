// REB 2.8.10B - Portfolio Query Keys Constants
// Centralized query key definitions to prevent drift between implementation and documentation

/**
 * REB 2.8.10B: Definitive Portfolio Query Keys (26 total)
 * 
 * Portfolio-related query keys that MUST be invalidated
 * when portfolio_balance_updated WebSocket events are received.
 * 
 * This ensures sub-second updates across:
 * - Dashboard (Portfolio Value Widget, LATTI Goals Mirror)
 * - Goals Engine (Goals Table, Target Daily Goals, Projected Growth)
 * - LATTI (Dashboard widget, standalone page)
 * - Reports (Trading Activity, Earnings Charts)
 * - TopBar (Portfolio display, Trading Pace)
 * 
 * Architect-verified coverage breakdown:
 * - Portfolio core (3): Paper state + mode-specific overviews
 * - Portfolio metrics (8): Earnings, history, charts (both modes)
 * - Earnings summaries (2): Mode-specific earnings data
 * - Briefing feeds (4): Both daily brief variants (with/without /today)
 * - Goals/LATTI (5): Goals summaries, LATTI targets, trading pace
 * - Trading state (3): Paper sim status/metrics + unified status
 * - Settings (1): System settings with portfolio values
 * 
 * CRITICAL: This list was exhaustively audited via architect analysis of ALL
 * React Query consumers. Do not remove entries without architect review.
 */
export const PORTFOLIO_QUERY_KEYS = [
  // Portfolio core (3) - mode-specific state
  '/api/paper/portfolio/state',
  '/api/portfolio/overview?mode=paper',
  '/api/portfolio/overview?mode=live',
  
  // Portfolio metrics (8) - earnings, history, charts (both modes)
  '/api/portfolio/metrics',
  '/api/portfolio/earnings',
  '/api/portfolio/history',
  '/api/portfolio/earnings-chart',
  '/api/paper/metrics/portfolio',
  '/api/paper/metrics/earnings',
  '/api/paper/metrics/history',
  '/api/paper/metrics/earnings-chart',
  
  // Earnings summaries (2) - mode-specific
  '/api/earnings/summary?mode=paper',
  '/api/earnings/summary?mode=live',
  
  // Briefing feeds (4) - both daily brief variants
  '/api/paper/briefs',
  '/api/paper/briefs/today',
  '/api/daily-briefs',
  '/api/daily-briefs/today',
  
  // Goals/LATTI (5) - mode-specific + trading pace
  '/api/goals',
  '/api/goals/summary?mode=paper',
  '/api/goals/summary?mode=live',
  '/api/latti/targets',
  '/api/system/trading-pace',
  
  // Trading state (3) - paper sim + unified status
  '/api/paper-sim/status',
  '/api/paper-sim/metrics',
  '/api/trading/status',
  
  // Settings (1) - contains portfolioValue field
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
