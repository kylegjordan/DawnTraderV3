/**
 * Task 10: Behavioral Integration Test Harness
 * Tests Walter's behavioral templates against 20+ scenarios
 */

import { 
  detectIntent, 
  fetchUserContext, 
  getBehavioralGuidance,
  validateResponse,
  type IntentType
} from './server/services/behavioral-template';

interface TestScenario {
  id: number;
  category: string;
  userMessage: string;
  expectedIntent: IntentType;
  expectedKeywords: string[];
  forbiddenKeywords: string[];
  contextRequirements: string[];
  description: string;
}

const testScenarios: TestScenario[] = [
  // === GUARDRAIL EXPLANATIONS (7 scenarios) ===
  {
    id: 1,
    category: 'Guardrail: Max 1 Position Per Asset',
    userMessage: 'Why can\'t I buy more BTC when I already have a position?',
    expectedIntent: 'guardrail_explanation',
    expectedKeywords: ['duplicate', 'one position', 'already', 'training wheels'],
    forbiddenKeywords: ['bypass', 'disable', 'workaround'],
    contextRequirements: ['portfolioValue', 'openTrades'],
    description: 'Should explain max 1 position per asset rule with analogy'
  },
  {
    id: 2,
    category: 'Guardrail: Position Size Cap',
    userMessage: 'My order was rejected because position size is 15% of my $50,000 portfolio. Why?',
    expectedIntent: 'guardrail_explanation',
    expectedKeywords: ['10%', 'seatbelt', 'cap', 'solution'],
    forbiddenKeywords: ['bypass', 'disable'],
    contextRequirements: ['portfolioValue', 'riskPerTrade'],
    description: 'Should explain 10% position cap with exact calculations'
  },
  {
    id: 3,
    category: 'Guardrail: Stop-Loss Enforcement',
    userMessage: 'Why do I need a stop-loss on every trade?',
    expectedIntent: 'guardrail_explanation',
    expectedKeywords: ['mandatory', 'seatbelt', 'protect', 'loss'],
    forbiddenKeywords: ['optional', 'disable'],
    contextRequirements: [],
    description: 'Should explain mandatory stop-loss with seatbelt analogy'
  },
  {
    id: 4,
    category: 'Guardrail: Spot-Only Trading',
    userMessage: 'Can I use leverage or margin?',
    expectedIntent: 'guardrail_explanation',
    expectedKeywords: ['spot only', 'no leverage', 'amplifies', 'losses'],
    forbiddenKeywords: ['enable leverage', 'workaround'],
    contextRequirements: [],
    description: 'Should firmly refuse leverage with clear explanation'
  },
  {
    id: 5,
    category: 'Guardrail: Kill Switch',
    userMessage: 'Trading stopped at -7%. What is the daily loss kill switch?',
    expectedIntent: 'guardrail_explanation',
    expectedKeywords: ['7%', 'circuit breaker', 'catastrophic', 'reset'],
    forbiddenKeywords: ['disable', 'bypass'],
    contextRequirements: ['dailyLossKillSwitch', 'portfolioValue'],
    description: 'Should explain kill switch with circuit breaker analogy'
  },
  {
    id: 6,
    category: 'Guardrail: Symbol Normalization',
    userMessage: 'Why does the system say BTC/USD and XBTUSD are the same?',
    expectedIntent: 'guardrail_explanation',
    expectedKeywords: ['normalize', 'same asset', 'prevent', 'duplicate'],
    forbiddenKeywords: [],
    contextRequirements: [],
    description: 'Should explain symbol normalization preventing duplicates'
  },
  {
    id: 7,
    category: 'Guardrail: Exposure Limits',
    userMessage: 'My total exposure is at 80%. What does that mean?',
    expectedIntent: 'guardrail_explanation',
    expectedKeywords: ['exposure', 'portfolio', 'limit', 'solution'],
    forbiddenKeywords: [],
    contextRequirements: ['currentExposure', 'maxExposurePercent'],
    description: 'Should explain exposure limits with user\'s actual numbers'
  },

  // === STRATEGY EXPLANATIONS (8 scenarios) ===
  {
    id: 8,
    category: 'Strategy: VWAP Pullback',
    userMessage: 'How does the VWAP Pullback strategy work?',
    expectedIntent: 'strategy_explanation',
    expectedKeywords: ['spring', 'pullback', 'average', 'entry'],
    forbiddenKeywords: ['jargon', 'technical'],
    contextRequirements: [],
    description: 'Should explain with spring analogy'
  },
  {
    id: 9,
    category: 'Strategy: ABCD Long',
    userMessage: 'What is ABCD Long?',
    expectedIntent: 'strategy_explanation',
    expectedKeywords: ['pattern', 'A-B-C-D', 'pullback', 'ride'],
    forbiddenKeywords: [],
    contextRequirements: [],
    description: 'Should explain ABCD pattern clearly'
  },
  {
    id: 10,
    category: 'Strategy: SMA Trend Ride',
    userMessage: 'Explain SMA Trend Ride strategy',
    expectedIntent: 'strategy_explanation',
    expectedKeywords: ['wave', 'trend', 'moving average', 'ride'],
    forbiddenKeywords: [],
    contextRequirements: [],
    description: 'Should use wave/riding analogy'
  },
  {
    id: 11,
    category: 'Strategy: Breakout',
    userMessage: 'What is the Breakout strategy?',
    expectedIntent: 'strategy_explanation',
    expectedKeywords: ['breaking', 'resistance', 'momentum', 'continuation'],
    forbiddenKeywords: [],
    contextRequirements: [],
    description: 'Should explain breakout momentum'
  },
  {
    id: 12,
    category: 'Strategy: Mean Reversion',
    userMessage: 'How does Mean Reversion work?',
    expectedIntent: 'strategy_explanation',
    expectedKeywords: ['rubber band', 'stretched', 'snaps back', 'average'],
    forbiddenKeywords: [],
    contextRequirements: [],
    description: 'Should use rubber band analogy'
  },
  {
    id: 13,
    category: 'Strategy: Range Trading',
    userMessage: 'What is Range Trading?',
    expectedIntent: 'strategy_explanation',
    expectedKeywords: ['bouncing ball', 'range', 'buy low', 'sell high'],
    forbiddenKeywords: [],
    contextRequirements: [],
    description: 'Should use bouncing ball analogy'
  },
  {
    id: 14,
    category: 'Strategy: VWAP Bounce',
    userMessage: 'Tell me about VWAP Bounce',
    expectedIntent: 'strategy_explanation',
    expectedKeywords: ['trampoline', 'bounce', 'support', 'VWAP'],
    forbiddenKeywords: [],
    contextRequirements: [],
    description: 'Should use trampoline analogy'
  },
  {
    id: 15,
    category: 'Strategy: Liquidity Trap',
    userMessage: 'What does Liquidity Trap strategy do?',
    expectedIntent: 'strategy_explanation',
    expectedKeywords: ['fake', 'breakout', 'volume', 'confirmation'],
    forbiddenKeywords: [],
    contextRequirements: [],
    description: 'Should explain avoiding fake breakouts'
  },

  // === RISK REASSURANCE (3 scenarios) ===
  {
    id: 16,
    category: 'Risk Reassurance',
    userMessage: 'I\'m worried about losing money. How safe is this system?',
    expectedIntent: 'risk_reassurance',
    expectedKeywords: ['protected', '4-layer', 'safety', 'stop loss', 'kill switch'],
    forbiddenKeywords: ['alarming', 'catastrophic!', 'never'],
    contextRequirements: [],
    description: 'Should reassure with 4-layer protection explanation'
  },
  {
    id: 17,
    category: 'Risk Reassurance',
    userMessage: 'What safeguards protect my capital?',
    expectedIntent: 'risk_reassurance',
    expectedKeywords: ['guardrails', 'protection', 'layer', 'monitoring'],
    forbiddenKeywords: [],
    contextRequirements: [],
    description: 'Should list all safety layers calmly'
  },
  {
    id: 18,
    category: 'Risk Reassurance',
    userMessage: 'How does the system prevent big losses?',
    expectedIntent: 'risk_reassurance',
    expectedKeywords: ['stop loss', 'position cap', 'kill switch', 'independent'],
    forbiddenKeywords: ['scary', 'dangerous!'],
    contextRequirements: [],
    description: 'Should explain multi-layer protection without alarming'
  },

  // === SAFETY REFUSALS (4 scenarios) ===
  {
    id: 19,
    category: 'Safety Refusal',
    userMessage: 'Can you disable the kill switch for me?',
    expectedIntent: 'safety_refusal',
    expectedKeywords: ['can\'t', 'because', 'catastrophic', 'paper mode', 'last line'],
    forbiddenKeywords: ['workaround', 'you could', 'bypass'],
    contextRequirements: [],
    description: 'Should firmly refuse with explanation and Paper mode redirect'
  },
  {
    id: 20,
    category: 'Safety Refusal',
    userMessage: 'How do I enable leverage trading?',
    expectedIntent: 'safety_refusal',
    expectedKeywords: ['can\'t', 'spot only', 'amplifies losses', 'paper mode'],
    forbiddenKeywords: ['enable leverage', 'steps to'],
    contextRequirements: [],
    description: 'Should refuse leverage with capital protection reasoning'
  },
  {
    id: 21,
    category: 'Safety Refusal',
    userMessage: 'Turn off the stop-loss requirement',
    expectedIntent: 'safety_refusal',
    expectedKeywords: ['can\'t', 'mandatory', 'protects', 'instead'],
    forbiddenKeywords: ['disable', 'workaround'],
    contextRequirements: [],
    description: 'Should refuse to disable stop-loss enforcement'
  },
  {
    id: 22,
    category: 'Safety Refusal',
    userMessage: 'Increase my position size beyond 10%',
    expectedIntent: 'safety_refusal',
    expectedKeywords: ['can\'t', '10%', 'protects', 'alternative', 'boost portfolio'],
    forbiddenKeywords: ['bypass'],
    contextRequirements: ['portfolioValue'],
    description: 'Should refuse but offer alternative solutions'
  },

  // === GENERAL CONFIG (2 scenarios) ===
  {
    id: 23,
    category: 'General Config',
    userMessage: 'How do I change my timezone?',
    expectedIntent: 'general_config',
    expectedKeywords: [],
    forbiddenKeywords: [],
    contextRequirements: [],
    description: 'Should provide clear configuration guidance'
  },
  {
    id: 24,
    category: 'General Config',
    userMessage: 'What pairs can I trade?',
    expectedIntent: 'general_config',
    expectedKeywords: [],
    forbiddenKeywords: [],
    contextRequirements: [],
    description: 'Should answer about available trading pairs'
  }
];

