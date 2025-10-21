import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface WalterAction {
  id: string;
  detectedAt: string;
  affectedComponent: string;
  detectedAnomaly: string;
  resolutionNotes: string;
  confidenceScore: string;
  contextData: {
    autoResolved?: boolean;
    confidence?: number;
    [key: string]: any;
  };
}

interface RecentActionsTimelineProps {
  source: 'feed' | 'formula';
  maxItems?: number;
}

export function RecentActionsTimeline({ source, maxItems = 5 }: RecentActionsTimelineProps) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const mode = user.tradingMode || 'paper';

  const { data, isLoading } = useQuery<{ ok: boolean; actions: WalterAction[]; count: number }>({
    queryKey: ['/api/walter/actions', { mode, source, status: 'completed', limit: maxItems }],
    enabled: !!user?.id,
    refetchInterval: 60000, // Refresh every minute
  });

  const autoResolvedActions = data?.actions.filter(
    action => action.contextData?.autoResolved === true
  ) || [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Recent Auto-Resolutions</h3>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (autoResolvedActions.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Recent Auto-Resolutions</h3>
        <div className="text-sm text-muted-foreground text-center py-4">
          No auto-resolutions in the last 24 hours
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Recent Auto-Resolutions</h3>
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {autoResolvedActions.map((action) => {
          const confidence = action.contextData?.confidence || parseFloat(action.confidenceScore || '0') * 100;
          
          return (
            <div
              key={action.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              data-testid={`auto-resolve-${action.id}`}
            >
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
              </div>
              
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {action.affectedComponent}
                  </p>
                  <Badge 
                    variant="outline" 
                    className="text-xs flex-shrink-0"
                    data-testid={`confidence-${action.id}`}
                  >
                    {confidence.toFixed(0)}% confidence
                  </Badge>
                </div>
                
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {action.detectedAnomaly} → Resolved
                </p>
                
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span data-testid={`time-${action.id}`}>
                    {formatDistanceToNow(new Date(action.detectedAt))} ago
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
