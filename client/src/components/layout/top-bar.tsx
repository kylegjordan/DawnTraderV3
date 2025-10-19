import { Menu, Bell, Clock, Globe, AlertTriangle } from "lucide-react";
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
import { useTrading } from "@/hooks/use-trading";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUTCTimeWithDate, formatLocalTimeWithDate, getTimezoneAbbr } from "@/lib/timezone";
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
  const [localTzAbbr, setLocalTzAbbr] = useState<string>('');
  const [showLiveConfirmation, setShowLiveConfirmation] = useState(false);
  const [, setLocation] = useLocation();
  const { messages: wsMessages } = useWebSocket();

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
      
      // Update local time, date, and timezone abbreviation
      setLocalTimeDate(formatLocalTimeWithDate(timezone, timeFormat));
      setLocalTzAbbr(getTimezoneAbbr(timezone));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [settings?.timezone, settings?.timeFormat]);

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

  const { mode: currentMode, setMode } = useTradingMode();

  const handleTradingToggle = async (enabled: boolean) => {
    // If turning ON in Live mode, show confirmation modal first
    if (enabled && currentMode === 'live') {
      setShowLiveConfirmation(true);
      return;
    }
    
    // For Paper mode or turning OFF, proceed directly
    try {
      if (enabled) {
        await startTrading(currentMode);
        toast({
          title: "Trading Started",
          description: `${currentMode === 'paper' ? 'Paper Trading Simulation' : 'Live Trading'} engine started successfully`,
        });
      } else {
        await stopTrading(currentMode);
        toast({
          title: "Trading Stopped",
          description: `${currentMode === 'paper' ? 'Paper Trading Simulation' : 'Live Trading'} engine has been stopped`,
        });
      }
    } catch (error: any) {
      let errorMessage = "Failed to toggle trading status";
      
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
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Refetch status to ensure UI reflects actual backend state
      if (currentMode === 'paper') {
        await queryClient.refetchQueries({ queryKey: ['/api/paper-sim/status'] });
      } else {
        await queryClient.refetchQueries({ queryKey: ['/api/trading/status'] });
      }
    }
  };

  const handleConfirmLiveTrading = async () => {
    setShowLiveConfirmation(false);
    
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
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Refetch status to ensure UI reflects actual backend state (Live mode only)
      await queryClient.refetchQueries({ queryKey: ['/api/trading/status'] });
    }
  };

  const handleModeChange = async (newMode: 'live' | 'paper') => {
    try {
      // Update local state
      setMode(newMode);
      
      // Persist to database via API
      await apiRequest('PUT', '/api/settings', { currentMode: newMode });
      
      toast({
        title: "Mode Changed",
        description: `Switched to ${newMode === 'live' ? 'Live' : 'Paper'} trading mode`,
      });
    } catch (error: any) {
      console.error('Failed to update mode:', error);
      toast({
        title: "Error",
        description: "Failed to update trading mode",
        variant: "destructive",
      });
    }
  };

  // Determine if trading is active based on current mode
  const isActive = currentMode === 'paper' 
    ? paperSimStatus?.isRunning || false
    : tradingStatus?.engineActive || false;

  return (
    <header 
      className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border"
      data-testid="top-bar"
    >
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          {/* Mobile Menu Toggle */}
          {showMenuButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMenuClick}
              className="lg:hidden p-2 hover:bg-muted"
              data-testid="button-menu"
            >
              <Menu className="w-6 h-6" />
            </Button>
          )}
          
          {/* Master Controls */}
          <div className="flex items-center gap-3">
            {/* Start/Stop Toggle */}
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
        <div className="flex items-center gap-3">
          {/* Dual Time Display: UTC + Local */}
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

      {/* Live Trading Confirmation Modal */}
      <AlertDialog open={showLiveConfirmation} onOpenChange={setShowLiveConfirmation}>
        <AlertDialogContent data-testid="dialog-live-confirmation">
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
              </div>
              <AlertDialogTitle className="text-lg font-semibold">
                Confirm Live Trading Activation
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base pt-4">
              <span className="font-semibold text-orange-600 dark:text-orange-400">⚠️ Warning:</span> You are about to activate Live Trading. 
              This will place <span className="font-semibold">real market orders</span> with actual funds.
              <br /><br />
              Please confirm that you wish to proceed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-live">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmLiveTrading}
              className="bg-orange-600 hover:bg-orange-700 text-white"
              data-testid="button-confirm-live"
            >
              Confirm & Start Live Trading
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
