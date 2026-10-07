/**
 * Stage B Historic Replay Test Runner
 * Tests strategies against past market data to find volatile periods
 */

import { StageBValidator } from './server/services/stage-b-validator';
import { writeFileSync } from 'fs';

async function runHistoricReplay() {
  console.log('🚀 Starting Stage B: Historic Replay Validation\n');
  
  const validator = new StageBValidator();
  const userId = 'ce50e56b-0208-4fca-9c14-2777db4104b7'; // testuser
  
  const results = await validator.runHistoricReplay(userId, 90); // Last 90 days
  
  // Generate and save report
  const report = validator.generateReport(results);
  const reportPath = './docs/strategy-validation-historic-report.md';
  writeFileSync(reportPath, report);
  
  console.log(`\n✅ Historic replay report saved to: ${reportPath}\n`);
  console.log('Summary:');
  console.log(`  Total Strategies: ${results.totalStrategies}`);
  console.log(`  Strategies with Signals: ${results.strategiesWithSignals}`);
  console.log(`  Success Rate: ${results.successRate.toFixed(1)}%`);
  console.log(`  Status: ${results.successRate >= 62.5 ? '✅ PASS (≥5/8)' : '⚠️ NEEDS MORE'}\n`);
  
  console.log('Strategy Breakdown:');
  results.metrics.forEach(r => {
    const icon = r.signalsDetected > 0 ? '✅' : '❌';
    const conf = r.avgConfidence ? `(Conf: ${(r.avgConfidence * 100).toFixed(0)}%)` : '(Conf: 0%)';
    console.log(`  ${icon} ${r.strategy}: ${r.signalsDetected} signals ${conf}`);
  });
  
  process.exit(results.successRate >= 62.5 ? 0 : 1); // Need ≥5/8 = 62.5%
}

runHistoricReplay().catch(error => {
  console.error('Error running historic replay:', error);
  process.exit(1);
});
