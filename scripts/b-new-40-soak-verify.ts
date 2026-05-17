#!/usr/bin/env tsx
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-40 — Soak Verification Script
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Runs at the end of the 14-day staging soak window (or any time on-demand)
 * to verify that the pg pool keepalive + TEC refresh timeout fix actually
 * closed the recurring TEC_STALE_FAIL_CLOSED failure mode.
 *
 * Pass/fail criterion (Langston Step 1 refinement): presence-not-count.
 *   ANY TEC_STALE_FAIL_CLOSED event between deploy timestamp and now = FAIL.
 *   TEC_REFRESH_TIMEOUT events are INFO (that's the new fence working).
 *   Count comparisons are informational only.
 *
 * Usage:
 *   npm run b-new-40:soak-verify -- --deploy-ts 2026-05-17T12:00:00Z
 *   npm run b-new-40:soak-verify -- --deploy-ts <ts> --ack-alert-id <uuid>
 *   npm run b-new-40:soak-verify -- --deploy-ts <ts> --log-paths /custom/error.log,/custom/out.log
 *
 * When run via SSH on staging:
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
 *     npm run b-new-40:soak-verify -- --deploy-ts 2026-05-17T12:00:00Z'"
 *
 * Reference: B_NEW_40_SCOPE.md §2.9
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const DEFAULT_LOG_PATHS = [
  '/var/log/dawntrader/error.log',
  '/var/log/dawntrader/out.log',
];

const FAIL_SIGNATURES = ['TEC_STALE_FAIL_CLOSED'];
const INFO_SIGNATURES = ['TEC_REFRESH_TIMEOUT', 'TEC_REFRESH_FAIL'];
const POOL_SIGNATURES = [
  'ECONNRESET',
  'ECONNREFUSED',
  'getaddrinfo',
  'read ETIMEDOUT',
  'write ETIMEDOUT',
  'connection terminated',
];

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

interface EventRecord {
  timestamp: string;
  signature: string;
  line: string;
}

function findInLog(path: string, deployTs: Date, signatures: string[]): EventRecord[] {
  if (!fs.existsSync(path)) {
    return [];
  }
  // Use grep + awk on the timestamp prefix. The log lines start with
  // "YYYY-MM-DD HH:MM:SS +ZZZZ:" so a string compare against deployTs ISO works.
  const deployTsCompare = deployTs.toISOString().slice(0, 19).replace('T', ' ');
  const sigPattern = signatures.map((s) => `\\[${s}\\]`).join('|');
  const result = spawnSync(
    'sh',
    ['-c', `awk '$1" "$2 >= "${deployTsCompare}"' "${path}" | grep -E '${sigPattern}' || true`],
    { encoding: 'utf-8' },
  );
  if (result.status !== 0 && result.status !== 1) {
    console.error(`[soak-verify] grep failed on ${path}: status=${result.status}`);
    return [];
  }
  const lines = (result.stdout || '').split('\n').filter((l) => l.trim().length > 0);
  const records: EventRecord[] = [];
  for (const line of lines) {
    const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    const sigMatch = signatures.find((s) => line.includes(`[${s}]`));
    if (tsMatch && sigMatch) {
      records.push({ timestamp: tsMatch[1], signature: sigMatch, line });
    }
  }
  return records;
}

function eventsByDay(records: EventRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of records) {
    const day = r.timestamp.slice(0, 10);
    counts[day] = (counts[day] ?? 0) + 1;
  }
  return counts;
}

