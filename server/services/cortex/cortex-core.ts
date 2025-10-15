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
    } catch (error) {
      console.error('[CortexCore] ❌ Initialization failed:', error);
      this.enabled = false;
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

  set(key: string, value: any, ttl?: number): void {
    if (!this.enabled) return;

    const effectiveTtl = ttl || this.config?.memory.short_term_ttl || 300;
    this.memory.memory[key] = {
      value,
      ttl: effectiveTtl,
      expires_at: Date.now() + (effectiveTtl * 1000)
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
