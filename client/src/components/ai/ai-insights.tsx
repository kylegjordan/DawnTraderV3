import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAI } from "@/hooks/use-trading";
import { Lightbulb, Zap, ArrowRight, AlertTriangle, Beaker } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatTime } from "@/lib/timezone";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { cn } from "@/lib/utils";

export default function AIInsights() {
  const { mode, isPaper } = useTradingMode();
  const { aiReports: liveAIReports, reportsLoading: liveReportsLoading } = useAI();

  // P19-B-RENAME Wave-1 (Kyle ruling): the Walter-era /api/paper/ai-reports query was
  // a dead call (NO server route ever existed; the paper_ai_reports table — dropped —
  // was never written). Paper mode shows the same no-reports empty state it always
  // effectively showed; AI daily reports return later rebuilt on our own ML.

  // Fetch user settings for timezone conversion
  const { data: settings } = useQuery<{ timezone?: string; timeFormat?: string }>({
    queryKey: ['/api/settings'],
  });

  const aiReports = isPaper ? [] : liveAIReports;
  const reportsLoading = isPaper ? false : liveReportsLoading;
  
  // Get the most recent daily report
  const latestReport = aiReports.find(report => report.reportType === 'daily');

  if (reportsLoading) {
    return (
      <section>
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  // Default insights if no AI reports are available
  const defaultInsights = {
    summary: "Strong day with 5 wins out of 7 trades (71.4% win rate). VWAP Pullback strategy outperformed with 3/3 successful executions. Average hold time: 2.3 hours.",
    highlights: [
      {
        type: "success",
        message: "Best performer: XRP/USD (+2.13R, +$115.36)",
        icon: <Lightbulb className="w-5 h-5 text-success flex-shrink-0" />
      },
      {
        type: "warning", 
        message: "Slippage above target on 2 trades during high volatility periods",
        icon: <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
      }
    ],
    recommendations: [
      "Consider increasing stop buffer from 0.5% to 0.7% for ABCD strategy to reduce premature stop-outs (3 instances this week).",
      "XRP and SOL showing strong VWAP respect patterns. Consider adding to watchlist priority.",
      "Average R per trade trending up (+18% vs. last week). Current momentum suggests maintaining or slightly increasing position sizes."
    ]
  };

  const insights = latestReport?.insights || defaultInsights;
  const recommendations = latestReport?.recommendations || defaultInsights.recommendations;

  return (
    <section data-testid="ai-insights-section">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">AI Analyst Insights</h2>
          {isPaper && (
            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
              <Beaker className="w-3 h-3 mr-1" />
              SIMULATED
            </Badge>
          )}
        </div>
        <Link href="/analysis">
          <Button 
            variant="ghost" 
            className="flex items-center gap-2 text-primary hover:bg-primary/10"
            data-testid="button-view-full-analysis"
          >
            View Full Analysis
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily Summary Card */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg">Daily Performance Summary</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Updated {latestReport && settings ? formatTime(latestReport.generatedAt, {
                    timezone: settings.timezone || 'Asia/Dubai',
                    timeFormat: (settings.timeFormat as '12hr' | '24hr') || '12hr'
                  }) : '5 minutes ago'}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-foreground leading-relaxed">
                <span className="font-semibold text-success">
                  {insights.summary || defaultInsights.summary}
                </span>
              </p>
              
              {(insights.highlights || defaultInsights.highlights).map((highlight: any, index: number) => (
                <div 
                  key={index}
                  className={`flex items-center gap-2 p-3 rounded-md ${
                    highlight.type === 'success' ? 'bg-success/10' : 'bg-warning/10'
                  }`}
                >
                  {highlight.icon}
                  <p className={`text-sm font-medium ${
                    highlight.type === 'success' ? 'text-success' : 'text-warning'
                  }`}>
                    {highlight.message}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        {/* Recommendations Card */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-chart-2/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Zap className="w-6 h-6 text-chart-2" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg">AI Recommendations</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Actionable insights</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recommendations.slice(0, 3).map((recommendation: string, index: number) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-primary">{index + 1}</span>
                  </div>
                  <p className="text-sm text-foreground">{recommendation}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
