import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
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
import { ModeIndicator } from "./mode-indicator";

/**
 * Phase 3b: Filters with Override Controls Component
 * 
 * Displays filter parameters with Lottie/Manual override controls.
 * Integrates with filters_v2 backend and provides real-time WebSocket sync.
 */

interface FilterV2 {
  name: string;
  value: number;
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
  'Other': { icon: '⚙️', color: 'bg-gray-100 dark:bg-gray-900/30 border-gray-300 dark:border-gray-700' },
};

export function FiltersWithOverride() {
  const { toast } = useToast();
  const { mode } = useTradingMode();
  
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

  const updateMutation = useMutation({
    mutationFn: async (updates: { filterName: string; manualOverrideEnabled: boolean }) => {
      const response = await fetch(`/api/filters-v2?mode=${mode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
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
      queryClient.invalidateQueries({ 
        queryKey: ['/api/filters-v2', mode],
        refetchType: 'all'
      });
      toast({
        title: "Filter automation updated",
        description: "Filter control mode has been changed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update filter",
        variant: "destructive",
      });
    },
  });

  const handleToggleManual = (filter: FilterV2) => {
    const newManualState = !filter.manualOverrideEnabled;
    
    updateMutation.mutate({
      filterName: filter.name,
      manualOverrideEnabled: newManualState
    });
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

  // Handle errors
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

  // Handle empty/missing data
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
                            {filter.managedByLottie && !filter.manualOverrideEnabled ? (
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
                            <Input
                              type="text"
                              value={filter.value}
                              disabled
                              className="max-w-[150px] bg-muted"
                              data-testid={`input-${filter.name}`}
                            />
                            <span className="text-xs text-muted-foreground">
                              Current value
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
                                    checked={filter.managedByLottie && !filter.manualOverrideEnabled}
                                    onCheckedChange={() => handleToggleManual(filter)}
                                    disabled={updateMutation.isPending}
                                    data-testid={`checkbox-managed-${filter.name}`}
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  {filter.manualOverrideEnabled 
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
                Uncheck "Managed by LATTi" for any filter you want to control manually. Manual values can be set in the Screener Filters tab.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
