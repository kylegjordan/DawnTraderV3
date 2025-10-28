import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Gauge, TrendingUp, Activity, Target, DollarSign, Percent, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useTrading } from "@/hooks/use-trading";
import { memo } from "react";

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

// Phase 27.F.27: LATTI Targets from API
interface LATTITargets {
  mode: string;
  preset: string;
  portfolio_balance: number;
  risk_per_trade: number;
  trades_per_day: number;
  earnings_per_trade: number;
  daily_profit: number;
  target_daily_avg_earning_pct: string;
  max_risk_per_trade_limit: number;
  calculated_at: string;
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

// Phase 27.F.27: Wrap in memo to prevent unnecessary re-renders
const LATTIDashboardWidgetComponent = () => {
  const { mode, isPaper } = useTradingMode();
  const { portfolioMetrics, portfolioLoading } = useTrading();
  
  // Fetch trading pace
  const { data: paceData, isLoading: paceLoading } = useQuery<TradingPaceData>({
    queryKey: ['/api/system/trading-pace'],
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  // Fetch guardrails for risk per trade
  const { data: guardrails, isLoading: guardrailsLoading } = useQuery<GuardrailsData>({
    queryKey: ['guardrails', mode],
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  // Phase 27.F.27: Fetch LATTI targets from API (same pattern as Goals Engine)
  const currentPace = paceData?.tradingPace || 'baseline';
  const { data: lattiTargets, isLoading: lattiLoading } = useQuery({
    queryKey: ['/api/latti/targets', mode, currentPace],
    queryFn: async () => {
      return apiRequest('GET', `/api/latti/targets?mode=${mode}`) as Promise<LATTITargets>;
    },
    // Phase 27.F.27: No flicker - strict no-refetch settings
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnMount: true, // Allow mount refetch for preset changes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    // Phase 27.F.27: Use select to extract and transform the target percentage
    select: (data: LATTITargets) => ({
      ...data,
      targetDailyAvgEarningPct: data.target_daily_avg_earning_pct,
    }),
  });

  const isLoading = paceLoading || guardrailsLoading || portfolioLoading || lattiLoading;

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

  // Phase 27.F.27: Use LATTI targets from API and format with proper sign handling
  const rawTargetPct = lattiTargets?.targetDailyAvgEarningPct || '0.00';
  const targetPctValue = parseFloat(rawTargetPct);
  
  // Format the percentage with proper sign handling
  const targetDailyAvgEarningPct = (() => {
    if (isNaN(targetPctValue)) return '0.00';
    // Phase 27.F.27: Handle negative zero edge case (e.g., parseFloat("-0.0004") → -0)
    const isNegativeZero = Object.is(targetPctValue, -0);
    const formattedValue = targetPctValue.toFixed(2);
    // If value rounds to zero but was originally negative, preserve the sign
    if (isNegativeZero || (formattedValue === '0.00' && rawTargetPct.trim().startsWith('-'))) {
      return '-0.00';
    }
    const sign = targetPctValue > 0 ? '+' : targetPctValue < 0 ? '' : '';
    return `${sign}${formattedValue}`;
  })();
  
  // Determine color based on the formatted value (more reliable than parsed number)
  const isPositive = targetDailyAvgEarningPct.startsWith('+');
  const isNegative = targetDailyAvgEarningPct.startsWith('-');
  
  const portfolioBalance = lattiTargets?.portfolio_balance || portfolioMetrics?.totalValue || 850;

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
          
          {/* Phase 27.F.27: Target Daily Avg Earning % from LATTI API */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-between items-center cursor-help" data-testid="latti-target-daily-earning">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    {isPaper ? 'Target Daily Avg Earning (Paper)' : 'Target Daily Avg Earning (Live)'}:
                  </span>
                  <span 
                    className={cn(
                      "text-sm font-bold font-mono",
                      {
                        "text-blue-600 dark:text-blue-400": isPositive,
                        "text-red-600 dark:text-red-400": isNegative,
                        "text-muted-foreground": !isPositive && !isNegative,
                      }
                    )}
                    data-testid="latti-target-value"
                  >
                    {targetDailyAvgEarningPct}%
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs font-semibold">
                  Calculated from Goals Engine preset
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Source: LATTI targets for {config.label} pace
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Changes when you adjust trading pace in Goals Engine
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
};

// Phase 27.F.27: Export memoized component to prevent unnecessary re-renders
export const LATTIDashboardWidget = memo(LATTIDashboardWidgetComponent);
