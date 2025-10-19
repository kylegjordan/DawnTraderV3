import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Download, RotateCcw, Power, PowerOff, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { format } from "date-fns";

interface TuningEvent {
  id: string;
  userId: string;
  mode: string;
  field: string;
  oldValue: string;
  newValue: string;
  confidence: string;
  reason: string;
  approvalType: string;
  status: string;
  reverted: boolean;
  executionLogId: string | null;
  createdAt: string;
}

interface TuningPolicy {
  id?: string;
  enabled: boolean;
  aggressiveness: string;
  maxStepPercent: string;
  cooldownMinutes: number;
  maxDailyAdjustments: number;
  fieldBounds: any;
  currentCounters: {
    adjustmentsToday: number;
    reverts: number;
  };
}

export default function TuningTab() {
  const { toast } = useToast();
  const [selectedMode, setSelectedMode] = useState<"paper" | "live">("paper");
  const [autoRefreshActive, setAutoRefreshActive] = useState(true);

  // Fetch tuning events
  const { data: events = [], isLoading: eventsLoading, refetch: refetchEvents } = useQuery<TuningEvent[]>({
    queryKey: ["/api/tuning/events", selectedMode],
    queryFn: async () => {
      const res = await fetch(`/api/tuning/events?mode=${selectedMode}&limit=50`);
      if (!res.ok) throw new Error("Failed to fetch tuning events");
      return res.json();
    },
    refetchInterval: autoRefreshActive ? 30000 : 120000, // 30s active, 120s idle
  });

  // Fetch tuning policy
  const { data: policy, isLoading: policyLoading, refetch: refetchPolicy } = useQuery<TuningPolicy>({
    queryKey: ["/api/tuning/policy", selectedMode],
    queryFn: async () => {
      const res = await fetch(`/api/tuning/policy?mode=${selectedMode}`);
      if (!res.ok) throw new Error("Failed to fetch tuning policy");
      return res.json();
    },
    refetchInterval: autoRefreshActive ? 30000 : 120000,
  });

  // Enable tuning mutation
  const enableMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/tuning/enable", {
        mode: selectedMode,
        aggressiveness: policy?.aggressiveness || "balanced",
        fieldBounds: policy?.fieldBounds || {},
      });
    },
    onSuccess: () => {
      toast({ title: "Auto-tuning enabled", description: "Parameter optimization is now active." });
      queryClient.invalidateQueries({ queryKey: ["/api/tuning/policy", selectedMode] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Disable tuning mutation
  const disableMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/tuning/disable", {
        mode: selectedMode,
      });
    },
    onSuccess: () => {
      toast({ title: "Auto-tuning disabled", description: "Parameter optimization has been stopped." });
      queryClient.invalidateQueries({ queryKey: ["/api/tuning/policy", selectedMode] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return apiRequest("POST", "/api/tuning/rollback", {
        eventId,
      });
    },
    onSuccess: () => {
      toast({ title: "Rollback successful", description: "Parameter has been reverted to previous value." });
      queryClient.invalidateQueries({ queryKey: ["/api/tuning/events", selectedMode] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // CSV Export
  const exportToCSV = () => {
    if (!events || events.length === 0) {
      toast({ title: "No data", description: "No tuning events to export.", variant: "destructive" });
      return;
    }

    const headers = ["Timestamp", "Field", "Old Value", "New Value", "Confidence", "Approval", "Status", "Reason"];
    const rows = events.map((e) => [
      format(new Date(e.createdAt), "yyyy-MM-dd HH:mm:ss"),
      e.field,
      e.oldValue,
      e.newValue,
      `${(Number(e.confidence) * 100).toFixed(0)}%`,
      e.approvalType,
      e.status,
      e.reason,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tuning_events_${selectedMode}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: "Export complete", description: "CSV file has been downloaded." });
  };

  // Auto-refresh toggle
  useEffect(() => {
    const handleVisibilityChange = () => {
      setAutoRefreshActive(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const loading = eventsLoading || policyLoading;
  const policyData = policy || {
    enabled: false,
    aggressiveness: "balanced",
    maxStepPercent: "10.00",
    cooldownMinutes: 60,
    maxDailyAdjustments: 10,
    currentCounters: { adjustmentsToday: 0, reverts: 0 },
    fieldBounds: {},
  };

  return (
    <div className="space-y-6" data-testid="tuning-tab">
      {/* Header Controls */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="mode-select">Trading Mode</Label>
              <Select
                value={selectedMode}
                onValueChange={(value) => setSelectedMode(value as "paper" | "live")}
                data-testid="select-mode"
              >
                <SelectTrigger id="mode-select" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paper">Paper</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="tuning-toggle">Auto-Tuning</Label>
              <div className="flex items-center gap-2">
                <Switch
                  id="tuning-toggle"
                  checked={policyData.enabled}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      enableMutation.mutate();
                    } else {
                      disableMutation.mutate();
                    }
                  }}
                  disabled={loading || enableMutation.isPending || disableMutation.isPending}
                  data-testid="switch-tuning"
                />
                <span className="text-sm text-muted-foreground">
                  {policyData.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={!events || events.length === 0}
              data-testid="button-export-csv"
            >
              <Download className="w-4 h-4 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Adjustments Today</p>
              <p className="text-2xl font-bold" data-testid="text-adjustments-today">
                {policyData.currentCounters.adjustmentsToday}
              </p>
            </div>
            <Activity className="w-8 h-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Reverts</p>
              <p className="text-2xl font-bold" data-testid="text-total-reverts">
                {policyData.currentCounters.reverts}
              </p>
            </div>
            <RotateCcw className="w-8 h-8 text-orange-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Aggressiveness</p>
              <p className="text-lg font-semibold capitalize" data-testid="text-aggressiveness">
                {policyData.aggressiveness}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-500" />
          </div>
        </Card>
      </div>

      {/* Recent Activity Table */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Tuning Activity</h3>
          <Badge variant={autoRefreshActive ? "default" : "secondary"} data-testid="badge-refresh-status">
            {autoRefreshActive ? "Auto-refresh: 30s" : "Auto-refresh: 120s"}
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Old Value</TableHead>
                <TableHead>New Value</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No tuning events yet
                  </TableCell>
                </TableRow>
              ) : (
                events.map((event) => (
                  <TableRow key={event.id} data-testid={`row-event-${event.id}`}>
                    <TableCell className="text-sm">
                      {format(new Date(event.createdAt), "MMM dd, HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium">{event.field}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{event.oldValue}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{event.newValue}</Badge>
                      {Number(event.newValue) > Number(event.oldValue) ? (
                        <TrendingUp className="w-3 h-3 inline ml-1 text-green-500" />
                      ) : (
                        <TrendingDown className="w-3 h-3 inline ml-1 text-red-500" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={Number(event.confidence) >= 0.8 ? "default" : "secondary"}>
                        {(Number(event.confidence) * 100).toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={event.approvalType === "auto" ? "default" : "secondary"}>
                        {event.approvalType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          event.status === "success"
                            ? "default"
                            : event.status === "failed"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {event.status}
                      </Badge>
                      {event.reverted && (
                        <Badge variant="outline" className="ml-1">
                          Reverted
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => rollbackMutation.mutate(event.id)}
                        disabled={event.reverted || rollbackMutation.isPending}
                        data-testid={`button-rollback-${event.id}`}
                      >
                        <RotateCcw className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Policy Overview */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Policy Configuration</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Max Step Percent</p>
            <p className="font-semibold">{policyData.maxStepPercent}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Cooldown Period</p>
            <p className="font-semibold">{policyData.cooldownMinutes} minutes</p>
          </div>
          <div>
            <p className="text-muted-foreground">Max Daily Adjustments</p>
            <p className="font-semibold">{policyData.maxDailyAdjustments}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Policy Status</p>
            <Badge variant={policyData.enabled ? "default" : "secondary"}>
              {policyData.enabled ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
