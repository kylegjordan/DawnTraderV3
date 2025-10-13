import EnhancedSystemMonitoring from "@/components/system/enhanced-system-monitoring";
import AlertBanner from "@/components/alerts/alert-banner";
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
          <h1 className="text-3xl font-bold text-foreground">System Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time performance metrics, trading engine status, and system health diagnostics</p>
        </div>
      </div>

      {/* System Alerts Banner */}
      <div className="mb-6">
        <AlertBanner />
      </div>

      {/* Enhanced System Monitoring */}
      <EnhancedSystemMonitoring />
    </div>
  );
}
