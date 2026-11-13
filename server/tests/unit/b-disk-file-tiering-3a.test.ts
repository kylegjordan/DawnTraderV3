import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  StorageClient,
  assertB2Version,
  hashFileSha256Sha1,
} from '../../services/data-archive/storage-client';
import { readMemAvailableKb, runColdProof } from '../../scripts/b75-cold-proof';

// B-DISK-FILE-TIERING amendment 4, increment 3a (= amendment 1's AP-4 + the attestation; Langston PROCEED on plan r2):
// the streamed, attested cold upload; the rotator / rehydrate / context-bridge on the file forms; the manifest columns;
// the memory-proof harness. AP-6's memory fence is here as a BUFFER-memory measurement (see the first describe).

const ROOT = path.join(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'b-dft-3a-'));
  dirs.push(d);
  return d;
}

/** A fake B2 behind global fetch. The upload handler READS THE BODY STREAM chunk by chunk, sampling Buffer memory. */
function fakeB2(opts: { tamper?: Partial<Record<'action' | 'fileName' | 'contentSha1' | 'contentLength', unknown>> } = {}) {
  const seen = { uploads: 0, infoCalls: 0, peakArrayBuffers: 0, bodyWasStream: false };
  let stored: { fileName: string; sha1: string; len: number } | null = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit & { duplex?: string } = {}) => {
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/b2_authorize_account')) {
      return json({ accountId: 'acct', authorizationToken: 'tok', apiInfo: { storageApi: { apiUrl: 'https://api.fake', downloadUrl: 'https://dl.fake' } } });
    }
    if (url.endsWith('/b2_get_upload_url')) return json({ uploadUrl: 'https://up.fake/upload', authorizationToken: 'up-tok' });
    if (url === 'https://up.fake/upload') {
      seen.uploads++;
      const body = init.body as ReadableStream<Uint8Array>;
      seen.bodyWasStream = typeof (body as { getReader?: unknown })?.getReader === 'function';
      expect(init.duplex).toBe('half');
      const h1 = crypto.createHash('sha1');
      let len = 0;
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        h1.update(value);
        len += value.length;
        seen.peakArrayBuffers = Math.max(seen.peakArrayBuffers, process.memoryUsage().arrayBuffers);
      }
      const headers = init.headers as Record<string, string>;
      const sha1 = h1.digest('hex');
      if (sha1 !== headers['X-Bz-Content-Sha1']) return new Response('sha1 mismatch', { status: 400 });
      stored = { fileName: decodeURIComponent(headers['X-Bz-File-Name']), sha1, len };
      return json({ action: 'upload', bucketId: 'bucket-id', fileName: stored.fileName, fileId: 'file-v1', contentSha1: sha1, contentLength: len, ...opts.tamper });
    }
    if (url.endsWith('/b2_get_file_info')) {
      seen.infoCalls++;
      return json({ action: 'upload', bucketId: 'bucket-id', fileName: stored!.fileName, fileId: 'file-v1', contentSha1: stored!.sha1, contentLength: stored!.len });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
  return seen;
}

function client(): StorageClient {
  process.env.SUPABASE_URL = 'https://proj.fake';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'srk';
  process.env.B2_KEY_ID = 'k';
  process.env.B2_APPLICATION_KEY = 'a';
  process.env.B2_BUCKET = 'dt-archive-cold';
  process.env.B2_BUCKET_ID = 'bucket-id';
  return new StorageClient();
}

