/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7A Task 5 — Skipped Signal Logger
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Logs signals that are filtered out before trade execution for ML completeness.
 * Writes to /logs/vts_skipped_signals/<date>.json for ML ingestion.
 * 
 * Governance: Directive 11.7A Task 5
 * ══════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs/promises';
import path from 'path';

export type SkipReason = 
  | 'Low_ROI'
  | 'Illiquid_USD'
  | 'Net_EV_Negative'
  | 'FinalScore_Low'
  | 'RegimeWeight_Low'
  | 'ADX_Guard'
  | 'Duplicate_Position'
  | 'Duplicate_Position_Max'  // Batch 24: Add missing type — used by vts-runner.ts DUP_GUARD
  | 'BLOCKED_GOVERNANCE'
  | 'LEARNING_DEFERRED'
  | 'Confidence_Floor'  // 11.7S: Mode-specific confidence threshold not met
  | 'Target_Unreachable'   // reorg-B2: reachability gate — atrsToTarget > reachAtrMax (feasibility drop)
  | 'Target_RR_Gate'       // reorg-B2: universal RR gate — rr < minRR after the floor-lift
  | 'Target_Invalid_ATR'   // reorg-B2: ATR genuinely unavailable (wiring/data bug — LOUD, never masked)
  | 'Target_Invalid_Geometry'; // reorg-B3.2: malformed entry/stop/target geometry — a data-validity DROP on the VTS path (distinct from the quality gates, which now tag-don't-drop)

export interface SkippedSignalEntry {
  timestamp: string;
  symbol: string;
  reason: SkipReason;
  regime?: string;
  expectedROI?: number;
  minROI?: number;
  signalType?: string;
  strategy?: string;
  volumeUSD?: number;
  finalScore?: number;
  regimeWeight?: number;
  source?: 'VTS' | 'SQE';
  governanceReason?: string;
  learningState?: 'DEFERRED' | 'IMMEDIATE';
  modeSkipReason?: string;  // 11.7S: Mode-specific skip explanation
}

const LOG_DIR = path.join(process.cwd(), 'logs', 'vts_skipped_signals');

let writeBuffer: SkippedSignalEntry[] = [];
let flushTimeout: NodeJS.Timeout | null = null;

async function ensureLogDir(): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (err) {
    console.warn('[11.7A][SkipLog] Failed to create log directory:', err);
  }
}

async function flushBuffer(): Promise<void> {
  if (writeBuffer.length === 0) return;
  
  const toWrite = [...writeBuffer];
  writeBuffer = [];
  
  const dateStr = new Date().toISOString().slice(0, 10);
  const filePath = path.join(LOG_DIR, `${dateStr}.json`);
  
  try {
    await ensureLogDir();
    
    let existing: SkippedSignalEntry[] = [];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      existing = JSON.parse(content);
    } catch {
    }
    
    const merged = [...existing, ...toWrite];
    await fs.writeFile(filePath, JSON.stringify(merged, null, 2));
    console.log(`[11.7A][SkipLog] Flushed ${toWrite.length} skipped signals to ${dateStr}.json`);
  } catch (err) {
    console.warn('[11.7A][SkipLog] Failed to write skipped signals:', err);
    writeBuffer = [...toWrite, ...writeBuffer];
  }
}

export function logSkippedSignal(entry: Omit<SkippedSignalEntry, 'timestamp'>): void {
  const fullEntry: SkippedSignalEntry = {
    timestamp: new Date().toISOString(),
    ...entry
  };
  
  writeBuffer.push(fullEntry);
  // Batch 22 HF7: Force immediate flush to prevent data loss on crash
  flushBuffer().catch(console.error);

  if (flushTimeout) {
    clearTimeout(flushTimeout);
  }
  flushTimeout = setTimeout(() => {
    flushBuffer().catch(console.error);
  }, 5000);
  
  if (writeBuffer.length >= 50) {
    flushBuffer().catch(console.error);
  }
}

export async function forceFlush(): Promise<void> {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  await flushBuffer();
}

export async function getSkippedSignalsForDate(dateStr?: string): Promise<SkippedSignalEntry[]> {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  const filePath = path.join(LOG_DIR, `${date}.json`);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

export async function getSkippedSignalsSummary(days: number = 7): Promise<{
  total: number;
  byReason: Record<SkipReason, number>;
  byRegime: Record<string, number>;
  duplicateUniqueCombos: number;  // Batch 22 HF5: unique symbol+strategy combos blocked as duplicates
}> {
  const summary = {
    total: 0,
    byReason: {} as Record<SkipReason, number>,
    byRegime: {} as Record<string, number>,
    duplicateUniqueCombos: 0,
  };

  // Batch 22 HF5: Track unique duplicate combos from disk-persisted data
  const duplicateCombos = new Set<string>();

  const now = new Date();
  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);

    const entries = await getSkippedSignalsForDate(dateStr);
    summary.total += entries.length;

    for (const entry of entries) {
      summary.byReason[entry.reason] = (summary.byReason[entry.reason] || 0) + 1;
      if (entry.regime) {
        summary.byRegime[entry.regime] = (summary.byRegime[entry.regime] || 0) + 1;
      }
      // Batch 22 HF5: Track unique duplicate combos
      if ((entry.reason === 'Duplicate_Position' || entry.reason === 'Duplicate_Position_Max') && entry.symbol && entry.strategy) {
        duplicateCombos.add(`${entry.symbol}:${entry.strategy}`);
      }
    }
  }

  summary.duplicateUniqueCombos = duplicateCombos.size;
  return summary;
}
