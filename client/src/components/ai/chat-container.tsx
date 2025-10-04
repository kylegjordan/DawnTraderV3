import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Bot, Send, User, CheckCircle, Settings, DollarSign } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { ChatHistorySidebar } from './chat-history-sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface SettingsProposal {
  settingName: string;
  currentValue: any;
  proposedValue: any;
  reason: string;
  requiresConfirmation: boolean;
}

interface ChatResponse {
  response: string;
  updatedContext: any;
  settingsProposal?: SettingsProposal;
  auditLogId?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
}

export function ChatContainer() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const conversationIdFromUrl = urlParams.get('conversation_id');
  
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(conversationIdFromUrl);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [pendingProposal, setPendingProposal] = useState<SettingsProposal | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [maxContextMessages, setMaxContextMessages] = useState(20);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  
  // Update conversation ID when URL changes
  useEffect(() => {
    if (conversationIdFromUrl && conversationIdFromUrl !== currentConversationId) {
      setCurrentConversationId(conversationIdFromUrl);
    }
  }, [conversationIdFromUrl]);

  // Load conversation when selected
  const { data: conversation, isLoading: isLoadingConversation } = useQuery({
    queryKey: ['/api/conversations', currentConversationId],
    queryFn: async () => {
      if (!currentConversationId) return null;
      const res = await fetch(`/api/conversations/${currentConversationId}`);
      return res.json();
    },
    enabled: !!currentConversationId
  });

  // Load cost summary
  const { data: costSummary } = useQuery({
    queryKey: ['/api/chat-costs'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Initialize messages from conversation
  useEffect(() => {
    if (conversation?.messages && Array.isArray(conversation.messages)) {
      setMessages(conversation.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp)
      })));
      setMaxContextMessages(conversation.maxContextMessages || 20);
      
      // Check for pending proposal
      if (conversation.context?.pendingProposal) {
        setPendingProposal(conversation.context.pendingProposal);
      }
    }
  }, [conversation]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!currentConversationId) {
        throw new Error('No conversation selected');
      }
      const res = await apiRequest('POST', `/api/conversations/${currentConversationId}/message`, {
        message,
        context: {}
      });
      return await res.json() as ChatResponse;
    },
    onSuccess: (data) => {
      // Add assistant response to messages
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.response,
          timestamp: new Date()
        }
      ]);

      // Check if there's a settings proposal
      if (data.settingsProposal) {
        setPendingProposal(data.settingsProposal);
      }

      // Invalidate cost summary to update
      queryClient.invalidateQueries({ queryKey: ['/api/chat-costs'] });
    },
  });

  const applySettingsMutation = useMutation({
    mutationFn: async ({ settingName, newValue, confirmation }: { 
      settingName: string; 
      newValue: any; 
      confirmation: boolean;
    }) => {
      const res = await apiRequest('POST', '/api/ai/settings/apply', { settingName, newValue, confirmation });
      return await res.json() as { success: boolean; message: string; auditLogId?: string };
    },
    onSuccess: (data) => {
      setPendingProposal(null);
      
      // Add confirmation message
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.message,
          timestamp: new Date()
        }
      ]);

      // Invalidate settings cache and conversation
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', currentConversationId] });
    },
  });

  const updateContextMutation = useMutation({
    mutationFn: async (maxMessages: number) => {
      if (!currentConversationId) return;
      const res = await apiRequest('PATCH', `/api/conversations/${currentConversationId}`, {
        maxContextMessages: maxMessages
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', currentConversationId] });
    },
  });

  const handleSendMessage = () => {
    if (!inputMessage.trim() || chatMutation.isPending || !currentConversationId) return;

    // Add user message to chat
    const userMessage: Message = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    // Send to API
    chatMutation.mutate(inputMessage);
    setInputMessage('');
  };

  const handleApplySettings = (confirmation: boolean) => {
    if (!pendingProposal) return;

    setMessages(prev => [
      ...prev,
      {
        role: 'user',
        content: confirmation ? 'Yes, apply the change' : 'No, cancel the change',
        timestamp: new Date()
      }
    ]);

    if (confirmation) {
      applySettingsMutation.mutate({
        settingName: pendingProposal.settingName,
        newValue: pendingProposal.proposedValue,
        confirmation: true
      });
    } else {
      setPendingProposal(null);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Settings change cancelled. Is there anything else I can help you with?',
          timestamp: new Date()
        }
      ]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCreateConversation = () => {
    setMessages([]);
    setPendingProposal(null);
  };

  const formatCost = (cost: number) => {
    if (cost < 0.01) return '<$0.01';
    return `$${cost.toFixed(4)}`;
  };

  return (
    <div className="flex h-[700px] border rounded-lg overflow-hidden" data-testid="chat-container">
      {/* Sidebar */}
      <ChatHistorySidebar
        currentConversationId={currentConversationId || undefined}
        onSelectConversation={setCurrentConversationId}
        onCreateConversation={handleCreateConversation}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-background">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            <h3 className="font-semibold">AI Trading Assistant</h3>
            <Badge variant="outline">GPT-4o</Badge>
          </div>
          <div className="flex items-center gap-2">
            {/* Cost Display */}
            {costSummary && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid="button-cost-info">
                    <DollarSign className="w-4 h-4 mr-1" />
                    {formatCost(costSummary.totalCost)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64" data-testid="popover-cost-details">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Total Usage</h4>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Cost:</span>
                        <span className="font-medium">{formatCost(costSummary.totalCost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Tokens:</span>
                        <span>{costSummary.totalTokens.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Requests:</span>
                        <span>{costSummary.requestCount}</span>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Settings Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-chat-settings">
                  <Settings className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Chat Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setMaxContextMessages(10);
                    updateContextMutation.mutate(10);
                  }}
                  data-testid="setting-context-10"
                >
                  Last 10 messages
                  {maxContextMessages === 10 && " ✓"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setMaxContextMessages(20);
                    updateContextMutation.mutate(20);
                  }}
                  data-testid="setting-context-20"
                >
                  Last 20 messages (recommended)
                  {maxContextMessages === 20 && " ✓"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setMaxContextMessages(50);
                    updateContextMutation.mutate(50);
                  }}
                  data-testid="setting-context-50"
                >
                  Last 50 messages
                  {maxContextMessages === 50 && " ✓"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef} data-testid="scroll-messages">
          {!currentConversationId ? (
            <div className="text-center text-muted-foreground py-8">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Select a conversation or create a new one to get started</p>
            </div>
          ) : isLoadingConversation ? (
            <div className="text-center text-muted-foreground py-8">
              <Bot className="w-12 h-12 mx-auto mb-3 animate-pulse opacity-50" />
              <p>Loading conversation...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Start a conversation with your AI trading assistant</p>
              <p className="text-sm mt-2">Ask about your trades, strategies, or get analysis</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  data-testid={`message-${message.role}-${index}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <p className="text-xs opacity-50 mt-1">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                  </div>

                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              
              {chatMutation.isPending && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 animate-pulse" />
                  </div>
                  <div className="bg-muted rounded-lg p-3">
                    <p className="text-sm">Thinking...</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Settings Proposal Alert */}
        {pendingProposal && (
          <div className="px-4 pb-2">
            <Alert data-testid="alert-settings-proposal">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-semibold mb-2">Settings Change Proposal</p>
                <p className="text-sm mb-3">
                  The AI suggests changing <strong>{pendingProposal.settingName}</strong> from{' '}
                  <code>{JSON.stringify(pendingProposal.currentValue)}</code> to{' '}
                  <code>{JSON.stringify(pendingProposal.proposedValue)}</code>
                </p>
                <p className="text-sm mb-3">{pendingProposal.reason}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleApplySettings(true)}
                    disabled={applySettingsMutation.isPending}
                    data-testid="button-confirm-settings"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Confirm & Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleApplySettings(false)}
                    disabled={applySettingsMutation.isPending}
                    data-testid="button-cancel-settings"
                  >
                    Cancel
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Input Area */}
        <Separator />
        <div className="p-4 flex gap-2">
          <Textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={currentConversationId ? "Ask about your trades, strategies, or request analysis..." : "Select or create a conversation first..."}
            className="resize-none"
            rows={3}
            disabled={chatMutation.isPending || !currentConversationId}
            data-testid="input-chat-message"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || chatMutation.isPending || !currentConversationId}
            size="icon"
            className="h-auto"
            data-testid="button-send-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
