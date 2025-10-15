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
  Plus, Archive, Search, Filter, Check, X, AlertCircle, Paperclip, Upload, FileText, Pencil, Trash2 
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { cn } from '@/lib/utils';
import { ModeIndicator } from '@/components/goals/mode-indicator';
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast} = useToast();
  const { isRecording, startRecording, stopRecording, audioBlob, error: recorderError } = useAudioRecorder();

  // Phase 8.4: Dynamic textarea resizing (ChatGPT-style)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = '120px'; // Reset to min height
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 200; // Max 200px
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [inputMessage]);

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
        archivedAt: new Date().toISOString()
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

  // Phase 8.4: Delete chat
  const deleteChatMutation = useMutation({
    mutationFn: async (chatId: string) => {
      await apiRequest('DELETE', `/api/walter/chats/${chatId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/walter/chats'] });
      setSelectedChatId(null);
      toast({
        title: "Chat Deleted",
        description: "Chat session permanently deleted"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Could not delete chat",
        variant: "destructive"
      });
    }
  });

  // Rename chat (Phase 6.3)
  const renameChatMutation = useMutation({
    mutationFn: async ({ chatId, newTitle }: { chatId: string; newTitle: string }) => {
      await apiRequest('PATCH', `/api/walter/chats/${chatId}`, {
        title: newTitle
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/walter/chats'] });
      setRenamingChatId(null);
      setRenameValue('');
      toast({
        title: "Chat Renamed",
        description: "Chat session renamed successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Rename Failed",
        description: error.message || "Could not rename chat",
        variant: "destructive"
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'text/csv',
      'text/plain',
      'application/json'
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload PDF, Word, Image, CSV, or Text files only.",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Maximum file size is 10MB.",
        variant: "destructive"
      });
      return;
    }

    processFile(file);
  };

  // Upload file to server
  const uploadFile = async (file: File) => {
    setIsUploadingFile(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedChatId) {
        formData.append('chatSessionId', selectedChatId);
      }

      const response = await fetch('/api/walter/analyze-file', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      
      setInputMessage(data.summary || `Uploaded: ${file.name}`);
      clearFilePreview();
      toast({
        title: "File Analyzed",
        description: data.summary ? "File content analyzed successfully" : "File uploaded successfully"
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Could not analyze file. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSend = async () => {
    // If file is selected, upload it first
    if (selectedFile) {
      await uploadFile(selectedFile);
      return;
    }

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

  // Handle drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  // Handle clipboard paste
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) {
        processFile(file);
      }
    }
  };

  // Process file for preview and upload
  const processFile = (file: File) => {
    setSelectedFile(file);
    
    // Generate preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  // Clear file preview
  const clearFilePreview = () => {
    setSelectedFile(null);
    setFilePreview(null);
  };

  // Get approval data for current chat (from chat detail response, not pending approvals list)
  const currentApproval = chatData?.approval || null;

  const pendingApprovalsCount = approvalsData?.filter(a => a.status === 'pending').length || 0;

  return (
    <div className="p-2 sm:p-3 lg:p-4 max-w-full overflow-hidden h-screen flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Walter</h1>
          <ModeIndicator />
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
                    <div
                      key={chat.id}
                      className={cn(
                        "w-full flex flex-col gap-1 p-3 rounded-md text-sm transition-colors group relative",
                        selectedChatId === chat.id 
                          ? "bg-primary text-primary-foreground" 
                          : "hover:bg-muted"
                      )}
                      data-testid={`chat-${chat.id}`}
                    >
                      {renamingChatId === chat.id ? (
                        // Rename mode
                        <div className="flex items-center gap-2">
                          <Input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                renameChatMutation.mutate({ chatId: chat.id, newTitle: renameValue });
                              } else if (e.key === 'Escape') {
                                setRenamingChatId(null);
                                setRenameValue('');
                              }
                            }}
                            className="flex-1 h-7 text-sm"
                            autoFocus
                            data-testid={`input-rename-chat-${chat.id}`}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => renameChatMutation.mutate({ chatId: chat.id, newTitle: renameValue })}
                            disabled={!renameValue.trim() || renameChatMutation.isPending}
                            data-testid={`button-confirm-rename-${chat.id}`}
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setRenamingChatId(null);
                              setRenameValue('');
                            }}
                            data-testid={`button-cancel-rename-${chat.id}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        // Normal mode
                        <>
                          <button
                            onClick={() => setSelectedChatId(chat.id)}
                            className="flex items-center gap-2 text-left w-full"
                          >
                            {chat.isApprovalThread ? (
                              <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            ) : (
                              <MessageSquare className="w-4 h-4 flex-shrink-0" />
                            )}
                            <span className="font-medium truncate flex-1">{chat.title}</span>
                            {chat.status === 'archived' && (
                              <Archive className="w-3 h-3 flex-shrink-0" />
                            )}
                          </button>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-xs flex-1",
                              selectedChatId === chat.id ? "opacity-90" : "text-muted-foreground"
                            )}>
                              {chat.messageCount} message{chat.messageCount !== 1 ? 's' : ''} • {new Date(chat.lastMessageAt).toLocaleDateString()}
                            </span>
                            {!chat.isApprovalThread && chat.status === 'active' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className={cn(
                                    "h-5 w-5 p-0",
                                    selectedChatId === chat.id ? "text-primary-foreground hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenamingChatId(chat.id);
                                    setRenameValue(chat.title);
                                  }}
                                  title="Rename chat"
                                  data-testid={`button-edit-chat-${chat.id}`}
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className={cn(
                                    "h-5 w-5 p-0",
                                    selectedChatId === chat.id ? "text-primary-foreground hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    archiveChatMutation.mutate(chat.id);
                                  }}
                                  title="Archive chat"
                                  data-testid={`button-archive-chat-${chat.id}`}
                                >
                                  <Archive className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className={cn(
                                    "h-5 w-5 p-0",
                                    selectedChatId === chat.id ? "text-primary-foreground hover:text-primary-foreground" : "text-destructive/80 hover:text-destructive"
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(`Delete chat "${chat.title}"? This action cannot be undone.`)) {
                                      deleteChatMutation.mutate(chat.id);
                                    }
                                  }}
                                  title="Delete chat"
                                  data-testid={`button-delete-chat-${chat.id}`}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
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
            <div className="p-2 border-b flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium">{chatData.chat.title}</h2>
                {chatData.chat.isApprovalThread && currentApproval && (
                  <p className="text-xs text-muted-foreground">
                    {currentApproval.strategyName} • {currentApproval.mode} mode • {currentApproval.projectedRisk}% risk
                  </p>
                )}
              </div>
              {chatData.chat.status === 'active' && !chatData.chat.isApprovalThread && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => archiveChatMutation.mutate(selectedChatId)}
                  disabled={archiveChatMutation.isPending}
                  title="Archive chat"
                  data-testid="button-archive-chat"
                >
                  <Archive className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          )}

          {/* Messages Area */}
          <ScrollArea ref={scrollAreaRef} className="flex-1 p-2 sm:p-3">
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
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.csv,.txt,.json"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-file-upload"
              />
              
              <div 
                ref={inputAreaRef}
                className={cn(
                  "flex gap-2 relative",
                  isDragging && "ring-2 ring-primary ring-offset-2 rounded-lg"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {isDragging && (
                  <div className="absolute inset-0 bg-primary/10 rounded-lg flex items-center justify-center z-10 pointer-events-none">
                    <p className="text-sm font-medium">Drop file to upload</p>
                  </div>
                )}

                <div className="flex-1">
                  {filePreview && selectedFile && (
                    <div className="mb-2 p-2 border rounded-lg bg-muted/50 flex items-center gap-2">
                      <img 
                        src={filePreview} 
                        alt={selectedFile.name} 
                        className="w-16 h-16 object-cover rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={clearFilePreview}
                        className="h-8 w-8"
                        data-testid="button-clear-file"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  
                  {selectedFile && !filePreview && (
                    <div className="mb-2 p-2 border rounded-lg bg-muted/50 flex items-center gap-2">
                      <FileText className="w-8 h-8 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={clearFilePreview}
                        className="h-8 w-8"
                        data-testid="button-clear-file"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <div className="relative">
                    <Textarea
                      ref={textareaRef}
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      onPaste={handlePaste}
                      placeholder="Ask Walter anything... (drag & drop files or paste images)"
                      className="resize-none pr-12 overflow-y-auto"
                      style={{ minHeight: '120px', maxHeight: '200px' }}
                      disabled={sendMessageMutation.isPending || isTranscribing || isUploadingFile}
                      data-testid="input-message"
                    />
                    {isRecording && (
                      <div className="absolute right-3 top-3 flex items-center gap-2">
                        <div className="relative">
                          <Mic className="w-5 h-5 text-destructive relative z-10" />
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="w-8 h-8 bg-destructive/30 rounded-full animate-ping" />
                          </span>
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="w-6 h-6 bg-destructive/50 rounded-full animate-pulse" />
                          </span>
                        </div>
                        <span className="text-xs text-destructive font-medium">Recording...</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sendMessageMutation.isPending || isTranscribing || isUploadingFile}
                    data-testid="button-upload-file"
                    title="Upload file for analysis"
                  >
                    {isUploadingFile ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Paperclip className="w-5 h-5" />
                    )}
                  </Button>
                  
                  <Button
                    size="icon"
                    variant={isRecording ? "destructive" : "outline"}
                    onClick={handleVoiceToggle}
                    disabled={sendMessageMutation.isPending || isTranscribing || isUploadingFile}
                    data-testid="button-voice"
                    className="relative"
                  >
                    {isTranscribing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : isRecording ? (
                      <>
                        <MicOff className="w-5 h-5 relative z-10" />
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="w-8 h-8 bg-destructive/30 rounded-full animate-ping" />
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="w-6 h-6 bg-destructive/50 rounded-full animate-pulse" />
                        </span>
                      </>
                    ) : (
                      <Mic className="w-5 h-5" />
                    )}
                  </Button>

                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!inputMessage.trim() || sendMessageMutation.isPending || isTranscribing || isUploadingFile}
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
