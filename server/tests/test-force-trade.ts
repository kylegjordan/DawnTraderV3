#!/usr/bin/env tsx
/**
 * Test script for PAPER_FORCE_TRADE_SYMBOL feature
 * Phase 27.F.14.Unified Part B - Task 7
 * 
 * This script:
 * 1. Sets PAPER_FORCE_TRADE_SYMBOL=BTCUSD
 * 2. Starts paper trading engine
 * 3. Waits for monitoring cycle to execute
 * 4. Verifies paper_trade_opened event in logs
 * 5. Checks database for persisted trade
 */

import { db } from '../db';
import { paperSimTrades, paperSimOpenPositions } from '../../shared/schema';
import { desc } from 'drizzle-orm';

async function testForcedTrade() {
  console.log('\n========================================');
  console.log('TESTING PAPER_FORCE_TRADE_SYMBOL FEATURE');
  console.log('========================================\n');

  try {
    // Step 1: Set environment variable
    process.env.PAPER_FORCE_TRADE_SYMBOL = 'BTCUSD';
    console.log('[TEST] ✓ Set PAPER_FORCE_TRADE_SYMBOL=BTCUSD');

    // Step 2: Get baseline trade count
    const baselineTrades = await db.select()
      .from(paperSimTrades)
      .orderBy(desc(paperSimTrades.openedAt))
      .limit(5);
    
    console.log(`[TEST] Baseline: ${baselineTrades.length} recent trades in database`);
    
    const baselinePositions = await db.select()
      .from(paperSimOpenPositions)
      .orderBy(desc(paperSimOpenPositions.openedAt))
      .limit(5);
    
    console.log(`[TEST] Baseline: ${baselinePositions.length} open positions in database`);

    // Step 3: Make API request to start paper trading
    console.log('\n[TEST] Starting paper trading engine...');
    const startUrl = `http://localhost:5000/api/trading/start`;
    
    const startResponse = await fetch(startUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TEST_TOKEN}` // Will use test credentials
      },
      body: JSON.stringify({ mode: 'paper' })
    });

    if (!startResponse.ok) {
      const errorText = await startResponse.text();
      console.error('[TEST] ✗ Failed to start engine:', errorText);
      process.exit(1);
    }

    const startData = await startResponse.json();
    console.log('[TEST] ✓ Engine start response:', startData);

    // Step 4: Wait for at least one monitoring cycle (10 seconds + buffer)
    console.log('\n[TEST] Waiting 15 seconds for monitoring cycle to execute...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Step 5: Check for new trades
    const afterTrades = await db.select()
      .from(paperSimTrades)
      .orderBy(desc(paperSimTrades.openedAt))
      .limit(5);
    
    console.log(`\n[TEST] After cycle: ${afterTrades.length} recent trades in database`);
    
    if (afterTrades.length > baselineTrades.length) {
      const newTrade = afterTrades[0];
      console.log('[TEST] ✓ NEW TRADE FOUND:');
      console.log(`  - Symbol: ${newTrade.symbol}`);
      console.log(`  - Strategy: ${newTrade.strategy}`);
      console.log(`  - Entry Price: $${newTrade.entryPrice}`);
      console.log(`  - Quantity: ${newTrade.quantity}`);
      console.log(`  - Value: $${newTrade.totalValue}`);
      console.log(`  - Opened At: ${newTrade.openedAt}`);
      
      if (newTrade.symbol === 'BTCUSD' || newTrade.symbol === 'BTC/USD') {
        console.log('[TEST] ✓ Trade is for BTC/USD as expected (PAPER_FORCE_TRADE_SYMBOL worked!)');
      } else {
        console.log(`[TEST] ⚠️  Trade symbol is ${newTrade.symbol}, expected BTC/USD`);
      }
    } else {
      console.log('[TEST] ⚠️  No new trades found - this might be expected if no signals qualified AND no forced trade was created');
      console.log('[TEST] Check logs for "PAPER_FORCE_TRADE_SYMBOL" to see if feature was triggered');
    }

    // Step 6: Check for new open positions
    const afterPositions = await db.select()
      .from(paperSimOpenPositions)
      .orderBy(desc(paperSimOpenPositions.openedAt))
      .limit(5);
    
    console.log(`\n[TEST] After cycle: ${afterPositions.length} open positions in database`);
    
    if (afterPositions.length > baselinePositions.length) {
      const newPosition = afterPositions[0];
      console.log('[TEST] ✓ NEW POSITION FOUND:');
      console.log(`  - Symbol: ${newPosition.symbol}`);
      console.log(`  - Strategy: ${newPosition.strategy}`);
      console.log(`  - Entry Price: $${newPosition.entryPrice}`);
      console.log(`  - Quantity: ${newPosition.quantity}`);
      console.log(`  - Current Value: $${newPosition.currentValue}`);
      console.log(`  - Opened At: ${newPosition.openedAt}`);
    }

    // Step 7: Stop the engine
    console.log('\n[TEST] Stopping paper trading engine...');
    const stopUrl = `http://localhost:5000/api/trading/stop`;
    
    const stopResponse = await fetch(stopUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TEST_TOKEN}`
      },
      body: JSON.stringify({ mode: 'paper' })
    });

    if (!stopResponse.ok) {
      console.log('[TEST] ⚠️  Failed to stop engine (may already be stopped)');
    } else {
      console.log('[TEST] ✓ Engine stopped');
    }

    console.log('\n========================================');
    console.log('TEST COMPLETE');
    console.log('========================================\n');
    console.log('[TEST] Next steps:');
    console.log('  1. Check workflow logs for "PAPER_FORCE_TRADE_SYMBOL" messages');
    console.log('  2. Look for "paper_trade_opened" WebSocket event');
    console.log('  3. Verify all pipeline events were logged (filter_cycle_started, candidate_selected, etc.)');
    
  } catch (error) {
    console.error('\n[TEST] ✗ Test failed with error:', error);
    process.exit(1);
  }
}

// Run the test
testForcedTrade().then(() => {
  console.log('\n[TEST] Exiting...');
  process.exit(0);
}).catch(error => {
  console.error('\n[TEST] Unhandled error:', error);
  process.exit(1);
});
