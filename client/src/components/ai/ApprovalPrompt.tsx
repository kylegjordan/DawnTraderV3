import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, X, SkipForward, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ApprovalPromptProps {
  traceId: string;
  action: string;
  mode: string;
  risk_pct: number;
  expires_in_sec?: number;
  onDecision?: (status: "approved" | "rejected" | "dismissed") => void;
}

export function ApprovalPrompt({
  traceId,
  action,
  mode,
  risk_pct,
  expires_in_sec = 60,
  onDecision,
}: ApprovalPromptProps) {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "dismissed">("pending");
  const [timeLeft, setTimeLeft] = useState(expires_in_sec);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  // Countdown timer
  useEffect(() => {
    if (status !== "pending" || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, timeLeft]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status !== "pending" || isProcessing) return;

      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleApprove();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleDismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [status, isProcessing]);

  const handleApprove = async () => {
    try {
      setIsProcessing(true);
      const response = await apiRequest("POST", "/api/intent/approve", { traceId });

      if (response.success) {
        setStatus("approved");
        toast({
          title: "✅ Approved",
          description: response.message || `${action} executed successfully`,
        });
        onDecision?.("approved");
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

  const handleReject = async () => {
    try {
      setIsProcessing(true);
      const response = await apiRequest("POST", "/api/intent/reject", { traceId });

      if (response.success) {
        setStatus("rejected");
        toast({
          title: "❌ Rejected",
          description: response.message || "No changes made",
        });
        onDecision?.("rejected");
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

  const handleDismiss = async () => {
    try {
      setIsProcessing(true);
      const response = await apiRequest("POST", "/api/intent/dismiss", { traceId });

      if (response.success) {
        setStatus("dismissed");
        toast({
          title: "⏭️ Dismissed",
          description: response.message || "You can act later from the bell",
        });
        onDecision?.("dismissed");
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

  if (status === "approved") {
    return (
      <Card className="p-3 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
          <Check className="w-4 h-4" />
          <span className="text-sm font-medium">✅ Approved ({traceId.slice(-8)}) — {action} executed</span>
        </div>
      </Card>
    );
  }

  if (status === "rejected") {
    return (
      <Card className="p-3 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
          <X className="w-4 h-4" />
          <span className="text-sm font-medium">❌ Rejected ({traceId.slice(-8)}) — no changes made</span>
        </div>
      </Card>
    );
  }

  if (status === "dismissed") {
    return (
      <Card className="p-3 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <SkipForward className="w-4 h-4" />
          <span className="text-sm font-medium">⏭️ Dismissed — check the bell icon to act later</span>
        </div>
      </Card>
    );
  }

  const isExpired = timeLeft <= 0;

  return (
    <Card className="p-4 bg-yellow-50 dark:bg-yellow-950 border-yellow-300 dark:border-yellow-700">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h4 className="font-semibold text-sm">Manual Approval Required</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Action: <span className="font-mono">{action}</span> • Mode: {mode.toUpperCase()} • Risk: {risk_pct.toFixed(2)}%
            </p>
          </div>
          {!isExpired && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{timeLeft}s</span>
            </div>
          )}
        </div>

        {/* Safety Warning */}
        <div className="text-xs bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded border border-yellow-200 dark:border-yellow-800">
          You're approving <strong>{mode.toUpperCase()}</strong> action at <strong>{risk_pct.toFixed(2)}%</strong> risk
        </div>

        {/* Action Buttons */}
        {!isExpired ? (
          <div className="flex gap-2">
            <Button
              onClick={handleApprove}
              disabled={isProcessing}
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700"
              data-testid="button-approve"
            >
              <Check className="w-4 h-4 mr-1" />
              Approve
            </Button>
            <Button
              onClick={handleReject}
              disabled={isProcessing}
              size="sm"
              variant="destructive"
              className="flex-1"
              data-testid="button-reject"
            >
              <X className="w-4 h-4 mr-1" />
              Reject
            </Button>
            <Button
              onClick={handleDismiss}
              disabled={isProcessing}
              size="sm"
              variant="outline"
              data-testid="button-dismiss"
            >
              <SkipForward className="w-4 h-4 mr-1" />
              Dismiss
            </Button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-2">This approval request has expired</p>
            <Button onClick={() => setTimeLeft(expires_in_sec)} size="sm" variant="outline">
              Re-open
            </Button>
          </div>
        )}

        {/* Keyboard Hints */}
        <p className="text-xs text-muted-foreground text-center">
          Keyboard: <kbd className="px-1 py-0.5 bg-muted rounded">Enter</kbd> = Approve • <kbd className="px-1 py-0.5 bg-muted rounded">Esc</kbd> = Dismiss
        </p>
      </div>
    </Card>
  );
}
