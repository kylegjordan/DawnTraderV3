/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B75 — Warm → Cold Rotator
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Monthly 03:00 UTC on the 1st. For each manifest row in tier='warm' with
 * `created_at < now() - <warm_retention_days>`, copy the JSONL.gz from the
 * warm bucket to cold tier (Backblaze B2), verify, then delete the warm copy.
 *
 * Cron line:
 *   0 3 1 * * deploy cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b75-cold-rotator.ts >> /var/log/dawntrader/b75-cold-rotator.log 2>&1
 *
 * Until B2 credentials are provisioned (B2_KEY_ID / B2_APPLICATION_KEY /
 * B2_BUCKET) AND `data_lifecycle.cold_rotator_dry_run = false`, this script
 * runs in dry-run mode: enumerates candidates, logs them, performs no I/O.
 *
 * B-STORAGE-HARDEN OBJ-1 (2026-07-08): two OPTIONAL, additive CLI flags for
 * bounded/controlled rotation (default behavior unchanged when both absent):
 *   --limit N                 process at most N candidates (oldest-first)
 *   --warm-retention-days D   override the config warm-retention for THIS run
 * These enable a one-time proof rotation of the single oldest warm object
 * without moving the whole warm tier (see B_STORAGE_HARDEN_PRE_AUDIT.md §3.1),
 * and controlled batch rotation operationally. They do NOT persist any config.
 *
 * Reference: BATCH_75_SCOPE.md §C.10 + BATCH_75_PRE_AUDIT.md §F
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {
  getStorageClient,
  hashFileSha256Sha1,
  type ColdTransferLimits,
  type StorageClient,
  type TransferPhaseLog,
} from '../services/data-archive/storage-client.js';
import { coldLimitsFromMap } from '../services/data-archive/cold-limits.js';
import { isDirectEntry } from './direct-entry.js';

const { Client } = pg;

export interface ColdRotatorConfig {
  warmRetentionDays: number;
  /** B-STORAGE-HARDEN Wave D: optional per-table warm-window overrides, keyed by
   *  source_table. Read from `data_lifecycle.<table>.warm_retention_days`. Empty
   *  by default (all tables use `warmRetentionDays`) — a future one-line dial to
   *  send a rarely-re-read table to cold sooner without a code change. */
  perTableWarmRetentionDays: Map<string, number>;
  coldRotatorDryRun: boolean;
  warmBucket: string;
  warmPrefix: string;
  coldBucket: string;
  coldPrefix: string;
  coldProvider: string;
  /** B-DISK-FILE-TIERING 3a: the local free-space floor the temp file must not cross — the SAME setting the disk-file
   *  tiering job uses (`data_lifecycle.disk_file_free_floor_bytes`), because it is the same disk. */
  freeFloorBytes: number;
  /** 3b (plan r4/r5): per-phase transfer limits, from data_lifecycle (never a literal). */
  coldLimits: ColdTransferLimits;
  /** 3b A-1: the per-run candidate cap (data_lifecycle.cold_rotator_max_candidates_per_run). */
  maxCandidatesPerRun: number;
  /** 3b r5: the whole-run deadline (data_lifecycle.cold_rotator_run_deadline_ms); checked between candidates. */
  runDeadlineMs: number;
}

/** The warm-retention window (days) that applies to a given source_table: its
 *  per-table override if present, else the global default. */
function warmWindowForTable(cfg: ColdRotatorConfig, sourceTable: string): number {
  return cfg.perTableWarmRetentionDays.get(sourceTable) ?? cfg.warmRetentionDays;
}

async function loadConfig(client: pg.Client): Promise<ColdRotatorConfig> {
  const r = await client.query(
    `SELECT constant_name, value FROM module_constants WHERE module_name = 'data_lifecycle'`,
  );
  const map = new Map<string, unknown>();
  for (const row of r.rows) map.set(row.constant_name, row.value);

  function reqStr(key: string): string {
    const v = map.get(key);
    if (typeof v !== 'string') {
      throw new Error(`[B75 rotator] missing or non-string data_lifecycle.${key}`);
    }
    return v;
  }
  function reqNum(key: string): number {
    const v = map.get(key);
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      throw new Error(`[B75 rotator] missing or invalid numeric data_lifecycle.${key}`);
    }
    return v;
  }
  function reqBool(key: string): boolean {
    const v = map.get(key);
    if (typeof v !== 'boolean') {
      throw new Error(`[B75 rotator] missing or non-boolean data_lifecycle.${key}`);
    }
    return v;
  }

  // Wave D: harvest any per-table warm-window overrides. Constant names look like
  // `<table>.warm_retention_days` under module_name='data_lifecycle'. Absent by
  // default → the map is empty and every table uses the global default (behavior
  // byte-identical to before this knob existed).
  const perTableWarmRetentionDays = new Map<string, number>();
  for (const [name, value] of map.entries()) {
    const m = /^(.+)\.warm_retention_days$/.exec(name);
    if (!m) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`[B75 rotator] invalid numeric data_lifecycle.${name}`);
    }
    perTableWarmRetentionDays.set(m[1], value);
  }

  return {
    warmRetentionDays: reqNum('default_warm_retention_days'),
    perTableWarmRetentionDays,
    coldRotatorDryRun: reqBool('cold_rotator_dry_run'),
    warmBucket: reqStr('warm_bucket'),
    warmPrefix: reqStr('warm_prefix'),
    coldBucket: reqStr('cold_bucket'),
    coldPrefix: reqStr('cold_prefix'),
    coldProvider: reqStr('cold_provider'),
    freeFloorBytes: reqNum('disk_file_free_floor_bytes'),
    coldLimits: coldLimitsFromMap(map, 'B75 rotator'),
    maxCandidatesPerRun: reqNum('cold_rotator_max_candidates_per_run'),
    runDeadlineMs: reqNum('cold_rotator_run_deadline_ms'),
  };
}

