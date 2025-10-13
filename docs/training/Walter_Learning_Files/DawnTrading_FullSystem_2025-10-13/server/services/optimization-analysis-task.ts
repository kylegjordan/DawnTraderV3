import { optimizationAnalyzer } from '../optimization/analyzer.js';

export const optimizationAnalysisTask = {
  name: 'Optimization Analysis',
  description: 'Detects performance bottlenecks and generates optimization proposals',
  frequency: 'every 6 hours',
  intervalMs: 6 * 60 * 60 * 1000, // 6 hours
  run: async function() {
    console.log('[Optimization Analysis] Running scheduled optimization analysis...');
    try {
      await optimizationAnalyzer.runOptimizationAnalysis();
      console.log('[Optimization Analysis] Completed successfully');
    } catch (error) {
      console.error('[Optimization Analysis] Failed:', error);
      throw error;
    }
  }
};
