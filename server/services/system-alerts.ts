/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-40 — System Alerts Library
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Persistent queue of "events that someone needs to look at" — both human
 * operators (UI tab) and AI agents (per-turn check in CC + Langston sessions).
 *
 * Three writers touch this file concurrently:
 *   - The CLI (`scripts/system-alerts.ts`) — operator/AI-invoked
 *   - The dispatcher cron (15-min systemd timer on staging) — promotes
 *     scheduled events to active when their `triggers_at` arrives
 *   - The HTTP API (`/api/system-alerts/:id/acknowledge`) — UI ack button
 *
 * Concurrency model: O_EXCL-based file lock (`/var/log/dawntrader/system-
 * alerts.jsonl.lock`). Same primitive that `proper-lockfile` uses under the
 * hood; no new npm dep needed (per Kyle "no new npm deps" directive from B75).
 *
 * Parse resilience: malformed JSONL lines are skipped with a console.warn,
 * not abort-on-error. Operator can fix in place; reader keeps going.
 *
 * First-deploy bootstrap: the first `add` call creates the file if it doesn't
 * exist (Langston Step 1 review concern — the per-turn check fail-soft path
 * handles file-missing gracefully but bootstrapping cleanly is preferred).
 *
 * Schema-versioning: all entries currently `schema_version: 1`. Future schema
 * changes bump this and old readers must skip-or-migrate based on version.
 *
 * Reference: B_NEW_40_SCOPE.md §2.8, B_NEW_40_PRE_AUDIT.md §2.7
 * ═════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export const ALERTS_FILE = '/var/log/dawntrader/system-alerts.jsonl';
const LOCK_FILE = `${ALERTS_FILE}.lock`;
const LOCK_RETRY_MAX = 50;       // 50 × 100ms = 5s max wait
const LOCK_RETRY_DELAY_MS = 100;
const LOCK_STALE_AFTER_MS = 30_000; // 30s — if lock is older than this, assume crashed holder and force-acquire

export type AlertState = 'scheduled' | 'active' | 'acknowledged' | 'resolved';
export type AlertCategory =
  | 'soak_verification'
  | 'health_check'
  | 'breakage'
  | 'one_off'
  | 'recurring';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface SystemAlert {
  schema_version: 1;
  id: string;                                      // uuid
  created_at: string;                              // ISO-8601
  triggers_at: string;                             // ISO-8601 — when this should fire
  fired_at: string | null;                         // ISO-8601 — when dispatcher promoted scheduled → active
  acknowledged_at: string | null;                  // ISO-8601
  acknowledged_by: string | null;                  // 'kyle' | 'cc-session-...' | 'langston' | 'system' | etc.
  state: AlertState;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  /** Schema-reserved for future recurring health checks. Not used yet. */
  recurrence_interval_seconds: number | null;
}

// ─── File-lock primitives (O_EXCL based, no npm deps) ──────────────────────
//
// Note (Langston Step 4 review, R-busy-wait): acquireLock is async — under lock
// contention it yields the Node event loop via `await new Promise(setTimeout)`
// instead of busy-waiting synchronously. This matters because the HTTP path
// (`/api/system-alerts/:id/acknowledge`) calls into this library from an
// Express handler in the trading-hot Node process; a synchronous busy-wait
// would stall every other route (TEC, signal pipeline) for up to 5s under
// contention. All public mutating APIs (addAlert/fireDue/ackAlert/resolveAlert)
// are therefore async — CLI callers must `await`.

