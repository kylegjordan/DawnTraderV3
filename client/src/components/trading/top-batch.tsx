import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, TrendingUp, Activity, Zap, Clock, ChevronUp, ChevronDown, Target } from "lucide-react";
import { cn } from "@/lib/utils";

type SortField = 'rank' | 'score' | 'lastUpdated';
type SortDirection = 'asc' | 'desc';

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${dateStr} ${timeStr}`;
  } catch {
    return '—';
  }
}

interface RankedPair {
  rank: number;
  symbol: string;
  score: number;
  signalType: string;
  strategy: string;
  pattern: string;
  regime: string;
  regimeScore?: number; // Directive 11.4H.4A: Dynamic 0-100 regime score
  source: 'simulation' | 'live';
  lastUpdated: string; // Directive 11.4C.3-B: ISO 8601 timestamp
  frictionScore?: number; // Directive 11.4H.2: Friction score
  frictionLabel?: string; // Directive 11.4H.2: Friction label
  frictionColor?: 'green' | 'yellow' | 'orange' | 'red'; // Directive 11.4H.2: Friction color
  isBenchmark?: boolean; // Directive 11.4H.2: Benchmark flag
  poolType?: 'BENCHMARK' | 'STANDARD'; // Directive 11.4H.2: Pool type
}

function getScoreColor(score: number): string {
  if (score >= 0.7) return "text-green-500 bg-green-500/10";
  if (score >= 0.5) return "text-yellow-500 bg-yellow-500/10";
  return "text-red-500 bg-red-500/10";
}

function normalizeSignalType(signalType: string): string {
  const legacyToCanonical: Record<string, string> = {
    Hybrid: 'HYBRID',
    Quantitative: 'QUANT',
    Pattern: 'PATTERN'
  };
  return legacyToCanonical[signalType] ?? signalType.toUpperCase();
}

function getSignalTypeIcon(signalType: string) {
  const normalized = normalizeSignalType(signalType);
  switch (normalized) {
    case 'HYBRID':
      return <Zap className="h-3 w-3" />;
    case 'QUANT':
      return <Activity className="h-3 w-3" />;
    case 'PATTERN':
      return <TrendingUp className="h-3 w-3" />;
    default:
      return <Activity className="h-3 w-3" />;
  }
}

function normalizeRegime(regime: string): string {
  const ghostToCanonical: Record<string, string> = {
    // Legacy ghost regimes → new canonical
    BULL_VOLATILE: 'IMPULSE_EXPANSION',
    BEAR_STABLE: 'HIGH_VOLATILITY_UNSTABLE',
    EXTREME_NOISE: 'RANGE_BOUND_STABLE',
    HIGH_VOL_CHOP: 'IMPULSE_EXPANSION',
    MIXED_TRANSITION: 'STRUCTURAL_TRANSITION',
    // Old canonical → new canonical
    BULL_STABLE: 'TREND_FRIENDLY_STABLE',
    BEAR_VOLATILE: 'HIGH_VOLATILITY_UNSTABLE',
    LOW_VOL_CHOP: 'RANGE_BOUND_STABLE',
    HIGH_VOL_IMPULSE: 'IMPULSE_EXPANSION',
    TRANSITION: 'STRUCTURAL_TRANSITION'
  };
  return ghostToCanonical[regime] ?? regime;
}

// Directive 11.4H.4A: Fallback static regime weights (used when dynamic score unavailable)
const REGIME_WEIGHTS_FALLBACK: Record<string, number> = {
  TREND_FRIENDLY_STABLE: 85,
  HIGH_VOLATILITY_UNSTABLE: 40,
  RANGE_BOUND_STABLE: 55,
  IMPULSE_EXPANSION: 70,
  STRUCTURAL_TRANSITION: 50
};

// Directive 11.4H.4A: Get regime score - prefer dynamic, fallback to static
function getRegimeScoreDisplay(regimeScore: number | undefined, regime: string): number {
  if (regimeScore !== undefined && regimeScore > 0) {
    return Math.round(regimeScore);
  }
  const normalized = normalizeRegime(regime);
  return REGIME_WEIGHTS_FALLBACK[normalized] ?? 50;
}

function getRegimeBadgeClass(regime: string): string {
  const normalizedRegime = normalizeRegime(regime);
  switch (normalizedRegime) {
    case 'TREND_FRIENDLY_STABLE':
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case 'IMPULSE_EXPANSION':
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case 'HIGH_VOLATILITY_UNSTABLE':
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case 'RANGE_BOUND_STABLE':
      return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
    case 'STRUCTURAL_TRANSITION':
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    default:
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  }
}

// Directive 11.4H.2 Task 4: Friction color badge classes
function getFrictionBadgeClass(color: string): string {
  switch (color) {
    case 'green':
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case 'orange':
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    case 'red':
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
  }
}

// Directive 11.4H.4A-Fix2: API response format with global regime
interface RankedPairsResponse {
  pairs: RankedPair[];
  globalRegime: {
    regime: string;
    regimeScore: number;
    pairCount: number;
    percentage: number;
  } | null;
}

export default function TopBatch() {
  const [componentLastUpdated, setComponentLastUpdated] = useState<Date | null>(null);
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const { data: responseData, isLoading, error, refetch } = useQuery<RankedPairsResponse>({
    queryKey: ['/api/pairs/ranked'],
    queryFn: async () => {
      const response = await fetch('/api/pairs/ranked?limit=100', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch ranked pairs');
      return response.json();
    },
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  // Directive 11.4H.4A-Fix2: Extract pairs array from response
  const data = responseData?.pairs ?? [];
  // Directive 11.4H.4A-Fix2: Use global regime from API for consistency with Overview tab
  const globalRegime = responseData?.globalRegime;

  useEffect(() => {
    if (responseData) {
      setComponentLastUpdated(new Date());
    }
  }, [responseData]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'lastUpdated' ? 'desc' : 'asc');
    }
  };

  // Directive 11.4H.4A-Fix2: Use global regime from API instead of calculating from batch
  // This ensures consistency between Top Scanned Pairs and Overview tabs
  const dominantRegime = useMemo(() => {
    if (globalRegime) {
      return {
        regime: globalRegime.regime,
        count: globalRegime.pairCount,
        percentage: globalRegime.percentage,
        avgRegimeScore: globalRegime.regimeScore
      };
    }
    // Fallback: Calculate from batch if globalRegime not available (backwards compatibility)
    if (!data || !data.length) return null;
    const regimeCounts: Record<string, { count: number; totalScore: number }> = {};
    data.forEach(p => {
      const normalized = normalizeRegime(p.regime);
      if (!regimeCounts[normalized]) {
        regimeCounts[normalized] = { count: 0, totalScore: 0 };
      }
      regimeCounts[normalized].count += 1;
      const score = p.regimeScore ?? REGIME_WEIGHTS_FALLBACK[normalized] ?? 50;
      regimeCounts[normalized].totalScore += score;
    });
    const sorted = Object.entries(regimeCounts).sort((a, b) => b[1].count - a[1].count);
    if (sorted.length === 0) return null;
    const [regime, stats] = sorted[0];
    const avgRegimeScore = Math.round(stats.totalScore / stats.count);
    return { regime, count: stats.count, percentage: Math.round((stats.count / data.length) * 100), avgRegimeScore };
  }, [globalRegime, data]);

  const sortedPairs = useMemo(() => {
    if (!data || !data.length) return [];
    return [...data].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'rank':
          comparison = a.rank - b.rank;
          break;
        case 'score':
          comparison = a.score - b.score;
          break;
        case 'lastUpdated':
          comparison = new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="h-3 w-3 inline" /> : <ChevronDown className="h-3 w-3 inline" />;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Top Scanned Pairs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Top Scanned Pairs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-500 text-sm">Failed to load ranked pairs</div>
        </CardContent>
      </Card>
    );
  }

  const pairs = data ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Top Scanned Pairs
            <Badge variant="secondary" className="ml-2">{pairs.length} pairs</Badge>
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {componentLastUpdated && (
              <span>Updated: {componentLastUpdated.toLocaleTimeString()}</span>
            )}
            <button 
              onClick={() => refetch()}
              className="p-1 hover:bg-muted rounded"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Directive 11.4H.4: Global Regime Display */}
        {dominantRegime && (
          <div className="flex items-center gap-3 mt-2 text-sm">
            <div className="flex items-center gap-1.5">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Global Regime:</span>
              <Badge className={cn("text-xs", getRegimeBadgeClass(dominantRegime.regime))}>
                {dominantRegime.avgRegimeScore ?? REGIME_WEIGHTS_FALLBACK[normalizeRegime(dominantRegime.regime)] ?? 50} {dominantRegime.regime.replace(/_/g, ' ')}
              </Badge>
              <span className="text-muted-foreground">({dominantRegime.percentage}% of batch)</span>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort('rank')}>
                  Rank <SortIcon field="rank" />
                </th>
                <th className="pb-2 pr-4 font-medium">Symbol</th>
                <th className="pb-2 pr-4 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort('score')}>
                  Score <SortIcon field="score" />
                </th>
                <th className="pb-2 pr-4 font-medium">Signal Type</th>
                <th className="pb-2 pr-4 font-medium">Strategy</th>
                <th className="pb-2 pr-4 font-medium">Pattern</th>
                <th className="pb-2 pr-4 font-medium">Regime</th>
                <th className="pb-2 pr-4 font-medium">Friction</th>
                <th className="pb-2 pr-4 font-medium">Source</th>
                <th className="pb-2 pr-4 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort('lastUpdated')}>
                  <Clock className="h-3 w-3 inline mr-1" />
                  Last Updated <SortIcon field="lastUpdated" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPairs.map((pair) => (
                <tr key={`${pair.rank}-${pair.symbol}`} className="border-b border-muted/50 hover:bg-muted/30">
                  <td className="py-2 pr-4">
                    <span className="font-mono text-muted-foreground">#{pair.rank}</span>
                  </td>
                  <td className="py-2 pr-4 font-medium">{pair.symbol}</td>
                  <td className="py-2 pr-4">
                    <Badge className={cn("font-mono", getScoreColor(pair.score))}>
                      {pair.score.toFixed(4)}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-1">
                      {getSignalTypeIcon(pair.signalType)}
                      <span>{pair.signalType}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <Badge variant="outline">{pair.strategy}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{pair.pattern}</td>
                  <td className="py-2 pr-4">
                    <Badge className={cn("text-xs", getRegimeBadgeClass(pair.regime))}>
                      {getRegimeScoreDisplay(pair.regimeScore, pair.regime)} {pair.regime.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">
                    {pair.frictionScore !== undefined && pair.frictionLabel ? (
                      <Badge className={cn("text-xs", getFrictionBadgeClass(pair.frictionColor || 'gray'))}>
                        {pair.frictionScore} {pair.frictionLabel}
                      </Badge>
                    ) : pair.frictionLabel ? (
                      <Badge className={cn("text-xs", getFrictionBadgeClass(pair.frictionColor || 'gray'))}>
                        {pair.frictionLabel}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge variant={pair.source === 'live' ? 'default' : 'secondary'}>
                      {pair.source === 'live' ? 'Active Trading' : 'Simulation'}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground font-mono">
                    {formatTimestamp(pair.lastUpdated)}
                  </td>
                </tr>
              ))}
              {sortedPairs.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      <span>Top Batch is being rebuilt. Scanning will repopulate pairs as new signals are generated.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
