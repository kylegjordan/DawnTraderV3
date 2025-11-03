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

    // Verify user exists and has trading settings
    let settings = await storage.getTradingSettings(userId);
    
    if (!settings) {
      if (!ALLOW_SETTINGS_SEED) {
        throw new Error('No trading settings found for user. Set ALLOW_SETTINGS_SEED=true to initialize defaults.');
      }
      
      if (!STARTING_BALANCE_ENV) {
        throw new Error('STARTING_BALANCE_USD environment variable required when ALLOW_SETTINGS_SEED=true');
      }
      
      console.log('⚙️  Creating default trading settings (ALLOW_SETTINGS_SEED=true)...');
      
      // Create default paper trading settings (uses schema defaults for riskPerTradePct, etc.)
      settings = await storage.createTradingSettings({
        userId,
        portfolioValue: STARTING_BALANCE_ENV,
        maxExposurePercent: '50.00', // 50% max exposure
        maxOpenTrades: 3,
        dailyLossKillSwitch: '7.00', // 7% daily loss limit
        slippageToleranceMajors: '0.15'
        // riskPerTradePct uses schema default of 4.00%
      });
    }
    
    // Get starting balance from existing settings
    const STARTING_BALANCE = parseFloat(settings.portfolioValue);

    console.log(`👤 User: ${userId}`);
    console.log(`💰 Starting Balance: $${STARTING_BALANCE} (from user settings)`);
    console.log(`📊 Risk per Trade: ${settings.riskPerTradePct || 4.00}% of portfolio`);
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
