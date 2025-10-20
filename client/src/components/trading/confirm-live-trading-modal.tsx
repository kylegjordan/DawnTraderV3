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

interface ConfirmLiveTradingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmLiveTradingModal({ 
  open, 
  onOpenChange, 
  onConfirm 
}: ConfirmLiveTradingModalProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="dialog-confirm-live-trading">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/20">
              <AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-500" />
            </div>
            <AlertDialogTitle className="text-xl">
              Confirm Live Trading Activation
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base pt-4 space-y-2">
            <p className="font-semibold text-foreground">
              ⚠️ You are about to activate Live Trading.
            </p>
            <p>
              This will place <strong>real market orders</strong> with <strong>actual funds</strong> on your Kraken account.
            </p>
            <p className="text-sm text-muted-foreground">
              Make sure you have reviewed your trading strategies, risk settings, and portfolio allocation before proceeding.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-live-trading">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
            data-testid="button-confirm-live-trading"
          >
            Confirm & Start Live Trading
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
