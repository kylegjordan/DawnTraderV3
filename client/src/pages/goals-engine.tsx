import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GoalsEngineTab from "@/components/goals/goals-engine-tab";
import PortfolioTab from "@/components/goals/portfolio-tab";
import GuardrailsTab from "@/components/goals/guardrails-tab";
import ScreenerFiltersTab from "@/components/goals/screener-filters-tab";
import StrategiesTab from "@/components/goals/strategies-tab";
import ModeBanner from "@/components/mode-banner";
import { Target, PieChart, Shield, Filter, Layers } from "lucide-react";

export default function GoalsEnginePage() {
  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="goals-engine-page">
      {/* Trading Mode Banner */}
      <ModeBanner />
      
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Goals Engine</h1>
        <p className="text-muted-foreground text-sm">
          Set and manage your trading goals with AI-assisted recommendations
        </p>
      </div>

      <Tabs defaultValue="goals" className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-auto gap-1 bg-muted p-1">
          <TabsTrigger 
            value="goals" 
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 data-[state=active]:bg-background"
            data-testid="tab-goals-engine"
          >
            <Target className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Goals</span>
          </TabsTrigger>
          <TabsTrigger 
            value="portfolio" 
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 data-[state=active]:bg-background"
            data-testid="tab-portfolio"
          >
            <PieChart className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Portfolio</span>
          </TabsTrigger>
          <TabsTrigger 
            value="guardrails" 
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 data-[state=active]:bg-background"
            data-testid="tab-guardrails"
          >
            <Shield className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Guardrails</span>
          </TabsTrigger>
          <TabsTrigger 
            value="screener" 
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 data-[state=active]:bg-background"
            data-testid="tab-screener"
          >
            <Filter className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Screener</span>
          </TabsTrigger>
          <TabsTrigger 
            value="strategies" 
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 data-[state=active]:bg-background"
            data-testid="tab-strategies"
          >
            <Layers className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Strategies</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="goals" className="mt-6">
          <GoalsEngineTab />
        </TabsContent>

        <TabsContent value="portfolio" className="mt-6">
          <PortfolioTab />
        </TabsContent>

        <TabsContent value="guardrails" className="mt-6">
          <GuardrailsTab />
        </TabsContent>

        <TabsContent value="screener" className="mt-6">
          <ScreenerFiltersTab />
        </TabsContent>

        <TabsContent value="strategies" className="mt-6">
          <StrategiesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
