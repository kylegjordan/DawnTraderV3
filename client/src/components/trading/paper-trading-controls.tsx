/**
 * P19-B8.1 (C4) — Paper Trading start/stop controls.
 *
 * MOVED here from the global top bar (Kyle locked design: controls live inside
 * their mode page, not floating over every page). PAPER-scoped on purpose:
 * this block owns the paper toggle + its two modals (SimulationStartupModal,
 * ConfirmBalanceModal). The live-mode confirm modals stay unmounted until the
 * Phase-21 live-controls build re-homes them on the Live Trading page; the
 * global LIVE/PAPER mode selector is retired with the top-bar strip (mode is
 * expressed by which page you're on).
 *
 * Handlers are verbatim ports of the top-bar's paper branches (Phase 27.F.6 /
 * 27.F.14.I / 27.F.14.D-POST lineage) — no behavior change in this batch; the
 * start-flow redesign (Kraken-mirror) is B8.2.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { useTrading } from "@/hooks/use-trading";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { apiRequest } from "@/lib/queryClient";
import { ConfirmBalanceModal } from "@/components/trading/confirm-balance-modal";
import { SimulationStartupModal } from "@/components/modals/simulation-startup-modal";

export function PaperTradingControls() {
  const {
    isTradingActive,
    stopTrading,
    startTrading,
    isStarting,
    isStopping,
  } = useTrading();
  const { toast } = useToast();
  const { canEdit, role } = useUserRole();
  const queryClient = useQueryClient();
  const [showBalanceConfirmation, setShowBalanceConfirmation] = useState(false);
  const [balanceToConfirm, setBalanceToConfirm] = useState(800);
  const [showSimulationStartup, setShowSimulationStartup] = useState(false);

  const isActive = isTradingActive;

  const handleTradingToggle = async (enabled: boolean) => {
    // Phase 33.B: front-end busy guard — prevent rapid toggling.
    if (isStarting || isStopping) {
      toast({
        title: "Please wait",
        description: "Trading engine is busy. Please wait for the current operation to complete.",
        variant: "default",
      });
      return;
    }

    // Phase 27.F.14.I: starting paper → simulation startup modal (new/continue).
    if (enabled) {
      setShowSimulationStartup(true);
      return;
    }

    // Stopping paper mode — proceed directly.
    try {
      await stopTrading('paper');
    } catch (error: any) {
      let errorMessage = "Failed to toggle trading status";
      if (error?.message) {
        try {
          const jsonMatch = error.message.match(/\d+:\s*({.*})/);
          if (jsonMatch) {
            const errorData = JSON.parse(jsonMatch[1]);
            if (errorData.requiresConfirmation) {
              setBalanceToConfirm(errorData.currentBalance || 800);
              setShowBalanceConfirmation(true);
              return;
            }
            errorMessage = errorData.message || errorData.error || errorMessage;
          } else {
            errorMessage = error.message;
          }
        } catch {
          errorMessage = error.message;
        }
      }
      console.error('[P19-B8.1][PaperControls] Trading toggle error:', errorMessage);
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      await queryClient.refetchQueries({ queryKey: ['/api/active-engine/status'] });
      await queryClient.refetchQueries({ queryKey: ['/api/trading/status'] });
    }
  };

  // Phase 27.F.14.I: Continue Previous Simulation.
  const handleContinueSimulation = async () => {
    queryClient.removeQueries({ queryKey: ['portfolio-overview', 'paper'] });
    toast({
      title: "Starting Paper Trading...",
      description: "Activating simulation engine and loading market data",
    });
    try {
      const result = await apiRequest('POST', '/api/active-engine/start', { mode: 'continue' });
      if (result && typeof result === 'object' && 'requiresConfirmation' in result && result.requiresConfirmation) {
        setBalanceToConfirm((result as any).currentBalance || 800);
        setShowBalanceConfirmation(true);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['/api/paper/portfolio/state'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/active-engine/status'] });
      await queryClient.invalidateQueries({ queryKey: [`/api/goals/summary?mode=paper`] });
      await queryClient.invalidateQueries({ queryKey: ['/api/system/trading-pace'] });
      toast({
        title: "Simulation Continued",
        description: "Resumed previous simulation with existing baseline",
      });
    } catch (error: any) {
      console.error('[P19-B8.1][PaperControls] Continue simulation error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to continue simulation",
        variant: "destructive",
      });
    }
  };

  // Phase 27.F.14.I: Start New Simulation.
  const handleStartNewSimulation = async (balance: number) => {
    queryClient.removeQueries({ queryKey: ['portfolio-overview', 'paper'] });
    toast({
      title: "Starting Paper Trading...",
      description: `Activating new simulation with $${balance.toFixed(2)} balance`,
    });
    try {
      await apiRequest('POST', '/api/active-engine/start', { mode: 'new', initialBalance: balance });
      await queryClient.invalidateQueries({ queryKey: ['/api/paper/portfolio/state'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/active-engine/status'] });
      await queryClient.invalidateQueries({ queryKey: [`/api/goals/summary?mode=paper`] });
      await queryClient.invalidateQueries({ queryKey: ['/api/system/trading-pace'] });
      toast({
        title: "New Simulation Started",
        description: `Started fresh simulation with $${balance.toFixed(2)} balance`,
      });
    } catch (error: any) {
      console.error('[P19-B8.1][PaperControls] Start new simulation error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to start new simulation",
        variant: "destructive",
      });
    }
  };

  // Phase 27.F.14.D-POST: balance confirmation retry path.
  const handleConfirmBalance = async (balance: number) => {
    try {
      await apiRequest('POST', '/api/active-engine/confirm-balance', { balance, mode: 'paper' });
      await queryClient.invalidateQueries({ queryKey: ['portfolio-overview', 'paper'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/active-engine/status'] });
      setShowBalanceConfirmation(false);
      await startTrading({ type: 'paper-continue' });
    } catch (error: any) {
      let errorMessage = "Failed to confirm balance and start trading";
      if (error?.message) {
        try {
          const jsonMatch = error.message.match(/\d+:\s*({.*})/);
          if (jsonMatch) {
            const errorData = JSON.parse(jsonMatch[1]);
            errorMessage = errorData.message || errorData.error || errorMessage;
          } else {
            errorMessage = error.message;
          }
        } catch {
          errorMessage = error.message;
        }
      }
      console.error('[P19-B8.1][PaperControls] Balance confirmation error:', errorMessage);
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      await queryClient.refetchQueries({ queryKey: ['/api/active-engine/status'] });
      await queryClient.refetchQueries({ queryKey: ['/api/trading/status'] });
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2 bg-muted rounded-lg" data-testid="paper-trading-controls">
        <span className="text-sm font-medium text-foreground">Paper Trading</span>
        <Switch
          checked={isActive}
          onCheckedChange={handleTradingToggle}
          disabled={isStarting || isStopping || !canEdit}
          className="data-[state=checked]:bg-success"
          data-testid="switch-paper-trading"
          title={!canEdit ? `Viewers cannot control trading (Role: ${role})` : ''}
        />
        <div className="flex items-center gap-1">
          <span className={`status-dot ${isActive ? 'active' : 'inactive'}`} />
          <span className={`text-xs font-semibold ${isActive ? 'text-success' : 'text-destructive'}`}>
            {isActive ? 'ACTIVE' : 'STOPPED'}
          </span>
        </div>
      </div>

      <SimulationStartupModal
        open={showSimulationStartup}
        onClose={() => setShowSimulationStartup(false)}
        onContinue={handleContinueSimulation}
        onStartNew={handleStartNewSimulation}
        defaultBalance={balanceToConfirm}
      />

      <ConfirmBalanceModal
        open={showBalanceConfirmation}
        onOpenChange={setShowBalanceConfirmation}
        currentBalance={balanceToConfirm}
        onConfirm={handleConfirmBalance}
        mode="paper"
      />
    </>
  );
}
