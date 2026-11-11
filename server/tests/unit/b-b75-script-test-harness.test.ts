import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDirectEntry } from '../../scripts/direct-entry.js';
import {
  archiveB75Object,
  dropAndMarkActive,
  missingProvenArchiveLabels,
  removePlainArchiveSource,
  runWithSweepLock,
  type B75ArchiveObjectDependencies,
  type B75ArchiveTableSpec,
  type B75SweepConfig,
} from '../../scripts/b75-retention-sweep.js';
import {
  exportAndUploadContextMonth,
  runContextBridgeCycle,
  type ContextBridgeConfig,
  type ContextMonthDependencies,
  type ContextMonthRange,
} from '../../scripts/context-bridge-log-ttl.js';
import {
  listColdRotationCandidates,
  rotateColdCandidate,
  runColdRotationCandidates,
  type ColdRotationCandidate,
  type ColdRotatorConfig,
} from '../../scripts/b75-cold-rotator.js';
import {
  rehydrateChosenObject,
  type RehydrateArgs,
  type RehydrateManifestRow,
} from '../../scripts/b75-rehydrate.js';
import { NonProvenExistingCopyError } from '../../services/data-archive/archive-completeness.js';

const privateDirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of privateDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const month: ContextMonthRange = {
  label: '2026-01',
  start: new Date('2026-01-01T00:00:00Z'),
  end: new Date('2026-02-01T00:00:00Z'),
};

const contextCfg: ContextBridgeConfig = {
  retentionDays: 30,
  batchSize: 100,
  pauseMs: 0,
  warmBucket: 'warm',
  warmPrefix: 'archive',
  coldBucket: 'cold',
};

const sweepCfg: B75SweepConfig = {
  warmBucket: 'warm',
  warmPrefix: 'archive',
  retentionByTable: new Map(),
  sliceThresholdHotBytes: 1000,
};

const sweepSpec: B75ArchiveTableSpec = {
  parent: 'closed_trades',
  timestampColumn: 'closed_at',
  retentionConstantName: 'closed_trades.hot_retention_days',
};

function archiveDeps(over: Partial<B75ArchiveObjectDependencies> = {}): B75ArchiveObjectDependencies {
  return {
    exportPartition: vi.fn(),
    evidenceExistsForManifest: vi.fn().mockResolvedValue(false),
    proofCountStillMatches: vi.fn().mockResolvedValue(true),
    recordExactArchiveEvidence: vi.fn().mockResolvedValue(undefined),
    countGzipJsonlLines: vi.fn().mockResolvedValue(1),
    assertExactArchiveEquality: vi.fn(),
    statSize: vi.fn().mockReturnValue(10),
    unlinkFile: vi.fn(),
    ...over,
  };
}

