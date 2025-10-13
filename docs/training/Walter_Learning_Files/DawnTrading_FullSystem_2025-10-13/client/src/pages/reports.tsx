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
  const [location, navigate] = useLocation();
  
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

      <Tabs 
        value={tabParam || "trade-history"} 
        onValueChange={(value) => {
          navigate(`/reports?tab=${value}`);
        }}
        className="space-y-6"
      >
        <TabsList className="grid w-full max-w-4xl grid-cols-4">
          <TabsTrigger value="trade-history" data-testid="tab-trade-history">Trade History</TabsTrigger>
          <TabsTrigger value="canned" data-testid="tab-canned-reports">Canned Reports</TabsTrigger>
          <TabsTrigger value="custom" data-testid="tab-custom-reports">Custom Reports</TabsTrigger>
          <TabsTrigger value="exports" data-testid="tab-exports">Exports</TabsTrigger>
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

        {/* Trade History Tab */}
        <TabsContent value="trade-history" className="space-y-6">
          <TradeHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const strategyColors = {
  vwap_pullback: "bg-primary/10 text-primary",
  abcd_long: "bg-chart-2/10 text-chart-2",
  sma_trend_ride: "bg-chart-3/10 text-chart-3"
};

const strategyNames = {
  vwap_pullback: "VWAP Pullback",
  abcd_long: "ABCD Long",
  sma_trend_ride: "SMA Trend Ride"
};

function TradeHistoryTab() {
  const [filters, setFilters] = useState({
    symbol: '',
    strategy: 'all',
    status: 'closed',
    dateFrom: '',
    dateTo: ''
  });
  
  const { data: trades = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/trades'],
    refetchInterval: 30000
  });

  const filteredTrades = trades.filter((trade: any) => {
    if (filters.symbol && !trade.symbol.toLowerCase().includes(filters.symbol.toLowerCase())) {
      return false;
    }
    if (filters.strategy && filters.strategy !== 'all' && trade.strategy !== filters.strategy) {
      return false;
    }
    return true;
  });

  const getSymbolColor = (symbol: string) => {
    if (symbol.includes('BTC')) return 'text-orange-500';
    if (symbol.includes('ETH')) return 'text-blue-500';
    return 'text-primary';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-24" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-normal mb-2">
              This tab displays historical trade data for Paper and Live modes.
            </div>
            <div className="text-2xl">Filters</div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Input
              placeholder="Search symbol..."
              value={filters.symbol}
              onChange={(e) => setFilters(prev => ({ ...prev, symbol: e.target.value }))}
              data-testid="input-symbol-filter"
            />
            
            <Select 
              value={filters.strategy} 
              onValueChange={(value) => setFilters(prev => ({ ...prev, strategy: value }))}
            >
              <SelectTrigger data-testid="select-strategy-filter">
                <SelectValue placeholder="All strategies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All strategies</SelectItem>
                <SelectItem value="vwap_pullback">VWAP Pullback</SelectItem>
                <SelectItem value="abcd_long">ABCD Long</SelectItem>
                <SelectItem value="sma_trend_ride">SMA Trend Ride</SelectItem>
              </SelectContent>
            </Select>
            
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
              data-testid="input-date-from"
            />
            
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
              data-testid="input-date-to"
            />
            
            <Button
              variant="outline"
              onClick={() => setFilters({
                symbol: '',
                strategy: 'all',
                status: 'closed',
                dateFrom: '',
                dateTo: ''
              })}
              data-testid="button-clear-filters"
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {filteredTrades.length} Trade{filteredTrades.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTrades.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No trades match your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Date</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Symbol</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Strategy</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Entry</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Exit</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Quantity</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">P/L</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">R</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Fees</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTrades.map((trade: any) => {
                    const realizedPL = parseFloat(trade.realizedPL || '0');
                    const realizedPLR = parseFloat(trade.realizedPLR || '0');
                    const isProfit = realizedPL > 0;
                    const totalFees = parseFloat(trade.entryFee || '0') + parseFloat(trade.exitFee || '0');
                    
                    return (
                      <tr key={trade.id} className="hover:bg-muted/50" data-testid={`trade-history-${trade.id}`}>
                        <td className="p-3 text-sm">
                          {trade.exitTime ? 
                            new Date(trade.exitTime).toLocaleDateString() : 
                            new Date(trade.entryTime).toLocaleDateString()
                          }
                        </td>
                        
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-semibold", getSymbolColor(trade.symbol))}>
                              {trade.symbol}
                            </span>
                            <Badge variant={trade.mode === 'live' ? 'default' : 'secondary'} className="text-xs">
                              {trade.mode}
                            </Badge>
                          </div>
                        </td>
                        
                        <td className="p-3">
                          <Badge className={cn("text-xs", strategyColors[trade.strategy as keyof typeof strategyColors] || "bg-muted/10")}>
                            {strategyNames[trade.strategy as keyof typeof strategyNames] || trade.strategy}
                          </Badge>
                        </td>
                        
                        <td className="p-3 font-mono text-sm">
                          {trade.entryPrice ? `$${parseFloat(trade.entryPrice).toFixed(4)}` : '-'}
                        </td>
                        
                        <td className="p-3 font-mono text-sm">
                          {trade.exitPrice ? `$${parseFloat(trade.exitPrice).toFixed(4)}` : '-'}
                        </td>
                        
                        <td className="p-3 font-mono text-sm">
                          {trade.quantity ? parseFloat(trade.quantity).toLocaleString() : '-'}
                        </td>
                        
                        <td className="p-3">
                          <div className={cn("font-mono text-sm font-semibold", isProfit ? "text-success" : "text-destructive")}>
                            {isProfit ? '+' : ''}${realizedPL.toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {trade.entryPrice && trade.quantity ? 
                              ((realizedPL / (parseFloat(trade.entryPrice) * parseFloat(trade.quantity))) * 100).toFixed(2) : '0.00'}%
                          </div>
                        </td>
                        
                        <td className="p-3">
                          <div className={cn("font-mono text-sm font-semibold", realizedPLR >= 0 ? "text-success" : "text-destructive")}>
                            {realizedPLR >= 0 ? '+' : ''}{realizedPLR.toFixed(2)}R
                          </div>
                        </td>
                        
                        <td className="p-3 font-mono text-xs text-muted-foreground">
                          ${totalFees.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
