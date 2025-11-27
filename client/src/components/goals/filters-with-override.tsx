import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
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
import { ModeIndicator } from "./mode-indicator";

/**
 * REB 2.9B: Final Restoration of Screener Filters UI (1120 Archive Blueprint)
 * 
 * Implements exact 8.6/8.7 truth behavior:
 * - Individual toggles (no global state, no loops)
 * - Input editability tied to override state
 * - Number inputs with local string state for full typing
 * - Comma formatting on blur
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
  'Other': { icon: '⚙️', color: 'bg-gray-100 dark:bg-gray-900/30 border-gray-300 dark:border-gray-700' },
};

// REB 2.9B Section 4: Comma formatting helper from 1120 blueprint
const formatThousands = (val: string | number | boolean | string[] | null | undefined): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === 'boolean') return val ? "Yes" : "No";
  if (Array.isArray(val)) return val.join(", ");
  const num = Number(val);
  return isNaN(num) ? String(val) : num.toLocaleString("en-US");
};

export function FiltersWithOverride() {
  const { toast } = useToast();
  const { mode } = useTradingMode();
  
  // REB 2.9B Section 1: Local override state - each filter independent
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  
  // REB 2.9B Section 3: Local string state for number inputs
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  
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
  // Per 1120 blueprint: Do NOT reinitialize on refetch - local state is source of truth
  useEffect(() => {
    if (filtersData?.data?.filters && !initializedRef.current) {
      const newOverrides: Record<string, boolean> = {};
      const newLocalValues: Record<string, string> = {};
      
      filtersData.data.filters.forEach((f) => {
        // Override = true means "Managed by LATTi" = checked = AUTO mode = input disabled
        // Override = false means "Manual" = unchecked = input enabled
        newOverrides[f.name] = f.managedByLottie && !f.manualOverrideEnabled;
        newLocalValues[f.name] = String(f.value ?? "");
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

  // REB 2.9B Section 1: Override mutation - only updates ONE filter
  // Per 1120 blueprint: NO cache invalidation - local state is source of truth
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
    // No onSuccess cache invalidation per 1120 blueprint
    onError: (error: any, variables) => {
      toast({
        title: "Error",
        description: error.message || `Failed to update override for ${variables.filterName}`,
        variant: "destructive",
      });
    },
  });

  // REB 2.9B Section 8: Value mutation - uses /api/filters-v2 only
  // Per 1120 blueprint: NO cache invalidation - local state is source of truth
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
      
      return data;
    },
    // No onSuccess cache invalidation per 1120 blueprint
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update filter value",
        variant: "destructive",
      });
    },
  });

  // REB 2.9B Section 1: Toggle handler - EXACT 1120 blueprint pattern
  const handleToggleOverride = async (filterName: string) => {
    const currentOverride = overrides[filterName];
    const newManualOverrideEnabled = currentOverride; // If currently managed (override=true), enable manual
    
    try {
      await updateOverrideMutation.mutateAsync({
        filterName,
        manualOverrideEnabled: newManualOverrideEnabled,
      });
      
      // Update local state after successful mutation
      setOverrides(prev => ({
        ...prev,
        [filterName]: !prev[filterName],
      }));
      
      toast({
        title: "Filter automation updated",
        description: `${filterName} is now ${newManualOverrideEnabled ? 'manually controlled' : 'managed by LATTi'}.`,
      });
    } catch (err) {
      // Error already handled in mutation onError
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

  // Group filters by category
  const filtersByCategory = filtersData.data.filters.reduce((acc, filter) => {
    const category = filter.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(filter);
    return acc;
  }, {} as Record<string, FilterV2[]>);

  // REB 2.9B: Render individual filter row with 1120 blueprint behavior
  const renderFilterInput = (f: FilterV2) => {
    const isDisabled = overrides[f.name]; // Disabled when managed by LATTi
    const localValue = localValues[f.name] ?? String(f.value ?? "");
    
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
    
    // REB 2.9B Section 6: Array selects (timeframes, quoteCurrencies)
    if (['timeframes', 'quoteCurrencies'].includes(f.name)) {
      const currentValue = Array.isArray(f.value) ? f.value : [];
      const options = f.name === 'timeframes' 
        ? ['1m', '5m', '15m', '1h', '4h', '1d']
        : ['USD', 'EUR', 'GBP', 'USDT', 'USDC'];
      
      return (
        <Select
          value={currentValue[0] || ''}
          disabled={isDisabled}
          onValueChange={(val) => {
            updateValueMutation.mutate({
              filterName: f.name,
              value: [val],
            });
          }}
        >
          <SelectTrigger className="w-[150px]" data-testid={`select-${f.name}`}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {options.map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    
    // REB 2.9B Sections 2, 3, 4: Numeric input with local string state and comma formatting
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
        onBlur={() => {
          if (localValue !== String(f.value)) {
            const numericValue = Number(localValue.replace(/,/g, ""));
            if (!isNaN(numericValue)) {
              updateValueMutation.mutate({
                filterName: f.name,
                value: numericValue,
              });
            }
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
                            {/* REB 2.9B: Badge shows Auto when override=true (managed), Manual when override=false */}
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
                                  {/* REB 2.9B Section 1: Checkbox bound to local override state */}
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
