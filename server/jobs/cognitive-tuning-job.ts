import cron from 'node-cron';
import { cognitiveTuner } from '../services/cognitive-tuner';

const SCHEDULE = process.env.COGNITIVE_BENCHMARK_SCHEDULE || '0 3 * * *'; // Default: UTC 03:00
const ENABLED = process.env.COGNITIVE_TUNING_ENABLED === 'true';

export function registerCognitiveTuningJob() {
  if (!ENABLED) {
    console.log('[CognitiveTuningJob] ❌ Disabled via COGNITIVE_TUNING_ENABLED env');
    return;
  }

  console.log(`[CognitiveTuningJob] ⏰ Scheduling nightly benchmark: ${SCHEDULE}`);

  cron.schedule(SCHEDULE, async () => {
    const startTime = Date.now();
    console.log(`[CognitiveTuningJob] 🧠 Starting nightly cognitive benchmark...`);

    try {
      const results = await cognitiveTuner.runFullBenchmark('SYSTEM');
      
      const totalTests = results.length;
      const passedTests = results.filter(r => r.result === 'PASS').length;
      const avgLatencyMs = results.reduce((sum, r) => sum + r.avgLatencyMs, 0) / totalTests;
      const duration = Date.now() - startTime;

      console.log(`[CognitiveTuningJob] ✅ Benchmark complete in ${duration}ms`);
      console.log(`[CognitiveTuningJob] 📊 Results: ${passedTests}/${totalTests} passed, avg latency ${avgLatencyMs.toFixed(0)}ms`);

      // Log any failures
      const failures = results.filter(r => r.result !== 'PASS');
      if (failures.length > 0) {
        console.warn(`[CognitiveTuningJob] ⚠️ ${failures.length} test(s) failed:`);
        failures.forEach(f => {
          console.warn(`  - ${f.scenario}: ${f.result} (${f.avgLatencyMs.toFixed(0)}ms)`);
        });
      }
    } catch (error: any) {
      console.error('[CognitiveTuningJob] ❌ Benchmark failed:', error.message);
      console.error(error.stack);
    }
  });

  console.log('[CognitiveTuningJob] ✅ Job registered successfully');
}
