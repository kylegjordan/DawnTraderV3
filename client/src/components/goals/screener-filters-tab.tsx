import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModeIndicator } from "./mode-indicator";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useState, useEffect, useRef } from "react";
import { Filter, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ensureValidToken } from "@/lib/auth";
import { formatNumberWithCommas, parseCommaFormattedNumber } from "@/lib/utils";

const DEFAULTS = {
  minVolume: 1000000,
  minPrice: 0.01,
  maxPrice: 100000,
  minMarketCap: 100000000,
  maxBidAskSpread: 1.00,
  rsiMin: 30,
  rsiMax: 70,
  volatilityMin: 0.50,
  volatilityMax: 5.00,
  minLiquidity: 500000,
  excludeStablecoins: true,
  allowRegulatedOnly: false,
  // Phase 27.F.14.UI-SYNC.2: Advanced Universe & Signal Controls
  universeSize: 100,
  activeTimeframes: ['5m', '15m', '1h'],
  confidenceThreshold: 60,
};

interface ScreenerFilters {
  minVolume: number | string;
  minPrice: number | string;
  maxPrice: number | string;
  minMarketCap: number | string;
  maxBidAskSpread: number | string;
  rsiMin: number;
  rsiMax: number;
  volatilityMin: number | string;
  volatilityMax: number | string;
  minLiquidity: number | string;
  excludeStablecoins: boolean;
  allowRegulatedOnly: boolean;
  // Phase 27.F.14.UI-SYNC.2: Advanced Universe & Signal Controls
  universeSize?: number;
  activeTimeframes?: string[];
  confidenceThreshold?: number;
}

interface CalibrationData {
  minVolume: string;
  minPrice: string;
  maxPrice: string;
  minMarketCap: string;
  maxBidAskSpread: string;
  minDailyRange: string;
  mode: string;
  source: string;
  timestamp: string;
}

