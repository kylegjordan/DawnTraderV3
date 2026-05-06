/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B75 — Storage Client
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Thin wrapper over warm tier (Supabase Storage) + cold tier (Backblaze B2,
 * S3-compatible). Used by:
 *   - b75-retention-sweep.ts
 *   - context-bridge-log-ttl.ts
 *   - b75-rehydrate.ts
 *   - b75-cold-rotator.ts
 *
 * Implementation:
 *   - WARM tier: native Node fetch against Supabase Storage REST API
 *     (POST /storage/v1/object/{bucket}/{path} for upload,
 *      GET  /storage/v1/object/{bucket}/{path} for download).
 *     Auth via SUPABASE_SERVICE_ROLE_KEY bearer.
 *
 *   - COLD tier: stub until Backblaze B2 credentials land in staging .env
 *     (B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, B2_ENDPOINT). Stub methods
 *     throw 'cold storage not configured' so the cold rotator can detect this
 *     and run in dry-run mode (data_lifecycle.cold_rotator_dry_run=true).
 *
 * Zero new npm deps — keeps CI clean per Kyle's "GDrive npm install fails"
 * directive.
 *
 * Reference: BATCH_75_SCOPE.md §C.7 + BATCH_75_PRE_AUDIT.md §E
 * ═════════════════════════════════════════════════════════════════════════════
 */

import crypto from 'node:crypto';
import { Readable } from 'node:stream';

// ───────────────────────────────────────────────────────────────────────────
// Env + module-level config (read-once at construction)
// ───────────────────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(`[B75 storage-client] missing required env var: ${key}`);
  }
  return v;
}

function tryEnv(key: string): string | undefined {
  return process.env[key] || undefined;
}

// Parse https://<project>.supabase.co/... from DATABASE_URL
function deriveSupabaseProjectUrl(): string {
  const explicit = tryEnv('SUPABASE_URL');
  if (explicit) return explicit.replace(/\/$/, '');

  const dbUrl = requireEnv('DATABASE_URL');
  // DATABASE_URL = postgresql://postgres:...@db.<project>.supabase.co:5432/postgres
  const match = /db\.([a-z0-9]+)\.supabase\.co/.exec(dbUrl);
  if (!match) {
    throw new Error(
      '[B75 storage-client] cannot derive Supabase project URL from DATABASE_URL ' +
        '(expected hostname pattern db.<project>.supabase.co); set SUPABASE_URL explicitly',
    );
  }
  return `https://${match[1]}.supabase.co`;
}

// ───────────────────────────────────────────────────────────────────────────
// Warm tier — Supabase Storage
// ───────────────────────────────────────────────────────────────────────────

export interface UploadResult {
  bytes: number;
  checksum: string; // SHA-256 hex of uploaded payload
  uri: string; // canonical 'supabase://<bucket>/<path>'
}

export interface DownloadResult {
  bytes: number;
  checksum: string;
  data: Buffer;
}

export class StorageClient {
  private readonly projectUrl: string;
  private readonly serviceKey: string;

  constructor() {
    this.projectUrl = deriveSupabaseProjectUrl();
    this.serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  }

