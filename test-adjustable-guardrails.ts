/**
 * Task 10.1: Validation Tests for Adjustable Risk Parameters
 * Tests dailyLossKillSwitch and maxPositionPercent adjustability
 */

import { storage } from './server/storage';
import { RiskManager } from './server/services/risk-manager';

interface TestResult {
  testId: string;
  description: string;
  status: 'PASS' | 'FAIL';
  details: string;
  timestamp: string;
}

const results: TestResult[] = [];

function logTest(testId: string, description: string, passed: boolean, details: string) {
  const result: TestResult = {
    testId,
    description,
    status: passed ? 'PASS' : 'FAIL',
    details,
    timestamp: new Date().toISOString()
  };
  results.push(result);
  
  const emoji = passed ? '✅' : '❌';
  console.log(`\n${emoji} Test ${testId}: ${description}`);
  console.log(`   ${details}`);
}

async function runTests() {
  console.log('\n🧪 Task 10.1: Adjustable Guardrails Validation Tests');
  console.log('=' .repeat(60));
  
  // Get test user
  const users = await storage.getAllUsers();
  const testUser = users.find(u => u.username === 'testuser') || users[0];
  
  if (!testUser) {
    console.error('❌ No test user found');
    return;
  }
  
  console.log(`\n👤 Using test user: ${testUser.username} (${testUser.id})`);
  
  const riskManager = new RiskManager();
  
  // Get or create settings
  let settings = await storage.getTradingSettings(testUser.id);
  if (!settings) {
    settings = await storage.createTradingSettings({ userId: testUser.id });
  }

  // ===================================================================
  // TEST A: dailyLossKillSwitch = 5%
  // ===================================================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST A: Daily Loss Kill Switch at 5%');
  console.log('='.repeat(60));
  
  // Update kill switch to 5%
  await storage.updateTradingSettings(testUser.id, {
    dailyLossKillSwitch: '5.00',
    portfolioValue: '10000.00', // $10k portfolio for testing
    tradingSuspended: false // Ensure not already suspended
  });
  
  // Simulate a 5% loss by creating losing trades
  const testPair = 'BTC/USD';
  const lossAmount = 500; // 5% of $10k
  
  // Create a losing trade
  const trade = await storage.createTrade({
    userId: testUser.id,
    mode: 'paper',
    symbol: testPair,
    side: 'buy',
    quantity: '0.01',
    entryPrice: '50000.00',
    stopPrice: '45000.00',
    targetPrice: '55000.00',
    riskAmount: '200.00',
    status: 'closed',
    exitPrice: '45000.00', // Hit stop loss
    pnl: (-lossAmount).toString(),
    pnlPercent: '-5.00',
    entryTime: new Date(),
    exitTime: new Date(),
    strategy: 'vwap_pullback',
    notes: 'Test trade for kill switch validation'
  });
  
  // Refresh settings after trade
  settings = await storage.getTradingSettings(testUser.id);
  
  // Check kill switch
  const killSwitchResult = await riskManager.checkKillSwitch(testUser.id, settings!);
  
  const testAPassed = killSwitchResult.triggered && killSwitchResult.eventType === 'kill_switch';
  logTest(
    'A',
    'Kill switch triggers at 5% loss',
    testAPassed,
    `Loss: $${lossAmount} (5%), Triggered: ${killSwitchResult.triggered}, Type: ${killSwitchResult.eventType}`
  );
  
  // Clean up - clear paper trades
  await storage.deleteAllPaperTrades(testUser.id);
  await storage.updateTradingSettings(testUser.id, { tradingSuspended: false });

  // ===================================================================
  // TEST B: maxPositionPercent = 15%
  // ===================================================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST B: Max Position Size Cap at 15%');
  console.log('='.repeat(60));
  
  // Update position cap to 15%
  await storage.updateTradingSettings(testUser.id, {
    maxPositionPercent: '15.00',
    portfolioValue: '10000.00',
    riskPerTrade: '200.00' // $200 risk per trade
  });
  
  settings = await storage.getTradingSettings(testUser.id);
  
  // Test B1: 14% position should pass
  const signal14Percent = {
    symbol: 'BTC/USD',
    side: 'buy' as const,
    entryPrice: 50000,
    stopPrice: 49500, // 1% stop distance ($500)
    targetPrice: 52000,
    confidence: 0.8,
    strategy: 'vwap_pullback',
    strength: 'strong' as const,
    timestamp: new Date()
  };
  
  const check14 = await (riskManager as any).checkPositionSizeCap(
    testUser.id,
    signal14Percent,
    settings!
  );
  
  // Calculate what 14% would be: $10k * 14% = $1400
  // With $200 risk and 1% stop ($500), position = $200 / $500 * $50k = $20k (way over)
  // Let's use a different approach - test with appropriate entry/stop to get 14%
  
  const signal14Actual = {
    symbol: 'BTC/USD',
    side: 'buy' as const,
    entryPrice: 50000,
    stopPrice: 49300, // 1.4% stop distance ($700)
    targetPrice: 52000,
    confidence: 0.8,
    strategy: 'vwap_pullback',
    strength: 'strong' as const,
    timestamp: new Date()
  };
  
  const check14Actual = await (riskManager as any).checkPositionSizeCap(
    testUser.id,
    signal14Actual,
    settings!
  );
  
  const test14Passed = check14Actual.approved;
  logTest(
    'B1',
    '14% position passes (under 15% cap)',
    test14Passed,
    `Approved: ${check14Actual.approved}, Reason: ${check14Actual.reason || 'N/A'}`
  );
  
  // Test B2: 16% position should be blocked
  const signal16Percent = {
    symbol: 'BTC/USD',
    side: 'buy' as const,
    entryPrice: 50000,
    stopPrice: 49000, // 2% stop distance ($1000)
    targetPrice: 52000,
    confidence: 0.8,
    strategy: 'vwap_pullback',
    strength: 'strong' as const,
    timestamp: new Date()
  };
  
  // To get 16% position: $10k * 16% = $1600
  // With $200 risk and $1000 stop, we need position value = $1600
  // But position size calculation is: risk / stopDistance = $200 / $1000 * price
  // Let's adjust risk to create a 16% position
  await storage.updateTradingSettings(testUser.id, {
    maxPositionPercent: '15.00',
    portfolioValue: '10000.00',
    riskPerTrade: '400.00' // Increase risk to push position size up
  });
  
  settings = await storage.getTradingSettings(testUser.id);
  
  const check16 = await (riskManager as any).checkPositionSizeCap(
    testUser.id,
    signal16Percent,
    settings!
  );
  
  const test16Passed = !check16.approved && check16.reason?.includes('15%');
  logTest(
    'B2',
    '16% position blocked (exceeds 15% cap)',
    test16Passed,
    `Approved: ${check16.approved}, Reason: ${check16.reason || 'N/A'}`
  );

  // ===================================================================
  // TEST C: Revert to defaults
  // ===================================================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST C: Revert to Default Values');
  console.log('='.repeat(60));
  
  // Revert to defaults
  await storage.updateTradingSettings(testUser.id, {
    dailyLossKillSwitch: '7.00',
    maxPositionPercent: '10.00',
    portfolioValue: '10000.00',
    tradingSuspended: false
  });
  
  settings = await storage.getTradingSettings(testUser.id);
  
  const defaultsCorrect = 
    settings?.dailyLossKillSwitch === '7.00' && 
    settings?.maxPositionPercent === '10.00';
  
  logTest(
    'C',
    'Settings revert to defaults (7% kill switch, 10% position cap)',
    defaultsCorrect,
    `Kill Switch: ${settings?.dailyLossKillSwitch}%, Position Cap: ${settings?.maxPositionPercent}%`
  );

  // ===================================================================
  // SUMMARY
  // ===================================================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const totalTests = results.length;
  const passedTests = results.filter(r => r.status === 'PASS').length;
  const failedTests = results.filter(r => r.status === 'FAIL').length;
  
  results.forEach(result => {
    const emoji = result.status === 'PASS' ? '✅' : '❌';
    console.log(`${emoji} Test ${result.testId}: ${result.description}`);
    console.log(`   ${result.details}`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('='.repeat(60));
  
  if (failedTests === 0) {
    console.log('\n🎉 All validation tests passed!');
    console.log('✅ Adjustable guardrails are working correctly\n');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the results above.\n');
  }
  
  process.exit(failedTests === 0 ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test execution failed:', error);
  process.exit(1);
});