function contextDeps(over: Partial<ContextMonthDependencies> = {}): ContextMonthDependencies {
  return {
    exportPartition: vi.fn(),
    getStorageClient: vi.fn(),
    readFile: vi.fn().mockReturnValue(Buffer.from('archive')),
    unlinkFile: vi.fn(),
    countGzipJsonlLines: vi.fn().mockResolvedValue(1),
    evidenceExistsForManifest: vi.fn().mockResolvedValue(false),
    proofCountStillMatches: vi.fn().mockResolvedValue(true),
    recordExactArchiveEvidence: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('direct entry boundary', () => {
  it('matches the real command path and rejects a different or absent path', () => {
    const entry = path.resolve('server/scripts/b75-retention-sweep.ts');
    const moduleUrl = pathToFileURL(entry).href;
    expect(isDirectEntry(moduleUrl, entry)).toBe(true);
    expect(isDirectEntry(moduleUrl, path.resolve('server/scripts/b75-rehydrate.ts'))).toBe(false);
    expect(isDirectEntry(moduleUrl, undefined)).toBe(false);
  });

  it('all four command modules imported without constructing a production client', () => {
    // The imports at the top of this test are the positive probe. Before the
    // guard they entered main(), validated live credentials, and exited.
    expect(archiveB75Object).toBeTypeOf('function');
    expect(exportAndUploadContextMonth).toBeTypeOf('function');
    expect(rotateColdCandidate).toBeTypeOf('function');
    expect(rehydrateChosenObject).toBeTypeOf('function');
  });
});

describe('retention executable gates', () => {
  it('recounts a reused proof and refuses a changed source before export or storage', async () => {
    const ctl = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          id: 'manifest-1', state: 'verified', storage_uri: 'supabase://warm/x',
          checksum: 'ck', hot_partition_dropped_at: null, completeness_basis: 'source-count-matched',
        }],
      }),
    };
    const deps = archiveDeps({ proofCountStillMatches: vi.fn().mockResolvedValue(false) });
    const storage = { uploadWarmFile: vi.fn(), downloadWarmFile: vi.fn() };
    await expect(archiveB75Object(
      storage as never, {} as never, ctl as never, sweepCfg, sweepSpec,
      '2026-01-01', month.start, month.end, 'closed_trades', 10, undefined, deps,
    )).rejects.toBeInstanceOf(NonProvenExistingCopyError);
    expect(deps.proofCountStillMatches).toHaveBeenCalledOnce();
    expect(deps.exportPartition).not.toHaveBeenCalled();
    expect(storage.uploadWarmFile).not.toHaveBeenCalled();
  });

  it('writes evidence, basis, and verified on one control transaction', async () => {
    const events: string[] = [];
    const ctl = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('SELECT id, state')) return { rows: [] };
        if (sql.includes('INSERT INTO data_archive_manifest')) return { rows: [{ id: 'manifest-2' }] };
        if (sql === 'BEGIN') events.push('begin');
        else if (sql.includes('SET completeness_basis')) events.push('basis');
        else if (sql.includes("SET state = 'verified'")) events.push('verified');
        else if (sql === 'COMMIT') events.push('commit');
        return { rows: [], rowCount: 1 };
      }),
    };
    const deps = archiveDeps({
      exportPartition: vi.fn().mockResolvedValue({
        localPath: 'fake.gz', checksum: 'ck', sourceRowCount: 1, rowCount: 1,
        bytesCompressed: 10, minTs: month.start, maxTs: new Date('2026-01-01T00:00:01Z'),
      }),
      recordExactArchiveEvidence: vi.fn(async () => { events.push('evidence'); }),
    });
    const storage = {
      uploadWarmFile: vi.fn().mockResolvedValue({ checksum: 'ck' }),
      downloadWarmFile: vi.fn().mockResolvedValue({ checksum: 'ck', bytes: 10 }),
    };
    await expect(archiveB75Object(
      storage as never, {} as never, ctl as never, sweepCfg, sweepSpec,
      '2026-01-01', month.start, month.end, 'closed_trades', 10, undefined, deps,
    )).resolves.toMatchObject({ kind: 'exported', rowCount: 1 });
    expect(events).toEqual(['begin', 'evidence', 'basis', 'verified', 'commit']);
  });

  it('keeps DROP and active marking on one transaction and rolls back a mark failure', async () => {
    const ok: string[] = [];
    const client = { query: vi.fn(async (sql: string) => { ok.push(sql); return { rows: [] }; }) };
    await dropAndMarkActive(client as never, 'archive_2026_01', async () => { ok.push('mark'); });
    expect(ok).toEqual(['BEGIN', 'DROP TABLE IF EXISTS "archive_2026_01"', 'mark', 'COMMIT']);

    const failed: string[] = [];
    const failClient = { query: vi.fn(async (sql: string) => { failed.push(sql); return { rows: [] }; }) };
    await expect(dropAndMarkActive(failClient as never, 'archive_2026_01', async () => {
      failed.push('mark');
      throw new Error('mark failed');
    })).rejects.toThrow('mark failed');
    expect(failed.at(-1)).toBe('ROLLBACK');
  });

  it('requires every present label to be verified/active and proven', () => {
    const labels = ['2026-01-01', '2026-01-02', '2026-01-03'];
    const rows = [
      { partition_label: labels[0], state: 'verified', completeness_basis: 'source-count-matched' },
      { partition_label: labels[1], state: 'active', completeness_basis: 'unverified-legacy' },
    ];
    expect(missingProvenArchiveLabels(labels, rows)).toEqual([labels[1], labels[2]]);
    rows[1].completeness_basis = 'source-count-matched';
    rows.push({ partition_label: labels[2], state: 'active', completeness_basis: 'source-count-matched' });
    expect(missingProvenArchiveLabels(labels, rows)).toEqual([]);
  });

  it('finishes every plain delete batch before active marking and vacuum', async () => {
    const events: string[] = [];
    const counts = [5000, 2];
    await expect(removePlainArchiveSource(5000, {
      deleteBatch: async () => { events.push('delete'); return counts.shift()!; },
      markActive: async () => { events.push('active'); },
      vacuum: async () => { events.push('vacuum'); },
    })).resolves.toBe(5002);
    expect(events).toEqual(['delete', 'delete', 'active', 'vacuum']);
  });

  it('releases the overlap lock before returning failure or rethrowing fatal', async () => {
    const events: string[] = [];
    await expect(runWithSweepLock({
      acquire: () => { events.push('acquire'); return true; },
      run: async () => { events.push('run'); return true; },
      release: () => { events.push('release'); },
    })).resolves.toEqual({ acquired: true, hadFailures: true });
    expect(events).toEqual(['acquire', 'run', 'release']);

    events.length = 0;
    await expect(runWithSweepLock({
      acquire: () => true,
      run: async () => { events.push('run'); throw new Error('fatal'); },
      release: () => { events.push('release'); },
    })).rejects.toThrow('fatal');
    expect(events).toEqual(['run', 'release']);
  });
});

