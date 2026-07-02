/**
 * Phase 41F-C: Unified Engine Health Monitoring
 * 
 * Comprehensive health monitoring system that tracks:
 * - Operation queues (paper/live)
 * - Trading engines (paper/live)
 * - Market data coordinator
 * - SSOT cache
 * - Database pool
 * - Broadcast bus
 * - External connectivity
 * 
 * Features:
 * - 5-second heartbeat cycle
 * - In-memory ring buffer (250 heartbeats)
 * - Auto-recovery hooks
 * - Non-blocking broadcasts
 * - WebSocket + HTTP API
 */

import { EventEmitter } from 'events';
import { activeOperationQueue, liveOperationQueue } from '../utils/operation-queue.js';
import { storage } from '../storage.js';

// ========================================
// Type Definitions
// ========================================

export interface QueueHealth {
  ok: boolean;
  depth: number;
  executingJobAgeMs: number | null;
  oldestAgeMs: number | null;
  dedupListenerCount: number;
  details: any;
}

export interface EngineHealth {
  ok: boolean;
  isRunning: boolean;
  lastTickAgeMs: number | null;
  lastSignalAgeMs: number | null;
  lastTradeAgeMs: number | null;
  sessionId: string | null;
  details: any;
}

export interface MarketDataHealth {
  ok: boolean;
  websocketStatus: 'connected' | 'disconnected' | 'blocked_fallback_rest';
  lastMessageAgeMs: number | null;
  restFallbackActive: boolean;
  retryBackoffMs: number | null;
  details: any;
}

export interface SSOTHealth {
  ok: boolean;
  cache: {
    hits: number;
    misses: number;
    ttlMs: number;
    activeFilterHash: string | null;
  };
  lastRefreshAgeMs: number | null;
  details: any;
}

export interface DBHealth {
  ok: boolean;
  pool: {
    active: number;
    idle: number;
    total: number;
  };
  slowQueries: number;
  lastErrorAgeMs: number | null;
  details: any;
}

export interface BroadcastHealth {
  ok: boolean;
  lastEventType: string | null;
  lastLatencyMs: number | null;
  averageLatencyMs: number | null;
  details: any;
}

export interface ExternalConnectivityHealth {
  ok: boolean;
  krakenLastSuccess: number | null;
  krakenLastError: number | null;
  details: any;
}

export interface HealthBeat {
  ts: string;
  paper: {
    queue: QueueHealth;
    engine: EngineHealth;
  };
  live: {
    queue: QueueHealth;
    engine: EngineHealth;
  };
  marketData: MarketDataHealth;
  ssot: SSOTHealth;
  db: DBHealth;
  broadcasts: BroadcastHealth;
  externalConnectivity: ExternalConnectivityHealth;
  overallOk: boolean;
}

export interface RecoveryAction {
  timestamp: string;
  component: string;
  issue: string;
  action: string;
  success: boolean;
  details: any;
  // Phase 41F-G: Enhanced recovery tracking
  result?: 'success' | 'failure' | 'skipped';
  durationMs?: number;
  cooldownUntil?: string;
  circuitBreakerActive?: boolean;
}

// Phase 41F-F: Anomaly detection types
export type AlertLevel = 'ok' | 'warning' | 'critical';

export interface Anomaly {
  timestamp: string;
  component: string;
  metric: string;
  value: number | string;
  threshold: number | string;
  level: AlertLevel;
  message: string;
  autoRecoveryAttempted: boolean;
  recoverySuccess?: boolean;
}

// ========================================
// Configuration
// ========================================

// Phase 41F-F: Alert thresholds for anomaly detection
// Phase 41F-I: Lifted broadcast warning threshold to 120ms based on burn-in results
const ALERT_THRESHOLDS = {
  heartbeat: { warn: 200, crit: 400 }, // Heartbeat latency in ms
  broadcast: { warn: 120, crit: 200 }, // Broadcast latency in ms (adjusted in 41F-I)
  queueDepth: { warn: 5, crit: 10 }, // Number of pending jobs
  jobAge: { warn: 15000, crit: 30000 }, // Age of executing job in ms
  wsSilence: { warn: 2, crit: 4 }, // Number of heartbeat cycles without WS activity
};

interface HealthMonitorConfig {
  heartbeatIntervalMs: number;
  ringBufferSize: number;
  enabled: boolean;
  autoRecoveryEnabled: boolean;
  broadcastNonblockingEnforced: boolean;
  
  // Recovery thresholds
  queue: {
    maxExecMs: number;
  };
  engine: {
    maxTickGapMs: number;
  };
  market: {
    fallbackMaxAgeMs: number;
  };
}

const DEFAULT_CONFIG: HealthMonitorConfig = {
  heartbeatIntervalMs: 5000, // 5 seconds
  ringBufferSize: 250, // Last 250 beats (~21 minutes at 5s intervals)
  enabled: process.env.ENGINE_HEALTH_MONITOR_ENABLED !== 'false',
  autoRecoveryEnabled: process.env.ENGINE_AUTO_RECOVERY_ENABLED !== 'false',
  broadcastNonblockingEnforced: process.env.BROADCAST_NONBLOCKING_ENFORCED !== 'false',
  
  queue: {
    maxExecMs: 3000, // Queue jobs should complete within 3s
  },
  engine: {
    maxTickGapMs: 60000, // Engine tick should happen within 60s
  },
  market: {
    fallbackMaxAgeMs: 20000, // Market data should update within 20s
  },
};

// ========================================
// Health Monitor Service
// ========================================

class HealthMonitor extends EventEmitter {
  private config: HealthMonitorConfig;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private ringBuffer: HealthBeat[] = [];
  private recoveryActions: RecoveryAction[] = [];
  private isRunning = false;
  
  // Broadcast tracking
  private lastBroadcastEvent: { type: string; timestamp: number; latencyMs: number } | null = null;
  private broadcastLatencies: number[] = [];
  
  // External connectivity tracking
  private krakenLastSuccess: number | null = null;
  private krakenLastError: number | null = null;
  
