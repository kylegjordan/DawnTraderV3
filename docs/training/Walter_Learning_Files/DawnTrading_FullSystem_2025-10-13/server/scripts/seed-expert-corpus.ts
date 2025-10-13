#!/usr/bin/env tsx
/**
 * Seed Expert Corpus v1
 * Populates expert_sources and expert_principles tables from the corpus document
 */

import { db } from '../db';
import { expertSources, expertPrinciples } from '@shared/schema';

// Expert sources from expertise_sources.yaml
const sources = [
  { title: 'Trading in the Zone', author: 'Mark Douglas', type: 'book' as const, category: 'psychology', credibility: 5 },
  { title: 'The Daily Trading Coach', author: 'Brett Steenbarger', type: 'book' as const, category: 'psychology', credibility: 5 },
  { title: 'Street Smarts', author: 'Linda Raschke & Laurence Connors', type: 'book' as const, category: 'risk_management', credibility: 5 },
  { title: 'Come Into My Trading Room', author: 'Alexander Elder', type: 'book' as const, category: 'market_structure', credibility: 5 },
  { title: 'Trade Your Way to Financial Freedom', author: 'Van Tharp', type: 'book' as const, category: 'risk_management', credibility: 5 },
  { title: 'NewTraderU', author: 'Steve Burns', type: 'blog' as const, category: 'trade_execution', credibility: 4 },
  { title: 'Rayner Teo Blog', author: 'Rayner Teo', type: 'blog' as const, category: 'market_structure', credibility: 4 },
  { title: 'TradingView Editor\'s Picks', author: 'TradingView Community', type: 'blog' as const, category: 'market_structure', credibility: 4 },
  { title: 'Binance Research', author: 'Binance', type: 'research' as const, category: 'market_structure', credibility: 4 },
  { title: 'Cointelegraph Analysis', author: 'Cointelegraph', type: 'blog' as const, category: 'market_structure', credibility: 4 }
];

// Mapping of source names to IDs (will be populated after insert)
const sourceIdMap: Record<string, string> = {};

