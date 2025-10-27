import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Gauge, TrendingUp, Activity, Target, DollarSign, Percent } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";

interface TradingPaceData {
  tradingPace: 'conservative' | 'baseline' | 'optimistic' | 'aggressive';
}

interface GuardrailsData {
  riskPerTrade: number;
  maxOpenPositions: number;
}

interface PortfolioData {
  balance: number;
}

// Phase 27.F.15.UI-SYNC.9: Updated to match trading-pace-control.tsx PACE_CONFIGS
const PACE_CONFIGS = {
  conservative: {
    label: 'Conservative',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    targetWinRate: 60,
    targetTradesPerDay: 2,
    targetEarningsPerTrade: 15,
    targetDailyProfit: 30,
    targetYearlyProfit: 10950, // 30 * 365
  },
  baseline: {
    label: 'Baseline',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    targetWinRate: 55,
    targetTradesPerDay: 4,
    targetEarningsPerTrade: 25,
    targetDailyProfit: 100,
    targetYearlyProfit: 36500, // 100 * 365
  },
  optimistic: {
    label: 'Optimistic',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    targetWinRate: 50,
    targetTradesPerDay: 6,
    targetEarningsPerTrade: 35,
    targetDailyProfit: 210,
    targetYearlyProfit: 76650, // 210 * 365
  },
  aggressive: {
    label: 'Aggressive',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    targetWinRate: 45,
    targetTradesPerDay: 8,
    targetEarningsPerTrade: 45,
    targetDailyProfit: 360,
    targetYearlyProfit: 131400, // 360 * 365
  },
};

export function LATTIDashboardWidget() {
  const { mode, isPaper } = useTradingMode();
  
  // Fetch trading pace
  const { data: paceData, isLoading: paceLoading } = useQuery<TradingPaceData>({
    queryKey: ['system', 'trading-pace', mode],
    queryFn: () => fetch('/api/system/trading-pace', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }).then(r => r.json()),
  });

  // Fetch guardrails for risk per trade
  const { data: guardrails, isLoading: guardrailsLoading } = useQuery<GuardrailsData>({
    queryKey: ['guardrails', mode],
    queryFn: () => fetch(`/api/guardrails?mode=${mode}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }).then(r => r.json()),
  });

  // Phase 27.F.15.UI-SYNC.9: Fetch portfolio balance for Target Daily Avg Earning %
  const { data: portfolioData, isLoading: portfolioLoading } = useQuery<PortfolioData>({
    queryKey: ['/api/portfolio/balance', mode],
    queryFn: async () => apiRequest('GET', `/api/portfolio/balance?mode=${mode}`),
  });

  const isLoading = paceLoading || guardrailsLoading || portfolioLoading;

  if (isLoading) {
    return (
      <Card className={cn("w-full", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-latti-dashboard">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Gauge className="w-5 h-5" />
            <span>LATTI Trading Pace</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  const pace = paceData?.tradingPace || 'baseline';
  const config = PACE_CONFIGS[pace];
  const riskPerTrade = guardrails?.riskPerTrade || 0;

  // Phase 27.F.15.UI-SYNC.9: Calculate Target Daily Avg Earning %
  const portfolioBalance = portfolioData?.balance || 0;
  const targetDailyAvgEarningPct = portfolioBalance > 0 
    ? ((config.targetDailyProfit / portfolioBalance) * 100).toFixed(2)
    : '0.00';

  return (
    <Card 
      className={cn(
        "w-full shadow-md border-2",
        config.borderColor,
        config.bgColor,
        isPaper && "ring-2 ring-blue-500/20"
      )} 
      data-testid="widget-latti-dashboard"
    >
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            <span>LATTI Trading Pace</span>
            {isPaper && (
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-500/20 text-blue-600 dark:text-blue-400">
                SIMULATED
              </span>
            )}
          </div>
          <span className={cn("text-lg font-bold", config.color)}>
            {config.label}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Trading Pace Description */}
        <div className={cn("p-3 rounded-lg", config.bgColor, "border", config.borderColor)}>
          <p className="text-sm text-muted-foreground">
            {pace === 'conservative' && 'Higher win rate, fewer trades, lower risk per trade'}
            {pace === 'baseline' && 'Balanced approach with moderate risk and frequency'}
            {pace === 'optimistic' && 'More frequent trading with moderate risk tolerance'}
            {pace === 'aggressive' && 'Maximum trading frequency with tighter stop-losses'}
          </p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Risk Per Trade */}
          <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
            <Target className="w-4 h-4 mt-0.5 text-primary" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">Risk/Trade</div>
              <div className="text-lg font-bold font-mono">{riskPerTrade.toFixed(2)}%</div>
            </div>
          </div>

          {/* Trades Per Day */}
          <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
            <Activity className="w-4 h-4 mt-0.5 text-primary" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">Trades/Day</div>
              <div className="text-lg font-bold font-mono">{config.targetTradesPerDay}</div>
            </div>
          </div>

          {/* Earnings Per Trade */}
          <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
            <DollarSign className="w-4 h-4 mt-0.5 text-primary" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">$/Trade</div>
              <div className="text-lg font-bold font-mono">${config.targetEarningsPerTrade}</div>
            </div>
          </div>

          {/* Win Rate Target */}
          <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
            <TrendingUp className="w-4 h-4 mt-0.5 text-primary" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
              <div className="text-lg font-bold font-mono">{config.targetWinRate}%</div>
            </div>
          </div>
        </div>

        {/* Profit Targets */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Daily Target:</span>
            <span className="text-sm font-bold font-mono text-green-600 dark:text-green-400">
              ${config.targetDailyProfit.toFixed(2)}
            </span>
          </div>
          
          {/* Phase 27.F.15.UI-SYNC.9: Target Daily Avg Earning % */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-between items-center cursor-help">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Percent className="w-3 h-3" />
                    Target Daily Avg Earning %:
                  </span>
                  <span className={cn(
                    "text-sm font-bold font-mono",
                    parseFloat(targetDailyAvgEarningPct) > 0 
                      ? "text-green-600 dark:text-green-400" 
                      : "text-muted-foreground"
                  )}>
                    +{targetDailyAvgEarningPct}%
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  Expected average percent return per day
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Formula: (${config.targetDailyProfit} / ${portfolioBalance.toFixed(2)}) × 100
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Yearly Target:</span>
            <span className="text-sm font-bold font-mono text-green-600 dark:text-green-400">
              ${config.targetYearlyProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
