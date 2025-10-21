/**
 * Test script to verify Walter's execution pipeline authentication context
 * Tests that watchlist commands receive authenticated userId properly
 */

import { nlaiInterpreter } from './server/services/nlai-interpreter';

// Test user ID (from testuser123)
const TEST_USER_ID = '14e0809e-3ca8-413d-878f-c55f9d837fae';

async function runTests() {
  console.log('='.repeat(60));
  console.log('WALTER EXECUTION PIPELINE AUTHENTICATION TEST');
  console.log('='.repeat(60));
  
  // Test 1: Set default watchlist
  console.log('\n[TEST 1] Setting default watchlist...');
  try {
    const result1 = await nlaiInterpreter.interpret(
      TEST_USER_ID,
      'Please set a default watchlist',
      { mode: 'paper', source: 'api' }
    );
    
    console.log('✅ Test 1 Result:');
    console.log(`   Actionable: ${result1.isActionable}`);
    console.log(`   Action ID: ${result1.actionId}`);
    console.log(`   Success: ${result1.executionResult?.success}`);
    console.log(`   Message: ${result1.executionResult?.message}`);
    if (result1.executionResult?.data) {
      console.log(`   Data:`, result1.executionResult.data);
    }
  } catch (error: any) {
    console.error('❌ Test 1 Failed:', error.message);
  }
  
  // Test 2: Get watchlist
  console.log('\n[TEST 2] Getting current watchlist...');
  try {
    const result2 = await nlaiInterpreter.interpret(
      TEST_USER_ID,
      'Show me my watchlist',
      { mode: 'paper', source: 'api' }
    );
    
    console.log('✅ Test 2 Result:');
    console.log(`   Actionable: ${result2.isActionable}`);
    console.log(`   Action ID: ${result2.actionId}`);
    console.log(`   Success: ${result2.executionResult?.success}`);
    console.log(`   Message: ${result2.executionResult?.message}`);
    if (result2.executionResult?.data) {
      console.log(`   Pairs:`, result2.executionResult.data.pairs?.map((p: any) => p.symbol).join(', '));
    }
  } catch (error: any) {
    console.error('❌ Test 2 Failed:', error.message);
  }
  
  // Test 3: Check trading status
  console.log('\n[TEST 3] Checking trading status...');
  try {
    const result3 = await nlaiInterpreter.interpret(
      TEST_USER_ID,
      'Check simulation status',
      { mode: 'paper', source: 'api' }
    );
    
    console.log('✅ Test 3 Result:');
    console.log(`   Actionable: ${result3.isActionable}`);
    console.log(`   Action ID: ${result3.actionId}`);
    console.log(`   Success: ${result3.executionResult?.success}`);
    console.log(`   Message: ${result3.executionResult?.message}`);
    if (result3.executionResult?.data) {
      console.log(`   Running: ${result3.executionResult.data.isRunning}`);
      console.log(`   Status:`, JSON.stringify(result3.executionResult.data, null, 2));
    }
  } catch (error: any) {
    console.error('❌ Test 3 Failed:', error.message);
  }
  
  // Test 4: Update risk per trade (guardrails test)
  console.log('\n[TEST 4] Updating risk per trade (guardrails)...');
  try {
    const result4 = await nlaiInterpreter.interpret(
      TEST_USER_ID,
      'Set risk per trade to 2%',
      { mode: 'paper', source: 'api' }
    );
    
    console.log('✅ Test 4 Result:');
    console.log(`   Actionable: ${result4.isActionable}`);
    console.log(`   Action ID: ${result4.actionId}`);
    console.log(`   Success: ${result4.executionResult?.success}`);
    console.log(`   Message: ${result4.executionResult?.message}`);
  } catch (error: any) {
    console.error('❌ Test 4 Failed:', error.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log('✅ All tests completed! Review results above for details.');
  console.log('\nIf all tests show success:true, authentication context is');
  console.log('flowing correctly through Walter\'s execution pipeline.');
  console.log('='.repeat(60) + '\n');
}

// Run tests
runTests().catch(console.error);
