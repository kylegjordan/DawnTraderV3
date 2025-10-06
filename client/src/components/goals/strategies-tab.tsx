import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layers, Save, RotateCcw, Check, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const STRATEGIES = [
  { id: 'vwap_pullback', name: 'VWAP Pullback', description: 'Entry when price pulls back to VWAP with momentum confirmation' },
  { id: 'abcd_long', name: 'ABCD Long', description: 'Classic ABCD pattern with Fibonacci retracement levels' },
  { id: 'sma_trend_ride', name: 'SMA Trend Ride', description: 'Trend following strategy using moving average crossovers' },
];

const PARAM_LABELS: Record<string, string> = {
  maxConcurrentPositions: "Max Concurrent Positions",
  riskPerTrade: "Risk Per Trade (%)",
  takeProfitR: "Take Profit R-Multiple",
  stopLossR: "Stop Loss R-Multiple",
  cooldownMinutes: "Cooldown (minutes)",
  vwapLookbackMin: "VWAP Lookback (min)",
  pullbackPct: "Pullback Threshold (%)",
  minVolumeUsd: "Min Volume (USD)",
  minAtoBStrength: "Min A→B Strength",
  cPullbackPctMax: "C Pullback Max (%)",
  dBreakoutBufferPct: "D Breakout Buffer (%)",
  fastSma: "Fast SMA Period",
  slowSma: "Slow SMA Period",
  trendStrengthMin: "Trend Strength Min",
};

const PARAM_DESCRIPTIONS: Record<string, string> = {
  maxConcurrentPositions: "Maximum number of concurrent positions for this strategy (0-20)",
  riskPerTrade: "Percentage of portfolio to risk per trade (0.05-5%)",
  takeProfitR: "Target profit in R-multiples (0.2-10)",
  stopLossR: "Stop loss in R-multiples (0.1-10)",
  cooldownMinutes: "Minutes to wait between trades for the same symbol (0-240)",
  vwapLookbackMin: "VWAP calculation lookback period in minutes (1-120)",
  pullbackPct: "Pullback threshold percentage (0.1-5%)",
  minVolumeUsd: "Minimum 24h volume in USD (0+)",
  minAtoBStrength: "Minimum A to B leg strength (0.1-5)",
  cPullbackPctMax: "Maximum C pullback percentage (1-30%)",
  dBreakoutBufferPct: "D breakout buffer percentage (0-5%)",
  fastSma: "Fast SMA period (3-50)",
  slowSma: "Slow SMA period (10-200)",
  trendStrengthMin: "Minimum trend strength (0-1)",
};

