import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  auditConfigFromMap,
  classifyDownloadFailure,
  coverageAgeDays,
  historyPages,
  meterPages,
  meterTotals,
  nextFits,
  ownerOf,
  readBackWorstCaseMs,
  reconcileArchive,
  selectDue,
  CAUSE_DETAIL_MAX_BYTES,
  type ColdManifestRow,
  type MeterHistoryRow,
} from '../../scripts/b75-cold-audit';
import { B2CallError } from '../../services/data-archive/b2-retry';
import type { B2ListedVersion } from '../../services/data-archive/storage-client';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const DAY = 86_400_000;
const NOW = Date.parse('2026-11-15T04:10:00Z');

const ver = (fileId: string, fileName: string, over: Partial<B2ListedVersion> = {}): B2ListedVersion => ({
  fileId, fileName, action: 'upload', contentLength: 100, contentSha1: 'aa', uploadTimestamp: NOW - 10 * DAY, ...over,
});
const row = (id: string, uri: string, over: Partial<ColdManifestRow> = {}): ColdManifestRow => ({
  id, storage_uri: uri, provider_file_id: `f-${id}`, provider_bytes: 100, bytes_compressed: 100, checksum: `sha-${id}`,
  verified_at: new Date(NOW - 50 * DAY), state: 'active', ...over,
});
const coldPath = (uri: string) => /^b2:\/\/[^/]+\/(.+)$/.exec(uri)?.[1] ?? null;
const ARCH = new Set(['context_bridge_log', 'exit_decision_archive']);

const SEED = new Map<string, unknown>([
  ['cold_bucket', 'dt-archive-cold'],
  ['disk_file_free_floor_bytes', 5_000_000_000],
  ['cold_upload_setup_ms', 60000],
  ['cold_body_min_bytes_per_s', 1048576],
  ['cold_meter_warn_bytes', 100_000_000_000],
  ['cold_meter_tokenwatch_growth_warn_bytes_per_day', 350_000_000],
  ['cold_meter_liveness_growth_warn_bytes', 10_000_000],
  ['cold_readback_daily_bytes', 500_000_000],
  ['cold_readback_min_interval_days', 30],
  ['cold_readback_stall_days', 3],
  ['cold_readback_max_age_days', 90],
  ['cold_readback_max_objects_per_run', 10],
  ['cold_audit_run_deadline_ms', 2_400_000],
]);

describe('B-DISK-FILE-TIERING 3c — config', () => {
  it('the seeded values load, and their worst case is the plan r3 arithmetic (ceil(476,837.2) + 600,000 ms)', () => {
    const cfg = auditConfigFromMap(SEED);
    expect(readBackWorstCaseMs(cfg)).toBe(1_076_838);
    expect(cfg.runDeadlineMs - 5 * cfg.limits.setupMs).toBe(2_100_000);
  });
  it('a missing, non-numeric or <= 0 key refuses — no default', () => {
    for (const k of ['cold_readback_daily_bytes', 'cold_audit_run_deadline_ms', 'cold_readback_stall_days']) {
      const m = new Map(SEED); m.delete(k);
      expect(() => auditConfigFromMap(m)).toThrow(/REFUSED/);
      const z = new Map(SEED); z.set(k, 0);
      expect(() => auditConfigFromMap(z)).toThrow(/REFUSED/);
    }
  });
  it('a config whose read-back worst case does not fit the deadline less the listing allowance refuses', () => {
    const m = new Map(SEED); m.set('cold_readback_max_objects_per_run', 30); // 476,837 + 1,800,000 > 2,100,000
    expect(() => auditConfigFromMap(m)).toThrow(/does not fit the run deadline/);
    const ok = new Map(SEED); ok.set('cold_readback_max_objects_per_run', 27); // 476,838 + 1,620,000 = 2,096,838
    expect(() => auditConfigFromMap(ok)).not.toThrow();
  });
});

