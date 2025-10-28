import { useQuery } from "@tanstack/react-query";
import { useTradingMode } from "@/contexts/trading-mode-context";

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
  
  const { data: balance = 850, isLoading, error } = useQuery({
    queryKey: ['/api/portfolio/overview', mode],
    // Wait for mode to be available before executing query
    enabled: !!mode,
    // Phase 27.F.24: Extract only the totalValue to prevent object reference changes
    select: (data: any) => {
      // Handle API errors gracefully - use fallback balance
      if (!data || typeof data.totalValue === 'undefined') {
        console.warn('[usePortfolioBalance] No totalValue in response, using fallback:', data);
        return 850;
      }
      return data.totalValue;
    },
    // Phase 27.F.24: Only notify when the actual data changes, not on object reference changes
    notifyOnChangeProps: ['data'],
    // Phase 27.F.24: Reduce refetch frequency for Goals Engine (doesn't need real-time updates)
    staleTime: 30000, // 30 seconds
    refetchInterval: false, // No polling - rely on WebSocket invalidations only
    refetchOnWindowFocus: false, // Don't refetch on window focus
    // Don't throw errors - just use fallback
    throwOnError: false,
    retry: false, // Don't retry failed requests - use fallback immediately
  });

  // Log errors for debugging
  if (error) {
    console.warn('[usePortfolioBalance] API error, using fallback balance:', error);
  }

  return { balance, isLoading };
}
