/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-DISK-FILE-TIERING amendment 4, increment 3c — the COLD METER and the BUDGETED READ-BACK (one daily job)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Pre-audit "3c Step 2" r1, "3c plan r2", "3c plan r3" (Langston PROCEED, Discord 1571165004999426089).
 *
 * One run, in this order:
 *   1. MANIFEST FIRST — every cold row (no state filter: plan r3 edit 3), with its provider id and bytes.
 *   2. LIST SECOND — the whole cold bucket, paged; a partial listing FAILS the run (C-2) before any meter row.
 *      Only `action === 'upload'` versions count (hide markers are not stored bytes).
 *   3. METER — always, before the read-back:
 *        - totals and bytes by owner class: archive (our manifest tables), proof (`_proof/`, ours-untracked),
 *          liveness (`_liveness/`), token-watch (CC-INFRA's), unknown;
 *        - the archive class is a SET reconcile on file id against the bound cold rows (C-2): untracked (listed,
 *          no bound row, not an unbound row's name), missing (bound row, not listed), size_mismatch (provider_bytes ≠
 *          contentLength). A listed version uploaded inside this run's own window is in_flight — logged, not paged.
 *        - delta checks only where we track no objects: token-watch growth/day and _liveness growth;
 *        - unknown pages on any bytes; `_proof/` pages when one file id survives two consecutive runs (C-1);
 *        - the bucket total pages at cold_meter_warn_bytes ("alerted, uncapped").
 *      The meter row is written HERE, so a read-back crash still leaves it.
 *   4. READ-BACK — bound rows due (never read back, or last ok older than the min interval), oldest first, inside
 *      the daily byte budget, at most max_objects per run, and never past the run deadline. By file id, bounded,
 *      SHA-256 compared. Cap refusals and an unidentified (non-JSON) 429 END THE LEG and are recorded with their
 *      cause (C-4); a mismatch is CRITICAL; any other failure is counted and retried tomorrow (no in-run retry, A-5).
 *   5. Coverage, stall and unbound pages from the meter history (C-3, C-5, plan r3 edit 5).
 *   6. DONE line on every exit path (plan r3 edit 1), which archival-health grades.
 *
 * Downloads spend the SHARED 1 GB/day B2 download cap (token-watch reads back on it too) — this job's own budget is
 * `cold_readback_daily_bytes`; nothing measures account-wide spend, so a cap refusal ends the leg, never the run.
 *
 * Cron line (root crontab on staging — daily 04:10 UTC):
 *   10 4 * * * su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b75-cold-audit.ts" >> /var/log/dawntrader/b75-cold-audit.log 2>&1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {
  getStorageClient,
  phaseBudgetMs,
  type B2ListedVersion,
  type ColdTransferLimits,
  type TransferPhaseLog,
} from '../services/data-archive/storage-client.js';
import { B2CallError } from '../services/data-archive/b2-retry.js';
import { coldLimitsFromMap, COLD_LIMIT_KEYS } from '../services/data-archive/cold-limits.js';
import { COLD_NON_ARCHIVE_PREFIXES, ownColdPrefixes } from './b75-cold-bind.js';
import { isDirectEntry } from './direct-entry.js';

const TAG = '[B75 cold-audit]';
const DAY_MS = 86_400_000;
/** The listing allowance the loader reserves inside the run deadline (plan r3 edit 1): 5 setup budgets. */
export const LISTING_ALLOWANCE_SETUPS = 5;
/** #1117's rule: at most this many bytes of a refusal body that failed JSON decoding is kept. */
export const CAUSE_DETAIL_MAX_BYTES = 2048;

// ───────────────────────────────────────────── config ─────────────────────────────────────────────

export const AUDIT_SETTING_KEYS = {
  warnBytes: 'cold_meter_warn_bytes',
  tokenWatchGrowthPerDay: 'cold_meter_tokenwatch_growth_warn_bytes_per_day',
  livenessGrowth: 'cold_meter_liveness_growth_warn_bytes',
  dailyBytes: 'cold_readback_daily_bytes',
  minIntervalDays: 'cold_readback_min_interval_days',
  stallDays: 'cold_readback_stall_days',
  maxAgeDays: 'cold_readback_max_age_days',
  maxObjects: 'cold_readback_max_objects_per_run',
  runDeadlineMs: 'cold_audit_run_deadline_ms',
} as const;

export interface AuditConfig {
  coldBucket: string;
  freeFloorBytes: number;
  limits: ColdTransferLimits;
  warnBytes: number;
  tokenWatchGrowthPerDay: number;
  livenessGrowth: number;
  dailyBytes: number;
  minIntervalDays: number;
  stallDays: number;
  maxAgeDays: number;
  maxObjects: number;
  runDeadlineMs: number;
}

