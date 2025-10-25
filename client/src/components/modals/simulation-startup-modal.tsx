import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlayCircle, RefreshCw } from 'lucide-react';

interface SimulationStartupModalProps {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
  onStartNew: (balance: number) => void;
  defaultBalance?: number;
}

export function SimulationStartupModal({
  open,
  onClose,
  onContinue,
  onStartNew,
  defaultBalance = 800
}: SimulationStartupModalProps) {
  const [showNewSimForm, setShowNewSimForm] = useState(false);
  const [newBalance, setNewBalance] = useState(defaultBalance.toString());

  const handleContinue = () => {
    onContinue();
    onClose();
  };

  const handleShowNewForm = () => {
    setShowNewSimForm(true);
  };

  const handleStartNew = () => {
    const balance = parseFloat(newBalance);
    if (isNaN(balance) || balance <= 0) {
      return;
    }
    onStartNew(balance);
    onClose();
    setShowNewSimForm(false);
  };

  const handleCancel = () => {
    setShowNewSimForm(false);
    setNewBalance(defaultBalance.toString());
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="sm:max-w-md" data-testid="modal-simulation-startup">
        <DialogHeader>
          <DialogTitle>Simulation Startup</DialogTitle>
          <DialogDescription>
            Would you like to continue your previous simulation or start a new one?
          </DialogDescription>
        </DialogHeader>

        {!showNewSimForm ? (
          <div className="grid gap-4 py-4">
            <Button
              onClick={handleContinue}
              variant="default"
              className="w-full flex items-center justify-center gap-2"
              data-testid="button-continue-simulation"
            >
              <PlayCircle className="w-5 h-5" />
              Continue Previous Simulation
            </Button>

            <Button
              onClick={handleShowNewForm}
              variant="outline"
              className="w-full flex items-center justify-center gap-2"
              data-testid="button-new-simulation"
            >
              <RefreshCw className="w-5 h-5" />
              Start New Simulation
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="starting-balance">Starting Portfolio Balance</Label>
              <div className="flex items-center gap-2">
                <span className="text-lg font-mono">$</span>
                <Input
                  id="starting-balance"
                  type="number"
                  step="0.01"
                  min="1"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  placeholder="800"
                  className="flex-1 font-mono"
                  data-testid="input-starting-balance"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This will reset your baseline, metrics, and open positions.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowNewSimForm(false)}
                data-testid="button-cancel-new-sim"
              >
                Back
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={handleStartNew}
                disabled={!newBalance || parseFloat(newBalance) <= 0}
                data-testid="button-confirm-new-sim"
              >
                Confirm & Start
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
