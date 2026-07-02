/**
 * ══════════════════════════════════════════════════════════════════════════════
 * P19-B6.6 (#236) — xStock price-discovery-liveness fill gate.
 * ══════════════════════════════════════════════════════════════════════════════
 * Pins the load-bearing behavior + wire-in:
 *   - the PURE verdict (assessPriceLiveness) and its fail-closed reason taxonomy
 *     (live / flat_last / sparse_snapshots / no_data) — a feed/config outage must be
 *     distinguishable from a genuine dead market (Langston Step-2 #3).
 *   - the orchestrator (evaluateXstockPriceLiveness) fail-closes on missing config,
 *     query timeout, and query error, NEVER throws, and honors the enabled kill-switch.
 *   - the config resolver is fail-closed (missing/mistyped → null).
 *   - the windowed query is index-bounded (symbol + captured_at range) + timeout-fail-closed.
 *   - the open-seam wire-in is xStock-only, runs AFTER the depth gate (depth-first), and
 *     blocks via the same recordDepthGateBlock telemetry + recordOpenFailed('LIVENESS_GATE').
 *
 * db + module-constants-service are mocked so the pure/orchestrator logic runs without a DB
 * (the injected-deps orchestrator never touches the real ones; the resolver test drives the
 * mocked getModuleConstants directly).
 * ══════════════════════════════════════════════════════════════════════════════
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('../../db.js', () => ({ db: { execute: vi.fn() } }));
vi.mock('../../services/module-constants-service.js', () => ({ getModuleConstants: vi.fn() }));

import {
  assessPriceLiveness,
  evaluateXstockPriceLiveness,
  resolvePriceLivenessConfig,
  _testClearPriceLivenessCache,
  type PriceLivenessConfig,
  type LastMoveStats,
} from '../../asset_classes/xstock_spot/price-liveness.js';
import { getModuleConstants } from '../../services/module-constants-service.js';

const CFG: PriceLivenessConfig = { windowMs: 2_700_000, minMoves: 1, minSnaps: 5, queryTimeoutMs: 2000, enabled: true };
const stats = (snapCount: number, moveCount: number, msSinceLastMove: number | null = null): LastMoveStats =>
  ({ snapCount, moveCount, msSinceLastMove });

const SRC = path.resolve(__dirname, '../..');
const peeSrc = fs.readFileSync(path.join(SRC, 'services/active-execution-engine.ts'), 'utf8');
const metricsSrc = fs.readFileSync(path.join(SRC, 'services/rtb-metrics-service.ts'), 'utf8');
const livenessSrc = fs.readFileSync(path.join(SRC, 'asset_classes/xstock_spot/price-liveness.ts'), 'utf8');

describe('P19-B6.6 assessPriceLiveness (pure verdict + reason taxonomy)', () => {
  test('≥ minMoves changes in a well-populated window → live', () => {
    const r = assessPriceLiveness(stats(120, 3, 1000), CFG);
    expect(r.live).toBe(true);
    expect(r.reason).toBe('live');
  });

  test('enough snapshots but 0 moves (holiday / dead-but-quoted book) → flat_last block', () => {
    const r = assessPriceLiveness(stats(120, 0), CFG);
    expect(r.live).toBe(false);
    expect(r.reason.startsWith('flat_last')).toBe(true);
  });

  test('snapshots present but < minSnaps → sparse_snapshots block (insufficient evidence, not "flat")', () => {
    const r = assessPriceLiveness(stats(3, 0), CFG);
    expect(r.live).toBe(false);
    expect(r.reason.startsWith('sparse_snapshots')).toBe(true);
  });

  test('zero snapshots (feed outage) → no_data block — distinct from flat_last', () => {
    const r = assessPriceLiveness(stats(0, 0), CFG);
    expect(r.live).toBe(false);
    expect(r.reason.startsWith('no_data')).toBe(true);
  });

  test('reason codes for the three block kinds are mutually distinct (outage ≠ holiday)', () => {
    const kinds = [stats(0, 0), stats(3, 0), stats(120, 0)]
      .map((s) => assessPriceLiveness(s, CFG).reason.split(' ')[0]);
    expect(new Set(kinds).size).toBe(3);
    expect(kinds).toEqual(['no_data', 'sparse_snapshots', 'flat_last']);
  });
});

describe('P19-B6.6 evaluateXstockPriceLiveness (orchestrator — fail-closed, never throws)', () => {
  test('config missing (null) → fail-closed block with liveness_config_missing', async () => {
    const r = await evaluateXstockPriceLiveness('SPYx/USD', { resolveConfig: async () => null });
    expect(r.live).toBe(false);
    expect(r.reason).toBe('liveness_config_missing');
  });

  test('enabled=false kill-switch → passes through (gate OFF)', async () => {
    const r = await evaluateXstockPriceLiveness('SPYx/USD', {
      resolveConfig: async () => ({ ...CFG, enabled: false }),
      getStats: async () => { throw new Error('must not be called'); },
    });
    expect(r.live).toBe(true);
    expect(r.reason).toBe('liveness_disabled');
  });

  test('stats query TIMEOUT → fail-closed block with liveness_timeout', async () => {
    const r = await evaluateXstockPriceLiveness('EWN/USD', {
      resolveConfig: async () => CFG,
      getStats: async () => { throw new Error('liveness query timeout >2000ms'); },
    });
    expect(r.live).toBe(false);
    expect(r.reason).toBe('liveness_timeout');
  });

  test('stats query ERROR (non-timeout) → fail-closed block with liveness_query_error', async () => {
    const r = await evaluateXstockPriceLiveness('EWN/USD', {
      resolveConfig: async () => CFG,
      getStats: async () => { throw new Error('connection reset'); },
    });
    expect(r.live).toBe(false);
    expect(r.reason).toBe('liveness_query_error');
  });

  test('live stats → live (passes the gate)', async () => {
    const r = await evaluateXstockPriceLiveness('MUx/USD', {
      resolveConfig: async () => CFG,
      getStats: async () => stats(200, 12, 500),
    });
    expect(r.live).toBe(true);
    expect(r.reason).toBe('live');
  });

  test('flat book → block (orchestrator routes the pure verdict through)', async () => {
    const r = await evaluateXstockPriceLiveness('EWNx/USD', {
      resolveConfig: async () => CFG,
      getStats: async () => stats(120, 0),
    });
    expect(r.live).toBe(false);
    expect(r.reason.startsWith('flat_last')).toBe(true);
  });

  test('resolveConfig itself throwing → caught, fail-closed block (never throws out)', async () => {
    const r = await evaluateXstockPriceLiveness('SPYx/USD', {
      resolveConfig: async () => { throw new Error('boom'); },
    });
    expect(r.live).toBe(false);
    expect(r.reason).toBe('liveness_error');
  });
});

describe('P19-B6.6 resolvePriceLivenessConfig (DB-resolved, fail-closed)', () => {
  beforeEach(() => { _testClearPriceLivenessCache(); vi.mocked(getModuleConstants).mockReset(); });

  test('complete + correctly-typed row set → config', async () => {
    vi.mocked(getModuleConstants).mockResolvedValue({
      window_ms: 2_700_000, min_moves: 1, min_snaps: 5, query_timeout_ms: 2000, enabled: true,
    } as any);
    const cfg = await resolvePriceLivenessConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.windowMs).toBe(2_700_000);
    expect(cfg!.enabled).toBe(true);
  });

  test('missing a numeric key → null (fail-closed)', async () => {
    vi.mocked(getModuleConstants).mockResolvedValue({
      window_ms: 2_700_000, min_moves: 1, min_snaps: 5, /* query_timeout_ms missing */ enabled: true,
    } as any);
    expect(await resolvePriceLivenessConfig()).toBeNull();
  });

  test('enabled present but mistyped (string, not boolean) → null (fail-closed)', async () => {
    vi.mocked(getModuleConstants).mockResolvedValue({
      window_ms: 2_700_000, min_moves: 1, min_snaps: 5, query_timeout_ms: 2000, enabled: 'true',
    } as any);
    expect(await resolvePriceLivenessConfig()).toBeNull();
  });

  test('lookup throws → null (fail-closed)', async () => {
    vi.mocked(getModuleConstants).mockRejectedValue(new Error('db down'));
    expect(await resolvePriceLivenessConfig()).toBeNull();
  });
});

