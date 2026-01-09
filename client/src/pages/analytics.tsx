import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Activity, TrendingUp, TrendingDown, AlertCircle, Gauge, RefreshCw, Clock, DollarSign, Target, Zap, BarChart3, Layers } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useTradingMode } from "@/contexts/trading-mode-context";

interface MarketIndicatorsData {
  ok: boolean;
  data: {
    marketRegime: string;
    regimeTitle: string;
    regimeDescription: string;
    favoredSignalTypes: string[];
    favoredStrategies: string[];
    globalFrictionScore: number;
    frictionStatus: string;
    frictionColor: 'green' | 'yellow' | 'orange' | 'red';
    frictionEmoji: string;
    frictionNarrative: string;
    frictionDisplay: string;
  };
  timestamp: string;
}

interface NarrativeEvent {
  id: string;
  timestamp: string;
  type: string;
  symbol: string;
  message: string;
  details?: Record<string, any>;
}

interface NarrativeFeedData {
  ok: boolean;
  data: NarrativeEvent[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    byType: Record<string, number>;
  };
}

const getRegimeIcon = (regime: string) => {
  if (regime.includes('BULL')) return <TrendingUp className="w-5 h-5 text-green-500" />;
  if (regime.includes('BEAR')) return <TrendingDown className="w-5 h-5 text-red-500" />;
  if (regime === 'EXTREME_NOISE') return <AlertCircle className="w-5 h-5 text-red-500 animate-pulse" />;
  return <Activity className="w-5 h-5 text-yellow-500" />;
};

