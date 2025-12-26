import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
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
  Loader2
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

export default function AdaptiveRiskAdvisor() {
  const { balance: portfolioValue, isLoading: portfolioLoading } = usePortfolioBalance();
  const { mode } = useTradingMode();
  const queryClient = useQueryClient();

  const { data: tradingStatus } = useQuery<TradingStatus>({
    queryKey: ['/api/trading/status'],
    refetchInterval: 5000,
  });
  const isEngineRunning = tradingStatus?.isRunning || false;
  
  const [riskPerTrade, setRiskPerTrade] = useState<number>(2);
  const [maxExposure, setMaxExposure] = useState<number>(20);
  const [isRetraining, setIsRetraining] = useState(false);
  const [retrainProgress, setRetrainProgress] = useState<RetrainProgress | null>(null);
  const [retrainError, setRetrainError] = useState<string | null>(null);

  const { data: araData, isLoading: araLoading, refetch: refetchARA } = useQuery<ARAData>({
    queryKey: ['/api/ara/calculate', mode, portfolioValue, riskPerTrade, maxExposure],
    queryFn: async () => {
      const params = new URLSearchParams({
        mode,
        portfolioValue: String(portfolioValue || 0),
        riskPerTrade: String(riskPerTrade),
        maxExposure: String(maxExposure)
      });
      return apiFetch(`/api/ara/calculate?${params}`);
    },
    enabled: !portfolioLoading && portfolioValue !== undefined,
    refetchInterval: 30000,
  });

  const { data: suggestions } = useQuery<{ suggestedRisk: number; suggestedExposure: number }>({
    queryKey: [`/api/ara/suggestions?mode=${mode}`],
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (suggestions) {
      console.log('[L4][ARA] Received suggestions:', suggestions);
    }
  }, [suggestions]);

  const applySettingsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/ara/apply', {
        mode,
        riskPerTrade: suggestions?.suggestedRisk || riskPerTrade,
        maxExposure: suggestions?.suggestedExposure || maxExposure
      });
    },
    onSuccess: () => {
      console.log('[L4][ARA][SUGGEST_APPLY] Settings applied successfully');
      if (suggestions) {
        setRiskPerTrade(suggestions.suggestedRisk);
        setMaxExposure(suggestions.suggestedExposure);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/ara/calculate'] });
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

    console.log('[L4][ARA][RETRAIN_START] Initiating model retraining');

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

  const numTrades = maxExposure > 0 && riskPerTrade > 0 
    ? Math.floor(maxExposure / riskPerTrade) 
    : 0;
  
  const avgValuePerTrade = portfolioValue && riskPerTrade > 0
    ? (portfolioValue * riskPerTrade) / 100
    : 0;

  const estimatedGrossProfit = araData?.mlExpectedProfit 
    ? avgValuePerTrade * araData.mlExpectedProfit
    : avgValuePerTrade * 0.05;

  const estimatedNetProfit = estimatedGrossProfit * 0.994;

  if (portfolioLoading) {
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
          <Badge variant="outline" className="ml-2">L4</Badge>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Portfolio Value
            </Label>
            <div className="text-2xl font-bold text-green-600">
              ${portfolioValue?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Risk per Trade (%)
              {suggestions && suggestions.suggestedRisk !== riskPerTrade && (
                <Badge variant="secondary" className="text-xs">
                  Suggested: {suggestions.suggestedRisk}%
                </Badge>
              )}
            </Label>
            <Input
              type="number"
              step="0.5"
              min="0.5"
              max="10"
              value={riskPerTrade}
              onChange={(e) => setRiskPerTrade(parseFloat(e.target.value) || 0)}
              className="max-w-[120px]"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Max Exposure (%)
              {suggestions && suggestions.suggestedExposure !== maxExposure && (
                <Badge variant="secondary" className="text-xs">
                  Suggested: {suggestions.suggestedExposure}%
                </Badge>
              )}
            </Label>
            <Input
              type="number"
              step="5"
              min="5"
              max="100"
              value={maxExposure}
              onChange={(e) => setMaxExposure(parseFloat(e.target.value) || 0)}
              className="max-w-[120px]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-center">
            <div className="text-sm text-muted-foreground">Number of Trades</div>
            <div className="text-xl font-semibold">{numTrades}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground">Avg Value/Trade</div>
            <div className="text-xl font-semibold">
              ${avgValuePerTrade.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground">Est. Gross Profit</div>
            <div className="text-xl font-semibold text-green-600">
              ${estimatedGrossProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground">Est. Net Profit</div>
            <div className="text-xl font-semibold text-emerald-600">
              ${estimatedNetProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {araData && (
          <div className="flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span className="text-sm">
              ML Confidence: <strong>{(araData.confidenceLevel * 100).toFixed(1)}%</strong>
              {' · '}
              Expected Profit: <strong>{(araData.mlExpectedProfit * 100).toFixed(2)}%</strong>
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
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
