/**
 * Phase 27.F - Goals Canonicalization Verification Script
 * 
 * This script verifies that the goals canonicalization is working correctly by:
 * 1. Testing that different metric name variations map to the same canonical key
 * 2. Attempting to create duplicate goals (should upsert instead of create new)
 * 3. Verifying the unique constraint is enforced
 * 4. Generating a verification report
 */

import { db } from '../db';
import { DatabaseStorage, canonicalizeMetricName } from '../storage';
import { sql } from 'drizzle-orm';

const storage = new DatabaseStorage();

interface VerificationResult {
  testName: string;
  status: 'PASS' | 'FAIL';
  details: string;
  error?: string;
}

const results: VerificationResult[] = [];

// Test 1: Verify canonicalization function works correctly
function testCanonicalization() {
  const testCases = [
    { input: 'Earnings per Day', expected: 'earningsperday' },
    { input: 'EarningsPerDay', expected: 'earningsperday' },
    { input: 'EARNINGS PER DAY', expected: 'earningsperday' },
    { input: 'Earnings-per-Day', expected: 'earningsperday' },
    { input: 'Average Return', expected: 'averagereturn' },
    { input: 'Win Rate %', expected: 'winrate' },
  ];
  
  let allPassed = true;
  let details = '';
  
  for (const testCase of testCases) {
    const result = canonicalizeMetricName(testCase.input);
    const passed = result === testCase.expected;
    if (!passed) {
      allPassed = false;
      details += `\n  ❌ "${testCase.input}" → "${result}" (expected "${testCase.expected}")`;
    } else {
      details += `\n  ✅ "${testCase.input}" → "${result}"`;
    }
  }
  
  results.push({
    testName: 'Canonicalization Function',
    status: allPassed ? 'PASS' : 'FAIL',
    details: `Tested ${testCases.length} variations:${details}`
  });
}

// Test 2: Verify upsert prevents duplicates
async function testUpsertBehavior() {
  try {
    const testUserId = '14e0809e-3ca8-413d-878f-c55f9d837fae'; // Test user
    
    // First, insert a goal with one name
    const goal1 = await storage.upsertGoalPaper({
      userId: testUserId,
      metricName: 'Earnings per Day',
      goalValue: '100.00',
      actualValue: '75.50',
      percentAchieved: '75.50',
    });
    
    // Now try to insert with different variation - should update, not create new
    const goal2 = await storage.upsertGoalPaper({
      userId: testUserId,
      metricName: 'EARNINGS PER DAY', // Different casing
      goalValue: '150.00', // Different value
      actualValue: '80.00',
      percentAchieved: '53.33',
    });
    
    // Verify they have the same ID (updated, not created new)
    if (goal1.id === goal2.id) {
      // Get all goals for this user to verify count
      const allGoals = await storage.getUserGoalsPaper(testUserId);
      const earningsGoals = allGoals.filter(g => g.metricKey === 'earningsperday');
      
      if (earningsGoals.length === 1) {
        results.push({
          testName: 'Upsert Prevents Duplicates',
          status: 'PASS',
          details: `✅ Same ID (${goal1.id.substring(0, 8)}...), updated goal value from $${goal1.goalValue} to $${goal2.goalValue}, only 1 record exists`
        });
      } else {
        results.push({
          testName: 'Upsert Prevents Duplicates',
          status: 'FAIL',
          details: `❌ Found ${earningsGoals.length} records with canonical key 'earningsperday' (expected 1)`,
          error: `Duplicate records detected`
        });
      }
    } else {
      results.push({
        testName: 'Upsert Prevents Duplicates',
        status: 'FAIL',
        details: `❌ Different IDs (${goal1.id.substring(0, 8)}... vs ${goal2.id.substring(0, 8)}...) - created duplicate instead of update`,
        error: `Upsert created new record instead of updating`
      });
    }
  } catch (error: any) {
    results.push({
      testName: 'Upsert Prevents Duplicates',
      status: 'FAIL',
      details: `Test execution failed`,
      error: error.message
    });
  }
}

