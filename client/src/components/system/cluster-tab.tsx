import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Server, Activity, CheckCircle, AlertCircle, Clock, Shield, Eye } from "lucide-react";

interface ClusterNode {
  id: string;
  name: string;
  role: string;
  status: string;
  lastHeartbeat: string;
  currentLoad: number;
  capacity: number;
  cpuUsage: number | null;
  memoryUsage: number | null;
}

interface ClusterTask {
  id: string;
  taskType: string;
  status: string;
  priority: number;
  createdAt: string;
  assignedNodeId: string | null;
}

interface ClusterStatus {
  totalNodes: number;
  healthyNodes: number;
  queuedTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
}

interface CircuitBreakerStatus {
  nodeId: string;
  nodeName: string;
  state: "closed" | "open" | "half_open";
  failureCount: number;
  successCount: number;
  nextRetryAt: string | null;
}

interface AuditLog {
  id: string;
  taskId: string;
  nodeId: string;
  gateType: "safety" | "federated_ethics" | "ethical_reasoning" | "knowledge_acquisition";
  gatePassed: boolean;
  gateResult: string;
  executionTimeMs: number;
  createdAt: string;
}

export default function ClusterTab() {
  const { toast } = useToast();

  const { data: statusData, isLoading: statusLoading } = useQuery<{ ok: boolean } & ClusterStatus>({
    queryKey: ['/api/cluster/status'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: nodesData, isLoading: nodesLoading } = useQuery<{ ok: boolean; nodes: ClusterNode[] }>({
    queryKey: ['/api/cluster/nodes'],
    refetchInterval: 30000,
  });

  const { data: queueData, isLoading: queueLoading } = useQuery<{ ok: boolean; tasks: ClusterTask[] }>({
    queryKey: ['/api/cluster/queue?limit=10'],
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  const { data: circuitBreakerData, isLoading: circuitBreakerLoading } = useQuery<{ ok: boolean; circuitBreakers: CircuitBreakerStatus[] }>({
    queryKey: ['/api/cluster/circuit-breaker'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: auditLogsData, isLoading: auditLogsLoading } = useQuery<{ ok: boolean; auditLogs: AuditLog[] }>({
    queryKey: ['/api/cluster/audit-logs?limit=20'],
    refetchInterval: 30000,
  });

  const rebalanceMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/cluster/rebalance', 'POST', {});
    },
    onSuccess: (data: any) => {
      toast({
        title: "Cluster Rebalanced",
        description: data.message || "Tasks rebalanced successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/cluster/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cluster/queue?limit=10'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Rebalance Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const nodes = nodesData?.nodes || [];
  const tasks = queueData?.tasks || [];

  return (
    <div className="space-y-6">
      {/* Cluster Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {statusLoading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : statusData ? (
          <>
            <div className="border rounded-lg p-4" data-testid="cluster-nodes-card">
              <div className="flex items-center gap-2 mb-2">
                <Server className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Cluster Nodes</span>
              </div>
              <div className="text-2xl font-bold" data-testid="cluster-healthy-nodes">
                {statusData.healthyNodes}/{statusData.totalNodes}
              </div>
              <div className="text-xs text-muted-foreground">Healthy nodes</div>
            </div>

            <div className="border rounded-lg p-4" data-testid="cluster-queue-card">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">Task Queue</span>
              </div>
              <div className="text-2xl font-bold" data-testid="cluster-queued-tasks">
                {statusData.queuedTasks}
              </div>
              <div className="text-xs text-muted-foreground">Queued / {statusData.runningTasks} running</div>
            </div>

            <div className="border rounded-lg p-4" data-testid="cluster-results-card">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Task Results</span>
              </div>
              <div className="text-2xl font-bold" data-testid="cluster-completed-tasks">
                {statusData.completedTasks}
              </div>
              <div className="text-xs text-muted-foreground">
                {statusData.failedTasks} failed
              </div>
            </div>
          </>
        ) : (
          <p className="col-span-3 text-muted-foreground">No cluster status available</p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={() => rebalanceMutation.mutate()}
          disabled={rebalanceMutation.isPending}
          size="sm"
          variant="outline"
          data-testid="button-rebalance"
        >
          {rebalanceMutation.isPending ? "Rebalancing..." : "Rebalance Tasks"}
        </Button>
      </div>

      {/* Cluster Nodes Table */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Cluster Nodes</h3>
        {nodesLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : nodes.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Node</th>
                    <th className="text-left p-2">Role</th>
                    <th className="text-right p-2">Load</th>
                    <th className="text-right p-2">CPU</th>
                    <th className="text-right p-2">Memory</th>
                    <th className="text-left p-2">Last Heartbeat</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((node) => (
                    <tr
                      key={node.id}
                      className="border-t hover:bg-muted/50"
                      data-testid={`cluster-node-${node.id}`}
                    >
                      <td className="p-2">
                        {node.status === "healthy" ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        )}
                      </td>
                      <td className="p-2 font-mono text-xs">{node.name}</td>
                      <td className="p-2">
                        <span className="inline-block px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400">
                          {node.role}
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        {node.currentLoad}/{node.capacity}
                      </td>
                      <td className="p-2 text-right">
                        {node.cpuUsage !== null ? `${node.cpuUsage.toFixed(1)}%` : "—"}
                      </td>
                      <td className="p-2 text-right">
                        {node.memoryUsage !== null ? `${node.memoryUsage.toFixed(1)}%` : "—"}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {new Date(node.lastHeartbeat).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm" data-testid="cluster-nodes-empty">
            No cluster nodes registered
          </p>
        )}
      </div>

      {/* Recent Task Queue */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Recent Task Queue (Last 10)</h3>
        {queueLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : tasks.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Task Type</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-right p-2">Priority</th>
                    <th className="text-left p-2">Assigned Node</th>
                    <th className="text-left p-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr
                      key={task.id}
                      className="border-t hover:bg-muted/50"
                      data-testid={`cluster-task-${task.id}`}
                    >
                      <td className="p-2 font-mono text-xs">{task.taskType}</td>
                      <td className="p-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs ${
                            task.status === "completed"
                              ? "bg-green-500/10 text-green-600 dark:text-green-400"
                              : task.status === "running"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : task.status === "failed"
                              ? "bg-red-500/10 text-red-600 dark:text-red-400"
                              : "bg-gray-500/10 text-gray-600 dark:text-gray-400"
                          }`}
                        >
                          {task.status}
                        </span>
                      </td>
                      <td className="p-2 text-right">{task.priority}</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {task.assignedNodeId || "—"}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {new Date(task.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm" data-testid="cluster-queue-empty">
            No tasks in queue
          </p>
        )}
      </div>

      {/* Phase 17.5: Circuit Breaker Status */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Circuit Breaker Status (Phase 17.5)
        </h3>
        {circuitBreakerLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
          </div>
        ) : circuitBreakerData && circuitBreakerData.circuitBreakers.length > 0 ? (
          <div className="border rounded-lg p-4 space-y-3" data-testid="circuit-breaker-section">
            {circuitBreakerData.circuitBreakers.map((cb) => (
              <div key={cb.nodeId} className="flex items-center justify-between p-3 bg-muted/30 rounded">
                <div className="flex-1">
                  <p className="font-medium text-sm">{cb.nodeName}</p>
                  <p className="text-xs text-muted-foreground">
                    Failures: {cb.failureCount} | Successes: {cb.successCount}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      cb.state === "closed"
                        ? "default"
                        : cb.state === "open"
                        ? "destructive"
                        : "secondary"
                    }
                    data-testid={`circuit-breaker-${cb.nodeId}-state`}
                  >
                    {cb.state.toUpperCase()}
                  </Badge>
                  {cb.state === "open" && cb.nextRetryAt && (
                    <span className="text-xs text-muted-foreground">
                      Retry: {new Date(cb.nextRetryAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No circuit breaker data available</p>
        )}
      </div>

      {/* Phase 17.6: Audit Log Summary */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Ethical Gate Audit Log (Phase 17.6) - Last 20
        </h3>
        {auditLogsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : auditLogsData && auditLogsData.auditLogs.length > 0 ? (
          <div className="border rounded-lg overflow-hidden" data-testid="audit-logs-section">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Gate Type</th>
                    <th className="text-left p-2">Result</th>
                    <th className="text-right p-2">Exec Time</th>
                    <th className="text-left p-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogsData.auditLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-t hover:bg-muted/50"
                      data-testid={`audit-log-${log.id}`}
                    >
                      <td className="p-2 font-mono text-xs">{log.gateType}</td>
                      <td className="p-2">
                        {log.gatePassed ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                      </td>
                      <td className="p-2 text-right text-xs">{log.executionTimeMs}ms</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No audit logs available</p>
        )}
      </div>
    </div>
  );
}
