/**
 * Phase 27.F.14.MICRO: Import types for engine management
 */
import type { PaperExecutionEngine } from './paper-execution-engine';
import type { MicroExecutionService } from './micro-execution-service';

// P19-B-RENAME Wave-1 (rule 18): the Phase-8.8.3-B9 `PaperExecutionServiceLegacy`
// runtime tombstone was removed — the legacy service it guarded against has not
// existed anywhere in the codebase for many phases (global never set by anything).

/**
 * Phase 27.F.15.B.4: ModeRegistry - Production Telemetry Layer
 * 
 * Global real-time telemetry registry for paper and live trading modes.
 * Provides runtime tracking, status updates, and WebSocket broadcast integration.
 */

export interface ModeStatus {
  engineStatus: 'stopped' | 'starting' | 'running' | 'paused' | 'error';
  riskSummary: Record<string, any>;
  alerts: number;
  trades: number;
  lastUpdate: Date;
}

export interface ModeRegistryType {
  paper: ModeStatus;
  live: ModeStatus;
}

export const ModeRegistry: ModeRegistryType = {
  paper: { 
    engineStatus: 'stopped', 
    riskSummary: {}, 
    alerts: 0,
    trades: 0,
    lastUpdate: new Date()
  },
  live: { 
    engineStatus: 'stopped', 
    riskSummary: {}, 
    alerts: 0,
    trades: 0,
    lastUpdate: new Date()
  },
};

/**
 * Phase 27.F.14.MICRO: Engine Instance Registry
 * Stores global engine instances per mode
 */
const engineInstances: Map<string, PaperExecutionEngine | null> = new Map();
const microExecutionInstances: Map<string, MicroExecutionService | null> = new Map();

/**
 * Register a paper execution engine for a mode
 */
export function registerEngine(mode: 'live' | 'paper', engine: PaperExecutionEngine): void {
  engineInstances.set(mode, engine);
  console.log(`[ModeRegistry] Registered ${mode} execution engine`);
}

/**
 * Get the registered engine for a mode
 */
export function getEngine(mode: 'live' | 'paper'): PaperExecutionEngine | null {
  return engineInstances.get(mode) || null;
}

/**
 * Register a micro-execution service for a mode
 */
export function registerMicroService(mode: 'live' | 'paper', service: MicroExecutionService): void {
  microExecutionInstances.set(mode, service);
  console.log(`[ModeRegistry] Registered ${mode} micro-execution service`);
}

/**
 * Get the registered micro-execution service for a mode
 */
export function getMicroService(mode: 'live' | 'paper'): MicroExecutionService | null {
  return microExecutionInstances.get(mode) || null;
}

/**
 * Update mode registry status with WebSocket broadcast
 * Phase 27.F.15.B.4: Production telemetry integration
 */
export async function updateModeStatus(
  mode: 'live' | 'paper',
  data: Partial<ModeStatus>
): Promise<void> {
  ModeRegistry[mode] = {
    ...ModeRegistry[mode],
    ...data,
    lastUpdate: new Date()
  };

  console.log(`[Phase-27.F.15.B.4][Telemetry][${mode}] Updated mode status:`, JSON.stringify(data));

  try {
    const { contextBridge } = await import('./context-bridge');
    await contextBridge.broadcast({
      type: 'mode_status_updated',
      payload: { mode, ...ModeRegistry[mode] },
      mode
    });
    console.log(`[Phase-27.F.15.B.4][Telemetry][${mode}] Broadcast sent successfully`);
  } catch (error: any) {
    console.error(`[Phase-27.F.15.B.4][Telemetry][${mode}] Broadcast failed:`, error.message);
  }
}

/**
 * Get current status for a mode
 */
export function getModeStatus(mode: 'live' | 'paper'): ModeStatus {
  return ModeRegistry[mode];
}

/**
 * Get status for all modes
 */
export function getAllModeStatus(): ModeRegistryType {
  return ModeRegistry;
}

/**
 * Increment trade count for a mode
 */
export async function incrementTradeCount(mode: 'live' | 'paper'): Promise<void> {
  await updateModeStatus(mode, {
    trades: ModeRegistry[mode].trades + 1
  });
}

/**
 * Increment alert count for a mode
 */
export async function incrementAlertCount(mode: 'live' | 'paper'): Promise<void> {
  await updateModeStatus(mode, {
    alerts: ModeRegistry[mode].alerts + 1
  });
}

/**
 * Reset mode status (typically on engine start)
 */
export async function resetModeStatus(mode: 'live' | 'paper'): Promise<void> {
  await updateModeStatus(mode, {
    engineStatus: 'stopped',
    riskSummary: {},
    alerts: 0,
    trades: 0
  });
}
