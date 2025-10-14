import { useState, useEffect, useRef } from 'react';
import { Bot, Send, X, Mic, MicOff, Loader2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { cn } from '@/lib/utils';
import { useTradingMode } from '@/contexts/trading-mode-context';

interface Message {
  role: 'user' | 'assistant';
  message: string;
  timestamp: Date;
  provenance?: {
    timestamp: string;
    mode: string;
    sources: string[];
  };
}

interface WalterFloatingAssistantProps {
  pageContext?: string;
}

export default function WalterFloatingAssistant({ pageContext = 'Dashboard' }: WalterFloatingAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [prefetchedModes, setPrefetchedModes] = useState<Set<string>>(new Set());
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { isRecording, startRecording, stopRecording, audioBlob, error: recorderError } = useAudioRecorder();
  const { mode } = useTradingMode();

  // Phase 7.1b Deliverable 2: Prefetch dashboard endpoints when chat opens
  // Fixed: Track prefetch per mode to handle mode switching
  useEffect(() => {
    if (isOpen && !prefetchedModes.has(mode)) {
      const prefetchEndpoints = async () => {
        try {
          console.log(`[Walter] Prefetching dashboard data for ${mode} mode...`);
          await Promise.all([
            queryClient.prefetchQuery({
              queryKey: ['goals', 'summary', mode],
              queryFn: () => apiRequest('GET', `/api/goals/summary?mode=${mode}`)
            }),
            queryClient.prefetchQuery({
              queryKey: ['trading', 'results', mode, 'today'],
              queryFn: () => apiRequest('GET', `/api/trading/results?mode=${mode}&period=today`)
            }),
            queryClient.prefetchQuery({
              queryKey: ['trading', 'activity', mode, 'today'],
              queryFn: () => apiRequest('GET', `/api/trading/activity?mode=${mode}&period=today`)
            }),
            queryClient.prefetchQuery({
              queryKey: ['trading', 'averages', mode, 'today'],
              queryFn: () => apiRequest('GET', `/api/trading/averages?mode=${mode}&period=today`)
            }),
            queryClient.prefetchQuery({
              queryKey: ['simulation', 'status'],
              queryFn: () => apiRequest('GET', '/api/simulation/status')
            }),
            queryClient.prefetchQuery({
              queryKey: ['system', 'health'],
              queryFn: () => apiRequest('GET', '/api/system/health')
            })
          ]);
          setPrefetchedModes(prev => new Set(prev).add(mode));
          console.log(`[Walter] ✅ Prefetch complete for ${mode} mode`);
        } catch (error) {
          console.error('[Walter] Prefetch failed:', error);
        }
      };
      
      prefetchEndpoints();
    }
  }, [isOpen, prefetchedModes, mode]);

  // Load chat history
  const { data: chatHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['/api/chats', 'walter'],
    queryFn: () => apiRequest('GET', `/api/chats?context=walter`),
    enabled: isOpen, // Only load when overlay is open
  });

  // Initialize messages from chat history
  useEffect(() => {
    if (chatHistory && Array.isArray(chatHistory)) {
      const msgs = chatHistory.map((msg: any) => ({
        role: msg.role,
        message: msg.message,
        timestamp: new Date(msg.timestamp)
      }));
      setMessages(msgs);
    }
  }, [chatHistory]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  // Handle audio transcription
  useEffect(() => {
    if (audioBlob) {
      handleTranscription(audioBlob);
    }
  }, [audioBlob]);

  const handleTranscription = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Transcription failed');
      }

      const data = await response.json();
      if (data.text) {
        setInputMessage(data.text);
      }
    } catch (error) {
      toast({
        title: 'Transcription failed',
        description: 'Could not transcribe audio. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      // Phase 7.1b Deliverable 3: Dynamic progress messages (fixed to show during actual request)
      // Stage 1: Initial gathering
      setProgressMessage('🔍 Gathering goals and results...');
      
      // Start the API request immediately
      const requestPromise = (async () => {
        const contextualMessage = `[Page: ${pageContext}] ${message}`;
        return await apiRequest('POST', '/api/walter/interpret-command', {
          message: contextualMessage
        });
      })();
      
      // Stage 2: Show progress while request is in flight
      const progressTimer1 = setTimeout(() => {
        setProgressMessage('📊 Checking system health...');
      }, 1000);
      
      // Stage 3: Final stage
      const progressTimer2 = setTimeout(() => {
        setProgressMessage('🤖 Almost there — finalizing your data view...');
      }, 2000);
      
      try {
        const response = await requestPromise;
        clearTimeout(progressTimer1);
        clearTimeout(progressTimer2);
        setProgressMessage('');
        return response;
      } catch (error) {
        clearTimeout(progressTimer1);
        clearTimeout(progressTimer2);
        setProgressMessage('');
        throw error;
      }
    },
    onSuccess: async (data, variables) => {
      // Phase 7.1b Deliverable 5: Create provenance metadata
      const provenance = {
        timestamp: new Date().toISOString(),
        mode: mode.toUpperCase(),
        sources: data.sources || ['api/goals/summary', 'api/system/health']
      };

      const showProvenance = import.meta.env.VITE_WALTER_PROVENANCE === 'true';

      // Save both user and assistant messages to chat history
      await apiRequest('POST', '/api/chats/save', {
        context: 'walter',
        role: 'user',
        message: variables // variables contains the original message
      });

      await apiRequest('POST', '/api/chats/save', {
        context: 'walter',
        role: 'assistant',
        message: data.response
      });

      // Phase 7.1c Deliverable 4: Response-Type Validation
      const responseText = typeof data.response === 'string' 
        ? data.response 
        : (() => {
            console.warn('[Walter] Non-string response detected:', data.response);
            toast({
              title: 'Response Format Issue',
              description: 'Walter sent a technical payload — retrying in text mode.',
              variant: 'destructive'
            });
            return 'I apologize, but I returned data in a technical format. Could you try asking that again?';
          })();

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          message: responseText,
          timestamp: new Date(),
          ...(showProvenance && { provenance })
        }
      ]);
      queryClient.invalidateQueries({ queryKey: ['/api/chats', 'walter'] });
    },
    onError: (error) => {
      setProgressMessage('');
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
    }
  });

  const handleSendMessage = () => {
    if (!inputMessage.trim() || sendMessageMutation.isPending) return;

    const userMessage = {
      role: 'user' as const,
      message: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    sendMessageMutation.mutate(inputMessage);
    setInputMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg hover:scale-110 transition-transform flex items-center justify-center"
        data-testid="button-walter-floating"
      >
        <Bot className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 h-[500px] max-w-[calc(100vw-3rem)]">
      <Card className="w-full h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b bg-primary text-primary-foreground rounded-t-lg">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            <span className="font-semibold text-sm">Walter - {pageContext}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-primary-foreground/20"
              onClick={() => setIsOpen(false)}
              data-testid="button-minimize-walter"
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-primary-foreground/20"
              onClick={() => setIsOpen(false)}
              data-testid="button-close-walter"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Chat Area */}
        <ScrollArea ref={scrollAreaRef} className="flex-1 p-3">
          <div className="space-y-3">
            {messages.length === 0 && !isLoadingHistory && (
              <div className="text-center py-8">
                <Bot className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  I'm Walter, your AI SysAdmin. How can I help you on the {pageContext} page?
                </p>
              </div>
            )}

            {isLoadingHistory && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {messages.slice(-10).map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex gap-2",
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
                data-testid={`message-${msg.role}-${idx}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg p-2 text-sm",
                    msg.role === 'user'
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.message}</p>
                  
                  {/* Phase 7.1b Deliverable 5: Provenance footer */}
                  {msg.provenance && (
                    <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span>Data as of {new Date(msg.provenance.timestamp).toLocaleTimeString()}</span>
                        <span>•</span>
                        <span>Mode: {msg.provenance.mode}</span>
                        <span>•</span>
                        <span>Sources: {msg.provenance.sources.join(', ')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sendMessageMutation.isPending && (
              <div className="flex gap-2 justify-start">
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="bg-muted rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {progressMessage && (
                      <span className="text-xs text-muted-foreground animate-pulse">
                        {progressMessage}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-3 border-t">
          {recorderError && (
            <div className="mb-2 text-xs text-destructive">
              Microphone error: {recorderError}
            </div>
          )}
          
          <div className="flex gap-2">
            <Textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask Walter anything..."
              className="min-h-[60px] max-h-[100px] resize-none text-sm"
              disabled={sendMessageMutation.isPending || isTranscribing}
              data-testid="input-walter-message"
            />
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || sendMessageMutation.isPending}
                size="icon"
                className="h-[28px] w-[28px]"
                data-testid="button-send-walter"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
              <Button
                onClick={toggleRecording}
                disabled={sendMessageMutation.isPending || isTranscribing}
                variant={isRecording ? 'destructive' : 'secondary'}
                size="icon"
                className="h-[28px] w-[28px]"
                data-testid="button-voice-walter"
              >
                {isTranscribing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="w-3.5 h-3.5" />
                ) : (
                  <Mic className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