/**
 * Pure: the config from the data_lifecycle rows. Every numeric key must be a positive finite number (no default);
 * then the run must FIT its deadline (plan r3 edit 1): the read-back's worst case
 * (dailyBytes ÷ floor + maxObjects × setup) plus a listing allowance of LISTING_ALLOWANCE_SETUPS × setup.
 */
export function auditConfigFromMap(map: Map<string, unknown>): AuditConfig {
  const num = (key: string): number => {
    const v = map.get(key);
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${TAG} REFUSED — data_lifecycle.${key} is missing, non-numeric or <= 0 (${JSON.stringify(v)})`);
    return n;
  };
  const bucket = map.get('cold_bucket');
  if (typeof bucket !== 'string' || bucket.length === 0) throw new Error(`${TAG} REFUSED — data_lifecycle.cold_bucket is missing`);
  const limits = coldLimitsFromMap(map, 'B75 cold-audit');
  const cfg: AuditConfig = {
    coldBucket: bucket,
    freeFloorBytes: num('disk_file_free_floor_bytes'),
    limits,
    warnBytes: num(AUDIT_SETTING_KEYS.warnBytes),
    tokenWatchGrowthPerDay: num(AUDIT_SETTING_KEYS.tokenWatchGrowthPerDay),
    livenessGrowth: num(AUDIT_SETTING_KEYS.livenessGrowth),
    dailyBytes: num(AUDIT_SETTING_KEYS.dailyBytes),
    minIntervalDays: num(AUDIT_SETTING_KEYS.minIntervalDays),
    stallDays: num(AUDIT_SETTING_KEYS.stallDays),
    maxAgeDays: num(AUDIT_SETTING_KEYS.maxAgeDays),
    maxObjects: num(AUDIT_SETTING_KEYS.maxObjects),
    runDeadlineMs: num(AUDIT_SETTING_KEYS.runDeadlineMs),
  };
  const worst = readBackWorstCaseMs(cfg);
  const room = cfg.runDeadlineMs - LISTING_ALLOWANCE_SETUPS * limits.setupMs;
  if (worst > room) {
    throw new Error(
      `${TAG} REFUSED — the read-back worst case ${worst} ms (${cfg.dailyBytes} B ÷ ${limits.minBytesPerSec} B/s + ` +
        `${cfg.maxObjects} × ${limits.setupMs} ms) does not fit the run deadline ${cfg.runDeadlineMs} ms less the listing ` +
        `allowance ${LISTING_ALLOWANCE_SETUPS} × ${limits.setupMs} ms`,
    );
  }
  return cfg;
}

export function readBackWorstCaseMs(cfg: Pick<AuditConfig, 'dailyBytes' | 'maxObjects' | 'limits'>): number {
  return Math.ceil((cfg.dailyBytes / cfg.limits.minBytesPerSec) * 1000) + cfg.maxObjects * cfg.limits.setupMs;
}

async function loadAuditConfig(client: pg.Client): Promise<AuditConfig> {
  const keys = ['cold_bucket', 'disk_file_free_floor_bytes', ...Object.values(COLD_LIMIT_KEYS), ...Object.values(AUDIT_SETTING_KEYS)];
  const r = await client.query<{ constant_name: string; value: unknown }>(
    `SELECT constant_name, value FROM module_constants
      WHERE module_name = 'data_lifecycle' AND constant_name = ANY($1::text[])
        AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'`,
    [keys],
  );
  return auditConfigFromMap(new Map(r.rows.map((x) => [x.constant_name, x.value])));
}

// ───────────────────────────────────────────── meter ─────────────────────────────────────────────

export type OwnerClass = 'archive' | 'proof' | 'liveness' | 'token-watch' | 'unknown';

/** Pure: a stored name's owner class. `archivePrefixes` = our manifest tables (ownColdPrefixes minus `_proof`). */
export function ownerOf(fileName: string, archivePrefixes: Set<string>): OwnerClass {
  const seg = fileName.split('/')[0];
  if (seg === '_proof') return 'proof';
  if (archivePrefixes.has(seg)) return 'archive';
  const kind = COLD_NON_ARCHIVE_PREFIXES.get(seg);
  if (seg === '_liveness' && kind === 'ours-untracked') return 'liveness';
  if (seg === 'token-watch' && kind === 'other-owner') return 'token-watch';
  return 'unknown';
}

export interface MeterTotals {
  versions: number;
  bytes: number;
  byOwner: Record<OwnerClass, number>;
  proofIds: string[];
  unknownNames: string[];
}

