import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  B2CallError,
  B2_RETRY_DEFAULTS,
  classifyB2,
  withB2Retry,
} from '../../services/data-archive/b2-retry';
import { StorageClient, UPLOAD_DEADLINE_MARK, postFileStream } from '../../services/data-archive/storage-client';
import { coldLimitsFromMap } from '../../services/data-archive/cold-limits';
import { deferredFromRotatorLog } from '../../services/archival-run-check';
import {
  ColdUploadFailed,
  acquireRotatorLock,
  releaseRotatorLock,
  type RotatorLock,
  runColdRotationCandidates,
  type ColdFailureStore,
  type ColdRotationCandidate,
  type ColdRotatorConfig,
} from '../../scripts/b75-cold-rotator';

// B-DISK-FILE-TIERING amendment 4, increment 3b, item 1 (pre-audit "3b plan r4"/"r5"; change list "3b item — bounded B2
// retry", Langston's nine amendments): the retry classifier and loop, the cold upload's retry against a real local
// receiver, the per-phase deadline, the rotator's failure record / run deadline / lock, archival-health's deferral parse.

const ROOT = path.join(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const dirs: string[] = [];
const servers: http.Server[] = [];
const noSleep = async () => {};
let savedBackoff: number[];
beforeEach(() => {
  // the agreed waits are 1 s / 4 s; the tests assert the count and order of calls, not the wall clock
  savedBackoff = [...B2_RETRY_DEFAULTS.backoffMs];
  B2_RETRY_DEFAULTS.backoffMs.splice(0, B2_RETRY_DEFAULTS.backoffMs.length, 1, 1);
});
afterEach(async () => {
  B2_RETRY_DEFAULTS.backoffMs.splice(0, B2_RETRY_DEFAULTS.backoffMs.length, ...savedBackoff);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  // closeAllConnections: a paused test receiver keeps its socket, and close() alone waits for it forever
  await Promise.all(servers.splice(0).map((s) => { s.closeAllConnections(); return new Promise<void>((z) => s.close(() => z())); }));
});
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'b-dft-3b-'));
  dirs.push(d);
  return d;
}
const b2err = (status: number | null, code: string | null, retryAfterMs: number | null = null) =>
  new B2CallError('t', status, code, JSON.stringify({ status, code }), retryAfterMs);

describe('3b — the classifier: (status, B2 code), never status alone (amendment 3)', () => {
  it.each([
    [500, null, 'retry'], [503, 'service_unavailable', 'retry'], [503, null, 'retry'],
    [408, 'request_timeout', 'retry'], [429, 'too_many_requests', 'retry'],
    [408, null, 'fatal'], [429, null, 'fatal'], // an unparseable body retries only on 500 / 503
    [401, 'expired_auth_token', 'reauth'], [401, 'unauthorized', 'fatal'], [401, null, 'fatal'],
    [400, 'bad_request', 'fatal'], [403, 'cap_exceeded', 'fatal'], [404, 'not_found', 'fatal'],
    [null, null, 'retry'], // a rejection with no response (amendment 6)
  ] as const)('status %s code %s → %s', (status, code, want) => {
    expect(classifyB2(status, code)).toBe(want);
  });
});

describe('3b — withB2Retry: bounded, ordered, and honest about what it retries', () => {
  const opts = { ...B2_RETRY_DEFAULTS, attempts: 3, backoffMs: [1000, 4000], retryAfterCapMs: 4000, jitter: () => 0 };
  it('503, 503, then 200 → three calls, two waits of 1 s and 4 s, one success', async () => {
    const waits: number[] = [];
    let n = 0;
    const v = await withB2Retry('t', async () => { n++; if (n < 3) throw b2err(503, 'service_unavailable'); return 'ok'; },
      { ...opts, sleep: async (ms) => { waits.push(ms); } });
    expect(v).toBe('ok');
    expect(n).toBe(3);
    expect(waits).toEqual([1000, 4000]);
  });
  it('500 three times → throws after exactly 3 calls', async () => {
    let n = 0;
    await expect(withB2Retry('t', async () => { n++; throw b2err(500, 'internal_error'); }, { ...opts, sleep: noSleep })).rejects.toThrow(/500/);
    expect(n).toBe(3);
  });
  it('400 → no retry (the mutation "retry everything" must turn this red)', async () => {
    let n = 0;
    await expect(withB2Retry('t', async () => { n++; throw b2err(400, 'bad_request'); }, { ...opts, sleep: noSleep })).rejects.toThrow(/400/);
    expect(n).toBe(1);
  });
  it('429 with Retry-After → retried, the wait honours Retry-After capped at the longest backoff', async () => {
    const waits: number[] = [];
    let n = 0;
    await withB2Retry('t', async () => { n++; if (n === 1) throw b2err(429, 'too_many_requests', 30_000); if (n === 2) throw b2err(429, 'too_many_requests', 2_000); return 1; },
      { ...opts, sleep: async (ms) => { waits.push(ms); } });
    expect(waits).toEqual([4000, 2000]);
  });
  it('401 expired_auth_token → re-authorize once, then succeed; 401 unauthorized → no retry', async () => {
    const reauth = vi.fn(async () => {});
    let n = 0;
    await withB2Retry('t', async () => { n++; if (n === 1) throw b2err(401, 'expired_auth_token'); return 1; }, { ...opts, sleep: noSleep, reauth });
    expect(reauth).toHaveBeenCalledTimes(1);
    expect(n).toBe(2);
    let m = 0;
    await expect(withB2Retry('t', async () => { m++; throw b2err(401, 'unauthorized'); }, { ...opts, sleep: noSleep, reauth })).rejects.toThrow(/401/);
    expect(m).toBe(1);
  });
  it('a rejection with no response (socket error, deadline) is retried', async () => {
    let n = 0;
    await withB2Retry('t', async () => { n++; if (n === 1) throw new Error('socket hang up'); return 1; }, { ...opts, sleep: noSleep });
    expect(n).toBe(2);
  });
});

