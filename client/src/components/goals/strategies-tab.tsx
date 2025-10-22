import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModeIndicator } from "./mode-indicator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layers, Save, RotateCcw, Check, X, Download, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumberWithCommas, parseCommaFormattedNumber } from "@/lib/utils";

const STRATEGIES = [
  { id: 'vwap_pullback', name: 'VWAP Pullback', description: 'Entry when price pulls back to VWAP with momentum confirmation' },
  { id: 'abcd_long', name: 'ABCD Long', description: 'Classic ABCD pattern with Fibonacci retracement levels' },
  { id: 'sma_trend_ride', name: 'SMA Trend Ride', description: 'Trend following strategy using moving average crossovers' },
  { id: 'breakout', name: 'Breakout', description: 'Trades price breakouts from consolidation ranges with volume confirmation' },
  { id: 'mean_reversion', name: 'Mean Reversion', description: 'Trades oversold/overbought conditions in ranging markets back to mean' },
  { id: 'range_trading', name: 'Range Trading', description: 'Systematically trades within identified ranges, buying support and selling resistance' },
  { id: 'vwap_bounce', name: 'VWAP Bounce', description: 'Trades bounces from VWAP in trending markets using dynamic support/resistance' },
  { id: 'liquidity_trap', name: 'Liquidity Trap', description: 'Advanced strategy trading false breakouts where stops are triggered then reversed' },
];

const PARAM_LABELS: Record<string, string> = {
  // Base common parameters
  maxConcurrentPositions: "Max Concurrent Positions",
  riskPerTrade: "Risk Per Trade (%)",
  takeProfitR: "Take Profit R-Multiple",
  stopLossR: "Stop Loss R-Multiple",
  cooldownMinutes: "Cooldown (minutes)",
  // VWAP Pullback
  vwapLookbackMin: "VWAP Lookback (min)",
  pullbackPct: "Pullback Threshold (%)",
  minVolumeUsd: "Min Volume (USD)",
  // ABCD Long
  minAtoBStrength: "Min A→B Strength",
  cPullbackPctMax: "C Pullback Max (%)",
  dBreakoutBufferPct: "D Breakout Buffer (%)",
  // SMA Trend Ride
  fastSma: "Fast SMA Period",
  slowSma: "Slow SMA Period",
  trendStrengthMin: "Trend Strength Min",
  // Breakout Strategy
  minConsolidationBars: "Min Consolidation Bars",
  maxRangeWidth: "Max Range Width (%)",
  breakoutBuffer: "Breakout Buffer (%)",
  volumeMultiplier: "Volume Multiplier (x)",
  trailingStopEnabled: "Trailing Stop Enabled",
  maxHoldingHours: "Max Holding (hours)",
  // Mean Reversion
  meanType: "Mean Reference Type",
  smaLength: "SMA Period",
  deviationThreshold: "Deviation Threshold (%)",
  minRangeTouches: "Min Range Touches",
  partialExitPercent: "Partial Exit (%)",
  stopLossBuffer: "Stop Loss Buffer (%)",
  // Range Trading
  minRangeDurationHours: "Min Range Duration (hours)",
  minRangeWidth: "Min Range Width (%)",
  minBoundaryTouches: "Min Boundary Touches",
  entryZoneWidth: "Entry Zone Width (%)",
  stopLossBeyond: "Stop Loss Beyond (%)",
  // VWAP Bounce
  vwapProximity: "VWAP Proximity (%)",
  minVWAPSlope: "Min VWAP Slope (%)",
  trailingToVWAP: "Trail Stop to VWAP",
  maxPullbackBars: "Max Pullback Bars",
  partialExitR: "Partial Exit R-Multiple",
  // Liquidity Trap
  maxTrapExtension: "Max Trap Extension (%)",
  trapReturnBars: "Trap Return Bars",
  minStopZoneSize: "Min Stop Zone Size",
  minLevelTouches: "Min Level Touches",
  volumeRatio: "Volume Ratio (x)",
};

// Parameters that are percentages in the UI but decimal fractions in the backend
const PERCENTAGE_PARAMS = new Set([
  'riskPerTrade',
  'pullbackPct',
  'cPullbackPctMax',
  'dBreakoutBufferPct',
  'maxRangeWidth',
  'breakoutBuffer',
  'deviationThreshold',
  'partialExitPercent',
  'stopLossBuffer',
  'minRangeWidth',
  'entryZoneWidth',
  'stopLossBeyond',
  'vwapProximity',
  'minVWAPSlope',
  'maxTrapExtension',
]);

