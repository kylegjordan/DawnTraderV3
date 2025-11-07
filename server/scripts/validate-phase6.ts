import { ConfigService } from "../services/config-service";

async function validatePhase6() {
  console.log('🔍 Validating Config Registry (Phase 6)...\n');
  
  const results: any[] = [];
  let passCount = 0;
  let failCount = 0;

  async function test(name: string, fn: () => Promise<boolean>) {
    const start = Date.now();
    try {
      const passed = await fn();
      const duration = Date.now() - start;
      
      if (passed) {
        passCount++;
        results.push({ test: name, status: 'pass', message: 'Test passed', duration });
        console.log(`✅ ${name}`);
      } else {
        failCount++;
        results.push({ test: name, status: 'fail', message: 'Test failed', duration });
        console.error(`❌ ${name}`);
      }
    } catch (error: any) {
      failCount++;
      results.push({ test: name, status: 'fail', message: error.message, duration: Date.now() - start });
      console.error(`❌ ${name}: ${error.message}`);
    }
  }

  // Test 1: Database table exists and is accessible
  await test('Config Registry Table Access', async () => {
    const configs = await ConfigService.getAll();
    return Array.isArray(configs);
  });

  // Test 2: Initial configs were seeded
  await test('Initial Configs Seeded', async () => {
    const configs = await ConfigService.getAll();
    return configs.length >= 10;
  });

  // Test 3: Boolean config retrieval
  await test('Boolean Config Retrieval', async () => {
    const value = await ConfigService.getBooleanValue('ENABLE_LATTI', true);
    return typeof value === 'boolean';
  });

  // Test 4: Number config retrieval
  await test('Number Config Retrieval', async () => {
    const value = await ConfigService.getNumberValue('MAX_POSITIONS', 0);
    return typeof value === 'number' && value === 5;
  });

  // Test 5: Config update functionality
  await test('Config Update', async () => {
    const testKey = 'TEST_CONFIG';
    await ConfigService.update(testKey, 'test_value', 'string', 'validator');
    const updated = await ConfigService.get(testKey);
    
    // Cleanup
    await ConfigService.delete(testKey);
    
    return updated?.value === 'test_value';
  });

  // Test 6: Specific key configs exist
  await test('Required Keys Exist', async () => {
    const requiredKeys = [
      'ENABLE_LATTI',
      'CLE_ENABLED',
      'REASONING_ENABLED',
      'MAX_POSITIONS',
      'KILL_SWITCH_PCT'
    ];
    
    for (const key of requiredKeys) {
      const config = await ConfigService.get(key);
      if (!config) return false;
    }
    
    return true;
  });

  // Test 7: Config types are correct
  await test('Config Types Validation', async () => {
    const enableLatti = await ConfigService.get('ENABLE_LATTI');
    const maxPos = await ConfigService.get('MAX_POSITIONS');
    
    return enableLatti?.type === 'boolean' && maxPos?.type === 'number';
  });

  // Test 8: Audit logging functionality
  await test('Config Audit Service', async () => {
    // This test just verifies the service doesn't crash
    const { ConfigAuditService } = await import('../services/config-audit-service');
    ConfigAuditService.recordChange('TEST_KEY', 'validator', 'old', 'new');
    return true;
  });

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`\n[Phase 6 Validation] Summary: ${passCount} passed, ${failCount} failed`);
  
  console.log('\n📊 Results:');
  console.table(results);

  if (failCount === 0) {
    console.log('\n[Phase 6 Validation] ✅ Validation PASSED');
    process.exit(0);
  } else {
    console.error('\n[Phase 6 Validation] ❌ Validation FAILED');
    process.exit(1);
  }
}

validatePhase6().catch((error) => {
  console.error('[Phase 6 Validation] Fatal error:', error);
  process.exit(1);
});
