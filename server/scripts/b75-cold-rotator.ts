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
import { getStorageClient, type StorageClient } from '../services/data-archive/storage-client.js';
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
  try {
    const local = path.join(dir, 'object.jsonl.gz');
    const warm = await deps.storage.downloadWarmFile(warmBucket, warmPath, local);
    if (warm.checksum !== candidate.checksum) {
      throw new Error(
        `[B75 rotator] warm-tier checksum drift: manifest=${candidate.checksum} actual=${warm.checksum}`,
      );
    }

    const coldPath = `${candidate.source_table}/${candidate.partition_label}.jsonl.gz`;
    // Streams the file and attests the stored version (response + b2_get_file_info by file id); throws on any mismatch.
    const cold = await deps.storage.uploadColdFile(cfg.coldBucket, coldPath, local);
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

export async function runColdRotationCandidates(
  candidates: ColdRotationCandidate[],
  cfg: ColdRotatorConfig,
  deps: ColdRotationDependencies,
): Promise<{ rotated: number; failed: number; bytesMoved: number }> {
  let rotated = 0;
  let failed = 0;
  let bytesMoved = 0;
  for (const candidate of candidates) {
    const itemStart = Date.now();
    try {
      console.log(
        `[B75 rotator] rotating ${candidate.source_table}/${candidate.partition_label} (${candidate.bytes_compressed} bytes)`,
      );
      bytesMoved += await rotateColdCandidate(candidate, cfg, deps);
      rotated++;
      console.log(
        `[B75 rotator] ${candidate.source_table}/${candidate.partition_label}: rotated bytes=${candidate.bytes_compressed} duration_ms=${Date.now() - itemStart}`,
      );
    } catch (err) {
      failed++;
      console.error(
        `[B75 rotator] ${candidate.source_table}/${candidate.partition_label}: FAILED — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return { rotated, failed, bytesMoved };
}

export interface ColdRotationPlanDependencies {
  runCandidates: typeof runColdRotationCandidates;
  rotationDependencies: ColdRotationDependencies;
}

/** Execute the terminal dry-run/real-rotation decision without duplicating the
 * candidate lane. A dry run returns the same zero-success totals and cannot
 * reach storage or manifest mutation through `runCandidates`. */
export async function runColdRotationPlan(
  candidates: ColdRotationCandidate[],
  cfg: ColdRotatorConfig,
  coldConfigured: boolean,
  deps: ColdRotationPlanDependencies,
): Promise<{ dryRun: boolean; rotated: number; failed: number; bytesMoved: number }> {
  const dryRun = cfg.coldRotatorDryRun || !coldConfigured;
  if (dryRun) return { dryRun: true, rotated: 0, failed: 0, bytesMoved: 0 };
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
  const startedAt = new Date();
  const ctl = new Client({ connectionString: process.env.DATABASE_URL });
  await ctl.connect();

  let cfg: ColdRotatorConfig;
  try {
    cfg = await loadConfig(ctl);
  } finally {
    await ctl.end();
  }

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

  if (candidates.length === 0) {
    console.log('[B75 rotator] no candidates older than warm retention window');
    // Always emit ONE terminal completion line (Langston Step-4 r2): the archival-
    // health watchdog (B-STORAGE-HARDEN OBJ-5) keys off a DONE line to tell "ran
    // fine, nothing to do" from "never ran / crashed". 0-candidate is the NORMAL
    // monthly steady state for ~10 months (nothing crosses the 365d warm retention
    // until ~2027), so the empty path MUST print DONE like every other exit.
    console.log(
      `[B75 rotator] DONE candidates=0 rotated=0 failed=0 bytes_moved=0 duration_ms=${Date.now() - startedAt.getTime()}`,
    );
    return;
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
    console.log(
      `[B75 rotator] DONE candidates=${candidates.length} rotated=0 failed=0 bytes_moved=0 duration_ms=${Date.now() - startedAt.getTime()}`,
    );
    return;
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

  console.log(
    `[B75 rotator] DONE candidates=${candidates.length} rotated=${rotated} failed=${failed} ` +
      `bytes_moved=${bytesMoved} duration_ms=${Date.now() - startedAt.getTime()}`,
  );
  if (failed > 0) process.exit(1);
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
