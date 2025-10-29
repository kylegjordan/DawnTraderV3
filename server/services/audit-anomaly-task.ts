import { storage } from '../storage';
import { AuditAnomalyDetectionService } from './audit-anomaly-detection';

const NIGHTLY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Calculate milliseconds until next 2 AM UTC
function msUntilNext2AMUTC(): number {
  const now = new Date();
  const next2AM = new Date();
  next2AM.setUTCHours(2, 0, 0, 0);
  
  // If we've passed 2 AM today, schedule for tomorrow
  if (now.getUTCHours() >= 2 || (now.getUTCHours() === 2 && now.getUTCMinutes() > 0)) {
    next2AM.setUTCDate(next2AM.getUTCDate() + 1);
  }
  
  return next2AM.getTime() - now.getTime();
}

export const auditAnomalyTask = {
  name: 'Audit Anomaly Detection',
  description: 'Nightly analysis of audit logs for frequency spikes and value reversions',
  frequency: 'Daily at 2:00 AM UTC',
  intervalMs: NIGHTLY_INTERVAL_MS,
  
  // Calculate initial delay to align to 2 AM UTC
  getInitialDelay(): number {
    return msUntilNext2AMUTC();
  },

  async run() {
    console.log('[AuditAnomaly] Starting nightly anomaly detection...');
    
    const anomalyDetectionService = new AuditAnomalyDetectionService(storage);
    
    try {
      // Detect anomalies
      const anomalies = await anomalyDetectionService.detectAnomalies();
      
      // Log to console with [Audit] prefix
      anomalyDetectionService.logAnomalies(anomalies);
      
      // Store anomaly count in telemetry (could be expanded to persist anomalies to DB)
      const frequencySpikes = anomalies.filter(a => a.anomalyType === 'frequency_spike').length;
      const valueReversions = anomalies.filter(a => a.anomalyType === 'value_reversion').length;
      
      console.log(
        `[AuditAnomaly] Detection complete - ${anomalies.length} total anomalies ` +
        `(${frequencySpikes} frequency spikes, ${valueReversions} value reversions)`
      );
      
    } catch (error) {
      console.error('[AuditAnomaly] Error during anomaly detection:', error);
      throw error;
    }
  }
};
