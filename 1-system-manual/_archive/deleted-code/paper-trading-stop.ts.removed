import { storage } from './storage';
import { SystemUserCache } from './utils/system-user-cache'; // Phase 31.I

async function stopPaperTrading() {
  try {
    console.log('🛑 Stopping Paper Trading Simulation...\n');

    // Phase 31.I: Get user ID dynamically (no hardcoded UUIDs)
    const userId = process.env.PAPER_TRADING_USER_ID || await SystemUserCache.getOrResolve('testuser123');

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
      
      // P19-B4b D5: per-mode accessor (mode='paper'). Was a raw global slot.
      const { getGlobalPaperSimManager, clearGlobalPaperSimManager } = await import('./services/paper-sim-service.js');
      const globalManager = getGlobalPaperSimManager('paper');
      if (globalManager && typeof globalManager.stop === 'function') {
        await globalManager.stop();
        clearGlobalPaperSimManager('paper');
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
