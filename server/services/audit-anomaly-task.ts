import { storage } from '../storage';
import { AuditAnomalyDetectionService } from './audit-anomaly-detection';

const NIGHTLY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const auditAnomalyTask = {
  name: 'Audit Anomaly Detection',
  description: 'Nightly analysis of audit logs for frequency spikes and value reversions',
  frequency: 'Every 24 hours (nightly)',
  intervalMs: NIGHTLY_INTERVAL_MS,

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