describe('context lane deletion fence', () => {
  it('recounts verified reuse and refuses a mismatch before the month completes', async () => {
    const ctl = { query: vi.fn().mockResolvedValue({ rows: [{
      id: 'ctx-1', state: 'verified', tier: 'warm', completeness_basis: 'source-count-matched',
    }] }) };
    const deps = contextDeps({ proofCountStillMatches: vi.fn().mockResolvedValue(false) });
    await expect(exportAndUploadContextMonth(
      {} as never, ctl as never, contextCfg, month, deps,
    )).rejects.toBeInstanceOf(NonProvenExistingCopyError);
    expect(deps.proofCountStillMatches).toHaveBeenCalledWith(ctl, 'ctx-1', expect.objectContaining({
      target: '"context_bridge_log"', tsCol: '"timestamp"', rangeStart: month.start, rangeEnd: month.end,
    }));
    expect(deps.exportPartition).not.toHaveBeenCalled();
  });

  it('allows unchanged reuse but an archive failure cannot reach delete, active, or vacuum', async () => {
    const ctl = { query: vi.fn().mockResolvedValue({ rows: [{
      id: 'ctx-1', state: 'verified', tier: 'warm', completeness_basis: 'source-count-matched',
    }] }) };
    const deps = contextDeps({ proofCountStillMatches: vi.fn().mockResolvedValue(true) });
    await expect(exportAndUploadContextMonth(
      {} as never, ctl as never, contextCfg, month, deps,
    )).resolves.toEqual({ rowCount: 0, bytesCompressed: 0 });

    const later = { deleteRows: vi.fn(), markActive: vi.fn(), vacuum: vi.fn() };
    await expect(runContextBridgeCycle([month], month.end, {
      archiveMonth: vi.fn().mockRejectedValue(new Error('recount mismatch')),
      ...later,
    })).rejects.toThrow('recount mismatch');
    expect(later.deleteRows).not.toHaveBeenCalled();
    expect(later.markActive).not.toHaveBeenCalled();
    expect(later.vacuum).not.toHaveBeenCalled();
  });

  it('records a 413 fallback proof at the actual cold tier in one transaction', async () => {
    const events: string[] = [];
    const ctl = { query: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id, state')) return { rows: [] };
      if (sql.includes('INSERT INTO data_archive_manifest')) return { rows: [{ id: 'ctx-2' }] };
      if (sql === 'BEGIN') events.push('begin');
      else if (sql.includes("SET state = 'verified'")) events.push('verified');
      else if (sql === 'COMMIT') events.push('commit');
      return { rows: [], rowCount: 1 };
    }) };
    const storage = {
      uploadWarm: vi.fn().mockRejectedValue(new Error('413 Payload Too Large')),
      downloadWarm: vi.fn(),
      isColdConfigured: vi.fn().mockReturnValue(true),
      uploadCold: vi.fn().mockResolvedValue({ checksum: 'ck' }),
      downloadCold: vi.fn().mockResolvedValue({ checksum: 'ck', data: Buffer.from('x'), bytes: 1 }),
    };
    const deps = contextDeps({
      exportPartition: vi.fn().mockResolvedValue({
        localPath: 'fake.gz', checksum: 'ck', sourceRowCount: 1, rowCount: 1,
        bytesCompressed: 10, minTs: month.start, maxTs: new Date('2026-01-01T00:00:01Z'),
      }),
      getStorageClient: vi.fn().mockReturnValue(storage),
      recordExactArchiveEvidence: vi.fn(async (_client, evidence) => {
        events.push(`evidence:${evidence.tier}`);
      }),
    });
    await exportAndUploadContextMonth({} as never, ctl as never, contextCfg, month, deps);
    expect(events).toEqual(['begin', 'evidence:cold', 'verified', 'commit']);
    expect(storage.downloadCold).toHaveBeenCalledOnce();
  });

  it('runs delete, active marking, and vacuum only after every month completes', async () => {
    const events: string[] = [];
    const second = { ...month, label: '2026-02', start: month.end, end: new Date('2026-03-01T00:00:00Z') };
    const result = await runContextBridgeCycle([month, second], second.end, {
      archiveMonth: async (item) => { events.push(`archive:${item.label}`); return { rowCount: 2, bytesCompressed: 3 }; },
      deleteRows: async () => { events.push('delete'); return { deleted: 4 }; },
      markActive: async (labels) => { events.push(`active:${labels.join(',')}`); },
      vacuum: async () => { events.push('vacuum'); },
    });
    expect(events).toEqual(['archive:2026-01', 'archive:2026-02', 'delete', 'active:2026-01,2026-02', 'vacuum']);
    expect(result).toEqual({ archivedRows: 4, archivedBytes: 6, deleted: 4, completedLabels: ['2026-01', '2026-02'] });
  });
});

