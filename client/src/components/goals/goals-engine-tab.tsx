import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useState, useEffect } from "react";
import { Save, Send, Sparkles, Mic, MicOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import PerformanceTrackingMetrics from "./performance-tracking-metrics";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const { isRecording, startRecording, stopRecording, error: recorderError } = useAudioRecorder();

  const { data, isLoading } = useQuery<GoalsSummary>({
    queryKey: ['goals', 'summary', mode],
    queryFn: () => fetch(`/api/goals/summary?mode=${mode}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }).then(r => r.json()),
  });

  // Load chat history
  const { data: chatHistory } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chats?context=goals`],
  });

  // Initialize chat messages from history
  useEffect(() => {
    if (chatHistory && chatHistory.length > 0 && chatMessages.length === 0) {
      setChatMessages(chatHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content || msg.message // Handle both field names
      })));
    }
  }, [chatHistory]);

  const updateMutation = useMutation({
    mutationFn: async (goals: { metric: string; value: number | null }[]) => {
      return apiRequest('POST', '/api/goals/update', { goals, mode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals', 'summary', mode] });
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
    onSuccess: async (data: any) => {
      const assistantMessage = { role: 'assistant' as const, content: data.response };
      setChatMessages(prev => [...prev, assistantMessage]);
      
      // Save assistant message to database
      await apiRequest('POST', '/api/chats/save', {
        role: 'assistant',
        message: data.response,
        context: 'goals'
      });
      
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

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    
    // Save user message to database
    await apiRequest('POST', '/api/chats/save', {
      role: 'user',
      message: userMessage,
      context: 'goals'
    });
    
    setIsChatting(true);
    analyzeMutation.mutate(userMessage);
    setChatInput('');
  };

  const handleMicToggle = async () => {
    if (isRecording) {
      // Stop recording and transcribe
      const audioBlob = await stopRecording();
      if (audioBlob) {
        await transcribeAudio(audioBlob);
      }
    } else {
      // Start recording
      const error = await startRecording();
      if (error) {
        toast({
          title: "Microphone Error",
          description: error,
          variant: "destructive",
        });
      }
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Transcription failed');
      }

      const data = await response.json();
      setChatInput(data.text);
      
      // Silent success - no toast notification
    } catch (error: any) {
      console.error('Transcription error:', error);
      toast({
        title: "Transcription failed",
        description: error.message || "Could not transcribe audio. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatValue = (value: number | null) => {
    if (value == null) return '';
    return value.toString();
  };

  const getGoalValue = (metric: string, defaultValue: number | null) => {
    return editedGoals.hasOwnProperty(metric) ? editedGoals[metric] : defaultValue;
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Performance Tracking Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const goals = data?.goals || [];
  const hasEdits = Object.keys(editedGoals).length > 0;

  return (
    <div className="space-y-6">
      {/* Performance Tracking Metrics - Primary Goals Table */}
      <PerformanceTrackingMetrics />
    </div>
  );
}
