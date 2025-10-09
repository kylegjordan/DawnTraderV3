import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  CalendarIcon, 
  AlertCircle, 
  CheckCircle, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  DollarSign, 
  Percent,
  BarChart3,
  Target,
  ArrowLeft,
  Newspaper,
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface DailyBrief {
  id: string;
  date: string;
  status: 'draft' | 'final';
  headline: string;
  summary: string;
  narrative: string;
  tradeHighlights: any[];
  systemHealth: any;
  metrics: {
    num_trades: number;
    win_rate: number;
    realized_pl: number;
    unrealized_pl: number;
    pnl_pct: number;
  };
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
}

export default function BriefingsPage() {
  const [location] = useLocation();
  
  // Parse tab from query parameter
  const params = new URLSearchParams(location.split('?')[1] || '');
  const tabParam = params.get('tab');

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground" data-testid="text-briefings-title">Briefings</h1>
          <p className="text-muted-foreground mt-1">Daily trading summaries and period reports</p>
        </div>
      </div>

      <Tabs defaultValue={tabParam || "current"} className="space-y-6">
        <TabsList>
          <TabsTrigger value="current" data-testid="tab-current-brief">Current Daily Brief</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-daily-briefs">Daily Briefs</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="space-y-6">
          <CurrentDailyBriefTab />
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <DailyBriefsHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CurrentDailyBriefTab() {
  const { data: brief, isLoading } = useQuery<DailyBrief | null>({
    queryKey: ['/api/daily-briefs/today'],
  });

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="current-brief-loading">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!brief) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Daily Briefing Available</h3>
          <p className="text-muted-foreground">
            The daily brief is currently being generated. Please check back in a few minutes.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalPL = brief.metrics 
    ? (brief.metrics.realized_pl || 0) + (brief.metrics.unrealized_pl || 0)
    : 0;
  const isProfitable = totalPL >= 0;

  return (
    <div className="space-y-6" data-testid="current-daily-brief">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-3 h-3 rounded-full",
                brief.status === 'final' ? "bg-green-500" : "bg-yellow-500 animate-pulse"
              )} />
              <Badge variant={brief.status === 'final' ? 'default' : 'secondary'}>
                {brief.status === 'final' ? 'Final' : 'In Progress'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarIcon className="h-4 w-4" />
              <span>{formatDate(brief.date)}</span>
            </div>
          </div>
          <CardTitle className="text-2xl" data-testid="brief-headline">{brief.headline}</CardTitle>
          <CardDescription className="text-base mt-2" data-testid="brief-summary">
            {brief.summary}
          </CardDescription>
        </CardHeader>
      </Card>

      {brief.metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Trades
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="metric-trades">
                {brief.metrics.num_trades}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Win Rate
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="metric-winrate">
                {brief.metrics.win_rate?.toFixed(1) ?? '0'}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Realized P&L
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-3xl font-bold",
                brief.metrics.realized_pl >= 0 
                  ? "text-green-600 dark:text-green-400" 
                  : "text-red-600 dark:text-red-400"
              )} data-testid="metric-realized-pl">
                ${brief.metrics.realized_pl >= 0 ? '+' : ''}{brief.metrics.realized_pl.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Unrealized P&L
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-3xl font-bold",
                brief.metrics.unrealized_pl >= 0 
                  ? "text-green-600 dark:text-green-400" 
                  : "text-red-600 dark:text-red-400"
              )} data-testid="metric-unrealized-pl">
                ${brief.metrics.unrealized_pl >= 0 ? '+' : ''}{brief.metrics.unrealized_pl.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <Percent className="h-4 w-4" />
                Portfolio %
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-3xl font-bold",
                brief.metrics.pnl_pct >= 0 
                  ? "text-green-600 dark:text-green-400" 
                  : "text-red-600 dark:text-red-400"
              )} data-testid="metric-pnl-pct">
                {brief.metrics.pnl_pct >= 0 ? '+' : ''}{brief.metrics.pnl_pct.toFixed(2)}%
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Narrative Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose dark:prose-invert max-w-none" data-testid="brief-narrative">
            {brief.narrative.split('\n').map((paragraph, index) => (
              paragraph.trim() ? <p key={index} className="mb-3 text-foreground">{paragraph}</p> : null
            ))}
          </div>
        </CardContent>
      </Card>

      {brief.tradeHighlights && brief.tradeHighlights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Trade Highlights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {brief.tradeHighlights.map((highlight, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                {highlight.type === 'win' ? (
                  <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="font-semibold text-foreground">{highlight.symbol}</div>
                  <div className="text-sm text-muted-foreground mt-1">{highlight.description}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              <span>Generated: {formatTime(brief.createdAt)}</span>
            </div>
            {brief.status === 'final' && brief.finalizedAt && (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                <span>Finalized: {formatTime(brief.finalizedAt)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DailyBriefsHistoryTab() {
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();

  // Build endpoint with date range if selected
  const buildEndpoint = () => {
    if (dateFrom && dateTo) {
      return `/api/daily-briefs?startDate=${format(dateFrom, 'yyyy-MM-dd')}&endDate=${format(dateTo, 'yyyy-MM-dd')}`;
    }
    return '/api/daily-briefs';
  };

  const { data: briefs = [], isLoading } = useQuery<DailyBrief[]>({
    queryKey: [buildEndpoint()],
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleGenerateReport = () => {
    // This will trigger a re-fetch with the date range
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64 mt-2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Date Range Selection</CardTitle>
          <CardDescription>
            Select a date range to view briefs for a specific period
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateFrom && "text-muted-foreground"
                    )}
                    data-testid="button-start-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateTo && "text-muted-foreground"
                    )}
                    data-testid="button-end-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button 
              onClick={handleGenerateReport}
              disabled={!dateFrom || !dateTo}
              data-testid="button-generate-report"
            >
              <FileText className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {briefs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Newspaper className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {dateFrom && dateTo ? 'No briefs for this period' : 'No Daily Briefs Yet'}
            </h3>
            <p className="text-muted-foreground">
              {dateFrom && dateTo 
                ? 'No briefings were generated for the selected date range. Try a different period.'
                : 'Daily briefs are automatically generated every day. Check back soon!'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {briefs.map((brief) => (
            <Card key={brief.id} data-testid={`brief-${brief.id}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      <CardDescription>
                        {formatDate(brief.date)}
                      </CardDescription>
                      <Badge variant={brief.status === 'final' ? 'default' : 'secondary'}>
                        {brief.status === 'final' ? 'Final' : 'In Progress'}
                      </Badge>
                    </div>
                    <CardTitle data-testid={`brief-headline-${brief.id}`}>
                      {brief.headline}
                    </CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4" data-testid={`brief-summary-${brief.id}`}>
                  {brief.summary}
                </p>

                {brief.metrics && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-foreground">
                        {brief.metrics.num_trades}
                      </div>
                      <div className="text-xs text-muted-foreground">Trades</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-foreground">
                        {brief.metrics.win_rate?.toFixed(1) ?? '0'}%
                      </div>
                      <div className="text-xs text-muted-foreground">Win Rate</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${
                        (brief.metrics.realized_pl + brief.metrics.unrealized_pl) >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        ${((brief.metrics.realized_pl + brief.metrics.unrealized_pl) >= 0 ? '+' : '')}
                        {(brief.metrics.realized_pl + brief.metrics.unrealized_pl).toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">Total P&L</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${
                        brief.metrics.pnl_pct >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {brief.metrics.pnl_pct >= 0 ? '+' : ''}{brief.metrics.pnl_pct.toFixed(2)}%
                      </div>
                      <div className="text-xs text-muted-foreground">Portfolio %</div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end mt-4">
                  <Link href={`/daily-brief?date=${brief.date}`}>
                    <Button variant="outline" size="sm" data-testid={`button-view-brief-${brief.id}`}>
                      View Full Brief
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
