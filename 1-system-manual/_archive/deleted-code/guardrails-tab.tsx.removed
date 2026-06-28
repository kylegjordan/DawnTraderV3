import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ModeIndicator } from "./mode-indicator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Shield, Save, RotateCcw, AlertTriangle, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { formatNumberWithCommas, parseCommaFormattedNumber } from "@/lib/utils";
import { useBaselineStatus } from "@/hooks/use-baseline-status";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, CheckCircle2, Clock } from "lucide-react";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyToLiveModal } from "./copy-to-live-modal";
import { useTrading } from "@/hooks/use-trading";
import { useWebSocket } from "@/hooks/use-websocket";

const DEFAULTS = {
  maxDailyLoss: 1000,
  maxDrawdown: 10,
  maxPositionSize: 5000,
  maxOpenPositions: 5,
  riskPerTrade: 1.5,
  aiCanAdjust: false,
  maxRequiredCapital: 100000,
  maxRiskPerTradeLimit: 1000,
  // Phase 27.F.14.UI-SYNC.2: Execution Rhythm Controls (Behavioral)
  cooldownMinutes: 15,
  // Phase 27.F.14.MICRO: Micro-Execution Loop Controls
  microLoopInterval: 8,
  priceDeltaTrigger: 0.30,
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
  maxRequiredCapital: number;
  maxRiskPerTradeLimit: number;
  // Phase 27.F.14.UI-SYNC.2: Execution Rhythm Controls (Behavioral)
  cooldownMinutes?: number;
  // Phase 27.F.14.MICRO: Micro-Execution Loop Controls
  microLoopInterval?: number;
  priceDeltaTrigger?: number;
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
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [rawInputValues, setRawInputValues] = useState<Record<string, string>>({});
  const lastMode = useRef<string | null>(null);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  
  // Phase 27.F.14.B - Task 3: Fee-Aware Metrics Display
  const { data: baselineStatus } = useBaselineStatus({ enabled: mode === 'paper' });
  
  // Phase 27.F.14.B - Task 4: Copy to Live - Check if live trading is stopped
  const { tradingStatus } = useTrading();
  
  // Phase 27.F.17b: WebSocket subscriptions for real-time updates
  const { messages } = useWebSocket();

  const { data: currentSettings, isLoading } = useQuery<Guardrails>({
    queryKey: [`/api/guardrails?mode=${mode}`],
  });

  const { data: tradingSettings, isLoading: isLoadingSettings } = useQuery<TradingSettings>({
    queryKey: ['/api/settings'],
  });

  useEffect(() => {
    // Only update local state when data first loads or mode changes
    // Don't update during refetches after save (prevents overwriting user's saved values)
    if (currentSettings && lastMode.current !== mode) {
      lastMode.current = mode;
      setSettings({
        maxDailyLoss: currentSettings.maxDailyLoss ?? DEFAULTS.maxDailyLoss,
        maxPositionSize: currentSettings.maxPositionSize ?? DEFAULTS.maxPositionSize,
        maxOpenPositions: currentSettings.maxOpenPositions ?? DEFAULTS.maxOpenPositions,
        maxDrawdown: currentSettings.maxDrawdown ?? DEFAULTS.maxDrawdown,
        riskPerTrade: currentSettings.riskPerTrade ?? DEFAULTS.riskPerTrade,
        aiCanAdjust: currentSettings.aiCanAdjust ?? DEFAULTS.aiCanAdjust,
        maxRequiredCapital: currentSettings.maxRequiredCapital ?? DEFAULTS.maxRequiredCapital,
        maxRiskPerTradeLimit: currentSettings.maxRiskPerTradeLimit ?? DEFAULTS.maxRiskPerTradeLimit,
        // Phase 27.F.14.UI-SYNC.2: Execution Rhythm Controls (Behavioral)
        cooldownMinutes: currentSettings.cooldownMinutes ?? DEFAULTS.cooldownMinutes,
        // Phase 27.F.14.MICRO: Micro-Execution Loop Controls
        microLoopInterval: currentSettings.microLoopInterval ?? DEFAULTS.microLoopInterval,
        priceDeltaTrigger: currentSettings.priceDeltaTrigger ?? DEFAULTS.priceDeltaTrigger,
      });
      setHasChanges(false);
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
  
  // Phase 27.F.17b: Listen for WebSocket broadcasts and invalidate caches
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    
    // Extract mode from payload (server sends { type, mode, payload })
    const messageMode = (lastMessage as any).mode;
    
    // Listen for guardrails_updated broadcast
    if (lastMessage.type === 'guardrails_updated' && messageMode === mode) {
      console.log('[Guardrails] Received guardrails_updated broadcast, refreshing cache');
      queryClient.invalidateQueries({ queryKey: ['/api/guardrails', mode] });
    }
    
    // Listen for tuning_policy_updated broadcast
    if (lastMessage.type === 'tuning_policy_updated' && messageMode === mode) {
      console.log('[Guardrails] Received tuning_policy_updated broadcast, refreshing tuning cache');
      queryClient.invalidateQueries({ queryKey: ['/api/tuning/policy', mode] });
    }
  }, [messages, mode]);

  // Phase 27.F.17b: Updated to handle new response format and invalidate tuning policy cache
  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Guardrails>) => {
      const response = await fetch(`/api/guardrails?mode=${mode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      
      // Phase 27.F.17b: Handle new structured response format
      if (!response.ok || data.ok === false) {
        throw new Error(data.detail || data.error || 'Failed to update guardrails');
      }
      
      // Return the data field if present (new format), otherwise return full data (backward compat)
      return data.data || data;
    },
    onSuccess: () => {
      // Phase 27.F.17b: Invalidate both guardrails and tuning policy caches
      // Force immediate refetch with refetchType: 'all' to ensure inactive queries are also refetched
      queryClient.invalidateQueries({ 
        queryKey: ['/api/guardrails', mode],
        refetchType: 'all'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/tuning/policy', mode],
        refetchType: 'all'
      });
      
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
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update global settings');
      }
      return data;
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
      // Store raw string value while editing
      setRawInputValues(prev => ({ ...prev, [field]: value }));
    }
    setHasChanges(true);
  };

  const handleGlobalChange = (field: keyof TradingSettings, value: string) => {
    // Store raw string value while editing
    setRawInputValues(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleBlur = (field: string, isGlobal: boolean = false) => {
    const rawValue = rawInputValues[field];
    if (rawValue !== undefined) {
      const numValue = parseCommaFormattedNumber(rawValue);
      if (isGlobal) {
        setGlobalSettings(prev => ({ ...prev, [field]: numValue }));
      } else {
        setSettings(prev => ({ ...prev, [field]: numValue }));
      }
      // Clear raw value after parsing
      setRawInputValues(prev => {
        const newValues = { ...prev };
        delete newValues[field];
        return newValues;
      });
    }
    setFocusedField(null);
  };

  const handleSave = async () => {
    try {
      // Phase 27.F.17b: Parse any pending raw values before save
      const finalSettings = { ...settings };
      const finalGlobalSettings = { ...globalSettings };
      
      // Merge raw input values into final settings
      Object.keys(rawInputValues).forEach(key => {
        const rawValue = rawInputValues[key];
        if (rawValue !== undefined) {
          const numValue = parseCommaFormattedNumber(rawValue);
          if (key in globalSettings) {
            (finalGlobalSettings as any)[key] = numValue;
          } else {
            (finalSettings as any)[key] = numValue;
          }
        }
      });
      
      await Promise.all([
        updateMutation.mutateAsync(finalSettings),
        updateGlobalMutation.mutateAsync(finalGlobalSettings)
      ]);
      toast({
        title: "Settings saved",
        description: "All guardrail parameters have been updated successfully.",
      });
      setHasChanges(false);
      setRawInputValues({}); // Clear raw values after save
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

  // Phase 27.F.14.B - Task 4: Copy paper parameters to live mode fields
  // Phase 33.C: Use default fetcher instead of custom fetch
  const handleCopyToLive = () => {
    if (!baselineStatus?.snapshot) return;
    
    const snapshot = baselineStatus.snapshot;
    
    // Copy optimized parameters from paper baseline to local state
    // Note: These are the LIVE mode values stored in a separate query cache
    // We'll fetch them and update them in state
    queryClient.fetchQuery({
      queryKey: ['/api/guardrails?mode=live']
    }).then((liveSettings: any) => {
      // Create updated live settings with paper baseline values
      const updatedLiveSettings = {
        ...(liveSettings || {}),
        riskPerTrade: snapshot.riskPerTradePercent,
        maxDailyLoss: snapshot.maxDailyLoss,
        maxDrawdown: snapshot.maxDrawdown,
        // Map tradesPerDay to maxOpenPositions (conservative estimate)
        maxOpenPositions: Math.ceil(snapshot.tradesPerDay)
      };
      
      // Update the live mode cache directly
      queryClient.setQueryData(['/api/guardrails', 'live'], updatedLiveSettings);
      
      toast({
        title: "✅ Parameters copied to Live mode",
        description: "Switch to Live mode and click Save to persist these changes.",
      });
    });
  };

  // Check if Copy to Live button should be enabled
  const isCopyToLiveEnabled = 
    mode === 'paper' && 
    baselineStatus?.snapshot?.established === true &&
    tradingStatus?.isEngineActiveLive === false;

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
            <ModeIndicator />
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
                      type="text"
                      value={focusedField === 'dailyLossKillSwitch' ? (rawInputValues['dailyLossKillSwitch'] ?? globalSettings.dailyLossKillSwitch ?? '') : formatNumberWithCommas(globalSettings.dailyLossKillSwitch ?? '')}
                      onChange={(e) => handleGlobalChange('dailyLossKillSwitch', e.target.value)}
                      onFocus={() => setFocusedField('dailyLossKillSwitch')}
                      onBlur={() => handleBlur('dailyLossKillSwitch', true)}
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
                      type="text"
                      value={focusedField === 'maxPositionPercent' ? (rawInputValues['maxPositionPercent'] ?? globalSettings.maxPositionPercent ?? '') : formatNumberWithCommas(globalSettings.maxPositionPercent ?? '')}
                      onChange={(e) => handleGlobalChange('maxPositionPercent', e.target.value)}
                      onFocus={() => setFocusedField('maxPositionPercent')}
                      onBlur={() => handleBlur('maxPositionPercent', true)}
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
              type="text"
              value={focusedField === 'maxDailyLoss' ? (rawInputValues['maxDailyLoss'] ?? settings.maxDailyLoss ?? '') : formatNumberWithCommas(settings.maxDailyLoss ?? '')}
              onChange={(e) => handleChange('maxDailyLoss', e.target.value)}
              onFocus={() => setFocusedField('maxDailyLoss')}
              onBlur={() => handleBlur('maxDailyLoss', false)}
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
              type="text"
              value={focusedField === 'maxDrawdown' ? (rawInputValues['maxDrawdown'] ?? settings.maxDrawdown ?? '') : formatNumberWithCommas(settings.maxDrawdown ?? '')}
              onChange={(e) => handleChange('maxDrawdown', e.target.value)}
              onFocus={() => setFocusedField('maxDrawdown')}
              onBlur={() => handleBlur('maxDrawdown', false)}
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
              type="text"
              value={focusedField === 'maxPositionSize' ? (rawInputValues['maxPositionSize'] ?? settings.maxPositionSize ?? '') : formatNumberWithCommas(settings.maxPositionSize ?? '')}
              onChange={(e) => handleChange('maxPositionSize', e.target.value)}
              onFocus={() => setFocusedField('maxPositionSize')}
              onBlur={() => handleBlur('maxPositionSize', false)}
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
              type="text"
              value={focusedField === 'maxOpenPositions' ? (rawInputValues['maxOpenPositions'] ?? settings.maxOpenPositions ?? '') : formatNumberWithCommas(settings.maxOpenPositions ?? '')}
              onChange={(e) => handleChange('maxOpenPositions', e.target.value)}
              onFocus={() => setFocusedField('maxOpenPositions')}
              onBlur={() => handleBlur('maxOpenPositions', false)}
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
              type="text"
              value={focusedField === 'riskPerTrade' ? (rawInputValues['riskPerTrade'] ?? settings.riskPerTrade ?? '') : formatNumberWithCommas(settings.riskPerTrade ?? '')}
              onChange={(e) => handleChange('riskPerTrade', e.target.value)}
              onFocus={() => setFocusedField('riskPerTrade')}
              onBlur={() => handleBlur('riskPerTrade', false)}
              data-testid="input-risk-per-trade"
            />
            <p className="text-xs text-muted-foreground">
              Percentage of portfolio to risk on each trade
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="maxRequiredCapital">Max Required Capital ($)</Label>
            <Input
              id="maxRequiredCapital"
              type="text"
              value={focusedField === 'maxRequiredCapital' ? (rawInputValues['maxRequiredCapital'] ?? settings.maxRequiredCapital ?? '') : formatNumberWithCommas(settings.maxRequiredCapital ?? '')}
              onChange={(e) => handleChange('maxRequiredCapital', e.target.value)}
              onFocus={() => setFocusedField('maxRequiredCapital')}
              onBlur={() => handleBlur('maxRequiredCapital', false)}
              data-testid="input-max-required-capital"
            />
            <p className="text-xs text-muted-foreground">
              Maximum capital that can be required for a trade before rejection
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="maxRiskPerTradeLimit">Max Risk Per Trade Limit ($)</Label>
            <Input
              id="maxRiskPerTradeLimit"
              type="text"
              value={focusedField === 'maxRiskPerTradeLimit' ? (rawInputValues['maxRiskPerTradeLimit'] ?? settings.maxRiskPerTradeLimit ?? '') : formatNumberWithCommas(settings.maxRiskPerTradeLimit ?? '')}
              onChange={(e) => handleChange('maxRiskPerTradeLimit', e.target.value)}
              onFocus={() => setFocusedField('maxRiskPerTradeLimit')}
              onBlur={() => handleBlur('maxRiskPerTradeLimit', false)}
              data-testid="input-max-risk-per-trade-limit"
            />
            <p className="text-xs text-muted-foreground">
              Maximum dollar amount at risk (stop-loss distance) allowed per trade
            </p>
          </div>
        </div>

        {/* Phase 27.F.14.UI-SYNC.2: Execution Rhythm Controls (Behavioral) */}
        <div className="mt-6 mb-4">
          <h3 className="font-semibold text-sm text-muted-foreground mb-4">
            Execution Rhythm Controls (Behavioral)
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-2">
            <Label htmlFor="cooldownMinutes">Symbol Cool-Down (minutes)</Label>
            <Input
              id="cooldownMinutes"
              type="text"
              value={focusedField === 'cooldownMinutes' ? (rawInputValues['cooldownMinutes'] ?? settings.cooldownMinutes ?? '') : formatNumberWithCommas(settings.cooldownMinutes ?? '')}
              onChange={(e) => handleChange('cooldownMinutes', e.target.value)}
              onFocus={() => setFocusedField('cooldownMinutes')}
              onBlur={() => handleBlur('cooldownMinutes', false)}
              data-testid="input-cooldown-minutes"
            />
            <p className="text-xs text-muted-foreground">
              Minimum time (0-90 minutes) before a symbol can re-enter after trade close
            </p>
          </div>
        </div>

        {/* Phase 27.F.14.MICRO: Micro-Execution Loop Controls */}
        <div className="mt-6 mb-4">
          <h3 className="font-semibold text-sm text-muted-foreground mb-4">
            Micro-Execution Loop Controls (High-Frequency Monitoring)
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-2">
                  <Label htmlFor="microLoopInterval">Micro-Loop Interval (seconds)</Label>
                  <Input
                    id="microLoopInterval"
                    type="text"
                    value={focusedField === 'microLoopInterval' ? (rawInputValues['microLoopInterval'] ?? settings.microLoopInterval ?? '') : formatNumberWithCommas(settings.microLoopInterval ?? '')}
                    onChange={(e) => handleChange('microLoopInterval', e.target.value)}
                    onFocus={() => setFocusedField('microLoopInterval')}
                    onBlur={() => handleBlur('microLoopInterval', false)}
                    data-testid="input-micro-loop-interval"
                  />
                  <p className="text-xs text-muted-foreground">
                    How often to re-check Ready-to-Buy pairs for rapid price movements (5-15 seconds, default: 8)
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">Interval in seconds for high-frequency price monitoring. Lower values = more responsive but higher API usage. Range: 5-15 seconds.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-2">
                  <Label htmlFor="priceDeltaTrigger">Price Delta Trigger (%)</Label>
                  <Input
                    id="priceDeltaTrigger"
                    type="text"
                    value={focusedField === 'priceDeltaTrigger' ? (rawInputValues['priceDeltaTrigger'] ?? settings.priceDeltaTrigger ?? '') : formatNumberWithCommas(settings.priceDeltaTrigger ?? '')}
                    onChange={(e) => handleChange('priceDeltaTrigger', e.target.value)}
                    onFocus={() => setFocusedField('priceDeltaTrigger')}
                    onBlur={() => handleBlur('priceDeltaTrigger', false)}
                    data-testid="input-price-delta-trigger"
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum price change percentage to trigger execution (0.20-0.60%, default: 0.30)
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">Minimum price movement required to trigger micro-execution. Lower values = more sensitive but more trades. Range: 0.20-0.60%.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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

        {/* Phase 27.F.14.B - Task 3: Fee-Aware Metrics Display (Paper Mode Only) */}
        {mode === 'paper' && baselineStatus && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-lg space-y-4" data-testid="fee-aware-metrics">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">Paper Baseline Status</h3>
              </div>
              {baselineStatus.snapshot?.established ? (
                <Badge variant="default" className="bg-green-600" data-testid="baseline-badge-established">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Established
                </Badge>
              ) : (
                <Badge variant="secondary" data-testid="baseline-badge-pending">
                  <Clock className="w-3 h-3 mr-1" />
                  Building...
                </Badge>
              )}
            </div>

            {baselineStatus.snapshot?.established ? (
              <div className="space-y-3">
                <p className="text-sm text-blue-700 dark:text-blue-200/80">
                  Paper trading baseline established. Fee-aware metrics ready for manual copy to Live mode.
                </p>
                
                {/* Fee Comparison Table */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-slate-950 p-3 rounded border border-blue-200 dark:border-blue-900/50">
                    <div className="text-xs text-muted-foreground mb-2">Maker Fee Mode (0.16%)</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Gross P/L:</span>
                        <span className="font-semibold">${baselineStatus.snapshot.avgGrossProfit.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Fees:</span>
                        <span className="text-red-600">-${baselineStatus.snapshot.makerFeesPerTrade.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm border-t pt-1">
                        <span className="font-medium">Net P/L:</span>
                        <span className={`font-bold ${baselineStatus.snapshot.avgNetProfitMaker >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {baselineStatus.snapshot.avgNetProfitMaker >= 0 ? '+' : ''}${baselineStatus.snapshot.avgNetProfitMaker.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-950 p-3 rounded border border-blue-200 dark:border-blue-900/50">
                    <div className="text-xs text-muted-foreground mb-2">Taker Fee Mode (0.26%)</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Gross P/L:</span>
                        <span className="font-semibold">${baselineStatus.snapshot.avgGrossProfit.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Fees:</span>
                        <span className="text-red-600">-${baselineStatus.snapshot.takerFeesPerTrade.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm border-t pt-1">
                        <span className="font-medium">Net P/L:</span>
                        <span className={`font-bold ${baselineStatus.snapshot.avgNetProfitTaker >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {baselineStatus.snapshot.avgNetProfitTaker >= 0 ? '+' : ''}${baselineStatus.snapshot.avgNetProfitTaker.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Performance Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                  <div data-testid="baseline-metric-winrate">
                    <div className="text-xs text-muted-foreground">Win Rate</div>
                    <div className="text-lg font-semibold text-foreground flex items-center gap-1">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                      {(baselineStatus.snapshot.winRate * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div data-testid="baseline-metric-profit-factor">
                    <div className="text-xs text-muted-foreground">Profit Factor</div>
                    <div className="text-lg font-semibold text-foreground">
                      {baselineStatus.snapshot.profitFactor.toFixed(2)}x
                    </div>
                  </div>
                  <div data-testid="baseline-metric-max-drawdown">
                    <div className="text-xs text-muted-foreground">Max Drawdown</div>
                    <div className="text-lg font-semibold text-foreground">
                      {baselineStatus.snapshot.maxDrawdown.toFixed(1)}%
                    </div>
                  </div>
                  <div data-testid="baseline-metric-trades">
                    <div className="text-xs text-muted-foreground">Closed Trades</div>
                    <div className="text-lg font-semibold text-foreground">
                      {baselineStatus.snapshot.closedTradesCount}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-blue-700 dark:text-blue-200/80">
                  Building reliable baseline... Trade more in paper mode to establish parameters.
                </p>
                <div className="text-sm space-y-1">
                  <div>Trades: {baselineStatus.progress.closedTrades} / {baselineStatus.progress.targetTrades}</div>
                  <div>Runtime: {baselineStatus.progress.runtimeHours.toFixed(1)}h / {baselineStatus.progress.targetHours}h</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Phase 27.F.14.B - Task 4: Copy to Live Button */}
        {mode === 'paper' && baselineStatus && (
          <div className="mt-4">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-block">
                    <Button
                      onClick={() => setIsCopyModalOpen(true)}
                      disabled={!isCopyToLiveEnabled}
                      variant="outline"
                      className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                      data-testid="button-copy-to-live"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy to Live Mode
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="max-w-xs">
                    {!baselineStatus.snapshot?.established ? (
                      <p>Baseline must be established before copying parameters</p>
                    ) : tradingStatus?.isEngineActiveLive ? (
                      <p>Live trading must be stopped before copying parameters</p>
                    ) : (
                      <p>Copy optimized paper trading parameters to Live mode guardrail fields</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </CardContent>

      {/* Copy to Live Confirmation Modal */}
      {baselineStatus?.snapshot && (
        <CopyToLiveModal
          isOpen={isCopyModalOpen}
          onClose={() => setIsCopyModalOpen(false)}
          onConfirm={handleCopyToLive}
          baselineSnapshot={baselineStatus.snapshot}
        />
      )}
    </Card>
  );
}
