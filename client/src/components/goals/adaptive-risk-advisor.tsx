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
  Info
} from "lucide-react";

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
