import { useState, useEffect, useRef, useMemo, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, TrendingUp, DollarSign, Percent, AlertCircle, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ModeIndicator } from "./mode-indicator";
import { usePortfolioBalance } from "@/hooks/use-portfolio-balance";
import { cn } from "@/lib/utils";

interface UserGoal {
  id: string;
  metricName: string;
  goalValue: string;
  actualValue: string;
  percentAchieved: string | null;
}

interface ProjectedBalance {
  label: string;
  days: number;
  balance: number;
}

// Directive 12.2.1: LATTITargets interface removed (LATTI query decommissioned)

type ValidationStatus = 'OK' | 'WARN' | 'BLOCK';

interface ValidationResult {
  status: ValidationStatus;
  message: string;
  limitValue?: number;
}

// Directive 12.2.1: Static pace defaults (previously calculated by LATTI backend endpoint)
const TARGET_PCT_BY_PACE: Record<string, string> = {
  conservative: '0.40',
  baseline: '0.90',
  optimistic: '1.25',
  aggressive: '1.75',
};

// Phase 27.F.24: Wrap in memo to prevent re-renders from parent state changes
function TargetDailyGoals() {
  const { mode } = useTradingMode();
  const { toast } = useToast();
  // Phase 27.F.24: Use narrow hook to prevent re-renders from useTrading's WebSocket invalidations
  const { balance: portfolioBalance, isLoading: portfolioLoading } = usePortfolioBalance();
  const [targetPercent, setTargetPercent] = useState<string>("");
  const [hasEdits, setHasEdits] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  // Phase 27.F.19: Throttle updates to prevent flashing
  const lastUpdateRef = useRef<number>(0);

  // Phase 27.F.19: Currency formatter
  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  });

  // Phase 27.F.23: Fetch current trading pace
  const { data: currentPaceData } = useQuery<{ tradingPace: string }>({
    queryKey: ['/api/system/trading-pace'],
    // REB 2.8.10: Standardized portfolio refresh
    refetchInterval: 5000,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const currentPace = currentPaceData?.tradingPace || 'baseline';

  // Directive 12.2.1: LATTI targets query removed — using static pace defaults

  // Phase 27.F.23: Metric name
  const metricName = `Target Daily Avg Earning % (${currentPace})`;

  // Phase 27.F.23: Fetch goals data
  const { data: goalsData, isLoading: goalsLoading } = useQuery<{ goals: UserGoal[]; hasGoals: boolean }>({
    queryKey: ['/api/goals', mode, currentPace],
    queryFn: async () => apiRequest('GET', `/api/goals?mode=${mode}`),
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });

  // Directive 12.2.1: Initialize target percent from saved goals or pace default
  useEffect(() => {
    if (goalsData?.goals) {
      const savedGoal = goalsData.goals.find(g => g.metricName === metricName);
      const paceDefault = TARGET_PCT_BY_PACE[currentPace] || '0.90';

      if (savedGoal && savedGoal.goalValue) {
        const savedValueDecimal = parseFloat(savedGoal.goalValue);
        let savedValuePct = savedValueDecimal > 1.0
          ? savedValueDecimal.toFixed(2)
          : (savedValueDecimal * 100).toFixed(2);

        if (parseFloat(savedValuePct) > 20) {
          console.warn(`[TargetDailyGoals] Corrupted goal value ${savedValuePct}% detected, resetting to pace default ${paceDefault}%`);
          savedValuePct = paceDefault;
        }

        const withinThrottleWindow = Date.now() - lastUpdateRef.current < 300000;
        const valueUnchanged = savedValuePct === targetPercent;

        if (!(withinThrottleWindow && valueUnchanged)) {
          setTargetPercent(savedValuePct);
          lastUpdateRef.current = Date.now();
        }
      } else if (!targetPercent) {
        setTargetPercent(paceDefault);
        lastUpdateRef.current = Date.now();
      }
    }
  }, [goalsData?.goals, metricName]);

  // Phase 27.F.23: Fetch guardrails for validation
  const { data: guardrailsData } = useQuery({
    queryKey: ['/api/guardrails', mode],
    queryFn: async () => apiRequest('GET', `/api/guardrails?mode=${mode}`),
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });

  // Phase 27.F.18/19: Validate target percent against guardrails
  useEffect(() => {
    if (targetPercent && guardrailsData && portfolioBalance > 0) {
      const targetPct = parseFloat(targetPercent);
      const maxDailyLoss = parseFloat(guardrailsData.maxDailyLoss || '1000');
      const dailyLossKillSwitch = parseFloat(guardrailsData.dailyLossKillSwitch || '5000');

      // Phase 27.F.19: Safe limit = daily_loss_kill_switch x 5
      const safeLimit = (dailyLossKillSwitch / portfolioBalance) * 100 * 5;
      const warnThreshold = safeLimit;
      const blockThreshold = safeLimit * 2;

      if (targetPct <= warnThreshold) {
        setValidationResult({
          status: 'OK',
          message: 'Target is within safe limits',
          limitValue: warnThreshold
        });
      } else if (targetPct <= blockThreshold) {
        setValidationResult({
          status: 'WARN',
          message: `Target exceeds recommended threshold (${warnThreshold.toFixed(2)}%)`,
          limitValue: blockThreshold
        });
      } else {
        setValidationResult({
          status: 'BLOCK',
          message: `Target exceeds maximum safe threshold (${blockThreshold.toFixed(2)}%)`,
          limitValue: blockThreshold
        });
      }
    }
  }, [targetPercent, guardrailsData, portfolioBalance]);

  // Phase 27.F.18/19: Save mutation with user_goals_audit logging
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Phase 27.F.19: Convert percentage (1.5) back to decimal (0.015) for backend storage
      const goalValueDecimal = (parseFloat(targetPercent) / 100).toString();

      // Phase 27.F.21: Use preset-specific metric name for namespacing
      const goals = [
        {
          metricName: metricName,
          metricKey: "target_daily_avg_earning_pct",
          goalValue: goalValueDecimal,
          actualValue: "0",
        }
      ];

      // Log to user_goals_audit if this is an override attempt
      if (validationResult) {
        try {
          await apiRequest('POST', '/api/goals/audit', {
            mode,
            metricName: metricName,
            attemptedValue: targetPercent,
            feasibilityStatus: validationResult.status,
            validationMessage: validationResult.message,
            riskLimit: validationResult.limitValue,
            exceedsBy: validationResult.status !== 'OK' ?
              (parseFloat(targetPercent) - (validationResult.limitValue || 0)).toFixed(2) : '0'
          });
        } catch (auditError) {
          console.warn('[TargetDailyGoals] Failed to log audit:', auditError);
        }
      }

      return apiRequest('POST', '/api/goals/update', { mode, goals });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/goals', mode, currentPace] });
      setHasEdits(false);
      toast({
        title: "Target Saved",
        description: `Target Daily Avg Earning % set to ${targetPercent}%`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save target",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (validationResult?.status === 'BLOCK') {
      toast({
        title: "Cannot Save",
        description: validationResult.message,
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate();
  };

  // Phase 27.F.24: Memoize projection calculations to prevent re-render loops
  const projections = useMemo(() => {
    const effectivePct = parseFloat(targetPercent) || 0;

    // Phase 27.F.23: Normalize daily rate to decimal and apply safety cap
    let dailyRate = effectivePct / 100; // e.g., 0.9% -> 0.009
    if (dailyRate > 0.05) {
      dailyRate = 0.05; // Cap at 5% per day to prevent runaway projections
      console.warn(`[TargetDailyGoals] Daily rate ${effectivePct}% exceeds 5% cap, capping at 5%`);
    }

    // Phase 27.F.23: Use true daily compounding: currentValue * (1 + dailyRate)^days
    if (effectivePct > 0 && portfolioBalance > 0) {
      return [
        { label: "Tomorrow", days: 1, balance: portfolioBalance * Math.pow(1 + dailyRate, 1) },
        { label: "1 Week", days: 7, balance: portfolioBalance * Math.pow(1 + dailyRate, 7) },
        { label: "1 Month", days: 30, balance: portfolioBalance * Math.pow(1 + dailyRate, 30) },
        { label: "3 Months", days: 90, balance: portfolioBalance * Math.pow(1 + dailyRate, 90) },
        { label: "6 Months", days: 180, balance: portfolioBalance * Math.pow(1 + dailyRate, 180) },
        { label: "1 Year", days: 365, balance: portfolioBalance * Math.pow(1 + dailyRate, 365) },
      ];
    }

    return [];
  }, [targetPercent, portfolioBalance]); // Phase 27.F.24: Pure dependencies only

  const isLoading = goalsLoading || portfolioLoading;

  if (isLoading) {
    return (
      <Card data-testid="target-daily-goals">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Target Daily Goals
            </div>
            <ModeIndicator />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="target-daily-goals">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Target Daily Goals
          </div>
          <ModeIndicator />
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Set your target daily return percentage based on your trading pace and portfolio balance.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Target Daily Avg Earning % Input */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="target-percent" className="text-sm font-semibold">
              Target Daily Average Earnings %
            </Label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Percent className="w-3 h-3" />
              Pace Default: {TARGET_PCT_BY_PACE[currentPace] || '0.90'}%
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="target-percent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={targetPercent}
                onChange={(e) => {
                  setTargetPercent(e.target.value);
                  setHasEdits(true);
                }}
                className="pr-8"
                data-testid="input-target-percent"
              />
              <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
            <Button
              onClick={handleSave}
              disabled={!hasEdits || saveMutation.isPending || validationResult?.status === 'BLOCK'}
              size="sm"
              data-testid="button-save-target"
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
          </div>

          {/* Phase 27.F.18: Validation Status */}
          {validationResult && (
            <div className={cn(
              "flex items-start gap-2 p-3 rounded-lg text-sm",
              validationResult.status === 'OK' && "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-200",
              validationResult.status === 'WARN' && "bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/50 text-yellow-700 dark:text-yellow-200",
              validationResult.status === 'BLOCK' && "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-200"
            )} data-testid={`validation-${validationResult.status.toLowerCase()}`}>
              {validationResult.status === 'OK' ? (
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className="font-semibold">{validationResult.status}</p>
                <p className="text-xs opacity-90">{validationResult.message}</p>
              </div>
            </div>
          )}
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
            <table className="w-full text-sm" data-testid="projections-table">
              <thead>
                <tr className="border-b border-muted">
                  <th className="text-left py-2 font-semibold text-muted-foreground">Timeframe</th>
                  <th className="text-right py-2 font-semibold text-muted-foreground">Projected Balance</th>
                  <th className="text-right py-2 font-semibold text-muted-foreground">Total Gain</th>
                </tr>
              </thead>
              <tbody>
                {projections.map((proj, index) => {
                  const gain = proj.balance - portfolioBalance;
                  const gainPercent = ((gain / portfolioBalance) * 100);

                  return (
                    <tr key={index} className="border-b border-muted/50" data-testid={`projection-${proj.label.toLowerCase().replace(' ', '-')}`}>
                      <td className="py-3 text-foreground">{proj.label}</td>
                      <td className="text-right font-semibold text-foreground">
                        {currencyFormatter.format(proj.balance)}
                      </td>
                      <td className="text-right font-semibold text-green-600 dark:text-green-500">
                        +{currencyFormatter.format(gain)} ({gainPercent.toFixed(1)}%)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trading Pace Info */}
        <div className="p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Trading Pace:</span>
            <span className="font-semibold text-foreground capitalize">{currentPace}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Phase 27.F.24: Export memoized component to prevent re-renders from parent state changes
export default memo(TargetDailyGoals);
