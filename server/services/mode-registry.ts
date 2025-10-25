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
