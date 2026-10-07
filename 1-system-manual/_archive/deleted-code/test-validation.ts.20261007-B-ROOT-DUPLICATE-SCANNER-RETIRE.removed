import { StrategyValidator } from './server/services/strategy-validator';
import fs from 'fs/promises';
import path from 'path';

async function runValidation() {
  console.log('\n🚀 Running Strategy Validation Tests...\n');
  
  const validator = new StrategyValidator();
  const results = await validator.runAllTests('test-user-id');
  const report = validator.generateReport();
  
  // Save report
  const docsDir = path.join(process.cwd(), 'docs');
  await fs.mkdir(docsDir, { recursive: true });
  const reportPath = path.join(docsDir, 'strategy-validation-report.md');
  await fs.writeFile(reportPath, report);
  
  console.log(`\n✅ Validation report saved to: ${reportPath}\n`);
  console.log('Summary:');
  console.log(`  Total Tests: ${results.totalTests}`);
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Success Rate: ${((results.passed / results.totalTests) * 100).toFixed(1)}%\n`);
}

runValidation().catch(console.error);