describe('B-DISK-FILE-TIERING 3c — the meter', () => {
  it('owner classes: archive tables, _proof, _liveness, token-watch, and anything else is unknown', () => {
    expect(ownerOf('context_bridge_log/2026-01.jsonl.gz', ARCH)).toBe('archive');
    expect(ownerOf('_proof/x.gz', ARCH)).toBe('proof');
    expect(ownerOf('_liveness/canary', ARCH)).toBe('liveness');
    expect(ownerOf('token-watch/a', ARCH)).toBe('token-watch');
    expect(ownerOf('tokenwatch/a', ARCH)).toBe('unknown');
  });
  it('totals count uploads only (a hide marker is not stored bytes) and collect the _proof ids', () => {
    const t = meterTotals([
      ver('a', 'context_bridge_log/x', { contentLength: 1000 }),
      ver('h', '_liveness/c', { action: 'hide', contentLength: 0 }),
      ver('p2', '_proof/b', { contentLength: 7 }), ver('p1', '_proof/a', { contentLength: 3 }),
      ver('t', 'token-watch/x', { contentLength: 50 }), ver('u', 'mystery/x', { contentLength: 9 }),
    ], ARCH);
    expect(t.versions).toBe(5);
    expect(t.bytes).toBe(1069);
    expect(t.byOwner).toEqual({ archive: 1000, proof: 10, liveness: 0, 'token-watch': 50, unknown: 9 });
    expect(t.proofIds).toEqual(['p1', 'p2']);
    expect(t.unknownNames).toEqual(['mystery/x']);
  });
  it('the set reconcile: untracked, missing, size mismatch, in flight — and an unbound row claims its own name', () => {
    const rows = [
      row('a', 'b2://dt-archive-cold/context_bridge_log/2026-01.jsonl.gz'),
      row('b', 'b2://dt-archive-cold/context_bridge_log/2026-02.jsonl.gz', { provider_bytes: 999 }),
      row('c', 'b2://dt-archive-cold/exit_decision_archive/2026-05.jsonl.gz'),
      row('d', 'b2://dt-archive-cold/context_bridge_log/2025-12.jsonl.gz', { provider_file_id: null, provider_bytes: null }),
    ];
    const versions = [
      ver('f-a', 'context_bridge_log/2026-01.jsonl.gz'),
      ver('dup', 'context_bridge_log/2026-01.jsonl.gz'), // residue: same name, not the bound id
      ver('f-b', 'context_bridge_log/2026-02.jsonl.gz'), // provider_bytes 999 ≠ 100
      ver('old-d', 'context_bridge_log/2025-12.jsonl.gz'), // the unbound row's own name
      ver('new', 'exit_decision_archive/2026-06.jsonl.gz', { uploadTimestamp: NOW + 1000 }), // mid-run upload
      ver('tw', 'token-watch/x'), // not the archive class
    ];
    const rc = reconcileArchive(rows, versions, ARCH, NOW, coldPath);
    expect(rc.untracked.map((v) => v.fileId)).toEqual(['dup']);
    expect(rc.missing.map((r) => r.id)).toEqual(['c']);
    expect(rc.sizeMismatch.map((m) => m.row.id)).toEqual(['b']);
    expect(rc.inFlight.map((v) => v.fileId)).toEqual(['new']);
  });
  it('a delta that cancels is still caught: an unrecorded upload and an unrecorded loss of the same size', () => {
    const rows = [row('a', 'b2://dt-archive-cold/context_bridge_log/2026-01.jsonl.gz')];
    const rc = reconcileArchive(rows, [ver('x', 'context_bridge_log/2026-03.jsonl.gz')], ARCH, NOW, coldPath);
    expect(rc.untracked.map((v) => v.fileId)).toEqual(['x']);
    expect(rc.missing.map((r) => r.id)).toEqual(['a']);
  });
  const cfgM = { warnBytes: 1_000, tokenWatchGrowthPerDay: 350, livenessGrowth: 10 };
  const totals = (o: Partial<Record<'archive' | 'proof' | 'liveness' | 'token-watch' | 'unknown', number>>, proofIds: string[] = []) => {
    const byOwner = { archive: 0, proof: 0, liveness: 0, 'token-watch': 0, unknown: 0, ...o };
    return { versions: 1, bytes: Object.values(byOwner).reduce((a, b) => a + b, 0), byOwner, proofIds, unknownNames: o.unknown ? ['m/x'] : [] };
  };
  const prev = (o: Partial<Record<string, number>>, proof_ids: string[] = []): MeterHistoryRow => ({
    run_at: new Date(NOW - DAY), bytes_by_owner: o, proof_ids, due: 0, readback_ok: 0, budget_cause: null, skipped_unbound: 0,
  });
  it('first run is a baseline: no growth judgement', () => {
    expect(meterPages(totals({ 'token-watch': 900 }), null, NOW, cfgM).map((p) => p.key)).toEqual([]);
  });
  it('growth pages on token-watch per day and on _liveness, not on the archive class', () => {
    const keys = meterPages(totals({ 'token-watch': 400, liveness: 20, archive: 500 }), prev({ 'token-watch': 0, liveness: 0, archive: 0 }), NOW, cfgM).map((p) => p.key);
    expect(keys).toEqual(['cold-meter-tokenwatch-growth', 'cold-meter-liveness-growth']);
    expect(meterPages(totals({ 'token-watch': 300 }), prev({ 'token-watch': 0 }), NOW, cfgM)).toEqual([]);
  });
  it('a _proof id present in two consecutive runs pages; a fresh one does not', () => {
    expect(meterPages(totals({}, ['p1']), prev({}, ['p0']), NOW, cfgM)).toEqual([]);
    expect(meterPages(totals({}, ['p1', 'p2']), prev({}, ['p1']), NOW, cfgM).map((p) => p.key)).toEqual(['cold-meter-proof-survivor']);
  });
  it('the total and an unknown prefix page on any run, first included', () => {
    expect(meterPages(totals({ archive: 1_000 }), null, NOW, cfgM).map((p) => p.key)).toEqual(['cold-meter-total']);
    expect(meterPages(totals({ unknown: 1 }), null, NOW, cfgM).map((p) => p.key)).toEqual(['cold-meter-unknown']);
  });
});

