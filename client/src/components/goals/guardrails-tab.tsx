import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Shield, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface TradingSettings {
  maxDailyLoss: number;
  maxPositionSize: number;
  maxOpenPositions: number;
  maxDrawdown: number;
  riskPerTrade: number;
}

export default function GuardrailsTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Partial<TradingSettings>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const { data: currentSettings, isLoading } = useQuery<TradingSettings>({
    queryKey: ['/api/settings'],
  });

  useEffect(() => {
    if (currentSettings) {
      setSettings({
        maxDailyLoss: currentSettings.maxDailyLoss,
        maxPositionSize: currentSettings.maxPositionSize,
        maxOpenPositions: currentSettings.maxOpenPositions,
        maxDrawdown: currentSettings.maxDrawdown,
        riskPerTrade: currentSettings.riskPerTrade,
      });
    }
  }, [currentSettings]);

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<TradingSettings>) => {
      return apiRequest('PATCH', '/api/settings', updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      toast({
        title: "Guardrails updated",
        description: "Risk parameters have been saved successfully.",
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

  const handleChange = (field: keyof TradingSettings, value: string) => {
    const numValue = parseFloat(value) || 0;
    setSettings(prev => ({ ...prev, [field]: numValue }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate(settings);
  };

  if (isLoading) {
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
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || updateMutation.isPending}
          data-testid="button-save-guardrails"
        >
          <Save className="w-4 h-4 mr-2" />
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </CardHeader>
      <CardContent>
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

        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <Shield className="w-4 h-4 inline mr-2" />
            The AI can modify these guardrails based on agreed goals to optimize risk/reward balance
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