/**
 * A fake B2 for uploadColdFile: the JSON API through a fetch stub, the upload body to a REAL local receiver (3a's
 * lesson). `uploadScript` / `infoScript` are consumed one entry per call: a number is an HTTP status answered with a B2
 * error body; 'ok' stores and attests; 'badsha' answers 200 with a wrong contentSha1.
 */
async function fakeB2(uploadScript: Array<number | 'ok' | 'badsha'>, infoScript: Array<number | 'ok'> = ['ok']) {
  const seen = { uploadUrls: 0, uploads: 0, infos: 0, authorizes: 0, listBuckets: 0, unsignalled: [] as string[] };
  let stored: { fileName: string; sha1: string; len: number } | null = null;
  const server = http.createServer((req, res) => {
    seen.uploads++;
    const step = uploadScript.shift() ?? 'ok';
    const h1 = crypto.createHash('sha1');
    let len = 0;
    req.on('data', (c: Buffer) => { h1.update(c); len += c.length; });
    req.on('end', () => {
      if (typeof step === 'number') {
        res.writeHead(step, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: step, code: step === 400 ? 'bad_request' : 'service_unavailable', message: 'scripted' }));
        return;
      }
      const sha1 = h1.digest('hex');
      stored = { fileName: decodeURIComponent(String(req.headers['x-bz-file-name'])), sha1, len };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ action: 'upload', bucketId: 'bucket-id', fileName: stored.fileName, fileId: `file-v${seen.uploads}`,
        contentSha1: step === 'badsha' ? 'deadbeef' : sha1, contentLength: len }));
    });
  });
  servers.push(server);
  await new Promise<void>((z) => server.listen(0, '127.0.0.1', () => z()));
  const uploadUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/upload`;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    if (!init.signal) seen.unsignalled.push(url.slice(url.lastIndexOf('/') + 1));
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/b2_authorize_account')) {
      seen.authorizes++;
      return json({ accountId: 'acct', authorizationToken: 'tok', apiInfo: { storageApi: { apiUrl: 'https://api.fake', downloadUrl: 'https://dl.fake' } } });
    }
    if (url.endsWith('/b2_get_upload_url')) { seen.uploadUrls++; return json({ uploadUrl, authorizationToken: 'up-tok' }); }
    if (url.endsWith('/b2_list_buckets')) { seen.listBuckets++; return json({ buckets: [{ bucketId: 'bucket-id', bucketName: 'dt-archive-cold' }] }); }
    if (url.endsWith('/b2_get_file_info')) {
      seen.infos++;
      const step = infoScript.shift() ?? 'ok';
      if (typeof step === 'number') return json({ status: step, code: 'service_unavailable' }, step);
      return json({ action: 'upload', bucketId: 'bucket-id', fileName: stored!.fileName, fileId: `file-v${seen.uploads}`, contentSha1: stored!.sha1, contentLength: stored!.len });
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
const LIMITS = { setupMs: 60_000, minBytesPerSec: 1024 };
function file(bytes = 4096): string {
  const f = path.join(tmp(), 'o.gz');
  fs.writeFileSync(f, crypto.randomBytes(bytes));
  return f;
}

describe('3b — uploadColdFile retries the upload with a FRESH upload URL each attempt (amendments 1, 5-8)', () => {
  it('503, 503, then 200 → one success, three upload URLs, three bodies sent, one attestation read', async () => {
    const seen = await fakeB2([503, 503, 'ok']);
    const r = await client().uploadColdFile('dt-archive-cold', 'x/a.jsonl.gz', file(), LIMITS);
    expect(r.fileId).toBe('file-v3');
    expect(seen.uploadUrls).toBe(3);
    expect(seen.uploads).toBe(3);
    expect(seen.infos).toBe(1);
  });
  it('every B2 JSON call on the upload path carries the setup deadline (Langston Step 4 C-2)', async () => {
    const seen = await fakeB2(['ok']);
    await client().uploadColdFile('dt-archive-cold', 'x/a.jsonl.gz', file(), LIMITS);
    expect(seen.authorizes).toBeGreaterThan(0);
    expect(seen.unsignalled).toEqual([]);
  });
  it('without B2_BUCKET_ID, list_buckets runs on the upload path and carries the deadline too (Langston r2 item 3)', async () => {
    const seen = await fakeB2(['ok']);
    const c = client();
    delete process.env.B2_BUCKET_ID; // the env branch would otherwise return before list_buckets is ever fetched
    await c.uploadColdFile('dt-archive-cold', 'x/a.jsonl.gz', file(), LIMITS);
    expect(seen.listBuckets).toBe(1);
    expect(seen.unsignalled).toEqual([]);
  });
  it('500 three times → throws, no further call', async () => {
    const seen = await fakeB2([500, 500, 500, 'ok']);
    await expect(client().uploadColdFile('dt-archive-cold', 'x/a.jsonl.gz', file(), LIMITS)).rejects.toThrow(/500/);
    expect(seen.uploads).toBe(3);
    expect(seen.infos).toBe(0);
  });
  it('400 → no retry', async () => {
    const seen = await fakeB2([400, 'ok']);
    await expect(client().uploadColdFile('dt-archive-cold', 'x/a.jsonl.gz', file(), LIMITS)).rejects.toThrow(/400/);
    expect(seen.uploads).toBe(1);
  });
  it('a 200 that does not attest (bad contentSha1) throws at once — never retried (amendment 8)', async () => {
    const seen = await fakeB2(['badsha', 'ok']);
    await expect(client().uploadColdFile('dt-archive-cold', 'x/a.jsonl.gz', file(), LIMITS)).rejects.toThrow(/does not attest/);
    expect(seen.uploads).toBe(1);
  });
  it('b2_get_file_info 503 then 200 → one success and NO second upload (amendment 1)', async () => {
    const seen = await fakeB2(['ok'], [503, 'ok']);
    const r = await client().uploadColdFile('dt-archive-cold', 'x/a.jsonl.gz', file(), LIMITS);
    expect(r.fileId).toBe('file-v1');
    expect(seen.uploads).toBe(1);
    expect(seen.infos).toBe(2);
  });
  it('every upload attempt logs its own deciding quantity, including the failed ones (A-4)', async () => {
    await fakeB2([503, 'ok']);
    const phases: Array<{ phase: string; attempt: number; outcome: string; budget_ms: number | null }> = [];
    await client().uploadColdFile('dt-archive-cold', 'x/a.jsonl.gz', file(4096), LIMITS, (p) => phases.push(p));
    expect(phases.map((p) => [p.phase, p.attempt, p.outcome])).toEqual([['upload_body', 1, 'refused'], ['upload_body', 2, 'ok']]);
    // the body budget is setup + bytes ÷ floor: 60,000 + ceil(4096 / 1024 × 1000) = 64,000 ms
    expect(phases[0].budget_ms).toBe(64_000);
  });
});

describe('3b — the upload body deadline ABORTS a trickle (mechanics)', () => {
  it('a receiver that never reads: the deadline rejects with its marker and the read stream is destroyed', async () => {
    const f = file(8 * 1024 * 1024);
    const streams: fs.ReadStream[] = [];
    const realCreate = fs.createReadStream;
    vi.spyOn(fs, 'createReadStream').mockImplementation(((...a: Parameters<typeof fs.createReadStream>) => {
      const s = realCreate(...a);
      streams.push(s);
      return s;
    }) as typeof fs.createReadStream);
    const server = http.createServer((req) => { req.pause(); }); // accepts, never reads, never answers
    servers.push(server);
    await new Promise<void>((z) => server.listen(0, '127.0.0.1', () => z()));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/upload`;
    const t0 = Date.now();
    await expect(postFileStream(url, { 'Content-Length': String(8 * 1024 * 1024) }, f, { deadlineMs: 300 }))
      .rejects.toThrow(new RegExp(UPLOAD_DEADLINE_MARK));
    expect(Date.now() - t0).toBeLessThan(5000);
    const body = streams[streams.length - 1];
    for (let i = 0; i < 40 && !body.destroyed; i++) await new Promise((z) => setTimeout(z, 50));
    expect(body.destroyed).toBe(true);
  });
});

