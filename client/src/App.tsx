import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import History from "@/pages/history";
import Analysis from "@/pages/analysis";
import Settings from "@/pages/settings";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import AIAssistant from "@/components/ai/ai-assistant";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import NotFound from "@/pages/not-found";

function Router() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

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
          <Route path="/history" component={History} />
          <Route path="/analysis" component={Analysis} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </main>
      
      <AIAssistant />
      
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
      <TooltipProvider>
        <div className="min-h-screen bg-background text-foreground">
          <Toaster />
          <Router />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
