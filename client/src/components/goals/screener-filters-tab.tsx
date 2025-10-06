import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Filter } from "lucide-react";

export default function ScreenerFiltersTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="w-5 h-5" />
          Screener Filters Configuration
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Active filters used to identify trade opportunities
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Volume Filters</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Minimum 24h volume: $1M</li>
                <li>• Average volume ratio: 1.5x</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Price Filters</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Price range: $0.01 - $100,000</li>
                <li>• Minimum liquidity: $500K</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Volatility Filters</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• ATR threshold: 2%</li>
                <li>• Max spread: 0.5%</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Technical Filters</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• RSI range: 30-70</li>
                <li>• MACD crossover detection</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Risk Filters</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Max R-multiple: 3</li>
                <li>• Stop loss range: 1-5%</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Market Filters</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Trading hours: 24/7</li>
                <li>• Excluded pairs: Stable/Stable</li>
              </ul>
            </div>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <Filter className="w-4 h-4 inline mr-2" />
              The AI can adjust screener parameters to align with goal strategy (e.g., higher return focus vs. safer consistency)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
