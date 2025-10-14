import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import History from "@/pages/history";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import { useState, useEffect, lazy, Suspense } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import NotFound from "@/pages/not-found";
import { TradingModeProvider } from "@/contexts/trading-mode-context";
import { RequestTraceProvider } from "@/hooks/use-request-trace";
import { ensureValidToken } from "@/lib/auth";
import WalterFloatingAssistant from "@/components/walter-floating-assistant";

const Settings = lazy(() => import("@/pages/settings"));
const WalterPage = lazy(() => import("@/pages/walter"));
const WatchlistPage = lazy(() => import("@/pages/watchlist"));
const ActiveTradesPage = lazy(() => import("@/pages/active-trades"));
const KillSwitchScreen = lazy(() => import("@/pages/kill-switch"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const DailyBriefPage = lazy(() => import("@/pages/daily-brief"));
const BriefingsPage = lazy(() => import("@/pages/briefings"));
const GoalsEnginePage = lazy(() => import("@/pages/goals-engine"));
const SystemsPage = lazy(() => import("@/pages/systems"));
const AITransparencyPage = lazy(() => import("@/pages/ai-transparency"));
const SearchPage = lazy(() => import("@/pages/search"));
const CommandCenter = lazy(() => import("@/pages/command-center"));

function LoadingFallback() {
  return (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

// Auth guard component with token refresh
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [_, setLocation] = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  
  useEffect(() => {
    const checkAuth = async () => {
      // ensureValidToken checks expiry and refreshes if needed
      const validToken = await ensureValidToken();
      
      if (!validToken) {
        setLocation("/login");
        return;
      }
      
      setIsChecking(false);
    };
    
    checkAuth();
  }, [setLocation]);
  
  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}

// Map routes to page contexts for Walter
function getPageContext(location: string): string {
  const contextMap: Record<string, string> = {
    '/': 'Dashboard',
    '/dashboard': 'Dashboard',
    '/watchlist': 'Watch List',
    '/active-trades': 'Trading',
    '/search': 'Search and Analysis',
    '/reports': 'Reports',
    '/daily-brief': 'Daily Brief',
    '/briefings': 'Briefings',
    '/goals-engine': 'Goals Engine',
    '/systems': 'System Monitoring',
    '/ai-transparency': 'AI Transparency',
    '/settings': 'Settings',
    '/command-center': 'Command Center',
    '/kill-switch': 'Kill Switch',
    '/walter': 'Walter Chat'
  };
  
  return contextMap[location] || 'Dashboard';
}

function Router() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  const [location, setLocation] = useLocation();
  
  // Check kill switch status and auto-redirect
  const { data: settings } = useQuery<{ tradingSuspended?: boolean }>({
    queryKey: ['/api/settings'],
    refetchInterval: 60000,
    staleTime: 60000,
    refetchOnWindowFocus: false
  });
  
  useEffect(() => {
    const allowedPaths = ['/kill-switch', '/settings'];
    if (settings?.tradingSuspended && !allowedPaths.includes(location)) {
      setLocation('/kill-switch');
    }
  }, [settings, location, setLocation]);

  // Check if on public routes (login/register)
  const isPublicRoute = location === '/login' || location === '/register';

  // Public routes (no auth required)
  if (isPublicRoute) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
      </Switch>
    );
  }

  // Protected routes (require auth)
  return (
    <RequireAuth>
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
          
          <Suspense fallback={<LoadingFallback />}>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/walter" component={WalterPage} />
              <Route path="/watchlist" component={WatchlistPage} />
              <Route path="/active-trades" component={ActiveTradesPage} />
              <Route path="/search" component={SearchPage} />
              <Route path="/reports" component={ReportsPage} />
              <Route path="/daily-brief" component={DailyBriefPage} />
              <Route path="/briefings" component={BriefingsPage} />
              <Route path="/goals-engine" component={GoalsEnginePage} />
              <Route path="/systems" component={SystemsPage} />
              <Route path="/ai-transparency" component={AITransparencyPage} />
              <Route path="/settings" component={Settings} />
              <Route path="/command-center" component={CommandCenter} />
              <Route path="/kill-switch" component={KillSwitchScreen} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </main>
        
        {isMobile && sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        {/* Floating Walter Assistant - appears on all pages except /walter */}
        {location !== '/walter' && (
          <WalterFloatingAssistant pageContext={getPageContext(location)} />
        )}
      </div>
    </RequireAuth>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TradingModeProvider>
        <RequestTraceProvider>
          <TooltipProvider>
            <div className="min-h-screen bg-background text-foreground">
              <Toaster />
              <Router />
            </div>
          </TooltipProvider>
        </RequestTraceProvider>
      </TradingModeProvider>
    </QueryClientProvider>
  );
}

export default App;
