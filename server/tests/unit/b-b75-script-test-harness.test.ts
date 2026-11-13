import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { isDirectEntry } from '../../scripts/direct-entry.js';
import {
  archiveB75Object,
  dropAndMarkActive,
  missingProvenArchiveLabels,
  processPartition,
  processPartitionAndSettle,
  removePlainArchiveSource,
  runRetentionSweepCli,
  runRetentionSweepProcess,
  sweepPlainTables,
  type B75ArchiveObjectDependencies,
  type B75ArchiveTableSpec,
  type B75SweepConfig,
  type PartitionRow,
  type ProcessPartitionDependencies,
  type SweepPlainDependencies,
} from '../../scripts/b75-retention-sweep.js';
import {
  exportAndUploadContextMonth,
  finalizeContextDeletion,
  runContextBridgeCycle,
  runContextBridgeLogTtlCli,
  runContextBridgeLogTtlProcess,
  type ContextBridgeConfig,
  type ContextDeletionGuard,
  type ContextFinalizeDependencies,
  type ContextMonthDependencies,
  type ContextMonthRange,
} from '../../scripts/context-bridge-log-ttl.js';
import {
  applyColdRotationLimit,
  applyColdRotatorCliOverrides,
  listColdRotationCandidates,
  parseIntFlag,
  rotateColdCandidate,
  runColdRotatorCli,
  runColdRotatorProcess,
  runColdRotationCandidates,
  runColdRotationPlan,
  type ColdRotationCandidate,
  type ColdRotatorConfig,
} from '../../scripts/b75-cold-rotator.js';
import {
  ensurePrivateRehydrateOutput,
  finishRehydrateRun,
  rehydrateChosenObject,
  runRehydrateCli,
  runRehydrateProcess,
  summarizeRehydrateResults,
  type RehydrateArgs,
  type RehydrateManifestRow,
} from '../../scripts/b75-rehydrate.js';
import { NonProvenExistingCopyError } from '../../services/data-archive/archive-completeness.js';
import { DISK_FILE_FORMAT } from '../../services/data-archive/disk-file-tiering.js';

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

  it('fresh-imports all four commands after every production side-effect spy is armed', async () => {
    vi.resetModules();
    const clientConstructor = vi.fn(function FakeClient() {
      return { connect: vi.fn(), end: vi.fn(), query: vi.fn() };
    });
    const storageConstructor = vi.fn();
    const addAlert = vi.fn();
    const resolveAlerts = vi.fn();
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const open = vi.spyOn(fs, 'openSync').mockImplementation(() => { throw new Error('real file open'); });
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('real file write'); });
    const read = vi.spyOn(fs, 'readFileSync').mockImplementation(() => { throw new Error('real file read'); });

    vi.doMock('pg', () => ({ default: { Client: clientConstructor } }));
    vi.doMock('../../services/data-archive/storage-client.js', () => ({
      getStorageClient: storageConstructor,
      sha256Hex: vi.fn(),
    }));
    vi.doMock('../../services/system-alerts.js', () => ({
      addAlert,
      resolveAlertsByDedupeKey: resolveAlerts,
    }));

    try {
      const modules = await Promise.all([
        import('../../scripts/b75-retention-sweep.js'),
        import('../../scripts/context-bridge-log-ttl.js'),
        import('../../scripts/b75-cold-rotator.js'),
        import('../../scripts/b75-rehydrate.js'),
      ]);
      expect(modules.map((mod) => typeof mod)).toEqual(['object', 'object', 'object', 'object']);
      expect(clientConstructor).not.toHaveBeenCalled();
      expect(storageConstructor).not.toHaveBeenCalled();
      expect(addAlert).not.toHaveBeenCalled();
      expect(resolveAlerts).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('pg');
      vi.doUnmock('../../services/data-archive/storage-client.js');
      vi.doUnmock('../../services/system-alerts.js');
      vi.resetModules();
    }
  });
});

