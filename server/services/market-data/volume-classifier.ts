/**
 * Phase 8.8.5: VolumeClassifier - Tiered Sentinel Service
 * 
 * Provides deterministic tier-based classification for WebSocket channel health management.
 * Replaces fixed "last tick timeout" logic with tier-aware thresholds.
 * 
 * Tiers:
 * - HIGH: Major pairs (BTC, ETH, SOL) - tick every 1-5s, warn at 10s, reset at 20s
 * - MID:  Popular alts (ADA, LINK, DOT) - tick every 5-15s, warn at 30s, reset at 60s  
 * - LOW:  Low-liquidity pairs - tick every 15-60s, warn at 90s, reset at 180s
 */

import { KrakenService } from '../../exchanges/kraken/kraken.js';

export type VolumeTier = 'HIGH' | 'MID' | 'LOW';

export interface TierThresholds {
  warnTimeoutMs: number;
  resetTimeoutMs: number;
}

export const TIER_THRESHOLDS: Record<VolumeTier, TierThresholds> = {
  HIGH: { warnTimeoutMs: 10000, resetTimeoutMs: 20000 },
  MID: { warnTimeoutMs: 30000, resetTimeoutMs: 60000 },
  LOW: { warnTimeoutMs: 90000, resetTimeoutMs: 180000 }
};

export class VolumeClassifier {
  private static readonly FALLBACK_MAP: Record<string, VolumeTier> = {
    'BTC/USD': 'HIGH',
    'ETH/USD': 'HIGH',
    'SOL/USD': 'HIGH',
    'XRP/USD': 'HIGH',
    'DOGE/USD': 'HIGH',
    'ADA/USD': 'HIGH',
    'AVAX/USD': 'HIGH',
    'DOT/USD': 'HIGH',
    'LINK/USD': 'HIGH',
    'MATIC/USD': 'HIGH',
    'SHIB/USD': 'HIGH',
    'LTC/USD': 'HIGH',
    'BCH/USD': 'HIGH',
    'ATOM/USD': 'HIGH',
    'UNI/USD': 'HIGH',
    'XLM/USD': 'HIGH',
    'ETC/USD': 'HIGH',
    'FIL/USD': 'HIGH',
    'NEAR/USD': 'HIGH',
    'APT/USD': 'HIGH',
    'ARB/USD': 'MID',
    'OP/USD': 'MID',
    'INJ/USD': 'MID',
    'SUI/USD': 'MID',
    'SEI/USD': 'MID',
    'TIA/USD': 'MID',
    'AAVE/USD': 'MID',
    'MKR/USD': 'MID',
    'CRV/USD': 'MID',
    'LDO/USD': 'MID',
    'SNX/USD': 'MID',
    'COMP/USD': 'MID',
    'GRT/USD': 'MID',
    'FXS/USD': 'MID',
    'RUNE/USD': 'MID',
    'SAND/USD': 'MID',
    'MANA/USD': 'MID',
    'AXS/USD': 'MID',
    'ENS/USD': 'MID',
    'IMX/USD': 'MID',
    'BTC/EUR': 'HIGH',
    'ETH/EUR': 'HIGH',
    'SOL/EUR': 'MID',
    'XRP/EUR': 'MID',
    'ADA/EUR': 'MID',
    'EUR/USD': 'HIGH',
    'GBP/USD': 'MID',
    'AUD/USD': 'MID',
    'EURC/USD': 'MID',
    'USDC/USD': 'HIGH',
    'USDT/USD': 'HIGH'
  };

  private tiers: Map<string, VolumeTier> = new Map();
  private isInitialized: boolean = false;
  private krakenService: KrakenService;
  private lastRefresh: number = 0;
  private readonly REFRESH_INTERVAL_MS = 3600000; // 1 hour

  constructor() {
    this.krakenService = new KrakenService();
    Object.entries(VolumeClassifier.FALLBACK_MAP).forEach(([symbol, tier]) => {
      this.tiers.set(symbol, tier);
    });
  }

  async init(): Promise<void> {
    if (this.isInitialized) {
      console.log('[8.8.5][VolumeClassifier] Already initialized');
      return;
    }

    try {
      console.log('[8.8.5][VolumeClassifier] Fetching 24h volume data from Kraken...');
      const volumeData = await this.fetchKraken24hVolume();
      this.deriveTiers(volumeData);
      this.isInitialized = true;
      this.lastRefresh = Date.now();
      console.log(`[8.8.5][VolumeClassifier] Initialized with ${this.tiers.size} symbols classified`);
    } catch (error) {
      console.warn('[8.8.5][VolumeClassifier] Kraken unavailable - using fallback tiers:', error);
      this.isInitialized = true;
      this.lastRefresh = Date.now();
    }
  }

  private async fetchKraken24hVolume(): Promise<Map<string, number>> {
    const volumeMap = new Map<string, number>();
    
    try {
      const response = await this.krakenService.getTicker();
      
      if (response && typeof response === 'object') {
        for (const [pair, data] of Object.entries(response)) {
          if (data && typeof data === 'object' && 'v' in data) {
            const tickerData = data as unknown as { v: string[] };
            const volume24h = parseFloat(tickerData.v[1] || '0') || 0;
            const normalizedSymbol = this.normalizeSymbol(pair);
            volumeMap.set(normalizedSymbol, volume24h);
          }
        }
      }
    } catch (error) {
      console.error('[8.8.5][VolumeClassifier] Failed to fetch ticker data:', error);
    }

    return volumeMap;
  }

