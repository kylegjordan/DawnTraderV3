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
  });
});
