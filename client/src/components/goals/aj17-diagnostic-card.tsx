import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Activity, CheckCircle, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface DiagnosticSession {
  sessionId: string;
  startTime: string;
  endTime?: string;
  mode: 'live' | 'paper';
  logCount: number;
  snapshotCount: number;
  status: 'active' | 'completed' | 'error';
  zipPath?: string;
}

interface AJ17StatusResponse {
  ok: boolean;
  active: boolean;
  currentSession: DiagnosticSession | null;
  lastCompleted: DiagnosticSession | null;
  lastBundlePath: string | null;
}

export default function AJ17DiagnosticCard() {
  const { mode, isPaper } = useTradingMode();
  const { toast } = useToast();
  const { messages } = useWebSocket();
  const [isDownloading, setIsDownloading] = useState(false);
  const [reportReady, setReportReady] = useState(false);

  const { data: status, refetch } = useQuery<AJ17StatusResponse>({
    queryKey: ['/api/diagnostics/aj17/status'],
    refetchInterval: 10000,
    enabled: isPaper,
  });

  useEffect(() => {
    const reportReadyMessages = messages.filter(msg => msg.type === 'aj17_report_ready');
    if (reportReadyMessages.length > 0) {
      setReportReady(true);
      toast({
        title: "Diagnostic Report Ready",
        description: "Your AJ16 diagnostic report is ready for download.",
      });
      refetch();
    }
  }, [messages, toast, refetch]);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const response = await fetch('/api/diagnostics/aj17/download', {
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to download diagnostic bundle');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileName = contentDisposition?.match(/filename="(.+)"/)?.[1] || 'aj16-diagnostic-bundle.zip';

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setReportReady(false);
      toast({
        title: "Download Complete",
        description: `Diagnostic bundle ${fileName} downloaded successfully.`,
      });
    } catch (error: any) {
      toast({
        title: "Download Failed",
        description: error.message || 'Failed to download diagnostic bundle',
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  }, [toast]);

  if (!isPaper) {
    return null;
  }

  const hasBundle = status?.lastCompleted?.zipPath || status?.lastBundlePath;
  const isSessionActive = status?.active;
  const lastSession = status?.lastCompleted;

  const formatDuration = (start: string, end?: string) => {
    if (!end) return 'Active';
    const startDate = new Date(start);
    const endDate = new Date(end);
    const minutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
    return `${minutes} min`;
  };

  return (
    <Card className={cn(
      "border-blue-500/30 bg-blue-500/5",
      reportReady && "ring-2 ring-green-500/50"
    )}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-500" />
          AJ16 Diagnostic Tools
          {reportReady && (
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-green-500/20 text-green-600 dark:text-green-400 animate-pulse">
              READY
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isSessionActive && (
          <div className="flex items-center gap-2 text-xs text-blue-500">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span>Recording diagnostic session...</span>
          </div>
        )}

        {lastSession && (
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Last Session:</span>
              <span>{lastSession.sessionId}</span>
            </div>
            <div className="flex justify-between">
              <span>Duration:</span>
              <span>{formatDuration(lastSession.startTime, lastSession.endTime)}</span>
            </div>
            <div className="flex justify-between">
              <span>Logs Captured:</span>
              <span>{lastSession.logCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Snapshots:</span>
              <span>{lastSession.snapshotCount}</span>
            </div>
          </div>
        )}

        <Button
          size="sm"
          variant={reportReady ? "default" : "outline"}
          className={cn(
            "w-full",
            reportReady && "bg-green-600 hover:bg-green-700"
          )}
          onClick={handleDownload}
          disabled={!hasBundle || isDownloading}
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Downloading...
            </>
          ) : reportReady ? (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Download Ready Report
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Download Last Diagnostic Report
            </>
          )}
        </Button>

        {!hasBundle && !isSessionActive && (
          <p className="text-[10px] text-muted-foreground text-center">
            Start paper trading to generate a diagnostic report.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