async function acquireLock(): Promise<void> {
  for (let attempt = 0; attempt < LOCK_RETRY_MAX; attempt++) {
    try {
      // O_EXCL + O_CREAT: atomic "create only if doesn't exist". If another
      // process holds the lock, fails with EEXIST.
      const fd = fs.openSync(LOCK_FILE, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o644);
      fs.writeSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
      fs.closeSync(fd);
      return;
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        // Check if the lock is stale (holder crashed before releasing)
        try {
          const stats = fs.statSync(LOCK_FILE);
          if (Date.now() - stats.mtimeMs > LOCK_STALE_AFTER_MS) {
            // Stale lock — force-remove and retry. Race window: two acquirers
            // simultaneously detecting staleness both unlink → second unlink
            // could remove a fresh lock from the first acquirer. Window is
            // tens of microseconds against a 30s+ stale lock, so very low
            // probability. Hardening (PID-based liveness check) tracked as
            // RUNNING_ISSUES candidate, not blocking B-NEW-40 ship.
            console.warn(`[system-alerts] stale lock detected (age ${Date.now() - stats.mtimeMs}ms), force-acquiring`);
            try { fs.unlinkSync(LOCK_FILE); } catch { /* race: another writer cleaned up first */ }
            continue;
          }
        } catch { /* file vanished between EEXIST and statSync — race; retry */ }
        // Active lock; yield event loop and retry
        await new Promise<void>((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`[system-alerts] failed to acquire lock after ${LOCK_RETRY_MAX} retries (~${LOCK_RETRY_MAX * LOCK_RETRY_DELAY_MS}ms)`);
}

function releaseLock(): void {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.error('[system-alerts] failed to release lock:', err);
    }
  }
}

async function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  await acquireLock();
  try {
    return await fn();
  } finally {
    releaseLock();
  }
}

// ─── Read / parse with skip-on-error resilience ────────────────────────────

function ensureFileExists(): void {
  if (!fs.existsSync(ALERTS_FILE)) {
    fs.mkdirSync(path.dirname(ALERTS_FILE), { recursive: true });
    fs.writeFileSync(ALERTS_FILE, '', { flag: 'a' }); // create empty if absent
  }
}

/**
 * Read all alerts from the file. Malformed lines are SKIPPED with a warning,
 * not aborted. If the file doesn't exist returns []. Used by readers (CLI list,
 * API GET, per-turn AI check).
 */
