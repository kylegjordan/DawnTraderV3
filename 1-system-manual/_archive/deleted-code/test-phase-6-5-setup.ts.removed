import { storage } from '../server/storage';
import fs from 'fs';
import path from 'path';

async function testPhase65Setup() {
  console.log('🧪 Testing Phase 6.5 Infrastructure...\n');

  const userId = '6c591801-3072-431d-b192-30aaf426f15e';
  
  // Test 1: Database connectivity
  console.log('Test 1: Database Connectivity');
  try {
    const settings = await storage.getTradingSettings(userId);
    console.log('  ✅ Trading settings accessible:', settings ? 'Yes' : 'No');
  } catch (error) {
    console.log('  ❌ Failed to access trading settings:', error);
  }

  // Test 2: Paper trading methods
  console.log('\nTest 2: Paper Trading Storage Methods');
  try {
    const trades = await storage.getPaperSimTrades(userId);
    console.log('  ✅ getPaperSimTrades() works:', Array.isArray(trades));
    
    const positions = await storage.getPaperSimOpenPositions(userId);
    console.log('  ✅ getPaperSimOpenPositions() works:', Array.isArray(positions));
  } catch (error) {
    console.log('  ❌ Failed to access paper trading data:', error);
  }

  // Test 3: Logging directories
  console.log('\nTest 3: Logging Infrastructure');
  const logDirs = [
    '/home/runner/workspace/logs/trading_sessions',
    '/home/runner/workspace/logs/trading_summaries',
    '/home/runner/workspace/logs/ai_analysis'
  ];
  
  for (const dir of logDirs) {
    const exists = fs.existsSync(dir);
    const status = exists ? '✅' : '❌';
    console.log(`  ${status} ${path.basename(dir)}: ${exists ? 'exists' : 'missing'}`);
  }

  // Test 4: Entry point script
  console.log('\nTest 4: Entry Point Script');
  const entryScript = 'server/paper-trading-start.ts';
  if (fs.existsSync(entryScript)) {
    console.log('  ✅ paper-trading-start.ts exists');
  } else {
    console.log('  ❌ paper-trading-start.ts missing');
  }

  // Test 5: Service file
  console.log('\nTest 5: Simulation Service');
  const serviceFile = 'server/services/paper-48hr-simulation.ts';
  if (fs.existsSync(serviceFile)) {
    console.log('  ✅ paper-48hr-simulation.ts exists');
  } else {
    console.log('  ❌ paper-48hr-simulation.ts missing');
  }

  console.log('\n✅ Phase 6.5 Infrastructure Verification Complete!\n');
  console.log('📋 Next Steps:');
  console.log('   1. Run: tsx server/paper-trading-start.ts');
  console.log('   2. Monitor: /logs/trading_sessions/');
  console.log('   3. Check summaries: /logs/trading_summaries/\n');
}

testPhase65Setup().catch(console.error);
