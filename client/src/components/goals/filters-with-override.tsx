import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Filter, Info, Sparkles, CircleDot, Check } from "lucide-react";
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
 * REB 2.9B Stage 2: Screener UI Finalization (1120 Archive Blueprint)
 * 
 * Implements:
 * - Numeric formatting with commas after blur/save
 * - Active Timeframes multi-select
 * - Quote Currencies multi-select (UI-only, scanner ignores)
 * - Market Universe Size dropdown
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

// REB 2.9B Stage 2 Section 3.1: Active Timeframes options (1120 truth)
const TIMEFRAME_OPTIONS = ["1m", "5m", "15m", "1h", "4h", "1d"];

// REB 2.9B Stage 2 Section 3.2: Quote Currencies options (1120 truth, UI-only)
const QUOTE_CURRENCY_OPTIONS = ["USD", "EUR", "JPY", "GBP", "USDT", "USDC", "BTC", "ETH"];

// REB 2.9B Stage 2 Section 3.3: Market Universe Size options
const MARKET_UNIVERSE_OPTIONS = [
  { label: "Top 25", value: 25 },
  { label: "Top 50", value: 50 },
  { label: "Top 100", value: 100 },
  { label: "Top 250", value: 250 },
  { label: "Top 500", value: 500 },
];

// REB 2.9B Stage 2 Section 2: Enhanced comma formatting helper
const formatThousands = (value: number | string | boolean | string[] | null | undefined): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === 'boolean') return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
};

// REB 2.9B Stage 2: Determine if a filter is a numeric amount filter (needs comma formatting)
const isNumericAmountFilter = (filterName: string): boolean => {
  return ['minVolume', 'minLiquidity', 'minPrice', 'maxPrice', 'maxBidAskSpread',
          'minMarketCap', 'volatilityMin', 'volatilityMax', 'rsiMin', 'rsiMax',
          'confidenceThreshold'].includes(filterName);
};

