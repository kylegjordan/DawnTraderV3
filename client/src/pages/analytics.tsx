import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Activity, TrendingUp, TrendingDown, AlertCircle, Gauge, RefreshCw, Clock, DollarSign, Target, Zap, BarChart3, Layers, List, BookOpen, ChevronDown, ChevronUp, Star, GitBranch, Download, Filter, Brain, CheckCircle, XCircle, AlertTriangle, Info, HelpCircle, Shield } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useTradingMode } from "@/contexts/trading-mode-context";
import TopBatch from "@/components/trading/top-batch";
import BenchmarkList from "@/components/analytics/benchmark-list";
import GovernanceSection from "@/components/analytics/governance-section";
import { apiFetch } from "@/lib/api";

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
    frictionSampleSize: number; // Directive 11.7I.a-03: Number of symbols used in calculation
    frictionStatus: string;
    frictionColor: 'green' | 'yellow' | 'orange' | 'red';
    frictionEmoji: string;
    frictionNarrative: string;
    frictionDisplay: string;
    globalDBSScore: number | null;
    globalDBSCategory: string;
    globalDBSPairCount: number;
    // B63 Item 16: snapshot staleness flags. `globalDBSIsStale` is true when the
    // store dropped below 20-pair floor and is serving a prior good snapshot.
    // `globalDBSSnapshotAgeSeconds` is the age of whatever snapshot is currently served.
    globalDBSIsStale?: boolean;
    globalDBSSnapshotAgeSeconds?: number | null;
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

interface MarketEvent {
  id: string;
  type: 'REGIME_TRANSITION' | 'FRICTION_TRANSITION' | 'SYSTEM_ALERT';
  message: string;
  explanation: string;
  previousValue?: string;
  newValue?: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
}

interface MarketEventsData {
  ok: boolean;
  events: MarketEvent[];
}

type UnifiedEventType = 'TRADE' | 'MARKET' | 'SYSTEM';

interface UnifiedEvent {
  id: string;
  timestamp: string;
  eventCategory: UnifiedEventType;
  type: string;
  symbol?: string;
  message: string;
  explanation?: string;
  details?: Record<string, any>;
  severity?: string;
}

interface FilterState {
  status: 'PASS' | 'BLOCKED' | 'SKIPPED' | 'DRIFT';
  reason: string;
  threshold?: number;
  confidence?: number;
  riskRatio?: number;
}

interface WeightContribution {
  volZ: number;
  trendZ: number;
  adx: number;
  momentum: number;
  [key: string]: number;
}

interface ModelDiagnostics {
  calibrationDrift: number;
  meanConfidence: number;
  accuracy7d: number;
  weightContribution: WeightContribution;
}

interface TraceDecision {
  pair: string;
  signalType: string;
  predictedRegime: string;
  modelUsed: string;
  decision: string;
  tracePath: string[];
  timestamp: string;
  confidence?: number;
  finalScore?: number;
}

interface PredictiveDiagnosticsData {
  ok: boolean;
  schema: string;
  timestamp: string;
  predictiveModels: Record<string, ModelDiagnostics>;
  filters: Record<string, FilterState>;
  recentDecisions: TraceDecision[];
  telemetryStats: {
    totalSignalsProcessed: number;
    passRate: number;
    avgConfidence: number;
    driftWarnings: number;
  };
}

const getRegimeIcon = (regime: string) => {
  if (regime.includes('TREND_FRIENDLY') || regime.includes('BULL')) return <TrendingUp className="w-5 h-5 text-green-500" />;
  if (regime.includes('HIGH_VOLATILITY') || regime.includes('BEAR')) return <TrendingDown className="w-5 h-5 text-red-500" />;
  if (regime.includes('IMPULSE_EXPANSION') || regime.includes('HIGH_VOL_IMPULSE')) return <Zap className="w-5 h-5 text-emerald-500" />;
  if (regime === 'EXTREME_NOISE') return <AlertCircle className="w-5 h-5 text-red-500 animate-pulse" />;
  return <Activity className="w-5 h-5 text-yellow-500" />;
};

const getDBSColor = (category: string): string => {
  if (category.includes('UP_STRONG') || category.includes('UP_MODERATE')) return 'text-green-400';
  if (category.includes('UP_WEAK')) return 'text-green-300';
  if (category === 'NEUTRAL') return 'text-yellow-400';
  if (category.includes('DOWN_WEAK')) return 'text-yellow-300';
  if (category.includes('DOWN_MODERATE') || category.includes('DOWN_STRONG')) return 'text-red-400';
  return 'text-muted-foreground';
};

