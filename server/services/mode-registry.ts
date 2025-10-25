/**
 * Phase 27.F.15.B.4-Prep: ModeRegistry Placeholder
 * 
 * Lightweight global telemetry registry for paper and live trading modes.
 * This is a temporary stub until the full telemetry registry is implemented.
 */

export interface ModeStatus {
  engineStatus: 'stopped' | 'starting' | 'running' | 'paused' | 'error';
  riskSummary: Record<string, any>;
  alerts: number;
  lastUpdate?: Date;
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
    lastUpdate: new Date()
  },
  live: { 
    engineStatus: 'stopped', 
    riskSummary: {}, 
    alerts: 0,
    lastUpdate: new Date()
  },
};

/**
 * Update mode registry status
 */
export function updateModeStatus(
  mode: 'live' | 'paper',
  status: Partial<ModeStatus>
): void {
  ModeRegistry[mode] = {
    ...ModeRegistry[mode],
    ...status,
    lastUpdate: new Date()
  };
  console.log(`[ModeRegistry][mode=${mode}] Status updated:`, status);
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
