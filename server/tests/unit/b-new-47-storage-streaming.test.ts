/**
 * B-NEW-47 — storage-client streaming round-trip regression-lock (RI #161).
 *
 * Proves the OOM defect is gone on BOTH directions:
 *   - uploadWarmFile streams a file in ≤6 MiB TUS chunks (never one whole-file
 *     Buffer) and the bytes + SHA-256 round-trip exactly.
 *   - downloadWarmFile streams the response body to a file and checksums the
 *     on-disk bytes (second read-pass).
 *
 * NOTE (no-silent-caps): this unit test exercises a 45 MiB synthetic object (8
 * TUS chunks) to validate streaming mechanics fast in CI. The TRUE >1 GB
 * validation is the attended staging force-sweep of the 31 GB May ticker
 * partition (B-NEW-47 Step 6) — a multi-GB object cannot run in CI.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StorageClient } from '../../services/data-archive/storage-client.js';

const SIX_MIB = 6 * 1024 * 1024;
let tmpDir: string;
const realFetch = globalThis.fetch;

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b47-storage-'));
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function writeSyntheticFile(name: string, bytes: number): { filePath: string; sha256: string } {
  const filePath = path.join(tmpDir, name);
  const buf = crypto.randomBytes(bytes);
  fs.writeFileSync(filePath, buf);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  return { filePath, sha256 };
}

describe('B-NEW-47 uploadWarmFile (streamed TUS from file)', () => {
  it('streams a >40MB object in ≤6 MiB chunks and round-trips bytes + checksum', async () => {
    const size = 45 * 1024 * 1024; // > 40 MB single-call threshold → TUS path
    const { filePath, sha256 } = writeSyntheticFile('upload-large.bin', size);

    const patchBodies: Buffer[] = [];
    let tusOffset = 0;
    let resumableCreates = 0;
    let singleCallPosts = 0;

    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      const method = init?.method;
      if (method === 'POST' && u.includes('/upload/resumable')) {
        resumableCreates++;
        patchBodies.length = 0;
        tusOffset = 0;
        return new Response(null, {
          status: 201,
          headers: { Location: 'https://test.supabase.co/storage/v1/upload/resumable/abc123' },
        });
      }
      if (method === 'POST' && u.includes('/object/')) {
        singleCallPosts++;
        return new Response(null, { status: 200 });
      }
      if (method === 'PATCH') {
        const offset = Number(init.headers['Upload-Offset']);
        expect(offset).toBe(tusOffset); // chunks must arrive in order
        const body = Buffer.from(init.body as Uint8Array);
        expect(body.length).toBeLessThanOrEqual(SIX_MIB);
        patchBodies.push(body);
        tusOffset += body.length;
        return new Response(null, { status: 204, headers: { 'Upload-Offset': String(tusOffset) } });
      }
      throw new Error(`unexpected fetch ${method} ${u}`);
    }) as any;

    const res = await new StorageClient().uploadWarmFile('dt-archive', 'warm/t/2026-05-01.jsonl.gz', filePath, {
      size,
      checksum: sha256,
    });

    expect(resumableCreates).toBe(1); // routed to TUS, not single-call
    expect(singleCallPosts).toBe(0);
    expect(patchBodies.length).toBe(Math.ceil(size / SIX_MIB)); // 8 chunks
    const reassembled = Buffer.concat(patchBodies);
    expect(reassembled.length).toBe(size);
    expect(crypto.createHash('sha256').update(reassembled).digest('hex')).toBe(sha256);
    expect(res.checksum).toBe(sha256);
    expect(res.bytes).toBe(size);
  });

  it('routes a <40MB object to a single POST (not TUS)', async () => {
    const size = 1 * 1024 * 1024;
    const { filePath, sha256 } = writeSyntheticFile('upload-small.bin', size);

    let resumableCreates = 0;
    let singleCallPosts = 0;
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      if (init?.method === 'POST' && u.includes('/upload/resumable')) {
        resumableCreates++;
        return new Response(null, { status: 201, headers: { Location: 'x' } });
      }
      if (init?.method === 'POST' && u.includes('/object/')) {
        singleCallPosts++;
        return new Response(null, { status: 200 });
      }
      throw new Error(`unexpected ${init?.method} ${u}`);
    }) as any;

    const res = await new StorageClient().uploadWarmFile('dt-archive', 'warm/t/small.jsonl.gz', filePath, {
      size,
      checksum: sha256,
    });
    expect(singleCallPosts).toBe(1);
    expect(resumableCreates).toBe(0);
    expect(res.checksum).toBe(sha256);
  });

  it('rejects a file over the 5 GB hard cap without uploading', async () => {
    // Stat is faked via a tiny file + explicit oversized `size` opt.
    const { filePath } = writeSyntheticFile('tiny.bin', 16);
    globalThis.fetch = vi.fn(async () => {
      throw new Error('should not upload past the cap');
    }) as any;
    await expect(
      new StorageClient().uploadWarmFile('dt-archive', 'warm/t/huge.jsonl.gz', filePath, {
        size: 6 * 1024 * 1024 * 1024, // 6 GB > 5 GB cap
        checksum: 'deadbeef',
      }),
    ).rejects.toThrow(/hard cap/i);
  });
});

describe('B-NEW-47 downloadWarmFile (streamed to file)', () => {
  it('streams the body to disk and checksums the on-disk bytes', async () => {
    const payload = crypto.randomBytes(7 * 1024 * 1024 + 123); // not a chunk multiple
    const expectedSha = crypto.createHash('sha256').update(payload).digest('hex');
    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      expect(init?.method).toBe('GET');
      return new Response(payload, { status: 200 });
    }) as any;

    const outPath = path.join(tmpDir, 'download-out.bin');
    const res = await new StorageClient().downloadWarmFile('dt-archive', 'warm/t/2026-05-02.jsonl.gz', outPath);

    const onDisk = fs.readFileSync(outPath);
    expect(onDisk.length).toBe(payload.length);
    expect(Buffer.compare(onDisk, payload)).toBe(0);
    expect(res.checksum).toBe(expectedSha);
    expect(res.bytes).toBe(payload.length);
  });

  it('throws on a non-OK response', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 404 })) as any;
    await expect(
      new StorageClient().downloadWarmFile('dt-archive', 'warm/t/missing.jsonl.gz', path.join(tmpDir, 'x.bin')),
    ).rejects.toThrow(/download \(file\) failed/);
  });
});
