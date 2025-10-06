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
import { Save, RotateCcw, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface GoalMetric {
  metric: string;
  description: string;
  inputType: 'number' | 'integer' | 'decimal';
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

const GOAL_METRICS: GoalMetric[] = [
  { metric: 'Target Profit (%)', description: 'Desired average monthly gain', inputType: 'number', default: 5, min: 0, max: 100, step: 0.1 },
  { metric: 'Max Drawdown (%)', description: 'Max allowable account loss', inputType: 'number', default: 10, min: 0, max: 100, step: 0.1 },
  { metric: 'Daily Loss Limit (%)', description: 'Max daily loss before trading stops', inputType: 'number', default: 3, min: 0, max: 100, step: 0.1 },
  { metric: 'Monthly Return Goal (%)', description: 'Monthly target return', inputType: 'number', default: 7, min: 0, max: 100, step: 0.1 },
  { metric: 'Max Concurrent Trades', description: 'Max open trades allowed', inputType: 'integer', default: 5, min: 1, max: 50 },
  { metric: 'Win Rate Target (%)', description: 'Desired trade win ratio', inputType: 'number', default: 60, min: 0, max: 100, step: 0.1 },
  { metric: 'Average Risk/Reward Ratio', description: 'Desired ratio between risk and reward', inputType: 'decimal', default: 2.0, min: 0.1, max: 10, step: 0.1 },
  { metric: 'Max Portfolio Exposure (%)', description: 'Max % of balance in trades', inputType: 'number', default: 75, min: 0, max: 100, step: 0.1 },
  { metric: 'Stop Loss Strictness (%)', description: 'How tight stop-losses should be', inputType: 'number', default: 80, min: 0, max: 100, step: 1 },
  { metric: 'Rebalancing Frequency (Days)', description: 'Days between goal re-evaluations', inputType: 'integer', default: 30, min: 1, max: 90 },
];

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
  const [values, setValues] = useState<Record<string, number>>({});

  const { data: goalsData, isLoading } = useQuery<{ success: boolean; data: UserGoal[]; mode: string }>({
    queryKey: ['/api/goals/summary', { mode }],
  });

  useEffect(() => {
    if (goalsData?.data) {
      const newValues: Record<string, number> = {};
      goalsData.data.forEach((goal) => {
        newValues[goal.metricName] = parseFloat(goal.goalValue) || 0;
      });
      
      GOAL_METRICS.forEach((metric) => {
        if (!(metric.metric in newValues)) {
          newValues[metric.metric] = metric.default;
        }
      });
      
      setValues(newValues);
    } else {
      const defaults: Record<string, number> = {};
      GOAL_METRICS.forEach((metric) => {
        defaults[metric.metric] = metric.default;
      });
      setValues(defaults);
    }
  }, [goalsData]);

  const saveMutation = useMutation({
    mutationFn: async (goals: { metricName: string; goalValue: number }[]) => {
      const payload = {
        goals: goals.map((g) => ({
          metricName: g.metricName,
          goalValue: g.goalValue,
          actualValue: 0,
          percentAchieved: 0,
        })),
        mode,
      };
      return apiRequest('POST', '/api/goals/update', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/goals/summary'] });
      toast({
        title: "Goals Saved",
        description: "Your trading goals have been saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save goals",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    const goals = GOAL_METRICS.map((metric) => ({
      metricName: metric.metric,
      goalValue: values[metric.metric] || metric.default,
    }));
    saveMutation.mutate(goals);
  };

  const handleReset = () => {
    const defaults: Record<string, number> = {};
    GOAL_METRICS.forEach((metric) => {
      defaults[metric.metric] = metric.default;
    });
    setValues(defaults);
    toast({
      title: "Reset Complete",
      description: "Goals have been reset to defaults.",
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
          <CardTitle>Trading Goals Configuration</CardTitle>
          <div className="flex gap-2">
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
          Define your trading performance targets and risk parameters
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {GOAL_METRICS.map((metric) => (
            <div key={metric.metric} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-5">
                <div className="flex items-center gap-2">
                  <Label className="font-medium">{metric.metric}</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{metric.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <div className="md:col-span-7">
                <Input
                  type="number"
                  value={values[metric.metric] || metric.default}
                  onChange={(e) => setValues({ ...values, [metric.metric]: parseFloat(e.target.value) || 0 })}
                  min={metric.min}
                  max={metric.max}
                  step={metric.step || 1}
                  data-testid={`input-goal-${metric.metric.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
