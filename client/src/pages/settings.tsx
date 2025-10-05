import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useTrading } from "@/hooks/use-trading";
import { 
  Settings as SettingsIcon, 
  Shield, 
  Brain, 
  Bell, 
  DollarSign,
  Target,
  TrendingUp,
  Save,
  RotateCcw,
  ChevronDown,
  Filter,
  Activity,
  LineChart,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timezones } from "@/lib/timezone";

export default function Settings() {
  const { settings, settingsLoading, updateSettings, isUpdatingSettings } = useTrading();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    // Global Screener Filters
    minVolume: '',
    minDailyRange: '',
    minPrice: '',
    maxBidAskSpread: '',
    excludeStablecoins: true,
    minDataHistoryDays: 90,
    allowedTradingPairs: ['USD', 'USDT'],
    blacklistedSymbols: [] as string[],
    whitelistedSymbols: [] as string[],
    
    // Portfolio Guardrails
    riskPerTrade: '',
    maxExposurePercent: '',
    maxOpenTrades: 3,
    stopBufferPercent: '',
    slippageToleranceMajors: '',
    slippageToleranceMidcaps: '',
    slippageToleranceSmall: '',
    dailyLossKillSwitch: '7.00',
    dailyLossWarningTrigger: '75.00',
    
    // VWAP Pullback Strategy
    vwapTimeframe: 60,
    vwapPullbackThreshold: '',
    vwapVolumeMultiplier: '',
    vwapMaxHoldingPeriod: 24,
    
    // ABCD Long Strategy
    abcdMinConsolidation: 10,
    abcdBreakoutThreshold: '',
    abcdVolumeMultiplier: '',
    abcdExitType: 'target' as 'target' | 'trailing',
    abcdTargetPercent: '',
    abcdTrailingStopPercent: '',
    
    // SMA Trend Ride Strategy
    smaLength: 20,
    smaEntryCondition: 'crossover' as 'above' | 'crossover',
    smaExitCondition: 'break' as 'break' | 'trailing',
    smaTrailingStopPercent: '',
    
    // AI Settings
    aiCapitalAllocation: false,
    
    // Notification Settings
    emailNotifications: true,
    pushNotifications: true,
    telegramNotifications: false,
    
    // Display Settings
    timezone: 'Asia/Dubai',
    timeFormat: '12hr' as '12hr' | '24hr'
  });

  const [vwapOpen, setVwapOpen] = useState(true);
  const [abcdOpen, setAbcdOpen] = useState(false);
  const [smaOpen, setSmaOpen] = useState(false);
  
  // Strategy enabled states (UI-only for now)
  const [vwapEnabled, setVwapEnabled] = useState(true);
  const [abcdEnabled, setAbcdEnabled] = useState(true);
  const [smaEnabled, setSmaEnabled] = useState(true);

  useEffect(() => {
    if (settings) {
      setFormData({
        // Global Screener Filters
        minVolume: settings.minVolume,
        minDailyRange: settings.minDailyRange,
        minPrice: settings.minPrice || '0.01',
        maxBidAskSpread: settings.maxBidAskSpread || '1.00',
        excludeStablecoins: settings.excludeStablecoins ?? true,
        minDataHistoryDays: settings.minDataHistoryDays || 90,
        allowedTradingPairs: settings.allowedTradingPairs || ['USD', 'USDT'],
        blacklistedSymbols: settings.blacklistedSymbols || [],
        whitelistedSymbols: settings.whitelistedSymbols || [],
        
        // Portfolio Guardrails
        riskPerTrade: settings.riskPerTrade,
        maxExposurePercent: settings.maxExposurePercent,
        maxOpenTrades: settings.maxOpenTrades,
        stopBufferPercent: settings.stopBufferPercent,
        slippageToleranceMajors: settings.slippageToleranceMajors,
        slippageToleranceMidcaps: settings.slippageToleranceMidcaps,
        slippageToleranceSmall: settings.slippageToleranceSmall,
        dailyLossKillSwitch: settings.dailyLossKillSwitch || '7.00',
        dailyLossWarningTrigger: settings.dailyLossWarningTrigger || '75.00',
        
        // VWAP Pullback Strategy
        vwapTimeframe: settings.vwapTimeframe || 60,
        vwapPullbackThreshold: settings.vwapPullbackThreshold || '2.00',
        vwapVolumeMultiplier: settings.vwapVolumeMultiplier || '1.50',
        vwapMaxHoldingPeriod: settings.vwapMaxHoldingPeriod || 24,
        
        // ABCD Long Strategy
        abcdMinConsolidation: settings.abcdMinConsolidation || 10,
        abcdBreakoutThreshold: settings.abcdBreakoutThreshold || '1.50',
        abcdVolumeMultiplier: settings.abcdVolumeMultiplier || '1.50',
        abcdExitType: (settings.abcdExitType as 'target' | 'trailing') || 'target',
        abcdTargetPercent: settings.abcdTargetPercent || '3.00',
        abcdTrailingStopPercent: settings.abcdTrailingStopPercent || '2.00',
        
        // SMA Trend Ride Strategy
        smaLength: settings.smaLength,
        smaEntryCondition: (settings.smaEntryCondition as 'above' | 'crossover') || 'crossover',
        smaExitCondition: (settings.smaExitCondition as 'break' | 'trailing') || 'break',
        smaTrailingStopPercent: settings.smaTrailingStopPercent || '2.00',
        
        // AI Settings
        aiCapitalAllocation: settings.aiCapitalAllocation,
        
        // Notification Settings
        emailNotifications: true,
        pushNotifications: true,
        telegramNotifications: false,
        
        // Display Settings
        timezone: settings.timezone || 'Asia/Dubai',
        timeFormat: (settings.timeFormat as '12hr' | '24hr') || '12hr'
      });
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings(formData);
      
      toast({
        title: "Settings Saved",
        description: "Your trading settings have been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    if (settings) {
      setFormData({
        // Reset to current saved settings
        minVolume: settings.minVolume,
        minDailyRange: settings.minDailyRange,
        minPrice: settings.minPrice || '0.01',
        maxBidAskSpread: settings.maxBidAskSpread || '1.00',
        excludeStablecoins: settings.excludeStablecoins ?? true,
        minDataHistoryDays: settings.minDataHistoryDays || 90,
        allowedTradingPairs: settings.allowedTradingPairs || ['USD', 'USDT'],
        blacklistedSymbols: settings.blacklistedSymbols || [],
        whitelistedSymbols: settings.whitelistedSymbols || [],
        riskPerTrade: settings.riskPerTrade,
        maxExposurePercent: settings.maxExposurePercent,
        maxOpenTrades: settings.maxOpenTrades,
        stopBufferPercent: settings.stopBufferPercent,
        slippageToleranceMajors: settings.slippageToleranceMajors,
        slippageToleranceMidcaps: settings.slippageToleranceMidcaps,
        slippageToleranceSmall: settings.slippageToleranceSmall,
        dailyLossKillSwitch: settings.dailyLossKillSwitch || '7.00',
        dailyLossWarningTrigger: settings.dailyLossWarningTrigger || '75.00',
        vwapTimeframe: settings.vwapTimeframe || 60,
        vwapPullbackThreshold: settings.vwapPullbackThreshold || '2.00',
        vwapVolumeMultiplier: settings.vwapVolumeMultiplier || '1.50',
        vwapMaxHoldingPeriod: settings.vwapMaxHoldingPeriod || 24,
        abcdMinConsolidation: settings.abcdMinConsolidation || 10,
        abcdBreakoutThreshold: settings.abcdBreakoutThreshold || '1.50',
        abcdVolumeMultiplier: settings.abcdVolumeMultiplier || '1.50',
        abcdExitType: (settings.abcdExitType as 'target' | 'trailing') || 'target',
        abcdTargetPercent: settings.abcdTargetPercent || '3.00',
        abcdTrailingStopPercent: settings.abcdTrailingStopPercent || '2.00',
        smaLength: settings.smaLength,
        smaEntryCondition: (settings.smaEntryCondition as 'above' | 'crossover') || 'crossover',
        smaExitCondition: (settings.smaExitCondition as 'break' | 'trailing') || 'break',
        smaTrailingStopPercent: settings.smaTrailingStopPercent || '2.00',
        aiCapitalAllocation: settings.aiCapitalAllocation,
        emailNotifications: true,
        pushNotifications: true,
        telegramNotifications: false,
        timezone: settings.timezone || 'Asia/Dubai',
        timeFormat: (settings.timeFormat as '12hr' | '24hr') || '12hr'
      });
      
      toast({
        title: "Reset Complete",
        description: "Settings have been reset to last saved values.",
      });
    }
  };

  if (settingsLoading) {
    return (
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <Skeleton className="h-12 w-64 mb-8" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <SettingsIcon className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground mt-1">Configure your trading parameters and preferences</p>
            </div>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleReset}
            variant="outline"
            className="flex items-center gap-2"
            data-testid="button-reset"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={isUpdatingSettings}
            className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="button-save"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs defaultValue="screener" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-8">
          <TabsTrigger value="screener" className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Screener Filters
          </TabsTrigger>
          <TabsTrigger value="guardrails" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Portfolio Guardrails
          </TabsTrigger>
          <TabsTrigger value="strategies" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Strategies
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: SCREENER FILTERS */}
        <TabsContent value="screener">
          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Filter className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">Global Screener Filters</CardTitle>
                  <CardDescription className="mt-1.5">
                    These filters decide which coins are considered for trading before any strategy logic is applied. 
                    They reduce noise and screen out low-quality assets.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Minimum Volume */}
              <div className="space-y-2">
                <Label htmlFor="minVolume" className="text-sm font-medium">
                  Minimum 24h Trading Volume ($)
                  <span className="text-muted-foreground font-normal ml-2">
                    - Excludes illiquid coins with low trading activity
                  </span>
                </Label>
                <Input
                  id="minVolume"
                  type="number"
                  value={formData.minVolume}
                  onChange={(e) => setFormData({...formData, minVolume: e.target.value})}
                  placeholder="20000000.00"
                  data-testid="input-min-volume"
                />
              </div>

              {/* Minimum Daily Range */}
              <div className="space-y-2">
                <Label htmlFor="minDailyRange" className="text-sm font-medium">
                  Minimum Daily Price Range (%)
                  <span className="text-muted-foreground font-normal ml-2">
                    - Ensures only coins with sufficient volatility are included
                  </span>
                </Label>
                <Input
                  id="minDailyRange"
                  type="number"
                  step="0.01"
                  value={formData.minDailyRange}
                  onChange={(e) => setFormData({...formData, minDailyRange: e.target.value})}
                  placeholder="5.00"
                  data-testid="input-min-daily-range"
                />
              </div>

              {/* Minimum Price */}
              <div className="space-y-2">
                <Label htmlFor="minPrice" className="text-sm font-medium">
                  Minimum Price Threshold ($)
                  <span className="text-muted-foreground font-normal ml-2">
                    - Filters out "dust" tokens or micro-price assets
                  </span>
                </Label>
                <Input
                  id="minPrice"
                  type="number"
                  step="0.00000001"
                  value={formData.minPrice}
                  onChange={(e) => setFormData({...formData, minPrice: e.target.value})}
                  placeholder="0.01"
                  data-testid="input-min-price"
                />
              </div>

              {/* Bid-Ask Spread */}
              <div className="space-y-2">
                <Label htmlFor="maxBidAskSpread" className="text-sm font-medium">
                  Maximum Bid-Ask Spread (%)
                  <span className="text-muted-foreground font-normal ml-2">
                    - Excludes pairs with wide spreads (high slippage risk)
                  </span>
                </Label>
                <Input
                  id="maxBidAskSpread"
                  type="number"
                  step="0.01"
                  value={formData.maxBidAskSpread}
                  onChange={(e) => setFormData({...formData, maxBidAskSpread: e.target.value})}
                  placeholder="1.00"
                  data-testid="input-max-bid-ask-spread"
                />
              </div>

              <Separator />

              {/* Stablecoin Exclusion */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    Exclude Stablecoins
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Removes stablecoins and pegged assets from screener
                  </p>
                </div>
                <Switch
                  checked={formData.excludeStablecoins}
                  onCheckedChange={(checked) => setFormData({...formData, excludeStablecoins: checked})}
                  data-testid="switch-exclude-stablecoins"
                />
              </div>

              <Separator />

              {/* Data History Requirement */}
              <div className="space-y-2">
                <Label htmlFor="minDataHistoryDays" className="text-sm font-medium">
                  Data History Requirement (days)
                  <span className="text-muted-foreground font-normal ml-2">
                    - Ensures sufficient candle history exists for backtesting/analysis
                  </span>
                </Label>
                <Input
                  id="minDataHistoryDays"
                  type="number"
                  value={formData.minDataHistoryDays}
                  onChange={(e) => setFormData({...formData, minDataHistoryDays: parseInt(e.target.value)})}
                  placeholder="90"
                  data-testid="input-min-data-history-days"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: PORTFOLIO GUARDRAILS */}
        <TabsContent value="guardrails">
          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">Portfolio Guardrails</CardTitle>
                  <CardDescription className="mt-1.5">
                    Universal risk protections that apply after a strategy signals a trade but before execution. 
                    These safeguards protect your capital across all trading strategies.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Risk Per Trade */}
              <div className="space-y-2">
                <Label htmlFor="riskPerTrade" className="text-sm font-medium">
                  Risk Per Trade ($)
                  <span className="text-muted-foreground font-normal ml-2">
                    - Maximum amount of capital risked per trade
                  </span>
                </Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="riskPerTrade"
                    type="number"
                    step="0.01"
                    value={formData.riskPerTrade}
                    onChange={(e) => setFormData({...formData, riskPerTrade: e.target.value})}
                    placeholder="100.00"
                    className="pl-9"
                    data-testid="input-risk-per-trade"
                  />
                </div>
              </div>

              {/* Maximum Exposure */}
              <div className="space-y-2">
                <Label htmlFor="maxExposurePercent" className="text-sm font-medium">
                  Maximum Portfolio Exposure (% of account)
                  <span className="text-muted-foreground font-normal ml-2">
                    - Caps total exposure across all open trades
                  </span>
                </Label>
                <div className="relative">
                  <Input
                    id="maxExposurePercent"
                    type="number"
                    step="0.01"
                    value={formData.maxExposurePercent}
                    onChange={(e) => setFormData({...formData, maxExposurePercent: e.target.value})}
                    placeholder="20.00"
                    data-testid="input-max-exposure-percent"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                </div>
              </div>

              {/* Maximum Open Trades */}
              <div className="space-y-2">
                <Label htmlFor="maxOpenTrades" className="text-sm font-medium">
                  Maximum Open Trades (number of concurrent positions)
                  <span className="text-muted-foreground font-normal ml-2">
                    - Limits the number of simultaneous positions
                  </span>
                </Label>
                <Input
                  id="maxOpenTrades"
                  type="number"
                  value={formData.maxOpenTrades}
                  onChange={(e) => setFormData({...formData, maxOpenTrades: parseInt(e.target.value)})}
                  placeholder="3"
                  data-testid="input-max-open-trades"
                />
              </div>

              <Separator />

              {/* Stop Buffer */}
              <div className="space-y-2">
                <Label htmlFor="stopBufferPercent" className="text-sm font-medium">
                  Stop Buffer (%)
                  <span className="text-muted-foreground font-normal ml-2">
                    - Adds extra margin beyond calculated stop levels
                  </span>
                </Label>
                <div className="relative">
                  <Input
                    id="stopBufferPercent"
                    type="number"
                    step="0.01"
                    value={formData.stopBufferPercent}
                    onChange={(e) => setFormData({...formData, stopBufferPercent: e.target.value})}
                    placeholder="0.30"
                    data-testid="input-stop-buffer-percent"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                </div>
              </div>

              <Separator />

              {/* Slippage Tolerance */}
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Slippage Tolerance by Market Category</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Maximum tolerated slippage during order execution, categorized by market cap
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Majors */}
                  <div className="space-y-2">
                    <Label htmlFor="slippageToleranceMajors" className="text-sm font-medium">
                      Majors (BTC/ETH/Top 20)
                    </Label>
                    <div className="relative">
                      <Input
                        id="slippageToleranceMajors"
                        type="number"
                        step="0.01"
                        value={formData.slippageToleranceMajors}
                        onChange={(e) => setFormData({...formData, slippageToleranceMajors: e.target.value})}
                        placeholder="0.50"
                        data-testid="input-slippage-tolerance-majors"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                    </div>
                  </div>

                  {/* Mid-caps */}
                  <div className="space-y-2">
                    <Label htmlFor="slippageToleranceMidcaps" className="text-sm font-medium">
                      Mid-caps
                    </Label>
                    <div className="relative">
                      <Input
                        id="slippageToleranceMidcaps"
                        type="number"
                        step="0.01"
                        value={formData.slippageToleranceMidcaps}
                        onChange={(e) => setFormData({...formData, slippageToleranceMidcaps: e.target.value})}
                        placeholder="2.00"
                        data-testid="input-slippage-tolerance-midcaps"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                    </div>
                  </div>

                  {/* Small/Meme */}
                  <div className="space-y-2">
                    <Label htmlFor="slippageToleranceSmall" className="text-sm font-medium">
                      Small/Meme Coins
                    </Label>
                    <div className="relative">
                      <Input
                        id="slippageToleranceSmall"
                        type="number"
                        step="0.01"
                        value={formData.slippageToleranceSmall}
                        onChange={(e) => setFormData({...formData, slippageToleranceSmall: e.target.value})}
                        placeholder="5.00"
                        data-testid="input-slippage-tolerance-small"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Kill Switch */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Zap className="w-6 h-6 text-destructive" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-lg">Daily Loss Kill Switch</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Automatically suspends trading when 24-hour portfolio losses exceed this threshold. 
                      All open trades are closed immediately when triggered. Requires manual reset to resume.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Kill Switch Threshold */}
                  <div className="space-y-2">
                    <Label htmlFor="dailyLossKillSwitch" className="text-sm font-medium">
                      Kill Switch Threshold (%)
                    </Label>
                    <div className="relative">
                      <Input
                        id="dailyLossKillSwitch"
                        type="number"
                        step="0.01"
                        value={formData.dailyLossKillSwitch}
                        onChange={(e) => setFormData({...formData, dailyLossKillSwitch: e.target.value})}
                        placeholder="7.00"
                        data-testid="input-daily-loss-kill-switch"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      When 24h portfolio loss reaches this %, trading stops automatically
                    </p>
                  </div>

                  {/* Warning Trigger */}
                  <div className="space-y-2">
                    <Label htmlFor="dailyLossWarningTrigger" className="text-sm font-medium">
                      Warning Trigger (% of threshold)
                    </Label>
                    <div className="relative">
                      <Input
                        id="dailyLossWarningTrigger"
                        type="number"
                        step="0.01"
                        value={formData.dailyLossWarningTrigger}
                        onChange={(e) => setFormData({...formData, dailyLossWarningTrigger: e.target.value})}
                        placeholder="75.00"
                        data-testid="input-daily-loss-warning-trigger"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      At 75% threshold (e.g., -5.25% with 7% limit), you'll receive a warning
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: STRATEGIES */}
        <TabsContent value="strategies">
          <div className="space-y-4">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Trading Strategies</h2>
              <p className="text-sm text-muted-foreground">
                Configure parameters for each strategy. Click on a strategy to expand and view its specific settings.
              </p>
            </div>

            {/* VWAP Pullback Strategy */}
            <Collapsible open={vwapOpen} onOpenChange={setVwapOpen}>
              <Card>
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-3 text-left flex-1">
                        <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Activity className="w-6 h-6 text-blue-500" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <CardTitle className="text-lg">VWAP Pullback</CardTitle>
                            <div className="flex items-center gap-2 mr-8" onClick={(e) => e.stopPropagation()}>
                              <Switch
                                checked={vwapEnabled}
                                onCheckedChange={setVwapEnabled}
                                className="data-[state=checked]:bg-success"
                                data-testid="switch-vwap-enabled"
                              />
                              <span className="text-sm font-medium text-muted-foreground">
                                {vwapEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                          <CardDescription className="mt-1">
                            Trades pullbacks to VWAP (Volume-Weighted Average Price) during uptrends, aiming to capture continuation moves
                          </CardDescription>
                        </div>
                      </div>
                      <ChevronDown className={cn(
                        "w-5 h-5 text-muted-foreground transition-transform flex-shrink-0",
                        vwapOpen && "transform rotate-180"
                      )} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-6">
                    <Separator />

                    {/* VWAP Timeframe */}
                    <div className="space-y-2">
                      <Label htmlFor="vwapTimeframe" className="text-sm font-medium">
                        VWAP Timeframe (minutes)
                        <span className="text-muted-foreground font-normal ml-2">
                          - Period used to calculate the Volume-Weighted Average Price
                        </span>
                      </Label>
                      <Input
                        id="vwapTimeframe"
                        type="number"
                        value={formData.vwapTimeframe}
                        onChange={(e) => setFormData({...formData, vwapTimeframe: parseInt(e.target.value)})}
                        placeholder="60"
                        data-testid="input-vwap-timeframe"
                      />
                    </div>

                    {/* VWAP Pullback Threshold */}
                    <div className="space-y-2">
                      <Label htmlFor="vwapPullbackThreshold" className="text-sm font-medium">
                        Pullback Threshold (%)
                        <span className="text-muted-foreground font-normal ml-2">
                          - How far price must pull back to VWAP before triggering entry
                        </span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="vwapPullbackThreshold"
                          type="number"
                          step="0.01"
                          value={formData.vwapPullbackThreshold}
                          onChange={(e) => setFormData({...formData, vwapPullbackThreshold: e.target.value})}
                          placeholder="2.00"
                          data-testid="input-vwap-pullback-threshold"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                      </div>
                    </div>

                    {/* VWAP Volume Multiplier */}
                    <div className="space-y-2">
                      <Label htmlFor="vwapVolumeMultiplier" className="text-sm font-medium">
                        Volume Confirmation Multiplier
                        <span className="text-muted-foreground font-normal ml-2">
                          - Required volume relative to average for entry confirmation
                        </span>
                      </Label>
                      <Input
                        id="vwapVolumeMultiplier"
                        type="number"
                        step="0.01"
                        value={formData.vwapVolumeMultiplier}
                        onChange={(e) => setFormData({...formData, vwapVolumeMultiplier: e.target.value})}
                        placeholder="1.50"
                        data-testid="input-vwap-volume-multiplier"
                      />
                    </div>

                    {/* VWAP Max Holding Period */}
                    <div className="space-y-2">
                      <Label htmlFor="vwapMaxHoldingPeriod" className="text-sm font-medium">
                        Maximum Holding Period (candles/bars)
                        <span className="text-muted-foreground font-normal ml-2">
                          - Maximum time to hold position before auto-exit
                        </span>
                      </Label>
                      <Input
                        id="vwapMaxHoldingPeriod"
                        type="number"
                        value={formData.vwapMaxHoldingPeriod}
                        onChange={(e) => setFormData({...formData, vwapMaxHoldingPeriod: parseInt(e.target.value)})}
                        placeholder="24"
                        data-testid="input-vwap-max-holding-period"
                      />
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* ABCD Long Strategy */}
            <Collapsible open={abcdOpen} onOpenChange={setAbcdOpen}>
              <Card>
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-3 text-left flex-1">
                        <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Zap className="w-6 h-6 text-green-500" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <CardTitle className="text-lg">ABCD Long</CardTitle>
                            <div className="flex items-center gap-2 mr-8" onClick={(e) => e.stopPropagation()}>
                              <Switch
                                checked={abcdEnabled}
                                onCheckedChange={setAbcdEnabled}
                                className="data-[state=checked]:bg-success"
                                data-testid="switch-abcd-enabled"
                              />
                              <span className="text-sm font-medium text-muted-foreground">
                                {abcdEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                          <CardDescription className="mt-1">
                            Trades the breakout from consolidation after forming the A-B-C-D price structure
                          </CardDescription>
                        </div>
                      </div>
                      <ChevronDown className={cn(
                        "w-5 h-5 text-muted-foreground transition-transform flex-shrink-0",
                        abcdOpen && "transform rotate-180"
                      )} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-6">
                    <Separator />

                    {/* ABCD Min Consolidation */}
                    <div className="space-y-2">
                      <Label htmlFor="abcdMinConsolidation" className="text-sm font-medium">
                        Minimum Consolidation Length (candles/bars)
                        <span className="text-muted-foreground font-normal ml-2">
                          - Required consolidation period before breakout
                        </span>
                      </Label>
                      <Input
                        id="abcdMinConsolidation"
                        type="number"
                        value={formData.abcdMinConsolidation}
                        onChange={(e) => setFormData({...formData, abcdMinConsolidation: parseInt(e.target.value)})}
                        placeholder="10"
                        data-testid="input-abcd-min-consolidation"
                      />
                    </div>

                    {/* ABCD Breakout Threshold */}
                    <div className="space-y-2">
                      <Label htmlFor="abcdBreakoutThreshold" className="text-sm font-medium">
                        Breakout Threshold (%)
                        <span className="text-muted-foreground font-normal ml-2">
                          - Percentage move required to confirm breakout
                        </span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="abcdBreakoutThreshold"
                          type="number"
                          step="0.01"
                          value={formData.abcdBreakoutThreshold}
                          onChange={(e) => setFormData({...formData, abcdBreakoutThreshold: e.target.value})}
                          placeholder="1.50"
                          data-testid="input-abcd-breakout-threshold"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                      </div>
                    </div>

                    {/* ABCD Volume Multiplier */}
                    <div className="space-y-2">
                      <Label htmlFor="abcdVolumeMultiplier" className="text-sm font-medium">
                        Volume Confirmation Multiplier
                        <span className="text-muted-foreground font-normal ml-2">
                          - Required volume relative to average for breakout confirmation
                        </span>
                      </Label>
                      <Input
                        id="abcdVolumeMultiplier"
                        type="number"
                        step="0.01"
                        value={formData.abcdVolumeMultiplier}
                        onChange={(e) => setFormData({...formData, abcdVolumeMultiplier: e.target.value})}
                        placeholder="1.50"
                        data-testid="input-abcd-volume-multiplier"
                      />
                    </div>

                    {/* ABCD Exit Type */}
                    <div className="space-y-2">
                      <Label htmlFor="abcdExitType" className="text-sm font-medium">
                        Exit Condition Type
                        <span className="text-muted-foreground font-normal ml-2">
                          - How to exit the trade: fixed target or trailing stop
                        </span>
                      </Label>
                      <Select 
                        value={formData.abcdExitType} 
                        onValueChange={(value: 'target' | 'trailing') => setFormData({...formData, abcdExitType: value})}
                      >
                        <SelectTrigger data-testid="select-abcd-exit-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="target">Fixed Target (%)</SelectItem>
                          <SelectItem value="trailing">Trailing Stop (%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* ABCD Target Percent */}
                    <div className="space-y-2">
                      <Label htmlFor="abcdTargetPercent" className="text-sm font-medium">
                        Target Profit (%)
                        <span className="text-muted-foreground font-normal ml-2">
                          - Fixed profit target when using "Fixed Target" exit
                        </span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="abcdTargetPercent"
                          type="number"
                          step="0.01"
                          value={formData.abcdTargetPercent}
                          onChange={(e) => setFormData({...formData, abcdTargetPercent: e.target.value})}
                          placeholder="3.00"
                          data-testid="input-abcd-target-percent"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                      </div>
                    </div>

                    {/* ABCD Trailing Stop */}
                    <div className="space-y-2">
                      <Label htmlFor="abcdTrailingStopPercent" className="text-sm font-medium">
                        Trailing Stop Distance (%)
                        <span className="text-muted-foreground font-normal ml-2">
                          - Distance of trailing stop when using "Trailing Stop" exit
                        </span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="abcdTrailingStopPercent"
                          type="number"
                          step="0.01"
                          value={formData.abcdTrailingStopPercent}
                          onChange={(e) => setFormData({...formData, abcdTrailingStopPercent: e.target.value})}
                          placeholder="2.00"
                          data-testid="input-abcd-trailing-stop-percent"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* SMA Trend Ride Strategy */}
            <Collapsible open={smaOpen} onOpenChange={setSmaOpen}>
              <Card>
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-3 text-left flex-1">
                        <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <LineChart className="w-6 h-6 text-purple-500" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <CardTitle className="text-lg">SMA Trend Ride</CardTitle>
                            <div className="flex items-center gap-2 mr-8" onClick={(e) => e.stopPropagation()}>
                              <Switch
                                checked={smaEnabled}
                                onCheckedChange={setSmaEnabled}
                                className="data-[state=checked]:bg-success"
                                data-testid="switch-sma-enabled"
                              />
                              <span className="text-sm font-medium text-muted-foreground">
                                {smaEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                          <CardDescription className="mt-1">
                            Rides momentum trends based on Simple Moving Average (SMA) alignment and crossovers
                          </CardDescription>
                        </div>
                      </div>
                      <ChevronDown className={cn(
                        "w-5 h-5 text-muted-foreground transition-transform flex-shrink-0",
                        smaOpen && "transform rotate-180"
                      )} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-6">
                    <Separator />

                    {/* SMA Length */}
                    <div className="space-y-2">
                      <Label htmlFor="smaLength" className="text-sm font-medium">
                        SMA Length (number of periods in moving average)
                        <span className="text-muted-foreground font-normal ml-2">
                          - Number of candles used to calculate the Simple Moving Average
                        </span>
                      </Label>
                      <Input
                        id="smaLength"
                        type="number"
                        value={formData.smaLength}
                        onChange={(e) => setFormData({...formData, smaLength: parseInt(e.target.value)})}
                        placeholder="20"
                        data-testid="input-sma-length"
                      />
                    </div>

                    {/* SMA Entry Condition */}
                    <div className="space-y-2">
                      <Label htmlFor="smaEntryCondition" className="text-sm font-medium">
                        Entry Condition
                        <span className="text-muted-foreground font-normal ml-2">
                          - When to enter: price above SMA or crossover
                        </span>
                      </Label>
                      <Select 
                        value={formData.smaEntryCondition} 
                        onValueChange={(value: 'above' | 'crossover') => setFormData({...formData, smaEntryCondition: value})}
                      >
                        <SelectTrigger data-testid="select-sma-entry-condition">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="above">Price Above SMA</SelectItem>
                          <SelectItem value="crossover">Price Crosses Above SMA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* SMA Exit Condition */}
                    <div className="space-y-2">
                      <Label htmlFor="smaExitCondition" className="text-sm font-medium">
                        Exit Condition
                        <span className="text-muted-foreground font-normal ml-2">
                          - When to exit: price breaks SMA or use trailing stop
                        </span>
                      </Label>
                      <Select 
                        value={formData.smaExitCondition} 
                        onValueChange={(value: 'break' | 'trailing') => setFormData({...formData, smaExitCondition: value})}
                      >
                        <SelectTrigger data-testid="select-sma-exit-condition">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="break">Price Breaks Below SMA</SelectItem>
                          <SelectItem value="trailing">Trailing Stop</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* SMA Trailing Stop */}
                    <div className="space-y-2">
                      <Label htmlFor="smaTrailingStopPercent" className="text-sm font-medium">
                        Trailing Stop Distance (%)
                        <span className="text-muted-foreground font-normal ml-2">
                          - Distance of trailing stop when using "Trailing Stop" exit
                        </span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="smaTrailingStopPercent"
                          type="number"
                          step="0.01"
                          value={formData.smaTrailingStopPercent}
                          onChange={(e) => setFormData({...formData, smaTrailingStopPercent: e.target.value})}
                          placeholder="2.00"
                          data-testid="input-sma-trailing-stop-percent"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>
        </TabsContent>

        {/* TAB 4: NOTIFICATIONS */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Bell className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">Notification Settings</CardTitle>
                  <CardDescription className="mt-1.5">
                    Configure how you want to receive trade alerts and system notifications
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Email Notifications */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive trade alerts and reports via email
                  </p>
                </div>
                <Switch
                  checked={formData.emailNotifications}
                  onCheckedChange={(checked) => setFormData({...formData, emailNotifications: checked})}
                  data-testid="switch-email-notifications"
                />
              </div>

              <Separator />

              {/* Push Notifications */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Browser push notifications for trade executions
                  </p>
                </div>
                <Switch
                  checked={formData.pushNotifications}
                  onCheckedChange={(checked) => setFormData({...formData, pushNotifications: checked})}
                  data-testid="switch-push-notifications"
                />
              </div>

              <Separator />

              {/* Telegram Notifications */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Telegram Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Send alerts to your Telegram bot
                  </p>
                </div>
                <Switch
                  checked={formData.telegramNotifications}
                  onCheckedChange={(checked) => setFormData({...formData, telegramNotifications: checked})}
                  data-testid="switch-telegram-notifications"
                />
              </div>

              <Separator className="my-8" />

              {/* Display Settings */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Display Settings</h3>
                
                {/* Timezone */}
                <div className="space-y-2 mb-4">
                  <Label htmlFor="timezone" className="text-sm font-medium">
                    Timezone
                  </Label>
                  <Select value={formData.timezone} onValueChange={(value) => setFormData({...formData, timezone: value})}>
                    <SelectTrigger data-testid="select-timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {timezones.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Time Format */}
                <div className="space-y-2">
                  <Label htmlFor="timeFormat" className="text-sm font-medium">
                    Time Format
                  </Label>
                  <Select value={formData.timeFormat} onValueChange={(value: '12hr' | '24hr') => setFormData({...formData, timeFormat: value})}>
                    <SelectTrigger data-testid="select-time-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12hr">12-hour (2:30 PM)</SelectItem>
                      <SelectItem value="24hr">24-hour (14:30)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