export function FiltersWithOverride() {
  const { toast } = useToast();
  const { mode } = useTradingMode();
  
  // REB 2.9B Section 1: Local override state - each filter independent
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  
  // REB 2.9B Section 3: Local string state for number inputs
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  
  // REB 2.9B Stage 2: Track which fields are being edited (for formatting)
  const [editingFields, setEditingFields] = useState<Record<string, boolean>>({});
  
  // REB 2.9B: Track if we've initialized from server data (to avoid re-init on refetch)
  const initializedRef = useRef(false);
  
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

  // REB 2.9B: Initialize local overrides and values from server data ONCE
  useEffect(() => {
    if (filtersData?.data?.filters && !initializedRef.current) {
      const newOverrides: Record<string, boolean> = {};
      const newLocalValues: Record<string, string> = {};
      
      filtersData.data.filters.forEach((f) => {
        newOverrides[f.name] = f.managedByLottie && !f.manualOverrideEnabled;
        // Stage 2: Initialize with formatted value for numeric amount filters
        if (isNumericAmountFilter(f.name) && typeof f.value === 'number') {
          newLocalValues[f.name] = formatThousands(f.value);
        } else {
          newLocalValues[f.name] = String(f.value ?? "");
        }
      });
      
      setOverrides(newOverrides);
      setLocalValues(newLocalValues);
      initializedRef.current = true;
    }
  }, [filtersData]);
  
  // Reset initialization flag when mode changes
  useEffect(() => {
    initializedRef.current = false;
  }, [mode]);

  // REB 2.9B Section 1: Override mutation
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
    onError: (error: any, variables) => {
      toast({
        title: "Error",
        description: error.message || `Failed to update override for ${variables.filterName}`,
        variant: "destructive",
      });
    },
  });

  // REB 2.9B Stage 2: Value mutation with post-save formatting
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
    onSuccess: (data) => {
      // Stage 2: After successful save, update local value with formatted version
      if (isNumericAmountFilter(data.filterName) && typeof data.value === 'number') {
        setLocalValues(prev => ({
          ...prev,
          [data.filterName]: formatThousands(data.value),
        }));
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update filter value",
        variant: "destructive",
      });
    },
  });

  // REB 2.9B Section 1: Toggle handler
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

  // REB 2.9B Stage 2: Handle numeric input blur with formatting
  const handleNumericBlur = (filterName: string, rawValue: string) => {
    setEditingFields(prev => ({ ...prev, [filterName]: false }));
    
    const numericValue = Number(rawValue.replace(/,/g, ""));
    if (!isNaN(numericValue)) {
      // Save the numeric value
      updateValueMutation.mutate({
        filterName,
        value: numericValue,
      });
      // Immediately show formatted value
      setLocalValues(prev => ({
        ...prev,
        [filterName]: formatThousands(numericValue),
      }));
    }
  };

  // REB 2.9B Stage 2: Handle numeric input focus (switch to raw mode)
  const handleNumericFocus = (filterName: string, currentValue: string) => {
    setEditingFields(prev => ({ ...prev, [filterName]: true }));
    // Strip commas when user starts editing
    const rawValue = currentValue.replace(/,/g, "");
    setLocalValues(prev => ({
      ...prev,
      [filterName]: rawValue,
    }));
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

  // Group filters by category
  const filtersByCategory = filtersData.data.filters.reduce((acc, filter) => {
    const category = filter.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(filter);
    return acc;
  }, {} as Record<string, FilterV2[]>);

  // REB 2.9B Stage 2: Render individual filter input
  const renderFilterInput = (f: FilterV2) => {
    const isDisabled = overrides[f.name];
    const localValue = localValues[f.name] ?? "";
    const isEditing = editingFields[f.name] ?? false;
    
    // REB 2.9B Section 7: Minimum History (Days) dropdown
    if (f.name === 'minHistoryDays') {
      return (
        <Select
          value={String(f.value)}
          disabled={isDisabled}
          onValueChange={(val) => {
            updateValueMutation.mutate({
              filterName: 'minHistoryDays',
              value: Number(val),
            });
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
    
    // REB 2.9B Stage 2 Section 3.3: Market Universe Size dropdown
    if (f.name === 'universeSize') {
      const currentValue = typeof f.value === 'number' ? f.value : 100;
      const currentLabel = MARKET_UNIVERSE_OPTIONS.find(opt => opt.value === currentValue)?.label || `Top ${currentValue}`;
      
      return (
        <Select
          value={String(currentValue)}
          disabled={isDisabled}
          onValueChange={(val) => {
            updateValueMutation.mutate({
              filterName: 'universeSize',
              value: Number(val),
            });
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
    
    // REB 2.9B Stage 2 Section 3.1: Active Timeframes multi-select
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
                  updateValueMutation.mutate({
                    filterName: 'activeTimeframes',
                    value: newValue,
                  });
                }}
              >
                {tf}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    
    // REB 2.9B Stage 2 Section 3.2: Quote Currencies multi-select (UI-only)
    if (f.name === 'quoteCurrencies') {
      const currentValue = Array.isArray(f.value) ? f.value : [];
      
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isDisabled}>
            <Button variant="outline" className="w-[200px] justify-between" data-testid={`select-${f.name}`}>
              <span className="truncate">
                {currentValue.length > 0 ? currentValue.join(", ") : "Select currencies..."}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[200px]">
            {QUOTE_CURRENCY_OPTIONS.map(qc => (
              <DropdownMenuCheckboxItem
                key={qc}
                checked={currentValue.includes(qc)}
                onCheckedChange={(checked) => {
                  const newValue = checked
                    ? [...currentValue, qc]
                    : currentValue.filter(v => v !== qc);
                  updateValueMutation.mutate({
                    filterName: 'quoteCurrencies',
                    value: newValue,
                  });
                }}
              >
                {qc}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    
    // REB 2.9B Section 5: Boolean selects (Yes/No)
    if (['excludeStablecoins', 'allowRegulatedOnly'].includes(f.name)) {
      return (
        <Select
          value={String(f.value)}
          disabled={isDisabled}
          onValueChange={(val) => {
            updateValueMutation.mutate({
              filterName: f.name,
              value: val === "true",
            });
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
    
    // REB 2.9B Stage 2: Numeric input with comma formatting after blur
    if (isNumericAmountFilter(f.name)) {
      return (
        <Input
          value={isDisabled ? formatThousands(f.value) : localValue}
          disabled={isDisabled}
          onChange={(e) => {
            setLocalValues(prev => ({
              ...prev,
              [f.name]: e.target.value,
            }));
          }}
          onFocus={() => handleNumericFocus(f.name, localValue)}
          onBlur={() => handleNumericBlur(f.name, localValue)}
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
            updateValueMutation.mutate({
              filterName: f.name,
              value: localValue,
            });
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
                            {filter.name === 'quoteCurrencies' && (
                              <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
                                UI Only
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
