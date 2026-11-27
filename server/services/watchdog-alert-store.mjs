import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { withAlertFileLock } from './system-alert-file-lock.mjs';

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;
const WATCHDOG_SOURCE = 'staging-liveness-watchdog';
const WATCHDOG_KEY = /^(?:watchdog-(?:http|pm2|engine|self-fail|check-error-(?:http|pm2|engine|disk-warning|disk-critical|archival-health-ran))|server-disk-utilization-(?:warning|critical)|archival-health-not-run)$/;

function statePrefix(ledger) {
  return `${resolve(ledger)}.watchdog-`;
}

function statePath(ledger, key) {
  const hash = createHash('sha256').update(key).digest('hex');
  return `${statePrefix(ledger)}${hash}.json`;
}

async function readOptional(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

async function syncPath(path, flags) {
  const file = await open(path, flags);
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}

async function syncDirectory(path) {
  if (process.platform === 'linux') await syncPath(dirname(path), 'r');
}

export async function writeDurably(path, bytes) {
  const temporary = `${path}.tmp-${randomUUID()}`;
  const file = await open(temporary, 'wx', 0o644);
  try {
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
    await syncDirectory(path);
  } finally {
    try {
      await unlink(temporary);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function decodeState(bytes, path, ledger) {
  const state = JSON.parse(bytes.toString('utf8'));
  if (state?.version !== 1 || typeof state.key !== 'string' || path !== statePath(ledger, state.key) ||
      (state.lastRecovery != null && typeof state.lastRecovery !== 'string') ||
      typeof state.infoClosed !== 'boolean' || !Array.isArray(state.queue) ||
      state.queue.some((entry) => !entry?.row || !UUID.test(entry.row.id) || entry.row.dedupe_key !== state.key ||
        (entry.matchedId !== null && !UUID.test(entry.matchedId)) ||
        (entry.recovery !== null && typeof entry.recovery !== 'string'))) {
    throw new Error(`Invalid durable watchdog state: ${path}`);
  }
  return state;
}

async function readState(ledger, key) {
  const path = statePath(ledger, key);
  const bytes = await readOptional(path);
  return bytes ? decodeState(bytes, path, ledger) : { version: 1, key, infoClosed: false, queue: [] };
}

async function writeState(ledger, state) {
  await writeDurably(statePath(ledger, state.key), JSON.stringify(state));
}

export async function listPendingWatchdogKeys(ledger) {
  const prefix = statePrefix(ledger);
  const directory = dirname(prefix);
  const leaf = basename(prefix);
  const names = await readdir(directory);
  const keys = [];
  for (const name of names) {
    if (!name.startsWith(leaf) || !/^[\da-f]{64}\.json$/.test(name.slice(leaf.length))) continue;
    const path = join(directory, name);
    const bytes = await readOptional(path);
    if (!bytes) continue;
    const state = decodeState(bytes, path, ledger);
    if (state.queue.length > 0) keys.push(state.key);
  }
  return keys;
}

export async function readWatchdogHead(ledger, key) {
  return (await readState(ledger, key)).queue[0] ?? null;
}

export async function readWatchdogLastRecovery(ledger, key) {
  return (await readState(ledger, key)).lastRecovery ?? null;
}

export async function enqueueWatchdogAlert(ledger, row) {
  const key = row.dedupe_key;
  return withAlertFileLock(statePath(ledger, key), async () => {
    const state = await readState(ledger, key);
    if (state.infoClosed) return;
    const latest = state.queue.at(-1);
    if (latest && latest.recovery === null) return;
    state.queue.push({ row, recovery: null, matchedId: null });
    await writeState(ledger, state);
  });
}

export async function recordWatchdogRecovery(ledger, key, evidence, existingRow) {
  return withAlertFileLock(statePath(ledger, key), async () => {
    const state = await readState(ledger, key);
    const latest = state.queue.at(-1);
    if (latest) {
      if (latest.recovery !== null) return;
      latest.recovery = evidence;
    } else {
      if (!existingRow || !UUID.test(existingRow.id) || existingRow.dedupe_key !== key) return;
      // An open alert from before rollout can have its first recovery after
      // rollout. Pin the observed row, including if it is resolved meanwhile.
      state.queue.push({ row: existingRow, recovery: evidence, matchedId: existingRow.id });
    }
    // Keep this marker after delivery retires the entry. A restarted check
    // can have an older failure streak even when the queue is already empty.
    state.lastRecovery = evidence;
    await writeState(ledger, state);
  });
}

export function isWatchdogReceiptAlert(row) {
  return (row.severity === 'warning' || row.severity === 'critical') &&
    (row.metadata?.source === WATCHDOG_SOURCE || WATCHDOG_KEY.test(row.dedupe_key ?? ''));
}

export function hasWatchdogReceipt(row) {
  const first = row.metadata?.watchdog_first_receipt;
  return (first?.id === row.id && Number.isFinite(Date.parse(first.delivered_at))) ||
    (Number.isInteger(row.metadata?.resurface_count) && row.metadata.resurface_count > 0 &&
      Number.isFinite(Date.parse(row.metadata.last_resurfaced_at)));
}

async function readLedger(ledger) {
  const raw = (await readOptional(ledger)) ?? Buffer.alloc(0);
  const byId = new Map();
  let start = 0;
  while (start < raw.length) {
    const newline = raw.indexOf(10, start);
    const end = newline < 0 ? raw.length : newline;
    try {
      const row = JSON.parse(raw.toString('utf8', start, end));
      if (row?.id && row.state && row.triggers_at) byId.set(row.id, { row, start, end });
    } catch {
      // Existing malformed bytes survive an append or targeted update.
    }
    start = end + 1;
  }
  return { raw, byId };
}

async function writeLedgerRow(ledger, raw, row, previous) {
  const bytes = Buffer.from(JSON.stringify(row));
  if (previous) {
    await writeDurably(ledger, Buffer.concat([raw.subarray(0, previous.start), bytes, raw.subarray(previous.end)]));
    return;
  }
  const separator = raw.length && raw.at(-1) !== 10 ? '\n' : '';
  await writeDurably(ledger, Buffer.concat([raw, Buffer.from(separator), bytes, Buffer.from('\n')]));
}

async function flushLedger(ledger) {
  await syncPath(ledger, 'r+');
  await syncDirectory(ledger);
}

function withLedgerAndState(ledger, key, update) {
  return withAlertFileLock(ledger, () => withAlertFileLock(statePath(ledger, key), update));
}

export function commitWatchdogAttempt(ledger, key, id, emitPath, validateCategory) {
  return withLedgerAndState(ledger, key, async () => {
    const state = await readState(ledger, key);
    const { raw, byId } = await readLedger(ledger);
    const exact = byId.get(id)?.row;
    const head = state.queue[0];
    if (head?.row.id !== id) return exact?.dedupe_key === key ? exact : null;

    let row = head.matchedId ? byId.get(head.matchedId)?.row : exact;
    if (head.matchedId && (!row || row.dedupe_key !== key)) {
      throw new Error(`Durable watchdog match is absent from the ledger: ${head.matchedId}`);
    }
    if (!row) {
      const info = head.row.severity === 'info';
      row = [...byId.values()].find(({ row }) => row.dedupe_key === key && (info || row.state !== 'resolved'))?.row;
    }
    if (row) {
      if (row.dedupe_key !== key) throw new Error(`Watchdog attempt ID belongs to another key: ${id}`);
      if (head.matchedId !== row.id || row.state === 'resolved') await flushLedger(ledger);
    } else {
      validateCategory?.(head.row.category);
      row = { ...head.row, metadata: { ...head.row.metadata, source: WATCHDOG_SOURCE, emit_path: emitPath } };
      await writeLedgerRow(ledger, raw, row);
    }

    if (row.state === 'resolved' || head.row.severity === 'info') {
      state.queue.shift();
      state.infoClosed = head.row.severity === 'info';
      await writeState(ledger, state);
    } else if (head.matchedId !== row.id) {
      head.matchedId = row.id;
      await writeState(ledger, state);
    }
    return row;
  });
}

export function recoverWatchdogAttempt(ledger, key, id, makeResolved) {
  return withLedgerAndState(ledger, key, async () => {
    const state = await readState(ledger, key);
    const head = state.queue[0];
    if (head?.row.id !== id || !head.recovery || !head.matchedId) return null;
    const { raw, byId } = await readLedger(ledger);
    const matched = byId.get(head.matchedId);
    if (!matched || matched.row.dedupe_key !== key) return null;
    let row = matched.row;
    if (row.state === 'resolved') {
      await flushLedger(ledger);
    } else {
      if (!hasWatchdogReceipt(row)) return null;
      row = makeResolved(row, head.recovery);
      await writeLedgerRow(ledger, raw, row, matched);
    }
    state.queue.shift();
    await writeState(ledger, state);
    return row;
  });
}
