import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  Edit2, 
  Check, 
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Conversation {
  id: string;
  title: string;
  lastUpdated: string;
  messages: any[];
}

interface ChatHistorySidebarProps {
  currentConversationId?: string;
  onSelectConversation: (id: string) => void;
  onCreateConversation: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ChatHistorySidebar({
  currentConversationId,
  onSelectConversation,
  onCreateConversation,
  isCollapsed = false,
  onToggleCollapse
}: ChatHistorySidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ['/api/conversations'],
    queryFn: async () => {
      return await apiRequest<Conversation[]>('GET', '/api/conversations');
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/conversations', { title: 'New Chat' });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      onSelectConversation(data.id);
      onCreateConversation();
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      return await apiRequest('PATCH', `/api/conversations/${id}`, { title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/conversations/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setDeleteDialogOpen(false);
      setConversationToDelete(null);
      // If deleted current conversation, select another one or create new
      if (currentConversationId === conversationToDelete && conversations.length > 1) {
        const otherConv = conversations.find(c => c.id !== conversationToDelete);
        if (otherConv) {
          onSelectConversation(otherConv.id);
        }
      }
    },
  });

  const handleStartEdit = (conversation: Conversation) => {
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const handleSaveEdit = () => {
    if (editingId && editTitle.trim()) {
      renameMutation.mutate({ id: editingId, title: editTitle.trim() });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  const handleDeleteClick = (id: string) => {
    setConversationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (conversationToDelete) {
      deleteMutation.mutate(conversationToDelete);
    }
  };

  if (isCollapsed) {
    return (
      <div className="w-12 border-r bg-background flex flex-col items-center py-4 gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          data-testid="button-expand-sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          aria-label="Create new chat"
          data-testid="button-new-chat-collapsed"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="w-[280px] md:w-[300px] border-r bg-background flex flex-col" data-testid="chat-history-sidebar">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-sm">Chat History</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            data-testid="button-collapse-sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>

      {/* New Chat Button */}
      <div className="p-2">
        <Button
          className="w-full"
          variant="outline"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          data-testid="button-new-chat"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1 px-2">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          <div className="space-y-1 py-2">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group rounded-md p-2 cursor-pointer transition-colors",
                  currentConversationId === conv.id
                    ? "bg-accent"
                    : "hover:bg-accent/50"
                )}
                onClick={() => editingId !== conv.id && onSelectConversation(conv.id)}
                data-testid={`conversation-item-${conv.id}`}
              >
                {editingId === conv.id ? (
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      className="h-7 text-sm"
                      autoFocus
                      data-testid="input-edit-title"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleSaveEdit}
                      aria-label="Save chat title"
                      data-testid="button-save-title"
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleCancelEdit}
                      aria-label="Cancel editing"
                      data-testid="button-cancel-title"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <MessageSquare className="w-4 h-4 flex-shrink-0 text-muted-foreground dark:text-muted-foreground" />
                          <span className="text-sm truncate">{conv.title}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="break-words">{conv.title}</p>
                      </TooltipContent>
                    </Tooltip>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(conv);
                            }}
                            aria-label={`Rename chat: ${conv.title}`}
                            data-testid={`button-edit-${conv.id}`}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p>Rename chat</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(conv.id);
                            }}
                            aria-label={`Delete chat: ${conv.title}`}
                            data-testid={`button-delete-${conv.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p>Delete chat</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the conversation
              and all its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
