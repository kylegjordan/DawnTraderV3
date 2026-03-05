/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L11
 * ══════════════════════════════════════════════════════════════════════════════
 * Strategy Drift Detection & Auto-Recalibration Service
 * 
 * Purpose: Continuously monitors calibration parameter changes (α, β, σ) and
 * triggers automatic retraining when drift exceeds thresholds.
 * 
 * DriftScore = w₁|βₛ - βₛ₋₁| + w₂|αₛ - αₛ₋₁| + w₃(σₛ / σ_baseline)
 * 
 * Thresholds:
 * - DriftScore > 0.15 → Warning (flag as drifting)
 * - DriftScore > 0.25 → Trigger auto-recalibration
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { loadFullCalibration, type FullCalibration, type CalibrationCoefficients } from '../utils/calibration';
import { contextBridge } from './context-bridge';
import { getRetrainingFreezeController } from './retraining-freeze-controller.js';

export interface DriftSnapshot {
  timestamp: string;
  strategy: string;
  alpha: number;
  beta: number;
  sigma: number;
}

export interface StrategyDriftStatus {
  strategy: string;
  score: number;
  status: 'stable' | 'drifting' | 'recalibrating';
  lastCheck: string;
  deltaAlpha: number;
  deltaBeta: number;
  deltaSigma: number;
  recalibrationPending: boolean;
}

export interface DriftConfig {
  checkIntervalMs: number;
  warningThreshold: number;
  recalibrationThreshold: number;
  historyDepth: number;
  weights: {
    w1: number; // beta weight
    w2: number; // alpha weight
    w3: number; // sigma weight
  };
}

const DEFAULT_CONFIG: DriftConfig = {
  checkIntervalMs: 15 * 60 * 1000, // 15 minutes
  warningThreshold: 0.15,
  recalibrationThreshold: 0.25,
  historyDepth: 10,
  weights: {
    w1: 0.6,
    w2: 0.2,
    w3: 0.2
  }
};

const DRIFT_HISTORY_DIR = path.join(process.cwd(), 'logs', 'drift_history');
const DRIFT_EVENTS_DIR = path.join(process.cwd(), 'logs', 'drift_events');

export class DriftDetectorService extends EventEmitter {
  private config: DriftConfig;
  private strategyHistory: Map<string, DriftSnapshot[]> = new Map();
  private strategyStatus: Map<string, StrategyDriftStatus> = new Map();
  private baselineSigma: Map<string, number> = new Map();
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private recalibrationInProgress: Set<string> = new Set();

  constructor(config: Partial<DriftConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.init();
  }