describe('P19-B6.6 windowed query — index-bounded + timeout-fail-closed (source)', () => {
  test('the read filters by symbol AND a captured_at window (index-bounded, not a full scan)', () => {
    expect(livenessSrc).toMatch(/WHERE symbol = \$\{symbol\}/);
    expect(livenessSrc).toMatch(/captured_at > NOW\(\) - make_interval\(secs => \$\{windowSec\}\)/);
    expect(livenessSrc).not.toMatch(/SELECT \* FROM xstock_spot_ticker_snap/);
  });

  test('the windowed read is hard-timed via Promise.race so a slow query fails closed', () => {
    expect(livenessSrc).toMatch(/Promise\.race/);
    expect(livenessSrc).toMatch(/setTimeout/);
    // a timeout maps to the liveness_timeout reason in the orchestrator
    expect(livenessSrc).toMatch(/liveness_timeout/);
  });
});

describe('P19-B6.6 open-seam wire-in (source — depth-first, xStock-only, telemetry)', () => {
  test('OpenFailStage carries LIVENESS_GATE', () => {
    expect(metricsSrc).toMatch(/'LIVENESS_GATE'/);
  });

  test('liveness is invoked at the open seam, xStock-only', () => {
    expect(peeSrc).toMatch(/evaluateXstockPriceLiveness\(signal\.symbol\)/);
    // guarded by the resolved open class being xstock_spot
    expect(peeSrc).toMatch(/if \(_openClass === 'xstock_spot'\)\s*\{\s*const _live = await evaluateXstockPriceLiveness/);
  });

  test('DEPTH-FIRST ordering: the depth gate is evaluated BEFORE the liveness gate', () => {
    const depthIdx = peeSrc.indexOf('_evaluateOpenDepthGate(signal.symbol');
    const liveIdx = peeSrc.indexOf('evaluateXstockPriceLiveness(signal.symbol)');
    expect(depthIdx).toBeGreaterThan(-1);
    expect(liveIdx).toBeGreaterThan(depthIdx);
  });

  test('a liveness block is observable: recordDepthGateBlock + recordOpenFailed(LIVENESS_GATE) + stage', () => {
    const seg = peeSrc.slice(peeSrc.indexOf('evaluateXstockPriceLiveness(signal.symbol)'),
                             peeSrc.indexOf('evaluateXstockPriceLiveness(signal.symbol)') + 700);
    expect(seg).toMatch(/recordDepthGateBlock\(_openClass, _live\.reason\)/);
    expect(seg).toMatch(/recordOpenFailed\(signal\.symbol, signal\.strategy, 'LIVENESS_GATE', _live\.reason\)/);
    expect(seg).toMatch(/stage: 'LIVENESS_GATE'/);
  });
});
