import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Calendar, TrendingUp, TrendingDown, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { Link, useLocation } from 'wouter';

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
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
}

export default function DailyBriefPage() {
  const [location] = useLocation();
  
  // Parse date from query parameter
  const params = new URLSearchParams(location.split('?')[1] || '');
  const dateParam = params.get('date');
  
  // Use date parameter if provided, otherwise fetch today's brief
  const briefDate = dateParam || new Date().toISOString().split('T')[0];
  const endpoint = dateParam 
    ? `/api/daily-briefs/${dateParam}` 
    : '/api/daily-briefs/today';
  
  const { data: brief, isLoading } = useQuery<DailyBrief | null>({
    queryKey: [endpoint],
    enabled: !!briefDate
  });

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6" data-testid="daily-brief-page">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="container mx-auto p-6" data-testid="daily-brief-page">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <Link href="/reports?tab=daily-briefs">
            <Button variant="ghost" size="sm" data-testid="button-all-briefs">
              View All Briefs
            </Button>
          </Link>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Daily Briefing available for this date</h3>
            <p className="text-muted-foreground">
              {dateParam 
                ? `No briefing was generated for ${formatDate(dateParam)}. Try selecting a different date.`
                : 'The daily brief is currently being generated. Please check back in a few minutes.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const totalPL = brief.metrics 
    ? ((brief.metrics.realized_pl ?? 0) + (brief.metrics.unrealized_pl ?? 0))
    : null;

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="daily-brief-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
            </Link>
            <Link href="/reports?tab=daily-briefs">
              <Button variant="ghost" size="sm" data-testid="button-all-briefs">
                View All Briefs
              </Button>
            </Link>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">
              {dateParam && dateParam !== new Date().toISOString().split('T')[0] 
                ? 'Viewing Historical Brief'
                : 'Current Daily Briefing'}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <p className="text-muted-foreground" data-testid="text-brief-date">
                {formatDate(brief.date)}
              </p>
            </div>
          </div>
        </div>
        <Badge 
          variant={brief.status === 'final' ? 'default' : 'secondary'}
          data-testid="badge-status"
        >
          {brief.status === 'final' ? 'Finalized' : 'In Progress'}
        </Badge>
      </div>

      {/* Headline Card */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="text-headline">
            {brief.headline}
          </CardTitle>
          <CardDescription data-testid="text-summary">
            {brief.summary}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Metrics Grid */}
      {brief.metrics ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Trades</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold" data-testid="text-metric-num-trades">
                {brief.metrics.num_trades != null ? brief.metrics.num_trades : '—'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Win Rate</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold" data-testid="text-metric-win-rate">
                {brief.metrics.win_rate != null ? `${brief.metrics.win_rate.toFixed(1)}%` : '—'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total P&L</CardDescription>
            </CardHeader>
            <CardContent>
              <p 
                className={`text-3xl font-bold ${
                  totalPL != null && totalPL >= 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : totalPL != null && totalPL < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-muted-foreground'
                }`}
                data-testid="text-metric-total-pnl"
              >
                {totalPL != null ? `${totalPL >= 0 ? '+' : ''}$${Math.abs(totalPL).toFixed(2)}` : '—'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Portfolio %</CardDescription>
            </CardHeader>
            <CardContent>
              <p 
                className={`text-3xl font-bold ${
                  brief.metrics.pnl_pct != null && brief.metrics.pnl_pct >= 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : brief.metrics.pnl_pct != null && brief.metrics.pnl_pct < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-muted-foreground'
                }`}
                data-testid="text-metric-pnl-pct"
              >
                {brief.metrics.pnl_pct != null ? `${brief.metrics.pnl_pct >= 0 ? '+' : ''}${brief.metrics.pnl_pct.toFixed(2)}%` : '—'}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground italic text-center">
              Some trading metrics are still updating.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Narrative */}
      <Card>
        <CardHeader>
          <CardTitle>Today's Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-foreground leading-relaxed whitespace-pre-wrap" data-testid="text-narrative">
              {brief.narrative || 'Narrative is being generated...'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Trade Highlights */}
      {brief.trades && (brief.trades.top_winners.length > 0 || brief.trades.top_losers.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Top Winners */}
          {brief.trades.top_winners.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <CardTitle>Top Winners</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {brief.trades.top_winners.map((trade, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950/20"
                      data-testid={`trade-winner-${index}`}
                    >
                      <div>
                        <p className="font-semibold">{trade.symbol}</p>
                        <p className="text-sm text-muted-foreground">
                          {trade.pnl_pct >= 0 ? '+' : ''}{trade.pnl_pct.toFixed(2)}%
                        </p>
                      </div>
                      <p className="text-lg font-bold text-green-600 dark:text-green-400">
                        ${trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Losers */}
          {brief.trades.top_losers.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <CardTitle>Top Losers</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {brief.trades.top_losers.map((trade, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/20"
                      data-testid={`trade-loser-${index}`}
                    >
                      <div>
                        <p className="font-semibold">{trade.symbol}</p>
                        <p className="text-sm text-muted-foreground">
                          {trade.pnl_pct.toFixed(2)}%
                        </p>
                      </div>
                      <p className="text-lg font-bold text-red-600 dark:text-red-400">
                        ${trade.pnl.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Key Learnings */}
      {brief.learnings && brief.learnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Key Learnings & Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {brief.learnings.map((learning, index) => (
                <div 
                  key={index} 
                  className="flex items-start gap-3 p-4 rounded-lg border"
                  data-testid={`learning-${index}`}
                >
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-foreground leading-relaxed">{learning.insight}</p>
                    {learning.actionable && (
                      <Badge variant="secondary" className="mt-2">Actionable</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {brief.systemHealth.status === 'operational' ? (
              <>
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <p className="text-foreground" data-testid="text-system-status">
                  All systems operational
                </p>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="text-foreground font-semibold" data-testid="text-system-status">
                    {brief.systemHealth.issues.length} issue(s) detected
                  </p>
                  <ul className="mt-2 space-y-1">
                    {brief.systemHealth.issues.map((issue, index) => (
                      <li key={index} className="text-sm text-muted-foreground">
                        • {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Timestamps */}
      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Last Updated: {formatTime(brief.updatedAt)}</span>
              </div>
              {brief.finalizedAt && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  <span>Finalized: {formatTime(brief.finalizedAt)}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
