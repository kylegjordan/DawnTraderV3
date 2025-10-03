import { Menu, Bell, Download, Clock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useTrading } from "@/hooks/use-trading";
import { useMarket } from "@/hooks/use-trading";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getCurrentTimeUTC, getCurrentTimeLocal, getTimezoneAbbr } from "@/lib/timezone";

interface TopBarProps {
  onMenuClick: () => void;
  showMenuButton?: boolean;
}

export default function TopBar({ onMenuClick, showMenuButton = false }: TopBarProps) {
  const { 
    tradingStatus, 
    startTrading, 
    stopTrading, 
    isStarting, 
    isStopping 
  } = useTrading();
  const { exportTrades, isExporting } = useMarket();
  const { toast } = useToast();
  const [utcTime, setUtcTime] = useState<string>('');
  const [localTime, setLocalTime] = useState<string>('');
  const [localTzAbbr, setLocalTzAbbr] = useState<string>('');

  // Fetch user settings for timezone and time format
  const { data: settings } = useQuery({ 
    queryKey: ['/api/settings'],
  });

  // Update dual time display (UTC + Local)
  useEffect(() => {
    const updateTime = () => {
      const timezone = settings?.timezone || 'Asia/Dubai';
      const timeFormat = settings?.timeFormat || '12hr';
      
      // Update UTC time
      setUtcTime(getCurrentTimeUTC());
      
      // Update local time with timezone abbreviation
      setLocalTime(getCurrentTimeLocal(timezone, timeFormat));
      setLocalTzAbbr(getTimezoneAbbr(timezone));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [settings?.timezone, settings?.timeFormat]);

  const handleTradingToggle = async (enabled: boolean) => {
    try {
      if (enabled) {
        const mode = tradingStatus?.tradingMode || 'paper';
        await startTrading(mode);
        toast({
          title: "Trading Started",
          description: `Trading engine started in ${mode} mode`,
        });
      } else {
        await stopTrading();
        toast({
          title: "Trading Stopped",
          description: "Trading engine has been stopped",
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
    }
  };

  const handleModeChange = (mode: 'live' | 'paper') => {
    if (tradingStatus?.tradingStatus === 'active') {
      toast({
        title: "Stop Trading First",
        description: "Stop trading before changing modes",
        variant: "destructive",
      });
      return;
    }
    
    startTrading(mode);
  };

  const handleExport = () => {
    exportTrades({ format: 'csv' });
    toast({
      title: "Export Started",
      description: "Your trading data export will download shortly",
    });
  };

  const isActive = tradingStatus?.tradingStatus === 'active';
  const currentMode = tradingStatus?.tradingMode || 'paper';

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
                disabled={isStarting || isStopping}
                className="data-[state=checked]:bg-success"
                data-testid="switch-trading"
              />
              <div className="flex items-center gap-1">
                <span className={`status-dot ${isActive ? 'active' : 'inactive'}`} />
                <span className={`text-xs font-semibold ${isActive ? 'text-success' : 'text-muted-foreground'}`}>
                  {isActive ? 'ACTIVE' : 'STOPPED'}
                </span>
              </div>
            </div>
            
            {/* Mode Toggle */}
            <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
              <Button
                variant={currentMode === 'live' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleModeChange('live')}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded h-auto",
                  currentMode === 'live' 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
                data-testid="button-live-mode"
              >
                LIVE
              </Button>
              <Button
                variant={currentMode === 'paper' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleModeChange('paper')}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded h-auto",
                  currentMode === 'paper' 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
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
                  {utcTime}
                </span>
              </div>
            </div>
            
            {/* Local Time */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-md border border-primary/20">
              <Clock className="w-4 h-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-[10px] text-primary leading-none">{localTzAbbr}</span>
                <span className="text-sm font-mono text-foreground leading-tight" data-testid="text-local-time">
                  {localTime}
                </span>
              </div>
            </div>
          </div>
          
          {/* Notifications */}
          <Button
            variant="ghost"
            size="sm"
            className="relative p-2 hover:bg-muted"
            data-testid="button-notifications"
          >
            <Bell className="w-5 h-5 text-foreground" />
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 w-2 h-2 p-0 rounded-full"
            />
          </Button>
          
          {/* CSV Export */}
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="button-export"
          >
            <Download className="w-4 h-4" />
            <span className="hidden md:inline">Export CSV</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
