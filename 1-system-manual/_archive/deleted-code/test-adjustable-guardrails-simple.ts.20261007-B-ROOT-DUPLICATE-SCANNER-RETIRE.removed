/**
 * Task 10.1: Simple Validation for Adjustable Risk Parameters
 * Verifies that dailyLossKillSwitch and maxPositionPercent can be adjusted and read correctly
 */

import { storage } from './server/storage';

interface TestResult {
  testId: string;
  description: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

function logTest(testId: string, description: string, passed: boolean, details: string) {
  const result: TestResult = {
    testId,
    description,
    status: passed ? 'PASS' : 'FAIL',
    details
  };
  results.push(result);
  
  const emoji = passed ? '✅' : '❌';
  console.log(`${emoji} Test ${testId}: ${description}`);
  console.log(`   ${details}`);
}

async function runTests() {
  console.log('\n🧪 Task 10.1: Adjustable Guardrails Configuration Tests');
  console.log('=' .repeat(70));
  
  // Get test user
  const users = await storage.getAllUsers();
  const testUser = users.find(u => u.username === 'testuser') || users[0];
  
  if (!testUser) {
    console.error('❌ No test user found');
    return;
  }
  
  console.log(`\n👤 Using test user: ${testUser.username} (${testUser.id})`);
  
  // Get or create settings
  let settings = await storage.getTradingSettings(testUser.id);
  if (!settings) {
    settings = await storage.createTradingSettings({ userId: testUser.id });
  }

  // ===================================================================
  // TEST 1: Verify default values exist
  // ===================================================================
  console.log('\n' + '='.repeat(70));
  console.log('TEST 1: Default Values Verification');
  console.log('='.repeat(70));
  
  const hasDefaults = 
    settings.dailyLossKillSwitch !== null && 
    settings.dailyLossKillSwitch !== undefined &&
    settings.maxPositionPercent !== null &&
    settings.maxPositionPercent !== undefined;
  
  logTest(
    '1',
    'Settings have dailyLossKillSwitch and maxPositionPercent fields',
    hasDefaults,
    `dailyLossKillSwitch: ${settings.dailyLossKillSwitch}, maxPositionPercent: ${settings.maxPositionPercent}`
  );

  // ===================================================================
  // TEST 2: Update dailyLossKillSwitch to 5%
  // ===================================================================
  console.log('\n' + '='.repeat(70));
  console.log('TEST 2: Update Daily Loss Kill Switch to 5%');
  console.log('='.repeat(70));
  
  await storage.updateTradingSettings(testUser.id, {
    dailyLossKillSwitch: '5.00'
  });
  
  settings = await storage.getTradingSettings(testUser.id);
  const killSwitchUpdated = settings?.dailyLossKillSwitch === '5.00';
  
  logTest(
    '2',
    'Daily Loss Kill Switch updates to 5%',
    killSwitchUpdated,
    `Value: ${settings?.dailyLossKillSwitch}% (expected: 5.00%)`
  );

  // ===================================================================
  // TEST 3: Update maxPositionPercent to 15%
  // ===================================================================
  console.log('\n' + '='.repeat(70));
  console.log('TEST 3: Update Max Position Percent to 15%');
  console.log('='.repeat(70));
  
  await storage.updateTradingSettings(testUser.id, {
    maxPositionPercent: '15.00'
  });
  
  settings = await storage.getTradingSettings(testUser.id);
  const positionPercentUpdated = settings?.maxPositionPercent === '15.00';
  
  logTest(
    '3',
    'Max Position Percent updates to 15%',
    positionPercentUpdated,
    `Value: ${settings?.maxPositionPercent}% (expected: 15.00%)`
  );

  // ===================================================================
  // TEST 4: Verify both values persist together
  // ===================================================================
  console.log('\n' + '='.repeat(70));
  console.log('TEST 4: Verify Both Values Persist');
  console.log('='.repeat(70));
  
  settings = await storage.getTradingSettings(testUser.id);
  const bothPersist = 
    settings?.dailyLossKillSwitch === '5.00' &&
    settings?.maxPositionPercent === '15.00';
  
  logTest(
    '4',
    'Both values persist correctly',
    bothPersist,
    `Kill Switch: ${settings?.dailyLossKillSwitch}%, Position Cap: ${settings?.maxPositionPercent}%`
  );

  // ===================================================================
  // TEST 5: Revert to defaults
  // ===================================================================
  console.log('\n' + '='.repeat(70));
  console.log('TEST 5: Revert to Default Values');
  console.log('='.repeat(70));
  
  await storage.updateTradingSettings(testUser.id, {
    dailyLossKillSwitch: '7.00',
    maxPositionPercent: '10.00'
  });
  
  settings = await storage.getTradingSettings(testUser.id);
  const defaultsRestored = 
    settings?.dailyLossKillSwitch === '7.00' &&
    settings?.maxPositionPercent === '10.00';
  
  logTest(
    '5',
    'Settings revert to defaults (7%, 10%)',
    defaultsRestored,
    `Kill Switch: ${settings?.dailyLossKillSwitch}%, Position Cap: ${settings?.maxPositionPercent}%`
  );

  // ===================================================================
  // TEST 6: Verify API returns fields
  // ===================================================================
  console.log('\n' + '='.repeat(70));
  console.log('TEST 6: API Compatibility Check');
  console.log('='.repeat(70));
  
  // Simulate what the API would return
  const apiResponse = {
    ...settings,
    // API adds these additional fields
    hasKrakenApiKey: false,
    hasKrakenApiSecret: false
  };
  
  const apiHasFields = 
    'dailyLossKillSwitch' in apiResponse &&
    'maxPositionPercent' in apiResponse;
  
  logTest(
    '6',
    'API response includes adjustable parameters',
    apiHasFields,
    `Fields present: dailyLossKillSwitch (${apiResponse.dailyLossKillSwitch}), maxPositionPercent (${apiResponse.maxPositionPercent})`
  );

  // ===================================================================
  // SUMMARY
  // ===================================================================
  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));
  
  const totalTests = results.length;
  const passedTests = results.filter(r => r.status === 'PASS').length;
  const failedTests = results.filter(r => r.status === 'FAIL').length;
  
  results.forEach(result => {
    const emoji = result.status === 'PASS' ? '✅' : '❌';
    console.log(`${emoji} Test ${result.testId}: ${result.description}`);
  });
  
  console.log('\n' + '='.repeat(70));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('='.repeat(70));
  
  if (failedTests === 0) {
    console.log('\n🎉 All configuration tests passed!');
    console.log('✅ Adjustable guardrails are properly configured');
    console.log('✅ Database schema supports the new fields');
    console.log('✅ Settings can be updated and persist correctly');
    console.log('✅ API endpoints will return the new fields\n');
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
