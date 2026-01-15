/**
 * Directive 11.4H.5 Task 6 - Benchmark List Tab
 * Displays benchmark pairs (BTC, ETH, SOL, stablecoins) from the Ideal Pool
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Star, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BenchmarkPair {
  rank: number;
  symbol: string;
  score: number;
  signalType: string;
  strategy: string;
  pattern: string;
  regime: string;
  regimeScore?: number;
  source: 'simulation' | 'live';
  lastUpdated: string;
  frictionScore?: number;
  frictionLabel?: string;
  frictionColor?: 'green' | 'yellow' | 'orange' | 'red';
  isBenchmark?: boolean;
  poolType?: 'BENCHMARK' | 'STANDARD';
}

interface BenchmarkResponse {
  pairs: BenchmarkPair[];
  globalRegime: {
    regime: string;
    regimeScore: number;
    pairCount: number;
    percentage: number;
  } | null;
}

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return timeStr;
  } catch {
    return '-';
  }
}

function getScoreColor(score: number): string {
  if (score >= 0.7) return "text-green-500 bg-green-500/10";
  if (score >= 0.5) return "text-yellow-500 bg-yellow-500/10";
  return "text-red-500 bg-red-500/10";
}

function getRegimeBadgeClass(regime: string): string {
  switch (regime) {
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

export default function BenchmarkList() {
  const { data, isLoading, error, refetch } = useQuery<BenchmarkResponse>({
    queryKey: ['/api/pairs/ranked', 'benchmark'],
    queryFn: async () => {
      const response = await fetch('/api/pairs/ranked?limit=100&pool=benchmark', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch benchmark pairs');
      return response.json();
    },
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const pairs = data?.pairs ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Benchmark Pairs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-12 bg-muted rounded" />
            ))}
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
            <Star className="h-5 w-5 text-yellow-500" />
            Benchmark Pairs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Error loading benchmark pairs</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              Benchmark Pairs
            </CardTitle>
            <CardDescription className="mt-1">
              BTC, ETH, SOL, and major stablecoins in the Ideal Pool ({pairs.length} pairs)
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {pairs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <TrendingUp className="w-8 h-8 mb-2 opacity-50" />
            <p>No benchmark pairs in Ideal Pool yet</p>
            <p className="text-xs mt-1">Benchmark pairs will appear here once they build telemetry history</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">Rank</th>
                  <th className="text-left py-2 pr-4">Symbol</th>
                  <th className="text-left py-2 pr-4">Score</th>
                  <th className="text-left py-2 pr-4">Signal</th>
                  <th className="text-left py-2 pr-4">Strategy</th>
                  <th className="text-left py-2 pr-4">Regime</th>
                  <th className="text-left py-2 pr-4">Friction</th>
                  <th className="text-left py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((pair) => (
                  <tr key={pair.symbol} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="py-3 pr-4">
                      <span className="font-mono text-muted-foreground">
                        {(() => {
                          const rankValue = Number(pair.rank);
                          const hasValidScore = pair.score > 0;
                          const isScanned = pair.signalType !== 'Awaiting Scan' && pair.signalType !== 'HYBRID';
                          const hasValidRank = Number.isFinite(rankValue) && rankValue > 0;
                          return hasValidRank && hasValidScore && isScanned
                            ? `#${Math.round(rankValue)}`
                            : '—';
                        })()}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Star className="h-3 w-3 text-yellow-500" />
                        <span className="font-mono font-medium">{pair.symbol}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={cn("font-mono px-2 py-0.5 rounded", getScoreColor(pair.score))}>
                        {pair.score.toFixed(3)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant="secondary" className="text-xs">
                        {pair.signalType}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-xs">{pair.strategy || '-'}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant="outline" className={cn("text-xs", getRegimeBadgeClass(pair.regime))}>
                        {pair.regimeScore !== undefined ? Math.round(pair.regimeScore) : '-'} {pair.regime.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      {pair.frictionLabel && pair.frictionColor ? (
                        <Badge variant="outline" className={cn("text-xs", getFrictionBadgeClass(pair.frictionColor))}>
                          {pair.frictionScore} {pair.frictionLabel}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-3">
                      <span className="text-xs text-muted-foreground">{formatTimestamp(pair.lastUpdated)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
