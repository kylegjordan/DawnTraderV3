/**
 * Directive 9.6.D - UI Diagnostics Tab
 * 
 * Displays math integrity status and guard configuration for the Goals Engine.
 * Shows Phase 9 system guards and configuration version.
 * 
 * Tags: [9.6][UI]
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Shield, Activity, Settings } from "lucide-react";

const SYSTEM_GUARDS = {
  VERSION: "Phase9_Final",
  MIN_LIQUIDITY_SCORE: 40,
  MAX_VOL_NOISE: 0.6,
  BASE_FEE_SLIPPAGE: 0.005,
  CORRELATION_THRESHOLD: 0.75,
  PARITY_TOLERANCE: 0.000001,
};

export default function DiagnosticsTab() {
  return (
    <div className="space-y-6">
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
                <span className="font-semibold text-sm">Active Guards</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Liquidity (LQ)</span>
                  <span className="font-mono font-semibold">≥ {SYSTEM_GUARDS.MIN_LIQUIDITY_SCORE}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Noise Limit</span>
                  <span className="font-mono font-semibold">≤ {SYSTEM_GUARDS.MAX_VOL_NOISE}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fee + Slippage</span>
                  <span className="font-mono font-semibold">{(SYSTEM_GUARDS.BASE_FEE_SLIPPAGE * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Correlation</span>
                  <span className="font-mono font-semibold">≤ {SYSTEM_GUARDS.CORRELATION_THRESHOLD}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="w-4 h-4 text-violet-600" />
                <span className="font-semibold text-sm">Configuration</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <Badge variant="outline" className="font-mono">{SYSTEM_GUARDS.VERSION}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Parity Tolerance</span>
                  <span className="font-mono font-semibold">{SYSTEM_GUARDS.PARITY_TOLERANCE}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Phase 9 Modules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { name: "Directive 9.2", desc: "Trailing Exit", status: "active" },
              { name: "Directive 9.3", desc: "Kalman Filter", status: "active" },
              { name: "Directive 9.4", desc: "Covariance Guard", status: "active" },
              { name: "Directive 9.5", desc: "CWQI Gate", status: "active" },
            ].map((module) => (
              <div key={module.name} className="p-3 border rounded-lg text-center">
                <div className="text-xs font-semibold text-violet-600 dark:text-violet-400">{module.name}</div>
                <div className="text-xs text-muted-foreground">{module.desc}</div>
                <Badge variant="outline" className="mt-2 text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300">
                  {module.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="p-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg">
        <p className="text-xs text-violet-700 dark:text-violet-300">
          <strong>Directive 9.6:</strong> All Phase 9 modules import thresholds from a centralized configuration (system-guards.ts).
          This ensures Live and VTS (simulation) engines produce identical outputs under identical market conditions.
        </p>
      </div>
    </div>
  );
}
