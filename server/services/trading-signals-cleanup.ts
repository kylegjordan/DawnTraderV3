import { db } from "../db";
import { tradingSignals } from "../../shared/schema";
import { and, eq, lte } from "drizzle-orm";

export class TradingSignalsCleanupTask {
  name = 'trading_signals_cleanup';
  description = 'Cleanup expired trading signals and remove old entries';
  frequency = 'every 5 minutes';
  intervalMs = 5 * 60 * 1000; // 5 minutes
  
  async run() {
    try {
      console.log('[SignalsCleanup] 🧹 Starting cleanup cycle...');
      
      // 1. Mark expired signals (past their expiresAt time)
      const expiredResult = await db
        .update(tradingSignals)
        .set({ status: 'expired' })
        .where(and(
          eq(tradingSignals.status, 'active'),
          lte(tradingSignals.expiresAt, new Date())
        ))
        .returning();
      
      const expiredCount = expiredResult.length;
      
      // 2. Delete old signals (expired more than 7 days ago) to prevent DB bloat
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const deleteResult = await db
        .delete(tradingSignals)
        .where(and(
          eq(tradingSignals.status, 'expired'),
          lte(tradingSignals.expiresAt, sevenDaysAgo)
        ))
        .returning();
      
      const deletedCount = deleteResult.length;
      
      console.log(`[SignalsCleanup] ✅ Removed ${expiredCount} expired signals, deleted ${deletedCount} old signals`);
      console.log(`[SignalsCleanup] 📅 Next run in 5 minutes`);
      
    } catch (error) {
      console.error('[SignalsCleanup] ❌ Error during cleanup:', error);
    }
  }
}

// Export singleton instance
export const tradingSignalsCleanupTask = new TradingSignalsCleanupTask();
