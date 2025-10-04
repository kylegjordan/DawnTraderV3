import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAI } from "@/hooks/use-trading";
import { Brain, Search, FileText, TrendingUp, Target, MessageSquare, History, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatContainer } from "@/components/ai/chat-container";
import { AuditLogViewer } from "@/components/ai/audit-log-viewer";
import { ErrorLogViewer } from "@/components/ai/error-log-viewer";
import { AIOpportunitiesTab } from "@/components/ai/ai-opportunities-tab";
import { ValidationReportsTab } from "@/components/ai/validation-reports-tab";

export default function Analysis() {
  const [searchSymbol, setSearchSymbol] = useState('');
  const [reportType, setReportType] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  
  const {
    aiReports,
    reportsLoading,
    generateReport,
    isGeneratingReport,
    analyzeSymbol,
    isAnalyzingSymbol,
    symbolAnalysis
  } = useAI();

  const handleGenerateReport = () => {
    generateReport(reportType);
  };

  const handleAnalyzeSymbol = () => {
    if (searchSymbol.trim()) {
      analyzeSymbol(searchSymbol.trim().toUpperCase());
    }
  };

  const formatReportContent = (content: string) => {
    // Simple markdown-like formatting
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
    <div className="p-6 space-y-6" data-testid="analysis-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
          <Brain className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">AI Analysis</h1>
          <p className="text-muted-foreground">AI-powered trading insights and recommendations</p>
        </div>
      </div>

      <Tabs defaultValue="chat" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="chat" data-testid="tab-chat">
            <MessageSquare className="w-4 h-4 mr-2" />
            Chat Assistant
          </TabsTrigger>
          <TabsTrigger value="opportunities" data-testid="tab-opportunities">
            <Target className="w-4 h-4 mr-2" />
            AI Opportunities
          </TabsTrigger>
          <TabsTrigger value="validation" data-testid="tab-validation">
            <TrendingUp className="w-4 h-4 mr-2" />
            Validation Reports
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">
            <FileText className="w-4 h-4 mr-2" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="search" data-testid="tab-search">
            <Search className="w-4 h-4 mr-2" />
            Symbol Analysis
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">
            <History className="w-4 h-4 mr-2" />
            Audit Log
          </TabsTrigger>
          <TabsTrigger value="errors" data-testid="tab-errors">
            <AlertCircle className="w-4 h-4 mr-2" />
            Error Logs
          </TabsTrigger>
        </TabsList>

        {/* Chat Assistant Tab */}
        <TabsContent value="chat">
          <ChatContainer />
        </TabsContent>

        {/* AI Opportunities Tab */}
        <TabsContent value="opportunities">
          <AIOpportunitiesTab />
        </TabsContent>

        {/* Validation Reports Tab */}
        <TabsContent value="validation">
          <ValidationReportsTab />
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-6">
          {/* Generate New Report */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Generate New Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Select value={reportType} onValueChange={(value: any) => setReportType(value)}>
                  <SelectTrigger className="w-48" data-testid="select-report-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily Report</SelectItem>
                    <SelectItem value="weekly">Weekly Report</SelectItem>
                    <SelectItem value="monthly">Monthly Report</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleGenerateReport}
                  disabled={isGeneratingReport}
                  data-testid="button-generate-report"
                >
                  {isGeneratingReport ? 'Generating...' : 'Generate Report'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Reports */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Recent Reports</h2>
            
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
                      <p className="text-muted-foreground">No reports generated yet</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Generate your first AI report to get started
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  aiReports.map((report) => (
                    <Card key={report.id} data-testid={`report-${report.id}`}>
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

        {/* Symbol Analysis Tab */}
        <TabsContent value="search" className="space-y-6">
          {/* Search */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Symbol Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Input
                  placeholder="Enter symbol (e.g., BTC, ETH, SOL)..."
                  value={searchSymbol}
                  onChange={(e) => setSearchSymbol(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAnalyzeSymbol()}
                  className="flex-1"
                  data-testid="input-symbol-search"
                />
                <Button
                  onClick={handleAnalyzeSymbol}
                  disabled={isAnalyzingSymbol || !searchSymbol.trim()}
                  data-testid="button-analyze-symbol"
                >
                  {isAnalyzingSymbol ? 'Analyzing...' : 'Analyze'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Analysis Results */}
          {symbolAnalysis && (
            <>
              {/* Live Market Data */}
              {symbolAnalysis.livePrice && (
                <Card className="border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      Live Market Data
                      <span className="ml-auto text-xs font-normal text-muted-foreground">
                        Source: {symbolAnalysis.dataSource?.toUpperCase()}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Current Price</div>
                        <div className="text-2xl font-bold text-foreground" data-testid="text-live-price">
                          ${symbolAnalysis.livePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">24h Change</div>
                        <div className={`text-2xl font-bold ${symbolAnalysis.change24h && symbolAnalysis.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-change-24h">
                          {symbolAnalysis.change24h !== undefined ? `${symbolAnalysis.change24h >= 0 ? '+' : ''}${symbolAnalysis.change24h.toFixed(2)}%` : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">24h Volume</div>
                        <div className="text-2xl font-bold text-foreground" data-testid="text-volume-24h">
                          {symbolAnalysis.volume24h ? `$${(symbolAnalysis.volume24h / 1000000).toFixed(1)}M` : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Last Updated</div>
                        <div className="text-sm font-medium text-foreground" data-testid="text-timestamp">
                          {symbolAnalysis.timestamp ? new Date(symbolAnalysis.timestamp).toLocaleTimeString() : 'N/A'}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Technical Analysis */}
                <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-chart-1" />
                    Technical Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-sm text-foreground leading-relaxed">
                      {symbolAnalysis.technicalAnalysis}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Strategy Recommendations */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-chart-2" />
                    Strategy Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-sm text-foreground leading-relaxed">
                      {symbolAnalysis.strategyRecommendations}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Risk Assessment */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-warning/20 flex items-center justify-center">
                      <div className="w-2 h-2 bg-warning rounded-full" />
                    </div>
                    Risk Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-sm text-foreground leading-relaxed">
                      {symbolAnalysis.riskAssessment}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Historical Performance */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-chart-4" />
                    Historical Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-sm text-foreground leading-relaxed">
                      {symbolAnalysis.historicalPerformance}
                    </p>
                  </div>
                </CardContent>
              </Card>
              </div>
            </>
          )}

          {isAnalyzingSymbol && (
            <Card>
              <CardContent className="p-8">
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 bg-primary rounded-full animate-bounce" />
                  <div className="w-4 h-4 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-4 h-4 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <span className="ml-4 text-muted-foreground">Analyzing symbol...</span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit">
          <AuditLogViewer />
        </TabsContent>

        {/* Error Logs Tab */}
        <TabsContent value="errors">
          <ErrorLogViewer />
        </TabsContent>
      </Tabs>
    </div>
  );
}