type CliContract = {
  name: string;
  fatalRaisesAlert: boolean;
  runCli: (deps: { env: NodeJS.ProcessEnv; exit: (code: number) => void; run: () => Promise<void> }) => Promise<void>;
  runProcess: (runCli: () => Promise<void>, exit: (code: number) => void, alert: ReturnType<typeof vi.fn>) => Promise<void>;
};

const cliContracts: CliContract[] = [
  {
    name: 'retention',
    fatalRaisesAlert: true,
    runCli: (deps) => runRetentionSweepCli(deps),
    runProcess: (runCli, exit, alert) => runRetentionSweepProcess({ runCli, exit, raiseAlert: alert }),
  },
  {
    name: 'context',
    fatalRaisesAlert: false,
    runCli: (deps) => runContextBridgeLogTtlCli(deps),
    runProcess: (runCli, exit) => runContextBridgeLogTtlProcess({ runCli, exit }),
  },
  {
    name: 'cold rotator',
    fatalRaisesAlert: false,
    runCli: (deps) => runColdRotatorCli(deps),
    runProcess: (runCli, exit) => runColdRotatorProcess({ runCli, exit }),
  },
  {
    name: 'rehydrate',
    fatalRaisesAlert: false,
    runCli: (deps) => runRehydrateCli(deps),
    runProcess: (runCli, exit) => runRehydrateProcess({ runCli, exit }),
  },
];

describe.each(cliContracts)('$name CLI contract', ({ runCli, runProcess, fatalRaisesAlert }) => {
  it('runs the injected command body when both required settings exist', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    await runCli({
      env: { DATABASE_URL: 'fake', SUPABASE_SERVICE_ROLE_KEY: 'fake', B75_SWEEP_LOCK_HELD: '1' },
      exit,
      run,
    });
    expect(run).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
  });

  it('refuses a missing setting before the command body', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    await runCli({ env: {}, exit, run });
    expect(exit).toHaveBeenCalledWith(1);
    expect(run).not.toHaveBeenCalled();
  });

  it('maps a fatal rejection to exit 1 and preserves the retention fatal alert edge', async () => {
    const exit = vi.fn();
    const alert = vi.fn().mockResolvedValue(undefined);
    await runProcess(vi.fn().mockRejectedValue(new Error('fatal')), exit, alert);
    expect(exit).toHaveBeenCalledWith(1);
    expect(alert).toHaveBeenCalledTimes(fatalRaisesAlert ? 1 : 0);
  });
});

