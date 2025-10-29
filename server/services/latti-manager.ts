/**
 * LATTI Manager - Learning-Adaptive Trading & Tuning Intelligence
 * 
 * Coordinates adaptive learning across strategies including DHMA parameter tuning.
 * This service processes strategy telemetry and applies intelligent parameter adjustments.
 */

import { DHMATuningService } from "./dhma-tuning-service";

export class LATTIManager {
  /**
   * Process telemetry for all adaptive strategies
   * @param mode Trading mode (paper/live)
   */
  static async processStrategyTelemetry(mode: 'paper' | 'live'): Promise<void> {
    try {
      console.log(`[LATTIManager] Processing strategy telemetry for ${mode} mode...`);

      // Fetch DHMA telemetry
      const dhmaTelemetry = await this.fetchDHMATelemetry(mode);
      
      if (dhmaTelemetry && dhmaTelemetry.entries > 0) {
        // Process DHMA adaptive tuning
        await DHMATuningService.processTelemetry(mode, dhmaTelemetry);
      } else {
        console.log(`[LATTIManager][${mode}] No DHMA trades to process (entries: ${dhmaTelemetry?.entries || 0})`);
      }

      // Future: Add other strategy tuning services here
      // await OtherStrategyTuningService.processTelemetry(mode, telemetry);
      
    } catch (error: any) {
      console.error(`[LATTIManager] Error processing telemetry for ${mode}:`, error.message);
    }
  }

  /**
   * Fetch DHMA telemetry from the trades database
   * @param mode Trading mode
   * @returns DHMA telemetry metrics
   */
  private static async fetchDHMATelemetry(mode: 'paper' | 'live'): Promise<any> {
    try {
      const { storage } = await import('../storage');
      
      // Get DHMA trades from the last 24 hours
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const allTrades = mode === 'live' 
        ? await storage.getTrades({ limit: 10000 })
        : await storage.getAllPaperTrades();
      
      // Filter for DHMA strategy in the last 24 hours
      const dhmaTrades = allTrades.filter((t: any) => 
        t.strategy === 'dhma' && 
        t.entryTime && 
        new Date(t.entryTime) >= oneDayAgo
      );
      
      if (dhmaTrades.length === 0) {
        return { entries: 0, exits: 0, hitRate: 0, avgPLPerTrade: 0, avgSpreadTicks: 0, avgToxicity: 0 };
      }

      // Calculate metrics
      const entries = dhmaTrades.length;
      const closedTrades = dhmaTrades.filter((t: any) => t.status === 'closed' && t.exitTime);
      const exits = closedTrades.length;
      
      const winningTrades = closedTrades.filter((t: any) => 
        parseFloat(t.realizedPL || '0') > 0
      );
      
      const hitRate = closedTrades.length > 0 
        ? (winningTrades.length / closedTrades.length)
        : 0;

      // Calculate average P&L per trade
      const totalPL = closedTrades.reduce((sum: number, t: any) => 
        sum + parseFloat(t.realizedPL || '0'), 0
      );
      const avgPLPerTrade = closedTrades.length > 0 ? totalPL / closedTrades.length : 0;

      // Extract DHMA-specific metrics from trade metadata if available
      let avgSpreadTicks = 5; // Default
      let avgToxicity = 0.5; // Default
      
      // Try to extract from trade metadata
      const tradesWithMetadata = dhmaTrades.filter((t: any) => t.metadata);
      if (tradesWithMetadata.length > 0) {
        const spreads = tradesWithMetadata
          .map((t: any) => t.metadata?.spreadTicks)
          .filter((s: any) => s !== undefined);
        const toxicities = tradesWithMetadata
          .map((t: any) => t.metadata?.toxicity)
          .filter((tx: any) => tx !== undefined);
        
        if (spreads.length > 0) {
          avgSpreadTicks = spreads.reduce((a: number, b: number) => a + b, 0) / spreads.length;
        }
        if (toxicities.length > 0) {
          avgToxicity = toxicities.reduce((a: number, b: number) => a + b, 0) / toxicities.length;
        }
      }

      return {
        entries,
        exits,
        hitRate,
        avgPLPerTrade,
        avgSpreadTicks,
        avgToxicity,
      };
    } catch (error: any) {
      console.error(`[LATTIManager] Error fetching DHMA telemetry:`, error.message);
      return { entries: 0, exits: 0, hitRate: 0, avgPLPerTrade: 0, avgSpreadTicks: 0, avgToxicity: 0 };
    }
  }

  /**
   * Start periodic telemetry processing (called from main server init)
   */
  static startPeriodicProcessing(): void {
    // Run every 30 minutes
    const thirtyMinutes = 30 * 60 * 1000;
    
    setInterval(async () => {
      // Process paper mode telemetry
      await this.processStrategyTelemetry('paper');
      
      // Process live mode telemetry (but don't auto-apply in live per directive)
      // await this.processStrategyTelemetry('live');
    }, thirtyMinutes);

    console.log('[LATTIManager] Periodic telemetry processing started (every 30 minutes)');
  }
}
