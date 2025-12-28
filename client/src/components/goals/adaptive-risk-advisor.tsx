import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { usePortfolioBalance } from "@/hooks/use-portfolio-balance";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { apiFetch } from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";
import { ensureValidToken } from "@/lib/auth";
import { 
  Brain, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Sparkles, 
  DollarSign,
  Loader2,
  Info,
  Activity,
  TrendingUp,
  BarChart3,
  Users
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ARAData {
  portfolioValue: number;
  riskPerTrade: number;
  maxExposure: number;
  suggestedRisk: number;
  suggestedExposure: number;
  numTrades: number;
  avgValuePerTrade: number;
  estimatedGrossProfit: number;
  estimatedNetProfit: number;
  expectedProfitPercent: number;
  mlExpectedProfit: number;
  confidenceLevel: number;
  rawProfitRate?: number;
  calibratedProfitRate?: number;
  calibration?: {
    alpha: number;
    beta: number;
    sampleCount: number;
    isValid: boolean;
    lastUpdate: string;
  };
}

interface RetrainProgress {
  phase: string;
  percent: number;
  eta?: number;
  message?: string;
}

interface TradingStatus {
  isRunning: boolean;
  mode: string;
}

interface DriftStrategyStatus {
  strategy: string;
  driftScore: number;
  status: 'stable' | 'drifting' | 'recalibrating';
  lastCheck: string;
  alpha: number;
  beta: number;
}

interface DriftStatus {
  strategies: Record<string, DriftStrategyStatus>;
  driftingCount: number;
  totalStrategies: number;
  config: {
    warningThreshold: number;
    recalibrationThreshold: number;
  };
}

interface RLStatus {
  ok: boolean;
  policy: {
    allocations: Record<string, number>;
    confidence: number;
    dominantStrategy: string;
    lastUpdate: string;
    source: 'ml' | 'fallback';
  };
  totalReward: number;
  rewardEvaluator: {
    isRunning: boolean;
  };
  experienceBuffer: {
    bufferSize: number;
  };
}

interface MACOStatus {
  ok: boolean;
  agentsActive: number;
  agents: Record<string, {
    allocation: number;
    totalReward: number;
    confidence: number;
    trainingIterations: number;
  }>;
  globalReward: number;
  meanVariance: number;
  explorationRate: number;
  consensusScore: number;
  lastSync: string | null;
  coordinator: { isRunning: boolean };
  exploration: { isRunning: boolean; updateCount: number };
  consensus: { isRunning: boolean; syncCount: number };
}

interface DCEStatus {
  ok: boolean;
  weights: {
    cwqi: number;
    ngc: number;
    mlConfidence: number;
    regimeConfidence: number;
    macoConsensus: number;
  };
  meanDI: number;
  topSignals: Array<{
    symbol: string;
    strategy: string;
    decisionIndex: number;
    grade: 'strong' | 'caution' | 'avoid';
  }>;
  lastRecalibration: string | null;
  recalibrationCount: number;
  isRunning: boolean;
}

interface APRSLEStatus {
  ok: boolean;
  status: 'active' | 'inactive';
  mean_DI: number;
  avg_tp_adj: string;
  avg_sl_adj: string;
  vol_comp: number;
  current_regime: string;
  di_slope: number;
  config: {
    alpha: number;
    beta: number;
    tpBase: number;
    slBase: number;
  };
  last_recalibration: string | null;
  recalibration_count: number;
  sample_count: number;
}

interface MarketRegime {
  regime: 'T1' | 'T2' | 'R1' | 'V1' | 'C1';
  description: string;
  color: string;
  confidence: number;
  metrics: {
    volatility: number;
    trend: number;
    volume_z: number;
    atr: number;
    correlation: number;
  };
  dominantStrategies: string[];
  exposureMultiplier: number;
  riskMultiplier: number;
  previousRegime: string | null;
  lastSwitch: string | null;
  profilerActive: boolean;
  timestamp: string;
}

interface RegimeTransitions {
  current: 'T1' | 'T2' | 'R1' | 'V1' | 'C1';
  currentDescription: string;
  predicted_next: 'T1' | 'T2' | 'R1' | 'V1' | 'C1';
  predictedDescription: string;
  confidence: number;
  probabilities: Record<string, number>;
  forecastHorizon: string;
  biases: Array<{
    strategy: string;
    currentBias: number;
    predictedBias: number;
    blendedBias: number;
  }>;
  exposureMultiplier: number;
  riskMultiplier: number;
  paActive: boolean;
  timestamp: string;
}

interface RegimePerformance {
  stats: Record<string, {
    pnl: number;
    winRate: number;
    volatility: number;
    stability: number;
    confidence: number;
    tradeCount: number;
  }>;
  topPerformer: {
    regime: string;
    description: string;
    avgPnL: number;
    stability: number;
  } | null;
  rptActive: boolean;
  timestamp: string;
}

const REGIME_COLORS: Record<string, string> = {
  T1: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300',
  T2: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-300',
  R1: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300',
  V1: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300',
  C1: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400 border-gray-300'
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

const formatPercent = (value: number): string => {
  return `${value.toFixed(2)} %`;
};

export default function AdaptiveRiskAdvisor() {
  const { balance: portfolioValue, isLoading: portfolioLoading } = usePortfolioBalance();
  const { mode } = useTradingMode();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tradingStatus } = useQuery<TradingStatus>({
    queryKey: ['/api/trading/status'],
    refetchInterval: 5000,
  });
  const isEngineRunning = tradingStatus?.isRunning || false;

  const { data: driftStatus } = useQuery<DriftStatus>({
    queryKey: ['/api/vts/drift/status'],
    refetchInterval: 60000,
  });

  const { data: rlStatus } = useQuery<RLStatus>({
    queryKey: ['/api/rl/status'],
    refetchInterval: 60000,
  });

  const { data: macoStatus } = useQuery<MACOStatus>({
    queryKey: ['/api/maco/status'],
    refetchInterval: 60000,
  });

  const { data: dceStatus } = useQuery<DCEStatus>({
    queryKey: ['/api/dce/status'],
    refetchInterval: 60000,
  });

  const { data: aprSleStatus } = useQuery<APRSLEStatus>({
    queryKey: ['/api/apr-sle/status'],
    refetchInterval: 60000,
  });

  const { data: marketRegime } = useQuery<MarketRegime>({
    queryKey: ['/api/market/regime'],
    refetchInterval: 60000,
  });

  const { data: regimeTransitions } = useQuery<RegimeTransitions>({
    queryKey: ['/api/market/transitions'],
    refetchInterval: 60000,
  });

  const { data: regimePerformance } = useQuery<RegimePerformance>({
    queryKey: ['/api/market/performance'],
    refetchInterval: 60000,
  });
  
  const [isRetraining, setIsRetraining] = useState(false);
  const [retrainProgress, setRetrainProgress] = useState<RetrainProgress | null>(null);
  const [retrainError, setRetrainError] = useState<string | null>(null);

  const { data: suggestions, isLoading: suggestionsLoading } = useQuery<{ suggestedRisk: number; suggestedExposure: number }>({
    queryKey: [`/api/ara/suggestions?mode=${mode}`],
    refetchInterval: 60000,
  });

  const suggestedRisk = suggestions?.suggestedRisk ?? 2.0;
  const suggestedExposure = suggestions?.suggestedExposure ?? 20.0;

  const { data: araData, isLoading: araLoading } = useQuery<ARAData>({
    queryKey: ['/api/ara/calculate', mode, portfolioValue, suggestedRisk, suggestedExposure],
    queryFn: async () => {
      const params = new URLSearchParams({
        mode,
        portfolioValue: String(portfolioValue || 0),
        riskPerTrade: String(suggestedRisk),
        maxExposure: String(suggestedExposure)
      });
      return apiFetch(`/api/ara/calculate?${params}`);
    },
    enabled: !portfolioLoading && portfolioValue !== undefined && !suggestionsLoading,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (suggestions) {
      console.log('[L4.1][ARA][UI_UPDATE] Received ML suggestions:', suggestions);
    }
  }, [suggestions]);

  const applySettingsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/ara/apply', {
        mode,
        riskPerTrade: suggestedRisk,
        maxExposure: suggestedExposure
      });
    },
    onSuccess: () => {
      console.log('[L4.1][ARA][UI_UPDATE] Settings applied to Guardrails successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/ara/calculate'] });
      queryClient.invalidateQueries({ queryKey: ['/api/guardrails'] });
      toast({
        title: "Settings Applied",
        description: "Risk settings have been applied to Guardrails.",
      });
    },
    onError: (error) => {
      console.error('[L4.1][ARA][UI_UPDATE] Failed to apply settings:', error);
      toast({
        variant: "destructive",
        title: "Failed to Apply Settings",
        description: error instanceof Error ? error.message : "An error occurred",
      });
    },
  });

  const applyRLPolicyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/rl/apply', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rl/status'] });
      toast({
        title: "Policy Applied",
        description: "RL policy has been applied to strategy allocations.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to Apply Policy",
        description: error instanceof Error ? error.message : "An error occurred",
      });
    },
  });

  const retrainRLMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/rl/retrain', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rl/status'] });
      toast({
        title: "RL Engine Retrained",
        description: "Reinforcement learning policy has been updated.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Retrain Failed",
        description: error instanceof Error ? error.message : "An error occurred",
      });
    },
  });

  const syncMACOMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/maco/sync', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/maco/status'] });
      toast({
        title: "MACO Synchronized",
        description: "Multi-agent cooperative optimizer synced successfully.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "MACO Sync Failed",
        description: error instanceof Error ? error.message : "An error occurred",
      });
    },
  });

  const handleRetrain = async () => {
    if (isEngineRunning) {
      setRetrainError('Please stop trading before retraining the model.');
      return;
    }

    setIsRetraining(true);
    setRetrainProgress({ phase: 'Initializing', percent: 0 });
    setRetrainError(null);

    console.log('[L4.1][ARA][RETRAIN_START] Initiating model retraining');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const token = await ensureValidToken();
      if (!token) {
        throw new Error('Not authenticated');
      }
      
      const response = await fetch('/api/ara/retrain', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ mode }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error('Retraining failed');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const progress = JSON.parse(line.slice(6));
              setRetrainProgress(progress);
              
              if (progress.phase === 'complete') {
                setIsRetraining(false);
                queryClient.invalidateQueries({ queryKey: ['/api/health'] });
                queryClient.invalidateQueries({ queryKey: ['/api/ara/suggestions'] });
                toast({
                  title: "Retraining Complete",
                  description: "ML model has been successfully retrained.",
                });
              }
            } catch (e) {
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setRetrainError('Retraining timed out');
      } else {
        setRetrainError(error instanceof Error ? error.message : 'Retraining failed');
      }
      setIsRetraining(false);
    } finally {
      clearTimeout(timeout);
    }
  };

  const numTrades = araData?.numTrades ?? (Math.floor(suggestedExposure / suggestedRisk) || 0);
  const avgValuePerTrade = araData?.avgValuePerTrade ?? ((portfolioValue || 0) * suggestedRisk) / 100;
  const estimatedGrossProfit = araData?.estimatedGrossProfit ?? avgValuePerTrade * 0.05;
  const totalTradeCost = avgValuePerTrade * 0.007;
  const estimatedNetProfit = araData?.estimatedNetProfit ?? (estimatedGrossProfit - totalTradeCost);
  const expectedProfitPercent = araData?.expectedProfitPercent ?? (avgValuePerTrade > 0 ? (estimatedNetProfit / avgValuePerTrade) * 100 : 0);
  const mlConfidence = araData?.confidenceLevel ?? 0.70;

  if (portfolioLoading || suggestionsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Adaptive Risk Advisor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="adaptive-risk-advisor">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-500" />
          Adaptive Risk Advisor
        </CardTitle>
        <CardDescription>
          ML-powered risk optimization with real-time recommendations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {retrainError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{retrainError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="w-4 h-4" />
              Portfolio Value
            </div>
            <div className="text-xl font-bold text-green-600">
              {formatCurrency(portfolioValue || 0)}
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Risk per Trade (%)</span>
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-200">
              {formatPercent(suggestedRisk)}
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Max Exposure (%)</span>
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-200">
              {formatPercent(suggestedExposure)}
            </div>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Number of Trades</div>
            <div className="text-xl font-semibold">{numTrades}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Avg Value per Trade</div>
            <div className="text-xl font-semibold">{formatCurrency(avgValuePerTrade)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Est. Gross Profit (per trade)</div>
            <div className="text-xl font-semibold text-green-600">{formatCurrency(estimatedGrossProfit)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Est. Net Profit (per trade) / %</div>
            <div className="text-xl font-semibold text-emerald-600">
              {formatCurrency(estimatedNetProfit)} / {expectedProfitPercent.toFixed(1)}%
            </div>
          </div>
        </div>

        {araData?.calibration && (
          <div className="text-xs text-muted-foreground bg-slate-50 dark:bg-slate-900 rounded px-3 py-2 flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-3 h-3" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>VTS calibration adjusts profit predictions based on simulated trade outcomes.</p>
                  <p className="mt-1">Formula: calibrated = α + β × predicted</p>
                  <p className="mt-1">Sample size: {araData.calibration.sampleCount} trades</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span>
              Calibration: α={araData.calibration.alpha.toFixed(4)}, β={araData.calibration.beta.toFixed(2)}
              {araData.calibration.isValid ? (
                <span className="text-green-600 ml-1">(valid)</span>
              ) : (
                <span className="text-amber-600 ml-1">(limited data)</span>
              )}
            </span>
          </div>
        )}

        <Separator />

        <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <span className="font-medium">ML Confidence</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Probability (based on predictive modeling) that current risk settings will result in profitable trades.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {(mlConfidence * 100).toFixed(1)} %
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Estimated probability of profit under current settings
          </p>
        </div>

        {marketRegime && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                  <span className="font-medium">Market Regime Profile</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Classifies current market conditions and automatically adjusts strategy weights and exposure multipliers.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Badge className={`gap-1 border ${REGIME_COLORS[marketRegime.regime] || REGIME_COLORS.R1}`}>
                  {marketRegime.description}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Confidence</div>
                  <div className="font-semibold">{(marketRegime.confidence * 100).toFixed(1)}%</div>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Volatility (σ)</div>
                  <div className="font-semibold">{(marketRegime.metrics.volatility * 100).toFixed(1)}%</div>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Trend Slope</div>
                  <div className="font-semibold">{marketRegime.metrics.trend.toFixed(2)}</div>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Volume Z-Score (ζ)</div>
                  <div className="font-semibold">{marketRegime.metrics.volume_z.toFixed(2)}</div>
                </div>
              </div>
              
              {marketRegime.dominantStrategies.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Dominant:</span>
                  {marketRegime.dominantStrategies.map((strategy, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {strategy.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              )}
              
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Exposure: {marketRegime.exposureMultiplier.toFixed(2)}x</span>
                <span>Risk: {marketRegime.riskMultiplier.toFixed(2)}x</span>
              </div>
            </div>
          </>
        )}

        {regimeTransitions && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-cyan-500" />
                  <span className="font-medium">Regime Forecast & Performance</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Predicts upcoming market regime transitions and pre-adjusts strategy weights to position ahead of changes.</p>
                        <p className="mt-1">Forecast horizon: {regimeTransitions.forecastHorizon}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Badge className={`gap-1 border ${REGIME_COLORS[regimeTransitions.predicted_next] || REGIME_COLORS.R1}`}>
                  → {regimeTransitions.predictedDescription || regimeTransitions.predicted_next}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Current Regime</div>
                  <div className="font-semibold">{regimeTransitions.currentDescription || regimeTransitions.current}</div>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Predicted Next</div>
                  <div className="font-semibold">{regimeTransitions.predictedDescription || regimeTransitions.predicted_next}</div>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Transition Confidence</div>
                  <div className={`font-semibold ${regimeTransitions.confidence >= 0.6 ? 'text-green-600' : regimeTransitions.confidence >= 0.4 ? 'text-amber-600' : 'text-gray-600'}`}>
                    {(regimeTransitions.confidence * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Forecast Horizon</div>
                  <div className="font-semibold">{regimeTransitions.forecastHorizon}</div>
                </div>
              </div>

              {regimePerformance?.topPerformer && (
                <div className="p-3 rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-medium">Top Performing Regime</span>
                    </div>
                    <Badge className={`gap-1 border ${REGIME_COLORS[regimePerformance.topPerformer.regime] || REGIME_COLORS.R1}`}>
                      {regimePerformance.topPerformer.description}
                    </Badge>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span>Avg PnL: {(regimePerformance.topPerformer.avgPnL * 100).toFixed(2)}%</span>
                    <span>Stability: {regimePerformance.topPerformer.stability.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {regimeTransitions.biases && regimeTransitions.biases.length > 0 && (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Action Bias:</span>
                  <div className="flex flex-wrap gap-2">
                    {regimeTransitions.biases.map((bias, i) => (
                      <Badge 
                        key={i} 
                        variant="outline" 
                        className={`text-xs ${bias.blendedBias > 1 ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'}`}
                      >
                        {bias.blendedBias > 1 ? '+' : ''}{((bias.blendedBias - 1) * 100).toFixed(0)}% {bias.strategy.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Blended Exposure: {regimeTransitions.exposureMultiplier?.toFixed(2) || '1.00'}x</span>
                <span>Blended Risk: {regimeTransitions.riskMultiplier?.toFixed(2) || '1.00'}x</span>
              </div>
            </div>
          </>
        )}

        {driftStatus && driftStatus.totalStrategies > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-500" />
                  <span className="font-medium">Strategy Drift Monitor</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Monitors calibration parameter changes over time. When drift exceeds thresholds, auto-recalibration is triggered.</p>
                        <p className="mt-1">Warning: &gt;{(driftStatus.config.warningThreshold * 100).toFixed(0)}%</p>
                        <p>Auto-recalibrate: &gt;{(driftStatus.config.recalibrationThreshold * 100).toFixed(0)}%</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {driftStatus.driftingCount > 0 ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {driftStatus.driftingCount} Drifting
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle className="w-3 h-3" />
                    All Stable
                  </Badge>
                )}
              </div>
              
              <div className="grid gap-2 max-h-40 overflow-y-auto">
                {Object.entries(driftStatus.strategies).map(([strategy, data]) => (
                  <div 
                    key={strategy}
                    className={`flex items-center justify-between p-2 rounded text-sm ${
                      data.status === 'drifting' 
                        ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800' 
                        : data.status === 'recalibrating'
                        ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800'
                        : 'bg-slate-50 dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <TrendingUp className={`w-4 h-4 ${
                        data.status === 'drifting' ? 'text-amber-500' :
                        data.status === 'recalibrating' ? 'text-blue-500' : 'text-green-500'
                      }`} />
                      <span className="font-medium">{strategy}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        α={data.alpha.toFixed(3)} β={data.beta.toFixed(2)}
                      </span>
                      <div className={`text-xs font-medium ${
                        data.driftScore > driftStatus.config.recalibrationThreshold 
                          ? 'text-red-600' 
                          : data.driftScore > driftStatus.config.warningThreshold 
                          ? 'text-amber-600' 
                          : 'text-green-600'
                      }`}>
                        {(data.driftScore * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {rlStatus && rlStatus.ok && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-500" />
                  <span className="font-medium">Reinforcement Engine</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Q-learning engine that continuously adjusts strategy allocations based on cumulative returns across market regimes.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Badge className={`gap-1 ${rlStatus.rewardEvaluator?.isRunning ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-700'}`}>
                  {rlStatus.rewardEvaluator?.isRunning ? 'ACTIVE' : 'INACTIVE'}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Total Reward</div>
                  <div className={`font-semibold ${rlStatus.totalReward >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {rlStatus.totalReward >= 0 ? '+' : ''}{rlStatus.totalReward.toFixed(4)}
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Policy Confidence</div>
                  <div className={`font-semibold ${rlStatus.policy.confidence >= 0.7 ? 'text-green-600' : rlStatus.policy.confidence >= 0.5 ? 'text-amber-600' : 'text-gray-600'}`}>
                    {(rlStatus.policy.confidence * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Dominant Strategy</div>
                  <div className="font-semibold capitalize">{rlStatus.policy.dominantStrategy.replace(/_/g, ' ')}</div>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Experience Buffer</div>
                  <div className="font-semibold">{rlStatus.experienceBuffer?.bufferSize || 0} samples</div>
                </div>
              </div>

              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Source: {rlStatus.policy.source === 'ml' ? 'ML Model' : 'Fallback'}</span>
                {rlStatus.policy.lastUpdate && (
                  <span>Last update: {new Date(rlStatus.policy.lastUpdate).toLocaleTimeString()}</span>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => applyRLPolicyMutation.mutate()}
                  disabled={applyRLPolicyMutation.isPending}
                  className="gap-1"
                >
                  {applyRLPolicyMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3 h-3" />
                  )}
                  Apply Policy
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => retrainRLMutation.mutate()}
                  disabled={retrainRLMutation.isPending}
                  className="gap-1"
                >
                  {retrainRLMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Retrain Engine
                </Button>
              </div>
            </div>
          </>
        )}

        {macoStatus && macoStatus.ok && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-500" />
                  <span className="font-medium">Cooperative Optimizer</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Multi-Agent Cooperative Optimizer (MACO) - Each strategy runs as an independent learning agent, cooperating through federated gradient averaging to optimize allocations.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Badge className={`gap-1 ${macoStatus.coordinator?.isRunning ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-gray-100 text-gray-700'}`}>
                  {macoStatus.coordinator?.isRunning ? 'ACTIVE' : 'INACTIVE'}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Active Agents</div>
                  <div className="font-semibold">{macoStatus.agentsActive || 0}</div>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Global Reward</div>
                  <div className={`font-semibold ${macoStatus.globalReward >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {macoStatus.globalReward >= 0 ? '+' : ''}{macoStatus.globalReward.toFixed(4)}
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Exploration Rate (ε)</div>
                  <div className="font-semibold">{(macoStatus.explorationRate * 100).toFixed(1)}%</div>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Consensus Score</div>
                  <div className={`font-semibold ${macoStatus.consensusScore >= 0.7 ? 'text-green-600' : macoStatus.consensusScore >= 0.5 ? 'text-amber-600' : 'text-gray-600'}`}>
                    {(macoStatus.consensusScore * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Variance: {macoStatus.meanVariance.toFixed(4)}</span>
                {macoStatus.lastSync && (
                  <span>Last sync: {new Date(macoStatus.lastSync).toLocaleTimeString()}</span>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => syncMACOMutation.mutate()}
                  disabled={syncMACOMutation.isPending}
                  className="gap-1"
                >
                  {syncMACOMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Sync Agents
                </Button>
              </div>
            </div>
          </>
        )}

        {dceStatus && dceStatus.ok && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  <span className="font-medium">Decision Confidence</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Decision Confidence Engine (L16) - Unifies CWQI, NGC, ML Confidence, Regime Score, and MACO Consensus into a single Decision Index (DI) for optimal trade selection.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Badge className={`gap-1 ${dceStatus.isRunning ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-gray-100 text-gray-700'}`}>
                  {dceStatus.isRunning ? 'ACTIVE' : 'INACTIVE'}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Mean Decision Index</div>
                  <div className={`font-semibold ${dceStatus.meanDI >= 0.7 ? 'text-green-600' : dceStatus.meanDI >= 0.4 ? 'text-amber-600' : 'text-red-600'}`}>
                    {(dceStatus.meanDI * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-muted-foreground">Recalibrations</div>
                  <div className="font-semibold">{dceStatus.recalibrationCount || 0}</div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                <div className="font-medium mb-1">Weight Profile:</div>
                <div className="flex flex-wrap gap-2">
                  <span>CWQI: {(dceStatus.weights.cwqi * 100).toFixed(0)}%</span>
                  <span>NGC: {(dceStatus.weights.ngc * 100).toFixed(0)}%</span>
                  <span>ML: {(dceStatus.weights.mlConfidence * 100).toFixed(0)}%</span>
                  <span>Regime: {(dceStatus.weights.regimeConfidence * 100).toFixed(0)}%</span>
                  <span>MACO: {(dceStatus.weights.macoConsensus * 100).toFixed(0)}%</span>
                </div>
              </div>

              {dceStatus.topSignals && dceStatus.topSignals.length > 0 && (
                <div className="text-xs">
                  <div className="font-medium mb-1 text-muted-foreground">Top Signal:</div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${
                      dceStatus.topSignals[0].grade === 'strong' ? 'bg-green-100 text-green-700' :
                      dceStatus.topSignals[0].grade === 'caution' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {dceStatus.topSignals[0].grade.toUpperCase()}
                    </Badge>
                    <span>{dceStatus.topSignals[0].symbol} ({dceStatus.topSignals[0].strategy})</span>
                    <span className="text-muted-foreground">DI: {(dceStatus.topSignals[0].decisionIndex * 100).toFixed(1)}%</span>
                  </div>
                </div>
              )}

              {dceStatus.lastRecalibration && (
                <div className="text-xs text-muted-foreground">
                  Last recalibration: {new Date(dceStatus.lastRecalibration).toLocaleString()}
                </div>
              )}
            </div>
          </>
        )}

        {aprSleStatus && aprSleStatus.ok && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Adaptive Execution</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3.5 h-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>APR-SLE Engine (L17) - Dynamically adjusts Take Profit and Stop Loss levels based on Decision Index momentum, volatility conditions, and regime-specific confidence.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Badge className={`gap-1 ${aprSleStatus.status === 'active' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' : 'bg-gray-100 text-gray-700'}`}>
                  {aprSleStatus.status.toUpperCase()}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">TP Adjustment</div>
                  <div className={`font-semibold ${aprSleStatus.avg_tp_adj.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                    {aprSleStatus.avg_tp_adj}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">SL Adjustment</div>
                  <div className={`font-semibold ${aprSleStatus.avg_sl_adj.startsWith('+') ? 'text-green-600' : aprSleStatus.avg_sl_adj.startsWith('-') ? 'text-amber-600' : 'text-gray-600'}`}>
                    {aprSleStatus.avg_sl_adj}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Vol Comp</div>
                  <div className="font-semibold">{(aprSleStatus.vol_comp * 100).toFixed(0)}%</div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                <div className="font-medium mb-1">Parameters:</div>
                <div className="flex flex-wrap gap-2">
                  <span>α: {aprSleStatus.config?.alpha?.toFixed(2) || '0.60'}</span>
                  <span>β: {aprSleStatus.config?.beta?.toFixed(2) || '0.40'}</span>
                  <span>DI Slope: {(aprSleStatus.di_slope * 100).toFixed(2)}%</span>
                  <span>Regime: {aprSleStatus.current_regime}</span>
                </div>
              </div>

              {aprSleStatus.last_recalibration && (
                <div className="text-xs text-muted-foreground">
                  Last recalibration: {new Date(aprSleStatus.last_recalibration).toLocaleString()} ({aprSleStatus.sample_count} samples)
                </div>
              )}
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            onClick={() => applySettingsMutation.mutate()}
            disabled={!suggestions || applySettingsMutation.isPending}
            className="gap-2"
          >
            {applySettingsMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Apply Suggested Settings
          </Button>

          <Button
            variant="outline"
            onClick={handleRetrain}
            disabled={isRetraining || isEngineRunning}
            className="gap-2"
          >
            {isRetraining ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Retrain Model
          </Button>
        </div>

        {isRetraining && retrainProgress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{retrainProgress.phase}</span>
              <span>{retrainProgress.percent}%</span>
            </div>
            <Progress value={retrainProgress.percent} className="h-2" />
            {retrainProgress.eta && (
              <div className="text-xs text-muted-foreground">
                ETA: {Math.ceil(retrainProgress.eta / 1000)}s
              </div>
            )}
          </div>
        )}

        {retrainProgress?.phase === 'complete' && (
          <Alert>
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>
              Retraining complete. Model {retrainProgress.message || 'deployed'}.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