describe('B-DISK-FILE-TIERING 3c — the read-back', () => {
  it('due: bound rows only, never-read first, then oldest last ok, then verified_at; the interval excludes recent reads', () => {
    const rows = [
      row('recent', 'b2://b/x/1'), row('old', 'b2://b/x/2'), row('never-late', 'b2://b/x/3', { verified_at: new Date(NOW - 5 * DAY) }),
      row('never-early', 'b2://b/x/4', { verified_at: new Date(NOW - 200 * DAY) }), row('unbound', 'b2://b/x/5', { provider_file_id: null }),
    ];
    const lastOk = new Map([['recent', new Date(NOW - 2 * DAY)], ['old', new Date(NOW - 40 * DAY)]]);
    expect(selectDue(rows, lastOk, NOW, 30).map((r) => r.id)).toEqual(['never-early', 'never-late', 'old']);
  });
  const cfgR = { dailyBytes: 1000, maxObjects: 2, runDeadlineMs: 70_000, limits: { setupMs: 60_000, minBytesPerSec: 1 } };
  it('the next object fits only inside the own budget, the object count and the deadline', () => {
    expect(nextFits(5, { bytesRead: 0, objects: 0, elapsedMs: 0 }, cfgR)).toBe('go');
    expect(nextFits(600, { bytesRead: 500, objects: 1, elapsedMs: 0 }, cfgR)).toBe('own'); // crosses the byte budget
    expect(nextFits(5, { bytesRead: 0, objects: 2, elapsedMs: 0 }, cfgR)).toBe('own'); // object cap
    expect(nextFits(5, { bytesRead: 0, objects: 0, elapsedMs: 6_000 }, cfgR)).toBe('time'); // 6,000 + 65,000 > 70,000
  });
  it('a cap refusal and a non-JSON 429 end the leg with their cause; a JSON 429 and a 500 do not', () => {
    expect(classifyDownloadFailure(new B2CallError('download_file_by_id', 403, 'download_cap_exceeded', '{"code":"download_cap_exceeded"}')))
      .toMatchObject({ kind: 'budget', cause: 'download_cap_exceeded', detail: null });
    expect(classifyDownloadFailure(new B2CallError('download_file_by_id', 403, 'transaction_cap_exceeded', '{}')))
      .toMatchObject({ kind: 'budget', cause: 'transaction_cap_exceeded' });
    const html = '<html>' + 'x'.repeat(5000) + '</html>';
    const t = classifyDownloadFailure(new B2CallError('download_file_by_id', 429, null, html, 7000));
    expect(t).toMatchObject({ kind: 'budget', cause: 'throttled_429_unidentified', retryAfterMs: 7000 });
    expect(Buffer.byteLength((t as { detail: string }).detail, 'utf8')).toBe(CAUSE_DETAIL_MAX_BYTES);
    expect(classifyDownloadFailure(new B2CallError('download_file_by_id', 429, null, ''))).toMatchObject({ kind: 'budget', detail: null });
    expect(classifyDownloadFailure(new B2CallError('download_file_by_id', 429, 'too_many_requests', '{}')).kind).toBe('error');
    expect(classifyDownloadFailure(new B2CallError('download_file_by_id', 500, null, 'boom')).kind).toBe('error');
    expect(classifyDownloadFailure(new Error('socket hang up')).kind).toBe('error');
  });
  it('the coverage clock of a legacy row starts at the first 3c run, not at its old verified_at (C-5)', () => {
    const legacy = row('l', 'b2://b/x', { verified_at: new Date(NOW - 192 * DAY) });
    const firstRun = new Date(NOW - 1 * DAY);
    expect(coverageAgeDays(legacy, undefined, firstRun, NOW)).toBeCloseTo(1, 5);
    expect(coverageAgeDays(legacy, new Date(NOW - 0.5 * DAY), firstRun, NOW)).toBeCloseTo(0.5, 5);
    const fresh = row('n', 'b2://b/y', { verified_at: new Date(NOW - 0.25 * DAY) });
    expect(coverageAgeDays(fresh, undefined, new Date(NOW - 100 * DAY), NOW)).toBeCloseTo(0.25, 5);
  });
  const h = (o: Partial<MeterHistoryRow>): MeterHistoryRow => ({ run_at: new Date(NOW), bytes_by_owner: {}, proof_ids: [], due: 1, readback_ok: 0, budget_cause: null, skipped_unbound: 0, ...o });
  it('stall pages after k runs due-but-zero-ok; one ok row in any of them clears it', () => {
    expect(historyPages([h({}), h({}), h({})], 3).map((p) => p.key)).toEqual(['cold-readback-stall']);
    expect(historyPages([h({}), h({ readback_ok: 1 }), h({})], 3)).toEqual([]);
    expect(historyPages([h({}), h({})], 3)).toEqual([]); // fewer runs than k: no judgement
  });
  it('an unidentified-429 throttle pages after k runs REGARDLESS of ok rows (C-4)', () => {
    const t = { budget_cause: 'throttled_429_unidentified', readback_ok: 3 };
    expect(historyPages([h(t), h(t), h(t)], 3).map((p) => p.key)).toEqual(['cold-readback-throttled']);
    expect(historyPages([h(t), h({ ...t, budget_cause: 'download_cap_exceeded' }), h(t)], 3)).toEqual([]);
  });
  it('an unbound row pages after k runs (plan r3 edit 5)', () => {
    const u = { skipped_unbound: 2, readback_ok: 1 };
    expect(historyPages([h(u), h(u), h(u)], 3).map((p) => p.key)).toEqual(['cold-readback-unbound']);
  });
});

