import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, TrendingUp, Shield, AlertTriangle } from "lucide-react";
import { BaselineSnapshot } from "@/hooks/use-baseline-status";

interface CopyToLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  baselineSnapshot: BaselineSnapshot;
}

export function CopyToLiveModal({
  isOpen,
  onClose,
  onConfirm,
  baselineSnapshot,
}: CopyToLiveModalProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl" data-testid="modal-copy-to-live">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            Copy Optimized Parameters to Live Mode
          </DialogTitle>
          <DialogDescription>
            Transfer optimized paper trading parameters to your Live mode guardrails.
            You must still click "Save" in Live mode to persist these changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warning Banner */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 mt-0.5" />
              <div className="text-sm text-amber-700 dark:text-amber-200/80">
                <p className="font-semibold mb-1">Important</p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>These parameters will replace your current Live mode settings</li>
                  <li>Values will be populated in the form fields but NOT auto-saved</li>
                  <li>Review the copied values and click "Save" in Live mode to persist</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Paper Mode Performance Summary */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              Paper Mode Performance (Established Baseline)
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/50 p-3 rounded-lg">
              <div data-testid="modal-metric-winrate">
                <div className="text-xs text-muted-foreground">Win Rate</div>
                <div className="text-base font-semibold">
                  {(baselineSnapshot.winRate * 100).toFixed(1)}%
                </div>
              </div>
              <div data-testid="modal-metric-profit-factor">
                <div className="text-xs text-muted-foreground">Profit Factor</div>
                <div className="text-base font-semibold">
                  {baselineSnapshot.profitFactor.toFixed(2)}x
                </div>
              </div>
              <div data-testid="modal-metric-drawdown">
                <div className="text-xs text-muted-foreground">Max Drawdown</div>
                <div className="text-base font-semibold">
                  {baselineSnapshot.maxDrawdown.toFixed(1)}%
                </div>
              </div>
              <div data-testid="modal-metric-trades">
                <div className="text-xs text-muted-foreground">Trades</div>
                <div className="text-base font-semibold">
                  {baselineSnapshot.closedTradesCount}
                </div>
              </div>
            </div>
          </div>

          {/* Parameters to Copy */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-blue-600" />
              Parameters That Will Be Copied to Live Mode
            </h4>
            <div className="space-y-2 bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-900/50">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Risk Per Trade</div>
                  <div className="font-semibold" data-testid="modal-param-risk-per-trade">
                    {baselineSnapshot.riskPerTradePercent.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Max Daily Loss</div>
                  <div className="font-semibold" data-testid="modal-param-max-daily-loss">
                    ${baselineSnapshot.maxDailyLoss.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Max Drawdown</div>
                  <div className="font-semibold" data-testid="modal-param-max-drawdown">
                    {baselineSnapshot.maxDrawdown.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Target Trades/Day</div>
                  <div className="font-semibold" data-testid="modal-param-trades-per-day">
                    ~{Math.ceil(baselineSnapshot.tradesPerDay)} trades
                  </div>
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-blue-300 dark:border-blue-800">
                <div className="text-xs text-muted-foreground mb-1">Fee-Aware Calculation Mode</div>
                <Badge variant="secondary" className="text-xs" data-testid="modal-fee-mode">
                  {baselineSnapshot.defaultFeeMode === 'maker' ? 'Maker Fee 0.16%' : 'Taker Fee 0.26%'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="text-sm font-medium mb-2">Next Steps:</p>
            <ol className="list-decimal ml-4 text-sm space-y-1 text-muted-foreground">
              <li>Click "Copy Now" to populate Live mode fields with these values</li>
              <li>Switch to Live mode in Guardrails & Filters</li>
              <li>Review the copied parameters in the Guardrails tab</li>
              <li>Click "Save Changes" to persist them to the database</li>
            </ol>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            data-testid="button-cancel-copy"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="button-confirm-copy"
          >
            <ArrowRight className="w-4 h-4 mr-2" />
            Copy Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