const CFG = {
  coldBucket: 'dt-archive-cold', freeFloorBytes: 1, runDeadlineMs: 1_000_000, maxCandidatesPerRun: 6000,
  coldLimits: LIMITS,
} as unknown as ColdRotatorConfig;
const cand = (i: number): ColdRotationCandidate => ({
  id: `m${i}`, source_table: 't', partition_label: `p${i}`, storage_uri: `supabase://w/warm/t/p${i}.jsonl.gz`,
  row_count: 1, bytes_compressed: 10, checksum: 'ck', created_at: new Date(0),
});

describe('3b — the rotator records a final upload failure durably, resolves it on a later success (plan r4 1c)', () => {
  function storage(upload: () => Promise<unknown>) {
    return {
      downloadWarmFile: vi.fn(async (_b: string, _p: string, local: string) => { fs.writeFileSync(local, 'x'); return { bytes: 1, checksum: 'ck' }; }),
      uploadColdFile: vi.fn(upload),
      deleteWarm: vi.fn(async () => {}),
    };
  }
  function store(prior = 0): ColdFailureStore & { recorded: unknown[]; resolved: string[] } {
    const s = {
      recorded: [] as unknown[],
      resolved: [] as string[],
      openFailures: vi.fn(async () => new Map(prior > 0 ? [['t/p1', prior]] : [])),
      recordFailure: vi.fn(async (c: ColdRotationCandidate, f: ColdUploadFailed['attempt']) => { s.recorded.push({ c: c.partition_label, ...f }); }),
      resolve: vi.fn(async (c: ColdRotationCandidate) => { s.resolved.push(c.partition_label); }),
    };
    return s;
  }
  it('an upload that throws after its retries → failed=1, the record carries path, bytes, sha1 and the phases; warm is NOT deleted', async () => {
    const st = storage(async () => { throw new Error('B2 upload failed: 500'); });
    const fs_ = store();
    const r = await runColdRotationCandidates([cand(1)], CFG, { storage: st as never, createClient: () => { throw new Error('no manifest write expected'); }, tempRoot: tmp(), freeBytes: () => 1e12, failures: fs_ });
    expect(r).toMatchObject({ rotated: 0, failed: 1, deferred: 0, candidatesDone: 1 });
    expect(fs_.recorded).toHaveLength(1);
    expect(fs_.recorded[0]).toMatchObject({ c: 'p1', path: 't/p1.jsonl.gz', bytes: 10, bucket: 'dt-archive-cold' });
    expect((fs_.recorded[0] as { sha1: string }).sha1).toMatch(/^[0-9a-f]{40}$/);
    expect(st.deleteWarm).not.toHaveBeenCalled();
  });
  it('a candidate with prior failures that rotates resolves its record', async () => {
    const st = storage(async () => ({ bytes: 1, checksum: 'ck', sha1: 's', fileId: 'f', uri: 'b2://x' }));
    const fs_ = store(2);
    const fakeClient = { connect: async () => {}, query: vi.fn(async () => ({ rows: [{ id: 'c1', completeness_basis: null }] })), end: async () => {} };
    const r = await runColdRotationCandidates([cand(1)], CFG, { storage: st as never, createClient: () => fakeClient as never, tempRoot: tmp(), freeBytes: () => 1e12, failures: fs_ });
    expect(r.rotated).toBe(1);
    expect(fs_.resolved).toEqual(['p1']);
  });
});

