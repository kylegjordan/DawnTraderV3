import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Shield, AlertTriangle, CheckCircle, Clock, TrendingDown, Activity, Lock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

interface GovernanceData {
  ok: boolean;
  schema: string;
  stability: 'STABLE' | 'TRANSITION' | 'UNSTABLE' | null;
  metrics: {
    driftScore: number;
    volZ: number;
    regimeConfidence: number;
    flipRate: number;
  } | null;
  reason: string;
  stats: {
    allowed: number;
    throttled: number;
    blocked: number;
    totalDecisions: number;
    blockRate: number;
    throttleRate: number;
    lastReset: number;
  };
  strategyMultipliers: Record<string, number>;
  learning: {
    deferredCount: number;
    batchPendingCount: number;
    stats: {
      immediatePositive: number;
      immediateNegative: number;
      batchedPositive: number;
      deferredPositive: number;
      replayed: number;
    };
    canReplay: boolean;
  };
  config: {
    influenceRules: Record<string, Record<string, number>>;
    strategyProfiles: Record<string, { dependency: string; description: string }>;
  };
  timestamp: string;
}

function StabilityBadge({ stability }: { stability: string | null }) {
  if (!stability) {
    return <Badge variant="outline" className="text-gray-500">Not Computed</Badge>;
  }
  
  switch (stability) {
    case 'STABLE':
      return <Badge className="bg-green-500 text-white">STABLE</Badge>;
    case 'TRANSITION':
      return <Badge className="bg-yellow-500 text-black">TRANSITION</Badge>;
    case 'UNSTABLE':
      return <Badge className="bg-red-500 text-white">UNSTABLE</Badge>;
    default:
      return <Badge variant="outline">{stability}</Badge>;
  }
}

function DependencyBadge({ dependency }: { dependency: string }) {
  switch (dependency) {
    case 'HIGH':
      return <Badge variant="destructive">HIGH</Badge>;
    case 'MEDIUM':
      return <Badge className="bg-yellow-500 text-black">MEDIUM</Badge>;
    case 'LOW':
      return <Badge className="bg-green-500 text-white">LOW</Badge>;
    default:
      return <Badge variant="outline">{dependency}</Badge>;
  }
}

