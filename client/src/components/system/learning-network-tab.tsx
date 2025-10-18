import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Brain, CheckCircle, XCircle, TrendingUp, Network, Hash, Lightbulb, AlertTriangle } from "lucide-react";

interface LearningDelta {
  id: string;
  originNodeId: string;
  deltaType: string;
  overallScore: number;
  isAccepted: boolean;
  acceptedBy: string | null;
  acceptedAt: string | null;
  createdAt: string;
  traceId: string;
}

interface LearningStats {
  totalDeltas: number;
  acceptedDeltas: number;
  rejectedDeltas: number;
  averageScore: number;
}

interface AlignmentLog {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  alignmentStrategy: string;
  alignmentScore: number;
  driftDetected: boolean;
  reconciliationSuccess: boolean;
  createdAt: string;
  traceId: string;
}

interface AlignmentStats {
  totalAlignments: number;
  successfulAlignments: number;
  failedAlignments: number;
  driftDetections: number;
  averageAlignmentScore: number;
}

interface DomainProposal {
  proposalId: string;
  sourceChannel: string;
  targetDomain: string;
  proposalType: string;
  confidence: number;
  requiresApproval: boolean;
  createdAt: string;
}

export default function LearningNetworkTab() {
  const { toast } = useToast();

  // Fetch learning delta statistics
  const { data: deltaStatsData, isLoading: deltaStatsLoading } = useQuery<{ ok: boolean; stats: LearningStats }>({
    queryKey: ['/api/learning/delta-stats'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch recent learning deltas
  const { data: deltasData, isLoading: deltasLoading } = useQuery<{ ok: boolean; deltas: LearningDelta[] }>({
    queryKey: ['/api/learning/deltas?limit=10'],
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  // Fetch alignment statistics
  const { data: alignmentStatsData, isLoading: alignmentStatsLoading } = useQuery<{ ok: boolean; stats: AlignmentStats }>({
    queryKey: ['/api/learning/alignment-stats'],
    refetchInterval: 30000,
  });

  // Fetch recent alignments
  const { data: alignmentsData, isLoading: alignmentsLoading } = useQuery<{ ok: boolean; alignments: AlignmentLog[] }>({
    queryKey: ['/api/learning/alignments?limit=10'],
    refetchInterval: 15000,
  });

  // Fetch domain proposals
  const { data: proposalsData, isLoading: proposalsLoading } = useQuery<{ ok: boolean; proposals: DomainProposal[]; stats: any }>({
    queryKey: ['/api/learning/proposals'],
    refetchInterval: 15000,
  });

  // Trigger manual learning sync
  const syncMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/learning/sync', 'POST', {});
    },
    onSuccess: (data: any) => {
      toast({
        title: "Learning Sync Triggered",
        description: data.message || "Manual learning synchronization initiated",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/learning/delta-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/learning/deltas?limit=10'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deltaStats = deltaStatsData?.stats;
  const deltas = deltasData?.deltas || [];
  const alignmentStats = alignmentStatsData?.stats;
  const alignments = alignmentsData?.alignments || [];
  const proposals = proposalsData?.proposals || [];
  const proposalStats = proposalsData?.stats;

  return (
    <div className="space-y-6">
      {/* Learning Statistics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {deltaStatsLoading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : deltaStats ? (
          <>
            <div className="border rounded-lg p-4" data-testid="learning-total-card">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">Total Deltas</span>
              </div>
              <div className="text-2xl font-bold" data-testid="learning-total-deltas">
                {deltaStats.totalDeltas}
              </div>
              <div className="text-xs text-muted-foreground">All learning events</div>
            </div>

            <div className="border rounded-lg p-4" data-testid="learning-accepted-card">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Accepted</span>
              </div>
              <div className="text-2xl font-bold" data-testid="learning-accepted-deltas">
                {deltaStats.acceptedDeltas}
              </div>
              <div className="text-xs text-muted-foreground">
                {deltaStats.rejectedDeltas} rejected
              </div>
            </div>

            <div className="border rounded-lg p-4" data-testid="learning-score-card">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Avg Score</span>
              </div>
              <div className="text-2xl font-bold" data-testid="learning-avg-score">
                {(deltaStats.averageScore * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Quality metric</div>
            </div>

            <div className="border rounded-lg p-4" data-testid="learning-proposals-card">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">Proposals</span>
              </div>
              <div className="text-2xl font-bold" data-testid="learning-total-proposals">
                {proposalStats?.totalProposals || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                {proposalStats?.pendingApprovals || 0} pending
              </div>
            </div>
          </>
        ) : (
          <p className="col-span-4 text-muted-foreground">No learning statistics available</p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          size="sm"
          variant="outline"
          data-testid="button-sync-learning"
        >
          {syncMutation.isPending ? "Syncing..." : "Trigger Learning Sync"}
        </Button>
      </div>

      {/* Recent Learning Deltas */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Recent Learning Deltas</h3>
        {deltasLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : deltas.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Origin Node</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-right p-2">Score</th>
                    <th className="text-left p-2">Trace ID</th>
                    <th className="text-left p-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {deltas.map((delta) => (
                    <tr
                      key={delta.id}
                      className="border-t hover:bg-muted/50"
                      data-testid={`learning-delta-${delta.id}`}
                    >
                      <td className="p-2">
                        {delta.isAccepted ? (
                          <Badge variant="default" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Accepted
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <XCircle className="h-3 w-3 mr-1" />
                            Rejected
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 font-mono text-xs">{delta.originNodeId}</td>
                      <td className="p-2">
                        <span className="inline-block px-2 py-0.5 rounded text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400">
                          {delta.deltaType}
                        </span>
                      </td>
                      <td className="p-2 text-right font-mono">
                        {(delta.overallScore * 100).toFixed(1)}%
                      </td>
                      <td className="p-2 font-mono text-xs text-muted-foreground">
                        {delta.traceId.substring(0, 8)}...
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {new Date(delta.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No recent learning deltas</p>
        )}
      </div>

      {/* Model Alignment History */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Model Alignment History</h3>
        {alignmentStatsLoading ? (
          <div className="mb-4 grid grid-cols-3 gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : alignmentStats ? (
          <div className="mb-4 grid grid-cols-3 gap-4">
            <div className="border rounded-lg p-3" data-testid="alignment-total-card">
              <div className="flex items-center gap-2 mb-1">
                <Hash className="h-4 w-4 text-indigo-500" />
                <span className="text-xs font-medium">Total Alignments</span>
              </div>
              <div className="text-xl font-bold" data-testid="alignment-total">
                {alignmentStats.totalAlignments}
              </div>
            </div>

            <div className="border rounded-lg p-3" data-testid="alignment-drift-card">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <span className="text-xs font-medium">Drift Detections</span>
              </div>
              <div className="text-xl font-bold" data-testid="alignment-drift">
                {alignmentStats.driftDetections}
              </div>
            </div>

            <div className="border rounded-lg p-3" data-testid="alignment-avg-card">
              <div className="flex items-center gap-2 mb-1">
                <Network className="h-4 w-4 text-cyan-500" />
                <span className="text-xs font-medium">Avg Alignment</span>
              </div>
              <div className="text-xl font-bold" data-testid="alignment-avg-score">
                {(alignmentStats.averageAlignmentScore * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        ) : null}

        {alignmentsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : alignments.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Source → Target</th>
                    <th className="text-left p-2">Strategy</th>
                    <th className="text-right p-2">Alignment</th>
                    <th className="text-left p-2">Drift</th>
                    <th className="text-left p-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {alignments.map((alignment) => (
                    <tr
                      key={alignment.id}
                      className="border-t hover:bg-muted/50"
                      data-testid={`alignment-${alignment.id}`}
                    >
                      <td className="p-2">
                        {alignment.reconciliationSuccess ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {alignment.sourceNodeId} → {alignment.targetNodeId}
                      </td>
                      <td className="p-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                          alignment.alignmentStrategy === 'accept' ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
                          alignment.alignmentStrategy === 'reject' ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
                          'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        }`}>
                          {alignment.alignmentStrategy}
                        </span>
                      </td>
                      <td className="p-2 text-right font-mono">
                        {(alignment.alignmentScore * 100).toFixed(1)}%
                      </td>
                      <td className="p-2">
                        {alignment.driftDetected ? (
                          <Badge variant="destructive" className="text-xs">Drift</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Aligned</Badge>
                        )}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {new Date(alignment.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No alignment history</p>
        )}
      </div>

      {/* Cross-Domain Proposals */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Cross-Domain Proposals</h3>
        {proposalsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : proposals.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Source → Target</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-right p-2">Confidence</th>
                    <th className="text-left p-2">Approval</th>
                    <th className="text-left p-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((proposal) => (
                    <tr
                      key={proposal.proposalId}
                      className="border-t hover:bg-muted/50"
                      data-testid={`proposal-${proposal.proposalId}`}
                    >
                      <td className="p-2 font-mono text-xs">
                        {proposal.sourceChannel.replace('_to_', ' → ')}
                      </td>
                      <td className="p-2">
                        <span className="inline-block px-2 py-0.5 rounded text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                          {proposal.proposalType}
                        </span>
                      </td>
                      <td className="p-2 text-right font-mono">
                        {(proposal.confidence * 100).toFixed(1)}%
                      </td>
                      <td className="p-2">
                        {proposal.requiresApproval ? (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-500/20">
                            Pending
                          </Badge>
                        ) : (
                          <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                            Auto
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {new Date(proposal.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No cross-domain proposals</p>
        )}
      </div>
    </div>
  );
}
