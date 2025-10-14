import { Badge } from "@/components/ui/badge";
import { useTradingMode } from "@/contexts/trading-mode-context";

export function ModeIndicator() {
  const { mode } = useTradingMode();
  const isLive = mode === 'live';
  
  return (
    <Badge 
      className={
        isLive 
          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20" 
          : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:bg-purple-500/20"
      }
      data-testid={`mode-indicator-${mode}`}
    >
      {mode.toUpperCase()}
    </Badge>
  );
}
