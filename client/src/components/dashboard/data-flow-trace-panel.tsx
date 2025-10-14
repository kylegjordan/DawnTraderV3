import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRequestTrace } from "@/hooks/use-request-trace";
import { Clock, Trash2, Activity } from "lucide-react";

export function DataFlowTracePanel() {
  const { traces, clearTraces } = useRequestTrace();

  // Only show in development mode
  const isDevMode = import.meta.env.DEV;

  if (!isDevMode) {
    return null;
  }

  const recentTraces = traces.slice(0, 5);

  const getStatusColor = (status: number | 'pending' | 'error') => {
    if (status === 'pending') return 'bg-yellow-500';
    if (status === 'error') return 'bg-red-500';
    if (typeof status === 'number' && status >= 200 && status < 300) return 'bg-green-500';
    if (typeof status === 'number' && status >= 400) return 'bg-red-500';
    return 'bg-gray-500';
  };

  const formatDuration = (duration: number | null) => {
    if (duration === null) return '-';
    return `${duration}ms`;
  };

  return (
    <Card className="border-dashed border-yellow-500/50 bg-yellow-500/5" data-testid="dev-trace-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-yellow-500" />
            <div>
              <CardTitle className="text-sm font-semibold">🔧 Data Flow Trace (Dev Only)</CardTitle>
              <CardDescription className="text-xs">Last 5 API requests with timing</CardDescription>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearTraces}
            data-testid="button-clear-traces"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {recentTraces.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No requests yet</p>
        ) : (
          <div className="space-y-2">
            {recentTraces.map((trace) => (
              <div 
                key={trace.id} 
                className="flex items-center gap-3 p-2 rounded-lg bg-background/50 border text-xs"
                data-testid={`trace-${trace.id}`}
              >
                <Badge variant="outline" className="font-mono shrink-0">
                  {trace.method}
                </Badge>
                <Badge variant={trace.mode === 'live' ? 'default' : 'secondary'} className="shrink-0">
                  {trace.mode.toUpperCase()}
                </Badge>
                <div className="flex-1 truncate font-mono" title={trace.endpoint}>
                  {trace.endpoint}
                </div>
                <div className={`h-2 w-2 rounded-full ${getStatusColor(trace.status)} shrink-0`} />
                <span className="text-muted-foreground shrink-0 font-mono" data-testid={`status-${trace.id}`}>
                  {trace.status === 'pending' ? '...' : trace.status}
                </span>
                <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" />
                  <span className="font-mono" data-testid={`duration-${trace.id}`}>
                    {formatDuration(trace.duration)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