describe('3b — the whole-run deadline defers between candidates and logs its quantity (r5)', () => {
  it('past the deadline after the first candidate → deferred = the rest; never cut mid-candidate', async () => {
    let t = 0;
    const st = { downloadWarmFile: vi.fn(async () => { t += 500; throw new Error('boom'); }), uploadColdFile: vi.fn(), deleteWarm: vi.fn() };
    const r = await runColdRotationCandidates([cand(1), cand(2), cand(3)], { ...CFG, runDeadlineMs: 400 } as ColdRotatorConfig,
      { storage: st as never, createClient: () => { throw new Error('x'); }, tempRoot: tmp(), freeBytes: () => 1e12, nowMs: () => t });
    expect(r.candidatesDone).toBe(1);
    expect(r.deferred).toBe(2);
    expect(r.elapsedMs).toBe(500);
  });
  it('archival-health reads deferred= from DONE lines; a pre-3b DONE line reads as 0', () => {
    const log = [
      '[B75 rotator] DONE candidates=0 rotated=0 failed=0 bytes_moved=0 duration_ms=12',
      '[B75 rotator] DONE candidates=6000 rotated=5000 failed=0 bytes_moved=9 deferred=1000 duration_ms=72000000',
    ].join('\n');
    expect(deferredFromRotatorLog(log)).toEqual([0, 1000]);
  });
});

describe('3b — the rotator lock: refuse a live holder, take over a dead one, never another host (plan r4 1b)', () => {
  it('acquire, refuse while held by a live pid, take over a dead pid, release only its own', () => {
    const f = path.join(tmp(), 'lock');
    expect(acquireRotatorLock(f).kind).toBe('acquired');
    // 0600 is a POSIX mode; Windows reports 666 whatever was asked, so the mode is asserted where it means something
    if (process.platform !== 'win32') expect((fs.statSync(f).mode & 0o777).toString(8)).toBe('600');
    expect(acquireRotatorLock(f, () => true).kind).toBe('held');
    fs.writeFileSync(f, JSON.stringify({ pid: 999_999, host: os.hostname(), started_at: 'x' }));
    expect(acquireRotatorLock(f, () => false).kind).toBe('taken_over');
    releaseRotatorLock(f);
    expect(fs.existsSync(f)).toBe(false);
  });
  it('the locked body RETURNS its exit code — it never calls process.exit, so the lock is always released (Step 4 C-1)', () => {
    const src = read('server/scripts/b75-cold-rotator.ts');
    const start = src.indexOf('async function runColdRotatorBodyLocked(');
    const end = src.indexOf('\nfunction parseSupabaseUri', start);
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, end > 0 ? end : undefined).split(/\r?\n(?=\/\*\*|export |async function |function )/)[0];
    expect(body).toMatch(/return failed > 0 \? 1 : 0;/);
    expect(body).not.toMatch(/process\.exit\(/);
    expect(src).toMatch(/code = await runColdRotatorBodyLocked\(cfg, startedAt\);[\s\S]*?releaseRotatorLock\(ROTATOR_LOCK_PATH\);[\s\S]*?if \(code !== 0\) process\.exit\(code\);/);
  });
  it('a holder on ANOTHER host is held, never taken over', () => {
    const f = path.join(tmp(), 'lock');
    fs.writeFileSync(f, JSON.stringify({ pid: 1, host: 'some-other-host', started_at: 'x' }));
    expect(acquireRotatorLock(f, () => false).kind).toBe('held');
  });
  it('the lock is the rotator\'s alone — the liveness canary never reads it (independence asserted, not implied)', () => {
    expect(read('server/scripts/b75-cold-liveness.ts')).not.toMatch(/b75-cold-rotator\.lock|acquireRotatorLock|ROTATOR_LOCK/);
    expect(read('server/scripts/b75-cold-rotator.ts')).toContain("path.join(os.homedir(), '.b75-cold-rotator.lock')");
  });
});

