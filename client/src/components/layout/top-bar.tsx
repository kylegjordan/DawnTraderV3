import { Menu, Bell, Clock, Globe, AlertTriangle, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SafeInteractiveNotification } from "@/components/ai/InteractiveNotification";
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
import { ConfirmLiveTradingModal } from "@/components/trading/confirm-live-trading-modal";
import { ConfirmStopLiveTradingModal } from "@/components/trading/confirm-stop-live-trading-modal";
import { ConfirmBalanceModal } from "@/components/trading/confirm-balance-modal";
import { SimulationStartupModal } from "@/components/modals/simulation-startup-modal";
import { useTrading } from "@/hooks/use-trading";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUTCTimeWithDate, formatLocalTimeWithDate, getTimezoneAbbr, formatUTCCompact, formatLocalCompact } from "@/lib/timezone";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useWebSocket } from "@/hooks/use-websocket";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface TopBarProps {
  onMenuClick: () => void;
  showMenuButton?: boolean;
}

export default function TopBar({ onMenuClick, showMenuButton = false }: TopBarProps) {
  const { 
    tradingStatus,
    paperSimStatus,
    startTrading, 
    stopTrading, 
    isStarting, 
    isStopping
  } = useTrading();
  const { toast } = useToast();
  const { canEdit, role, can } = useUserRole();
  const queryClient = useQueryClient();
  const [utcTimeDate, setUtcTimeDate] = useState<string>('');
  const [localTimeDate, setLocalTimeDate] = useState<string>('');
  const [utcCompact, setUtcCompact] = useState<string>('');
  const [localCompact, setLocalCompact] = useState<string>('');
  const [localTzAbbr, setLocalTzAbbr] = useState<string>('');
  const [timePreference, setTimePreference] = useState<'local' | 'utc'>('local');
  const [showLiveConfirmation, setShowLiveConfirmation] = useState(false);
  const [showStopConfirmation, setShowStopConfirmation] = useState(false);
  const [showBalanceConfirmation, setShowBalanceConfirmation] = useState(false);
  const [balanceToConfirm, setBalanceToConfirm] = useState(800);
  const [showSimulationStartup, setShowSimulationStartup] = useState(false); // Phase 27.F.14.I
  const [, setLocation] = useLocation();
  const { messages: wsMessages} = useWebSocket();

  // Fetch user settings for timezone and time format
  const { data: settings } = useQuery<{ timezone?: string; timeFormat?: string }>({ 
    queryKey: ['/api/settings'],
  });

  // Fetch Walter approvals (recent 20, including resolved ones)
  const { data: approvalsData } = useQuery({
    queryKey: ['/api/walter/pending-approvals'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/walter/pending-approvals');
        // Get all approvals, sort by most recent first, take last 20
        const allApprovals = response.approvals || [];
        return allApprovals.slice(0, 20); // Show recent 20 approvals
      } catch (error) {
        return [];
      }
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Update dual time display (UTC + Local)
  useEffect(() => {
    const updateTime = () => {
      const timezone = settings?.timezone || 'Asia/Dubai';
      const timeFormat = (settings?.timeFormat || '12hr') as '12hr' | '24hr';
      
      // Update UTC time and date (formatted together)
      setUtcTimeDate(formatUTCTimeWithDate(timeFormat));
      setUtcCompact(formatUTCCompact(timeFormat));
      
      // Update local time, date, and timezone abbreviation
      setLocalTimeDate(formatLocalTimeWithDate(timezone, timeFormat));
      setLocalCompact(formatLocalCompact(timezone, timeFormat));
      setLocalTzAbbr(getTimezoneAbbr(timezone));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [settings?.timezone, settings?.timeFormat]);

  const { mode: currentMode, setMode } = useTradingMode();

  // Listen for approval_update WebSocket events to refresh notifications in real-time
  useEffect(() => {
    const approvalUpdates = wsMessages.filter((msg: any) => msg.type === 'approval_update');
    if (approvalUpdates.length > 0) {
      // Get the latest approval update
      const latestUpdate = approvalUpdates[approvalUpdates.length - 1];
      console.log('[TopBar] Received approval_update event:', latestUpdate);
      
      // Invalidate approvals query to refresh the notification bell
      queryClient.invalidateQueries({ queryKey: ['/api/walter/pending-approvals'] });
    }
  }, [wsMessages, queryClient]);

  // Phase 27.F.1: Listen for trading_state_changed WebSocket events to sync UI
  useEffect(() => {
    const tradingStateUpdates = wsMessages.filter((msg: any) => msg.type === 'trading_state_changed');
    if (tradingStateUpdates.length > 0) {
      const latestUpdate = tradingStateUpdates[tradingStateUpdates.length - 1];
      console.log('[TopBar] Received trading_state_changed event:', latestUpdate);
      
      // Invalidate trading status queries to immediately reflect changes
      queryClient.invalidateQueries({ queryKey: ['/api/trading/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/status'] });
      
      // Phase 27.F.1: Invalidate goals queries for both modes to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/goals', 'live'] });
      queryClient.invalidateQueries({ queryKey: ['/api/goals', 'paper'] });
      
      // Update local mode if changed (WebSocketMessage uses 'data' property)
      if (latestUpdate.data?.mode) {
        setMode(latestUpdate.data.mode);
      }
    }
  }, [wsMessages, queryClient, setMode]);

  // Phase 27.F.14.E + 27.F.14.M: Listen for portfolio_balance_updated events to refresh dashboard
  useEffect(() => {
    const balanceUpdates = wsMessages.filter((msg: any) => msg.type === 'portfolio_balance_updated');
    if (balanceUpdates.length > 0) {
      const latestUpdate = balanceUpdates[balanceUpdates.length - 1];
      console.log('[Phase-27.F.14.E] Received portfolio_balance_updated event:', latestUpdate);
      
      // Phase 27.F.14.M: Invalidate all portfolio-related queries to immediately refresh balance
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/overview'] });
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/paper/portfolio/state'] });
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/metrics'] });
    }
  }, [wsMessages, queryClient]);

  const handleTradingToggle = async (enabled: boolean) => {
    console.log('[Phase-27.F.6] Toggle clicked:', { enabled, mode: currentMode });
    
    // Phase 27.F.6: Show confirmation modals for live trading
    if (currentMode === 'live') {
      if (enabled) {
        // Starting live trading - show confirmation
        setShowLiveConfirmation(true);
        return;
      } else {
        // Stopping live trading - show stop confirmation
        setShowStopConfirmation(true);
        return;
      }
    }
    
    // Phase 27.F.14.I: For Paper mode, show simulation startup modal when starting
    if (enabled) {
      console.log('[Phase-27.F.14.I] Showing simulation startup modal...');
      setShowSimulationStartup(true);
      return;
    }
    
    // Stopping paper mode - proceed directly
    try {
      console.log('[Phase-27.F.6] Stopping paper trading...');
      await stopTrading('paper');
      toast({
        title: "Trading Stopped",
        description: "Paper Trading Simulation engine has been stopped",
      });
    } catch (error: any) {
      let errorMessage = "Failed to toggle trading status";
      
      // Parse error message from API response
      if (error?.message) {
        try {
          // Extract JSON from error message (format: "400: {json}")
          const jsonMatch = error.message.match(/\d+:\s*({.*})/);
          if (jsonMatch) {
            const errorData = JSON.parse(jsonMatch[1]);
            
            // Phase 27.F.14.D-POST: Check if balance confirmation is required in error
            if (errorData.requiresConfirmation) {
              console.log('[Phase-27.F.14.D-POST] Balance confirmation required (from error)');
              setBalanceToConfirm(errorData.currentBalance || 800);
              setShowBalanceConfirmation(true);
              return; // Wait for user to confirm balance
            }
            
            errorMessage = errorData.message || errorData.error || errorMessage;
          } else {
            errorMessage = error.message;
          }
        } catch {
          errorMessage = error.message;
        }
      }
      
      console.error('[Phase-27.F.6] Trading toggle error:', errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Refetch status to ensure UI reflects actual backend state
      await queryClient.refetchQueries({ queryKey: ['/api/paper-sim/status'] });
      await queryClient.refetchQueries({ queryKey: ['/api/trading/status'] });
    }
  };

  // Phase 27.F.14.I: Handle Continue Previous Simulation
  const handleContinueSimulation = async () => {
    console.log('[Phase-27.F.14.I] Continue previous simulation');
    
    try {
      const result = await apiRequest('POST', '/api/paper-sim/start', { mode: 'continue' });
      
      // Check if balance confirmation is required
      if (result && typeof result === 'object' && 'requiresConfirmation' in result && result.requiresConfirmation) {
        console.log('[Phase-27.F.14.I] Balance confirmation required');
        setBalanceToConfirm(result.currentBalance || 800);
        setShowBalanceConfirmation(true);
        return;
      }
      
      toast({
        title: "Simulation Continued",
        description: "Resumed previous simulation with existing baseline",
      });
    } catch (error: any) {
      console.error('[Phase-27.F.14.I] Continue simulation error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to continue simulation",
        variant: "destructive",
      });
    }
  };

  // Phase 27.F.14.I: Handle Start New Simulation
  const handleStartNewSimulation = async (balance: number) => {
    console.log('[Phase-27.F.14.I] Start new simulation with balance:', balance);
    
    try {
      await apiRequest('POST', '/api/paper-sim/start', { 
        mode: 'new', 
        initialBalance: balance 
      });
      
      toast({
        title: "New Simulation Started",
        description: `Started fresh simulation with $${balance.toFixed(2)} balance`,
      });
    } catch (error: any) {
      console.error('[Phase-27.F.14.I] Start new simulation error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to start new simulation",
        variant: "destructive",
      });
    }
  };

  const handleConfirmLiveTrading = async () => {
    console.log('[Phase-27.F.6] Live trading start confirmed');
    
    try {
      await startTrading('live');
      toast({
        title: "Trading Started",
        description: "Live Trading engine started successfully",
      });
    } catch (error: any) {
      let errorMessage = "Failed to start Live Trading";
      
      // Parse error message from API response
      if (error?.message) {
        try {
          // Extract JSON from error message (format: "400: {json}")
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
      
      console.error('[Phase-27.F.6] Live trading start error:', errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Refetch status to ensure UI reflects actual backend state
      await queryClient.refetchQueries({ queryKey: ['/api/trading/status'] });
    }
  };

  const handleConfirmStopLiveTrading = async () => {
    console.log('[Phase-27.F.6] Live trading stop confirmed');
    
    try {
      await stopTrading('live');
      toast({
        title: "Trading Stopped",
        description: "Live Trading engine has been stopped",
      });
    } catch (error: any) {
      let errorMessage = "Failed to stop Live Trading";
      
      // Parse error message from API response
      if (error?.message) {
        try {
          // Extract JSON from error message (format: "400: {json}")
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
      
      console.error('[Phase-27.F.6] Live trading stop error:', errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Refetch status to ensure UI reflects actual backend state
      await queryClient.refetchQueries({ queryKey: ['/api/trading/status'] });
    }
  };

  // Phase 27.F.14.D-POST: Handle balance confirmation
  const handleConfirmBalance = async (balance: number) => {
    console.log('[Phase-27.F.14.D-POST] Confirming balance:', balance);
    
    try {
      // Send balance confirmation to backend
      await apiRequest('POST', '/api/paper-sim/confirm-balance', { 
        balance, 
        mode: currentMode 
      });
      
      // Phase 27.F.14.E: Immediately refresh portfolio value across all sessions
      console.log('[Phase-27.F.14.E] Invalidating portfolio queries after balance confirmation');
      await queryClient.invalidateQueries({ queryKey: ['/api/portfolio/overview'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/status'] });
      
      // Close the modal
      setShowBalanceConfirmation(false);
      
      // Retry starting trading
      console.log('[Phase-27.F.14.D-POST] Balance confirmed, retrying start...');
      await startTrading('paper');
      
      toast({
        title: "Trading Started",
        description: `Paper Trading started with balance $${balance.toFixed(2)}`,
      });
    } catch (error: any) {
      let errorMessage = "Failed to confirm balance and start trading";
      
      // Parse error message from API response
      if (error?.message) {
        try {
          // Extract JSON from error message (format: "400: {json}")
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
      
      console.error('[Phase-27.F.14.D-POST] Balance confirmation error:', errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Refetch status to ensure UI reflects actual backend state
      await queryClient.refetchQueries({ queryKey: ['/api/paper-sim/status'] });
      await queryClient.refetchQueries({ queryKey: ['/api/trading/status'] });
    }
  };

  const handleModeChange = async (newMode: 'live' | 'paper') => {
    // Phase 27.F.1: Don't switch if already in that mode
    if (newMode === currentMode) {
      return;
    }

    try {
      // Phase 27.F.1: Use /api/trading/set-mode to trigger WebSocket broadcast
      await apiRequest('POST', '/api/trading/set-mode', { 
        mode: newMode,
        reason: `User switched to ${newMode} mode via UI`
      });
      
      // Optimistic UI update
      setMode(newMode);
      
      toast({
        title: "Mode Changed",
        description: `Switched to ${newMode === 'live' ? 'Live' : 'Paper'} trading mode`,
      });
      
      // WebSocket event will trigger automatic refetch via listener above
    } catch (error: any) {
      console.error('Failed to update mode:', error);
      
      // Parse error message for better UX
      let errorMessage = "Failed to update trading mode";
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
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Refetch to ensure UI reflects actual backend state
      await queryClient.refetchQueries({ queryKey: ['/api/trading/status'] });
    }
  };

  // Phase 27.F.12: Determine if trading is active based on current mode using mode-specific fields
  const isActive = currentMode === 'paper' 
    ? tradingStatus?.isEngineActivePaper || false
    : tradingStatus?.isEngineActiveLive || false;

  return (
    <header 
      className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border"
      data-testid="top-bar"
    >
      <div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-4">
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Mobile Menu Toggle */}
          {showMenuButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMenuClick}
              className="lg:hidden p-1.5 sm:p-2 hover:bg-muted"
              data-testid="button-menu"
            >
              <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
            </Button>
          )}
          
          {/* Mobile Controls (< md) */}
          <div className="flex md:hidden items-center gap-2">
            {/* Trading Status Dropdown for Mobile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isStarting || isStopping || !canEdit}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1.5 bg-muted rounded-md text-xs font-medium h-auto",
                    !canEdit && "opacity-50 cursor-not-allowed"
                  )}
                  data-testid="dropdown-trading-status-mobile"
                >
                  <span className={`status-dot ${isActive ? 'active' : 'inactive'}`} />
                  <span className={isActive ? 'text-success' : 'text-destructive'}>
                    {isActive ? 'Active' : 'Stopped'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Trading Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleTradingToggle(true)}
                  disabled={isActive || isStarting || isStopping || !canEdit}
                  className="flex items-center gap-2"
                  data-testid="menu-start-trading"
                >
                  <span className="status-dot active" />
                  <span className="text-success font-medium">Start Trading</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleTradingToggle(false)}
                  disabled={!isActive || isStarting || isStopping || !canEdit}
                  className="flex items-center gap-2"
                  data-testid="menu-stop-trading"
                >
                  <span className="status-dot inactive" />
                  <span className="text-destructive font-medium">Stop Trading</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mode Dropdown for Mobile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1.5 px-2 py-1.5 bg-muted rounded-md text-xs font-semibold h-auto"
                  data-testid="dropdown-mode-mobile"
                >
                  {currentMode === 'live' ? 'LIVE' : 'PAPER'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Trading Mode</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleModeChange('live')}
                  disabled={!can('trade_live') || currentMode === 'live'}
                  className={cn(
                    "font-semibold",
                    currentMode === 'live' && "text-base font-bold text-foreground"
                  )}
                  data-testid="menu-live-mode"
                >
                  Live
                  {currentMode === 'live' && ' ✓'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleModeChange('paper')}
                  disabled={!can('trade_paper') || currentMode === 'paper'}
                  className={cn(
                    "font-semibold",
                    currentMode === 'paper' && "text-base font-bold text-foreground"
                  )}
                  data-testid="menu-paper-mode"
                >
                  Paper
                  {currentMode === 'paper' && ' ✓'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Desktop Controls (≥ md) */}
          <div className="hidden md:flex items-center gap-3">
            {/* Start/Stop Toggle */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3 px-4 py-2 bg-muted rounded-lg">
                <span className="text-sm font-medium text-foreground">Trading</span>
                <Switch
                  checked={isActive}
                  onCheckedChange={handleTradingToggle}
                  disabled={isStarting || isStopping || !canEdit}
                  className="data-[state=checked]:bg-success"
                  data-testid="switch-trading"
                  title={!canEdit ? `Viewers cannot control trading (Role: ${role})` : ''}
                />
                <div className="flex items-center gap-1">
                  <span className={`status-dot ${isActive ? 'active' : 'inactive'}`} />
                  <span className={`text-xs font-semibold ${isActive ? 'text-success' : 'text-destructive'}`}>
                    {isActive ? 'ACTIVE' : 'STOPPED'}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Mode Toggle - Phase 27.3: Permission-gated */}
            <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
              <Button
                variant={currentMode === 'live' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleModeChange('live')}
                disabled={!can('trade_live')}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded h-auto",
                  currentMode === 'live' 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  !can('trade_live') && "opacity-50 cursor-not-allowed"
                )}
                title={!can('trade_live') ? `Live trading requires trade_live permission (Role: ${role})` : ''}
                data-testid="button-live-mode"
              >
                LIVE
              </Button>
              <Button
                variant={currentMode === 'paper' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleModeChange('paper')}
                disabled={!can('trade_paper')}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded h-auto",
                  currentMode === 'paper' 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  !can('trade_paper') && "opacity-50 cursor-not-allowed"
                )}
                title={!can('trade_paper') ? `Paper trading requires trade_paper permission (Role: ${role})` : ''}
                data-testid="button-paper-mode"
              >
                PAPER
              </Button>
            </div>
          </div>
        </div>
        
        {/* Right Actions */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* Mobile Time Display - Unified Dropdown with Local/UTC Selection */}
          <div className="flex md:hidden items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 px-1.5 py-1 bg-primary/10 rounded border border-primary/20 text-[10px] h-auto hover:bg-primary/20"
                  data-testid="dropdown-time-mobile"
                >
                  {timePreference === 'utc' ? (
                    <Globe className="w-3 h-3 text-primary" />
                  ) : (
                    <Clock className="w-3 h-3 text-primary" />
                  )}
                  <span className="font-mono text-foreground whitespace-nowrap">
                    {timePreference === 'utc' ? utcCompact : localCompact}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Select Time Display</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                {/* Local Time Option */}
                <DropdownMenuItem 
                  onClick={() => setTimePreference('local')}
                  className={cn(
                    "flex flex-col items-start gap-1 cursor-pointer",
                    timePreference === 'local' && "bg-primary/10"
                  )}
                  data-testid="menu-select-local-time"
                >
                  <div className="flex items-center gap-2 w-full">
                    <Clock className="w-4 h-4" />
                    <span className="font-semibold">Local Time ({localTzAbbr})</span>
                    {timePreference === 'local' && <span className="ml-auto">✓</span>}
                  </div>
                  <div className="font-mono text-sm ml-6">{localTimeDate}</div>
                  <div className="text-xs text-muted-foreground ml-6">
                    {settings?.timezone || 'Asia/Dubai'}
                  </div>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                {/* UTC Time Option */}
                <DropdownMenuItem 
                  onClick={() => setTimePreference('utc')}
                  className={cn(
                    "flex flex-col items-start gap-1 cursor-pointer",
                    timePreference === 'utc' && "bg-primary/10"
                  )}
                  data-testid="menu-select-utc-time"
                >
                  <div className="flex items-center gap-2 w-full">
                    <Globe className="w-4 h-4" />
                    <span className="font-semibold">UTC Time</span>
                    {timePreference === 'utc' && <span className="ml-auto">✓</span>}
                  </div>
                  <div className="font-mono text-sm ml-6">{utcTimeDate}</div>
                  <div className="text-xs text-muted-foreground ml-6">
                    Coordinated Universal Time
                  </div>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation('/settings')} data-testid="menu-time-goto-settings">
                  Go to Settings to change timezone
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Desktop Time Display: UTC + Local */}
          <div className="hidden md:flex items-center gap-3">
            {/* UTC Time */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground leading-none">UTC</span>
                <span className="text-sm font-mono text-foreground leading-tight" data-testid="text-utc-time">
                  {utcTimeDate}
                </span>
              </div>
            </div>
            
            {/* Local Time */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-md border border-primary/20">
              <Clock className="w-4 h-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-[10px] text-primary leading-none">Local Time: {localTzAbbr}</span>
                <span className="text-sm font-mono text-foreground leading-tight" data-testid="text-local-time">
                  {localTimeDate}
                </span>
              </div>
            </div>
          </div>
          
          {/* Walter Approvals Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="relative p-2 hover:bg-muted"
                data-testid="button-notifications"
              >
                <Bell className="w-5 h-5 text-foreground" />
                {approvalsData && approvalsData.filter((a: any) => a.status === 'pending').length > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] p-0 px-1 text-[10px] font-semibold flex items-center justify-center rounded-full"
                  >
                    {approvalsData.filter((a: any) => a.status === 'pending').length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96 max-h-96 overflow-y-auto">
              <DropdownMenuLabel>Walter Approvals (Recent 20)</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {approvalsData && approvalsData.length > 0 ? (
                <>
                  {/* Pending approvals first */}
                  {approvalsData.filter((a: any) => a.status === 'pending').map((approval: any) => (
                    <DropdownMenuItem
                      key={approval.id}
                      className="p-2 focus:bg-transparent hover:bg-transparent"
                      data-testid={`approval-${approval.id}`}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <SafeInteractiveNotification
                        approval={approval}
                        onClose={() => {
                          // Dropdown will auto-close if needed, or user can continue reviewing
                        }}
                      />
                    </DropdownMenuItem>
                  ))}
                  
                  {/* Then show recent resolved approvals */}
                  {approvalsData.filter((a: any) => a.status !== 'pending').map((approval: any) => (
                    <DropdownMenuItem
                      key={approval.id}
                      className="p-2 focus:bg-transparent hover:bg-transparent"
                      data-testid={`approval-resolved-${approval.id}`}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <SafeInteractiveNotification
                        approval={approval}
                        onClose={() => {
                          // Dropdown will auto-close if needed
                        }}
                      />
                    </DropdownMenuItem>
                  ))}
                </>
              ) : (
                <div className="px-2 py-6 text-center">
                  <p className="text-sm text-muted-foreground">No approvals</p>
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Phase 27.F.6: Live Trading Confirmation Modals */}
      <ConfirmLiveTradingModal
        open={showLiveConfirmation}
        onOpenChange={setShowLiveConfirmation}
        onConfirm={handleConfirmLiveTrading}
      />
      
      <ConfirmStopLiveTradingModal
        open={showStopConfirmation}
        onOpenChange={setShowStopConfirmation}
        onConfirm={handleConfirmStopLiveTrading}
      />
      
      {/* Phase 27.F.14.D-POST: Balance Confirmation Modal */}
      <ConfirmBalanceModal
        open={showBalanceConfirmation}
        onOpenChange={setShowBalanceConfirmation}
        currentBalance={balanceToConfirm}
        onConfirm={handleConfirmBalance}
        mode={currentMode}
      />
      
      {/* Phase 27.F.14.I: Simulation Startup Modal */}
      <SimulationStartupModal
        open={showSimulationStartup}
        onClose={() => setShowSimulationStartup(false)}
        onContinue={handleContinueSimulation}
        onStartNew={handleStartNewSimulation}
        defaultBalance={balanceToConfirm}
      />
    </header>
  );
}
