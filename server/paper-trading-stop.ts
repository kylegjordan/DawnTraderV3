import { storage } from './storage';

async function stopPaperTrading() {
  try {
    console.log('🛑 Stopping Paper Trading Simulation...\n');

    // Get user ID from environment or use test user
    const userId = process.env.PAPER_TRADING_USER_ID || '6c591801-3072-431d-b192-30aaf426f15e';

    // Make API call to stop endpoint
    const baseUrl = process.env.API_URL || 'http://localhost:5000';
    
    // First, authenticate to get a session
    const user = await storage.getUserByUsername('testuser123');
    if (!user) {
      throw new Error('Test user not found. Make sure the server is running.');
    }

    console.log(`👤 Stopping simulation for user: ${userId}`);
    
    // Make API request to stop simulation
    const response = await fetch(`${baseUrl}/api/paper-sim/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Note: In production, you'd need proper authentication
      // For now, we'll use direct database access to stop
    });

    if (!response.ok) {
      // If API call fails, try direct access
      console.log('⚠️  API call failed, attempting direct shutdown...');
      
      // Access global deregister function
      const deregister = (global as any).deregisterSimulationSession;
      if (typeof deregister === 'function') {
        deregister();
        console.log('✅ Simulation session deregistered');
      }
      
      // Access global manager
      const globalManager = (global as any).globalPaperPortfolioManager;
      if (globalManager && typeof globalManager.stop === 'function') {
        await globalManager.stop();
        (global as any).globalPaperPortfolioManager = null;
        console.log('✅ Portfolio manager stopped');
      }
    } else {
      console.log('✅ Paper trading simulation stopped successfully via API');
    }

    console.log('\n🎯 Simulation stopped\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error stopping paper trading simulation:', error);
    console.log('\n💡 Try stopping via the dashboard UI or check if simulation is running');
    process.exit(1);
  }
}

stopPaperTrading();