/** Pure: upload-version totals by owner (hide markers are not stored bytes). */
export function meterTotals(versions: B2ListedVersion[], archivePrefixes: Set<string>): MeterTotals {
  const byOwner: Record<OwnerClass, number> = { archive: 0, proof: 0, liveness: 0, 'token-watch': 0, unknown: 0 };
  const proofIds: string[] = [];
  const unknownNames: string[] = [];
  let n = 0;
  let bytes = 0;
  for (const v of versions) {
    if (v.action !== 'upload') continue;
    const len = Number(v.contentLength);
    n++;
    bytes += len;
    const o = ownerOf(v.fileName, archivePrefixes);
    byOwner[o] += len;
    if (o === 'proof') proofIds.push(v.fileId);
    if (o === 'unknown') unknownNames.push(v.fileName);
  }
  return { versions: n, bytes, byOwner, proofIds: proofIds.sort(), unknownNames };
}

export interface ColdManifestRow {
  id: string;
  storage_uri: string;
  provider_file_id: string | null;
  provider_bytes: number | null;
  bytes_compressed: number;
  checksum: string;
  verified_at: Date | null;
  state: string;
}

export interface Reconcile {
  untracked: B2ListedVersion[];
  missing: ColdManifestRow[];
  sizeMismatch: { row: ColdManifestRow; version: B2ListedVersion }[];
  inFlight: B2ListedVersion[];
}

/**
 * Pure: the SET reconcile on file id for the archive class (C-2). `windowStartMs` = this run's start: a listed
 * version uploaded at or after it is in_flight (the manifest was read first, so a mid-run upload can only appear as
 * listed-without-row). Deletions have no such window (plan r3 edit 3): a bound version deleted mid-run pages missing.
 * A version whose NAME is an unbound cold row's path is that row's, not untracked (it is counted as unbound instead).
 */
export function reconcileArchive(
  rows: ColdManifestRow[],
  versions: B2ListedVersion[],
  archivePrefixes: Set<string>,
  windowStartMs: number,
  pathOf: (uri: string) => string | null,
): Reconcile {
  const archive = versions.filter((v) => v.action === 'upload' && ownerOf(v.fileName, archivePrefixes) === 'archive');
  const bound = new Map(rows.filter((r) => r.provider_file_id).map((r) => [r.provider_file_id as string, r]));
  const unboundPaths = new Set(rows.filter((r) => !r.provider_file_id).map((r) => pathOf(r.storage_uri)).filter((p): p is string => !!p));
  const listed = new Map(archive.map((v) => [v.fileId, v]));
  const out: Reconcile = { untracked: [], missing: [], sizeMismatch: [], inFlight: [] };
  for (const v of archive) {
    const row = bound.get(v.fileId);
    if (row) {
      if (row.provider_bytes !== null && Number(row.provider_bytes) !== Number(v.contentLength)) out.sizeMismatch.push({ row, version: v });
      continue;
    }
    if (unboundPaths.has(v.fileName)) continue;
    if (v.uploadTimestamp >= windowStartMs) out.inFlight.push(v);
    else out.untracked.push(v);
  }
  for (const [id, row] of bound) if (!listed.has(id)) out.missing.push(row);
  return out;
}

export interface MeterHistoryRow {
  run_at: Date;
  bytes_by_owner: Partial<Record<OwnerClass, number>>;
  proof_ids: string[];
  due: number | null;
  readback_ok: number | null;
  budget_cause: string | null;
  skipped_unbound: number;
}

export interface Page {
  key: string;
  severity: 'warning' | 'critical';
  title: string;
  body: string;
}

