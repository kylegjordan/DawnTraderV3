import { getMarketDataCoordinator } from './market-data-coordinator';
import { executionTiming } from './execution-timing';
import { slippageFeeModel } from './slippage-fee-model';
// B-4.5: modelTradeRealism is per-class (DB-governed fees).
import { resolveAssetClass } from '../../shared/asset-classes.js';
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

  // Concurrency controls
  private activeOrdersPerSymbol: Map<string, number> = new Map();
  private readonly MAX_CONCURRENT_PER_SYMBOL = 3;
  
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
      // B-5 AMR (Obj-6): same gate call as the paper engine — this executor is
      // the live-mode scaffold (item-4) and stays dormant until Phase 21; the
      // gate ships WIRED so the live path can never bypass AMR by omission.
      // No slot count here (engine-level position registry owns that); the
      // execution_entry slot gate enforces in the paper engine path.
      // B1 (Langston Step-4): only the module/class RESOLUTION is guarded —
      // the gate verdict itself is outside any catch (evaluateAmrGates never
      // throws and is fail-closed internally under active).
      let _amrGateMod: typeof import('../core/governance/amr-gates.js') | null = null;
      let _amrClass: ReturnType<typeof import('../../shared/asset-classes.js')['safeResolveAssetClass']> = null;
      try {
        const { safeResolveAssetClass } = await import('../../shared/asset-classes.js');
        _amrClass = safeResolveAssetClass(request.symbol, 'kraken');
        if (_amrClass !== null) _amrGateMod = await import('../core/governance/amr-gates.js');
      } catch (amrErr) {
        console.warn(`[B-5][RT-Exec] AMR module resolution error (gate skipped): ${amrErr instanceof Error ? amrErr.message : amrErr}`);
      }
      if (_amrGateMod && _amrClass !== null) {
        const gate = _amrGateMod.evaluateAmrGates({ assetClass: _amrClass, site: 'execution_entry', strategy: request.strategy });
        if (!gate.allowed) {
          throw new Error(`AMR gate block: ${gate.blocks.map(b => b.gate).join(',')} (mode=${gate.mode})`);
        }
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
        resolveAssetClass(request.symbol, 'kraken'), // B-4.5: per-class DB-governed fees
        orderBook,
        undefined, // Recent prices from tick history
        false // Assume taker for paper trading (maker flip = Phase 19 eval, direction B)
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
