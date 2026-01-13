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
    BULL_VOLATILE: 'HIGH_VOL_IMPULSE',
    BEAR_STABLE: 'BEAR_VOLATILE',
    EXTREME_NOISE: 'LOW_VOL_CHOP',
    HIGH_VOL_CHOP: 'HIGH_VOL_IMPULSE',
    MIXED_TRANSITION: 'TRANSITION'
  };
  return ghostToCanonical[regime] ?? regime;
}

// Directive 11.4H.4: Regime weight scores for display
const REGIME_WEIGHTS: Record<string, number> = {
  BULL_STABLE: 0.85,
  BEAR_VOLATILE: 0.40,
  LOW_VOL_CHOP: 0.55,
  HIGH_VOL_IMPULSE: 0.70,
  TRANSITION: 0.50
};

function getRegimeScore(regime: string): number {
  const normalized = normalizeRegime(regime);
  return REGIME_WEIGHTS[normalized] ?? 0.50;
}

function getRegimeBadgeClass(regime: string): string {
  const normalizedRegime = normalizeRegime(regime);
  switch (normalizedRegime) {
    case 'BULL_STABLE':
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case 'HIGH_VOL_IMPULSE':
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case 'BEAR_VOLATILE':
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case 'LOW_VOL_CHOP':
      return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
    case 'TRANSITION':
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

export default function TopBatch() {
  const [componentLastUpdated, setComponentLastUpdated] = useState<Date | null>(null);
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const { data, isLoading, error, refetch } = useQuery<RankedPair[]>({
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

  useEffect(() => {
    if (data) {
      setComponentLastUpdated(new Date());
    }
  }, [data]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'lastUpdated' ? 'desc' : 'asc');
    }
  };

  // Directive 11.4H.4: Calculate dominant regime from batch for global display
  // NOTE: All hooks must be called before conditional returns
  const dominantRegime = useMemo(() => {
    if (!data || !data.length) return null;
    const regimeCounts: Record<string, number> = {};
    data.forEach(p => {
      const normalized = normalizeRegime(p.regime);
      regimeCounts[normalized] = (regimeCounts[normalized] || 0) + 1;
    });
    const sorted = Object.entries(regimeCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return null;
    const [regime, count] = sorted[0];
    return { regime, count, percentage: Math.round((count / data.length) * 100) };
  }, [data]);

  const sortedPairs = useMemo(() => {
    if (!data) return [];
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
            Top Batch
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
            Top Batch
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
            Top Batch
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
                {Math.round(getRegimeScore(dominantRegime.regime) * 100)} {dominantRegime.regime.replace(/_/g, ' ')}
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
                      {Math.round(getRegimeScore(pair.regime) * 100)} {pair.regime.replace(/_/g, ' ')}
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
