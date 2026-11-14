import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import {
  StorageClient,
  assertB2Version,
  hashFileSha256Sha1,
  postFileStream,
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

const realFetch = globalThis.fetch;
const servers: http.Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((z) => s.close(() => z()))));
});

// A real collector for the retention fence below: `--expose-gc` set at runtime, `gc` taken from a fresh context, then
// the flag turned back off so no later context in this process gets a `gc` global. The measurement assumes vitest's
// per-file process isolation (the `forks` default; vitest.config.ts pins neither `pool` nor `isolate`).
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;
v8.setFlagsFromString('--no-expose-gc');

/**
 * A fake B2. The JSON API calls go through a global-fetch stub; the UPLOAD goes to a REAL local HTTP receiver, because
 * the 3a Step-7 failure lived in the sender's network path, and a fake that consumes the body itself can never see it
 * (the old fence here did exactly that and passed). `heldBytes` records, at its max, the ArrayBuffer memory still LIVE
 * after a forced collection, sampled every 8 MiB the receiver takes: what the sender is holding on to, not garbage.
 */
async function fakeB2(opts: {
  tamper?: Partial<Record<'action' | 'fileName' | 'contentSha1' | 'contentLength', unknown>>;
} = {}) {
  const seen = { uploads: 0, infoCalls: 0, maxHeldBytes: 0 };
  let stored: { fileName: string; sha1: string; len: number } | null = null;
  const server = http.createServer((req, res) => {
    seen.uploads++;
    gc();
    const base = process.memoryUsage().arrayBuffers;
    const h1 = crypto.createHash('sha1');
    let len = 0;
    let nextSample = 8 * 1024 * 1024;
    req.on('data', (c: Buffer) => {
      h1.update(c);
      len += c.length;
      if (len >= nextSample) {
        nextSample += 8 * 1024 * 1024;
        gc();
        seen.maxHeldBytes = Math.max(seen.maxHeldBytes, process.memoryUsage().arrayBuffers - base);
      }
    });
    req.on('end', () => {
      const sha1 = h1.digest('hex');
      if (sha1 !== req.headers['x-bz-content-sha1']) {
        res.writeHead(400);
        res.end('sha1 mismatch');
        return;
      }
      stored = { fileName: decodeURIComponent(String(req.headers['x-bz-file-name'])), sha1, len };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ action: 'upload', bucketId: 'bucket-id', fileName: stored.fileName, fileId: 'file-v1', contentSha1: sha1, contentLength: len, ...opts.tamper }));
    });
  });
  servers.push(server);
  await new Promise<void>((z) => server.listen(0, '127.0.0.1', () => z()));
  const uploadUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/upload`;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/b2_authorize_account')) {
      return json({ accountId: 'acct', authorizationToken: 'tok', apiInfo: { storageApi: { apiUrl: 'https://api.fake', downloadUrl: 'https://dl.fake' } } });
    }
    if (url.endsWith('/b2_get_upload_url')) return json({ uploadUrl, authorizationToken: 'up-tok' });
    if (url.endsWith('/b2_get_file_info')) {
      seen.infoCalls++;
      return json({ action: 'upload', bucketId: 'bucket-id', fileName: stored!.fileName, fileId: 'file-v1', contentSha1: stored!.sha1, contentLength: stored!.len });
    }
    // A sender that reaches the upload URL through fetch (the pre-fix code, i.e. the mutation) gets the real network.
    if (url === uploadUrl) return realFetch(url, init);
    throw new Error(`unexpected fetch ${url}`);
  }));
  return seen;
}

/** 3b: generous per-phase limits — these tests are about streaming and attestation, not deadlines. */
const LIMITS = { setupMs: 60_000, minBytesPerSec: 1024 };

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
  it('a 96 MiB upload holds only a few MiB live at any point (AP-6 memory fence, 3a Step 7)', async () => {
    const dir = tmp();
    const f = path.join(dir, 'big.gz');
    const chunk = crypto.randomBytes(1024 * 1024);
    const fd = fs.openSync(f, 'w');
    for (let i = 0; i < 96; i++) fs.writeSync(fd, chunk);
    fs.closeSync(fd);
    const seen = await fakeB2();
    const r = await client().uploadColdFile('dt-archive-cold', 'x/2026-06.jsonl.gz', f, LIMITS);
    expect(r.bytes).toBe(96 * 1024 * 1024);
    expect(r.fileId).toBe('file-v1');
    expect(seen.uploads).toBe(1);
    expect(seen.infoCalls).toBe(1);
    // Measured on Node 20.20.0 (the CI, Docker and staging runtime), 2026-11-14: this sender 4.4-16.1 MiB over 6 runs;
    // the mutation (the deployed 3a code, Node fetch with a streamed body, restored) 95.9 MiB — it keeps what it has
    // sent, which is how 3a Step 7 reached 614 MB peak RSS on a 535 MB upload. 40 MiB sits between with room each side.
    // Node 22.18.0 (a laptop), same day: this sender 14.4 MiB, the mutation 101.6 MiB — the fence discriminates on both.
    expect(seen.maxHeldBytes).toBeLessThan(40 * 1024 * 1024);
  }, 60_000);

  it('a receiver that refuses on the headers and keeps the socket open: the request and the file read stream are destroyed', async () => {
    // Langston, 3a Step-9 Step 4 FINDING-1: answered early, nothing reaped the request, so the read stream pinned the
    // temp file's inode after the caller unlinked it. A raw receiver, because a Node http server destroys the socket
    // itself and would hide the leak.
    const dir = tmp();
    const f = path.join(dir, 'big.gz');
    const chunk = crypto.randomBytes(1024 * 1024);
    const fd = fs.openSync(f, 'w');
    for (let i = 0; i < 64; i++) fs.writeSync(fd, chunk);
    fs.closeSync(fd);
    const streams: fs.ReadStream[] = [];
    const realCreate = fs.createReadStream;
    vi.spyOn(fs, 'createReadStream').mockImplementation(((...a: Parameters<typeof fs.createReadStream>) => {
      const s = realCreate(...a);
      streams.push(s);
      return s;
    }) as typeof fs.createReadStream);
    let socketClosed = false;
    const raw = net.createServer((sock) => {
      let head = '';
      let answered = false;
      sock.on('data', (c: Buffer) => {
        if (answered) return; // keep draining, never close
        head += c.toString('latin1');
        if (head.includes('\r\n\r\n')) {
          answered = true;
          sock.write('HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nContent-Length: 4\r\n\r\nnope');
        }
      });
      sock.on('close', () => { socketClosed = true; });
      sock.on('error', () => {});
    });
    await new Promise<void>((z) => raw.listen(0, '127.0.0.1', () => z()));
    try {
      const url = `http://127.0.0.1:${(raw.address() as { port: number }).port}/upload`;
      const r = await postFileStream(url, { 'Content-Length': String(64 * 1024 * 1024) }, f);
      expect(r).toEqual({ status: 400, text: 'nope', retryAfter: null });
      const body = streams[streams.length - 1];
      for (let i = 0; i < 40 && !(body.destroyed && socketClosed); i++) await new Promise((z) => setTimeout(z, 50));
      expect(body.destroyed).toBe(true);
      expect(socketClosed).toBe(true);
    } finally {
      await new Promise<void>((z) => raw.close(() => z()));
    }
  }, 30_000);

  it('refuses a non-https upload URL that is not loopback', async () => {
    const dir = tmp();
    const f = path.join(dir, 'small.gz');
    fs.writeFileSync(f, 'hello cold');
    await expect(postFileStream('http://up.example.com/upload', {}, f)).rejects.toThrow(/refusing a non-https upload URL/);
  });

  it('the returned sha256 / sha1 are the file\'s, from one streamed read', async () => {
    const dir = tmp();
    const f = path.join(dir, 'small.gz');
    fs.writeFileSync(f, 'hello cold');
    const h = await hashFileSha256Sha1(f);
    expect(h.sha256).toBe(crypto.createHash('sha256').update('hello cold').digest('hex'));
    expect(h.sha1).toBe(crypto.createHash('sha1').update('hello cold').digest('hex'));
    expect(h.bytes).toBe(10);
    await fakeB2();
    const r = await client().uploadColdFile('dt-archive-cold', 'x/a.jsonl.gz', f, LIMITS);
    expect(r).toMatchObject({ checksum: h.sha256, sha1: h.sha1, bytes: 10, uri: 'b2://dt-archive-cold/x/a.jsonl.gz' });
  });

  it('a response that does not attest the version sent throws (name, sha1, length, action)', async () => {
    const dir = tmp();
    const f = path.join(dir, 'small.gz');
    fs.writeFileSync(f, 'hello cold');
    for (const tamper of [{ fileName: 'other' }, { contentSha1: 'deadbeef' }, { contentLength: 9 }, { action: 'hide' }]) {
      await fakeB2({ tamper });
      await expect(client().uploadColdFile('dt-archive-cold', 'x/a.jsonl.gz', f, LIMITS)).rejects.toThrow(/does not attest/);
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
