// REB 2.8.10B - Portfolio Query Keys Constants
// Centralized query key definitions to prevent drift between implementation and documentation

/**
 * Portfolio-related query keys that should be invalidated
 * when portfolio_balance_updated WebSocket events are received.
 * 
 * This ensures sub-second updates across Dashboard, Goals Engine, and LATTi.
 * 
 * IMPORTANT: This list was compiled by auditing ALL React Query consumers
 * in the codebase. Do not remove entries without verifying they're unused.
 */
export const PORTFOLIO_QUERY_KEYS = [
  // Portfolio queries (mode-specific and mode-agnostic)
  '/api/paper/portfolio/state',
  '/api/portfolio/overview?mode=live',
  '/api/portfolio/overview?mode=paper',
  '/api/portfolio/overview',
  '/api/portfolio/metrics',
  '/api/portfolio/earnings',
  
  // Paper portfolio metrics queries
  '/api/paper/metrics/portfolio',
  '/api/paper/metrics/earnings',
  '/api/paper/metrics/earnings-chart',
  '/api/paper/metrics/history',
  '/api/paper/briefs',
  
  // Goals Engine queries (mode-specific and mode-agnostic)
  '/api/goals',
  '/api/goals/summary',
  '/api/goals/summary?mode=paper',
  '/api/goals/summary?mode=live',
  
  // Trading status queries
  '/api/paper-sim/status',
  '/api/trading/status',
  '/api/trading/results',
  
  // LATTI queries
  '/api/latti/targets',
  '/api/system/trading-pace',
  
  // Settings and configuration (may affect portfolio calculations)
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
