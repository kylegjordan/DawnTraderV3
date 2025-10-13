import { cn } from "@/lib/utils";

interface AchievementPillProps {
  percent: number | null;
  className?: string;
}

export function AchievementPill({ percent, className }: AchievementPillProps) {
  if (percent === null || percent === undefined) {
    return (
      <span className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border border-border",
        "bg-muted text-muted-foreground",
        className
      )}
      data-testid="achievement-pill">
        —
      </span>
    );
  }

  const getColorClasses = () => {
    if (percent >= 100) {
      return "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700";
    }
    if (percent >= 80) {
      return "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700";
    }
    return "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700";
  };

  return (
    <span 
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border",
        getColorClasses(),
        className
      )}
      data-testid="achievement-pill"
    >
      {percent.toFixed(1)}%
    </span>
  );
}