/** Pure: the meter's pages from this run's totals and the previous meter row (null on the first run = baseline). */
export function meterPages(cur: MeterTotals, prev: MeterHistoryRow | null, nowMs: number, cfg: Pick<AuditConfig, 'warnBytes' | 'tokenWatchGrowthPerDay' | 'livenessGrowth'>): Page[] {
  const pages: Page[] = [];
  if (cur.bytes >= cfg.warnBytes) {
    pages.push({ key: 'cold-meter-total', severity: 'warning', title: 'Cold bucket past its warning size (alerted, uncapped)',
      body: `The cold bucket holds ${cur.bytes} bytes in ${cur.versions} stored versions, at or above cold_meter_warn_bytes ${cfg.warnBytes}. Storage is alerted, not capped: uploads do not stop.` });
  }
  if (cur.byOwner.unknown > 0) {
    pages.push({ key: 'cold-meter-unknown', severity: 'warning', title: 'Cold bucket holds objects under an UNKNOWN prefix',
      body: `${cur.unknownNames.length} stored version(s), ${cur.byOwner.unknown} bytes, sit under a prefix that is neither an archive table nor a known owner: ${cur.unknownNames.slice(0, 10).join(', ')}` });
  }
  if (prev) {
    const days = Math.max((nowMs - prev.run_at.getTime()) / DAY_MS, 1 / 24);
    const tw = cur.byOwner['token-watch'] - Number(prev.bytes_by_owner['token-watch'] ?? 0);
    if (tw / days > cfg.tokenWatchGrowthPerDay) {
      pages.push({ key: 'cold-meter-tokenwatch-growth', severity: 'warning', title: 'token-watch/ in the cold bucket is growing faster than its baseline',
        body: `token-watch/ grew ${tw} bytes over ${days.toFixed(2)} days (${Math.round(tw / days)} B/day), above cold_meter_tokenwatch_growth_warn_bytes_per_day ${cfg.tokenWatchGrowthPerDay}. Its owner is CC-INFRA.` });
    }
    const lv = cur.byOwner.liveness - Number(prev.bytes_by_owner.liveness ?? 0);
    if (lv > cfg.livenessGrowth) {
      pages.push({ key: 'cold-meter-liveness-growth', severity: 'warning', title: '_liveness/ in the cold bucket grew past its bound',
        body: `_liveness/ grew ${lv} bytes since the last meter run, above cold_meter_liveness_growth_warn_bytes ${cfg.livenessGrowth}. The canary's object is 104 bytes.` });
    }
    const survivors = cur.proofIds.filter((id) => prev.proof_ids.includes(id));
    if (survivors.length > 0) {
      pages.push({ key: 'cold-meter-proof-survivor', severity: 'warning', title: 'A _proof/ object outlived its proof',
        body: `${survivors.length} _proof/ version(s) were present at two consecutive meter runs: ${survivors.join(', ')}. A 3a proof deletes its objects at its end.` });
    }
  }
  return pages;
}

/** Per-kind cap on minted pages; past it, one overflow summary page carries the count (Langston 3c Step 4 C-1). */
export const RECONCILE_PAGE_CAP = 25;

/**
 * Pure: one page PER OBJECT, keyed by its file id (Langston 3c Step 4 C-1). addAlert returns an existing unresolved
 * row unchanged for a dedupe key, so a single set-wide key would let the first (e.g. day-1 residue awaiting Kyle's
 * delete) mute every later object. Capped at RECONCILE_PAGE_CAP per kind, plus one overflow page with the count.
 */
export function reconcilePages(rc: Reconcile): Page[] {
  const pages: Page[] = [];
  const each = <T>(items: T[], kind: string, severity: Page['severity'], title: string, idOf: (x: T) => string, bodyOf: (x: T) => string) => {
    for (const x of items.slice(0, RECONCILE_PAGE_CAP)) pages.push({ key: `cold-reconcile-${kind}-${idOf(x)}`, severity, title, body: bodyOf(x) });
    if (items.length > RECONCILE_PAGE_CAP) {
      pages.push({ key: `cold-reconcile-${kind}-overflow`, severity, title: `${title} — more than ${RECONCILE_PAGE_CAP}`,
        body: `${items.length} in all; the first ${RECONCILE_PAGE_CAP} have their own alert, the rest are in the run's log.` });
    }
  };
  each(rc.untracked, 'untracked', 'warning', 'A cold archive object that no manifest row binds', (v) => v.fileId,
    (v) => `${v.fileName} id=${v.fileId} bytes=${v.contentLength} uploaded=${new Date(v.uploadTimestamp).toISOString()} sits in our archive prefixes and matches no bound cold row: an upload the manifest does not know, or residue.`);
  each(rc.missing, 'missing', 'critical', 'A cold manifest row whose bound object is NOT in the bucket', (r) => r.provider_file_id as string,
    (r) => `${r.storage_uri} is bound to file id ${r.provider_file_id}, which the bucket listing does not hold.`);
  each(rc.sizeMismatch, 'size', 'critical', 'A cold object whose stored size differs from the manifest', (m) => m.version.fileId,
    (m) => `${m.row.storage_uri} id=${m.version.fileId}: manifest ${m.row.provider_bytes} B, stored ${m.version.contentLength} B.`);
  return pages;
}

// ───────────────────────────────────────────── read-back ─────────────────────────────────────────────

/** Pure: bound rows due for a read-back, oldest first (never-read first, then by last ok, then verified_at). */
export function selectDue(rows: ColdManifestRow[], lastOk: Map<string, Date>, nowMs: number, minIntervalDays: number): ColdManifestRow[] {
  const cutoff = nowMs - minIntervalDays * DAY_MS;
  const t = (d: Date | null | undefined) => (d ? d.getTime() : -Infinity);
  return rows
    .filter((r) => r.provider_file_id && t(lastOk.get(r.id)) < cutoff)
    .sort((a, b) => t(lastOk.get(a.id)) - t(lastOk.get(b.id)) || t(a.verified_at) - t(b.verified_at) || a.id.localeCompare(b.id));
}

