/**
 * Phase 41F-A: Operation Queue Handler
 * Phase 41F-B: Request Deduplication & Telemetry
 * 
 * Lightweight in-memory FIFO queue for serializing trading operations
 * (start/stop) to prevent concurrent request collisions.
 * 
 * Features:
 * - Sequential job execution (one at a time)
 * - Request deduplication by (userId:mode:action) key
 * - Automatic retry (once) with exponential backoff
 * - Promise-based result handling
 * - [41F-B][QUEUE] telemetry logging
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
  key: string; // Phase 41F-B: Deduplication key (userId:mode:action)
  execute: () => Promise<T>;
  meta: QueueJobMeta;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  additionalListeners: Array<{ // Phase 41F-B: Piggybacked duplicate requests
    resolve: (value: T) => void;
    reject: (error: Error) => void;
  }>;
  retryCount: number;
}

export class OperationQueue {
  private queue: QueueJob<any>[] = [];
  private processing = false;
  private jobCounter = 0;
  private shuttingDown = false;
  private currentJob: QueueJob<any> | null = null; // Phase 41F-B: Track in-flight job

  constructor(private queueName: string) {
    console.log(`[41F-B][QUEUE] ${queueName} initialized (queue_depth=0)`);
  }

  /**
   * Enqueue a job for execution
   * Returns a Promise that resolves/rejects with the job result
   * Phase 41F-B: Includes deduplication logic
   */
  async enqueue<T>(
    job: () => Promise<T>,
    meta: Omit<QueueJobMeta, 'enqueuedAt'>
  ): Promise<T> {
    if (this.shuttingDown) {
      throw new Error('[41F-B][QUEUE] Queue is shutting down, rejecting new jobs');
    }

    // Phase 41F-B: Generate deduplication key
    const dedupeKey = `${meta.userId}:${meta.mode}:${meta.action}`;
    
    // Phase 41F-B: Check for duplicate jobs in queue OR currently executing
    // Note: No retryCount filter - dedupe must work even during retry backoff
    const existingQueuedJob = this.queue.find(q => q.key === dedupeKey);
    const existingInFlightJob = this.currentJob?.key === dedupeKey
      ? this.currentJob
      : null;
    
    const existingJob = existingQueuedJob || existingInFlightJob;
    
    if (existingJob) {
      const location = existingQueuedJob ? 'queued' : 'in-flight';
      console.warn(
        `[41F-B][QUEUE] Duplicate ${meta.action} request piggybacking for ${dedupeKey} (existing ${location} job: ${existingJob.id})`
      );
      // Piggyback: add new listeners to existing job instead of creating duplicate
      return new Promise<T>((resolve, reject) => {
        existingJob.additionalListeners.push({ resolve, reject });
      });
    }

    const jobId = `${meta.mode}-${meta.action}-${++this.jobCounter}`;
    const fullMeta: QueueJobMeta = {
      ...meta,
      enqueuedAt: Date.now(),
    };

    return new Promise<T>((resolve, reject) => {
      const queueJob: QueueJob<T> = {
        id: jobId,
        key: dedupeKey,
        execute: job,
        meta: fullMeta,
        resolve,
        reject,
        additionalListeners: [], // Phase 41F-B: Initialize empty listener array
        retryCount: 0,
      };

      this.queue.push(queueJob);
      
      const queuePosition = this.queue.length;
      console.log(
        `[41F-B][QUEUE] Job enqueued: ${jobId} (key=${dedupeKey}, position=${queuePosition}, queue_depth=${this.queue.length})`
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
      this.currentJob = job; // Track in-flight job for deduplication
      
      const startTime = Date.now();
      const waitTime = startTime - job.meta.enqueuedAt;

      console.log(
        `[41F-B][QUEUE] Job started: ${job.id} (key=${job.key}, waited=${waitTime}ms, queue_depth=${this.queue.length})`
      );

      try {
        const result = await job.execute();
        const duration = Date.now() - startTime;
        
        const listenerCount = job.additionalListeners.length;
        console.log(
          `[41F-B][QUEUE] Job completed: ${job.id} (duration=${duration}ms, queue_depth=${this.queue.length}, piggybacked_listeners=${listenerCount})`
        );
        
        this.currentJob = null; // Clear in-flight tracking
        
        // Notify primary caller
        job.resolve(result);
        
        // Notify all piggybacked callers
        job.additionalListeners.forEach(listener => {
          try {
            listener.resolve(result);
          } catch (err) {
            console.error(`[41F-B][QUEUE] Error notifying piggybacked listener:`, err);
          }
        });
      } catch (error: any) {
        const duration = Date.now() - startTime;

        // Retry logic: one retry with 500ms backoff
        if (job.retryCount === 0) {
          job.retryCount++;
          console.warn(
            `[41F-B][QUEUE] Job failed (will retry): ${job.id} (duration=${duration}ms, error=${error.message})`
          );
          
          // Wait 500ms before retry
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Re-enqueue at front of queue for immediate retry
          this.queue.unshift(job);
          console.log(`[41F-B][QUEUE] Job retry: ${job.id} (attempt 2/2)`);
        } else {
          // Max retries exceeded, reject
          const listenerCount = job.additionalListeners.length;
          console.error(
            `[41F-B][QUEUE] Job failed (max retries): ${job.id} (duration=${duration}ms, error=${error.message}, piggybacked_listeners=${listenerCount})`
          );
          this.currentJob = null; // Clear in-flight tracking
          
          // Notify primary caller
          job.reject(error);
          
          // Notify all piggybacked callers
          job.additionalListeners.forEach(listener => {
            try {
              listener.reject(error);
            } catch (err) {
              console.error(`[41F-B][QUEUE] Error notifying piggybacked listener:`, err);
            }
          });
        }
      }
    }

    this.processing = false;
    this.currentJob = null; // Ensure cleared when queue is idle
    console.log(`[41F-B][QUEUE] Queue idle (${this.queueName}, queue_depth=0)`);
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
    console.log(`[41F-B][QUEUE] Shutdown initiated (${this.queueName}, queue_depth=${this.queue.length})`);
    this.shuttingDown = true;

    const startTime = Date.now();
    
    // Wait for queue to drain or timeout
    while (this.queue.length > 0 || this.processing) {
      const elapsed = Date.now() - startTime;
      
      if (elapsed > timeoutMs) {
        console.error(
          `[41F-B][QUEUE] Shutdown timeout (${this.queueName}), ${this.queue.length} jobs abandoned`
        );
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[41F-B][QUEUE] Shutdown complete (${this.queueName}, queue_depth=${this.queue.length})`);
  }
}

// Global queue instances (one per mode)
export const activeOperationQueue = new OperationQueue('paper-trading');
export const liveOperationQueue = new OperationQueue('live-trading');

/**
 * Graceful shutdown hook for both queues
 */
export async function shutdownAllQueues(): Promise<void> {
  console.log('[41F-B][QUEUE] Shutting down all operation queues...');
  await Promise.all([
    activeOperationQueue.shutdown(),
    liveOperationQueue.shutdown(),
  ]);
  console.log('[41F-B][QUEUE] All queues shut down successfully');
}

/**
 * Phase 41F-B-5: Startup recovery - clear any orphaned state from previous runs
 * This runs on server startup to ensure clean queue state
 */
export async function initializeQueues(): Promise<void> {
  console.log('[41F-B][RECOVERY] Initializing operation queues on startup...');
  
  // Clear any orphaned jobs (server restart clears in-memory state automatically)
  // But we log the initialization for observability
  const paperStatus = activeOperationQueue.getStatus();
  const liveStatus = liveOperationQueue.getStatus();
  
  console.log('[41F-B][RECOVERY] Paper queue status:', {
    queueSize: paperStatus.queueSize,
    processing: paperStatus.processing,
  });
  
  console.log('[41F-B][RECOVERY] Live queue status:', {
    queueSize: liveStatus.queueSize,
    processing: liveStatus.processing,
  });
  
  // Phase 41F-B-5: Clean up orphaned database sessions and managers
  // This ensures database state matches in-memory queue state
  try {
    const { storage } = await import('../storage.js');
    const { db } = await import('../db.js');
    const { paperSimSessions } = await import('../../shared/schema.js');
    const { eq } = await import('drizzle-orm');
    
    // Find any running paper sessions (these should have been stopped on previous shutdown)
    const runningSessions = await db
      .select()
      .from(paperSimSessions)
      .where(eq(paperSimSessions.status, 'running'));
    
    if (runningSessions.length > 0) {
      console.warn(`[41F-B][RECOVERY] Found ${runningSessions.length} orphaned paper trading session(s) from previous run`);
      
      // Mark them as stopped (graceful recovery)
      for (const session of runningSessions) {
        await storage.updatePaperSimSession(session.id, {
          status: 'stopped',
          stoppedAt: new Date(),
          runForMs: new Date().getTime() - new Date(session.startedAt).getTime(),
        });
        console.log(`[41F-B][RECOVERY] Marked orphaned session ${session.sessionId} as stopped`);
      }
    } else {
      console.log('[41F-B][RECOVERY] No orphaned paper trading sessions found');
    }
    
    // Clear any global manager state (should already be null on fresh start, but ensure it).
    // P19-B4b D5: per-mode accessor (paper). Dynamic import avoids the active-engine-service ↔
    // operation-queue import cycle.
    const { getGlobalActiveEngineManager, clearGlobalActiveEngineManager } = await import('../services/active-engine-service.js');
    if (getGlobalActiveEngineManager('paper')) {
      console.warn('[41F-B][RECOVERY] Clearing orphaned global paper portfolio manager');
      clearGlobalActiveEngineManager('paper');
    }
    
    if ((global as any).tradingEngines) {
      const engineCount = (global as any).tradingEngines.size;
      if (engineCount > 0) {
        console.warn(`[41F-B][RECOVERY] Clearing ${engineCount} orphaned trading engine(s)`);
        (global as any).tradingEngines.clear();
      }
    }
    
    console.log('[41F-B][RECOVERY] Queue initialization complete - system ready');
  } catch (error) {
    console.error('[41F-B][RECOVERY] Error during startup recovery:', error);
    // Non-blocking - system can still start even if recovery fails
  }
}
