/**
 * Strategy Alert System
 * Logs and tracks important strategy events, anomalies, and guardrail triggers
 */

export enum AlertLevel {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical'
}

export enum AlertType {
  STRATEGY_ENABLED = 'strategy_enabled',
  STRATEGY_DISABLED = 'strategy_disabled',
  DAILY_DRAWDOWN_STOP = 'daily_drawdown_stop',
  FALSE_BREAKOUT_DETECTED = 'false_breakout_detected',
  FAILED_REVERSION = 'failed_reversion',
  UNUSUAL_SIGNAL_VOLUME = 'unusual_signal_volume',
  CONFLICT_RESOLUTION = 'conflict_resolution'
}

export interface StrategyAlert {
  timestamp: Date;
  userId: string;
  level: AlertLevel;
  type: AlertType;
  strategy?: string;
  symbol?: string;
  message: string;
  metadata?: Record<string, any>;
}

class StrategyAlertsService {
  private alerts: StrategyAlert[] = [];
  private readonly MAX_ALERTS = 1000; // Keep last 1000 alerts in memory

  /**
   * Log an alert
   */
  logAlert(alert: Omit<StrategyAlert, 'timestamp'>): void {
    const fullAlert: StrategyAlert = {
      ...alert,
      timestamp: new Date()
    };

    this.alerts.push(fullAlert);

    // Trim alerts if exceeding max
    if (this.alerts.length > this.MAX_ALERTS) {
      this.alerts = this.alerts.slice(-this.MAX_ALERTS);
    }

    // Console logging with emoji indicators
    const emoji = this.getAlertEmoji(alert.level);
    console.log(`${emoji} [ALERT] [${alert.level.toUpperCase()}] [${alert.type}] ${alert.message}`, 
      alert.metadata ? alert.metadata : '');
  }

  /**
   * Get emoji for alert level
   */
  private getAlertEmoji(level: AlertLevel): string {
    switch (level) {
      case AlertLevel.INFO: return 'ℹ️';
      case AlertLevel.WARNING: return '⚠️';
      case AlertLevel.CRITICAL: return '🚨';
      default: return '📢';
    }
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit: number = 50): StrategyAlert[] {
    return this.alerts.slice(-limit).reverse();
  }

  /**
   * Get alerts by type
   */
  getAlertsByType(type: AlertType, limit: number = 50): StrategyAlert[] {
    return this.alerts
      .filter(a => a.type === type)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get critical alerts
   */
  getCriticalAlerts(limit: number = 20): StrategyAlert[] {
    return this.alerts
      .filter(a => a.level === AlertLevel.CRITICAL)
      .slice(-limit)
      .reverse();
  }

  /**
   * Clear alerts (for testing/maintenance)
   */
  clearAlerts(): void {
    this.alerts = [];
    console.log('🧹 [ALERT] All alerts cleared');
  }

  /**
   * Convenience methods for common alerts
   */
  strategyEnabled(userId: string, strategy: string): void {
    this.logAlert({
      userId,
      level: AlertLevel.INFO,
      type: AlertType.STRATEGY_ENABLED,
      strategy,
      message: `Strategy ${strategy} has been enabled`
    });
  }

  strategyDisabled(userId: string, strategy: string, reason?: string): void {
    this.logAlert({
      userId,
      level: AlertLevel.WARNING,
      type: AlertType.STRATEGY_DISABLED,
      strategy,
      message: `Strategy ${strategy} has been disabled${reason ? `: ${reason}` : ''}`
    });
  }

  dailyDrawdownStop(userId: string, currentDrawdown: number, limit: number): void {
    this.logAlert({
      userId,
      level: AlertLevel.CRITICAL,
      type: AlertType.DAILY_DRAWDOWN_STOP,
      message: `Daily drawdown limit reached! Current: ${currentDrawdown.toFixed(2)}%, Limit: ${limit}%`,
      metadata: { currentDrawdown, limit }
    });
  }

  falseBreakoutDetected(userId: string, symbol: string, strategy: string): void {
    this.logAlert({
      userId,
      level: AlertLevel.WARNING,
      type: AlertType.FALSE_BREAKOUT_DETECTED,
      strategy,
      symbol,
      message: `Potential false breakout detected on ${symbol} (${strategy})`,
      metadata: { symbol, strategy }
    });
  }

  failedReversion(userId: string, symbol: string, strategy: string): void {
    this.logAlert({
      userId,
      level: AlertLevel.WARNING,
      type: AlertType.FAILED_REVERSION,
      strategy,
      symbol,
      message: `Failed mean reversion on ${symbol} (${strategy})`,
      metadata: { symbol, strategy }
    });
  }

  unusualSignalVolume(userId: string, strategy: string, signalCount: number, threshold: number): void {
    this.logAlert({
      userId,
      level: AlertLevel.WARNING,
      type: AlertType.UNUSUAL_SIGNAL_VOLUME,
      strategy,
      message: `Unusual signal volume for ${strategy}: ${signalCount} signals (threshold: ${threshold})`,
      metadata: { strategy, signalCount, threshold }
    });
  }

  conflictResolution(userId: string, symbol: string, totalSignals: number, resolvedTo: number, dropped: string[]): void {
    this.logAlert({
      userId,
      level: AlertLevel.INFO,
      type: AlertType.CONFLICT_RESOLUTION,
      symbol,
      message: `Conflict resolution on ${symbol}: ${totalSignals} signals → ${resolvedTo} resolved`,
      metadata: { symbol, totalSignals, resolvedTo, dropped }
    });
  }
}

// Export singleton instance
export const strategyAlerts = new StrategyAlertsService();
