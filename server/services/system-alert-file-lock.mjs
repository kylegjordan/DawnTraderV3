import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, open, readFile, readlink, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const WAIT_MS = 5_000;
const RETRY_MS = 100;
const STALE_AFTER_MS = 30_000;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;
const PID_NAMESPACE = /^pid:\[\d+\]$/;
const START_TICKS = /^\d+$/;

let processIdentity;

function parseStartTicks(stat, pid) {
  if (!stat.startsWith(`${pid} (`)) return null;
  // The process name can contain spaces and closing parentheses. Field 3
  // starts after its final delimiter, and starttime is field 22.
  const fields = stat.slice(stat.lastIndexOf(') ') + 2).split(' ');
  return START_TICKS.test(fields[19] ?? '') ? fields[19] : null;
}

async function readProcessIdentity() {
  if (process.platform !== 'linux') return null;
  try {
    const [boot, namespace, stat] = await Promise.all([
      readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
      readlink('/proc/self/ns/pid'),
      readFile('/proc/self/stat', 'utf8'),
    ]);
    const bootId = boot.trim();
    const startTicks = parseStartTicks(stat, process.pid);
    if (UUID.test(bootId) && PID_NAMESPACE.test(namespace) && startTicks) {
      return { bootId, namespace, startTicks };
    }
  } catch {
    // An owner lacking trusted process identity can release its own token.
    // Other writers must leave that token in place.
  }
  return null;
}

function identity() {
  processIdentity ??= readProcessIdentity();
  return processIdentity;
}

function parseOwner(raw) {
  try {
    const owner = JSON.parse(raw);
    if (owner && Number.isInteger(owner.pid) && owner.pid > 0 && owner.pid <= 2_147_483_647 &&
        typeof owner.token === 'string' && UUID.test(owner.token) &&
        typeof owner.bootId === 'string' && UUID.test(owner.bootId) &&
        typeof owner.namespace === 'string' && PID_NAMESPACE.test(owner.namespace) &&
        typeof owner.startTicks === 'string' && START_TICKS.test(owner.startTicks)) {
      return owner;
    }
  } catch {
    // An incomplete or legacy lock supplies no proof of ownership.
  }
  return null;
}

async function isDead(owner, local) {
  if (owner.bootId !== local.bootId) return true;
  if (owner.namespace !== local.namespace) return false;
  try {
    const ticks = parseStartTicks(await readFile(`/proc/${owner.pid}/stat`, 'utf8'), owner.pid);
    return ticks !== null && ticks !== owner.startTicks;
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ESRCH') return false;
    // A restricted /proc view can also return ENOENT for a live PID.
    try {
      process.kill(owner.pid, 0);
      return false;
    } catch (probeError) {
      return probeError.code === 'ESRCH';
    }
  }
}

async function readAgedDeadOwner(lockPath) {
  const local = await identity();
  if (!local) return null;
  try {
    const file = await open(lockPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let raw;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 512 || Date.now() - stat.mtimeMs < STALE_AFTER_MS) return null;
      raw = await file.readFile('utf8');
    } finally {
      await file.close();
    }
    const owner = parseOwner(raw);
    return owner && await isDead(owner, local) ? raw : null;
  } catch (error) {
    if (['ENOENT', 'EACCES', 'EPERM', 'ELOOP'].includes(error.code)) return null;
    throw error;
  }
}

// Called by the reaper process after flock takes the persistent guard. The
// owner may release and a successor may publish while death is being proved.
export async function reapDeadAlertFileLockUnderGuard(lockPath) {
  const deadToken = await readAgedDeadOwner(lockPath);
  if (!deadToken) return;
  try {
    if (await readFile(lockPath, 'utf8') === deadToken) await unlink(lockPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function tryReap(lockPath, remainingMs) {
  // Source, the flattened ESM app build, and the standalone CJS dispatcher
  // each carry the helper beside their own installation, independent of cwd.
  const reaper = typeof __dirname === 'string'
    ? resolve(__dirname, 'server/scripts/reap-system-alert-lock.mjs')
    : fileURLToPath(new URL(import.meta.url.endsWith('/services/system-alert-file-lock.mjs')
      ? '../scripts/reap-system-alert-lock.mjs' : '../server/scripts/reap-system-alert-lock.mjs', import.meta.url));
  try {
    // --no-fork gives the guard to the Node reaper itself. A timeout kills
    // that process and releases the guard, including during contention.
    await run('/usr/bin/flock', [
      '--nonblock', '--no-fork', '--conflict-exit-code=75', `${lockPath}.reap`,
      process.execPath, reaper, lockPath,
    ], { timeout: Math.max(1, remainingMs) });
  } catch (error) {
    if (error.code !== 75 && !error.killed) throw error;
  }
}

async function removeOwnedPath(path, raw) {
  try {
    if (raw === undefined || await readFile(path, 'utf8') === raw) await unlink(path);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[system-alerts] could not remove lock file:', error);
  }
}

export async function withAlertFileLock(ledgerPath, fn) {
  const lockPath = `${resolve(ledgerPath)}.lock`;
  const token = randomUUID();
  const raw = JSON.stringify({ token, pid: process.pid, ...await identity() });
  const unpublished = `${lockPath}.${token}`;
  const file = await open(unpublished, 'wx', 0o644);
  let acquired = false;
  try {
    try {
      await file.writeFile(raw);
    } finally {
      await file.close();
    }
    const deadline = performance.now() + WAIT_MS;
    do {
      try {
        await link(unpublished, lockPath);
        acquired = true;
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      if (await readAgedDeadOwner(lockPath)) {
        await tryReap(lockPath, Math.ceil(deadline - performance.now()));
      }
      const remaining = deadline - performance.now();
      if (remaining > 0) await delay(Math.min(RETRY_MS, remaining));
    } while (performance.now() < deadline);
  } finally {
    await removeOwnedPath(unpublished);
  }

  if (!acquired) throw new Error(`[system-alerts] failed to acquire lock after ${WAIT_MS}ms`);
  try {
    return await fn();
  } finally {
    await removeOwnedPath(lockPath, raw);
  }
}
