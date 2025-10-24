import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Shield, AlertTriangle, Clock, Activity, TrendingUp, TrendingDown, Minus, Download, FileJson, FileText } from "lucide-react";
import { useState } from "react";

interface SafetySummary {
  totalAdjustments24h: number;
  violationsCount: number;
  lastViolationTime: Date | null;
  status: 'safe' | 'warning' | 'limit_reached';
}

interface LATTISafetySummaryResponse {
  paper: SafetySummary;
  live: SafetySummary;
}

export function LATTISafetyMonitor() {
  const [isExporting, setIsExporting] = useState(false);
  
  const { data: safetySummary, isLoading } = useQuery<LATTISafetySummaryResponse>({
    queryKey: ['/api/heuristic-trader/safety-summary'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });
  
  // Phase 27.F.14.B Task 11: Export LATTI logs
  const handleExport = async (mode: 'paper' | 'live', format: 'json' | 'csv', days: number = 7) => {
    setIsExporting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `/api/heuristic-trader/adjustment-logs?mode=${mode}&days=${days}&format=${format}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (!response.ok) throw new Error('Export failed');
      
      if (format === 'csv') {
        // Download CSV file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `latti-adjustments-${mode}-${days}d.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        // Download JSON file
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `latti-adjustments-${mode}-${days}d.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const getSafetyIcon = (status: string) => {
    switch (status) {
      case 'safe':
        return <Shield className="h-5 w-5 text-green-500" data-testid="icon-safety-safe" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" data-testid="icon-safety-warning" />;
      case 'limit_reached':
        return <AlertTriangle className="h-5 w-5 text-red-500" data-testid="icon-safety-limit" />;
      default:
        return <Shield className="h-5 w-5 text-gray-500" />;
    }
  };

  const getSafetyBadge = (status: string) => {
    switch (status) {
      case 'safe':
        return <Badge className="bg-green-500 hover:bg-green-600" data-testid="badge-safety-safe">🟢 Safe</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600" data-testid="badge-safety-warning">🟡 Warning</Badge>;
      case 'limit_reached':
        return <Badge className="bg-red-500 hover:bg-red-600" data-testid="badge-safety-limit">🔴 Limit Reached</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const formatLastViolation = (timestamp: Date | null) => {
    if (!timestamp) return 'None';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  if (isLoading) {
    return (
      <Card data-testid="card-latti-safety-monitor">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            LATTI Safety Audit
          </CardTitle>
          <CardDescription>
            Parameter adjustment safety monitoring
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-latti-safety-monitor">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              LATTI Safety Audit
            </CardTitle>
            <CardDescription>
              Phase 27.F.14.B Task 6 - Parameter adjustment safety monitoring
            </CardDescription>
          </div>
          {/* Phase 27.F.14.B Task 11: Export buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('paper', 'csv')}
              disabled={isExporting}
              data-testid="button-export-paper-csv"
            >
              <Download className="h-4 w-4 mr-1" />
              Paper CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('live', 'csv')}
              disabled={isExporting}
              data-testid="button-export-live-csv"
            >
              <Download className="h-4 w-4 mr-1" />
              Live CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Paper Mode Safety */}
        <div className="space-y-3" data-testid="section-paper-safety">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              {getSafetyIcon(safetySummary?.paper.status || 'safe')}
              Paper Mode
            </h4>
            {getSafetyBadge(safetySummary?.paper.status || 'safe')}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                24h Adjustments
              </div>
              <div className="text-2xl font-bold" data-testid="text-paper-adjustments">
                {safetySummary?.paper.totalAdjustments24h || 0}
              </div>
              {/* Phase 27.F.14.B Task 10: Mini-chart for adjustment frequency */}
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Limit: 72/day (3/hr × 24)</div>
                <Progress 
                  value={((safetySummary?.paper.totalAdjustments24h || 0) / 72) * 100} 
                  className="h-1.5"
                  data-testid="progress-paper-adjustments"
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                Violations
              </div>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-red-500" data-testid="text-paper-violations">
                  {safetySummary?.paper.violationsCount || 0}
                </div>
                {/* Phase 27.F.14.B Task 10: Trend indicator */}
                {(safetySummary?.paper.violationsCount || 0) === 0 ? (
                  <Minus className="h-4 w-4 text-muted-foreground" />
                ) : (safetySummary?.paper.violationsCount || 0) < 3 ? (
                  <TrendingDown className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-red-500" />
                )}
              </div>
              <div className="text-xs text-muted-foreground">Target: 0 violations</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Last Violation
              </div>
              <div className="text-sm font-medium" data-testid="text-paper-last-violation">
                {formatLastViolation(safetySummary?.paper.lastViolationTime || null)}
              </div>
            </div>
          </div>
        </div>

        {/* Live Mode Safety */}
        <div className="space-y-3" data-testid="section-live-safety">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              {getSafetyIcon(safetySummary?.live.status || 'safe')}
              Live Mode
            </h4>
            {getSafetyBadge(safetySummary?.live.status || 'safe')}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                24h Adjustments
              </div>
              <div className="text-2xl font-bold" data-testid="text-live-adjustments">
                {safetySummary?.live.totalAdjustments24h || 0}
              </div>
              {/* Phase 27.F.14.B Task 10: Mini-chart for adjustment frequency */}
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Limit: 72/day (3/hr × 24)</div>
                <Progress 
                  value={((safetySummary?.live.totalAdjustments24h || 0) / 72) * 100} 
                  className="h-1.5"
                  data-testid="progress-live-adjustments"
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                Violations
              </div>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-red-500" data-testid="text-live-violations">
                  {safetySummary?.live.violationsCount || 0}
                </div>
                {/* Phase 27.F.14.B Task 10: Trend indicator */}
                {(safetySummary?.live.violationsCount || 0) === 0 ? (
                  <Minus className="h-4 w-4 text-muted-foreground" />
                ) : (safetySummary?.live.violationsCount || 0) < 3 ? (
                  <TrendingDown className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-red-500" />
                )}
              </div>
              <div className="text-xs text-muted-foreground">Target: 0 violations</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Last Violation
              </div>
              <div className="text-sm font-medium" data-testid="text-live-last-violation">
                {formatLastViolation(safetySummary?.live.lastViolationTime || null)}
              </div>
            </div>
          </div>
        </div>

        {/* Safety Rules */}
        <div className="pt-3 border-t space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground">Safety Rules</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Max parameter change: ±30% from previous value</li>
            <li>• Max adjustments per hour: 3 per parameter</li>
            <li>• Violations logged to trading_audit_log</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
