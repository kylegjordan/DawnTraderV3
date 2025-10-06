import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight, Target } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useLocation } from "wouter";

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
  
  const { data, isLoading } = useQuery<GoalsSummaryData>({
    queryKey: ['/api/goals/summary', { mode }],
  });

  if (isLoading) {
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

  const formatValue = (value: number | null) => {
    if (value == null) return '—';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatPercent = (value: number | null) => {
    if (value == null) return '—';
    return `${value.toFixed(1)}%`;
  };

  const getProgressColor = (percent: number | null) => {
    if (percent == null) return 'text-muted-foreground';
    if (percent >= 100) return 'text-success';
    if (percent >= 75) return 'text-success/70';
    if (percent >= 50) return 'text-warning';
    return 'text-destructive';
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
            {isPaper && (
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-500/20 text-blue-600 dark:text-blue-400">
                SIMULATED
              </span>
            )}
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
                  <th className="text-right p-3 text-sm font-semibold">% Achieved</th>
                </tr>
              </thead>
              <tbody>
                {goals.map((goal, index) => (
                  <tr key={index} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3 text-sm" data-testid={`goal-metric-${index}`}>{goal.metric}</td>
                    <td className="p-3 text-sm font-mono text-right" data-testid={`goal-target-${index}`}>
                      {formatValue(goal.goal)}
                    </td>
                    <td className="p-3 text-sm font-mono text-right" data-testid={`goal-actual-${index}`}>
                      {formatValue(goal.actual)}
                    </td>
                    <td className={cn(
                      "p-3 text-sm font-mono text-right font-semibold",
                      getProgressColor(goal.percentAchieved)
                    )} data-testid={`goal-percent-${index}`}>
                      {formatPercent(goal.percentAchieved)}
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