describe('cold rotation state machine', () => {
  const cfg: ColdRotatorConfig = {
    warmRetentionDays: 365,
    perTableWarmRetentionDays: new Map([['fast_table', 30]]),
    coldRotatorDryRun: false,
    warmBucket: 'warm', warmPrefix: 'archive', coldBucket: 'cold', coldPrefix: '', coldProvider: 'b2',
  };
  const candidate: ColdRotationCandidate = {
    id: 'warm-1', source_table: 'fast_table', partition_label: '2025-01',
    storage_uri: 'supabase://warm/archive/fast_table/2025-01.jsonl.gz',
    row_count: 2, bytes_compressed: 8, checksum: 'ck', created_at: new Date('2025-01-01T00:00:00Z'),
  };

  it('filters by the table window and keeps the NOT-EXISTS cold-row query gate', async () => {
    let sql = '';
    const client = { query: vi.fn(async (text: string) => { sql = text; return { rows: [
      candidate,
      { ...candidate, id: 'slow', source_table: 'slow_table', created_at: new Date('2026-10-01T00:00:00Z') },
    ] }; }) };
    const rows = await listColdRotationCandidates(client as never, cfg, new Date('2026-11-10T00:00:00Z').getTime());
    expect(rows.map((row) => row.id)).toEqual(['warm-1']);
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain("m2.tier = 'cold'");
  });

  it('deletes warm strictly after cold readback and both manifest writes', async () => {
    const events: string[] = [];
    const storage = {
      downloadWarm: vi.fn(async () => { events.push('warm-read'); return { checksum: 'ck', data: Buffer.from('x'), bytes: 1 }; }),
      uploadCold: vi.fn(async () => { events.push('cold-upload'); return { checksum: 'ck' }; }),
      downloadCold: vi.fn(async () => { events.push('cold-read'); return { checksum: 'ck', data: Buffer.from('x'), bytes: 1 }; }),
      deleteWarm: vi.fn(async () => { events.push('warm-delete'); }),
    };
    const client = {
      connect: vi.fn(), end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(async (sql: string) => { events.push(sql.startsWith('INSERT') ? 'cold-manifest' : 'warm-migrated'); return { rows: [] }; }),
    };
    await expect(rotateColdCandidate(candidate, cfg, { storage: storage as never, createClient: () => client as never }))
      .resolves.toBe(8);
    expect(events).toEqual(['warm-read', 'cold-upload', 'cold-read', 'cold-manifest', 'warm-migrated', 'warm-delete']);
  });

  it('keeps warm on checksum failure and continues to the next candidate', async () => {
    const deleted: string[] = [];
    const storage = {
      downloadWarm: vi.fn(async (_bucket: string, objectPath: string) => ({
        checksum: objectPath.includes('bad') ? 'wrong' : 'ck', data: Buffer.from('x'), bytes: 1,
      })),
      uploadCold: vi.fn().mockResolvedValue({ checksum: 'ck' }),
      downloadCold: vi.fn().mockResolvedValue({ checksum: 'ck', data: Buffer.from('x'), bytes: 1 }),
      deleteWarm: vi.fn(async (_bucket: string, objectPath: string) => { deleted.push(objectPath); }),
    };
    const client = { connect: vi.fn(), end: vi.fn().mockResolvedValue(undefined), query: vi.fn().mockResolvedValue({ rows: [] }) };
    const bad = { ...candidate, id: 'bad', storage_uri: 'supabase://warm/bad' };
    const good = { ...candidate, id: 'good', partition_label: '2025-02', storage_uri: 'supabase://warm/good' };
    const result = await runColdRotationCandidates([bad, good], cfg, {
      storage: storage as never, createClient: () => client as never,
    });
    expect(result).toEqual({ rotated: 1, failed: 1, bytesMoved: 8 });
    expect(deleted).toEqual(['good']);
  });
});