function StrategyCard({ strategy }: { strategy: typeof STRATEGIES[0] }) {
  const { mode } = useTradingMode();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});

  // Fetch strategy settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['/api/strategies/settings', strategy.id, mode],
    queryFn: async () => {
      const response = await fetch(
        `/api/strategies/settings?strategy=${strategy.id}&mode=${mode}`,
        { headers: { 'user-id': localStorage.getItem('accessToken') || '' } }
      );
      return response.json();
    },
  });

  // Validate mutation
  const validateMutation = useMutation({
    mutationFn: async (params: Record<string, any>) => {
      const response = await apiRequest('POST', '/api/strategies/settings/validate', {
        strategy: strategy.id,
        params,
      });
      return response;
    },
    onSuccess: (data) => {
      if (data.ok) {
        setValidationErrors({});
        toast({
          title: "Validation Successful",
          description: "Settings are valid and ready to save",
        });
      } else {
        setValidationErrors(data.errors?.fieldErrors || {});
        toast({
          title: "Validation Failed",
          description: "Please check the errors and try again",
          variant: "destructive",
        });
      }
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (params: Record<string, any>) => {
      const response = await apiRequest('PUT', '/api/strategies/settings', {
        strategy: strategy.id,
        mode,
        params,
        reason: 'user manual update',
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/strategies/settings'] });
      setEditing(false);
      toast({
        title: "Settings Saved",
        description: `${strategy.name} settings have been updated and reloaded`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const handleEdit = () => {
    setFormData(settings?.params || {});
    setEditing(true);
    setValidationErrors({});
  };

  const handleCancel = () => {
    setEditing(false);
    setFormData({});
    setValidationErrors({});
  };

  const handleValidate = () => {
    validateMutation.mutate(formData);
  };

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handleReset = () => {
    // Reset to defaults by setting empty object (server will apply defaults)
    setFormData({});
    toast({
      title: "Reset to Defaults",
      description: "Form has been reset. Click Save to apply default values.",
    });
  };

  const handleFieldChange = (field: string, value: string) => {
    const numValue = parseFloat(value);
    setFormData({ ...formData, [field]: isNaN(numValue) ? value : numValue });
    // Clear validation error for this field
    if (validationErrors[field]) {
      const newErrors = { ...validationErrors };
      delete newErrors[field];
      setValidationErrors(newErrors);
    }
  };

  const currentParams = editing ? formData : settings?.params || {};
  const paramKeys = Object.keys(currentParams);

  if (isLoading) {
    return (
      <Card className="border-2">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full mt-2" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasSettings = settings && settings.params;

  return (
    <Card className="border-2" data-testid={`strategy-card-${strategy.id}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{strategy.name}</CardTitle>
            <CardDescription className="mt-1">
              {strategy.description}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={hasSettings ? "default" : "secondary"} data-testid={`status-${strategy.id}`}>
              {hasSettings ? "Configured" : "Default"}
            </Badge>
            {!editing ? (
              <Button onClick={handleEdit} size="sm" variant="outline" data-testid={`button-edit-${strategy.id}`}>
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={handleValidate}
                  size="sm"
                  variant="outline"
                  disabled={validateMutation.isPending}
                  data-testid={`button-validate-${strategy.id}`}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Validate
                </Button>
                <Button
                  onClick={handleSave}
                  size="sm"
                  disabled={saveMutation.isPending}
                  data-testid={`button-save-${strategy.id}`}
                >
                  <Save className="w-4 h-4 mr-1" />
                  Save
                </Button>
                <Button
                  onClick={handleCancel}
                  size="sm"
                  variant="ghost"
                  data-testid={`button-cancel-${strategy.id}`}
                >
                  <X className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {paramKeys.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No parameters configured. Click Edit to configure this strategy.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paramKeys.map((key) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`${strategy.id}-${key}`} className="text-sm">
                  {PARAM_LABELS[key] || key}
                </Label>
                {editing ? (
                  <div>
                    <Input
                      id={`${strategy.id}-${key}`}
                      type="number"
                      step="any"
                      value={currentParams[key] ?? ''}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      className={validationErrors[key] ? "border-red-500" : ""}
                      data-testid={`input-${strategy.id}-${key}`}
                    />
                    {PARAM_DESCRIPTIONS[key] && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {PARAM_DESCRIPTIONS[key]}
                      </p>
                    )}
                    {validationErrors[key] && (
                      <p className="text-xs text-red-500 mt-1">
                        {validationErrors[key].join(', ')}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="text-sm font-mono font-semibold" data-testid={`value-${strategy.id}-${key}`}>
                      {currentParams[key]}
                    </div>
                    {PARAM_DESCRIPTIONS[key] && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {PARAM_DESCRIPTIONS[key]}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {editing && (
          <div className="mt-4 pt-4 border-t">
            <Button
              onClick={handleReset}
              size="sm"
              variant="outline"
              data-testid={`button-reset-${strategy.id}`}
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Reset to Defaults
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StrategiesTab() {
  const { mode } = useTradingMode();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="w-5 h-5" />
          Trading Strategies Configuration
        </CardTitle>
        <CardDescription>
          Configure parameters for each trading strategy in <Badge variant="outline">{mode}</Badge> mode
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {STRATEGIES.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}

          <Separator className="my-6" />
          
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <Layers className="w-4 h-4 inline mr-2" />
              Strategy parameters are isolated by mode (live/paper). The AI can propose changes through the Goals Engine,
              but all changes require your approval before being applied.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
