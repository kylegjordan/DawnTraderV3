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
import { getStorageClient } from '../services/data-archive/storage-client.js';

const { Client } = pg;

interface Cfg {
  warmRetentionDays: number;
  coldRotatorDryRun: boolean;
  warmBucket: string;
  warmPrefix: string;
  coldBucket: string;
  coldPrefix: string;
  coldProvider: string;
}

async function loadConfig(client: pg.Client): Promise<Cfg> {
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

  return {
    warmRetentionDays: reqNum('default_warm_retention_days'),
    coldRotatorDryRun: reqBool('cold_rotator_dry_run'),
    warmBucket: reqStr('warm_bucket'),
    warmPrefix: reqStr('warm_prefix'),
    coldBucket: reqStr('cold_bucket'),
    coldPrefix: reqStr('cold_prefix'),
    coldProvider: reqStr('cold_provider'),
  };
}

interface Candidate {
  id: string;
  source_table: string;
  partition_label: string;
  storage_uri: string;
  row_count: number;
  bytes_compressed: number;
  checksum: string;
  created_at: Date;
}

async function listCandidates(client: pg.Client, cfg: Cfg): Promise<Candidate[]> {
  const cutoff = new Date(Date.now() - cfg.warmRetentionDays * 86_400_000);
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
    [cutoff],
  );
  return r.rows;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('[B75 rotator] DATABASE_URL not set');
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[B75 rotator] SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
  }

  const startedAt = new Date();
  const ctl = new Client({ connectionString: process.env.DATABASE_URL });
  await ctl.connect();

  let cfg: Cfg;
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
      `[B75 rotator] warm-retention override (CLI): ${cfg.warmRetentionDays} → ${warmRetentionOverride} days`,
    );
    cfg.warmRetentionDays = warmRetentionOverride;
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
  let candidates: Candidate[];
  try {
    candidates = await listCandidates(listClient, cfg);
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

  let rotated = 0;
  let failed = 0;
  let bytesMoved = 0;
  for (const c of candidates) {
    const itemStart = Date.now();
    try {
      const { bucket: warmBucket, path: warmPath } = parseSupabaseUri(c.storage_uri);
      console.log(
        `[B75 rotator] rotating ${c.source_table}/${c.partition_label} (${c.bytes_compressed} bytes)`,
      );

      // Step 1: download from warm
      const warmObj = await storage.downloadWarm(warmBucket, warmPath);
      if (warmObj.checksum !== c.checksum) {
        throw new Error(
          `[B75 rotator] warm-tier checksum drift: manifest=${c.checksum} actual=${warmObj.checksum}`,
        );
      }

      // Step 2: upload to cold (B2). Cold path mirrors warm structure but no 'warm/' prefix
      const coldPath = `${c.source_table}/${c.partition_label}.jsonl.gz`;
      await storage.uploadCold(cfg.coldBucket, coldPath, warmObj.data);

      // Verify by re-download
      const coldObj = await storage.downloadCold(cfg.coldBucket, coldPath);
      if (coldObj.checksum !== c.checksum) {
        throw new Error(
          `[B75 rotator] cold-tier post-upload checksum mismatch: expected=${c.checksum} got=${coldObj.checksum}`,
        );
      }

      // Step 3: INSERT cold manifest row
      const coldUri = `b2://${cfg.coldBucket}/${coldPath}`;
      const ctlClient = new Client({ connectionString: process.env.DATABASE_URL });
      await ctlClient.connect();
      try {
        await ctlClient.query(
          `INSERT INTO data_archive_manifest (
             source_table, partition_label, tier, state, storage_uri,
             min_ts, max_ts, date_range_start, date_range_end,
             row_count, bytes_compressed, original_partition_size_bytes,
             checksum, format, compression, verified_at
           ) SELECT source_table, partition_label, 'cold', 'active', $2,
                    min_ts, max_ts, date_range_start, date_range_end,
                    row_count, bytes_compressed, original_partition_size_bytes,
                    checksum, format, compression, NOW()
              FROM data_archive_manifest
             WHERE id = $1
             ON CONFLICT (source_table, partition_label, tier) DO UPDATE
               SET state = 'active', storage_uri = EXCLUDED.storage_uri, verified_at = NOW()`,
          // B-STORAGE-HARDEN OBJ-1 fixes (both surfaced by the first real rotation —
          // cold was dry-run since B75, so the Phase-2 path had never executed):
          //  (r3) the SQL used $1/$3 with a stray unreferenced null at $2 → Postgres
          //       "could not determine data type of parameter $2"; $2 now carries the
          //       cold URI, the null placeholder is gone.
          //  (r4) the cold row was inserted state='active' with verified_at NULL — but
          //       the B2 round-trip WAS verified at Step 2 above (downloadCold +
          //       checksum match, which is why we reach this INSERT at all). Stamp
          //       verified_at=NOW() so the manifest's audit trail reflects the
          //       confirmed cold round-trip (Langston Step-8: verified_at is the ONLY
          //       DB proof a cold copy landed intact — a last-copy-of-record archive
          //       must not read 'active' on a local-checksum-only basis).
          [c.id, coldUri],
        );

        // Step 4: UPDATE warm row → migrated
        await ctlClient.query(
          `UPDATE data_archive_manifest
             SET state = 'migrated', tier_changed_at = NOW()
           WHERE id = $1`,
          [c.id],
        );
      } finally {
        await ctlClient.end().catch(() => {});
      }

      // Step 5: deleteWarm (only after manifest cold-row + warm-row update committed)
      await storage.deleteWarm(warmBucket, warmPath);

      rotated++;
      bytesMoved += Number(c.bytes_compressed); // #432: pg returns BIGINT as string → coerce, else "0"+"N" concatenates
      console.log(
        `[B75 rotator] ${c.source_table}/${c.partition_label}: rotated bytes=${c.bytes_compressed} duration_ms=${Date.now() - itemStart}`,
      );
    } catch (err) {
      failed++;
      console.error(
        `[B75 rotator] ${c.source_table}/${c.partition_label}: FAILED — ${err instanceof Error ? err.message : String(err)}`,
      );
      // Continue with next candidate; failed rotations retry next month.
    }
  }

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

main().catch((err) => {
  console.error('[B75 rotator] fatal:', err);
  process.exit(1);
});
