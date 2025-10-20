import { toCanonical, canonicalFromPairInfo } from './services/utils/symbol-canonicalizer.js';

console.log('Testing toCanonical normalization:\n');

// Test cases from the logs
const testCases = [
  { input: '0G/ZEUR', expected: '0G/EUR' },
  { input: '0G/ZUSD', expected: '0G/USD' },
  { input: '1INCH/ZEUR', expected: '1INCH/EUR' },
  { input: '1INCH/ZUSD', expected: '1INCH/USD' },
  { input: 'AAVE/XETH', expected: 'AAVE/ETH' },
  { input: 'AAVE/XXBT', expected: 'AAVE/BTC' },
];

testCases.forEach(({ input, expected }) => {
  const result = toCanonical(input);
  const status = result === expected ? '✅' : '❌';
  console.log(`${status} toCanonical('${input}') = '${result}' (expected: '${expected}')`);
});

console.log('\nTesting canonicalFromPairInfo:\n');

const pairInfoTests = [
  { pairInfo: { base: '0G', quote: 'ZEUR' }, expected: '0G/EUR' },
  { pairInfo: { base: '1INCH', quote: 'ZUSD' }, expected: '1INCH/USD' },
  { pairInfo: { base: 'AAVE', quote: 'XETH' }, expected: 'AAVE/ETH' },
];

pairInfoTests.forEach(({ pairInfo, expected }) => {
  const result = canonicalFromPairInfo(pairInfo);
  const status = result === expected ? '✅' : '❌';
  console.log(`${status} canonicalFromPairInfo({base: '${pairInfo.base}', quote: '${pairInfo.quote}'}) = '${result}' (expected: '${expected}')`);
});