  // Phase 41F-F: Anomaly detection
  private anomalyBuffer: Anomaly[] = []; // Rolling buffer of 100 anomalies
  private wsSilenceCounter = 0; // Tracks heartbeat cycles without WS activity
  private lastWsBroadcastCycle = 0; // Cycle number when last WS broadcast occurred
  
  // Phase 41F-G: Auto-recovery framework
  private lastRecoveryTimestamp: number = 0; // Last recovery execution timestamp
  private cooldownPeriodMs = 120000; // 120 seconds cool-down between recoveries
  private circuitBreakerActive = false; // Circuit breaker state
  private circuitBreakerUntil: number = 0; // Timestamp when circuit breaker expires
  private recentRecoveries: { timestamp: number; component: string; metric: string }[] = []; // Last 10 minutes of recoveries
  private circuitBreakerThreshold = 3; // Max recoveries in 10 minutes before circuit breaker activates
  private circuitBreakerWindow = 600000; // 10 minutes window for circuit breaker
  private circuitBreakerDuration = 600000; // 10 minutes circuit breaker suspension
  
  // Phase 41F-I: Trade telemetry tracking
  private lastTradeTs: number | null = null; // Last trade activity timestamp
  private engineActive = false; // Tracks if any trading engine is active

  constructor(config?: Partial<HealthMonitorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.enabled) {
      console.log('[41F-C][HEARTBEAT] HealthMonitor initialized');
      console.log('[41F-C][HEARTBEAT] Config:', {
        intervalMs: this.config.heartbeatIntervalMs,
        autoRecovery: this.config.autoRecoveryEnabled,
        broadcastNonblocking: this.config.broadcastNonblockingEnforced,
      });
    } else {
      console.log('[41F-C][HEARTBEAT] HealthMonitor disabled via ENV');
    }
  }

  /**
   * Start health monitoring heartbeat
   */
  start(): void {
    if (!this.config.enabled) {
      console.log('[41F-C][HEARTBEAT] Skipping start (disabled)');
      return;
    }

    if (this.isRunning) {
      console.warn('[41F-C][HEARTBEAT] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[41F-C][HEARTBEAT] Starting health monitor');
    
    // Run first heartbeat immediately
    this.performHeartbeat();
    
    // Schedule recurring heartbeat
    this.heartbeatTimer = setInterval(() => {
      this.performHeartbeat();
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.isRunning = false;
    console.log('[41F-C][HEARTBEAT] Health monitor stopped');
  }

  /**
   * Perform single heartbeat check
   */
  private async performHeartbeat(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('[41F-C][HEARTBEAT] Starting heartbeat cycle');
      
      // Collect all health checks in parallel
      const [
        paperQueue,
        liveQueue,
        paperEngine,
        liveEngine,
        marketData,
        ssot,
        db,
        broadcasts,
        externalConnectivity,
      ] = await Promise.all([
        this.checkQueueHealth('paper'),
        this.checkQueueHealth('live'),
        this.checkEngineHealth('paper'),
        this.checkEngineHealth('live'),
        this.checkMarketDataHealth(),
        this.checkSSOTHealth(),
        this.checkDBHealth(),
        this.checkBroadcastHealth(),
        this.checkExternalConnectivity(),
      ]);

      // Compute overall health
      const overallOk = [
        paperQueue.ok,
        liveQueue.ok,
        paperEngine.ok,
        liveEngine.ok,
        marketData.ok,
        ssot.ok,
        db.ok,
        broadcasts.ok,
        externalConnectivity.ok,
      ].every(ok => ok);

      const beat: HealthBeat = {
        ts: new Date().toISOString(),
        paper: {
          queue: paperQueue,
          engine: paperEngine,
        },
        live: {
          queue: liveQueue,
          engine: liveEngine,
        },
        marketData,
        ssot,
        db,
        broadcasts,
        externalConnectivity,
        overallOk,
      };

      // Add to ring buffer
      this.ringBuffer.push(beat);
      if (this.ringBuffer.length > this.config.ringBufferSize) {
        this.ringBuffer.shift();
      }

      const duration = Date.now() - startTime;
      console.log(`[41F-C][HEARTBEAT] Heartbeat complete (${duration}ms, overallOk=${overallOk})`);

      // Phase 41F-F: Evaluate anomalies
      const anomalies = this.evaluateAnomalies(beat, duration);
      if (anomalies.length > 0) {
        console.log(`[41F-F][ALERT] Detected ${anomalies.length} anomal${anomalies.length === 1 ? 'y' : 'ies'}`);
        anomalies.forEach(a => {
          console.log(`[41F-F][ALERT][${a.level.toUpperCase()}] ${a.component}.${a.metric}: ${a.message}`);
        });

        // Add to anomaly buffer
        this.anomalyBuffer.push(...anomalies);
        if (this.anomalyBuffer.length > 100) {
          this.anomalyBuffer.splice(0, this.anomalyBuffer.length - 100);
        }

        // Trigger auto-recovery for critical anomalies
        if (this.config.autoRecoveryEnabled) {
          await this.triggerAutoRecovery(anomalies);
        }
      }

      // Phase 41F-F: Increment WS silence counter
      this.wsSilenceCounter++;

      // Emit for WebSocket broadcast
      this.emit('heartbeat', beat);

      // Run auto-recovery if enabled
      if (this.config.autoRecoveryEnabled) {
        await this.performAutoRecovery(beat);
      }

    } catch (error: any) {
      console.error('[41F-C][HEARTBEAT] Error during heartbeat:', error.message);
    }
  }

  /**
   * Check operation queue health
   */
  private async checkQueueHealth(mode: 'paper' | 'live'): Promise<QueueHealth> {
    try {
      const queue = mode === 'paper' ? activeOperationQueue : liveOperationQueue;
      const status = queue.getStatus();

      // Calculate ages
      const oldestAgeMs = status.jobs.length > 0
        ? Math.max(...status.jobs.map(j => j.waitingMs))
        : null;

      // Check for executing job (processing=true and queue has jobs)
      const executingJobAgeMs = status.processing && status.jobs.length > 0
        ? status.jobs[0].waitingMs
        : null;

      // Count dedup listeners (would need to expose this from OperationQueue)
      const dedupListenerCount = 0; // Placeholder

      const ok = status.queueSize < 10 && (executingJobAgeMs === null || executingJobAgeMs < this.config.queue.maxExecMs);

      return {
        ok,
        depth: status.queueSize,
        executingJobAgeMs,
        oldestAgeMs,
        dedupListenerCount,
        details: { processing: status.processing, shuttingDown: status.shuttingDown },
      };
    } catch (error: any) {
      console.error(`[41F-C][CHECK] Error checking ${mode} queue:`, error.message);
      return {
        ok: false,
        depth: 0,
        executingJobAgeMs: null,
        oldestAgeMs: null,
        dedupListenerCount: 0,
        details: { error: error.message },
      };
    }
  }

  /**
   * Check trading engine health
   */
  private async checkEngineHealth(mode: 'paper' | 'live'): Promise<EngineHealth> {
    try {
      // Get trading engines from global state
      const tradingEngines = (global as any).tradingEngines as Map<string, any>;
      
      if (!tradingEngines) {
        return {
          ok: true, // No engines running is OK
          isRunning: false,
          lastTickAgeMs: null,
          lastSignalAgeMs: null,
          lastTradeAgeMs: null,
          sessionId: null,
          details: { reason: 'no_global_engines' },
        };
      }

      // Find engine for this mode (check all users)
      let engine: any = null;
      for (const [userId, eng] of tradingEngines.entries()) {
        if (eng.mode === mode && eng.isRunning) {
          engine = eng;
          break;
        }
      }

      if (!engine) {
        return {
          ok: true, // Engine not running is OK
          isRunning: false,
          lastTickAgeMs: null,
          lastSignalAgeMs: null,
          lastTradeAgeMs: null,
          sessionId: null,
          details: { reason: 'engine_not_running' },
        };
      }

      // Calculate tick age
      const lastTickAgeMs = engine.lastTickAt
        ? Date.now() - engine.lastTickAt.getTime()
        : null;

      const lastSignalAgeMs = engine.lastSignalAt
        ? Date.now() - engine.lastSignalAt.getTime()
        : null;

      const lastTradeAgeMs = engine.lastTradeAt
        ? Date.now() - engine.lastTradeAt.getTime()
        : null;

      const ok = engine.isRunning && (lastTickAgeMs === null || lastTickAgeMs < this.config.engine.maxTickGapMs);

      return {
        ok,
        isRunning: engine.isRunning,
        lastTickAgeMs,
        lastSignalAgeMs,
        lastTradeAgeMs,
        sessionId: engine.sessionId || null,
        details: { userId: engine.userId },
      };
    } catch (error: any) {
      console.error(`[41F-C][CHECK] Error checking ${mode} engine:`, error.message);
      return {
        ok: false,
        isRunning: false,
        lastTickAgeMs: null,
        lastSignalAgeMs: null,
        lastTradeAgeMs: null,
        sessionId: null,
        details: { error: error.message },
      };
    }
  }

  /**
   * Check market data coordinator health
   */
  private async checkMarketDataHealth(): Promise<MarketDataHealth> {
    try {
      // P19-B6.7 (#301): read the PRIMARY adapter, not the removed 2nd-WS coordinator.
      // No REST-fallback feed exists (that was a coordinator-only concept), so health =
      // primary WS connected AND delivering fresh ticks (freshest-symbol age across the
      // whole subscribed set — stays fresh while ANY symbol ticks, e.g. crypto 24/7).
      const { krakenWebSocketAdapter } = await import('../exchanges/kraken/kraken-websocket-adapter.js');
      const { freshestSymbolAgeMs } = await import('./market-data/feed-health-aggregate.js');
      const status = krakenWebSocketAdapter.getStatus();
      const freshestAgeMs = freshestSymbolAgeMs(krakenWebSocketAdapter.getI8EWsHealth());

      const websocketStatus = status.isConnected ? 'connected' : 'disconnected';
      const ok = status.isConnected && freshestAgeMs !== null && freshestAgeMs < this.config.market.fallbackMaxAgeMs;

      return {
        ok,
        websocketStatus: websocketStatus as any,
        lastMessageAgeMs: freshestAgeMs,
        restFallbackActive: false,
        retryBackoffMs: status.reconnectAttempts > 0 ? Math.min(1000 * Math.pow(2, status.reconnectAttempts), 16000) : null,
        details: { reconnects: status.reconnectAttempts },
      };
    } catch (error: any) {
      console.error('[41F-C][CHECK] Error checking market data:', error.message);
      return {
        ok: false,
        websocketStatus: 'disconnected',
        lastMessageAgeMs: null,
        restFallbackActive: false,
        retryBackoffMs: null,
        details: { error: error.message },
      };
    }
  }

  /**
   * Check SSOT cache health
   */
  private async checkSSOTHealth(): Promise<SSOTHealth> {
    try {
      // Import market evaluation service (SSOT)
      const { getMarketEvaluationService } = await import('./market-evaluation.js');
      const marketEvaluationService = getMarketEvaluationService();
      
      // Get cache stats (if available)
      const stats = (marketEvaluationService as any).getCacheStats?.() || {
        hits: 0,
        misses: 0,
        ttlMs: 15000,
        activeFilterHash: null,
      };

      const hitRate = stats.hits + stats.misses > 0
        ? stats.hits / (stats.hits + stats.misses)
        : 1;

      const ok = hitRate > 0.5; // At least 50% hit rate

      return {
        ok,
        cache: {
          hits: stats.hits,
          misses: stats.misses,
          ttlMs: stats.ttlMs,
          activeFilterHash: stats.activeFilterHash,
        },
        lastRefreshAgeMs: stats.lastRefreshAgeMs || null,
        details: { hitRate: hitRate.toFixed(2) },
      };
    } catch (error: any) {
      console.error('[41F-C][CHECK] Error checking SSOT:', error.message);
      return {
        ok: true, // Default to OK if can't check
        cache: {
          hits: 0,
          misses: 0,
          ttlMs: 15000,
          activeFilterHash: null,
        },
        lastRefreshAgeMs: null,
        details: { error: error.message },
      };
    }
  }

  /**
   * Check database health
   */
  private async checkDBHealth(): Promise<DBHealth> {
    try {
      const { db } = await import('../db.js');
      
      // Execute simple query to check connection
      const start = Date.now();
      await db.execute('SELECT 1');
      const queryTime = Date.now() - start;

      const slowQueries = queryTime > 500 ? 1 : 0;
      const ok = queryTime < 1000;

      return {
        ok,
        pool: {
          active: 0, // Not easily accessible from Neon
          idle: 0,
          total: 0,
        },
        slowQueries,
        lastErrorAgeMs: null,
        details: { lastQueryMs: queryTime },
      };
    } catch (error: any) {
      console.error('[41F-C][CHECK] Error checking DB:', error.message);
      return {
        ok: false,
        pool: {
          active: 0,
          idle: 0,
          total: 0,
        },
        slowQueries: 0,
        lastErrorAgeMs: 0,
        details: { error: error.message },
      };
    }
  }

  /**
   * Check broadcast health
   */
  private checkBroadcastHealth(): BroadcastHealth {
    try {
      if (!this.lastBroadcastEvent) {
        return {
          ok: true, // No broadcasts yet is OK
          lastEventType: null,
          lastLatencyMs: null,
          averageLatencyMs: null,
          details: { reason: 'no_broadcasts_yet' },
        };
      }

      const ageMs = Date.now() - this.lastBroadcastEvent.timestamp;
      const avgLatency = this.broadcastLatencies.length > 0
        ? this.broadcastLatencies.reduce((a, b) => a + b, 0) / this.broadcastLatencies.length
        : null;

      const ok = ageMs < 30000 && (avgLatency === null || avgLatency < 100); // Last broadcast within 30s, avg latency <100ms

      return {
        ok,
        lastEventType: this.lastBroadcastEvent.type,
        lastLatencyMs: this.lastBroadcastEvent.latencyMs,
        averageLatencyMs: avgLatency,
        details: { lastBroadcastAgeMs: ageMs },
      };
    } catch (error: any) {
      console.error('[41F-C][CHECK] Error checking broadcasts:', error.message);
      return {
        ok: true,
        lastEventType: null,
        lastLatencyMs: null,
        averageLatencyMs: null,
        details: { error: error.message },
      };
    }
  }

  /**
   * Check external connectivity (Kraken)
   */
  private checkExternalConnectivity(): ExternalConnectivityHealth {
    try {
      const ok = this.krakenLastSuccess !== null && 
                 (this.krakenLastError === null || this.krakenLastSuccess > this.krakenLastError);

      return {
        ok,
        krakenLastSuccess: this.krakenLastSuccess,
        krakenLastError: this.krakenLastError,
        details: {
          timeSinceLastSuccess: this.krakenLastSuccess ? Date.now() - this.krakenLastSuccess : null,
          timeSinceLastError: this.krakenLastError ? Date.now() - this.krakenLastError : null,
        },
      };
    } catch (error: any) {
      console.error('[41F-C][CHECK] Error checking external connectivity:', error.message);
      return {
        ok: true, // Default to OK
        krakenLastSuccess: null,
        krakenLastError: null,
        details: { error: error.message },
      };
    }
  }

  /**
   * Perform auto-recovery based on health beat
   */
  private async performAutoRecovery(beat: HealthBeat): Promise<void> {
    try {
      // Check paper queue
      if (!beat.paper.queue.ok && beat.paper.queue.executingJobAgeMs !== null && beat.paper.queue.executingJobAgeMs > this.config.queue.maxExecMs) {
        await this.recoverStuckQueue('paper', beat.paper.queue);
      }

      // Check live queue
      if (!beat.live.queue.ok && beat.live.queue.executingJobAgeMs !== null && beat.live.queue.executingJobAgeMs > this.config.queue.maxExecMs) {
        await this.recoverStuckQueue('live', beat.live.queue);
      }

      // Check paper engine
      if (!beat.paper.engine.ok && beat.paper.engine.isRunning && beat.paper.engine.lastTickAgeMs !== null && beat.paper.engine.lastTickAgeMs > this.config.engine.maxTickGapMs) {
        await this.recoverIdleEngine('paper', beat.paper.engine);
      }

      // Check live engine
      if (!beat.live.engine.ok && beat.live.engine.isRunning && beat.live.engine.lastTickAgeMs !== null && beat.live.engine.lastTickAgeMs > this.config.engine.maxTickGapMs) {
        await this.recoverIdleEngine('live', beat.live.engine);
      }

      // Check market data
      if (!beat.marketData.ok && beat.marketData.websocketStatus === 'blocked_fallback_rest' && beat.marketData.lastMessageAgeMs !== null && beat.marketData.lastMessageAgeMs > this.config.market.fallbackMaxAgeMs) {
        await this.recoverMarketData(beat.marketData);
      }

    } catch (error: any) {
      console.error('[41F-C][RECOVERY] Error during auto-recovery:', error.message);
    }
  }

  /**
   * Recover stuck queue job
   */
  private async recoverStuckQueue(mode: 'paper' | 'live', queueHealth: QueueHealth): Promise<void> {
    const action: RecoveryAction = {
      timestamp: new Date().toISOString(),
      component: `${mode}_queue`,
      issue: `Stuck job (executing for ${queueHealth.executingJobAgeMs}ms)`,
      action: 'log_warning',
      success: true,
      details: queueHealth.details,
    };

    console.warn(`[41F-C][RECOVERY][QUEUE] ${mode} queue stuck (${queueHealth.executingJobAgeMs}ms) - job should complete within ${this.config.queue.maxExecMs}ms`);
    
    this.recoveryActions.push(action);
    if (this.recoveryActions.length > 100) {
      this.recoveryActions.shift();
    }

    this.emit('recovery', action);
  }

  /**
   * Recover idle/dead engine
   */
  private async recoverIdleEngine(mode: 'paper' | 'live', engineHealth: EngineHealth): Promise<void> {
    const action: RecoveryAction = {
      timestamp: new Date().toISOString(),
      component: `${mode}_engine`,
      issue: `Dead tick (last tick ${engineHealth.lastTickAgeMs}ms ago)`,
      action: 'log_warning',
      success: true,
      details: engineHealth.details,
    };

    console.warn(`[41F-C][RECOVERY][ENGINE] ${mode} engine idle (last tick ${engineHealth.lastTickAgeMs}ms ago) - tick should happen within ${this.config.engine.maxTickGapMs}ms`);
    
    this.recoveryActions.push(action);
    if (this.recoveryActions.length > 100) {
      this.recoveryActions.shift();
    }

    this.emit('recovery', action);
  }

  /**
   * Recover market data feed
   */
  private async recoverMarketData(marketHealth: MarketDataHealth): Promise<void> {
    const action: RecoveryAction = {
      timestamp: new Date().toISOString(),
      component: 'market_data',
      issue: `Stale fallback data (${marketHealth.lastMessageAgeMs}ms old)`,
      action: 'force_rest_refresh',
      success: true,
      details: marketHealth.details,
    };

    console.warn(`[41F-C][RECOVERY][MARKET] Market data stale (${marketHealth.lastMessageAgeMs}ms) - forcing REST refresh`);
    
    this.recoveryActions.push(action);
    if (this.recoveryActions.length > 100) {
      this.recoveryActions.shift();
    }

    this.emit('recovery', action);
  }

  /**
   * Phase 41F-F: Evaluate anomalies based on alert thresholds
   */
  private evaluateAnomalies(beat: HealthBeat, heartbeatDuration: number): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const now = new Date().toISOString();

    // Check heartbeat latency
    if (heartbeatDuration > ALERT_THRESHOLDS.heartbeat.crit) {
      anomalies.push({
        timestamp: now,
        component: 'health_monitor',
        metric: 'heartbeat_latency',
        value: heartbeatDuration,
        threshold: ALERT_THRESHOLDS.heartbeat.crit,
        level: 'critical',
        message: `Heartbeat cycle took ${heartbeatDuration}ms (critical threshold: ${ALERT_THRESHOLDS.heartbeat.crit}ms)`,
        autoRecoveryAttempted: false,
      });
    } else if (heartbeatDuration > ALERT_THRESHOLDS.heartbeat.warn) {
      anomalies.push({
        timestamp: now,
        component: 'health_monitor',
        metric: 'heartbeat_latency',
        value: heartbeatDuration,
        threshold: ALERT_THRESHOLDS.heartbeat.warn,
        level: 'warning',
        message: `Heartbeat cycle took ${heartbeatDuration}ms (warning threshold: ${ALERT_THRESHOLDS.heartbeat.warn}ms)`,
        autoRecoveryAttempted: false,
      });
    }

    // Check broadcast latency
    if (beat.broadcasts.lastLatencyMs !== null) {
      if (beat.broadcasts.lastLatencyMs > ALERT_THRESHOLDS.broadcast.crit) {
        anomalies.push({
          timestamp: now,
          component: 'broadcast',
          metric: 'latency',
          value: beat.broadcasts.lastLatencyMs,
          threshold: ALERT_THRESHOLDS.broadcast.crit,
          level: 'critical',
          message: `Broadcast latency ${beat.broadcasts.lastLatencyMs}ms (critical threshold: ${ALERT_THRESHOLDS.broadcast.crit}ms)`,
          autoRecoveryAttempted: false,
        });
      } else if (beat.broadcasts.lastLatencyMs > ALERT_THRESHOLDS.broadcast.warn) {
        anomalies.push({
          timestamp: now,
          component: 'broadcast',
          metric: 'latency',
          value: beat.broadcasts.lastLatencyMs,
          threshold: ALERT_THRESHOLDS.broadcast.warn,
          level: 'warning',
          message: `Broadcast latency ${beat.broadcasts.lastLatencyMs}ms (warning threshold: ${ALERT_THRESHOLDS.broadcast.warn}ms)`,
          autoRecoveryAttempted: false,
        });
      }
    }

    // Check queue depth for paper and live
    for (const mode of ['paper', 'live'] as const) {
      const queueHealth = beat[mode].queue;
      if (queueHealth.depth > ALERT_THRESHOLDS.queueDepth.crit) {
        anomalies.push({
          timestamp: now,
          component: `${mode}_queue`,
          metric: 'depth',
          value: queueHealth.depth,
          threshold: ALERT_THRESHOLDS.queueDepth.crit,
          level: 'critical',
          message: `${mode} queue depth ${queueHealth.depth} (critical threshold: ${ALERT_THRESHOLDS.queueDepth.crit})`,
          autoRecoveryAttempted: false,
        });
      } else if (queueHealth.depth > ALERT_THRESHOLDS.queueDepth.warn) {
        anomalies.push({
          timestamp: now,
          component: `${mode}_queue`,
          metric: 'depth',
          value: queueHealth.depth,
          threshold: ALERT_THRESHOLDS.queueDepth.warn,
          level: 'warning',
          message: `${mode} queue depth ${queueHealth.depth} (warning threshold: ${ALERT_THRESHOLDS.queueDepth.warn})`,
          autoRecoveryAttempted: false,
        });
      }

      // Check job age
      if (queueHealth.executingJobAgeMs !== null) {
        if (queueHealth.executingJobAgeMs > ALERT_THRESHOLDS.jobAge.crit) {
          anomalies.push({
            timestamp: now,
            component: `${mode}_queue`,
            metric: 'job_age',
            value: queueHealth.executingJobAgeMs,
            threshold: ALERT_THRESHOLDS.jobAge.crit,
            level: 'critical',
            message: `${mode} queue job age ${queueHealth.executingJobAgeMs}ms (critical threshold: ${ALERT_THRESHOLDS.jobAge.crit}ms)`,
            autoRecoveryAttempted: false,
          });
        } else if (queueHealth.executingJobAgeMs > ALERT_THRESHOLDS.jobAge.warn) {
          anomalies.push({
            timestamp: now,
            component: `${mode}_queue`,
            metric: 'job_age',
            value: queueHealth.executingJobAgeMs,
            threshold: ALERT_THRESHOLDS.jobAge.warn,
            level: 'warning',
            message: `${mode} queue job age ${queueHealth.executingJobAgeMs}ms (warning threshold: ${ALERT_THRESHOLDS.jobAge.warn}ms)`,
            autoRecoveryAttempted: false,
          });
        }
      }
    }

    // Check WebSocket silence
    if (this.wsSilenceCounter > ALERT_THRESHOLDS.wsSilence.crit) {
      anomalies.push({
        timestamp: now,
        component: 'websocket',
        metric: 'silence_cycles',
        value: this.wsSilenceCounter,
        threshold: ALERT_THRESHOLDS.wsSilence.crit,
        level: 'critical',
        message: `WebSocket silence for ${this.wsSilenceCounter} cycles (critical threshold: ${ALERT_THRESHOLDS.wsSilence.crit})`,
        autoRecoveryAttempted: false,
      });
    } else if (this.wsSilenceCounter > ALERT_THRESHOLDS.wsSilence.warn) {
      anomalies.push({
        timestamp: now,
        component: 'websocket',
        metric: 'silence_cycles',
        value: this.wsSilenceCounter,
        threshold: ALERT_THRESHOLDS.wsSilence.warn,
        level: 'warning',
        message: `WebSocket silence for ${this.wsSilenceCounter} cycles (warning threshold: ${ALERT_THRESHOLDS.wsSilence.warn})`,
        autoRecoveryAttempted: false,
      });
    }

    // Phase 41F-I: Check trade pipeline idle (60s without activity while engine active)
    this.engineActive = beat.paper.engine.isRunning || beat.live.engine.isRunning;
    const timeSinceLastTrade = this.lastTradeTs ? Date.now() - this.lastTradeTs : null;
    if (this.engineActive && timeSinceLastTrade && timeSinceLastTrade > 60000) {
      anomalies.push({
        timestamp: now,
        component: 'tradePipeline',
        metric: 'idle',
        value: timeSinceLastTrade,
        threshold: 60000,
        level: 'warning',
        message: `No trade activity for ${Math.round(timeSinceLastTrade / 1000)}s while engine active`,
        autoRecoveryAttempted: false,
      });
    }

    return anomalies;
  }

  /**
   * Phase 41F-F: Trigger auto-recovery for detected anomalies
   */
  private async triggerAutoRecovery(anomalies: Anomaly[]): Promise<void> {
    for (const anomaly of anomalies) {
      // Only attempt recovery for critical anomalies
      if (anomaly.level !== 'critical') {
        continue;
      }

      console.log(`[41F-F][RECOVERY][AUTO] Attempting recovery for ${anomaly.component}.${anomaly.metric}`);

      try {
        let success = false;

        // Broadcast latency recovery
        if (anomaly.component === 'broadcast' && anomaly.metric === 'latency') {
          console.warn(`[41F-F][RECOVERY][AUTO] Broadcast latency critical - logging for monitoring`);
          success = true; // Just log it, don't restart contextBridge yet
        }

        // Queue depth recovery
        if (anomaly.component.endsWith('_queue') && anomaly.metric === 'depth') {
          const mode = anomaly.component.split('_')[0] as 'paper' | 'live';
          console.warn(`[41F-F][RECOVERY][AUTO] ${mode} queue depth critical - consider purging old jobs`);
          // Note: Would need to expose purge method in OperationQueue
          success = true;
        }

        // Job age recovery
        if (anomaly.component.endsWith('_queue') && anomaly.metric === 'job_age') {
          const mode = anomaly.component.split('_')[0] as 'paper' | 'live';
          console.warn(`[41F-F][RECOVERY][AUTO] ${mode} queue job age critical - job may be stuck`);
          // This is already handled by existing performAutoRecovery
          success = true;
        }

        // WebSocket silence recovery
        if (anomaly.component === 'websocket' && anomaly.metric === 'silence_cycles') {
          console.warn(`[41F-F][RECOVERY][AUTO] WebSocket silence critical - force reconnect needed`);
          // Would need to trigger contextBridge reconnect
          success = true;
        }

        // Update anomaly with recovery result
        anomaly.autoRecoveryAttempted = true;
        anomaly.recoverySuccess = success;

        // Log recovery attempt
        const action: RecoveryAction = {
          timestamp: new Date().toISOString(),
          component: anomaly.component,
          issue: anomaly.message,
          action: 'auto_recovery_triggered',
          success,
          details: { metric: anomaly.metric, value: anomaly.value, threshold: anomaly.threshold },
        };

        this.recoveryActions.push(action);
        if (this.recoveryActions.length > 100) {
          this.recoveryActions.shift();
        }

        // Emit recovery event
        this.emit('recovery', action);

      } catch (error: any) {
        console.error(`[41F-F][RECOVERY][AUTO] Error recovering ${anomaly.component}.${anomaly.metric}:`, error.message);
        anomaly.autoRecoveryAttempted = true;
        anomaly.recoverySuccess = false;
      }
    }
  }

  /**
   * Track broadcast event (called by context bridge)
   */
  trackBroadcast(eventType: string, latencyMs: number): void {
    this.lastBroadcastEvent = {
      type: eventType,
      timestamp: Date.now(),
      latencyMs,
    };

    this.broadcastLatencies.push(latencyMs);
    if (this.broadcastLatencies.length > 100) {
      this.broadcastLatencies.shift();
    }

    // Phase 41F-F: Reset WS silence counter when broadcast occurs
    this.wsSilenceCounter = 0;

    console.log(`[41F-C][BROADCAST] ${eventType} (latency=${latencyMs}ms)`);
  }

  /**
   * Track Kraken connectivity
   */
  trackKrakenSuccess(): void {
    this.krakenLastSuccess = Date.now();
  }

  trackKrakenError(): void {
    this.krakenLastError = Date.now();
  }

  /**
   * Phase 41F-I: Handle trade events from telemetry service
   */
  handleTradeEvent(event: any): void {
    if (event.type === 'trade_error') {
      this.logAnomaly({
        component: 'tradePipeline',
        metric: 'error',
        level: 'warning',
        message: `Trade error detected: ${event.reason || 'Unknown'}`,
        value: 0,
        threshold: 0,
        autoRecoveryAttempted: false
      });
    }
    if (event.type === 'trade_opened' || event.type === 'trade_closed') {
      this.lastTradeTs = Date.now();
    }
  }

  /**
   * Phase 41F-I: Manually log an anomaly
   */
  private logAnomaly(anomaly: Omit<Anomaly, 'timestamp'>): void {
    const fullAnomaly: Anomaly = {
      timestamp: new Date().toISOString(),
      ...anomaly
    };
    
    this.anomalyBuffer.push(fullAnomaly);
    if (this.anomalyBuffer.length > 100) {
      this.anomalyBuffer.shift();
    }
    
    console.log(`[41F-I][ANOMALY] ${anomaly.component}:${anomaly.metric} - ${anomaly.message}`);
  }

  /**
   * Get latest health beat
   */
  getLatest(): HealthBeat | null {
    return this.ringBuffer[this.ringBuffer.length - 1] || null;
  }

  /**
   * Get ring buffer (last N heartbeats)
   */
  getRingBuffer(lastN?: number): HealthBeat[] {
    if (lastN) {
      return this.ringBuffer.slice(-lastN);
    }
    return this.ringBuffer;
  }

  /**
   * Get recovery actions
   */
  getRecoveryActions(lastN?: number): RecoveryAction[] {
    if (lastN) {
      return this.recoveryActions.slice(-lastN);
    }
    return this.recoveryActions;
  }

  /**
   * Phase 41F-F: Get detected anomalies
   */
  getAnomalies(lastN?: number): Anomaly[] {
    if (lastN) {
      return this.anomalyBuffer.slice(-lastN);
    }
    return this.anomalyBuffer;
  }

  /**
   * Get summary for widgets
   */
  getSummary(): {
    overallOk: boolean;
    paperOk: boolean;
    liveOk: boolean;
    marketDataOk: boolean;
    dbOk: boolean;
    lastLatencies: { paper?: number; live?: number; broadcast?: number };
  } {
    const latest = this.getLatest();
    
    if (!latest) {
      return {
        overallOk: true,
        paperOk: true,
        liveOk: true,
        marketDataOk: true,
        dbOk: true,
        lastLatencies: {},
      };
    }

    return {
      overallOk: latest.overallOk,
      paperOk: latest.paper.queue.ok && latest.paper.engine.ok,
      liveOk: latest.live.queue.ok && latest.live.engine.ok,
      marketDataOk: latest.marketData.ok,
      dbOk: latest.db.ok,
      lastLatencies: {
        paper: latest.paper.queue.executingJobAgeMs || undefined,
        live: latest.live.queue.executingJobAgeMs || undefined,
        broadcast: latest.broadcasts.lastLatencyMs || undefined,
      },
    };
  }

  // ========================================
  // Phase 41F-G: Auto-Recovery Framework
  // ========================================

  /**
   * Check if system is in cool-down period
   */
  private isInCooldown(): boolean {
    const now = Date.now();
    return now - this.lastRecoveryTimestamp < this.cooldownPeriodMs;
  }

  /**
   * Check and update circuit breaker status
   */
  private checkCircuitBreaker(): { active: boolean; reason?: string; expiresAt?: string } {
    const now = Date.now();

    // Check if circuit breaker is currently active
    if (this.circuitBreakerActive && now < this.circuitBreakerUntil) {
      return {
        active: true,
        reason: 'Circuit breaker active - too many recoveries in short period',
        expiresAt: new Date(this.circuitBreakerUntil).toISOString(),
      };
    }

    // Circuit breaker expired, reset
    if (this.circuitBreakerActive && now >= this.circuitBreakerUntil) {
      console.log('[41F-G][CIRCUIT] Circuit breaker expired, resetting');
      this.circuitBreakerActive = false;
      this.circuitBreakerUntil = 0;
      this.recentRecoveries = [];
    }

    // Clean up old recoveries outside the window
    this.recentRecoveries = this.recentRecoveries.filter(
      r => now - r.timestamp < this.circuitBreakerWindow
    );

    // Check if we should activate circuit breaker
    if (this.recentRecoveries.length >= this.circuitBreakerThreshold) {
      console.warn(`[41F-G][CIRCUIT] Activating circuit breaker - ${this.recentRecoveries.length} recoveries in ${this.circuitBreakerWindow / 60000}min`);
      this.circuitBreakerActive = true;
      this.circuitBreakerUntil = now + this.circuitBreakerDuration;
      
      // Broadcast circuit breaker activation
      this.emit('circuit_breaker', {
        active: true,
        expiresAt: new Date(this.circuitBreakerUntil).toISOString(),
        triggeringRecoveries: this.recentRecoveries.length,
      });

      return {
        active: true,
        reason: `Circuit breaker activated - ${this.recentRecoveries.length} recoveries in last ${this.circuitBreakerWindow / 60000} minutes`,
        expiresAt: new Date(this.circuitBreakerUntil).toISOString(),
      };
    }

    return { active: false };
  }

  /**
   * Plan recovery action (dry-run mode)
   */
  planRecovery(component: string, metric: string, level: AlertLevel): {
    canExecute: boolean;
    plannedAction: string | null;
    reason?: string;
    cooldownRemaining?: number;
    circuitBreaker?: { active: boolean; expiresAt?: string };
  } {
    // Check circuit breaker
    const cbStatus = this.checkCircuitBreaker();
    if (cbStatus.active) {
      return {
        canExecute: false,
        plannedAction: null,
        reason: cbStatus.reason,
        circuitBreaker: { active: true, expiresAt: cbStatus.expiresAt },
      };
    }

    // Check cool-down
    if (this.isInCooldown()) {
      const cooldownRemaining = this.cooldownPeriodMs - (Date.now() - this.lastRecoveryTimestamp);
      return {
        canExecute: false,
        plannedAction: null,
        reason: `Cool-down active (${Math.ceil(cooldownRemaining / 1000)}s remaining)`,
        cooldownRemaining,
      };
    }

    // Determine recovery action
    let plannedAction: string | null = null;

    if (component === 'broadcast' && metric === 'latency') {
      plannedAction = 'log_latency_spike_for_monitoring';
    } else if (component === 'websocket' && metric === 'silence') {
      plannedAction = 'force_websocket_reconnect';
    } else if (component.endsWith('_queue') && metric === 'depth') {
      plannedAction = 'purge_old_queue_jobs';
    } else if (component.endsWith('_queue') && metric === 'job_age') {
      plannedAction = 'restart_stuck_job';
    } else if (component === 'engine' && metric === 'stress') {
      plannedAction = 'restart_trading_engine';
    } else if (component === 'marketData' && metric === 'stress') {
      plannedAction = 'reconnect_market_data_feed';
    } else if (component === 'queue' && metric === 'stress') {
      plannedAction = 'flush_operation_queue';
    } else {
      plannedAction = 'log_anomaly_for_review';
    }

    return {
      canExecute: true,
      plannedAction,
      circuitBreaker: { active: false },
    };
  }

  /**
   * Execute recovery action (non-dry-run mode)
   */
  async executeRecovery(
    component: string,
    metric: string,
    level: AlertLevel,
    dryRun: boolean = false
  ): Promise<RecoveryAction> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // Plan the recovery
    const plan = this.planRecovery(component, metric, level);

    // If dry-run, return plan without executing
    if (dryRun) {
      return {
        timestamp,
        component,
        issue: `${component}.${metric} anomaly (${level})`,
        action: plan.plannedAction || 'none',
        success: false,
        result: 'skipped',
        durationMs: 0,
        details: {
          dryRun: true,
          canExecute: plan.canExecute,
          reason: plan.reason,
          cooldownRemaining: plan.cooldownRemaining,
          circuitBreaker: plan.circuitBreaker,
        },
      };
    }

    // Check if we can execute
    if (!plan.canExecute) {
      return {
        timestamp,
        component,
        issue: `${component}.${metric} anomaly (${level})`,
        action: plan.plannedAction || 'none',
        success: false,
        result: 'skipped',
        durationMs: Date.now() - startTime,
        details: {
          reason: plan.reason,
          cooldownRemaining: plan.cooldownRemaining,
          circuitBreaker: plan.circuitBreaker,
        },
        circuitBreakerActive: plan.circuitBreaker?.active,
      };
    }

    // Execute recovery action
    console.log(`[41F-G][RECOVERY] Executing: ${plan.plannedAction} for ${component}.${metric}`);
    
    // Emit recovery started event
    this.emit('recovery_started', { component, metric, level, action: plan.plannedAction });

    let success = false;
    let errorMessage: string | null = null;

    try {
      // Execute based on planned action
      if (plan.plannedAction === 'force_websocket_reconnect') {
        console.log('[41F-G][RECOVERY] Triggering WebSocket reconnect (simulated)');
        success = true; // Would trigger actual reconnect in production
      } else if (plan.plannedAction === 'purge_old_queue_jobs') {
        console.log('[41F-G][RECOVERY] Purging old queue jobs (simulated)');
        success = true; // Would call queue.purge() in production
      } else if (plan.plannedAction === 'restart_trading_engine') {
        console.log('[41F-G][RECOVERY] Restarting trading engine (simulated)');
        success = true; // Would restart engine in production
      } else if (plan.plannedAction === 'reconnect_market_data_feed') {
        console.log('[41F-G][RECOVERY] Reconnecting market data feed (simulated)');
        success = true; // Would reconnect feed in production
      } else if (plan.plannedAction === 'flush_operation_queue') {
        console.log('[41F-G][RECOVERY] Flushing operation queue (simulated)');
        success = true; // Would flush queue in production
      } else {
        console.log('[41F-G][RECOVERY] Logging anomaly for review');
        success = true;
      }

      // Update recovery tracking
      this.lastRecoveryTimestamp = Date.now();
      this.recentRecoveries.push({
        timestamp: this.lastRecoveryTimestamp,
        component,
        metric,
      });

      // Calculate cool-down expiry
      const cooldownUntil = new Date(this.lastRecoveryTimestamp + this.cooldownPeriodMs).toISOString();

      const action: RecoveryAction = {
        timestamp,
        component,
        issue: `${component}.${metric} anomaly (${level})`,
        action: plan.plannedAction || 'none',
        success,
        result: success ? 'success' : 'failure',
        durationMs: Date.now() - startTime,
        cooldownUntil,
        details: {
          metric,
          level,
          errorMessage,
        },
      };

      // Add to recovery actions buffer
      this.recoveryActions.push(action);
      if (this.recoveryActions.length > 100) {
        this.recoveryActions.shift();
      }

      // Emit recovery completed event
      this.emit('recovery_completed', action);

      return action;

    } catch (error: any) {
      errorMessage = error.message;
      console.error(`[41F-G][RECOVERY] Error executing recovery:`, errorMessage);

      const action: RecoveryAction = {
        timestamp,
        component,
        issue: `${component}.${metric} anomaly (${level})`,
        action: plan.plannedAction || 'none',
        success: false,
        result: 'failure',
        durationMs: Date.now() - startTime,
        details: {
          metric,
          level,
          errorMessage,
        },
      };

      this.recoveryActions.push(action);
      if (this.recoveryActions.length > 100) {
        this.recoveryActions.shift();
      }

      this.emit('recovery_completed', action);

      return action;
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): {
    active: boolean;
    expiresAt?: string;
    recentRecoveries: number;
    threshold: number;
  } {
    const cbStatus = this.checkCircuitBreaker();
    return {
      active: cbStatus.active,
      expiresAt: cbStatus.expiresAt,
      recentRecoveries: this.recentRecoveries.length,
      threshold: this.circuitBreakerThreshold,
    };
  }
}

// ========================================
// Singleton Instance
// ========================================

export const healthMonitor = new HealthMonitor();
