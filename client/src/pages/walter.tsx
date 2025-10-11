import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Bot, Send, User, Mic, MicOff, Loader2, MessageSquare, 
  Plus, Archive, Search, Filter, Check, X, AlertCircle 
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { cn } from '@/lib/utils';
import ModeBanner from '@/components/mode-banner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WalterChatLog {
  id: string;
  chatSessionId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: any;
  timestamp: Date;
}

interface WalterChat {
  id: string;
  userId: string;
  title: string;
  status: 'active' | 'archived';
  isApprovalThread: boolean;
  approvalId?: string;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  archivedAt?: Date;
}

interface WalterApproval {
  id: string;
  userId: string;
  mode: 'live' | 'paper';
  strategyName?: string;
  parameterName: string;
  currentValue: any;
  proposedValue: any;
  projectedRisk: string;
  riskDetails?: any;
  status: 'pending' | 'approved' | 'rejected';
  chatSessionId?: string;
  approvedAt?: Date;
  rejectedAt?: Date;
  approvedBy?: string;
  createdAt: Date;
}

export default function WalterPage() {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'archived' | 'approvals'>('all');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { isRecording, startRecording, stopRecording, audioBlob, error: recorderError } = useAudioRecorder();

  // Fetch all Walter chats
  const { data: chatsData, isLoading: isLoadingChats } = useQuery({
    queryKey: ['/api/walter/chats', filterStatus, searchQuery],
    queryFn: async () => {
      // For 'approvals' and 'all' filters, don't pass status (get all chats)
      // For 'active' and 'archived', pass the status
      const statusParam = filterStatus === 'all' || filterStatus === 'approvals' ? undefined : filterStatus;
      const params = new URLSearchParams();
      if (statusParam) params.set('status', statusParam);
      if (searchQuery) params.set('search', searchQuery);
      
      const response = await apiRequest('GET', `/api/walter/chats${params.toString() ? '?' + params.toString() : ''}`);
      return response.chats as WalterChat[];
    },
  });

  // Fetch pending approvals
  const { data: approvalsData } = useQuery({
    queryKey: ['/api/walter/pending-approvals'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/walter/pending-approvals');
      return response.approvals as WalterApproval[];
    },
  });

  // Fetch messages for selected chat
  const { data: chatData, isLoading: isLoadingMessages } = useQuery({
    queryKey: ['/api/walter/chats', selectedChatId],
    queryFn: async () => {
      if (!selectedChatId) return null;
      const response = await apiRequest('GET', `/api/walter/chats/${selectedChatId}`);
      return {
        chat: response.chat as WalterChat,
        messages: response.messages as WalterChatLog[],
        approval: response.approval as WalterApproval | null
      };
    },
    enabled: !!selectedChatId,
  });

  // Filter chats based on status (search is now handled by backend)
  const filteredChats = (chatsData || []).filter(chat => {
    // Filter by status
    if (filterStatus === 'approvals' && !chat.isApprovalThread) return false;
    if (filterStatus === 'active' && chat.status !== 'active') return false;
    if (filterStatus === 'archived' && chat.status !== 'archived') return false;
    
    return true;
  });

  // Auto-select first chat if none selected
  useEffect(() => {
    if (!selectedChatId && filteredChats.length > 0) {
      setSelectedChatId(filteredChats[0].id);
    }
  }, [filteredChats, selectedChatId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [chatData?.messages]);

  // Handle voice transcription
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

  // Create new chat
  const createChatMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/walter/chats', {
        title: `New Chat ${new Date().toLocaleString()}`
      });
      return response.chat;
    },
    onSuccess: (newChat) => {
      queryClient.invalidateQueries({ queryKey: ['/api/walter/chats'] });
      setSelectedChatId(newChat.id);
      toast({
        title: "Chat Created",
        description: "New chat session started successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Could not create chat session",
        variant: "destructive"
      });
    }
  });

  // Archive chat
  const archiveChatMutation = useMutation({
    mutationFn: async (chatId: string) => {
      await apiRequest('PATCH', `/api/walter/chats/${chatId}`, {
        status: 'archived',
        archivedAt: new Date()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/walter/chats'] });
      setSelectedChatId(null);
      toast({
        title: "Chat Archived",
        description: "Chat session archived successfully"
      });
    }
  });

  // Send message
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!selectedChatId) throw new Error('No chat selected');
      const response = await apiRequest('POST', `/api/walter/chats/${selectedChatId}/messages`, {
        content: message
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/walter/chats', selectedChatId] });
      queryClient.invalidateQueries({ queryKey: ['/api/walter/chats'] });
      setInputMessage('');
    },
    onError: (error: any) => {
      toast({
        title: "Message Failed",
        description: error.message || "Could not send message",
        variant: "destructive"
      });
    }
  });

  // Approve approval
  const approveMutation = useMutation({
    mutationFn: async (approvalId: string) => {
      await apiRequest('POST', `/api/walter/approvals/${approvalId}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/walter/pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/walter/chats', selectedChatId] });
      toast({
        title: "Approval Accepted",
        description: "Changes have been applied successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Approval Failed",
        description: error.message || "Could not approve changes",
        variant: "destructive"
      });
    }
  });

  // Reject approval
  const rejectMutation = useMutation({
    mutationFn: async (approvalId: string) => {
      await apiRequest('POST', `/api/walter/approvals/${approvalId}/reject`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/walter/pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/walter/chats', selectedChatId] });
      toast({
        title: "Approval Rejected",
        description: "Changes have been rejected"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Rejection Failed",
        description: error.message || "Could not reject changes",
        variant: "destructive"
      });
    }
  });

  const handleSend = () => {
    const trimmedMessage = inputMessage.trim();
    if (trimmedMessage && !sendMessageMutation.isPending && selectedChatId) {
      sendMessageMutation.mutate(trimmedMessage);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Get approval data for current chat (from chat detail response, not pending approvals list)
  const currentApproval = chatData?.approval || null;

  const pendingApprovalsCount = approvalsData?.filter(a => a.status === 'pending').length || 0;

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
        {pendingApprovalsCount > 0 && (
          <Badge variant="destructive" className="text-lg px-4 py-2" data-testid="badge-pending-approvals">
            {pendingApprovalsCount} Pending Approval{pendingApprovalsCount !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left Sidebar - Chat Sessions */}
        <div className="hidden lg:flex lg:w-80 flex-col gap-2">
          <Card className="flex-1 p-4 min-h-0 flex flex-col">
            {/* Search and Filters */}
            <div className="space-y-2 mb-3">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                  data-testid="input-search-chats"
                />
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-start" data-testid="button-filter">
                    <Filter className="w-4 h-4 mr-2" />
                    {filterStatus === 'all' && 'All Chats'}
                    {filterStatus === 'active' && 'Active'}
                    {filterStatus === 'archived' && 'Archived'}
                    {filterStatus === 'approvals' && 'Approvals'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuItem onClick={() => setFilterStatus('all')} data-testid="filter-all">
                    All Chats
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus('active')} data-testid="filter-active">
                    Active
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus('archived')} data-testid="filter-archived">
                    Archived
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus('approvals')} data-testid="filter-approvals">
                    Approvals Only
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                onClick={() => createChatMutation.mutate()}
                className="w-full"
                disabled={createChatMutation.isPending}
                data-testid="button-new-chat"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Chat
              </Button>
            </div>

            <Separator className="my-2" />

            {/* Chat List */}
            <ScrollArea className="flex-1">
              <div className="space-y-1">
                {isLoadingChats ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredChats.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2 text-center">
                    {searchQuery ? 'No chats found' : 'No chat sessions yet'}
                  </p>
                ) : (
                  filteredChats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => setSelectedChatId(chat.id)}
                      className={cn(
                        "w-full flex flex-col gap-1 p-3 rounded-md text-sm text-left transition-colors",
                        selectedChatId === chat.id 
                          ? "bg-primary text-primary-foreground" 
                          : "hover:bg-muted"
                      )}
                      data-testid={`chat-${chat.id}`}
                    >
                      <div className="flex items-center gap-2">
                        {chat.isApprovalThread ? (
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        ) : (
                          <MessageSquare className="w-4 h-4 flex-shrink-0" />
                        )}
                        <span className="font-medium truncate flex-1">{chat.title}</span>
                        {chat.status === 'archived' && (
                          <Archive className="w-3 h-3 flex-shrink-0" />
                        )}
                      </div>
                      <span className={cn(
                        "text-xs",
                        selectedChatId === chat.id ? "opacity-90" : "text-muted-foreground"
                      )}>
                        {chat.messageCount} message{chat.messageCount !== 1 ? 's' : ''} • {new Date(chat.lastMessageAt).toLocaleDateString()}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>

        {/* Central Chat Area */}
        <Card className="flex-1 flex flex-col min-h-0">
          {/* Chat Header */}
          {selectedChatId && chatData?.chat && (
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{chatData.chat.title}</h2>
                {chatData.chat.isApprovalThread && currentApproval && (
                  <p className="text-xs text-muted-foreground">
                    {currentApproval.strategyName} • {currentApproval.mode} mode • {currentApproval.projectedRisk}% risk
                  </p>
                )}
              </div>
              {chatData.chat.status === 'active' && !chatData.chat.isApprovalThread && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => archiveChatMutation.mutate(selectedChatId)}
                  disabled={archiveChatMutation.isPending}
                  data-testid="button-archive-chat"
                >
                  <Archive className="w-4 h-4 mr-2" />
                  Archive
                </Button>
              )}
            </div>
          )}

          {/* Messages Area */}
          <ScrollArea ref={scrollAreaRef} className="flex-1 p-4 sm:p-6">
            <div className="space-y-6 max-w-4xl mx-auto">
              {!selectedChatId ? (
                <div className="text-center py-12">
                  <Bot className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Welcome to Walter</h3>
                  <p className="text-muted-foreground">
                    Select a chat or create a new one to get started
                  </p>
                </div>
              ) : isLoadingMessages ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Approval Alert (if applicable) */}
                  {currentApproval && currentApproval.status === 'pending' && (
                    <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950" data-testid="alert-approval-pending">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="space-y-3">
                        <div>
                          <p className="font-semibold text-amber-900 dark:text-amber-100">
                            Approval Required: {currentApproval.strategyName}
                          </p>
                          <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                            Projected portfolio risk: {currentApproval.projectedRisk}% (threshold: 20%)
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => approveMutation.mutate(currentApproval.id)}
                            disabled={approveMutation.isPending || rejectMutation.isPending}
                            data-testid="button-approve"
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => rejectMutation.mutate(currentApproval.id)}
                            disabled={approveMutation.isPending || rejectMutation.isPending}
                            data-testid="button-reject"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {currentApproval && currentApproval.status === 'approved' && (
                    <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                      <Check className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-900 dark:text-green-100">
                        Approved on {new Date(currentApproval.approvedAt!).toLocaleString()}
                      </AlertDescription>
                    </Alert>
                  )}

                  {currentApproval && currentApproval.status === 'rejected' && (
                    <Alert className="border-red-500 bg-red-50 dark:bg-red-950">
                      <X className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-900 dark:text-red-100">
                        Rejected on {new Date(currentApproval.rejectedAt!).toLocaleString()}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Messages */}
                  {chatData?.messages.map((msg, idx) => (
                    <div
                      key={msg.id}
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
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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
                  ))}

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
                </>
              )}
            </div>
          </ScrollArea>

          <Separator />

          {/* Input Area */}
          {selectedChatId && chatData?.chat.status === 'active' && (
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
          )}
        </Card>
      </div>
    </div>
  );
}
