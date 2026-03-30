/**
 * OpenAI Rate Limiter & Circuit Breaker
 * Handles 429 errors gracefully with backoff, caching, and graceful degradation
 */

import OpenAI from 'openai';
import { storage } from '../storage';

interface CircuitBreakerState {
  isOpen: boolean;
  failures: number;
  lastFailureTime: number;
  nextRetryTime: number;
}

interface CachedResponse {
  response: any;
  timestamp: number;
  expiresAt: number;
}

export class OpenAIRateLimiter {
  private static instance: OpenAIRateLimiter;
  private openai: OpenAI;
  private circuitBreaker: CircuitBreakerState;
  private responseCache: Map<string, CachedResponse>;
  
  // Configuration
  private readonly CIRCUIT_BREAKER_THRESHOLD = 3; // Open circuit after 3 failures
  private readonly CIRCUIT_BREAKER_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes default cache
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_BACKOFF_MS = 2000; // Start with 2 seconds

  private constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && apiKey.startsWith('sk-') && apiKey.length > 20) {
      this.openai = new OpenAI({ apiKey });
    } else {
      console.log('[OpenAIRateLimiter] No valid OPENAI_API_KEY set — AI features disabled');
      this.openai = null as any;
    }

    this.circuitBreaker = {
      isOpen: false,
      failures: 0,
      lastFailureTime: 0,
      nextRetryTime: 0,
    };

    this.responseCache = new Map();
  }

  static getInstance(): OpenAIRateLimiter {
    if (!OpenAIRateLimiter.instance) {
      OpenAIRateLimiter.instance = new OpenAIRateLimiter();
    }
    return OpenAIRateLimiter.instance;
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getStatus() {
    const now = Date.now();
    return {
      isCircuitOpen: this.circuitBreaker.isOpen,
      failures: this.circuitBreaker.failures,
      canRetry: now >= this.circuitBreaker.nextRetryTime,
      nextRetryIn: this.circuitBreaker.isOpen 
        ? Math.max(0, this.circuitBreaker.nextRetryTime - now)
        : 0,
      cacheSize: this.responseCache.size,
    };
  }

  /**
   * Check if circuit breaker should allow requests
   */
  private canMakeRequest(): { allowed: boolean; reason?: string } {
    const now = Date.now();

    // Check if circuit is open
    if (this.circuitBreaker.isOpen) {
      // Check if enough time has passed to retry
      if (now < this.circuitBreaker.nextRetryTime) {
        const waitTime = Math.ceil((this.circuitBreaker.nextRetryTime - now) / 1000);
        return {
          allowed: false,
          reason: `Circuit breaker open. Retry in ${waitTime}s due to OpenAI quota exhaustion.`,
        };
      } else {
        // Reset circuit breaker for retry attempt
        console.log('[OpenAIRateLimiter] Circuit breaker timeout elapsed, allowing retry attempt');
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.failures = 0;
      }
    }

    return { allowed: true };
  }

  /**
   * Record a failed request
   */
  private recordFailure(error: any) {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    console.error(`[OpenAIRateLimiter] Request failed (${this.circuitBreaker.failures}/${this.CIRCUIT_BREAKER_THRESHOLD})`, error.message);

    // Check if we should open the circuit
    if (this.circuitBreaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreaker.isOpen = true;
      this.circuitBreaker.nextRetryTime = Date.now() + this.CIRCUIT_BREAKER_TIMEOUT;
      
      console.error('[OpenAIRateLimiter] ⛔ CIRCUIT BREAKER OPENED - OpenAI requests suspended for 5 minutes');
      
      // Create system alert
      this.createSystemAlert();
    }
  }

  /**
   * Record a successful request
   */
  private recordSuccess() {
    if (this.circuitBreaker.failures > 0) {
      console.log('[OpenAIRateLimiter] ✅ Request successful, resetting failure count');
      this.circuitBreaker.failures = 0;
      this.circuitBreaker.isOpen = false;
    }
  }

  /**
   * Create system alert for quota exhaustion
   */
  private async createSystemAlert() {
    try {
      const users = await storage.getAllUsers();
      const owners = users.filter(u => u.role === 'owner');

      for (const owner of owners) {
        await storage.createSystemAlert({
          userId: owner.id,
          mode: owner.tradingMode || 'paper',
          alertType: 'openai_quota_exhausted',
          severity: 'critical',
          category: 'critical',
          message: 'All AI features are temporarily unavailable due to OpenAI API rate limits. AI requests will automatically resume in 5 minutes. Please check your OpenAI account billing and usage.',
          acknowledged: false,
        });
      }

      console.log(`[OpenAIRateLimiter] Created ${owners.length} alerts for quota exhaustion`);
    } catch (error) {
      console.error('[OpenAIRateLimiter] Failed to create alert:', error);
    }
  }

  /**
   * Get cached response if available
   */
  private getCachedResponse(cacheKey: string): any | null {
    const cached = this.responseCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      console.log(`[OpenAIRateLimiter] ✅ Cache hit for key: ${cacheKey.substring(0, 50)}...`);
      return cached.response;
    }

    if (cached) {
      // Remove expired cache entry
      this.responseCache.delete(cacheKey);
    }

    return null;
  }

  /**
   * Cache a response
   */
  private cacheResponse(cacheKey: string, response: any, ttlMs: number = this.CACHE_TTL) {
    this.responseCache.set(cacheKey, {
      response,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });

    console.log(`[OpenAIRateLimiter] 💾 Cached response (TTL: ${ttlMs}ms): ${cacheKey.substring(0, 50)}...`);
  }

  /**
   * Make a chat completion request with rate limiting, caching, and backoff
   */
  async createChatCompletion(
    params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    options?: {
      cacheKey?: string;
      cacheTTL?: number;
      skipCache?: boolean;
    }
  ): Promise<OpenAI.Chat.ChatCompletion> {
    // Check cache first
    const cacheKey = options?.cacheKey || JSON.stringify(params);
    if (!options?.skipCache) {
      const cached = this.getCachedResponse(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Check circuit breaker
    const { allowed, reason } = this.canMakeRequest();
    if (!allowed) {
      throw new Error(`OpenAI request blocked: ${reason}`);
    }

    // Attempt request with exponential backoff
    let lastError: any;
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        console.log(`[OpenAIRateLimiter] Attempt ${attempt + 1}/${this.MAX_RETRIES} for chat completion`);
        
        const response = await this.openai.chat.completions.create(params);
        
        // Success! Record it and cache the response
        this.recordSuccess();
        if (!options?.skipCache) {
          this.cacheResponse(cacheKey, response, options?.cacheTTL);
        }
        
        return response;
      } catch (error: any) {
        lastError = error;

        // Check if this is a rate limit error
        if (error.status === 429 || error.code === 'insufficient_quota') {
          console.error(`[OpenAIRateLimiter] Rate limit error on attempt ${attempt + 1}:`, error.message);
          
          // Record the failure
          this.recordFailure(error);

          // If circuit is now open, don't retry
          if (this.circuitBreaker.isOpen) {
            throw new Error('OpenAI API quota exhausted. AI features temporarily unavailable.');
          }

          // Exponential backoff before retry
          if (attempt < this.MAX_RETRIES - 1) {
            const backoffMs = this.INITIAL_BACKOFF_MS * Math.pow(2, attempt);
            console.log(`[OpenAIRateLimiter] Waiting ${backoffMs}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        } else {
          // Non-rate-limit error, throw immediately
          throw error;
        }
      }
    }

    // All retries exhausted
    throw lastError || new Error('OpenAI request failed after all retries');
  }

  /**
   * Clear the response cache
   */
  clearCache() {
    const size = this.responseCache.size;
    this.responseCache.clear();
    console.log(`[OpenAIRateLimiter] 🗑️ Cleared ${size} cached responses`);
  }

  /**
   * Get the underlying OpenAI client (for non-chat operations)
   */
  getClient(): OpenAI {
    return this.openai;
  }
}
