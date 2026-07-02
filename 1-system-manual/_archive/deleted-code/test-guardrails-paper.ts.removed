/**
 * Paper Mode Guardrail Test Harness
 * Tests all Task 8 safety guardrails with evidence capture
 */

import { storage } from './server/storage';
import { RiskManager } from './server/services/risk-manager';
import { KrakenService } from './server/services/kraken';
import { StrategySignal } from './server/services/strategy-engine';
import { TradingSettings } from './shared/schema';

interface TestResult {
  scenario: string;
  trigger: string;
  expected: string;
  actual: string;
  passed: boolean;
  evidence: {
    details?: string;
    timestamp: string;
  };
}

class GuardrailTestHarness {
  private results: TestResult[] = [];
  private testUserId = '';
  private riskManager: RiskManager;
  private krakenService: KrakenService;

  constructor() {
    this.riskManager = new RiskManager();
    this.krakenService = new KrakenService();
  }

  async initialize() {
    console.log('\n🧪 Initializing Guardrail Test Harness (Paper Mode)\n');
    
    // Use test user from environment
    const testEmail = process.env.TEST_USER_EMAIL;
    if (!testEmail) {
      throw new Error('TEST_USER_EMAIL not found in environment');
    }

    // Get user by email
    const user = await storage.getUserByEmail(testEmail);
    if (!user) {
      throw new Error(`Test user not found: ${testEmail}`);
    }

    this.testUserId = user.id;

    // Get or create settings
    const existingSettings = await storage.getTradingSettings(user.id);
    if (!existingSettings) {
      await storage.createTradingSettings({
        userId: user.id,
        krakenApiKey: 'test-key',
        krakenApiSecret: 'test-secret',
        tradingEnabled: true,
        riskPerTrade: 100,
        maxExposure: 500,
        maxOpenTrades: 5,
        dailyLossKillSwitch: 7.0,
        portfolioValue: 10000
      });
    } else {
      await storage.updateTradingSettings(user.id, {
        tradingEnabled: true,
        riskPerTrade: 100,
        maxExposure: 500,
        maxOpenTrades: 5,
        dailyLossKillSwitch: 7.0,
        portfolioValue: 10000,
        tradingSuspended: false
      });
    }

    const settings = await storage.getTradingSettings(this.testUserId);
    console.log(`✅ Test user initialized: ${user.username || testEmail} (ID: ${this.testUserId})`);
    console.log(`   Portfolio: $${settings?.portfolioValue || 10000}`);
    console.log(`   Mode: paper`);
    console.log('');
  }

