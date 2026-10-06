import { useTradingMode } from "@/contexts/trading-mode-context";
import { useTrading } from "@/hooks/use-trading";
import { cn } from "@/lib/utils";
import { Beaker, Activity, PlayCircle, PauseCircle } from "lucide-react";

// B-LIVE-BANNER-ACTIVE-HOTFIX (#1160): ACTIVE/STOPPED is the engine OF THE MODE SHOWN — the per-mode flag,
// never the mode-agnostic `active` (which made the Live banner say ACTIVE while only paper ran).
export default function ModeBanner() {
  const { mode, isLive, isPaper } = useTradingMode();
  const { isTradingActivePaper, isTradingActiveLive } = useTrading();

  const isActive = mode === 'live' ? isTradingActiveLive : isTradingActivePaper;

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
            <span className="mx-2 text-xs opacity-50">|</span>
            {isActive ? (
              <>
                <PlayCircle className="w-3 h-3" />
                <span className="text-xs font-semibold">ACTIVE</span>
              </>
            ) : (
              <>
                <PauseCircle className="w-3 h-3 opacity-50" />
                <span className="text-xs font-semibold opacity-50">STOPPED</span>
              </>
            )}
          </>
        )}
        {isPaper && (
          <>
            <Beaker className="w-4 h-4" />
            <div className="flex flex-col items-start">
              <span className="text-sm font-semibold">Paper Trading Mode</span>
              <div className="text-xs opacity-70">
                <span>Simulated trading</span>
                <span className="ml-2">• No real money</span>
              </div>
            </div>
            <span className="mx-2 text-xs opacity-50">|</span>
            {isActive ? (
              <>
                <PlayCircle className="w-3 h-3" />
                <span className="text-xs font-semibold">ACTIVE</span>
              </>
            ) : (
              <>
                <PauseCircle className="w-3 h-3 opacity-50" />
                <span className="text-xs font-semibold opacity-50">STOPPED</span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
