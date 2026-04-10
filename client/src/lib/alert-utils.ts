/**
 * Alert categorization and filtering utilities
 */

export type AlertCategory = 'informational' | 'actionable' | 'critical';
export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface SystemAlert {
  id: string;
  userId: string;
  mode: 'live' | 'paper';
  alertType: string;
  severity: AlertSeverity;
  category: AlertCategory;
  message: string;
  metadata?: any;
  actionButtons?: ActionButton[];
  acknowledged: boolean;
  timestamp: string;
}

export interface ActionButton {
  label: string;
  action: string; // API endpoint or action identifier
  variant: 'default' | 'destructive' | 'outline' | 'secondary';
  requiresConfirmation?: boolean;
}

/**
 * Categorize alert based on severity and alert type
 */
export function categorizeAlert(alert: SystemAlert): AlertCategory {
  // Category explicitly set
  if (alert.category) {
    return alert.category;
  }

  // Critical alerts are always critical
  if (alert.severity === 'critical') {
    return 'critical';
  }

  // Actionable alert types (require user input)
  const actionableTypes = [
    'approval_required',
    'confirmation_needed',
    'risk_adjustment',
    'parameter_change',
    'strategy_activation',
    'kill_switch_reset',
    'trading_mode_change'
  ];

  if (actionableTypes.includes(alert.alertType)) {
    return 'actionable';
  }

  // Everything else is informational
  return 'informational';
}

/**
 * Determine if alert should be shown based on user settings
 */
export function shouldShowAlert(
  alert: SystemAlert,
  showSystemAlerts: boolean
): boolean {
  const category = categorizeAlert(alert);

  // Always show critical alerts
  if (category === 'critical') {
    return true;
  }

  // Always show actionable alerts
  if (category === 'actionable') {
    return true;
  }

  // Show informational only if user setting allows
  return showSystemAlerts;
}

/**
 * Get icon and styling for alert severity
 */
export function getAlertStyle(severity: AlertSeverity) {
  switch (severity) {
    case 'critical':
      return {
        bg: 'bg-destructive/10 dark:bg-destructive/20',
        border: 'border-destructive',
        text: 'text-destructive',
        badgeVariant: 'destructive' as const,
      };
    case 'warning':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/30',
        border: 'border-amber-500',
        text: 'text-amber-700 dark:text-amber-400',
        badgeVariant: 'secondary' as const,
      };
    case 'info':
      return {
        bg: 'bg-muted dark:bg-muted/50',
        border: 'border-muted-foreground/20',
        text: 'text-muted-foreground',
        badgeVariant: 'outline' as const,
      };
  }
}
