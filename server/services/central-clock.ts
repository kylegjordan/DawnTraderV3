/**
 * 🔒 LOCKED MODULE — DO NOT MODIFY
 * Directive: 8.8.4-A4.R10R-4 (Core System Hardening)
 * Owner: Dawn Trader Core
 * Summary: This module is production-locked. Changes require a formal directive.
 * 
 * Previous: Directive 8.8.4-A3.R7: Central Clock Service
 * 
 * Single shared timing source for all engine subsystems.
 * Emits 1-second ticks to synchronize time-dependent modules.
 * 
 * Subscribers:
 * - FX5 Scanner: Runs every 30s on tick alignment
 * - RTB Refresh: Checks every tick for signals exceeding 30s TTL
 * - TCL: Checks elapsed time since last promotion
 * - Monitoring: Ensures drift < 100ms
 */

import { EventEmitter } from 'events';

export interface ClockTick {
  timestamp: number;
  tickNumber: number;
  drift: number;
}

interface ClockHealth {
  isRunning: boolean;
  tickNumber: number;
  lastTickTime: number;
  averageDrift: number;
  maxDrift: number;
  subscribers: string[];
}

class CentralClockService extends EventEmitter {
  private intervalId: NodeJS.Timeout | null = null;
  private tickNumber: number = 0;
  private lastTickTime: number = 0;
  private driftHistory: number[] = [];
  private readonly MAX_DRIFT_HISTORY = 60;
  private readonly INTERVAL_MS = 1000;
  private subscribers: Map<string, (tick: ClockTick) => void> = new Map();
  private isRunning: boolean = false;

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Start the central clock
   * R9.3.HF-4: Use intervalId check instead of isRunning for reliability
   */
  start(): void {
    // R9.3.HF-4: Check intervalId directly - more reliable than isRunning flag
    if (this.intervalId) {
      console.log('[CentralClock] Already running (intervalId exists)');
      return;
    }

    this.isRunning = true;
    this.tickNumber = 0;
    this.lastTickTime = Date.now();
    this.driftHistory = [];

    console.log('[CentralClock][R9.3.HF-4] Starting central clock service (interval=1s)');

    this.intervalId = setInterval(() => {
      this.emitTick();
    }, this.INTERVAL_MS);

    console.log(`[CentralClock][R9.3.HF-4] ✅ Started successfully (intervalId=${this.intervalId ? 'set' : 'null'})`);
  }

  /**
   * Stop the central clock
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('[CentralClock] Stopped');
  }

  /**
   * Emit a tick to all subscribers
   */
  private emitTick(): void {
    const now = Date.now();
    this.tickNumber++;

    const expectedTime = this.lastTickTime + this.INTERVAL_MS;
    const drift = now - expectedTime;
    this.lastTickTime = now;

    this.driftHistory.push(Math.abs(drift));
    if (this.driftHistory.length > this.MAX_DRIFT_HISTORY) {
      this.driftHistory.shift();
    }

    const tick: ClockTick = {
      timestamp: now,
      tickNumber: this.tickNumber,
      drift
    };

    if (Math.abs(drift) > 100) {
      console.warn(`[CentralClock][DRIFT_WARNING] tickNumber=${this.tickNumber} drift=${drift}ms (threshold=100ms)`);
    }

    if (this.tickNumber % 60 === 0) {
      const avgDrift = this.driftHistory.reduce((a, b) => a + b, 0) / this.driftHistory.length;
      console.log(`[CentralClock][HEALTH] tickNumber=${this.tickNumber} avgDrift=${avgDrift.toFixed(1)}ms subscribers=${this.subscribers.size}`);
    }

    this.emit('tick', tick);
  }

  /**
   * Subscribe a module to clock ticks
   * R9.3.HF-4: Auto-start clock if not running when subscribed
   */
  subscribe(moduleName: string, handler: (tick: ClockTick) => void): void {
    if (this.subscribers.has(moduleName)) {
      console.log(`[CentralClock] Module ${moduleName} already subscribed, updating handler`);
      this.off('tick', this.subscribers.get(moduleName)!);
    }

    this.subscribers.set(moduleName, handler);
    this.on('tick', handler);
    console.log(`[CentralClock][SUBSCRIBE] module=${moduleName} totalSubscribers=${this.subscribers.size}`);

    // R9.3.HF-4: Failsafe - ensure clock is always running when subscribed
    if (!this.intervalId) {
      console.log(`[CentralClock][R9.3.HF-4] Auto-starting clock (triggered by ${moduleName} subscription)`);
      this.start();
    }
  }

  /**
   * Unsubscribe a module from clock ticks
   */
  unsubscribe(moduleName: string): void {
    const handler = this.subscribers.get(moduleName);
    if (handler) {
      this.off('tick', handler);
      this.subscribers.delete(moduleName);
      console.log(`[CentralClock][UNSUBSCRIBE] module=${moduleName} remainingSubscribers=${this.subscribers.size}`);
    }
  }

  /**
   * Get current tick number (useful for alignment)
   */
  getTickNumber(): number {
    return this.tickNumber;
  }

  /**
   * Check if current tick aligns with interval (e.g., every 30 ticks for 30s)
   */
  isAlignedWithInterval(intervalSeconds: number): boolean {
    return this.tickNumber > 0 && this.tickNumber % intervalSeconds === 0;
  }

  /**
   * Get clock health status
   */
  getHealth(): ClockHealth {
    const avgDrift = this.driftHistory.length > 0
      ? this.driftHistory.reduce((a, b) => a + b, 0) / this.driftHistory.length
      : 0;
    const maxDrift = this.driftHistory.length > 0
      ? Math.max(...this.driftHistory)
      : 0;

    return {
      isRunning: this.isRunning,
      tickNumber: this.tickNumber,
      lastTickTime: this.lastTickTime,
      averageDrift: avgDrift,
      maxDrift: maxDrift,
      subscribers: Array.from(this.subscribers.keys())
    };
  }

  /**
   * Check if clock is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
}

export const centralClock = new CentralClockService();
export type { ClockTick, ClockHealth };
