import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useWebSocket } from "@/hooks/use-websocket";
import { apiFetch } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";

interface PortfolioSummaryData {
  ok: boolean;
  startingBalance: number;
  currentBalance: number;
  realizedPnl: number;
  totalPositionValue: number;
  netPnl: number;
  netPnlPercent: number;
  sessionStart: string | null;
  closedTradesCount: number;
}

export function PortfolioSummaryStrip() {
  const { isPaper } = useTradingMode();
  const { messages } = useWebSocket();
  const queryClient = useQueryClient();
  
  const { data, isLoading, isFetching } = useQuery<PortfolioSummaryData>({
    queryKey: ['/api/active-engine/portfolio-summary'],
    queryFn: async () => {
      return await apiFetch('/api/active-engine/portfolio-summary');
    },
    enabled: isPaper,
    refetchInterval: 10000,
    staleTime: 5000,
    refetchOnWindowFocus: true
  });
  
  useEffect(() => {
    if (!isPaper || messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    
    const tradeEventTypes = [
      'active_trade_closed',
      'trade_opened',
      'trade_closed',
      'position_update',
      'active_trade_executed',
      'trading_state_changed',
      'scan_tick'
    ];
    
    if (tradeEventTypes.includes(lastMessage.type)) {
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/portfolio-summary'] });
    }
  }, [messages, isPaper, queryClient]);
  
  if (!isPaper) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 rounded-lg border bg-muted/30 mb-4">
        <div className="text-center col-span-2 md:col-span-5">
          <div className="text-sm text-muted-foreground">Portfolio summary available in Paper Trading mode</div>
        </div>
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 rounded-lg border bg-muted/30 mb-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="text-center">
            <Skeleton className="h-4 w-20 mx-auto mb-1" />
            <Skeleton className="h-6 w-24 mx-auto" />
          </div>
        ))}
      </div>
    );
  }
  
  const portfolio = data || {
    startingBalance: 0,
    currentBalance: 0,
    netPnl: 0,
    netPnlPercent: 0,
    totalPositionValue: 0
  };
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 rounded-lg border bg-muted/30 mb-4">
      <div className="text-center">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">Starting Balance</div>
        <div className="font-mono text-lg font-semibold">${portfolio.startingBalance.toFixed(2)}</div>
      </div>
      <div className="text-center">
        <div className="text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
          Current Balance
          {isFetching && <RefreshCw className="w-3 h-3 animate-spin" />}
        </div>
        <div className="font-mono text-lg font-semibold">${portfolio.currentBalance.toFixed(2)}</div>
      </div>
      <div className="text-center">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">Net P/L ($)</div>
        <div className={cn(
          "font-mono text-lg font-semibold",
          portfolio.netPnl >= 0 ? "text-green-600" : "text-red-600"
        )}>
          {portfolio.netPnl >= 0 ? '+' : ''}${portfolio.netPnl.toFixed(2)}
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">Net P/L (%)</div>
        <div className={cn(
          "font-mono text-lg font-semibold",
          portfolio.netPnlPercent >= 0 ? "text-green-600" : "text-red-600"
        )}>
          {portfolio.netPnlPercent >= 0 ? '+' : ''}{portfolio.netPnlPercent.toFixed(2)}%
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">Open Position Value</div>
        <div className="font-mono text-lg font-semibold">${portfolio.totalPositionValue.toFixed(2)}</div>
      </div>
    </div>
  );
}
