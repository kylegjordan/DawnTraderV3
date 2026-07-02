import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTradingMode } from '@/contexts/trading-mode-context';

interface SystemHealth {
  backend: string;
  paperTrading: {
    isRunning: boolean;
    sessionId: string | null;
    startedBy: string | null;
    startTime: Date | null;
    type: '48hr' | 'manual' | null;
  };
  database: string;
  goals: {
    live: { count: number; hasGoals: boolean };
    paper: { count: number; hasGoals: boolean };
  };
  frontendConnected: boolean;
  lastSync: string;
}

export function useSystemHealth() {
  const queryClient = useQueryClient();
  const { mode } = useTradingMode();
  const previousHealthRef = useRef<SystemHealth | null>(null);

  // Phase 40.2: Aligned to 15s to match MarketEvaluationService cache TTL
  const { data: health } = useQuery<SystemHealth>({
    queryKey: ['/api/system/health'],
    refetchInterval: 15000,
    staleTime: 15000,
    refetchOnWindowFocus: true,
  });

  // Auto-resync when system state changes
  useEffect(() => {
    if (!health || !previousHealthRef.current) {
      previousHealthRef.current = health || null;
      return;
    }

    const prev = previousHealthRef.current;

    // Detect paper trading status change
    if (prev.paperTrading?.isRunning !== health.paperTrading?.isRunning) {
      console.log('[SystemHealth] Paper trading status changed, refreshing dashboard...');
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/metrics'] });
    }

    // Detect goals count change (for current mode)
    const prevGoalsCount = mode === 'live' ? prev.goals?.live?.count : prev.goals?.paper?.count;
    const currentGoalsCount = mode === 'live' ? health.goals?.live?.count : health.goals?.paper?.count;
    
    if (prevGoalsCount !== currentGoalsCount) {
      console.log('[SystemHealth] Goals count changed, refreshing goals widgets...');
      queryClient.invalidateQueries({ queryKey: ['goals', 'summary', mode] });
    }

    // Update reference for next comparison
    previousHealthRef.current = health;
  }, [health, mode, queryClient]);

  return {
    health,
    isHealthy: health?.backend === 'OK' && health?.database === 'OK',
  };
}
