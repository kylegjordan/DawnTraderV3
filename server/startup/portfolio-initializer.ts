import { storage } from '../storage';
import { KrakenService } from '../exchanges/kraken/kraken.js';

export async function initializePortfolioState(): Promise<void> {
  console.log('[PortfolioInit] Checking portfolio_state table...');
  
  try {
    const globalContextId = 'default';
    
    const existingLive = await storage.getPortfolioState({ globalContextId, mode: 'live' });
    const existingPaper = await storage.getPortfolioState({ globalContextId, mode: 'paper' });
    
    if (!existingLive) {
      console.log('[PortfolioInit] Live-mode entry missing, fetching from Kraken API...');
      try {
        const kraken = new KrakenService();
        const krakenBalance = await kraken.getAccountBalance('default');
        const liveBalance = parseFloat(krakenBalance.totalValue).toFixed(2);
        
        await storage.upsertPortfolioState({
          globalContextId,
          mode: 'live',
          balance: liveBalance
        });
        
        console.log(`[PortfolioInit] ✅ Created live-mode entry: $${liveBalance}`);
      } catch (error) {
        console.warn('[PortfolioInit] ⚠️ Failed to fetch Kraken balance, using default $0');
        await storage.upsertPortfolioState({
          globalContextId,
          mode: 'live',
          balance: '0.00'
        });
      }
    } else {
      console.log(`[PortfolioInit] ✓ Live-mode entry exists: $${existingLive.balance}`);
    }
    
    if (!existingPaper) {
      console.log('[PortfolioInit] Paper-mode entry missing, creating with default $1000...');
      await storage.upsertPortfolioState({
        globalContextId,
        mode: 'paper',
        balance: '1000.00'
      });
      console.log('[PortfolioInit] ✅ Created paper-mode entry: $1000.00');
    } else {
      console.log(`[PortfolioInit] ✓ Paper-mode entry exists: $${existingPaper.balance}`);
    }
    
    console.log('[PortfolioInit] ✅ Portfolio state initialization complete');
  } catch (error) {
    console.error('[PortfolioInit] ❌ Failed to initialize portfolio state:', error);
  }
}
