/**
 * Phase 27.F.15.C: MetricsCore MSI Validation Tests
 * 
 * These tests validate Mode Separation Integrity (MSI) for the metrics system:
 * - Paper mode: Supports reset when starting new simulation
 * - Live mode: Resets are rejected, metrics persist across sessions
 * - No cross-mode contamination (paper changes don't affect live)
 */

import { metricsCore } from '../services/metrics-core.js';

async function runValidationTests() {
  console.log('🧪 [27.F.15.C][Validation] Starting MetricsCore MSI tests...\n');
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  // Test 1: Paper mode reset should succeed
  try {
    console.log('Test 1: Paper mode reset (should succeed)');
    await metricsCore.reset('paper');
    console.log('✅ Test 1 PASSED: Paper mode reset completed\n');
    testsPassed++;
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message, '\n');
    testsFailed++;
  }
  
  // Test 2: Live mode reset should be rejected
  try {
    console.log('Test 2: Live mode reset (should be rejected)');
    await metricsCore.reset('live');
    console.error('❌ Test 2 FAILED: Live mode reset was allowed (should have been rejected)\n');
    testsFailed++;
  } catch (error: any) {
    if (error.message.includes('Live mode metrics cannot be reset')) {
      console.log('✅ Test 2 PASSED: Live mode reset was correctly rejected\n');
      testsPassed++;
    } else {
      console.error('❌ Test 2 FAILED: Wrong error message:', error.message, '\n');
      testsFailed++;
    }
  }
  
  // Test 3: Compute paper metrics
  try {
    console.log('Test 3: Compute paper mode metrics');
    const paperMetrics = await metricsCore.computePortfolioKPIs('paper');
    console.log('✅ Test 3 PASSED: Paper metrics computed successfully');
    console.log(`   Portfolio value: $${paperMetrics.totalValue.toFixed(2)}\n`);
    testsPassed++;
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message, '\n');
    testsFailed++;
  }
  
  // Test 4: Compute live metrics
  try {
    console.log('Test 4: Compute live mode metrics');
    const liveMetrics = await metricsCore.computePortfolioKPIs('live');
    console.log('✅ Test 4 PASSED: Live metrics computed successfully');
    console.log(`   Portfolio value: $${liveMetrics.totalValue.toFixed(2)}\n`);
    testsPassed++;
  } catch (error: any) {
    console.error('❌ Test 4 FAILED:', error.message, '\n');
    testsFailed++;
  }
  
  // Test 5: Cache independence between modes
  try {
    console.log('Test 5: Cache independence (paper vs live)');
    const [paperAll, liveAll] = await Promise.all([
      metricsCore.getCachedOrCompute('paper'),
      metricsCore.getCachedOrCompute('live')
    ]);
    
    const areIndependent = 
      paperAll.mode === 'paper' && 
      liveAll.mode === 'live' &&
      paperAll.computedAt !== liveAll.computedAt;
    
    if (areIndependent) {
      console.log('✅ Test 5 PASSED: Paper and live metrics are independently cached\n');
      testsPassed++;
    } else {
      console.error('❌ Test 5 FAILED: Metrics modes are not properly separated\n');
      testsFailed++;
    }
  } catch (error: any) {
    console.error('❌ Test 5 FAILED:', error.message, '\n');
    testsFailed++;
  }
  
  // Summary
  console.log('═'.repeat(60));
  console.log('📊 MSI Validation Summary:');
  console.log(`   ✅ Passed: ${testsPassed}`);
  console.log(`   ❌ Failed: ${testsFailed}`);
  console.log(`   Total:  ${testsPassed + testsFailed}`);
  console.log('═'.repeat(60));
  
  if (testsFailed === 0) {
    console.log('✅ All MSI validation tests passed!');
    return true;
  } else {
    console.error('❌ Some MSI validation tests failed!');
    return false;
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runValidationTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Fatal error during validation:', error);
      process.exit(1);
    });
}

export { runValidationTests };
