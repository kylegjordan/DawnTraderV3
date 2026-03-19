import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Filter, Info, CircleDot } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useTradingMode } from "@/contexts/trading-mode-context";
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

/**
 * Batch 19F Phase 2: 4-Column Dual-Path Filter Display
 * Shows all filter thresholds across 4 paths: Active Quant, Active Pattern, VTS Quant, VTS Pattern
 * Replaces the old 2-section VTS IMF panel with full transparency into all filter paths.
 */
/** Batch 19G: Expanded to show ALL DB fields from screener_filters */
interface FilterColumnData {
  LQ_MIN: number;
  VN_MAX: number;
  CORR_MAX: number;
  DI_MIN: number;
  MIN_VOLUME_USD: number;
  MAX_SPREAD: number;
  MIN_HISTORY_DAYS: number;
  MIN_PRICE: number;
  MAX_PRICE: number;
  MIN_LIQUIDITY: number;
  MIN_MARKET_CAP: number;
  EXCLUDE_STABLECOINS: boolean;
  ACTIVE_TIMEFRAMES: string[];
}

function FilterColumn({ title, data, color, tagLabel }: { title: string; data: FilterColumnData; color: string; tagLabel: string }) {
  const colorMap: Record<string, { bg: string; text: string; tag: string; border: string }> = {
    blue: { bg: 'bg-blue-50 dark:bg-blue-900/10', text: 'text-blue-600 dark:text-blue-400', tag: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-900/10', text: 'text-purple-600 dark:text-purple-400', tag: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
    cyan: { bg: 'bg-cyan-50 dark:bg-cyan-900/10', text: 'text-cyan-600 dark:text-cyan-400', tag: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800' },
    teal: { bg: 'bg-teal-50 dark:bg-teal-900/10', text: 'text-teal-600 dark:text-teal-400', tag: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800' },
  };
  const c = colorMap[color] || colorMap.blue;

  const formatVol = (v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`;
  const formatPrice = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(2)}`;

  return (
    <div className={`p-3 border rounded-lg ${c.bg} ${c.border}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground">{title}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${c.tag}`}>{tagLabel}</span>
      </div>
      <div className="space-y-1.5">
        {/* Global Filters Section */}
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Global</div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Volume</span>
          <span className={`text-sm font-mono font-bold ${c.text}`}>{formatVol(data.MIN_VOLUME_USD)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Liquidity</span>
          <span className={`text-sm font-mono font-bold ${c.text}`}>{formatVol(data.MIN_LIQUIDITY)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Spread</span>
          <span className={`text-sm font-mono font-bold ${c.text}`}>&le; {data.MAX_SPREAD}%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">History</span>
          <span className={`text-sm font-mono font-bold ${c.text}`}>&ge; {data.MIN_HISTORY_DAYS}d</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Price Range</span>
          <span className={`text-xs font-mono ${c.text}`}>{formatPrice(data.MIN_PRICE)} - {formatPrice(data.MAX_PRICE)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Mkt Cap</span>
          <span className={`text-sm font-mono font-bold ${c.text}`}>{formatVol(data.MIN_MARKET_CAP)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Stables</span>
          <span className={`text-xs font-mono ${c.text}`}>{data.EXCLUDE_STABLECOINS ? 'Excluded' : 'Included'}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Timeframes</span>
          <span className={`text-xs font-mono ${c.text}`}>{(data.ACTIVE_TIMEFRAMES || []).join(', ')}</span>
        </div>
        <div className="border-t border-dashed my-1 opacity-30" />
        {/* IMF Section */}
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">IMF</div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">LQ Min</span>
          <span className={`text-sm font-mono font-bold ${c.text}`}>&ge; {data.LQ_MIN}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">VN Max</span>
          <span className={`text-sm font-mono font-bold ${c.text}`}>&le; {data.VN_MAX}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Corr Max</span>
          <span className={`text-sm font-mono font-bold ${c.text}`}>&rho; &le; {data.CORR_MAX}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">DI Min</span>
          <span className={`text-sm font-mono font-bold ${c.text}`}>&ge; {data.DI_MIN}</span>
        </div>
      </div>
    </div>
  );
}

function VtsImfPanel() {
  const { data: imfStatus } = useQuery<{
    activeQuant?: FilterColumnData;
    activePattern?: FilterColumnData;
    vtsQuant?: FilterColumnData;
    vtsPattern?: FilterColumnData;
    activeTrading: { LQ_MIN: number; VN_MAX: number; CORR_MAX: number };
    vtsLearning: { LQ_MIN: number; VN_MAX: number; CORR_MAX: number };
    pairCounts: { standard: number; relaxed: number; quant?: number; pattern?: number; total: number };
  }>({
    queryKey: ['/api/vts/imf-status'],
    refetchInterval: 30000,
  });

  if (!imfStatus) return null;

  // Use new 4-column data if available, fall back to legacy 2-section format
  const has4Column = imfStatus.activeQuant && imfStatus.activePattern && imfStatus.vtsQuant && imfStatus.vtsPattern;

  return (
    <div className="px-6 py-4 border-b bg-gradient-to-r from-cyan-50 to-teal-50 dark:from-cyan-900/10 dark:to-teal-900/10">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
        <span className="font-semibold text-sm text-cyan-700 dark:text-cyan-300">Dual-Path Filter Thresholds</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {imfStatus.pairCounts.quant ?? imfStatus.pairCounts.standard} quant + {imfStatus.pairCounts.pattern ?? 0} pattern = {imfStatus.pairCounts.total} pairs
        </span>
      </div>
      {has4Column ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <FilterColumn title="Active Quant" data={imfStatus.activeQuant!} color="blue" tagLabel="Strict" />
          <FilterColumn title="Active Pattern" data={imfStatus.activePattern!} color="purple" tagLabel="Relaxed" />
          <FilterColumn title="VTS Quant" data={imfStatus.vtsQuant!} color="cyan" tagLabel="Learning" />
          <FilterColumn title="VTS Pattern" data={imfStatus.vtsPattern!} color="teal" tagLabel="Exploratory" />
        </div>
      ) : (
        /* Legacy 2-section fallback */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 border rounded-lg bg-white dark:bg-gray-900/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Liquidity Guard</span>
              <span className="text-xs bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 px-1.5 py-0.5 rounded">Relaxed</span>
            </div>
            <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400">LQ &ge; {imfStatus.vtsLearning.LQ_MIN}</div>
            <p className="text-xs text-muted-foreground mt-0.5">vs Active: LQ &ge; {imfStatus.activeTrading.LQ_MIN}</p>
          </div>
          <div className="p-3 border rounded-lg bg-white dark:bg-gray-900/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Noise Guard</span>
              <span className="text-xs bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 px-1.5 py-0.5 rounded">Relaxed</span>
            </div>
            <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400">VN &le; {imfStatus.vtsLearning.VN_MAX}</div>
            <p className="text-xs text-muted-foreground mt-0.5">vs Active: VN &le; {imfStatus.activeTrading.VN_MAX}</p>
          </div>
          <div className="p-3 border rounded-lg bg-white dark:bg-gray-900/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Correlation Guard</span>
              <span className="text-xs bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 px-1.5 py-0.5 rounded">Relaxed</span>
            </div>
            <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400">&rho; &le; {imfStatus.vtsLearning.CORR_MAX}</div>
            <p className="text-xs text-muted-foreground mt-0.5">vs Active: &rho; &le; {imfStatus.activeTrading.CORR_MAX}</p>
          </div>
        </div>
      )}
    </div>
  );
}
import { Button } from "@/components/ui/button";
import { ModeIndicator } from "./mode-indicator";

interface FilterV2 {
  name: string;
  value: number | string | boolean | string[];
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

/**
 * Directive 10.9F: Filter categories for UI display
 * DEPRECATED/REMOVED: 'Technical Indicators' (RSI), 'Volatility' (Min/Max Volatility), 'Quote Currencies'
 * RENAMED: 'Risk & Volatility' -> 'Execution Quality' (only Max Bid-Ask Spread remains)
 */
const FILTER_CATEGORIES: Record<string, { icon: string; color: string }> = {
  'Volume & Liquidity': { icon: '💧', color: 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700' },
  'Price Range': { icon: '💰', color: 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700' },
  'Market Quality': { icon: '⭐', color: 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700' },
  'Asset Type': { icon: '🏷️', color: 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700' },
  'Data Quality': { icon: '📋', color: 'bg-teal-100 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700' },
  'Market Configuration': { icon: '🎯', color: 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700' },
  'Execution Quality': { icon: '🎛️', color: 'bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700' },
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
 * Directive 10.9D: FinalScore filter configuration (synchronized with SQE_THRESHOLDS)
 * FinalScore = hybridScore × 0.4 + confidence × 0.3 + regimeWeight × 0.2 - decayPenalty × 0.1
 * Note: DEFAULT matches backend SQE_THRESHOLDS.MIN_FINAL_SCORE (0.35)
 */
export const FINAL_SCORE_CONFIG = {
  MIN: 0.2,
  MAX: 1.0,
  DEFAULT: 0.35,
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
// Directive 10.9E: Removed deprecated volatilityMin, volatilityMax, rsiMin, rsiMax
const isNumericAmountFilter = (filterName: string): boolean => {
  return ['minVolume', 'minLiquidity', 'minPrice', 'maxPrice', 'maxBidAskSpread',
          'minMarketCap', 'finalScoreThreshold'].includes(filterName);
};

export function FiltersWithOverride() {
  const { toast } = useToast();
  const { mode } = useTradingMode();
  
  // Local string state for number inputs (always formatted with commas)
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

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

  // Directive 11.8B-D: Sync local state with server filter data on every fetch
  useEffect(() => {
    if (filtersData?.data?.filters) {
      const newLocalValues: Record<string, string> = {};
      
      filtersData.data.filters.forEach((f) => {
        if (isNumericAmountFilter(f.name) && (typeof f.value === 'number' || typeof f.value === 'string')) {
          newLocalValues[f.name] = formatNumber(f.value);
        } else {
          newLocalValues[f.name] = String(f.value ?? "");
        }
      });
      
      setLocalValues(newLocalValues);
    }
  }, [filtersData]);

  // Value mutation — sole write path for filter changes (Directive 11.8B-D)
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

  // Render individual filter input — Directive 11.8B-D: All filters are always editable (manual only)
  const renderFilterInput = (f: FilterV2) => {
    const localValue = localValues[f.name] ?? "";
    
    // Minimum History (Days) dropdown
    if (f.name === 'minHistoryDays') {
      return (
        <Select
          value={String(f.value)}
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
          <DropdownMenuTrigger asChild>
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
          className="max-w-[150px]"
          data-testid={`input-${f.name}`}
        />
      );
    }
    
    // Default: Plain text input
    return (
      <Input
        value={localValue}
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
        className="max-w-[150px]"
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
              Screener Filters
              <ModeIndicator />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      Configure filter parameters to control which assets are included in market scanning.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
          </div>
        </div>
      </CardHeader>

      {/* Institutional Math Filters Panel */}
      <div className="px-6 py-4 border-b bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/10 dark:to-purple-900/10">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
          <span className="font-semibold text-sm text-violet-700 dark:text-violet-300">Institutional Math Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          {/* Correlation Guard */}
          <div className="p-3 border rounded-lg bg-white dark:bg-gray-900/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Correlation Guard</span>
              <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">Active</span>
            </div>
            <div className="text-xl font-bold text-rose-600 dark:text-rose-400">&rho; &le; 0.75</div>
            <p className="text-xs text-muted-foreground mt-0.5">Covariance Guard</p>
          </div>
        </div>
      </div>

      {/* HF9 Item D: VTS IMF Filters Panel — Relaxed thresholds for ML training data */}
      <VtsImfPanel />

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
                            <Badge variant="secondary" className="text-xs" data-testid={`badge-manual-${filter.name}`}>
                              <CircleDot className="w-3 h-3 mr-1" />
                              Configured
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            {renderFilterInput(filter)}
                            <span className="text-xs text-muted-foreground">
                              Configured value
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Directive 10.9D: Signal Quality Evaluator (SQE) Filters - Modernized */}
        <div className="mt-8 space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            Signal Quality Evaluator (SQE) Filters
          </h3>
          <p className="text-sm text-muted-foreground">
            Signals must meet both gates to pass the SQE review and enter the Ready-to-Buy queue.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* FinalScore Gate */}
            <div className="p-4 border-2 border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/50 dark:bg-blue-900/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">FinalScore Gate</span>
                <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded">Active</span>
              </div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">&ge; 0.35</div>
              <p className="text-xs text-muted-foreground mt-1">
                FinalScore = hybridScore &times; 0.4 + confidence &times; 0.3 + regimeWeight &times; 0.2 - decayPenalty &times; 0.1
              </p>
            </div>

            {/* RegimeWeight Gate */}
            <div className="p-4 border-2 border-purple-200 dark:border-purple-800 rounded-lg bg-purple-50/50 dark:bg-purple-900/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">RegimeWeight Gate</span>
                <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded">Active</span>
              </div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">&ge; 0.30</div>
              <p className="text-xs text-muted-foreground mt-1">
                Market regime alignment score based on trend and volatility conditions
              </p>
            </div>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>How SQE Works:</strong> Each trade signal is evaluated against FinalScore and RegimeWeight thresholds. 
              FinalScore combines hybrid ensemble scoring, predictive confidence, market regime alignment, and time decay. 
              RegimeWeight ensures signals align with current market conditions. 
              Both gates must pass for a signal to enter the Ready-to-Buy queue.
              See system-guards.ts for threshold configuration.
            </p>
          </div>
        </div>

        {/* Directive 11.7A: SQE Profitability (ROI) Thresholds */}
        <div className="mt-8 space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            SQE Profitability (ROI) Gate
          </h3>
          <p className="text-sm text-muted-foreground">
            Minimum ROI thresholds that adjust dynamically based on market regime. Signals below threshold are logged for ML but not traded.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3 border-2 border-green-200 dark:border-green-800 rounded-lg bg-green-50/50 dark:bg-green-900/20 text-center">
              <div className="text-xs font-medium text-muted-foreground mb-1">BULL_STABLE</div>
              <div className="text-lg font-bold text-green-600 dark:text-green-400">1.25%</div>
            </div>
            <div className="p-3 border-2 border-red-200 dark:border-red-800 rounded-lg bg-red-50/50 dark:bg-red-900/20 text-center">
              <div className="text-xs font-medium text-muted-foreground mb-1">BEAR_VOLATILE</div>
              <div className="text-lg font-bold text-red-600 dark:text-red-400">2.50%</div>
            </div>
            <div className="p-3 border-2 border-yellow-200 dark:border-yellow-800 rounded-lg bg-yellow-50/50 dark:bg-yellow-900/20 text-center">
              <div className="text-xs font-medium text-muted-foreground mb-1">LOW_VOL_CHOP</div>
              <div className="text-lg font-bold text-yellow-600 dark:text-yellow-400">1.75%</div>
            </div>
            <div className="p-3 border-2 border-orange-200 dark:border-orange-800 rounded-lg bg-orange-50/50 dark:bg-orange-900/20 text-center">
              <div className="text-xs font-medium text-muted-foreground mb-1">HIGH_VOL_IMPULSE</div>
              <div className="text-lg font-bold text-orange-600 dark:text-orange-400">3.00%</div>
            </div>
            <div className="p-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50/50 dark:bg-gray-800/20 text-center">
              <div className="text-xs font-medium text-muted-foreground mb-1">TRANSITION</div>
              <div className="text-lg font-bold text-gray-600 dark:text-gray-400">2.00%</div>
            </div>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <strong>Regime-Aware ROI:</strong> Expected ROI must exceed the threshold for the current market regime. 
              Volatile conditions require higher expected returns to justify increased risk.
              Skipped signals are logged to /logs/vts_skipped_signals/ for ML training.
            </p>
          </div>
        </div>

        {/* Directive 11.7A: SQE Liquidity Filter */}
        <div className="mt-6 space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-500" />
            SQE Liquidity Filter
          </h3>

          <div className="p-4 border-2 border-cyan-200 dark:border-cyan-800 rounded-lg bg-cyan-50/50 dark:bg-cyan-900/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Minimum 24h Notional Volume (USD)</span>
              <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded">Active</span>
            </div>
            <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">$2,000,000</div>
            <p className="text-xs text-muted-foreground mt-1">
              All volumes normalized to USD equivalent for cross-quote currency comparison
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