export type StopReason = 'none' | 'own' | 'cap' | 'time' | 'disk';

/** Pure: may the next object be read — the own budget, the object count and the run deadline (plan r3 edit 1). */
export function nextFits(
  bytes: number,
  spent: { bytesRead: number; objects: number; elapsedMs: number },
  cfg: Pick<AuditConfig, 'dailyBytes' | 'maxObjects' | 'runDeadlineMs' | 'limits'>,
): StopReason | 'go' {
  if (spent.objects >= cfg.maxObjects) return 'own';
  if (spent.bytesRead + bytes > cfg.dailyBytes) return 'own';
  if (spent.elapsedMs + phaseBudgetMs(bytes, cfg.limits) > cfg.runDeadlineMs) return 'time';
  return 'go';
}

export type DownloadFailure =
  | { kind: 'budget'; cause: 'download_cap_exceeded' | 'transaction_cap_exceeded' | 'throttled_429_unidentified'; retryAfterMs: number | null; detail: string | null }
  | { kind: 'error'; message: string };

/**
 * Pure: how a download failure ends. A B2 cap refusal or a 429 with no B2 code (a non-JSON body: a proxy or CDN
 * throttle) ENDS THE LEG (C-4). This does not reverse amendment 3: for the RETRY decision a 429 with code null stays
 * fatal (b2-retry.ts classifyB2) — downloads are never retried (A-5); this answers whether to end the leg.
 * #1117's capture rule: only a non-empty body that failed JSON decoding is kept, bounded.
 */
export function classifyDownloadFailure(err: unknown): DownloadFailure {
  if (err instanceof B2CallError) {
    if (err.code === 'download_cap_exceeded' || err.code === 'transaction_cap_exceeded') {
      return { kind: 'budget', cause: err.code, retryAfterMs: err.retryAfterMs, detail: null };
    }
    if (err.status === 429 && err.code === null) {
      const detail = err.text.length > 0 ? Buffer.from(err.text, 'utf8').subarray(0, CAUSE_DETAIL_MAX_BYTES).toString('utf8') : null;
      return { kind: 'budget', cause: 'throttled_429_unidentified', retryAfterMs: err.retryAfterMs, detail };
    }
  }
  return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
}

/** Pure: coverage age in days = now − the latest of (last ok, verified_at, first 3c run) (C-5). */
export function coverageAgeDays(row: ColdManifestRow, lastOk: Date | undefined, firstRunAt: Date, nowMs: number): number {
  const start = Math.max(lastOk?.getTime() ?? -Infinity, row.verified_at?.getTime() ?? -Infinity, firstRunAt.getTime());
  return (nowMs - start) / DAY_MS;
}

/** Pure: stall / throttle / unbound pages from the last `k` meter rows, newest first, this run included. */
export function historyPages(history: MeterHistoryRow[], k: number): Page[] {
  const pages: Page[] = [];
  const last = history.slice(0, k);
  if (last.length < k) return pages;
  if (last.every((h) => (h.due ?? 0) > 0 && (h.readback_ok ?? 0) === 0)) {
    pages.push({ key: 'cold-readback-stall', severity: 'warning', title: 'Cold read-back made no progress',
      body: `The last ${k} runs each had objects due and read back none successfully.` });
  }
  if (last.every((h) => h.budget_cause === 'throttled_429_unidentified')) {
    pages.push({ key: 'cold-readback-throttled', severity: 'warning', title: 'Cold read-back throttled by an unidentified 429',
      body: `The last ${k} runs each ended their read-back on a 429 with no B2 error code (a proxy or CDN throttle), whatever else they read.` });
  }
  if (last.every((h) => h.skipped_unbound > 0)) {
    pages.push({ key: 'cold-readback-unbound', severity: 'warning', title: 'A cold row that will not bind is never read back',
      body: `The last ${k} runs each skipped cold rows with no provider_file_id (${last[0].skipped_unbound} now). Run b75-cold-bind.ts to see why they do not bind.` });
  }
  return pages;
}

// ───────────────────────────────────────────── the read-back leg ─────────────────────────────────────────────

export interface ReadBackRecord {
  manifestId: string;
  fileId: string;
  bytes?: number | null;
  result: 'ok' | 'mismatch' | 'budget_exhausted' | 'error';
  sha256?: string | null;
  cause?: string | null;
  retryAfterMs?: number | null;
  detail?: string | null;
  error?: string | null;
}

export interface ReadBackDeps {
  download: (fileId: string, localPath: string, expectedBytes: number, onPhase: (p: TransferPhaseLog) => void) => Promise<{ bytes: number; checksum: string }>;
  record: (r: ReadBackRecord) => Promise<void>;
  freeBytes: (dir: string) => number;
  page: (p: Page) => Promise<void>;
  elapsedMs: () => number;
}

