/**
 * Phase 27.F.15.C: MetricsCore - Consolidated Metrics Calculation Service
 * Phase 27.F.15.D: Enhanced with Live Pricing Integration
 * 
 * Single source of truth for ALL metrics calculations (paper + live).
 * Enforces Mode Separation Integrity (MSI):
 * - Paper: Supports "Continue" vs "Start New Simulation" resets
 * - Live: Never resets, persistent across sessions
 * - Shared calculation logic, separate storage & caching by mode
 * - Live mode: Uses LivePricingAdapter for real-time unrealized P/L
 */

import { storage } from '../storage.js';
import { contextBridge } from './context-bridge.js';
import { livePricingAdapter } from './live-pricing-adapter.js';

type TradingMode = 'live' | 'paper';

export interface PortfolioKPIs {
  totalValue: number;
  unrealizedPL: number;
  realizedPL: number;
  currentExposure: number;
  openTradesCount: number;
  cash: number;
  crypto: number;
  cashPercent: number;
  cryptoPercent: number;
  updatedAt: Date;
}

export interface RiskKPIs {
  maxDrawdown: number;
  currentDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  updatedAt: Date;
}

export interface ExecutionKPIs {
  totalTrades: number;
  wins: number;
  losses: number;
  avgRMultiple: number;
  avgHoldTime: number; // in hours
  fillRate: number; // percentage of successful fills
  avgSlippage: number; // percentage
  updatedAt: Date;
}

export interface AllKPIs {
  portfolio: PortfolioKPIs;
  risk: RiskKPIs;
  execution: ExecutionKPIs;
  mode: TradingMode;
  computedAt: Date;
}

/**
 * MetricsCore - Phase 27.F.15.C
 * Consolidates all metrics calculation logic with strict mode separation
 */
class MetricsCore {
  private readonly MODULE_NAME = 'MetricsCore';
  
  // In-memory cache with mode separation
  private cache = new Map<string, { data: any; expiresAt: number }>();
  private readonly CACHE_TTL = 60000; // 60 seconds

  /**
   * Compute Portfolio KPIs for a given mode
   * Phase 27.F.15.C: Mode-based only, no userId
   */
  async computePortfolioKPIs(mode: TradingMode): Promise<PortfolioKPIs> {
    const startTime = Date.now();
    console.log(`[27.F.15.C][Metrics] Computing portfolio KPIs for mode: ${mode}`);

    try {
      // Fetch trades for this mode (global, no userId)
      const [allTrades, activeTrades] = await Promise.all([
        storage.getTrades(mode, {}),
        storage.getActiveTrades(mode)
      ]);

      const closedTrades = allTrades.filter(t => t.status === 'closed');

      // Calculate unrealized P/L from open trades
      let unrealizedPL = 0;
      let currentExposure = 0;
      let livePricesUsed = 0;
      
      for (const trade of activeTrades) {
        const entryPrice = parseFloat(trade.entryPrice);
        const quantity = parseFloat(trade.quantity);
        const tradeValue = entryPrice * quantity;
        currentExposure += tradeValue;
        
        // Phase 27.F.15.D: Use live pricing for live mode unrealized P/L
        if (mode === 'live') {
          const currentPrice = livePricingAdapter.getPrice(trade.symbol);
          // B-NEW-43 chunk 7 (2026-05-23): narrow currentPrice.price to non-null —
          // the schema allows null on the price column; the earlier truthy-check
          // narrowed currentPrice but not the nested .price field (TS18047).
          if (currentPrice && currentPrice.price !== null) {
            const currentValue = currentPrice.price * quantity;
            const positionPL = currentValue - tradeValue;
            unrealizedPL += positionPL;
            livePricesUsed++;
            
            console.log(`[27.F.15.D][Metrics-Live] ${trade.symbol}: Entry=$${entryPrice.toFixed(2)}, Current=$${currentPrice.price.toFixed(2)}, P/L=$${positionPL.toFixed(2)}`);
          } else {
            console.log(`[27.F.15.D][Metrics-Live] ⚠️ No live price for ${trade.symbol}, skipping unrealized P/L`);
          }
        }
        // Paper mode: unrealized P/L calculated at position close time (not live pricing)
      }
      
      if (mode === 'live' && livePricesUsed > 0) {
        console.log(`[27.F.15.D][Metrics-Live] Unrealized P/L calculated using ${livePricesUsed}/${activeTrades.length} live prices`);
      }

      // Calculate realized P/L from closed trades
      const realizedPL = closedTrades.reduce((total, trade) => {
        return total + (parseFloat(trade.realizedPL || '0'));
      }, 0);

      // Get portfolio balance based on mode
      // Phase 27.F.15.C: Use getPortfolioState for both modes
      const portfolioState = await storage.getPortfolioState({ mode });
      const startingBalance = portfolioState?.balance 
        ? parseFloat(portfolioState.balance) 
        : (mode === 'paper' ? 820 : 1000); // Defaults: paper=$820, live=$1000

      const totalValue = startingBalance + realizedPL + unrealizedPL;
      
      // Calculate cash vs crypto allocation
      const cash = totalValue - currentExposure;
      const cashPercent = totalValue > 0 ? (cash / totalValue) * 100 : 100;
      const cryptoPercent = totalValue > 0 ? (currentExposure / totalValue) * 100 : 0;

      const kpis: PortfolioKPIs = {
        totalValue,
        unrealizedPL,
        realizedPL,
        currentExposure,
        openTradesCount: activeTrades.length,
        cash,
        crypto: currentExposure,
        cashPercent,
        cryptoPercent,
        updatedAt: new Date()
      };

      const elapsed = Date.now() - startTime;
      console.log(`[27.F.15.C][Metrics] ✅ Portfolio KPIs computed for ${mode} in ${elapsed}ms`);

      return kpis;
    } catch (error) {
      console.error(`[27.F.15.C][Metrics] ❌ Failed to compute portfolio KPIs for ${mode}:`, error);
      throw error;
    }
  }

