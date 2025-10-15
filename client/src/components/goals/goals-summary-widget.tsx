import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight, Target } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useLocation } from "wouter";
import { AchievementPill } from "@/components/ui/achievement-pill";
import { ModeIndicator } from "@/components/goals/mode-indicator";
import { useEffect } from "react";

interface GoalSummary {
  metric: string;
  goal: number | null;
  actual: number;
  percentAchieved: number | null;
}

interface GoalsSummaryData {
  goals: GoalSummary[];
  hasGoals: boolean;
}

export default function GoalsSummaryWidget() {
  const { mode, isPaper } = useTradingMode();
  const [, setLocation] = useLocation();
  
  const { data, isLoading, refetch } = useQuery<GoalsSummaryData>({
    queryKey: ['goals', 'summary', mode],
    queryFn: () => fetch(`/api/goals/summary?mode=${mode}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }).then(r => r.json()),
  });

  // Refetch when mode changes
  useEffect(() => {
    refetch();
  }, [mode, refetch]);

  if (isLoading && !data) {
    return (
      <Card className={cn("w-full", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-goals-summary">
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              <span>Goals Summary</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const formatValue = (value: number | null, metric: string, isActual: boolean = false) => {
    if (value == null) return '—';
    
    // Average Return is a percentage for both goal and actual
    if (metric === 'Average Return') {
      return `${value.toFixed(1)}%`;
    }
    
    // For other percentage-based metrics, format goal as % but actual as $
    const isPercentageMetric = metric.includes('(%)') || metric.includes('Percent') || metric.includes('Rate');
    
    if (isPercentageMetric && !isActual) {
      // Show goal as percentage
      return `${value.toFixed(1)}%`;
    }
    
    // For ratios and counts, show as plain numbers
    if (metric.includes('Ratio') || metric.includes('Trades') || metric.includes('Frequency')) {
      return value.toFixed(metric.includes('Ratio') ? 1 : 0);
    }
    
    // For dollar values (including actuals for percentage metrics)
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const goals = data?.goals || [];
  const hasGoals = data?.hasGoals || false;

  return (
    <Card className={cn("w-full shadow-md", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-goals-summary">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <span>Goals Summary</span>
            <ModeIndicator />
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setLocation('/goals-engine')}
            className="text-primary hover:text-primary/80"
            data-testid="button-edit-goals"
          >
            Edit Goals <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasGoals ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-muted-foreground">No goals set yet.</p>
            <Button 
              onClick={() => setLocation('/goals-engine')}
              variant="outline"
              data-testid="button-set-goals"
            >
              <Target className="w-4 h-4 mr-2" />
              Set Your First Goal
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="text-left p-3 text-sm font-semibold">Metric</th>
                  <th className="text-right p-3 text-sm font-semibold">Goal</th>
                  <th className="text-right p-3 text-sm font-semibold">Actual</th>
                  <th className="text-center p-3 text-sm font-semibold">% Achieved</th>
                </tr>
              </thead>
              <tbody>
                {goals.map((goal, index) => (
                  <tr key={index} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3 text-sm" data-testid={`goal-metric-${index}`}>{goal.metric}</td>
                    <td className="p-3 text-sm font-mono text-right" data-testid={`goal-target-${index}`}>
                      {formatValue(goal.goal, goal.metric, false)}
                    </td>
                    <td className="p-3 text-sm font-mono text-right" data-testid={`goal-actual-${index}`}>
                      {formatValue(goal.actual, goal.metric, true)}
                    </td>
                    <td className="p-3 text-center" data-testid={`goal-percent-${index}`}>
                      <AchievementPill percent={goal.percentAchieved} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground mt-3 text-center">
          Goals auto-refresh daily
        </div>
      </CardContent>
    </Card>
  );
}
