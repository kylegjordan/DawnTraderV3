// server/services/diagnostic-analysis-task.ts
// Hourly diagnostic analysis with anomaly detection

import { diagnosticsAnalyzer } from '../diagnostics/analyzer.js';
import { ScheduledTask } from './scheduler-registry.js';

export class DiagnosticAnalysisTask implements Omit<ScheduledTask, 'lastRun' | 'nextRun' | 'status'> {
  name = 'Diagnostic Analysis';
  description = 'Hourly system diagnostics with AI-powered anomaly detection and trend analysis';
  frequency = 'Every 1 hour';
  intervalMs = 60 * 60 * 1000; // 1 hour

  async run(): Promise<void> {
    console.log('[DiagnosticAnalysis] Starting diagnostic analysis cycle...');

    try {
      const analysis = await diagnosticsAnalyzer.runDiagnosticAnalysis();
      
      const anomalyCount = analysis.anomalies.anomalies.length;
      const highSeverity = analysis.anomalies.anomalies.filter(a => a.severity === 'high').length;
      
      console.log(`[DiagnosticAnalysis] Analysis complete - ${anomalyCount} anomalies detected (${highSeverity} high severity)`);
      console.log(`[DiagnosticAnalysis] Urgency: ${analysis.aiInsights.urgencyLevel}`);
      console.log(`[DiagnosticAnalysis] Summary: ${analysis.aiInsights.summary}`);
      
      if (analysis.aiInsights.recommendations.length > 0) {
        console.log('[DiagnosticAnalysis] Recommendations:');
        analysis.aiInsights.recommendations.forEach((rec, i) => {
          console.log(`  ${i + 1}. ${rec}`);
        });
      }
    } catch (error) {
      console.error('[DiagnosticAnalysis] Error during diagnostic analysis:', error);
      throw error;
    }
  }
}

export const diagnosticAnalysisTask = new DiagnosticAnalysisTask();
