import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers } from "lucide-react";

interface Strategy {
  name: string;
  description: string;
  enabled: boolean;
  parameters: { key: string; value: string }[];
}

const strategies: Strategy[] = [
  {
    name: "VWAP Pullback",
    description: "Entry when price pulls back to VWAP with momentum confirmation",
    enabled: true,
    parameters: [
      { key: "VWAP Period", value: "20" },
      { key: "Pullback %", value: "0.5%" },
      { key: "Volume Threshold", value: "1.5x avg" },
      { key: "Risk/Reward", value: "1:2" },
    ],
  },
  {
    name: "ABCD Long",
    description: "Classic ABCD pattern with Fibonacci retracement levels",
    enabled: true,
    parameters: [
      { key: "Fib Level", value: "0.618" },
      { key: "Min R-Multiple", value: "2" },
      { key: "Volume Confirmation", value: "Yes" },
      { key: "Risk/Reward", value: "1:3" },
    ],
  },
  {
    name: "SMA Trend Ride",
    description: "Trend following strategy using moving average crossovers",
    enabled: true,
    parameters: [
      { key: "Fast SMA", value: "10" },
      { key: "Slow SMA", value: "50" },
      { key: "Trend Filter", value: "200 SMA" },
      { key: "Risk/Reward", value: "1:2.5" },
    ],
  },
];

export default function StrategiesTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="w-5 h-5" />
          Trading Strategies Configuration
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          All configured trading strategies with their current variables
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {strategies.map((strategy, index) => (
            <Card key={index} className="border-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{strategy.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {strategy.description}
                    </p>
                  </div>
                  <Badge variant={strategy.enabled ? "default" : "secondary"}>
                    {strategy.enabled ? "Active" : "Disabled"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {strategy.parameters.map((param, pIndex) => (
                    <div key={pIndex} className="space-y-1">
                      <div className="text-xs text-muted-foreground">{param.key}</div>
                      <div className="text-sm font-mono font-semibold">{param.value}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="p-4 bg-muted/50 rounded-lg mt-6">
            <p className="text-sm text-muted-foreground">
              <Layers className="w-4 h-4 inline mr-2" />
              The AI proposes and applies variable changes tied to goal achievement when you discuss strategies in the Goals tab
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