  /**
   * Compute Risk KPIs for a given mode
   * Phase 27.F.15.C: Mode-based only, no userId
   */
  async computeRiskKPIs(mode: TradingMode, days = 30): Promise<RiskKPIs> {
    const startTime = Date.now();
    console.log(`[27.F.15.C][Metrics] Computing risk KPIs for mode: ${mode} (${days} days)`);

    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const allTrades = await storage.getTrades(mode, {});
      const closedTrades = allTrades.filter(t => t.status === 'closed');
      const recentTrades = closedTrades.filter(trade => 
        trade.exitTime && new Date(trade.exitTime) >= fromDate
      );

      const wins = recentTrades.filter(trade => 
        parseFloat(trade.realizedPL || '0') > 0
      );
      const losses = recentTrades.filter(trade => 
        parseFloat(trade.realizedPL || '0') < 0
      );

      const totalWins = wins.reduce((sum, trade) => 
        sum + parseFloat(trade.realizedPL || '0'), 0
      );
      const totalLosses = Math.abs(losses.reduce((sum, trade) => 
        sum + parseFloat(trade.realizedPL || '0'), 0
      ));

      const winRate = recentTrades.length > 0 ? 
        (wins.length / recentTrades.length) * 100 : 0;
      const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

      const avgWin = wins.length > 0 ? totalWins / wins.length : 0;
      const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;

      // Calculate drawdown (simplified)
      let maxDrawdown = 0;
      let currentDrawdown = 0;
      let peak = 0;
      let runningTotal = 0;

      for (const trade of recentTrades.sort((a, b) => 
        new Date(a.exitTime!).getTime() - new Date(b.exitTime!).getTime()
      )) {
        runningTotal += parseFloat(trade.realizedPL || '0');
        if (runningTotal > peak) {
          peak = runningTotal;
        }
        const drawdown = peak - runningTotal;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
      currentDrawdown = peak - runningTotal;

      // Calculate Sharpe ratio (simplified, assuming risk-free rate = 0)
      const returns = recentTrades.map(t => parseFloat(t.realizedPL || '0'));
      const avgReturn = returns.length > 0 ? 
        returns.reduce((a, b) => a + b, 0) / returns.length : 0;
      const variance = returns.length > 0 ?
        returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length : 0;
      const stdDev = Math.sqrt(variance);
      const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

      const kpis: RiskKPIs = {
        maxDrawdown,
        currentDrawdown,
        sharpeRatio,
        winRate,
        profitFactor,
        avgWin,
        avgLoss,
        updatedAt: new Date()
      };

      const elapsed = Date.now() - startTime;
      console.log(`[27.F.15.C][Metrics] ✅ Risk KPIs computed for ${mode} in ${elapsed}ms`);

      return kpis;
    } catch (error) {
      console.error(`[27.F.15.C][Metrics] ❌ Failed to compute risk KPIs for ${mode}:`, error);
      throw error;
    }
  }

  /**
   * Compute Execution KPIs for a given mode
   * Phase 27.F.15.C: Mode-based only, no userId
   */
  async computeExecutionKPIs(mode: TradingMode): Promise<ExecutionKPIs> {
    const startTime = Date.now();
    console.log(`[27.F.15.C][Metrics] Computing execution KPIs for mode: ${mode}`);

    try {
      const allTrades = await storage.getTrades(mode, {});
      const closedTrades = allTrades.filter(t => t.status === 'closed');

      const wins = closedTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
      const losses = closedTrades.filter(t => parseFloat(t.realizedPL || '0') < 0);

      // Calculate average R-multiple
      const avgRMultiple = closedTrades.length > 0 ?
        closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPLR || '0'), 0) / closedTrades.length : 0;