  private normalizeSymbol(krakenPair: string): string {
    const prefixMap: Record<string, string> = {
      'XXBT': 'BTC',
      'XETH': 'ETH',
      'XXRP': 'XRP',
      'XXLM': 'XLM',
      'XLTC': 'LTC',
      'XXDG': 'DOGE',
      'XZEC': 'ZEC',
      'XETC': 'ETC',
      'XREP': 'REP',
      'XMLN': 'MLN',
      'ZUSD': 'USD',
      'ZEUR': 'EUR',
      'ZGBP': 'GBP',
      'ZJPY': 'JPY',
      'ZCAD': 'CAD',
      'ZAUD': 'AUD'
    };

    let normalized = krakenPair;
    
    for (const [prefix, replacement] of Object.entries(prefixMap)) {
      if (normalized.startsWith(prefix)) {
        normalized = replacement + normalized.slice(prefix.length);
      }
      if (normalized.endsWith(prefix)) {
        normalized = normalized.slice(0, -prefix.length) + replacement;
      }
    }

    if (!normalized.includes('/')) {
      const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'USDT', 'USDC'];
      for (const currency of currencies) {
        if (normalized.endsWith(currency)) {
          const base = normalized.slice(0, -currency.length);
          normalized = `${base}/${currency}`;
          break;
        }
      }
    }

    return normalized;
  }

  private deriveTiers(volumeData: Map<string, number>): void {
    const volumes = Array.from(volumeData.entries())
      .filter(([_, vol]) => vol > 0)
      .sort((a, b) => b[1] - a[1]);

    const totalPairs = volumes.length;
    const highThreshold = Math.floor(totalPairs * 0.1);  // Top 10% = HIGH
    const midThreshold = Math.floor(totalPairs * 0.4);   // Next 30% = MID

    volumes.forEach(([symbol, _], index) => {
      let tier: VolumeTier;
      if (index < highThreshold) {
        tier = 'HIGH';
      } else if (index < midThreshold) {
        tier = 'MID';
      } else {
        tier = 'LOW';
      }
      
      if (!this.tiers.has(symbol) || this.shouldOverride(symbol, tier)) {
        this.tiers.set(symbol, tier);
      }
    });

    const tierCounts = { HIGH: 0, MID: 0, LOW: 0 };
    this.tiers.forEach(tier => tierCounts[tier]++);
    console.log(`[8.8.5][VolumeClassifier] Tier distribution: HIGH=${tierCounts.HIGH}, MID=${tierCounts.MID}, LOW=${tierCounts.LOW}`);
  }

  private shouldOverride(symbol: string, newTier: VolumeTier): boolean {
    const fallbackTier = VolumeClassifier.FALLBACK_MAP[symbol];
    if (!fallbackTier) return true;
    
    const tierOrder: Record<VolumeTier, number> = { HIGH: 3, MID: 2, LOW: 1 };
    return tierOrder[newTier] >= tierOrder[fallbackTier];
  }

  public getTier(symbol: string): VolumeTier {
    const normalizedSymbol = symbol.includes('/') ? symbol : this.normalizeSymbol(symbol);
    return this.tiers.get(normalizedSymbol) ?? 'LOW';
  }

  public getThresholds(symbol: string): TierThresholds {
    const tier = this.getTier(symbol);
    return TIER_THRESHOLDS[tier];
  }

  public getWarnTimeout(symbol: string): number {
    return this.getThresholds(symbol).warnTimeoutMs;
  }

  public getResetTimeout(symbol: string): number {
    return this.getThresholds(symbol).resetTimeoutMs;
  }

  public setTier(symbol: string, tier: VolumeTier): void {
    this.tiers.set(symbol, tier);
    console.log(`[8.8.5][VolumeClassifier] Manual tier set: ${symbol} = ${tier}`);
  }

  public getAllTiers(): Record<string, VolumeTier> {
    const result: Record<string, VolumeTier> = {};
    this.tiers.forEach((tier, symbol) => {
      result[symbol] = tier;
    });
    return result;
  }

  public getStats(): { total: number; high: number; mid: number; low: number; initialized: boolean } {
    let high = 0, mid = 0, low = 0;
    this.tiers.forEach(tier => {
      if (tier === 'HIGH') high++;
      else if (tier === 'MID') mid++;
      else low++;
    });
    return { total: this.tiers.size, high, mid, low, initialized: this.isInitialized };
  }

  public async refresh(): Promise<void> {
    const now = Date.now();
    if (now - this.lastRefresh < this.REFRESH_INTERVAL_MS) {
      console.log('[8.8.5][VolumeClassifier] Skipping refresh - too recent');
      return;
    }

    try {
      console.log('[8.8.5][VolumeClassifier] Refreshing volume tiers...');
      const volumeData = await this.fetchKraken24hVolume();
      this.deriveTiers(volumeData);
      this.lastRefresh = now;
      console.log('[8.8.5][VolumeClassifier] Refresh complete');
    } catch (error) {
      console.error('[8.8.5][VolumeClassifier] Refresh failed:', error);
    }
  }
}

export const volumeClassifier = new VolumeClassifier();
