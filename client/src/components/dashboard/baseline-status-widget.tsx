/**
 * LATTI Baseline Status Widget
 * Phase 27.F.14.B - Task 3: Fee-Aware Metrics Display
 * 
 * Displays baseline establishment status and key net metrics
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBaselineStatus } from "@/hooks/use-baseline-status";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { CheckCircle2, Clock, TrendingUp, DollarSign, Target } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function BaselineStatusWidget() {
  const { mode } = useTradingMode();
  const { data: baselineStatus, isLoading } = useBaselineStatus({
    enabled: mode === 'paper' // Only fetch in paper mode
  });

  if (mode !== 'paper') {
    return null; // Don't show in live mode
  }

  if (isLoading) {
    return (
      <Card data-testid="baseline-status-widget-loading">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="w-5 h-5" />
            LATTI Baseline Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const { snapshot, progress } = baselineStatus || {};
  const isEstablished = snapshot?.established || false;

  // Calculate progress percentage
  const tradesProgress = progress ? (progress.closedTrades / progress.targetTrades) * 100 : 0;
  const timeProgress = progress ? (progress.runtimeHours / progress.targetHours) * 100 : 0;
  const overallProgress = Math.min(Math.max(tradesProgress, timeProgress), 100);

  return (
    <Card data-testid="baseline-status-widget">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="w-5 h-5" />
            LATTI Baseline
          </CardTitle>
          {isEstablished ? (
            <Badge variant="default" className="bg-green-600" data-testid="baseline-badge-established">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Established
            </Badge>
          ) : (
            <Badge variant="secondary" data-testid="baseline-badge-pending">
              <Clock className="w-3 h-3 mr-1" />
              Pending ({Math.round(overallProgress)}%)
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          {isEstablished 
            ? 'Parameters ready for manual copy to Live mode'
            : 'Building reliable baseline from paper trading data'
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isEstablished && snapshot ? (
          <div className="grid grid-cols-2 gap-3">
            {/* Win Rate */}
            <div className="space-y-1" data-testid="baseline-metric-winrate">
              <div className="text-xs text-muted-foreground">Win Rate</div>
              <div className="text-lg font-semibold text-foreground flex items-center gap-1">
                <TrendingUp className="w-4 h-4 text-green-600" />
                {(snapshot.winRate * 100).toFixed(1)}%
              </div>
            </div>

            {/* Net Profit Per Trade (Maker) */}
            <div className="space-y-1" data-testid="baseline-metric-net-profit-maker">
              <div className="text-xs text-muted-foreground">Net P/L (Maker)</div>
              <div className={`text-lg font-semibold flex items-center gap-1 ${
                snapshot.avgNetProfitMaker >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                <DollarSign className="w-4 h-4" />
                {snapshot.avgNetProfitMaker >= 0 ? '+' : ''}{snapshot.avgNetProfitMaker.toFixed(2)}
              </div>
            </div>

            {/* Profit Factor */}
            <div className="space-y-1" data-testid="baseline-metric-profit-factor">
              <div className="text-xs text-muted-foreground">Profit Factor</div>
              <div className="text-lg font-semibold text-foreground">
                {snapshot.profitFactor.toFixed(2)}x
              </div>
            </div>

            {/* Net Profit Per Trade (Taker) */}
            <div className="space-y-1" data-testid="baseline-metric-net-profit-taker">
              <div className="text-xs text-muted-foreground">Net P/L (Taker)</div>
              <div className={`text-lg font-semibold flex items-center gap-1 ${
                snapshot.avgNetProfitTaker >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                <DollarSign className="w-4 h-4" />
                {snapshot.avgNetProfitTaker >= 0 ? '+' : ''}{snapshot.avgNetProfitTaker.toFixed(2)}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Progress bars */}
            <div data-testid="baseline-progress-trades">
              <div className="text-xs text-muted-foreground mb-1">
                Closed Trades: {progress?.closedTrades || 0} / {progress?.targetTrades || 150}
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(tradesProgress, 100)}%` }}
                />
              </div>
            </div>

            <div data-testid="baseline-progress-runtime">
              <div className="text-xs text-muted-foreground mb-1">
                Runtime: {(progress?.runtimeHours || 0).toFixed(1)}h / {progress?.targetHours || 24}h
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(timeProgress, 100)}%` }}
                />
              </div>
            </div>

            {/* Stability checks */}
            {progress && (
              <div className="pt-2 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    progress.stabilityCheck === 'passed' ? 'bg-green-600' :
                    progress.stabilityCheck === 'failed' ? 'bg-red-600' : 'bg-gray-400'
                  }`} />
                  <span className="text-muted-foreground">Stability Check</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    progress.safetyCheck === 'passed' ? 'bg-green-600' :
                    progress.safetyCheck === 'failed' ? 'bg-red-600' : 'bg-gray-400'
                  }`} />
                  <span className="text-muted-foreground">Safety Check</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
