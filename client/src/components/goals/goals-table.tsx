import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Save, RotateCcw, Info, Target } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Phase 27.F.14.UI-SYNC.2: Trading Pace Presets
interface TradingPacePreset {
  name: string;
  tradesPerDay: number;
  targetPerTrade: number;
}

const TRADING_PACE_PRESETS: TradingPacePreset[] = [
  { name: 'Conservative', tradesPerDay: 2, targetPerTrade: 20 },
  { name: 'Baseline', tradesPerDay: 4, targetPerTrade: 25 },
  { name: 'Optimistic', tradesPerDay: 6, targetPerTrade: 30 },
  { name: 'Aggressive', tradesPerDay: 8, targetPerTrade: 35 },
];

const DEFAULT_GOALS = {
  tradesPerDay: 4,
  targetPerTrade: 25,
};

interface UserGoal {
  id: string;
  userId: string;
  metricName: string;
  goalValue: string;
  actualValue: string;
  percentAchieved: string | null;
  aiValidationNotes: string | null;
  lastUpdated: string;
}

export default function GoalsTable() {
  const { mode } = useTradingMode();
  const { toast } = useToast();
  const [tradesPerDay, setTradesPerDay] = useState(DEFAULT_GOALS.tradesPerDay);
  const [targetPerTrade, setTargetPerTrade] = useState(DEFAULT_GOALS.targetPerTrade);
  const [feasibilityStatus, setFeasibilityStatus] = useState<'OK' | 'WARN' | 'BLOCK' | null>(null);
  const [feasibilityReason, setFeasibilityReason] = useState<string>('');
  
  // Auto-calculated daily profit
  const targetDailyProfit = tradesPerDay * targetPerTrade;

  const { data: goalsData, isLoading } = useQuery<{ goals: UserGoal[]; hasGoals: boolean }>({
    queryKey: [`/api/goals/summary?mode=${mode}`],
    // REB 2.8.10: Standardized portfolio refresh
    refetchInterval: 5000,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (goalsData?.goals && goalsData.goals.length > 0) {
      const tradesGoal = goalsData.goals.find(g => g.metricName === 'Trades per Day');
      const targetGoal = goalsData.goals.find(g => g.metricName === 'Target per Trade ($)');
      
      setTradesPerDay(tradesGoal ? parseFloat(tradesGoal.goalValue) : DEFAULT_GOALS.tradesPerDay);
      setTargetPerTrade(targetGoal ? parseFloat(targetGoal.goalValue) : DEFAULT_GOALS.targetPerTrade);
    }
  }, [goalsData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        goals: [
          {
            metricName: 'Trades per Day',
            goalValue: tradesPerDay,
            actualValue: 0,
            percentAchieved: 0,
          },
          {
            metricName: 'Target per Trade ($)',
            goalValue: targetPerTrade,
            actualValue: 0,
            percentAchieved: 0,
          },
          {
            metricName: 'Target Daily Profit ($)',
            goalValue: targetDailyProfit,
            actualValue: 0,
            percentAchieved: 0,
          },
        ],
        mode,
      };
      return apiRequest('POST', '/api/goals/update', payload);
    },
    onSuccess: (response: any) => {
      // Phase 27.F.14.UI-SYNC.8: Capture feasibility feedback from backend
      if (response.feasibility) {
        setFeasibilityStatus(response.feasibility.status);
        setFeasibilityReason(response.feasibility.reason);
        
        // Show visual feedback based on status
        if (response.feasibility.status === 'WARN') {
          toast({
            title: "⚠️ Goals Saved with Warning",
            description: response.feasibility.reason,
            variant: "default",
          });
        } else if (response.feasibility.status === 'OK') {
          setFeasibilityStatus('OK');
          setFeasibilityReason(response.feasibility.reason);
        }
      } else {
        setFeasibilityStatus(null);
        setFeasibilityReason('');
      }
      
      // Phase 27.F.14.UI-SYNC.8: Invalidate both Trading Goals and Performance Metrics caches
      queryClient.invalidateQueries({ queryKey: ['goals', 'summary', mode] });
      queryClient.invalidateQueries({ queryKey: ['/api/goals', mode] }); // Sync with Performance Metrics
      
      if (!response.feasibility || response.feasibility.status === 'OK') {
        toast({
          title: "✅ Goals Saved",
          description: "Your trading goals have been saved successfully.",
        });
      }
    },
    onError: (error: any) => {
      // Phase 27.F.14.UI-SYNC.8: Handle BLOCK status from backend
      if (error.message && error.message.includes('exceeds')) {
        setFeasibilityStatus('BLOCK');
        setFeasibilityReason(error.message);
      }
      
      toast({
        title: "❌ Error",
        description: error.message || "Failed to save goals",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleReset = () => {
    setTradesPerDay(DEFAULT_GOALS.tradesPerDay);
    setTargetPerTrade(DEFAULT_GOALS.targetPerTrade);
    toast({
      title: "Reset Complete",
      description: "Goals have been reset to defaults.",
    });
  };

  const applyPreset = (preset: TradingPacePreset) => {
    setTradesPerDay(preset.tradesPerDay);
    setTargetPerTrade(preset.targetPerTrade);
    toast({
      title: `${preset.name} Pace Applied`,
      description: `Set to ${preset.tradesPerDay} trades/day at $${preset.targetPerTrade}/trade`,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Goals Table</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            <CardTitle>Trading Goals Configuration</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {/* Phase 27.F.14.UI-SYNC.8: Feasibility Status Indicator */}
            {feasibilityStatus && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border" data-testid="feasibility-indicator">
                      {feasibilityStatus === 'OK' && (
                        <div className="flex items-center gap-1.5 text-green-600 border-green-600">
                          <div className="w-2 h-2 bg-green-600 rounded-full" />
                          <span>OK</span>
                        </div>
                      )}
                      {feasibilityStatus === 'WARN' && (
                        <div className="flex items-center gap-1.5 text-amber-600 border-amber-600">
                          <div className="w-2 h-2 bg-amber-600 rounded-full" />
                          <span>WARN</span>
                        </div>
                      )}
                      {feasibilityStatus === 'BLOCK' && (
                        <div className="flex items-center gap-1.5 text-red-600 border-red-600">
                          <div className="w-2 h-2 bg-red-600 rounded-full" />
                          <span>BLOCK</span>
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm">{feasibilityReason}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            <Button
              onClick={handleReset}
              variant="outline"
              size="sm"
              data-testid="button-reset-goals"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Defaults
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              size="sm"
              data-testid="button-save-goals"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? 'Saving...' : 'Save Goals'}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Set your daily trading targets to guide strategy tuning toward these goals
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Trading Pace Presets */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Trading Pace Presets</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {TRADING_PACE_PRESETS.map((preset) => (
              <Button
                key={preset.name}
                variant="outline"
                onClick={() => applyPreset(preset)}
                className="flex flex-col h-auto py-3 gap-1"
                data-testid={`button-preset-${preset.name.toLowerCase()}`}
              >
                <span className="font-semibold">{preset.name}</span>
                <span className="text-xs text-muted-foreground">
                  {preset.tradesPerDay} trades/day
                </span>
                <span className="text-xs text-muted-foreground">
                  ${preset.targetPerTrade}/trade
                </span>
                <span className="text-xs font-medium text-primary">
                  ${preset.tradesPerDay * preset.targetPerTrade}/day
                </span>
              </Button>
            ))}
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Manual Goal Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="tradesPerDay" className="font-medium">Trades per Day</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Target number of trades to execute daily. System tunes based on mode.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              id="tradesPerDay"
              type="number"
              value={tradesPerDay}
              onChange={(e) => setTradesPerDay(parseFloat(e.target.value) || 0)}
              min={1}
              max={20}
              step={1}
              data-testid="input-trades-per-day"
            />
            <p className="text-xs text-muted-foreground">
              How many trades you want to execute per day
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="targetPerTrade" className="font-medium">Target per Trade ($)</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Target profit amount for each trade</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              id="targetPerTrade"
              type="number"
              value={targetPerTrade}
              onChange={(e) => setTargetPerTrade(parseFloat(e.target.value) || 0)}
              min={1}
              max={200}
              step={1}
              data-testid="input-target-per-trade"
            />
            <p className="text-xs text-muted-foreground">
              Desired profit per individual trade
            </p>
          </div>
        </div>

        {/* Auto-calculated Daily Profit */}
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Target Daily Profit (Auto-Calculated)</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Trades per Day × Target per Trade
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-primary" data-testid="text-daily-profit">
                ${targetDailyProfit.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                per day
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <Info className="w-4 h-4 inline mr-2" />
            Trading parameters are automatically adjusted nightly to pursue these goals while respecting your risk guardrails.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
