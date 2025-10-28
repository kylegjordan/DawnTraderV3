import { useEffect } from 'react';
import { useWebSocket, WebSocketMessage } from './use-websocket';
import { queryClient } from '@/lib/queryClient';
import { useTradingMode } from '@/contexts/trading-mode-context';

/**
 * Phase 3b: Lottie-Managed Mode + Manual Override UI
 * 
 * Hook for managing override state changes via WebSocket subscriptions.
 * Listens for guardrail.override.changed and filters.override.changed events
 * and invalidates React Query caches to trigger UI updates.
 * 
 * Features:
 * - Real-time synchronization of override state across clients
 * - Automatic cache invalidation for guardrails and filters
 * - Sub-1-second UI update latency
 * - Mode-aware cache invalidation (only invalidates caches for affected mode)
 */
export function useOverrideState() {
  const { messages } = useWebSocket();
  const { mode } = useTradingMode();

  useEffect(() => {
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1] as WebSocketMessage & { mode?: string };
    const messageMode = lastMessage.mode;

    // Only process messages for the current mode
    if (messageMode && messageMode !== mode) {
      return;
    }

    // Listen for guardrail override state changes
    if (lastMessage.type === 'guardrail.override.changed') {
      console.log('[useOverrideState] Guardrail override state changed, refreshing cache for mode:', messageMode || mode);
      
      // Invalidate both guardrails and guardrails-v2 caches
      queryClient.invalidateQueries({ 
        queryKey: ['/api/guardrails', messageMode || mode],
        refetchType: 'all'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/guardrails-v2', messageMode || mode],
        refetchType: 'all'
      });
    }

    // Listen for filters override state changes
    if (lastMessage.type === 'filters.override.changed') {
      console.log('[useOverrideState] Filters override state changed, refreshing cache for mode:', messageMode || mode);
      
      // Invalidate both screeners and filters-v2 caches
      queryClient.invalidateQueries({ 
        queryKey: ['/api/screeners', messageMode || mode],
        refetchType: 'all'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/filters-v2', messageMode || mode],
        refetchType: 'all'
      });
    }

    // Listen for config_update events (existing event type from backend)
    if (lastMessage.type === 'config_update') {
      const payload = lastMessage.data || lastMessage.payload;
      
      // Check if it's a guardrails or filters update
      if (payload?.configType === 'guardrails_v2') {
        console.log('[useOverrideState] Config update received for guardrails_v2, refreshing cache');
        queryClient.invalidateQueries({ 
          queryKey: ['/api/guardrails-v2', messageMode || mode],
          refetchType: 'all'
        });
      } else if (payload?.configType === 'filters_v2') {
        console.log('[useOverrideState] Config update received for filters_v2, refreshing cache');
        queryClient.invalidateQueries({ 
          queryKey: ['/api/filters-v2', messageMode || mode],
          refetchType: 'all'
        });
      }
    }
  }, [messages, mode]);

  return {
    // Hook provides automatic real-time sync via useEffect
    // No return values needed - side effects handle cache invalidation
  };
}
