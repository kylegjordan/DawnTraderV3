import { OrderBookSnapshot } from './market-data-ws';
// B-4.5: fees are DB-governed per asset class (module_constants 'fee_model',
// warmed at boot, fail-hard). Static DEFAULT_TAKER/MAKER_FEE retired.
import { getCachedNumberRequired } from './module-constants-service.js';
import type { AssetClass } from '../../shared/asset-classes.js';

export interface SlippageModel {
  intendedPrice: number;
  modeledFillPrice: number;
  slippageBps: number;
  priceImpact: number;
  microMoveComponent: number;
}

export interface FeeModel {
  grossAmount: number;
  makerFee: number;
  takerFee: number;
  totalFees: number;
  netAmount: number;
}

export interface TradeRealism {
  slippage: SlippageModel;
  fees: FeeModel;
  netPnl: number;
}

class SlippageFeeModelingService {
  // B-4.5: per-class DB-resolved fee (decimal). Throws on cold cache /
  // missing row — boot warmup makes that a deploy-time failure.
  private resolveFee(assetClass: AssetClass, constant: 'spot_taker_fee' | 'spot_maker_fee'): number {
    return getCachedNumberRequired('fee_model', constant, {
      exchange: '*', assetClass, strategy: '*', regime: '*',
    });
  }
  
  // Volatility estimation window
  private priceHistory: Map<string, number[]> = new Map();
  private readonly VOLATILITY_WINDOW = 20;

  /**
   * Model slippage based on order book depth and volatility
   */
  public modelSlippage(
    symbol: string,
    side: 'buy' | 'sell',
    quantity: number,
    intendedPrice: number,
    orderBook?: OrderBookSnapshot,
    recentPrices?: number[]
  ): SlippageModel {
    // 1. Price impact from order book depth
    let priceImpact = 0;
    if (orderBook) {
      priceImpact = this.calculatePriceImpact(
        side,
        quantity,
        intendedPrice,
        orderBook
      );
    } else {
      // Conservative estimate without order book
      priceImpact = this.estimatePriceImpactWithoutBook(quantity, intendedPrice);
    }

    // 2. Micro-move component based on short-term volatility
    const volatility = this.estimateVolatility(symbol, recentPrices);
    const microMoveComponent = this.generateMicroMove(volatility);

    // 3. Total slippage
    const totalSlippage = side === 'buy' 
      ? priceImpact + microMoveComponent  // Buying costs more
      : -(priceImpact + microMoveComponent); // Selling gets less

    const modeledFillPrice = intendedPrice * (1 + totalSlippage);
    const slippageBps = totalSlippage * 10000; // Convert to basis points

    return {
      intendedPrice,
      modeledFillPrice,
      slippageBps,
      priceImpact,
      microMoveComponent,
    };
  }

  /**
   * Calculate price impact from order book
   */
  private calculatePriceImpact(
    side: 'buy' | 'sell',
    quantity: number,
    intendedPrice: number,
    orderBook: OrderBookSnapshot
  ): number {
    const book = side === 'buy' ? orderBook.asks : orderBook.bids;
    
    if (!book || book.length === 0) {
      return 0.0001; // Minimal impact if no book data
    }

    let remainingQty = quantity;
    let totalCost = 0;
    let filledQty = 0;

    for (const [price, volume] of book) {
      if (remainingQty <= 0) break;

      const fillQty = Math.min(remainingQty, volume);
      totalCost += fillQty * price;
      filledQty += fillQty;
      remainingQty -= fillQty;
    }

    if (filledQty === 0) {
      // Order too large for book
      return 0.005; // 0.5% impact
    }

    const avgFillPrice = totalCost / filledQty;
    const impact = (avgFillPrice - intendedPrice) / intendedPrice;
    
    return Math.abs(impact);
  }

  /**
   * Estimate price impact without order book (conservative)
   */
  private estimatePriceImpactWithoutBook(quantity: number, price: number): number {
    // Simple model: impact scales with order value
    const orderValue = quantity * price;
    
    if (orderValue < 1000) return 0.0001; // $1K: 1 bp
    if (orderValue < 10000) return 0.0002; // $10K: 2 bps
    if (orderValue < 50000) return 0.0005; // $50K: 5 bps
    return 0.001; // $50K+: 10 bps
  }

  /**
   * Estimate short-term volatility
   */
  private estimateVolatility(symbol: string, recentPrices?: number[]): number {
    if (recentPrices && recentPrices.length >= 2) {
      // Calculate returns
      const returns = [];
      for (let i = 1; i < recentPrices.length; i++) {
        const ret = (recentPrices[i] - recentPrices[i - 1]) / recentPrices[i - 1];
        returns.push(ret);
      }
      
      // Standard deviation of returns
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
      return Math.sqrt(variance);
    }

    // Default conservative volatility
    return 0.001; // 0.1%
  }

