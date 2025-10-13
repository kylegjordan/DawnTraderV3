import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAI } from "@/hooks/use-trading";
import { Brain, Search, FileText, Target, MessageSquare, AlertCircle, Loader2, TrendingUp } from "lucide-react";
import { ChatContainer } from "@/components/ai/chat-container";
import { AIOpportunitiesTab } from "@/components/ai/ai-opportunities-tab";
import { apiRequest } from "@/lib/queryClient";
import type { SearchResult, AssetContext } from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function Analysis() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<AssetContext | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [noResultsQuery, setNoResultsQuery] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState<string>('');
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  
  const {
    analyzeSymbol,
    isAnalyzingSymbol,
    symbolAnalysis
  } = useAI();
  
  // Clear analysis results when starting a new search
  const clearPreviousAnalysis = () => {
    // Reset queries and clear mutation cache
    queryClient.resetQueries({ queryKey: ['analyzeSymbol'], exact: false });
    queryClient.getMutationCache().clear();
  };

  // Search for stocks and crypto
  const performSearch = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      setNoResultsQuery(null);
      return;
    }

    setIsSearching(true);
    setNoResultsQuery(null);
    
    try {
      const [stockResults, cryptoResults] = await Promise.all([
        apiRequest<SearchResult[]>('GET', `/api/stocks/search/${encodeURIComponent(query)}`).catch(() => []),
        apiRequest<SearchResult[]>('GET', `/api/crypto/search/${encodeURIComponent(query)}`).catch(() => [])
      ]);

      const combined = [
        ...stockResults.map(r => ({ ...r, type: 'Stock' })),
        ...cryptoResults
      ].slice(0, 8);

      setSearchResults(combined);
      setShowDropdown(query.length >= 2);
      
      // Clear previous analysis and selected asset if no results found
      if (combined.length === 0) {
        setNoResultsQuery(query);
        setSelectedAsset(null);
        clearPreviousAnalysis();
      }
    } catch (error) {
      setSearchResults([]);
      setShowDropdown(false);
      setNoResultsQuery(null);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectResult = (result: SearchResult) => {
    const cleanSymbol = result.symbol.match(/^([A-Z0-9\-_]+)/)?.[1] || result.symbol;
    const symbolToAnalyze = cleanSymbol.toUpperCase();
    
    // Reset ALL states before starting new analysis
    setNoResultsQuery(null);
    setCurrentQuery(symbolToAnalyze);
    clearPreviousAnalysis();
    setSearchResults([]);
    
    const assetType = result.type === 'Stock' ? 'stock' : 'crypto';
    setSelectedAsset({
      symbol: symbolToAnalyze,
      name: result.description,
      type: assetType
    });
    setSearchQuery(`${symbolToAnalyze} - ${result.description}`);
    setShowDropdown(false);
    
    // Automatically analyze the selected asset
    analyzeSymbol(symbolToAnalyze, {
      onSuccess: (data: any) => {
        // Clear "no results" flag BEFORE setting analysis data
        setNoResultsQuery('');
      },
      onError: (error: any) => {
        // Set "no results" state only on error
        setNoResultsQuery(symbolToAnalyze);
      }
    });
  };

  const handleAnalyzeSymbol = () => {
    // Get symbol BEFORE clearing states - extract only ticker symbol
    let rawSymbol = selectedAsset 
      ? selectedAsset.symbol 
      : searchQuery.trim().split(/[\s\-]/)[0];
    
    const cleanSymbol = rawSymbol.match(/^([A-Z0-9\-_]+)/i)?.[1] || rawSymbol;
    const symbolToAnalyze = cleanSymbol.toUpperCase();
    
    // Reset ALL states at the start of every new search to prevent leftovers
    setNoResultsQuery(null);
    setCurrentQuery(symbolToAnalyze);
    clearPreviousAnalysis();
    
    analyzeSymbol(symbolToAnalyze, {
      onSuccess: (data: any) => {
        // Clear "no results" flag BEFORE setting analysis data
        setNoResultsQuery('');
      },
      onError: (error: any) => {
        // Set "no results" state only on error
        setNoResultsQuery(symbolToAnalyze);
      }
    });
  };

  const handleStartChat = async () => {
    if (!selectedAsset || !symbolAnalysis) return;

    try {
      // Create a new conversation with context
      const conversation = await apiRequest('POST', '/api/conversations', {
        title: `${selectedAsset.name} (${selectedAsset.symbol}) Analysis`
      });

      if (conversation?.id) {
        // Send initial message with context
        const contextMessage = `Let's discuss ${selectedAsset.name} (${selectedAsset.symbol}) — show me its latest trading analysis.`;
        
        await apiRequest('POST', `/api/conversations/${conversation.id}/message`, {
          message: contextMessage,
          context: {
            asset: selectedAsset,
            analysis: symbolAnalysis
          }
        });

        // Switch to chat tab
        const chatTab = document.querySelector('[data-testid="tab-chat"]') as HTMLElement;
        if (chatTab) {
          chatTab.click();
          
          // Navigate to the conversation
          setTimeout(() => {
            window.location.hash = `#/analysis?conversation_id=${conversation.id}`;
          }, 100);
        }
      }
    } catch (error) {
      // Error starting chat
    }
  };

  // Define flag to check if data is pending for the same query
  const dataPending = isAnalyzingSymbol;

  return (
    <div className="p-6 space-y-6" data-testid="analysis-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
          <Brain className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">AI Analysis</h1>
          <p className="text-muted-foreground">AI-powered trading insights for stocks and crypto</p>
        </div>
      </div>

      <Tabs defaultValue="chat" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="chat" data-testid="tab-chat">
            <MessageSquare className="w-4 h-4 mr-2" />
            Chat Assistant
          </TabsTrigger>
          <TabsTrigger value="opportunities" data-testid="tab-opportunities">
            <Target className="w-4 h-4 mr-2" />
            AI Opportunities
          </TabsTrigger>
          <TabsTrigger value="search" data-testid="tab-search">
            <Search className="w-4 h-4 mr-2" />
            Symbol Analysis
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

        {/* Symbol Analysis Tab */}
        <TabsContent value="search" className="space-y-6">
          {/* Search */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Symbol Analysis - Stocks & Crypto
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Search by company name or crypto name (e.g., "Apple", "Bitcoin", "Tesla")
              </p>
            </CardHeader>
            <CardContent>
              <div className="relative" ref={dropdownRef}>
                <div className="flex gap-4">
                  <div className="flex-1 relative">
                    <Input
                      placeholder="Type a company or crypto name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleAnalyzeSymbol();
                          setShowDropdown(false);
                        }
                      }}
                      className="flex-1"
                      data-testid="input-symbol-search"
                    />
                    {isSearching && (
                      <Loader2 className="absolute right-3 top-3 w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <Button
                    onClick={handleAnalyzeSymbol}
                    disabled={isAnalyzingSymbol || (!selectedAsset && !searchQuery.trim())}
                    data-testid="button-analyze-symbol"
                  >
                    {isAnalyzingSymbol ? 'Analyzing...' : 'Analyze'}
                  </Button>
                </div>

                {/* Dropdown suggestions */}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-2 bg-background border border-border rounded-md shadow-lg max-h-64 overflow-auto">
                    {searchResults.map((result, index) => (
                      <div
                        key={`${result.symbol}-${index}`}
                        onClick={() => handleSelectResult(result)}
                        className="px-4 py-3 hover:bg-accent cursor-pointer flex items-center justify-between"
                        data-testid={`search-result-${result.symbol}`}
                      >
                        <div>
                          <div className="font-medium text-foreground">
                            [{result.symbol}] {result.description}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {result.type}
                          </div>
                        </div>
                        <Badge variant={result.type === 'Stock' ? 'default' : 'secondary'}>
                          {result.type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {showDropdown && searchResults.length === 0 && !isSearching && searchQuery.length >= 2 && !selectedAsset && !symbolAnalysis && (
                  <div className="absolute z-50 w-full mt-2 bg-background border border-border rounded-md shadow-lg p-4 text-center text-muted-foreground" data-testid="message-no-results">
                    No results found for "{searchQuery}". Try another keyword.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* No Results Message - Only show if analysis failed and no data exists */}
          {!isAnalyzingSymbol && !symbolAnalysis && !!noResultsQuery && !dataPending && (
            <Card className="border-destructive/20">
              <CardContent className="pt-6 pb-6 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-destructive" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-1" data-testid="text-no-results-title">
                      No results found for "{noResultsQuery}"
                    </h3>
                    <p className="text-muted-foreground">
                      Data temporarily unavailable. Please try again or search for a different symbol.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Analysis Results - Show if we have any valid data */}
          {symbolAnalysis && !noResultsQuery && (
            <>
              {/* Symbol Header with Name and Start Chat Button */}
              {symbolAnalysis.symbolName && (
                <Card className="border-primary/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h2 className="text-2xl font-bold text-foreground" data-testid="text-symbol-name">
                            {symbolAnalysis.symbolName} ({selectedAsset?.symbol || searchQuery.split(' ')[0]})
                          </h2>
                          <Badge variant={symbolAnalysis.assetType === 'stock' ? 'default' : 'secondary'}>
                            {symbolAnalysis.assetType === 'stock' ? 'Stock' : 'Crypto'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Data synced from {symbolAnalysis.dataSource?.toUpperCase() || 'N/A'} • Last updated: {symbolAnalysis.timestamp ? new Date(symbolAnalysis.timestamp).toLocaleString() : 'N/A'}
                        </p>
                      </div>
                      <Button
                        onClick={handleStartChat}
                        variant="outline"
                        className="gap-2"
                        data-testid="button-start-chat"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Start a Chat
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Live Market Data */}
              {symbolAnalysis.livePrice && (
                <Card className="border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      Live Market Data
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
                  <span className="ml-4 text-muted-foreground">Analyzing {selectedAsset?.symbol || currentQuery}...</span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
