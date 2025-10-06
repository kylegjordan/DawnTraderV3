import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useState } from "react";
import { Save, Send, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface Goal {
  metric: string;
  goal: number | null;
  actual: number;
  percentAchieved: number | null;
}

interface GoalsSummary {
  goals: Goal[];
  hasGoals: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function GoalsEngineTab() {
  const { mode } = useTradingMode();
  const { toast } = useToast();
  const [editedGoals, setEditedGoals] = useState<{ [metric: string]: number | null }>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);

  const { data, isLoading } = useQuery<GoalsSummary>({
    queryKey: ['/api/goals/summary', { mode }],
  });

  const updateMutation = useMutation({
    mutationFn: async (goals: { metric: string; value: number | null }[]) => {
      return apiRequest('POST', '/api/goals/update', { goals, mode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/goals/summary'] });
      toast({
        title: "Goals updated",
        description: "Your goals have been saved successfully.",
      });
      setEditedGoals({});
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update goals",
        variant: "destructive",
      });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (message: string) => {
      return apiRequest('POST', '/api/goals/analyze', { message, mode });
    },
    onSuccess: (data: any) => {
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      setIsChatting(false);
    },
    onError: (error: any) => {
      toast({
        title: "AI Analysis Error",
        description: error.message || "Failed to get AI analysis",
        variant: "destructive",
      });
      setIsChatting(false);
    },
  });

  const handleGoalChange = (metric: string, value: string) => {
    const numValue = value === '' ? null : parseFloat(value);
    setEditedGoals(prev => ({ ...prev, [metric]: numValue }));
  };

  const handleSaveGoals = () => {
    const goalsToUpdate = Object.entries(editedGoals).map(([metric, value]) => ({
      metric,
      value,
    }));
    
    if (goalsToUpdate.length === 0) {
      toast({
        title: "No changes",
        description: "No goals have been modified.",
      });
      return;
    }

    updateMutation.mutate(goalsToUpdate);
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;

    setChatMessages(prev => [...prev, { role: 'user', content: chatInput }]);
    setIsChatting(true);
    analyzeMutation.mutate(chatInput);
    setChatInput('');
  };

  const formatValue = (value: number | null) => {
    if (value == null) return '';
    return value.toString();
  };

  const getGoalValue = (metric: string, defaultValue: number | null) => {
    return editedGoals.hasOwnProperty(metric) ? editedGoals[metric] : defaultValue;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Goals Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI Assistant</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-96 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const goals = data?.goals || [];
  const hasEdits = Object.keys(editedGoals).length > 0;

  return (
    <div className="space-y-6">
      {/* Goals Table */}
      <Card data-testid="card-goals-table">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span>Goals Configuration</span>
          </CardTitle>
          <Button 
            onClick={handleSaveGoals} 
            disabled={!hasEdits || updateMutation.isPending}
            data-testid="button-save-goals"
          >
            <Save className="w-4 h-4 mr-2" />
            {updateMutation.isPending ? 'Saving...' : 'Save Goals'}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="text-left p-3 text-sm font-semibold">Metric</th>
                  <th className="text-right p-3 text-sm font-semibold">Goal</th>
                  <th className="text-right p-3 text-sm font-semibold">Actual</th>
                  <th className="text-right p-3 text-sm font-semibold">% Achieved</th>
                </tr>
              </thead>
              <tbody>
                {goals.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      No goals set. Enter your first goal below or chat with the AI to get started.
                    </td>
                  </tr>
                ) : (
                  goals.map((goal, index) => {
                    const currentGoal = getGoalValue(goal.metric, goal.goal);
                    const percentAchieved = currentGoal && currentGoal > 0
                      ? (goal.actual / currentGoal) * 100
                      : null;
                    
                    return (
                      <tr key={index} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-sm" data-testid={`goal-metric-${index}`}>
                          {goal.metric}
                        </td>
                        <td className="p-3 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={formatValue(currentGoal)}
                            onChange={(e) => handleGoalChange(goal.metric, e.target.value)}
                            className="max-w-[150px] ml-auto text-right"
                            data-testid={`input-goal-${index}`}
                          />
                        </td>
                        <td className="p-3 text-sm font-mono text-right" data-testid={`goal-actual-${index}`}>
                          ${goal.actual.toFixed(2)}
                        </td>
                        <td className={cn(
                          "p-3 text-sm font-mono text-right font-semibold",
                          percentAchieved !== null && percentAchieved >= 100 && "text-success",
                          percentAchieved !== null && percentAchieved >= 75 && percentAchieved < 100 && "text-success/70",
                          percentAchieved !== null && percentAchieved >= 50 && percentAchieved < 75 && "text-warning",
                          percentAchieved !== null && percentAchieved < 50 && "text-destructive",
                          percentAchieved === null && "text-muted-foreground"
                        )} data-testid={`goal-percent-${index}`}>
                          {percentAchieved !== null ? `${percentAchieved.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {hasEdits && (
            <p className="text-xs text-muted-foreground mt-2">
              You have unsaved changes. Click "Save Goals" to apply them.
            </p>
          )}
        </CardContent>
      </Card>

      {/* AI Conversational Panel */}
      <Card data-testid="card-ai-chat">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Goal Assistant
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Chat with the AI to discuss your goals, get recommendations, and optimize your strategy
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Chat Messages */}
            <ScrollArea className="h-[400px] w-full border rounded-lg p-4">
              {chatMessages.length === 0 ? (
                <div className="text-center text-muted-foreground py-16">
                  <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Start a conversation with the AI assistant</p>
                  <p className="text-sm mt-2">Ask about your goals, request recommendations, or discuss strategies</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {chatMessages.map((message, index) => (
                    <div
                      key={index}
                      className={cn(
                        "flex",
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                      data-testid={`chat-message-${index}`}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg p-3",
                          message.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground'
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </div>
                  ))}
                  {isChatting && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg p-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Chat Input */}
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask the AI about your goals..."
                disabled={isChatting}
                data-testid="input-ai-chat"
              />
              <Button 
                onClick={handleSendMessage} 
                disabled={isChatting || !chatInput.trim()}
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
