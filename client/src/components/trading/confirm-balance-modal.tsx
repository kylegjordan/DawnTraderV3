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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";

interface ConfirmBalanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: number;
  onConfirm: (balance: number) => void;
  mode: 'paper' | 'live';
}

export function ConfirmBalanceModal({
  open,
  onOpenChange,
  currentBalance,
  onConfirm,
  mode
}: ConfirmBalanceModalProps) {
  const [balance, setBalance] = useState(currentBalance.toString());

  // Phase 27.F.14.D-POST: Sync input value when modal opens or balance prop changes
  useEffect(() => {
    if (open) {
      setBalance(currentBalance.toString());
    }
  }, [open, currentBalance]);

  const handleConfirm = () => {
    const parsedBalance = parseFloat(balance);
    if (!isNaN(parsedBalance) && parsedBalance > 0) {
      onConfirm(parsedBalance);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="modal-balance-confirmation">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Confirm Portfolio Balance
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <p>
              Please confirm your starting portfolio balance for {mode === 'paper' ? 'Paper Trading' : 'Live Trading'}. 
              This helps ensure accurate tracking and prevents data mismatches.
            </p>
            <div className="space-y-2">
              <Label htmlFor="balance">Starting Balance (USD)</Label>
              <Input
                id="balance"
                type="number"
                step="0.01"
                min="0"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                data-testid="input-balance"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Current balance: ${currentBalance.toFixed(2)}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleConfirm}
            data-testid="button-confirm-balance"
          >
            Confirm & Start
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