async function ackAlert(id: string, by: string): Promise<void> {
  const { ackAlert: doAck } = await import('../server/services/system-alerts.js');
  const result = await doAck(id, by);
  if (result) {
    console.log(`[soak-verify] acknowledged alert ${id} as ${by}`);
  } else {
    console.warn(`[soak-verify] alert ${id} not found — skipping ack`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const deployTsStr = getFlag(args, 'deploy-ts');
  if (!deployTsStr) {
    console.error('Missing required flag: --deploy-ts <ISO timestamp>');
    console.error('Example: --deploy-ts 2026-05-17T12:00:00Z');
    process.exit(1);
  }
  const deployTs = new Date(deployTsStr);
  if (isNaN(deployTs.getTime())) {
    console.error(`Invalid --deploy-ts: ${deployTsStr}`);
    process.exit(1);
  }

  const logPathsFlag = getFlag(args, 'log-paths');
  const logPaths = logPathsFlag ? logPathsFlag.split(',') : DEFAULT_LOG_PATHS;

  const ackAlertId = getFlag(args, 'ack-alert-id');
  const ackBy = getFlag(args, 'ack-by') ?? `b-new-40-soak-verify-${process.pid}`;

  const now = new Date();
  const elapsedMs = now.getTime() - deployTs.getTime();
  const elapsedDays = (elapsedMs / 86_400_000).toFixed(1);

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('B-NEW-40 — Soak Verification');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Deploy timestamp:  ${deployTs.toISOString()}`);
  console.log(`Run timestamp:     ${now.toISOString()}`);
  console.log(`Elapsed:           ${elapsedDays} days`);
  console.log(`Log paths scanned: ${logPaths.join(', ')}`);
  console.log('');

  let totalFailEvents: EventRecord[] = [];
  let totalInfoEvents: EventRecord[] = [];
  let totalPoolEvents: EventRecord[] = [];

  for (const path of logPaths) {
    if (!fs.existsSync(path)) {
      console.log(`  ⚠ Log path not found, skipping: ${path}`);
      continue;
    }
    totalFailEvents.push(...findInLog(path, deployTs, FAIL_SIGNATURES));
    totalInfoEvents.push(...findInLog(path, deployTs, INFO_SIGNATURES));
    totalPoolEvents.push(...findInLog(path, deployTs, POOL_SIGNATURES));
  }

  // Deduplicate by timestamp + signature (some lines appear in both out and error)
  const dedup = (rs: EventRecord[]): EventRecord[] => {
    const seen = new Set<string>();
    return rs.filter((r) => {
      const key = `${r.timestamp}::${r.signature}::${r.line.slice(0, 100)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  totalFailEvents = dedup(totalFailEvents);
  totalInfoEvents = dedup(totalInfoEvents);
  totalPoolEvents = dedup(totalPoolEvents);

  console.log('── Counts ────────────────────────────────────────────────────────────────');
  console.log(`FAIL signatures   (any = FAIL):   ${totalFailEvents.length.toString().padStart(6)}  [${FAIL_SIGNATURES.join(', ')}]`);
  console.log(`INFO signatures   (fence working): ${totalInfoEvents.length.toString().padStart(6)}  [${INFO_SIGNATURES.join(', ')}]`);
  console.log(`Pool/socket errors:                ${totalPoolEvents.length.toString().padStart(6)}  [${POOL_SIGNATURES.join(', ')}]`);
  console.log('');

  if (totalFailEvents.length > 0) {
    console.log('── Per-day TEC_STALE_FAIL_CLOSED events ─────────────────────────────────');
    const byDay = eventsByDay(totalFailEvents);
    for (const day of Object.keys(byDay).sort()) {
      console.log(`  ${day}: ${byDay[day]} events`);
    }
    console.log('');
    console.log('── First 5 FAIL events ──────────────────────────────────────────────────');
    for (const r of totalFailEvents.slice(0, 5)) {
      console.log(`  ${r.timestamp} ${r.line.slice(0, 200)}`);
    }
    console.log('');
  }

  if (totalInfoEvents.length > 0) {
    console.log('── Per-day INFO events (timeout fence + pool-detected refresh fails) ───');
    const byDay = eventsByDay(totalInfoEvents);
    for (const day of Object.keys(byDay).sort()) {
      console.log(`  ${day}: ${byDay[day]} events`);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════════════════');
  if (totalFailEvents.length === 0) {
    console.log('VERDICT: PASS — zero TEC_STALE_FAIL_CLOSED events post-deploy');
    if (totalInfoEvents.length > 0) {
      console.log(`         (${totalInfoEvents.length} INFO events = timeout fence + pool detected refresh issues cleanly; this is the fix working as designed)`);
    }
    console.log('═══════════════════════════════════════════════════════════════════════════');
    if (ackAlertId) {
      await ackAlert(ackAlertId, ackBy);
    }
    process.exit(0);
  } else {
    console.log('VERDICT: FAIL — TEC_STALE_FAIL_CLOSED still firing post-deploy');
    console.log(`         ${totalFailEvents.length} event(s) detected. Investigate:`);
    console.log('         1. Check /var/log/dawntrader/tec_diag/ for pg_stat_activity + ss snapshots from the incident');
    console.log('         2. Run /api/diagnostics/tec-config to see live state of inFlight Map + last-success timestamps');
    console.log('         3. If ss capture shows dead-but-ESTABLISHED sockets, keepalive is not reaching the failure mode — consider tightening keepAliveInitialDelayMillis');
    console.log('         4. If ss shows clean sockets but TEC still stale, there is a NEW failure mode B-NEW-40 did not cover — escalate to Langston');
    console.log('         DO NOT auto-ack the soak alert. Manual review required.');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(2);
});
