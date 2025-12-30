/**
 * Phase 8.8.5: RestRateLimiter - Token-Bucket Global REST Rate Limiter
 * 
 * Prevents REST API storms that could trigger Kraken rate-limit bans.
 * 
 * Rules:
 * - Maximum 10 tokens (requests) per second
 * - 1 token refill per 100ms
 * - Per-symbol cooldown of 60 seconds
 * - Tracks allowed vs blocked requests for observability
 */

export interface RateLimiterStats {
  tokens: number;
  maxTokens: number;
  allowedCount: number;
  blockedCount: number;
  perSymbolCooldowns: number;
  lastRefill: number;
}

export class RestRateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private lastRefill: number;
  private readonly refillIntervalMs: number;
  private readonly tokensPerRefill: number;
  private readonly perSymbolCooldownMs: number;
  
  private lastFetchTime: Map<string, number> = new Map();
  private allowedCount: number = 0;
  private blockedCount: number = 0;
  private blockedReasons: Map<string, 'no_tokens' | 'cooldown'> = new Map();

  constructor(options?: {
    maxTokens?: number;
    refillIntervalMs?: number;
    tokensPerRefill?: number;
    perSymbolCooldownMs?: number;
  }) {
    this.maxTokens = options?.maxTokens ?? 10;
    this.tokens = this.maxTokens;
    this.refillIntervalMs = options?.refillIntervalMs ?? 100;
    this.tokensPerRefill = options?.tokensPerRefill ?? 1;
    this.perSymbolCooldownMs = options?.perSymbolCooldownMs ?? 60000;
    this.lastRefill = Date.now();
  }

  check(symbol: string): boolean {
    const now = Date.now();
    this.refill(now);

    const lastFetch = this.lastFetchTime.get(symbol) ?? 0;
    if (now - lastFetch < this.perSymbolCooldownMs) {
      this.blockedCount++;
      this.blockedReasons.set(symbol, 'cooldown');
      console.log(`[8.8.5][RestRateLimiter] BLOCKED ${symbol}: cooldown (${Math.round((this.perSymbolCooldownMs - (now - lastFetch)) / 1000)}s remaining)`);
      return false;
    }

    if (this.tokens < 1) {
      this.blockedCount++;
      this.blockedReasons.set(symbol, 'no_tokens');
      console.log(`[8.8.5][RestRateLimiter] BLOCKED ${symbol}: no tokens available`);
      return false;
    }

    this.tokens -= 1;
    this.lastFetchTime.set(symbol, now);
    this.allowedCount++;
    this.blockedReasons.delete(symbol);
    console.log(`[8.8.5][RestRateLimiter] ALLOWED ${symbol}: tokens=${this.tokens}/${this.maxTokens}`);
    return true;
  }

  private refill(now: number): void {
    const delta = now - this.lastRefill;
    const refillCount = Math.floor(delta / this.refillIntervalMs);
    
    if (refillCount > 0) {
      const tokensToAdd = refillCount * this.tokensPerRefill;
      this.tokens = Math.min(this.tokens + tokensToAdd, this.maxTokens);
      this.lastRefill = now;
    }
  }

  getStats(): RateLimiterStats {
    this.refill(Date.now());
    return {
      tokens: this.tokens,
      maxTokens: this.maxTokens,
      allowedCount: this.allowedCount,
      blockedCount: this.blockedCount,
      perSymbolCooldowns: this.lastFetchTime.size,
      lastRefill: this.lastRefill
    };
  }

  getBlockedReason(symbol: string): 'no_tokens' | 'cooldown' | null {
    return this.blockedReasons.get(symbol) ?? null;
  }

  getCooldownRemaining(symbol: string): number {
    const lastFetch = this.lastFetchTime.get(symbol);
    if (!lastFetch) return 0;
    
    const remaining = this.perSymbolCooldownMs - (Date.now() - lastFetch);
    return Math.max(0, remaining);
  }

  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.lastFetchTime.clear();
    this.allowedCount = 0;
    this.blockedCount = 0;
    this.blockedReasons.clear();
    console.log('[8.8.5][RestRateLimiter] Reset complete');
  }

  clearSymbolCooldown(symbol: string): void {
    this.lastFetchTime.delete(symbol);
    this.blockedReasons.delete(symbol);
    console.log(`[8.8.5][RestRateLimiter] Cleared cooldown for ${symbol}`);
  }
}

export const restRateLimiter = new RestRateLimiter();
