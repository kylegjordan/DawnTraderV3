import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import History from "@/pages/history";
import Analysis from "@/pages/analysis";
import Settings from "@/pages/settings";
import WatchlistPage from "@/pages/watchlist";
import KillSwitchScreen from "@/pages/kill-switch";
import ReportsPage from "@/pages/reports";
import DailyBriefPage from "@/pages/daily-brief";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import NotFound from "@/pages/not-found";
import { TradingModeProvider } from "@/contexts/trading-mode-context";

function Router() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  const [location, setLocation] = useLocation();
  
  // Check kill switch status and auto-redirect
  const { data: settings } = useQuery<{ tradingSuspended?: boolean }>({
    queryKey: ['/api/settings'],
    refetchInterval: 5000 // Check every 5 seconds
  });
  
  useEffect(() => {
    const allowedPaths = ['/kill-switch', '/settings'];
    if (settings?.tradingSuspended && !allowedPaths.includes(location)) {
      setLocation('/kill-switch');
    }
  }, [settings, location, setLocation]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        className={`${isMobile ? 'fixed z-40' : 'relative'}`}
      />
      
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <TopBar 
          onMenuClick={() => setSidebarOpen(true)}
          showMenuButton={isMobile}
        />
        
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/watchlist" component={WatchlistPage} />
          <Route path="/history" component={History} />
          <Route path="/reports" component={ReportsPage} />
          <Route path="/daily-brief" component={DailyBriefPage} />
          <Route path="/analysis" component={Analysis} />
          <Route path="/settings" component={Settings} />
          <Route path="/kill-switch" component={KillSwitchScreen} />
          <Route component={NotFound} />
        </Switch>
      </main>
      
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TradingModeProvider>
        <TooltipProvider>
          <div className="min-h-screen bg-background text-foreground">
            <Toaster />
            <Router />
          </div>
        </TooltipProvider>
      </TradingModeProvider>
    </QueryClientProvider>
  );
}

export default App;
