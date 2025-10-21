import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, TrendingUp } from 'lucide-react';
import { Link } from 'wouter';

interface AutoResolvedStats {
  total: number;
  feed: number;
  formula: number;
}

export function AutoResolvedWidget() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  const { data, isLoading } = useQuery<AutoResolvedStats>({
    queryKey: ['/api/walter/auto-resolved-today'],
    enabled: !!user?.id,
    refetchInterval: 30000, // Refresh every 30s
  });

  if (isLoading || !data) {
    return (
      <Card data-testid="auto-resolved-widget" className="hover:shadow-md transition-shadow">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm text-muted-foreground truncate">Auto-Resolved Today</p>
              <p className="text-xl sm:text-2xl font-bold text-foreground">--</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Link href="/ai-transparency">
      <Card 
        data-testid="auto-resolved-widget" 
        className="cursor-pointer hover:shadow-lg transition-all hover:border-green-500 dark:hover:border-green-400"
      >
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Auto-Resolved Today</p>
                <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400" data-testid="auto-resolved-count">
                  {data.total}
                </p>
              </div>
            </div>

            {/* Breakdown */}
            {data.total > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {data.feed > 0 && (
                  <Badge variant="outline" className="text-xs" data-testid="auto-resolved-feed-count">
                    {data.feed} Feed
                  </Badge>
                )}
                {data.formula > 0 && (
                  <Badge variant="outline" className="text-xs" data-testid="auto-resolved-formula-count">
                    {data.formula} Formula
                  </Badge>
                )}
              </div>
            )}

            {/* Call to Action */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="w-3 h-3" />
              <span>View in AI Transparency</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