describe('3a — uploadColdFile streams the file and attests the stored version (AP-4 C-1, Coltrane 1-2, AP-6)', () => {
  it('a 128 MiB file uploads with Buffer memory far below the file size (AP-6 memory fence)', async () => {
    const dir = tmp();
    const f = path.join(dir, 'big.gz');
    const chunk = crypto.randomBytes(1024 * 1024);
    const fd = fs.openSync(f, 'w');
    for (let i = 0; i < 128; i++) fs.writeSync(fd, chunk);
    fs.closeSync(fd);
    const seen = fakeB2();
    const before = process.memoryUsage().arrayBuffers;
    const r = await client().uploadColdFile('dt-archive-cold', 'x/2026-06.jsonl.gz', f);
    expect(seen.bodyWasStream).toBe(true);
    expect(r.bytes).toBe(128 * 1024 * 1024);
    expect(r.fileId).toBe('file-v1');
    expect(seen.infoCalls).toBe(1);
    // A buffered path holds >= the whole 128 MiB at once. The streamed path's live data is a few 64 KiB chunks, but
    // spent chunks count in `arrayBuffers` until GC runs: measured locally at 32.0-36.9 MiB over 8 runs (2026-11-13).
    // 64 MiB sits between the two with room on both sides; the buffered mutation measured above it.
    expect(seen.peakArrayBuffers - before).toBeLessThan(64 * 1024 * 1024);
  }, 60_000);

  it('the returned sha256 / sha1 are the file\'s, from one streamed read', async () => {
    const dir = tmp();
    const f = path.join(dir, 'small.gz');
    fs.writeFileSync(f, 'hello cold');
    const h = await hashFileSha256Sha1(f);
    expect(h.sha256).toBe(crypto.createHash('sha256').update('hello cold').digest('hex'));
    expect(h.sha1).toBe(crypto.createHash('sha1').update('hello cold').digest('hex'));
    expect(h.bytes).toBe(10);
    fakeB2();
    const r = await client().uploadColdFile('dt-archive-cold', 'x/a.jsonl.gz', f);
    expect(r).toMatchObject({ checksum: h.sha256, sha1: h.sha1, bytes: 10, uri: 'b2://dt-archive-cold/x/a.jsonl.gz' });
  });

  it('a response that does not attest the version sent throws (name, sha1, length, action)', async () => {
    const dir = tmp();
    const f = path.join(dir, 'small.gz');
    fs.writeFileSync(f, 'hello cold');
    for (const tamper of [{ fileName: 'other' }, { contentSha1: 'deadbeef' }, { contentLength: 9 }, { action: 'hide' }]) {
      fakeB2({ tamper });
      await expect(client().uploadColdFile('dt-archive-cold', 'x/a.jsonl.gz', f)).rejects.toThrow(/does not attest/);
    }
  });

  it('assertB2Version names every mismatched field and requires a file id', () => {
    const want = { action: 'upload', bucketId: 'b', fileName: 'n', sha1: 's', bytes: 3 };
    expect(() => assertB2Version('t', { action: 'upload', bucketId: 'b', fileName: 'n', fileId: 'f', contentSha1: 's', contentLength: 3 }, want)).not.toThrow();
    expect(() => assertB2Version('t', { action: 'upload', bucketId: 'x', fileName: 'n', fileId: '', contentSha1: 's', contentLength: 3 }, want))
      .toThrow(/bucketId=x.*fileId missing/);
  });
});

