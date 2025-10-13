import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SystemAlert, ActionButton, getAlertStyle } from '@/lib/alert-utils';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ActionableAlertModalProps {
  alert: SystemAlert | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ActionableAlertModal({
  alert,
  isOpen,
  onClose,
}: ActionableAlertModalProps) {
  const [confirmationAction, setConfirmationAction] = useState<ActionButton | null>(null);
  const { toast } = useToast();

  const actionMutation = useMutation({
    mutationFn: async ({ alertId, action }: { alertId: string; action: string }) => {
      return await apiRequest('POST', `/api/alerts/${alertId}/action`, { action });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      toast({
        title: 'Action Completed',
        description: data.message || 'The action was successfully executed.',
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Action Failed',
        description: error.message || 'Failed to execute the action.',
        variant: 'destructive',
      });
    },
  });

  if (!alert) {
    return null;
  }

  const style = getAlertStyle(alert.severity);
  const actionButtons = alert.actionButtons || [];

  const handleActionClick = (button: ActionButton) => {
    if (button.requiresConfirmation) {
      setConfirmationAction(button);
    } else {
      actionMutation.mutate({
        alertId: alert.id,
        action: button.action,
      });
    }
  };

  const handleConfirmedAction = () => {
    if (confirmationAction) {
      actionMutation.mutate({
        alertId: alert.id,
        action: confirmationAction.action,
      });
      setConfirmationAction(null);
    }
  };

  return (
    <>
      {/* Main Alert Dialog */}
      <Dialog open={isOpen && !confirmationAction} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[500px]" data-testid="actionable-alert-modal">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {alert.severity === 'critical' ? (
                <AlertTriangle className="w-5 h-5 text-destructive" />
              ) : (
                <CheckCircle className="w-5 h-5 text-primary" />
              )}
              <DialogTitle className={style.text}>
                {alert.alertType.replace(/_/g, ' ').toUpperCase()}
              </DialogTitle>
              <Badge variant={style.badgeVariant}>{alert.severity}</Badge>
            </div>
            <DialogDescription className="text-foreground text-base mt-4">
              {alert.message}
            </DialogDescription>
          </DialogHeader>

          {/* Metadata Display */}
          {alert.metadata && Object.keys(alert.metadata).length > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-muted/50 dark:bg-muted/20">
              <p className="text-sm font-medium text-foreground mb-2">Details:</p>
              <div className="space-y-1">
                {Object.entries(alert.metadata).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {key.replace(/_/g, ' ')}:
                    </span>
                    <span className="text-foreground font-medium">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-6">
            {actionButtons.length === 0 ? (
              <Button onClick={onClose} data-testid="button-close">
                Close
              </Button>
            ) : (
              <>
                {actionButtons.map((button, index) => (
                  <Button
                    key={index}
                    variant={button.variant}
                    onClick={() => handleActionClick(button)}
                    disabled={actionMutation.isPending}
                    data-testid={`button-action-${button.action}`}
                  >
                    {button.label}
                  </Button>
                ))}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmationAction} onOpenChange={(open) => !open && setConfirmationAction(null)}>
        <AlertDialogContent data-testid="confirmation-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to execute "{confirmationAction?.label}"? This action may have significant effects on your trading system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-confirmation">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmedAction}
              data-testid="button-confirm-action"
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
