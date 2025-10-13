import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAI } from "@/hooks/use-trading";
import { MessageCircle, X, Send, Mic, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hello! I'm your AI trading assistant. I can help you with strategy questions, trade analysis, settings adjustments, or explain any trading concepts. How can I assist you?",
      timestamp: new Date()
    }
  ]);
  
  const { chat, isChatting, chatResponse } = useAI();

  const handleSendMessage = async () => {
    if (!message.trim() || isChatting) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setMessage('');

    try {
      await chat({ message, context: { messages: messages.slice(-5) } });
      
      if (chatResponse?.response) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: chatResponse.response,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: "I'm experiencing some difficulties right now. Please try again later.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50" data-testid="ai-assistant">
      {/* Floating Button */}
      <Button
        size="lg"
        className={cn(
          "w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-110 glow",
          !isOpen && "bg-primary text-primary-foreground"
        )}
        onClick={() => setIsOpen(!isOpen)}
        data-testid="button-ai-assistant"
      >
        <MessageCircle className="w-7 h-7" />
      </Button>

      {/* Chat Panel */}
      {isOpen && (
        <Card className="absolute bottom-16 right-0 w-80 shadow-2xl border-border">
          <CardHeader className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                <h3 className="font-semibold text-foreground">AI Assistant</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-muted"
                data-testid="button-close-ai-assistant"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="p-0">
            {/* Messages */}
            <ScrollArea className="h-64 p-4 space-y-3">
              {messages.map((msg, index) => (
                <div 
                  key={index}
                  className={cn(
                    "flex gap-2",
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                  data-testid={`chat-message-${msg.role}-${index}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <Lightbulb className="w-5 h-5 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[70%] rounded-lg p-3 text-sm",
                      msg.role === 'user'
                        ? "bg-primary text-primary-foreground ml-auto"
                        : "bg-primary/5 text-foreground"
                    )}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <span className="text-xs opacity-70 mt-1 block">
                      {msg.timestamp.toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-xs font-bold">U</span>
                    </div>
                  )}
                </div>
              ))}
              
              {isChatting && (
                <div className="flex gap-2">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Lightbulb className="w-5 h-5 text-primary" />
                  </div>
                  <div className="bg-primary/5 rounded-lg p-3 text-sm">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </div>
                </div>
              )}
            </ScrollArea>
            
            {/* Input */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Ask me anything..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isChatting}
                  className="flex-1 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
                  data-testid="input-ai-message"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-2 hover:bg-primary hover:text-primary-foreground"
                  title="Voice input"
                  data-testid="button-voice-input"
                >
                  <Mic className="w-5 h-5" />
                </Button>
                <Button
                  size="sm"
                  onClick={handleSendMessage}
                  disabled={!message.trim() || isChatting}
                  className="p-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  data-testid="button-send-message"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
