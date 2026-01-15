import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Activity, TrendingUp, TrendingDown, AlertCircle, Gauge, RefreshCw, Clock, DollarSign, Target, Zap, BarChart3, Layers, List, BookOpen, ChevronDown, ChevronUp, Star } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useTradingMode } from "@/contexts/trading-mode-context";
import TopBatch from "@/components/trading/top-batch";
import BenchmarkList from "@/components/analytics/benchmark-list";

interface MarketIndicatorsData {
  ok: boolean;
  data: {
    marketRegime: string;
    regimeTitle: string;
    regimeDescription: string;
    regimeScore: number; // Directive 11.4H.4A-Fix: Dynamic 0-100 regime score
    regimePercentage: number; // Directive 11.4H.4A-Fix: Percentage of pairs in this regime
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
              <span className="font-mono mr-1">{data.regimeScore ?? 50}</span>
              {data.regimeTitle || data.marketRegime.replace(/_/g, ' ')}
            </Badge>
            {data.regimePercentage > 0 && (
              <span className="text-xs text-muted-foreground">({data.regimePercentage}% of pairs)</span>
            )}
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
                <span className="font-mono font-bold text-xl">{data.regimeScore ?? 50}</span>
                <p className="font-semibold text-lg">{data.regimeTitle || data.marketRegime.replace(/_/g, ' ')}</p>
                <Badge variant="outline" className={`text-xs ${getRegimeBadgeColor(data.marketRegime)}`}>
                  Active
                </Badge>
                {data.regimePercentage > 0 && (
                  <span className="text-xs text-muted-foreground">({data.regimePercentage}% of pairs)</span>
                )}
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
        
        <Separator />
        
        <DefinitionsReference />
      </CardContent>
    </Card>
  );
}

