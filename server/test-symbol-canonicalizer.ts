/**
 * Quick verification script for symbol canonicalizer quote currency fix
 * Phase 27.F.12.b
 */

import { toCanonical } from './services/utils/symbol-canonicalizer.js';

console.log('\n🧪 Testing Symbol Canonicalizer Quote Currency Fix\n');
console.log('=' .repeat(60));

// Test cases that were failing before the fix
const testCases = [
  { input: 'BTC/ZUSD', expected: 'BTC/USD' },
  { input: 'ETH/ZEUR', expected: 'ETH/EUR' },
  { input: 'SOL/ZGBP', expected: 'SOL/GBP' },
  { input: 'AAVE/XXBT', expected: 'AAVE/BTC' },
  { input: 'LINK/XETH', expected: 'LINK/ETH' },
  { input: '0G/ZEUR', expected: '0G/EUR' },
  { input: '1INCH/ZUSD', expected: '1INCH/USD' },
  { input: 'XXBTZUSD', expected: 'BTC/USD' }, // Kraken exchange ID format
  { input: 'XETHZEUR', expected: 'ETH/EUR' },
];

let passed = 0;
let failed = 0;

testCases.forEach(({ input, expected }) => {
  const result = toCanonical(input);
  const status = result === expected ? '✅ PASS' : '❌ FAIL';
  
  if (result === expected) {
    passed++;
  } else {
    failed++;
  }
  
  console.log(`${status} | Input: ${input.padEnd(15)} | Expected: ${expected.padEnd(12)} | Got: ${result}`);
});

console.log('=' .repeat(60));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests\n`);

if (failed === 0) {
  console.log('🎉 All tests passed! Quote currency mapping is working correctly.\n');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Please review the implementation.\n');
  process.exit(1);
}
