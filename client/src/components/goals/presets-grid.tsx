import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, TrendingUp, Shield, Clock, Users } from "lucide-react";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface GoalsPreset {
  id: string;
  mode: string;
  name: string;
  portfolioRiskPerTradePct: string;
  dailyLossKillSwitchPct: string;
  symbolCooldownMinutes: number;
  maxOpenPositions: number;
  tradesPerDayEst: string;
  targetDailyAvgEarningPct: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function PresetsGrid() {
  const { mode } = useTradingMode();
  const { toast } = useToast();

  // Fetch all presets
  const { data: presetsData, isLoading } = useQuery<{ ok: boolean; data: GoalsPreset[] }>({
    queryKey: ['/api/goals-presets', mode],
    enabled: !!mode,
  });

  // Mutation to select a preset
  const selectPresetMutation = useMutation({
    mutationFn: async (presetName: string) => {
      return apiRequest('PUT', '/api/goals-presets/select', { mode, presetName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/goals-presets', mode] });
      queryClient.invalidateQueries({ queryKey: ['/api/goals-presets/active', mode] });
      queryClient.invalidateQueries({ queryKey: ['/api/guardrails-v2', mode] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/guardrails-compliance', mode] });
      toast({
        title: "Preset Applied",
        description: "Goals preset has been successfully applied to guardrails.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Applying Preset",
        description: error.message || "Failed to apply preset. Please try again.",
        variant: "destructive",
      });
    }
  });

  const presets = presetsData?.data || [];

  const getPresetDisplayName = (name: string) => {
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const getPresetDescription = (name: string) => {
    switch (name) {
      case 'conservative':
        return 'Lowest risk profile with minimal exposure and tight controls';
      case 'baseline':
        return 'Balanced approach suitable for most trading conditions';
      case 'optimistic':
        return 'Increased risk tolerance for favorable market conditions';
      case 'maximum':
        return 'Maximum risk profile for experienced traders only';
      case 'custom':
        return 'User-defined preset with manual control';
      default:
        return '';
    }
  };

  const getPresetBadgeColor = (name: string) => {
    switch (name) {
      case 'conservative':
        return 'bg-green-600 dark:bg-green-700';
      case 'baseline':
        return 'bg-blue-600 dark:bg-blue-700';
      case 'optimistic':
        return 'bg-amber-600 dark:bg-amber-700';
      case 'maximum':
        return 'bg-red-600 dark:bg-red-700';
      case 'custom':
        return 'bg-purple-600 dark:bg-purple-700';
      default:
        return 'bg-gray-600 dark:bg-gray-700';
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="presets-grid">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Goals Presets</h3>
          <p className="text-sm text-muted-foreground">
            Select a preset to apply pre-configured guardrail and goal values
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {presets.map((preset) => (
          <Card
            key={preset.id}
            className={`relative ${
              preset.isActive
                ? 'border-primary border-2 shadow-lg'
                : 'border-border'
            }`}
            data-testid={`card-preset-${preset.name}`}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <Badge
                  variant="default"
                  className={getPresetBadgeColor(preset.name)}
                  data-testid={`badge-preset-${preset.name}`}
                >
                  {getPresetDisplayName(preset.name)}
                </Badge>
                {preset.isActive && (
                  <CheckCircle2
                    className="h-5 w-5 text-primary"
                    data-testid={`icon-active-${preset.name}`}
                  />
                )}
              </div>
              <CardTitle className="text-lg mt-2">{getPresetDisplayName(preset.name)}</CardTitle>
              <CardDescription className="text-xs">
                {getPresetDescription(preset.name)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Core Four Parameters */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Risk/Trade:</span>
                  <span className="font-semibold" data-testid={`text-risk-${preset.name}`}>
                    {preset.portfolioRiskPerTradePct}%
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Shield className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Kill Switch:</span>
                  <span className="font-semibold" data-testid={`text-killswitch-${preset.name}`}>
                    {preset.dailyLossKillSwitchPct}%
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Cooldown:</span>
                  <span className="font-semibold" data-testid={`text-cooldown-${preset.name}`}>
                    {preset.symbolCooldownMinutes}m
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Max Pos:</span>
                  <span className="font-semibold" data-testid={`text-maxpos-${preset.name}`}>
                    {preset.maxOpenPositions}
                  </span>
                </div>
              </div>

              {/* Target Goals */}
              <div className="border-t border-border pt-3 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Target Daily Avg Earning %</span>
                  <span className="font-semibold text-green-600 dark:text-green-400" data-testid={`text-target-earning-${preset.name}`}>
                    {preset.targetDailyAvgEarningPct}%
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Trades per Day (Est)</span>
                  <span className="font-semibold" data-testid={`text-trades-per-day-${preset.name}`}>
                    {preset.tradesPerDayEst}
                  </span>
                </div>
              </div>

              {/* Apply Button */}
              <Button
                variant={preset.isActive ? "secondary" : "default"}
                className="w-full"
                onClick={() => selectPresetMutation.mutate(preset.name)}
                disabled={preset.isActive || selectPresetMutation.isPending}
                data-testid={`button-apply-${preset.name}`}
              >
                {preset.isActive ? "Active Preset" : "Apply Preset"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
