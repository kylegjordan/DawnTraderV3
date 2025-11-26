import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Filter, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/use-websocket";
import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";

interface FilterDiagnostics {
  pairsScanned: number;
  eligiblePairs: number;
  topFailureReason: string;
  failurePercent: number;
  timestamp?: string;
}

interface TradingStatus {
  mode: 'live' | 'paper';
  active: boolean;
}

export function FilterHealthWidget() {
  const { messages: wsMessages } = useWebSocket();

  // Query trading status to determine refresh rate
  const { data: tradingStatus } = useQuery<TradingStatus>({
    queryKey: ['/api/trading/status'],
    staleTime: 5000,
  });

  const isPaperTradingActive = tradingStatus?.mode === 'paper' && tradingStatus?.active;

  // Use faster refresh when paper trading is active
  const { data: diagnostics, isLoading } = useQuery<FilterDiagnostics>({
    queryKey: ['/api/filters/diagnostics'],
    refetchInterval: isPaperTradingActive ? 10000 : 60000, // 10s when active, 60s otherwise
    staleTime: isPaperTradingActive ? 10000 : 60000,
  });

  // Listen to WebSocket events and refresh filter diagnostics
  useEffect(() => {
    if (wsMessages.length === 0) return;
    
    const latestMessage = wsMessages[wsMessages.length - 1];
    
    // Refresh filter diagnostics on trading state changes or trade updates
    if (latestMessage.type === 'trading_state_changed' || latestMessage.type === 'trade_update') {
      queryClient.invalidateQueries({ queryKey: ['/api/filters/diagnostics'] });
    }
  }, [wsMessages]);

  if (isLoading) {
    return (
      <Card data-testid="filter-health-widget">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filter Health (Last 24h)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!diagnostics) {
    return (
      <Card data-testid="filter-health-widget">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filter Health (Last 24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No diagnostic data available</p>
        </CardContent>
      </Card>
    );
  }

  const eligiblePercent = diagnostics.pairsScanned > 0 
    ? ((diagnostics.eligiblePairs / diagnostics.pairsScanned) * 100).toFixed(1)
    : '0.0';

  const isHealthy = parseFloat(eligiblePercent) > 1.0;

  return (
    <Card data-testid="filter-health-widget">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Filter className="w-4 h-4" />
          Filter Health (Last 24h)
          {isHealthy ? (
            <CheckCircle2 className="w-4 h-4 text-success ml-auto" />
          ) : (
            <XCircle className="w-4 h-4 text-warning ml-auto" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Pairs Scanned</p>
            <p className="text-2xl font-bold" data-testid="text-pairs-scanned">
              {diagnostics.pairsScanned.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Eligible Pairs</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold" data-testid="text-eligible-pairs">
                {diagnostics.eligiblePairs}
              </p>
              <Badge 
                variant={isHealthy ? "default" : "secondary"}
                className={cn(
                  "text-xs",
                  isHealthy ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                )}
              >
                {eligiblePercent}%
              </Badge>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-1">Top Failure Reason</p>
          <p className="text-sm font-medium text-foreground" data-testid="text-failure-reason">
            {diagnostics.topFailureReason || 'No failures'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
