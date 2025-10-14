import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, RotateCcw, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ModeIndicator } from "./mode-indicator";

interface PerformanceMetric {
  metric: string;
  goal: number;
  actual: number;
  percentAchieved: number;
}

interface UserGoal {
  id: string;
  userId: string;
  metricName: string;
  goalValue: string;
  actualValue: string;
  percentAchieved: string | null;
}

const DEFAULT_METRICS: PerformanceMetric[] = [
  { metric: "Earnings per Trade", goal: 50, actual: 0, percentAchieved: 0 },
  { metric: "Average Return", goal: 2.5, actual: 0, percentAchieved: 0 },
  { metric: "Earnings per Day", goal: 100, actual: 0, percentAchieved: 0 },
  { metric: "Earnings per Week", goal: 700, actual: 0, percentAchieved: 0 },
  { metric: "Earnings per Month", goal: 3000, actual: 0, percentAchieved: 0 },
  { metric: "Earnings per Year", goal: 36000, actual: 0, percentAchieved: 0 },
];

export default function PerformanceTrackingMetrics() {
  const { mode } = useTradingMode();
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<PerformanceMetric[]>(DEFAULT_METRICS);

  const { data: goalsData, isLoading } = useQuery<{ goals: UserGoal[]; hasGoals: boolean }>({
    queryKey: [`/api/goals/summary?mode=${mode}`],
  });

  useEffect(() => {
    if (goalsData?.goals && goalsData.goals.length > 0) {
      const newMetrics = DEFAULT_METRICS.map(defaultMetric => {
        const savedGoal = goalsData.goals.find(g => g.metricName === defaultMetric.metric);
        if (savedGoal) {
          return {
            metric: defaultMetric.metric,
            goal: parseFloat(savedGoal.goalValue) || defaultMetric.goal,
            actual: parseFloat(savedGoal.actualValue) || 0,
            percentAchieved: parseFloat(savedGoal.percentAchieved || '0') || 0,
          };
        }
        return defaultMetric;
      });
      setMetrics(newMetrics);
    } else {
      setMetrics(DEFAULT_METRICS);
    }
  }, [goalsData]);

  const updateGoal = (metric: string, value: number) => {
    setMetrics(prev => prev.map(m => {
      if (m.metric === metric) {
        const percentAchieved = value > 0 ? (m.actual / value) * 100 : 0;
        return { ...m, goal: value, percentAchieved };
      }
      return m;
    }));
    
    // Auto-calculate related earnings metrics
    if (metric.includes("Earnings")) {
      autoCalculateEarnings(metric, value, 'goal');
    }
  };

  const updateActual = (metric: string, value: number) => {
    setMetrics(prev => prev.map(m => {
      if (m.metric === metric) {
        const percentAchieved = m.goal > 0 ? (value / m.goal) * 100 : 0;
        return { ...m, actual: value, percentAchieved };
      }
      return m;
    }));
    
    // Auto-calculate related earnings metrics
    if (metric.includes("Earnings")) {
      autoCalculateEarnings(metric, value, 'actual');
    }
  };

  const autoCalculateEarnings = (sourceMetric: string, value: number, field: 'goal' | 'actual') => {
    // Calculate base value (Day) from any source metric
    // Week = Day × 5, Month = Week × 4, Year = Month × 12
    let earningsPerDay: number;
    
    if (sourceMetric === "Earnings per Day") {
      earningsPerDay = value;
    } else if (sourceMetric === "Earnings per Week") {
      earningsPerDay = value / 5;
    } else if (sourceMetric === "Earnings per Month") {
      earningsPerDay = value / 20; // Month = Week × 4 = Day × 5 × 4 = Day × 20
    } else if (sourceMetric === "Earnings per Year") {
      earningsPerDay = value / 240; // Year = Month × 12 = Day × 20 × 12 = Day × 240
    } else {
      return; // Not an earnings metric
    }
    
    setMetrics(prev => prev.map(m => {
      if (m.metric === "Earnings per Day" && sourceMetric !== "Earnings per Day") {
        const newValue = earningsPerDay;
        const percentAchieved = field === 'goal' ? (m.actual > 0 ? (m.actual / newValue) * 100 : 0) : (newValue > 0 ? (newValue / m.goal) * 100 : 0);
        return { ...m, [field]: newValue, percentAchieved };
      }
      if (m.metric === "Earnings per Week" && sourceMetric !== "Earnings per Week") {
        const newValue = earningsPerDay * 5; // Week = Day × 5
        const percentAchieved = field === 'goal' ? (m.actual > 0 ? (m.actual / newValue) * 100 : 0) : (newValue > 0 ? (newValue / m.goal) * 100 : 0);
        return { ...m, [field]: newValue, percentAchieved };
      }
      if (m.metric === "Earnings per Month" && sourceMetric !== "Earnings per Month") {
        const newValue = earningsPerDay * 20; // Month = Week × 4 = Day × 5 × 4 = Day × 20
        const percentAchieved = field === 'goal' ? (m.actual > 0 ? (m.actual / newValue) * 100 : 0) : (newValue > 0 ? (newValue / m.goal) * 100 : 0);
        return { ...m, [field]: newValue, percentAchieved };
      }
      if (m.metric === "Earnings per Year" && sourceMetric !== "Earnings per Year") {
        const newValue = earningsPerDay * 240; // Year = Month × 12 = Day × 20 × 12 = Day × 240
        const percentAchieved = field === 'goal' ? (m.actual > 0 ? (m.actual / newValue) * 100 : 0) : (newValue > 0 ? (newValue / m.goal) * 100 : 0);
        return { ...m, [field]: newValue, percentAchieved };
      }
      return m;
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async (goals: { metricName: string; goalValue: number; actualValue: number; percentAchieved: number }[]) => {
      const payload = {
        goals,
        mode,
      };
      return apiRequest('POST', '/api/goals/update', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/goals/summary?mode=${mode}`] });
      toast({
        title: "Metrics Saved",
        description: "Performance tracking metrics have been saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save metrics",
        variant: "destructive",
      });
    },
  });

  const handleRecalculate = () => {
    setMetrics(prev => prev.map(m => ({
      ...m,
      percentAchieved: m.goal > 0 ? (m.actual / m.goal) * 100 : 0
    })));
    
    toast({
      title: "Recalculated",
      description: "All percentages have been recalculated.",
    });
  };

  const handleSave = () => {
    const goals = metrics.map((m) => ({
      metricName: m.metric,
      goalValue: m.goal,
      actualValue: m.actual,
      percentAchieved: m.percentAchieved,
    }));
    saveMutation.mutate(goals);
  };

  const handleReset = () => {
    setMetrics(DEFAULT_METRICS);
    
    toast({
      title: "Reset Complete",
      description: "Metrics have been reset to defaults.",
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Tracking Metrics</CardTitle>
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
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Performance Tracking Metrics
              <ModeIndicator />
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Track your earnings across different time periods
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleRecalculate}
              variant="outline"
              size="sm"
              data-testid="button-recalculate"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Recalculate
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              size="sm"
              data-testid="button-reset-performance"
            >
              Reset
            </Button>
            <Button
              onClick={handleSave}
              size="sm"
              disabled={saveMutation.isPending}
              data-testid="button-save-performance"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="text-left p-3 text-sm font-semibold">Metric</th>
                <th className="text-right p-3 text-sm font-semibold">Goal</th>
                <th className="text-right p-3 text-sm font-semibold">Actual</th>
                <th className="text-right p-3 text-sm font-semibold">% Achieved</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric, index) => (
                <tr key={index} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                  <td className="p-3 text-sm font-medium" data-testid={`metric-name-${index}`}>
                    {metric.metric}
                  </td>
                  <td className="p-3 text-right">
                    <Input
                      type="number"
                      step={metric.metric === "Average Return" ? "0.1" : "1"}
                      value={metric.goal}
                      onChange={(e) => updateGoal(metric.metric, parseFloat(e.target.value) || 0)}
                      className="max-w-[120px] ml-auto text-right"
                      data-testid={`input-goal-${index}`}
                    />
                  </td>
                  <td className="p-3 text-right">
                    <Input
                      type="number"
                      step={metric.metric === "Average Return" ? "0.1" : "1"}
                      value={metric.actual}
                      onChange={(e) => updateActual(metric.metric, parseFloat(e.target.value) || 0)}
                      className="max-w-[120px] ml-auto text-right"
                      data-testid={`input-actual-${index}`}
                    />
                  </td>
                  <td className="p-3 text-sm font-mono text-right font-semibold" data-testid={`metric-percent-${index}`}>
                    <span className={metric.percentAchieved >= 100 ? "text-green-600" : metric.percentAchieved >= 50 ? "text-yellow-600" : "text-red-600"}>
                      {metric.percentAchieved.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="mt-4 p-3 bg-muted/30 rounded-md text-sm text-muted-foreground">
          💡 Tip: Changing any Earnings field automatically calculates the others proportionally
        </div>
      </CardContent>
    </Card>
  );
}
