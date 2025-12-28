/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L14
 * ══════════════════════════════════════════════════════════════════════════════
 * Experience Buffer (EB) Service
 * 
 * Purpose: Stores (state, action, reward, next_state) tuples for offline 
 * reinforcement learning. Used by the ML microservice for incremental Q-updates.
 * 
 * Max buffer size: 10,000 records (FIFO)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import { RegimeId } from './market-profiler';
import * as fs from 'fs';
import * as path from 'path';

export interface StrategyWeights {
  [strategy: string]: number;
}

export interface ExperienceState {
  regime: RegimeId;
  strategy_weights: StrategyWeights;
  volatility?: number;
  trend?: number;
  volume_z?: number;
}

export interface ExperienceAction {
  allocations: StrategyWeights;
}

export interface ExperienceTuple {
  state: ExperienceState;
  action: ExperienceAction;
  reward: number;
  next_state: ExperienceState;
  timestamp: number;
  id: string;
}

const LOGS_DIR = path.join(process.cwd(), 'logs', 'experience_buffer');
const MAX_BUFFER_SIZE = 10000;

class ExperienceBufferService extends EventEmitter {
  private buffer: ExperienceTuple[] = [];
  private isRunning = false;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily

  constructor() {
    super();
    this.ensureLogsDir();
    this.loadBuffer();
  }

  private ensureLogsDir(): void {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  }

  private generateId(): string {
    return `exp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[L14][EB] Starting Experience Buffer');

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL_MS);

    console.log('[L14][EB] INIT_OK - Experience Buffer started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.persistBuffer();
    console.log('[L14][EB] Experience Buffer stopped');
  }

  addExperience(
    state: ExperienceState,
    action: ExperienceAction,
    reward: number,
    nextState: ExperienceState
  ): ExperienceTuple {
    const experience: ExperienceTuple = {
      state,
      action,
      reward,
      next_state: nextState,
      timestamp: Date.now(),
      id: this.generateId()
    };

    this.buffer.push(experience);

    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.shift();
    }

    this.emit('experienceAdded', experience);
    return experience;
  }

  getBuffer(): ExperienceTuple[] {
    return [...this.buffer];
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  getRecentExperiences(count: number = 100): ExperienceTuple[] {
    return this.buffer.slice(-count);
  }

  getBatch(batchSize: number = 32): ExperienceTuple[] {
    if (this.buffer.length <= batchSize) {
      return [...this.buffer];
    }

    const batch: ExperienceTuple[] = [];
    const indices = new Set<number>();

    while (indices.size < batchSize) {
      indices.add(Math.floor(Math.random() * this.buffer.length));
    }

    for (const index of indices) {
      batch.push(this.buffer[index]);
    }

    return batch;
  }

  getExperiencesByRegime(regime: RegimeId): ExperienceTuple[] {
    return this.buffer.filter(e => e.state.regime === regime);
  }

  getTotalReward(): number {
    return this.buffer.reduce((sum, e) => sum + e.reward, 0);
  }

  getAverageReward(): number {
    if (this.buffer.length === 0) return 0;
    return this.getTotalReward() / this.buffer.length;
  }

  private cleanup(): void {
    console.log('[L14][EB] Running daily cleanup');

    const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const beforeCount = this.buffer.length;
    this.buffer = this.buffer.filter(e => e.timestamp > cutoffTime);
    const removedCount = beforeCount - this.buffer.length;

    if (removedCount > 0) {
      console.log(`[L14][EB] Removed ${removedCount} stale experiences`);
    }

    this.persistBuffer();
  }

  private loadBuffer(): void {
    const bufferFile = path.join(LOGS_DIR, 'experience_buffer.json');
    if (fs.existsSync(bufferFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(bufferFile, 'utf-8'));
        this.buffer = data.experiences || [];
        console.log(`[L14][EB] Loaded ${this.buffer.length} experiences`);
      } catch (error) {
        console.error('[L14][EB] Failed to load buffer:', error);
      }
    }
  }

  private persistBuffer(): void {
    const bufferFile = path.join(LOGS_DIR, 'experience_buffer.json');
    try {
      const data = {
        experiences: this.buffer,
        size: this.buffer.length,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(bufferFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[L14][EB] Failed to persist buffer:', error);
    }
  }

  exportForML(): object {
    return {
      experiences: this.buffer.map(e => ({
        state: e.state,
        action: e.action,
        reward: e.reward,
        next_state: e.next_state,
        timestamp: e.timestamp
      })),
      stats: {
        size: this.buffer.length,
        totalReward: this.getTotalReward(),
        averageReward: this.getAverageReward()
      }
    };
  }

  getStatus(): object {
    return {
      isRunning: this.isRunning,
      bufferSize: this.buffer.length,
      maxSize: MAX_BUFFER_SIZE,
      totalReward: this.getTotalReward(),
      averageReward: this.getAverageReward(),
      oldestExperience: this.buffer.length > 0 ? new Date(this.buffer[0].timestamp).toISOString() : null,
      newestExperience: this.buffer.length > 0 ? new Date(this.buffer[this.buffer.length - 1].timestamp).toISOString() : null
    };
  }
}

let experienceBufferInstance: ExperienceBufferService | null = null;

export function getExperienceBuffer(): ExperienceBufferService {
  if (!experienceBufferInstance) {
    experienceBufferInstance = new ExperienceBufferService();
  }
  return experienceBufferInstance;
}

export { ExperienceBufferService };
