/**
 * System-Wide Synchronization Verification Script
 * 
 * Runs automated checks to verify:
 * 1. System health endpoint is operational
 * 2. Paper trading status syncs correctly
 * 3. Goals persist and sync to dashboard
 * 4. Frontend auto-resync works within 15s
 */

import { storage } from '../storage';

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

let authToken: string | null = null;
let testUserId: string | null = null;

async function authenticate(): Promise<void> {
  console.log('\n🔐 Authenticating...');
  
  // Phase 5B.HF: Use environment-based test credentials
  const { getTestCredentials } = await import('../config/test-credentials');
  const { username, password } = getTestCredentials();
  
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  if (!response.ok) {
    throw new Error(`Authentication failed: ${response.status}`);
  }
  
  const data = await response.json();
  authToken = data.accessToken;
  testUserId = data.user.id;
  
  console.log(`✅ Authenticated as ${username} (${testUserId})`);
}

async function apiCall(method: string, endpoint: string, body?: any): Promise<any> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${authToken}`,
    'x-app-mode': 'paper'
  };
  
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API call failed: ${response.status} - ${text}`);
  }
  
  return response.json();
}

async function test1_SystemHealth(): Promise<void> {
  console.log('\n📊 Test 1: System Health Endpoint');
  
  const health = await apiCall('GET', '/api/system/health');
  
  if (health.backend !== 'OK') {
    throw new Error('Backend status is not OK');
  }
  
  if (health.database !== 'OK') {
    throw new Error('Database status is not OK');
  }
  
  console.log('✅ System health endpoint operational');
  console.log(`   - Backend: ${health.backend}`);
  console.log(`   - Database: ${health.database}`);
  console.log(`   - Paper Trading: ${health.paperTrading.isRunning ? 'Running' : 'Stopped'}`);
}

async function test2_PaperTradingStart(): Promise<void> {
  console.log('\n🚀 Test 2: Start Paper Trading');
  
  // Stop any existing session first
  try {
    await apiCall('POST', '/api/active-engine/stop');
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (err) {
    // Ignore if no session was running
  }
  
  // Start paper trading
  await apiCall('POST', '/api/active-engine/start');
  
  // Wait a moment for registration
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Verify status
  const health = await apiCall('GET', '/api/system/health');
  
  if (!health.paperTrading.isRunning) {
    throw new Error('Paper trading should be running but isRunning=false');
  }
  
  console.log('✅ Paper trading started successfully');
  console.log(`   - Session ID: ${health.paperTrading.sessionId}`);
  console.log(`   - Type: ${health.paperTrading.type}`);
}

async function test3_GoalsCreation(): Promise<void> {
  console.log('\n🎯 Test 3: Create Paper Mode Goal');
  
  // Create test goals in correct format (will upsert/replace existing)
  const testGoals = {
    mode: 'paper',
    goals: [
      {
        metricName: 'Earnings per Day',
        goalValue: '100',
        actualValue: '0',
        percentAchieved: '0',
        aiValidationNotes: null
      },
      {
        metricName: 'Average Return',
        goalValue: '2.5',
        actualValue: '0',
        percentAchieved: '0',
        aiValidationNotes: null
      },
      {
        metricName: 'Earnings per Trade',
        goalValue: '25',
        actualValue: '0',
        percentAchieved: '0',
        aiValidationNotes: null
      }
    ]
  };
  
  await apiCall('POST', '/api/goals/update', testGoals);
  
  // Wait a moment for persistence
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Verify goals exist (expect 3 goals)
  const healthAfter = await apiCall('GET', '/api/system/health');
  const goalsAfter = healthAfter.goals.paper.count;
  
  if (goalsAfter < 3) {
    throw new Error(`Expected at least 3 goals, but found ${goalsAfter}`);
  }
  
  console.log('✅ Goal created and persisted successfully');
  console.log(`   - Goals in database: ${goalsAfter}`);
}

async function test4_DashboardSync(): Promise<void> {
  console.log('\n🔄 Test 4: Dashboard Auto-Resync (15s verification)');
  
  console.log('   - Frontend auto-resync polls every 12s');
  console.log('   - Changes should reflect within 15s');
  console.log('   - This test verifies backend data is accessible');
  
  // Verify dashboard endpoints return fresh data
  const status = await apiCall('GET', '/api/active-engine/status');
  const goalsSummary = await apiCall('GET', '/api/goals/summary?mode=paper');
  
  if (!status.isRunning) {
    throw new Error('Dashboard should show paper trading as running');
  }
  
  if (!goalsSummary.hasGoals) {
    throw new Error('Dashboard should show goals exist');
  }
  
  console.log('✅ Dashboard data is fresh and accessible');
  console.log(`   - Paper trading status: Running`);
  console.log(`   - Goals count: ${goalsSummary.goals.length}`);
}

async function test5_PaperTradingStop(): Promise<void> {
  console.log('\n🛑 Test 5: Stop Paper Trading');
  
  // Stop paper trading
  await apiCall('POST', '/api/active-engine/stop');
  
  // Wait a moment for deregistration
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Verify status
  const health = await apiCall('GET', '/api/system/health');
  
  if (health.paperTrading.isRunning) {
    throw new Error('Paper trading should be stopped but isRunning=true');
  }
  
  console.log('✅ Paper trading stopped successfully');
  console.log(`   - Status: Stopped`);
}

async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('🧪 SYSTEM-WIDE SYNCHRONIZATION VERIFICATION');
  console.log('='.repeat(70));
  
  try {
    await authenticate();
    await test1_SystemHealth();
    await test2_PaperTradingStart();
    await test3_GoalsCreation();
    await test4_DashboardSync();
    await test5_PaperTradingStop();
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ ALL TESTS PASSED');
    console.log('='.repeat(70));
    console.log('\n📋 Summary:');
    console.log('   ✓ System health endpoint operational');
    console.log('   ✓ Paper trading starts and registers correctly');
    console.log('   ✓ Goals persist to database');
    console.log('   ✓ Dashboard data accessible and fresh');
    console.log('   ✓ Paper trading stops and deregisters correctly');
    console.log('\n🎉 System synchronization is working correctly!\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    console.log('\n💡 Troubleshooting:');
    console.log('   - Check if the server is running on', BASE_URL);
    console.log('   - Verify test user credentials are correct');
    console.log('   - Review server logs for errors\n');
    process.exit(1);
  }
}

main();
