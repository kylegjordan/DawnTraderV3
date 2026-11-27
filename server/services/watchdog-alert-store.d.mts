import type { SystemAlert } from './system-alerts.js';

export function writeDurably(path: string, bytes: string | Buffer): Promise<void>;
export function isWatchdogReceiptAlert(row: Pick<SystemAlert, 'severity' | 'metadata' | 'dedupe_key'>): boolean;
export function hasWatchdogReceipt(row: SystemAlert): boolean;
export function enqueueWatchdogAlert(ledger: string, row: SystemAlert): Promise<void>;
export function recordWatchdogRecovery(ledger: string, key: string, evidence: string, existingRow?: SystemAlert): Promise<void>;
export function readWatchdogLastRecovery(ledger: string, key: string): Promise<string | null>;
export function readWatchdogHead(ledger: string, key: string): Promise<{
  row: SystemAlert;
  recovery: string | null;
  matchedId: string | null;
} | null>;
export function commitWatchdogAttempt(
  ledger: string, key: string, id: string, emitPath: 'cli' | 'fallback_atomic', validateCategory?: (category: string) => unknown,
): Promise<SystemAlert | null>;
export function recoverWatchdogAttempt(
  ledger: string, key: string, id: string, makeResolved: (row: SystemAlert, evidence: string) => SystemAlert,
): Promise<SystemAlert | null>;