export interface ColdRotationCandidate {
  id: string;
  source_table: string;
  partition_label: string;
  storage_uri: string;
  row_count: number;
  bytes_compressed: number;
  checksum: string;
  created_at: Date;
}

export async function listColdRotationCandidates(
  client: pg.Client,
  cfg: ColdRotatorConfig,
  nowMs = Date.now(),
): Promise<ColdRotationCandidate[]> {
  // Wave D per-table windows: prefilter in SQL by the SHORTEST applicable window
  // (so no eligible row is excluded), then refine per-table in JS. With NO
  // per-table overrides, minWindow == default → this is exactly the historical
  // `created_at < now - default` single-cutoff behavior.
  const windows = [cfg.warmRetentionDays, ...cfg.perTableWarmRetentionDays.values()];
  const minWindowDays = Math.min(...windows);
  const prefilterCutoff = new Date(nowMs - minWindowDays * 86_400_000);
  const r = await client.query(
    `SELECT id, source_table, partition_label, storage_uri, row_count, bytes_compressed,
            checksum, created_at
       FROM data_archive_manifest
      WHERE tier = 'warm'
        AND state = 'active'
        AND created_at < $1
        -- Skip if a cold row already exists for this partition (rotation in flight or done)
        AND NOT EXISTS (
          SELECT 1 FROM data_archive_manifest m2
           WHERE m2.source_table = data_archive_manifest.source_table
             AND m2.partition_label = data_archive_manifest.partition_label
             AND m2.tier = 'cold'
        )
      ORDER BY created_at ASC`,
    [prefilterCutoff],
  );
  // Per-table refine: keep only rows past THEIR own warm window.
  return (r.rows as ColdRotationCandidate[]).filter(
    (row) => row.created_at.getTime() < nowMs - warmWindowForTable(cfg, row.source_table) * 86_400_000,
  );
}

export interface ColdRotationDependencies {
  // B-DISK-FILE-TIERING 3a (Langston N1): the FILE forms only, so a buffered whole-object method is unreachable from the
  // rotator by type. The liveness canary keeps the Buffer forms for its 104-byte object.
  storage: Pick<StorageClient, 'downloadWarmFile' | 'uploadColdFile' | 'deleteWarm'>;
  createClient: () => pg.Client;
  /** where the private per-object temp folder is made (default: deploy's home); tests pass their own */
  tempRoot?: string;
  /** local free bytes on the temp file's disk (default: statfs of tempRoot); tests pass their own */
  freeBytes?: () => number;
  /** 3b r5: where this candidate's phase logs are collected (the run sums body time from them) */
  phaseSink?: TransferPhaseLog[];
}

