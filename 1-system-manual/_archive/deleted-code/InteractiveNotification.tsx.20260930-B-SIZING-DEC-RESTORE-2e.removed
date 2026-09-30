import { useState, Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, SkipForward, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Error Boundary for safer rendering
class NotificationErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('InteractiveNotification render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-2 text-xs text-muted-foreground">
          Error loading notification
        </div>
      );
    }
    return this.props.children;
  }
}

interface InteractiveNotificationProps {
  approval: {
    id: string;
    traceId?: string;
    action?: string;
    mode?: string;  // Made optional
    status: string;
    risk_pct?: number;  // Phase 27.2 field
    parameterName?: string;
    approvedAt?: string;
    rejectedAt?: string;
    dismissedAt?: string;
  };
  onClose?: () => void;
}

export function InteractiveNotification({
  approval,
  onClose,
}: InteractiveNotificationProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  // Safety check - if approval is null/undefined, don't render
  if (!approval) {
    return null;
  }

  const displayName = approval.action || approval.parameterName || 'Unknown Action';
  const traceId = approval.traceId || approval.id || 'unknown';
  const risk = Number(approval.risk_pct ?? 0);
  const mode = approval.mode || 'unknown';

  const handleApprove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      setIsProcessing(true);
      const response = await apiRequest("POST", "/api/intent/approve", { traceId });

      if (response.success) {
        toast({
          title: "✅ Approved",
          description: response.message || `${displayName} executed successfully`,
        });
        // Invalidate queries to refresh the notifications
        await queryClient.invalidateQueries({ queryKey: ['/api/intent/pending'] });
        onClose?.();
      } else {
        throw new Error(response.error || "Approval failed");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve action",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      setIsProcessing(true);
      const response = await apiRequest("POST", "/api/intent/reject", { traceId });

      if (response.success) {
        toast({
          title: "❌ Rejected",
          description: response.message || "No changes made",
        });
        // Invalidate queries to refresh the notifications
        await queryClient.invalidateQueries({ queryKey: ['/api/intent/pending'] });
        onClose?.();
      } else {
        throw new Error(response.error || "Rejection failed");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reject action",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDismiss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      setIsProcessing(true);
      const response = await apiRequest("POST", "/api/intent/dismiss", { traceId });

      if (response.success) {
        toast({
          title: "⏭️ Dismissed",
          description: response.message || "You can act later",
        });
        // Invalidate queries to refresh the notifications
        await queryClient.invalidateQueries({ queryKey: ['/api/intent/pending'] });
        onClose?.();
      } else {
        throw new Error(response.error || "Dismiss failed");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to dismiss action",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      setIsProcessing(true);
      const response = await apiRequest("POST", "/api/intent/clear", { traceId });

      if (response.success) {
        toast({
          title: "🗑️ Cleared",
          description: "Notification removed",
        });
        // Invalidate queries to refresh the notifications
        await queryClient.invalidateQueries({ queryKey: ['/api/intent/pending'] });
        onClose?.();
      } else {
        throw new Error(response.error || "Clear failed");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to clear notification",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Pending approval - show action buttons
  if (approval.status === 'pending') {
    return (
      <div className="flex flex-col gap-2 w-full p-2 bg-yellow-50 dark:bg-yellow-950/20 rounded border border-yellow-200 dark:border-yellow-800">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="destructive" className="text-xs">
            PENDING
          </Badge>
          <Badge variant="outline" className="text-xs">
            {risk.toFixed(2)}% risk
          </Badge>
          <span className="text-xs text-muted-foreground">{mode.toUpperCase()}</span>
          <Badge 
            variant="secondary" 
            className="text-[10px] font-mono"
            title={`Trace ID: ${traceId}`}
          >
            {traceId.slice(-8)}
          </Badge>
        </div>
        
        {/* Action name */}
        <p className="text-sm font-medium">{displayName}</p>
        
        {/* Action buttons */}
        <div className="flex gap-1.5 mt-1">
          <Button
            onClick={handleApprove}
            disabled={isProcessing}
            size="sm"
            className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700"
            data-testid={`button-approve-${approval.id}`}
          >
            <Check className="w-3 h-3 mr-1" />
            Approve
          </Button>
          <Button
            onClick={handleReject}
            disabled={isProcessing}
            size="sm"
            variant="destructive"
            className="flex-1 h-7 text-xs"
            data-testid={`button-reject-${approval.id}`}
          >
            <X className="w-3 h-3 mr-1" />
            Reject
          </Button>
          <Button
            onClick={handleDismiss}
            disabled={isProcessing}
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2"
            data-testid={`button-dismiss-${approval.id}`}
          >
            <SkipForward className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  }

  // Resolved approval - show clear button
  const statusBadgeVariant = approval.status === 'approved' ? 'default' : 
                            approval.status === 'dismissed' ? 'secondary' : 
                            'destructive';
  const statusLabel = approval.status.toUpperCase();
  const timestamp = approval.approvedAt || approval.rejectedAt || approval.dismissedAt;

  return (
    <div className="flex flex-col gap-2 w-full p-2 bg-muted/50 rounded opacity-70">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={statusBadgeVariant} className="text-xs">
            {statusLabel}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {risk.toFixed(2)}% risk
          </Badge>
          <span className="text-xs text-muted-foreground">{mode.toUpperCase()}</span>
          <Badge 
            variant="secondary" 
            className="text-[10px] font-mono"
            title={`Trace ID: ${traceId}`}
          >
            {traceId.slice(-8)}
          </Badge>
        </div>
        <Button
          onClick={handleClear}
          disabled={isProcessing}
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          data-testid={`button-clear-${approval.id}`}
          title="Clear this notification"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      
      {/* Action name */}
      <p className="text-sm font-medium">{displayName}</p>
      
      {/* Timestamp */}
      {timestamp && (
        <p className="text-xs text-muted-foreground">
          {new Date(timestamp).toLocaleString()}
        </p>
      )}
    </div>
  );
}

// Export wrapped version with error boundary
export function SafeInteractiveNotification(props: InteractiveNotificationProps) {
  return (
    <NotificationErrorBoundary>
      <InteractiveNotification {...props} />
    </NotificationErrorBoundary>
  );
}
