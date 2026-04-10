import { parseIntent } from './services/intent-parser';

console.log('🧪 Testing Phase 6.8 - Unified Command & Conversation Layer\n');

const testCases = [
  "pause trading",
  "increase BTC risk to 2.5%",
  "show reasoning for last trade",
  "set risk to $200",
  "what's my trading status",
  "close ETHUSD position",
  "enable vwap_pullback strategy",
  "what are my open positions",
  "Hey, how's it going?", // Should be conversation
  "analyze BTCUSD",
  "set max exposure to 75%",
  "resume trading",
  "show my performance",
  "switch to live mode",
];

for (const input of testCases) {
  const intent = parseIntent(input);
  console.log(`Input: "${input}"`);
  console.log(`  Type: ${intent.type}`);
  console.log(`  Action: ${intent.action || 'N/A'}`);
  console.log(`  Entity: ${intent.entity || 'N/A'}`);
  console.log(`  Requires Confirmation: ${intent.requiresConfirmation}`);
  console.log(`  Parameters:`, JSON.stringify(intent.parameters, null, 2));
  console.log(`  Confidence: ${intent.confidence}`);
  console.log('');
}

console.log('✅ Intent parsing test complete');
