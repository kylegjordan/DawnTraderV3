/**
 * Pattern Scanning Tab — Phase 14.5 Batch 19C
 *
 * Displays pattern pool status, pairs, thresholds, and eligible strategies.
 * Data sourced from GET /api/pattern-pool endpoint.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PatternPoolPair {
  symbol: string;
  price: number;
  volume24h: number;
  dailyRange: number;
  firstSeen: string;
  lastUpdated: string;
  expiresAt: number;
}

interface PatternPoolData {
  patternPool: PatternPoolPair[];
  patternPoolSize: number;
  quantPoolSize: number;
  thresholds: {
    MIN_VOLUME_USD: number;
    LQ_MIN: number;
    VN_MAX: number;
    DI_TRENDING_MIN: number;
    RSI_MIN: number;
    RSI_MAX: number;
  };
  guardrails: {
    FINAL_SCORE_FLOOR: number;
    MAX_POSITION_PCT: number;
  };
  strategies: string[];
  globalRegime: {
    regime: string;
    avgScore: number;
    pairCount: number;
    percentage: number;
  } | null;
  regimeThresholdsActive: boolean;
  activeRegimeThresholds: Record<string, number> | null;
}

async function fetchPatternPool(): Promise<PatternPoolData> {
  const res = await fetch("/api/pattern-pool?mode=paper", { credentials: "include" });
  if (!res.ok) throw new Error(`Pattern pool fetch failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}

function formatTimeRemaining(expiresAt: number): string {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "Expired";
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function PatternScanning() {
  const { data, isLoading, error } = useQuery<PatternPoolData>({
    queryKey: ["/api/pattern-pool"],
    queryFn: fetchPatternPool,
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading pattern pool data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive text-sm">Failed to load pattern pool: {(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pattern Pool</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.patternPoolSize}</div>
            <p className="text-xs text-muted-foreground">pairs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Quant Pool</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.quantPoolSize}</div>
            <p className="text-xs text-muted-foreground">pairs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Global Regime</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">
              {data.globalRegime?.regime?.replace(/_/g, ' ') || 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.globalRegime ? `${data.globalRegime.percentage}% of ${data.globalRegime.pairCount} pairs` : 'No data'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Eligible Strategies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.strategies.length}</div>
            <p className="text-xs text-muted-foreground">pattern + hybrid</p>
          </CardContent>
        </Card>
      </div>

      {/* Pattern Pool Pairs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pattern Pool Pairs</CardTitle>
        </CardHeader>
        <CardContent>
          {data.patternPool.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No pairs in pattern pool. Pairs enter when they fail quant filters but pass relaxed pattern thresholds.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Volume 24h</TableHead>
                  <TableHead className="text-right">Range</TableHead>
                  <TableHead className="text-right">TTL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.patternPool.map((pair) => (
                  <TableRow key={pair.symbol}>
                    <TableCell className="font-medium">{pair.symbol}</TableCell>
                    <TableCell className="text-right">${pair.price.toFixed(pair.price < 1 ? 6 : 2)}</TableCell>
                    <TableCell className="text-right">{formatVolume(pair.volume24h)}</TableCell>
                    <TableCell className="text-right">{(pair.dailyRange * 100).toFixed(1)}%</TableCell>
                    <TableCell className="text-right text-xs">{formatTimeRemaining(pair.expiresAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Thresholds & Guardrails */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Pattern Pool Thresholds</CardTitle>
              {data.regimeThresholdsActive && (
                <Badge variant="secondary" className="text-xs">Regime-Adjusted</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="text-muted-foreground">Min Volume</TableCell>
                  <TableCell className="text-right font-mono">{formatVolume(data.thresholds.MIN_VOLUME_USD)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">vs $500K quant</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">Min LQ</TableCell>
                  <TableCell className="text-right font-mono">{data.thresholds.LQ_MIN}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">vs 35 quant</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">Max VN</TableCell>
                  <TableCell className="text-right font-mono">{data.thresholds.VN_MAX}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">vs 0.93 quant</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">Min DI</TableCell>
                  <TableCell className="text-right font-mono">{data.thresholds.DI_TRENDING_MIN}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">vs 55 quant</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">RSI Range</TableCell>
                  <TableCell className="text-right font-mono">{data.thresholds.RSI_MIN}-{data.thresholds.RSI_MAX}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">vs 30-70 quant</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Guardrails & Strategies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">FinalScore Floor</p>
              <p className="font-mono font-bold">{data.guardrails.FINAL_SCORE_FLOOR} <span className="text-xs text-muted-foreground font-normal">vs 0.35 quant</span></p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Max Position Size</p>
              <p className="font-mono font-bold">{(data.guardrails.MAX_POSITION_PCT * 100).toFixed(0)}% <span className="text-xs text-muted-foreground font-normal">vs 25% quant</span></p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Eligible Strategies</p>
              <div className="flex flex-wrap gap-1">
                {data.strategies.map((s) => (
                  <Badge key={s} variant="outline" className="text-xs font-mono">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