export default function ScreenerFiltersTab() {
  const { toast } = useToast();
  const { mode } = useTradingMode();
  const [filters, setFilters] = useState<Partial<ScreenerFilters>>(DEFAULTS);
  const [hasChanges, setHasChanges] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [rawInputValues, setRawInputValues] = useState<Record<string, string>>({});
  const initialized = useRef(false);
  const lastMode = useRef(mode);

  const { data: currentFilters, isLoading } = useQuery<ScreenerFilters>({
    queryKey: ['/api/screeners', mode],
    queryFn: async () => {
      const token = await ensureValidToken();
      const res = await fetch('/api/screeners', {
        credentials: 'include',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'x-app-mode': mode,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch screener filters');
      return await res.json();
    },
  });

  const { data: calibration } = useQuery<CalibrationData>({
    queryKey: ['/api/screeners/calibration', mode],
    queryFn: async () => {
      const token = await ensureValidToken();
      const res = await fetch('/api/screeners/calibration', {
        credentials: 'include',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'x-app-mode': mode,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch calibration');
      return await res.json();
    },
  });

  useEffect(() => {
    if (currentFilters && (!initialized.current || lastMode.current !== mode)) {
      console.log('[ScreenerFiltersTab] Updating filters for mode:', mode, currentFilters);
      initialized.current = true;
      lastMode.current = mode;
      
      const parseValue = (val: number | string | undefined, fallback: number): number => {
        if (val === undefined || val === null) return fallback;
        return typeof val === 'string' ? parseFloat(val) : val;
      };
      
      setFilters({
        minVolume: parseValue(currentFilters.minVolume, DEFAULTS.minVolume),
        minPrice: parseValue(currentFilters.minPrice, DEFAULTS.minPrice),
        maxPrice: parseValue(currentFilters.maxPrice, DEFAULTS.maxPrice),
        minMarketCap: parseValue(currentFilters.minMarketCap, DEFAULTS.minMarketCap),
        maxBidAskSpread: parseValue(currentFilters.maxBidAskSpread, DEFAULTS.maxBidAskSpread),
        rsiMin: currentFilters.rsiMin ?? DEFAULTS.rsiMin,
        rsiMax: currentFilters.rsiMax ?? DEFAULTS.rsiMax,
        volatilityMin: parseValue(currentFilters.volatilityMin, DEFAULTS.volatilityMin),
        volatilityMax: parseValue(currentFilters.volatilityMax, DEFAULTS.volatilityMax),
        minLiquidity: parseValue(currentFilters.minLiquidity, DEFAULTS.minLiquidity),
        excludeStablecoins: currentFilters.excludeStablecoins ?? DEFAULTS.excludeStablecoins,
        allowRegulatedOnly: currentFilters.allowRegulatedOnly ?? DEFAULTS.allowRegulatedOnly,
        // Phase 27.F.14.UI-SYNC.2: Advanced Universe & Signal Controls
        universeSize: currentFilters.universeSize ?? DEFAULTS.universeSize,
        activeTimeframes: currentFilters.activeTimeframes ?? DEFAULTS.activeTimeframes,
        confidenceThreshold: currentFilters.confidenceThreshold ?? DEFAULTS.confidenceThreshold,
      });
      setHasChanges(false);
    }
  }, [currentFilters, mode]);

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<ScreenerFilters>) => {
      return apiRequest('PUT', '/api/screeners', updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/screeners', mode] });
      queryClient.invalidateQueries({ queryKey: ['/api/screeners/calibration', mode] });
      toast({
        title: "Screener Filters Saved",
        description: `Your screener configuration has been saved successfully for ${mode} mode.`,
      });
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update screener filters",
        variant: "destructive",
      });
    },
  });

  const handleChange = (field: string, value: string | number | boolean) => {
    if (typeof value === 'boolean') {
      setFilters(prev => ({ ...prev, [field]: value }));
    } else if (typeof value === 'string') {
      // Store raw string value while editing
      setRawInputValues(prev => ({ ...prev, [field]: value }));
    }
    setHasChanges(true);
  };

  const handleBlur = (field: string) => {
    const rawValue = rawInputValues[field];
    if (rawValue !== undefined) {
      const numValue = parseCommaFormattedNumber(rawValue);
      setFilters(prev => ({ ...prev, [field]: numValue }));
      // Clear raw value after parsing
      setRawInputValues(prev => {
        const newValues = { ...prev };
        delete newValues[field];
        return newValues;
      });
    }
    setFocusedField(null);
  };

  const handleSave = () => {
    updateMutation.mutate(filters);
  };

  const handleReset = () => {
    setFilters(DEFAULTS);
    setHasChanges(true);
    toast({
      title: "Reset to Defaults",
      description: "Screener filters have been reset to default values.",
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Screener Filters Configuration
            <ModeIndicator />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Screener Filters Configuration
            <ModeIndicator />
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Configure filters used to identify trade opportunities
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleReset}
            variant="outline"
            data-testid="button-reset-screeners"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Defaults
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!hasChanges}
            data-testid="button-save-screeners"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Screener
          </Button>
        </div>
      </CardHeader>
      
      {/* Calibration Info Strip */}
      {calibration && (
        <div className={`px-6 py-3 border-y ${
          calibration.source === 'paper_fallback' 
            ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800' 
            : 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
        }`}>
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-semibold">Using Dynamic Thresholds</span>
              {calibration.source === 'paper_fallback' && (
                <span className="ml-2 text-xs bg-amber-200 dark:bg-amber-800 px-2 py-1 rounded">
                  Using Paper Mode Calibration (Live data unavailable)
                </span>
              )}
              {calibration.source !== 'paper_fallback' && (
                <span className="ml-2 text-xs bg-blue-200 dark:bg-blue-800 px-2 py-1 rounded">
                  {mode.charAt(0).toUpperCase() + mode.slice(1)} Mode
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Updated: {new Date(calibration.timestamp).toLocaleString()}
            </div>
          </div>
        </div>
      )}
      
      <CardContent>
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Volume & Liquidity Filters */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                Volume & Liquidity
              </h4>
              <div className="space-y-2">
                <Label htmlFor="minVolume" className="text-xs">Min Volume ($)</Label>
                <Input
                  id="minVolume"
                  type="text"
                  value={focusedField === 'minVolume' ? (rawInputValues['minVolume'] ?? filters.minVolume ?? '') : formatNumberWithCommas(filters.minVolume ?? '')}
                  onChange={(e) => handleChange('minVolume', e.target.value)}
                  onFocus={() => setFocusedField('minVolume')}
                  onBlur={() => handleBlur('minVolume')}
                  data-testid="input-min-volume"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minLiquidity" className="text-xs">Min Liquidity ($)</Label>
                <Input
                  id="minLiquidity"
                  type="text"
                  value={focusedField === 'minLiquidity' ? (rawInputValues['minLiquidity'] ?? filters.minLiquidity ?? '') : formatNumberWithCommas(filters.minLiquidity ?? '')}
                  onChange={(e) => handleChange('minLiquidity', e.target.value)}
                  onFocus={() => setFocusedField('minLiquidity')}
                  onBlur={() => handleBlur('minLiquidity')}
                  data-testid="input-min-liquidity"
                />
              </div>
            </div>

            {/* Price Filters */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Price Range
              </h4>
              <div className="space-y-2">
                <Label htmlFor="minPrice" className="text-xs">Min Price ($)</Label>
                <Input
                  id="minPrice"
                  type="text"
                  value={focusedField === 'minPrice' ? (rawInputValues['minPrice'] ?? filters.minPrice ?? '') : formatNumberWithCommas(filters.minPrice ?? '')}
                  onChange={(e) => handleChange('minPrice', e.target.value)}
                  onFocus={() => setFocusedField('minPrice')}
                  onBlur={() => handleBlur('minPrice')}
                  data-testid="input-min-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxPrice" className="text-xs">Max Price ($)</Label>
                <Input
                  id="maxPrice"
                  type="text"
                  value={focusedField === 'maxPrice' ? (rawInputValues['maxPrice'] ?? filters.maxPrice ?? '') : formatNumberWithCommas(filters.maxPrice ?? '')}
                  onChange={(e) => handleChange('maxPrice', e.target.value)}
                  onFocus={() => setFocusedField('maxPrice')}
                  onBlur={() => handleBlur('maxPrice')}
                  data-testid="input-max-price"
                />
              </div>
            </div>

            {/* Market Cap & Spread */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                Market Quality
              </h4>
              <div className="space-y-2">
                <Label htmlFor="minMarketCap" className="text-xs">Min Market Cap ($)</Label>
                <Input
                  id="minMarketCap"
                  type="text"
                  value={focusedField === 'minMarketCap' ? (rawInputValues['minMarketCap'] ?? filters.minMarketCap ?? '') : formatNumberWithCommas(filters.minMarketCap ?? '')}
                  onChange={(e) => handleChange('minMarketCap', e.target.value)}
                  onFocus={() => setFocusedField('minMarketCap')}
                  onBlur={() => handleBlur('minMarketCap')}
                  data-testid="input-min-market-cap"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxBidAskSpread" className="text-xs">Max Bid-Ask Spread (%)</Label>
                <Input
                  id="maxBidAskSpread"
                  type="text"
                  value={focusedField === 'maxBidAskSpread' ? (rawInputValues['maxBidAskSpread'] ?? filters.maxBidAskSpread ?? '') : formatNumberWithCommas(filters.maxBidAskSpread ?? '')}
                  onChange={(e) => handleChange('maxBidAskSpread', e.target.value)}
                  onFocus={() => setFocusedField('maxBidAskSpread')}
                  onBlur={() => handleBlur('maxBidAskSpread')}
                  data-testid="input-max-bid-ask-spread"
                />
              </div>
            </div>

            {/* RSI Filters */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                RSI Range
              </h4>
              <div className="space-y-2">
                <Label htmlFor="rsiMin" className="text-xs">RSI Min</Label>
                <Input
                  id="rsiMin"
                  type="text"
                  value={focusedField === 'rsiMin' ? (rawInputValues['rsiMin'] ?? filters.rsiMin ?? '') : formatNumberWithCommas(filters.rsiMin ?? '')}
                  onChange={(e) => handleChange('rsiMin', e.target.value)}
                  onFocus={() => setFocusedField('rsiMin')}
                  onBlur={() => handleBlur('rsiMin')}
                  data-testid="input-rsi-min"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rsiMax" className="text-xs">RSI Max</Label>
                <Input
                  id="rsiMax"
                  type="text"
                  value={focusedField === 'rsiMax' ? (rawInputValues['rsiMax'] ?? filters.rsiMax ?? '') : formatNumberWithCommas(filters.rsiMax ?? '')}
                  onChange={(e) => handleChange('rsiMax', e.target.value)}
                  onFocus={() => setFocusedField('rsiMax')}
                  onBlur={() => handleBlur('rsiMax')}
                  data-testid="input-rsi-max"
                />
              </div>
            </div>

            {/* Volatility Filters */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                Volatility Range
              </h4>
              <div className="space-y-2">
                <Label htmlFor="volatilityMin" className="text-xs">Min Volatility (%)</Label>
                <Input
                  id="volatilityMin"
                  type="text"
                  value={focusedField === 'volatilityMin' ? (rawInputValues['volatilityMin'] ?? filters.volatilityMin ?? '') : formatNumberWithCommas(filters.volatilityMin ?? '')}
                  onChange={(e) => handleChange('volatilityMin', e.target.value)}
                  onFocus={() => setFocusedField('volatilityMin')}
                  onBlur={() => handleBlur('volatilityMin')}
                  data-testid="input-volatility-min"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="volatilityMax" className="text-xs">Max Volatility (%)</Label>
                <Input
                  id="volatilityMax"
                  type="text"
                  value={focusedField === 'volatilityMax' ? (rawInputValues['volatilityMax'] ?? filters.volatilityMax ?? '') : formatNumberWithCommas(filters.volatilityMax ?? '')}
                  onChange={(e) => handleChange('volatilityMax', e.target.value)}
                  onFocus={() => setFocusedField('volatilityMax')}
                  onBlur={() => handleBlur('volatilityMax')}
                  data-testid="input-volatility-max"
                />
              </div>
            </div>

            {/* Asset Type Filters */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                Asset Type Filters
              </h4>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="excludeStablecoins"
                  checked={filters.excludeStablecoins}
                  onCheckedChange={(checked) => handleChange('excludeStablecoins', checked as boolean)}
                  data-testid="checkbox-exclude-stablecoins"
                />
                <Label htmlFor="excludeStablecoins" className="text-xs cursor-pointer">
                  Exclude Stablecoins
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="allowRegulatedOnly"
                  checked={filters.allowRegulatedOnly}
                  onCheckedChange={(checked) => handleChange('allowRegulatedOnly', checked as boolean)}
                  data-testid="checkbox-allow-regulated-only"
                />
                <Label htmlFor="allowRegulatedOnly" className="text-xs cursor-pointer">
                  Regulated Assets Only
                </Label>
              </div>
            </div>
          </div>

          {/* Phase 27.F.14.UI-SYNC.2: Advanced Universe & Signal Controls */}
          <div className="mt-8 space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-500" />
              Advanced Universe & Signal Controls
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Market Universe Size */}
              <div className="space-y-2 p-4 border rounded-lg">
                <Label htmlFor="universeSize" className="text-sm font-medium">Market Universe Size</Label>
                <Select
                  value={String(filters.universeSize ?? DEFAULTS.universeSize)}
                  onValueChange={(value) => {
                    setFilters(prev => ({ ...prev, universeSize: parseInt(value) }));
                    setHasChanges(true);
                  }}
                >
                  <SelectTrigger data-testid="select-universe-size">
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 pairs</SelectItem>
                    <SelectItem value="50">50 pairs</SelectItem>
                    <SelectItem value="75">75 pairs</SelectItem>
                    <SelectItem value="100">100 pairs</SelectItem>
                    <SelectItem value="150">150 pairs</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Maximum number of trading pairs to monitor
                </p>
              </div>

              {/* Confidence Threshold */}
              <div className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <Label htmlFor="confidenceThreshold" className="text-sm font-medium">
                    Confidence Threshold ({filters.confidenceThreshold ?? DEFAULTS.confidenceThreshold}%)
                  </Label>
                </div>
                <Slider
                  id="confidenceThreshold"
                  min={40}
                  max={90}
                  step={5}
                  value={[filters.confidenceThreshold ?? DEFAULTS.confidenceThreshold]}
                  onValueChange={(values) => {
                    setFilters(prev => ({ ...prev, confidenceThreshold: values[0] }));
                    setHasChanges(true);
                  }}
                  data-testid="slider-confidence-threshold"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum confidence level required for trade signals (40-90%)
                </p>
              </div>

              {/* Active Timeframes */}
              <div className="space-y-2 p-4 border rounded-lg">
                <Label className="text-sm font-medium">Active Timeframes</Label>
                <div className="grid grid-cols-2 gap-3">
                  {['5m', '15m', '1h', '4h'].map((timeframe) => (
                    <div key={timeframe} className="flex items-center space-x-2">
                      <Checkbox
                        id={`timeframe-${timeframe}`}
                        checked={(filters.activeTimeframes ?? DEFAULTS.activeTimeframes).includes(timeframe)}
                        onCheckedChange={(checked) => {
                          const current = filters.activeTimeframes ?? DEFAULTS.activeTimeframes;
                          const updated = checked 
                            ? [...current, timeframe]
                            : current.filter(t => t !== timeframe);
                          setFilters(prev => ({ ...prev, activeTimeframes: updated }));
                          setHasChanges(true);
                        }}
                        data-testid={`checkbox-timeframe-${timeframe}`}
                      />
                      <Label htmlFor={`timeframe-${timeframe}`} className="text-xs cursor-pointer">
                        {timeframe}
                      </Label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select timeframes for technical analysis
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <Filter className="w-4 h-4 inline mr-2" />
              These filters are mode-specific. Changes in {mode} mode will not affect {mode === 'live' ? 'paper' : 'live'} mode settings.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
