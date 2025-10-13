import { useTradingMode } from "@/contexts/trading-mode-context";
import { cn } from "@/lib/utils";
import { Beaker, Activity } from "lucide-react";

export default function ModeBanner() {
  const { mode, isLive, isPaper } = useTradingMode();

  return (
    <div
      className={cn(
        "px-4 py-2 rounded-lg border transition-all duration-300",
        isLive && "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
        isPaper && "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400"
      )}
      data-testid="mode-banner"
    >
      <div className="flex items-center gap-2 justify-center">
        {isLive && (
          <>
            <Activity className="w-4 h-4" />
            <span className="text-sm font-semibold">Live Trading Mode</span>
            <span className="text-xs opacity-70">• Real capital at risk</span>
          </>
        )}
        {isPaper && (
          <>
            <Beaker className="w-4 h-4" />
            <span className="text-sm font-semibold">Paper Trading Mode</span>
            <span className="text-xs opacity-70">• Simulated trading • No real money</span>
          </>
        )}
      </div>
    </div>
  );
}