  /**
   * Generate random micro-move based on volatility
   */
  private generateMicroMove(volatility: number): number {
    // Normal distribution approximation using Box-Muller
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    
    // Scale by volatility and limit to reasonable range
    const move = z * volatility;
    return Math.max(-0.002, Math.min(0.002, move)); // Cap at ±20 bps
  }

  /**
   * Calculate fees for a trade
   */
  public calculateFees(
    grossAmount: number,
    isMaker: boolean,
    // B-4.5: REQUIRED — fees resolve per asset class (DB-governed, fail-hard).
    assetClass: AssetClass,
    makerFeeRate?: number,
    takerFeeRate?: number
  ): FeeModel {
    const makerFee = makerFeeRate ?? this.resolveFee(assetClass, 'spot_maker_fee');
    const takerFee = takerFeeRate ?? this.resolveFee(assetClass, 'spot_taker_fee');
    
    const feeRate = isMaker ? makerFee : takerFee;
    const totalFees = grossAmount * feeRate;
    const netAmount = grossAmount - totalFees;

    return {
      grossAmount,
      makerFee: isMaker ? totalFees : 0,
      takerFee: isMaker ? 0 : totalFees,
      totalFees,
      netAmount,
    };
  }

  /**
   * Model complete trade realism (slippage + fees)
   */
  public modelTradeRealism(
    symbol: string,
    side: 'buy' | 'sell',
    quantity: number,
    intendedPrice: number,
    // B-4.5: REQUIRED — threaded by callers (resolveAssetClass on the symbol).
    assetClass: AssetClass,
    orderBook?: OrderBookSnapshot,
    recentPrices?: number[],
    isMaker: boolean = false
  ): TradeRealism {
    // Model slippage
    const slippage = this.modelSlippage(
      symbol,
      side,
      quantity,
      intendedPrice,
      orderBook,
      recentPrices
    );

    // Calculate gross trade amount
    const grossAmount = quantity * slippage.modeledFillPrice;

    // Calculate fees
    const fees = this.calculateFees(grossAmount, isMaker, assetClass);

    // Calculate net P&L impact
    const costBasis = quantity * intendedPrice;
    const actualCost = side === 'buy' 
      ? grossAmount + fees.totalFees
      : grossAmount - fees.totalFees;
    
    const netPnl = side === 'buy'
      ? costBasis - actualCost  // Buying: intended cost - actual cost
      : actualCost - costBasis;  // Selling: actual proceeds - intended proceeds

    return {
      slippage,
      fees,
      netPnl,
    };
  }

  /**
   * Get aggregate statistics
   */
  public getAggregateStats(trades: TradeRealism[]): {
    avgSlippageBps: number;
    avgFeesPerTrade: number;
    totalSlippageCost: number;
    totalFees: number;
    totalNetPnl: number;
  } {
    if (trades.length === 0) {
      return {
        avgSlippageBps: 0,
        avgFeesPerTrade: 0,
        totalSlippageCost: 0,
        totalFees: 0,
        totalNetPnl: 0,
      };
    }

    const totalSlippageBps = trades.reduce((sum, t) => sum + Math.abs(t.slippage.slippageBps), 0);
    const totalFees = trades.reduce((sum, t) => sum + t.fees.totalFees, 0);
    const totalNetPnl = trades.reduce((sum, t) => sum + t.netPnl, 0);
    
    // Estimate slippage cost in dollars
    const totalSlippageCost = trades.reduce((sum, t) => {
      const slippageDollars = Math.abs(
        t.slippage.modeledFillPrice - t.slippage.intendedPrice
      ) * (t.fees.grossAmount / t.slippage.modeledFillPrice);
      return sum + slippageDollars;
    }, 0);

    return {
      avgSlippageBps: totalSlippageBps / trades.length,
      avgFeesPerTrade: totalFees / trades.length,
      totalSlippageCost,
      totalFees,
      totalNetPnl,
    };
  }

  /**
   * Update price history for volatility estimation
   */
  public updatePriceHistory(symbol: string, price: number): void {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }

    const history = this.priceHistory.get(symbol)!;
    history.push(price);

    // Keep only recent window
    if (history.length > this.VOLATILITY_WINDOW) {
      history.shift();
    }
  }

  /**
   * Get configuration
   */
  // B-4.5: config surface is per-class now (fees are DB-governed).
  public getConfig(assetClass: AssetClass) {
    return {
      makerFee: this.resolveFee(assetClass, 'spot_maker_fee'),
      takerFee: this.resolveFee(assetClass, 'spot_taker_fee'),
      volatilityWindow: this.VOLATILITY_WINDOW,
    };
  }
}

// Singleton instance
export const slippageFeeModel = new SlippageFeeModelingService();