      // Calculate average hold time
      let totalHoldTime = 0;
      let tradesWithHoldTime = 0;
      for (const trade of closedTrades) {
        if (trade.entryTime && trade.exitTime) {
          const holdTime = new Date(trade.exitTime).getTime() - new Date(trade.entryTime).getTime();
          totalHoldTime += holdTime;
          tradesWithHoldTime++;
        }
      }
      const avgHoldTime = tradesWithHoldTime > 0 ?
        (totalHoldTime / tradesWithHoldTime) / (1000 * 60 * 60) : 0; // Convert to hours

      // Calculate fill rate and slippage (simplified)
      const fillRate = allTrades.length > 0 ?
        (closedTrades.length / allTrades.length) * 100 : 100;
      
      // Average slippage (simplified - would need more detailed data)
      const avgSlippage = 0; // Placeholder

      const kpis: ExecutionKPIs = {
        totalTrades: closedTrades.length,
        wins: wins.length,
        losses: losses.length,
        avgRMultiple,
        avgHoldTime,
        fillRate,
        avgSlippage,
        updatedAt: new Date()
      };

      const elapsed = Date.now() - startTime;
      console.log(`[27.F.15.C][Metrics] ✅ Execution KPIs computed for ${mode} in ${elapsed}ms`);

      return kpis;
    } catch (error) {
      console.error(`[27.F.15.C][Metrics] ❌ Failed to compute execution KPIs for ${mode}:`, error);
      throw error;
    }
  }

  /**
   * Recompute all metrics for a given mode and broadcast via WebSocket
   * Phase 27.F.15.C: Orchestrates all KPI calculations + telemetry
   */
  async recomputeAll(mode: TradingMode): Promise<AllKPIs> {
    const startTime = Date.now();
    console.log(`[27.F.15.C][Metrics] Recomputing ALL KPIs for mode: ${mode}`);

    try {
      // Compute all KPIs in parallel
      const [portfolio, risk, execution] = await Promise.all([
        this.computePortfolioKPIs(mode),
        this.computeRiskKPIs(mode),
        this.computeExecutionKPIs(mode)
      ]);

      const allKPIs: AllKPIs = {
        portfolio,
        risk,
        execution,
        mode,
        computedAt: new Date()
      };

      // Cache the results with mode-specific key
      const cacheKey = `metrics:all:${mode}`;
      this.cache.set(cacheKey, {
        data: allKPIs,
        expiresAt: Date.now() + this.CACHE_TTL
      });

      const elapsed = Date.now() - startTime;
      console.log(`[27.F.15.C][Metrics] ✅ ALL KPIs recomputed for ${mode} in ${elapsed}ms`);

      // Phase 27.F.15.C: Broadcast metrics update via WebSocket
      console.log(`[27.F.15.C][WS] Broadcasting metrics_updated for mode: ${mode}`);
      contextBridge.broadcast({
        type: 'metrics_updated',
        payload: {
          mode,
          kpis: allKPIs,
          timestamp: new Date().toISOString()
        }
      });

      return allKPIs;
    } catch (error) {
      console.error(`[27.F.15.C][Metrics] ❌ Failed to recompute all KPIs for ${mode}:`, error);
      throw error;
    }
  }

  /**
   * Reset metrics for a given mode
   * Phase 27.F.15.C MSI: Paper supports reset, Live throws error
   */
  async reset(mode: TradingMode): Promise<void> {
    console.log(`[27.F.15.C][MSI] Reset requested for mode: ${mode}`);

    if (mode === 'live') {
      console.error(`[27.F.15.C][MSI] ❌ Reset NOT ALLOWED for live mode - metrics persist across sessions`);
      throw new Error('[MSI] Live mode metrics cannot be reset - they persist across sessions');
    }

    // Paper mode: Clear metrics cache
    const cacheKey = `metrics:all:${mode}`;
    this.cache.delete(cacheKey);
    
    console.log(`[27.F.15.C][MSI] ✅ Paper mode metrics reset complete`);
    
    // Broadcast that metrics were reset
    contextBridge.broadcast({
      type: 'metrics_updated',
      payload: {
        mode,
        kpis: null, // Indicates reset
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Get cached metrics or recompute if expired
   */
  async getCachedOrCompute(mode: TradingMode): Promise<AllKPIs> {
    const cacheKey = `metrics:all:${mode}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      console.log(`[27.F.15.C][Metrics] ✅ Cache hit for ${mode} metrics`);
      return cached.data;
    }

    console.log(`[27.F.15.C][Metrics] Cache miss or expired for ${mode}, recomputing...`);
    return await this.recomputeAll(mode);
  }
}

// Export singleton instance
export const metricsCore = new MetricsCore();