describe('3b — the limits come from data_lifecycle and the migration seeds them (Langston Step-3 condition 1)', () => {
  it('coldLimitsFromMap refuses a missing, non-numeric or non-positive value', () => {
    expect(coldLimitsFromMap(new Map<string, unknown>([['cold_upload_setup_ms', 60000], ['cold_body_min_bytes_per_s', 1048576]]), 't'))
      .toEqual({ setupMs: 60000, minBytesPerSec: 1048576 });
    expect(() => coldLimitsFromMap(new Map<string, unknown>([['cold_upload_setup_ms', 60000]]), 't')).toThrow(/cold_body_min_bytes_per_s/);
    expect(() => coldLimitsFromMap(new Map<string, unknown>([['cold_upload_setup_ms', 0], ['cold_body_min_bytes_per_s', 1]]), 't')).toThrow(/cold_upload_setup_ms/);
  });
  it('the forward migration creates the failure table and seeds all four rows; MANIFEST carries it and not its rollback', () => {
    const sql = read('drizzle/migrations/2026-11-14-b-disk-file-tiering-cold-retry.sql');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS data_archive_cold_upload_failure/);
    for (const k of ['cold_upload_setup_ms', 'cold_body_min_bytes_per_s', 'cold_rotator_max_candidates_per_run', 'cold_rotator_run_deadline_ms']) {
      expect(sql).toContain(`'${k}'`);
    }
    const manifest = read('drizzle/migrations/MANIFEST.txt').split(/\r?\n/).map((l) => l.trim());
    expect(manifest).toContain('2026-11-14-b-disk-file-tiering-cold-retry.sql');
    expect(manifest).not.toContain('2026-11-14-b-disk-file-tiering-cold-retry-rollback.sql');
  });
});

// ── 3b item 2: exact-version reads, the attestation-column reader, and Langston's three r3 carries ──────────────────
function dlFetch(body: Buffer, idHeader: string | null, status = 200) {
  const calls: Array<{ url: string; signalled: boolean }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, signalled: !!init.signal });
    if (url.endsWith('/b2_authorize_account')) {
      return new Response(JSON.stringify({ accountId: 'acct', authorizationToken: 'tok', apiInfo: { storageApi: { apiUrl: 'https://api.fake', downloadUrl: 'https://dl.fake' } } }), { status: 200 });
    }
    const headers: Record<string, string> = {};
    if (idHeader !== null) headers['x-bz-file-id'] = idHeader;
    return new Response(body, { status, headers });
  }));
  return calls;
}

describe('3b item 2 — downloadColdFileById reads the exact stored version (plan r2 OBJ-3b, Coltrane 4)', () => {
  it('streams the version, checks the response id, and hashes the file', async () => {
    const data = crypto.randomBytes(5000);
    const calls = dlFetch(data, 'file-v7');
    const out = path.join(tmp(), 'o.gz');
    const r = await client().downloadColdFileById('file-v7', out);
    expect(r).toEqual({ bytes: 5000, checksum: crypto.createHash('sha256').update(data).digest('hex'), fileId: 'file-v7' });
    expect(calls.some((c) => c.url.includes('b2_download_file_by_id?fileId=file-v7'))).toBe(true);
  });
  it('a response naming another version throws BEFORE any byte is written', async () => {
    dlFetch(crypto.randomBytes(100), 'file-OTHER');
    const out = path.join(tmp(), 'o.gz');
    await expect(client().downloadColdFileById('file-v7', out)).rejects.toThrow(/returned version file-OTHER, expected file-v7/);
    expect(fs.existsSync(out)).toBe(false);
  });
  it('is NOT retried — a 503 throws on the first call (A-5: a download spends the shared budget)', async () => {
    const calls = dlFetch(Buffer.from(JSON.stringify({ code: 'service_unavailable' })), null, 503);
    await expect(client().downloadColdFileById('file-v7', path.join(tmp(), 'o.gz'))).rejects.toThrow(/503/);
    expect(calls.filter((c) => c.url.includes('b2_download_file_by_id')).length).toBe(1);
  });
  it('a by-NAME read with an expected id refuses another version', async () => {
    dlFetch(crypto.randomBytes(100), 'file-OTHER');
    await expect(client().downloadColdFile('dt-archive-cold', 'x/a.jsonl.gz', path.join(tmp(), 'o.gz'), 'file-v7'))
      .rejects.toThrow(/by name returned version file-OTHER, expected file-v7/);
  });
});