export default function GovernanceSection() {
  const { data: governanceData, isLoading, error } = useQuery<GovernanceData>({
    queryKey: ['governance-state'],
    queryFn: async () => {
      const response = await apiFetch('/api/system/governance');
      return response;
    },
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 animate-pulse" />
            <span>Loading governance state...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !governanceData?.ok) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="w-5 h-5" />
            <span>Failed to load governance state</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { stability, metrics, reason, stats, strategyMultipliers, learning, config } = governanceData;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Current Stability
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <StabilityBadge stability={stability} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">{reason}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Decisions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDecisions}</div>
            <div className="flex gap-2 mt-2">
              <Badge variant="outline" className="text-green-600">
                <CheckCircle className="w-3 h-3 mr-1" />
                {stats.allowed}
              </Badge>
              <Badge variant="outline" className="text-yellow-600">
                <TrendingDown className="w-3 h-3 mr-1" />
                {stats.throttled}
              </Badge>
              <Badge variant="outline" className="text-red-600">
                <Lock className="w-3 h-3 mr-1" />
                {stats.blocked}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Learning Cooldown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Deferred</span>
                <span className="font-medium">{learning.deferredCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Batch Pending</span>
                <span className="font-medium">{learning.batchPendingCount}/5</span>
              </div>
            </div>
            {learning.canReplay && (
              <Badge className="mt-2 bg-green-500">Ready to Replay</Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Block Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats.blockRate * 100).toFixed(1)}%
            </div>
            <Progress 
              value={stats.blockRate * 100} 
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Throttle: {(stats.throttleRate * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Stability Metrics
            </CardTitle>
            <CardDescription>
              Thresholds: DriftScore &lt;0.8 STABLE, 0.8-1.5 TRANSITION, &gt;1.5 UNSTABLE
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Drift Score</span>
                  <span className={`font-medium ${
                    metrics.driftScore > 1.5 ? 'text-red-500' :
                    metrics.driftScore > 0.8 ? 'text-yellow-500' : 'text-green-500'
                  }`}>
                    {metrics.driftScore.toFixed(2)}
                  </span>
                </div>
                <Progress 
                  value={Math.min(metrics.driftScore / 2 * 100, 100)}
                  className="h-2"
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>|VolZ|</span>
                  <span className={`font-medium ${
                    Math.abs(metrics.volZ) > 2.0 ? 'text-red-500' :
                    Math.abs(metrics.volZ) > 1.2 ? 'text-yellow-500' : 'text-green-500'
                  }`}>
                    {Math.abs(metrics.volZ).toFixed(2)}
                  </span>
                </div>
                <Progress 
                  value={Math.min(Math.abs(metrics.volZ) / 3 * 100, 100)}
                  className="h-2"
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Confidence</span>
                  <span className={`font-medium ${
                    metrics.regimeConfidence < 0.45 ? 'text-red-500' :
                    metrics.regimeConfidence < 0.65 ? 'text-yellow-500' : 'text-green-500'
                  }`}>
                    {(metrics.regimeConfidence * 100).toFixed(0)}%
                  </span>
                </div>
                <Progress 
                  value={metrics.regimeConfidence * 100}
                  className="h-2"
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Flip Rate (7d)</span>
                  <span className={`font-medium ${
                    metrics.flipRate >= 4 ? 'text-red-500' :
                    metrics.flipRate >= 2 ? 'text-yellow-500' : 'text-green-500'
                  }`}>
                    {metrics.flipRate}
                  </span>
                </div>
                <Progress 
                  value={Math.min(metrics.flipRate / 5 * 100, 100)}
                  className="h-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Strategy Influence Multipliers
          </CardTitle>
          <CardDescription>
            Current weight multipliers based on regime stability and strategy dependency
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(strategyMultipliers).map(([strategy, multiplier]) => {
              const profile = config.strategyProfiles[strategy];
              const multiplierPercent = multiplier * 100;
              
              return (
                <div 
                  key={strategy} 
                  className={`p-3 rounded-lg border ${
                    multiplier === 0 ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-900' :
                    multiplier < 1 ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-900' :
                    'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{strategy.replace(/_/g, ' ')}</span>
                    <DependencyBadge dependency={profile?.dependency || 'HIGH'} />
                  </div>
                  <div className="flex items-center gap-2">
                    {multiplier === 0 ? (
                      <Badge variant="destructive" className="text-xs">
                        <Lock className="w-3 h-3 mr-1" />
                        BLOCKED
                      </Badge>
                    ) : (
                      <span className={`text-lg font-bold ${
                        multiplier < 1 ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        {multiplierPercent.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Learning Statistics
          </CardTitle>
          <CardDescription>
            Directive 11.7R learning cooldown enforcement
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950">
              <div className="text-2xl font-bold text-green-600">
                {learning.stats.immediatePositive}
              </div>
              <div className="text-xs text-muted-foreground">Immediate +</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950">
              <div className="text-2xl font-bold text-red-600">
                {learning.stats.immediateNegative}
              </div>
              <div className="text-xs text-muted-foreground">Immediate -</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950">
              <div className="text-2xl font-bold text-yellow-600">
                {learning.stats.batchedPositive}
              </div>
              <div className="text-xs text-muted-foreground">Batched</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-orange-50 dark:bg-orange-950">
              <div className="text-2xl font-bold text-orange-600">
                {learning.stats.deferredPositive}
              </div>
              <div className="text-xs text-muted-foreground">Deferred</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
              <div className="text-2xl font-bold text-blue-600">
                {learning.stats.replayed}
              </div>
              <div className="text-xs text-muted-foreground">Replayed</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
