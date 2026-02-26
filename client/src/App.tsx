import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
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
import NotFound from "@/pages/not-found";
import { TradingModeProvider } from "@/contexts/trading-mode-context";
import { RequestTraceProvider } from "@/hooks/use-request-trace";
import { ensureValidToken } from "@/lib/auth";
// Directive 12.2.3: WalterFloatingAssistant import removed (file deleted in Batch 6)
import { ProfiledRoute } from "@/components/profiled-route";
import { AlertTriangle, X } from "lucide-react";

const Settings = lazy(() => import("@/pages/settings"));
// Directive 12.2.3: WalterPage lazy import removed (file deleted in Batch 6)
const WatchlistPage = lazy(() => import("@/pages/watchlist"));
const ActiveTradesPage = lazy(() => import("@/pages/active-trades"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const DailyBriefPage = lazy(() => import("@/pages/daily-brief"));
const BriefingsPage = lazy(() => import("@/pages/briefings"));
const GoalsEnginePage = lazy(() => import("@/pages/goals-engine"));
const SystemsPage = lazy(() => import("@/pages/systems"));
const AITransparencyPage = lazy(() => import("@/pages/ai-transparency"));
const SystemConfigPage = lazy(() => import("@/pages/system-config"));
const FilterInsightsPage = lazy(() => import("@/pages/filter-insights"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const MachineLearningPage = lazy(() => import("@/pages/machine-learning"));

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

interface KillSwitchBannerProps {
  dailyLossLimit: number;
  onDismiss: () => void;
}

function KillSwitchBanner({ dailyLossLimit, onDismiss }: KillSwitchBannerProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground px-4 py-3 shadow-lg" data-testid="kill-switch-banner">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div>
            <span className="font-semibold">Kill Switch Triggered</span>
            <span className="hidden sm:inline ml-2">—</span>
            <span className="hidden sm:inline ml-2">
              Your portfolio exceeded the Daily Loss Kill Switch limit of {dailyLossLimit}%. Trading has been stopped.
            </span>
            <span className="sm:hidden block text-sm opacity-90">
              Trading stopped. Toggle trading ON to resume.
            </span>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 hover:bg-destructive-foreground/10 rounded-full transition-colors"
          aria-label="Dismiss banner"
          data-testid="kill-switch-banner-dismiss"
        >
          <X className="w-5 h-5" />
        </button>
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

// Directive 12.2.3: getPageContext function removed — was Walter-only (Batch 6)

function Router() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [killSwitchBannerDismissed, setKillSwitchBannerDismissed] = useState(false);
  const isMobile = useIsMobile();
  const [location] = useLocation();
  
  // REB 8.8.3-KS-FINAL: Check kill switch status for banner display
  const { data: settings } = useQuery<{ killSwitchTripped?: boolean; dailyLossKillSwitch?: number }>({
    queryKey: ['/api/settings'],
    refetchInterval: 15000,
    staleTime: 15000,
    refetchOnWindowFocus: false
  });
  
  // Reset banner dismissal when kill switch trips again
  useEffect(() => {
    if (settings?.killSwitchTripped) {
      setKillSwitchBannerDismissed(false);
    }
  }, [settings?.killSwitchTripped]);
  
  const showKillSwitchBanner = settings?.killSwitchTripped && !killSwitchBannerDismissed;

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
      {/* REB 8.8.3-KS-FINAL: Kill Switch Banner - Option A UX */}
      {showKillSwitchBanner && (
        <KillSwitchBanner 
          dailyLossLimit={settings?.dailyLossKillSwitch || 15}
          onDismiss={() => setKillSwitchBannerDismissed(true)}
        />
      )}
      <div className={`flex h-screen overflow-hidden bg-background ${showKillSwitchBanner ? 'pt-12' : ''}`}>
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
              {/* Phase 35.1 - Profiled Routes for Performance Monitoring */}
              <Route path="/">
                {() => <ProfiledRoute id="Dashboard" component={Dashboard} />}
              </Route>
              <Route path="/dashboard">
                {() => <ProfiledRoute id="Dashboard" component={Dashboard} />}
              </Route>
              <Route path="/active-trades">
                {() => <ProfiledRoute id="Trading" component={ActiveTradesPage} />}
              </Route>
              <Route path="/systems">
                {() => <ProfiledRoute id="Analytics" component={SystemsPage} />}
              </Route>
              
              {/* Standard Routes (no profiling) */}
              {/* Directive 12.2.3: /walter route removed (Batch 6) */}
              <Route path="/watchlist" component={WatchlistPage} />
              <Route path="/reports" component={ReportsPage} />
              <Route path="/daily-brief" component={DailyBriefPage} />
              <Route path="/briefings" component={BriefingsPage} />
              <Route path="/goals-engine" component={GoalsEnginePage} />
              <Route path="/ai-transparency" component={AITransparencyPage} />
              <Route path="/analytics" component={AnalyticsPage} />
              <Route path="/machine-learning" component={MachineLearningPage} />
              <Route path="/insights" component={FilterInsightsPage} />
              <Route path="/settings" component={Settings} />
              <Route path="/system/config" component={SystemConfigPage} />
              <Route path="/:rest*">
                <Redirect to="/" />
              </Route>
            </Switch>
          </Suspense>
        </main>
        
        {isMobile && sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        {/* Directive 12.2.3: Floating Walter Assistant removed (Batch 6) */}
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
