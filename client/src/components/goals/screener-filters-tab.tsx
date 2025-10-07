import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { Filter, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

const DEFAULTS = {
  // Volume Filters
  minVolume24h: 1000000,
  avgVolumeRatio: 1.5,
  
  // Price Filters
  minPrice: 0.01,
  maxPrice: 100000,
  minLiquidity: 500000,
  
  // Volatility Filters
  atrThreshold: 2,
  maxSpread: 0.5,
  
  // Technical Filters
  rsiMin: 30,
  rsiMax: 70,
  
  // Risk Filters
  maxRMultiple: 3,
  stopLossMin: 1,
  stopLossMax: 5,
};

interface ScreenerFilters {
  minVolume24h: number;
  avgVolumeRatio: number;
  minPrice: number;
  maxPrice: number;
  minLiquidity: number;
  atrThreshold: number;
  maxSpread: number;
  rsiMin: number;
  rsiMax: number;
  maxRMultiple: number;
  stopLossMin: number;
  stopLossMax: number;
}

export default function ScreenerFiltersTab() {
  const { toast } = useToast();
  const { mode } = useTradingMode();
  const [filters, setFilters] = useState<Partial<ScreenerFilters>>(DEFAULTS);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: currentFilters, isLoading } = useQuery<ScreenerFilters>({
    queryKey: ['/api/screeners', mode],
    queryFn: () => fetch(`/api/screeners?mode=${mode}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }).then(r => r.json()),
  });

  useEffect(() => {
    if (currentFilters) {
      setFilters({
        minVolume24h: currentFilters.minVolume24h ?? DEFAULTS.minVolume24h,
        avgVolumeRatio: currentFilters.avgVolumeRatio ?? DEFAULTS.avgVolumeRatio,
        minPrice: currentFilters.minPrice ?? DEFAULTS.minPrice,
        maxPrice: currentFilters.maxPrice ?? DEFAULTS.maxPrice,
        minLiquidity: currentFilters.minLiquidity ?? DEFAULTS.minLiquidity,
        atrThreshold: currentFilters.atrThreshold ?? DEFAULTS.atrThreshold,
        maxSpread: currentFilters.maxSpread ?? DEFAULTS.maxSpread,
        rsiMin: currentFilters.rsiMin ?? DEFAULTS.rsiMin,
        rsiMax: currentFilters.rsiMax ?? DEFAULTS.rsiMax,
        maxRMultiple: currentFilters.maxRMultiple ?? DEFAULTS.maxRMultiple,
        stopLossMin: currentFilters.stopLossMin ?? DEFAULTS.stopLossMin,
        stopLossMax: currentFilters.stopLossMax ?? DEFAULTS.stopLossMax,
      });
    }
  }, [currentFilters, mode]);

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<ScreenerFilters>) => {
      return fetch(`/api/screeners?mode=${mode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(updates)
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/screeners', mode] });
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

  const handleChange = (field: string, value: number) => {
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
      <CardContent>
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Volume Filters */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                Volume Filters
              </h4>
              <div className="space-y-2">
                <Label htmlFor="minVolume24h" className="text-xs">Minimum 24h Volume ($M)</Label>
                <Input
                  id="minVolume24h"
                  type="number"
                  step="100000"
                  value={filters.minVolume24h}
                  onChange={(e) => handleChange('minVolume24h', parseFloat(e.target.value))}
                  data-testid="input-min-volume"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="avgVolumeRatio" className="text-xs">Average Volume Ratio (x)</Label>
                <Input
                  id="avgVolumeRatio"
                  type="number"
                  step="0.1"
                  value={filters.avgVolumeRatio}
                  onChange={(e) => handleChange('avgVolumeRatio', parseFloat(e.target.value))}
                  data-testid="input-avg-volume-ratio"
                />
              </div>
            </div>

            {/* Price Filters */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Price Filters
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
              <div className="space-y-2">
                <Label htmlFor="minLiquidity" className="text-xs">Min Liquidity ($K)</Label>
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

            {/* Volatility Filters */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                Volatility Filters
              </h4>
              <div className="space-y-2">
                <Label htmlFor="atrThreshold" className="text-xs">ATR Threshold (%)</Label>
                <Input
                  id="atrThreshold"
                  type="number"
                  step="0.1"
                  value={filters.atrThreshold}
                  onChange={(e) => handleChange('atrThreshold', parseFloat(e.target.value))}
                  data-testid="input-atr-threshold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxSpread" className="text-xs">Max Spread (%)</Label>
                <Input
                  id="maxSpread"
                  type="number"
                  step="0.1"
                  value={filters.maxSpread}
                  onChange={(e) => handleChange('maxSpread', parseFloat(e.target.value))}
                  data-testid="input-max-spread"
                />
              </div>
            </div>

            {/* Technical Filters */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                Technical Filters
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

            {/* Risk Filters */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                Risk Filters
              </h4>
              <div className="space-y-2">
                <Label htmlFor="maxRMultiple" className="text-xs">Max R-Multiple</Label>
                <Input
                  id="maxRMultiple"
                  type="number"
                  step="0.5"
                  value={filters.maxRMultiple}
                  onChange={(e) => handleChange('maxRMultiple', parseFloat(e.target.value))}
                  data-testid="input-max-r-multiple"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stopLossMin" className="text-xs">Stop Loss Min (%)</Label>
                <Input
                  id="stopLossMin"
                  type="number"
                  step="0.1"
                  value={filters.stopLossMin}
                  onChange={(e) => handleChange('stopLossMin', parseFloat(e.target.value))}
                  data-testid="input-stop-loss-min"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stopLossMax" className="text-xs">Stop Loss Max (%)</Label>
                <Input
                  id="stopLossMax"
                  type="number"
                  step="0.1"
                  value={filters.stopLossMax}
                  onChange={(e) => handleChange('stopLossMax', parseFloat(e.target.value))}
                  data-testid="input-stop-loss-max"
                />
              </div>
            </div>

            {/* Market Filters */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                Market Filters
              </h4>
              <div className="p-3 bg-muted/50 rounded-md text-xs text-muted-foreground space-y-1">
                <div>• Trading hours: 24/7</div>
                <div>• Excluded pairs: Stable/Stable</div>
                <div>• Only spot markets</div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <Filter className="w-4 h-4 inline mr-2" />
              The AI can adjust screener parameters to align with goal strategy (e.g., higher return focus vs. safer consistency)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
