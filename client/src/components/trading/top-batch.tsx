import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, TrendingUp, Activity, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface RankedPair {
  rank: number;
  symbol: string;
  score: number;
  signalType: string;
  strategy: string;
  pattern: string;
  regime: string;
  source: 'simulation' | 'live';
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

export default function TopBatch() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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
      setLastUpdated(new Date());
    }
  }, [data]);

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
            {lastUpdated && (
              <span>Updated: {lastUpdated.toLocaleTimeString()}</span>
            )}
            <button 
              onClick={() => refetch()}
              className="p-1 hover:bg-muted rounded"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Rank</th>
                <th className="pb-2 pr-4 font-medium">Symbol</th>
                <th className="pb-2 pr-4 font-medium">Score</th>
                <th className="pb-2 pr-4 font-medium">Signal Type</th>
                <th className="pb-2 pr-4 font-medium">Strategy</th>
                <th className="pb-2 pr-4 font-medium">Pattern</th>
                <th className="pb-2 pr-4 font-medium">Regime</th>
                <th className="pb-2 pr-4 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((pair) => (
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
                      {pair.regime.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">
                    <Badge variant={pair.source === 'live' ? 'default' : 'secondary'}>
                      {pair.source === 'live' ? 'Active Trading' : 'Simulation'}
                    </Badge>
                  </td>
                </tr>
              ))}
              {pairs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    No ranked pairs available yet. Waiting for telemetry data...
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
