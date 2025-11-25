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

type ValidationStatus = 'OK' | 'WARN' | 'BLOCK';

interface ValidationResult {
  status: ValidationStatus;
  message: string;
  limitValue?: number;
}

// Phase 27.F.24: Wrap in memo to prevent re-renders from parent state changes
function TargetDailyGoals() {
  // Phase 27.F.24: Diagnostic console log to track re-renders
  console.log(`[TargetDailyGoals] Phase 27.F.24: Component re-rendered at ${new Date().toLocaleTimeString()}`);
  
  const { mode } = useTradingMode();
  const { toast } = useToast();
  // Phase 27.F.24: Use narrow hook to prevent re-renders from useTrading's WebSocket invalidations
  const { balance: portfolioBalance, isLoading: portfolioLoading } = usePortfolioBalance();
  const [targetPercent, setTargetPercent] = useState<string>("");
  const [hasEdits, setHasEdits] = useState(false);
  const [isOverride, setIsOverride] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  
  // Phase 27.F.19: Throttle updates to prevent flashing
  const lastUpdateRef = useRef<number>(0);
  
  // Phase 27.F.19: Currency formatter
  const currencyFormatter = new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD', 
    maximumFractionDigits: 2 
  });

  // Phase 27.F.23: Fetch current trading pace (disable all background refetches)
  const { data: currentPaceData } = useQuery<{ tradingPace: string }>({
    queryKey: ['/api/system/trading-pace'],
    // REB 2.8.10: Standardized portfolio refresh
    refetchInterval: 5000,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  
  // Phase 27.F.21: Compute current pace early (needed for LATTI query key)
  const currentPace = currentPaceData?.tradingPace || 'baseline';
  
  // Phase 27.F.23: Fetch LATTI-calculated target daily avg earning % (disable all background refetches)
  const { data: lattiTargets, isLoading: lattiLoading } = useQuery<LATTITargets>({
    queryKey: ['/api/latti/targets', mode, currentPace], // Phase 27.F.23: Include currentPace to auto-refetch on preset change
    queryFn: async () => {
      console.log(`[TargetDailyGoals] Phase 27.F.23: LATTI fetched for ${currentPace} preset at ${new Date().toLocaleTimeString()}`);
      return apiRequest('GET', `/api/latti/targets?mode=${mode}`);
    },
    // REB 2.8.10: Standardized portfolio refresh
    refetchInterval: 5000,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  
  // Phase 27.F.21: Diagnostic console.table for LATTI values on frontend
  useEffect(() => {
    if (lattiTargets) {
      console.log(`[TargetDailyGoals] Phase 27.F.21 Frontend Diagnostics - ${mode} mode`);
      console.log(`  LATTI Raw Value: "${lattiTargets.target_daily_avg_earning_pct}" (string from backend)`);
      console.log(`  Parsed Display: ${parseFloat(lattiTargets.target_daily_avg_earning_pct).toFixed(2)}%`);
      console.log(`  Portfolio Balance: $${lattiTargets.portfolio_balance}`);
      console.log(`  Expected Display Format: Backend returns "1.75" → Frontend shows "1.75%"`);
    }
  }, [lattiTargets, mode]);
  
  // Phase 27.F.22: Immediate initialization - populate input as soon as LATTI targets load
  useEffect(() => {
    if (lattiTargets && !targetPercent) {
      const lattiTargetPct = parseFloat(lattiTargets.target_daily_avg_earning_pct).toFixed(2);
      console.log(`[TargetDailyGoals] Phase 27.F.22 Immediate init - pre-filling input with LATTI: ${lattiTargetPct}%`);
      setTargetPercent(lattiTargetPct);
      setIsOverride(false);
      lastUpdateRef.current = Date.now();
    }
  }, [lattiTargets?.target_daily_avg_earning_pct]); // Only when LATTI value changes
  
  // Phase 27.F.21: Track previous trading pace for preset change detection
  const prevPaceRef = useRef<string | null>(null);
  
  // Phase 27.F.23: Metric name (currentPace already declared above for query key)
  const metricName = `Target Daily Avg Earning % (${currentPace})`;
  
  // Phase 27.F.23: Fetch goals data (disable all background refetches to prevent flicker)
  const { data: goalsData, isLoading: goalsLoading } = useQuery<{ goals: UserGoal[]; hasGoals: boolean }>({
    queryKey: ['/api/goals', mode, currentPace], // Include pace in query key for caching
    queryFn: async () => apiRequest('GET', `/api/goals?mode=${mode}`),
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnMount: true, // Phase 27.F.23: Allow mount refetch for preset changes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });
  
  // Phase 27.F.23: When LATTI targets update (from preset change), instantly update input
  useEffect(() => {
    if (currentPaceData && lattiTargets) {
      // Detect pace change
      if (prevPaceRef.current && prevPaceRef.current !== currentPace) {
        console.log(`[TargetDailyGoals] Phase 27.F.23: Trading pace changed from ${prevPaceRef.current} to ${currentPace} - queries will auto-refresh via key change`);
        prevPaceRef.current = currentPace;
        // Phase 27.F.23: No manual invalidation needed - query keys include currentPace, so they auto-refresh
      } else {
        // Phase 27.F.22: LATTI targets updated - only pre-fill if no saved override exists
        const lattiTargetPct = parseFloat(lattiTargets.target_daily_avg_earning_pct).toFixed(2);
        
        // Check if there's a saved override goal for this preset
        const hasSavedGoal = goalsData?.goals?.some(g => g.metricName === metricName && g.goalValue);
        
        // Only update to LATTI if: value changed AND (no saved goal OR input is blank)
        if (lattiTargetPct !== targetPercent && (!hasSavedGoal || !targetPercent)) {
          console.log(`[TargetDailyGoals] Phase 27.F.22: LATTI targets updated - pre-filling input with: ${lattiTargetPct}% (no saved override)`);
          setTargetPercent(lattiTargetPct);
          setIsOverride(false);
          setHasEdits(false);
          lastUpdateRef.current = Date.now();
        } else if (hasSavedGoal) {
          console.log(`[TargetDailyGoals] Phase 27.F.22: LATTI targets updated - skipping pre-fill, saved override exists`);
        }
      }
      
      if (!prevPaceRef.current) {
        prevPaceRef.current = currentPace;
      }
    }
  }, [currentPaceData?.tradingPace, lattiTargets?.target_daily_avg_earning_pct, goalsData?.goals, metricName, mode]); // Phase 27.F.22: Include goalsData to check for saved overrides

  // Phase 27.F.23: Fetch guardrails for validation (disable all background refetches)
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

  // Phase 27.F.22: Initialize target percent with delayed reconciliation (allows LATTI instant sync first)
  useEffect(() => {
    if (goalsData?.goals && lattiTargets) {
      const now = Date.now();
      const recentLattiUpdate = now - lastUpdateRef.current < 1000; // 1 second window
      
      const reconcile = () => {
        // Phase 27.F.21: Look for preset-specific saved goal
        const savedGoal = goalsData.goals.find(g => g.metricName === metricName);
        // Phase 27.F.20: Backend already multiplies by 100, so "0.15" = 0.15% (not decimal 0.0015)
        const lattiTargetPct = parseFloat(lattiTargets.target_daily_avg_earning_pct).toFixed(2);
        
        let newValue: string | null = null;
        let newIsOverride = false;
        
        if (savedGoal && savedGoal.goalValue) {
          // Phase 27.F.20: Saved goals should be decimals (0.015 = 1.5%)
          // Defensive: If value > 1.0, it's corrupted (already a percentage), don't multiply
          const savedValueDecimal = parseFloat(savedGoal.goalValue);
          let savedValuePct = savedValueDecimal > 1.0 
            ? savedValueDecimal.toFixed(2)  // Already a percentage
            : (savedValueDecimal * 100).toFixed(2);  // Convert decimal to percentage
          
          // Phase 27.F.20: If corrupted value > 20% (unrealistic), auto-reset to LATTI default
          if (parseFloat(savedValuePct) > 20) {
            console.warn(`[TargetDailyGoals] Corrupted goal value ${savedValuePct}% detected, resetting to LATTI default ${lattiTargetPct}%`);
            savedValuePct = lattiTargetPct;
          }
          
          newValue = savedValuePct;
          newIsOverride = parseFloat(savedValuePct) !== parseFloat(lattiTargetPct);
        } else if (lattiTargets) {
          // Phase 27.F.20: Use LATTI default (no scaling needed)
          newValue = lattiTargetPct;
          newIsOverride = false;
        }
        
        // Phase 27.F.20: Intelligent throttle - only skip if value hasn't changed AND within throttle window
        const withinThrottleWindow = Date.now() - lastUpdateRef.current < 300000;
        const valueUnchanged = newValue === targetPercent;
        
        if (withinThrottleWindow && valueUnchanged) {
          return; // Skip redundant update
        }
        
        // Value has changed or throttle window expired - update state
        if (newValue !== null) {
          console.log(`[TargetDailyGoals] Phase 27.F.22: Reconciling to ${newValue}% (override: ${newIsOverride})`);
          setTargetPercent(newValue);
          setIsOverride(newIsOverride);
          lastUpdateRef.current = Date.now();
        }
      };
      
      // Phase 27.F.22: Delay reconciliation briefly after LATTI update to show instant sync
      if (recentLattiUpdate) {
        console.log(`[TargetDailyGoals] Phase 27.F.22: Delaying reconciliation 500ms after LATTI update`);
        const delayTimer = setTimeout(reconcile, 500);
        return () => clearTimeout(delayTimer);
      } else {
        // No recent LATTI update, reconcile immediately
        reconcile();
      }
    }
  }, [goalsData?.goals, lattiTargets?.target_daily_avg_earning_pct, metricName]); // Phase 27.F.23: No idle refresh - completely static

  // Phase 27.F.18/19: Validate target percent against guardrails
  useEffect(() => {
    if (targetPercent && guardrailsData && portfolioBalance > 0) {
      const targetPct = parseFloat(targetPercent);
      const maxDailyLoss = parseFloat(guardrailsData.maxDailyLoss || '1000');
      const dailyLossKillSwitch = parseFloat(guardrailsData.dailyLossKillSwitch || '5000');
      
      // Phase 27.F.19: Safe limit = daily_loss_kill_switch × 5
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
          metricName: metricName, // Includes current pace (e.g., "Target Daily Avg Earning % (baseline)")
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
            metricName: metricName, // Phase 27.F.21: Use preset-specific name
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
      // Phase 27.F.21: Invalidate with current pace for preset-specific caching
      queryClient.invalidateQueries({ queryKey: ['/api/goals', mode, currentPace] });
      setHasEdits(false);
      // Phase 27.F.20: Backend already multiplies by 100
      const lattiTargetPct = lattiTargets ? parseFloat(lattiTargets.target_daily_avg_earning_pct).toFixed(2) : '0';
      setIsOverride(lattiTargets ? parseFloat(targetPercent) !== parseFloat(lattiTargetPct) : true);
      toast({
        title: "Target Saved",
        description: `Target Daily Avg Earning % set to ${targetPercent}%${isOverride ? ' (Override)' : ''}`,
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

  const handleResetToLATTI = () => {
    if (lattiTargets) {
      // Phase 27.F.20: Backend already multiplies by 100
      const lattiTargetPct = parseFloat(lattiTargets.target_daily_avg_earning_pct).toFixed(2);
      setTargetPercent(lattiTargetPct);
      setHasEdits(true);
      setIsOverride(false);
    }
  };

  // Phase 27.F.24: Memoize projection calculations to prevent re-render loops
  const projections = useMemo(() => {
    const effectivePct = parseFloat(targetPercent) || 0;
    
    // Phase 27.F.23: Normalize daily rate to decimal and apply safety cap
    let dailyRate = effectivePct / 100; // e.g., 0.9% → 0.009
    if (dailyRate > 0.05) {
      dailyRate = 0.05; // Cap at 5% per day to prevent runaway projections
      console.warn(`[TargetDailyGoals] Phase 27.F.23: Daily rate ${effectivePct}% exceeds 5% cap, capping at 5%`);
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

  const isLoading = lattiLoading || goalsLoading || portfolioLoading;

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
          Set your target daily return percentage. LATTI calculates recommended values based on your trading pace and portfolio balance.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Target Daily Avg Earning % Input */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="target-percent" className="text-sm font-semibold">
              Target Daily Average Earnings %
            </Label>
            {lattiTargets && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Percent className="w-3 h-3" />
                LATTI Default: {parseFloat(lattiTargets.target_daily_avg_earning_pct).toFixed(2)}%
              </div>
            )}
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
            {isOverride && (
              <Button
                onClick={handleResetToLATTI}
                variant="outline"
                size="sm"
                data-testid="button-reset-to-latti"
              >
                Reset to LATTI
              </Button>
            )}
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

          {isOverride && lattiTargets && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-blue-700 dark:text-blue-200">
                You are using a custom override. LATTI recommends {parseFloat(lattiTargets.target_daily_avg_earning_pct).toFixed(2)}% based on your current trading pace and guardrails.
              </p>
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
        {lattiTargets && (
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Trading Pace:</span>
              <span className="font-semibold text-foreground capitalize">{lattiTargets.preset}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Phase 27.F.24: Export memoized component to prevent re-renders from parent state changes
export default memo(TargetDailyGoals);
