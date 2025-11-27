import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GoalsEngineTab from "@/components/goals/goals-engine-tab";
import GuardrailsTab from "@/components/goals/guardrails-tab";
import ScreenerFiltersTab from "@/components/goals/screener-filters-tab";
import StrategiesTab from "@/components/goals/strategies-tab";
import CoherencyRulesTab from "@/components/goals/coherency-rules-tab";
import WalterPurposeTab from "@/components/goals/walter-purpose-tab";
import TuningTab from "@/components/goals/tuning-tab";
import { CoreFourGuardrails } from "@/components/goals/core-four-guardrails";
import { FiltersWithOverride } from "@/components/goals/filters-with-override";
import { PresetsGrid } from "@/components/goals/presets-grid";
import ModeBanner from "@/components/mode-banner";
import { Target, Shield, Filter, Layers, CheckSquare, Lightbulb, Settings } from "lucide-react";

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
        <TabsList className="grid w-full grid-cols-7 h-auto gap-1 bg-muted p-1">
          <TabsTrigger 
            value="goals" 
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 data-[state=active]:bg-background"
            data-testid="tab-goals-engine"
          >
            <Target className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Goals</span>
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
            <span className="text-xs sm:text-sm">Screeners</span>
          </TabsTrigger>
          <TabsTrigger 
            value="strategies" 
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 data-[state=active]:bg-background"
            data-testid="tab-strategies"
          >
            <Layers className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Strategies</span>
          </TabsTrigger>
          <TabsTrigger 
            value="coherency" 
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 data-[state=active]:bg-background"
            data-testid="tab-coherency-rules"
          >
            <CheckSquare className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Coherency</span>
          </TabsTrigger>
          <TabsTrigger 
            value="purpose" 
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 data-[state=active]:bg-background"
            data-testid="tab-walter-purpose"
          >
            <Lightbulb className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Purpose</span>
          </TabsTrigger>
          <TabsTrigger 
            value="tuning" 
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 data-[state=active]:bg-background"
            data-testid="tab-tuning"
          >
            <Settings className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Tuning</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="goals" className="mt-6">
          <div className="space-y-6">
            <PresetsGrid />
            <GoalsEngineTab />
          </div>
        </TabsContent>

        <TabsContent value="guardrails" className="mt-6">
          <CoreFourGuardrails />
        </TabsContent>

        <TabsContent value="screener" className="mt-6">
          <div className="space-y-6">
            <FiltersWithOverride />
            {/* Phase 27.F.34: Screener Filters Configuration hidden - only Filter Automation Control visible */}
            {/* REB 2.9 ROLLBACK: Component preserved intact for REB 2.9B restoration */}
            {/* <ScreenerFiltersTab /> */}
          </div>
        </TabsContent>

        <TabsContent value="strategies" className="mt-6">
          <StrategiesTab />
        </TabsContent>

        <TabsContent value="coherency" className="mt-6">
          <CoherencyRulesTab />
        </TabsContent>

        <TabsContent value="purpose" className="mt-6">
          <WalterPurposeTab />
        </TabsContent>

        <TabsContent value="tuning" className="mt-6">
          <TuningTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
