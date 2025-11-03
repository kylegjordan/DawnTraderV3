import { Paper48HrSimulation } from './services/paper-48hr-simulation';
import { storage } from './storage';
import { SystemUserCache } from './utils/system-user-cache'; // Phase 31.I

async function startPaperTrading() {
  try {
    console.log('🚀 Initializing 48-Hour Paper Trading Simulation...\n');

    // Phase 41F-L.E2E-FIX: Remove hardcoded defaults, honor env only
    const ALLOW_SETTINGS_SEED = process.env.ALLOW_SETTINGS_SEED === 'true';
    const STARTING_BALANCE_ENV = process.env.STARTING_BALANCE_USD;

    // Phase 31.I: Get user ID dynamically (no hardcoded UUIDs)
    const userId = process.env.PAPER_TRADING_USER_ID || await SystemUserCache.getOrResolve('testuser123');

    // Phase 41F-L.E2E-PURGE: Use mode-level configuration (portfolio_state + guardrails_v2)
    const mode = 'paper';
    
    // Get portfolio state for starting balance
    let portfolioState = await storage.getPortfolioState({ userId, mode });
    let STARTING_BALANCE: number;
    
    if (!portfolioState) {
      if (!ALLOW_SETTINGS_SEED) {
        throw new Error('No portfolio state found for user. Set ALLOW_SETTINGS_SEED=true to initialize defaults.');
      }
      
      if (!STARTING_BALANCE_ENV) {
        throw new Error('STARTING_BALANCE_USD environment variable required when ALLOW_SETTINGS_SEED=true');
      }
      
      console.log('⚙️  Initializing portfolio_state (ALLOW_SETTINGS_SEED=true)...');
      STARTING_BALANCE = parseFloat(STARTING_BALANCE_ENV);
      
      // Initialize paper trading (creates portfolio_state)
      await storage.initializePaperTrading(userId, STARTING_BALANCE);
      portfolioState = await storage.getPortfolioState({ userId, mode });
    } else {
      STARTING_BALANCE = parseFloat(portfolioState.balance);
    }
    
    // Get risk percentage from guardrails_v2
    const guardrails = await storage.getGuardrailsV2({ mode });
    const riskPct = guardrails ? parseFloat(guardrails.portfolioRiskPerTradePct) : 4.00;

    console.log(`👤 User: ${userId}`);
    console.log(`💰 Starting Balance: $${STARTING_BALANCE} (from portfolio_state)`);
    console.log(`📊 Risk per Trade: ${riskPct}% of portfolio (from guardrails_v2)`);
    console.log(`📅 Duration: 48 hours\n`);

    // Create and start simulation
    const simulation = new Paper48HrSimulation({
      userId,
      startingBalance: STARTING_BALANCE,
      duration48Hours: true
    });

    await simulation.start();

    // Handle graceful shutdown
    const handleShutdown = async () => {
      console.log('\n\n🛑 Shutdown signal received...');
      await simulation.stop(false); // false = interrupted
      process.exit(0);
    };

    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);

  } catch (error) {
    console.error('❌ Fatal error starting paper trading simulation:', error);
    process.exit(1);
  }
}

startPaperTrading();
