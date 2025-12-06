#!/usr/bin/env tsx
/**
 * Phase 41F-J: Standalone Portfolio Reconciliation Test Script
 * 
 * This script bypasses the HTTP layer and tests portfolio reconciliation
 * directly by invoking PaperExecutionService and database storage.
 * 
 * Usage:
 *   npx tsx scripts/test-portfolio-reconciliation.ts
 */

import { PaperExecutionService } from '../server/services/paper-execution';
import { storage } from '../server/storage';
import { KrakenService } from '../server/services/kraken';

const TEST_USER_ID = 'test-user-123';
const MODE = 'paper';

interface TradeTest {
  symbol: string;
  action: 'buy' | 'sell';
  amount: number;
}

const TRADES: TradeTest[] = [
  { symbol: 'BTC/USD', action: 'buy', amount: 0.005 },
  { symbol: 'ETH/USD', action: 'buy', amount: 0.1 },
  { symbol: 'BTC/USD', action: 'sell', amount: 0.003 },
];

async function getPortfolioSnapshot(userId: string) {
  const portfolio = await storage.getPaperPortfolio(userId);
  const positions = new Map();
  let totalValue = 0;

  for (const position of portfolio) {
    const key = `${position.symbol}_${position.mode}`;
    positions.set(key, {
      symbol: position.symbol,
      quantity: position.quantity,
      averagePrice: position.averagePrice,
      currentValue: position.quantity * position.averagePrice
    });
    totalValue += position.quantity * position.averagePrice;
  }

  return { positions, totalValue, rawPortfolio: portfolio };
}

async function executeTrade(trade: TradeTest, tradeNum: number) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TRADE ${tradeNum}: ${trade.action.toUpperCase()} ${trade.amount} ${trade.symbol}`);
  console.log('='.repeat(80));

  try {
    // Get portfolio before trade
    console.log('\n[1/5] Fetching portfolio state BEFORE trade...');
    const beforeSnapshot = await getPortfolioSnapshot(TEST_USER_ID);
    const beforeKey = `${trade.symbol}_${MODE}`;
    const beforePosition = beforeSnapshot.positions.get(beforeKey);
    
    console.log(`  Portfolio total value: $${beforeSnapshot.totalValue.toFixed(2)}`);
    console.log(`  ${trade.symbol} position: ${beforePosition ? beforePosition.quantity : 0}`);
    console.log(`  Portfolio positions: ${beforeSnapshot.positions.size}`);

    // Get current price
    console.log(`\n[2/5] Fetching current price for ${trade.symbol}...`);
    const currentPrice = await KrakenService.getPrice(trade.symbol);
    console.log(`  Current price: $${currentPrice.toFixed(2)}`);

    // Execute trade
    console.log(`\n[3/5] Executing ${trade.action} trade...`);
    const executionResult = await PaperExecutionService.executeTradeManual({
      userId: TEST_USER_ID,
      symbol: trade.symbol,
      side: trade.action,
      amount: trade.amount,
      price: currentPrice,
      mode: MODE as 'paper',
    });

    console.log(`  ✓ Trade executed successfully`);
    console.log(`  Trade ID: ${executionResult.id}`);
    console.log(`  Executed at: $${executionResult.price.toFixed(2)}`);
    console.log(`  Total cost: $${executionResult.total.toFixed(2)}`);

    // Wait for database to sync (pessimistic wait)
    console.log('\n[4/5] Waiting for database sync...');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get portfolio after trade
    console.log('[5/5] Fetching portfolio state AFTER trade...');
    const afterSnapshot = await getPortfolioSnapshot(TEST_USER_ID);
    const afterKey = `${trade.symbol}_${MODE}`;
    const afterPosition = afterSnapshot.positions.get(afterKey);

    console.log(`  Portfolio total value: $${afterSnapshot.totalValue.toFixed(2)}`);
    console.log(`  ${trade.symbol} position: ${afterPosition ? afterPosition.quantity : 0}`);
    console.log(`  Portfolio positions: ${afterSnapshot.positions.size}`);

    // Validate reconciliation
    console.log('\n📊 RECONCILIATION VALIDATION:');
    const beforeQty = beforePosition ? beforePosition.quantity : 0;
    const afterQty = afterPosition ? afterPosition.quantity : 0;
    const expectedDelta = trade.action === 'buy' ? trade.amount : -trade.amount;
    const actualDelta = afterQty - beforeQty;

    console.log(`  Before quantity: ${beforeQty}`);
    console.log(`  After quantity: ${afterQty}`);
    console.log(`  Expected delta: ${expectedDelta}`);
    console.log(`  Actual delta: ${actualDelta}`);

    const deltaMatch = Math.abs(actualDelta - expectedDelta) < 0.0001;
    const syncStatus = deltaMatch ? '✅ SYNCED' : '❌ DESYNC';

    console.log(`  Database status: ${syncStatus}`);

    if (!deltaMatch) {
      console.error(`  ⚠️  WARNING: Position delta mismatch!`);
      console.error(`     Expected: ${expectedDelta}`);
      console.error(`     Actual: ${actualDelta}`);
      console.error(`     Difference: ${Math.abs(actualDelta - expectedDelta)}`);
    }

    return {
      success: deltaMatch,
      trade: executionResult,
      before: beforeSnapshot,
      after: afterSnapshot,
      validation: {
        expectedDelta,
        actualDelta,
        deltaMatch,
      },
    };
  } catch (error) {
    console.error(`\n❌ ERROR executing trade:`, error);
    throw error;
  }
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 41F-J: PORTFOLIO RECONCILIATION TEST');
  console.log('='.repeat(80));
  console.log(`Test User ID: ${TEST_USER_ID}`);
  console.log(`Mode: ${MODE}`);
  console.log(`Trades to execute: ${TRADES.length}`);
  console.log('='.repeat(80));

  const results = [];

  try {
    for (let i = 0; i < TRADES.length; i++) {
      const result = await executeTrade(TRADES[i], i + 1);
      results.push(result);
      
      // Wait between trades
      if (i < TRADES.length - 1) {
        console.log('\n⏱️  Waiting 2s before next trade...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('FINAL SUMMARY');
    console.log('='.repeat(80));

    const allSynced = results.every(r => r.success);
    console.log(`\nTotal trades executed: ${results.length}`);
    console.log(`Successful reconciliations: ${results.filter(r => r.success).length}`);
    console.log(`Failed reconciliations: ${results.filter(r => !r.success).length}`);
    console.log(`\nOverall status: ${allSynced ? '✅ ALL SYNCED' : '❌ SYNC FAILURES DETECTED'}`);

    if (!allSynced) {
      console.log('\n⚠️  WARNING: Some trades did not reconcile correctly!');
      console.log('Check the validation output above for details.');
      process.exit(1);
    } else {
      console.log('\n✅ SUCCESS: All portfolio reconciliations passed!');
      console.log('Database synchronization is working correctly.');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ FATAL ERROR during test execution:', error);
    process.exit(1);
  }
}

// Run the test
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
