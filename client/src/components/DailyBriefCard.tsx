import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, TrendingUp, AlertCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'wouter';

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

export default function DailyBriefCard() {
  const { data: brief, isLoading } = useQuery<DailyBrief | null>({
    queryKey: ['/api/daily-briefs/today']
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
    <Card className="border-2" data-testid="card-daily-brief">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl mb-3" data-testid="text-card-title">
              Current Daily Briefing
            </CardTitle>
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

        {/* Key Metrics Row */}
        {brief.metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Trades</p>
              <p className="text-lg font-semibold" data-testid="text-num-trades">
                {brief.metrics.num_trades}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Win Rate</p>
              <p className="text-lg font-semibold" data-testid="text-win-rate">
                {brief.metrics.win_rate?.toFixed(0) ?? '0'}%
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Total P&L</p>
              <p 
                className={`text-lg font-semibold ${
                  (brief.metrics.realized_pl + brief.metrics.unrealized_pl) >= 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}
                data-testid="text-total-pnl"
              >
                ${(brief.metrics.realized_pl + brief.metrics.unrealized_pl) >= 0 ? '+' : ''}
                {(brief.metrics.realized_pl + brief.metrics.unrealized_pl).toFixed(2)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Portfolio %</p>
              <p 
                className={`text-lg font-semibold ${
                  brief.metrics.pnl_pct >= 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}
                data-testid="text-pnl-pct"
              >
                {brief.metrics.pnl_pct >= 0 ? '+' : ''}{brief.metrics.pnl_pct.toFixed(2)}%
              </p>
            </div>
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
                  {brief.systemHealth.issues.length} issue(s) detected
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
