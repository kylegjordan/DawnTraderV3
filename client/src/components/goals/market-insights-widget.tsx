import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MarketAnalysis {
  id: string;
  date: string;
  mode: 'live' | 'paper';
  regime: string;
  confidence: number;
  summary: string;
  recommendations?: string[];
}

const REGIME_CONFIG: Record<string, { label: string; icon: typeof TrendingUp; color: string }> = {
  bullish: { label: 'Bullish', icon: TrendingUp, color: 'text-green-500' },
  bearish: { label: 'Bearish', icon: TrendingDown, color: 'text-red-500' },
  neutral: { label: 'Neutral', icon: Minus, color: 'text-gray-500' },
  accumulation: { label: 'Accumulation', icon: TrendingUp, color: 'text-blue-500' },
  distribution: { label: 'Distribution', icon: TrendingDown, color: 'text-orange-500' },
  high_volatility: { label: 'High Volatility', icon: TrendingUp, color: 'text-purple-500' },
  low_volatility: { label: 'Low Volatility', icon: Minus, color: 'text-indigo-500' },
};

export default function MarketInsightsWidget() {
  const { mode, isPaper } = useTradingMode();
  const { toast } = useToast();
  
  const { data: analysis, isLoading } = useQuery<MarketAnalysis>({
    queryKey: [`/api/market-context/latest?mode=${mode}`],
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/market-context/analyze', { mode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/market-context/latest', mode] });
      toast({
        title: "Analysis Complete",
        description: `${mode === 'live' ? 'Live' : 'Paper'} market analysis updated successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to run market analysis",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-market-insights">
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Market Insights</span>
            <Brain className="w-5 h-5 text-primary" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const regimeConfig = analysis?.regime ? REGIME_CONFIG[analysis.regime] : REGIME_CONFIG.neutral;
  const RegimeIcon = regimeConfig.icon;
  const confidenceLevel = analysis?.confidence || 50;
  const confidenceColor = confidenceLevel >= 70 ? 'text-green-500' : confidenceLevel >= 50 ? 'text-yellow-500' : 'text-red-500';

  return (
    <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-market-insights">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Market Insights</span>
            {isPaper && (
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-500/20 text-blue-600 dark:text-blue-400">
                SIMULATED
              </span>
            )}
          </div>
          <Brain className="w-5 h-5 text-primary" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {analysis ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RegimeIcon className={cn("w-5 h-5", regimeConfig.color)} data-testid="icon-regime" />
                <div>
                  <p className={cn("text-sm font-semibold", regimeConfig.color)} data-testid="text-regime">
                    {regimeConfig.label}
                  </p>
                  <p className={cn("text-xs", confidenceColor)} data-testid="text-confidence">
                    {confidenceLevel}% confidence
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending}
                data-testid="button-refresh-analysis"
              >
                <RefreshCw className={cn("w-4 h-4", analyzeMutation.isPending && "animate-spin")} />
              </Button>
            </div>

            <div className="text-sm text-muted-foreground" data-testid="text-summary">
              {analysis.summary}
            </div>

            {analysis.recommendations && analysis.recommendations.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Recommendations:</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {analysis.recommendations.slice(0, 3).map((rec, i) => (
                    <li key={i} className="flex items-start gap-1" data-testid={`text-recommendation-${i}`}>
                      <span className="text-primary">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground/60" data-testid="text-analysis-date">
              Analysis from {new Date(analysis.date).toLocaleDateString()}
            </p>
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-3" data-testid="text-no-analysis">
              No market analysis available
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              data-testid="button-run-analysis"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", analyzeMutation.isPending && "animate-spin")} />
              Run Analysis
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