export interface ReadBackResult {
  stop: StopReason;
  cause: string | null;
  readOk: number;
  readFailed: number;
  readCount: number;
  bytesRead: number;
  deferred: number;
  okIds: string[];
}

/**
 * The read-back leg over the due rows, in order. Extracted so every arm runs under test (Langston 3c Step 4: the
 * oversize, free-space and budget arms were inspection-only). Per object: oversize → page + deferred; nextFits →
 * stop (own | time); free space → the LEG ends (C-3, `disk`); download → ok | mismatch (critical page); a budget
 * refusal → the LEG ends (`cap`); any other error → an `error` row. Bytes that landed are charged whether or not the
 * attempt completed (C-2), so `dailyBytes` is a ceiling.
 */
export async function runReadBack(due: ColdManifestRow[], cfg: Pick<AuditConfig, 'dailyBytes' | 'maxObjects' | 'runDeadlineMs' | 'limits' | 'freeFloorBytes'>, tmpDir: string, deps: ReadBackDeps): Promise<ReadBackResult> {
  const out: ReadBackResult = { stop: 'none', cause: null, readOk: 0, readFailed: 0, readCount: 0, bytesRead: 0, deferred: 0, okIds: [] };
  for (let i = 0; i < due.length; i++) {
    const row = due[i];
    const fileId = row.provider_file_id as string;
    const bytes = Number(row.provider_bytes ?? row.bytes_compressed);
    if (bytes > cfg.dailyBytes) {
      await deps.page({ key: `cold-readback-oversize-${row.id}`, severity: 'warning', title: 'A cold object is larger than the daily read-back budget',
        body: `${row.storage_uri} (${bytes} B) exceeds cold_readback_daily_bytes ${cfg.dailyBytes}; it is never read back while the budget stands.` });
      out.deferred++;
      continue;
    }
    const fit = nextFits(bytes, { bytesRead: out.bytesRead, objects: out.readCount, elapsedMs: deps.elapsedMs() }, cfg);
    if (fit !== 'go') { out.stop = fit; out.deferred += due.length - i; break; }
    const free = deps.freeBytes(tmpDir);
    if (!(free >= bytes + cfg.freeFloorBytes)) {
      // C-3: free space is global, so the leg ends here — one row, not one per due object
      console.error(`${TAG} REFUSED read-back of ${row.storage_uri}: ${free} bytes free, need ${bytes + cfg.freeFloorBytes}; read-back leg ended (disk)`);
      out.readFailed++;
      out.stop = 'disk';
      out.deferred += due.length - i - 1;
      await deps.record({ manifestId: row.id, fileId, bytes, result: 'error', error: `free space ${free} < ${bytes + cfg.freeFloorBytes}` });
      break;
    }
    const local = path.join(tmpDir, `${row.id}.gz`);
    out.readCount++;
    let charged = false;
    try {
      const dl = await deps.download(fileId, local, bytes, (p) => {
        if (p.outcome !== 'ok') console.warn(`${TAG} ${row.storage_uri} id=${fileId} ${JSON.stringify(p)}`);
      });
      out.bytesRead += dl.bytes;
      charged = true;
      const ok = dl.checksum === row.checksum;
      await deps.record({ manifestId: row.id, fileId, bytes: dl.bytes, result: ok ? 'ok' : 'mismatch', sha256: dl.checksum });
      if (ok) {
        out.readOk++;
        out.okIds.push(row.id);
        console.log(`${TAG} OK ${row.storage_uri} id=${fileId} bytes=${dl.bytes}`);
      } else {
        out.readFailed++;
        console.error(`${TAG} MISMATCH ${row.storage_uri} id=${fileId}: manifest ${row.checksum}, read ${dl.checksum}`);
        await deps.page({ key: `cold-readback-mismatch-${row.id}`, severity: 'critical', title: 'A cold object read back with the WRONG SHA-256',
          body: `${row.storage_uri} (version ${fileId}, ${dl.bytes} B): the manifest's SHA-256 is ${row.checksum}; the bytes read back hash to ${dl.checksum}.` });
      }
    } catch (err) {
      const f = classifyDownloadFailure(err);
      if (f.kind === 'budget') {
        out.readCount--; // a refusal is not a read; any bytes that landed are still charged below
        out.stop = 'cap';
        out.cause = f.cause;
        out.deferred += due.length - i;
        console.warn(`${TAG} daily download budget exhausted (${f.cause}) at ${row.storage_uri}; read-back leg ended, the meter stands`);
        await deps.record({ manifestId: row.id, fileId, result: 'budget_exhausted', cause: f.cause, retryAfterMs: f.retryAfterMs, detail: f.detail });
        break;
      }
      out.readFailed++;
      console.error(`${TAG} ERROR ${row.storage_uri} id=${fileId}: ${f.message}`);
      await deps.record({ manifestId: row.id, fileId, bytes, result: 'error', error: f.message.slice(0, 1000) });
    } finally {
      // C-2: an attempt that did not complete still spent its bytes at B2 — charge what landed, measured, so the
      // byte budget is a ceiling and not a count of successes
      if (!charged && fs.existsSync(local)) out.bytesRead += fs.statSync(local).size;
      fs.rmSync(local, { force: true });
    }
  }
  return out;
}