const getDBSBadgeColor = (category: string): string => {
  if (category.includes('UP_STRONG') || category.includes('UP_MODERATE')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (category.includes('UP_WEAK')) return 'bg-green-500/10 text-green-300 border-green-500/20';
  if (category === 'NEUTRAL') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  if (category.includes('DOWN_WEAK')) return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
  if (category.includes('DOWN_MODERATE')) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  if (category.includes('DOWN_STRONG')) return 'bg-red-500/20 text-red-400 border-red-500/30';
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
};

/**
 * HF6B: Dynamic narrative for Global Directional Bias.
 * Matches the friction narrative pattern — adjusts text based on current category.
 */
const getDBSNarrative = (category: string): string => {
  switch (category) {
    case 'UP_STRONG':
      return 'Strong upward momentum across the market. Most pairs are trending up with high conviction. Long-only strategies should find abundant opportunities with favorable directional alignment.';
    case 'UP_MODERATE':
      return 'Moderate upward bias in the market. A majority of pairs are trending upward, creating a favorable environment for long positions. Strategy confidence receives a boost from directional alignment.';
    case 'UP_WEAK':
      return 'Slight upward tilt in the market. Marginally more pairs are trending up than down, but conviction is low. Strategies should not rely heavily on directional alignment.';
    case 'NEUTRAL':
      return 'No clear directional bias. The market is balanced between upward and downward pressure. Strategies perform based on their own merit without directional tailwind or headwind.';
    case 'DOWN_WEAK':
      return 'Slight downward tilt in the market. Marginally more pairs are trending down, creating a mild headwind for long-only strategies. Exercise caution with aggressive entries.';
    case 'DOWN_MODERATE':
      return 'Moderate downward pressure across the market. Many pairs are declining, making long entries more challenging. Strategy confidence is penalized for counter-trend positioning.';
    case 'DOWN_STRONG':
      return 'Strong downward momentum across the market. Most pairs are in decline. Long-only strategies face significant headwinds. Defensive and mean-reversion setups are preferred.';
    default:
      return 'Directional bias data is being calculated. The score will update as pair-level data becomes available.';
  }
};

const getRegimeBadgeColor = (regime: string) => {
  if (regime.includes('TREND_FRIENDLY_STABLE') || regime.includes('BULL_STABLE')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (regime.includes('IMPULSE_EXPANSION') || regime.includes('HIGH_VOL_IMPULSE') || regime.includes('BULL_VOLATILE')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (regime.includes('HIGH_VOLATILITY_UNSTABLE') || regime.includes('BEAR_VOLATILE') || regime.includes('BEAR_STABLE')) return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
  if (regime.includes('RANGE_BOUND_STABLE') || regime.includes('LOW_VOL_CHOP')) return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  if (regime === 'EXTREME_NOISE') return 'bg-red-600/30 text-red-300 border-red-600/50';
  if (regime.includes('STRUCTURAL_TRANSITION') || regime.includes('TRANSITION')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
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
    case 'REGIME_TRANSITION': return <Layers className="w-4 h-4 text-cyan-500" />;
    case 'FRICTION_TRANSITION': return <Gauge className="w-4 h-4 text-amber-500" />;
    case 'SYSTEM_ALERT': return <AlertCircle className="w-4 h-4 text-red-500" />;
    default: return <Activity className="w-4 h-4 text-muted-foreground" />;
  }
};

const getEventTypeBadge = (type: string, eventCategory?: UnifiedEventType) => {
  const colors: Record<string, string> = {
    'TRADE_OPENED': 'bg-green-500/20 text-green-400',
    'TRADE_CLOSED': 'bg-blue-500/20 text-blue-400',
    'DSE_RESIZE': 'bg-yellow-500/20 text-yellow-400',
    'TRAILING_EXIT_UPDATE': 'bg-purple-500/20 text-purple-400',
    'MANUAL_OVERRIDE': 'bg-orange-500/20 text-orange-400',
    'REGIME_TRANSITION': 'bg-cyan-500/20 text-cyan-400',
    'FRICTION_TRANSITION': 'bg-amber-500/20 text-amber-400',
    'SYSTEM_ALERT': 'bg-red-500/20 text-red-400',
  };
  const labels: Record<string, string> = {
    'TRADE_OPENED': 'Trade Open',
    'TRADE_CLOSED': 'Trade Close',
    'DSE_RESIZE': 'DSE Resize',
    'TRAILING_EXIT_UPDATE': 'Trailing Exit',
    'MANUAL_OVERRIDE': 'Manual',
    'REGIME_TRANSITION': 'Regime Change',
    'FRICTION_TRANSITION': 'Friction Change',
    'SYSTEM_ALERT': 'System Alert',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[type] || 'bg-muted text-muted-foreground'}`}>
      {labels[type] || type}
    </span>
  );
};

const getEventCategoryBadge = (category: UnifiedEventType) => {
  const styles: Record<UnifiedEventType, string> = {
    'TRADE': 'bg-green-500/10 text-green-400 border border-green-500/30',
    'MARKET': 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30',
    'SYSTEM': 'bg-red-500/10 text-red-400 border border-red-500/30',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${styles[category]}`}>
      {category}
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
            {data.globalFrictionScore !== null && data.globalFrictionScore !== undefined ? (
              <div className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${getFrictionBgColor(data.frictionColor)}`}></div>
                <span className="font-mono font-medium">{data.globalFrictionScore}</span>
                <span className="text-sm text-muted-foreground">({data.frictionStatus})</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground cursor-help flex items-center gap-1">
                        <HelpCircle className="w-3 h-3" />
                        n={data.frictionSampleSize || 0}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs z-50" side="bottom" sideOffset={8}>
                      <p className="text-sm font-medium mb-1">Friction Sample Size</p>
                      <p className="text-xs text-muted-foreground">
                        Calculated from {data.frictionSampleSize || 0} cryptocurrency pairs with available spread data.
                        {(data.frictionSampleSize || 0) < 20 && (
                          <span className="block mt-1 text-yellow-400">
                            Low sample size may affect accuracy. More pairs will be included as market data becomes available.
                          </span>
                        )}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-help">
                      <div className="w-2.5 h-2.5 rounded-full bg-gray-500 animate-pulse"></div>
                      <span className="font-mono font-medium text-muted-foreground italic">Insufficient Data</span>
                      <HelpCircle className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs z-50" side="bottom" sideOffset={8}>
                    <p className="text-sm font-medium mb-1">Friction Data Unavailable</p>
                    <p className="text-xs text-muted-foreground">
                      Global friction requires an active ticker feed from the exchange.
                      This is a market condition metric, not a learning metric — it does not depend on simulated trades.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Friction will appear when live price feeds are connected.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
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

// Phase 14.1 HF8 (C1): Interface for /api/regime-map response
interface RegimeMapStrategy {
  strategy: string;
  strategyKey: string;
  signalType: 'QUANT' | 'PATTERN' | 'HYBRID';
  patternType: string | null;
  secondaryMetrics: string;
}

interface RegimeMapEntry {
  regime: string;
  displayName: string;
  title: string;
  description: string;
  strategies: RegimeMapStrategy[];
  riskMultiplier: number;
  minConfidence: number;
}

interface RegimeMapData {
  schemaVersion: string;
  regimeCount: number;
  regimes: RegimeMapEntry[];
}

function MarketOverviewSection({ indicators, error, onRetry }: { indicators: MarketIndicatorsData | undefined; error?: any; onRetry?: () => void }) {
  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-8">
          <AlertCircle className="w-10 h-10 text-yellow-500 mb-3" />
          <p className="text-sm text-muted-foreground mb-3">Market indicators temporarily unavailable</p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }
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
              {(data.favoredStrategies || []).map((strategy) => (
                <Badge key={strategy} variant="secondary">
                  {strategy}
                </Badge>
              ))}
              {(!data.favoredStrategies || data.favoredStrategies.length === 0) && (
                <span className="text-sm text-muted-foreground">No active strategies for current regime</span>
              )}
            </div>
          </div>
        </div>
        
        <Separator />
        
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Gauge className="w-4 h-4" />
            Global Friction Score
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground cursor-help flex items-center gap-1 ml-auto">
                    <HelpCircle className="w-3.5 h-3.5" />
                    Sample: {data.frictionSampleSize || 0} pairs
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="text-sm font-medium mb-1">How Friction is Calculated</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Global friction is computed from real-time spread, slippage, and fee data across actively traded pairs.
                    The score (0-100) indicates overall market liquidity conditions.
                  </p>
                  <p className="text-xs">
                    <span className="font-medium">Current sample:</span> {data.frictionSampleSize || 0} cryptocurrency pairs
                    {(data.frictionSampleSize || 0) < 20 && (
                      <span className="block mt-1 text-yellow-400">
                        Low sample size during market initialization. Score accuracy improves as more pairs become active.
                      </span>
                    )}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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

        {/* Phase 14: Global Directional Bias Section */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Global Directional Bias
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground cursor-help flex items-center gap-1 ml-auto">
                    <HelpCircle className="w-3.5 h-3.5" />
                    Sample: {data.globalDBSPairCount || 0} pairs
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="text-sm font-medium mb-1">How Directional Bias is Calculated</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Global DBS is the median of pair-level bias scores across active VTS pairs.
                    Each pair's bias is computed from log-price slope, normalized returns, and EMA trend alignment.
                  </p>
                  <p className="text-xs">
                    <span className="font-medium">Score range:</span> -1.0 (strong downward) to +1.0 (strong upward)
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h4>
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-4">
              <span className={`text-3xl font-mono font-bold ${getDBSColor(data.globalDBSCategory || 'NEUTRAL')}`}>
                {data.globalDBSScore !== null && data.globalDBSScore !== undefined
                  ? (data.globalDBSScore >= 0 ? '+' : '') + data.globalDBSScore.toFixed(3)
                  : '\u2014'}
              </span>
              <Badge variant="outline" className={getDBSBadgeColor(data.globalDBSCategory || 'NEUTRAL')}>
                {(data.globalDBSCategory || 'NEUTRAL').replace(/_/g, ' ')}
              </Badge>
              {/* B63 Item 16: surface snapshot staleness when the store is carrying forward
                  a prior good snapshot because the live store dropped below the 20-pair floor. */}
              {data.globalDBSIsStale && (
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                  ⚠ Stale
                  {typeof data.globalDBSSnapshotAgeSeconds === 'number' && data.globalDBSSnapshotAgeSeconds >= 0
                    ? ` (${data.globalDBSSnapshotAgeSeconds < 60
                        ? `${data.globalDBSSnapshotAgeSeconds}s`
                        : `${Math.round(data.globalDBSSnapshotAgeSeconds / 60)}m`} old)`
                    : ''}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {(data.globalDBSPairCount || 0) > 0
                ? `Based on ${data.globalDBSPairCount} pairs`
                : 'Awaiting pair data...'}
            </div>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 mt-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {getDBSNarrative(data.globalDBSCategory || 'NEUTRAL')}
            </p>
          </div>
        </div>

        <Separator />

        <DefinitionsReference />
      </CardContent>
    </Card>
  );
}

function DefinitionsReference() {
  // Phase 14.1 HF8 (C1): Fetch canonical regime-strategy map from API (replaces hardcoded table)
  const { data: regimeMapData, isLoading: regimeMapLoading } = useQuery<RegimeMapData>({
    queryKey: ['/api/regime-map'],
    queryFn: () => apiFetch('/api/regime-map'),
    staleTime: 300000,  // 5 minutes — canonical map rarely changes
  });

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
                <td className="py-2 pr-4"><Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">TREND_FRIENDLY_STABLE</Badge></td>
                <td className="py-2 pr-4 font-mono text-xs">Mom &gt; +0.005 | ADX &gt; 25 | Vol &lt; 0.025</td>
                <td className="py-2">Market is trending steadily. Momentum and trend-following strategies work best.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge variant="outline" className="bg-rose-500/20 text-rose-400 border-rose-500/30">HIGH_VOLATILITY_UNSTABLE</Badge></td>
                <td className="py-2 pr-4 font-mono text-xs">Mom &lt; -0.005 | ADX &gt; 25 | Vol &gt; 0.03</td>
                <td className="py-2">High volatility with sharp swings. Cautious positioning and defensive setups are preferred.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge variant="outline" className="bg-gray-500/20 text-gray-400 border-gray-500/30">RANGE_BOUND_STABLE</Badge></td>
                <td className="py-2 pr-4 font-mono text-xs">Mom abs &lt; 0.002 | ADX &lt; 20 | Vol &lt; 0.015</td>
                <td className="py-2">Prices move sideways without clear direction. Range trading works best here.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">IMPULSE_EXPANSION</Badge></td>
                <td className="py-2 pr-4 font-mono text-xs">Mom abs &gt; 0.010 | ADX &gt; 30 | Vol &gt; 0.030</td>
                <td className="py-2">Prices move very fast and sharply. Short-term breakout and scalp trades work well.</td>
              </tr>
              <tr>
                <td className="py-2 pr-4"><Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">STRUCTURAL_TRANSITION</Badge></td>
                <td className="py-2 pr-4 font-mono text-xs">Mom ± 0.004 | ADX 20-25 | Vol 0.015-0.030</td>
                <td className="py-2">The market structure is changing. Keep trades small and flexible.</td>
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
        <h4 className="text-sm font-semibold mb-3">Global Directional Bias Definitions</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium">Category</th>
                <th className="text-left py-2 pr-4 font-medium">Score Range</th>
                <th className="text-left py-2 pr-4 font-medium">Confidence Effect</th>
                <th className="text-left py-2 font-medium">What It Means</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge className="bg-green-500/20 text-green-400">UP STRONG</Badge></td>
                <td className="py-2 pr-4 font-mono">&ge; +0.60</td>
                <td className="py-2 pr-4 font-mono text-green-400">+15%</td>
                <td className="py-2">Strong upward trend. Ideal for long-only entries.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge className="bg-green-500/20 text-green-400">UP MODERATE</Badge></td>
                <td className="py-2 pr-4 font-mono">+0.30 to +0.59</td>
                <td className="py-2 pr-4 font-mono text-green-400">+10%</td>
                <td className="py-2">Moderate upward bias. Favorable for long trades.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge className="bg-green-500/10 text-green-300">UP WEAK</Badge></td>
                <td className="py-2 pr-4 font-mono">+0.10 to +0.29</td>
                <td className="py-2 pr-4 font-mono text-green-300">+5%</td>
                <td className="py-2">Slight upward lean. Marginal directional benefit.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge className="bg-yellow-500/20 text-yellow-400">NEUTRAL</Badge></td>
                <td className="py-2 pr-4 font-mono">-0.09 to +0.09</td>
                <td className="py-2 pr-4 font-mono text-yellow-400">0%</td>
                <td className="py-2">No directional bias. Market is balanced.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge className="bg-yellow-500/10 text-yellow-300">DOWN WEAK</Badge></td>
                <td className="py-2 pr-4 font-mono">-0.10 to -0.29</td>
                <td className="py-2 pr-4 font-mono text-yellow-300">-5%</td>
                <td className="py-2">Slight downward lean. Minor headwind for longs.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4"><Badge className="bg-orange-500/20 text-orange-400">DOWN MODERATE</Badge></td>
                <td className="py-2 pr-4 font-mono">-0.30 to -0.59</td>
                <td className="py-2 pr-4 font-mono text-orange-400">-10%</td>
                <td className="py-2">Moderate selling pressure. Long trades face resistance.</td>
              </tr>
              <tr>
                <td className="py-2 pr-4"><Badge className="bg-red-500/20 text-red-400">DOWN STRONG</Badge></td>
                <td className="py-2 pr-4 font-mono">&le; -0.60</td>
                <td className="py-2 pr-4 font-mono text-red-400">-15%</td>
                <td className="py-2">Strong downtrend. Defensive strategies preferred.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="text-sm font-semibold mb-3">Complete Regime to Strategy Mapping</h4>
        {regimeMapLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading regime-strategy map...
          </div>
        ) : regimeMapData?.regimes ? (
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
                {regimeMapData.regimes.map((regime) =>
                  regime.strategies.map((strat, idx) => (
                    <tr key={`${regime.regime}-${strat.strategyKey}`} className="border-b">
                      {idx === 0 && (
                        <td className="py-2 px-2 font-medium text-foreground" rowSpan={regime.strategies.length}>
                          {regime.regime}
                        </td>
                      )}
                      <td className="py-2 px-2">{strat.strategy}</td>
                      <td className="py-2 px-2 font-mono">{strat.secondaryMetrics}</td>
                      <td className="py-2 px-2">
                        <Badge variant="secondary" className="text-xs">{strat.signalType}</Badge>
                      </td>
                      <td className="py-2 px-2">{strat.patternType || '\u2014'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-4">
            Failed to load regime-strategy map. Check server connection.
          </div>
        )}
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
  const { data: marketEventsData, isLoading: marketLoading } = useQuery<MarketEventsData>({
    queryKey: ['/api/market-events'],
    queryFn: () => apiFetch('/api/market-events?limit=50'),
    refetchInterval: 10000,
  });

  const combinedLoading = isLoading || marketLoading;

  if (combinedLoading) {
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
  
  const tradeEvents: UnifiedEvent[] = (feedData?.data || []).map(event => ({
    id: event.id,
    timestamp: event.timestamp,
    eventCategory: 'TRADE' as UnifiedEventType,
    type: event.type,
    symbol: event.symbol,
    message: event.message,
    details: event.details,
  }));

  const marketEvents: UnifiedEvent[] = (marketEventsData?.events || []).map(event => ({
    id: event.id,
    timestamp: event.timestamp,
    eventCategory: 'MARKET' as UnifiedEventType,
    type: event.type,
    message: event.message,
    explanation: event.explanation,
    severity: event.severity,
  }));

  const allEvents = [...tradeEvents, ...marketEvents].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const stats = feedData?.meta;
  const marketEventCount = marketEventsData?.events?.length || 0;
  const totalEvents = (stats?.total || 0) + marketEventCount;

  const categoryStats: Record<string, number> = {
    ...(stats?.byType || {}),
    'MARKET_EVENTS': marketEventCount,
  };
  
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
              {totalEvents} events logged (7-day retention) — includes regime transitions and friction changes
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {getEventCategoryBadge('TRADE')}
            {getEventCategoryBadge('MARKET')}
            {Object.entries(categoryStats).filter(([_, count]) => count > 0).map(([type, count]) => (
              <Badge key={type} variant="outline" className="text-xs">
                {type.replace(/_/g, ' ')}: {count}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          {allEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Activity className="w-8 h-8 mb-2 opacity-50" />
              <p>No events yet</p>
              <p className="text-xs mt-1">Events will appear here as trades are executed or market conditions change</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="mt-0.5">
                    {getEventTypeIcon(event.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground">
                        [{format(new Date(event.timestamp), 'yyyy-MM-dd HH:mm')}]
                      </span>
                      {getEventCategoryBadge(event.eventCategory)}
                      {getEventTypeBadge(event.type, event.eventCategory)}
                      {event.symbol && (
                        <Badge variant="outline" className="text-xs font-mono">
                          {event.symbol}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm">{event.message}</p>
                    {event.explanation && (
                      <p className="text-xs text-muted-foreground mt-1 italic">{event.explanation}</p>
                    )}
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

interface DriftScoreResult {
  score: number;
  regime: string;
  actualVolZ: number;
  actualTrendZ: number;
  idealVolZ: number;
  idealTrendZ: number;
  volContribution: number;
  trendContribution: number;
  label: string;
  color: string;
}

interface MappingDriftData {
  ok: boolean;
  isDrifted: boolean;
  driftScore: number;
  canonicalCoverage: number;
  empiricalRegimes: string[];
  missingCanonical: string[];
  extraEmpirical: string[];
  distribution: Record<string, number>;
  normalizedDistribution: Record<string, number>;
  recommendations: string[];
  validPairs: number;
  minSamplesMet: boolean;
  timestamp: string;
  driftScores?: Record<string, Record<string, DriftScoreResult>>; // Directive 11.7F-B
  hasZScoreData?: boolean; // Directive 11.7F-B
  schema?: string; // Directive 11.7F-B
}

interface CanonicalMapData {
  ok: boolean;
  _schema: string;
  _metadata: {
    updatedAt: string;
    source: string;
    canonical: boolean;
    includesDriftScore: boolean;
  };
  [key: string]: any;
}

// B64a: Regime & Strategy Drift Dashboard — closed-trades observation lens.
// Mirrors the B62 72h completion report's metrics in a permanent always-on UI.
interface DriftDashboardData {
  window: string;
  windowStart: string;
  windowEnd: string;
  cohortStart?: string;
  regime: {
    totalSamples: number;
    shares: Record<string, number>;
    familyFlickerPct: number | null;
    rbsDriftContaminationPct: number | null;
    componentClampSaturationPct: { slope: number; return: number; ema: number };
  };
  strategiesByRegime: Record<string, Array<{
    strategy: string; tradeCount: number; winCount: number; winRate: number;
    avgNetPct: number; sumNetPct: number;
    avgNetValue: number; sumNetValue: number;
  }>>;
  dbsDistribution: Record<string, number>;
  globalDbs: {
    current: { score: number | null; category: string | null; pairCount: number; isStale: boolean; snapshotAgeSeconds: number | null };
    history24h: Array<{ timestamp: string; score: number; category: string; pairCount: number }>;
    transitions: Array<{ timestamp: string; from: string; to: string }>;
  };
  tradeCounts: { total: number; wins: number; losses: number; winRate: number; avgNetPct: number };
}

/**
 * B64a follow-up: simple inline-SVG sparkline for global DBS 24h history.
 * Zero external dependencies — renders a polyline scaled to the data's actual
 * [min, max] range with a zero-axis marker if the range crosses zero. Keeps
 * bundle size small and matches the rest of the dashboard's understated style.
 */
function GlobalDbsSparkline({ history }: { history: Array<{ timestamp: string; score: number; category: string; pairCount: number }> }) {
  if (!history || history.length < 2) return null;
  const W = 600;
  const H = 80;
  const PADDING = 4;
  const scores = history.map(h => h.score);
  const minS = Math.min(...scores, 0);
  const maxS = Math.max(...scores, 0);
  const span = Math.max(maxS - minS, 0.01);
  const n = history.length;
  const xFor = (i: number) => PADDING + (i / Math.max(n - 1, 1)) * (W - PADDING * 2);
  const yFor = (s: number) => PADDING + (1 - (s - minS) / span) * (H - PADDING * 2);
  const zeroY = yFor(0);
  const points = history.map((h, i) => `${xFor(i).toFixed(1)},${yFor(h.score).toFixed(1)}`).join(' ');
  const lastPoint = history[history.length - 1];
  const firstTs = new Date(history[0].timestamp).toLocaleTimeString();
  const lastTs = new Date(lastPoint.timestamp).toLocaleTimeString();

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20 bg-muted/30 rounded">
        {minS < 0 && maxS > 0 && (
          <line x1={PADDING} x2={W - PADDING} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="2,2" />
        )}
        <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} />
        <circle cx={xFor(n - 1)} cy={yFor(lastPoint.score)} r={2.5} fill="hsl(var(--primary))" />
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground mt-1 font-mono">
        <span>{firstTs} · {minS >= 0 ? '+' : ''}{minS.toFixed(3)}</span>
        <span className="text-center">{n} snapshots</span>
        <span>{lastTs} · max {maxS >= 0 ? '+' : ''}{maxS.toFixed(3)}</span>
      </div>
    </div>
  );
}

function DriftDashboardSection() {
  const [windowSel, setWindowSel] = useState<'rolling_24h' | 'rolling_7d' | 'rolling_30d' | 'cohort_latest'>('rolling_24h');
  const { data: resp, isLoading, error } = useQuery<{ ok: boolean; data: DriftDashboardData }>({
    queryKey: ['/api/analytics/drift-dashboard', windowSel],
    queryFn: () => apiFetch(`/api/analytics/drift-dashboard?window=${windowSel}`),
    refetchInterval: 60_000, // refresh every minute
  });

  const d = resp?.data;

  const WINDOW_LABELS: Record<string, string> = {
    rolling_24h: 'Rolling 24 hours',
    rolling_7d: 'Rolling 7 days',
    rolling_30d: 'Rolling 30 days',
    cohort_latest: 'Since last restart',
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> Regime &amp; Strategy Drift Dashboard
            </span>
            <div className="flex items-center gap-2">
              {(['rolling_24h', 'rolling_7d', 'rolling_30d', 'cohort_latest'] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setWindowSel(w)}
                  className={`px-3 py-1 text-xs rounded-md border ${
                    windowSel === w ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                  }`}
                >
                  {WINDOW_LABELS[w]}
                </button>
              ))}
            </div>
          </CardTitle>
          {d && (
            <p className="text-xs text-muted-foreground mt-2">
              Window: {new Date(d.windowStart).toLocaleString()} → {new Date(d.windowEnd).toLocaleString()}
              {d.cohortStart ? ` (cohort boundary at ${new Date(d.cohortStart).toLocaleString()})` : ''}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading dashboard…</p>}
          {error && <p className="text-sm text-red-500">Failed to load dashboard: {String(error)}</p>}
          {d && (
            <div className="space-y-6">

              {/* Top-level tallies */}
              <div>
                <h4 className="text-sm font-medium mb-3">Summary (closed trades)</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Total trades</p>
                    <p className="text-2xl font-mono font-bold">{d.tradeCounts.total}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Wins / Losses</p>
                    <p className="text-xl font-mono font-bold">{d.tradeCounts.wins} / {d.tradeCounts.losses}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Win rate</p>
                    <p className="text-2xl font-mono font-bold">{d.tradeCounts.winRate.toFixed(1)}%</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Avg net %</p>
                    <p className="text-2xl font-mono font-bold">{d.tradeCounts.avgNetPct >= 0 ? '+' : ''}{d.tradeCounts.avgNetPct.toFixed(3)}%</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">MCE samples</p>
                    <p className="text-2xl font-mono font-bold">{d.regime.totalSamples.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Regime shares */}
              <div>
                <h4 className="text-sm font-medium mb-3">Regime distribution ({d.regime.totalSamples.toLocaleString()} MCE samples)</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {Object.entries(d.regime.shares).map(([r, pct]) => (
                    <div key={r} className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">{r.replace(/_/g, ' ')}</p>
                      <p className="text-xl font-mono font-bold">{pct.toFixed(1)}%</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Family-level integrity metrics */}
              <div>
                <h4 className="text-sm font-medium mb-3">Regime integrity (B62-style)</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Family flicker</p>
                    <p className="text-xl font-mono font-bold">
                      {d.regime.familyFlickerPct === null ? '—' : `${d.regime.familyFlickerPct.toFixed(2)}%`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Target ≤ 2.0%</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">RBS drift contamination</p>
                    <p className="text-xl font-mono font-bold">
                      {d.regime.rbsDriftContaminationPct === null ? '—' : `${d.regime.rbsDriftContaminationPct.toFixed(2)}%`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Target &lt; 30%; B62 target 0%</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Component clamp saturation</p>
                    <p className="text-xs font-mono">
                      slope {d.regime.componentClampSaturationPct.slope.toFixed(1)}% ·
                      return {d.regime.componentClampSaturationPct.return.toFixed(1)}% ·
                      ema {d.regime.componentClampSaturationPct.ema.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>

              {/* DBS distribution */}
              <div>
                <h4 className="text-sm font-medium mb-3">DBS category distribution (per-pair-per-cycle samples)</h4>
                <div className="grid grid-cols-7 gap-2">
                  {(['UP_STRONG', 'UP_MODERATE', 'UP_WEAK', 'NEUTRAL', 'DOWN_WEAK', 'DOWN_MODERATE', 'DOWN_STRONG'] as const).map((cat) => (
                    <div key={cat} className="p-2 rounded bg-muted/50 text-center">
                      <p className="text-xs text-muted-foreground">{cat.replace('_', ' ')}</p>
                      <p className="text-lg font-mono font-bold">{(d.dbsDistribution[cat] ?? 0).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Global DBS */}
              <div>
                <h4 className="text-sm font-medium mb-3">Global DBS (live snapshot)</h4>
                <div className="p-4 rounded-lg bg-muted/50 flex items-center gap-4">
                  <span className="text-3xl font-mono font-bold">
                    {d.globalDbs.current.score !== null
                      ? (d.globalDbs.current.score >= 0 ? '+' : '') + d.globalDbs.current.score.toFixed(3)
                      : '—'}
                  </span>
                  <Badge variant="outline">{d.globalDbs.current.category ?? 'NONE'}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {d.globalDbs.current.pairCount > 0 ? `${d.globalDbs.current.pairCount} pairs` : 'awaiting data'}
                  </span>
                  {d.globalDbs.current.isStale && (
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                      ⚠ Stale {typeof d.globalDbs.current.snapshotAgeSeconds === 'number'
                        ? `(${d.globalDbs.current.snapshotAgeSeconds < 60
                            ? `${d.globalDbs.current.snapshotAgeSeconds}s`
                            : `${Math.round(d.globalDbs.current.snapshotAgeSeconds / 60)}m`} old)`
                        : ''}
                    </Badge>
                  )}
                </div>
                {/* 24h history sparkline + transitions list (B64a) */}
                {d.globalDbs.history24h && d.globalDbs.history24h.length > 1 ? (
                  <div className="mt-4 space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">24-hour snapshot history ({d.globalDbs.history24h.length} points, {d.globalDbs.history24h.length * 15}m window actual)</p>
                      <GlobalDbsSparkline history={d.globalDbs.history24h} />
                    </div>
                    {d.globalDbs.transitions && d.globalDbs.transitions.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Category transitions in window ({d.globalDbs.transitions.length})</p>
                        <div className="space-y-1">
                          {d.globalDbs.transitions.slice(-10).map((t, i) => (
                            <div key={i} className="text-xs font-mono flex items-center gap-2">
                              <span className="text-muted-foreground">{new Date(t.timestamp).toLocaleString()}</span>
                              <span>{t.from.replace(/_/g, ' ')} → {t.to.replace(/_/g, ' ')}</span>
                            </div>
                          ))}
                          {d.globalDbs.transitions.length > 10 && (
                            <p className="text-xs text-muted-foreground italic">showing last 10 of {d.globalDbs.transitions.length}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">
                    History + transitions accumulate as the store publishes snapshots. Cold start after deploy; expect data to populate within ~15 minutes of stable operation.
                  </p>
                )}
              </div>

              {/* Strategies by regime — single unified table, perfectly column-aligned,
                  constrained width, regime names rendered as full-row section headers so
                  the columns don't re-indent per regime. */}
              <div>
                <h4 className="text-sm font-medium mb-3">Strategy performance by regime at entry (closed trades in window)</h4>
                <div className="max-w-4xl">
                  <table className="w-full text-xs table-fixed">
                    <colgroup>
                      <col style={{ width: '22%' }} />  {/* Strategy */}
                      <col style={{ width: '6%' }} />   {/* N */}
                      <col style={{ width: '7%' }} />   {/* Wins */}
                      <col style={{ width: '8%' }} />   {/* WR */}
                      <col style={{ width: '13%' }} />  {/* Avg net $ */}
                      <col style={{ width: '13%' }} />  {/* Avg net % */}
                      <col style={{ width: '13%' }} />  {/* Sum net $ */}
                      <col style={{ width: '13%' }} />  {/* Sum net % */}
                    </colgroup>
                    <thead>
                      <tr className="text-left text-muted-foreground border-b sticky top-0 bg-background">
                        <th className="py-1 pr-2">Strategy</th>
                        <th className="py-1 px-2 text-right">N</th>
                        <th className="py-1 px-2 text-right">Wins</th>
                        <th className="py-1 px-2 text-right">WR</th>
                        <th className="py-1 px-2 text-right">Avg net $</th>
                        <th className="py-1 px-2 text-right">Avg net %</th>
                        <th className="py-1 px-2 text-right">Sum net $</th>
                        <th className="py-1 pl-2 text-right">Sum net %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(d.strategiesByRegime).map(([regime, strategies]) => (
                        <React.Fragment key={regime}>
                          <tr className="bg-muted/40">
                            <td colSpan={8} className="py-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {regime.replace(/_/g, ' ')}
                            </td>
                          </tr>
                          {strategies.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-1 pl-4 pr-2 text-xs italic text-muted-foreground">
                                no closed trades in this regime during the window
                              </td>
                            </tr>
                          ) : (
                            strategies.map((s) => (
                              <tr key={`${regime}-${s.strategy}`} className="border-b border-border/40">
                                <td className="py-1 pl-4 pr-2 font-mono truncate">{s.strategy}</td>
                                <td className="py-1 px-2 text-right font-mono">{s.tradeCount}</td>
                                <td className="py-1 px-2 text-right font-mono">{s.winCount}</td>
                                <td className="py-1 px-2 text-right font-mono">{s.winRate.toFixed(1)}%</td>
                                <td className={`py-1 px-2 text-right font-mono ${s.avgNetValue >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  {s.avgNetValue >= 0 ? '+$' : '-$'}{Math.abs(s.avgNetValue).toFixed(2)}
                                </td>
                                <td className={`py-1 px-2 text-right font-mono ${s.avgNetPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  {s.avgNetPct >= 0 ? '+' : ''}{s.avgNetPct.toFixed(3)}%
                                </td>
                                <td className={`py-1 px-2 text-right font-mono ${s.sumNetValue >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  {s.sumNetValue >= 0 ? '+$' : '-$'}{Math.abs(s.sumNetValue).toFixed(2)}
                                </td>
                                <td className={`py-1 pl-2 text-right font-mono ${s.sumNetPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  {s.sumNetPct >= 0 ? '+' : ''}{s.sumNetPct.toFixed(2)}%
                                </td>
                              </tr>
                            ))
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MappingDriftSection() {
  const [syncing, setSyncing] = useState(false);

  const { data: driftData, isLoading: driftLoading, refetch: refetchDrift } = useQuery<MappingDriftData>({
    queryKey: ['/api/system/mapping-drift'],
    queryFn: () => apiFetch('/api/system/mapping-drift'),
    refetchInterval: 30000,
  });

  const { data: canonicalData, isLoading: canonicalLoading } = useQuery<CanonicalMapData>({
    queryKey: ['/api/system/canonical-map'],
    queryFn: () => apiFetch('/api/system/canonical-map'),
  });

  const handleForceSync = async () => {
    setSyncing(true);
    try {
      await apiFetch('/api/system/force-sync-canonical', { method: 'POST' });
      await refetchDrift();
    } catch (err) {
      console.error('Force sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const getDriftColor = (score: number) => {
    if (score <= 0.5) return 'text-green-400';
    if (score <= 0.8) return 'text-lime-400';
    if (score <= 1.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getDriftBg = (score: number) => {
    if (score <= 0.5) return 'bg-green-500/20';
    if (score <= 0.8) return 'bg-lime-500/20';
    if (score <= 1.5) return 'bg-yellow-500/20';
    return 'bg-red-500/20';
  };

  const getDriftLabel = (score: number) => {
    if (score <= 0.5) return 'Aligned';
    if (score <= 0.8) return 'Minor Drift';
    if (score <= 1.5) return 'Moderate Drift';
    return 'Significant Drift';
  };

  if (driftLoading || canonicalLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const schemaVersion = canonicalData?._schema || 'Unknown';
  const lastUpdated = canonicalData?._metadata?.updatedAt || 'Unknown';

  return (
    <div className="space-y-6">
      <Card className="bg-purple-500/10 border-purple-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <GitBranch className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-purple-300 mb-1">About Mapping Drift</p>
              <p className="text-muted-foreground">
                This panel monitors how well each trading strategy aligns with its designated market regime. Each strategy 
                is designed for specific market conditions (e.g., "Mean Reversion" for choppy markets). <strong>Drift Score</strong> 
                measures deviation from ideal conditions — <span className="text-green-400">green</span> means the strategy 
                is operating in its optimal environment, while <span className="text-red-400">red</span> suggests conditions 
                have shifted and the strategy may underperform.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Schema: <Badge variant="outline">{schemaVersion}</Badge>
            <span className="ml-4">Last Sync: {lastUpdated}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('/api/system/mapping-drift/export', '_blank')}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleForceSync}
            disabled={syncing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Force Sync Canonical'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Drift Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${getDriftColor(driftData?.driftScore || 0)}`}>
              {driftData?.driftScore?.toFixed(3) || '0.000'}
            </div>
            <Badge className={`mt-2 ${getDriftBg(driftData?.driftScore || 0)}`}>
              {getDriftLabel(driftData?.driftScore || 0)}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Canonical Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {((driftData?.canonicalCoverage || 0) * 100).toFixed(1)}%
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {driftData?.validPairs || 0} pairs analyzed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            {!driftData?.minSamplesMet ? (
              <Badge variant="secondary">Insufficient Samples</Badge>
            ) : driftData?.isDrifted ? (
              <Badge variant="destructive">Drift Detected</Badge>
            ) : (
              <Badge className="bg-green-500/20 text-green-400">Aligned</Badge>
            )}
            {driftData?.extraEmpirical && driftData.extraEmpirical.length > 0 && (
              <p className="text-xs text-red-400 mt-2">
                Unknown regimes: {driftData.extraEmpirical.join(', ')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Regime Distribution</CardTitle>
          <CardDescription>Empirical regime distribution from active telemetry</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(driftData?.normalizedDistribution || {}).map(([regime, count]) => {
              const total = driftData?.validPairs || 1;
              const pct = (count / total) * 100;
              return (
                <div key={regime} className="flex items-center gap-4">
                  <span className="w-32 text-sm font-medium">{regime}</span>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <span className="w-16 text-sm text-right">{pct.toFixed(1)}%</span>
                  <span className="w-12 text-sm text-muted-foreground text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {driftData?.recommendations && driftData.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {driftData.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  {rec}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Detailed Strategy Drift Scores</CardTitle>
          <CardDescription>
            Per-regime-strategy DriftScores computed using weighted Euclidean distance from ideal Z-score targets
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!driftData?.minSamplesMet ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <Clock className="w-5 h-5 mr-2" />
              Waiting for {'\u2265'}30 samples to populate drift data ({driftData?.validPairs || 0}/30)
            </div>
          ) : !driftData?.hasZScoreData ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <RefreshCw className="w-5 h-5 mr-2" />
              Collecting Z-score data for drift computation...
            </div>
          ) : driftData?.driftScores && Object.keys(driftData.driftScores).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(driftData.driftScores).map(([regime, strategies]) => (
                <div key={regime} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge className={getRegimeBadgeColor(regime)}>{regime}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {Object.keys(strategies).length} strategies
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {Object.entries(strategies).map(([strategy, result]) => (
                      <div 
                        key={strategy} 
                        className={`p-2 rounded border ${
                          result.score <= 0.5 ? 'border-green-500/30 bg-green-500/5' :
                          result.score <= 0.8 ? 'border-lime-500/30 bg-lime-500/5' :
                          result.score <= 1.5 ? 'border-yellow-500/30 bg-yellow-500/5' :
                          'border-red-500/30 bg-red-500/5'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium truncate">{strategy}</span>
                          <span className={`text-xs font-bold ${getDriftColor(result.score)}`}>
                            {result.score.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          volZ: {result.actualVolZ.toFixed(2)} | trendZ: {result.actualTrendZ.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              No drift data available yet
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Canonical Regime–Strategy Mapping</CardTitle>
          <CardDescription>
            Mapping below is sourced directly from the canonical regime-strategy file (schema {schemaVersion}). 
            Any realignment updates are reflected automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {canonicalData && Object.entries(canonicalData)
              .filter(([key]) => !key.startsWith('_') && key !== 'ok' && key !== 'timestamp')
              .map(([regime, data]: [string, any]) => (
                <div key={regime} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={getRegimeBadgeColor(regime)}>{regime}</Badge>
                    <span className="text-sm text-muted-foreground">
                      Risk: {data.riskMultiplier}× | Min Conf: {data.minConfidence}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.favoredStrategies?.map((strategy: string) => (
                      <Badge key={strategy} variant="outline" className="text-xs">
                        {strategy}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const FILTER_DESCRIPTIONS: Record<string, string> = {
  macroFilter: "Blocks trades during macroeconomic instability (VIX > 30, BTC correlation > 0.8)",
  volatilityFilter: "Pauses signals when realized volatility exceeds 1.5σ of regime baseline",
  confidenceGate: "Requires predictive confidence ≥ configured threshold (default 0.65)",
  riskScreen: "Blocks entries exceeding 1.2× mean risk ratio over 7-day rolling window",
  liquidityFilter: "Ensures sufficient market depth for position sizing",
  trendFilter: "Validates trend alignment with regime expectations",
  momentumFilter: "Confirms momentum strength meets minimum thresholds",
  regimeFilter: "Ensures market regime matches strategy requirements"
};

const WEIGHT_LABELS: Record<string, string> = {
  volZ: 'Volatility Z-Score',
  trendZ: 'Trend Z-Score',
  adx: 'ADX Strength',
  momentum: 'Momentum'
};

function getFilterStatusIcon(status: string) {
  switch (status) {
    case 'PASS': return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'BLOCKED': return <XCircle className="w-4 h-4 text-red-500" />;
    case 'SKIPPED': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    case 'DRIFT': return <AlertCircle className="w-4 h-4 text-orange-500" />;
    default: return <Info className="w-4 h-4 text-muted-foreground" />;
  }
}

function getFilterStatusColor(status: string) {
  switch (status) {
    case 'PASS': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'BLOCKED': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'SKIPPED': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'DRIFT': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    default: return 'bg-muted text-muted-foreground';
  }
}

function getDriftGaugeColor(drift: number) {
  if (drift <= 0.3) return 'bg-green-500';
  if (drift <= 0.6) return 'bg-lime-500';
  if (drift <= 1.0) return 'bg-yellow-500';
  return 'bg-red-500';
}

interface PassiveDecision {
  timestamp: string;
  symbol: string;
  signalType: string;
  strategy: string;
  regime: string;
  outcome: 'ACCEPTED' | 'REJECTED';
  reason: string;
  expectedReturn: number | null;
  finalScore: number | null;
  netEV: number | null;
}

interface PassiveDecisionsData {
  decisions: PassiveDecision[];
  summary: {
    total: number;
    accepted: number;
    rejected: number;
    byReason: Record<string, number>;
  };
  meta: {
    date: string;
    isPassiveMode: boolean;
    schema: string;
  };
}

function PredictiveDiagnosticsSection() {
  const { isPaper } = useTradingMode();
  const { data: diagnosticsData, isLoading, refetch } = useQuery<PredictiveDiagnosticsData>({
    queryKey: ['/api/system/predictive-diagnostics'],
    queryFn: () => apiFetch('/api/system/predictive-diagnostics'),
    refetchInterval: 15000,
  });
  
  const { data: passiveDecisions, isLoading: passiveLoading, refetch: refetchPassive } = useQuery<PassiveDecisionsData>({
    queryKey: ['/api/vts/passive-decisions'],
    queryFn: () => apiFetch('/api/vts/passive-decisions?limit=100'),
    refetchInterval: 30000,
    enabled: isPaper,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const models = diagnosticsData?.predictiveModels || {};
  const filters = diagnosticsData?.filters || {};
  const decisions = diagnosticsData?.recentDecisions || [];
  const stats = diagnosticsData?.telemetryStats || { totalSignalsProcessed: 0, passRate: 0, avgConfidence: 0, driftWarnings: 0 };

  return (
    <div className="space-y-6">
      <Card className="bg-blue-500/10 border-blue-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-300 mb-1">About Predictive Diagnostics</p>
              <p className="text-muted-foreground">
                This panel shows how the system's machine learning models are performing. <strong>Calibration Drift</strong> measures 
                how far the model's predictions have shifted from their training baseline — lower is better. <strong>Pass Rate</strong> 
                shows what percentage of trading signals pass quality filters. <strong>Decision Traceback</strong> below lets you 
                trace exactly why specific signals were approved or blocked.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Schema: <Badge variant="outline">{diagnosticsData?.schema || 'Unknown'}</Badge>
            <span className="ml-4">Last Update: {diagnosticsData?.timestamp ? formatDistanceToNow(new Date(diagnosticsData.timestamp), { addSuffix: true }) : 'Unknown'}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Signals Processed</div>
            <div className="text-2xl font-bold">{stats.totalSignalsProcessed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Pass Rate</div>
            <div className="text-2xl font-bold text-green-500">{(stats.passRate * 100).toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Avg Confidence</div>
            <div className="text-2xl font-bold">{(stats.avgConfidence * 100).toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Drift Warnings</div>
            <div className={`text-2xl font-bold ${stats.driftWarnings > 0 ? 'text-orange-500' : 'text-green-500'}`}>{stats.driftWarnings}</div>
          </CardContent>
        </Card>
      </div>

      {/* B59: Placeholder data warning — Model Diagnostics and Filter Logic show hardcoded defaults, not real telemetry */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-3 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-medium">Placeholder Data</span> — Model Diagnostics (accuracy, confidence, drift, weight contributions) and Filter Logic values below are default seed values, not computed from real trading telemetry. These will be wired to live pipeline data in a future batch.
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Model Diagnostics
          </CardTitle>
          <CardDescription>Calibration drift, accuracy, and weight contributions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(models).map(([modelId, model]) => (
            <div key={modelId} className="p-4 rounded-lg bg-muted/50 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{modelId}</span>
                <div className="flex items-center gap-4">
                  <div className="text-sm">
                    <span className="text-muted-foreground">7-Day Accuracy:</span>
                    <span className="ml-2 font-mono font-bold text-green-500">{(model.accuracy7d * 100).toFixed(1)}%</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Mean Confidence:</span>
                    <span className="ml-2 font-mono">{(model.meanConfidence * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Calibration Drift</span>
                  <span className={`font-mono text-sm ${model.calibrationDrift > 1 ? 'text-orange-500' : 'text-green-500'}`}>
                    {model.calibrationDrift.toFixed(3)}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${getDriftGaugeColor(model.calibrationDrift)}`}
                    style={{ width: `${Math.min(model.calibrationDrift * 33.3, 100)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground mb-2">Weight Contribution (%)</div>
                <div className="space-y-2">
                  {Object.entries(model.weightContribution).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs w-24 truncate">{WEIGHT_LABELS[key] || key}</span>
                      <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500/70"
                          style={{ width: `${value * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono w-12 text-right">{(value * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filter Logic
          </CardTitle>
          <CardDescription>Current filter states with pass/fail status and reasoning</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(filters).map(([filterName, filter]) => (
              <div key={filterName} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                {getFilterStatusIcon(filter.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{filterName.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <Badge variant="outline" className={`text-xs ${getFilterStatusColor(filter.status)}`}>
                      {filter.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{filter.reason}</p>
                  {filter.confidence !== undefined && (
                    <p className="text-xs text-muted-foreground">Confidence: {(filter.confidence * 100).toFixed(0)}% (threshold: {((filter.threshold || 0.65) * 100).toFixed(0)}%)</p>
                  )}
                  {filter.riskRatio !== undefined && (
                    <p className="text-xs text-muted-foreground">Risk Ratio: {filter.riskRatio.toFixed(2)}</p>
                  )}
                </div>
                <div className="group relative">
                  <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                  <div className="absolute right-0 top-6 z-50 hidden group-hover:block w-64 p-2 text-xs bg-popover border rounded-md shadow-lg">
                    {FILTER_DESCRIPTIONS[filterName] || 'No description available'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Decision Traceback
            {isPaper && (
              <Badge variant="outline" className="ml-2 text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                Passive Learning
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {isPaper 
              ? `Passive Learning — Pre-Execution Decisions (${passiveDecisions?.decisions?.length || 0}/100)`
              : `Recent trade decisions with full decision path (${decisions.length}/100 max)`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPaper ? (
            passiveLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (passiveDecisions?.decisions?.length || 0) === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No passive decisions recorded today</p>
                <p className="text-sm">VTS decisions will appear as signals are evaluated</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <p className="text-xs text-blue-300">
                    <strong>Note:</strong> These are pre-execution evaluations. No trade was placed unless marked Accepted. 
                    This does not represent live execution logic.
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                    Accepted: {passiveDecisions?.summary?.accepted || 0}
                  </Badge>
                  <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">
                    Rejected: {passiveDecisions?.summary?.rejected || 0}
                  </Badge>
                  {passiveDecisions?.summary?.byReason && Object.entries(passiveDecisions.summary.byReason).slice(0, 4).map(([reason, count]) => (
                    <Badge key={reason} variant="outline" className="text-xs bg-muted/50 text-muted-foreground">
                      {reason}: {count as number}
                    </Badge>
                  ))}
                </div>
                
                <ScrollArea className="h-[280px]">
                  <div className="space-y-2">
                    {passiveDecisions?.decisions?.slice(0, 50).map((decision, idx) => (
                      <Collapsible key={idx}>
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className={decision.outcome === 'ACCEPTED' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                                {decision.outcome}
                              </Badge>
                              <span className="font-mono font-medium text-sm">{decision.symbol}</span>
                              <Badge variant="secondary" className="text-xs">{decision.signalType}</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{(decision.regime || '').replace(/BULL_STABLE/g, 'TREND_FRIENDLY_STABLE').replace(/BEAR_VOLATILE/g, 'HIGH_VOLATILITY_UNSTABLE').replace(/LOW_VOL_CHOP/g, 'RANGE_BOUND_STABLE').replace(/HIGH_VOL_IMPULSE/g, 'IMPULSE_EXPANSION').replace(/^TRANSITION$/g, 'STRUCTURAL_TRANSITION')}</span>
                              <ChevronDown className="w-4 h-4" />
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 p-3 bg-muted/30 rounded-lg space-y-2 text-sm">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-muted-foreground">Strategy:</span>
                                <span className="ml-2 font-mono">{decision.strategy}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Reason:</span>
                                <span className="ml-2">{decision.reason}</span>
                              </div>
                              {decision.expectedReturn !== null && (
                                <div>
                                  <span className="text-muted-foreground">Expected ROI:</span>
                                  <span className="ml-2">{(decision.expectedReturn * 100).toFixed(2)}%</span>
                                </div>
                              )}
                              {decision.finalScore !== null && (
                                <div>
                                  <span className="text-muted-foreground">Final Score:</span>
                                  <span className="ml-2">{decision.finalScore.toFixed(3)}</span>
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(decision.timestamp), 'PPpp')}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                </ScrollArea>
                
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => refetchPassive()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>
            )
          ) : decisions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No recent decisions recorded</p>
              <p className="text-sm">Decisions will appear as signals are processed</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {decisions.slice(-20).reverse().map((decision, idx) => (
                  <Collapsible key={idx}>
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className={decision.decision === 'APPROVED' ? 'bg-green-500/20 text-green-400' : decision.decision === 'BLOCKED' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}>
                            {decision.decision}
                          </Badge>
                          <span className="font-mono font-medium">{decision.pair}</span>
                          <Badge variant="secondary" className="text-xs">{decision.signalType}</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{decision.predictedRegime}</span>
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 p-3 bg-muted/30 rounded-lg space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Model:</span>
                          <span className="font-mono">{decision.modelUsed}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Trace Path:</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {decision.tracePath.map((step, stepIdx) => (
                            <div key={stepIdx} className="flex items-center">
                              <Badge variant="outline" className="text-xs">{step}</Badge>
                              {stepIdx < decision.tracePath.length - 1 && <span className="mx-1 text-muted-foreground">→</span>}
                            </div>
                          ))}
                        </div>
                        {decision.timestamp && (
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(decision.timestamp), 'PPpp')}
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Learning System Status
          </CardTitle>
          <CardDescription>Status of all machine learning subsystems</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium">ML Calibration</span>
              </div>
              <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                Active (Learning)
              </Badge>
            </div>
            
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium">Telemetry Aggregator</span>
              </div>
              <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                Active (Learning)
              </Badge>
            </div>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-help">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-gray-500/50" />
                      <span className="text-sm font-medium text-muted-foreground">Heuristic Trader</span>
                    </div>
                    <Badge variant="outline" className="text-xs bg-gray-500/20 text-gray-400 border-gray-500/30">
                      Inactive — By Design
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs" side="bottom">
                  <p className="text-xs">Designed for behavioral adaptation (UI patterns), not trade outcomes. Uses database behavioral logs which are separate from VTS simulation data.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-help">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-gray-500/50" />
                      <span className="text-sm font-medium text-muted-foreground">Signal Weight Optimizer</span>
                    </div>
                    <Badge variant="outline" className="text-xs bg-gray-500/20 text-gray-400 border-gray-500/30">
                      Inactive — By Design
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs" side="bottom">
                  <p className="text-xs">Designed for live prediction tracking. Uses database prediction outcomes which require live trading data, not VTS simulation.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-help">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-gray-500/50" />
                      <span className="text-sm font-medium text-muted-foreground">Cognitive Weight Adjuster</span>
                    </div>
                    <Badge variant="outline" className="text-xs bg-gray-500/20 text-gray-400 border-gray-500/30">
                      Inactive — By Design
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs" side="bottom">
                  <p className="text-xs">Requires user-curated learning sources from the database. VTS trades are not user-labeled and cannot drive this system.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-help">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-gray-500/50" />
                      <span className="text-sm font-medium text-muted-foreground">Adaptive Guardrails</span>
                    </div>
                    <Badge variant="outline" className="text-xs bg-gray-500/20 text-gray-400 border-gray-500/30">
                      Inactive — By Design
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs" side="bottom">
                  <p className="text-xs">Behavioral adaptation system that learns from UI actions and session patterns, not from trade outcomes or VTS data.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-help">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-blue-500/50" />
                      <span className="text-sm font-medium text-muted-foreground">QUANT Strategy Calibration</span>
                    </div>
                    <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                      Future (Not Implemented)
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs" side="bottom">
                  <p className="text-xs">Planned separate calibration service for QUANT trades. QUANT trades lack pattern data and require different learning objectives than HYBRID trades.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AnalyticsPage() {
  const { mode } = useTradingMode();
  const [activeTab, setActiveTab] = useState("overview");
  
  // Directive 11.4H.6E: Authenticated query with dynamic cache-bypass
  // apiFetch() includes credentials, authorization, and x-app-mode headers
  const { data: indicatorsData, isLoading: indicatorsLoading, error: indicatorsError, refetch: refetchIndicators } = useQuery<MarketIndicatorsData>({
    queryKey: ['/api/market-indicators'],
    queryFn: async () => {
      return apiFetch(`/api/market-indicators?t=${Date.now()}`);
    },
    refetchInterval: 60 * 1000, // 60 seconds per Directive 11.4H.6
    refetchOnWindowFocus: true,
    staleTime: 0, // Always treat data as stale to force refetch
  });
  
  // HF6: Log indicator errors without blocking the full page.
  // MarketOverviewSection handles missing data gracefully (returns null).
  // Other tabs (Governance, Predictive, etc.) remain accessible regardless.
  if (indicatorsError) {
    console.error('[11.4H.6E][Overview] API error:', indicatorsError);
  }
  
  // Directive 11.4H.6D Task 1B: Reactive effect to log updates when favored arrays change
  useEffect(() => {
    if (indicatorsData?.data?.favoredStrategies || indicatorsData?.data?.favoredSignalTypes) {
      console.debug('[11.4H.6D][Overview] Updated favored strategies/signals:', {
        strategies: indicatorsData.data.favoredStrategies,
        signals: indicatorsData.data.favoredSignalTypes,
      });
    }
  }, [indicatorsData?.data?.favoredStrategies, indicatorsData?.data?.favoredSignalTypes]);
  
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
          <TabsList className="grid w-full grid-cols-8 max-w-6xl">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="governance" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Governance
            </TabsTrigger>
            <TabsTrigger value="predictive" className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Predictive
            </TabsTrigger>
            <TabsTrigger value="mapping-drift" className="flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Mapping Drift
            </TabsTrigger>
            <TabsTrigger value="drift" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Drift Dashboard
            </TabsTrigger>
            <TabsTrigger value="top-batch" className="flex items-center gap-2">
              <List className="w-4 h-4" />
              Top Pairs
            </TabsTrigger>
            <TabsTrigger value="activities" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Events
            </TabsTrigger>
            <TabsTrigger value="benchmark" className="flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" />
              Benchmark
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-6 mt-6">
            <MarketOverviewSection indicators={indicatorsData} error={indicatorsError} onRetry={refetchIndicators} />
          </TabsContent>

          <TabsContent value="governance" className="mt-6">
            <GovernanceSection />
          </TabsContent>

          <TabsContent value="predictive" className="mt-6">
            <PredictiveDiagnosticsSection />
          </TabsContent>
          
          <TabsContent value="mapping-drift" className="mt-6">
            <MappingDriftSection />
          </TabsContent>

          <TabsContent value="drift" className="mt-6">
            <DriftDashboardSection />
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
