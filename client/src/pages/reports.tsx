import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Download, FileText, TrendingUp, DollarSign, PieChart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Trade } from "@/lib/types";

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [selectedSymbol, setSelectedSymbol] = useState<string>("all");
  const [selectedStrategy, setSelectedStrategy] = useState<string>("all");
  const [selectedMode, setSelectedMode] = useState<string>("all");

  // Fetch all trades for reports
  const { data: allTrades = [] } = useQuery<Trade[]>({
    queryKey: ['/api/trades', {}],
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground" data-testid="text-reports-title">Reports</h1>
          <p className="text-muted-foreground mt-1">Generate and export comprehensive trading reports</p>
        </div>
      </div>

      <Tabs defaultValue="canned" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
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
      </Tabs>
    </div>
  );
}
