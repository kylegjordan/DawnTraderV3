import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Sparkles, MessageSquare, Star, X, TrendingUp, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AIOpportunity {
  id: string;
  symbol: string;
  type: string;
  entryZone: { min?: number; max?: number; value?: number };
  stopFloor: string;
  targetCeiling: number | number[];
  timeHorizon: string;
  riskAmountRule?: { type: string; value: number };
  notes: string;
  probabilityScore: number;
  riskRewardRating: string;
  eligibilityFlags?: string[];
  status: string;
  createdAt: string;
}

interface LatestRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  pairsConsidered: number;
  pairsSentToAi: number;
  opportunitiesCreated: number;
  modelUsed: string;
  costEstimate: string;
}

export function AIOpportunitiesTab() {
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [minProbability, setMinProbability] = useState<string>("0");
  const [selectedOpp, setSelectedOpp] = useState<AIOpportunity | null>(null);
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);

  // Fetch opportunities
  const { data: opportunities = [], isLoading } = useQuery<AIOpportunity[]>({
    queryKey: [
      "/api/ai/opportunities",
      typeFilter !== "all" ? typeFilter : undefined,
      statusFilter !== "all" ? statusFilter : undefined,
      minProbability !== "0" ? minProbability : undefined,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.append("type", typeFilter);
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (minProbability !== "0") params.append("minProbability", minProbability);
      
      const url = `/api/ai/opportunities${params.toString() ? `?${params.toString()}` : ''}`;
      return await apiRequest<AIOpportunity[]>("GET", url);
    },
  });

  // Fetch latest run stats
  const { data: latestRun } = useQuery<LatestRun>({
    queryKey: ["/api/ai/opportunities/latest-run"],
    queryFn: async () => {
      return await apiRequest<LatestRun>("GET", "/api/ai/opportunities/latest-run");
    },
  });

  // Update opportunity status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return await apiRequest("PATCH", `/api/ai/opportunities/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/opportunities"] });
      toast({
        title: "Status updated",
        description: "Opportunity status has been updated successfully",
      });
    },
  });

  // Manual trigger generation
  const generateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/ai/opportunities/generate");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/opportunities/latest-run"] });
      toast({
        title: "Generation started",
        description: "AI is analyzing markets for new opportunities",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation failed",
        description: error.message || "Failed to start opportunity generation",
        variant: "destructive",
      });
    },
  });

  const handleExecute = (opp: AIOpportunity) => {
    setSelectedOpp(opp);
    setExecuteDialogOpen(true);
  };

  const confirmExecute = () => {
    // TODO: Implement execute logic
    toast({
      title: "Execute triggered",
      description: `Executing trade for ${selectedOpp?.symbol}`,
    });
    setExecuteDialogOpen(false);
  };

  // Create conversation for opportunity
  const createConversationMutation = useMutation({
    mutationFn: async (opp: AIOpportunity) => {
      const title = `Opportunity: ${opp.symbol} - ${formatType(opp.type)}`;
      const contextMessage = JSON.stringify({
        opportunityId: opp.id,
        symbol: opp.symbol,
        type: opp.type,
        entryZone: opp.entryZone,
        stopFloor: opp.stopFloor,
        targetCeiling: opp.targetCeiling,
        timeHorizon: opp.timeHorizon,
        notes: opp.notes,
        probabilityScore: opp.probabilityScore,
        riskRewardRating: opp.riskRewardRating
      }, null, 2);
      
      return await apiRequest("POST", "/api/conversations", { 
        title,
        context: {
          opportunityContext: contextMessage,
          opportunityId: opp.id
        }
      });
    },
    onSuccess: (conversation) => {
      toast({
        title: "Chat opened",
        description: "Conversation created for this opportunity",
      });
    },
    onError: () => {
      toast({
        title: "Failed to open chat",
        description: "Could not create conversation",
        variant: "destructive",
      });
    },
  });

  const handleChat = (opp: AIOpportunity) => {
    createConversationMutation.mutate(opp);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-500";
      case "watchlist":
        return "bg-yellow-500";
      case "executed":
        return "bg-green-600";
      case "dismissed":
        return "bg-gray-400";
      case "expired":
        return "bg-red-500";
      default:
        return "bg-gray-400";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "long_term_hold":
        return "bg-blue-600";
      case "moonshot":
        return "bg-purple-600";
      case "momentum":
        return "bg-green-600";
      case "breakout":
        return "bg-orange-600";
      case "mean_reversion":
        return "bg-teal-600";
      default:
        return "bg-gray-600";
    }
  };

  const formatType = (type: string) => {
    return type.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  };

  return (
    <div className="space-y-6">
      {/* Stats & Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-white border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-gray-800">Latest Run Stats</CardTitle>
          </CardHeader>
          <CardContent>
            {latestRun ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pairs Analyzed:</span>
                  <span className="font-semibold text-gray-800" data-testid="text-pairs-analyzed">{latestRun.pairsConsidered}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Sent to AI:</span>
                  <span className="font-semibold text-gray-800" data-testid="text-sent-to-ai">{latestRun.pairsSentToAi}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Opportunities Created:</span>
                  <span className="font-semibold text-gray-800" data-testid="text-opportunities-created">{latestRun.opportunitiesCreated}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Model:</span>
                  <span className="font-mono text-xs text-gray-800" data-testid="text-model-used">{latestRun.modelUsed}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Cost:</span>
                  <span className="font-mono text-xs text-green-600" data-testid="text-cost-estimate">
                    ${parseFloat(latestRun.costEstimate).toFixed(4)}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-2" data-testid="text-last-run">
                  Last run: {new Date(latestRun.finishedAt).toLocaleString()}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600">No runs yet</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-gray-800">Generate New Opportunities</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-generate-opportunities"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {generateMutation.isPending ? "Generating..." : "Generate Opportunities"}
            </Button>
            <p className="text-xs text-gray-600 mt-2">
              Manually trigger AI analysis of all markets (5-minute cooldown)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-600 uppercase tracking-wide mb-2 block">Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="bg-white" data-testid="filter-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="long_term_hold">Long Term Hold</SelectItem>
                  <SelectItem value="moonshot">Moonshot</SelectItem>
                  <SelectItem value="momentum">Momentum</SelectItem>
                  <SelectItem value="breakout">Breakout</SelectItem>
                  <SelectItem value="mean_reversion">Mean Reversion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-gray-600 uppercase tracking-wide mb-2 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-white" data-testid="filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="watchlist">Watchlist</SelectItem>
                  <SelectItem value="executed">Executed</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-gray-600 uppercase tracking-wide mb-2 block">Min Probability</label>
              <Select value={minProbability} onValueChange={setMinProbability}>
                <SelectTrigger className="bg-white" data-testid="filter-probability">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">All (0%+)</SelectItem>
                  <SelectItem value="50">50%+</SelectItem>
                  <SelectItem value="60">60%+</SelectItem>
                  <SelectItem value="70">70%+</SelectItem>
                  <SelectItem value="80">80%+</SelectItem>
                  <SelectItem value="90">90%+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Opportunities List */}
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="bg-white border-gray-200">
              <CardContent className="p-6">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))
        ) : opportunities.length === 0 ? (
          <Card className="bg-white border-gray-200">
            <CardContent className="p-8 text-center">
              <p className="text-gray-600">No opportunities found</p>
              <p className="text-sm text-gray-500 mt-2">
                Try adjusting filters or generate new opportunities
              </p>
            </CardContent>
          </Card>
        ) : (
          opportunities.map((opp) => (
            <Card key={opp.id} className="bg-white border-gray-200 hover:shadow-md transition-shadow" data-testid={`opportunity-${opp.id}`}>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-800">{opp.symbol}</h3>
                        <Badge className={`${getTypeColor(opp.type)} text-white`}>
                          {formatType(opp.type)}
                        </Badge>
                        <Badge className={`${getStatusColor(opp.status)} text-white`}>
                          {opp.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600">{opp.notes}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span className="text-xl font-bold text-gray-800">{opp.probabilityScore}%</span>
                      </div>
                      <p className="text-xs text-gray-500">Probability</p>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-wide">Entry Zone</p>
                      <p className="text-sm font-semibold text-gray-800">
                        {opp.entryZone.value
                          ? `$${opp.entryZone.value}`
                          : `$${opp.entryZone.min} - $${opp.entryZone.max}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-wide">Stop Floor</p>
                      <p className="text-sm font-semibold text-red-600">${opp.stopFloor}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-wide">Target(s)</p>
                      <p className="text-sm font-semibold text-green-600">
                        {Array.isArray(opp.targetCeiling)
                          ? opp.targetCeiling.map((t) => `$${t}`).join(", ")
                          : `$${opp.targetCeiling}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-wide">Risk/Reward</p>
                      <p className="text-sm font-semibold text-gray-800">{opp.riskRewardRating}R</p>
                    </div>
                  </div>

                  {/* Additional Info */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>Time: {opp.timeHorizon}</span>
                      {opp.riskAmountRule && (
                        <span>
                          Risk: {opp.riskAmountRule.type === "dollar" ? "$" : ""}
                          {opp.riskAmountRule.value}
                          {opp.riskAmountRule.type === "percent" ? "%" : ""}
                        </span>
                      )}
                      {opp.eligibilityFlags && opp.eligibilityFlags.length > 0 && (
                        <div className="flex items-center gap-1">
                          <AlertCircle className="w-4 h-4 text-yellow-600" />
                          <span className="text-yellow-600">{opp.eligibilityFlags.join(", ")}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => handleExecute(opp)}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      size="sm"
                      data-testid={`button-execute-${opp.id}`}
                    >
                      Execute
                    </Button>
                    <Button
                      onClick={() => handleChat(opp)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      size="sm"
                      data-testid={`button-chat-${opp.id}`}
                    >
                      <MessageSquare className="w-4 h-4 mr-1" />
                      Chat
                    </Button>
                    <Button
                      onClick={() => updateStatusMutation.mutate({ id: opp.id, status: "watchlist" })}
                      disabled={opp.status === "watchlist"}
                      className="bg-yellow-500 hover:bg-yellow-600 text-white"
                      size="sm"
                      data-testid={`button-watchlist-${opp.id}`}
                    >
                      <Star className="w-4 h-4 mr-1" />
                      Watchlist
                    </Button>
                    <Button
                      onClick={() => updateStatusMutation.mutate({ id: opp.id, status: "dismissed" })}
                      disabled={opp.status === "dismissed"}
                      className="bg-gray-400 hover:bg-gray-500 text-white"
                      size="sm"
                      data-testid={`button-dismiss-${opp.id}`}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Execute Confirmation Dialog */}
      <Dialog open={executeDialogOpen} onOpenChange={setExecuteDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle className="text-gray-800">Execute Trade</DialogTitle>
            <DialogDescription className="text-gray-600">
              Are you sure you want to execute this opportunity?
            </DialogDescription>
          </DialogHeader>
          {selectedOpp && (
            <div className="space-y-2 py-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Symbol:</span>
                <span className="font-semibold text-gray-800">{selectedOpp.symbol}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Entry:</span>
                <span className="font-semibold text-gray-800">
                  {selectedOpp.entryZone.value
                    ? `$${selectedOpp.entryZone.value}`
                    : `$${selectedOpp.entryZone.min} - $${selectedOpp.entryZone.max}`}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Stop Loss:</span>
                <span className="font-semibold text-red-600">${selectedOpp.stopFloor}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExecuteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmExecute} className="bg-green-600 hover:bg-green-700 text-white">
              Confirm Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
