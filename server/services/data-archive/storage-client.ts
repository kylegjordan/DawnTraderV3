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
    // Supabase Storage REST documented soft-limit was historically ~50 MB
    // single-call but service-role uploads in practice accept much larger
    // (verified ~250 MB during B75 first sweep when historical context_bridge_log
    // archives produced 99+ MB compressed monthly files). Guard set high to
    // catch only obviously-wrong huge payloads; multipart/TUS upgrade still
    // a B75.x follow-up if we hit Supabase's actual hard limit.
    const MAX_SINGLE_CALL_BYTES = 500 * 1024 * 1024; // 500 MB safety cap
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
  // Cold tier — Backblaze B2 native API (bearer auth, no S3 v4 signing)
  //
  // Auth flow (cached after first call):
  //   1. POST https://api.backblazeb2.com/b2api/v3/b2_authorize_account
  //      with Basic auth (B2_KEY_ID:B2_APPLICATION_KEY)
  //      → returns { apiUrl, downloadUrl, authorizationToken, allowed: { bucketId } }
  //   2. POST <apiUrl>/b2api/v3/b2_get_upload_url with { bucketId }
  //      → returns { uploadUrl, authorizationToken }
  //   3. POST <uploadUrl> with body, headers:
  //      Authorization: <upload-auth-token>
  //      X-Bz-File-Name: <url-encoded-name>
  //      X-Bz-Content-Sha1: <hex-sha1> (or "do_not_verify")
  //      Content-Type, Content-Length
  //   4. GET <downloadUrl>/file/<bucket>/<name> with Authorization: <account-token>
  //      → file bytes
  // ───────────────────────────────────────────────────────────────────────

  private b2Auth: {
    apiUrl: string;
    downloadUrl: string;
    accountAuthToken: string;
    bucketId: string | null;
    expiresAt: number; // epoch ms
  } | null = null;

  isColdConfigured(): boolean {
    return Boolean(
      process.env.B2_KEY_ID && process.env.B2_APPLICATION_KEY && process.env.B2_BUCKET,
    );
  }

  private async b2Authorize(): Promise<NonNullable<StorageClient['b2Auth']>> {
    // Cache for 23h (B2 tokens valid 24h; refresh early)
    if (this.b2Auth && this.b2Auth.expiresAt > Date.now()) {
      return this.b2Auth;
    }
    const keyId = requireEnv('B2_KEY_ID');
    const appKey = requireEnv('B2_APPLICATION_KEY');
    const basic = Buffer.from(`${keyId}:${appKey}`).toString('base64');
    const res = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
      method: 'GET',
      headers: { Authorization: `Basic ${basic}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`[B75 storage-client] B2 authorize failed: ${res.status} ${res.statusText} — ${body}`);
    }
    const j = (await res.json()) as {
      apiInfo: { storageApi: { apiUrl: string; downloadUrl: string } };
      authorizationToken: string;
    };
    this.b2Auth = {
      apiUrl: j.apiInfo.storageApi.apiUrl,
      downloadUrl: j.apiInfo.storageApi.downloadUrl,
      accountAuthToken: j.authorizationToken,
      bucketId: null,
      expiresAt: Date.now() + 23 * 60 * 60 * 1000,
    };
    return this.b2Auth;
  }

  private async b2ResolveBucketId(bucketName: string): Promise<string> {
    const auth = await this.b2Authorize();
    if (auth.bucketId) return auth.bucketId;
    const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_list_buckets`, {
      method: 'POST',
      headers: {
        Authorization: auth.accountAuthToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountId: requireEnv('B2_KEY_ID').replace(/^00\w+/, '').slice(0, 12) || requireEnv('B2_KEY_ID'),
        bucketName,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`[B75 storage-client] B2 list_buckets failed: ${res.status} — ${body}`);
    }
    const j = (await res.json()) as { buckets: Array<{ bucketId: string; bucketName: string }> };
    const match = j.buckets.find((b) => b.bucketName === bucketName);
    if (!match) {
      throw new Error(`[B75 storage-client] B2 bucket not found: ${bucketName}`);
    }
    auth.bucketId = match.bucketId;
    return match.bucketId;
  }

  async uploadCold(bucket: string, path: string, data: Buffer): Promise<UploadResult> {
    if (!this.isColdConfigured()) {
      throw new Error(
        '[B75 storage-client] cold storage not configured: set B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET in env',
      );
    }
    const checksum = sha256Hex(data);
    const sha1 = crypto.createHash('sha1').update(data).digest('hex');

    const auth = await this.b2Authorize();
    const bucketId = await this.b2ResolveBucketId(bucket);

    // Get upload URL (per-upload single-use)
    const upUrlRes = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_upload_url`, {
      method: 'POST',
      headers: {
        Authorization: auth.accountAuthToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bucketId }),
    });
    if (!upUrlRes.ok) {
      const body = await upUrlRes.text().catch(() => '');
      throw new Error(`[B75 storage-client] B2 get_upload_url failed: ${upUrlRes.status} — ${body}`);
    }
    const upUrl = (await upUrlRes.json()) as { uploadUrl: string; authorizationToken: string };

    // Upload (single-call up to 5 GB per B2 docs; large file API not needed today)
    const upRes = await fetch(upUrl.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: upUrl.authorizationToken,
        'X-Bz-File-Name': encodePath(path),
        'X-Bz-Content-Sha1': sha1,
        'Content-Type': 'application/gzip',
        'Content-Length': String(data.length),
      },
      body: data,
    });
    if (!upRes.ok) {
      const body = await upRes.text().catch(() => '');
      throw new Error(`[B75 storage-client] B2 upload failed: ${upRes.status} — ${body}`);
    }
    return {
      bytes: data.length,
      checksum, // SHA-256 (matches warm-tier convention; B2 also tracks SHA-1 internally)
      uri: `b2://${bucket}/${path}`,
    };
  }

  async downloadCold(bucket: string, path: string): Promise<DownloadResult> {
    if (!this.isColdConfigured()) {
      throw new Error('[B75 storage-client] cold storage not configured');
    }
    const auth = await this.b2Authorize();
    const url = `${auth.downloadUrl}/file/${bucket}/${encodePath(path)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: auth.accountAuthToken },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`[B75 storage-client] B2 download failed: ${res.status} — ${body}`);
    }
    const data = Buffer.from(await res.arrayBuffer());
    return {
      bytes: data.length,
      checksum: sha256Hex(data),
      data,
    };
  }

  async deleteCold(bucket: string, path: string): Promise<void> {
    // B2 deletes go by fileId, not by name. Need to first list_file_versions to get fileId.
    if (!this.isColdConfigured()) {
      throw new Error('[B75 storage-client] cold storage not configured');
    }
    const auth = await this.b2Authorize();
    // Find the file's fileId
    const listRes = await fetch(`${auth.apiUrl}/b2api/v3/b2_list_file_names`, {
      method: 'POST',
      headers: {
        Authorization: auth.accountAuthToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bucketId: await this.b2ResolveBucketId(bucket),
        startFileName: path,
        maxFileCount: 1,
      }),
    });
    if (!listRes.ok) {
      const body = await listRes.text().catch(() => '');
      throw new Error(`[B75 storage-client] B2 list_file_names failed: ${listRes.status} — ${body}`);
    }
    const lj = (await listRes.json()) as { files: Array<{ fileId: string; fileName: string }> };
    const file = lj.files.find((f) => f.fileName === path);
    if (!file) return; // already gone
    const delRes = await fetch(`${auth.apiUrl}/b2api/v3/b2_delete_file_version`, {
      method: 'POST',
      headers: {
        Authorization: auth.accountAuthToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileId: file.fileId, fileName: path }),
    });
    if (!delRes.ok) {
      const body = await delRes.text().catch(() => '');
      throw new Error(`[B75 storage-client] B2 delete failed: ${delRes.status} — ${body}`);
    }
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
