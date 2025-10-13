import { Paper48HrSimulation } from './services/paper-48hr-simulation';
import { storage } from './storage';

async function startPaperTrading() {
  try {
    console.log('🚀 Initializing 48-Hour Paper Trading Simulation...\n');

    // Configuration from environment or defaults
    const STARTING_BALANCE = process.env.STARTING_BALANCE_USD 
      ? parseFloat(process.env.STARTING_BALANCE_USD)
      : 800;

    // Get user ID from environment or use test user
    const userId = process.env.PAPER_TRADING_USER_ID || '6c591801-3072-431d-b192-30aaf426f15e';

    // Verify user exists and has trading settings
    let settings = await storage.getTradingSettings(userId);
    if (!settings) {
      console.error('❌ No trading settings found for user. Creating defaults...');
      
      // Create default paper trading settings
      settings = await storage.createTradingSettings({
        userId,
        portfolioValue: STARTING_BALANCE.toString(),
        riskPerTrade: '150.00', // $150 risk per trade (~18.75% of $800)
        maxExposurePercent: '50.00', // 50% max exposure
        maxOpenTrades: 3,
        dailyLossKillSwitch: '7.00', // 7% daily loss limit
        slippageToleranceMajors: '0.15'
      });
    } else {
      // Update portfolio value to starting balance
      settings = await storage.updateTradingSettings(userId, {
        portfolioValue: STARTING_BALANCE.toString()
      });
    }

    console.log(`👤 User: ${userId}`);
    console.log(`💰 Starting Balance: $${STARTING_BALANCE}`);
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