describe('3b item 2 — the restore reads the attestation column (the reader, Langston Step-4 carry)', () => {
  it('rehydrate selects provider_file_id and restores a bound row by id, an unbound row by name', () => {
    const src = read('server/scripts/b75-rehydrate.ts');
    expect(src).toContain('manifest.provider_file_id');
    expect(src).toMatch(/download\.provider_file_id\s*\?\s*await storage\.downloadColdFileById\(download\.provider_file_id, localPath\)/);
    expect(src).toMatch(/no bound file id yet — reading by NAME/);
    // the provenance travels in the .completeness.json sidecar, not only on stderr (Langston item 2 (a))
    expect(src).toContain('provider_file_id: download.provider_file_id ?? null,');
    expect(src).toContain("version_bound: download.tier === 'warm' ? true : !!download.provider_file_id,");
  });
});

describe('3b item 2 — Langston r3 carries', () => {
  it('the liveness canary bounds every call on its Buffer path with cold_upload_setup_ms', async () => {
    const src = read('server/scripts/b75-cold-liveness.ts');
    expect(src).toContain("loadColdLimits(c, 'cold-liveness')");
    expect(src).toContain('storage.uploadCold(coldBucket, objPath, payload, setupMs)');
    expect(src).toContain('storage.downloadCold(coldBucket, objPath, setupMs)');
    expect(src).toContain('storage.deleteCold(coldBucket, objPath, setupMs)');
    // and the Buffer forms really carry the signal when given setupMs
    const calls = dlFetch(Buffer.from('hello'), 'file-1');
    await client().downloadCold('dt-archive-cold', '_liveness/x.txt', 60_000);
    expect(calls.filter((c) => !c.signalled)).toEqual([]);
  });
  it('the dry-run exit writes a RUN line before its DONE line', () => {
    const src = read('server/scripts/b75-cold-rotator.ts');
    expect(src).toContain('[B75 rotator] RUN elapsed_ms=${Date.now() - startedAt.getTime()} candidates_done=0');
    expect(src).toMatch(/dry_run=true`,\s*\);\s*console\.log\(\s*`\[B75 rotator\] DONE candidates=\$\{candidates\.length\} rotated=0 failed=0 bytes_moved=0 deferred=\$\{capDeferred\}/);
  });
  it('another host: older than the bound is taken over (a hostname change); within it, held', () => {
    const f = path.join(tmp(), 'lock');
    const now = Date.parse('2026-12-01T03:00:00Z');
    const bound = 2 * 72_000_000; // 40 h
    fs.writeFileSync(f, JSON.stringify({ pid: 1, host: 'renamed-host', started_at: '2026-11-01T03:00:00Z' }));
    expect(acquireRotatorLock(f, () => true, bound, now).kind).toBe('taken_over');
    fs.writeFileSync(f, JSON.stringify({ pid: 1, host: 'renamed-host', started_at: '2026-11-30T03:00:00Z' })); // 24 h old
    expect(acquireRotatorLock(f, () => true, bound, now).kind).toBe('held');
  });
  it('same host: a LIVE holder is never taken over on age, however old (Langston item 2 C-1)', () => {
    const f = path.join(tmp(), 'lock');
    const now = Date.parse('2026-12-01T03:00:00Z');
    fs.writeFileSync(f, JSON.stringify({ pid: 4242, host: os.hostname(), started_at: '2026-11-01T03:00:00Z' }));
    // pid alive and started BEFORE the lock was written → the genuine holder, still running
    expect(acquireRotatorLock(f, () => true, 1, now, () => Date.parse('2026-11-01T02:59:59Z')).kind).toBe('held');
  });
  it('same host: a live pid that started AFTER the lock was written is a recycled pid → taken over', () => {
    const f = path.join(tmp(), 'lock');
    const now = Date.parse('2026-12-01T03:00:00Z');
    fs.writeFileSync(f, JSON.stringify({ pid: 4242, host: os.hostname(), started_at: '2026-11-01T03:00:00Z' }));
    expect(acquireRotatorLock(f, () => true, undefined, now, () => Date.parse('2026-11-20T10:00:00Z')).kind).toBe('taken_over');
  });
  it('the rotator passes 2 x the run deadline as the other-host bound', () => {
    expect(read('server/scripts/b75-cold-rotator.ts')).toContain('acquireRotatorLock(ROTATOR_LOCK_PATH, undefined, 2 * cfg.runDeadlineMs)');
  });
});

// ── 3b item 3: bind the pre-3a cold rows to exact versions; the inventory; the exclusive takeover ────────────────────
import { COLD_NON_ARCHIVE_PREFIXES, coldPathOf, orphanVersions, otherOwnerCounts, ownColdPrefixes, planColdBindings, type UnboundColdRow } from '../../scripts/b75-cold-bind';
import type { B2ListedVersion } from '../../services/data-archive/storage-client';

