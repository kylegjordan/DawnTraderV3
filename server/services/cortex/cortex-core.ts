import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';

interface CortexConfig {
  memory: {
    short_term_ttl: number;
    long_term_ttl: number;
    vector_dimensions: number;
    embedding_model: string;
  };
  registry: {
    active_modules: string[];
  };
  orchestration: {
    mode: string;
    refresh_interval: number;
  };
}

interface CortexMemory {
  bob_snapshot: any;
  ui_snapshot: any;
  last_sync: string | null;
  memory: Record<string, {
    value: any;
    ttl: number;
    expires_at: number;
  }>;
}

interface CortexStatus {
  memory_size: number;
  modules_synced: number;
  last_refresh: string | null;
  active_modules: string[];
  health: 'healthy' | 'degraded' | 'offline';
}

// Phase 8.4 Addendum C: Conversation Snapshot for CIE
interface ConversationSnapshot {
  userId: string;
  currentTopic: string | null;
  lastIntent: string | null;
  lastIntentTimestamp: number;
  activePhase: string;
  expiresAt: number;
}

interface ConversationContext {
  topic: string | null;
  lastIntent: string | null;
  minutesSinceLastIntent: number;
  activePhase: string;
}

class CortexCore {
  private config: CortexConfig | null = null;
  private memory: CortexMemory;
  private configPath: string;
  private memoryPath: string;
  private registryPath: string;
  private syncInterval: NodeJS.Timeout | null = null;
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.CORTEX_ENABLED !== 'false';
    this.configPath = path.join(process.cwd(), 'server/services/cortex/cortex-config.yaml');
    this.memoryPath = process.env.CORTEX_MEMORY_PATH || path.join(process.cwd(), 'server/services/cortex/cortex-memory.json');
    this.registryPath = path.join(process.cwd(), 'server/services/cortex/cortex-registry.json');
    
    this.memory = {
      bob_snapshot: null,
      ui_snapshot: null,
      last_sync: null,
      memory: {}
    };

