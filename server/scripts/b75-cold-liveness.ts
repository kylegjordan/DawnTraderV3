/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-STORAGE-HARDEN OBJ-1 — Cold-Path Liveness Canary
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * The cold tier (Backblaze B2) rotates real data only when a warm object passes
 * its 365-day warm-retention — i.e. months apart. Between rotations the B2
 * credentials + upload/download path sit UNEXERCISED and can rot silently (an
 * expired key, a revoked bucket, an API change), and we would only discover it
 * on a restore-day emergency. This canary exercises the exact production cold
 * path on a recurring cadence:
 *
 *   upload a tiny timestamped object → re-download → SHA-256 verify → delete.
 *
 * On ANY failure it raises a §10.5 system-alert (critical) and exits non-zero.
 * On success it logs OK and exits 0. Recovery from a prior failure is a manual
 * `resolve` (same fire-and-forget model as the b75 sweep breakage alerts) — a
 * dedupe_key collapses repeated failures into one open alert.
 *
 * Cron line (root crontab on staging — weekly, Monday 04:00 UTC):
 *   0 4 * * 1 su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b75-cold-liveness.ts" >> /var/log/dawntrader/b75-cold-liveness.log 2>&1
 *
 * Reference: B_STORAGE_HARDEN_SCOPE.md OBJ-1 + B_STORAGE_HARDEN_PRE_AUDIT.md §3.1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import pg from 'pg';
import { getStorageClient, sha256Hex } from '../services/data-archive/storage-client.js';
import { addAlert } from '../services/system-alerts.js';

const { Client } = pg;
const LIVENESS_PREFIX = '_liveness';

async function loadColdBucket(): Promise<string> {
  // Single source of truth: data_lifecycle.cold_bucket (no hard-coded fallback per CLAUDE.md §11).
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const r = await c.query(
      `SELECT value FROM module_constants WHERE module_name='data_lifecycle' AND constant_name='cold_bucket' LIMIT 1`,
    );
    const v = r.rows[0]?.value;
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error('missing or non-string data_lifecycle.cold_bucket');
    }
    return v;
  } finally {
    await c.end();
  }
}

async function raiseAlert(body: string): Promise<void> {
  try {
    await addAlert({
      triggers_at: new Date(),
      category: 'breakage',
      severity: 'critical',
      title: 'Cold-storage path liveness FAILED (Backblaze B2)',
      body,
      metadata: { source: 'b75-cold-liveness', batch: 'B-STORAGE-HARDEN' },
      dedupe_key: 'cold-path-liveness',
    });
  } catch (alertErr) {
    console.error('[cold-liveness] failed to raise system-alert:', alertErr);
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('[cold-liveness] DATABASE_URL not set');
    process.exit(1);
  }
  const startedAt = new Date();
  const storage = getStorageClient();

  if (!storage.isColdConfigured()) {
    const msg =
      'Cold storage is not configured (B2_KEY_ID / B2_APPLICATION_KEY / B2_BUCKET missing in staging env). ' +
      'The never-delete bottom tier cannot receive data — restore-day risk.';
    console.error(`[cold-liveness] ${msg}`);
    await raiseAlert(msg);
    process.exit(1);
  }

  let coldBucket: string;
  try {
    coldBucket = await loadColdBucket();
  } catch (err) {
    const msg = `Could not resolve cold bucket config: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[cold-liveness] ${msg}`);
    await raiseAlert(msg);
    process.exit(1);
    return;
  }

  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const objPath = `${LIVENESS_PREFIX}/canary-${stamp}.txt`;
  const payload = Buffer.from(
    `dawntrader cold-tier liveness canary\ncreated_at=${startedAt.toISOString()}\nnonce=${stamp}\n`,
    'utf-8',
  );
  const expected = sha256Hex(payload);

  try {
    // 1. upload
    await storage.uploadCold(coldBucket, objPath, payload);
    // 2. re-download + verify
    const dl = await storage.downloadCold(coldBucket, objPath);
    if (dl.checksum !== expected) {
      throw new Error(
        `checksum mismatch on readback: expected=${expected} got=${dl.checksum} (bytes=${dl.bytes})`,
      );
    }
    // 3. delete (best-effort cleanup; a failed delete self-reveals as a stale _liveness object)
    try {
      await storage.deleteCold(coldBucket, objPath);
    } catch (delErr) {
      console.warn(
        `[cold-liveness] round-trip OK but cleanup delete failed (non-fatal): ${delErr instanceof Error ? delErr.message : String(delErr)}`,
      );
    }
    console.log(
      `[cold-liveness] OK — upload+download+verify round-trip on ${coldBucket}/${objPath} ` +
        `(${payload.length} bytes) in ${Date.now() - startedAt.getTime()}ms`,
    );
  } catch (err) {
    const msg =
      `Cold-tier round-trip FAILED against bucket ${coldBucket}: ${err instanceof Error ? err.message : String(err)}. ` +
      `The credentials/path used to preserve data indefinitely are not working — investigate before the next warm→cold rotation.`;
    console.error(`[cold-liveness] ${msg}`);
    await raiseAlert(msg);
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error('[cold-liveness] fatal:', err);
  await raiseAlert(`Cold-liveness canary crashed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
