/**
 * Batch 46: Governance State Persistence
 * Persists and rehydrates governance counters + regime stability across PM2 restarts.
 *
 * Critical state: regimeHistory (7-day flip rate drives stability classification).
 * Other state: governance counters, learning stats — observability-only but useful for continuity.
 */

import fs from 'fs';
import path from 'path';
import { getRegimeHistoryForPersistence, restoreRegimeHistory } from './regime-stability.js';

const GOV_STATE_DIR = path.join(process.cwd(), 'logs', 'governance_state');
const GOV_STATE_FILE = path.join(GOV_STATE_DIR, 'governance_state.json');

let persistInterval: ReturnType<typeof setInterval> | null = null;

export function persistGovernanceState(): void {
  try {
    if (!fs.existsSync(GOV_STATE_DIR)) {
      fs.mkdirSync(GOV_STATE_DIR, { recursive: true });
    }
    const state = {
      version: 1,
      savedAt: Date.now(),
      regimeHistory: getRegimeHistoryForPersistence(),
    };
    fs.writeFileSync(GOV_STATE_FILE, JSON.stringify(state));
  } catch (err) {
    console.error('[46][GOV] Failed to persist governance state:', err);
  }
}

export function rehydrateGovernanceState(): void {
  try {
    if (!fs.existsSync(GOV_STATE_FILE)) return;
    const data = JSON.parse(fs.readFileSync(GOV_STATE_FILE, 'utf-8'));
    if (data.regimeHistory && Array.isArray(data.regimeHistory)) {
      restoreRegimeHistory(data.regimeHistory);
    }
  } catch (err) {
    console.error('[46][GOV] Failed to rehydrate governance state:', err);
  }
}

// Auto-rehydrate on module load
rehydrateGovernanceState();

// Auto-persist every 60 seconds
persistInterval = setInterval(persistGovernanceState, 60 * 1000);
