/**
 * PHASE 3-6: Comprehensive Resilience & Safeguard Service
 * 
 * Provides:
 * - Phase 3: Exchange constraint enforcement (tick size, minimum notional)
 * - Phase 4: Rate limiting with queue and exponential backoff
 * - Phase 5: Retry logic for network/API errors
 * - Phase 6: Circuit breaker, order validation, failover logging
 */

import fs from 'fs/promises';
import path from 'path';

// ========================================
// PHASE 4: RATE LIMITER
// ========================================

interface RateLimitConfig {
  maxRequestsPerSecond: number;
  burstLimit: number;
}

class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private executing = 0;
  private lastRequestTime = 0;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.executing >= this.config.burstLimit || this.queue.length === 0) {
      return;
    }

    const now = Date.now();
    const minInterval = 1000 / this.config.maxRequestsPerSecond;
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < minInterval) {
      setTimeout(() => this.processQueue(), minInterval - timeSinceLastRequest);
      return;
    }

    const task = this.queue.shift();
    if (task) {
      this.executing++;
      this.lastRequestTime = Date.now();
      
      task()
        .finally(() => {
          this.executing--;
          this.processQueue();
        });
    }
  }
}

// ========================================
// PHASE 5: RETRY LOGIC
// ========================================

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

class RetryHandler {
  private config: RetryConfig;

  constructor(config: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2
  }) {
    this.config = config;
  }

  async execute<T>(fn: () => Promise<T>, operation: string): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`   🔄 [RETRY] ${operation} - Attempt ${attempt + 1}/${this.config.maxRetries + 1}`);
        const result = await fn();
        
        if (attempt > 0) {
          console.log(`   ✅ [RETRY] ${operation} succeeded after ${attempt} retries`);
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          console.log(`   ❌ [RETRY] ${operation} - Non-retryable error, aborting`);
          throw error;
        }

        if (attempt < this.config.maxRetries) {
          const delay = Math.min(
            this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt),
            this.config.maxDelayMs
          );
          
          console.log(`   ⏳ [RETRY] ${operation} failed, waiting ${delay}ms before retry ${attempt + 2}`);
          await this.sleep(delay);
        }
      }
    }

    console.log(`   ❌ [RETRY] ${operation} - Max retries (${this.config.maxRetries}) exceeded, aborting`);
    throw lastError || new Error(`Operation failed after ${this.config.maxRetries} retries`);
  }

  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    
    const message = error.message.toLowerCase();
    
    // Network errors
    if (message.includes('timeout') || message.includes('econnreset') || message.includes('network')) {
      return true;
    }

    // 5xx server errors (retryable)
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return true;
    }

    // 429 rate limit (should use exponential backoff)
    if (message.includes('429') || message.includes('too many requests')) {
      return true;
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ========================================
// PHASE 6: CIRCUIT BREAKER
// ========================================

interface CircuitBreakerConfig {
  failureThreshold: number; // Number of consecutive failures to open circuit
  resetTimeoutMs: number; // Time to wait before attempting to close circuit
}

enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject all requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeoutMs: 60000
  }) {
    this.config = config;
  }

  async execute<T>(fn: () => Promise<T>, operation: string): Promise<T> {
    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      
      if (timeSinceFailure >= this.config.resetTimeoutMs) {
        console.log(`   🔄 [CIRCUIT BREAKER] ${operation} - Transitioning to HALF_OPEN (testing recovery)`);
        this.state = CircuitState.HALF_OPEN;
      } else {
        const remainingTime = Math.ceil((this.config.resetTimeoutMs - timeSinceFailure) / 1000);
        throw new Error(
          `Circuit breaker OPEN for ${operation}. Too many consecutive failures. ` +
          `Retry in ${remainingTime}s`
        );
      }
    }

    try {
      const result = await fn();
      
      // Success - reset circuit
      if (this.state === CircuitState.HALF_OPEN) {
        console.log(`   ✅ [CIRCUIT BREAKER] ${operation} - Service recovered, closing circuit`);
      }
      
      this.state = CircuitState.CLOSED;
      this.failureCount = 0;
      
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      console.log(`   ⚠️  [CIRCUIT BREAKER] ${operation} - Failure ${this.failureCount}/${this.config.failureThreshold}`);

      if (this.failureCount >= this.config.failureThreshold) {
        this.state = CircuitState.OPEN;
        console.log(`   🚨 [CIRCUIT BREAKER] ${operation} - Circuit OPENED after ${this.failureCount} consecutive failures`);
        console.log(`   ⏳ Trading suspended for ${this.config.resetTimeoutMs / 1000}s to allow recovery`);
      }

      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    console.log('   🔄 [CIRCUIT BREAKER] Manually reset');
  }
}

// ========================================
// PHASE 3: EXCHANGE CONSTRAINTS
// ========================================

