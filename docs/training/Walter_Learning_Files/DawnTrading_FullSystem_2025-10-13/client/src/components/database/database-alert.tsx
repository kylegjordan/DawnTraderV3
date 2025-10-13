import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, HardDrive } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface DatabaseStatus {
  current: {
    sizeMb: number;
    sizeGb: number;
    alertLevel: 'normal' | 'warning' | 'critical';
  };
  limits: {
    maxSizeGb: number;
    warningThresholdGb: number;
    criticalThresholdGb: number;
  };
}

export default function DatabaseAlert() {
  const { data: status } = useQuery<DatabaseStatus>({
    queryKey: ['/api/database/status'],
    refetchInterval: 60 * 60 * 1000, // Refetch every hour
  });

  if (!status || status.current.alertLevel === 'normal') {
    return null;
  }

  const { sizeMb, sizeGb, alertLevel } = status.current;
  const { maxSizeGb } = status.limits;
  const percentUsed = (sizeGb / maxSizeGb * 100).toFixed(1);

  const isCritical = alertLevel === 'critical';

  return (
    <Alert 
      variant={isCritical ? "destructive" : "default"}
      className={isCritical ? "" : "border-yellow-500 bg-yellow-50 dark:bg-yellow-950"}
      data-testid="database-alert"
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="font-semibold">
        {isCritical ? 'Critical: ' : 'Warning: '}Database Storage Alert
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4" />
          <span>
            Your database is using <strong>{sizeMb.toFixed(0)} MB</strong> ({sizeGb.toFixed(2)} GB)
            — <strong>{percentUsed}%</strong> of the {maxSizeGb} GB limit
          </span>
        </div>
        <p className="text-sm">
          {isCritical ? (
            <>
              You're approaching the database size limit. Consider migrating to your own Neon account or
              cleaning up old data to avoid hitting the 10 GB limit.
            </>
          ) : (
            <>
              Your database is over 50% full. Monitor your usage and plan to migrate or clean up data
              before reaching 70% (critical threshold).
            </>
          )}
        </p>
      </AlertDescription>
    </Alert>
  );
}
