import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Zap, TrendingUp, Shield, AlertTriangle, Percent, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradingMode } from "@/contexts/trading-mode-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type TradingPace = 'conservative' | 'baseline' | 'optimistic' | 'aggressive';

interface PaceConfig {
  id: TradingPace;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

// Phase 27.F.18: Removed hardcoded metrics - now fetched from LATTI API
const PACE_CONFIGS: PaceConfig[] = [
  {
    id: 'conservative',
    label: 'Conservative',
    icon: <Shield className="w-5 h-5" />,
    color: 'blue',
    description: 'Lowest risk, smallest daily target. Prioritizes capital preservation.',
  },
  {
    id: 'baseline',
    label: 'Baseline',
    icon: <TrendingUp className="w-5 h-5" />,
    color: 'green',
    description: 'Steady-state balance of risk/reward. Default recommended setting.',
  },
  {
    id: 'optimistic',
    label: 'Optimistic',
    icon: <Sun className="w-5 h-5" />,
    color: 'yellow',
    description: 'Growth-focused trading pace with balanced risk and reward.',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    icon: <Zap className="w-5 h-5" />,
    color: 'orange',
    description: 'High-intensity trading pace. Max growth near guardrails.',
  },
];

const COLOR_CLASSES = {
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-950/30',
    border: 'border-blue-600',
    text: 'text-blue-600',
    hoverBg: 'hover:bg-blue-50 dark:hover:bg-blue-950/20',
  },
  yellow: {
    bg: 'bg-yellow-100 dark:bg-yellow-950/30',
    border: 'border-yellow-600',
    text: 'text-yellow-600',
    hoverBg: 'hover:bg-yellow-50 dark:hover:bg-yellow-950/20',
  },
  green: {
    bg: 'bg-green-100 dark:bg-green-950/30',
    border: 'border-green-600',
    text: 'text-green-600',
    hoverBg: 'hover:bg-green-50 dark:hover:bg-green-950/20',
  },
  orange: {
    bg: 'bg-orange-100 dark:bg-orange-950/30',
    border: 'border-orange-600',
    text: 'text-orange-600',
    hoverBg: 'hover:bg-orange-50 dark:hover:bg-orange-950/20',
  },
};

interface LATTITargets {
  mode: string;
  preset: TradingPace;
  portfolio_balance: number;
  risk_per_trade: number;
  trades_per_day: number;
  earnings_per_trade: number;
  daily_profit: number;
  target_daily_avg_earning_pct: string;
  max_risk_per_trade_limit: number;
  calculated_at: string;
}

export default function TradingPaceControl() {
  const { toast } = useToast();
  const { mode } = useTradingMode();
  const [selectedPace, setSelectedPace] = useState<TradingPace>('baseline');

  // Fetch current trading pace from system context
  const { data: currentPace, isLoading: paceLoading } = useQuery<{ tradingPace: TradingPace }>({
    queryKey: ['/api/system/trading-pace'],
  });

  // Phase 27.F.18: Fetch LATTI-calculated targets for selected pace
  const { data: lattiTargets, isLoading: targetsLoading } = useQuery<LATTITargets>({
    queryKey: ['/api/latti/targets', mode, selectedPace],
    queryFn: async () => apiRequest('GET', `/api/latti/targets?mode=${mode}&preset=${selectedPace}`),
    enabled: !!selectedPace,
  });

  // Update selected pace when data loads
  useEffect(() => {
    if (currentPace) {
      setSelectedPace(currentPace.tradingPace || 'baseline');
    }
  }, [currentPace]);

  // Phase 27.F.18: Update trading pace mutation (triggers LATTI recalculation)
  const updatePaceMutation = useMutation({
    mutationFn: async (pace: TradingPace) => {
      const result = await apiRequest('PUT', '/api/system/trading-pace', { tradingPace: pace });
      return result;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/system/trading-pace'] });
      queryClient.invalidateQueries({ queryKey: ['/api/latti/targets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/goals'] });
      toast({
        title: "Trading Pace Updated",
        description: `Trading pace set to ${PACE_CONFIGS.find(p => p.id === data.pace)?.label}. LATTI targets recalculated for both modes.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update trading pace",
        variant: "destructive",
      });
    },
  });

  const handlePaceSelect = (pace: TradingPace) => {
    setSelectedPace(pace);
    updatePaceMutation.mutate(pace);
  };

  const selectedConfig = PACE_CONFIGS.find(p => p.id === selectedPace) || PACE_CONFIGS[1];
  const isLoading = paceLoading || targetsLoading;

  if (isLoading) {
    return (
      <Card data-testid="trading-pace-control">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Trading Pace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="trading-pace-control">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Trading Pace
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Control your trading aggressiveness. Changes apply globally to both Live and Paper modes.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pace Selector */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PACE_CONFIGS.map((config) => {
            const colors = COLOR_CLASSES[config.color as keyof typeof COLOR_CLASSES];
            const isSelected = selectedPace === config.id;

            return (
              <button
                key={config.id}
                onClick={() => handlePaceSelect(config.id)}
                data-testid={`pace-${config.id}`}
                className={cn(
                  "p-4 rounded-lg border-2 transition-all cursor-pointer",
                  "flex flex-col items-center gap-2 text-center",
                  isSelected
                    ? `${colors.border} ${colors.bg}`
                    : `border-muted ${colors.hoverBg}`,
                  updatePaceMutation.isPending && "opacity-50 cursor-not-allowed"
                )}
                disabled={updatePaceMutation.isPending}
              >
                <div className={cn(isSelected ? colors.text : "text-muted-foreground")}>
                  {config.icon}
                </div>
                <div className={cn("font-semibold text-sm", isSelected ? colors.text : "text-foreground")}>
                  {config.label}
                </div>
              </button>
            );
          })}
        </div>

        {/* Description */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{selectedConfig.label}:</span>{" "}
            {selectedConfig.description}
          </p>
        </div>

        {/* Phase 27.F.18: Simplified Dynamic Metrics from LATTI */}
        {lattiTargets && (
          <div className="space-y-3">
            <h4 className="font-semibold text-sm text-muted-foreground">LATTI Target Metrics</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Risk per Trade */}
              <div className="p-3 bg-muted/30 rounded-lg" data-testid="metric-risk-per-trade">
                <div className="text-xs text-muted-foreground mb-1">Risk per Trade ($)</div>
                <div className="text-lg font-bold text-foreground">
                  ${lattiTargets.risk_per_trade.toFixed(0)}
                </div>
              </div>

              {/* Trades per Day */}
              <div className="p-3 bg-muted/30 rounded-lg" data-testid="metric-trades-per-day">
                <div className="text-xs text-muted-foreground mb-1">Trades per Day</div>
                <div className="text-lg font-bold text-foreground">
                  {lattiTargets.trades_per_day}
                </div>
              </div>

              {/* Target Daily Avg Earning % */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg" data-testid="metric-daily-avg-earning-pct">
                      <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 mb-1">
                        <Percent className="w-3 h-3" />
                        <span>Target Daily Avg Earning %</span>
                      </div>
                      <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
                        +{parseFloat(lattiTargets.target_daily_avg_earning_pct).toFixed(2)}%
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>LATTI-calculated daily return target based on portfolio size and risk tolerance.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Formula: (Daily Profit / Portfolio Balance) × 100
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Portfolio: ${lattiTargets.portfolio_balance.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Max Risk Limit: ${lattiTargets.max_risk_per_trade_limit}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}

        {/* Info Notice */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-200/80">
            LATTI dynamically calculates these targets based on your guardrails and portfolio balance. All values stay within safety limits.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
