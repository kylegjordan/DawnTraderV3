import SystemMonitoringPanel from "@/components/system/system-monitoring-panel";
import { Activity } from "lucide-react";

export default function SystemsPage() {
  return (
    <div className="container max-w-7xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
          <Activity className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Systems Monitoring & Checks</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor system health, audit logs, and error tracking</p>
        </div>
      </div>

      {/* Systems Monitoring Panel */}
      <SystemMonitoringPanel />
    </div>
  );
}
