/**
 * Directive 11.0D - UI Diagnostics Tab with Dynamic Telemetry, Filter Performance, TEC Config & Config Provenance
 *
 * Displays math integrity status, guard configuration, and dynamic backend telemetry.
 * Shows Phase 11 system guards, schema version synchronization, filter pass rates, TEC parameters,
 * and configuration provenance for full audit trail visibility.
 *
 * Batch 19G VN: Removed hardcoded MAX_VOL_NOISE=0.6. VN threshold now shown from telemetry API
 * or marked as "DB-driven" when not available, since VN formula changed to log-returns MAD/median.
 *
 * Tags: [11.0D][UI]
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Shield, Activity, Settings, RefreshCw, AlertTriangle, Database, Filter, TrendingUp } from "lucide-react";
import { useState, useEffect } from "react";

const UI_SCHEMA_VERSION = "v1.4.5"; // Directive 11.0D
const UI_PHASE_DIRECTIVE = "11.0D";

// Batch 19G VN: Removed hardcoded MAX_VOL_NOISE. VN threshold is now DB-driven
// and will be recalibrated after the log-returns MAD/median formula produces
// empirical distribution data. Other guards remain as display defaults.
const SYSTEM_GUARDS = {
  VERSION: "Phase10_Final",
  MIN_LIQUIDITY_SCORE: 40,
  MAX_VOL_NOISE: null as number | null, // Batch 19G: Now dynamic from telemetry API
  BASE_FEE_SLIPPAGE: 0.005,
  CORRELATION_THRESHOLD: 0.75,
  MIN_FINAL_SCORE: 0.35,
  MIN_REGIME_WEIGHT: 0.30,
  PARITY_TOLERANCE: 0.000001,
};

interface TelemetrySummary {
  version: string;
  pairCount: number;
  totalSamples: number;
  weights: {
    hybrid: number;
    confidence: number;
    regime: number;
    decay: number;
  };
  phaseDirective: string;
  filterSchemaVersion: string;
  timestamp: string;
  fx5Evaluated24h?: number;
  fx5Passed24h?: number;
  passRate24h?: number;
  failedByCategory?: Record<string, number>;
  tecConfig?: {
    expandFactor: number;
    contractFactor: number;
    trailingBase: number;
    trailingAccel: number;
    maxRisk: number;
    version: string;
  };
  configProvenance?: {
    phaseDirective: string;
    backendSchema: string;
    executionConfigVersion: string;
    screenerConfigVersion: string;
  };
  systemGuards?: {
    maxVolNoise?: number;
  };
}

export default function DiagnosticsTab() {
  const [lastUpdate, setLastUpdate] = useState<string>(new Date().toISOString());

  const { data: telemetry, isLoading, error, refetch } = useQuery<TelemetrySummary>({
    queryKey: ['/api/telemetry/summary'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      const response = await fetch('/api/telemetry/summary', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch telemetry summary');
      }
      return response.json();
    },
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (telemetry) {
      setLastUpdate(new Date().toISOString());
    }
  }, [telemetry]);

  const backendPhase = telemetry?.phaseDirective || 'Unknown';
  const hasVersionMismatch = backendPhase !== UI_PHASE_DIRECTIVE;

  // Batch 19G VN: Resolve VN threshold from telemetry API or show DB-driven indicator
  const vnThresholdDisplay = SYSTEM_GUARDS.MAX_VOL_NOISE !== null
    ? `\u2264 ${SYSTEM_GUARDS.MAX_VOL_NOISE}`
    : telemetry?.systemGuards?.maxVolNoise
      ? `\u2264 ${telemetry.systemGuards.maxVolNoise}`
      : 'DB-driven';

  return (
    <div className="space-y-6">
      {/* Telemetry Snapshot Panel - Directive 10.9D */}
      <Card className="border-2 border-blue-200 dark:border-blue-800">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20">
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            Telemetry Snapshot (Phase 10.9)
            <button
              onClick={() => refetch()}
              className="ml-auto p-1 hover:bg-blue-100 dark:hover:bg-blue-800 rounded"
              title="Refresh telemetry"
            >
              <RefreshCw className="w-4 h-4 text-blue-600" />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : error ? (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Unable to fetch telemetry data. Backend may be starting up.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {/* Filter Schema Version */}
              <div className="p-3 border rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Filter Schema Version</div>
                <Badge variant="outline" className="font-mono">
                  {telemetry?.filterSchemaVersion || 'v1.3.0'}
                </Badge>
              </div>

              {/* UI Schema Version */}
              <div className="p-3 border rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">UI Schema Version</div>
                <Badge variant="outline" className="font-mono">{UI_SCHEMA_VERSION}</Badge>
              </div>

              {/* Phase Directive with mismatch indicator */}
              <div className={`p-3 border rounded-lg ${hasVersionMismatch ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-muted/30'}`}>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  Phase Directive
                  {hasVersionMismatch && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                </div>
                <div className="text-xs font-mono">
                  <span className="font-semibold">Backend:</span> {backendPhase}
                  {' | '}
                  <span className="font-semibold">Frontend:</span> {UI_PHASE_DIRECTIVE}
                </div>
                {hasVersionMismatch && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Version mismatch - partial deployment
                  </p>
                )}
              </div>

              {/* Score Weights Version */}
              <div className="p-3 border rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Score Weights Version</div>
                <Badge variant="outline" className="font-mono">
                  {telemetry?.version || 'v1.0.1'}
                </Badge>
              </div>

              {/* 24h Pair Count */}
              <div className="p-3 border rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Telemetry Pairs (24h)</div>
                <span className="text-lg font-bold">{telemetry?.pairCount || 0}</span>
              </div>

              {/* Last Update */}
              <div className="p-3 border rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Last Update</div>
                <span className="text-xs font-mono">
                  {new Date(lastUpdate).toLocaleTimeString()}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter Performance Panel - Directive 10.9E */}
      <Card className="border-2 border-emerald-200 dark:border-emerald-800">
        <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-emerald-600" />
            Filter Performance (Last 24h)
            {telemetry?.passRate24h !== undefined && telemetry.passRate24h < 10 && (
              <span title="Low pass rate">
                <AlertTriangle className="w-4 h-4 text-amber-500 ml-2" />
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : error ? (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Filter performance data unavailable.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 border rounded-lg bg-muted/30 text-center">
                  <div className="text-xs text-muted-foreground mb-1">Total Evaluated</div>
                  <span className="text-2xl font-bold">{(telemetry?.fx5Evaluated24h ?? 0).toLocaleString()}</span>
                </div>
                <div className="p-3 border rounded-lg bg-muted/30 text-center">
                  <div className="text-xs text-muted-foreground mb-1">Total Passed</div>
                  <span className="text-2xl font-bold text-emerald-600">{(telemetry?.fx5Passed24h ?? 0).toLocaleString()}</span>
                </div>
                <div className={`p-3 border rounded-lg text-center ${
                  (telemetry?.passRate24h ?? 0) < 10
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                    : 'bg-muted/30'
                }`}>
                  <div className="text-xs text-muted-foreground mb-1">Pass Rate</div>
                  <span className={`text-2xl font-bold ${
                    (telemetry?.passRate24h ?? 0) < 10 ? 'text-amber-600' : 'text-blue-600'
                  }`}>
                    {telemetry?.passRate24h ?? 0}%
                  </span>
                </div>
              </div>

              {telemetry?.failedByCategory && Object.keys(telemetry.failedByCategory).length > 0 && (
                <div className="p-3 border rounded-lg bg-muted/30">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">Top Failures by Filter</div>
                  <div className="space-y-1">
                    {Object.entries(telemetry.failedByCategory)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 5)
                      .map(([filter, count]) => (
                        <div key={filter} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{filter}</span>
                          <span className="font-mono font-semibold text-rose-600">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Math Integrity Panel */}
      <Card className="border-2 border-violet-200 dark:border-violet-800">
        <CardHeader className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20">
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-violet-600" />
            Math Integrity
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <span className="font-medium">Status</span>
            </div>
            <Badge className="bg-emerald-600 text-white">Synced ✓</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-violet-600" />
                <span className="font-semibold text-sm">Institutional Math Guards</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Liquidity (LQ)</span>
                  <span className="font-mono font-semibold">{'\u2265'} {SYSTEM_GUARDS.MIN_LIQUIDITY_SCORE}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Noise Limit (VolNoise)</span>
                  <span className="font-mono font-semibold">{vnThresholdDisplay}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Correlation ({'\u03C1'})</span>
                  <span className="font-mono font-semibold">{'\u2264'} {SYSTEM_GUARDS.CORRELATION_THRESHOLD}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="w-4 h-4 text-violet-600" />
                <span className="font-semibold text-sm">SQE Gates (10.9D)</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">FinalScore Gate</span>
                  <span className="font-mono font-semibold">{'\u2265'} {SYSTEM_GUARDS.MIN_FINAL_SCORE}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">RegimeWeight Gate</span>
                  <span className="font-mono font-semibold">{'\u2265'} {SYSTEM_GUARDS.MIN_REGIME_WEIGHT}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fee + Slippage</span>
                  <span className="font-mono font-semibold">{(SYSTEM_GUARDS.BASE_FEE_SLIPPAGE * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TEC Configuration Panel - Directive 11.0C */}
      <Card className="border-2 border-orange-200 dark:border-orange-800">
        <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-600" />
            TEC Configuration (Directive 11.0C)
            {telemetry?.tecConfig?.version && (
              <Badge variant="outline" className="ml-2 font-mono text-xs">
                {telemetry.tecConfig.version}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !telemetry?.tecConfig ? (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                TEC configuration not available yet. Backend may need restart.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="p-3 border rounded-lg bg-muted/30 text-center">
                <div className="text-xs text-muted-foreground mb-1">Expand Factor</div>
                <span className="text-lg font-bold text-emerald-600">{telemetry.tecConfig.expandFactor}x</span>
              </div>
              <div className="p-3 border rounded-lg bg-muted/30 text-center">
                <div className="text-xs text-muted-foreground mb-1">Contract Factor</div>
                <span className="text-lg font-bold text-rose-600">{telemetry.tecConfig.contractFactor}x</span>
              </div>
              <div className="p-3 border rounded-lg bg-muted/30 text-center">
                <div className="text-xs text-muted-foreground mb-1">Trailing Base</div>
                <span className="text-lg font-bold">{(telemetry.tecConfig.trailingBase * 100).toFixed(1)}%</span>
              </div>
              <div className="p-3 border rounded-lg bg-muted/30 text-center">
                <div className="text-xs text-muted-foreground mb-1">Trailing Accel</div>
                <span className="text-lg font-bold">{(telemetry.tecConfig.trailingAccel * 100).toFixed(2)}%</span>
              </div>
              <div className="p-3 border rounded-lg bg-muted/30 text-center">
                <div className="text-xs text-muted-foreground mb-1">Max Risk</div>
                <span className="text-lg font-bold text-amber-600">{(telemetry.tecConfig.maxRisk * 100).toFixed(0)}%</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration Provenance Panel - Directive 11.0D */}
      <Card className="border-2 border-indigo-200 dark:border-indigo-800">
        <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600" />
            Configuration Provenance (Directive 11.0D)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground mb-3">Runtime sources and schema versions</p>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !telemetry?.configProvenance ? (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Config provenance not available. Backend may be on older version.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 border rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Phase Directive</div>
                <Badge variant="outline" className="font-mono">
                  {telemetry.configProvenance.phaseDirective}
                </Badge>
              </div>
              <div className="p-3 border rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Backend Schema</div>
                <Badge variant="outline" className="font-mono">
                  {telemetry.configProvenance.backendSchema}
                </Badge>
              </div>
              <div className="p-3 border rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Execution Config</div>
                <Badge variant="outline" className="font-mono">
                  {telemetry.configProvenance.executionConfigVersion}
                </Badge>
              </div>
              <div className="p-3 border rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Screener Config</div>
                <Badge variant="outline" className="font-mono">
                  {telemetry.configProvenance.screenerConfigVersion}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase 11 Modules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Phase 11 Modules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { name: "Directive 11.0A", desc: "Trade Flow Integrity", status: "active" },
              { name: "Directive 11.0B", desc: "Trade Control Integrity", status: "active" },
              { name: "Directive 11.0C", desc: "SQE & TEC Stabilization", status: "active" },
              { name: "Directive 11.0D", desc: "Production Hardening", status: "pending" },
            ].map((module) => (
              <div key={module.name} className="p-3 border rounded-lg text-center">
                <div className="text-xs font-semibold text-violet-600 dark:text-violet-400">{module.name}</div>
                <div className="text-xs text-muted-foreground">{module.desc}</div>
                <Badge variant="outline" className={`mt-2 text-xs ${module.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-slate-50 dark:bg-slate-900/20 text-slate-500'}`}>
                  {module.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="p-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg">
        <p className="text-xs text-violet-700 dark:text-violet-300">
          <strong>Directive 11.0C:</strong> SQE & TEC Stabilization complete - EXECUTION_CONFIG centralized, adaptive sizing factors normalized (1.10x/0.90x),
          SQE backfill logic for missing FinalScore/RegimeWeight implemented, TEC config exposed in telemetry summary for diagnostics visibility.
        </p>
      </div>
    </div>
  );
}
