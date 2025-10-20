import { useState } from "react";
import ActiveTrades from "@/components/trading/active-trades";
import Watchlist from "@/components/trading/watchlist";
import MaintenanceBanner from "@/components/maintenance/maintenance-banner";
import ModeBanner from "@/components/mode-banner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, TrendingUp, Filter, Lightbulb } from "lucide-react";
import { FilterHealthWidget } from "@/components/dashboard/filter-health-widget";
import { FilterInsights } from "@/components/trading/filter-insights";

function FilteredPairsTab() {
  return (
    <div className="space-y-4">
      <FilterHealthWidget />
      <Card>
        <CardContent className="py-8 text-center">
          <Filter className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">Filtered Pairs</h3>
          <p className="text-muted-foreground">
            Symbols that passed screening filters will appear here
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TradingPage() {
  const [activeTab, setActiveTab] = useState("open");

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="trading-page">
      {/* Maintenance Mode Banner */}
      <MaintenanceBanner />
      
      {/* Trading Mode Banner */}
      <ModeBanner />

      <div>
        <h1 className="text-3xl font-bold mb-2">Trading</h1>
        <p className="text-muted-foreground">
          Manage open positions, view ready-to-buy signals, and monitor filtered pairs
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4" data-testid="trading-tabs">
          <TabsTrigger value="open" className="flex items-center gap-2" data-testid="tab-open-trades">
            <BarChart3 className="w-4 h-4" />
            Open Trades
          </TabsTrigger>
          <TabsTrigger value="ready" className="flex items-center gap-2" data-testid="tab-ready-to-buy">
            <TrendingUp className="w-4 h-4" />
            Ready to Buy
          </TabsTrigger>
          <TabsTrigger value="filtered" className="flex items-center gap-2" data-testid="tab-filtered-pairs">
            <Filter className="w-4 h-4" />
            Filtered Pairs
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-2" data-testid="tab-filter-insights">
            <Lightbulb className="w-4 h-4" />
            Filter Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-6">
          <ActiveTrades />
        </TabsContent>

        <TabsContent value="ready" className="mt-6">
          <Watchlist />
        </TabsContent>

        <TabsContent value="filtered" className="mt-6">
          <FilteredPairsTab />
        </TabsContent>

        <TabsContent value="insights" className="mt-6">
          <FilterInsights />
        </TabsContent>
      </Tabs>
    </div>
  );
}