/** 3b plan r4 1c: a final upload failure, carrying what the durable record needs. */
export class ColdUploadFailed extends Error {
  constructor(
    readonly cause: unknown,
    readonly attempt: { bucket: string; path: string; bytes: number; sha1: string | null; phases: TransferPhaseLog[] },
  ) {
    super(`[B75 rotator] cold upload failed for ${attempt.path}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'ColdUploadFailed';
  }
}

/** Execute one warm-to-cold state transition. Warm deletion is deliberately
 * outside and after both manifest writes so every thrown mutation leaves the
 * warm copy in place.
 *
 * B-DISK-FILE-TIERING amendment 4 / 3a (= amendment 1 AP-4 + the attestation): streams through a private temp file
 * instead of holding the object in memory three times (P10: 1.06 GiB peak RSS for a 171 MB object), and verifies the
 * cold copy by B2's attestation instead of downloading it back (that re-download was ~100% of rotation egress). */
export async function rotateColdCandidate(
  candidate: ColdRotationCandidate,
  cfg: ColdRotatorConfig,
  deps: ColdRotationDependencies,
): Promise<number> {
  const { bucket: warmBucket, path: warmPath } = parseSupabaseUri(candidate.storage_uri);
  const tempRoot = deps.tempRoot ?? os.homedir();
  const freeBytes = deps.freeBytes ?? (() => { const st = fs.statfsSync(tempRoot); return Number(st.bavail) * Number(st.bsize); });
  const need = 2 * Number(candidate.bytes_compressed) + cfg.freeFloorBytes;
  const free = freeBytes();
  // In production a missing / non-numeric / <= 0 floor already fails the run at loadConfig's reqNum, before any candidate
  // is listed. This guard binds hand-built configs (tests, and the next caller): a missing floor or size makes `need`
  // NaN, and `free < NaN` is false — so refuse per candidate rather than silently skip the check (Langston, 3a Step 4).
  if (!Number.isFinite(need) || !Number.isFinite(free) || free < need) {
    throw new Error(`[B75 rotator] refused ${candidate.id}: ${free} bytes free, need ${need} (2 x object + the ${cfg.freeFloorBytes} floor)`);
  }
  const dir = fs.mkdtempSync(path.join(tempRoot, '.b75-cold-rotator-'));
  fs.chmodSync(dir, 0o700);
  const phases: TransferPhaseLog[] = deps.phaseSink ?? [];
  try {
    const local = path.join(dir, 'object.jsonl.gz');
    const onPhase = (ph: TransferPhaseLog) => {
      phases.push(ph);
      console.log(`[B75 rotator] phase ${JSON.stringify({ candidate: candidate.id, ...ph })}`);
    };
    const warm = await deps.storage.downloadWarmFile(warmBucket, warmPath, local, {
      expectedBytes: Number(candidate.bytes_compressed),
      limits: cfg.coldLimits,
      onPhase,
    });
    if (warm.checksum !== candidate.checksum) {
      throw new Error(
        `[B75 rotator] warm-tier checksum drift: manifest=${candidate.checksum} actual=${warm.checksum}`,
      );
    }

    const coldPath = `${candidate.source_table}/${candidate.partition_label}.jsonl.gz`;
    // Streams the file and attests the stored version (response + b2_get_file_info by file id); throws on any mismatch.
    let cold: Awaited<ReturnType<ColdRotationDependencies['storage']['uploadColdFile']>>;
    try {
      cold = await deps.storage.uploadColdFile(cfg.coldBucket, coldPath, local, cfg.coldLimits, onPhase);
    } catch (err) {
      // 3b plan r4 1c: a final upload throw is recorded durably by the caller (the name is otherwise unrecoverable and a
      // stored version may exist — amendment 6). The SHA-1 is computed here, while the temp file still exists.
      const h = await hashFileSha256Sha1(local).catch(() => null);
      throw new ColdUploadFailed(err, { bucket: cfg.coldBucket, path: coldPath, bytes: Number(candidate.bytes_compressed), sha1: h?.sha1 ?? null, phases });
    }
    if (cold.checksum !== candidate.checksum) {
      throw new Error(
        `[B75 rotator] cold upload hashed a different file: expected=${candidate.checksum} got=${cold.checksum}`,
      );
    }

    const coldUri = `b2://${cfg.coldBucket}/${coldPath}`;
    const ctlClient = deps.createClient();
    await ctlClient.connect();
    try {
      await ctlClient.query('BEGIN');
      const coldManifest = await ctlClient.query<{ id: string; completeness_basis: string | null }>(
        `INSERT INTO data_archive_manifest (
           source_table, partition_label, tier, state, storage_uri,
           min_ts, max_ts, date_range_start, date_range_end,
           row_count, bytes_compressed, original_partition_size_bytes,
           checksum, format, compression, verified_at, completeness_basis,
           provider_file_id, provider_sha1, provider_bytes, verification_method
         ) SELECT source_table, partition_label, 'cold', 'active', $2,
                  min_ts, max_ts, date_range_start, date_range_end,
                  row_count, bytes_compressed, original_partition_size_bytes,
                  checksum, format, compression, NOW(), completeness_basis,
                  $3, $4, $5, 'b2-sha1-attested'
            FROM data_archive_manifest
           WHERE id = $1
           ON CONFLICT (source_table, partition_label, tier) DO UPDATE
             SET state = 'active', storage_uri = EXCLUDED.storage_uri, verified_at = NOW(),
                 completeness_basis = EXCLUDED.completeness_basis,
                 provider_file_id = EXCLUDED.provider_file_id, provider_sha1 = EXCLUDED.provider_sha1,
                 provider_bytes = EXCLUDED.provider_bytes, verification_method = EXCLUDED.verification_method
         RETURNING id, completeness_basis`,
        [candidate.id, coldUri, cold.fileId, cold.sha1, cold.bytes],
      );
      const coldManifestRow = coldManifest.rows[0];
      if (!coldManifestRow) {
        throw new Error(`[B75 rotator] warm manifest ${candidate.id} disappeared before cold manifest creation`);
      }
      // L-2 (Langston, cold-archive plan §4): the cold row inherits warm's exact evidence because the stored bytes are
      // ATTESTED identical — B2 accepted a body hashing to the SHA-1 we sent, and b2_get_file_info by the returned file id
      // re-read that SHA-1 and length (storage-client `uploadColdFile`); the SHA-256 is the warm file's, checked against
      // the manifest before the upload. It no longer rests on a whole-object re-download, which 3a removed.
      if (coldManifestRow.completeness_basis === 'source-count-matched') {
        await ctlClient.query(
          `INSERT INTO data_archive_exact_evidence (
             manifest_id, source_table, partition_label, tier,
             source_row_count, exported_row_count, downloaded_row_count,
             cursor_contract, producing_build_sha, object_checksum,
             selector_contract, selector_version, frozen_cutoff_at, ranking_observed_at,
             keep_floor_rows, day_start, day_end, ordered_key_sha256, full_row_sha256
           )
           SELECT $2, source_table, partition_label, 'cold',
                  source_row_count, exported_row_count, downloaded_row_count,
                  cursor_contract, producing_build_sha, object_checksum,
                  selector_contract, selector_version, frozen_cutoff_at, ranking_observed_at,
                  keep_floor_rows, day_start, day_end, ordered_key_sha256, full_row_sha256
             FROM data_archive_exact_evidence
            WHERE manifest_id = $1
           ON CONFLICT (manifest_id) DO NOTHING`,
          [candidate.id, coldManifestRow.id],
        );
        const proof = await ctlClient.query<{ exact: boolean }>(
          `SELECT EXISTS (
             SELECT 1
               FROM data_archive_exact_evidence warm
               JOIN data_archive_exact_evidence cold
                 ON cold.manifest_id = $2
                AND cold.source_table = warm.source_table
                AND cold.partition_label = warm.partition_label
                AND cold.tier = 'cold'
                AND cold.source_row_count = warm.source_row_count
                AND cold.exported_row_count = warm.exported_row_count
                AND cold.downloaded_row_count = warm.downloaded_row_count
                AND cold.cursor_contract = warm.cursor_contract
                AND cold.producing_build_sha = warm.producing_build_sha
                AND cold.object_checksum = warm.object_checksum
                AND cold.selector_contract IS NOT DISTINCT FROM warm.selector_contract
                AND cold.selector_version IS NOT DISTINCT FROM warm.selector_version
                AND cold.frozen_cutoff_at IS NOT DISTINCT FROM warm.frozen_cutoff_at
                AND cold.ranking_observed_at IS NOT DISTINCT FROM warm.ranking_observed_at
                AND cold.keep_floor_rows IS NOT DISTINCT FROM warm.keep_floor_rows
                AND cold.day_start IS NOT DISTINCT FROM warm.day_start
                AND cold.day_end IS NOT DISTINCT FROM warm.day_end
                AND cold.ordered_key_sha256 IS NOT DISTINCT FROM warm.ordered_key_sha256
                AND cold.full_row_sha256 IS NOT DISTINCT FROM warm.full_row_sha256
              WHERE warm.manifest_id = $1
           ) AS exact`,
          [candidate.id, coldManifestRow.id],
        );
        if (proof.rows[0]?.exact !== true) {
          throw new Error(
            `[B75 rotator] proven warm object ${candidate.id} has no exact selector/equality proof for cold manifest ${coldManifestRow.id}`,
          );
        }
      }
      await ctlClient.query(
        `UPDATE data_archive_manifest
           SET state = 'migrated', tier_changed_at = NOW()
         WHERE id = $1`,
        [candidate.id],
      );
      await ctlClient.query('COMMIT');
    } catch (err) {
      await ctlClient.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      await ctlClient.end().catch(() => {});
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  await deps.storage.deleteWarm(warmBucket, warmPath);
  return Number(candidate.bytes_compressed);
}

/** 3b plan r4 1c: the durable failed-upload record (`data_archive_cold_upload_failure`). Injectable for tests. */
export interface ColdFailureStore {
  /** every unresolved failure, keyed `source_table/partition_label` → failure_count — read ONCE per run (Langston: not
   *  a pg connection per candidate) */
  openFailures(): Promise<Map<string, number>>;
  /** upsert the failure: one row per partition, attempts appended, count incremented */
  recordFailure(c: ColdRotationCandidate, f: ColdUploadFailed['attempt'], error: string): Promise<void>;
  /** a later success resolves the partition's open failure */
  resolve(c: ColdRotationCandidate): Promise<void>;
}

export interface ColdRunResult {
  rotated: number;
  failed: number;
  bytesMoved: number;
  /** 3b r5: candidates not started because the run deadline was reached */
  deferred: number;
  /** 3b r5 edit 1: the run gate's own deciding quantity, logged on every run */
  elapsedMs: number;
  candidatesDone: number;
  bodyMs: number;
  /** elapsed minus measured body time, per candidate: per-attempt setup, backoff sleeps, the local hashes (which scale
   *  with bytes), the manifest writes and pg connects — NOT a size-independent constant, hence "overhead" */
  overheadMsPerCandidate: number | null;
}

export async function runColdRotationCandidates(
  candidates: ColdRotationCandidate[],
  cfg: ColdRotatorConfig,
  deps: ColdRotationDependencies & { failures?: ColdFailureStore; nowMs?: () => number },
): Promise<ColdRunResult> {
  const now = deps.nowMs ?? Date.now;
  const runStart = now();
  const open = deps.failures ? await deps.failures.openFailures() : new Map<string, number>();
  let rotated = 0;
  let failed = 0;
  let bytesMoved = 0;
  let bodyMs = 0;
  let done = 0;
  for (const candidate of candidates) {
    // 3b r5: the whole-run deadline is checked BETWEEN candidates — a candidate is never cut mid-transfer by it (its own
    // per-phase budgets bound it). The rest are deferred to the next run and paged (first deferring run pages).
    if (now() - runStart >= cfg.runDeadlineMs) break;
    const itemStart = now();
    const phases: TransferPhaseLog[] = [];
    try {
      const prior = open.get(`${candidate.source_table}/${candidate.partition_label}`) ?? 0;
      console.log(
        `[B75 rotator] rotating ${candidate.source_table}/${candidate.partition_label} (${candidate.bytes_compressed} bytes)` +
          (prior > 0 ? ` — retrying a previously failed candidate, ${prior} prior failure(s)` : ''),
      );
      bytesMoved += await rotateColdCandidate(candidate, cfg, { ...deps, phaseSink: phases });
      rotated++;
      if (prior > 0 && deps.failures) await deps.failures.resolve(candidate);
      console.log(
        `[B75 rotator] ${candidate.source_table}/${candidate.partition_label}: rotated bytes=${candidate.bytes_compressed} duration_ms=${now() - itemStart}`,
      );
    } catch (err) {
      failed++;
      console.error(
        `[B75 rotator] ${candidate.source_table}/${candidate.partition_label}: FAILED — ${err instanceof Error ? err.message : String(err)}`,
      );
      if (err instanceof ColdUploadFailed && deps.failures) {
        try {
          await deps.failures.recordFailure(candidate, err.attempt, err.message);
        } catch (recErr) {
          // The record is the durable instrument; failing to write it is itself loud (the run exits non-zero anyway).
          console.error(`[B75 rotator] could NOT record the upload failure for ${err.attempt.path}:`, recErr);
        }
      }
    } finally {
      done++;
      for (const ph of phases) bodyMs += ph.elapsed_ms;
    }
  }
  const elapsedMs = now() - runStart;
  return {
    rotated,
    failed,
    bytesMoved,
    deferred: candidates.length - done,
    elapsedMs,
    candidatesDone: done,
    bodyMs,
    overheadMsPerCandidate: done > 0 ? Math.round((elapsedMs - bodyMs) / done) : null,
  };
}

export interface ColdRotationPlanDependencies {
  runCandidates: typeof runColdRotationCandidates;
  rotationDependencies: ColdRotationDependencies & { failures?: ColdFailureStore };
}

/** Execute the terminal dry-run/real-rotation decision without duplicating the
 * candidate lane. A dry run returns the same zero-success totals and cannot
 * reach storage or manifest mutation through `runCandidates`. */
export async function runColdRotationPlan(
  candidates: ColdRotationCandidate[],
  cfg: ColdRotatorConfig,
  coldConfigured: boolean,
  deps: ColdRotationPlanDependencies,
): Promise<{ dryRun: boolean } & ColdRunResult> {
  const dryRun = cfg.coldRotatorDryRun || !coldConfigured;
  if (dryRun) {
    return { dryRun: true, rotated: 0, failed: 0, bytesMoved: 0, deferred: 0, elapsedMs: 0, candidatesDone: 0, bodyMs: 0, overheadMsPerCandidate: null };
  }
  const result = await deps.runCandidates(candidates, cfg, deps.rotationDependencies);
  return { dryRun: false, ...result };
}

export interface ColdRotatorCliDependencies {
  env: NodeJS.ProcessEnv;
  exit: (code: number) => void;
  run: () => Promise<void>;
}

export async function runColdRotatorCli(
  deps: ColdRotatorCliDependencies = {
    env: process.env,
    exit: (code) => process.exit(code),
    run: runColdRotatorCliBody,
  },
): Promise<void> {
  if (!deps.env.DATABASE_URL) {
    console.error('[B75 rotator] DATABASE_URL not set');
    deps.exit(1);
    return;
  }
  if (!deps.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[B75 rotator] SUPABASE_SERVICE_ROLE_KEY not set');
    deps.exit(1);
    return;
  }
  await deps.run();
}

async function runColdRotatorCliBody(): Promise<void> {
  // 3b plan r4 1b: one rotator at a time, and a refusal or a dead-holder takeover is LOUD (it pages) — a silent refusal
  // would invent a third shape beside "0 candidates" and "crashed" that reads like the first.
  // 3b item 2: the config is read FIRST (read-only), so the lock knows the run deadline — a holder older than it cannot
  // be live on any host and is taken over (a hostname change would otherwise make this box's own lock permanent).
  const startedAt = new Date();
  const ctl = new Client({ connectionString: process.env.DATABASE_URL });
  await ctl.connect();
  let cfg: ColdRotatorConfig;
  try {
    cfg = await loadConfig(ctl);
  } finally {
    await ctl.end();
  }
  // The age bound applies only to a holder on ANOTHER host (a same-host holder is judged by its live pid and that
  // pid's start time). 2 x the run deadline: the deadline is checked BETWEEN candidates, so a live run may outlast it
  // by its last candidate's full envelope (pre-audit term list); 2x leaves that envelope 20 h (Langston, item 2 C-1).
  const lock = acquireRotatorLock(ROTATOR_LOCK_PATH, undefined, 2 * cfg.runDeadlineMs);
  if (lock.kind === 'held') {
    console.error(`[B75 rotator] REFUSED — the rotator lock is held: ${lock.holder}`);
    await pageRotatorLock('refused', `Another cold rotator holds ${ROTATOR_LOCK_PATH}: ${lock.holder}. This run did nothing.`);
    process.exit(1);
  }
  if (lock.kind === 'taken_over') {
    console.error(`[B75 rotator] TOOK OVER a dead or stale holder's lock: ${lock.holder}`);
    await pageRotatorLock('taken_over', `The cold rotator lock ${ROTATOR_LOCK_PATH} was left by a dead process, or one older than the run deadline (${lock.holder}); this run took it over. The previous run crashed or was killed.`);
  }
  // Langston 3b Step 4 C-1: process.exit inside the try would skip this finally (Node runs no pending finally through
  // exit), leaving the lock for next month to "take over" and page a crash that never happened. The body RETURNS its
  // exit code; the lock is released; only then does the process exit.
  let code = 0;
  try {
    code = await runColdRotatorBodyLocked(cfg, startedAt);
  } finally {
    releaseRotatorLock(ROTATOR_LOCK_PATH);
  }
  if (code !== 0) process.exit(code);
}

async function runColdRotatorBodyLocked(cfg: ColdRotatorConfig, startedAt: Date): Promise<number> {

  // B-STORAGE-HARDEN OBJ-1: optional CLI overrides (bounded/controlled rotation).
  const argv = process.argv.slice(2);
  const { limitOverride } = applyColdRotatorCliOverrides(cfg, argv);

  const storage = getStorageClient();
  const coldConfigured = storage.isColdConfigured();

  // Resolve dry-run mode: explicitly via constant OR implicitly when cold creds missing
  const dryRun = cfg.coldRotatorDryRun || !coldConfigured;
  console.log(
    `[B75 rotator] started at ${startedAt.toISOString()} ` +
      `dry_run=${dryRun} cold_provider=${cfg.coldProvider} cold_configured=${coldConfigured} ` +
      `warm_retention_days=${cfg.warmRetentionDays}`,
  );

  const listClient = new Client({ connectionString: process.env.DATABASE_URL });
  await listClient.connect();
  let candidates: ColdRotationCandidate[];
  try {
    candidates = await listColdRotationCandidates(listClient, cfg);
  } finally {
    await listClient.end();
  }

  // B-STORAGE-HARDEN OBJ-1: cap to N oldest candidates when --limit is set.
  if (limitOverride !== null && candidates.length > limitOverride) {
    console.log(
      `[B75 rotator] limiting ${candidates.length} candidates → ${limitOverride} (CLI --limit; oldest-first)`,
    );
    candidates = applyColdRotationLimit(candidates, limitOverride);
  }
  // 3b A-1: the per-run cap from data_lifecycle, applied on EVERY run (the monthly cron passes no --limit).
  if (candidates.length > cfg.maxCandidatesPerRun) {
    console.log(
      `[B75 rotator] capping ${candidates.length} candidates → ${cfg.maxCandidatesPerRun} (data_lifecycle.cold_rotator_max_candidates_per_run; oldest-first; deferred=${candidates.length - cfg.maxCandidatesPerRun})`,
    );
  }
  const capDeferred = Math.max(0, candidates.length - cfg.maxCandidatesPerRun);
  candidates = applyColdRotationLimit(candidates, cfg.maxCandidatesPerRun);

  if (candidates.length === 0) {
    console.log('[B75 rotator] no candidates older than warm retention window');
    // Always emit ONE terminal completion line (Langston Step-4 r2): the archival-
    // health watchdog (B-STORAGE-HARDEN OBJ-5) keys off a DONE line to tell "ran
    // fine, nothing to do" from "never ran / crashed". 0-candidate is the NORMAL
    // monthly steady state for ~10 months (nothing crosses the 365d warm retention
    // until ~2027), so the empty path MUST print DONE like every other exit.
    console.log(
      `[B75 rotator] DONE candidates=0 rotated=0 failed=0 bytes_moved=0 deferred=0 duration_ms=${Date.now() - startedAt.getTime()}`,
    );
    return 0;
  }

  console.log(`[B75 rotator] candidates=${candidates.length}`);
  for (const c of candidates) {
    console.log(
      `[B75 rotator] candidate: table=${c.source_table} partition=${c.partition_label} ` +
        `bytes=${c.bytes_compressed} created_at=${c.created_at.toISOString()}`,
    );
  }

  const plan = await runColdRotationPlan(candidates, cfg, coldConfigured, {
    runCandidates: runColdRotationCandidates,
    rotationDependencies: {
      storage,
      createClient: () => new Client({ connectionString: process.env.DATABASE_URL }),
      failures: pgColdFailureStore(() => new Client({ connectionString: process.env.DATABASE_URL })),
    },
  });

  if (plan.dryRun) {
    console.log(
      '[B75 rotator] DRY RUN — no rotations performed. ' +
        'Set data_lifecycle.cold_rotator_dry_run=false AND configure B2 credentials to enable.',
    );
    // Terminal completion line on the dry-run path too (Langston Step-4 r2 — the
    // "always print one terminal DONE" invariant). A dry-run is a completed run
    // that rotated nothing; the watchdog reads it as healthy. (The creds-missing
    // dry-run case is independently alerted by the cold-liveness canary.)
    // 3b item 2 (Langston r3 carry): a RUN line on the dry-run exit too, so a cap deferral paged from this DONE line
    // points the reader at a line that exists.
    console.log(
      `[B75 rotator] RUN elapsed_ms=${Date.now() - startedAt.getTime()} candidates_done=0 bytes_moved=0 body_ms=0 ` +
        `overhead_ms_per_candidate=n/a run_deadline_ms=${cfg.runDeadlineMs} max_candidates_per_run=${cfg.maxCandidatesPerRun} dry_run=true`,
    );
    console.log(
      `[B75 rotator] DONE candidates=${candidates.length} rotated=0 failed=0 bytes_moved=0 deferred=${capDeferred} duration_ms=${Date.now() - startedAt.getTime()}`,
    );
    return 0;
  }

  // Phase 2: real rotation. For each candidate (B-DISK-FILE-TIERING 3a — streamed, attested; L-2):
  //   1. downloadWarmFile → a private 0700 temp file (free space checked first: 2 x object + the floor);
  //      its SHA-256 must equal the manifest's
  //   2. uploadColdFile (B2) streams the file and ATTESTS the stored version: the upload response's action, bucket,
  //      name, SHA-1 and length, then b2_get_file_info by the returned file id — no re-download
  //   3. INSERT the cold manifest row (tier='cold', state='active') with provider_file_id / provider_sha1 /
  //      provider_bytes and verification_method='b2-sha1-attested'
  //   4. UPDATE warm manifest row → state='migrated', tier_changed_at=NOW()
  //   5. deleteWarm (only after 1-4 succeed; the temp folder is removed whatever happens)
  //
  // If any step fails after upload but before warm delete, the next run
  // detects via NOT EXISTS … tier='cold' filter (cold row exists or doesn't —
  // no half-state). The crashed warm row stays state='active' (not deleted)
  // for safe retry.

  const { rotated, failed, bytesMoved } = plan;
  const deferred = plan.deferred + capDeferred;

  // 3b r5 edit 1: the run gate's deciding quantity on EVERY real run, completed or deferred — elapsed, done, bytes and
  // the derived per-candidate overhead (elapsed minus measured body time, per candidate). archival-health reads
  // `deferred=` from the DONE line: it pages on the FIRST deferring run and escalates on two consecutive (r5 edit 2).
  console.log(
    `[B75 rotator] RUN elapsed_ms=${plan.elapsedMs} candidates_done=${plan.candidatesDone} bytes_moved=${bytesMoved} ` +
      `body_ms=${plan.bodyMs} overhead_ms_per_candidate=${plan.overheadMsPerCandidate ?? 'n/a'} run_deadline_ms=${cfg.runDeadlineMs} ` +
      `max_candidates_per_run=${cfg.maxCandidatesPerRun}`,
  );
  console.log(
    `[B75 rotator] DONE candidates=${candidates.length} rotated=${rotated} failed=${failed} ` +
      `bytes_moved=${bytesMoved} deferred=${deferred} duration_ms=${Date.now() - startedAt.getTime()}`,
  );
  return failed > 0 ? 1 : 0;
}

/** 0600, under deploy's home — never /tmp (1777, shared; #979). */
export const ROTATOR_LOCK_PATH = path.join(os.homedir(), '.b75-cold-rotator.lock');

export type RotatorLock = { kind: 'acquired' } | { kind: 'held'; holder: string } | { kind: 'taken_over'; holder: string };

/** Atomically creates the lock (O_EXCL). On THIS host: a holder whose pid is alive is HELD, unless that pid started
 * after the lock was written (a recycled pid — the holder died and the number was reused), which is taken over; a
 * dead pid or an unreadable file is taken over. On ANOTHER host: HELD, unless its started_at is older than
 * `staleAfterMs` (a hostname change must not make the lock permanent). Never taken over on age while a same-host pid
 * is alive (Langston, item 2 C-1). Takeovers are logged and paged by the caller. Probes are injectable for tests. */
export function acquireRotatorLock(
  file: string,
  isAlive: (pid: number) => boolean = rotatorPidAlive,
  /** applies to a holder on ANOTHER host only; omitted ⇒ another host's holder is held forever */
  staleAfterMs?: number,
  nowMs: number = Date.now(),
  pidStartedMs: (pid: number) => number | null = linuxPidStartedMs,
  /** test seam only: runs inside the takeover gate, after the holder is re-read and before its file is removed */
  inTakeover?: () => void,
): RotatorLock {
  return acquireRotatorLockImpl(file, isAlive, staleAfterMs, nowMs, pidStartedMs, inTakeover);
}

/** A takeover gate older than this was left by a run that died mid-takeover (a takeover takes milliseconds). */
const TAKEOVER_GATE_STALE_MS = 10 * 60 * 1000;

/** A process's start time in epoch ms from /proc (Linux); null where it cannot be read (then the pid is trusted). */
export function linuxPidStartedMs(pid: number): number | null {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf-8');
    const after = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const startTicks = Number(after[19]); // field 22 overall: starttime, clock ticks since boot
    const btime = /^btime (\d+)$/m.exec(fs.readFileSync('/proc/stat', 'utf-8'));
    if (!btime || !Number.isFinite(startTicks)) return null;
    return Number(btime[1]) * 1000 + Math.round((startTicks / 100) * 1000); // USER_HZ is 100 on Linux x86-64
  } catch {
    return null;
  }
}

function rotatorPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function acquireRotatorLockImpl(
  file: string,
  isAlive: (pid: number) => boolean,
  staleAfterMs: number | undefined,
  nowMs: number,
  pidStartedMs: (pid: number) => number | null,
  inTakeover: (() => void) | undefined,
): RotatorLock {
  const me = JSON.stringify({ pid: process.pid, host: os.hostname(), started_at: new Date().toISOString() });
  try {
    fs.writeFileSync(file, me, { flag: 'wx', mode: 0o600 });
    return { kind: 'acquired' };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  }
  let holder = '(unreadable)';
  let alive = false;
  try {
    holder = fs.readFileSync(file, 'utf-8');
    const h = JSON.parse(holder) as { pid?: unknown; host?: unknown; started_at?: unknown };
    const startedMs = typeof h.started_at === 'string' ? Date.parse(h.started_at) : NaN;
    if (typeof h.pid === 'number') {
      if (h.host !== os.hostname()) {
        // cannot probe another host: held, unless older than the bound
        alive = !(staleAfterMs !== undefined && Number.isFinite(startedMs) && nowMs - startedMs > staleAfterMs);
      } else {
        alive = isAlive(h.pid);
        // a live pid that STARTED after the lock was written is not the holder (5 s slack for the writer's own start)
        const ps = alive && Number.isFinite(startedMs) ? pidStartedMs(h.pid) : null;
        if (ps !== null && ps > startedMs + 5000) alive = false;
      }
    }
  } catch {
    alive = false;
  }
  if (alive) return { kind: 'held', holder };
  // The takeover is SERIALISED (Langston, item 3 C-1, measured): `wx` alone is not enough — a loser that judged the
  // holder dead could `rm` the winner's fresh file and then win its own `wx`, so both returned taken_over. An O_EXCL
  // directory gate (`mkdirSync`) admits one takeover at a time; a run that finds the gate taken reads HELD. Inside the
  // gate the holder is RE-READ: if it is no longer the file we judged (another run already took over), HELD.
  const gate = `${file}.takeover`;
  try {
    fs.mkdirSync(gate, { mode: 0o700 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    // a gate left by a run that died mid-takeover would otherwise block every month: removed when stale, then HELD
    try {
      if (nowMs - fs.statSync(gate).mtimeMs > TAKEOVER_GATE_STALE_MS) fs.rmSync(gate, { recursive: true, force: true });
    } catch {
      // gone already
    }
    return { kind: 'held', holder: '(another run is taking the lock over)' };
  }
  try {
    let current = '(gone)';
    try {
      current = fs.readFileSync(file, 'utf-8');
    } catch {
      // removed by nobody else — the gate is ours
    }
    if (current !== holder && current !== '(gone)') return { kind: 'held', holder: current };
    inTakeover?.(); // test seam: the window Langston's reproduction delayed in — after the re-read, before the remove
    fs.rmSync(file, { force: true });
    try {
      fs.writeFileSync(file, me, { flag: 'wx', mode: 0o600 });
    } catch (e) {
      // a fresh run's plain acquire (not a takeover — it needs no gate) can land between our rm and our create; it
      // holds the lock now. HELD, not a throw that would end this run with no page (Langston, item 3 r2).
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      return { kind: 'held', holder: fs.readFileSync(file, 'utf-8') };
    }
    let back: { pid?: unknown } = {};
    try {
      back = JSON.parse(fs.readFileSync(file, 'utf-8')) as { pid?: unknown };
    } catch {
      // gone between our create and our read-back: not ours to claim (Langston item 3 carry — never throw unpaged)
      return { kind: 'held', holder: '(the lock file was unreadable after our create — missing or not ours)' };
    }
    if (back.pid !== process.pid) return { kind: 'held', holder: JSON.stringify(back) };
    return { kind: 'taken_over', holder };
  } finally {
    fs.rmSync(gate, { recursive: true, force: true });
  }
}

export function releaseRotatorLock(file: string): void {
  try {
    const h = JSON.parse(fs.readFileSync(file, 'utf-8')) as { pid?: unknown };
    if (h.pid === process.pid) fs.rmSync(file, { force: true });
  } catch {
    // already gone or not ours — nothing to release
  }
}

async function pageRotatorLock(reason: 'refused' | 'taken_over', body: string): Promise<void> {
  try {
    const { addAlert } = await import('../services/system-alerts.js');
    await addAlert({
      triggers_at: new Date(),
      category: 'health_check',
      severity: 'warning',
      title: reason === 'refused' ? 'Cold rotator refused: its lock is held' : 'Cold rotator took over a dead lock',
      body,
      metadata: { source: 'b75-cold-rotator', batch: 'B-DISK-FILE-TIERING', reason },
      dedupe_key: `b75-cold-rotator-lock-${reason}`,
    });
  } catch (err) {
    console.error('[B75 rotator] failed to raise the lock alert:', err);
  }
}

/** The durable failed-upload record in Postgres (3b plan r4 1c). One row per (source_table, partition_label). */
export function pgColdFailureStore(createClient: () => pg.Client): ColdFailureStore {
  async function withClient<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
    const c = createClient();
    await c.connect();
    try {
      return await fn(c);
    } finally {
      await c.end().catch(() => {});
    }
  }
  return {
    openFailures: () =>
      withClient(async (c) => {
        const r = await c.query<{ source_table: string; partition_label: string; failure_count: number }>(
          `SELECT source_table, partition_label, failure_count FROM data_archive_cold_upload_failure
            WHERE resolved_at IS NULL`,
        );
        return new Map(r.rows.map((row) => [`${row.source_table}/${row.partition_label}`, Number(row.failure_count)]));
      }),
    recordFailure: (cand, f, error) =>
      withClient(async (c) => {
        const attempt = { at: new Date().toISOString(), error: error.slice(0, 1000), sha1: f.sha1, phases: f.phases };
        await c.query(
          `INSERT INTO data_archive_cold_upload_failure
             (source_table, partition_label, bucket, path, sha1, bytes, attempts, first_failed_at, last_failed_at, failure_count)
           VALUES ($1, $2, $3, $4, $5, $6, jsonb_build_array($7::jsonb), NOW(), NOW(), 1)
           ON CONFLICT (source_table, partition_label) DO UPDATE
             SET bucket = EXCLUDED.bucket, path = EXCLUDED.path,
                 sha1 = COALESCE(EXCLUDED.sha1, data_archive_cold_upload_failure.sha1),
                 bytes = EXCLUDED.bytes,
                 attempts = data_archive_cold_upload_failure.attempts || EXCLUDED.attempts,
                 last_failed_at = NOW(),
                 failure_count = data_archive_cold_upload_failure.failure_count + 1,
                 resolved_at = NULL`,
          [cand.source_table, cand.partition_label, f.bucket, f.path, f.sha1, f.bytes, JSON.stringify(attempt)],
        );
      }),
    resolve: (cand) =>
      withClient(async (c) => {
        await c.query(
          `UPDATE data_archive_cold_upload_failure SET resolved_at = NOW()
            WHERE source_table = $1 AND partition_label = $2 AND resolved_at IS NULL`,
          [cand.source_table, cand.partition_label],
        );
      }),
  };
}

function parseSupabaseUri(uri: string): { bucket: string; path: string } {
  const m = /^supabase:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!m) throw new Error(`[B75 rotator] cannot parse supabase URI: ${uri}`);
  return { bucket: m[1], path: m[2] };
}

/** Parse an optional `--flag N` integer CLI arg. Returns null if absent; exits on
 *  a present-but-invalid value (positive integers only). */
export interface ColdRotatorFlagDependencies {
  error: (message: string) => void;
  exit: (code: number) => void;
}

export function parseIntFlag(
  argv: string[],
  name: string,
  deps: ColdRotatorFlagDependencies = {
    error: (message) => console.error(message),
    exit: (code) => process.exit(code),
  },
): number | null {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  const raw = argv[i + 1];
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    deps.error(`[B75 rotator] ${name} requires a positive integer, got: ${raw ?? '(missing)'}`);
    deps.exit(1);
    return null;
  }
  return n;
}

export function applyColdRotatorCliOverrides(
  cfg: ColdRotatorConfig,
  argv: string[],
  deps?: ColdRotatorFlagDependencies,
): { limitOverride: number | null; warmRetentionOverride: number | null } {
  const limitOverride = parseIntFlag(argv, '--limit', deps);
  const warmRetentionOverride = parseIntFlag(argv, '--warm-retention-days', deps);
  if (warmRetentionOverride !== null) {
    console.log(
      `[B75 rotator] warm-retention override (CLI): ${cfg.warmRetentionDays} → ${warmRetentionOverride} days ` +
        `(single global window; per-table overrides ignored for this run)`,
    );
    cfg.warmRetentionDays = warmRetentionOverride;
    // The CLI override is a deliberate single-window run (bounded proof / manual
    // batch) — clear per-table overrides so every table uses exactly this value.
    cfg.perTableWarmRetentionDays.clear();
  }
  return { limitOverride, warmRetentionOverride };
}

export function applyColdRotationLimit(
  candidates: ColdRotationCandidate[],
  limitOverride: number | null,
): ColdRotationCandidate[] {
  return limitOverride === null ? candidates : candidates.slice(0, limitOverride);
}

export interface ColdRotatorProcessDependencies {
  runCli: () => Promise<void>;
  exit: (code: number) => void;
}

export async function runColdRotatorProcess(
  deps: ColdRotatorProcessDependencies = {
    runCli: () => runColdRotatorCli(),
    exit: (code) => process.exit(code),
  },
): Promise<void> {
  try {
    await deps.runCli();
  } catch (err) {
    console.error('[B75 rotator] fatal:', err);
    deps.exit(1);
  }
}

if (isDirectEntry(import.meta.url)) {
  void runColdRotatorProcess();
}
