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
import GoalsTable from "./goals-table";
import PerformanceTrackingMetrics from "./performance-tracking-metrics";

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
      {/* Editable Goals Table */}
      <GoalsTable />

      {/* Performance Tracking Metrics */}
      <PerformanceTrackingMetrics />

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