  /**
   * Upload a buffer to Supabase Storage warm bucket. Returns SHA-256 of the
   * payload for the caller to record in the manifest.
   *
   * @param bucket  e.g. 'dt-archive'
   * @param path    e.g. 'warm/equity_spot_ticker_snap/2026-05.jsonl.gz'
   * @param data    full payload buffer (caller pre-buffers — we don't stream
   *                in v1 since Supabase REST upload accepts up to 50 MB per
   *                call; larger archives use uploadMultipart below)
   * @param contentType  e.g. 'application/gzip'
   */
  async uploadWarm(
    bucket: string,
    path: string,
    data: Buffer,
    contentType: string = 'application/gzip',
  ): Promise<UploadResult> {
    // Supabase Storage REST single-call upload soft-limits ~50 MB. Larger
    // payloads would silently 413. Multipart/TUS upload is a B75.x follow-up;
    // for now fail fast with a clear message (Langston Step-4 review note d).
    const MAX_SINGLE_CALL_BYTES = 45 * 1024 * 1024; // 45 MB headroom
    if (data.length > MAX_SINGLE_CALL_BYTES) {
      throw new Error(
        `[B75 storage-client] warm upload payload too large: ${data.length} bytes > ${MAX_SINGLE_CALL_BYTES} (45 MB). ` +
          `Supabase Storage single-call REST upload soft-limits ~50 MB. ` +
          `Multipart upload not yet implemented — log as B75.x follow-up. ` +
          `Workaround: split the source partition into smaller date ranges before export.`,
      );
    }
    const checksum = sha256Hex(data);
    const url = `${this.projectUrl}/storage/v1/object/${bucket}/${encodePath(path)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: data,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `[B75 storage-client] warm upload failed: ${res.status} ${res.statusText} — ${body}`,
      );
    }
    return {
      bytes: data.length,
      checksum,
      uri: `supabase://${bucket}/${path}`,
    };
  }

  /**
   * Download a warm-tier object back to a Buffer. Used for post-upload
   * verification (B75 export-then-drop fence step 7) and by b75-rehydrate.ts.
   */
  async downloadWarm(bucket: string, path: string): Promise<DownloadResult> {
    const url = `${this.projectUrl}/storage/v1/object/${bucket}/${encodePath(path)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `[B75 storage-client] warm download failed: ${res.status} ${res.statusText} — ${body}`,
      );
    }
    const data = Buffer.from(await res.arrayBuffer());
    return {
      bytes: data.length,
      checksum: sha256Hex(data),
      data,
    };
  }

  /**
   * Delete a warm-tier object. Called by b75-cold-rotator.ts after a verified
   * cold-tier copy has been made.
   */
  async deleteWarm(bucket: string, path: string): Promise<void> {
    const url = `${this.projectUrl}/storage/v1/object/${bucket}/${encodePath(path)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `[B75 storage-client] warm delete failed: ${res.status} ${res.statusText} — ${body}`,
      );
    }
  }

  /**
   * List objects under a warm-tier prefix. Used by b75-rehydrate.ts manifest
   * sanity check and by rotator candidate listing.
   *
   * Returns array of { name, size, updated_at }.
   */
  async listWarm(
    bucket: string,
    prefix: string,
  ): Promise<Array<{ name: string; size: number; updatedAt: string | null }>> {
    const url = `${this.projectUrl}/storage/v1/object/list/${bucket}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prefix,
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `[B75 storage-client] warm list failed: ${res.status} ${res.statusText} — ${body}`,
      );
    }
    const rows = (await res.json()) as Array<{
      name: string;
      metadata?: { size?: number };
      updated_at?: string;
    }>;
    return rows.map((r) => ({
      name: r.name,
      size: r.metadata?.size ?? 0,
      updatedAt: r.updated_at ?? null,
    }));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Cold tier — stubs until B2 credentials land
  // ───────────────────────────────────────────────────────────────────────

  isColdConfigured(): boolean {
    return Boolean(
      process.env.B2_KEY_ID && process.env.B2_APPLICATION_KEY && process.env.B2_BUCKET,
    );
  }

  async uploadCold(_bucket: string, _path: string, _data: Buffer): Promise<UploadResult> {
    if (!this.isColdConfigured()) {
      throw new Error(
        '[B75 storage-client] cold storage not configured: ' +
          'set B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET in environment. ' +
          'Cold rotator should be running with data_lifecycle.cold_rotator_dry_run=true ' +
          'until credentials land.',
      );
    }
    // Phase 2 (post-B2 account): replace with @aws-sdk/client-s3 PutObjectCommand
    // against B2 S3-compatible endpoint. See PRE_AUDIT §F.
    throw new Error('[B75 storage-client] cold upload not yet implemented (Phase 2)');
  }

  async downloadCold(_bucket: string, _path: string): Promise<DownloadResult> {
    if (!this.isColdConfigured()) {
      throw new Error('[B75 storage-client] cold storage not configured');
    }
    throw new Error('[B75 storage-client] cold download not yet implemented (Phase 2)');
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function sha256HexStream(stream: Readable): Promise<string> {
  const hash = crypto.createHash('sha256');
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

function encodePath(p: string): string {
  // Storage paths use '/' as separators but each segment must be URL-encoded
  return p
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

// ───────────────────────────────────────────────────────────────────────────
// Singleton accessor (lazy — first call constructs)
// ───────────────────────────────────────────────────────────────────────────

let _instance: StorageClient | null = null;
export function getStorageClient(): StorageClient {
  if (_instance === null) {
    _instance = new StorageClient();
  }
  return _instance;
}
