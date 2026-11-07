/**
 * Row `8c` P7 / condition 4 — THE LEVEL-BASIS FUNNEL, WRITTEN WHERE A SECOND PARTY CAN READ IT.
 *
 * Langston's ruling (8c audit-and-plan §7, 2026-11-06, Discord `1568296158332198955`): a DEDICATED, append-only file,
 * `/var/log/dawntrader/level-basis-funnel.jsonl`, one snapshot every 15 minutes, built with the switch-on and in place
 * before `3n` closes. Three requirements, each met here:
 *   (1) every line carries the LIFETIME ANCHOR — the process start, PM2's own uptime/restart stamps when present, and the
 *       snapshot's own ISO time — because the cells are cumulative PER LIFETIME (in memory; a restart empties them), and a
 *       reader must segment at the boundary himself (§A2: a rate within one lifetime, never a series);
 *   (2) no graceful-shutdown line is relied on — SIGKILL/OOM skip it; the 15-minute cadence IS the durability;
 *   (3) the record is this file, not a console line.
 * ⛔ The rows are written whole, every lane and stage, NEVER summed (`getLevelBasisFunnel` returns rows by design).
 */
import { promises as fs } from 'node:fs';
import { readFileSync } from 'node:fs';
import { getLevelBasisFunnel } from '../core/calculations/level-basis.js';

export const LEVEL_BASIS_FUNNEL_FILE = '/var/log/dawntrader/level-basis-funnel.jsonl';
export const LEVEL_BASIS_FUNNEL_INTERVAL_MS = 15 * 60_000;

const numOrNull = (v: string | undefined): number | null => {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function readBuildSha(): string | null {
  try { return readFileSync('dist/BUILD_SHA', 'utf8').trim() || null; } catch { return null; }
}

/** One snapshot line. Pure apart from the clock and the process facts it is handed, so a test can build one. */
export function buildFunnelSnapshotLine(nowMs: number, proc: {
  startedAtMs: number; pid: number; pmUptimeMs: number | null; pmRestartCount: number | null; buildSha: string | null;
}): string {
  return JSON.stringify({
    kind: 'level_basis_funnel_snapshot',
    snapshotAt: new Date(nowMs).toISOString(),
    lifetime: {
      processStartedAt: new Date(proc.startedAtMs).toISOString(),
      pid: proc.pid,
      // PM2's own stamps (its env `pm_uptime` = the start it recorded, `restart_time` = its restart count). Null when the
      // process is not under PM2 — stated, never invented.
      pmUptime: proc.pmUptimeMs !== null ? new Date(proc.pmUptimeMs).toISOString() : null,
      pmRestartCount: proc.pmRestartCount,
      buildSha: proc.buildSha,
    },
    rows: getLevelBasisFunnel(),
  }) + '\n';
}

let _timer: ReturnType<typeof setInterval> | null = null;
let _lastErrorLoggedAt = 0;

async function writeOnce(): Promise<void> {
  const nowMs = Date.now();
  const line = buildFunnelSnapshotLine(nowMs, {
    startedAtMs: nowMs - process.uptime() * 1000,
    pid: process.pid,
    pmUptimeMs: numOrNull(process.env.pm_uptime),
    pmRestartCount: numOrNull(process.env.restart_time),
    buildSha: readBuildSha(),
  });
  try {
    await fs.appendFile(LEVEL_BASIS_FUNNEL_FILE, line, 'utf8');
  } catch (err) {
    // Loud, but at most once an hour: a missing directory must not flood the error log every 15 minutes.
    if (nowMs - _lastErrorLoggedAt > 3_600_000) {
      _lastErrorLoggedAt = nowMs;
      console.error(`[8c][LEVEL_BASIS_FUNNEL_FILE] append to ${LEVEL_BASIS_FUNNEL_FILE} failed: ${(err as Error).message}`);
    }
  }
}

/** Started ONCE at boot (`server/index.ts`). Idempotent; the timer never holds the process open. */
export function startLevelBasisFunnelWriter(): void {
  if (_timer !== null) return;
  _timer = setInterval(() => { void writeOnce(); }, LEVEL_BASIS_FUNNEL_INTERVAL_MS);
  _timer.unref?.();
}