const PARAM_DESCRIPTIONS: Record<string, string> = {
  // Base common
  maxConcurrentPositions: "Maximum number of concurrent positions for this strategy (0-20)",
  riskPerTrade: "Percentage of portfolio to risk per trade (0.05-5%)",
  takeProfitR: "Target profit in R-multiples (0.2-10)",
  stopLossR: "Stop loss in R-multiples (0.1-10)",
  cooldownMinutes: "Minutes to wait between trades for the same symbol (0-240)",
  // VWAP Pullback
  vwapLookbackMin: "VWAP calculation lookback period in minutes (1-120)",
  pullbackPct: "Pullback threshold percentage (0.1-5%)",
  minVolumeUsd: "Minimum 24h volume in USD (0+)",
  // ABCD Long
  minAtoBStrength: "Minimum A to B leg strength (0.1-5)",
  cPullbackPctMax: "Maximum C pullback percentage (1-30%)",
  dBreakoutBufferPct: "D breakout buffer percentage (0-5%)",
  // SMA Trend Ride
  fastSma: "Fast SMA period (3-50)",
  slowSma: "Slow SMA period (10-200)",
  trendStrengthMin: "Minimum trend strength (0-1)",
  // Breakout
  minConsolidationBars: "Minimum bars required for valid consolidation range (5-30)",
  maxRangeWidth: "Maximum range width as % of price (1-5%)",
  breakoutBuffer: "Buffer above resistance for entry (0.5-2%)",
  volumeMultiplier: "Volume spike confirmation multiplier (1.5-3x avg)",
  trailingStopEnabled: "Enable trailing stop after reaching profit",
  maxHoldingHours: "Maximum position duration in hours (2-24)",
  // Mean Reversion
  meanType: "Reference point for mean: VWAP, SMA, or range midpoint",
  smaLength: "SMA period if using SMA as mean (10-50)",
  deviationThreshold: "Distance from mean required for entry (1.5-4%)",
  minRangeTouches: "Minimum support/resistance touches required (2-4)",
  partialExitPercent: "Percent of position to exit at 50% reversion (25-75%)",
  stopLossBuffer: "Stop loss distance beyond extreme (0.5-2%)",
  // Range Trading
  minRangeDurationHours: "Minimum range duration before trading (4-48 hours)",
  minRangeWidth: "Minimum range width for adequate profit potential (2-8%)",
  minBoundaryTouches: "Minimum touches per boundary to validate range (2-5)",
  entryZoneWidth: "Entry zone around support/resistance (0.2-0.8%)",
  stopLossBeyond: "Stop loss distance beyond boundary (0.5-2%)",
  // VWAP Bounce
  vwapProximity: "Maximum distance from VWAP for entry (0.2-1%)",
  minVWAPSlope: "Minimum VWAP upward slope for trend confirmation (0.1-1%)",
  trailingToVWAP: "Trail stop to VWAP after profit",
  maxPullbackBars: "Maximum pullback duration in bars (2-10)",
  partialExitR: "R-multiple for partial exit (1-2R)",
  // Liquidity Trap
  maxTrapExtension: "Maximum breakout distance before reversal (0.5-2%)",
  trapReturnBars: "Bars required for price to return to range (1-3)",
  minStopZoneSize: "Minimum liquidity cluster size: small, medium, or large",
  minLevelTouches: "Minimum touches of trap level (2-5)",
  volumeRatio: "Return volume vs breakout volume ratio (1.2-2x)",
};

interface StrategySettings {
  enabled?: boolean;
  params?: Record<string, any>;
}

