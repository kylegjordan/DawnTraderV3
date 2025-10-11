import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Bot, Send, User, Mic, MicOff, Loader2, MessageSquare } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { cn } from '@/lib/utils';
import ModeBanner from '@/components/mode-banner';

interface Message {
  role: 'user' | 'assistant';
  message: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  date: Date;
  messageCount: number;
}

export default function WalterPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('all');
  const [inputMessage, setInputMessage] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { isRecording, startRecording, stopRecording, audioBlob, error: recorderError } = useAudioRecorder();

  // Load chat history for Walter context
  const { data: chatHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['/api/chats', 'walter'],
    queryFn: () => apiRequest('GET', `/api/chats?context=walter`),
  });

  // Initialize messages from chat history and create sessions
  useEffect(() => {
    if (chatHistory && Array.isArray(chatHistory)) {
      const msgs = chatHistory.map((msg: any) => ({
        role: msg.role,
        message: msg.message,
        timestamp: new Date(msg.timestamp)
      }));
      setMessages(msgs);
      
      // Group messages into sessions by day
      const sessionMap = new Map<string, ChatSession>();
      msgs.forEach(msg => {
        const dateKey = msg.timestamp.toLocaleDateString();
        if (!sessionMap.has(dateKey)) {
          sessionMap.set(dateKey, {
            id: dateKey,
            title: msg.timestamp.toDateString(),
            date: msg.timestamp,
            messageCount: 0
          });
        }
        const session = sessionMap.get(dateKey)!;
        session.messageCount++;
      });
      
      const sessionsList = Array.from(sessionMap.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
      setSessions(sessionsList);
    }
  }, [chatHistory]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Handle voice transcription when audioBlob changes
  useEffect(() => {
    if (audioBlob && !isTranscribing) {
      handleTranscription(audioBlob);
    }
  }, [audioBlob]);

  const handleTranscription = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');

      const token = localStorage.getItem('token');
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Transcription failed');
      }

      const data = await response.json();
      setInputMessage(data.text);
    } catch (error) {
      console.error('Transcription error:', error);
      toast({
        title: "Transcription Failed",
        description: "Could not transcribe audio. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleVoiceToggle = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      const error = await startRecording();
      if (error) {
        toast({
          title: "Microphone Error",
          description: error,
          variant: "destructive"
        });
      }
    }
  };

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      // Save user message
      await apiRequest('POST', '/api/chats/save', {
        role: 'user',
        message,
        context: 'walter'
      });

      // Send to Walter API for processing
      const response = await apiRequest('POST', '/api/walter/interpret-command', {
        message,
        context: 'walter'
      });

      // Save assistant response
      await apiRequest('POST', '/api/chats/save', {
        role: 'assistant',
        message: response.response,
        context: 'walter'
      });

      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', 'walter'] });
      setInputMessage('');
    },
    onError: (error: any) => {
      toast({
        title: "Message Failed",
        description: error.message || "Could not send message. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleSend = () => {
    const trimmedMessage = inputMessage.trim();
    if (trimmedMessage && !sendMessageMutation.isPending) {
      sendMessageMutation.mutate(trimmedMessage);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-full overflow-hidden h-screen flex flex-col">
      <ModeBanner />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Walter AI Co-Pilot</h1>
          <p className="text-muted-foreground text-sm">
            Your AI SysAdmin for system configuration and optimization
          </p>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left Sidebar - Chat Sessions */}
        <div className="hidden lg:flex lg:w-64 flex-col gap-2">
          <Card className="flex-1 p-4 min-h-0">
            <h3 className="text-sm font-semibold mb-3">Chat History</h3>
            <ScrollArea className="h-full">
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedSession('all')}
                  className={cn(
                    "w-full flex items-center gap-2 p-2 rounded-md text-sm text-left transition-colors",
                    selectedSession === 'all' 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  )}
                  data-testid="session-all"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>All Messages ({messages.length})</span>
                </button>
                
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => setSelectedSession(session.id)}
                    className={cn(
                      "w-full flex flex-col gap-1 p-2 rounded-md text-sm text-left transition-colors",
                      selectedSession === session.id 
                        ? "bg-primary text-primary-foreground" 
                        : "hover:bg-muted"
                    )}
                    data-testid={`session-${session.id}`}
                  >
                    <span className="font-medium truncate">{session.title}</span>
                    <span className={cn(
                      "text-xs",
                      selectedSession === session.id ? "opacity-90" : "text-muted-foreground"
                    )}>
                      {session.messageCount} messages
                    </span>
                  </button>
                ))}

                {sessions.length === 0 && !isLoadingHistory && (
                  <p className="text-xs text-muted-foreground p-2">
                    No chat history yet. Start a conversation with Walter!
                  </p>
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>

        {/* Central Chat Area */}
        <Card className="flex-1 flex flex-col min-h-0">
          <ScrollArea ref={scrollAreaRef} className="flex-1 p-4 sm:p-6">
            <div className="space-y-6 max-w-4xl mx-auto">
              {(() => {
                // Filter messages based on selected session
                const filteredMessages = selectedSession === 'all' 
                  ? messages 
                  : messages.filter(msg => msg.timestamp.toLocaleDateString() === selectedSession);
                
                if (filteredMessages.length === 0 && !isLoadingHistory) {
                  return (
                    <div className="text-center py-12">
                      <Bot className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-semibold mb-2">
                        {messages.length === 0 ? 'Welcome to Walter' : 'No messages in this session'}
                      </h3>
                      <p className="text-muted-foreground">
                        {messages.length === 0 
                          ? "I'm your AI SysAdmin co-pilot. Ask me to configure trading parameters, start/stop trading, or check system status."
                          : "Select 'All Messages' to view the full conversation history."
                        }
                      </p>
                    </div>
                  );
                }

                return filteredMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex gap-4",
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                    data-testid={`message-${msg.role}-${idx}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <Bot className="w-5 h-5 text-primary-foreground" />
                      </div>
                    )}
                    
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg p-4",
                        msg.role === 'user'
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                      <p className="text-xs opacity-70 mt-2">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </p>
                    </div>

                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                ));
              })()}

              {isLoadingHistory && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {sendMessageMutation.isPending && (
                <div className="flex gap-4 justify-start">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div className="bg-muted rounded-lg p-4">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <Separator />

          {/* Input Area */}
          <div className="p-4">
            {recorderError && (
              <div className="mb-2 text-sm text-destructive">
                {recorderError}
              </div>
            )}
            
            <div className="flex gap-2">
              <Textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask Walter anything..."
                className="min-h-[60px] resize-none"
                disabled={sendMessageMutation.isPending || isTranscribing}
                data-testid="input-message"
              />
              
              <div className="flex flex-col gap-2">
                <Button
                  size="icon"
                  variant={isRecording ? "destructive" : "outline"}
                  onClick={handleVoiceToggle}
                  disabled={sendMessageMutation.isPending || isTranscribing}
                  data-testid="button-voice"
                >
                  {isTranscribing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </Button>

                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!inputMessage.trim() || sendMessageMutation.isPending || isTranscribing}
                  data-testid="button-send"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
