import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Settings, TrendingUp, Shield, Clock, Users } from "lucide-react";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { usePortfolioBalance } from "@/hooks/use-portfolio-balance";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface GuardrailsV2 {
  mode: string;
  portfolioRiskPerTradePct: string;
  dailyLossKillSwitchPct: string;
  symbolCooldownMinutes: number;
  maxOpenPositions: number;
  isManualOverride: boolean;
  tunedByLatti: boolean;
  lockedByUser: Record<string, boolean> | null;
  lastUpdated: string;
}

interface GoalsPreset {
  id: string;
  mode: string;
  name: string;
  portfolioRiskPerTradePct: string;
  dailyLossKillSwitchPct: string;
  symbolCooldownMinutes: number;
  maxOpenPositions: number;
  tradesPerDayEst: string;
  targetDailyAvgEarningPct: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface GuardrailsCompliance {
  mode: string;
  activePreset: string;
  coherency: {
    status: 'PASS' | 'WARN' | 'FAIL';
    errors: string[];
    warnings: string[];
  };
  killSwitchTripped: boolean;
}

export function DashboardLATTiWidget() {
  const { mode } = useTradingMode();
  const [, setLocation] = useLocation();
  const { balance: portfolioBalance, isLoading: portfolioLoading } = usePortfolioBalance();

  // Fetch guardrails
  const { data: guardrailsData, isLoading: guardrailsLoading, error: guardrailsError } = useQuery<{ ok: boolean; data: GuardrailsV2 }>({
    queryKey: [`/api/guardrails-v2?mode=${mode}`],
    enabled: !!mode,
  });

  // Fetch active preset
  const { data: presetData, isLoading: presetLoading, error: presetError } = useQuery<{ ok: boolean; data: GoalsPreset }>({
    queryKey: [`/api/goals-presets/active?mode=${mode}`],
    enabled: !!mode,
  });

  // Fetch coherency compliance
  const { data: complianceData, isLoading: complianceLoading, error: complianceError } = useQuery<{ ok: boolean; data: GuardrailsCompliance }>({
    queryKey: [`/api/analytics/guardrails-compliance?mode=${mode}`],
    enabled: !!mode,
  });

  const guardrails = guardrailsData?.data;
  const preset = presetData?.data;
  const compliance = complianceData?.data;

  const isLoading = guardrailsLoading || presetLoading || complianceLoading || portfolioLoading;
  const hasError = guardrailsError || presetError || complianceError;

  const getCoherencyBadge = (status: string | undefined) => {
    if (!status) return <Badge variant="outline">Unknown</Badge>;
    
    switch (status) {
      case 'PASS':
        return <Badge variant="default" className="bg-green-600 dark:bg-green-700" data-testid="badge-coherency-pass">🟢 PASS</Badge>;
      case 'WARN':
        return <Badge variant="default" className="bg-amber-600 dark:bg-amber-700" data-testid="badge-coherency-warn">🟡 WARN</Badge>;
      case 'FAIL':
        return <Badge variant="default" className="bg-red-600 dark:bg-red-700" data-testid="badge-coherency-fail">🔴 FAIL</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getPresetDisplayName = (name: string | undefined) => {
    if (!name) return 'Unknown';
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const getPresetBadgeColor = (name: string | undefined) => {
    if (!name) return 'bg-gray-600 dark:bg-gray-700 text-white';
    
    switch (name) {
      case 'conservative':
        return 'bg-green-600 dark:bg-green-700 text-white';
      case 'baseline':
        return 'bg-blue-600 dark:bg-blue-700 text-white';
      case 'optimistic':
        return 'bg-amber-600 dark:bg-amber-700 text-white';
      case 'maximum':
        return 'bg-red-600 dark:bg-red-700 text-white';
      case 'custom':
        return 'bg-purple-600 dark:bg-purple-700 text-white';
      default:
        return 'bg-gray-600 dark:bg-gray-700 text-white';
    }
  };

  const getControlModeBadge = () => {
    if (!guardrails) return null;
    
    if (guardrails.isManualOverride) {
      return <Badge variant="default" className="bg-amber-600 dark:bg-amber-700" data-testid="badge-manual-override">Manual Override</Badge>;
    }
    
    if (guardrails.tunedByLatti) {
      return <Badge variant="default" className="bg-green-600 dark:bg-green-700" data-testid="badge-lotti-managed">LATTi</Badge>;
    }
    
    return <Badge variant="outline">Unknown</Badge>;
  };

  return (
    <section data-testid="dashboard-latti-widget">
      <Card className="bg-card dark:bg-card border border-border dark:border-border">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                LATTi Goals & Guardrails
              </CardTitle>
              <CardDescription className="mt-1">
                Live guardrails, coherency status, and active preset configuration
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation('/goals-engine')}
              data-testid="button-open-goals-engine"
              className="w-full sm:w-auto"
            >
              <Settings className="h-4 w-4 mr-2" />
              Open Goals Engine
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : hasError ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="error-message">
              <p className="text-sm">Failed to load guardrails data.</p>
              <p className="text-xs mt-1">
                {guardrailsError instanceof Error && guardrailsError.message}
                {presetError instanceof Error && presetError.message}
                {complianceError instanceof Error && complianceError.message}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Preset with Target Goals in Same Row */}
              <div className="pb-4 border-b border-border">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                  {/* Active Preset Badge */}
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-muted-foreground font-semibold">Active Preset:</div>
                    <Badge className={`text-lg font-bold px-4 py-2 ${getPresetBadgeColor(preset?.name)}`} data-testid="badge-active-preset">
                      {getPresetDisplayName(preset?.name)}
                    </Badge>
                  </div>
                  
                  {/* Target Daily Avg Earning % */}
                  {preset && (
                    <div className="bg-muted/30 dark:bg-muted/30 p-3 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Target Daily Avg Earning %</div>
                      <div className="text-2xl font-bold text-foreground" data-testid="text-target-earning">
                        {preset.targetDailyAvgEarningPct}%
                      </div>
                    </div>
                  )}
                  
                  {/* Trades per Day (Est) */}
                  {preset && (
                    <div className="bg-muted/30 dark:bg-muted/30 p-3 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Trades per Day (Est)</div>
                      <div className="text-2xl font-bold text-foreground" data-testid="text-trades-per-day">
                        {preset.tradesPerDayEst}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Core Four Guardrails */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Core Four Guardrails
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Portfolio Risk per Trade % */}
                  <div className="bg-muted/30 dark:bg-muted/30 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Portfolio Risk per Trade %
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-portfolio-risk">
                      {guardrails?.portfolioRiskPerTradePct || '—'}%
                    </div>
                  </div>

                  {/* Symbol Cooldown */}
                  <div className="bg-muted/30 dark:bg-muted/30 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Symbol Cooldown
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-symbol-cooldown">
                      {guardrails?.symbolCooldownMinutes || '—'} min
                    </div>
                  </div>

                  {/* Max Open Positions */}
                  <div className="bg-muted/30 dark:bg-muted/30 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      Max Open Positions
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-text-max-positions">
                      {guardrails?.maxOpenPositions || '—'}
                    </div>
                  </div>

                  {/* Daily Loss Kill Switch % */}
                  <div className="bg-muted/30 dark:bg-muted/30 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      Daily Loss Kill Switch %
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-kill-switch">
                      {guardrails?.dailyLossKillSwitchPct || '—'}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Portfolio Projected Growth Table */}
              <div className="space-y-2 pt-3 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold">Projected Portfolio Growth</h3>
                </div>
                <div className="space-y-1.5">
                  {/* Current Portfolio - using real portfolio balance from API */}
                  {preset && (() => {
                    const targetPctValue = parseFloat(preset.targetDailyAvgEarningPct) || 0;
                    
                    return (
                      <>
                        <div className="flex justify-between items-center p-2 bg-muted/20 rounded">
                          <span className="text-xs font-medium">Current Portfolio:</span>
                          <span className="text-sm font-bold font-mono" data-testid="portfolio-current">
                            ${portfolioBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        
                        {/* Projected values using compound daily growth */}
                        {[
                          { label: 'After 7 Days', days: 7, testId: 'portfolio-7d' },
                          { label: 'After 30 Days', days: 30, testId: 'portfolio-30d' },
                          { label: 'After 90 Days', days: 90, testId: 'portfolio-90d' },
                          { label: 'After 365 Days', days: 365, testId: 'portfolio-365d' }
                        ].map(({ label, days, testId }) => {
                          // Calculate compound growth: FV = PV × (1 + r)^n
                          const dailyReturnDecimal = targetPctValue / 100;
                          const projectedValue = portfolioBalance * Math.pow(1 + dailyReturnDecimal, days);
                          const growthAmount = projectedValue - portfolioBalance;
                          const growthPct = ((projectedValue - portfolioBalance) / portfolioBalance) * 100;
                          
                          return (
                            <div key={days} className="flex justify-between items-center p-2 hover:bg-muted/30 rounded transition-colors">
                              <span className="text-xs text-muted-foreground">{label}:</span>
                              <div className="flex flex-col items-end">
                                <span className="text-sm font-bold font-mono" data-testid={testId}>
                                  ${projectedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span 
                                  className={`text-[10px] font-mono ${growthAmount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                                  data-testid={`${testId}-growth`}
                                >
                                  {growthAmount >= 0 ? '+' : ''}{growthAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({growthPct >= 0 ? '+' : ''}{growthPct.toFixed(1)}%)
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Footer Row - Coherency, Control, and Metrics */}
              <div className="pt-4 border-t border-border bg-muted/20 dark:bg-muted/20 p-4 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-semibold">Coherency:</span>
                      {getCoherencyBadge(compliance?.coherency?.status)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-semibold">Control:</span>
                      {getControlModeBadge()}
                    </div>
                  </div>
                  {preset && (
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Target:</span>
                        <span className="font-bold text-green-600 dark:text-green-400">{preset.targetDailyAvgEarningPct}%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Trades/Day:</span>
                        <span className="font-bold">{preset.tradesPerDayEst}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
