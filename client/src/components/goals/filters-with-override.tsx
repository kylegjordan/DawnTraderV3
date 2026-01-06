import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Filter, Info, Sparkles, CircleDot } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useOverrideState } from "@/hooks/use-override-state";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ModeIndicator } from "./mode-indicator";

/**
 * REB 2.9B Stage 3: Final Screener UI (11-20 Archive Phase 8.6/8.7)
 * 
 * Section 1: Always format numeric fields on blur (LATTI + Manual)
 * Section 2: Active Timeframes multi-select dropdown
 * Section 3: Market Universe Size dropdown
 * Section 4: Quote Currencies hidden from UI (but kept in API)
 */

interface FilterV2 {
  name: string;
  value: number | string | boolean | string[];
  managedByLottie: boolean;
  manualOverrideEnabled: boolean;
  displayName: string;
  category: string;
}

interface FiltersV2Response {
  ok: boolean;
  data: {
    mode: string;
    filters: FilterV2[];
  };
}

const FILTER_CATEGORIES: Record<string, { icon: string; color: string }> = {
  'Volume & Liquidity': { icon: '💧', color: 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700' },
  'Price Range': { icon: '💰', color: 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700' },
  'Market Quality': { icon: '⭐', color: 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700' },
  'Technical Indicators': { icon: '📊', color: 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700' },
  'Volatility': { icon: '📈', color: 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700' },
  'Asset Type': { icon: '🏷️', color: 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700' },
  'Data Quality': { icon: '📋', color: 'bg-teal-100 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700' },
  'Market Configuration': { icon: '🎯', color: 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700' },
  'Other': { icon: '⚙️', color: 'bg-gray-100 dark:bg-gray-900/30 border-gray-300 dark:border-gray-700' },
};

// REB 2.9B Stage 3 Section 2: Active Timeframes options
const TIMEFRAME_OPTIONS = ["1m", "5m", "15m", "1h", "4h", "1d"];

// REB 2.9B Stage 3 Section 3: Market Universe Size options
const MARKET_UNIVERSE_OPTIONS = [
  { label: "Top 25", value: 25 },
  { label: "Top 50", value: 50 },
  { label: "Top 100", value: 100 },
  { label: "Top 250", value: 250 },
  { label: "Top 500", value: 500 },
];

/**
 * Directive 10.8: Feature flag to enable adaptive scanning
 * When enabled, the Market Universe Size filter is hidden because
 * pair selection is now driven by TelemetryAggregator and AdaptiveScanManager
 */
export const ADAPTIVE_SCANNING_ENABLED = true;

/**
 * Directive 10.9: Feature flag to disable legacy metrics
 * When enabled, legacy CWQI, NGC, and RiskCalc filters are hidden
 * and replaced with unified FinalScore filtering
 */
export const LEGACY_METRICS_ENABLED = false;

/**
 * Directive 10.9: FinalScore filter configuration
 * FinalScore = hybridScore × 0.4 + confidence × 0.3 + regimeWeight × 0.2 - decayPenalty × 0.1
 */
export const FINAL_SCORE_CONFIG = {
  MIN: 0.5,
  MAX: 1.0,
  DEFAULT: 0.6,
  STEP: 0.05,
};

// REB 2.9B Stage 3 Section 1: Number formatting helpers (from directive)
const formatNumber = (value: number | string): string => {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "number" ? value : parseFloat(value.toString().replace(/,/g, ""));
  if (isNaN(num)) return "";
  return num.toLocaleString("en-US");
};

const unformatNumber = (value: string): string => {
  if (!value) return "";
  return value.replace(/,/g, "");
};

// Determine if a filter is a numeric amount filter (needs comma formatting)
// Directive 10.9: Added finalScoreThreshold, removed deprecated confidenceThreshold
const isNumericAmountFilter = (filterName: string): boolean => {
  return ['minVolume', 'minLiquidity', 'minPrice', 'maxPrice', 'maxBidAskSpread',
          'minMarketCap', 'volatilityMin', 'volatilityMax', 'rsiMin', 'rsiMax',
          'finalScoreThreshold'].includes(filterName);
};

export function FiltersWithOverride() {
  const { toast } = useToast();
  const { mode } = useTradingMode();
  
  // REB 2.12C: Local override state derived from server per-filter data
  // This state is synced with server on every fetch - no stale caching
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  
  // Local string state for number inputs (always formatted with commas)
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  
  // Phase 3b: WebSocket integration for real-time sync
  useOverrideState();

  // Fetch Filters from filters_v2 endpoint
  const { data: filtersData, isLoading, error } = useQuery<FiltersV2Response>({
    queryKey: ['/api/filters-v2', mode],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      const response = await fetch(`/api/filters-v2?mode=${mode}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch filters');
      }
      return response.json();
    },
  });

  // REB 2.12C: Always sync local state with server per-filter data on every fetch
  // This ensures navigation away and back always reflects the correct per-filter override modes
  useEffect(() => {
    if (filtersData?.data?.filters) {
      const newOverrides: Record<string, boolean> = {};
      const newLocalValues: Record<string, string> = {};
      
      filtersData.data.filters.forEach((f) => {
        // REB 2.12C: Use per-filter manualOverrideEnabled from server (not global)
        // overrides[name] = true means LATTi mode (managedByLottie AND NOT manualOverrideEnabled)
        // overrides[name] = false means Manual mode (manualOverrideEnabled = true)
        newOverrides[f.name] = f.managedByLottie && !f.manualOverrideEnabled;
        
        // Stage 3: ALWAYS initialize with formatted value for numeric amount filters
        if (isNumericAmountFilter(f.name) && (typeof f.value === 'number' || typeof f.value === 'string')) {
          newLocalValues[f.name] = formatNumber(f.value);
        } else {
          newLocalValues[f.name] = String(f.value ?? "");
        }
      });
      
      setOverrides(newOverrides);
      setLocalValues(newLocalValues);
    }
  }, [filtersData]);

  // Override mutation
  const updateOverrideMutation = useMutation({
    mutationFn: async (updates: { filterName: string; manualOverrideEnabled: boolean }) => {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      const response = await fetch(`/api/filters-v2?mode=${mode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      
      if (!response.ok || data.ok === false) {
        throw new Error(data.detail || data.error || 'Failed to update filter');
      }
      
      return data;
    },
    onSuccess: () => {
      // REB 2.12C: Invalidate cache to ensure per-filter overrides sync on navigation
      queryClient.invalidateQueries({ queryKey: ['/api/filters-v2', mode] });
    },
    onError: (error: any, variables) => {
      toast({
        title: "Error",
        description: error.message || `Failed to update override for ${variables.filterName}`,
        variant: "destructive",
      });
    },
  });

  // Value mutation
  const updateValueMutation = useMutation({
    mutationFn: async (updates: { filterName: string; value: number | string | boolean | string[] }) => {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      const response = await fetch(`/api/filters-v2?mode=${mode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      
      if (!response.ok || data.ok === false) {
        throw new Error(data.detail || data.error || 'Failed to update filter value');
      }
      
      return { ...data, filterName: updates.filterName, value: updates.value };
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update filter value",
        variant: "destructive",
      });
    },
  });

  // Toggle handler
  const handleToggleOverride = async (filterName: string) => {
    const currentOverride = overrides[filterName];
    const newManualOverrideEnabled = currentOverride;
    
    try {
      await updateOverrideMutation.mutateAsync({
        filterName,
        manualOverrideEnabled: newManualOverrideEnabled,
      });
      
      setOverrides(prev => ({
        ...prev,
        [filterName]: !prev[filterName],
      }));
      
      toast({
        title: "Filter automation updated",
        description: `${filterName} is now ${newManualOverrideEnabled ? 'manually controlled' : 'managed by LATTi'}.`,
      });
    } catch (err) {
      // Error handled in mutation onError
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Filter Automation Control</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-2 border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <Filter className="w-5 h-5" />
            Filter Automation Control
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-red-600 dark:text-red-400 font-semibold">Failed to load filters</p>
            <p className="text-sm text-muted-foreground mt-2">
              {error instanceof Error ? error.message : 'An error occurred while fetching filter data'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!filtersData?.data?.filters || filtersData.data.filters.length === 0) {
    return (
      <Card className="border-2 border-purple-200 dark:border-purple-900">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            Filter Automation Control
            <ModeIndicator />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Filter className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-semibold text-foreground">No filters configured yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Filters will appear here once they are set up for {mode} mode
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // REB 2.9B Stage 3 Section 4: Filter out quoteCurrencies before grouping
  // Phase 8.8.4-B.3: Filter out confidenceThreshold (deprecated - NGC is now single confidence source)
  // Directive 10.8: Filter out universeSize when adaptive scanning is enabled
  // Directive 10.9: Filter out legacy CWQI/NGC/RiskCalc when legacy metrics disabled
  const legacyMetricFilters = ['cwqiThreshold', 'ngcThreshold', 'riskCalcThreshold'];
  const visibleFilters = filtersData.data.filters.filter(f => 
    f.name !== 'quoteCurrencies' && 
    f.name !== 'confidenceThreshold' &&
    !(ADAPTIVE_SCANNING_ENABLED && f.name === 'universeSize') &&
    !(!LEGACY_METRICS_ENABLED && legacyMetricFilters.includes(f.name))
  );

  // Group filters by category
  const filtersByCategory = visibleFilters.reduce((acc, filter) => {
    const category = filter.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(filter);
    return acc;
  }, {} as Record<string, FilterV2[]>);

  // Render individual filter input
  const renderFilterInput = (f: FilterV2) => {
    const isDisabled = overrides[f.name];
    const localValue = localValues[f.name] ?? "";
    
    // Minimum History (Days) dropdown
    if (f.name === 'minHistoryDays') {
      return (
        <Select
          value={String(f.value)}
          disabled={isDisabled}
          onValueChange={(val) => {
            updateValueMutation.mutate(
              { filterName: 'minHistoryDays', value: Number(val) },
              { onSuccess: () => toast({ title: "Value updated successfully" }) }
            );
          }}
        >
          <SelectTrigger className="w-[180px]" data-testid={`select-${f.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="60">60 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
            <SelectItem value="180">180 days</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    
    // REB 2.9B Stage 3 Section 3: Market Universe Size dropdown
    if (f.name === 'universeSize') {
      const currentValue = typeof f.value === 'number' ? f.value : 100;
      const currentLabel = MARKET_UNIVERSE_OPTIONS.find(opt => opt.value === currentValue)?.label || `Top ${currentValue}`;
      
      return (
        <Select
          value={String(currentValue)}
          disabled={isDisabled}
          onValueChange={(val) => {
            updateValueMutation.mutate(
              { filterName: 'universeSize', value: Number(val) },
              { onSuccess: () => toast({ title: "Universe size updated" }) }
            );
          }}
        >
          <SelectTrigger className="w-[150px]" data-testid={`select-${f.name}`}>
            <SelectValue>{currentLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MARKET_UNIVERSE_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    
    // REB 2.9B Stage 3 Section 2: Active Timeframes multi-select
    if (f.name === 'activeTimeframes') {
      const currentValue = Array.isArray(f.value) ? f.value : [];
      
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isDisabled}>
            <Button variant="outline" className="w-[200px] justify-between" data-testid={`select-${f.name}`}>
              <span className="truncate">
                {currentValue.length > 0 ? currentValue.join(", ") : "Select timeframes..."}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[200px]">
            {TIMEFRAME_OPTIONS.map(tf => (
              <DropdownMenuCheckboxItem
                key={tf}
                checked={currentValue.includes(tf)}
                onCheckedChange={(checked) => {
                  const newValue = checked
                    ? [...currentValue, tf]
                    : currentValue.filter(v => v !== tf);
                  updateValueMutation.mutate(
                    { filterName: 'activeTimeframes', value: newValue },
                    { onSuccess: () => toast({ title: "Timeframes updated" }) }
                  );
                }}
              >
                {tf}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    
    // Boolean selects (Yes/No)
    if (['excludeStablecoins', 'allowRegulatedOnly'].includes(f.name)) {
      return (
        <Select
          value={String(f.value)}
          disabled={isDisabled}
          onValueChange={(val) => {
            updateValueMutation.mutate(
              { filterName: f.name, value: val === "true" },
              { onSuccess: () => toast({ title: "Value updated successfully" }) }
            );
          }}
        >
          <SelectTrigger className="w-[120px]" data-testid={`select-${f.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    
    // REB 2.9B Stage 3 Section 1: Numeric input with ALWAYS comma formatting
    if (isNumericAmountFilter(f.name)) {
      return (
        <Input
          value={localValue}
          disabled={isDisabled}
          onChange={(e) => {
            setLocalValues(prev => ({
              ...prev,
              [f.name]: e.target.value,
            }));
          }}
          onFocus={(e) => {
            // Remove commas when focused for editing
            const raw = unformatNumber(e.target.value);
            e.target.value = raw;
            setLocalValues(prev => ({
              ...prev,
              [f.name]: raw,
            }));
          }}
          onBlur={(e) => {
            // Format with commas and save
            const rawValue = unformatNumber(e.target.value);
            const numericValue = Number(rawValue);
            
            if (!isNaN(numericValue)) {
              updateValueMutation.mutate(
                { filterName: f.name, value: numericValue },
                {
                  onSuccess: () => {
                    toast({ title: "Value updated successfully" });
                    const formatted = formatNumber(numericValue);
                    e.target.value = formatted;
                    setLocalValues(prev => ({
                      ...prev,
                      [f.name]: formatted,
                    }));
                  }
                }
              );
            }
          }}
          className={`max-w-[150px] ${isDisabled ? 'bg-muted' : ''}`}
          data-testid={`input-${f.name}`}
        />
      );
    }
    
    // Default: Plain text input
    return (
      <Input
        value={isDisabled ? String(f.value) : localValue}
        disabled={isDisabled}
        onChange={(e) => {
          setLocalValues(prev => ({
            ...prev,
            [f.name]: e.target.value,
          }));
        }}
        onBlur={() => {
          if (localValue !== String(f.value)) {
            updateValueMutation.mutate(
              { filterName: f.name, value: localValue },
              { onSuccess: () => toast({ title: "Value updated successfully" }) }
            );
          }
        }}
        className={`max-w-[150px] ${isDisabled ? 'bg-muted' : ''}`}
        data-testid={`input-${f.name}`}
      />
    );
  };

  return (
    <Card className="border-2 border-purple-200 dark:border-purple-900">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              Filter Automation Control
              <ModeIndicator />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      Control whether each filter is automatically managed by LATTi or manually controlled. 
                      See docs/manual_override_behavior.md for details.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Toggle between LATTi autonomous optimization and manual control for each filter parameter
            </p>
          </div>
        </div>
      </CardHeader>

      {/* Directive 9.5.C: System Guards Panel - Institutional Math Thresholds */}
      <div className="px-6 py-4 border-b bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/10 dark:to-purple-900/10">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
          <span className="font-semibold text-sm text-violet-700 dark:text-violet-300">System Guards (Directive 9.1)</span>
          <span className="text-xs bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded">Institutional Math</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Liquidity Guard */}
          <div className="p-3 border rounded-lg bg-white dark:bg-gray-900/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Liquidity Guard</span>
              <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">Active</span>
            </div>
            <div className="text-xl font-bold text-violet-600 dark:text-violet-400">LQ &ge; 40</div>
            <p className="text-xs text-muted-foreground mt-0.5">Log-Liquidity Index</p>
          </div>
          {/* Noise Guard */}
          <div className="p-3 border rounded-lg bg-white dark:bg-gray-900/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Noise Guard</span>
              <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">Active</span>
            </div>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">VolNoise &le; 0.6</div>
            <p className="text-xs text-muted-foreground mt-0.5">Volatility Noise Limit</p>
          </div>
          {/* FinalScore Gate (Directive 10.9) */}
          <div className="p-3 border rounded-lg bg-white dark:bg-gray-900/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">FinalScore Gate</span>
              <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">Active</span>
            </div>
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">FS &ge; {FINAL_SCORE_CONFIG.DEFAULT}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Unified Score (10.9)</p>
          </div>
          {/* Correlation Guard */}
          <div className="p-3 border rounded-lg bg-white dark:bg-gray-900/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Correlation Guard</span>
              <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">Active</span>
            </div>
            <div className="text-xl font-bold text-rose-600 dark:text-rose-400">&rho; &le; 0.75</div>
            <p className="text-xs text-muted-foreground mt-0.5">Covariance Guard (9.4)</p>
          </div>
        </div>
      </div>
      
      <CardContent className="mt-6">
        <div className="space-y-6">
          {Object.entries(filtersByCategory).map(([category, filters]) => {
            const categoryStyle = FILTER_CATEGORIES[category] || FILTER_CATEGORIES['Other'];
            
            return (
              <div key={category} className={`p-4 border-2 rounded-lg ${categoryStyle.color}`}>
                <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                  <span>{categoryStyle.icon}</span>
                  <span>{category}</span>
                  <span className="text-xs text-muted-foreground">({filters.length} filters)</span>
                </h3>
                
                <div className="space-y-3">
                  {filters.map((filter) => (
                    <div key={filter.name} className="bg-white dark:bg-slate-950 p-3 rounded border">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Label className="text-sm font-medium">
                              {filter.displayName}
                            </Label>
                            {overrides[filter.name] ? (
                              <Badge variant="default" className="bg-green-600 text-xs" data-testid={`badge-auto-${filter.name}`}>
                                <Sparkles className="w-3 h-3 mr-1" />
                                Auto (LATTi)
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs" data-testid={`badge-manual-${filter.name}`}>
                                <CircleDot className="w-3 h-3 mr-1" />
                                Manual
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {renderFilterInput(filter)}
                            <span className="text-xs text-muted-foreground">
                              {!overrides[filter.name] ? 'Manual value' : 'Current value'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 ml-4">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    Managed by LATTi
                                  </span>
                                  <Checkbox
                                    checked={!!overrides[filter.name]}
                                    onCheckedChange={() => handleToggleOverride(filter.name)}
                                    disabled={updateOverrideMutation.isPending}
                                    data-testid={`checkbox-managed-${filter.name}`}
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  {!overrides[filter.name]
                                    ? 'Enable LATTi automatic optimization for this filter'
                                    : 'Disable LATTi and switch to manual control for this filter'}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Phase 8.8.4-B.2: Signal Quality Evaluator (SQE) Filters */}
        <div className="mt-8 space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            Signal Quality Evaluator (SQE) Filters
          </h3>
          <p className="text-sm text-muted-foreground">
            These thresholds are applied automatically to filter trade signals before they enter the Ready-to-Buy queue.
            Signals must pass all SQE criteria to be considered for execution.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* NGC Filter */}
            <div className="p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">NGC</span>
                <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded">Active</span>
              </div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">&ge; 0.45</div>
              <p className="text-xs text-muted-foreground mt-1">Normalized Global Confidence</p>
            </div>

            {/* Risk Filter */}
            <div className="p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Risk</span>
                <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded">Active</span>
              </div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">&le; 0.85</div>
              <p className="text-xs text-muted-foreground mt-1">Maximum risk score allowed</p>
            </div>

            {/* ProfitRate Filter */}
            <div className="p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">ProfitRate</span>
                <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded">Active</span>
              </div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">&ge; 0.10</div>
              <p className="text-xs text-muted-foreground mt-1">Minimum profit per time unit</p>
            </div>

            {/* CWQI Filter */}
            <div className="p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">CWQI</span>
                <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded">Active</span>
              </div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">&ge; 0.35</div>
              <p className="text-xs text-muted-foreground mt-1">Confidence-Weighted Quality Index</p>
            </div>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>How SQE Works:</strong> Each trade signal is evaluated against these four metrics. 
              NGC combines raw confidence with market volatility and risk conditions. 
              ProfitRate measures expected return per time unit. 
              CWQI is the overall quality score used for ranking signals in the queue.
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 rounded-lg">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5" />
            <div className="text-sm text-purple-900 dark:text-purple-100">
              <p className="font-semibold mb-1">About Filter Automation</p>
              <p className="text-purple-700 dark:text-purple-200/80">
                LATTi continuously analyzes market conditions and adjusts filter parameters to maximize opportunity identification. 
                Uncheck "Managed by LATTi" for any filter you want to control manually.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
