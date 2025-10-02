import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Bot, Send, User, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';

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
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [pendingProposal, setPendingProposal] = useState<SettingsProposal | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

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
      const res = await apiRequest('POST', '/api/ai/chat', { message, context: {} });
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

      // Invalidate settings cache
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
    },
  });

  const handleSendMessage = () => {
    if (!inputMessage.trim() || chatMutation.isPending) return;

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

    // This is a simplified version - in production, parse the proposal properly
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

  return (
    <Card className="flex flex-col h-[600px]" data-testid="card-chat-panel">
      {/* Header */}
      <div className="p-4 border-b flex items-center gap-2">
        <Bot className="w-5 h-5" />
        <h3 className="font-semibold">AI Trading Assistant</h3>
        <Badge variant="outline" className="ml-auto">GPT-5</Badge>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef} data-testid="scroll-messages">
        {messages.length === 0 ? (
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
          placeholder="Ask about your trades, strategies, or request analysis..."
          className="resize-none"
          rows={3}
          disabled={chatMutation.isPending}
          data-testid="input-chat-message"
        />
        <Button
          onClick={handleSendMessage}
          disabled={!inputMessage.trim() || chatMutation.isPending}
          size="icon"
          className="h-auto"
          data-testid="button-send-message"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}
