/**
 * Token Bucket Rate Limiter for Kraken API
 * Prevents exceeding exchange rate limits with backpressure handling
 */

interface TokenBucket {
  tokens: number;
  maxTokens: number;
  refillRate: number; // tokens per second
  lastRefill: number;
}

interface QueuedRequest {
  id: string;
  priority: 'cancel' | 'entry' | 'status';
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
}

type BackpressureLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

class RateControlService {
  // Separate buckets for different endpoint types
  private buckets: Map<string, TokenBucket> = new Map();
  
  // Execution queue with priority
  private queue: QueuedRequest[] = [];
  private processing = false;
  
  // Metrics
  private metrics = {
    totalRequests: 0,
    queuedRequests: 0,
    throttledRequests: 0,
    backpressureEvents: 0,
  };

  constructor() {
    // Initialize buckets for Kraken API limits
    this.initializeBucket('private', 15, 3); // 15 tokens, refill 3/sec
    this.initializeBucket('public', 20, 1);  // 20 tokens, refill 1/sec
    
    // Start refill loop
    this.startRefillLoop();
  }

  /**
   * Initialize a token bucket
   */
  private initializeBucket(name: string, maxTokens: number, refillRate: number): void {
    this.buckets.set(name, {
      tokens: maxTokens,
      maxTokens,
      refillRate,
      lastRefill: Date.now(),
    });
  }

  /**
   * Refill tokens periodically
   */
  private startRefillLoop(): void {
    setInterval(() => {
      const now = Date.now();
      
      for (const [name, bucket] of this.buckets) {
        const elapsed = (now - bucket.lastRefill) / 1000; // seconds
        const tokensToAdd = elapsed * bucket.refillRate;
        
        bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
        bucket.lastRefill = now;
      }
    }, 1000); // Refill every second
  }

  /**
   * Check if request can proceed
   */
  private canProceed(bucketName: string, cost: number = 1): boolean {
    const bucket = this.buckets.get(bucketName);
    if (!bucket) return true; // No limit if bucket doesn't exist
    
    return bucket.tokens >= cost;
  }

  /**
   * Consume tokens from bucket
   */
  private consumeTokens(bucketName: string, cost: number = 1): boolean {
    const bucket = this.buckets.get(bucketName);
    if (!bucket) return true;
    
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return true;
    }
    
    return false;
  }

  /**
   * Execute request with rate limiting
   */
  public async execute<T>(
    bucketName: string,
    priority: 'cancel' | 'entry' | 'status',
    requestFn: () => Promise<T>,
    cost: number = 1
  ): Promise<T> {
    this.metrics.totalRequests++;
    
    // If we can proceed immediately, do so
    if (this.canProceed(bucketName, cost)) {
      this.consumeTokens(bucketName, cost);
      return requestFn();
    }

    // Otherwise, queue the request
    this.metrics.queuedRequests++;
    this.metrics.throttledRequests++;
    
    return new Promise<T>((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: `req_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        priority,
        execute: requestFn,
        resolve,
        reject,
        timestamp: Date.now(),
      };
      
      this.queue.push(queuedRequest);
      this.sortQueue(); // Prioritize
      
      // Start processing if not already running
      if (!this.processing) {
        this.processQueue(bucketName, cost);
      }
    });
  }

  /**
   * Sort queue by priority
   */
  private sortQueue(): void {
    const priorityOrder = { cancel: 0, entry: 1, status: 2 };
    this.queue.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.timestamp - b.timestamp; // FIFO within same priority
    });
  }

  /**
   * Process queued requests
   */
  private async processQueue(bucketName: string, cost: number): Promise<void> {
    this.processing = true;
    
    while (this.queue.length > 0) {
      // Check if we have tokens
      if (!this.canProceed(bucketName, cost)) {
        // Wait for refill
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      // Get next request
      const request = this.queue.shift();
      if (!request) break;

      this.metrics.queuedRequests--;
      this.consumeTokens(bucketName, cost);

      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      }
    }
    
    this.processing = false;
  }

  /**
   * Get backpressure level
   */
  public getBackpressureLevel(bucketName: string): BackpressureLevel {
    const bucket = this.buckets.get(bucketName);
    if (!bucket) return 'NONE';

    const utilization = 1 - (bucket.tokens / bucket.maxTokens);
    const queueSize = this.queue.length;

    if (queueSize > 20 || utilization > 0.9) {
      this.metrics.backpressureEvents++;
      return 'HIGH';
    }
    if (queueSize > 10 || utilization > 0.7) {
      return 'MEDIUM';
    }
    if (queueSize > 5 || utilization > 0.5) {
      return 'LOW';
    }
    
    return 'NONE';
  }

  /**
   * Get rate control status
   */
  public getStatus(bucketName: string = 'private') {
    const bucket = this.buckets.get(bucketName);
    const backpressure = this.getBackpressureLevel(bucketName);
    
    return {
      bucket: bucketName,
      tokensAvailable: bucket ? Math.floor(bucket.tokens) : 0,
      maxTokens: bucket?.maxTokens || 0,
      refillRate: bucket?.refillRate || 0,
      queuedRequests: this.queue.length,
      backpressure,
      utilizationPercent: bucket ? Math.round((1 - bucket.tokens / bucket.maxTokens) * 100) : 0,
    };
  }

  /**
   * Get metrics
   */
  public getMetrics() {
    return {
      ...this.metrics,
      privateStatus: this.getStatus('private'),
      publicStatus: this.getStatus('public'),
    };
  }

  /**
   * Log status (for health reports)
   */
  public logStatus(): void {
    const privateStatus = this.getStatus('private');
    const publicStatus = this.getStatus('public');
    
    console.log(
      `[RATE] private: used=${privateStatus.maxTokens - privateStatus.tokensAvailable}/${privateStatus.maxTokens}(${privateStatus.refillRate}s) / ` +
      `queued=${privateStatus.queuedRequests} / backpressure=${privateStatus.backpressure}`
    );
    
    if (publicStatus.queuedRequests > 0) {
      console.log(
        `[RATE] public: used=${publicStatus.maxTokens - publicStatus.tokensAvailable}/${publicStatus.maxTokens}(${publicStatus.refillRate}s) / ` +
        `queued=${publicStatus.queuedRequests} / backpressure=${publicStatus.backpressure}`
      );
    }
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      queuedRequests: 0,
      throttledRequests: 0,
      backpressureEvents: 0,
    };
  }
}

// Singleton instance
export const rateControl = new RateControlService();
