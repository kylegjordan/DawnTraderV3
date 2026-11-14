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
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { B2CallError, B2_RETRY_DEFAULTS, b2ErrorCode, parseRetryAfterMs, withB2Retry } from './b2-retry.js';

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
   * SMALL-PAYLOAD / BUFFER PATH. Buffers the whole object in memory — safe only
   * for small payloads (context-bridge-log monthly archives, tests). LARGE
   * archives MUST use `uploadWarmFile` (B-NEW-47 streaming) to avoid OOM on the
   * 3.7 GB-RAM box. Do not route multi-GB objects here.
   *
   * Upload a buffer to Supabase Storage warm bucket. Returns SHA-256 of the
   * payload for the caller to record in the manifest.
   *
   * @param bucket  e.g. 'dt-archive'
   * @param path    e.g. 'warm/xstock_spot_ticker_snap/2026-05.jsonl.gz'
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
    // Supabase Storage hard-limits single-call REST upload at ~50 MB even
    // for service-role keys (verified empirically by the B75 first sweep:
    // a 99 MB Dec ctx-bridge archive returned 413 'Payload too large').
    // Files > 40 MB route to TUS resumable upload (Supabase's documented
    // protocol for large files; chunks at 6 MiB per their recommendation).
    //
    // Project-level file_size_limit also caps warm uploads. If the project
    // cap is below the archive size, BOTH single-call and TUS will 413.
    // We catch the 413 and let the caller decide whether to fall back to
    // cold tier (B2 native API supports up to 5 GB single-call).
    const SINGLE_CALL_THRESHOLD = 40 * 1024 * 1024; // 40 MB
    const HARD_CAP = 5 * 1024 * 1024 * 1024;        // 5 GB ceiling on any one warm object
    if (data.length > HARD_CAP) {
      throw new Error(
        `[B75 storage-client] warm upload payload exceeds 5 GB hard cap: ${data.length} bytes`,
      );
    }
    const checksum = sha256Hex(data);
    if (data.length > SINGLE_CALL_THRESHOLD) {
      return await this.uploadWarmTus(bucket, path, data, contentType, checksum);
    }
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
   * Supabase TUS resumable upload (https://supabase.com/docs/guides/storage/uploads/resumable-uploads).
   *
   * Protocol:
   *   1. POST <project>/storage/v1/upload/resumable with Tus-Resumable, Upload-Length,
   *      Upload-Metadata (base64 of bucketName, objectName, contentType, cacheControl).
   *      → 201 Created with Location: <upload-url> header.
   *   2. PATCH <upload-url> with Tus-Resumable, Upload-Offset, Content-Type:
   *      application/offset+octet-stream + chunk body.
   *      → 204 No Content with Upload-Offset: <new-offset>.
   *   3. Repeat PATCH until Upload-Offset == Upload-Length.
   *
   * Auth identical to other Storage REST calls (apikey + Authorization Bearer).
   */
  private async uploadWarmTus(
    bucket: string,
    path: string,
    data: Buffer,
    contentType: string,
    checksum: string,
  ): Promise<UploadResult> {
    const CHUNK_SIZE = 6 * 1024 * 1024; // 6 MiB per Supabase recommendation
    const tusUrl = `${this.projectUrl}/storage/v1/upload/resumable`;

    // Step 1: create the upload (POST)
    const meta = [
      `bucketName ${Buffer.from(bucket).toString('base64')}`,
      `objectName ${Buffer.from(path).toString('base64')}`,
      `contentType ${Buffer.from(contentType).toString('base64')}`,
      `cacheControl ${Buffer.from('no-cache').toString('base64')}`,
    ].join(',');
    const createRes = await fetch(tusUrl, {
      method: 'POST',
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(data.length),
        'Upload-Metadata': meta,
        'x-upsert': 'true',
      },
    });
    if (createRes.status !== 201) {
      const body = await createRes.text().catch(() => '');
      throw new Error(
        `[B75 storage-client] TUS create failed: ${createRes.status} ${createRes.statusText} — ${body}`,
      );
    }
    let location = createRes.headers.get('location') || createRes.headers.get('Location');
    if (!location) {
      throw new Error('[B75 storage-client] TUS create returned no Location header');
    }
    // Some Supabase deployments return absolute, others return path-only relative
    if (location.startsWith('/')) location = `${this.projectUrl}${location}`;
    else if (!location.startsWith('http')) location = `${this.projectUrl}/${location}`;

    // Step 2-3: PATCH chunks
    let offset = 0;
    while (offset < data.length) {
      const chunkEnd = Math.min(offset + CHUNK_SIZE, data.length);
      const chunk = data.subarray(offset, chunkEnd);
      const patchRes = await fetch(location, {
        method: 'PATCH',
        headers: {
          apikey: this.serviceKey,
          Authorization: `Bearer ${this.serviceKey}`,
          'Tus-Resumable': '1.0.0',
          'Upload-Offset': String(offset),
          'Content-Type': 'application/offset+octet-stream',
          'Content-Length': String(chunk.length),
        },
        body: chunk,
      });
      if (patchRes.status !== 204) {
        const body = await patchRes.text().catch(() => '');
        // PARSED: isWarmTooLarge (context-bridge-log-ttl.ts) reads the status after this exact "failed at offset=N
        // chunk=N: " infix to route a 413 to cold. Change the template and change that regex (a harness fence checks both).
        throw new Error(
          `[B75 storage-client] TUS PATCH failed at offset=${offset} chunk=${chunk.length}: ${patchRes.status} ${patchRes.statusText} — ${body}`,
        );
      }
      const serverOffset = Number(patchRes.headers.get('upload-offset') || patchRes.headers.get('Upload-Offset') || '0');
      if (serverOffset !== chunkEnd) {
        throw new Error(
          `[B75 storage-client] TUS PATCH offset drift: expected=${chunkEnd} server-reported=${serverOffset}`,
        );
      }
      offset = chunkEnd;
    }

    return {
      bytes: data.length,
      checksum,
      uri: `supabase://${bucket}/${path}`,
    };
  }

  /**
   * B-NEW-47 — STREAMING upload from a file PATH (never buffers the whole
   * object). This is the memory-safe path for large archives (the buffered
   * `uploadWarm` above OOM-kills on a 3.7 GB-RAM box for multi-GB objects).
   *
   * Small files (≤ SINGLE_CALL_THRESHOLD) still do a single POST after a bounded
   * read; larger files route to `uploadWarmTusFile` which `fs.read`s 6 MiB
   * chunks at offset — peak memory ~6 MiB regardless of object size.
   *
   * @param opts.size      known file size (saves a stat); validated ≤ HARD_CAP
   * @param opts.checksum  pre-computed SHA-256 (e.g. exporter's streamed
   *                       checksum) — avoids a redundant read-pass. If omitted,
   *                       computed by streaming the file.
   */
  async uploadWarmFile(
    bucket: string,
    path: string,
    localPath: string,
    opts: { size?: number; checksum?: string; contentType?: string } = {},
  ): Promise<UploadResult> {
    const contentType = opts.contentType ?? 'application/gzip';
    const size = opts.size ?? fs.statSync(localPath).size;
    const HARD_CAP = 5 * 1024 * 1024 * 1024; // 5 GB ceiling (Supabase project cap)
    if (size > HARD_CAP) {
      throw new Error(
        `[B75 storage-client] warm upload file exceeds 5 GB hard cap: ${size} bytes (${localPath})`,
      );
    }
    const checksum = opts.checksum ?? (await sha256HexStream(fs.createReadStream(localPath)));
    const SINGLE_CALL_THRESHOLD = 40 * 1024 * 1024; // 40 MB
    if (size > SINGLE_CALL_THRESHOLD) {
      return await this.uploadWarmTusFile(bucket, path, localPath, size, contentType, checksum);
    }
    // Small file: a single bounded read (< 40 MB) + POST.
    const data = fs.readFileSync(localPath);
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
        `[B75 storage-client] warm upload (file, small) failed: ${res.status} ${res.statusText} — ${body}`,
      );
    }
    return { bytes: size, checksum, uri: `supabase://${bucket}/${path}` };
  }

  /**
   * B-NEW-47 — TUS resumable upload reading 6 MiB chunks from a file descriptor
   * at offset. Same TUS protocol as `uploadWarmTus` but the chunk source is
   * `fs.read(fd, buf, …, offset)` instead of `Buffer.subarray` on a fully-loaded
   * Buffer — so peak memory is one CHUNK_SIZE buffer, not the whole object.
   */
  private async uploadWarmTusFile(
    bucket: string,
    path: string,
    localPath: string,
    size: number,
    contentType: string,
    checksum: string,
  ): Promise<UploadResult> {
    const CHUNK_SIZE = 6 * 1024 * 1024; // 6 MiB per Supabase recommendation
    const tusUrl = `${this.projectUrl}/storage/v1/upload/resumable`;

    const meta = [
      `bucketName ${Buffer.from(bucket).toString('base64')}`,
      `objectName ${Buffer.from(path).toString('base64')}`,
      `contentType ${Buffer.from(contentType).toString('base64')}`,
      `cacheControl ${Buffer.from('no-cache').toString('base64')}`,
    ].join(',');
    const createRes = await fetch(tusUrl, {
      method: 'POST',
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(size),
        'Upload-Metadata': meta,
        'x-upsert': 'true',
      },
    });
    if (createRes.status !== 201) {
      const body = await createRes.text().catch(() => '');
      throw new Error(
        `[B75 storage-client] TUS(file) create failed: ${createRes.status} ${createRes.statusText} — ${body}`,
      );
    }
    let location = createRes.headers.get('location') || createRes.headers.get('Location');
    if (!location) {
      throw new Error('[B75 storage-client] TUS(file) create returned no Location header');
    }
    if (location.startsWith('/')) location = `${this.projectUrl}${location}`;
    else if (!location.startsWith('http')) location = `${this.projectUrl}/${location}`;

    const fd = fs.openSync(localPath, 'r');
    const buf = Buffer.allocUnsafe(CHUNK_SIZE);
    try {
      let offset = 0;
      while (offset < size) {
        const want = Math.min(CHUNK_SIZE, size - offset);
        // fs.readSync may return short reads — loop to fill `want` bytes.
        let filled = 0;
        while (filled < want) {
          const n = fs.readSync(fd, buf, filled, want - filled, offset + filled);
          if (n === 0) break;
          filled += n;
        }
        if (filled !== want) {
          throw new Error(
            `[B75 storage-client] TUS(file) short read at offset=${offset}: wanted=${want} got=${filled}`,
          );
        }
        // subarray shares memory with buf; safe because we await the PATCH fully
        // (undici copies the body before resolving) before the next read overwrites buf.
        const chunk = buf.subarray(0, want);
        const patchRes = await fetch(location, {
          method: 'PATCH',
          headers: {
            apikey: this.serviceKey,
            Authorization: `Bearer ${this.serviceKey}`,
            'Tus-Resumable': '1.0.0',
            'Upload-Offset': String(offset),
            'Content-Type': 'application/offset+octet-stream',
            'Content-Length': String(want),
          },
          body: chunk,
        });
        if (patchRes.status !== 204) {
          const body = await patchRes.text().catch(() => '');
          // PARSED: isWarmTooLarge (context-bridge-log-ttl.ts) reads the status after this exact "failed at offset=N
          // chunk=N: " infix to route a 413 to cold. Change the template and change that regex (a harness fence checks both).
          throw new Error(
            `[B75 storage-client] TUS(file) PATCH failed at offset=${offset} chunk=${want}: ${patchRes.status} ${patchRes.statusText} — ${body}`,
          );
        }
        const serverOffset = Number(
          patchRes.headers.get('upload-offset') || patchRes.headers.get('Upload-Offset') || '0',
        );
        if (serverOffset !== offset + want) {
          throw new Error(
            `[B75 storage-client] TUS(file) PATCH offset drift: expected=${offset + want} server-reported=${serverOffset}`,
          );
        }
        offset += want;
      }
    } finally {
      fs.closeSync(fd);
    }

    return { bytes: size, checksum, uri: `supabase://${bucket}/${path}` };
  }

  /**
   * SMALL-PAYLOAD / BUFFER PATH. Buffers the whole object in memory — safe only
   * for small payloads. LARGE archives MUST use `downloadWarmFile` (B-NEW-47
   * streaming) to avoid OOM. Do not route multi-GB objects here.
   *
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
   * B-NEW-47 — STREAMING download to a file PATH (never buffers the whole
   * object). Pipes the response body web-stream → file write-stream with
   * backpressure, then computes the SHA-256 by a second streamed read-pass of
   * the file on disk (Q-B: simplest, no tee race; the extra cost is one
   * sequential disk read, not memory). Used by the sweep's verify step AND by
   * b75-rehydrate.ts — both previously OOM'd buffering multi-GB objects.
   *
   * @returns bytes written + SHA-256 hex of the downloaded file.
   */
  async downloadWarmFile(
    bucket: string,
    path: string,
    localPath: string,
    bound?: { expectedBytes: number; limits: ColdTransferLimits; onPhase?: (p: TransferPhaseLog) => void },
  ): Promise<{ bytes: number; checksum: string }> {
    const url = `${this.projectUrl}/storage/v1/object/${bucket}/${encodePath(path)}`;
    // 3b A-2: with `bound`, the whole warm read aborts at setup + expectedBytes ÷ floor (one per-phase budget; a
    // trickling Supabase read is otherwise bounded by nothing). Not retried (A-5). Without `bound` (rehydrate, the
    // context bridge) it behaves exactly as before.
    const budgetMs = bound ? phaseBudgetMs(bound.expectedBytes, bound.limits) : null;
    const t0 = Date.now();
    let outcome: TransferPhaseLog['outcome'] = 'error';
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          apikey: this.serviceKey,
          Authorization: `Bearer ${this.serviceKey}`,
        },
        ...(budgetMs !== null ? { signal: AbortSignal.timeout(budgetMs) } : {}),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `[B75 storage-client] warm download (file) failed: ${res.status} ${res.statusText} — ${body}`,
        );
      }
      if (!res.body) {
        throw new Error('[B75 storage-client] warm download (file): response has no body stream');
      }
      // res.body is a WHATWG ReadableStream; adapt to a Node Readable for pipeline
      // backpressure into the write-stream. The fetch signal aborts the body stream too.
      await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(localPath));
      outcome = 'ok';
    } catch (err) {
      if ((err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError') outcome = 'deadline';
      throw err;
    } finally {
      if (bound?.onPhase) {
        const got = fs.existsSync(localPath) ? fs.statSync(localPath).size : 0;
        bound.onPhase(phaseLog('warm_read', 1, got, Date.now() - t0, budgetMs, outcome));
      }
    }
    const checksum = await sha256HexStream(fs.createReadStream(localPath));
    const bytes = fs.statSync(localPath).size;
    return { bytes, checksum };
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
    accountId: string;
    bucketId: string | null;
    expiresAt: number; // epoch ms
  } | null = null;

  isColdConfigured(): boolean {
    return Boolean(
      process.env.B2_KEY_ID && process.env.B2_APPLICATION_KEY && process.env.B2_BUCKET,
    );
  }

  private async b2Authorize(setupMs?: number): Promise<NonNullable<StorageClient['b2Auth']>> {
    // Cache for 23h (B2 tokens valid 24h; refresh early)
    if (this.b2Auth && this.b2Auth.expiresAt > Date.now()) {
      return this.b2Auth;
    }
    const keyId = requireEnv('B2_KEY_ID');
    const appKey = requireEnv('B2_APPLICATION_KEY');
    const basic = Buffer.from(`${keyId}:${appKey}`).toString('base64');
    // 3b: retried (B2_RETRY_DEFAULTS) on a retryable (status, code); never re-authorizes itself.
    const j = await withB2Retry('authorize', async () => {
      const res = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
        method: 'GET',
        headers: { Authorization: `Basic ${basic}` },
        ...(setupMs !== undefined ? { signal: AbortSignal.timeout(setupMs) } : {}),
      });
      if (!res.ok) throw await b2Error('authorize', res);
      return (await res.json()) as {
        accountId: string;
        apiInfo: { storageApi: { apiUrl: string; downloadUrl: string } };
        authorizationToken: string;
      };
    }, { ...B2_RETRY_DEFAULTS, onAttempt: this.b2AttemptLog });
    this.b2Auth = {
      apiUrl: j.apiInfo.storageApi.apiUrl,
      downloadUrl: j.apiInfo.storageApi.downloadUrl,
      accountAuthToken: j.authorizationToken,
      accountId: j.accountId,
      bucketId: null,
      expiresAt: Date.now() + 23 * 60 * 60 * 1000,
    };
    return this.b2Auth;
  }

  /** Drops the cached token and authorizes again (a 401 expired_auth_token, amendment 5). Keeps a resolved bucket id. */
  private async b2Reauthorize(setupMs?: number): Promise<void> {
    const keep = this.b2Auth?.bucketId ?? null;
    this.b2Auth = null;
    const a = await this.b2Authorize(setupMs);
    if (keep && !a.bucketId) a.bucketId = keep;
  }

  /** Every B2 attempt is logged, ok or not — the retry's own deciding quantity (A-4). */
  private readonly b2AttemptLog = (r: { op: string; attempt: number; ok: boolean; status: number | null; code: string | null; disposition?: string }) => {
    if (r.ok && r.attempt === 1) return; // a first-try success is the common case; only retries and failures are logged
    console.log(`[B75 storage-client] b2 ${r.op} attempt=${r.attempt} ok=${r.ok} status=${r.status ?? 'none'}${r.code ? ` code=${r.code}` : ''}${r.disposition ? ` disposition=${r.disposition}` : ''}`);
  };

  private async b2ResolveBucketId(bucketName: string, setupMs?: number): Promise<string> {
    const auth = await this.b2Authorize(setupMs);
    if (auth.bucketId) return auth.bucketId;
    // Allow B2_BUCKET_ID env override to skip list_buckets entirely (faster + works
    // even with bucket-restricted application keys that lack list-buckets capability)
    const envBucketId = process.env.B2_BUCKET_ID;
    if (envBucketId) {
      auth.bucketId = envBucketId;
      return envBucketId;
    }
    // 3b (A-5): in the enumerated retry set. Off the staging live path today — the env value above returns first while
    // the key is unrestricted, and a bucket-restricted key fills auth.bucketId (3d) — but retried for any env without it.
    const j = await withB2Retry('list_buckets', async () => {
      const a = await this.b2Authorize(setupMs);
      const res = await fetch(`${a.apiUrl}/b2api/v3/b2_list_buckets`, {
        method: 'POST',
        headers: {
          Authorization: a.accountAuthToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: a.accountId,
          bucketName,
        }),
        ...(setupMs !== undefined ? { signal: AbortSignal.timeout(setupMs) } : {}),
      });
      if (!res.ok) throw await b2Error('list_buckets', res);
      return (await res.json()) as { buckets: Array<{ bucketId: string; bucketName: string }> };
    }, { ...B2_RETRY_DEFAULTS, reauth: () => this.b2Reauthorize(setupMs), onAttempt: this.b2AttemptLog });
    const match = j.buckets.find((b) => b.bucketName === bucketName);
    if (!match) {
      throw new Error(`[B75 storage-client] B2 bucket not found: ${bucketName}`);
    }
    auth.bucketId = match.bucketId;
    return match.bucketId;
  }

  async uploadCold(bucket: string, path: string, data: Buffer, setupMs?: number): Promise<UploadResult> {
    if (!this.isColdConfigured()) {
      throw new Error(
        '[B75 storage-client] cold storage not configured: set B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET in env',
      );
    }
    const checksum = sha256Hex(data);
    const sha1 = crypto.createHash('sha1').update(data).digest('hex');

    // 3b item 2 (Langston r3 carry): with `setupMs` (the liveness canary passes cold_upload_setup_ms) every call on
    // this Buffer path is bounded, as on the file path. Small payloads only, so setupMs bounds the body too.
    const auth = await this.b2Authorize(setupMs);
    const bucketId = await this.b2ResolveBucketId(bucket, setupMs);

    // Get upload URL (per-upload single-use)
    const upUrlRes = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_upload_url`, {
      method: 'POST',
      headers: {
        Authorization: auth.accountAuthToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bucketId }),
      ...(setupMs !== undefined ? { signal: AbortSignal.timeout(setupMs) } : {}),
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
      ...(setupMs !== undefined ? { signal: AbortSignal.timeout(setupMs) } : {}),
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

  async downloadCold(bucket: string, path: string, setupMs?: number): Promise<DownloadResult> {
    if (!this.isColdConfigured()) {
      throw new Error('[B75 storage-client] cold storage not configured');
    }
    const auth = await this.b2Authorize(setupMs);
    const url = `${auth.downloadUrl}/file/${bucket}/${encodePath(path)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: auth.accountAuthToken },
      ...(setupMs !== undefined ? { signal: AbortSignal.timeout(setupMs) } : {}),
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

  // ─────────────────────────────────────────────────────────────────────────
  // B-DISK-FILE-TIERING amendment 4, increment 3a = amendment 1's AP-4 (C-1: fix the PRIMITIVES) + the attestation
  // (Langston's Plan B + Coltrane 1-3, `1-system-manual/pm/decisions/2026-11-06_cold-archive-daily-chunk-plan.md` §4).
  // The cold twins of B-NEW-47's warm file pair: nothing here holds a whole object in memory. The P10 run measured the
  // buffered path at 1.06 GiB peak RSS for a 171 MB object (2026-11-05); these stream through a local file.
  // An accepted upload is a server-side proof of the stored bytes: B2 refuses a body that does not hash to the SHA-1
  // sent in `X-Bz-Content-Sha1`. `uploadColdFile` keeps the response (it was discarded before), checks it, then reads
  // the same file VERSION back by `fileId` with `b2_get_file_info` (metadata only — no file bytes, a Class-B call).
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Streams a local file to cold and attests the stored version. One streamed read for SHA-256 + SHA-1, one for the
   * body. Throws on ANY mismatch, and on `transaction_cap_exceeded` (fails closed — a caller must never delete warm
   * on a throw).
   */
  async uploadColdFile(
    bucket: string,
    path: string,
    localPath: string,
    limits: ColdTransferLimits,
    onPhase?: (p: TransferPhaseLog) => void,
  ): Promise<ColdFileUpload> {
    if (!this.isColdConfigured()) {
      throw new Error('[B75 storage-client] cold storage not configured: set B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET in env');
    }
    const { bytes, sha256, sha1 } = await hashFileSha256Sha1(localPath);
    const bucketId = await this.b2ResolveBucketId(bucket, limits.setupMs);
    // The body's budget is setup + bytes ÷ floor, like the warm read's: the body phase also carries fixed costs that do
    // not scale with size (the connection to the upload URL, and B2 hashing and answering after the last byte). A pure
    // bytes ÷ floor gave a 10-byte body 10 ms and aborted every small object (caught by the 3a attestation test at Step 3).
    const bodyBudgetMs = phaseBudgetMs(bytes, limits);
    // 3b — the bounded retry (KD-34, amendments 1-9). Every attempt fetches a FRESH upload URL (B2's contract for a
    // 5xx), re-opens the file (postFileStream takes a path), and has its own per-phase budgets: each JSON call
    // (authorize, list_buckets, get_upload_url, get_file_info) under `limits.setupMs`, the body under setup + bytes ÷
    // floor (`phaseBudgetMs`). A Retry-After is honoured up to `limits.setupMs`. A 401 expired_auth_token re-authorizes
    // inside the same 3 attempts. The attestation below runs OUTSIDE the retry: a 200 that does not attest throws at
    // once (amendment 8). A final throw is fail-closed — the caller writes no manifest row and never deletes warm.
    const up = await withB2Retry('upload', async (attempt) => {
      const auth = await this.b2Authorize(limits.setupMs);
      const upUrlRes = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_upload_url`, {
        method: 'POST',
        headers: { Authorization: auth.accountAuthToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucketId }),
        signal: AbortSignal.timeout(limits.setupMs),
      });
      if (!upUrlRes.ok) throw await b2Error('get_upload_url', upUrlRes);
      const upUrl = (await upUrlRes.json()) as { uploadUrl: string; authorizationToken: string };
      // The body goes through `postFileStream` (node:https + stream.pipeline), NOT fetch: with a streamed request
      // body, Node's fetch keeps what it has sent live until the request ends, so memory grows to the file size — 3a
      // Step 7 measured 614 MB peak RSS uploading a 535 MB file, and 632 MB against a 25 MB/s local sink where
      // node:http stayed at 111 MB. (Measured behaviour; where inside fetch the chunks are held is not established.)
      // Content-Length is set so B2 receives a sized body, never chunked.
      const t0 = Date.now();
      let outcome: TransferPhaseLog['outcome'] = 'error';
      try {
        const upRes = await postFileStream(upUrl.uploadUrl, {
          Authorization: upUrl.authorizationToken,
          'X-Bz-File-Name': encodePath(path),
          'X-Bz-Content-Sha1': sha1,
          'Content-Type': 'application/gzip',
          'Content-Length': String(bytes),
        }, localPath, { deadlineMs: bodyBudgetMs });
        if (upRes.status < 200 || upRes.status >= 300) {
          outcome = 'refused';
          throw new B2CallError('upload', upRes.status, b2ErrorCode(upRes.text), upRes.text, parseRetryAfterMs(upRes.retryAfter));
        }
        outcome = 'ok';
        return JSON.parse(upRes.text) as B2FileVersion;
      } catch (err) {
        if ((err as Error)?.message?.includes(UPLOAD_DEADLINE_MARK)) outcome = 'deadline';
        throw err;
      } finally {
        onPhase?.(phaseLog('upload_body', attempt, outcome === 'ok' ? bytes : null, Date.now() - t0, bodyBudgetMs, outcome));
      }
    }, { ...B2_RETRY_DEFAULTS, retryAfterCapMs: limits.setupMs, reauth: () => this.b2Reauthorize(limits.setupMs), onAttempt: this.b2AttemptLog });
    // Coltrane 1: the response names the version that was stored — check every field we sent.
    assertB2Version('upload response', up, { action: 'upload', bucketId, fileName: path, sha1, bytes });
    // Coltrane 2: read the SAME version back by its id (metadata) and check again.
    const info = await this.b2GetFileInfo(up.fileId, limits.setupMs);
    assertB2Version('b2_get_file_info', info, { action: 'upload', bucketId, fileName: path, sha1, bytes });
    return { bytes, checksum: sha256, sha1, fileId: up.fileId, uri: `b2://${bucket}/${path}` };
  }

  /** Streams a cold object (by NAME) to a local file; SHA-256 by a second streamed pass (AP-4 C-1). */
  async downloadColdFile(
    bucket: string,
    path: string,
    localPath: string,
    expectedFileId?: string,
  ): Promise<{ bytes: number; checksum: string; fileId: string | null }> {
    if (!this.isColdConfigured()) {
      throw new Error('[B75 storage-client] cold storage not configured');
    }
    const auth = await this.b2Authorize();
    const res = await fetch(`${auth.downloadUrl}/file/${bucket}/${encodePath(path)}`, {
      method: 'GET',
      headers: { Authorization: auth.accountAuthToken },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`[B75 storage-client] B2 download (file) failed: ${res.status} — ${body}`);
    }
    if (!res.body) throw new Error('[B75 storage-client] B2 download (file): response has no body stream');
    // 3b (Coltrane 4): a by-NAME read can return a different version than the one the manifest bound; when the caller
    // knows the id, the response's id must equal it, checked before a byte is written.
    const gotId = res.headers.get('x-bz-file-id');
    if (expectedFileId !== undefined && gotId !== expectedFileId) {
      await res.body.cancel().catch(() => {});
      throw new Error(`[B75 storage-client] B2 download by name returned version ${gotId ?? 'none'}, expected ${expectedFileId}`);
    }
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(localPath, { mode: 0o600 }));
    const checksum = await sha256HexStream(fs.createReadStream(localPath));
    return { bytes: fs.statSync(localPath).size, checksum, fileId: gotId };
  }

  /**
   * 3b item 2 — the exact-version read (plan r2 OBJ-3b): streams the stored version `fileId` (b2_download_file_by_id) to
   * a 0600 local file; SHA-256 by a second streamed pass. The response's `x-bz-file-id` must equal `fileId`.
   * NOT retried (A-5): a download spends the shared daily B2 budget, and 3c's scheduler owns re-tries. Bounded by
   * `limits` when given (setup + bytes ÷ floor), like the warm read.
   */
  async downloadColdFileById(
    fileId: string,
    localPath: string,
    bound?: { expectedBytes: number; limits: ColdTransferLimits; onPhase?: (p: TransferPhaseLog) => void },
  ): Promise<{ bytes: number; checksum: string; fileId: string }> {
    if (!this.isColdConfigured()) {
      throw new Error('[B75 storage-client] cold storage not configured');
    }
    // 3c plan r3 edit 6 (Langston): the bound refusal is logged HERE, once, for every bounded caller — the same
    // outcome-in-finally shape as downloadWarmFile — so a deadline abort is never silent at any call site.
    const budgetMs = bound ? phaseBudgetMs(bound.expectedBytes, bound.limits) : null;
    const t0 = Date.now();
    let outcome: TransferPhaseLog['outcome'] = 'error';
    try {
      const auth = await this.b2Authorize(bound?.limits.setupMs);
      const res = await fetch(`${auth.downloadUrl}/b2api/v3/b2_download_file_by_id?fileId=${encodeURIComponent(fileId)}`, {
        method: 'GET',
        headers: { Authorization: auth.accountAuthToken },
        ...(budgetMs !== null ? { signal: AbortSignal.timeout(budgetMs) } : {}),
      });
      if (!res.ok) {
        outcome = 'refused';
        throw await b2Error('download_file_by_id', res);
      }
      if (!res.body) throw new Error('[B75 storage-client] B2 download by id: response has no body stream');
      const gotId = res.headers.get('x-bz-file-id');
      if (gotId !== fileId) {
        await res.body.cancel().catch(() => {});
        throw new Error(`[B75 storage-client] B2 download by id returned version ${gotId ?? 'none'}, expected ${fileId}`);
      }
      await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(localPath, { mode: 0o600 }));
      const checksum = await sha256HexStream(fs.createReadStream(localPath));
      outcome = 'ok';
      return { bytes: fs.statSync(localPath).size, checksum, fileId };
    } catch (err) {
      if ((err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError') outcome = 'deadline';
      throw err;
    } finally {
      if (bound) {
        const got = fs.existsSync(localPath) ? fs.statSync(localPath).size : 0;
        const entry = phaseLog('cold_read_by_id', 1, got, Date.now() - t0, budgetMs, outcome);
        if (bound.onPhase) bound.onPhase(entry);
        else if (outcome !== 'ok') console.warn(`[B75 storage-client] cold read by id ${fileId} ${JSON.stringify(entry)}`);
      }
    }
  }

  /** `b2_get_file_info` by file id — metadata only, no file bytes. */
  async b2GetFileInfo(fileId: string, setupMs?: number): Promise<B2FileVersion> {
    // 3b amendment 1: retried — an idempotent metadata read; a 503 here after an attested upload must not throw that
    // upload away and manufacture an orphan.
    return withB2Retry('get_file_info', async () => {
      const auth = await this.b2Authorize(setupMs);
      const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_file_info`, {
        method: 'POST',
        headers: { Authorization: auth.accountAuthToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
        ...(setupMs !== undefined ? { signal: AbortSignal.timeout(setupMs) } : {}),
      });
      if (!res.ok) throw await b2Error('get_file_info', res);
      return (await res.json()) as B2FileVersion;
    }, {
      ...B2_RETRY_DEFAULTS,
      ...(setupMs !== undefined ? { retryAfterCapMs: setupMs } : {}),
      reauth: () => this.b2Reauthorize(setupMs),
      onAttempt: this.b2AttemptLog,
    });
  }

  /**
   * 3b item 3 — every stored VERSION under `prefix` (b2_list_file_versions), paged until B2 returns no next marker
   * (plan r2 binding C-2: a listing that cannot finish FAILS — it never returns a partial, low inventory). Each page is
   * an idempotent metadata read, so it is retried like the other JSON calls. Returns the versions and the page count.
   */
  async listColdFileVersions(
    bucket: string,
    prefix: string,
    setupMs?: number,
  ): Promise<{ versions: B2ListedVersion[]; pages: number; bucketId: string }> {
    const bucketId = await this.b2ResolveBucketId(bucket, setupMs);
    const versions: B2ListedVersion[] = [];
    let startFileName: string | null = null;
    let startFileId: string | null = null;
    let pages = 0;
    for (;;) {
      const page = await withB2Retry('list_file_versions', async () => {
        const auth = await this.b2Authorize(setupMs);
        const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_list_file_versions`, {
          method: 'POST',
          headers: { Authorization: auth.accountAuthToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bucketId,
            prefix,
            maxFileCount: 1000,
            ...(startFileName !== null ? { startFileName } : {}),
            ...(startFileId !== null ? { startFileId } : {}),
          }),
          ...(setupMs !== undefined ? { signal: AbortSignal.timeout(setupMs) } : {}),
        });
        if (!res.ok) throw await b2Error('list_file_versions', res);
        return (await res.json()) as { files: B2ListedVersion[]; nextFileName: string | null; nextFileId: string | null };
      }, {
        ...B2_RETRY_DEFAULTS,
        ...(setupMs !== undefined ? { retryAfterCapMs: setupMs } : {}),
        reauth: () => this.b2Reauthorize(setupMs),
        onAttempt: this.b2AttemptLog,
      });
      pages++;
      versions.push(...page.files);
      if (!page.nextFileName && !page.nextFileId) break;
      startFileName = page.nextFileName;
      startFileId = page.nextFileId;
    }
    return { versions, pages, bucketId };
  }

  /**
   * Deletes ONE file version by id (amendment 4 C-1: the 3a proof objects; 3b: the P10 orphan). Needs the `deleteFiles`
   * capability, which the narrowed key of 3d will not have — so this is usable only until 3d step 5.
   */
  async deleteColdVersion(fileName: string, fileId: string): Promise<void> {
    const auth = await this.b2Authorize();
    const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_delete_file_version`, {
      method: 'POST',
      headers: { Authorization: auth.accountAuthToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, fileId }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`[B75 storage-client] B2 delete_file_version failed: ${res.status} — ${body}`);
    }
  }

  async deleteCold(bucket: string, path: string, setupMs?: number): Promise<void> {
    // B2 deletes go by fileId, not by name. Need to first list_file_versions to get fileId.
    if (!this.isColdConfigured()) {
      throw new Error('[B75 storage-client] cold storage not configured');
    }
    const auth = await this.b2Authorize(setupMs);
    // Find the file's fileId
    const listRes = await fetch(`${auth.apiUrl}/b2api/v3/b2_list_file_names`, {
      method: 'POST',
      headers: {
        Authorization: auth.accountAuthToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bucketId: await this.b2ResolveBucketId(bucket, setupMs),
        startFileName: path,
        maxFileCount: 1,
      }),
      ...(setupMs !== undefined ? { signal: AbortSignal.timeout(setupMs) } : {}),
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
      ...(setupMs !== undefined ? { signal: AbortSignal.timeout(setupMs) } : {}),
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

/**
 * The cold transfer limits (3b plan r4/r5), read from `data_lifecycle` by every caller — never a literal (A-4):
 * `cold_upload_setup_ms` bounds each B2 JSON call (authorize, list_buckets, get_upload_url, get_file_info) and caps a
 * Retry-After; each BODY phase (the warm read once, the upload body per attempt) gets setup + bytes ÷
 * `cold_body_min_bytes_per_s` — the setup term covers the connect and the server's answer, which do not scale with
 * size. Per phase, not one envelope.
 */
export interface ColdTransferLimits {
  setupMs: number;
  minBytesPerSec: number;
}

/** One transfer phase's own deciding quantity, logged on EVERY attempt including an abort (A-4). */
export interface TransferPhaseLog {
  phase: 'warm_read' | 'upload_body' | 'cold_read_by_id';
  attempt: number;
  bytes: number | null;
  elapsed_ms: number;
  budget_ms: number | null;
  achieved_bytes_per_s: number | null;
  outcome: 'ok' | 'deadline' | 'refused' | 'error';
}

/** A body phase's budget, for the warm read and for every upload body alike: setup + bytes ÷ floor. */
export function phaseBudgetMs(bytes: number, limits: ColdTransferLimits): number {
  return limits.setupMs + Math.ceil((bytes / limits.minBytesPerSec) * 1000);
}

export function phaseLog(
  phase: TransferPhaseLog['phase'],
  attempt: number,
  bytes: number | null,
  elapsedMs: number,
  budgetMs: number | null,
  outcome: TransferPhaseLog['outcome'],
): TransferPhaseLog {
  const achieved = bytes !== null && elapsedMs > 0 ? Math.round((bytes / elapsedMs) * 1000) : null;
  return { phase, attempt, bytes, elapsed_ms: elapsedMs, budget_ms: budgetMs, achieved_bytes_per_s: achieved, outcome };
}

/** A B2 non-2xx response as a classifiable error (status + B2 `code` + Retry-After). */
async function b2Error(op: string, res: Response): Promise<B2CallError> {
  const text = await res.text().catch(() => '');
  return new B2CallError(op, res.status, b2ErrorCode(text), text, parseRetryAfterMs(res.headers.get('retry-after')));
}

/** The message marker of a body-deadline abort in postFileStream (the upload phase log reads it). */
export const UPLOAD_DEADLINE_MARK = 'upload body deadline';

/** The cold upload's attested result (amendment 4 / 3a): what the manifest records beside its SHA-256. */
export interface ColdFileUpload {
  bytes: number;
  checksum: string; // SHA-256 hex (the manifest's convention)
  sha1: string; // the SHA-1 B2 verified on receipt
  fileId: string; // the exact stored VERSION (Coltrane 3)
  uri: string;
}

/** The fields of a B2 file version this code reads (upload response and `b2_get_file_info` share the shape). */
export interface B2FileVersion {
  action: string;
  bucketId: string;
  fileName: string;
  fileId: string;
  contentSha1: string;
  contentLength: number;
}

/** One row of b2_list_file_versions (3b item 3). `action` is 'upload' for a stored version, 'hide' for a hide marker. */
export interface B2ListedVersion {
  fileId: string;
  fileName: string;
  action: string;
  contentLength: number;
  contentSha1: string | null;
  uploadTimestamp: number;
}

/** Throws unless the version is exactly the one sent (Coltrane 1-2). Exported for tests. */
export function assertB2Version(
  where: string,
  v: B2FileVersion,
  want: { action: string; bucketId: string; fileName: string; sha1: string; bytes: number },
): void {
  const bad: string[] = [];
  if (v.action !== want.action) bad.push(`action=${v.action}`);
  if (v.bucketId !== want.bucketId) bad.push(`bucketId=${v.bucketId}`);
  if (v.fileName !== want.fileName) bad.push(`fileName=${v.fileName}`);
  if (v.contentSha1 !== want.sha1) bad.push(`contentSha1=${v.contentSha1}`);
  if (Number(v.contentLength) !== want.bytes) bad.push(`contentLength=${v.contentLength}`);
  if (!v.fileId) bad.push('fileId missing');
  if (bad.length) {
    throw new Error(`[B75 storage-client] B2 ${where} does not attest the version sent (${bad.join(', ')}; expected ${want.fileName} ${want.bytes} B sha1 ${want.sha1})`);
  }
}

/** SHA-256 and SHA-1 of a file in ONE streamed read, plus its size. */
export async function hashFileSha256Sha1(localPath: string): Promise<{ bytes: number; sha256: string; sha1: string }> {
  const h256 = crypto.createHash('sha256');
  const h1 = crypto.createHash('sha1');
  let bytes = 0;
  for await (const chunk of fs.createReadStream(localPath)) {
    h256.update(chunk as Buffer);
    h1.update(chunk as Buffer);
    bytes += (chunk as Buffer).length;
  }
  return { bytes, sha256: h256.digest('hex'), sha1: h1.digest('hex') };
}

/**
 * POSTs a local file as the request body WITH backpressure: `stream.pipeline` reads the next chunk only when the
 * socket drains, so memory stays at a few chunks whatever the file size (3a Step 7; see uploadColdFile). Resolves with
 * the response status and body text; a socket idle for 300 s is destroyed (it times the send phase too, which fetch's
 * response timeouts never did). Redirects are not followed — a 3xx is returned like any other non-2xx. Only https, or
 * http to a loopback host under the test runner (the unit tests' local receiver) — any other URL is refused.
 */
export async function postFileStream(
  url: string,
  headers: Record<string, string>,
  localPath: string,
  opts: { deadlineMs?: number } = {},
): Promise<{ status: number; text: string; retryAfter: string | null }> {
  const u = new URL(url);
  const loopback = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  const underTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback && underTest)) {
    throw new Error(`[B75 storage-client] refusing a non-https upload URL: ${u.protocol}//${u.host}`);
  }
  const transport = u.protocol === 'https:' ? https : http;
  return await new Promise((resolve, reject) => {
    let settled = false;
    let deadline: NodeJS.Timeout | null = null;
    const done = (err: Error | null, v?: { status: number; text: string; retryAfter: string | null }) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      // A receiver that answers before the whole body is sent (e.g. a 400 on the headers) and keeps the socket open
      // would otherwise leave the request and the file read stream alive: the open read stream pins the temp file's
      // inode after the caller unlinks it, so its disk space is never reclaimed (Langston, 3a Step-9 Step 4). Destroying
      // the request fails the pipeline, which destroys the read stream; that late pipeline error is then moot.
      if (!req.writableEnded) req.destroy();
      if (err) reject(err);
      else resolve(v!);
    };
    const req = transport.request(u, { method: 'POST', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const ra = res.headers['retry-after'];
        done(null, { status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8'), retryAfter: typeof ra === 'string' ? ra : null });
      });
      res.on('error', (e) => done(e));
    });
    // Two independent bounds (3b mechanics): the idle timer catches a dead socket; the deadline catches a trickle that
    // is never idle for 300 s. The deadline ABORTS — it settles the promise, and done() destroys the request.
    req.setTimeout(300_000, () => req.destroy(new Error('[B75 storage-client] upload socket idle for 300 s')));
    if (opts.deadlineMs !== undefined) {
      deadline = setTimeout(() => done(new Error(`[B75 storage-client] ${UPLOAD_DEADLINE_MARK} of ${opts.deadlineMs} ms passed`)), opts.deadlineMs);
    }
    req.on('error', (e) => done(e));
    // A pipeline failure before the response settles rejects; after it (including the destroy in done()), it is moot.
    pipeline(fs.createReadStream(localPath), req).catch((e) => done(e as Error));
  });
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