  /**
   * Test Scenario A: Max 1 Position Per Asset
   */
  async testMaxOnePositionPerAsset() {
    console.log('📋 Test A: Max 1 Position Per Asset\n');

    try {
      const settings = await storage.getTradingSettings(this.testUserId);
      if (!settings) throw new Error('Settings not found');

      // Step 1: Create first BTC position
      const trade1 = await storage.createTrade({
        userId: this.testUserId,
        mode: 'paper',
        symbol: 'BTC/USD',
        side: 'buy',
        quantity: 0.1,
        entryPrice: 50000,
        stopPrice: 49000,
        targetPrice: 52000,
        status: 'open',
        strategy: 'vwap_pullback',
        riskAmount: 100
      });
      console.log(`✅ First BTC trade created: ${trade1.id}`);

      // Step 2: Attempt second BTC trade
      const signal: StrategySignal = {
        symbol: 'BTC/USD',
        strategy: 'breakout',
        entryPrice: 50100,
        stopPrice: 49100,
        targetPrice: 52100,
        confidence: 0.8,
        metadata: { reason: 'Test duplicate position' }
      };

      const result = await this.riskManager.checkPreTradeRisk(this.testUserId, signal, settings);
      
      const passed = !result.approved && result.reason?.includes('open position in BTC');
      this.recordResult({
        scenario: 'Max 1 Position Per Asset',
        trigger: 'Second BTC/USD trade',
        expected: 'Blocked - already have BTC position',
        actual: result.approved ? 'APPROVED (FAIL!)' : `Blocked: ${result.reason}`,
        passed,
        evidence: {
          details: result.reason,
          timestamp: new Date().toISOString()
        }
      });

      // Cleanup
      await storage.updateTrade(trade1.id, { status: 'closed', exitPrice: 50000 });
      console.log(`🧹 Cleaned up trade ${trade1.id}\n`);

    } catch (error) {
      this.recordResult({
        scenario: 'Max 1 Position Per Asset',
        trigger: 'Second BTC/USD trade',
        expected: 'Blocked',
        actual: `Error: ${error}`,
        passed: false,
        evidence: {
          details: String(error),
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Test Scenario B: Position Size Cap (>10% Portfolio)
   */
  async testPositionSizeCap() {
    console.log('📋 Test B: Position Size Cap (>10% Portfolio)\n');

    try {
      const settings = await storage.getTradingSettings(this.testUserId);
      if (!settings) throw new Error('Settings not found');

      const portfolioValue = settings.portfolioValue || 10000;
      const maxPosition = portfolioValue * 0.1; // 10% = $1,000

      // Create signal that would be oversized  
      // With riskPerTrade=100, and $10 stop distance, we'd get 10 units
      // 10 units * $3000 = $30,000 position (300% of portfolio!)
      const signal: StrategySignal = {
        symbol: 'ETH/USD',
        strategy: 'mean_reversion',
        entryPrice: 3000,
        stopPrice: 2990, // Only $10 risk per unit
        targetPrice: 3200,
        confidence: 0.85,
        metadata: { reason: 'Test oversized position' }
      };

      const result = await this.riskManager.checkPreTradeRisk(this.testUserId, signal, settings);
      
      const passed = !result.approved && result.reason?.includes('exceeds 10% portfolio');
      this.recordResult({
        scenario: 'Position Size Cap (>10%)',
        trigger: `Position would exceed $${maxPosition.toFixed(0)} cap`,
        expected: 'Blocked - exceeds 10% cap',
        actual: result.approved ? 'APPROVED (FAIL!)' : `Blocked: ${result.reason}`,
        passed,
        evidence: {
          details: result.reason,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      this.recordResult({
        scenario: 'Position Size Cap',
        trigger: 'Oversized position',
        expected: 'Blocked',
        actual: `Error: ${error}`,
        passed: false,
        evidence: {
          details: String(error),
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Test Scenario C: Stop-Loss Enforcement
   */
  async testStopLossEnforcement() {
    console.log('📋 Test C: Stop-Loss Enforcement\n');

    const settings = await storage.getTradingSettings(this.testUserId);
    if (!settings) throw new Error('Settings not found');

    // Test C1: Missing stop-loss
    try {
      const signal1: StrategySignal = {
        symbol: 'SOL/USD',
        strategy: 'range_trading',
        entryPrice: 100,
        stopPrice: 0, // Missing!
        targetPrice: 110,
        confidence: 0.75,
        metadata: { reason: 'Test missing stop-loss' }
      };

      const result1 = await this.riskManager.checkPreTradeRisk(this.testUserId, signal1, settings);
      
      const passed1 = !result1.approved && result1.reason?.includes('Stop-loss is required');
      this.recordResult({
        scenario: 'Stop-Loss Required',
        trigger: 'Missing stop-loss (stopPrice=0)',
        expected: 'Blocked - stop-loss required',
        actual: result1.approved ? 'APPROVED (FAIL!)' : `Blocked: ${result1.reason}`,
        passed: passed1,
        evidence: {
          details: result1.reason,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.recordResult({
        scenario: 'Stop-Loss Required',
        trigger: 'Missing stop-loss',
        expected: 'Blocked',
        actual: `Error: ${error}`,
        passed: false,
        evidence: {
          details: String(error),
          timestamp: new Date().toISOString()
        }
      });
    }

    // Test C2: Invalid stop-loss (above entry for long)
    try {
      const signal2: StrategySignal = {
        symbol: 'SOL/USD',
        strategy: 'range_trading',
        entryPrice: 100,
        stopPrice: 105, // Above entry - invalid!
        targetPrice: 110,
        confidence: 0.75,
        metadata: { reason: 'Test invalid stop-loss' }
      };

      const result2 = await this.riskManager.checkPreTradeRisk(this.testUserId, signal2, settings);
      
      const passed2 = !result2.approved && result2.reason?.includes('Stop-loss must be below entry');
      this.recordResult({
        scenario: 'Stop-Loss Position',
        trigger: 'Stop above entry for long',
        expected: 'Blocked - stop must be below entry',
        actual: result2.approved ? 'APPROVED (FAIL!)' : `Blocked: ${result2.reason}`,
        passed: passed2,
        evidence: {
          details: result2.reason,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.recordResult({
        scenario: 'Stop-Loss Position',
        trigger: 'Invalid stop placement',
        expected: 'Blocked',
        actual: `Error: ${error}`,
        passed: false,
        evidence: {
          details: String(error),
          timestamp: new Date().toISOString()
        }
      });
    }

    console.log('');
  }

  /**
   * Test Scenario D: Spot-Only Enforcement
   */
  async testSpotOnlyEnforcement() {
    console.log('📋 Test D: Spot-Only Trading Enforcement\n');

    try {
      const testOrderWithLeverage = {
        pair: 'XBTUSD',
        type: 'buy' as const,
        ordertype: 'market' as const,
        volume: '0.1',
        leverage: '2'
      };

      let blocked = false;
      let errorMessage = '';

      try {
        await this.krakenService.addOrder(testOrderWithLeverage);
      } catch (error: any) {
        blocked = true;
        errorMessage = error.message || String(error);
      }

      const passed = blocked && errorMessage.includes('SAFETY BLOCK');
      this.recordResult({
        scenario: 'Spot-Only Enforcement',
        trigger: 'Order with leverage="2"',
        expected: 'Blocked - leverage prohibited',
        actual: blocked ? `Blocked: ${errorMessage}` : 'APPROVED (FAIL!)',
        passed,
        evidence: {
          details: errorMessage,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      this.recordResult({
        scenario: 'Spot-Only Enforcement',
        trigger: 'Leverage order',
        expected: 'Blocked',
        actual: `Error: ${error}`,
        passed: false,
        evidence: {
          details: String(error),
          timestamp: new Date().toISOString()
        }
      });
    }

    console.log('');
  }

  /**
   * Test Scenario E: Daily Loss Kill Switch
   */
  async testDailyLossKillSwitch() {
    console.log('📋 Test E: Daily Loss Kill Switch\n');

    try {
      // Clean up any existing trades first to ensure clean state
      const existingTrades = await storage.getTrades(this.testUserId, {});
      for (const trade of existingTrades) {
        await storage.updateTrade(trade.id, { 
          realizedPL: 0, 
          pnl: 0,
          exitTime: null,
          status: 'cancelled'
        });
      }
      
      const settings = await storage.getTradingSettings(this.testUserId);
      if (!settings) throw new Error('Settings not found');

      const portfolioValue = settings.portfolioValue || 10000;
      const killSwitchThreshold = settings.dailyLossKillSwitch ? parseFloat(settings.dailyLossKillSwitch.toString()) : 7.0;
      const lossToTrigger = (portfolioValue * killSwitchThreshold / 100);

      console.log(`   Portfolio: $${portfolioValue}`);
      console.log(`   Kill switch at: ${killSwitchThreshold}% = $${lossToTrigger.toFixed(2)} loss`);

      // Create losing trades
      const now = new Date();
      const lossTrade1 = await storage.createTrade({
        userId: this.testUserId,
        mode: 'paper',
        symbol: 'ADA/USD',
        side: 'buy',
        quantity: 100,
        entryPrice: 1.0,
        stopPrice: 0.96,
        targetPrice: 1.05,
        status: 'closed',
        exitPrice: 0.96,
        exitTime: now,
        pnl: -400,
        realizedPL: -400,
        strategy: 'vwap_pullback',
        riskAmount: 400
      });

      const lossTrade2 = await storage.createTrade({
        userId: this.testUserId,
        mode: 'paper',
        symbol: 'DOT/USD',
        side: 'buy',
        quantity: 50,
        entryPrice: 10.0,
        stopPrice: 9.4,
        targetPrice: 10.5,
        status: 'closed',
        exitPrice: 9.4,
        exitTime: now,
        pnl: -300,
        realizedPL: -300,
        strategy: 'mean_reversion',
        riskAmount: 300
      });

      console.log(`   Created losing trades: -$400 + -$300 = -$700 (7%)`);

      // Check kill switch
      const killSwitchResult = await this.riskManager.checkKillSwitch(this.testUserId, settings);
      
      const passed = killSwitchResult.triggered;
      this.recordResult({
        scenario: 'Daily Loss Kill Switch',
        trigger: `7% daily loss ($${lossToTrigger.toFixed(0)})`,
        expected: 'Kill switch triggered',
        actual: killSwitchResult.triggered 
          ? `✅ Kill switch triggered: ${killSwitchResult.message}`
          : `❌ Kill switch NOT triggered: ${killSwitchResult.message}`,
        passed,
        evidence: {
          details: killSwitchResult.message,
          timestamp: new Date().toISOString()
        }
      });

      // Test trading is blocked
      const signal: StrategySignal = {
        symbol: 'BTC/USD',
        strategy: 'vwap_pullback',
        entryPrice: 50000,
        stopPrice: 49000,
        targetPrice: 52000,
        confidence: 0.8,
        metadata: { reason: 'Test kill switch block' }
      };

      const updatedSettings = await storage.getTradingSettings(this.testUserId);
      if (updatedSettings) {
        const tradeResult = await this.riskManager.checkPreTradeRisk(this.testUserId, signal, updatedSettings);
        const tradingBlocked = !tradeResult.approved && tradeResult.reason?.includes('suspended');
        console.log(`   Trading blocked: ${tradingBlocked ? 'YES ✅' : 'NO ❌'}`);
      }

      // Cleanup
      await storage.updateTradingSettings(this.testUserId, {
        tradingSuspended: false
      });
      await storage.updateTrade(lossTrade1.id, { pnl: 0, realizedPL: 0 });
      await storage.updateTrade(lossTrade2.id, { pnl: 0, realizedPL: 0 });
      
      console.log(`   🧹 Reset kill switch and cleaned up test trades\n`);

    } catch (error) {
      this.recordResult({
        scenario: 'Daily Loss Kill Switch',
        trigger: 'Exceed 7% loss',
        expected: 'Kill switch triggered',
        actual: `Error: ${error}`,
        passed: false,
        evidence: {
          details: String(error),
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Test Scenario F: Symbol Normalization
   */
  async testSymbolNormalization() {
    console.log('📋 Test F: Symbol Normalization (BTC Variants)\n');

    try {
      const settings = await storage.getTradingSettings(this.testUserId);
      if (!settings) throw new Error('Settings not found');

      // Create position with Kraken format
      const trade1 = await storage.createTrade({
        userId: this.testUserId,
        mode: 'paper',
        symbol: 'XXBTZUSD',
        side: 'buy',
        quantity: 0.1,
        entryPrice: 50000,
        stopPrice: 49000,
        targetPrice: 52000,
        status: 'open',
        strategy: 'breakout',
        riskAmount: 100
      });
      console.log(`   Created position: XXBTZUSD (Kraken format)`);

      // Test all BTC variants
      const variants = ['BTC/USD', 'XBTUSD', 'XBT/USD'];
      const results: any[] = [];

      for (const variant of variants) {
        const signal: StrategySignal = {
          symbol: variant,
          strategy: 'vwap_pullback',
          entryPrice: 50100,
          stopPrice: 49100,
          targetPrice: 52100,
          confidence: 0.8,
          metadata: { reason: `Test ${variant} normalization` }
        };

        const result = await this.riskManager.checkPreTradeRisk(this.testUserId, signal, settings);
        const blocked = !result.approved && result.reason?.includes('open position in BTC');
        
        results.push({ variant, blocked, reason: result.reason });
        console.log(`   ${variant}: ${blocked ? '✅ Blocked' : '❌ Approved (FAIL)'}`);
      }

      const allBlocked = results.every(r => r.blocked);
      
      this.recordResult({
        scenario: 'Symbol Normalization (BTC)',
        trigger: 'Attempt BTC/USD, XBTUSD, XBT/USD with existing XXBTZUSD',
        expected: 'All variants blocked as duplicates',
        actual: allBlocked 
          ? '✅ All variants correctly normalized to BTC'
          : `❌ Failed: ${results.filter(r => !r.blocked).map(r => r.variant).join(', ')}`,
        passed: allBlocked,
        evidence: {
          details: JSON.stringify(results),
          timestamp: new Date().toISOString()
        }
      });

      // Cleanup
      await storage.updateTrade(trade1.id, { status: 'closed', exitPrice: 50000 });
      console.log(`   🧹 Cleaned up test trade\n`);

    } catch (error) {
      this.recordResult({
        scenario: 'Symbol Normalization',
        trigger: 'BTC variants',
        expected: 'All normalized to BTC',
        actual: `Error: ${error}`,
        passed: false,
        evidence: {
          details: String(error),
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  private recordResult(result: TestResult) {
    this.results.push(result);
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${result.scenario}`);
    console.log(`   Expected: ${result.expected}`);
    console.log(`   Actual: ${result.actual}`);
    console.log('');
  }

  generateReport(): string {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;

    let report = `# Task 8 Guardrail Test Results\n\n`;
    report += `**Date:** ${new Date().toISOString()}\n`;
    report += `**Mode:** Paper Trading\n`;
    report += `**Results:** ${passedTests}/${totalTests} passed (${failedTests} failed)\n\n`;
    
    report += `## Summary Table\n\n`;
    report += `| Scenario | Trigger | Expected | Actual | Pass/Fail | Evidence |\n`;
    report += `|----------|---------|----------|--------|-----------|----------|\n`;

    for (const result of this.results) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      const actualTruncated = result.actual.length > 60 ? result.actual.substring(0, 57) + '...' : result.actual;
      report += `| ${result.scenario} | ${result.trigger} | ${result.expected} | ${actualTruncated} | ${status} | ${result.evidence.timestamp} |\n`;
    }

    report += `\n## Detailed Results\n\n`;
    for (const result of this.results) {
      report += `### ${result.scenario}\n`;
      report += `- **Trigger:** ${result.trigger}\n`;
      report += `- **Expected:** ${result.expected}\n`;
      report += `- **Actual:** ${result.actual}\n`;
      report += `- **Status:** ${result.passed ? '✅ PASS' : '❌ FAIL'}\n`;
      report += `- **Evidence:** ${result.evidence.timestamp}\n`;
      if (result.evidence.details) {
        report += `- **Details:** ${result.evidence.details}\n`;
      }
      report += `\n`;
    }

    report += `\n## Conclusion\n\n`;
    if (failedTests === 0) {
      report += `✅ **ALL TESTS PASSED** - Task 8 guardrails are production-ready.\n\n`;
    } else {
      report += `⚠️ **${failedTests} TEST(S) FAILED** - Review required.\n\n`;
    }

    return report;
  }

  async runAllTests() {
    console.log('\n' + '='.repeat(60));
    console.log('  TASK 8: GUARDRAIL VALIDATION TEST SUITE (PAPER MODE)');
    console.log('='.repeat(60) + '\n');

    await this.initialize();
    await this.testMaxOnePositionPerAsset();
    await this.testPositionSizeCap();
    await this.testStopLossEnforcement();
    await this.testSpotOnlyEnforcement();
    await this.testDailyLossKillSwitch();
    await this.testSymbolNormalization();

    console.log('='.repeat(60));
    console.log('  TEST SUITE COMPLETE');
    console.log('='.repeat(60) + '\n');

    const report = this.generateReport();
    console.log(report);

    return this.results;
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const harness = new GuardrailTestHarness();
  harness.runAllTests()
    .then(results => {
      const passed = results.filter(r => r.passed).length;
      const total = results.length;
      process.exit(passed === total ? 0 : 1);
    })
    .catch(error => {
      console.error('Test harness error:', error);
      process.exit(1);
    });
}

export { GuardrailTestHarness };
