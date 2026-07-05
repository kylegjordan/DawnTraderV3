// P19-B8.2 (OBJ-1): the free-text starting-balance input was DELETED. A new
// paper session starts at the REAL Kraken account's free-USD balance, fetched
// read-only from the server and displayed for confirmation — there is no
// override field, and a failed fetch REFUSES the start (no fallback figure).
// 'Continue' is untouched: it resumes the persisted balance and never calls Kraken.
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
import { PlayCircle, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface MirrorBreakdownRow {
  asset: string;
  amount: number;
  kind: 'usd_cash' | 'stablecoin' | 'other';
  deployable: boolean;
}

interface MirrorBalance {
  mirrorBalanceUsd: number;
  breakdown: MirrorBreakdownRow[];
  fetchedAt: string;
}

interface SimulationStartupModalProps {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
  /** Fires after the user confirms the displayed Kraken-mirror figure. */
  onStartNew: () => void;
}

export function SimulationStartupModal({
  open,
  onClose,
  onContinue,
  onStartNew,
}: SimulationStartupModalProps) {
  const [mirror, setMirror] = useState<MirrorBalance | null>(null);
  const [mirrorError, setMirrorError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const resetLocal = () => {
    setMirror(null);
    setMirrorError(null);
    setIsFetching(false);
  };

  const handleContinue = () => {
    resetLocal();
    onContinue();
    onClose();
  };

  const handleShowNewForm = async () => {
    setIsFetching(true);
    setMirrorError(null);
    try {
      const data = await apiRequest('GET', '/api/active-engine/mirror-balance');
      setMirror(data as MirrorBalance);
    } catch (error: any) {
      setMirror(null);
      setMirrorError(
        error?.message ||
          'Could not fetch your real Kraken balance. The new session cannot start until the connection is restored (Continue is unaffected).'
      );
    } finally {
      setIsFetching(false);
    }
  };

  const handleConfirmStartNew = () => {
    resetLocal();
    onStartNew();
    onClose();
  };

  const handleCancel = () => {
    resetLocal();
    onClose();
  };

  const inNewLeg = isFetching || mirror !== null || mirrorError !== null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="sm:max-w-md" data-testid="modal-simulation-startup">
        <DialogHeader>
          <DialogTitle>Simulation Startup</DialogTitle>
          <DialogDescription>
            Would you like to continue your previous simulation or start a new one?
          </DialogDescription>
        </DialogHeader>

        {!inNewLeg ? (
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
            {isFetching && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="mirror-balance-loading">
                <Loader2 className="w-4 h-4 animate-spin" />
                Fetching your real Kraken balance…
              </div>
            )}

            {mirrorError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" data-testid="mirror-balance-error">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
                <span>{mirrorError}</span>
              </div>
            )}

            {mirror && (
              <div className="grid gap-3" data-testid="mirror-balance-confirm">
                <div>
                  <div className="text-xs text-muted-foreground">New simulation starts at your real Kraken free-USD balance</div>
                  <div className="text-2xl font-mono font-semibold" data-testid="mirror-balance-figure">
                    ${mirror.mirrorBalanceUsd.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Read-only — fetched {new Date(mirror.fetchedAt).toLocaleTimeString()} from your Kraken account.
                  </div>
                </div>

                {mirror.breakdown.length > 0 && (
                  <div className="rounded-md border p-2 max-h-40 overflow-y-auto">
                    <div className="text-xs font-medium mb-1">Account holdings</div>
                    {mirror.breakdown.map((row) => (
                      <div key={row.asset} className="flex justify-between text-xs font-mono py-0.5">
                        <span>
                          {row.asset}
                          {!row.deployable && (
                            <span className="ml-1 text-muted-foreground">
                              ({row.kind === 'stablecoin' ? 'stablecoin — shown, not counted' : 'shown, not counted'})
                            </span>
                          )}
                        </span>
                        <span>{row.amount.toFixed(row.kind === 'other' ? 8 : 2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Starting new will reset your baseline, metrics, and open positions. Learning data is never reset.
                </p>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={resetLocal} data-testid="button-cancel-new-sim">
                Back
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={handleConfirmStartNew}
                disabled={!mirror || !(mirror.mirrorBalanceUsd > 0)}
                data-testid="button-confirm-new-sim"
              >
                Confirm &amp; Start at ${mirror ? mirror.mirrorBalanceUsd.toFixed(2) : '—'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
