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
  storage: Pick<StorageClient, 'downloadWarm' | 'uploadCold' | 'downloadCold' | 'deleteWarm'>;
  createClient: () => pg.Client;
}

/** Execute one warm-to-cold state transition. Warm deletion is deliberately
 * outside and after both manifest writes so every thrown mutation leaves the
 * warm copy in place. */
export async function rotateColdCandidate(
  candidate: ColdRotationCandidate,
  cfg: ColdRotatorConfig,
  deps: ColdRotationDependencies,
): Promise<number> {
  const { bucket: warmBucket, path: warmPath } = parseSupabaseUri(candidate.storage_uri);
  const warmObj = await deps.storage.downloadWarm(warmBucket, warmPath);
  if (warmObj.checksum !== candidate.checksum) {
    throw new Error(
      `[B75 rotator] warm-tier checksum drift: manifest=${candidate.checksum} actual=${warmObj.checksum}`,
    );
  }

  const coldPath = `${candidate.source_table}/${candidate.partition_label}.jsonl.gz`;
  await deps.storage.uploadCold(cfg.coldBucket, coldPath, warmObj.data);
  const coldObj = await deps.storage.downloadCold(cfg.coldBucket, coldPath);
  if (coldObj.checksum !== candidate.checksum) {
    throw new Error(
      `[B75 rotator] cold-tier post-upload checksum mismatch: expected=${candidate.checksum} got=${coldObj.checksum}`,
    );
  }

  const coldUri = `b2://${cfg.coldBucket}/${coldPath}`;
  const ctlClient = deps.createClient();
  await ctlClient.connect();
  try {
    await ctlClient.query(
      `INSERT INTO data_archive_manifest (
         source_table, partition_label, tier, state, storage_uri,
         min_ts, max_ts, date_range_start, date_range_end,
         row_count, bytes_compressed, original_partition_size_bytes,
         checksum, format, compression, verified_at, completeness_basis
       ) SELECT source_table, partition_label, 'cold', 'active', $2,
                min_ts, max_ts, date_range_start, date_range_end,
                row_count, bytes_compressed, original_partition_size_bytes,
                checksum, format, compression, NOW(), completeness_basis
          FROM data_archive_manifest
         WHERE id = $1
         ON CONFLICT (source_table, partition_label, tier) DO UPDATE
           SET state = 'active', storage_uri = EXCLUDED.storage_uri, verified_at = NOW(),
               completeness_basis = EXCLUDED.completeness_basis`,
      [candidate.id, coldUri],
    );
    await ctlClient.query(
      `UPDATE data_archive_manifest
         SET state = 'migrated', tier_changed_at = NOW()
       WHERE id = $1`,
      [candidate.id],
    );
  } finally {
    await ctlClient.end().catch(() => {});
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
  const limitOverride = parseIntFlag(argv, '--limit');
  const warmRetentionOverride = parseIntFlag(argv, '--warm-retention-days');
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
    candidates = candidates.slice(0, limitOverride);
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

  if (dryRun) {
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

  // Phase 2: real rotation. For each candidate:
  //   1. downloadWarm → buffer
  //   2. uploadCold (B2) → verify by re-download + checksum match
  //   3. INSERT new manifest row (tier='cold', state='active') with cold_storage_uri
  //   4. UPDATE warm manifest row → state='migrated', tier_changed_at=NOW()
  //   5. deleteWarm
  //
  // If any step fails after upload but before warm delete, the next run
  // detects via NOT EXISTS … tier='cold' filter (cold row exists or doesn't —
  // no half-state). The crashed warm row stays state='active' (not deleted)
  // for safe retry.

  const { rotated, failed, bytesMoved } = await runColdRotationCandidates(candidates, cfg, {
    storage,
    createClient: () => new Client({ connectionString: process.env.DATABASE_URL }),
  });

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
function parseIntFlag(argv: string[], name: string): number | null {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  const raw = argv[i + 1];
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    console.error(`[B75 rotator] ${name} requires a positive integer, got: ${raw ?? '(missing)'}`);
    process.exit(1);
  }
  return n;
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