describe('B-DISK-FILE-TIERING 3c — fences on the wiring', () => {
  const src = read('server/scripts/b75-cold-audit.ts');
  it('the manifest is read FIRST with no state filter, and the listing comes after it', () => {
    const m = src.indexOf("FROM data_archive_manifest WHERE tier = 'cold'`");
    expect(m).toBeGreaterThan(0);
    expect(src.slice(m - 200, m + 60)).not.toMatch(/state\s*=/);
    expect(src.indexOf('storage.listColdFileVersions(')).toBeGreaterThan(m);
  });
  it('a listing failure precedes any meter row (the INSERT comes after the listing)', () => {
    expect(src.indexOf('INSERT INTO data_archive_cold_meter')).toBeGreaterThan(src.indexOf('storage.listColdFileVersions('));
  });
  it('the DONE line is written in the finally, with N undefined at zero bytes read', () => {
    const fin = src.lastIndexOf('} finally {');
    expect(src.indexOf('DONE ${fields}')).toBeGreaterThan(fin);
    expect(src).toContain(": 'undefined';");
  });
  it('the downloaded file is removed on every path', () => {
    expect(src).toMatch(/\} finally \{\s*fs\.rmSync\(local, \{ force: true \}\);/);
  });
  it('archival-health grades it: schedule equals the header cron line, and both failure counters are captured', () => {
    const ah = read('server/scripts/b-storage-archival-health.ts');
    const cron = /Cron line \(root crontab\):\s+(\S+ \S+ \S+ \S+ \S+) su - deploy/.exec(src)?.[1];
    expect(cron).toBe('10 4 * * *');
    expect(ah).toContain("name: 'b75-cold-audit'");
    expect(ah).toContain(`schedule: '${cron}'`);
    const spec = ah.slice(ah.indexOf("name: 'b75-cold-audit'"));
    const donePattern = /donePattern: (\/.*\/),/.exec(spec)?.[1] as string;
    const re = new RegExp(donePattern.slice(1, -1));
    const m = re.exec('[B75 cold-audit] DONE versions=1 readback_ok=0 readback_failed=2 budget_stop=none N=undefined failed=1 elapsed_ms=5');
    expect(m?.slice(1)).toEqual(['2', '1']);
  });
  it('the migration is registered, and its rollback is in git but not in the manifest', () => {
    const manifest = read('drizzle/migrations/MANIFEST.txt');
    expect(manifest).toContain('2026-11-14-b-disk-file-tiering-cold-audit.sql');
    expect(manifest).not.toContain('cold-audit-rollback');
    expect(fs.existsSync(path.join(ROOT, 'drizzle/migrations/2026-11-14-b-disk-file-tiering-cold-audit-rollback.sql'))).toBe(true);
  });
  it('downloadColdFileById logs its bound outcome in a finally, for every bounded caller (plan r3 edit 6)', () => {
    const sc = read('server/services/data-archive/storage-client.ts');
    const fn = sc.slice(sc.indexOf('async downloadColdFileById('), sc.indexOf('async b2GetFileInfo('));
    expect(fn).toMatch(/outcome = 'deadline'/);
    expect(fn).toMatch(/finally \{[\s\S]*phaseLog\('cold_read_by_id'/);
    expect(fn).toMatch(/else if \(outcome !== 'ok'\) console\.warn/);
  });
});
