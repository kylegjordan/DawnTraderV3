/**
 * Global trading mode state
 * Shared between api.ts and queryClient.ts to avoid circular dependencies
 */

let currentTradingMode: 'live' | 'paper' = 'paper';

export function setGlobalTradingMode(mode: 'live' | 'paper') {
  currentTradingMode = mode;
}

export function getGlobalTradingMode(): 'live' | 'paper' {
  return currentTradingMode;
}