const getRegimeBadgeColor = (regime: string) => {
  if (regime.includes('BULL_STABLE')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (regime.includes('BULL_VOLATILE')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (regime.includes('BEAR_STABLE')) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (regime.includes('BEAR_VOLATILE')) return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
  if (regime === 'EXTREME_NOISE') return 'bg-red-600/30 text-red-300 border-red-600/50';
  return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
};

const getFrictionBgColor = (color: string) => {
  switch (color) {
    case 'green': return 'bg-green-500';
    case 'yellow': return 'bg-yellow-500';
    case 'orange': return 'bg-orange-500';
    case 'red': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
};

const getEventTypeIcon = (type: string) => {
  switch (type) {
    case 'TRADE_OPENED': return <DollarSign className="w-4 h-4 text-green-500" />;
    case 'TRADE_CLOSED': return <Target className="w-4 h-4 text-blue-500" />;
    case 'DSE_RESIZE': return <BarChart3 className="w-4 h-4 text-yellow-500" />;
    case 'TRAILING_EXIT_UPDATE': return <Zap className="w-4 h-4 text-purple-500" />;
    case 'MANUAL_OVERRIDE': return <AlertCircle className="w-4 h-4 text-orange-500" />;
    default: return <Activity className="w-4 h-4 text-muted-foreground" />;
  }
};

const getEventTypeBadge = (type: string) => {
  const colors: Record<string, string> = {
    'TRADE_OPENED': 'bg-green-500/20 text-green-400',
    'TRADE_CLOSED': 'bg-blue-500/20 text-blue-400',
    'DSE_RESIZE': 'bg-yellow-500/20 text-yellow-400',
    'TRAILING_EXIT_UPDATE': 'bg-purple-500/20 text-purple-400',
    'MANUAL_OVERRIDE': 'bg-orange-500/20 text-orange-400',
  };
  const labels: Record<string, string> = {
    'TRADE_OPENED': 'Trade Open',
    'TRADE_CLOSED': 'Trade Close',
    'DSE_RESIZE': 'DSE Resize',
    'TRAILING_EXIT_UPDATE': 'Trailing Exit',
    'MANUAL_OVERRIDE': 'Manual',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[type] || 'bg-muted text-muted-foreground'}`}>
      {labels[type] || type}
    </span>
  );
};

function FrozenHeader({ indicators, isLoading }: { indicators: MarketIndicatorsData | undefined; isLoading: boolean }) {
  if (isLoading || !indicators?.data) {
    return (
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <div className="animate-pulse bg-muted rounded h-8 w-32"></div>
            <div className="animate-pulse bg-muted rounded h-8 w-24"></div>
          </div>
        </div>
      </div>
    );
  }

  const { data } = indicators;
  
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {getRegimeIcon(data.marketRegime)}
            <Badge variant="outline" className={`font-semibold ${getRegimeBadgeColor(data.marketRegime)}`}>
              {data.regimeTitle || data.marketRegime.replace(/_/g, ' ')}
            </Badge>
          </div>
          
          <Separator orientation="vertical" className="h-6" />
          
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Friction:</span>
            <div className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${getFrictionBgColor(data.frictionColor)}`}></div>
              <span className="font-mono font-medium">{data.globalFrictionScore}</span>
              <span className="text-sm text-muted-foreground">({data.frictionStatus})</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span>Updated {formatDistanceToNow(new Date(indicators.timestamp), { addSuffix: true })}</span>
        </div>
      </div>
    </div>
  );
}

function MarketOverviewSection({ indicators }: { indicators: MarketIndicatorsData | undefined }) {
  if (!indicators?.data) return null;
  
  const { data } = indicators;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Market Overview
        </CardTitle>
        <CardDescription>Current market conditions and what they mean for trading</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Global Market Regime
          </h4>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
            <div className="mt-1">
              {getRegimeIcon(data.marketRegime)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <p className="font-semibold text-lg">{data.regimeTitle || data.marketRegime.replace(/_/g, ' ')}</p>
                <Badge variant="outline" className={`text-xs ${getRegimeBadgeColor(data.marketRegime)}`}>
                  Active
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {data.regimeDescription}
              </p>
            </div>
          </div>
        </div>
        
        <Separator />
        
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="text-sm font-medium mb-2">Favored Signal Types</h4>
            <div className="flex flex-wrap gap-2">
              {(data.favoredSignalTypes || []).map((signalType) => (
                <Badge key={signalType} variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                  {signalType}
                </Badge>
              ))}
              {(!data.favoredSignalTypes || data.favoredSignalTypes.length === 0) && (
                <span className="text-sm text-muted-foreground">None recommended</span>
              )}
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-medium mb-2">Favored Strategies</h4>
            <div className="flex flex-wrap gap-2">
              {data.favoredStrategies.map((strategy) => (
                <Badge key={strategy} variant="secondary">
                  {strategy}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        
        <Separator />
        
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Gauge className="w-4 h-4" />
            Global Friction Score
          </h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-3xl font-mono font-bold">{data.globalFrictionScore}</span>
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                data.frictionColor === 'green' ? 'bg-green-500/20 text-green-400' :
                data.frictionColor === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' :
                data.frictionColor === 'orange' ? 'bg-orange-500/20 text-orange-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {data.frictionStatus}
              </span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${getFrictionBgColor(data.frictionColor)}`}
                style={{ width: `${data.globalFrictionScore}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0 - High Liquidity</span>
              <span>50 - Normal</span>
              <span>100 - Frozen</span>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 mt-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {data.frictionNarrative || 'Friction narrative not available.'}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TradingActivitiesSection({ feedData, isLoading }: { feedData: NarrativeFeedData | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Trading Activities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const events = feedData?.data || [];
  const stats = feedData?.meta;
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Trading Activities
            </CardTitle>
            <CardDescription>
              {stats?.total || 0} events logged (7-day retention)
            </CardDescription>
          </div>
          {stats && Object.entries(stats.byType).filter(([_, count]) => count > 0).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byType).filter(([_, count]) => count > 0).map(([type, count]) => (
                <Badge key={type} variant="outline" className="text-xs">
                  {type.replace(/_/g, ' ')}: {count}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Activity className="w-8 h-8 mb-2 opacity-50" />
              <p>No trading activities yet</p>
              <p className="text-xs mt-1">Activities will appear here as trades are executed</p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="mt-0.5">
                    {getEventTypeIcon(event.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground">
                        [{format(new Date(event.timestamp), 'yyyy-MM-dd HH:mm')}]
                      </span>
                      {getEventTypeBadge(event.type)}
                      <Badge variant="outline" className="text-xs font-mono">
                        {event.symbol}
                      </Badge>
                    </div>
                    <p className="text-sm">{event.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { mode } = useTradingMode();
  
  const { data: indicatorsData, isLoading: indicatorsLoading, refetch: refetchIndicators } = useQuery<MarketIndicatorsData>({
    queryKey: ['/api/market-indicators'],
    refetchInterval: 15000,
  });
  
  const { data: narrativeData, isLoading: narrativeLoading, refetch: refetchNarrative } = useQuery<NarrativeFeedData>({
    queryKey: ['/api/narrative-feed?limit=50'],
    refetchInterval: 10000,
  });
  
  const handleRefresh = () => {
    refetchIndicators();
    refetchNarrative();
  };
  
  return (
    <div className="flex flex-col h-full">
      <FrozenHeader indicators={indicatorsData} isLoading={indicatorsLoading} />
      
      <div className="flex-1 p-4 sm:p-6 space-y-6 overflow-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Analytics & Diagnostics</h1>
            <p className="text-muted-foreground">Real-time market intelligence and trading activity log</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
        
        <MarketOverviewSection indicators={indicatorsData} />
        
        <TradingActivitiesSection feedData={narrativeData} isLoading={narrativeLoading} />
      </div>
    </div>
  );
}