const ROW: UnboundColdRow = { id: 'r1', source_table: 'context_bridge_log', partition_label: '2026-01', storage_uri: 'b2://dt-archive-cold/context_bridge_log/2026-01.jsonl.gz', bytes_compressed: 13901237, checksum: 'sha256-x' };
const ver = (id: string, over: Partial<B2ListedVersion> = {}): B2ListedVersion => ({ fileId: id, fileName: 'context_bridge_log/2026-01.jsonl.gz', action: 'upload', contentLength: 13901237, contentSha1: 'aa', uploadTimestamp: 1, ...over });

describe('3b item 3 — planColdBindings: one version, identical duplicates, differing duplicates, none, wrong size', () => {
  it('exactly one version of the right size → bind it', () => {
    const [d] = planColdBindings([ROW], [ver('v1')]);
    expect(d).toMatchObject({ kind: 'bind', version: { fileId: 'v1' }, residue: [] });
  });
  it('two byte-identical versions (one SHA-1, one length) → bind the NEWEST; the older is residue (FINDING-2 shape)', () => {
    const [d] = planColdBindings([ROW], [ver('old', { uploadTimestamp: 1783464755637 }), ver('new', { uploadTimestamp: 1783465089251 })]);
    expect(d.kind).toBe('bind');
    if (d.kind !== 'bind') return;
    expect(d.version.fileId).toBe('new');
    expect(d.residue.map((v) => v.fileId)).toEqual(['old']);
  });
  it('two versions with different SHA-1s → needs a download to decide (never a guess)', () => {
    const [d] = planColdBindings([ROW], [ver('a', { contentSha1: 'aa' }), ver('b', { contentSha1: 'bb' })]);
    expect(d.kind).toBe('needs_download');
  });
  it('no version, or none of the manifest size → refused, nothing bound', () => {
    expect(planColdBindings([ROW], [])[0].kind).toBe('refused');
    expect(planColdBindings([ROW], [ver('v1', { contentLength: 9 })])[0]).toMatchObject({ kind: 'refused', reason: expect.stringMatching(/no version .* has the manifest's 13901237 bytes/) });
  });
  it('a hide marker is not a version', () => {
    expect(planColdBindings([ROW], [ver('h', { action: 'hide' })])[0].kind).toBe('refused');
  });
  it('orphans are only ever in the DawnTrader namespaces - the shared bucket token-watch and canary objects are never orphans', () => {
    const vs = [
      ver('v1'),
      ver('o1', { fileName: 'disk_file.diagnostic_reports/phase-41F-L-trace.ndjson.jsonl.gz' }),
      ver('p1', { fileName: '_proof/t/2026-06.jsonl.gz' }),
      ver('c1', { fileName: '_liveness/canary-x.txt' }),
      ver('t1', { fileName: 'token-watch/cold/provenance-follow-up-2026-08-31.jsonl.gz' }),
    ];
    const claimed = new Set([coldPathOf(ROW.storage_uri)!.path]);
    const own = new Set(['context_bridge_log', 'disk_file.diagnostic_reports', '_proof']);
    expect(orphanVersions(vs, claimed, own).map((v) => v.fileId)).toEqual(['o1', 'p1']);
    expect(Object.fromEntries(otherOwnerCounts(vs, own))).toEqual({ _liveness: 1, 'token-watch': 1 });
  });
});

describe('3b item 3 — listColdFileVersions pages to the end, and a failed page FAILS the listing (C-2)', () => {
  it('follows nextFileName/nextFileId across pages and returns every version', async () => {
    const pages = [
      { files: [ver('a')], nextFileName: 'n2', nextFileId: 'i2' },
      { files: [ver('b'), ver('c')], nextFileName: null, nextFileId: null },
    ];
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith('/b2_authorize_account')) return new Response(JSON.stringify({ accountId: 'acct', authorizationToken: 'tok', apiInfo: { storageApi: { apiUrl: 'https://api.fake', downloadUrl: 'https://dl.fake' } } }));
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(pages.shift()));
    }));
    const r = await client().listColdFileVersions('dt-archive-cold', '');
    expect(r.pages).toBe(2);
    expect(r.versions.map((v) => v.fileId)).toEqual(['a', 'b', 'c']);
    expect(bodies[1]).toMatchObject({ startFileName: 'n2', startFileId: 'i2' });
  });
  it('a page that keeps failing throws — never a partial (low) inventory', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/b2_authorize_account')) return new Response(JSON.stringify({ accountId: 'acct', authorizationToken: 'tok', apiInfo: { storageApi: { apiUrl: 'https://api.fake', downloadUrl: 'https://dl.fake' } } }));
      n++;
      if (n === 1) return new Response(JSON.stringify({ files: [ver('a')], nextFileName: 'n2', nextFileId: 'i2' }));
      return new Response(JSON.stringify({ code: 'service_unavailable' }), { status: 503 });
    }));
    await expect(client().listColdFileVersions('dt-archive-cold', '')).rejects.toThrow(/503/);
  });
});

