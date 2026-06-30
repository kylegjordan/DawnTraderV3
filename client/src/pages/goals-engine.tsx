import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StrategiesTab from "@/components/goals/strategies-tab";
import CoherencyRulesTab from "@/components/goals/coherency-rules-tab";
import DiagnosticsTab from "@/components/goals/diagnostics-tab";
import { CoreFourGuardrails } from "@/components/goals/core-four-guardrails";
import { FiltersWithOverride } from "@/components/goals/filters-with-override";
import ModeBanner from "@/components/mode-banner";
import { Shield, Filter, Layers, CheckSquare, Activity } from "lucide-react";

export default function GoalsEnginePage() {
  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="goals-engine-page">
      {/* Trading Mode Banner */}
      <ModeBanner />
      
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Guardrails & Filters</h1>
        <p className="text-muted-foreground text-sm">
          Configure trading guardrails, filters, and strategy parameters
        </p>
      </div>

      {/* Directive 11.8B-C2: Purpose tab removed; strategy presets decommissioned */}
      <Tabs defaultValue="guardrails" className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-auto gap-1 bg-muted p-1">
          <TabsTrigger 
            value="guardrails" 
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 data-[state=active]:bg-background"
            data-testid="tab-guardrails"
          >
            <Shield className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Paper Guardrails</span>
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
            value="diagnostics" 
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 data-[state=active]:bg-background"
            data-testid="tab-diagnostics"
          >
            <Activity className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Diagnostics</span>
          </TabsTrigger>
          <TabsTrigger 
            value="coherency" 
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 data-[state=active]:bg-background"
            data-testid="tab-coherency-rules"
          >
            <CheckSquare className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Coherency</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guardrails" className="mt-6">
          <div className="space-y-6">
            <CoreFourGuardrails mode="paper" />
            {/* Directive 11.8B-C: LPCP hidden (backend preserved) */}
            {/* P19-B6.8a: this tab is pinned to PAPER. A "Live Guardrails" tab
                (<CoreFourGuardrails mode="live" />) will be added per Kyle 2026-06-30. */}
          </div>
        </TabsContent>

        <TabsContent value="screener" className="mt-6">
          <div className="space-y-6">
            <FiltersWithOverride />
          </div>
        </TabsContent>

        <TabsContent value="strategies" className="mt-6">
          <StrategiesTab />
        </TabsContent>

        <TabsContent value="diagnostics" className="mt-6">
          <DiagnosticsTab />
        </TabsContent>

        <TabsContent value="coherency" className="mt-6">
          <CoherencyRulesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
