import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTrading } from "@/hooks/use-trading";
import { Copy, RefreshCw, CheckCircle2, XCircle, Loader2, FileJson } from "lucide-react";
import type { ConfigSnapshot } from "../../../types/config";

export function ConfigSnapshotViewer() {
  const { toast } = useToast();
  const { tradingStatus } = useTrading();
  const [selectedMode, setSelectedMode] = useState<'paper' | 'live'>(
    (tradingStatus?.mode as 'paper' | 'live') || 'paper'
  );

  const { data: snapshot, isLoading, error, refetch } = useQuery<ConfigSnapshot>({
    queryKey: ['/api/diagnostics/config-snapshot', selectedMode],
    queryFn: async () => {
      const response = await fetch(`/api/diagnostics/config-snapshot?mode=${selectedMode}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch config snapshot');
      }
      return response.json();
    },
  });

  const handleCopyToClipboard = () => {
    if (!snapshot) return;
    
    navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    toast({
      title: "Copied to clipboard",
      description: `Config snapshot for ${selectedMode} mode copied successfully.`,
    });
  };

  const handleRefresh = () => {
    refetch();
    toast({
      title: "Refreshing...",
      description: "Fetching latest config snapshot.",
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Configuration Snapshot
          </CardTitle>
          <CardDescription>
            Real-time view of current system configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
            <FileJson className="h-5 w-5" />
            Configuration Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load config snapshot: {(error as Error).message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5" />
              Configuration Snapshot
            </CardTitle>
            <CardDescription>
              Real-time view of current system configuration with audit verification
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              data-testid="button-refresh-snapshot"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyToClipboard}
              data-testid="button-copy-snapshot"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy JSON
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mode Selector */}
        <div className="flex gap-2">
          <Button
            variant={selectedMode === 'paper' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedMode('paper')}
            data-testid="button-mode-paper"
          >
            Paper Mode
          </Button>
          <Button
            variant={selectedMode === 'live' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedMode('live')}
            data-testid="button-mode-live"
          >
            Live Mode
          </Button>
        </div>

        {/* Audit Status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Audit Status</div>
            <div className="flex items-center gap-2">
              {snapshot?.legacyReads === 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    PASSED
                  </Badge>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-500" />
                  <Badge variant="destructive">FAILED</Badge>
                </>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Legacy Field Access</div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold" data-testid="text-legacy-reads">
                {snapshot?.legacyReads ?? 0}
              </span>
              <span className="text-sm text-muted-foreground">reads</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Schema Hash</div>
            <div className="font-mono text-sm" data-testid="text-schema-hash">
              {snapshot?.schemaHash?.substring(0, 16)}...
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Timestamp</div>
            <div className="text-sm text-muted-foreground">
              {snapshot?.timestamp ? new Date(snapshot.timestamp).toLocaleString() : 'N/A'}
            </div>
          </div>
        </div>

        {/* Config Details Tabs */}
        <Tabs defaultValue="guardrails" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="guardrails" data-testid="tab-guardrails">
              Guardrails ({snapshot?.guardrails ? '4' : '0'})
            </TabsTrigger>
            <TabsTrigger value="filters" data-testid="tab-filters">
              Filters ({snapshot?.filters ? '16' : '0'})
            </TabsTrigger>
            <TabsTrigger value="goals" data-testid="tab-goals">
              Goals ({snapshot?.goals ? '3' : '0'})
            </TabsTrigger>
            <TabsTrigger value="provenance" data-testid="tab-provenance">
              Provenance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="guardrails" className="space-y-2">
            {snapshot?.guardrails ? (
              <div className="space-y-3">
                <ConfigField
                  label="Portfolio Risk per Trade"
                  value={`${snapshot.guardrails.portfolioRiskPerTradePct}%`}
                  testId="field-portfolio-risk"
                />
                <ConfigField
                  label="Symbol Cooldown"
                  value={`${snapshot.guardrails.symbolCooldownMinutes} min`}
                  testId="field-cooldown"
                />
                <ConfigField
                  label="Max Open Positions"
                  value={snapshot.guardrails.maxOpenPositions.toString()}
                  testId="field-max-positions"
                />
                <ConfigField
                  label="Daily Loss Kill Switch"
                  value={`${snapshot.guardrails.dailyLossKillSwitchPct}%`}
                  testId="field-kill-switch"
                />
              </div>
            ) : (
              <Alert>
                <AlertDescription>No guardrails configured for {selectedMode} mode</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="filters" className="space-y-2">
            {snapshot?.filters ? (
              <div className="grid grid-cols-2 gap-3">
                <ConfigField label="Min Volume" value={snapshot.filters.minVolume.toLocaleString()} />
                <ConfigField label="Min Liquidity" value={snapshot.filters.minLiquidity.toLocaleString()} />
                <ConfigField label="Min Price" value={`$${snapshot.filters.minPrice}`} />
                <ConfigField label="Max Price" value={`$${snapshot.filters.maxPrice}`} />
                <ConfigField label="Min Market Cap" value={snapshot.filters.minMarketCap.toLocaleString()} />
                <ConfigField label="Max Bid-Ask Spread" value={`${snapshot.filters.maxBidAskSpread}%`} />
                <ConfigField label="RSI Min" value={snapshot.filters.rsiMin.toString()} />
                <ConfigField label="RSI Max" value={snapshot.filters.rsiMax.toString()} />
                <ConfigField label="Volatility Min" value={`${snapshot.filters.volatilityMin}%`} />
                <ConfigField label="Volatility Max" value={`${snapshot.filters.volatilityMax}%`} />
                <ConfigField label="Exclude Stablecoins" value={snapshot.filters.excludeStablecoins ? 'Yes' : 'No'} />
                <ConfigField label="Regulated Only" value={snapshot.filters.allowRegulatedOnly ? 'Yes' : 'No'} />
                <ConfigField label="Universe Size" value={snapshot.filters.universeSize.toString()} />
                <ConfigField label="Quote Currencies" value={snapshot.filters.quoteCurrencies.join(', ')} />
                <ConfigField label="Active Timeframes" value={snapshot.filters.activeTimeframes.join(', ')} />
                <ConfigField label="Confidence Threshold" value={`${snapshot.filters.confidenceThreshold}%`} />
              </div>
            ) : (
              <Alert>
                <AlertDescription>No filters configured for {selectedMode} mode</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="goals" className="space-y-2">
            {snapshot?.goals ? (
              <div className="space-y-3">
                <ConfigField
                  label="Active Preset"
                  value={snapshot.goals.activePreset}
                  testId="field-active-preset"
                />
                <ConfigField
                  label="Target Daily Avg Earning"
                  value={`${snapshot.goals.targetDailyAvgEarningPct}%`}
                  testId="field-target-earning"
                />
                <ConfigField
                  label="Trades per Day (Est.)"
                  value={snapshot.goals.tradesPerDayEst.toString()}
                  testId="field-trades-per-day"
                />
              </div>
            ) : (
              <Alert>
                <AlertDescription>No goals configured for {selectedMode} mode</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="provenance" className="space-y-4">
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium mb-2">Guardrails Source</div>
                <div className="bg-muted p-3 rounded-md">
                  <div className="font-mono text-xs">
                    <div>Table: {snapshot?.provenance.guardrails_source}</div>
                    <div className="mt-1 text-muted-foreground">
                      Columns: {snapshot?.provenance.guardrails_columns.join(', ')}
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">Filters Source</div>
                <div className="bg-muted p-3 rounded-md">
                  <div className="font-mono text-xs">
                    <div>Table: {snapshot?.provenance.filters_source}</div>
                    <div className="mt-1 text-muted-foreground">
                      Columns: {snapshot?.provenance.filters_columns.join(', ')}
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">Goals Source</div>
                <div className="bg-muted p-3 rounded-md">
                  <div className="font-mono text-xs">
                    <div>Table: {snapshot?.provenance.goals_source}</div>
                    <div className="mt-1 text-muted-foreground">
                      Columns: {snapshot?.provenance.goals_columns.join(', ')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Raw JSON Preview */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Raw JSON (Preview)</div>
          <pre className="bg-muted p-4 rounded-md overflow-x-auto text-xs font-mono max-h-64 overflow-y-auto">
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigField({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
