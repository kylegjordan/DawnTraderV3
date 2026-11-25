import { afterEach, describe, expect, it, vi } from 'vitest';

const { diagnosticRead } = vi.hoisted(() => ({ diagnosticRead: vi.fn() }));
vi.mock('../../db.js', () => ({ diagDb: { execute: diagnosticRead } }));
vi.mock('../../services/price-cache', () => ({ priceCache: {} }));
vi.mock('../../core/rtb/ready_to_buy_service', () => ({ readyToBuyService: {} }));
vi.mock('../../services/rtb-retirement-ask.js', () => ({ readRetirementAsk: vi.fn() }));
vi.mock('../../services/data-aggregator.js', () => ({ dataAggregator: { capture: vi.fn(async () => undefined) } }));
vi.mock('../../utils/strategyWeights.js', () => ({ computeStrategyWeights: vi.fn(async () => ({ totalStrategies: 0 })) }));
vi.mock('../../utils/strategyBias.js', () => ({ computeExposureBias: vi.fn(async () => ({ strategies: {} })) }));
vi.mock('../../services/pool-broadcast', () => ({ poolBus: { emit: vi.fn() } }));

const initialTime = Date.parse('2026-12-07T14:30:01Z');
const interval = '2026-12-07T14:30:00Z/2026-12-07T21:00:00Z';
const collectOutput = () => new Promise<void>(resolve => setImmediate(resolve));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Entry Gate observation through the original Central Clock and RTB refresh', () => {
  async function exercise(enabled: boolean) {
    vi.resetModules();
    vi.stubEnv('ENTRY_GATE_EVIDENCE_WINDOWS_UTC', enabled ? interval : '');
    diagnosticRead.mockReset();
    let failDiagnostic!: (error: Error) => void;
    diagnosticRead.mockImplementation(() => new Promise((_resolve, reject) => { failDiagnostic = reject; }));
    const { centralClock } = await import('../../services/central-clock.js');
    const { rtbRefreshService } = await import('../../services/rtb-refresh-service.js');
    const { getAdaptivePoolSize } = await import('../../services/adaptive-pool-config.js');
    const ticks: number[] = [];
    const bucketWork: Array<[string, number]> = [];
    const lines: string[] = [];
    const evidence = vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
      lines.push(String(chunk));
      return true;
    });
    const existingLogs = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let now = initialTime;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.spyOn(process, 'cpuUsage').mockImplementation(prior => ({ user: prior ? 1000 : 0, system: 0 }));

    const clock = centralClock as unknown as { emitTick(): void; tickNumber: number; lastTickTime: number };
    const refresh = rtbRefreshService as unknown as {
      assignSignalsToBuckets(): Promise<void>;
      refreshModeSignals(mode: string, bucket: number): Promise<void>;
    };
    let finishBucket!: () => void;
    const pendingBucket = new Promise<void>(resolve => { finishBucket = resolve; });
    vi.spyOn(refresh, 'assignSignalsToBuckets').mockImplementationOnce(() => pendingBucket)
      .mockImplementation(async () => undefined);
    vi.spyOn(refresh, 'refreshModeSignals').mockImplementation(async (mode, bucket) => {
      bucketWork.push([mode, bucket]);
      if (mode === 'live') now += 25;
    });

    centralClock.on('tick', tick => ticks.push(tick.tickNumber));
    rtbRefreshService.start();
    centralClock.stop();

    function emit(tickNumber: number, at: number) {
      now = at;
      clock.tickNumber = tickNumber - 1;
      clock.lastTickTime = now - 1000;
      clock.emitTick();
    }

    try {
      emit(15, initialTime);
      if (enabled) await vi.waitFor(() => expect(diagnosticRead).toHaveBeenCalledTimes(1));
      emit(30, initialTime + 15_000); // refresh itself is still busy
      finishBucket();
      await collectOutput();
      emit(45, initialTime + 30_000); // refresh runs while the diagnostic query is still in flight
      await collectOutput();
      if (enabled) failDiagnostic(new Error('Diagnostic acquire timeout'));
      await collectOutput();

      // Four more ticks settle the ACT decision using the actual production path.
      diagnosticRead.mockImplementation(async () => ({ rows: [{ observed_at: now, crypto: 0, xstock: 9 }] }));
      for (let i = 3; i < 7; i++) {
        const tickNumber = 15 * (i + 1);
        emit(tickNumber, initialTime + 15_000 * i);
        if (enabled) {
          await vi.waitFor(() => expect(lines.join('')).toContain(`"tickNumber":${tickNumber},"kind":"snapshot"`));
        }
        await collectOutput();
      }
      return {
        ticks, bucketWork, pool: getAdaptivePoolSize(), lines,
        skipped: existingLogs.mock.calls.filter(([message]) => String(message).includes('Skipping - refresh in progress')).length,
      };
    } finally {
      evidence.mockRestore();
      rtbRefreshService.stop();
      centralClock.removeAllListeners();
      vi.restoreAllMocks();
    }
  }

  it('presents identical clock events, bucket work, busy skips and ACT decisions while a diagnostic read is slow or fails', async () => {
    const baseline = await exercise(false);
    const observed = await exercise(true);
    expect(baseline.ticks).toEqual([15, 30, 45, 60, 75, 90, 105]);
    expect(baseline.bucketWork).toHaveLength(12);
    expect(baseline.pool).toBeGreaterThan(5);
    expect(baseline.skipped).toBe(1);
    expect(baseline.lines.join('')).not.toContain('[B-ENTRY-GATE-D]');
    expect(observed).toMatchObject({ ticks: baseline.ticks, bucketWork: baseline.bucketWork, pool: baseline.pool, skipped: 1 });
    const carriers = observed.lines.join('');
    expect(carriers).toContain('"kind":"cycle_busy"');
    expect(carriers).toContain('"reason":"observer_busy"');
    expect(carriers).toContain('"reason":"query_failed"');
    expect(carriers).toContain('"crypto":0,"xstock":9');
    expect(carriers).toMatch(/"kind":"snapshot"[^\n]*"queryStartedAt":\d+[^\n]*"monotonicElapsedMs":\d+/);
  });

  it('brackets the registered scans with sequence counts emitted on the clock path', async () => {
    vi.resetModules();
    vi.stubEnv('ENTRY_GATE_EVIDENCE_WINDOWS_UTC', interval);
    const { observeEntryGateClock, startEntryGateScan } = await import('../../core/observability/entry-gate-evidence.js');
    const lines: string[] = [];
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
      lines.push(String(chunk));
      return true;
    });
    try {
      const start = Date.parse('2026-12-07T14:30:00Z');
      const end = Date.parse('2026-12-07T21:00:00Z');
      observeEntryGateClock(15, start - 15_000);
      expect(startEntryGateScan(1, 'active_portfolio', 'paper', 'crypto_spot', start - 1)).toBeUndefined();
      expect(startEntryGateScan(1, 'active_portfolio', 'paper', 'crypto_spot', start)?.scan).toBe(1);
      expect(startEntryGateScan(1, 'active_portfolio', 'paper', 'crypto_spot', end - 1)?.scan).toBe(2);
      expect(startEntryGateScan(1, 'active_portfolio', 'paper', 'crypto_spot', end)).toBeUndefined();
      observeEntryGateClock(30, end + 900_000);
      await collectOutput();
    } finally {
      stdout.mockRestore();
    }
    const records = lines.join('').trimEnd().split('\n').map(line => JSON.parse(line.slice('[B-ENTRY-GATE-D] '.length)));
    expect(records.filter(row => row.kind.startsWith('window_'))).toEqual([
      expect.objectContaining({ kind: 'window_start', scanSequence: 0 }),
      expect.objectContaining({ kind: 'window_end', scanSequence: 2 }),
    ]);
  });

  it('carries the actual reached target and upsert seams into later terminal records', async () => {
    vi.resetModules();
    vi.stubEnv('ENTRY_GATE_EVIDENCE_WINDOWS_UTC', interval);
    const { startEntryGateScan, planEntryGateEvaluation, observeEntryGateEvaluation } =
      await import('../../core/observability/entry-gate-evidence.js');
    const lines: string[] = [];
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
      lines.push(String(chunk));
      return true;
    });
    try {
      const scan = startEntryGateScan(1, 'active_portfolio', 'paper', 'crypto_spot', initialTime);
      const refusal = planEntryGateEvaluation(scan, 'A/USD', 'reverse_impulse', 'direct');
      observeEntryGateEvaluation(refusal, 'target_refused');
      observeEntryGateEvaluation(refusal, 'evaluation_end', { outcome: 'build_refused' });
      for (const outcome of ['upsert_committed', 'upsert_unconfirmed', 'not_attempted'] as const) {
        const evaluation = planEntryGateEvaluation(scan, outcome, 'strong_bull_trend', 'hybrid');
        observeEntryGateEvaluation(evaluation, 'target_pass');
        observeEntryGateEvaluation(evaluation, 'rtb_call');
        observeEntryGateEvaluation(evaluation, 'evaluation_end', { outcome: 'built' });
        if (outcome !== 'not_attempted') {
          observeEntryGateEvaluation(evaluation, 'upsert_attempt');
          observeEntryGateEvaluation(evaluation, outcome);
        }
        observeEntryGateEvaluation(evaluation, 'rtb_error');
      }
      await collectOutput();
    } finally {
      stdout.mockRestore();
    }
    const records = lines.join('').trimEnd().split('\n').map(line => JSON.parse(line.slice('[B-ENTRY-GATE-D] '.length)));
    const terminals = records.filter(row => row.kind === 'evaluation_end' || row.kind === 'rtb_error');
    expect(terminals).toEqual([
      expect.objectContaining({ kind: 'evaluation_end', targetVerdict: 'target_refused', rtbCalls: 0 }),
      expect.objectContaining({ kind: 'evaluation_end', targetVerdict: 'target_pass', rtbCalls: 1 }),
      expect.objectContaining({ kind: 'rtb_error', upsertOutcome: 'upsert_committed' }),
      expect.objectContaining({ kind: 'evaluation_end', targetVerdict: 'target_pass', rtbCalls: 1 }),
      expect.objectContaining({ kind: 'rtb_error', upsertOutcome: 'upsert_unconfirmed' }),
      expect.objectContaining({ kind: 'evaluation_end', targetVerdict: 'target_pass', rtbCalls: 1 }),
      expect.objectContaining({ kind: 'rtb_error', upsertOutcome: 'not_attempted' }),
    ]);
    expect(records.some(row => 'progress' in row)).toBe(false);
  });
});
