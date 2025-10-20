import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ScanSearch } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";

interface FilterBreakdown {
  failed_min_volume: number;
  failed_spread: number;
  failed_daily_range: number;
  failed_min_price: number;
  failed_stablecoin: number;
  failed_quote_currency: number;
  failed_blacklist: number;
  failed_whitelist: number;
  failed_history: number;
  failed_guardrail_risk: number;
  strategy_none_triggered: number;
}

interface CandidateSnapshot {
  symbol: string;
  reasons: string[];
  snapshot: {
    price: number;
    spread_bps: number;
    vol_24h: number;
    daily_range: number;
  };
}

interface UniverseScanResult {
  mode: string;
  universe_count: number;
  evaluated: number;
  eligible_count: number;
  ineligible_count: number;
  breakdown: FilterBreakdown;
  top_candidates: CandidateSnapshot[];
  ts: string;
}

export default function PaperSimDiagnostic() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<UniverseScanResult | null>(null);
  const { toast } = useToast();
  const { role } = useUserRole();

  // Only show for admins/owners
  if (role !== 'admin' && role !== 'owner') {
    return null;
  }

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const result = await apiRequest('GET', '/api/paper-sim/diagnostics/scan?mode=paper&limit=500&trace=true&strategies=true');
      setScanResult(result);
      
      toast({
        title: "Scan Complete",
        description: `Evaluated ${result.evaluated} pairs, found ${result.eligible_count} eligible`,
      });
    } catch (error: any) {
      toast({
        title: "Scan Failed",
        description: error.message || "Failed to perform universe scan",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Card data-testid="paper-sim-diagnostic">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanSearch className="w-5 h-5" />
          PaperSim Universe Scan Diagnostics
        </CardTitle>
        <CardDescription>
          Phase 27.F.12: Read-only diagnostic to verify end-to-end filtering pipeline without starting engines
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={handleScan} 
            disabled={isScanning}
            data-testid="button-run-scan"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scanning Universe...
              </>
            ) : (
              <>
                <ScanSearch className="w-4 h-4 mr-2" />
                Run Universe Scan
              </>
            )}
          </Button>
        </div>

        {scanResult && (
          <div className="space-y-4" data-testid="scan-results">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-2xl font-bold text-foreground">{scanResult.universe_count}</div>
                <div className="text-sm text-muted-foreground">Kraken Pairs</div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-2xl font-bold text-foreground">{scanResult.evaluated}</div>
                <div className="text-sm text-muted-foreground">Evaluated</div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{scanResult.eligible_count}</div>
                <div className="text-sm text-muted-foreground">Eligible</div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{scanResult.ineligible_count}</div>
                <div className="text-sm text-muted-foreground">Filtered Out</div>
              </div>
            </div>

            {/* Filter Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Filter Breakdown</CardTitle>
                <CardDescription>Reasons why pairs were excluded</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                    <span className="text-sm">Min Volume</span>
                    <Badge variant="secondary">{scanResult.breakdown.failed_min_volume}</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                    <span className="text-sm">Spread</span>
                    <Badge variant="secondary">{scanResult.breakdown.failed_spread}</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                    <span className="text-sm">Daily Range</span>
                    <Badge variant="secondary">{scanResult.breakdown.failed_daily_range}</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                    <span className="text-sm">History</span>
                    <Badge variant="secondary">{scanResult.breakdown.failed_history}</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                    <span className="text-sm">Quote Currency</span>
                    <Badge variant="secondary">{scanResult.breakdown.failed_quote_currency}</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                    <span className="text-sm">Guardrail Risk</span>
                    <Badge variant="secondary">{scanResult.breakdown.failed_guardrail_risk}</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                    <span className="text-sm">No Strategy</span>
                    <Badge variant="secondary">{scanResult.breakdown.strategy_none_triggered}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top Candidates */}
            {scanResult.top_candidates.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top Candidates</CardTitle>
                  <CardDescription>Pairs that passed all filters with strategy signals</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>24h Volume</TableHead>
                        <TableHead>Daily Range</TableHead>
                        <TableHead>Spread (bps)</TableHead>
                        <TableHead>Signals</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scanResult.top_candidates.map((candidate) => (
                        <TableRow key={candidate.symbol}>
                          <TableCell className="font-medium">{candidate.symbol}</TableCell>
                          <TableCell>${candidate.snapshot.price.toFixed(2)}</TableCell>
                          <TableCell>${(candidate.snapshot.vol_24h / 1000000).toFixed(2)}M</TableCell>
                          <TableCell>{candidate.snapshot.daily_range.toFixed(2)}%</TableCell>
                          <TableCell>{candidate.snapshot.spread_bps.toFixed(1)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {candidate.reasons.map((reason, idx) => (
                                <Badge 
                                  key={idx} 
                                  variant={reason.startsWith('guardrail:') ? 'destructive' : 'default'}
                                  className="text-xs"
                                >
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Scan Info */}
            <div className="text-xs text-muted-foreground">
              Scan completed at: {new Date(scanResult.ts).toLocaleString()}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
