import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, TrendingUp, TrendingDown, Minus, AlertCircle, ChevronRight, Beaker, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Link } from 'wouter';
import { useTradingMode } from '@/contexts/trading-mode-context';
import { cn } from '@/lib/utils';



interface DailyBrief {
  id: string;
  userId: string;
  date: string;
  status: 'in_progress' | 'final';
  headline: string;
  summary: string;
  narrative: string;
  metrics: {
    pnl_pct: number;
    win_rate: number;
    drawdown: number;
    exposure: number;
    num_trades: number;
    realized_pl: number;
    unrealized_pl: number;
  } | null;
  trades: {
    top_winners: Array<{ symbol: string; pnl: number; pnl_pct: number }>;
    top_losers: Array<{ symbol: string; pnl: number; pnl_pct: number }>;
    closed: Array<{ symbol: string; pnl: number; time: string }>;
    open: Array<{ symbol: string; entry: number; current_pnl: number }>;
  } | null;
  learnings: Array<{ insight: string; actionable: boolean }> | null;
  systemHealth: {
    status: 'operational' | 'degraded' | 'issues';
    issues: string[];
  };
  updatedAt: string;
}

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

export default function DailyBriefCard() {
  const { mode, isPaper } = useTradingMode();
  
  const { data: brief, isLoading } = useQuery<DailyBrief | null>({
    queryKey: isPaper ? ['/api/paper/briefs/today'] : ['/api/daily-briefs/today']
  });

  const { data: marketInsights } = useQuery<MarketAnalysis>({
    queryKey: [`/api/market-context/latest?mode=${mode}`],
  });
  
  if (isLoading) {
    return (
      <Card data-testid="card-daily-brief">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!brief) {
    return null;
  }

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <Card className={cn(
      "border-2",
      isPaper && "border-blue-500/30 bg-blue-500/5"
    )} data-testid="card-daily-brief">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <CardTitle className="text-lg sm:text-xl" data-testid="text-card-title">
                Current Daily Briefing
              </CardTitle>
              {isPaper && (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
                  <Beaker className="w-3 h-3 mr-1" />
                  SIMULATED
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <CardDescription data-testid="text-brief-date">
                {formatDate(brief.date)}
              </CardDescription>
              <Badge 
                variant={brief.status === 'final' ? 'default' : 'secondary'}
                data-testid="badge-brief-status"
              >
                {brief.status === 'final' ? 'Final' : 'Live Updates'}
              </Badge>
            </div>
            <p className="text-lg font-semibold" data-testid="text-brief-headline">
              {brief.headline}
            </p>
          </div>
          <Link href="/daily-brief">
            <Button variant="ghost" size="sm" data-testid="button-view-full-brief">
              Read Full Briefing
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Summary */}
        <p className="text-muted-foreground" data-testid="text-brief-summary">
          {brief.summary}
        </p>

        {/* Market Insights Section */}
        {marketInsights && (
          <>
            <Separator />
            <div className="border-l-4 border-primary/50 pl-4 bg-primary/5 dark:bg-primary/10 p-3 rounded-r-lg" data-testid="section-market-insights">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-primary uppercase tracking-wide">
                  AI Market Insights
                </h3>
              </div>
              <div className="flex items-center gap-3 mb-2">
                {(() => {
                  const regimeConfig = REGIME_CONFIG[marketInsights.regime] || REGIME_CONFIG.neutral;
                  const RegimeIcon = regimeConfig.icon;
                  const confidenceLevel = marketInsights.confidence || 50;
                  const confidenceColor = confidenceLevel >= 70 ? 'text-green-500' : confidenceLevel >= 50 ? 'text-yellow-500' : 'text-red-500';
                  
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <RegimeIcon className={cn("w-4 h-4", regimeConfig.color)} />
                        <span className={cn("text-sm font-semibold", regimeConfig.color)} data-testid="text-regime">
                          {regimeConfig.label}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className={cn("text-xs font-medium", confidenceColor)} data-testid="text-confidence">
                        {confidenceLevel}% confidence
                      </span>
                    </>
                  );
                })()}
              </div>
              <p className="text-sm text-foreground/90 mb-2" data-testid="text-market-summary">
                {marketInsights.summary}
              </p>
              {marketInsights.recommendations && marketInsights.recommendations.length > 0 && (
                <ul className="text-xs text-foreground/80 space-y-1">
                  {marketInsights.recommendations.slice(0, 3).map((rec, i) => (
                    <li key={i} className="flex items-start gap-1" data-testid={`text-recommendation-${i}`}>
                      <span className="text-primary">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {/* Key Metrics Row */}
        {brief.metrics ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Trades</p>
              <p className="text-lg font-semibold" data-testid="text-num-trades">
                {brief.metrics.num_trades != null ? brief.metrics.num_trades : '—'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Win Rate</p>
              <p className="text-lg font-semibold" data-testid="text-win-rate">
                {brief.metrics.win_rate != null ? `${brief.metrics.win_rate.toFixed(0)}%` : '—'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Total P&L</p>
              <p 
                className={`text-lg font-semibold ${
                  ((brief.metrics.realized_pl ?? 0) + (brief.metrics.unrealized_pl ?? 0)) >= 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}
                data-testid="text-total-pnl"
              >
                {brief.metrics.realized_pl != null || brief.metrics.unrealized_pl != null 
                  ? `${((brief.metrics.realized_pl ?? 0) + (brief.metrics.unrealized_pl ?? 0)) >= 0 ? '+' : ''}$${Math.abs((brief.metrics.realized_pl ?? 0) + (brief.metrics.unrealized_pl ?? 0)).toFixed(2)}`
                  : '—'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Portfolio %</p>
              <p 
                className={`text-lg font-semibold ${
                  (brief.metrics.pnl_pct ?? 0) >= 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}
                data-testid="text-pnl-pct"
              >
                {brief.metrics.pnl_pct != null ? `${(brief.metrics.pnl_pct ?? 0) >= 0 ? '+' : ''}${brief.metrics.pnl_pct.toFixed(2)}%` : '—'}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground italic">
            Some trading metrics are still updating.
          </div>
        )}

        {/* System Health & Last Update */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            {brief.systemHealth.status === 'operational' ? (
              <>
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm text-muted-foreground" data-testid="text-system-health">
                  All systems operational
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-muted-foreground" data-testid="text-system-health">
                  {(brief.systemHealth.issues && brief.systemHealth.issues.length) || 0} issue(s) detected
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span data-testid="text-last-update">
              Updated {formatTime(brief.updatedAt)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