// 80 Expert Principles
const principles = [
  // Psychology / Discipline (20)
  { id: 'PSY-001', principle: 'Success in trading stems from mastering your internal state, not predicting external market moves', sourceName: 'Trading in the Zone', category: 'psychology', credibility: 5 },
  { id: 'PSY-002', principle: 'Your belief in randomness allows you to accept losses without emotional damage', sourceName: 'Trading in the Zone', category: 'psychology', credibility: 5 },
  { id: 'PSY-003', principle: 'Consistency comes from thinking in probabilities, not certainties', sourceName: 'Trading in the Zone', category: 'psychology', credibility: 5 },
  { id: 'PSY-004', principle: 'Fear and greed create the exact behaviors that produce losses', sourceName: 'The Daily Trading Coach', category: 'psychology', credibility: 5 },
  { id: 'PSY-005', principle: 'Daily performance reviews build self-awareness faster than any single trade can', sourceName: 'The Daily Trading Coach', category: 'psychology', credibility: 5 },
  { id: 'PSY-006', principle: 'Trading your own personality type with appropriate strategies reduces emotional conflict', sourceName: 'The Daily Trading Coach', category: 'psychology', credibility: 4 },
  { id: 'PSY-007', principle: 'Overconfidence after wins creates the conditions for your next significant loss', sourceName: 'Street Smarts', category: 'psychology', credibility: 5 },
  { id: 'PSY-008', principle: 'Never average down on losing positions; this compounds psychological and financial damage', sourceName: 'Come Into My Trading Room', category: 'psychology', credibility: 5 },
  { id: 'PSY-009', principle: 'The market rewards patience and punishes impulsiveness consistently over time', sourceName: 'NewTraderU', category: 'psychology', credibility: 4 },
  { id: 'PSY-010', principle: 'Your worst enemy in trading is the need to be right instead of profitable', sourceName: 'Trading in the Zone', category: 'psychology', credibility: 5 },
  { id: 'PSY-011', principle: 'Revenge trading after losses destroys more accounts than any market condition', sourceName: 'The Daily Trading Coach', category: 'psychology', credibility: 5 },
  { id: 'PSY-012', principle: 'Taking breaks after three consecutive losses prevents emotional decision cascades', sourceName: 'NewTraderU', category: 'psychology', credibility: 4 },
  { id: 'PSY-013', principle: 'Your trading plan exists to protect you from your emotions, not market volatility', sourceName: 'Come Into My Trading Room', category: 'psychology', credibility: 5 },
  { id: 'PSY-014', principle: 'Discipline means executing your strategy even when it feels uncomfortable', sourceName: 'Street Smarts', category: 'psychology', credibility: 4 },
  { id: 'PSY-015', principle: 'The quality of your preparation determines the quality of your execution under pressure', sourceName: 'The Daily Trading Coach', category: 'psychology', credibility: 5 },
  { id: 'PSY-016', principle: 'Accepting that you will miss opportunities prevents FOMO-driven mistakes', sourceName: 'Rayner Teo Blog', category: 'psychology', credibility: 4 },
  { id: 'PSY-017', principle: 'Comparing your results to others creates destructive competitive emotions', sourceName: 'The Daily Trading Coach', category: 'psychology', credibility: 4 },
  { id: 'PSY-018', principle: 'Mental rehearsal of trade execution improves real-time performance significantly', sourceName: 'The Daily Trading Coach', category: 'psychology', credibility: 4 },
  { id: 'PSY-019', principle: 'Your edge disappears the moment you abandon your process for discretionary choices', sourceName: 'Trading in the Zone', category: 'psychology', credibility: 5 },
  { id: 'PSY-020', principle: 'Keeping position sizes comfortable prevents stress-induced exit errors', sourceName: 'Trade Your Way to Financial Freedom', category: 'psychology', credibility: 5 },

  // Risk Management (25)
  { id: 'RISK-001', principle: 'Never risk more than 1-2% of your capital on any single trade', sourceName: 'Trade Your Way to Financial Freedom', category: 'risk_management', credibility: 5 },
  { id: 'RISK-002', principle: 'Your position size determines your emotional state; size appropriately for clarity', sourceName: 'Trade Your Way to Financial Freedom', category: 'risk_management', credibility: 5 },
  { id: 'RISK-003', principle: 'The risk-reward ratio must be at least 2:1 to account for the probability of being wrong', sourceName: 'Come Into My Trading Room', category: 'risk_management', credibility: 5 },
  { id: 'RISK-004', principle: 'Stop losses are non-negotiable exit points, not suggestions to reconsider', sourceName: 'Street Smarts', category: 'risk_management', credibility: 5 },
  { id: 'RISK-005', principle: 'Diversification across uncorrelated assets reduces portfolio volatility without sacrificing returns', sourceName: 'Trade Your Way to Financial Freedom', category: 'risk_management', credibility: 4 },
  { id: 'RISK-006', principle: 'Maximum daily loss limits prevent catastrophic drawdowns from emotional spirals', sourceName: 'Come Into My Trading Room', category: 'risk_management', credibility: 5 },
  { id: 'RISK-007', principle: 'Risk per trade should decrease during losing streaks and increase during winning streaks', sourceName: 'Trade Your Way to Financial Freedom', category: 'risk_management', credibility: 4 },
  { id: 'RISK-008', principle: 'Never hold more than three to five positions simultaneously to maintain proper oversight', sourceName: 'Street Smarts', category: 'risk_management', credibility: 4 },
  { id: 'RISK-009', principle: 'The distance to your stop loss determines your position size, not your opinion strength', sourceName: 'NewTraderU', category: 'risk_management', credibility: 5 },
  { id: 'RISK-010', principle: 'Correlating multiple positions creates hidden leverage that multiplies during crashes', sourceName: 'Trade Your Way to Financial Freedom', category: 'risk_management', credibility: 5 },
  { id: 'RISK-011', principle: 'Protective stops belong at technical invalidation points, not arbitrary percentage levels', sourceName: 'Come Into My Trading Room', category: 'risk_management', credibility: 5 },
  { id: 'RISK-012', principle: 'Account drawdowns beyond 20% require immediate strategy reassessment and position reduction', sourceName: 'Trade Your Way to Financial Freedom', category: 'risk_management', credibility: 5 },
  { id: 'RISK-013', principle: 'Slippage and fees must be factored into every risk calculation for accuracy', sourceName: 'Rayner Teo Blog', category: 'risk_management', credibility: 4 },
  { id: 'RISK-014', principle: 'Margin and leverage amplify both gains and psychological pressure exponentially', sourceName: 'Come Into My Trading Room', category: 'risk_management', credibility: 5 },
  { id: 'RISK-015', principle: 'Pre-defining worst-case scenarios prevents panic decisions during volatility spikes', sourceName: 'The Daily Trading Coach', category: 'risk_management', credibility: 4 },
  { id: 'RISK-016', principle: 'Never risk money you cannot afford to lose psychologically or financially', sourceName: 'Trade Your Way to Financial Freedom', category: 'risk_management', credibility: 5 },
  { id: 'RISK-017', principle: 'Trailing stops lock in profits while allowing trends to continue naturally', sourceName: 'Street Smarts', category: 'risk_management', credibility: 4 },
  { id: 'RISK-018', principle: 'Crypto volatility requires wider stops than traditional assets for the same risk exposure', sourceName: 'Binance Research', category: 'risk_management', credibility: 4 },
  { id: 'RISK-019', principle: 'Portfolio heat, the total capital at risk across all positions, should never exceed 6%', sourceName: 'Trade Your Way to Financial Freedom', category: 'risk_management', credibility: 5 },
  { id: 'RISK-020', principle: 'Asymmetric risk profiles, where potential loss exceeds potential gain, should be avoided entirely', sourceName: 'Come Into My Trading Room', category: 'risk_management', credibility: 5 },
  { id: 'RISK-021', principle: 'Risk management failures occur during execution, not during planning', sourceName: 'Street Smarts', category: 'risk_management', credibility: 4 },
  { id: 'RISK-022', principle: 'Stop loss placement at recent swing lows respects market structure and reduces false triggers', sourceName: 'Rayner Teo Blog', category: 'risk_management', credibility: 4 },
  { id: 'RISK-023', principle: 'Fixed fractional position sizing maintains consistent risk as account size fluctuates', sourceName: 'Trade Your Way to Financial Freedom', category: 'risk_management', credibility: 5 },
  { id: 'RISK-024', principle: 'News events create unpredictable volatility; reduce position sizes or step aside entirely', sourceName: 'Cointelegraph Analysis', category: 'risk_management', credibility: 4 },
  { id: 'RISK-025', principle: 'Your survival as a trader depends on preserving capital, not maximizing every opportunity', sourceName: 'NewTraderU', category: 'risk_management', credibility: 5 },

  // Market Structure & Strategy (20)
  { id: 'STRAT-001', principle: 'Trade in the direction of the prevailing trend on your chosen timeframe', sourceName: 'Come Into My Trading Room', category: 'market_structure', credibility: 5 },
  { id: 'STRAT-002', principle: 'Support and resistance levels represent zones, not precise price points', sourceName: 'Street Smarts', category: 'market_structure', credibility: 5 },
  { id: 'STRAT-003', principle: 'Higher highs and higher lows define uptrends; lower highs and lower lows define downtrends', sourceName: 'Come Into My Trading Room', category: 'market_structure', credibility: 5 },
  { id: 'STRAT-004', principle: 'Volume confirms price moves; divergence between volume and price signals potential reversals', sourceName: 'Come Into My Trading Room', category: 'market_structure', credibility: 5 },
  { id: 'STRAT-005', principle: 'Breakouts with expanding volume have higher probability of follow-through', sourceName: 'Street Smarts', category: 'market_structure', credibility: 5 },
  { id: 'STRAT-006', principle: 'Multiple timeframe alignment increases trade probability significantly', sourceName: 'Rayner Teo Blog', category: 'market_structure', credibility: 4 },
  { id: 'STRAT-007', principle: 'Mean reversion strategies work best in ranging markets, not trending conditions', sourceName: 'Street Smarts', category: 'market_structure', credibility: 5 },
  { id: 'STRAT-008', principle: 'The first pullback in a new trend offers the highest reward-to-risk entry opportunity', sourceName: 'Rayner Teo Blog', category: 'market_structure', credibility: 4 },
  { id: 'STRAT-009', principle: 'Failed breakouts often lead to powerful moves in the opposite direction', sourceName: 'Street Smarts', category: 'market_structure', credibility: 5 },
  { id: 'STRAT-010', principle: 'Candlestick patterns only matter when they appear at key support or resistance levels', sourceName: 'Rayner Teo Blog', category: 'market_structure', credibility: 4 },
  { id: 'STRAT-011', principle: 'Market structure breaks signal potential trend changes before indicator crossovers', sourceName: 'Come Into My Trading Room', category: 'market_structure', credibility: 5 },
  { id: 'STRAT-012', principle: 'Consolidation periods after strong moves create energy for the next directional push', sourceName: 'Street Smarts', category: 'market_structure', credibility: 4 },
  { id: 'STRAT-013', principle: 'Trading against exhaustion moves near extremes provides asymmetric opportunities', sourceName: 'Rayner Teo Blog', category: 'market_structure', credibility: 4 },
  { id: 'STRAT-014', principle: 'Liquidity pools at round numbers attract price and create reversal zones', sourceName: 'TradingView Editor\'s Picks', category: 'market_structure', credibility: 4 },
  { id: 'STRAT-015', principle: 'Crypto markets exhibit stronger weekend and late-night volatility than traditional markets', sourceName: 'Binance Research', category: 'market_structure', credibility: 4 },
  { id: 'STRAT-016', principle: 'Trend-following strategies underperform during high-volatility sideways markets', sourceName: 'Trade Your Way to Financial Freedom', category: 'market_structure', credibility: 4 },
  { id: 'STRAT-017', principle: 'The VWAP acts as intraday equilibrium; price returns to it frequently', sourceName: 'TradingView Editor\'s Picks', category: 'market_structure', credibility: 4 },
  { id: 'STRAT-018', principle: 'Confluence of multiple technical factors increases setup validity exponentially', sourceName: 'Rayner Teo Blog', category: 'market_structure', credibility: 4 },
  { id: 'STRAT-019', principle: 'Market regimes change; strategies must adapt or be rotated based on conditions', sourceName: 'Trade Your Way to Financial Freedom', category: 'market_structure', credibility: 5 },
  { id: 'STRAT-020', principle: 'Price action alone provides more reliable signals than lagging indicators', sourceName: 'Street Smarts', category: 'market_structure', credibility: 5 },

  // Trade Execution & Review (15)
  { id: 'EXEC-001', principle: 'Plan your trade completely before execution; trading is not the time for strategy development', sourceName: 'Come Into My Trading Room', category: 'trade_execution', credibility: 5 },
  { id: 'EXEC-002', principle: 'Enter positions gradually using scaled entries to improve average price', sourceName: 'Street Smarts', category: 'trade_execution', credibility: 4 },
  { id: 'EXEC-003', principle: 'Use limit orders for entries to ensure favorable pricing and avoid slippage', sourceName: 'NewTraderU', category: 'trade_execution', credibility: 4 },
  { id: 'EXEC-004', principle: 'Market orders for exits ensure you honor your stops without hesitation', sourceName: 'Come Into My Trading Room', category: 'trade_execution', credibility: 5 },
  { id: 'EXEC-005', principle: 'Track every trade with entry rationale, exit criteria, and emotional state for pattern recognition', sourceName: 'The Daily Trading Coach', category: 'trade_execution', credibility: 5 },
  { id: 'EXEC-006', principle: 'Review losing trades first; they contain more educational value than winners', sourceName: 'The Daily Trading Coach', category: 'trade_execution', credibility: 5 },
  { id: 'EXEC-007', principle: 'Maintain a trade journal that emphasizes process adherence over profit outcomes', sourceName: 'NewTraderU', category: 'trade_execution', credibility: 4 },
  { id: 'EXEC-008', principle: 'Calculate your win rate and average win-loss ratio to understand your statistical edge', sourceName: 'Trade Your Way to Financial Freedom', category: 'trade_execution', credibility: 5 },
  { id: 'EXEC-009', principle: 'Only add to winning positions, never to losing ones', sourceName: 'Street Smarts', category: 'trade_execution', credibility: 5 },
  { id: 'EXEC-010', principle: 'Exit signals deserve the same analytical rigor as entry signals', sourceName: 'Come Into My Trading Room', category: 'trade_execution', credibility: 5 },
  { id: 'EXEC-011', principle: 'Your expectancy, the average amount you make per trade, determines long-term profitability', sourceName: 'Trade Your Way to Financial Freedom', category: 'trade_execution', credibility: 5 },
  { id: 'EXEC-012', principle: 'Record your mistakes immediately to prevent repetition through conscious awareness', sourceName: 'The Daily Trading Coach', category: 'trade_execution', credibility: 4 },
  { id: 'EXEC-013', principle: 'Weekly performance reviews identify behavioral patterns invisible in daily noise', sourceName: 'The Daily Trading Coach', category: 'trade_execution', credibility: 4 },
  { id: 'EXEC-014', principle: 'Partial profit-taking at predetermined targets removes emotional decision-making from exits', sourceName: 'Street Smarts', category: 'trade_execution', credibility: 4 },
  { id: 'EXEC-015', principle: 'Your trading statistics reveal truth; your emotions reveal bias', sourceName: 'Trade Your Way to Financial Freedom', category: 'trade_execution', credibility: 5 }
];

