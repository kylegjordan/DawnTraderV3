import { Menu, Clock, Globe, AlertTriangle, MoreVertical, RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  // P19-B8.1: trading-control hooks (start/stop/toggle, role gating) moved to
  // PaperTradingControls; the top bar keeps only the status reads that drive
  // its widget-refresh effects.
  const { tradingStatus, activeEngineStatus } = useTrading();
  const queryClient = useQueryClient();
  const [utcTimeDate, setUtcTimeDate] = useState<string>('');
  const [localTimeDate, setLocalTimeDate] = useState<string>('');
  const [utcCompact, setUtcCompact] = useState<string>('');
  const [localCompact, setLocalCompact] = useState<string>('');
  const [localTzAbbr, setLocalTzAbbr] = useState<string>('');
  const [timePreference, setTimePreference] = useState<'local' | 'utc'>('local');
  const [, setLocation] = useLocation();
  const { messages: wsMessages} = useWebSocket();

  // Fetch user settings for timezone and time format
  const { data: settings } = useQuery<{ timezone?: string; timeFormat?: string }>({ 
    queryKey: ['/api/settings'],
  });

  // Phase 31.H: Fetch system config for passive learning status
  const { data: systemConfigData } = useQuery({
    queryKey: ['/api/system/config'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/system/config');
        return response;
      } catch (error) {
        return { systemFlags: { passiveLearning: false } };
      }
    },
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const { mode: currentMode, setMode } = useTradingMode();
  
  // Phase 8.8.3-I9 Part B: Portfolio Summary for TopBar metrics row
  const { data: portfolioData } = useQuery<{
    ok: boolean;
    startingBalance: number;
    currentBalance: number;
    netPnl: number;
    netPnlPercent: number;
    totalPositionValue: number;
    openTradesCount: number;
    slotsAvailable: number;
  }>({
    queryKey: ['/api/active-engine/portfolio-summary'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/active-engine/portfolio-summary');
        return response;
      } catch (error) {
        return { ok: false, startingBalance: 0, currentBalance: 0, netPnl: 0, netPnlPercent: 0, totalPositionValue: 0 };
      }
    },
    enabled: currentMode === 'paper',
    refetchInterval: 10000,
    staleTime: 5000,
  });
  
  // Update dual time display (UTC + Local)
  useEffect(() => {
    const updateTime = () => {
      // B-NEW-TZ (2026-05-14): fallback corrected from 'Asia/Dubai' to 'UTC'.
      // The hardcoded Dubai fallback was masking a missing save path — when
      // the saved value came through as undefined it looked like the user's
      // pick had been reverted to Dubai when it had never been saved at all.
      // UTC is a neutral baseline that makes a missing save obvious.
      const timezone = settings?.timezone || 'UTC';
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

  // Listen for trading_state_changed WebSocket events to sync UI
  useEffect(() => {
    const tradingStateUpdates = wsMessages.filter((msg: any) => msg.type === 'trading_state_changed');
    if (tradingStateUpdates.length > 0) {
      const latestUpdate = tradingStateUpdates[tradingStateUpdates.length - 1];
      console.log('[TopBar] Received trading_state_changed event:', latestUpdate);
      
      // Minimal invalidations - only trading status queries
      queryClient.invalidateQueries({ queryKey: ['/api/trading/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/status'] });
      
      // Update local mode if changed
      const mode = latestUpdate.payload?.mode || latestUpdate.data?.mode;
      if (mode) {
        setMode(mode);
      }
    }
  }, [wsMessages, queryClient, setMode]);

  // Phase 8.8.3-I10-FIX: Listen for trade_closed events to immediately refresh portfolio
  useEffect(() => {
    const tradeClosedUpdates = wsMessages.filter((msg: any) => msg.type === 'trade_closed');
    if (tradeClosedUpdates.length > 0 && currentMode === 'paper') {
      console.log('[TopBar][I10-FIX] Trade closed - refreshing portfolio summary');
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/portfolio-summary'] });
    }
  }, [wsMessages, queryClient, currentMode]);

  // Phase 8.8.3-I10-FIX: Throttled price update listener for portfolio (every 3 seconds max)
  const [lastPortfolioRefresh, setLastPortfolioRefresh] = useState<number>(0);
  useEffect(() => {
    const priceUpdates = wsMessages.filter((msg: any) => msg.type === 'price_updated');
    if (priceUpdates.length > 0 && currentMode === 'paper') {
      const now = Date.now();
      // Throttle to max once every 3 seconds to avoid UI thrashing
      if (now - lastPortfolioRefresh > 3000) {
        console.log('[TopBar][I10-FIX] Price update - refreshing portfolio summary (throttled)');
        queryClient.invalidateQueries({ queryKey: ['/api/active-engine/portfolio-summary'] });
        setLastPortfolioRefresh(now);
      }
    }
  }, [wsMessages, queryClient, currentMode, lastPortfolioRefresh]);

  // Phase 27.F.14.N: Listen for trading_data_updated events to refresh trading tabs
  useEffect(() => {
    const tradingDataUpdates = wsMessages.filter((msg: any) => msg.type === 'trading_data_updated');
    if (tradingDataUpdates.length > 0) {
      const latestUpdate = tradingDataUpdates[tradingDataUpdates.length - 1];
      console.log('[Phase-27.F.14.N][TradingSync] Received trading_data_updated event:', latestUpdate);
      
      // Invalidate all trading-related queries for immediate cross-session sync
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/filtered-pairs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trading-signals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/filters/diagnostics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trading/status'] });
      
      console.log('[Phase-27.F.14.N][TradingSync] ✅ Trading queries invalidated for mode:', latestUpdate.payload?.mode);
    }
  }, [wsMessages, queryClient]);

  // Phase 32.D-Fix.5: Force UI re-render when active state changes
  useEffect(() => {
    if (tradingStatus?.isEngineActivePaper || activeEngineStatus?.isRunning) {
      console.log('[32.D-Fix.5] Detected active trading → refreshing dependent widgets');
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/overview'] });
      queryClient.invalidateQueries({ queryKey: ['/api/goals/summary'] });
    }
  }, [tradingStatus?.isEngineActivePaper, activeEngineStatus?.isRunning, queryClient]);

  // P19-B8.1: the seven trading-control handlers (toggle, continue/new
  // simulation, live confirm/stop, balance confirm, mode change) moved to
  // PaperTradingControls with the toggle; live-mode handlers return with
  // the Phase-21 live-controls build.

  return (
    <header 
      className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border"
      data-testid="top-bar"
    >
      <div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-4">
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Mobile Menu Toggle — always visible, never pushed off-screen */}
          {showMenuButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMenuClick}
              className="lg:hidden p-1.5 sm:p-2 hover:bg-muted shrink-0 relative z-[60]"
              data-testid="button-menu"
            >
              <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
            </Button>
          )}
          
          {/* P19-B8.1: the trading toggle, LIVE/PAPER mode selector, and
              passive-learning chip MOVED off the top bar — start/stop lives
              inside each mode page (PaperTradingControls on Paper Trading;
              Live controls arrive with Phase 21; the VTS page carries the
              always-on passive-learning badge). The top bar keeps only
              mode-neutral display: menu, clocks, and (until B8.3 relocates it
              with the three-balances labeling) the portfolio metrics strip. */}
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
          
        </div>
      </div>
      
      {/* Phase 8.8.3-I9 Part B: Portfolio Metrics Row (Paper Mode Only) */}
      {currentMode === 'paper' && portfolioData && (
        <div className="flex items-center justify-center gap-4 md:gap-8 px-3 sm:px-6 py-2 bg-primary/5 border-t border-primary/10">
          <div className="flex items-center gap-1 text-xs md:text-sm">
            <span className="text-muted-foreground">Starting:</span>
            <span className="font-mono font-semibold">${portfolioData.startingBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex items-center gap-1 text-xs md:text-sm">
            <span className="text-muted-foreground">Current:</span>
            <span className="font-mono font-semibold">
              ${portfolioData.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs md:text-sm">
            <span className="text-muted-foreground">Net P/L:</span>
            <span className={cn(
              "font-mono font-bold",
              portfolioData.netPnl >= 0 ? "text-green-600" : "text-red-600"
            )}>
              {portfolioData.netPnl >= 0 ? '+' : ''}${portfolioData.netPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-xs md:text-sm">
            <span className="text-muted-foreground">P/L %:</span>
            <span className={cn(
              "font-mono font-bold",
              portfolioData.netPnlPercent >= 0 ? "text-green-600" : "text-red-600"
            )}>
              {portfolioData.netPnlPercent >= 0 ? '+' : ''}{portfolioData.netPnlPercent.toFixed(2)}%
            </span>
          </div>
          <div className="hidden md:flex items-center gap-1 text-xs md:text-sm">
            <span className="text-muted-foreground">Positions:</span>
            <span className="font-mono font-semibold">${portfolioData.totalPositionValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex items-center gap-1 text-xs md:text-sm">
            <span className="text-muted-foreground">Open Trades/Slots Available:</span>
            <span className="font-mono font-semibold">{portfolioData.openTradesCount ?? 0} / {portfolioData.slotsAvailable ?? 0}</span>
          </div>
        </div>
      )}

      {/* P19-B8.1: the trading-control modals moved with the toggle —
          SimulationStartupModal + ConfirmBalanceModal now mount inside
          PaperTradingControls on the Paper Trading page; the two live-mode
          confirm modals are unmounted until the Phase-21 live-controls build
          re-homes them on the Live Trading page. */}
    </header>
  );
}