describe('retention executable gates', () => {
  it('refuses a direct unmarked invocation before database or storage work', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    await runRetentionSweepCli({
      env: { DATABASE_URL: 'fake', SUPABASE_SERVICE_ROLE_KEY: 'fake' },
      exit,
      run,
    });
    expect(exit).toHaveBeenCalledWith(1);
    expect(run).not.toHaveBeenCalled();
  });

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

  it('executes the whole-partition archive, drop, active, and resolve chain', async () => {
    const events: string[] = [];
    const client = {
      connect: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const partition: PartitionRow = {
      parent: sweepSpec.parent,
      child: 'closed_trades_2026_01',
      partitionLabel: '2026-01',
      rangeStart: month.start,
      rangeEnd: month.end,
    };
    const processDeps: ProcessPartitionDependencies = {
      createClient: () => client as never,
      partitionHotBytes: vi.fn().mockResolvedValue(100),
      listMonthLabels: vi.fn().mockResolvedValue([]),
      getStorageClient: vi.fn().mockReturnValue({}),
      archiveObject: vi.fn(async () => {
        events.push('archive');
        return { kind: 'exported', manifestId: 'm1', rowCount: 3, bytesCompressed: 7 };
      }),
      dropAndMarkActive: vi.fn(async (_client, _child, markActive) => {
        events.push('drop');
        await markActive();
      }),
      updateManifestActive: vi.fn(async () => { events.push('active'); }),
      listPresentDates: vi.fn().mockResolvedValue([]),
      markLabelsActive: vi.fn(),
      now: vi.fn().mockReturnValueOnce(100).mockReturnValue(110),
    };
    const resolveAlerts = vi.fn(async () => { events.push('resolve'); });
    const raiseAlert = vi.fn();
    const result = await processPartitionAndSettle(sweepSpec, partition, sweepCfg, {
      process: (spec, item, cfg) => processPartition(spec, item, cfg, processDeps),
      resolveAlerts,
      raiseAlert,
    });
    expect(result).toMatchObject({ status: 'dropped', rowCount: 3, bytesWarm: 7 });
    expect(events).toEqual(['archive', 'drop', 'active', 'resolve']);
    expect(raiseAlert).not.toHaveBeenCalled();
  });

  it('keeps a partition and raises its keyed alert when archiving fails', async () => {
    const events: string[] = [];
    const client = {
      connect: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const partition: PartitionRow = {
      parent: sweepSpec.parent,
      child: 'closed_trades_2026_01',
      partitionLabel: '2026-01',
      rangeStart: month.start,
      rangeEnd: month.end,
    };
    const drop = vi.fn();
    const processDeps: ProcessPartitionDependencies = {
      createClient: () => client as never,
      partitionHotBytes: vi.fn().mockResolvedValue(100),
      listMonthLabels: vi.fn().mockResolvedValue([]),
      getStorageClient: vi.fn().mockReturnValue({}),
      archiveObject: vi.fn(async () => { events.push('archive'); throw new Error('proof refused'); }),
      dropAndMarkActive: drop,
      updateManifestActive: vi.fn(),
      listPresentDates: vi.fn().mockResolvedValue([]),
      markLabelsActive: vi.fn(),
      now: vi.fn().mockReturnValueOnce(100).mockReturnValue(110),
    };
    const resolveAlerts = vi.fn();
    const raiseAlert = vi.fn(async () => { events.push('alert'); });
    const result = await processPartitionAndSettle(sweepSpec, partition, sweepCfg, {
      process: (spec, item, cfg) => processPartition(spec, item, cfg, processDeps),
      resolveAlerts,
      raiseAlert,
    });
    expect(result.status).toBe('failed');
    expect(events).toEqual(['archive', 'alert']);
    expect(drop).not.toHaveBeenCalled();
    expect(resolveAlerts).not.toHaveBeenCalled();
  });

  it('executes the plain archive, proof gate, delete, active, vacuum, and resolve chain', async () => {
    const events: string[] = [];
    const day = new Date('2026-01-01T00:00:00Z');
    const ctl = {
      connect: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(async (sql: string) => {
        if (sql.includes('SELECT MIN')) return { rows: [{ min_ts: day }] };
        if (sql.includes('SELECT partition_label')) {
          return { rows: [{ partition_label: '2026-01-01', state: 'verified', completeness_basis: 'source-count-matched' }] };
        }
        if (sql.includes('DELETE FROM')) { events.push('delete'); return { rows: [], rowCount: 1 }; }
        if (sql.includes('VACUUM')) events.push('vacuum');
        return { rows: [], rowCount: 1 };
      }),
    };
    const exportClient = { connect: vi.fn(), end: vi.fn(), query: vi.fn() };
    const clients = [ctl, exportClient];
    const spec = {
      table: 'plain_archive', timestampColumn: 'captured_at',
      retentionConstantName: 'plain_archive.hot_retention_days', archive: true,
    };
    const cfg = { ...sweepCfg, retentionByTable: new Map([[spec.table, 30]]) };
    const resolveAlerts = vi.fn(async () => { events.push('resolve'); });
    const raiseAlert = vi.fn();
    const deps: SweepPlainDependencies = {
      specs: [spec],
      createClient: () => clients.shift() as never,
      listPresentDates: vi.fn().mockResolvedValue([day]),
      getStorageClient: vi.fn().mockReturnValue({}),
      archiveObject: vi.fn(async () => {
        events.push('archive');
        return { kind: 'exported', manifestId: 'p1', rowCount: 1, bytesCompressed: 2 };
      }),
      removeSource: removePlainArchiveSource,
      markLabelsActive: vi.fn(async () => { events.push('active'); }),
      resolveAlerts,
      raiseAlert,
      now: () => new Date('2026-03-01T00:00:00Z').getTime(),
    };
    await expect(sweepPlainTables(cfg, deps)).resolves.toEqual({ deleted: 1, failed: 0 });
    expect(events).toEqual(['archive', 'delete', 'active', 'vacuum', 'resolve']);
    expect(raiseAlert).not.toHaveBeenCalled();
  });

  it('keeps plain rows and raises the keyed alert when archive proof fails', async () => {
    const day = new Date('2026-01-01T00:00:00Z');
    const ctl = {
      connect: vi.fn(), end: vi.fn(),
      query: vi.fn(async (sql: string) => sql.includes('SELECT MIN')
        ? { rows: [{ min_ts: day }] }
        : { rows: [], rowCount: 0 }),
    };
    const exportClient = { connect: vi.fn(), end: vi.fn(), query: vi.fn() };
    const clients = [ctl, exportClient];
    const spec = {
      table: 'plain_archive', timestampColumn: 'captured_at',
      retentionConstantName: 'plain_archive.hot_retention_days', archive: true,
    };
    const cfg = { ...sweepCfg, retentionByTable: new Map([[spec.table, 30]]) };
    const removeSource = vi.fn();
    const resolveAlerts = vi.fn();
    const raiseAlert = vi.fn().mockResolvedValue(undefined);
    const deps: SweepPlainDependencies = {
      specs: [spec],
      createClient: () => clients.shift() as never,
      listPresentDates: vi.fn().mockResolvedValue([day]),
      getStorageClient: vi.fn().mockReturnValue({}),
      archiveObject: vi.fn().mockRejectedValue(new Error('checksum mismatch')),
      removeSource,
      markLabelsActive: vi.fn(),
      resolveAlerts,
      raiseAlert,
      now: () => new Date('2026-03-01T00:00:00Z').getTime(),
    };
    await expect(sweepPlainTables(cfg, deps)).resolves.toEqual({ deleted: 0, failed: 1 });
    expect(removeSource).not.toHaveBeenCalled();
    expect(resolveAlerts).not.toHaveBeenCalled();
    expect(raiseAlert).toHaveBeenCalledOnce();
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
    )).resolves.toMatchObject({
      rowCount: 0,
      bytesCompressed: 0,
      deletionGuard: { kind: 'proven-count', manifestId: 'ctx-1', month },
    });

    const later = { finalize: vi.fn(), vacuum: vi.fn() };
    await expect(runContextBridgeCycle([month], month.end, {
      archiveMonth: vi.fn().mockRejectedValue(new Error('recount mismatch')),
      ...later,
    })).rejects.toThrow('recount mismatch');
    expect(later.finalize).not.toHaveBeenCalled();
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
    // B-DISK-FILE-TIERING 3a: the file forms; the cold fallback is attested (no download back)
    const storage = {
      uploadWarmFile: vi.fn().mockRejectedValue(new Error('413 Payload Too Large')),
      downloadWarmFile: vi.fn(),
      isColdConfigured: vi.fn().mockReturnValue(true),
      uploadColdFile: vi.fn().mockResolvedValue({ checksum: 'ck', sha1: 'sha1-x', fileId: 'file-1', bytes: 10, uri: 'b2://b/p' }),
      downloadColdFile: vi.fn(),
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
    expect(storage.uploadColdFile).toHaveBeenCalledOnce();
    expect(storage.uploadColdFile.mock.calls[0][2]).toBe('fake.gz'); // the export FILE, never a buffer
    expect(storage.downloadColdFile).not.toHaveBeenCalled(); // attested, not read back
    const update = ctl.query.mock.calls.find((c) => String(c[0]).includes("SET tier = 'cold'"));
    expect(update?.[0]).toContain("verification_method = 'b2-sha1-attested'");
    expect(update?.[1]).toEqual(expect.arrayContaining(['file-1', 'sha1-x', 10]));
  });

  it('runs delete, active marking, and vacuum only after every month completes', async () => {
    const events: string[] = [];
    const second = { ...month, label: '2026-02', start: month.end, end: new Date('2026-03-01T00:00:00Z') };
    const result = await runContextBridgeCycle([month, second], second.end, {
      archiveMonth: async (item) => {
        events.push(`archive:${item.label}`);
        return {
          rowCount: 2,
          bytesCompressed: 3,
          deletionGuard: { kind: 'proven-count', manifestId: `m:${item.label}`, month: item },
        };
      },
      finalize: async (_cutoff, labels, guards) => {
        events.push(`finalize:${labels.join(',')}:${guards.length}`);
        return { deleted: 4 };
      },
      vacuum: async () => { events.push('vacuum'); },
    });
    expect(events).toEqual(['archive:2026-01', 'archive:2026-02', 'finalize:2026-01,2026-02:2', 'vacuum']);
    expect(result).toEqual({ archivedRows: 4, archivedBytes: 6, deleted: 4, completedLabels: ['2026-01', '2026-02'] });
  });

  it('locks, recounts, deletes, and marks active on one client, rolling back a changed count', async () => {
    const events: string[] = [];
    const client = { query: vi.fn(async (sql: string) => { events.push(sql); return { rows: [] }; }) };
    let proofMatches = true;
    const proof = vi.fn(async (receivedClient) => {
      expect(receivedClient).toBe(client);
      events.push('proof');
      return proofMatches;
    });
    const deleteRows = vi.fn(async (receivedClient) => {
      expect(receivedClient).toBe(client);
      events.push('delete');
      return { deleted: 3 };
    });
    const markActive = vi.fn(async (receivedClient) => {
      expect(receivedClient).toBe(client);
      events.push('active');
    });
    const guard: ContextDeletionGuard = { kind: 'proven-count', manifestId: 'ctx-1', month };
    const deps: ContextFinalizeDependencies = {
      listDeletePopulationLabels: vi.fn().mockResolvedValue([month.label]),
      proofCountStillMatches: proof,
      rowsPresent: vi.fn(),
      deleteRows,
      markActive,
    };
    await expect(finalizeContextDeletion(
      client as never, contextCfg, month.end, [month.label], [guard], deps,
    )).resolves.toEqual({ deleted: 3 });
    expect(events).toEqual([
      'BEGIN',
      'LOCK TABLE context_bridge_log IN SHARE ROW EXCLUSIVE MODE',
      'proof',
      'delete',
      'active',
      'COMMIT',
    ]);

    events.length = 0;
    proofMatches = false;
    await expect(finalizeContextDeletion(
      client as never, contextCfg, month.end, [month.label], [guard], deps,
    )).rejects.toBeInstanceOf(NonProvenExistingCopyError);
    expect(events).toEqual([
      'BEGIN',
      'LOCK TABLE context_bridge_log IN SHARE ROW EXCLUSIVE MODE',
      'proof',
      'ROLLBACK',
    ]);
  });

  it('rechecks an earlier empty skip under the same lock before deletion', async () => {
    const events: string[] = [];
    const client = { query: vi.fn(async (sql: string) => { events.push(sql); return { rows: [] }; }) };
    const rowsPresent = vi.fn(async (receivedClient) => {
      expect(receivedClient).toBe(client);
      events.push('rows-present');
      return true;
    });
    const deleteRows = vi.fn();
    const markActive = vi.fn();
    const guard: ContextDeletionGuard = {
      kind: 'must-be-empty',
      month,
      reason: 'active-rows-present',
    };
    await expect(finalizeContextDeletion(
      client as never,
      contextCfg,
      month.end,
      [month.label],
      [guard],
      {
        listDeletePopulationLabels: vi.fn().mockResolvedValue([month.label]),
        proofCountStillMatches: vi.fn(),
        rowsPresent,
        deleteRows,
        markActive,
      },
    )).rejects.toBeInstanceOf(NonProvenExistingCopyError);
    expect(events).toEqual([
      'BEGIN',
      'LOCK TABLE context_bridge_log IN SHARE ROW EXCLUSIVE MODE',
      'rows-present',
      'ROLLBACK',
    ]);
    expect(deleteRows).not.toHaveBeenCalled();
    expect(markActive).not.toHaveBeenCalled();
  });

  it('rolls back before delete when the locked cutoff population gains an unguarded old month', async () => {
    const events: string[] = [];
    const client = { query: vi.fn(async (sql: string) => { events.push(sql); return { rows: [] }; }) };
    const deleteRows = vi.fn();
    const markActive = vi.fn();
    const guard: ContextDeletionGuard = { kind: 'proven-count', manifestId: 'ctx-1', month };
    await expect(finalizeContextDeletion(
      client as never,
      contextCfg,
      month.end,
      [month.label],
      [guard],
      {
        listDeletePopulationLabels: vi.fn(async () => {
          events.push('population');
          return ['2025-12', month.label];
        }),
        proofCountStillMatches: vi.fn(),
        rowsPresent: vi.fn(),
        deleteRows,
        markActive,
      },
    )).rejects.toThrow('unguarded month(s): 2025-12');
    expect(events).toEqual([
      'BEGIN',
      'LOCK TABLE context_bridge_log IN SHARE ROW EXCLUSIVE MODE',
      'population',
      'ROLLBACK',
    ]);
    expect(deleteRows).not.toHaveBeenCalled();
    expect(markActive).not.toHaveBeenCalled();
  });
});

