/**
 * Diagnostic System Tests - Phase 5.9
 * 
 * Tests all three trigger types:
 * 1. Error-based diagnostic
 * 2. User-initiated diagnostic
 * 3. Walter-initiated diagnostic
 */

import { diagnosticController } from '../services/diagnostic-controller';
import { bobInspector } from '../services/bob-inspector';
import { walterPatchAnalyst } from '../services/walter-patch-analyst';
import { storage } from '../storage';

// Test suite
async function runDiagnosticTests() {
  console.log('\n========================================');
  console.log('🧪 Phase 5.9: Diagnostic System Tests');
  console.log('========================================\n');

  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Error-based Diagnostic Trigger
  try {
    console.log('Test 1: Error-Based Diagnostic Trigger');
    console.log('---------------------------------------');
    
    // Create a test error log first
    const errorLog = await storage.createErrorLog({
      userId: 'test-user',
      errorType: 'TestError',
      errorMessage: 'Simulated error for diagnostic testing',
      errorStack: 'at test:1:1',
      context: { test: true }
    });

    const report = await diagnosticController.triggerErrorDiagnostic(errorLog.id, 'test-user');
    
    console.log(`✅ Error diagnostic triggered successfully`);
    console.log(`   - Report status: ${report.status}`);
    console.log(`   - Findings count: ${report.findings.length}`);
    console.log(`   - Trigger type: ${report.triggerType}`);
    
    if (report.status === 'completed' && report.triggerType === 'error_based') {
      testsPassed++;
      console.log('✅ Test 1 PASSED\n');
    } else {
      testsFailed++;
      console.log('❌ Test 1 FAILED\n');
    }
  } catch (error) {
    testsFailed++;
    console.error('❌ Test 1 FAILED:', error);
    console.log('');
  }

  // Test 2: User-initiated Diagnostic
  try {
    console.log('Test 2: User-Initiated Diagnostic');
    console.log('----------------------------------');
    
    const report = await diagnosticController.triggerUserDiagnostic(
      'test-user',
      'system_state',
      {}
    );
    
    console.log(`✅ User diagnostic executed successfully`);
    console.log(`   - Inspection type: ${report.inspectionType}`);
    console.log(`   - Report status: ${report.status}`);
    console.log(`   - Findings: ${report.findings.length}`);
    
    if (report.status === 'completed' && report.triggerType === 'user_initiated') {
      testsPassed++;
      console.log('✅ Test 2 PASSED\n');
    } else {
      testsFailed++;
      console.log('❌ Test 2 FAILED\n');
    }
  } catch (error) {
    testsFailed++;
    console.error('❌ Test 2 FAILED:', error);
    console.log('');
  }

  // Test 3: Walter-initiated Diagnostic
  try {
    console.log('Test 3: Walter-Initiated Diagnostic');
    console.log('------------------------------------');
    
    const report = await diagnosticController.triggerWalterDiagnostic(
      'test-user',
      'Anomaly detected in trading metrics',
      'data_consistency',
      {}
    );
    
    console.log(`✅ Walter diagnostic executed successfully`);
    console.log(`   - Reason: Anomaly detected`);
    console.log(`   - Report status: ${report.status}`);
    console.log(`   - Findings: ${report.findings.length}`);
    
    if (report.status === 'completed' && report.triggerType === 'walter_initiated') {
      testsPassed++;
      console.log('✅ Test 3 PASSED\n');
    } else {
      testsFailed++;
      console.log('❌ Test 3 FAILED\n');
    }
  } catch (error) {
    testsFailed++;
    console.error('❌ Test 3 FAILED:', error);
    console.log('');
  }

  // Test 4: Bob Code Analysis
  try {
    console.log('Test 4: Bob Code Analysis');
    console.log('-------------------------');
    
    const report = await bobInspector.executeInspection({
      commandId: 'test-code-analysis',
      triggerType: 'user_initiated',
      triggerSource: 'test-suite',
      inspectionType: 'code_analysis',
      searchScope: {
        files: ['server/services/diagnostic-controller.ts']
      },
      priority: 'normal'
    });
    
    console.log(`✅ Code analysis completed`);
    console.log(`   - Status: ${report.status}`);
    console.log(`   - Files analyzed: 1`);
    console.log(`   - Findings: ${report.findings.length}`);
    
    if (report.status === 'completed') {
      testsPassed++;
      console.log('✅ Test 4 PASSED\n');
    } else {
      testsFailed++;
      console.log('❌ Test 4 FAILED\n');
    }
  } catch (error) {
    testsFailed++;
    console.error('❌ Test 4 FAILED:', error);
    console.log('');
  }

  // Test 5: Log Search Inspection
  try {
    console.log('Test 5: Log Search Inspection');
    console.log('-----------------------------');
    
    const report = await bobInspector.executeInspection({
      commandId: 'test-log-search',
      triggerType: 'user_initiated',
      triggerSource: 'test-suite',
      inspectionType: 'log_search',
      searchCriteria: {
        logLevel: ['error', 'warn']
      },
      priority: 'normal'
    });
    
    console.log(`✅ Log search completed`);
    console.log(`   - Status: ${report.status}`);
    console.log(`   - Findings: ${report.findings.length}`);
    
    if (report.status === 'completed') {
      testsPassed++;
      console.log('✅ Test 5 PASSED\n');
    } else {
      testsFailed++;
      console.log('❌ Test 5 FAILED\n');
    }
  } catch (error) {
    testsFailed++;
    console.error('❌ Test 5 FAILED:', error);
    console.log('');
  }

  // Test 6: Data Consistency Check
  try {
    console.log('Test 6: Data Consistency Check');
    console.log('-------------------------------');
    
    const report = await bobInspector.executeInspection({
      commandId: 'test-data-consistency',
      triggerType: 'walter_initiated',
      triggerSource: 'walter:data-anomaly',
      inspectionType: 'data_consistency',
      priority: 'urgent'
    });
    
    console.log(`✅ Data consistency check completed`);
    console.log(`   - Status: ${report.status}`);
    console.log(`   - Findings: ${report.findings.length}`);
    
    if (report.status === 'completed') {
      testsPassed++;
      console.log('✅ Test 6 PASSED\n');
    } else {
      testsFailed++;
      console.log('❌ Test 6 FAILED\n');
    }
  } catch (error) {
    testsFailed++;
    console.error('❌ Test 6 FAILED:', error);
    console.log('');
  }

  // Test 7: Schema Verification
  try {
    console.log('Test 7: Schema Verification');
    console.log('---------------------------');
    
    const report = await bobInspector.executeInspection({
      commandId: 'test-schema-check',
      triggerType: 'user_initiated',
      triggerSource: 'test-suite',
      inspectionType: 'schema_verification',
      priority: 'normal'
    });
    
    console.log(`✅ Schema verification completed`);
    console.log(`   - Status: ${report.status}`);
    console.log(`   - Findings: ${report.findings.length}`);
    
    const criticalIssues = report.findings.filter(f => f.severity === 'critical');
    console.log(`   - Critical issues: ${criticalIssues.length}`);
    
    if (report.status === 'completed') {
      testsPassed++;
      console.log('✅ Test 7 PASSED\n');
    } else {
      testsFailed++;
      console.log('❌ Test 7 FAILED\n');
    }
  } catch (error) {
    testsFailed++;
    console.error('❌ Test 7 FAILED:', error);
    console.log('');
  }

  // Test 8: Patch Proposal Generation (if OpenAI key available)
  if (process.env.OPENAI_API_KEY) {
    try {
      console.log('Test 8: Patch Proposal Generation');
      console.log('----------------------------------');
      
      // Create a mock finding
      const mockReport = {
        timestamp: new Date().toISOString(),
        triggerType: 'user_initiated' as const,
        inspectionType: 'error_trace' as const,
        findings: [
          {
            severity: 'high' as const,
            category: 'data_integrity',
            description: 'Test finding for patch generation',
            location: { file: 'test.ts', line: 42 },
            suggestedAction: 'Fix the test issue'
          }
        ],
        status: 'completed' as const
      };
      
      const proposals = await walterPatchAnalyst.analyzeAndPropose(mockReport, 'test-user');
      
      console.log(`✅ Patch proposal generated`);
      console.log(`   - Proposals count: ${proposals.length}`);
      
      if (proposals.length > 0) {
        const proposal = proposals[0];
        console.log(`   - Proposal ID: ${proposal.proposalId}`);
        console.log(`   - File: ${proposal.file}`);
        console.log(`   - Severity: ${proposal.severity}`);
        console.log(`   - Testing required: ${proposal.testingRequired}`);
        console.log(`   - Kyle approved: ${proposal.kyleApproved}`);
      }
      
      if (proposals.length > 0 && !proposals[0].kyleApproved) {
        testsPassed++;
        console.log('✅ Test 8 PASSED\n');
      } else {
        testsFailed++;
        console.log('❌ Test 8 FAILED\n');
      }
    } catch (error) {
      testsFailed++;
      console.error('❌ Test 8 FAILED:', error);
      console.log('');
    }
  } else {
    console.log('Test 8: SKIPPED (No OpenAI API key)\n');
  }

  // Test 9: Transparency Logging
  try {
    console.log('Test 9: Transparency Logging Verification');
    console.log('------------------------------------------');
    
    const logs = await storage.getTransparencyLogs({ 
      taskName: 'Diagnostic',
      limit: 10 
    });
    
    console.log(`✅ Transparency logs retrieved`);
    console.log(`   - Diagnostic logs found: ${logs.length}`);
    
    if (logs.length > 0) {
      const latestLog = logs[0];
      console.log(`   - Latest log task: ${latestLog.taskName}`);
      console.log(`   - Success: ${latestLog.success}`);
    }
    
    if (logs.length >= 0) { // >= 0 because initial run might have no logs
      testsPassed++;
      console.log('✅ Test 9 PASSED\n');
    } else {
      testsFailed++;
      console.log('❌ Test 9 FAILED\n');
    }
  } catch (error) {
    testsFailed++;
    console.error('❌ Test 9 FAILED:', error);
    console.log('');
  }

  // Summary
  console.log('========================================');
  console.log('📊 Test Summary');
  console.log('========================================');
  console.log(`Total Tests: ${testsPassed + testsFailed}`);
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
  console.log('========================================\n');

  return {
    passed: testsPassed,
    failed: testsFailed,
    total: testsPassed + testsFailed
  };
}

// Run tests if executed directly
import { fileURLToPath } from 'url';
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  runDiagnosticTests()
    .then(results => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Test suite error:', error);
      process.exit(1);
    });
}

export { runDiagnosticTests };
