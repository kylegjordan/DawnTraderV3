import { getMarketDataCoordinator } from './market-data-coordinator';
import { executionTiming } from './execution-timing';
import { slippageFeeModel } from './slippage-fee-model';
import { rateControl } from './rate-control';
import { storage } from '../storage';
import { nanoid } from 'nanoid';

/**
 * Real-time Paper Trading Executor
 * Integrates WebSocket data, execution timing, slippage modeling, and rate controls
 */

export interface RealTimeTradeRequest {
  userId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  strategy: string;
  intendedPrice: number;
}

export interface RealTimeTradeResult {
  orderId: string;
  success: boolean;
  fillPrice: number;
  slippageBps: number;
  fees: number;
  netPnl: number;
  executionTimeMs: number;
  dataSource: 'ws' | 'rest_fallback';
}

class RealtimePaperExecutor {
  private mdCoordinator = getMarketDataCoordinator();
  private killSwitchActive = false;
  private killSwitchReason: string | null = null;

  // Concurrency controls
  private activeOrdersPerSymbol: Map<string, number> = new Map();
  private readonly MAX_CONCURRENT_PER_SYMBOL = 3;
  
  // Kill-switch thresholds
  private readonly DAILY_LOSS_THRESHOLD = -1000; // $1000 daily loss
  private readonly LATENCY_THRESHOLD_MS = 5000; // 5 second latency
  
  constructor() {
    // Subscribe to market data updates
    this.mdCoordinator.on('tick', (tick) => {
      // Update price history for volatility estimation
      slippageFeeModel.updatePriceHistory(tick.symbol, tick.last);
    });
  }

  /**
   * Execute a paper trade with full realism
   */
  public async executeTrade(request: RealTimeTradeRequest): Promise<RealTimeTradeResult> {
    const orderId = `paper_${nanoid()}`;
    const startTime = Date.now();

    try {
      // Check kill-switch
      if (this.killSwitchActive) {
        throw new Error(`Kill-switch active: ${this.killSwitchReason}`);
      }

      // Check concurrency limits
      this.checkConcurrencyLimits(request.symbol);

      // === TIMING MARK 1: Decision ===
      executionTiming.markDecision(
        orderId,
        request.symbol,
        request.side,
        request.quantity,
        request.intendedPrice,
        request.strategy
      );

      // Get current market data (WS or fallback)
      const dataSource = this.mdCoordinator.getDataSource();
      const tick = this.mdCoordinator.getLatestTick(request.symbol);
      const orderBook = this.mdCoordinator.getLatestOrderBook(request.symbol);

      if (!tick) {
        throw new Error(`No market data available for ${request.symbol}`);
      }

      // === TIMING MARK 2: Submit ===
      const venuePrice = request.side === 'buy' ? tick.ask : tick.bid;
      executionTiming.markSubmit(orderId, venuePrice, dataSource);

      // Use rate control for order submission
      await rateControl.execute('private', 'entry', async () => {
        // Simulate submission delay
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
        return true;
      });

      // === TIMING MARK 3: Acknowledgment ===
      executionTiming.markAck(orderId);

      // Model slippage and fees
      const realism = slippageFeeModel.modelTradeRealism(
        request.symbol,
        request.side,
        request.quantity,
        request.intendedPrice,
        orderBook,
        undefined, // Recent prices from tick history
        false // Assume taker for paper trading
      );

      // Simulate fill delay
      await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 50));

      // === TIMING MARK 4: Fill ===
      executionTiming.markFill(
        orderId,
        realism.slippage.modeledFillPrice,
        realism.slippage.slippageBps,
        realism.fees.totalFees
      );

      // Record trade in paper portfolio
      await this.recordPaperTrade({
        orderId,
        userId: request.userId,
        symbol: request.symbol,
        side: request.side,
        quantity: request.quantity,
        intendedPrice: request.intendedPrice,
        fillPrice: realism.slippage.modeledFillPrice,
        slippageBps: realism.slippage.slippageBps,
        fees: realism.fees.totalFees,
        netPnl: realism.netPnl,
        strategy: request.strategy,
        dataSource,
      });

      const executionTimeMs = Date.now() - startTime;

      // Check kill-switch conditions
      this.checkKillSwitch(executionTimeMs);