    console.log(`[CortexCore] Constructor called - ENABLED: ${this.enabled}`);
  }

  async initialize(): Promise<void> {
    if (!this.enabled) {
      console.log('[CortexCore] ⚠️ Disabled via CORTEX_ENABLED=false');
      return;
    }

    try {
      // Load config
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      this.config = yaml.parse(configContent);
      
      // Load or initialize memory
      try {
        const memoryContent = await fs.readFile(this.memoryPath, 'utf-8');
        this.memory = JSON.parse(memoryContent);
      } catch {
        // File doesn't exist or invalid, use default
        await this.saveMemory();
      }

      // Clean expired entries
      this.cleanExpired();

      console.log('[CortexCore] ✅ Initialized successfully');
      console.log(`[CortexCore] Active modules: ${this.config?.registry.active_modules.join(', ')}`);
      console.log(`[CortexCore] Memory TTL: ${this.config?.memory.short_term_ttl}s (short) / ${this.config?.memory.long_term_ttl}s (long)`);
      
      // Phase 8.5 Addendum H: Setup context refresh event listener
      await this.setupContextRefreshListener();
    } catch (error) {
      console.error('[CortexCore] ❌ Initialization failed:', error);
      this.enabled = false;
    }
  }

  /**
   * Phase 8.5 Addendum H: Setup event listener for context refresh
   */
  private async setupContextRefreshListener(): Promise<void> {
    try {
      const { contextRefreshCoordinator } = await import('../context-refresh-coordinator');
      
      contextRefreshCoordinator.on('contextRefreshed', (event: any) => {
        console.log(`[CortexSync] Context refreshed event received (source=${event.source}, userId=${event.userId}, mode=${event.mode})`);
        console.log(`[CortexSync] Portfolio: $${event.portfolioBalance}, Active Strategies: ${event.activeStrategiesCount}, Discrepancies: ${event.discrepanciesFound}`);
        
        // Note: Cortex cache is already updated by ContextRefreshCoordinator.updateCortex()
        // This listener is for monitoring and potential future actions
      });
      
      console.log('[CortexCore] ✅ Context refresh event listener registered');
    } catch (error) {
      console.error('[CortexCore] ⚠️  Failed to setup context refresh listener:', error);
    }
  }

  async startSync(fetchBobSnapshot: () => Promise<any>, fetchUISnapshot: () => Promise<any>): Promise<void> {
    if (!this.enabled || !this.config) return;

    const interval = this.config.orchestration.refresh_interval * 1000;

    // Initial sync
    await this.syncSnapshots(fetchBobSnapshot, fetchUISnapshot);

    // Start periodic sync
    this.syncInterval = setInterval(async () => {
      await this.syncSnapshots(fetchBobSnapshot, fetchUISnapshot);
    }, interval);

    console.log(`[CortexCore] 🔄 Sync scheduler started (${this.config.orchestration.refresh_interval}s interval)`);
  }

  async syncSnapshots(fetchBobSnapshot: () => Promise<any>, fetchUISnapshot: () => Promise<any>): Promise<void> {
    if (!this.enabled) return;

    try {
      const [bobSnapshot, uiSnapshot] = await Promise.all([
        fetchBobSnapshot(),
        fetchUISnapshot()
      ]);

      this.memory.bob_snapshot = bobSnapshot;
      this.memory.ui_snapshot = uiSnapshot;
      this.memory.last_sync = new Date().toISOString();

      await this.saveMemory();
      console.log('[CortexCore] 📸 Snapshots synced successfully');
      
      // Phase 8.3: Track scheduler run for health monitoring
      try {
        const { systemHealthMonitor } = await import('../system-health-monitor');
        systemHealthMonitor.updateSchedulerRun('cortexSync');
      } catch (err) {
        // Health monitor not available, continue
      }
    } catch (error) {
      console.error('[CortexCore] ❌ Sync failed:', error);
    }
  }

  async stopSync(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[CortexCore] 🛑 Sync scheduler stopped');
    }
  }

  set(key: string, value: any, ttl?: number, provenanceMeta?: { traceId?: string; mode?: string; sourceTable?: string }): void {
    if (!this.enabled) return;

    const effectiveTtl = ttl || this.config?.memory.short_term_ttl || 300;
    
    // Phase 8.6.4: Embed provenance metadata in Cortex entries
    this.memory.memory[key] = {
      value,
      ttl: effectiveTtl,
      expires_at: Date.now() + (effectiveTtl * 1000),
      // Provenance metadata for traceability
      ...(provenanceMeta?.traceId && { traceId: provenanceMeta.traceId }),
      ...(provenanceMeta?.mode && { mode: provenanceMeta.mode }),
      ...(provenanceMeta?.sourceTable && { sourceTable: provenanceMeta.sourceTable }),
    };
  }

  get(key: string): any | null {
    if (!this.enabled) return null;

    const entry = this.memory.memory[key];
    if (!entry) return null;

    if (Date.now() > entry.expires_at) {
      delete this.memory.memory[key];
      return null;
    }

    return entry.value;
  }

  getSnapshot(type: 'bob' | 'ui'): any | null {
    if (!this.enabled) return null;
    return type === 'bob' ? this.memory.bob_snapshot : this.memory.ui_snapshot;
  }

  async flush(): Promise<void> {
    if (!this.enabled) return;

    this.memory.memory = {};
    await this.saveMemory();
    console.log('[CortexCore] 🧹 Memory flushed');
  }

  async forceSync(fetchBobSnapshot: () => Promise<any>, fetchUISnapshot: () => Promise<any>): Promise<void> {
    await this.syncSnapshots(fetchBobSnapshot, fetchUISnapshot);
    console.log('[CortexCore] ⚡ Force sync completed');
  }

  getStatus(): CortexStatus {
    if (!this.enabled) {
      return {
        memory_size: 0,
        modules_synced: 0,
        last_refresh: null,
        active_modules: [],
        health: 'offline'
      };
    }

    const memorySize = Object.keys(this.memory.memory).length;
    const modulesSynced = this.config?.registry.active_modules.length || 0;
    const lastRefresh = this.memory.last_sync;
    const activeModules = this.config?.registry.active_modules || [];

    let health: 'healthy' | 'degraded' | 'offline' = 'healthy';
    if (!lastRefresh) {
      health = 'degraded';
    } else {
      const timeSinceSync = Date.now() - new Date(lastRefresh).getTime();
      const maxInterval = (this.config?.orchestration.refresh_interval || 30) * 2000; // 2x interval
      if (timeSinceSync > maxInterval) {
        health = 'degraded';
      }
    }

    return {
      memory_size: memorySize,
      modules_synced: modulesSynced,
      last_refresh: lastRefresh,
      active_modules: activeModules,
      health
    };
  }

  /**
   * Phase 8.4 Addendum C: Store conversation snapshot
   * Expires after 5 minutes of inactivity
   */
  setConversationSnapshot(
    userId: string,
    topic: string | null,
    intent: string | null,
    phase: string = 'Phase 8.4'
  ): void {
    if (!this.enabled) return;

    const CONVERSATION_TTL = 300; // 5 minutes
    const snapshot: ConversationSnapshot = {
      userId,
      currentTopic: topic,
      lastIntent: intent,
      lastIntentTimestamp: Date.now(),
      activePhase: phase,
      expiresAt: Date.now() + (CONVERSATION_TTL * 1000),
    };

    this.set(`conversation:${userId}`, snapshot, CONVERSATION_TTL);
    console.log(
      `[CortexCore] 💭 Conversation snapshot stored for user ${userId}: topic="${topic}", intent="${intent}"`
    );
  }

  /**
   * Phase 8.4 Addendum C: Get conversation context
   * Returns null if expired or not found
   */
  getConversationContext(userId: string): ConversationContext | null {
    if (!this.enabled) return null;

    const snapshot = this.get(`conversation:${userId}`) as ConversationSnapshot | null;
    if (!snapshot) return null;

    const minutesSinceLastIntent = Math.floor(
      (Date.now() - snapshot.lastIntentTimestamp) / 60000
    );

    return {
      topic: snapshot.currentTopic,
      lastIntent: snapshot.lastIntent,
      minutesSinceLastIntent,
      activePhase: snapshot.activePhase,
    };
  }

  /**
   * Phase 8.4 Addendum C: Clear conversation snapshot
   */
  clearConversationSnapshot(userId: string): void {
    if (!this.enabled) return;

    delete this.memory.memory[`conversation:${userId}`];
    console.log(`[CortexCore] 🧹 Conversation snapshot cleared for user ${userId}`);
  }

  /**
   * Phase 8.6.5 Addendum: Delete specific cache entry
   * Used for invalidating config caches after updates
   */
  delete(key: string): void {
    if (!this.enabled) return;

    if (this.memory.memory[key]) {
      delete this.memory.memory[key];
      console.log(`[CortexCore] 🗑️ Deleted cache entry: ${key}`);
    }
  }

  /**
   * Phase 8.6.5 Addendum: Delete multiple cache entries matching a pattern
   */
  deletePattern(pattern: string): void {
    if (!this.enabled) return;

    let deleted = 0;
    for (const key of Object.keys(this.memory.memory)) {
      if (key.includes(pattern)) {
        delete this.memory.memory[key];
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`[CortexCore] 🗑️ Deleted ${deleted} cache entries matching pattern: ${pattern}`);
    }
  }

  private cleanExpired(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of Object.entries(this.memory.memory)) {
      if (now > entry.expires_at) {
        delete this.memory.memory[key];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[CortexCore] 🧹 Cleaned ${cleaned} expired entries`);
    }
  }

  private async saveMemory(): Promise<void> {
    try {
      await fs.writeFile(this.memoryPath, JSON.stringify(this.memory, null, 2), 'utf-8');
    } catch (error) {
      console.error('[CortexCore] ❌ Failed to save memory:', error);
    }
  }
}

export const cortexCore = new CortexCore();
