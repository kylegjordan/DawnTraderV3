import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MaintenanceStatus {
  isMaintenanceMode: boolean;
}

export default function MaintenanceBanner() {
  const { data: status } = useQuery<MaintenanceStatus>({
    queryKey: ['/api/maintenance/status'],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (!status || !status.isMaintenanceMode) {
    return null;
  }

  return (
    <Alert 
      variant="default"
      className="border-amber-500 bg-amber-50 dark:bg-amber-950/50"
      data-testid="maintenance-banner"
    >
      <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertDescription className="ml-7 text-amber-900 dark:text-amber-100">
        🔒 <strong>Maintenance Mode:</strong> Exchange connections temporarily disabled for system updates.
      </AlertDescription>
    </Alert>
  );
}