interface ExchangeConstraints {
  tickSize: number; // Minimum price increment
  minNotional: number; // Minimum order value (price * quantity)
  minQuantity: number; // Minimum order quantity
  maxQuantity: number; // Maximum order quantity
}

class ExchangeValidator {
  private constraints: Map<string, ExchangeConstraints> = new Map();

  constructor() {
    // Default constraints for major pairs (would be loaded from Kraken API in production)
    this.constraints.set('BTCUSD', {
      tickSize: 0.1,
      minNotional: 10,
      minQuantity: 0.0001,
      maxQuantity: 10000
    });
    
    this.constraints.set('ETHUSD', {
      tickSize: 0.01,
      minNotional: 10,
      minQuantity: 0.001,
      maxQuantity: 100000
    });

    // Default fallback for unknown pairs
    this.constraints.set('DEFAULT', {
      tickSize: 0.00000001,
      minNotional: 10,
      minQuantity: 0.00000001,
      maxQuantity: 1000000
    });
  }

  validateOrder(symbol: string, price: number, quantity: number): { valid: boolean; errors: string[]; adjusted?: { price: number; quantity: number } } {
    const constraints = this.constraints.get(symbol) || this.constraints.get('DEFAULT')!;
    const errors: string[] = [];
    let adjustedPrice = price;
    let adjustedQuantity = quantity;

    // Check and round to tick size
    const remainder = price % constraints.tickSize;
    if (remainder !== 0) {
      adjustedPrice = Math.round(price / constraints.tickSize) * constraints.tickSize;
      console.log(`   🔧 [PHASE 3] Price adjusted to tick size: $${price} → $${adjustedPrice}`);
    }

    // Check minimum notional
    const notional = adjustedPrice * quantity;
    if (notional < constraints.minNotional) {
      errors.push(
        `Notional value ($${notional.toFixed(2)}) below minimum ($${constraints.minNotional}). ` +
        `Kraken requires minimum order value of $${constraints.minNotional}.`
      );
    }

    // Check quantity limits
    if (quantity < constraints.minQuantity) {
      errors.push(`Quantity (${quantity}) below minimum (${constraints.minQuantity})`);
    }

    if (quantity > constraints.maxQuantity) {
      errors.push(`Quantity (${quantity}) exceeds maximum (${constraints.maxQuantity})`);
    }

    return {
      valid: errors.length === 0,
      errors,
      adjusted: { price: adjustedPrice, quantity: adjustedQuantity }
    };
  }
}

// ========================================
// PHASE 6: FAILOVER LOGGING
// ========================================

class FailoverLogger {
  private logDir = path.join(process.cwd(), 'logs');

  async log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: any): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data: data || {}
    };

    const logLine = `${timestamp} [${level}] ${message} ${data ? JSON.stringify(data) : ''}\n`;

    try {
      // Try to write to file
      await fs.mkdir(this.logDir, { recursive: true });
      const logFile = path.join(this.logDir, `trading-${new Date().toISOString().split('T')[0]}.log`);
      await fs.appendFile(logFile, logLine);
    } catch (fileError) {
      // Failover: at least log to console
      console.error('[FAILOVER LOGGER] File write failed, console only:', logLine);
    }

    // Also always log to console
    if (level === 'ERROR') {
      console.error(logLine.trim());
    } else if (level === 'WARN') {
      console.warn(logLine.trim());
    } else {
      console.log(logLine.trim());
    }
  }
}

// ========================================
// RESILIENCE MANAGER (Orchestrator)
// ========================================

export class ResilienceManager {
  public rateLimiter: RateLimiter;
  public retryHandler: RetryHandler;
  public circuitBreaker: CircuitBreaker;
  public exchangeValidator: ExchangeValidator;
  public failoverLogger: FailoverLogger;

  constructor() {
    this.rateLimiter = new RateLimiter({
      maxRequestsPerSecond: 2, // Kraken allows ~2 requests/sec for private endpoints
      burstLimit: 5
    });

    this.retryHandler = new RetryHandler({
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2
    });

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60000 // 60 seconds
    });

    this.exchangeValidator = new ExchangeValidator();
    this.failoverLogger = new FailoverLogger();

    console.log('✅ [RESILIENCE] ResilienceManager initialized');
    console.log('   - Rate Limiter: 2 req/sec, burst 5');
    console.log('   - Retry Handler: Max 3 retries, exponential backoff');
    console.log('   - Circuit Breaker: Opens after 5 failures, resets in 60s');
    console.log('   - Exchange Validator: Tick size, min notional enforcement');
    console.log('   - Failover Logger: File + console logging\n');
  }

  // Convenience method: Execute with full resilience stack
  async executeWithResilience<T>(
    fn: () => Promise<T>,
    operation: string,
    skipRetry: boolean = false
  ): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      return this.rateLimiter.execute(async () => {
        if (skipRetry) {
          return fn();
        }
        return this.retryHandler.execute(fn, operation);
      });
    }, operation);
  }
}

// Singleton instance
export const resilience = new ResilienceManager();
