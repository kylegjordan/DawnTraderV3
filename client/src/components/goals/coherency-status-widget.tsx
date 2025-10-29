import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CoherencyFailure {
  rule: string;
  severity: 'error' | 'warn';
  message: string;
  field?: string;
  value?: any;
  limit?: any;
}

interface CoherencyStatus {
  status: 'PASS' | 'WARN' | 'FAIL';
  failures: CoherencyFailure[];
  timestamp: string;
}

interface ComplianceData {
  mode: string;
  activePreset: string;
  coherency: CoherencyStatus;
  killSwitchTripped: boolean;
}

export function CoherencyStatusWidget() {
  const { mode } = useTradingMode();

  const { data, isLoading } = useQuery<{ ok: boolean; data: ComplianceData }>({
    queryKey: [`/api/analytics/guardrails-compliance?mode=${mode}`],
    enabled: !!mode,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const compliance = data?.data;
  const coherency = compliance?.coherency;

  if (isLoading) {
    return (
      <Card className="border-border" data-testid="coherency-status-loading">
        <CardContent className="p-4">
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!coherency || !compliance) {
    return null;
  }

  const getStatusColor = () => {
    switch (coherency.status) {
      case 'PASS':
        return 'text-green-600 dark:text-green-400';
      case 'WARN':
        return 'text-amber-600 dark:text-amber-400';
      case 'FAIL':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getStatusIcon = () => {
    switch (coherency.status) {
      case 'PASS':
        return <CheckCircle2 className="h-5 w-5" />;
      case 'WARN':
        return <AlertTriangle className="h-5 w-5" />;
      case 'FAIL':
        return <AlertCircle className="h-5 w-5" />;
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  const getStatusBadgeVariant = () => {
    switch (coherency.status) {
      case 'PASS':
        return 'bg-green-600 dark:bg-green-700 text-white';
      case 'WARN':
        return 'bg-amber-600 dark:bg-amber-700 text-white';
      case 'FAIL':
        return 'bg-red-600 dark:bg-red-700 text-white';
      default:
        return 'bg-gray-600 dark:bg-gray-700 text-white';
    }
  };

  const errors = coherency.failures.filter(f => f.severity === 'error');
  const warnings = coherency.failures.filter(f => f.severity === 'warn');

  return (
    <Card 
      className={`border-2 ${
        coherency.status === 'PASS' 
          ? 'border-green-500 dark:border-green-600' 
          : coherency.status === 'WARN'
          ? 'border-amber-500 dark:border-amber-600'
          : 'border-red-500 dark:border-red-600'
      }`}
      data-testid="coherency-status-widget"
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={getStatusColor()}>
              {getStatusIcon()}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Coherency Status
              </h4>
              <p className="text-xs text-muted-foreground">
                Active Preset: <span className="font-medium text-foreground capitalize">{compliance.activePreset}</span>
              </p>
            </div>
          </div>
          <Badge 
            variant="default" 
            className={getStatusBadgeVariant()}
            data-testid="badge-coherency-status"
          >
            {coherency.status}
          </Badge>
        </div>

        {/* Issues List */}
        {(errors.length > 0 || warnings.length > 0) && (
          <div className="space-y-2">
            {errors.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold">
                    {errors.length} Error{errors.length > 1 ? 's' : ''}
                  </span>
                </div>
                {errors.map((error, idx) => (
                  <TooltipProvider key={idx}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          className="text-xs text-muted-foreground bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded p-2 cursor-help"
                          data-testid={`error-coherency-${idx}`}
                        >
                          <span className="font-medium text-red-700 dark:text-red-300">
                            {error.rule}:
                          </span>{' '}
                          <span className="text-red-600 dark:text-red-400">
                            {error.message}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="space-y-1 text-xs">
                          <p><strong>Rule:</strong> {error.rule}</p>
                          {error.field && <p><strong>Field:</strong> {error.field}</p>}
                          {error.value !== undefined && <p><strong>Value:</strong> {error.value}</p>}
                          {error.limit !== undefined && <p><strong>Limit:</strong> {error.limit}</p>}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            )}

            {warnings.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold">
                    {warnings.length} Warning{warnings.length > 1 ? 's' : ''}
                  </span>
                </div>
                {warnings.map((warning, idx) => (
                  <TooltipProvider key={idx}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-2 cursor-help"
                          data-testid={`warning-coherency-${idx}`}
                        >
                          <span className="font-medium text-amber-700 dark:text-amber-300">
                            {warning.rule}:
                          </span>{' '}
                          <span className="text-amber-600 dark:text-amber-400">
                            {warning.message}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="space-y-1 text-xs">
                          <p><strong>Rule:</strong> {warning.rule}</p>
                          {warning.field && <p><strong>Field:</strong> {warning.field}</p>}
                          {warning.value !== undefined && <p><strong>Value:</strong> {warning.value}</p>}
                          {warning.limit !== undefined && <p><strong>Limit:</strong> {warning.limit}</p>}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            )}
          </div>
        )}

        {/* All Clear Message */}
        {coherency.status === 'PASS' && (
          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-2">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>All coherency rules passing</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
