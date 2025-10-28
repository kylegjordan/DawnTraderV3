import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, Target, Activity, Percent, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { usePortfolioBalance } from "@/hooks/use-portfolio-balance";
import { memo, useMemo } from "react";

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

interface ProjectedBalance {
  label: string;
  days: number;
  balance: number;
}

// Phase 27.F.30: Read-only LATTI Goals Mirror for Dashboard
const LATTIGoalsMirrorComponent = () => {
  const { mode, isPaper } = useTradingMode();
  
  // Phase 27.F.30: Use narrow portfolio balance hook to prevent re-renders
  const { balance: portfolioBalance, isLoading: portfolioLoading } = usePortfolioBalance();
  
  // Phase 27.F.30: Currency formatter
  const currencyFormatter = new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD', 
    maximumFractionDigits: 2 
  });

  // Phase 27.F.30: Fetch current trading pace (allow mount refetch for initial load)
  const { data: currentPaceData, isLoading: paceLoading } = useQuery<{ tradingPace: string }>({
    queryKey: ['/api/system/trading-pace'],
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnMount: true, // Phase 27.F.30: Allow mount refetch to get current pace
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });
  
  const currentPace = currentPaceData?.tradingPace || 'baseline';
  
  // Phase 27.F.30: Fetch LATTI targets (disable all background refetches, wait for pace data)
  const { data: lattiTargets, isLoading: lattiLoading } = useQuery<LATTITargets>({
    queryKey: ['/api/latti/targets', mode, currentPace],
    queryFn: async () => {
      // Phase 27.F.30: Pass currentPace as preset parameter to stay synchronized with Goals Engine
      return apiRequest('GET', `/api/latti/targets?mode=${mode}&preset=${currentPace}`);
    },
    enabled: !paceLoading && !!currentPaceData, // Phase 27.F.30: Wait for pace data before fetching
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnMount: true, // Allow mount refetch for preset changes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });

  // Phase 27.F.30: Memoize projection calculations
  const projections = useMemo(() => {
    if (!lattiTargets) return [];
    
    const targetPct = parseFloat(lattiTargets.target_daily_avg_earning_pct);
    
    // Normalize daily rate to decimal and apply safety cap
    let dailyRate = targetPct / 100; // e.g., 0.9% → 0.009
    if (dailyRate > 0.05) {
      dailyRate = 0.05; // Cap at 5% per day to prevent runaway projections
    }
    
    // Use true daily compounding: currentValue * (1 + dailyRate)^days
    if (targetPct > 0 && portfolioBalance > 0) {
      return [
        { label: "Tomorrow", days: 1, balance: portfolioBalance * Math.pow(1 + dailyRate, 1) },
        { label: "1 Week", days: 7, balance: portfolioBalance * Math.pow(1 + dailyRate, 7) },
        { label: "1 Month", days: 30, balance: portfolioBalance * Math.pow(1 + dailyRate, 30) },
        { label: "3 Months", days: 90, balance: portfolioBalance * Math.pow(1 + dailyRate, 90) },
        { label: "6 Months", days: 180, balance: portfolioBalance * Math.pow(1 + dailyRate, 180) },
        { label: "1 Year", days: 365, balance: portfolioBalance * Math.pow(1 + dailyRate, 365) },
      ] as ProjectedBalance[];
    }
    
    return [];
  }, [lattiTargets?.target_daily_avg_earning_pct, portfolioBalance]);

  const isLoading = paceLoading || lattiLoading || portfolioLoading;

  if (isLoading) {
    return (
      <Card data-testid="latti-goals-mirror">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              LATTI Target Daily Goals
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Phase 27.F.30: Format target percentage with sign
  const rawTargetPct = lattiTargets?.target_daily_avg_earning_pct || '0.00';
  const targetPctValue = parseFloat(rawTargetPct);
  
  const targetDailyAvgEarningPct = (() => {
    if (isNaN(targetPctValue)) return '0.00';
    const isNegativeZero = Object.is(targetPctValue, -0);
    const formattedValue = targetPctValue.toFixed(2);
    if (isNegativeZero || (formattedValue === '0.00' && rawTargetPct.trim().startsWith('-'))) {
      return '-0.00';
    }
    const sign = targetPctValue > 0 ? '+' : targetPctValue < 0 ? '' : '';
    return `${sign}${formattedValue}`;
  })();
  
  // Determine color based on formatted value
  const isPositive = targetDailyAvgEarningPct.startsWith('+');
  const isNegative = targetDailyAvgEarningPct.startsWith('-');

  const riskPerTrade = lattiTargets?.risk_per_trade || 0;
  const tradesPerDay = lattiTargets?.trades_per_day || 0;

  // Phase 27.F.31: Pace color mapping
  const paceColors = {
    conservative: {
      bg: "bg-blue-50 dark:bg-blue-950/20",
      border: "border-blue-200 dark:border-blue-900/50",
      text: "text-blue-700 dark:text-blue-300",
    },
    baseline: {
      bg: "bg-green-50 dark:bg-green-950/20",
      border: "border-green-200 dark:border-green-900/50",
      text: "text-green-700 dark:text-green-300",
    },
    optimistic: {
      bg: "bg-yellow-50 dark:bg-yellow-950/20",
      border: "border-yellow-200 dark:border-yellow-900/50",
      text: "text-yellow-700 dark:text-yellow-300",
    },
    aggressive: {
      bg: "bg-red-50 dark:bg-red-950/20",
      border: "border-red-200 dark:border-red-900/50",
      text: "text-red-700 dark:text-red-300",
    },
  };

  const paceColor = paceColors[currentPace as keyof typeof paceColors] || paceColors.baseline;

  return (
    <Card data-testid="latti-goals-mirror">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            LATTI Target Daily Goals
          </div>
          {isPaper && (
            <span className="px-2 py-1 text-xs font-semibold rounded bg-blue-500/20 text-blue-600 dark:text-blue-400">
              PAPER
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Phase 27.F.31: Color-coded Trading Pace Header */}
        <div className={cn(
          "p-3 rounded-lg border text-center font-semibold",
          paceColor.bg,
          paceColor.border,
          paceColor.text
        )}>
          Trading Pace: {currentPace.charAt(0).toUpperCase() + currentPace.slice(1)}
        </div>

        {/* Phase 27.F.31: Consolidated Metrics Row */}
        <div className="grid grid-cols-3 gap-0 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {/* Risk per Trade */}
          <div className="p-4 text-center border-r border-gray-200 dark:border-gray-700">
            <p className="text-xs text-muted-foreground mb-1">Risk per Trade</p>
            <p className="text-lg font-bold">
              {currencyFormatter.format(riskPerTrade)}
            </p>
          </div>

          {/* Trades per Day */}
          <div className="p-4 text-center border-r border-gray-200 dark:border-gray-700">
            <p className="text-xs text-muted-foreground mb-1">Trades per Day</p>
            <p className="text-lg font-bold">
              {tradesPerDay}
            </p>
          </div>

          {/* Target Daily Avg Earnings % */}
          <div className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Target Daily Avg Earnings</p>
            <p 
              className={cn(
                "text-lg font-bold font-mono",
                {
                  "text-blue-600 dark:text-blue-400": isPositive,
                  "text-red-600 dark:text-red-400": isNegative,
                  "text-muted-foreground": !isPositive && !isNegative,
                }
              )}
              data-testid="latti-mirror-target-value"
            >
              {targetDailyAvgEarningPct}%
            </p>
          </div>
        </div>

        {/* Current Portfolio Value */}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Current Portfolio Value</h4>
          <p className="text-lg text-gray-700 dark:text-gray-300 font-bold">
            {currencyFormatter.format(portfolioBalance)}
          </p>
        </div>

        {/* Projected Portfolio Growth */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Projected Portfolio Growth
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="latti-mirror-projections-table">
              <thead>
                <tr className="border-b border-muted">
                  <th className="text-left py-2 font-semibold text-muted-foreground">Timeframe</th>
                  <th className="text-right py-2 font-semibold text-muted-foreground">Projected Balance</th>
                  <th className="text-right py-2 font-semibold text-muted-foreground">Total Gain</th>
                </tr>
              </thead>
              <tbody>
                {projections.map((proj) => {
                  const gain = proj.balance - portfolioBalance;
                  const gainPct = portfolioBalance > 0 ? ((gain / portfolioBalance) * 100) : 0;
                  return (
                    <tr key={proj.label} className="border-b border-muted/50 last:border-0">
                      <td className="py-2 text-muted-foreground">{proj.label}</td>
                      <td className="py-2 text-right font-mono font-semibold">
                        {currencyFormatter.format(proj.balance)}
                      </td>
                      <td className={cn(
                        "py-2 text-right font-mono font-semibold",
                        gain > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                      )}>
                        {gain > 0 ? '+' : ''}{currencyFormatter.format(gain)}
                        <span className="text-xs ml-1">({gainPct > 0 ? '+' : ''}{gainPct.toFixed(1)}%)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Phase 27.F.30: Export memoized component to prevent unnecessary re-renders
export const LATTIGoalsMirror = memo(LATTIGoalsMirrorComponent);
