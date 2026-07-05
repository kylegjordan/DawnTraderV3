/**
 * P19-B8.1 (C4) — Paper Trading start/stop controls (moved from the top bar).
 *
 * P19-B8.2 (OBJ-1): the start-new flow is the Kraken-mirror confirm — the
 * SimulationStartupModal fetches and displays the REAL Kraken free-USD balance
 * read-only; on confirm this component posts {mode:'new'} with NO balance (the
 * server fetches the figure itself — a client can never supply one). The old
 * ConfirmBalanceModal + confirm-balance endpoint retry path was DELETED with its
 * NO-OP endpoint (rule 18); the `requiresConfirmation` branches referenced a
 * server behavior that no longer exists.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { useTrading } from "@/hooks/use-trading";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { apiRequest } from "@/lib/queryClient";
import { SimulationStartupModal } from "@/components/modals/simulation-startup-modal";

export function PaperTradingControls() {
  const {
    isTradingActive,
    stopTrading,
    isStarting,
    isStopping,
  } = useTrading();
  const { toast } = useToast();
  const { canEdit, role } = useUserRole();
  const queryClient = useQueryClient();
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
      const errorMessage = error?.message || "Failed to toggle trading status";
      console.error('[P19-B8.2][PaperControls] Trading toggle error:', errorMessage);
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      await queryClient.refetchQueries({ queryKey: ['/api/active-engine/status'] });
      await queryClient.refetchQueries({ queryKey: ['/api/trading/status'] });
    }
  };

  // Phase 27.F.14.I: Continue Previous Simulation (never calls Kraken).
  const handleContinueSimulation = async () => {
    queryClient.removeQueries({ queryKey: ['portfolio-overview', 'paper'] });
    toast({
      title: "Starting Paper Trading...",
      description: "Activating simulation engine and loading market data",
    });
    try {
      await apiRequest('POST', '/api/active-engine/start', { mode: 'continue' });
      await queryClient.invalidateQueries({ queryKey: ['/api/paper/portfolio/state'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/active-engine/status'] });
      await queryClient.invalidateQueries({ queryKey: [`/api/goals/summary?mode=paper`] });
      await queryClient.invalidateQueries({ queryKey: ['/api/system/trading-pace'] });
      toast({
        title: "Simulation Continued",
        description: "Resumed previous simulation with existing baseline",
      });
    } catch (error: any) {
      console.error('[P19-B8.2][PaperControls] Continue simulation error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to continue simulation",
        variant: "destructive",
      });
    }
  };

  // P19-B8.2: Start New — the balance was already fetched + confirmed read-only
  // in the modal; the server independently re-fetches the mirror figure.
  const handleStartNewSimulation = async () => {
    queryClient.removeQueries({ queryKey: ['portfolio-overview', 'paper'] });
    toast({
      title: "Starting Paper Trading...",
      description: "Starting a new simulation at your real Kraken balance",
    });
    try {
      const result = await apiRequest('POST', '/api/active-engine/start', { mode: 'new' });
      await queryClient.invalidateQueries({ queryKey: ['/api/paper/portfolio/state'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/active-engine/status'] });
      await queryClient.invalidateQueries({ queryKey: [`/api/goals/summary?mode=paper`] });
      await queryClient.invalidateQueries({ queryKey: ['/api/system/trading-pace'] });
      toast({
        title: "New Simulation Started",
        description: (result as any)?.message || "Started fresh simulation at your Kraken balance",
      });
    } catch (error: any) {
      console.error('[P19-B8.2][PaperControls] Start new simulation error:', error);
      toast({
        title: "New simulation NOT started",
        description: error.message || "Could not fetch your real Kraken balance — no fallback figure is ever used.",
        variant: "destructive",
      });
      await queryClient.refetchQueries({ queryKey: ['/api/active-engine/status'] });
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
      />
    </>
  );
}
