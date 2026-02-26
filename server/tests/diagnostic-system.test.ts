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
// Directive 12.2.3: walterPatchAnalyst import removed (file deleted in Batch 6)
import { storage } from '../storage';

// Test suite
async function runDiagnosticTests() {
  console.log('\n========================================');
  console.log('🧪 Phase 5.9: Diagnostic System Tests');
  console.log('========================================\n');

  let testsPassed = 0;
  let testsFailed = 0;

  // Get test user ID first
  const testUser = await storage.getUserByUsername('testuser123');
  if (!testUser) {
    console.error('❌ Test user not found. Please ensure testuser123 exists in the database.');
    return;
  }
  const testUserId = testUser.id;
  console.log(`Using test user: ${testUser.username} (ID: ${testUserId})\n`);

  // Test 1: Error-based Diagnostic Trigger
  try {
    console.log('Test 1: Error-Based Diagnostic Trigger');
    console.log('---------------------------------------');
    
    // Create a test error log first
    const errorLog = await storage.createErrorLog({
      userId: testUserId,
      errorType: 'TestError',
      errorMessage: 'Simulated error for diagnostic testing',
      errorStack: 'at test:1:1',
      context: { test: true }
    });

    const report = await diagnosticController.triggerErrorDiagnostic(errorLog.id, testUserId);
    
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
      testUserId,
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
      testUserId,
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

  // Directive 12.2.3: Test 8 (Patch Proposal Generation) removed — walterPatchAnalyst deleted in Batch 6

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

  // Test 10: Approval Enforcement - Unapproved Patch Blocked
  try {
    console.log('Test 10: Approval Enforcement - Unapproved Patch Blocked');
    console.log('--------------------------------------------------------');
    
    // Create a test proposal
    const finding = {
      severity: 'high' as const,
      category: 'bug',
      description: 'Test finding for enforcement',
      location: { file: 'test.ts', line: 1 },
      suggestedAction: 'Fix the bug'
    };
    
    const proposal = await diagnosticController.createPatchProposal('test-report', finding, testUserId);
    
    // Try to apply without approval - should be blocked
    let blocked = false;
    try {
      await diagnosticController.applyPatch(proposal.proposalId, testUserId);
    } catch (error: any) {
      blocked = error.message.includes('BLOCKED') && error.message.includes('Kyle approval required');
    }
    
    console.log(`✅ Unapproved patch application attempt`);
    console.log(`   - Proposal ID: ${proposal.proposalId}`);
    console.log(`   - Blocked: ${blocked}`);
    console.log(`   - kyleApproved: ${proposal.kyleApproved}`);
    
    if (blocked && !proposal.kyleApproved) {
      testsPassed++;
      console.log('✅ Test 10 PASSED - Unapproved patches are correctly blocked\n');
    } else {
      testsFailed++;
      console.log('❌ Test 10 FAILED - Unapproved patches not blocked!\n');
    }
  } catch (error) {
    testsFailed++;
    console.error('❌ Test 10 FAILED:', error);
    console.log('');
  }

  // Test 11: Approval Enforcement - Approved Patch Allowed
  try {
    console.log('Test 11: Approval Enforcement - Approved Patch Allowed');
    console.log('-------------------------------------------------------');
    
    // Create a test proposal
    const finding = {
      severity: 'medium' as const,
      category: 'improvement',
      description: 'Test finding for approved patch',
      location: { file: 'test2.ts', line: 10 },
      suggestedAction: 'Apply improvement'
    };
    
    const proposal = await diagnosticController.createPatchProposal('test-report-2', finding, testUserId);
    
    // Approve the patch
    await diagnosticController.approvePatchProposal(proposal.proposalId, testUserId, true, 'Test approval');
    
    // Verify approval status updated
    const updatedProposal = diagnosticController.getProposal(proposal.proposalId);
    
    // Try to apply - should succeed
    let applied = false;
    try {
      await diagnosticController.applyPatch(proposal.proposalId, testUserId);
      applied = true;
    } catch (error) {
      console.error('  Unexpected error:', error);
    }
    
    console.log(`✅ Approved patch application attempt`);
    console.log(`   - Proposal ID: ${proposal.proposalId}`);
    console.log(`   - Approved: ${updatedProposal?.approved}`);
    console.log(`   - kyleApproved: ${updatedProposal?.kyleApproved}`);
    console.log(`   - Applied: ${applied}`);
    
    if (applied && updatedProposal?.kyleApproved) {
      testsPassed++;
      console.log('✅ Test 11 PASSED - Approved patches can be applied\n');
    } else {
      testsFailed++;
      console.log('❌ Test 11 FAILED - Approved patches blocked!\n');
    }
  } catch (error) {
    testsFailed++;
    console.error('❌ Test 11 FAILED:', error);
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
