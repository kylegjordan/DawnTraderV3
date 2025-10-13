/**
 * Stage C Validation Test Runner
 * Runs synthetic validation to prove all 8 strategies CAN generate signals
 */

import { StageCValidator } from './server/services/stage-c-validator';
import { writeFileSync } from 'fs';

async function runStageCValidation() {
  console.log('🚀 Starting Stage C-Lite: Synthetic Validation (Relaxed Filters)\n');
  console.log('Using test user: testuser\n');
  
  // Enable lite mode for simplified validation
  const validator = new StageCValidator(true); // liteMode = true
  const userId = 'ce50e56b-0208-4fca-9c14-2777db4104b7'; // testuser
  
  const results = await validator.runStageC(userId);
  
  // Generate and save report
  const report = validator.generateReport(results);
  const reportPath = './docs/stage-c-lite-validation-report.md';
  writeFileSync(reportPath, report);
  
  console.log(`\n✅ Stage C validation report saved to: ${reportPath}\n`);
  console.log('Summary:');
  console.log(`  Total Strategies: ${results.totalStrategies}`);
  console.log(`  Strategies with Signals: ${results.strategiesWithSignals}`);
  console.log(`  Success Rate: ${results.successRate.toFixed(1)}%`);
  console.log(`  Status: ${results.successRate >= 100 ? '✅ PASS' : '⚠️ NEEDS REVIEW'}\n`);
  
  console.log('Strategy Breakdown:');
  results.results.forEach(r => {
    const icon = r.signalGenerated ? '✅' : '❌';
    const conf = r.confidence ? `(Conf: ${(r.confidence * 100).toFixed(0)}%)` : '(Conf: 0%)';
    console.log(`  ${icon} ${r.strategy}: ${r.signalGenerated ? `Signal at $${r.entryPrice.toFixed(2)} ${conf}` : 'No signal'}`);
  });
  
  process.exit(results.successRate >= 100 ? 0 : 1);
}

runStageCValidation().catch(error => {
  console.error('Error running Stage C validation:', error);
  process.exit(1);
});