describe('3a — the memory-proof harness touches no manifest and no warm object (Langston C-2, C-1)', () => {
  const row = { id: 'm1', storage_uri: 'supabase://warm/archive/t/2026-06.jsonl.gz', checksum: 'ck', source_table: 't', partition_label: '2026-06' };
  it('downloads, uploads under _proof/, deletes that version by id, removes its temp folder, reports the peak', async () => {
    const tempRoot = tmp();
    let local = '';
    const storage = {
      downloadWarmFile: vi.fn(async (_b: string, _p: string, l: string) => { local = l; fs.writeFileSync(l, 'x'); return { checksum: 'ck', bytes: 1 }; }),
      uploadColdFile: vi.fn(async () => ({ checksum: 'ck', sha1: 's1', fileId: 'f1', bytes: 1, uri: 'b2://c/_proof/t/2026-06.jsonl.gz' })),
      deleteColdVersion: vi.fn(async () => {}),
    };
    let rss = 100_000;
    const r = await runColdProof(row, { storage, coldBucket: 'c', tempRoot, rssKb: () => (rss += 10), memAvailableKb: () => 2_000_000 });
    expect(storage.uploadColdFile.mock.calls[0][1]).toBe('_proof/t/2026-06.jsonl.gz');
    expect(storage.deleteColdVersion).toHaveBeenCalledWith('_proof/t/2026-06.jsonl.gz', 'f1');
    expect(r).toMatchObject({ proof_deleted: true, proof_file_id: 'f1', bytes: 1, min_memavailable_kb: 2_000_000 });
    expect(r.peak_rss_kb).toBeGreaterThan(100_000);
    expect(fs.existsSync(local)).toBe(false);
    // by construction: its dependencies hold no database client and no deleteWarm
    expect(Object.keys(storage)).not.toContain('deleteWarm');
  });
  it('stops on warm checksum drift before any upload, and still removes its temp folder', async () => {
    const tempRoot = tmp();
    const storage = {
      downloadWarmFile: vi.fn(async (_b: string, _p: string, l: string) => { fs.writeFileSync(l, 'x'); return { checksum: 'other', bytes: 1 }; }),
      uploadColdFile: vi.fn(), deleteColdVersion: vi.fn(),
    };
    await expect(runColdProof(row, { storage: storage as never, coldBucket: 'c', tempRoot })).rejects.toThrow(/drift/);
    expect(storage.uploadColdFile).not.toHaveBeenCalled();
    expect(fs.readdirSync(tempRoot)).toEqual([]);
  });
  it('parses MemAvailable', () => {
    expect(readMemAvailableKb('MemTotal:  3800000 kB\nMemAvailable:    1673988 kB\n')).toBe(1673988);
    expect(readMemAvailableKb('nothing')).toBeNull();
  });
  it('the harness source never writes the manifest and never deletes warm', () => {
    const src = read('server/scripts/b75-cold-proof.ts');
    expect(src).not.toMatch(/INSERT INTO data_archive_manifest|UPDATE data_archive_manifest/);
    expect(src).not.toMatch(/deleteWarm\(/);
  });
});

describe('3a — every caller is on the file forms (AP-4 C-2, Langston N1)', () => {
  const callers = ['server/scripts/b75-cold-rotator.ts', 'server/scripts/b75-rehydrate.ts', 'server/scripts/context-bridge-log-ttl.ts'];
  for (const c of callers) {
    it(`${path.basename(c)} calls no buffered whole-object storage method`, () => {
      const src = read(c);
      expect(src).not.toMatch(/\.(uploadCold|downloadCold|uploadWarm|downloadWarm)\(/);
    });
  }
  it('the rotator\'s storage dependency is narrowed to the file forms by type (N1)', () => {
    expect(read('server/scripts/b75-cold-rotator.ts')).toContain("storage: Pick<StorageClient, 'downloadWarmFile' | 'uploadColdFile' | 'deleteWarm'>;");
  });
  it('the cold manifest row records the attestation; the step list and basis cite it (L-2)', () => {
    const src = read('server/scripts/b75-cold-rotator.ts');
    expect(src).toContain("$3, $4, $5, 'b2-sha1-attested'");
    expect(src).toContain('[candidate.id, coldUri, cold.fileId, cold.sha1, cold.bytes]');
    expect(src).not.toMatch(/verify by re-download/);
    expect(src).toContain('ATTESTED identical');
  });
});

describe('3a — the migration (Coltrane 3)', () => {
  const fwd = read('drizzle/migrations/2026-11-13-b-disk-file-tiering-cold-attestation.sql');
  it('adds the four columns and the method constraint, labels existing cold rows, checks itself', () => {
    for (const c of ['provider_file_id', 'provider_sha1', 'provider_bytes', 'verification_method']) {
      expect(fwd).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\b`));
    }
    expect(fwd).toContain("CHECK (verification_method IS NULL OR verification_method IN ('b2-sha1-attested', 'sha256-roundtrip'))");
    expect(fwd).toContain("UPDATE data_archive_manifest SET verification_method = 'sha256-roundtrip'");
    expect(fwd).toMatch(/^BEGIN;/m);
    expect(fwd).toMatch(/^COMMIT;/m);
  });
  it('MANIFEST carries the forward file and not the rollback', () => {
    const manifest = read('drizzle/migrations/MANIFEST.txt').split(/\r?\n/).map((l) => l.trim());
    expect(manifest).toContain('2026-11-13-b-disk-file-tiering-cold-attestation.sql');
    expect(manifest).not.toContain('2026-11-13-b-disk-file-tiering-cold-attestation-rollback.sql');
  });
});