describe('rehydrate file safety and accounting', () => {
  function makeDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b75-harness-'));
    fs.chmodSync(dir, 0o700);
    privateDirs.push(dir);
    return dir;
  }
  function args(out: string): RehydrateArgs {
    return { table: 'closed_trades', from: month.start, to: month.end, out, restoreCold: false, diskFile: false };
  }
  function row(over: Partial<RehydrateManifestRow> = {}): RehydrateManifestRow {
    return {
      id: 'm1', partition_label: '2026-01', tier: 'warm', state: 'active',
      storage_uri: 'supabase://warm/closed_trades/2026-01.jsonl.gz', row_count: 7,
      bytes_compressed: 10, min_ts: month.start, max_ts: month.end, checksum: 'ck',
      completeness_basis: 'source-count-matched', format: 'jsonl.gz', original_partition_size_bytes: null,
      ...over,
    };
  }

  it('writes one good file and sidecar and returns proven rows', async () => {
    const out = makeDir();
    const manifest = row();
    const storage = {
      downloadWarmFile: vi.fn(async (_bucket: string, _object: string, local: string) => {
        fs.writeFileSync(local, 'archive');
        return { checksum: 'ck', bytes: 7 };
      }),
      isColdConfigured: vi.fn(), downloadCold: vi.fn(),
    };
    const result = await rehydrateChosenObject(args(out), {
      label: manifest.partition_label, download: manifest, all: [manifest],
    }, storage as never);
    const good = path.join(out, 'closed_trades_2026-01.jsonl.gz');
    expect(result).toEqual({ kind: 'downloaded', bytes: 7, rowCount: 7, proven: true, description: undefined });
    expect(fs.existsSync(good)).toBe(true);
    expect(JSON.parse(fs.readFileSync(`${good}.completeness.json`, 'utf8'))).toMatchObject({ proven: true, checksum_ok: true });
  });

  it('renames a mismatch out of the good glob, removes stale good sidecar, and never reports it proven', async () => {
    const out = makeDir();
    const manifest = row();
    const good = path.join(out, 'closed_trades_2026-01.jsonl.gz');
    fs.writeFileSync(`${good}.completeness.json`, '{"checksum_ok":true}');
    const storage = {
      downloadWarmFile: vi.fn(async (_bucket: string, _object: string, local: string) => {
        fs.writeFileSync(local, 'corrupt');
        return { checksum: 'wrong', bytes: 7 };
      }),
      isColdConfigured: vi.fn(), downloadCold: vi.fn(),
    };
    const result = await rehydrateChosenObject(args(out), {
      label: manifest.partition_label, download: manifest, all: [manifest],
    }, storage as never);
    expect(result).toMatchObject({ kind: 'mismatch', rowCount: 7, proven: true });
    expect(fs.existsSync(good)).toBe(false);
    expect(fs.existsSync(`${good}.completeness.json`)).toBe(false);
    expect(fs.existsSync(`${good}.CORRUPT`)).toBe(true);
    expect(JSON.parse(fs.readFileSync(`${good}.CORRUPT.completeness.json`, 'utf8')))
      .toMatchObject({ proven: true, checksum_ok: false });
  });

  it('returns skipped-cold without touching storage when restore-cold is absent', async () => {
    const out = makeDir();
    const manifest = row({ tier: 'cold', storage_uri: 'b2://cold/x' });
    const storage = { downloadWarmFile: vi.fn(), isColdConfigured: vi.fn(), downloadCold: vi.fn() };
    await expect(rehydrateChosenObject(args(out), {
      label: manifest.partition_label, download: manifest, all: [manifest],
    }, storage as never)).resolves.toMatchObject({ kind: 'skipped-cold' });
    expect(storage.downloadCold).not.toHaveBeenCalled();
  });
});
