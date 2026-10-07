import { StageBValidator } from './server/services/stage-b-validator';
import { storage } from './server/storage';
import fs from 'fs/promises';
import path from 'path';

async function runStageBValidation() {
  console.log('\n🚀 Starting Stage B: Paper Trading Validation with Real Market Data\n');
  
  // Use testuser ID (this user is created on startup)
  const testUserId = 'ce50e56b-0208-4fca-9c14-2777db4104b7'; // testuser@example.com
  console.log(`Using test user: testuser@example.com\n`);
  
  const validator = new StageBValidator();
  const results = await validator.runStageB(testUserId);
  const report = validator.generateReport(results);
  
  // Save report
  const docsDir = path.join(process.cwd(), 'docs');
  await fs.mkdir(docsDir, { recursive: true });
  const reportPath = path.join(docsDir, 'strategy-validation-stageb-report.md');
  await fs.writeFile(reportPath, report);
  
  console.log(`\n✅ Stage B validation report saved to: ${reportPath}\n`);
  console.log('Summary:');
  console.log(`  Total Strategies: ${results.totalStrategies}`);
  console.log(`  Strategies with Signals: ${results.strategiesWithSignals}`);
  console.log(`  Success Rate: ${results.successRate.toFixed(1)}%`);
  console.log(`  Status: ${results.successRate >= 80 ? '✅ PASSED' : '⚠️  NEEDS REVIEW'}\n`);
  
  // Display metrics
  console.log('Strategy Breakdown:');
  results.metrics
    .sort((a, b) => b.signalsDetected - a.signalsDetected)
    .forEach(m => {
      const status = m.signalsDetected > 0 ? '✅' : '❌';
      console.log(`  ${status} ${m.strategy}: ${m.signalsDetected} signals (Conf: ${(m.avgConfidence*100).toFixed(0)}%)`);
    });
  
  if (results.successRate >= 80) {
    console.log('\n✅ Stage B Validation Complete – Ready for Task 8 (Guardrails)\n');
  } else {
    console.log(`\n⚠️  ${8 - results.strategiesWithSignals} strategies need review\n`);
  }
}

runStageBValidation().catch(console.error);
