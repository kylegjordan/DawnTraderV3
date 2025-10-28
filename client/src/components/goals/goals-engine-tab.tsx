import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { TrendingUp, DollarSign } from "lucide-react";
import { usePortfolioBalance } from "@/hooks/use-portfolio-balance";

interface ActivePreset {
  id: string;
  mode: string;
  name: string;
  targetDailyAvgEarningPct: string;
  tradesPerDayEst: string;
  isActive: boolean;
}

interface ProjectedBalance {
  label: string;
  days: number;
  balance: number;
}

export default function GoalsEngineTab() {
  const { mode } = useTradingMode();
  const { balance: portfolioBalance, isLoading: portfolioLoading } = usePortfolioBalance();

  // Fetch active preset
  const { data: activePresetData, isLoading: presetLoading } = useQuery<{ ok: boolean; data: ActivePreset }>({
    queryKey: [`/api/goals-presets/active?mode=${mode}`],
    enabled: !!mode,
  });

  const activePreset = activePresetData?.data;

  const getPresetBadgeColor = (name: string) => {
    switch (name) {
      case 'conservative':
        return 'bg-green-600 dark:bg-green-700 text-white';
      case 'baseline':
        return 'bg-blue-600 dark:bg-blue-700 text-white';
      case 'optimistic':
        return 'bg-amber-600 dark:bg-amber-700 text-white';
      case 'maximum':
        return 'bg-red-600 dark:bg-red-700 text-white';
      case 'custom':
        return 'bg-purple-600 dark:bg-purple-700 text-white';
      default:
        return 'bg-gray-600 dark:bg-gray-700 text-white';
    }
  };

  const getProjections = (): ProjectedBalance[] => {
    if (!activePreset || !portfolioBalance) return [];
    
    const dailyRate = parseFloat(activePreset.targetDailyAvgEarningPct) / 100;
    if (dailyRate <= 0) return [];

    return [
      { label: "Tomorrow", days: 1, balance: portfolioBalance * Math.pow(1 + dailyRate, 1) },
      { label: "1 Week", days: 7, balance: portfolioBalance * Math.pow(1 + dailyRate, 7) },
      { label: "1 Month", days: 30, balance: portfolioBalance * Math.pow(1 + dailyRate, 30) },
      { label: "3 Months", days: 90, balance: portfolioBalance * Math.pow(1 + dailyRate, 90) },
      { label: "6 Months", days: 180, balance: portfolioBalance * Math.pow(1 + dailyRate, 180) },
      { label: "1 Year", days: 365, balance: portfolioBalance * Math.pow(1 + dailyRate, 365) },
    ];
  };

  const currencyFormatter = new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD', 
    maximumFractionDigits: 2 
  });

  if (presetLoading || portfolioLoading) {
    return (
      <Card data-testid="projected-growth-card">
        <CardHeader>
          <CardTitle>Projected Portfolio Growth</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!activePreset) {
    return (
      <Card data-testid="projected-growth-card">
        <CardHeader>
          <CardTitle>Projected Portfolio Growth</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No active preset selected. Please select a preset above.</p>
        </CardContent>
      </Card>
    );
  }

  const projections = getProjections();
  const presetColor = getPresetBadgeColor(activePreset.name);

  return (
    <Card data-testid="projected-growth-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Projected Portfolio Growth
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Active Preset Header */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-muted-foreground">Active Preset</h4>
            <Badge className={presetColor} data-testid="badge-active-preset">
              {activePreset.name.charAt(0).toUpperCase() + activePreset.name.slice(1)}
            </Badge>
          </div>
          
          <div className="p-4 bg-muted/50 rounded-lg border-l-4" style={{ borderLeftColor: presetColor.split(' ')[0].replace('bg-', '#') }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Target Daily Average Earnings:</span>
                <p className="font-bold text-lg text-green-600 dark:text-green-400" data-testid="text-target-earning">
                  {activePreset.targetDailyAvgEarningPct}%
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Estimated Trades per Day:</span>
                <p className="font-bold text-lg" data-testid="text-trades-per-day">
                  {activePreset.tradesPerDayEst}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Current Portfolio Value */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">Current Portfolio Value</h4>
          <p className="text-2xl font-bold text-foreground" data-testid="text-current-balance">
            {currencyFormatter.format(portfolioBalance)}
          </p>
        </div>

        {/* Projected Growth Table */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Projected Balances
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
                {projections.map((proj) => {
                  const gain = proj.balance - portfolioBalance;
                  const gainPercent = ((gain / portfolioBalance) * 100).toFixed(1);
                  return (
                    <tr key={proj.label} className="border-b border-muted/50">
                      <td className="py-3 text-left font-medium" data-testid={`row-${proj.label.toLowerCase().replace(' ', '-')}`}>
                        {proj.label}
                      </td>
                      <td className="py-3 text-right font-bold text-foreground">
                        {currencyFormatter.format(proj.balance)}
                      </td>
                      <td className="py-3 text-right">
                        <span className="text-green-600 dark:text-green-400 font-semibold">
                          +{currencyFormatter.format(gain)} ({gainPercent}%)
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground italic">
          * Projections are based on compound daily growth at the target rate. Actual results may vary.
        </p>
      </CardContent>
    </Card>
  );
}