function DefinitionsReference() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="w-5 h-5" />
        <h3 className="text-lg font-semibold">Definitions & Mapping Reference</h3>
      </div>
      
      <div>
        <h4 className="text-sm font-semibold mb-3">Market Regime Definitions</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium">Regime</th>
                <th className="text-left py-2 pr-4 font-medium">Regime Metrics & Ranges</th>
                <th className="text-left py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">BULL_STABLE</Badge></td>
                <td className="py-2 pr-4 font-mono text-xs">Mom &gt; +0.005 | ADX &gt; 25 | Vol &lt; 0.025</td>
                <td className="py-2">Markets are trending upward steadily. Buyers are in control, and momentum strategies work best.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">BEAR_VOLATILE</Badge></td>
                <td className="py-2 pr-4 font-mono text-xs">Mom &lt; -0.005 | ADX &gt; 25 | Vol &gt; 0.03</td>
                <td className="py-2">Markets are dropping sharply or swinging wildly. It's better to be cautious or trade defensive setups.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge variant="outline" className="bg-gray-500/20 text-gray-400 border-gray-500/30">LOW_VOL_CHOP</Badge></td>
                <td className="py-2 pr-4 font-mono text-xs">Mom abs &lt; 0.002 | ADX &lt; 20 | Vol &lt; 0.015</td>
                <td className="py-2">Prices move sideways without clear direction. Range trading works best here.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">HIGH_VOL_IMPULSE</Badge></td>
                <td className="py-2 pr-4 font-mono text-xs">Mom abs &gt; 0.010 | ADX &gt; 30 | Vol &gt; 0.030</td>
                <td className="py-2">Prices move very fast and sharply. Short-term breakout and scalp trades work well.</td>
              </tr>
              <tr>
                <td className="py-2 pr-4"><Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">TRANSITION</Badge></td>
                <td className="py-2 pr-4 font-mono text-xs">Mom ± 0.004 | ADX 20-25 | Vol 0.015-0.030</td>
                <td className="py-2">The market is changing direction or finding a new trend. Keep trades small and flexible.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <Separator />
      
      <div>
        <h4 className="text-sm font-semibold mb-3">Market Friction Definitions</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium">Friction Type</th>
                <th className="text-left py-2 pr-4 font-medium">Score Range</th>
                <th className="text-left py-2 font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge className="bg-green-500/20 text-green-400">High Liquidity</Badge></td>
                <td className="py-2 pr-4 font-mono">0 - 30</td>
                <td className="py-2">Trades are cheap and fast. Ideal environment for full position sizes.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge className="bg-orange-500/20 text-orange-400">Moderate Liquidity</Badge></td>
                <td className="py-2 pr-4 font-mono">31 - 70</td>
                <td className="py-2">Trading is normal. Most trades execute at expected prices with minor slippage.</td>
              </tr>
              <tr>
                <td className="py-2 pr-4"><Badge className="bg-red-500/20 text-red-400">Low Liquidity</Badge></td>
                <td className="py-2 pr-4 font-mono">71 - 100</td>
                <td className="py-2">Markets are difficult to trade safely. Price jumps and delays are common.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <Separator />
      
      <div>
        <h4 className="text-sm font-semibold mb-3">Complete Regime to Strategy Mapping</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2 px-2 font-medium">Regime</th>
                <th className="text-left py-2 px-2 font-medium">Strategy</th>
                <th className="text-left py-2 px-2 font-medium">Secondary Metrics & Ranges</th>
                <th className="text-left py-2 px-2 font-medium">Signal Type</th>
                <th className="text-left py-2 px-2 font-medium">Pattern Type</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 px-2 font-medium text-foreground" rowSpan={4}>BULL_STABLE</td>
                <td className="py-2 px-2">SMA Trend Ride</td>
                <td className="py-2 px-2 font-mono">Price &gt; SMA(50) by &gt; 0.5% | ADX &gt; 25</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">QUANT</Badge></td>
                <td className="py-2 px-2">—</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">VWAP Pullback</td>
                <td className="py-2 px-2 font-mono">VWAP Deviation &lt; -1σ | Momentum &gt; 0</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">QUANT</Badge></td>
                <td className="py-2 px-2">—</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">Morning Star / Evening Star</td>
                <td className="py-2 px-2 font-mono">3-Bar Sequence (Bear→Doji→Bull) | Mom Flip &gt; 0.3%</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">PATTERN</Badge></td>
                <td className="py-2 px-2">Morning Star / Evening Star</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">Pivot Shift</td>
                <td className="py-2 px-2 font-mono">RSI 45-55 | ADX Slope &gt; 0.5</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">HYBRID</Badge></td>
                <td className="py-2 px-2">Morning / Evening Star</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2 font-medium text-foreground" rowSpan={4}>BEAR_VOLATILE</td>
                <td className="py-2 px-2">Mean Reversion</td>
                <td className="py-2 px-2 font-mono">RSI &lt; 30 or &gt; 70 | Price Dev &gt; 1σ | Vol &lt; 0.025</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">QUANT</Badge></td>
                <td className="py-2 px-2">—</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">Reverse Impulse</td>
                <td className="py-2 px-2 font-mono">Volume &gt; 1.5× avg | Mom Spike &lt; -0.5%</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">HYBRID</Badge></td>
                <td className="py-2 px-2">Pinbar (optional)</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">Defensive Hedge</td>
                <td className="py-2 px-2 font-mono">BTC Correlation &lt; 0.3 | Vol Offset &gt; 1σ</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">HYBRID</Badge></td>
                <td className="py-2 px-2">Engulfing / Inside Bar</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">Inside Bar Reversal</td>
                <td className="py-2 px-2 font-mono">Parent Range &gt; Child × 1.3 | Breakout Vol &gt; 1.5× avg</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">PATTERN</Badge></td>
                <td className="py-2 px-2">Inside Bar / Engulfing</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2 font-medium text-foreground" rowSpan={4}>LOW_VOL_CHOP</td>
                <td className="py-2 px-2">Range Trading</td>
                <td className="py-2 px-2 font-mono">Bollinger Bandwidth &lt; 0.10 | ADX &lt; 20</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">QUANT</Badge></td>
                <td className="py-2 px-2">—</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">Support Bounce</td>
                <td className="py-2 px-2 font-mono">Price = Local Min ± 1σ | Volume &gt; 1.2× avg</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">PATTERN</Badge></td>
                <td className="py-2 px-2">Pinbar / Rejection Wick</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">ABCD Long</td>
                <td className="py-2 px-2 font-mono">AB:CD Ratio 0.95-1.05 | Volume &gt; 1.2× avg</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">QUANT</Badge></td>
                <td className="py-2 px-2">—</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">Adaptive Flow</td>
                <td className="py-2 px-2 font-mono">Mom Inversion = 3 | Vol Percentile &gt; 70%</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">HYBRID</Badge></td>
                <td className="py-2 px-2">Tri-Star / Three Soldiers</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2 font-medium text-foreground" rowSpan={4}>HIGH_VOL_IMPULSE</td>
                <td className="py-2 px-2">Breakout</td>
                <td className="py-2 px-2 font-mono">Momentum &gt; +0.7% | Volume &gt; 2× avg</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">QUANT</Badge></td>
                <td className="py-2 px-2">—</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">VWAP Bounce</td>
                <td className="py-2 px-2 font-mono">VWAP Deviation &gt; +1σ | Momentum -0.3 to -0.6%</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">QUANT</Badge></td>
                <td className="py-2 px-2">—</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">Volatility Edge</td>
                <td className="py-2 px-2 font-mono">Vol Percentile &gt; 80 | Regime Mismatch = True</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">HYBRID</Badge></td>
                <td className="py-2 px-2">ABCD Geometric</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">DHMA</td>
                <td className="py-2 px-2 font-mono">HMA(9) cross HMA(21) | ADX Slope Flattening</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">QUANT</Badge></td>
                <td className="py-2 px-2">—</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2 font-medium text-foreground" rowSpan={3}>TRANSITION</td>
                <td className="py-2 px-2">Liquidity Trap</td>
                <td className="py-2 px-2 font-mono">(Lower Wick / Body) &gt; 2 or Depth Imbalance &gt; 1.4</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">QUANT</Badge></td>
                <td className="py-2 px-2">Pinbar (proxy)</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">Pivot Shift</td>
                <td className="py-2 px-2 font-mono">RSI 45-55 | ADX Slope &gt; 0.5</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">HYBRID</Badge></td>
                <td className="py-2 px-2">Morning / Evening Star</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">Morning Star / Evening Star</td>
                <td className="py-2 px-2 font-mono">3-Bar Sequence (Bear→Doji→Bull) | Mom Flip &gt; 0.3%</td>
                <td className="py-2 px-2"><Badge variant="secondary" className="text-xs">PATTERN</Badge></td>
                <td className="py-2 px-2">Morning / Evening Star</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <Separator />
      
      <div>
        <h4 className="text-sm font-semibold mb-3">Signal Types</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium">Signal Type</th>
                <th className="text-left py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge variant="secondary">QUANT</Badge></td>
                <td className="py-2">Quantitative signals based on mathematical indicators like RSI, VWAP, ADX, and momentum calculations. Purely data-driven.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge variant="secondary">HYBRID</Badge></td>
                <td className="py-2">Combines quantitative metrics with price structure analysis. Uses both data and pattern recognition.</td>
              </tr>
              <tr>
                <td className="py-2 pr-4"><Badge variant="secondary">PATTERN</Badge></td>
                <td className="py-2">Based on candlestick patterns and price action formations like Morning Star, Engulfing, Inside Bar.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <Separator />
      
      <div>
        <h4 className="text-sm font-semibold mb-3">Pattern Types</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium">Pattern</th>
                <th className="text-left py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4 font-medium text-foreground">Morning Star / Evening Star</td>
                <td className="py-2">3-candle reversal pattern. Morning Star signals bullish reversal, Evening Star signals bearish reversal.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-medium text-foreground">Pinbar / Rejection Wick</td>
                <td className="py-2">Single candle with long wick showing price rejection at a level. Signals potential reversal.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-medium text-foreground">Engulfing</td>
                <td className="py-2">2-candle pattern where the second candle completely engulfs the first. Strong reversal signal.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-medium text-foreground">Inside Bar</td>
                <td className="py-2">Candle that trades within the range of the previous candle. Signals consolidation before breakout.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-medium text-foreground">ABCD Geometric</td>
                <td className="py-2">Harmonic pattern with equal AB and CD legs. Used for measuring potential price targets.</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium text-foreground">Tri-Star / Three Soldiers</td>
                <td className="py-2">3-candle continuation patterns. Three Soldiers shows strong bullish momentum.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TradingActivitiesSection({ feedData, isLoading }: { feedData: NarrativeFeedData | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Trading & Market Events
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
              Trading & Market Events
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
  const [activeTab, setActiveTab] = useState("overview");
  
  // Directive 11.4H.6 Task 7: Dynamic binding for favored strategies/signals
  // Refresh every 60 seconds to get live API data
  const { data: indicatorsData, isLoading: indicatorsLoading, refetch: refetchIndicators } = useQuery<MarketIndicatorsData>({
    queryKey: ['/api/market-indicators'],
    refetchInterval: 60 * 1000, // 60 seconds per Directive 11.4H.6
    refetchOnWindowFocus: true,
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
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 max-w-2xl">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="top-batch" className="flex items-center gap-2">
              <List className="w-4 h-4" />
              Top Scanned Pairs
            </TabsTrigger>
            <TabsTrigger value="activities" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Events
            </TabsTrigger>
            <TabsTrigger value="benchmark" className="flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" />
              Benchmark List
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-6 mt-6">
            <MarketOverviewSection indicators={indicatorsData} />
          </TabsContent>
          
          <TabsContent value="top-batch" className="mt-6">
            <TopBatch />
          </TabsContent>
          
          <TabsContent value="activities" className="mt-6">
            <TradingActivitiesSection feedData={narrativeData} isLoading={narrativeLoading} />
          </TabsContent>
          
          <TabsContent value="benchmark" className="mt-6">
            <BenchmarkList />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