async function seedExpertCorpus() {
  try {
    console.log('🌱 Starting Expert Corpus seeding...');

    // 1. Insert sources
    console.log('📚 Inserting expert sources...');
    for (const source of sources) {
      const [inserted] = await db.insert(expertSources).values({
        title: source.title,
        author: source.author,
        type: source.type,
        category: source.category,
        credibilityScore: source.credibility,
        isActive: true
      }).returning();

      sourceIdMap[source.title] = inserted.id;
      console.log(`  ✓ ${source.title} (${source.author}) - ID: ${inserted.id}`);
    }

    // 2. Insert principles
    console.log('\n💡 Inserting expert principles...');
    let insertedCount = 0;
    
    for (const principle of principles) {
      const sourceId = sourceIdMap[principle.sourceName];
      if (!sourceId) {
        console.error(`  ✗ Source not found for principle ${principle.id}: ${principle.sourceName}`);
        continue;
      }

      const source = sources.find(s => s.title === principle.sourceName);
      
      await db.insert(expertPrinciples).values({
        sourceId,
        principle: principle.principle,
        category: principle.category,
        credibilityScore: principle.credibility,
        sourceName: principle.sourceName,
        sourceAuthor: source?.author || 'Unknown',
        usageCount: 0,
        isActive: true,
        metadata: { externalId: principle.id }
      });

      insertedCount++;
      if (insertedCount % 10 === 0) {
        console.log(`  ✓ ${insertedCount} principles inserted...`);
      }
    }

    console.log(`\n✅ Seeding complete!`);
    console.log(`   - ${sources.length} sources inserted`);
    console.log(`   - ${insertedCount} principles inserted`);
    
    // 3. Verify counts
    const sourceCount = await db.select().from(expertSources);
    const principleCount = await db.select().from(expertPrinciples);
    
    console.log(`\n📊 Verification:`);
    console.log(`   - Sources in DB: ${sourceCount.length}`);
    console.log(`   - Principles in DB: ${principleCount.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedExpertCorpus();
