// REB 2.8.10B - Global Portfolio Refresh Listener
// Listens to portfolio_balance_updated WebSocket events and invalidates ALL portfolio queries
// Hoisted to app shell to work on all pages (Dashboard, Goals Engine, LATTi, etc.)

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { unstable_batchedUpdates } from 'react-dom';
import { useWebSocket } from '@/hooks/use-websocket';
import { PORTFOLIO_QUERY_KEYS } from '@/constants/query-keys';

/**
 * Global WebSocket listener that invalidates portfolio-related queries
 * when portfolio_balance_updated events are received.
 * 
 * This component should be mounted at the app shell level (App.tsx)
 * to ensure portfolio updates work on all pages, not just Dashboard.
 */
export function PortfolioRefreshListener() {
  const queryClient = useQueryClient();
  const { messages: wsMessages } = useWebSocket();
  
  useEffect(() => {
    const balanceUpdates = wsMessages.filter((msg: any) => msg.type === 'portfolio_balance_updated');
    
    if (balanceUpdates.length > 0) {
      const latestUpdate = balanceUpdates[balanceUpdates.length - 1];
      console.log('[REB 2.8.10B][WS] portfolio_balance_updated → refreshing portfolio-related queries', latestUpdate.payload);
      
      // REB 2.8.10B: Invalidate ALL portfolio-related queries for global refresh
      // Using centralized constants to prevent drift between implementation and documentation
      unstable_batchedUpdates(() => {
        PORTFOLIO_QUERY_KEYS.forEach(queryKey => {
          queryClient.invalidateQueries({ queryKey: [queryKey] });
        });
      });
    }
  }, [wsMessages, queryClient]);
  
  // This component doesn't render anything - it's purely for side effects
  return null;
}
