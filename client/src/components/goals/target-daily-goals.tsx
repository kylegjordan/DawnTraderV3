import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, TrendingUp, DollarSign, Percent } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ModeIndicator } from "./mode-indicator";
import { useTrading } from "@/hooks/use-trading";

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

export default function TargetDailyGoals() {
  const { mode } = useTradingMode();
  const { toast } = useToast();
  const { portfolioMetrics, portfolioLoading } = useTrading();
  const [targetPercent, setTargetPercent] = useState<string>("1.5");
  const [hasEdits, setHasEdits] = useState(false);

  // Get portfolio balance from portfolio metrics
  const portfolioBalance = portfolioMetrics?.totalValue || 850;

  // Fetch current goal value
  const { data: goalsData, isLoading } = useQuery<{ goals: UserGoal[]; hasGoals: boolean }>({
    queryKey: ['/api/goals', mode],
    refetchOnMount: 'always',
    staleTime: 0,
  });

  useEffect(() => {
    if (goalsData?.goals) {
      const savedGoal = goalsData.goals.find(g => g.metricName === "Target Daily Avg Earning %");
      if (savedGoal) {
        setTargetPercent(savedGoal.goalValue);
      }
    }
  }, [goalsData]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const goals = [
        {
          metricName: "Target Daily Avg Earning %",
          metricKey: "target_daily_avg_earning_pct",
          goalValue: targetPercent,
          actualValue: "0",
        }
      ];
      return apiRequest('POST', '/api/goals/update', { mode, goals });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/goals', mode] });
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

  // Calculate projected balances using daily compounding
  const calculateProjectedBalances = (): ProjectedBalance[] => {
    const targetPct = parseFloat(targetPercent) || 0;
    const balance = portfolioBalance;

    return [
      { label: "1 Day", days: 1, balance: balance * Math.pow(1 + targetPct / 100, 1) },
      { label: "15 Days", days: 15, balance: balance * Math.pow(1 + targetPct / 100, 15) },
      { label: "30 Days", days: 30, balance: balance * Math.pow(1 + targetPct / 100, 30) },
      { label: "90 Days", days: 90, balance: balance * Math.pow(1 + targetPct / 100, 90) },
      { label: "6 Months", days: 180, balance: balance * Math.pow(1 + targetPct / 100, 180) },
      { label: "1 Year", days: 365, balance: balance * Math.pow(1 + targetPct / 100, 365) },
    ];
  };

  const projectedBalances = calculateProjectedBalances();

  const handleTargetChange = (value: string) => {
    setTargetPercent(value);
    setHasEdits(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Target Daily Goals</CardTitle>
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
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Target Daily Goals
          </CardTitle>
          <ModeIndicator />
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Set your target daily return percentage and view projected portfolio growth over time
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Target Input Section */}
        <div className="space-y-4">
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <Label htmlFor="target-percent" className="text-base font-semibold flex items-center gap-2 mb-3">
              <Percent className="w-4 h-4" />
              Target Daily Average Earnings %
            </Label>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input
                  id="target-percent"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={targetPercent}
                  onChange={(e) => handleTargetChange(e.target.value)}
                  className="text-2xl font-bold h-14"
                  data-testid="input-target-percent"
                />
              </div>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!hasEdits || saveMutation.isPending}
                className="h-14 px-6"
                data-testid="button-save-target"
              >
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            </div>
          </div>

          {/* Current Portfolio Balance */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <span className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Current Portfolio Balance:
            </span>
            <span className="text-lg font-bold font-mono" data-testid="text-portfolio-balance">
              ${portfolioBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Projected Balances Table */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Estimated Portfolio Balances (based on Target %)</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Projections use daily compounding: future = balance × (1 + target%/100)^days
          </p>
          
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-semibold">Period</th>
                  <th className="text-right p-3 font-semibold">Projected Balance</th>
                  <th className="text-right p-3 font-semibold">Gain</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {projectedBalances.map((projection, index) => {
                  const gain = projection.balance - portfolioBalance;
                  const gainPercent = ((projection.balance - portfolioBalance) / portfolioBalance) * 100;
                  
                  return (
                    <tr 
                      key={projection.label} 
                      className="hover:bg-muted/30 transition-colors"
                      data-testid={`row-projection-${index}`}
                    >
                      <td className="p-3 font-medium">{projection.label}</td>
                      <td className="p-3 text-right font-mono font-bold text-green-600 dark:text-green-400">
                        ${projection.balance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-3 text-right font-mono text-sm text-muted-foreground">
                        +${gain.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        {" "}
                        <span className="text-xs">({gainPercent.toFixed(1)}%)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info Note */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-xs text-blue-900 dark:text-blue-300">
            <strong>Note:</strong> Target % is user-editable but does not trigger AI tuning loops. 
            LATTI reads it as a "goal bias" for reference only. Portfolio balance updates after each trade or daily summary.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
