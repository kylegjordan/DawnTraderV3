import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Activity, ExternalLink } from 'lucide-react';

interface SystemHealthSummaryResponse {
  ok: boolean;
  timestamp: string;
  summary: {
    feedHealthIssuesDetected: number;
    feedHealthIssuesResolved: number;
    formulaHealthIssuesDetected: number;
    formulaHealthIssuesResolved: number;
  };
}

export default function SystemHealthSummary() {
  const { data, isLoading } = useQuery<SystemHealthSummaryResponse>({
    queryKey: ['/api/system/health-summary'],
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
    staleTime: 4 * 60 * 1000, // Consider data stale after 4 minutes
  });

  if (isLoading || !data?.ok) {
    return null;
  }

  const { summary } = data;

  return (
    <div 
      className="border-t border-border/50 pt-4 mt-6"
      data-testid="system-health-summary"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Activity className="h-4 w-4" />
          System Activity (Today)
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
        {/* Feed Health Issues Detected */}
        <div 
          className="flex flex-col"
          data-testid="metric-feed-detected"
        >
          <span className="text-xs text-muted-foreground mb-1">
            Feed Issues Detected
          </span>
          <span className="text-2xl font-semibold text-amber-600 dark:text-amber-500">
            {summary.feedHealthIssuesDetected}
          </span>
        </div>

        {/* Feed Health Issues Resolved */}
        <div 
          className="flex flex-col"
          data-testid="metric-feed-resolved"
        >
          <span className="text-xs text-muted-foreground mb-1">
            Feed Issues Resolved
          </span>
          <span className="text-2xl font-semibold text-emerald-600 dark:text-emerald-500">
            {summary.feedHealthIssuesResolved}
          </span>
        </div>

        {/* Formula Health Issues Detected */}
        <div 
          className="flex flex-col"
          data-testid="metric-formula-detected"
        >
          <span className="text-xs text-muted-foreground mb-1">
            Formula Issues Detected
          </span>
          <span className="text-2xl font-semibold text-amber-600 dark:text-amber-500">
            {summary.formulaHealthIssuesDetected}
          </span>
        </div>

        {/* Formula Health Issues Resolved */}
        <div 
          className="flex flex-col"
          data-testid="metric-formula-resolved"
        >
          <span className="text-xs text-muted-foreground mb-1">
            Formula Issues Resolved
          </span>
          <span className="text-2xl font-semibold text-emerald-600 dark:text-emerald-500">
            {summary.formulaHealthIssuesResolved}
          </span>
        </div>
      </div>

      {/* Footer Link */}
      <Link 
        href="/ai-transparency"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        data-testid="link-view-details"
      >
        View Details in AI Command Center
        <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}
