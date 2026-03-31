import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Filter, Info } from "lucide-react";
import { useTradingMode } from "@/contexts/trading-mode-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ModeIndicator } from "./mode-indicator";

/**
 * Batch 19F Phase 2: 4-Column Dual-Path Filter Display
 * Shows all filter thresholds across 4 paths: Active Quant, Active Pattern, VTS Quant, VTS Pattern
 * Replaces the old 2-section VTS IMF panel with full transparency into all filter paths.
 */
/** Batch 19G: Expanded to show ALL DB fields from screener_filters */
/** Batch 19G HF1: Removed legacy IMF cards + editable input fields. 4-column table is sole source of truth. */
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

interface FamilyFilterData {
  lqMin: number; vnMax: number; corrMax: number; diMin: number; diMax: number;
}

const FAMILY_INTENTS: Record<string, Record<string, string>> = {
  active: { trend: 'Strong directional persistence', reversal: 'Choppy/ranging (low DI)', breakout: 'Emerging directional move', oscillator: 'Mean-reversion (very low DI)' },
  vts: { trend: 'Relaxed for learning', reversal: 'Wider DI ceiling for exploration', breakout: 'Relaxed for learning', oscillator: 'Wider DI ceiling for exploration' },
};

function FamilyIMFPanel() {
  const { data: imfStatus } = useQuery<any>({
    queryKey: ['/api/vts/imf-status'],
    refetchInterval: 30000,
  });

  const familyFilters = imfStatus?.familyFilters;
  if (!familyFilters) return null;

  const renderRow = (mode: 'active' | 'vts', family: string, f: FamilyFilterData | null, colorClass: string) => {
    if (!f) return null;
    return (
      <tr key={`${mode}-${family}`} className="border-b hover:bg-muted/30">
        <td className="p-2 font-medium capitalize">{family}</td>
        <td className="p-2 text-right">{f.lqMin}</td>
        <td className="p-2 text-right">{f.vnMax}</td>
        <td className="p-2 text-right">{f.corrMax}</td>
        <td className={`p-2 text-right ${colorClass}`}>{f.diMin}</td>
        <td className={`p-2 text-right ${f.diMax < 100 ? 'text-orange-500' : ''}`}>{f.diMax}</td>
        <td className="p-2 text-muted-foreground">{FAMILY_INTENTS[mode]?.[family] ?? ''}</td>
      </tr>
    );
  };

  return (
    <div className="px-6 py-4 border-b bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-amber-500" />
        <span className="font-semibold text-sm text-amber-700 dark:text-amber-300">Family-Specific IMF Thresholds</span>
        <span className="text-xs text-muted-foreground ml-auto">Quant path only — from database (live values)</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Each quant survivor is tested against all 4 family filters in parallel. A pair can qualify for multiple families.
        DI determines which strategy families apply: high DI → trend/breakout, low DI → reversal/oscillator.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-amber-100/50 dark:bg-amber-900/20">
              <th className="text-left p-2 font-medium">Family</th>
              <th className="text-right p-2 font-medium">LQ Min</th>
              <th className="text-right p-2 font-medium">VN Max</th>
              <th className="text-right p-2 font-medium">Corr Max</th>
              <th className="text-right p-2 font-medium">DI Min</th>
              <th className="text-right p-2 font-medium">DI Max</th>
              <th className="text-left p-2 font-medium">Intent</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b"><td colSpan={7} className="p-1 text-[10px] text-muted-foreground font-semibold bg-blue-50 dark:bg-blue-900/10">Active Trading</td></tr>
            {['trend', 'reversal', 'breakout', 'oscillator'].map(f => renderRow('active', f, familyFilters.active?.[f], 'text-blue-600'))}
            <tr className="border-b"><td colSpan={7} className="p-1 text-[10px] text-muted-foreground font-semibold bg-cyan-50 dark:bg-cyan-900/10">VTS / Passive Learning</td></tr>
            {['trend', 'reversal', 'breakout', 'oscillator'].map(f => renderRow('vts', f, familyFilters.vts?.[f], 'text-cyan-600'))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DualPathFilterPanel() {
  const { data: imfStatus } = useQuery<{
    activeQuant?: FilterColumnData;
    activePattern?: FilterColumnData;
    vtsQuant?: FilterColumnData;
    vtsPattern?: FilterColumnData;
    pairCounts: { standard: number; relaxed: number; quant?: number; pattern?: number; total: number };
  }>({
    queryKey: ['/api/vts/imf-status'],
    refetchInterval: 30000,
  });

  if (!imfStatus) return null;

  // Batch 19G HF1: Legacy 2-section fallback removed — 4-column data is required
  if (!imfStatus.activeQuant || !imfStatus.activePattern || !imfStatus.vtsQuant || !imfStatus.vtsPattern) {
    return (
      <div className="px-6 py-4 border-b bg-gradient-to-r from-cyan-50 to-teal-50 dark:from-cyan-900/10 dark:to-teal-900/10">
        <p className="text-sm text-muted-foreground text-center py-4">
          Dual-path filter data not yet available. Waiting for first scan cycle...
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 border-b bg-gradient-to-r from-cyan-50 to-teal-50 dark:from-cyan-900/10 dark:to-teal-900/10">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
        <span className="font-semibold text-sm text-cyan-700 dark:text-cyan-300">Dual-Path Filter Thresholds</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {imfStatus.pairCounts.quant ?? imfStatus.pairCounts.standard} quant + {imfStatus.pairCounts.pattern ?? 0} pattern = {imfStatus.pairCounts.total} pairs
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <FilterColumn title="Active Quant" data={imfStatus.activeQuant!} color="blue" tagLabel="Strict" />
        <FilterColumn title="Active Pattern" data={imfStatus.activePattern!} color="purple" tagLabel="Relaxed" />
        <FilterColumn title="VTS Quant" data={imfStatus.vtsQuant!} color="cyan" tagLabel="Learning" />
        <FilterColumn title="VTS Pattern" data={imfStatus.vtsPattern!} color="teal" tagLabel="Exploratory" />
      </div>
    </div>
  );
}

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
 * FinalScore = hybridScore x 0.4 + confidence x 0.3 + regimeWeight x 0.2 - decayPenalty x 0.1
 * Note: DEFAULT matches backend SQE_THRESHOLDS.MIN_FINAL_SCORE (0.35)
 */
export const FINAL_SCORE_CONFIG = {
  MIN: 0.2,
  MAX: 1.0,
  DEFAULT: 0.35,
  STEP: 0.05,
};

export function FiltersWithOverride() {
  const { mode } = useTradingMode();

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
                      All filter thresholds are managed via the database. The 4-column display below shows the active values for each filter path.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
          </div>
        </div>
      </CardHeader>

      {/* Batch 19G HF1: 4-column dual-path table is now the ONLY filter display */}
      <DualPathFilterPanel />

      {/* Batch 42: Family-Specific IMF Thresholds from DB (quant path only) */}
      <FamilyIMFPanel />

      <CardContent className="mt-6">
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
