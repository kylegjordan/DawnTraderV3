import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Clock, Target, BarChart3, Activity, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface SignalInsight {
  signalType: string;
  weight: number;
  lastUpdated: Date;
  trend: 'up' | 'down' | 'stable';
}

interface PredictionDiagnostics {
  long: { correct: number; incorrect: number };
  short: { correct: number; incorrect: number };
  neutral: { correct: number; incorrect: number };
  totalPredictions: number;
  accuracy: number;
}

interface Overview {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winRate: number;
  avgRMultiple: number;
  avgHoldingTime: number;
  totalPL: number;
}

interface StrategyDetails {
  overview: Overview;
  signalInsights: SignalInsight[];
  predictionDiagnostics: PredictionDiagnostics;
  equityCurve: Array<{ date: string; value: number }>;
}

interface StrategyDetailViewProps {
  strategyId: string;
}

export default function StrategyDetailView({ strategyId }: StrategyDetailViewProps) {
  const { mode } = useTradingMode();
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<{ success: boolean; data: StrategyDetails }>({
    queryKey: [`/api/metrics/strategies/${strategyId}/details`, { mode, days }],
    queryFn: async () => {
      const response = await fetch(
        `/api/metrics/strategies/${strategyId}/details?mode=${mode}&days=${days}`,
        { headers: { 'user-id': 'default-user' } }
      );
      return response.json();
    },
    refetchInterval: 60000
  });

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <ArrowUp className="h-4 w-4 text-green-600" />;
      case 'down':
        return <ArrowDown className="h-4 w-4 text-red-600" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatSignalName = (signal: string) => {
    return signal
      .replace(/_/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="strategy-detail-view">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!data || !data.success) {
    return (
      <Card data-testid="strategy-detail-view">
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No detailed data available for this strategy</p>
            <p className="text-sm mt-1">Complete trades to see metrics</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { overview, signalInsights, predictionDiagnostics, equityCurve } = data.data;

  return (
    <div className="space-y-6" data-testid="strategy-detail-view">
      {/* Header with Time Range Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            {formatSignalName(strategyId)}
          </h2>
          <p className="text-sm text-muted-foreground">
            Detailed performance analysis • {mode === 'live' ? 'Live' : 'Paper'} Mode
          </p>
        </div>
        <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
          <SelectTrigger className="w-32" data-testid="select-time-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 Days</SelectItem>
            <SelectItem value="30">30 Days</SelectItem>
            <SelectItem value="90">90 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="metric-total-trades">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Trades</p>
                <p className="text-2xl font-bold">{overview.totalTrades}</p>
                <p className="text-xs text-muted-foreground">
                  {overview.closedTrades} closed • {overview.openTrades} open
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="metric-win-rate">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Target className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Win Rate</p>
                <p className="text-2xl font-bold">{overview.winRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="metric-avg-r">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                overview.avgRMultiple > 0 ? "bg-green-500/10" : "bg-red-500/10"
              )}>
                <BarChart3 className={cn(
                  "h-5 w-5",
                  overview.avgRMultiple > 0 ? "text-green-600" : "text-red-600"
                )} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg R-Multiple</p>
                <p className={cn(
                  "text-2xl font-bold",
                  overview.avgRMultiple > 0 ? "text-green-600" : "text-red-600"
                )}>
                  {overview.avgRMultiple.toFixed(2)}R
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="metric-holding-time">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Holding Time</p>
                <p className="text-2xl font-bold">{overview.avgHoldingTime.toFixed(1)}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Different Views */}
      <Tabs defaultValue="equity" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="equity" data-testid="tab-equity-curve">Equity Curve</TabsTrigger>
          <TabsTrigger value="signals" data-testid="tab-signal-insights">Signal Insights</TabsTrigger>
          <TabsTrigger value="predictions" data-testid="tab-predictions">Predictions</TabsTrigger>
        </TabsList>

        {/* Equity Curve Chart */}
        <TabsContent value="equity" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Cumulative P/L</CardTitle>
              <CardDescription>Strategy equity curve over time</CardDescription>
            </CardHeader>
            <CardContent>
              {equityCurve.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={equityCurve}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      fontSize={12}
                    />
                    <YAxis 
                      fontSize={12}
                      tickFormatter={(value) => `$${value.toFixed(0)}`}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      labelFormatter={(date) => new Date(date).toLocaleString()}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'P/L']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <p>No equity data available yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Signal Insights */}
        <TabsContent value="signals" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Signal Weights</CardTitle>
              <CardDescription>
                Adaptive weights from Learning Feedback Engine
              </CardDescription>
            </CardHeader>
            <CardContent>
              {signalInsights.length > 0 ? (
                <div className="space-y-3">
                  {signalInsights.map((signal, i) => (
                    <div 
                      key={i}
                      className="flex items-center justify-between p-3 rounded-lg border border-border"
                      data-testid={`signal-insight-${signal.signalType}`}
                    >
                      <div className="flex items-center gap-3">
                        {getTrendIcon(signal.trend)}
                        <div>
                          <p className="font-medium">{formatSignalName(signal.signalType)}</p>
                          <p className="text-xs text-muted-foreground">
                            Updated {new Date(signal.lastUpdated).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "font-bold",
                          signal.weight > 1.1 ? "text-green-600" : 
                          signal.weight < 0.9 ? "text-red-600" : 
                          "text-foreground"
                        )}>
                          {signal.weight.toFixed(2)}x
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {signal.trend === 'up' ? 'Increasing' : 
                           signal.trend === 'down' ? 'Decreasing' : 
                           'Stable'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-12">
                  <p>No signal insights available</p>
                  <p className="text-sm mt-1">Weights will appear after trades are completed</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Prediction Diagnostics */}
        <TabsContent value="predictions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Prediction Diagnostics</CardTitle>
              <CardDescription>
                Confusion matrix showing prediction accuracy
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Overall Accuracy */}
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground mb-1">Overall Accuracy</p>
                  <p className="text-3xl font-bold text-foreground">
                    {predictionDiagnostics.accuracy.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {predictionDiagnostics.totalPredictions} total predictions
                  </p>
                </div>

                {/* Confusion Matrix */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Long Predictions */}
                  <Card className="border-green-500/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        Long Predictions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Correct</span>
                        <Badge variant="default" className="bg-green-600">
                          {predictionDiagnostics.long.correct}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Incorrect</span>
                        <Badge variant="destructive">
                          {predictionDiagnostics.long.incorrect}
                        </Badge>
                      </div>
                      <div className="pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground">Accuracy</p>
                        <p className="text-lg font-bold">
                          {(predictionDiagnostics.long.correct + predictionDiagnostics.long.incorrect) > 0
                            ? ((predictionDiagnostics.long.correct / (predictionDiagnostics.long.correct + predictionDiagnostics.long.incorrect)) * 100).toFixed(1)
                            : '0.0'}%
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Short Predictions */}
                  <Card className="border-red-500/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-red-600" />
                        Short Predictions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Correct</span>
                        <Badge variant="default" className="bg-green-600">
                          {predictionDiagnostics.short.correct}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Incorrect</span>
                        <Badge variant="destructive">
                          {predictionDiagnostics.short.incorrect}
                        </Badge>
                      </div>
                      <div className="pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground">Accuracy</p>
                        <p className="text-lg font-bold">
                          {(predictionDiagnostics.short.correct + predictionDiagnostics.short.incorrect) > 0
                            ? ((predictionDiagnostics.short.correct / (predictionDiagnostics.short.correct + predictionDiagnostics.short.incorrect)) * 100).toFixed(1)
                            : '0.0'}%
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Neutral Predictions */}
                  <Card className="border-blue-500/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="h-4 w-4 text-blue-600" />
                        Neutral Predictions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Correct</span>
                        <Badge variant="default" className="bg-green-600">
                          {predictionDiagnostics.neutral.correct}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Incorrect</span>
                        <Badge variant="destructive">
                          {predictionDiagnostics.neutral.incorrect}
                        </Badge>
                      </div>
                      <div className="pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground">Accuracy</p>
                        <p className="text-lg font-bold">
                          {(predictionDiagnostics.neutral.correct + predictionDiagnostics.neutral.incorrect) > 0
                            ? ((predictionDiagnostics.neutral.correct / (predictionDiagnostics.neutral.correct + predictionDiagnostics.neutral.incorrect)) * 100).toFixed(1)
                            : '0.0'}%
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
