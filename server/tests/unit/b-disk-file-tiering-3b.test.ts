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
    const start = src.indexOf('async function runColdRotatorBodyLocked()');
    const end = src.indexOf('\nfunction parseSupabaseUri', start);
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, end > 0 ? end : undefined).split(/\r?\n(?=\/\*\*|export |async function |function )/)[0];
    expect(body).toMatch(/return failed > 0 \? 1 : 0;/);
    expect(body).not.toMatch(/process\.exit\(/);
    expect(src).toMatch(/code = await runColdRotatorBodyLocked\(\);[\s\S]*?releaseRotatorLock\(ROTATOR_LOCK_PATH\);[\s\S]*?if \(code !== 0\) process\.exit\(code\);/);
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
