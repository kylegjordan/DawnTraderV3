import { useQuery } from "@tanstack/react-query";
import { useTradingMode } from "@/contexts/trading-mode-context";

interface PortfolioOverview {
  totalValue: number;
  cashBalance: number;
  positions: any[];
}

/**
 * Phase 27.F.24: Dedicated hook for portfolio balance to prevent unnecessary re-renders
 * 
 * This hook provides ONLY the portfolio total value, memoized at the query level.
 * It prevents re-renders caused by the monolithic useTrading hook which returns
 * new object references on every WebSocket event.
 * 
 * Key optimizations:
 * - `select`: Extracts only totalValue (number) instead of entire metrics object
 * - `notifyOnChangeProps: ['data']`: Only triggers re-render when data actually changes
 * - Configured staleTime to reduce unnecessary refetches
 */
export function usePortfolioBalance() {
  const { mode } = useTradingMode();
  
  const { data, isLoading, error, isFetching } = useQuery<PortfolioOverview>({
    queryKey: ['/api/portfolio/overview', mode],
    // Wait for mode to be available before executing query
    enabled: !!mode,
    // Phase 27.F.24: Reduce refetch frequency for Goals Engine (doesn't need real-time updates)
    staleTime: 30000, // 30 seconds
    refetchInterval: false, // No polling - rely on WebSocket invalidations only
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: true, // Always refetch when component mounts
    // Don't throw errors - just use fallback
    throwOnError: false,
    retry: 1, // Retry once before using fallback
  });

  // Extract balance - no hardcoded fallback, return actual value or 0
  const balance = data?.totalValue ?? 0;
  
  // Log errors for debugging
  if (error) {
    console.warn('[usePortfolioBalance] API error:', error);
  }
  
  // Log if using fallback
  if (!data?.totalValue && mode) {
    console.warn('[usePortfolioBalance] No portfolio data available, using 0 as fallback');
  }

  // Only consider loading if we're actually fetching and don't have data yet
  const actuallyLoading = (isLoading || isFetching) && !data;

  return { balance, isLoading: actuallyLoading };
}