describe('cold rotation state machine', () => {
  const cfg: ColdRotatorConfig = {
    warmRetentionDays: 365,
    perTableWarmRetentionDays: new Map([['fast_table', 30]]),
    coldRotatorDryRun: false,
    warmBucket: 'warm', warmPrefix: 'archive', coldBucket: 'cold', coldPrefix: '', coldProvider: 'b2', freeFloorBytes: 1,
  };
  const candidate: ColdRotationCandidate = {
    id: 'warm-1', source_table: 'fast_table', partition_label: '2025-01',
    storage_uri: 'supabase://warm/archive/fast_table/2025-01.jsonl.gz',
    row_count: 2, bytes_compressed: 8, checksum: 'ck', created_at: new Date('2025-01-01T00:00:00Z'),
  };

  it('honors data_lifecycle.cold_rotator_dry_run with terminal zero-success and no rotation I/O', async () => {
    const runCandidates = vi.fn();
    const dryRunCfg = { ...cfg, coldRotatorDryRun: true };
    await expect(runColdRotationPlan([candidate], dryRunCfg, true, {
      runCandidates,
      rotationDependencies: { storage: {} as never, createClient: vi.fn() },
    })).resolves.toEqual({ dryRun: true, rotated: 0, failed: 0, bytesMoved: 0 });
    expect(runCandidates).not.toHaveBeenCalled();
  });

  it('preserves limit and warm-retention flag meaning and refuses invalid positive integers', () => {
    const localCfg: ColdRotatorConfig = {
      ...cfg,
      warmRetentionDays: 365,
      perTableWarmRetentionDays: new Map([['fast_table', 30]]),
    };
    expect(applyColdRotatorCliOverrides(localCfg, [
      '--limit', '2', '--warm-retention-days', '45',
    ])).toEqual({ limitOverride: 2, warmRetentionOverride: 45 });
    expect(localCfg.warmRetentionDays).toBe(45);
    expect(localCfg.perTableWarmRetentionDays.size).toBe(0);
    expect(applyColdRotationLimit([
      candidate,
      { ...candidate, id: 'second' },
      { ...candidate, id: 'third' },
    ], 2).map((item) => item.id)).toEqual(['warm-1', 'second']);

    const exit = vi.fn();
    const error = vi.fn();
    expect(parseIntFlag(['--limit', '0'], '--limit', { exit, error })).toBeNull();
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('requires a positive integer'));
  });

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

  it('deletes warm strictly after the ATTESTED upload and both manifest writes; no cold read-back; temp removed', async () => {
    const events: string[] = [];
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'b75-rot-'));
    privateDirs.push(tempRoot);
    let local = '';
    const storage = {
      downloadWarmFile: vi.fn(async (_b: string, _p: string, l: string) => { events.push('warm-read'); local = l; fs.writeFileSync(l, 'x'); return { checksum: 'ck', bytes: 1 }; }),
      uploadColdFile: vi.fn(async () => { events.push('cold-upload'); return { checksum: 'ck', sha1: 's1', fileId: 'f1', bytes: 1, uri: 'b2://cold/x' }; }),
      deleteWarm: vi.fn(async () => { events.push('warm-delete'); }),
    };
    const client = {
      connect: vi.fn(), end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(async (sql: string) => {
        if (sql === 'BEGIN') { events.push('begin'); return { rows: [] }; }
        if (sql.startsWith('INSERT INTO data_archive_manifest')) {
          events.push('cold-manifest');
          return { rows: [{ id: 'cold-1', completeness_basis: 'unrecorded' }] };
        }
        if (sql.startsWith('UPDATE data_archive_manifest')) { events.push('warm-migrated'); return { rows: [] }; }
        if (sql === 'COMMIT') { events.push('commit'); return { rows: [] }; }
        throw new Error(`unexpected SQL: ${sql}`);
      }),
    };
    await expect(rotateColdCandidate(candidate, cfg, { storage: storage as never, createClient: () => client as never, tempRoot, freeBytes: () => 1e12 }))
      .resolves.toBe(8);
    expect(events).toEqual(['warm-read', 'cold-upload', 'begin', 'cold-manifest', 'warm-migrated', 'commit', 'warm-delete']);
    expect(fs.existsSync(local)).toBe(false); // the private temp folder is removed
    const insert = client.query.mock.calls.find((c) => String(c[0]).startsWith('INSERT INTO data_archive_manifest'));
    expect(insert?.[1]).toEqual(expect.arrayContaining(['f1', 's1', 1]));
  });

  it('refuses before any I/O when free space is short of 2 x object + the floor, and when the floor is missing', async () => {
    const storage = { downloadWarmFile: vi.fn(), uploadColdFile: vi.fn(), deleteWarm: vi.fn() };
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'b75-rot-'));
    privateDirs.push(tempRoot);
    await expect(rotateColdCandidate(candidate, cfg, { storage: storage as never, createClient: () => ({}) as never, tempRoot, freeBytes: () => 2 * 8 }))
      .rejects.toThrow(/refused/);
    const noFloor = { ...cfg, freeFloorBytes: undefined as unknown as number };
    await expect(rotateColdCandidate(candidate, noFloor, { storage: storage as never, createClient: () => ({}) as never, tempRoot, freeBytes: () => 1e12 }))
      .rejects.toThrow(/refused/);
    expect(storage.downloadWarmFile).not.toHaveBeenCalled();
    expect(storage.deleteWarm).not.toHaveBeenCalled();
  });

  it('keeps warm on checksum failure and continues to the next candidate', async () => {
    const deleted: string[] = [];
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'b75-rot-'));
    privateDirs.push(tempRoot);
    const storage = {
      downloadWarmFile: vi.fn(async (_bucket: string, objectPath: string, l: string) => {
        fs.writeFileSync(l, 'x');
        return { checksum: objectPath.includes('bad') ? 'wrong' : 'ck', bytes: 1 };
      }),
      uploadColdFile: vi.fn().mockResolvedValue({ checksum: 'ck', sha1: 's1', fileId: 'f1', bytes: 1, uri: 'b2://cold/x' }),
      deleteWarm: vi.fn(async (_bucket: string, objectPath: string) => { deleted.push(objectPath); }),
    };
    const client = {
      connect: vi.fn(), end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(async (sql: string) => sql.startsWith('INSERT INTO data_archive_manifest')
        ? { rows: [{ id: 'cold-good', completeness_basis: 'unrecorded' }] }
        : { rows: [] }),
    };
    const bad = { ...candidate, id: 'bad', storage_uri: 'supabase://warm/bad' };
    const good = { ...candidate, id: 'good', partition_label: '2025-02', storage_uri: 'supabase://warm/good' };
    const result = await runColdRotationCandidates([bad, good], cfg, {
      storage: storage as never, createClient: () => client as never, tempRoot, freeBytes: () => 1e12,
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
    expect(result).toEqual({ kind: 'downloaded', bytes: 7, rowCount: 7, basisProven: true, description: undefined });
    expect(fs.existsSync(good)).toBe(true);
    expect(JSON.parse(fs.readFileSync(`${good}.completeness.json`, 'utf8'))).toMatchObject({ proven: true, checksum_ok: true });
  });

  it('enforces the private output rule before any restore work', () => {
    const privateStat = {
      mode: 0o40700,
      isSymbolicLink: () => false,
      isDirectory: () => true,
    } as fs.Stats;
    const publicStat = { ...privateStat, mode: 0o40755 } as fs.Stats;
    expect(ensurePrivateRehydrateOutput('/private', {
      lstat: vi.fn().mockReturnValue(privateStat),
      mkdir: vi.fn(),
    })).toBeNull();
    expect(ensurePrivateRehydrateOutput('/public', {
      lstat: vi.fn().mockReturnValue(publicStat),
      mkdir: vi.fn(),
    })).toContain('group or others can reach it');
  });

  it('executes --disk-file restore under the original name only after byte and newline checks pass', async () => {
    const out = makeDir();
    const original = Buffer.from('a\nb\n');
    const compressed = zlib.gzipSync(original);
    const manifest = row({
      partition_label: 'original.ndjson',
      format: DISK_FILE_FORMAT,
      row_count: 2,
      original_partition_size_bytes: original.length,
    });
    const storage = {
      downloadWarmFile: vi.fn(async (_bucket: string, _object: string, local: string) => {
        fs.writeFileSync(local, compressed);
        return { checksum: 'ck', bytes: compressed.length };
      }),
      isColdConfigured: vi.fn(),
      downloadCold: vi.fn(),
    };
    const result = await rehydrateChosenObject({
      ...args(out),
      table: 'disk_file.exports',
      diskFile: true,
    }, {
      label: manifest.partition_label,
      download: manifest,
      all: [manifest],
    }, storage as never);
    expect(result).toMatchObject({ kind: 'downloaded', rowCount: 2, basisProven: true });
    expect(fs.readFileSync(path.join(out, manifest.partition_label))).toEqual(original);
    expect(fs.existsSync(path.join(out, `${manifest.partition_label}.gz`))).toBe(false);
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
    expect(result).toMatchObject({ kind: 'mismatch', rowCount: 7 });
    expect('basisProven' in result).toBe(false);
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

  it('aggregates each result into one numeric bucket and maps any mismatch to exit 2', () => {
    const summary = summarizeRehydrateResults([
      { kind: 'downloaded', bytes: 10, rowCount: 9, basisProven: true },
      { kind: 'downloaded', bytes: 11, rowCount: 8, basisProven: false, description: 'unproven' },
      { kind: 'mismatch', bytes: 12, rowCount: 7, description: 'corrupt' },
      { kind: 'skipped-cold', bytes: 0, rowCount: 0 },
      { kind: 'skipped', bytes: 0, rowCount: 0 },
    ]);
    expect(summary).toEqual({
      downloaded: 3,
      skippedCold: 1,
      provenRows: 9,
      unprovenRows: 8,
      mismatchRows: 7,
      totalBytes: 33,
      unproven: ['unproven'],
      mismatched: ['corrupt'],
    });
    const exit = vi.fn();
    const log = vi.fn();
    finishRehydrateRun(summary, { warn: vi.fn(), error: vi.fn(), log, exit });
    expect(exit).toHaveBeenCalledWith(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('rows_checksum_mismatch=7'));
  });
});