describe('3b item 3 — the takeover itself is exclusive (Langston item 2 finding)', () => {
  it('a dead holder is taken over and the file names OUR pid', () => {
    const f = path.join(tmp(), 'lock');
    fs.writeFileSync(f, JSON.stringify({ pid: 999_999, host: os.hostname(), started_at: new Date().toISOString() }));
    expect(acquireRotatorLock(f, () => false).kind).toBe('taken_over');
    expect(JSON.parse(fs.readFileSync(f, 'utf-8')).pid).toBe(process.pid);
  });
  it('two runs that both judge the holder dead: exactly ONE takes over, the other reads HELD (Langston item 3 C-1)', () => {
    // The second run is started inside the first run's takeover window (after its re-read, before its remove) — the
    // interleaving Langston reproduced with a delay. Without the gate both returned taken_over.
    const f = path.join(tmp(), 'lock');
    fs.writeFileSync(f, JSON.stringify({ pid: 999_999, host: os.hostname(), started_at: new Date().toISOString() }));
    let second: RotatorLock | null = null;
    const first = acquireRotatorLock(f, () => false, undefined, Date.now(), () => null, () => {
      second = acquireRotatorLock(f, () => false, undefined, Date.now(), () => null);
    });
    const kinds = [first.kind, second!.kind].sort();
    expect(kinds).toEqual(['held', 'taken_over']);
    expect(fs.existsSync(`${f}.takeover`)).toBe(false); // the gate is released
  });
  it('a takeover gate left by a run that died mid-takeover is cleared once stale, never blocking forever', () => {
    const f = path.join(tmp(), 'lock');
    fs.writeFileSync(f, JSON.stringify({ pid: 999_999, host: os.hostname(), started_at: new Date().toISOString() }));
    fs.mkdirSync(`${f}.takeover`);
    expect(acquireRotatorLock(f, () => false).kind).toBe('held'); // fresh gate: someone is mid-takeover
    const old = new Date(Date.now() - 11 * 60 * 1000);
    fs.utimesSync(`${f}.takeover`, old, old);
    expect(acquireRotatorLock(f, () => false).kind).toBe('held'); // stale gate removed on this pass
    expect(fs.existsSync(`${f}.takeover`)).toBe(false);
    expect(acquireRotatorLock(f, () => false).kind).toBe('taken_over'); // and the next pass proceeds
  });
});

describe('3b item 3 r2 — the binder fixes (Langston item 3)', () => {
  it('ownColdPrefixes REFUSES a source_table that collides with a non-archive prefix', () => {
    expect([...ownColdPrefixes(['context_bridge_log', 'disk_file.diagnostic_reports'])].sort()).toEqual(['_proof', 'context_bridge_log', 'disk_file.diagnostic_reports']);
    expect(() => ownColdPrefixes(['context_bridge_log', 'token-watch'])).toThrow(/collides with a non-archive cold prefix/);
    expect(() => ownColdPrefixes(['_liveness'])).toThrow(/collides/);
  });
  it('the non-archive prefixes are labelled: token-watch another owner, _liveness ours-untracked', () => {
    expect(COLD_NON_ARCHIVE_PREFIXES.get('token-watch')).toBe('other-owner');
    expect(COLD_NON_ARCHIVE_PREFIXES.get('_liveness')).toBe('ours-untracked');
  });
  it('hide markers are not counted as stored versions', () => {
    const own = new Set(['context_bridge_log']);
    const vs = [ver('t1', { fileName: 'token-watch/a' }), ver('t2', { fileName: 'token-watch/a', action: 'hide' })];
    expect(Object.fromEntries(otherOwnerCounts(vs, own))).toEqual({ 'token-watch': 1 });
  });
  it('needs_download carries the wrong-size siblings so they reach the residue inventory', () => {
    const [d] = planColdBindings([ROW], [ver('a', { contentSha1: 'aa' }), ver('b', { contentSha1: 'bb' }), ver('w', { contentLength: 5 })]);
    expect(d.kind).toBe('needs_download');
    if (d.kind !== 'needs_download') return;
    expect(d.candidates.map((v) => v.fileId)).toEqual(['a', 'b']);
    expect(d.wrongSize.map((v) => v.fileId)).toEqual(['w']);
  });
  it('a SHA-1 of "none" (large-file) or null is not a fingerprint: only the bytes can decide', () => {
    expect(planColdBindings([ROW], [ver('a', { contentSha1: 'none' })])[0].kind).toBe('needs_download');
    expect(planColdBindings([ROW], [ver('a', { contentSha1: null })])[0].kind).toBe('needs_download');
    expect(planColdBindings([ROW], [ver('a', { contentSha1: 'none' }), ver('b', { contentSha1: 'none' })])[0].kind).toBe('needs_download');
  });
  it('the binder checks the version against the LISTING bucket id, not the info response against itself', () => {
    expect(read('server/scripts/b75-cold-bind.ts')).toContain('bucketId: listing.bucketId');
    expect(read('server/scripts/b75-cold-bind.ts')).not.toContain('bucketId: info.bucketId');
  });
});
