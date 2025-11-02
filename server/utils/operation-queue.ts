/**
 * Phase 41F-A: Operation Queue Handler
 * 
 * Lightweight in-memory FIFO queue for serializing trading operations
 * (start/stop) to prevent concurrent request collisions.
 * 
 * Features:
 * - Sequential job execution (one at a time)
 * - Automatic retry (once) with exponential backoff
 * - Promise-based result handling
 * - [41F][QUEUE] telemetry logging
 * - Graceful shutdown support
 */

export interface QueueJobMeta {
  userId: string;
  mode: 'paper' | 'live';
  action: 'start' | 'stop' | 'force-stop';
  enqueuedAt: number;
}

interface QueueJob<T> {
  id: string;
  execute: () => Promise<T>;
  meta: QueueJobMeta;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retryCount: number;
}

export class OperationQueue {
  private queue: QueueJob<any>[] = [];
  private processing = false;
  private jobCounter = 0;
  private shuttingDown = false;

  constructor(private queueName: string) {
    console.log(`[41F][QUEUE] ${queueName} initialized`);
  }

  /**
   * Enqueue a job for execution
   * Returns a Promise that resolves/rejects with the job result
   */
  async enqueue<T>(
    job: () => Promise<T>,
    meta: Omit<QueueJobMeta, 'enqueuedAt'>
  ): Promise<T> {
    if (this.shuttingDown) {
      throw new Error('[41F][QUEUE] Queue is shutting down, rejecting new jobs');
    }

    const jobId = `${meta.mode}-${meta.action}-${++this.jobCounter}`;
    const fullMeta: QueueJobMeta = {
      ...meta,
      enqueuedAt: Date.now(),
    };

    return new Promise<T>((resolve, reject) => {
      const queueJob: QueueJob<T> = {
        id: jobId,
        execute: job,
        meta: fullMeta,
        resolve,
        reject,
        retryCount: 0,
      };

      this.queue.push(queueJob);
      
      const queuePosition = this.queue.length;
      console.log(
        `[41F][QUEUE] Job enqueued: ${jobId} (user=${meta.userId}, position=${queuePosition})`
      );

      // Start processing if not already running
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process jobs sequentially from the queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing) {
      return; // Already processing
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      const startTime = Date.now();
      const waitTime = startTime - job.meta.enqueuedAt;

      console.log(
        `[41F][QUEUE] Job started: ${job.id} (waited ${waitTime}ms, queue_size=${this.queue.length})`
      );

      try {
        const result = await job.execute();
        const duration = Date.now() - startTime;
        
        console.log(
          `[41F][QUEUE] Job completed: ${job.id} (duration=${duration}ms, queue_size=${this.queue.length})`
        );
        
        job.resolve(result);
      } catch (error: any) {
        const duration = Date.now() - startTime;

        // Retry logic: one retry with 500ms backoff
        if (job.retryCount === 0) {
          job.retryCount++;
          console.warn(
            `[41F][QUEUE] Job failed (will retry): ${job.id} (duration=${duration}ms, error=${error.message})`
          );
          
          // Wait 500ms before retry
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Re-enqueue at front of queue for immediate retry
          this.queue.unshift(job);
          console.log(`[41F][QUEUE] Job retry: ${job.id} (attempt 2/2)`);
        } else {
          // Max retries exceeded, reject
          console.error(
            `[41F][QUEUE] Job failed (max retries): ${job.id} (duration=${duration}ms, error=${error.message})`
          );
          job.reject(error);
        }
      }
    }

    this.processing = false;
    console.log(`[41F][QUEUE] Queue idle (${this.queueName})`);
  }

  /**
   * Get current queue status
   */
  getStatus() {
    return {
      queueName: this.queueName,
      queueSize: this.queue.length,
      processing: this.processing,
      shuttingDown: this.shuttingDown,
      jobs: this.queue.map(j => ({
        id: j.id,
        userId: j.meta.userId,
        mode: j.meta.mode,
        action: j.meta.action,
        waitingMs: Date.now() - j.meta.enqueuedAt,
      })),
    };
  }

  /**
   * Graceful shutdown: wait for pending jobs to complete
   */
  async shutdown(timeoutMs = 10000): Promise<void> {
    console.log(`[41F][QUEUE] Shutdown initiated (${this.queueName})`);
    this.shuttingDown = true;

    const startTime = Date.now();
    
    // Wait for queue to drain or timeout
    while (this.queue.length > 0 || this.processing) {
      const elapsed = Date.now() - startTime;
      
      if (elapsed > timeoutMs) {
        console.error(
          `[41F][QUEUE] Shutdown timeout (${this.queueName}), ${this.queue.length} jobs abandoned`
        );
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[41F][QUEUE] Shutdown complete (${this.queueName})`);
  }
}

// Global queue instances (one per mode)
export const paperOperationQueue = new OperationQueue('paper-trading');
export const liveOperationQueue = new OperationQueue('live-trading');

/**
 * Graceful shutdown hook for both queues
 */
export async function shutdownAllQueues(): Promise<void> {
  console.log('[41F][QUEUE] Shutting down all operation queues...');
  await Promise.all([
    paperOperationQueue.shutdown(),
    liveOperationQueue.shutdown(),
  ]);
  console.log('[41F][QUEUE] All queues shut down successfully');
}
