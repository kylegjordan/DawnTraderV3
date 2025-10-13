import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { CalendarIcon, Download, FileText, TrendingUp, DollarSign, PieChart, Brain, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Trade } from "@/lib/types";
import { Link } from "wouter";

export default function ReportsPage() {
  const [location] = useLocation();
  
  // Parse tab from query parameter
  const params = new URLSearchParams(location.split('?')[1] || '');
  const tabParam = params.get('tab');
  
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [selectedSymbol, setSelectedSymbol] = useState<string>("all");
  const [selectedStrategy, setSelectedStrategy] = useState<string>("all");
  const [selectedMode, setSelectedMode] = useState<string>("all");
  const [reportType, setReportType] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const queryClient = useQueryClient();

  // Fetch all trades for reports
  const { data: allTrades = [] } = useQuery<Trade[]>({
    queryKey: ['/api/trades', {}],
  });

  // Fetch AI reports
  const { data: aiReports = [], isLoading: reportsLoading } = useQuery<any[]>({
    queryKey: ['/api/ai/reports'],
  });

  // Generate AI report mutation
  const generateReportMutation = useMutation({
    mutationFn: async (type: 'daily' | 'weekly' | 'monthly') => {
      return await apiRequest('POST', '/api/ai/generate-report', { reportType: type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai/reports'] });
    },
  });

  const handleExportCSV = (reportType: string) => {
    // Build query params
    const params = new URLSearchParams();
    params.append('format', 'csv');
    params.append('reportType', reportType);
    if (dateFrom) params.append('from', format(dateFrom, 'yyyy-MM-dd'));
    if (dateTo) params.append('to', format(dateTo, 'yyyy-MM-dd'));
    if (selectedSymbol !== 'all') params.append('symbol', selectedSymbol);
    if (selectedStrategy !== 'all') params.append('strategy', selectedStrategy);
    if (selectedMode !== 'all') params.append('mode', selectedMode);

    // Download CSV
    window.location.href = `/api/reports/export?${params.toString()}`;
  };

  const handleExportPDF = (reportType: string) => {
    // Build query params
    const params = new URLSearchParams();
    params.append('format', 'pdf');
    params.append('reportType', reportType);
    if (dateFrom) params.append('from', format(dateFrom, 'yyyy-MM-dd'));
    if (dateTo) params.append('to', format(dateTo, 'yyyy-MM-dd'));
    if (selectedSymbol !== 'all') params.append('symbol', selectedSymbol);
    if (selectedStrategy !== 'all') params.append('strategy', selectedStrategy);
    if (selectedMode !== 'all') params.append('mode', selectedMode);

    // Download PDF
    window.location.href = `/api/reports/export?${params.toString()}`;
  };

  // Get unique symbols and strategies from trades
  const uniqueSymbols = Array.from(new Set(allTrades.map(t => t.symbol)));
  const uniqueStrategies = Array.from(new Set(allTrades.map(t => t.strategy)));

  const formatReportContent = (content: string) => {
    return content.split('\n').map((line, index) => {
      if (line.startsWith('# ')) {
        return <h3 key={index} className="text-lg font-bold text-foreground mt-4 mb-2">{line.slice(2)}</h3>;
      }
      if (line.startsWith('## ')) {
        return <h4 key={index} className="text-md font-semibold text-foreground mt-3 mb-2">{line.slice(3)}</h4>;
      }
      if (line.startsWith('- ')) {
        return <li key={index} className="text-sm text-foreground ml-4 mb-1">{line.slice(2)}</li>;
      }
      if (line.trim()) {
        return <p key={index} className="text-sm text-foreground mb-2 leading-relaxed">{line}</p>;
      }
      return <br key={index} />;
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground" data-testid="text-reports-title">Reports</h1>
          <p className="text-muted-foreground mt-1">Generate and export comprehensive trading reports</p>
        </div>
      </div>

      <Tabs defaultValue={tabParam || "canned"} className="space-y-6">
        <TabsList className="grid w-full max-w-5xl grid-cols-5">
          <TabsTrigger value="canned" data-testid="tab-canned-reports">Canned Reports</TabsTrigger>
          <TabsTrigger value="custom" data-testid="tab-custom-reports">Custom Reports</TabsTrigger>
          <TabsTrigger value="exports" data-testid="tab-exports">Exports</TabsTrigger>
          <TabsTrigger value="ai-reports" data-testid="tab-ai-reports">AI Reports</TabsTrigger>
          <TabsTrigger value="daily-briefs" data-testid="tab-daily-briefs">Daily Briefs</TabsTrigger>
        </TabsList>

        {/* Canned Reports Tab */}
        <TabsContent value="canned" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Tax Report */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <CardTitle>Tax Report</CardTitle>
                </div>
                <CardDescription>
                  Accountant-ready report with all data required for tax filing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Includes:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Trade ID, Date/Time (UTC & Local), Symbol</li>
                  <li>Entry/Exit prices, Quantity, Fees</li>
                  <li>Gross/Net P/L, P/L %, Holding duration</li>
                  <li>Short-term vs. Long-term classification</li>
                  <li>Cost basis and realized gains</li>
                </ul>
                <div className="flex gap-2 pt-2">
                  <Button 
                    onClick={() => handleExportCSV('tax')}
                    size="sm"
                    className="flex-1"
                    data-testid="button-export-tax-csv"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                  <Button 
                    onClick={() => handleExportPDF('tax')}
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    data-testid="button-export-tax-pdf"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Performance Summary Report */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <CardTitle>Performance Summary</CardTitle>
                </div>
                <CardDescription>
                  Aggregated KPIs by symbol, strategy, or account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Includes:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Win rate and total trades</li>
                  <li>Average R Multiple</li>
                  <li>Maximum drawdown</li>
                  <li>Total P/L and Sharpe Ratio</li>
                  <li>Performance by symbol/strategy</li>
                </ul>
                <div className="flex gap-2 pt-2">
                  <Button 
                    onClick={() => handleExportCSV('performance')}
                    size="sm"
                    className="flex-1"
                    data-testid="button-export-performance-csv"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                  <Button 
                    onClick={() => handleExportPDF('performance')}
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    data-testid="button-export-performance-pdf"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Trade Journal Report */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <CardTitle>Trade Journal</CardTitle>
                </div>
                <CardDescription>
                  Chronological trade-by-trade log with outcomes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Includes:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Complete trade history</li>
                  <li>Entry/exit details and timestamps</li>
                  <li>Strategy and trade outcomes</li>
                  <li>Notes and observations</li>
                  <li>P/L and R-multiples</li>
                </ul>
                <div className="flex gap-2 pt-2">
                  <Button 
                    onClick={() => handleExportCSV('journal')}
                    size="sm"
                    className="flex-1"
                    data-testid="button-export-journal-csv"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                  <Button 
                    onClick={() => handleExportPDF('journal')}
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    data-testid="button-export-journal-pdf"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Fees & Costs Report */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-primary" />
                  <CardTitle>Fees & Costs</CardTitle>
                </div>
                <CardDescription>
                  Summarized fees by month, exchange, and symbol
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Includes:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Total fees by month</li>
                  <li>Entry and exit fees</li>
                  <li>Fees by symbol</li>
                  <li>Average fee per trade</li>
                  <li>Useful for tax deductions</li>
                </ul>
                <div className="flex gap-2 pt-2">
                  <Button 
                    onClick={() => handleExportCSV('fees')}
                    size="sm"
                    className="flex-1"
                    data-testid="button-export-fees-csv"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                  <Button 
                    onClick={() => handleExportPDF('fees')}
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    data-testid="button-export-fees-pdf"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* P&L Reports */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-primary" />
                  <CardTitle>P&L Reports</CardTitle>
                </div>
                <CardDescription>
                  Monthly, Quarterly, and Annual aggregated totals
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Includes:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Gross P/L, Net P/L, Total Fees</li>
                  <li>Win/Loss count and win rate</li>
                  <li>Average hold time</li>
                  <li>Monthly, Quarterly, Annual breakdowns</li>
                </ul>
                <div className="flex gap-2 pt-2">
                  <Button 
                    onClick={() => handleExportCSV('pnl-monthly')}
                    size="sm"
                    variant="outline"
                    data-testid="button-export-pnl-monthly"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Monthly
                  </Button>
                  <Button 
                    onClick={() => handleExportCSV('pnl-quarterly')}
                    size="sm"
                    variant="outline"
                    data-testid="button-export-pnl-quarterly"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Quarterly
                  </Button>
                  <Button 
                    onClick={() => handleExportCSV('pnl-annual')}
                    size="sm"
                    variant="outline"
                    data-testid="button-export-pnl-annual"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Annual
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Custom Reports Tab */}
        <TabsContent value="custom" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Custom Report Builder</CardTitle>
              <CardDescription>
                Filter and generate custom reports based on your criteria
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Date Range */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>From Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !dateFrom && "text-muted-foreground"
                        )}
                        data-testid="button-date-from"
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
                <div className="space-y-2">
                  <Label>To Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !dateTo && "text-muted-foreground"
                        )}
                        data-testid="button-date-to"
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
              </div>

              {/* Filters */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="symbol">Symbol</Label>
                  <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                    <SelectTrigger id="symbol" data-testid="select-symbol">
                      <SelectValue placeholder="All Symbols" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Symbols</SelectItem>
                      {uniqueSymbols.map(symbol => (
                        <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="strategy">Strategy</Label>
                  <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                    <SelectTrigger id="strategy" data-testid="select-strategy">
                      <SelectValue placeholder="All Strategies" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Strategies</SelectItem>
                      {uniqueStrategies.map(strategy => (
                        <SelectItem key={strategy} value={strategy}>{strategy}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mode">Trading Mode</Label>
                  <Select value={selectedMode} onValueChange={setSelectedMode}>
                    <SelectTrigger id="mode" data-testid="select-mode">
                      <SelectValue placeholder="All Modes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Modes</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="paper">Paper</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Export Buttons */}
              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={() => handleExportCSV('custom')}
                  className="flex-1"
                  data-testid="button-generate-custom-csv"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Generate CSV
                </Button>
                <Button 
                  onClick={() => handleExportPDF('custom')}
                  variant="outline"
                  className="flex-1"
                  data-testid="button-generate-custom-pdf"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Generate PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exports Tab */}
        <TabsContent value="exports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick Exports</CardTitle>
              <CardDescription>
                One-click exports of common report formats
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">All Trades (CSV)</p>
                    <p className="text-sm text-muted-foreground">Complete trade history</p>
                  </div>
                  <Button 
                    onClick={() => handleExportCSV('all-trades')}
                    size="sm"
                    data-testid="button-export-all-trades"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">YTD Summary (PDF)</p>
                    <p className="text-sm text-muted-foreground">Year-to-date performance summary</p>
                  </div>
                  <Button 
                    onClick={() => handleExportPDF('ytd-summary')}
                    size="sm"
                    variant="outline"
                    data-testid="button-export-ytd"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Tax Year 2024 (CSV)</p>
                    <p className="text-sm text-muted-foreground">All 2024 trades for tax filing</p>
                  </div>
                  <Button 
                    onClick={() => handleExportCSV('tax-2024')}
                    size="sm"
                    data-testid="button-export-tax-2024"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Reports Tab */}
        <TabsContent value="ai-reports" className="space-y-6">
          {/* Generate New AI Report */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Generate New AI Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Select value={reportType} onValueChange={(value: any) => setReportType(value)}>
                  <SelectTrigger className="w-48" data-testid="select-ai-report-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily Report</SelectItem>
                    <SelectItem value="weekly">Weekly Report</SelectItem>
                    <SelectItem value="monthly">Monthly Report</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => generateReportMutation.mutate(reportType)}
                  disabled={generateReportMutation.isPending}
                  data-testid="button-generate-ai-report"
                >
                  {generateReportMutation.isPending ? 'Generating...' : 'Generate Report'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent AI Reports */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Recent AI Reports</h2>
            
            {reportsLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <div className="flex justify-between">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-24 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {aiReports.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <p className="text-muted-foreground">No AI reports generated yet</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Generate your first AI report to get started
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  aiReports.map((report: any) => (
                    <Card key={report.id} data-testid={`ai-report-${report.id}`}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="capitalize">
                            {report.reportType} Report - {report.period}
                          </CardTitle>
                          <span className="text-sm text-muted-foreground">
                            {new Date(report.generatedAt).toLocaleString()}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="prose prose-sm max-w-none">
                          {formatReportContent(report.content)}
                        </div>
                        
                        {report.metrics && (
                          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                            {Object.entries(report.metrics as Record<string, any>).map(([key, value]) => (
                              <div key={key} className="text-center">
                                <div className="text-lg font-bold text-foreground">
                                  {typeof value === 'number' ? value.toFixed(2) : String(value)}
                                </div>
                                <div className="text-xs text-muted-foreground capitalize">
                                  {key.replace(/([A-Z])/g, ' $1').trim()}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Daily Briefs Tab */}
        <TabsContent value="daily-briefs" className="space-y-6">
          <DailyBriefsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DailyBriefsTab() {
  const { data: briefs = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/daily-briefs'],
  });

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

  if (briefs.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Newspaper className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Daily Briefs Yet</h3>
          <p className="text-muted-foreground mb-4">
            Daily briefs are automatically generated every day. Check back soon!
          </p>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Daily Trading Briefs</h2>
          <p className="text-muted-foreground mt-1">
            Review your daily trading performance summaries and insights
          </p>
        </div>
        <Link href="/daily-brief">
          <Button data-testid="button-view-today-brief">
            <Newspaper className="h-4 w-4 mr-2" />
            View Today's Brief
          </Button>
        </Link>
      </div>

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
    </div>
  );
}
