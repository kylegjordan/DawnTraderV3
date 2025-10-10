// server/services/asset-capabilities.ts
// Asset Capabilities Service - Milestone 17B
// Manages asset type detection and fractional trading capabilities

import { storage } from '../storage';
import { KrakenService } from './kraken';
import type { AssetCapability, InsertAssetCapability } from '@shared/schema';

export interface AssetInfo {
  symbol: string;
  assetType: 'crypto' | 'equity' | 'forex' | 'commodity';
  allowsFractional: boolean;
  lotSize: number;
  tickSize: number;
  minNotional: number;
  feesModel: string;
  venue: string;
}

export class AssetCapabilitiesService {
  private krakenService: KrakenService;
  private syncInProgress: boolean = false;

  constructor() {
    this.krakenService = new KrakenService();
  }

  /**
   * Sync asset capabilities from Kraken API
   * Fetches trading pairs data and populates asset capabilities table
   */
  async syncFromKraken(): Promise<{ synced: number; errors: number }> {
    if (this.syncInProgress) {
      console.log('[AssetCapabilities] Sync already in progress, skipping');
      return { synced: 0, errors: 0 };
    }

    this.syncInProgress = true;
    let synced = 0;
    let errors = 0;

    try {
      console.log('[AssetCapabilities] Starting Kraken asset sync...');
      
      // Get asset pairs from Kraken
      const pairsData = await this.krakenService.getAssetPairs();
      
      if (!pairsData || !pairsData.result) {
        throw new Error('Failed to fetch asset pairs from Kraken');
      }

      const pairs = pairsData.result;
      
      for (const [pairName, pairInfo] of Object.entries(pairs)) {
        try {
          // Skip if it's not a spot pair or doesn't have altname
          if (!pairInfo.altname) continue;
          
          const symbol = pairInfo.altname;
          
          // Detect asset type based on pair characteristics
          const assetType = this.detectAssetType(symbol, pairInfo);
          
          // Determine if fractional trading is allowed
          const allowsFractional = this.checkFractionalSupport(pairInfo);
          
          // Extract lot size (minimum order size)
          const lotSize = parseFloat(pairInfo.ordermin || '0.00000001');
          
          // Extract tick size (price increment)
          const tickSize = parseFloat(pairInfo.tick_size || '0.01');
          
          // Extract minimum notional (minimum order value)
          const minNotional = parseFloat(pairInfo.costmin || '5.00');
          
          // Create or update asset capability
          await storage.upsertAssetCapability({
            symbol: symbol,
            assetType: assetType,
            allowsFractional: allowsFractional,
            lotSize: lotSize.toString(),
            tickSize: tickSize.toString(),
            minNotional: minNotional.toString(),
            feesModel: 'maker_taker',
            venue: 'Kraken',
            metadata: {
              pairName: pairName,
              base: pairInfo.base,
              quote: pairInfo.quote,
              pairDecimals: pairInfo.pair_decimals,
              lotDecimals: pairInfo.lot_decimals,
              marginCall: pairInfo.margin_call,
              marginStop: pairInfo.margin_stop
            }
          });
          
          synced++;
        } catch (error) {
          console.error(`[AssetCapabilities] Error syncing ${pairName}:`, error);
          errors++;
        }
      }

      console.log(`[AssetCapabilities] Sync complete: ${synced} assets synced, ${errors} errors`);
      return { synced, errors };
    } catch (error) {
      console.error('[AssetCapabilities] Sync failed:', error);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Detect asset type from symbol and pair info
   */
  private detectAssetType(symbol: string, pairInfo: any): 'crypto' | 'equity' | 'forex' | 'commodity' {
    // Crypto detection patterns
    const cryptoIndicators = [
      'BTC', 'ETH', 'XRP', 'LTC', 'BCH', 'ADA', 'DOT', 'LINK', 'UNI',
      'MATIC', 'SOL', 'AVAX', 'ATOM', 'XLM', 'ALGO', 'AAVE', 'COMP'
    ];
    
    // Check if base or quote is a known crypto
    const base = (pairInfo.base || '').replace(/^[XZ]/, ''); // Remove X/Z prefix
    const quote = (pairInfo.quote || '').replace(/^[XZ]/, '');
    
    if (cryptoIndicators.some(c => base.includes(c) || symbol.includes(c))) {
      return 'crypto';
    }
    
    // Forex detection (currency pairs)
    const forexCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
    if (forexCurrencies.includes(base) && forexCurrencies.includes(quote)) {
      return 'forex';
    }
    
    // Default to crypto for Kraken (crypto exchange)
    return 'crypto';
  }

  /**
   * Check if fractional trading is supported
   */
  private checkFractionalSupport(pairInfo: any): boolean {
    // If lot_decimals > 0, fractional trading is supported
    const lotDecimals = parseInt(pairInfo.lot_decimals || '0');
    return lotDecimals > 0;
  }

  /**
   * Get asset capability with caching
   */
  async getCapability(symbol: string): Promise<AssetCapability | undefined> {
    let capability = await storage.getAssetCapability(symbol);
    
    // If not found or stale (>24 hours), trigger sync
    if (!capability || this.isStale(capability)) {
      console.log(`[AssetCapabilities] Capability for ${symbol} not found or stale, triggering sync`);
      // Note: Don't await sync as it may be slow, just return what we have
      this.syncFromKraken().catch(err => 
        console.error('[AssetCapabilities] Background sync failed:', err)
      );
    }
    
    return capability;
  }

  /**
   * Check if capability data is stale (>24 hours old)
   */
  private isStale(capability: AssetCapability): boolean {
    if (!capability.lastSynced) return true;
    const ageMs = Date.now() - new Date(capability.lastSynced).getTime();
    return ageMs > 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Calculate position size based on asset capabilities
   */
  async calculatePositionSize(params: {
    symbol: string;
    maxInvestment: number;
    price: number;
    targetMinShares?: number; // For whole-share assets
  }): Promise<{
    quantity: number;
    notionalValue: number;
    isFractional: boolean;
    meetsMinimum: boolean;
    reason?: string;
  }> {
    const capability = await this.getCapability(params.symbol);
    
    if (!capability) {
      // Default to crypto behavior if capability not found
      return this.calculateCryptoSize(params);
    }

    if (capability.allowsFractional) {
      return this.calculateFractionalSize(params, capability);
    } else {
      return this.calculateWholeShareSize(params, capability);
    }
  }

  /**
   * Calculate size for fractional assets (crypto)
   */
  private calculateCryptoSize(params: { maxInvestment: number; price: number }): any {
    const { maxInvestment, price } = params;
    const rawQty = maxInvestment / price;
    const quantity = this.roundToStep(rawQty, 0.00000001); // Default lot size
    const notionalValue = quantity * price;
    
    return {
      quantity,
      notionalValue,
      isFractional: true,
      meetsMinimum: notionalValue >= 5, // Default min notional
      reason: notionalValue < 5 ? 'Below minimum notional value' : undefined
    };
  }

  /**
   * Calculate size for fractional assets with capabilities
   */
  private calculateFractionalSize(
    params: { maxInvestment: number; price: number },
    capability: AssetCapability
  ): any {
    const { maxInvestment, price } = params;
    const lotSize = parseFloat(capability.lotSize);
    const minNotional = parseFloat(capability.minNotional);
    
    const rawQty = maxInvestment / price;
    const quantity = this.roundToStep(rawQty, lotSize);
    const notionalValue = quantity * price;
    
    return {
      quantity,
      notionalValue,
      isFractional: true,
      meetsMinimum: notionalValue >= minNotional,
      reason: notionalValue < minNotional ? `Below minimum notional ${minNotional}` : undefined
    };
  }

  /**
   * Calculate size for whole-share assets (stocks)
   */
  private calculateWholeShareSize(
    params: { maxInvestment: number; price: number; targetMinShares?: number },
    capability: AssetCapability
  ): any {
    const { maxInvestment, price, targetMinShares = 3 } = params;
    const minNotional = parseFloat(capability.minNotional);
    
    // Calculate maximum affordable whole shares
    const maxShares = Math.floor(maxInvestment / price);
    
    // Check if price is too high for diversification
    const maxSharePrice = maxInvestment / targetMinShares;
    if (price > maxSharePrice) {
      return {
        quantity: 0,
        notionalValue: 0,
        isFractional: false,
        meetsMinimum: false,
        reason: `Price ${price} exceeds max share price ${maxSharePrice.toFixed(2)} for ${targetMinShares} shares`
      };
    }
    
    // Must be able to buy at least 1 share
    if (maxShares < 1) {
      return {
        quantity: 0,
        notionalValue: 0,
        isFractional: false,
        meetsMinimum: false,
        reason: 'Insufficient funds for 1 share'
      };
    }
    
    const quantity = maxShares;
    const notionalValue = quantity * price;
    
    return {
      quantity,
      notionalValue,
      isFractional: false,
      meetsMinimum: notionalValue >= minNotional,
      reason: notionalValue < minNotional ? `Below minimum notional ${minNotional}` : undefined
    };
  }

  /**
   * Round quantity to step size
   */
  private roundToStep(value: number, step: number): number {
    return Math.floor(value / step) * step;
  }
}

export const assetCapabilitiesService = new AssetCapabilitiesService();
