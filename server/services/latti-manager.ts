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
        ? await storage.getTrades('live', { limit: 10000 })
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
    
    // Start hourly cross-strategy optimization
    this.startCrossStrategyOptimization();
  }

  /**
   * Phase 30.FX.6 - Cross-Strategy Optimization
   * Analyzes performance across all strategies and rebalances weights
   */
  static startCrossStrategyOptimization(): void {
    const oneHour = 60 * 60 * 1000;
    
    setInterval(async () => {
      await this.optimizeStrategyMix();
    }, oneHour);
    
    console.log('[30.FX.6][LATTIManager] Cross-strategy optimization started (hourly)');
  }

  /**
   * Phase 31.J - Get latest LATTI tuning metrics for dashboard
   * Returns real-time adaptive tuning metrics
   */
  static async getLatestMetrics(): Promise<any> {
    try {
      const { db } = await import("../db");
      const { sql } = await import("drizzle-orm");
      const { systemConfigService } = await import("./system-config");
      
      // Get passive learning status
      const config = await systemConfigService.getConfig();
      const passiveLearning = config.passiveLearning || false;
      
      // Get latest DHMA parameter updates from audit log
      const auditResult = await db.execute<{
        created_at: string;
        metadata: any;
      }>(sql`
        SELECT created_at, metadata
        FROM trading_audit_log
        WHERE triggered_by = 'latti_dhma_tuning'
        ORDER BY created_at DESC
        LIMIT 10
      `);
      
      const auditRows = auditResult.rows;
      
      // Get current DHMA telemetry for paper mode
      const telemetry = await this.fetchDHMATelemetry('paper');
      
      // Calculate adjustments from recent audit entries
      const adjustments: Record<string, number> = {};
      let lastRun: string | null = null;
      let totalAdjustments = 0;
      
      if (auditRows.length > 0) {
        lastRun = auditRows[0].created_at;
        
        // Aggregate parameter changes
        for (const row of auditRows) {
          const meta = row.metadata;
          if (meta?.key && meta?.old_value !== undefined && meta?.new_value !== undefined) {
            const delta = meta.new_value - meta.old_value;
            const key = `dhma.${meta.key}`;
            if (!adjustments[key]) {
              adjustments[key] = delta;
              totalAdjustments++;
            }
          }
        }
      }
      
      // Calculate confidence score based on telemetry
      let confidence = 0.5; // Base confidence
      if (telemetry.entries > 0 && telemetry.exits > 0) {
        // Increase confidence with more data points
        const dataPoints = telemetry.exits;
        const dataFactor = Math.min(dataPoints / 20, 1.0); // Max at 20+ closed trades
        
        // Adjust based on hit rate
        const hitRateFactor = telemetry.hitRate > 0.5 ? (telemetry.hitRate - 0.5) * 2 : 0;
        
        confidence = Math.min(0.95, 0.5 + (dataFactor * 0.3) + (hitRateFactor * 0.2));
      }
      
      // Calculate stability score (how stable parameters are)
      const stabilityScore = totalAdjustments < 2 ? 0.95 : 
                            totalAdjustments < 4 ? 0.85 : 0.75;
      
      return {
        lastRun: lastRun || new Date().toISOString(),
        tuningCycle: 30, // Minutes
        adjustments,
        confidence: Math.round(confidence * 100) / 100,
        stabilityScore: Math.round(stabilityScore * 100) / 100,
        passiveLearning,
        telemetry: {
          entries: telemetry.entries,
          exits: telemetry.exits,
          hitRate: Math.round(telemetry.hitRate * 100) / 100,
          avgPLPerTrade: Math.round(telemetry.avgPLPerTrade * 10000) / 10000,
        },
      };
    } catch (error: any) {
      console.error("[31.J][LATTIManager] Error fetching latest metrics:", error.message);
      return {
        status: "error",
        error: error.message,
        lastRun: new Date().toISOString(),
        tuningCycle: 30,
        adjustments: {},
        confidence: 0,
        stabilityScore: 0,
        passiveLearning: false,
      };
    }
  }

  /**
   * Optimize strategy mix based on recent performance
   */
  private static async optimizeStrategyMix(): Promise<void> {
    try {
      console.log("[30.FX.6][LATTIManager] Running hourly optimization...");
      
      const { db } = await import("../db");
      const { strategyMixLog } = await import("../../shared/schema");
      const axios = (await import("axios")).default;
      
      const strategies = ["dhma", "quantflow", "trendpulse", "volsurf", "momentumx"];
      const username = "testuser123";
      const password = "SecurePass123!";
      
      let token: string;
      try {
        const auth = await axios.post("http://localhost:5000/api/auth/login", {
          username,
          password,
        }, { timeout: 5000 });
        token = auth.data.accessToken;
      } catch (authErr: any) {
        console.warn("[30.FX.6][LATTIManager] Auth failed, skipping optimization:", authErr.message);
        return;
      }

      const telemetry: Array<{name: string; pnl: number; winRate: number}> = [];
      
      for (const strategy of strategies) {
        try {
          const { data } = await axios.get(
            `http://localhost:5000/api/strategy/${strategy}/telemetry?mode=live`,
            {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 10000,
            }
          );
          
          telemetry.push({
            name: strategy,
            pnl: data.avgPLPerTrade || 0,
            winRate: data.hitRate || 0,
          });
        } catch (err: any) {
          console.warn(`[30.FX.6][LATTIManager] Skipped ${strategy}: telemetry unavailable (${err.message})`);
        }
      }

      if (telemetry.length === 0) {
        console.log("[30.FX.6][LATTIManager] No strategy telemetry available");
        return;
      }

      telemetry.sort((a, b) => b.pnl - a.pnl);
      
      const top = telemetry.slice(0, Math.min(2, telemetry.length));
      const bottom = telemetry.slice(-Math.min(2, telemetry.length));

      for (const s of top) {
        await db.insert(strategyMixLog).values({
          strategy: s.name,
          oldWeight: null,
          newWeight: 1.1,
          reason: "top_performer",
          metadata: {
            pnl: s.pnl,
            winRate: s.winRate,
            timestamp: new Date().toISOString(),
          },
        });
      }

      for (const s of bottom) {
        if (s.pnl < 0) {
          await db.insert(strategyMixLog).values({
            strategy: s.name,
            oldWeight: null,
            newWeight: 0.9,
            reason: "underperformer",
            metadata: {
              pnl: s.pnl,
              winRate: s.winRate,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      console.log(`[30.FX.6][LATTIManager] Mix updated:`);
      if (top.length > 0) {
        console.log(`  ↑ +10% for ${top.map(t => t.name).join(", ")}`);
      }
      if (bottom.some(b => b.pnl < 0)) {
        const underperformers = bottom.filter(b => b.pnl < 0);
        console.log(`  ↓ -10% for ${underperformers.map(b => b.name).join(", ")}`);
      }
    } catch (error: any) {
      console.error("[30.FX.6][LATTIManager] Error in strategy optimization:", error.message);
    }
  }
}
