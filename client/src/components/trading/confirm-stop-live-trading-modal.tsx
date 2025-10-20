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
import { AlertTriangle } from "lucide-react";

interface ConfirmStopLiveTradingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmStopLiveTradingModal({ 
  open, 
  onOpenChange, 
  onConfirm 
}: ConfirmStopLiveTradingModalProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="dialog-confirm-stop-live-trading">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/20">
              <AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-500" />
            </div>
            <AlertDialogTitle className="text-xl">
              Confirm Stop Live Trading
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base pt-4 space-y-2">
            <p className="font-semibold text-foreground">
              ⚠️ You are about to stop Live Trading.
            </p>
            <p>
              All active orders will be <strong>canceled</strong> and trading will be <strong>halted immediately</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              Any open positions will remain open. You may want to manually close them before stopping.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-stop-live-trading">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
            data-testid="button-confirm-stop-live-trading"
          >
            Confirm & Stop Live Trading
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