export function readAllAlerts(): SystemAlert[] {
  if (!fs.existsSync(ALERTS_FILE)) return [];
  const raw = fs.readFileSync(ALERTS_FILE, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const result: SystemAlert[] = [];
  let skipped = 0;
  for (const [idx, line] of lines.entries()) {
    try {
      const entry = JSON.parse(line) as SystemAlert;
      // Minimal shape validation — skip if required fields missing
      if (!entry.id || !entry.state || !entry.triggers_at) {
        skipped++;
        continue;
      }
      result.push(entry);
    } catch (_err) {
      skipped++;
      // Don't spam if many lines bad; one warning is enough
      if (skipped === 1) {
        console.warn(`[system-alerts] skipping malformed JSONL line ${idx + 1} (and potentially more)`);
      }
    }
  }
  return result;
}

/**
 * Atomic whole-file rewrite via tmpfile-rename. Always called inside withLock().
 */
function writeAllAlertsAtomic(alerts: SystemAlert[]): void {
  const tmp = `${ALERTS_FILE}.tmp.${process.pid}.${Date.now()}`;
  const content = alerts.map((a) => JSON.stringify(a)).join('\n') + (alerts.length > 0 ? '\n' : '');
  fs.writeFileSync(tmp, content, { mode: 0o644 });
  fs.renameSync(tmp, ALERTS_FILE);
}

// ─── Public mutating API (all under lock) ──────────────────────────────────

export interface AddAlertOptions {
  triggers_at: string | Date;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  recurrence_interval_seconds?: number | null;
}

/**
 * Insert a new alert. If `triggers_at` is in the past, the dispatcher will
 * promote it to active on its next run. State starts as `scheduled`.
 */
export async function addAlert(opts: AddAlertOptions): Promise<SystemAlert> {
  ensureFileExists();
  const triggersAtISO = typeof opts.triggers_at === 'string' ? opts.triggers_at : opts.triggers_at.toISOString();
  const entry: SystemAlert = {
    schema_version: 1,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    triggers_at: triggersAtISO,
    fired_at: null,
    acknowledged_at: null,
    acknowledged_by: null,
    state: 'scheduled',
    category: opts.category,
    severity: opts.severity,
    title: opts.title,
    body: opts.body,
    metadata: opts.metadata ?? {},
    recurrence_interval_seconds: opts.recurrence_interval_seconds ?? null,
  };
  await withLock(() => {
    const all = readAllAlerts();
    all.push(entry);
    writeAllAlertsAtomic(all);
  });
  return entry;
}

/**
 * Dispatcher invocation: promote `scheduled` entries whose `triggers_at <= NOW()`
 * to `active`. Returns the entries that were promoted (so callers can fire
 * Telegram notifications etc.).
 *
 * Idempotency: state mutation persists even if subsequent post-promotion steps
 * (e.g. Telegram push) fail — caller handles push errors separately.
 */
export async function fireDue(nowMs: number = Date.now()): Promise<SystemAlert[]> {
  ensureFileExists();
  const promoted: SystemAlert[] = [];
  await withLock(() => {
    const all = readAllAlerts();
    const nowISO = new Date(nowMs).toISOString();
    let mutated = false;
    for (const entry of all) {
      if (entry.state === 'scheduled' && entry.triggers_at <= nowISO) {
        entry.state = 'active';
        entry.fired_at = nowISO;
        promoted.push({ ...entry }); // clone for return so caller mutations don't affect file state
        mutated = true;
      }
    }
    if (mutated) {
      writeAllAlertsAtomic(all);
    }
  });
  return promoted;
}

/**
 * Mark an alert as acknowledged. `by` is required for audit trail.
 * Returns the updated alert, or null if not found.
 */
export async function ackAlert(id: string, by: string): Promise<SystemAlert | null> {
  ensureFileExists();
  let result: SystemAlert | null = null;
  await withLock(() => {
    const all = readAllAlerts();
    const found = all.find((a) => a.id === id);
    if (!found) return;
    if (found.state === 'active') {
      found.state = 'acknowledged';
      found.acknowledged_at = new Date().toISOString();
      found.acknowledged_by = by;
      result = { ...found };
      writeAllAlertsAtomic(all);
    } else {
      // Idempotent — if already acknowledged or resolved, return current state
      result = { ...found };
    }
  });
  return result;
}

/**
 * Mark an alert as resolved (terminal state — kept for history but won't
 * surface). Use when the underlying condition is fully closed.
 */
export async function resolveAlert(id: string, by: string): Promise<SystemAlert | null> {
  ensureFileExists();
  let result: SystemAlert | null = null;
  await withLock(() => {
    const all = readAllAlerts();
    const found = all.find((a) => a.id === id);
    if (!found) return;
    found.state = 'resolved';
    if (!found.acknowledged_at) {
      found.acknowledged_at = new Date().toISOString();
      found.acknowledged_by = by;
    }
    result = { ...found };
    writeAllAlertsAtomic(all);
  });
  return result;
}

// ─── Read accessors (no lock — concurrent reads are safe) ─────────────────

export interface ListAlertsOptions {
  state?: AlertState;
  category?: AlertCategory;
}

export function listAlerts(opts: ListAlertsOptions = {}): SystemAlert[] {
  let all = readAllAlerts();
  if (opts.state) all = all.filter((a) => a.state === opts.state);
  if (opts.category) all = all.filter((a) => a.category === opts.category);
  return all;
}

/**
 * Convenience: alerts that an AI per-turn check or the UI tab should surface.
 * These are unack'd active alerts whose `triggers_at` has already arrived.
 */
export function listSurfaceable(): SystemAlert[] {
  const nowISO = new Date().toISOString();
  return readAllAlerts().filter(
    (a) =>
      (a.state === 'active' || (a.state === 'scheduled' && a.triggers_at <= nowISO)) &&
      a.acknowledged_at === null,
  );
}