      return {
        orderId,
        success: true,
        fillPrice: realism.slippage.modeledFillPrice,
        slippageBps: realism.slippage.slippageBps,
        fees: realism.fees.totalFees,
        netPnl: realism.netPnl,
        executionTimeMs,
        dataSource,
      };

    } catch (error: any) {
      console.error(`[RT-Paper] Trade execution failed: ${error.message}`);
      return {
        orderId,
        success: false,
        fillPrice: 0,
        slippageBps: 0,
        fees: 0,
        netPnl: 0,
        executionTimeMs: Date.now() - startTime,
        dataSource: this.mdCoordinator.getDataSource(),
      };
    } finally {
      // Release concurrency slot
      this.releaseConcurrencySlot(request.symbol);
    }
  }

  /**
   * Check concurrency limits
   */
  private checkConcurrencyLimits(symbol: string): void {
    const current = this.activeOrdersPerSymbol.get(symbol) || 0;
    
    if (current >= this.MAX_CONCURRENT_PER_SYMBOL) {
      throw new Error(`Concurrency limit reached for ${symbol} (${current}/${this.MAX_CONCURRENT_PER_SYMBOL})`);
    }

    this.activeOrdersPerSymbol.set(symbol, current + 1);
  }

  /**
   * Release concurrency slot
   */
  private releaseConcurrencySlot(symbol: string): void {
    const current = this.activeOrdersPerSymbol.get(symbol) || 0;
    if (current > 0) {
      this.activeOrdersPerSymbol.set(symbol, current - 1);
    }
  }

  /**
   * Check kill-switch conditions
   */
  private checkKillSwitch(latencyMs: number): void {
    // Latency threshold
    if (latencyMs > this.LATENCY_THRESHOLD_MS) {
      this.activateKillSwitch(`Execution latency exceeded ${this.LATENCY_THRESHOLD_MS}ms`);
    }

    // WebSocket failure
    const mdStatus = this.mdCoordinator.getStatus();
    if (!mdStatus.wsConnected && mdStatus.lastTickAgeMs > 10000) {
      this.activateKillSwitch('Cascading WS failure - no data > 10s');
    }
  }

  /**
   * Activate kill-switch
   */
  private activateKillSwitch(reason: string): void {
    if (!this.killSwitchActive) {
      this.killSwitchActive = true;
      this.killSwitchReason = reason;
      console.error(`[RT-Paper] 🚨 KILL-SWITCH ACTIVATED: ${reason}`);
      
      // Trigger self-repair after cooldown
      setTimeout(() => this.attemptSelfRepair(), 30000); // 30 second cooldown
    }
  }

  /**
   * Attempt to reset kill-switch
   */
  private attemptSelfRepair(): void {
    console.log('[RT-Paper] Attempting self-repair...');
    
    // Check if conditions improved
    const mdStatus = this.mdCoordinator.getStatus();
    
    if (mdStatus.wsConnected || mdStatus.lastTickAgeMs < 2000) {
      this.killSwitchActive = false;
      this.killSwitchReason = null;
      console.log('[RT-Paper] ✅ Self-repair successful - kill-switch reset');
    } else {
      console.log('[RT-Paper] ⚠️  Self-repair failed - conditions not improved');
      // Try again later
      setTimeout(() => this.attemptSelfRepair(), 30000);
    }
  }

  /**
   * Record trade in paper portfolio
   */
  private async recordPaperTrade(trade: any): Promise<void> {
    // This integrates with existing paper trading storage
    // For now, just log - will integrate with storage in next step
    console.log(`[RT-Paper] Trade recorded: ${trade.orderId} ${trade.side} ${trade.quantity} ${trade.symbol} @ ${trade.fillPrice}`);
  }

  /**
   * Get executor status
   */
  public getStatus() {
    const mdStatus = this.mdCoordinator.getStatus();
    const rateStatus = rateControl.getStatus('private');
    const execMetrics = executionTiming.getMetrics(10);

    return {
      killSwitch: {
        active: this.killSwitchActive,
        reason: this.killSwitchReason,
      },
      marketData: {
        source: mdStatus.dataSource,
        wsConnected: mdStatus.wsConnected,
        lastTickAgeMs: mdStatus.lastTickAgeMs,
        reconnects: mdStatus.wsReconnects,
      },
      execution: {
        avgSubmitAckMs: execMetrics.avgSubmitAckMs,
        avgAckFillMs: execMetrics.avgAckFillMs,
        avgSlippageBps: execMetrics.avgSlippageBps,
        avgFeesPerTrade: execMetrics.avgFeesPerTrade,
      },
      rateControl: {
        backpressure: rateStatus.backpressure,
        queuedRequests: rateStatus.queuedRequests,
      },
      concurrency: {
        activeSymbols: Array.from(this.activeOrdersPerSymbol.entries())
          .filter(([_, count]) => count > 0)
          .map(([symbol, count]) => ({ symbol, count })),
      },
    };
  }
}

// Singleton instance
export const realtimePaperExecutor = new RealtimePaperExecutor();