  private async init() {
    try {
      await fs.mkdir(DRIFT_HISTORY_DIR, { recursive: true });
      await fs.mkdir(DRIFT_EVENTS_DIR, { recursive: true });
      await this.loadHistoryFromDisk();
      this.baselineSigma.clear();
      console.log('[Phase14][DRIFT] Baselines reset for Phase 14 fresh start');
      console.log('[L11][DRIFT] INIT_OK - Drift detector initialized');
    } catch (error) {
      console.error('[L11][DRIFT] Init failed:', error);
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    this.checkInterval = setInterval(() => this.runDriftCheck(), this.config.checkIntervalMs);
    
    setTimeout(() => this.runDriftCheck(), 30000);
    
    console.log(`[L11][DRIFT] Started - checking every ${this.config.checkIntervalMs / 60000} min`);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    console.log('[L11][DRIFT] Stopped');
  }

  async runDriftCheck(): Promise<Map<string, StrategyDriftStatus>> {
    try {
      const calibration = await loadFullCalibration();
      const now = new Date().toISOString();
      
      for (const [strategy, coeffs] of Object.entries(calibration.strategies)) {
        const snapshot: DriftSnapshot = {
          timestamp: now,
          strategy,
          alpha: coeffs.alpha,
          beta: coeffs.beta,
          sigma: coeffs.stdError || 0
        };
        
        this.addSnapshot(strategy, snapshot);
        
        const driftStatus = this.computeDriftScore(strategy);
        this.strategyStatus.set(strategy, driftStatus);
        
        if (driftStatus.score > this.config.warningThreshold) {
          console.log(`[L11][DRIFT_WARN] ${strategy} βΔ=${driftStatus.deltaBeta.toFixed(3)} αΔ=${driftStatus.deltaAlpha.toFixed(4)} σΔ=${driftStatus.deltaSigma.toFixed(4)} score=${driftStatus.score.toFixed(2)} → ${driftStatus.status.toUpperCase()}`);
          
          await this.logDriftEvent(strategy, driftStatus);
          
          if (driftStatus.score > this.config.recalibrationThreshold && 
              !this.recalibrationInProgress.has(strategy)) {
            console.log(`[L11][DRIFT_WARN] ${strategy} score=${driftStatus.score.toFixed(2)} → AUTO-RECALIBRATE`);
            this.emit('drift_recalibrate', { strategy, driftStatus });
            this.broadcastDriftEvent('recalibrate', strategy, driftStatus);
            this.triggerRecalibration(strategy);
          } else if (driftStatus.score > this.config.warningThreshold) {
            this.emit('drift_warning', { strategy, driftStatus });
            this.broadcastDriftEvent('warning', strategy, driftStatus);
          }
        }
      }
      
      if (Object.keys(calibration.strategies).length > 0) {
        const globalSnapshot: DriftSnapshot = {
          timestamp: now,
          strategy: 'global',
          alpha: calibration.global.alpha,
          beta: calibration.global.beta,
          sigma: calibration.global.stdError || 0
        };
        this.addSnapshot('global', globalSnapshot);
        
        const globalDrift = this.computeDriftScore('global');
        this.strategyStatus.set('global', globalDrift);
      }
      
      await this.saveHistoryToDisk();
      
      return this.strategyStatus;
    } catch (error) {
      console.error('[L11][DRIFT] Check failed:', error);
      return this.strategyStatus;
    }
  }

  private addSnapshot(strategy: string, snapshot: DriftSnapshot) {
    let history = this.strategyHistory.get(strategy) || [];
    
    history.push(snapshot);
    
    if (history.length > this.config.historyDepth) {
      history = history.slice(-this.config.historyDepth);
    }
    
    this.strategyHistory.set(strategy, history);
    
    if (!this.baselineSigma.has(strategy) && snapshot.sigma > 0) {
      this.baselineSigma.set(strategy, snapshot.sigma);
    }
  }

  private computeDriftScore(strategy: string): StrategyDriftStatus {
    const history = this.strategyHistory.get(strategy) || [];
    const now = new Date().toISOString();
    
    const baseStatus: StrategyDriftStatus = {
      strategy,
      score: 0,
      status: 'stable',
      lastCheck: now,
      deltaAlpha: 0,
      deltaBeta: 0,
      deltaSigma: 0,
      recalibrationPending: this.recalibrationInProgress.has(strategy)
    };
    
    if (history.length < 2) {
      return baseStatus;
    }
    
    const current = history[history.length - 1];
    const previous = history[history.length - 2];
    
    const deltaBeta = Math.abs(current.beta - previous.beta);
    const deltaAlpha = Math.abs(current.alpha - previous.alpha);
    
    const baselineSigma = this.baselineSigma.get(strategy) || 0.01;
    const sigmaRatio = current.sigma / Math.max(baselineSigma, 0.001);
    const deltaSigma = Math.abs(sigmaRatio - 1);
    
    const { w1, w2, w3 } = this.config.weights;
    const score = w1 * deltaBeta + w2 * deltaAlpha + w3 * deltaSigma;
    
    let status: 'stable' | 'drifting' | 'recalibrating' = 'stable';
    if (this.recalibrationInProgress.has(strategy)) {
      status = 'recalibrating';
    } else if (score > this.config.warningThreshold) {
      status = 'drifting';
    }
    
    return {
      strategy,
      score,
      status,
      lastCheck: now,
      deltaAlpha,
      deltaBeta,
      deltaSigma,
      recalibrationPending: this.recalibrationInProgress.has(strategy)
    };
  }

  private broadcastDriftEvent(
    eventType: 'warning' | 'recalibrate' | 'complete',
    strategy: string,
    driftStatus: StrategyDriftStatus
  ) {
    try {
      const payload = {
        type: 'strategy_drift',
        subtype: eventType,
        data: {
          strategy,
          score: driftStatus.score,
          status: driftStatus.status,
          deltaAlpha: driftStatus.deltaAlpha,
          deltaBeta: driftStatus.deltaBeta,
          deltaSigma: driftStatus.deltaSigma,
          threshold: eventType === 'recalibrate' 
            ? this.config.recalibrationThreshold 
            : this.config.warningThreshold,
          timestamp: new Date().toISOString()
        }
      };

      contextBridge.broadcast(payload);
      console.log(`[L11][DRIFT_WS] Broadcast ${eventType} for ${strategy}`);
    } catch (error) {
      console.error('[L11][DRIFT_WS] Broadcast failed:', error);
    }
  }

  private async triggerRecalibration(strategy: string) {
    if (this.recalibrationInProgress.has(strategy)) {
      console.log(`[L11][DRIFT] Recalibration already in progress for ${strategy}`);
      return;
    }

    const freezeController = getRetrainingFreezeController();
    if (!freezeController.isRetrainingAllowed()) {
      console.log(`[L11][DRIFT] Recalibration blocked by freeze controller for ${strategy}`);
      this.emit('recalibration_frozen', { strategy, reason: 'Retraining freeze active' });
      return;
    }
    
    this.recalibrationInProgress.add(strategy);
    
    const status = this.strategyStatus.get(strategy);
    if (status) {
      status.status = 'recalibrating';
      status.recalibrationPending = true;
      this.strategyStatus.set(strategy, status);
    }
    
    try {
      const response = await fetch(`http://localhost:5001/drift/retrain/${strategy}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`[L11][RECAL_DONE] ${strategy} recalibration complete:`, result);
        this.emit('recalibration_complete', { strategy, result });
        
        const completeStatus = { 
          ...status!, 
          status: 'stable' as const,
          recalibrationPending: false,
          score: 0
        };
        await this.logDriftEvent(strategy, completeStatus, 'recalibration_complete');
        this.broadcastDriftEvent('complete', strategy, completeStatus);
      } else {
        console.error(`[L11][RECAL_FAIL] ${strategy} recalibration failed: ${response.status}`);
        this.emit('recalibration_failed', { strategy, error: response.statusText });
      }
    } catch (error) {
      console.error(`[L11][RECAL_FAIL] ${strategy} recalibration error:`, error);
      this.emit('recalibration_failed', { strategy, error });
    } finally {
      this.recalibrationInProgress.delete(strategy);
      
      const updatedStatus = this.strategyStatus.get(strategy);
      if (updatedStatus) {
        updatedStatus.recalibrationPending = false;
        if (updatedStatus.status === 'recalibrating') {
          updatedStatus.status = 'stable';
        }
        this.strategyStatus.set(strategy, updatedStatus);
      }
    }
  }

  private async logDriftEvent(
    strategy: string, 
    status: StrategyDriftStatus,
    eventType: string = 'drift_detected'
  ) {
    try {
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const logFile = path.join(DRIFT_EVENTS_DIR, `${date}.log`);
      
      const entry = {
        timestamp: new Date().toISOString(),
        eventType,
        strategy,
        score: status.score,
        status: status.status,
        deltaAlpha: status.deltaAlpha,
        deltaBeta: status.deltaBeta,
        deltaSigma: status.deltaSigma
      };
      
      await fs.appendFile(logFile, JSON.stringify(entry) + '\n');
    } catch (error) {
      console.error('[L11][DRIFT] Log event failed:', error);
    }
  }

  private async saveHistoryToDisk() {
    try {
      const historyFile = path.join(DRIFT_HISTORY_DIR, 'strategy_history.json');
      const data: Record<string, DriftSnapshot[]> = {};
      
      for (const [strategy, history] of this.strategyHistory.entries()) {
        data[strategy] = history;
      }
      
      await fs.writeFile(historyFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[L11][DRIFT] Save history failed:', error);
    }
  }

  private async loadHistoryFromDisk() {
    try {
      const historyFile = path.join(DRIFT_HISTORY_DIR, 'strategy_history.json');
      const content = await fs.readFile(historyFile, 'utf-8');
      const data = JSON.parse(content) as Record<string, DriftSnapshot[]>;
      
      for (const [strategy, history] of Object.entries(data)) {
        this.strategyHistory.set(strategy, history);
        
        if (history.length > 0) {
          const firstSigma = history[0].sigma;
          if (firstSigma > 0) {
            this.baselineSigma.set(strategy, firstSigma);
          }
        }
      }
      
      console.log(`[L11][DRIFT] Loaded history for ${this.strategyHistory.size} strategies`);
    } catch (error) {
    }
  }

  getStatus(): Record<string, StrategyDriftStatus> {
    const result: Record<string, StrategyDriftStatus> = {};
    for (const [strategy, status] of this.strategyStatus.entries()) {
      result[strategy] = status;
    }
    return result;
  }

  getStrategyStatus(strategy: string): StrategyDriftStatus | null {
    return this.strategyStatus.get(strategy) || null;
  }

  getHistory(strategy: string): DriftSnapshot[] {
    return this.strategyHistory.get(strategy) || [];
  }

  isRecalibrating(strategy: string): boolean {
    return this.recalibrationInProgress.has(strategy);
  }

  async forceRecalibration(strategy: string): Promise<boolean> {
    if (this.recalibrationInProgress.has(strategy)) {
      return false;
    }
    
    console.log(`[L11][DRIFT] Manual recalibration triggered for ${strategy}`);
    await this.triggerRecalibration(strategy);
    return true;
  }

  getConfig(): DriftConfig {
    return { ...this.config };
  }
}

let driftDetectorInstance: DriftDetectorService | null = null;

export function getDriftDetector(): DriftDetectorService {
  if (!driftDetectorInstance) {
    driftDetectorInstance = new DriftDetectorService();
  }
  return driftDetectorInstance;
}

export function startDriftDetector(): void {
  getDriftDetector().start();
}

export function stopDriftDetector(): void {
  if (driftDetectorInstance) {
    driftDetectorInstance.stop();
  }
}