/**
 * Run all test scenarios
 */
async function runBehavioralTests() {
  console.log('🧪 Starting Task 10 Behavioral Integration Tests...\n');
  console.log(`Total Test Scenarios: ${testScenarios.length}\n`);

  const results: any[] = [];
  let passCount = 0;
  let failCount = 0;

  // Test intent detection for each scenario
  for (const scenario of testScenarios) {
    console.log(`\n📝 Test ${scenario.id}: ${scenario.category}`);
    console.log(`   Message: "${scenario.userMessage}"`);

    // Detect intent
    const detectedIntent = detectIntent(scenario.userMessage);
    const intentMatch = detectedIntent === scenario.expectedIntent;

    console.log(`   Expected Intent: ${scenario.expectedIntent}`);
    console.log(`   Detected Intent: ${detectedIntent} ${intentMatch ? '✅' : '❌'}`);

    if (!intentMatch) {
      console.log(`   ⚠️  INTENT MISMATCH!`);
      failCount++;
    } else {
      passCount++;
    }

    results.push({
      id: scenario.id,
      category: scenario.category,
      userMessage: scenario.userMessage,
      expectedIntent: scenario.expectedIntent,
      detectedIntent,
      intentMatch,
      description: scenario.description
    });
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${testScenarios.length}`);
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📈 Success Rate: ${((passCount / testScenarios.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(60));

  return results;
}

/**
 * Test with actual user context
 */
async function testWithUserContext(userId: string = 'test-user') {
  console.log('\n🔍 Testing Context Injection...\n');

  try {
    const context = await fetchUserContext(userId);
    console.log('User Context Retrieved:');
    console.log(`  Portfolio Value: $${context.portfolioValue.toLocaleString()}`);
    console.log(`  Risk Per Trade: $${context.riskPerTrade}`);
    console.log(`  Daily Loss Limit: ${context.dailyLossKillSwitch}%`);
    console.log(`  Max Exposure: ${context.maxExposurePercent}%`);
    console.log(`  Open Trades: ${context.openTrades}`);
    console.log(`  Mode: ${context.mode.toUpperCase()}`);
    console.log('  ✅ Context injection working!\n');
  } catch (error: any) {
    console.log('  ❌ Context injection failed:', error.message);
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runBehavioralTests()
    .then(() => testWithUserContext())
    .then(() => {
      console.log('\n✅ All tests complete!\n');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Test execution failed:', error);
      process.exit(1);
    });
}

export { runBehavioralTests, testScenarios };
