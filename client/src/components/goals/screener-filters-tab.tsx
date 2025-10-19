import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModeIndicator } from "./mode-indicator";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect, useRef } from "react";
import { Filter, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

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
};

interface ScreenerFilters {
  minVolume: number;
  minPrice: number;
  maxPrice: number;
  minMarketCap: number;
  maxBidAskSpread: number;
  rsiMin: number;
  rsiMax: number;
  volatilityMin: number;
  volatilityMax: number;
  minLiquidity: number;
  excludeStablecoins: boolean;
  allowRegulatedOnly: boolean;
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
  const initialized = useRef(false);
  const lastMode = useRef(mode);

  const { data: currentFilters, isLoading } = useQuery<ScreenerFilters>({
    queryKey: ['/api/screeners', mode],
  });

  const { data: calibration } = useQuery<CalibrationData>({
    queryKey: ['/api/screeners/calibration', mode],
  });

  useEffect(() => {
    if (currentFilters && (!initialized.current || lastMode.current !== mode)) {
      initialized.current = true;
      lastMode.current = mode;
      setFilters({
        minVolume: currentFilters.minVolume ?? DEFAULTS.minVolume,
        minPrice: currentFilters.minPrice ?? DEFAULTS.minPrice,
        maxPrice: currentFilters.maxPrice ?? DEFAULTS.maxPrice,
        minMarketCap: currentFilters.minMarketCap ?? DEFAULTS.minMarketCap,
        maxBidAskSpread: currentFilters.maxBidAskSpread ?? DEFAULTS.maxBidAskSpread,
        rsiMin: currentFilters.rsiMin ?? DEFAULTS.rsiMin,
        rsiMax: currentFilters.rsiMax ?? DEFAULTS.rsiMax,
        volatilityMin: currentFilters.volatilityMin ?? DEFAULTS.volatilityMin,
        volatilityMax: currentFilters.volatilityMax ?? DEFAULTS.volatilityMax,
        minLiquidity: currentFilters.minLiquidity ?? DEFAULTS.minLiquidity,
        excludeStablecoins: currentFilters.excludeStablecoins ?? DEFAULTS.excludeStablecoins,
        allowRegulatedOnly: currentFilters.allowRegulatedOnly ?? DEFAULTS.allowRegulatedOnly,
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

  const handleChange = (field: string, value: number | boolean) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
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
                  type="number"
                  step="100000"
                  value={filters.minVolume}
                  onChange={(e) => handleChange('minVolume', parseFloat(e.target.value))}
                  data-testid="input-min-volume"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minLiquidity" className="text-xs">Min Liquidity ($)</Label>
                <Input
                  id="minLiquidity"
                  type="number"
                  step="10000"
                  value={filters.minLiquidity}
                  onChange={(e) => handleChange('minLiquidity', parseFloat(e.target.value))}
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
                  type="number"
                  step="0.01"
                  value={filters.minPrice}
                  onChange={(e) => handleChange('minPrice', parseFloat(e.target.value))}
                  data-testid="input-min-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxPrice" className="text-xs">Max Price ($)</Label>
                <Input
                  id="maxPrice"
                  type="number"
                  step="1000"
                  value={filters.maxPrice}
                  onChange={(e) => handleChange('maxPrice', parseFloat(e.target.value))}
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
                  type="number"
                  step="10000000"
                  value={filters.minMarketCap}
                  onChange={(e) => handleChange('minMarketCap', parseFloat(e.target.value))}
                  data-testid="input-min-market-cap"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxBidAskSpread" className="text-xs">Max Bid-Ask Spread (%)</Label>
                <Input
                  id="maxBidAskSpread"
                  type="number"
                  step="0.1"
                  value={filters.maxBidAskSpread}
                  onChange={(e) => handleChange('maxBidAskSpread', parseFloat(e.target.value))}
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
                  type="number"
                  min="0"
                  max="100"
                  value={filters.rsiMin}
                  onChange={(e) => handleChange('rsiMin', parseFloat(e.target.value))}
                  data-testid="input-rsi-min"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rsiMax" className="text-xs">RSI Max</Label>
                <Input
                  id="rsiMax"
                  type="number"
                  min="0"
                  max="100"
                  value={filters.rsiMax}
                  onChange={(e) => handleChange('rsiMax', parseFloat(e.target.value))}
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
                  type="number"
                  step="0.1"
                  value={filters.volatilityMin}
                  onChange={(e) => handleChange('volatilityMin', parseFloat(e.target.value))}
                  data-testid="input-volatility-min"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="volatilityMax" className="text-xs">Max Volatility (%)</Label>
                <Input
                  id="volatilityMax"
                  type="number"
                  step="0.1"
                  value={filters.volatilityMax}
                  onChange={(e) => handleChange('volatilityMax', parseFloat(e.target.value))}
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
