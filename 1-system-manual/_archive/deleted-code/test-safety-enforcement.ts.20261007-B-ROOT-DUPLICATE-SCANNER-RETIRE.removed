/**
 * Test safety enforcement in behavioral validation
 */

import { validateResponse, getBehavioralGuidance, type IntentType } from './server/services/behavioral-template';

interface MockContext {
  portfolioValue: number;
  riskPerTrade: number;
  dailyLossKillSwitch: number;
  maxExposurePercent: number;
  enabledStrategies: string[];
  currentExposure: number;
  openTrades: number;
  currentDailyLoss: number;
  mode: 'live' | 'paper';
}

const mockContext: MockContext = {
  portfolioValue: 50000,
  riskPerTrade: 500,
  dailyLossKillSwitch: 7.0,
  maxExposurePercent: 100,
  enabledStrategies: [],
  currentExposure: 0,
  openTrades: 0,
  currentDailyLoss: 0,
  mode: 'paper'
};

console.log('🔒 Testing Safety Enforcement\n');

// Test 1: Unsafe response with bypass suggestion
const unsafeResponse1 = "You could try disabling the kill switch by modifying the settings file directly.";
const guidance1 = getBehavioralGuidance('safety_refusal', mockContext);
const validation1 = validateResponse(unsafeResponse1, guidance1);

console.log('Test 1: Response with "disable" keyword');
console.log(`Response: "${unsafeResponse1}"`);
console.log(`Safety Compliant: ${validation1.safetyCompliant ? '✅' : '❌'}`);
console.log(`Issues: ${validation1.issues.join(', ')}`);
console.log(`Expected: Should be BLOCKED\n`);

// Test 2: Unsafe response with workaround
const unsafeResponse2 = "Here's a workaround to bypass the position size cap...";
const guidance2 = getBehavioralGuidance('safety_refusal', mockContext);
const validation2 = validateResponse(unsafeResponse2, guidance2);

console.log('Test 2: Response with "workaround" and "bypass" keywords');
console.log(`Response: "${unsafeResponse2}"`);
console.log(`Safety Compliant: ${validation2.safetyCompliant ? '✅' : '❌'}`);
console.log(`Issues: ${validation2.issues.join(', ')}`);
console.log(`Expected: Should be BLOCKED\n`);

// Test 3: Safe response (proper refusal)
const safeResponse = "I can't disable the kill switch - it's your last line of defense against catastrophic losses. Instead, try Paper mode to experiment without real capital at risk.";
const guidance3 = getBehavioralGuidance('safety_refusal', mockContext);
const validation3 = validateResponse(safeResponse, guidance3);

console.log('Test 3: Safe refusal response');
console.log(`Response: "${safeResponse}"`);
console.log(`Safety Compliant: ${validation3.safetyCompliant ? '✅' : '❌'}`);
console.log(`Passed: ${validation3.passed ? '✅' : '❌'}`);
console.log(`Expected: Should be ALLOWED\n`);

// Summary
console.log('='.repeat(60));
console.log('📊 SAFETY ENFORCEMENT SUMMARY');
console.log('='.repeat(60));
console.log(`Test 1 (unsafe "disable"): ${validation1.safetyCompliant ? '❌ FAILED - allowed unsafe' : '✅ PASSED - blocked'}`);
console.log(`Test 2 (unsafe "bypass/workaround"): ${validation2.safetyCompliant ? '❌ FAILED - allowed unsafe' : '✅ PASSED - blocked'}`);
console.log(`Test 3 (safe refusal): ${validation3.safetyCompliant ? '✅ PASSED - allowed safe' : '❌ FAILED - blocked safe'}`);
console.log('='.repeat(60));

// Exit with appropriate code
const allPassed = !validation1.safetyCompliant && !validation2.safetyCompliant && validation3.safetyCompliant;
process.exit(allPassed ? 0 : 1);
