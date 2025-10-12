import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Shield, Save, RotateCcw, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const DEFAULTS = {
  maxDailyLoss: 1000,
  maxDrawdown: 10,
  maxPositionSize: 5000,
  maxOpenPositions: 5,
  riskPerTrade: 1.5,
  aiCanAdjust: false,
};

const GLOBAL_DEFAULTS = {
  dailyLossKillSwitch: 7.0,
  maxPositionPercent: 10.0,
};

interface Guardrails {
  maxDailyLoss: number;
  maxPositionSize: number;
  maxOpenPositions: number;
  maxDrawdown: number;
  riskPerTrade: number;
  aiCanAdjust: boolean;
}

interface TradingSettings {
  dailyLossKillSwitch: string | number;
  maxPositionPercent: string | number;
}

export default function GuardrailsTab() {
  const { toast } = useToast();
  const { mode } = useTradingMode();
  const [settings, setSettings] = useState<Partial<Guardrails>>(DEFAULTS);
  const [globalSettings, setGlobalSettings] = useState<Partial<TradingSettings>>(GLOBAL_DEFAULTS);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: currentSettings, isLoading } = useQuery<Guardrails>({
    queryKey: ['/api/guardrails', mode],
    queryFn: () => fetch(`/api/guardrails?mode=${mode}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }).then(r => r.json()),
  });

  const { data: tradingSettings, isLoading: isLoadingSettings } = useQuery<TradingSettings>({
    queryKey: ['/api/settings'],
    queryFn: () => fetch('/api/settings', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }).then(r => r.json()),
  });

  useEffect(() => {
    if (currentSettings) {
      setSettings({
        maxDailyLoss: currentSettings.maxDailyLoss ?? DEFAULTS.maxDailyLoss,
        maxPositionSize: currentSettings.maxPositionSize ?? DEFAULTS.maxPositionSize,
        maxOpenPositions: currentSettings.maxOpenPositions ?? DEFAULTS.maxOpenPositions,
        maxDrawdown: currentSettings.maxDrawdown ?? DEFAULTS.maxDrawdown,
        riskPerTrade: currentSettings.riskPerTrade ?? DEFAULTS.riskPerTrade,
        aiCanAdjust: currentSettings.aiCanAdjust ?? DEFAULTS.aiCanAdjust,
      });
    }
  }, [currentSettings, mode]);

  useEffect(() => {
    if (tradingSettings) {
      setGlobalSettings({
        dailyLossKillSwitch: parseFloat(String(tradingSettings.dailyLossKillSwitch)) || GLOBAL_DEFAULTS.dailyLossKillSwitch,
        maxPositionPercent: parseFloat(String(tradingSettings.maxPositionPercent)) || GLOBAL_DEFAULTS.maxPositionPercent,
      });
    }
  }, [tradingSettings]);

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Guardrails>) => {
      return fetch(`/api/guardrails?mode=${mode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(updates)
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guardrails', mode] });
      toast({
        title: "Guardrails updated",
        description: `Risk parameters have been saved successfully for ${mode} mode.`,
      });
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update guardrails",
        variant: "destructive",
      });
    },
  });

  const updateGlobalMutation = useMutation({
    mutationFn: async (updates: Partial<TradingSettings>) => {
      return fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(updates)
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update global settings",
        variant: "destructive",
      });
    },
  });

  const handleChange = (field: keyof Guardrails, value: string | boolean) => {
    if (typeof value === 'boolean') {
      setSettings(prev => ({ ...prev, [field]: value }));
    } else {
      const numValue = parseFloat(value) || 0;
      setSettings(prev => ({ ...prev, [field]: numValue }));
    }
    setHasChanges(true);
  };

  const handleGlobalChange = (field: keyof TradingSettings, value: string) => {
    const numValue = parseFloat(value) || 0;
    setGlobalSettings(prev => ({ ...prev, [field]: numValue }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      await Promise.all([
        updateMutation.mutateAsync(settings),
        updateGlobalMutation.mutateAsync(globalSettings)
      ]);
      toast({
        title: "Settings saved",
        description: "All guardrail parameters have been updated successfully.",
      });
      setHasChanges(false);
    } catch (error) {
      // Errors handled by individual mutations
    }
  };

  const handleReset = () => {
    setSettings(DEFAULTS);
    setGlobalSettings(GLOBAL_DEFAULTS);
    setHasChanges(true);
    toast({
      title: "Reset to Defaults",
      description: "Guardrails have been reset to default values.",
    });
  };

  if (isLoading || isLoadingSettings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Guardrails Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Guardrails Configuration
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Portfolio-level risk parameters to protect your trading account
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleReset}
            variant="outline"
            data-testid="button-reset-guardrails"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Defaults
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || updateMutation.isPending}
            data-testid="button-save-guardrails"
          >
            <Save className="w-4 h-4 mr-2" />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Global Risk Limits Section */}
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500" />
            <h3 className="font-semibold text-amber-900 dark:text-amber-100">Global Risk Limits</h3>
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-200/80 mb-4">
            These safety parameters apply across both Live and Paper trading modes
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="space-y-2">
                    <Label htmlFor="dailyLossKillSwitch">Daily Loss Kill Switch (%)</Label>
                    <Input
                      id="dailyLossKillSwitch"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={globalSettings.dailyLossKillSwitch || ''}
                      onChange={(e) => handleGlobalChange('dailyLossKillSwitch', e.target.value)}
                      data-testid="input-daily-loss-kill-switch"
                      className="bg-white dark:bg-slate-950"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum total daily portfolio loss before trading stops automatically
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Percentage of your portfolio value that triggers an automatic trading halt. Default: 7%</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="space-y-2">
                    <Label htmlFor="maxPositionPercent">Max Position Size Cap (%)</Label>
                    <Input
                      id="maxPositionPercent"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={globalSettings.maxPositionPercent || ''}
                      onChange={(e) => handleGlobalChange('maxPositionPercent', e.target.value)}
                      data-testid="input-max-position-percent"
                      className="bg-white dark:bg-slate-950"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum percentage of your portfolio allowed in a single trade
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Maximum portfolio percentage allowed for any single position. Default: 10%</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Mode-Specific Guardrails Section */}
        <div className="mb-4">
          <h3 className="font-semibold text-sm text-muted-foreground mb-4">
            Mode-Specific Risk Parameters ({mode === 'live' ? 'Live' : 'Paper'} Mode)
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="maxDailyLoss">Max Daily Loss ($)</Label>
            <Input
              id="maxDailyLoss"
              type="number"
              step="0.01"
              value={settings.maxDailyLoss || ''}
              onChange={(e) => handleChange('maxDailyLoss', e.target.value)}
              data-testid="input-max-daily-loss"
            />
            <p className="text-xs text-muted-foreground">
              Maximum loss allowed per day before trading is halted
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxDrawdown">Max Drawdown (%)</Label>
            <Input
              id="maxDrawdown"
              type="number"
              step="0.1"
              value={settings.maxDrawdown || ''}
              onChange={(e) => handleChange('maxDrawdown', e.target.value)}
              data-testid="input-max-drawdown"
            />
            <p className="text-xs text-muted-foreground">
              Maximum portfolio drawdown percentage before trading stops
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxPositionSize">Max Position Size ($)</Label>
            <Input
              id="maxPositionSize"
              type="number"
              step="0.01"
              value={settings.maxPositionSize || ''}
              onChange={(e) => handleChange('maxPositionSize', e.target.value)}
              data-testid="input-max-position-size"
            />
            <p className="text-xs text-muted-foreground">
              Maximum dollar amount for a single trade position
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxOpenPositions">Max Open Positions</Label>
            <Input
              id="maxOpenPositions"
              type="number"
              value={settings.maxOpenPositions || ''}
              onChange={(e) => handleChange('maxOpenPositions', e.target.value)}
              data-testid="input-max-open-positions"
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of concurrent open trades
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="riskPerTrade">Risk Per Trade (%)</Label>
            <Input
              id="riskPerTrade"
              type="number"
              step="0.1"
              value={settings.riskPerTrade || ''}
              onChange={(e) => handleChange('riskPerTrade', e.target.value)}
              data-testid="input-risk-per-trade"
            />
            <p className="text-xs text-muted-foreground">
              Percentage of portfolio to risk on each trade
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="ai-adjust" 
              checked={settings.aiCanAdjust || false}
              onCheckedChange={(checked) => handleChange('aiCanAdjust', checked as boolean)}
              data-testid="checkbox-ai-adjust"
            />
            <Label htmlFor="ai-adjust" className="text-sm font-medium cursor-pointer">
              AI may adjust guardrails automatically based on goals
            </Label>
          </div>
          <p className="text-sm text-muted-foreground">
            <Shield className="w-4 h-4 inline mr-2" />
            When enabled, the AI can modify these guardrails to optimize risk/reward balance while staying within safe limits
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