function StrategyCard({ strategy }: { strategy: typeof STRATEGIES[0] }) {
  const { mode } = useTradingMode();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [isSavingToggle, setIsSavingToggle] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [presets, setPresets] = useState<Record<string, any>>({});
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [rawInputValues, setRawInputValues] = useState<Record<string, string>>({});

  // Fetch strategy settings - enable refetch on window focus for fresh state
  const { data: settings, isLoading } = useQuery<StrategySettings>({
    queryKey: [`/api/strategies/settings?strategy=${strategy.id}&mode=${mode}`],
    staleTime: 30000, // Reduce stale time to 30 seconds
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    retry: false,
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
        enabled: isEnabled,
        params,
        reason: 'user manual update',
      });
      return response;
    },
    onSuccess: async () => {
      // Invalidate specific query to refresh with latest data
      await queryClient.invalidateQueries({ 
        queryKey: [`/api/strategies/settings?strategy=${strategy.id}&mode=${mode}`] 
      });
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

  // Fetch presets on mount and auto-load Balanced if no settings exist
  useEffect(() => {
    const fetchPresets = async () => {
      try {
        const { ensureValidToken } = await import('@/lib/auth');
        const token = await ensureValidToken();
        
        const response = await fetch(`/api/strategies/presets?strategy=${strategy.id.toUpperCase()}`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });
        const data = await response.json();
        if (data.ok) {
          setPresets(data.presets);
          // Auto-load Balanced preset if no settings exist
          if (!settings?.params && data.presets.Balanced) {
            setFormData(data.presets.Balanced);
          }
        }
      } catch (error) {
        console.error('Error fetching presets:', error);
      }
    };
    fetchPresets();
  }, [strategy.id, settings]);

  // Sync enabled state from backend settings
  useEffect(() => {
    if (settings?.enabled !== undefined) {
      setIsEnabled(settings.enabled);
    }
  }, [settings]);

  const handleEdit = () => {
    // Use existing settings or keep the auto-loaded Balanced preset
    const params = settings?.params || formData;
    // Convert decimal fractions to percentages for UI display
    const uiParams = { ...params };
    Object.keys(uiParams).forEach(key => {
      if (PERCENTAGE_PARAMS.has(key) && typeof uiParams[key] === 'number') {
        uiParams[key] = uiParams[key] * 100;
      }
    });
    setFormData(uiParams);
    setEditing(true);
    setValidationErrors({});
  };

  const handleCancel = () => {
    setEditing(false);
    setFormData({});
    setValidationErrors({});
  };

  const handleValidate = () => {
    // Convert percentages to decimal fractions for validation
    const backendParams = { ...formData };
    Object.keys(backendParams).forEach(key => {
      if (PERCENTAGE_PARAMS.has(key) && typeof backendParams[key] === 'number') {
        backendParams[key] = backendParams[key] / 100;
      }
    });
    validateMutation.mutate(backendParams);
  };

  const handleSave = () => {
    // Convert percentages to decimal fractions for backend
    const backendParams = { ...formData };
    Object.keys(backendParams).forEach(key => {
      if (PERCENTAGE_PARAMS.has(key) && typeof backendParams[key] === 'number') {
        backendParams[key] = backendParams[key] / 100;
      }
    });
    saveMutation.mutate(backendParams);
  };

  const handleReset = () => {
    // Reset to defaults by setting empty object (server will apply defaults)
    setFormData({});
    toast({
      title: "Reset to Defaults",
      description: "Form has been reset. Click Save to apply default values.",
    });
  };

  const handleLoadPreset = () => {
    if (!selectedPreset || !presets[selectedPreset]) {
      toast({
        title: "No Preset Selected",
        description: "Please select a preset first",
        variant: "destructive",
      });
      return;
    }
    // Convert decimal fractions to percentages for UI display
    const preset = { ...presets[selectedPreset] };
    Object.keys(preset).forEach(key => {
      if (PERCENTAGE_PARAMS.has(key) && typeof preset[key] === 'number') {
        preset[key] = preset[key] * 100;
      }
    });
    setFormData(preset);
    toast({
      title: "Preset Loaded",
      description: `${selectedPreset} preset loaded for ${strategy.name}. Click Save to apply.`,
    });
  };

  const handleFieldChange = (field: string, value: string) => {
    // Store raw string value while editing
    setRawInputValues(prev => ({ ...prev, [field]: value }));
    // Clear validation error for this field
    if (validationErrors[field]) {
      const newErrors = { ...validationErrors };
      delete newErrors[field];
      setValidationErrors(newErrors);
    }
  };

  const handleFieldBlur = (field: string) => {
    const rawValue = rawInputValues[field];
    if (rawValue !== undefined) {
      const numValue = parseCommaFormattedNumber(rawValue);
      setFormData({ ...formData, [field]: numValue });
      // Clear raw value after parsing
      setRawInputValues(prev => {
        const newValues = { ...prev };
        delete newValues[field];
        return newValues;
      });
    }
    setFocusedField(null);
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    // Show saving indicator
    setIsSavingToggle(true);
    
    try {
      // Wait for backend confirmation before updating UI
      await apiRequest('PUT', '/api/strategies/settings', {
        strategy: strategy.id,
        mode,
        enabled,
        params: settings?.params || formData || {},
        reason: `strategy ${enabled ? 'enabled' : 'disabled'}`,
      });
      
      // Update UI only after successful backend save
      setIsEnabled(enabled);
      
      // Invalidate specific query to refresh with latest data
      await queryClient.invalidateQueries({ 
        queryKey: [`/api/strategies/settings?strategy=${strategy.id}&mode=${mode}`] 
      });
      
      toast({
        title: enabled ? "Strategy Enabled" : "Strategy Disabled",
        description: `${strategy.name} is now ${enabled ? 'active' : 'inactive'} in ${mode} mode`,
      });
    } catch (error: any) {
      // Don't update UI on error - keep previous state
      toast({
        title: "Save Failed",
        description: error.message || "Failed to update strategy status. Please try again.",
        variant: "destructive",
      });
    } finally {
      // Always clear saving indicator
      setIsSavingToggle(false);
    }
  };

  // Helper function to convert params for UI display (decimal fractions -> percentages)
  const convertParamsForDisplay = (params: Record<string, any>) => {
    const displayParams = { ...params };
    Object.keys(displayParams).forEach(key => {
      if (PERCENTAGE_PARAMS.has(key) && typeof displayParams[key] === 'number') {
        displayParams[key] = displayParams[key] * 100;
      }
    });
    return displayParams;
  };

  // Use Balanced preset values as fallback if no saved settings
  const rawParams = editing ? formData : (settings?.params || formData || {});
  const currentParams = editing ? rawParams : convertParamsForDisplay(rawParams);
  const paramKeys = Object.keys(currentParams);

  if (isLoading && !settings) {
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
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">{strategy.name}</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Switch 
                    checked={isEnabled}
                    onCheckedChange={handleToggleEnabled}
                    disabled={isSavingToggle}
                    data-testid={`switch-enable-${strategy.id}`}
                    className={isEnabled ? "data-[state=checked]:bg-green-500" : ""}
                  />
                  {isSavingToggle && (
                    <Loader2 className="absolute -right-6 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <Label className="text-xs text-muted-foreground cursor-pointer">
                  {isSavingToggle ? 'Saving...' : (isEnabled ? 'Enabled' : 'Disabled')}
                </Label>
              </div>
            </div>
            <CardDescription className="mt-1">
              {strategy.description}
            </CardDescription>
            {paramKeys.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                {paramKeys.slice(0, 3).map((key, idx) => (
                  <span key={key}>
                    {PARAM_LABELS[key] || key}: <span className="font-mono font-semibold">{currentParams[key]}</span>
                    {idx < Math.min(2, paramKeys.length - 1) ? " • " : ""}
                  </span>
                ))}
                {paramKeys.length > 3 && <span> • +{paramKeys.length - 3} more</span>}
              </div>
            )}
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
                    type="text"
                    value={focusedField === `${strategy.id}-${key}` ? (rawInputValues[key] ?? currentParams[key] ?? '') : formatNumberWithCommas(currentParams[key] ?? '')}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    onFocus={() => setFocusedField(`${strategy.id}-${key}`)}
                    onBlur={() => handleFieldBlur(key)}
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
        {editing && (
          <div className="mt-4 pt-4 border-t space-y-4">
            {Object.keys(presets).length > 0 && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor={`preset-select-${strategy.id}`} className="text-sm mb-2 block">
                    Load Preset
                  </Label>
                  <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                    <SelectTrigger id={`preset-select-${strategy.id}`} data-testid={`select-preset-${strategy.id}`}>
                      <SelectValue placeholder="Select a preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(presets).map((presetName) => (
                        <SelectItem key={presetName} value={presetName} data-testid={`preset-option-${presetName}`}>
                          {presetName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleLoadPreset}
                  size="sm"
                  variant="secondary"
                  disabled={!selectedPreset}
                  data-testid={`button-load-preset-${strategy.id}`}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Load Preset
                </Button>
              </div>
            )}
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
          <ModeIndicator />
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