// Test 3: Verify unique constraint on database
async function testUniqueConstraint() {
  try {
    const testUserId = '14e0809e-3ca8-413d-878f-c55f9d837fae';
    
    // Try to insert duplicate directly via SQL (should fail)
    try {
      await db.execute(sql`
        INSERT INTO user_goals_paper (user_id, metric_name, metric_key, goal_value)
        VALUES (${testUserId}, 'Test Duplicate', 'testduplicate', 100.00),
               (${testUserId}, 'Test Duplicate 2', 'testduplicate', 200.00)
      `);
      
      // If we get here, constraint failed
      results.push({
        testName: 'Database Unique Constraint',
        status: 'FAIL',
        details: `❌ Unique constraint not working - allowed duplicate insert`,
        error: 'Constraint validation failed'
      });
    } catch (dbError: any) {
      // Expected to fail - verify it's the right error
      if (dbError.code === '23505') { // PostgreSQL unique violation error code
        results.push({
          testName: 'Database Unique Constraint',
          status: 'PASS',
          details: `✅ Database correctly rejected duplicate (user_id + metric_key)`
        });
      } else {
        results.push({
          testName: 'Database Unique Constraint',
          status: 'FAIL',
          details: `❌ Wrong error type`,
          error: `Expected error code 23505, got ${dbError.code}: ${dbError.message}`
        });
      }
    }
  } catch (error: any) {
    results.push({
      testName: 'Database Unique Constraint',
      status: 'FAIL',
      details: `Test execution failed`,
      error: error.message
    });
  }
}

// Test 4: Verify all existing records have metric_key
async function testDataIntegrity() {
  try {
    const paperMissing = await db.execute(sql`
      SELECT COUNT(*) as count FROM user_goals_paper WHERE metric_key IS NULL
    `);
    
    const liveMissing = await db.execute(sql`
      SELECT COUNT(*) as count FROM user_goals_live WHERE metric_key IS NULL
    `);
    
    const paperCount = parseInt(paperMissing.rows[0].count);
    const liveCount = parseInt(liveMissing.rows[0].count);
    
    if (paperCount === 0 && liveCount === 0) {
      results.push({
        testName: 'Data Integrity (No NULL metric_keys)',
        status: 'PASS',
        details: `✅ All records have metric_key (paper: 0 missing, live: 0 missing)`
      });
    } else {
      results.push({
        testName: 'Data Integrity (No NULL metric_keys)',
        status: 'FAIL',
        details: `❌ Found NULL metric_keys (paper: ${paperCount}, live: ${liveCount})`,
        error: 'Data integrity violation - some records missing metric_key'
      });
    }
  } catch (error: any) {
    results.push({
      testName: 'Data Integrity (No NULL metric_keys)',
      status: 'FAIL',
      details: `Test execution failed`,
      error: error.message
    });
  }
}

// Test 5: Verify no duplicates exist
async function testNoDuplicates() {
  try {
    const paperDuplicates = await db.execute(sql`
      SELECT user_id, metric_key, COUNT(*) as count
      FROM user_goals_paper
      GROUP BY user_id, metric_key
      HAVING COUNT(*) > 1
    `);
    
    const liveDuplicates = await db.execute(sql`
      SELECT user_id, metric_key, COUNT(*) as count
      FROM user_goals_live
      GROUP BY user_id, metric_key
      HAVING COUNT(*) > 1
    `);
    
    if (paperDuplicates.rows.length === 0 && liveDuplicates.rows.length === 0) {
      results.push({
        testName: 'No Duplicate Goals',
        status: 'PASS',
        details: `✅ No duplicates found in either table`
      });
    } else {
      results.push({
        testName: 'No Duplicate Goals',
        status: 'FAIL',
        details: `❌ Found duplicates (paper: ${paperDuplicates.rows.length}, live: ${liveDuplicates.rows.length})`,
        error: 'Duplicate records still exist after migration'
      });
    }
  } catch (error: any) {
    results.push({
      testName: 'No Duplicate Goals',
      status: 'FAIL',
      details: `Test execution failed`,
      error: error.message
    });
  }
}

async function main() {
  console.log('🧪 Starting Goals Canonicalization Verification...\n');
  
  try {
    // Run all tests
    testCanonicalization();
    await testUpsertBehavior();
    await testUniqueConstraint();
    await testDataIntegrity();
    await testNoDuplicates();
    
    // Print results
    console.log('\n📋 VERIFICATION RESULTS\n');
    console.log('═'.repeat(80));
    
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    
    results.forEach((result, i) => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`\n${i + 1}. ${icon} ${result.testName}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   ${result.details}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });
    
    console.log('\n' + '═'.repeat(80));
    console.log(`\n📊 SUMMARY: ${passed} passed, ${failed} failed (${results.length} total)`);
    
    if (failed === 0) {
      console.log('\n✅ All verification tests PASSED!\n');
      process.exit(0);
    } else {
      console.log('\n❌ Some verification tests FAILED!\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Verification script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