// ───────────────────────────────────────────── run ─────────────────────────────────────────────

async function page(p: Page): Promise<void> {
  try {
    const { addAlert } = await import('../services/system-alerts.js');
    await addAlert({
      triggers_at: new Date(),
      category: 'health_check',
      severity: p.severity,
      title: p.title,
      body: p.body,
      metadata: { source: 'b75-cold-audit', batch: 'B-DISK-FILE-TIERING', check: p.key },
      dedupe_key: `b75-cold-audit-${p.key}`,
    });
  } catch (err) {
    console.error(`${TAG} failed to raise ${p.key}:`, err);
  }
}

function coldPath(uri: string): string | null {
  const m = /^b2:\/\/[^/]+\/(.+)$/.exec(uri);
  return m ? m[1] : null;
}

async function main(): Promise<number> {
  const startedAt = new Date();
  console.log(`${TAG} started at ${startedAt.toISOString()} pid=${process.pid}`);
  const t0 = Date.now();
  const done: Record<string, string | number> = { versions: 0, bytes: 0, due: 0, bytes_due: 0, read: 0, bytes_read: 0, deferred_budget: 0, readback_ok: 0, readback_failed: 0, budget_stop: 'none', skipped_unbound: 0, untracked: 0, missing: 0, size_mismatch: 0, in_flight: 0 };
  let failed = false;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  let tmpDir: string | null = null;
  try {
    await client.connect();
    const cfg = await loadAuditConfig(client);

    // 1. manifest first — every cold row, no state filter
    const rows = (await client.query<ColdManifestRow>(
      `SELECT id, storage_uri, provider_file_id, provider_bytes, bytes_compressed, checksum, verified_at, state
         FROM data_archive_manifest WHERE tier = 'cold'`,
    )).rows;
    const tables = await client.query<{ source_table: string }>(`SELECT DISTINCT source_table FROM data_archive_manifest`);
    const archivePrefixes = ownColdPrefixes(tables.rows.map((t) => t.source_table));
    archivePrefixes.delete('_proof');

    // 2. list second — partial = throw (C-2), before any meter row
    const storage = getStorageClient();
    const listing = await storage.listColdFileVersions(cfg.coldBucket, '', cfg.limits.setupMs);

    // 3. meter
    const totals = meterTotals(listing.versions, archivePrefixes);
    const rc = reconcileArchive(rows, listing.versions, archivePrefixes, startedAt.getTime(), coldPath);
    const unbound = rows.filter((r) => !r.provider_file_id).length;
    Object.assign(done, { versions: totals.versions, bytes: totals.bytes, untracked: rc.untracked.length, missing: rc.missing.length, size_mismatch: rc.sizeMismatch.length, in_flight: rc.inFlight.length, skipped_unbound: unbound });
    console.log(`${TAG} METER pages=${listing.pages} versions=${totals.versions} bytes=${totals.bytes} by_owner=${JSON.stringify(totals.byOwner)} cold_rows=${rows.length} unbound=${unbound}`);
    for (const v of rc.inFlight) console.log(`${TAG} IN_FLIGHT ${v.fileName} id=${v.fileId} uploaded=${new Date(v.uploadTimestamp).toISOString()} (not paged; pages next run if still unbound)`);
    const prevRes = await client.query<MeterHistoryRow>(
      `SELECT run_at, bytes_by_owner, proof_ids, due, readback_ok, budget_cause, skipped_unbound
         FROM data_archive_cold_meter ORDER BY run_at DESC LIMIT 1`,
    );
    const prev = prevRes.rows[0] ?? null;
    if (!prev) console.log(`${TAG} first run: baseline recorded, no growth judgement`);
    for (const p of [...meterPages(totals, prev, startedAt.getTime(), cfg), ...reconcilePages(rc)]) {
      console.log(`${TAG} PAGE ${p.key}: ${p.body}`);
      await page(p);
    }
    const meterId = (await client.query<{ id: string }>(
      `INSERT INTO data_archive_cold_meter (run_at, versions, bytes, bytes_by_owner, proof_ids, untracked, missing, size_mismatch, in_flight, skipped_unbound)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [startedAt, totals.versions, totals.bytes, JSON.stringify(totals.byOwner), totals.proofIds, rc.untracked.length, rc.missing.length, rc.sizeMismatch.length, rc.inFlight.length, unbound],
    )).rows[0].id;

    // 4. read-back
    const okRes = await client.query<{ manifest_id: string; last_ok: Date }>(
      `SELECT manifest_id, max(at) AS last_ok FROM data_archive_cold_readback WHERE result = 'ok' GROUP BY manifest_id`,
    );
    const lastOk = new Map(okRes.rows.map((r) => [r.manifest_id, r.last_ok]));
    const due = selectDue(rows, lastOk, startedAt.getTime(), cfg.minIntervalDays);
    const bytesDue = due.reduce((s, r) => s + Number(r.provider_bytes ?? r.bytes_compressed), 0);
    Object.assign(done, { due: due.length, bytes_due: bytesDue });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b75-cold-audit-'));
    fs.chmodSync(tmpDir, 0o700);
    const rb = await runReadBack(due, cfg, tmpDir, {
      download: (fileId, local, bytes, onPhase) => storage.downloadColdFileById(fileId, local, { expectedBytes: bytes, limits: cfg.limits, onPhase }),
      record: async (r) => {
        await client.query(
          `INSERT INTO data_archive_cold_readback (manifest_id, file_id, at, bytes, result, sha256_seen, cause, retry_after_ms, cause_detail, error)
           VALUES ($1, $2, now(), $3, $4, $5, $6, $7, $8, $9)`,
          [r.manifestId, r.fileId, r.bytes ?? null, r.result, r.sha256 ?? null, r.cause ?? null, r.retryAfterMs ?? null, r.detail ?? null, r.error ?? null],
        );
      },
      freeBytes: (dir) => { const st = fs.statfsSync(dir); return Number(st.bavail) * Number(st.bsize); },
      page,
      elapsedMs: () => Date.now() - t0,
    });
    const { stop, cause, readOk, readFailed, readCount, bytesRead, deferred } = rb;
    for (const id of rb.okIds) lastOk.set(id, new Date()); // the coverage check below sees this run's reads
    Object.assign(done, { read: readCount, bytes_read: bytesRead, deferred_budget: deferred, readback_ok: readOk, readback_failed: readFailed, budget_stop: stop });
    await client.query(
      `UPDATE data_archive_cold_meter SET due = $2, bytes_due = $3, read_count = $4, bytes_read = $5, deferred_budget = $6,
              readback_ok = $7, readback_failed = $8, budget_stop = $9, budget_cause = $10, finished_at = now() WHERE id = $1`,
      [meterId, due.length, bytesDue, readCount, bytesRead, deferred, readOk, readFailed, stop, cause],
    );

    // 5. coverage, stall, throttle, unbound
    const firstRun = (await client.query<{ first: Date }>(`SELECT min(run_at) AS first FROM data_archive_cold_meter`)).rows[0].first;
    const stale = rows
      .filter((r) => r.provider_file_id)
      .map((r) => ({ r, age: coverageAgeDays(r, lastOk.get(r.id), firstRun, Date.now()) }))
      .filter((x) => x.age > cfg.maxAgeDays);
    if (stale.length > 0) {
      await page({ key: 'cold-readback-coverage', severity: 'warning', title: 'Cold objects not read back within the coverage period',
        body: `${stale.length} bound cold object(s) have gone more than cold_readback_max_age_days ${cfg.maxAgeDays} since their last read-back: ${stale.slice(0, 10).map((x) => `${x.r.storage_uri} (${x.age.toFixed(1)} d)`).join('; ')}` });
    }
    const hist = (await client.query<MeterHistoryRow>(
      `SELECT run_at, bytes_by_owner, proof_ids, due, readback_ok, budget_cause, skipped_unbound
         FROM data_archive_cold_meter WHERE finished_at IS NOT NULL ORDER BY run_at DESC LIMIT $1`,
      [cfg.stallDays],
    )).rows;
    for (const p of historyPages(hist, cfg.stallDays)) {
      console.log(`${TAG} PAGE ${p.key}: ${p.body}`);
      await page(p);
    }
  } catch (err) {
    failed = true;
    console.error(`${TAG} FAILED:`, err);
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    await client.end().catch(() => {});
    const n = Number(done.bytes_read) > 0 ? (Number(done.bytes_due) / Number(done.bytes_read)).toFixed(1) : 'undefined';
    const fields = Object.entries(done).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`${TAG} DONE ${fields} N=${n} failed=${failed ? 1 : 0} elapsed_ms=${Date.now() - t0}`);
  }
  return failed ? 1 : 0;
}

if (isDirectEntry(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (err) => { console.error(`${TAG} fatal:`, err); process.exitCode = 1; });
}
