/**
 * B-FEED-HEALTH-GRADE-ARM (#1123, SPRINT_TO_LIVE_PLAN row 3a) — the feed-liveness grade is armed (feed_health prefetched)
 * and its dashboard alerts clear on every healthy cycle (Step 9 r3 — idempotent, never edge-gated); the check-failed
 * path is throttled; the per-cycle liveness line separates "graded healthy" from "not graded"; and the recorder names
 * every admitted pair by its venue base (the 8 pairs the old base table mis-named).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.FEED_ALERT_COOLDOWN_SEC = '600'; // explicit cooldown — the tests never lean on the 300 s / */5 coincidence (C2)

const m = vi.hoisted(() => ({
  createAlert: vi.fn(),
  acknowledgeFeedHealthAlerts: vi.fn(),
  getAllUsers: vi.fn(),
  isEngineActive: vi.fn(),
}));
vi.mock('../../services/alerts-service', () => ({
  AlertsService: {
    createAlert: (...a: any[]) => m.createAlert(...a),
    acknowledgeFeedHealthAlerts: (...a: any[]) => m.acknowledgeFeedHealthAlerts(...a),
  },
}));
vi.mock('../../storage', () => ({ storage: { getAllUsers: (...a: any[]) => m.getAllUsers(...a) } }));
vi.mock('../../services/trading-state-sync', () => ({ tradingStateSync: { isEngineActive: (...a: any[]) => m.isEngineActive(...a) } }));
vi.mock('../../services/cluster-bus', () => ({ clusterBus: { on: vi.fn(), emit: vi.fn() } }));
vi.mock('../../exchanges/kraken/kraken-websocket-adapter.js', () => ({
  krakenWebSocketAdapter: { getI8EWsHealth: () => [], getConnectionStats: () => ({}), on: vi.fn() },
}));
vi.mock('../../services/passive-archive/equity-spot-archiver.js', () => ({
  getEquityTickerUpdateAges: () => [], isEquityTickingCountWarm: () => false,
}));

import { runFeedIntegrityCheck, sessionSegment, formatLivenessLines } from '../../jobs/feed-integrity-auto-check';
import { getFeedIntegrityMonitor } from '../../services/feed-integrity-monitor';
import { loadCryptoSpotUniverse } from '../../services/passive-archive/universe-loader';

const ADMIN = { id: 'admin-1', isAdmin: true };
function report(status: 'healthy' | 'warning' | 'critical', grade: string) {
  return {
    timestamp: new Date().toISOString(), overallGrade: grade, issues: [], summary: [],
    metrics: { feedType: 'websocket', latencyMs: 1, stalenessSec: 0, uptimePercent: 100, reconnectBasis: 'ring', ringSpanMs: 3_300_000, ringSamples: 12, pairCount: 1, errorRate: 0,
      reconnectCount: 0, tickAgeSec: 0, livenessGrade: 'healthy', status, lastUpdateISO: new Date().toISOString() },
  } as any;
}
let mon: ReturnType<typeof getFeedIntegrityMonitor>;
beforeEach(() => {
  vi.clearAllMocks();
  m.getAllUsers.mockResolvedValue([ADMIN]);
  m.isEngineActive.mockResolvedValue(true);
  m.createAlert.mockResolvedValue({});
  m.acknowledgeFeedHealthAlerts.mockResolvedValue([{ mode: 'live' }, { mode: 'paper' }]);
  mon = getFeedIntegrityMonitor();
  mon.reset();
  vi.spyOn(mon, 'recordSnapshot').mockImplementation(() => undefined as any);
  vi.spyOn(mon, 'saveReport').mockImplementation(() => undefined);
});

describe('the clear: acknowledged on every healthy cycle, idempotent (Step 9 r3, Langston BLOCKER-2)', () => {
  it('a non-healthy cycle mints; the next healthy cycle acknowledges for each admin and records healthy', async () => {
    vi.spyOn(mon, 'generateReport').mockReturnValueOnce(report('critical', 'F')).mockReturnValueOnce(report('healthy', 'A'));
    await runFeedIntegrityCheck('auto');
    expect(m.createAlert).toHaveBeenCalledTimes(2); // live + paper for the one admin
    expect(m.acknowledgeFeedHealthAlerts).not.toHaveBeenCalled(); // a non-healthy cycle acknowledges nothing
    expect(mon.getLastStatus()).toBe('critical');
    await runFeedIntegrityCheck('auto');
    expect(m.acknowledgeFeedHealthAlerts).toHaveBeenCalledTimes(1);
    expect(m.acknowledgeFeedHealthAlerts).toHaveBeenCalledWith('admin-1');
    expect(mon.getLastStatus()).toBe('healthy');
  });
  it('THE RESTART CASE: the recorded status starts healthy, rows are waiting — the FIRST healthy cycle acknowledges them', async () => {
    // Under the old edge (`healthy && lastStatus !== healthy`) this acknowledged nothing: lastStatus starts 'healthy'.
    expect(mon.getLastStatus()).toBe('healthy');
    const log = vi.spyOn(console, 'log');
    vi.spyOn(mon, 'generateReport').mockReturnValue(report('healthy', 'A'));
    await runFeedIntegrityCheck('auto');
    expect(m.acknowledgeFeedHealthAlerts).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.some((c) => /\[FeedIntegrity\]\[CLEAR\] .*acknowledged 2 feed alert/.test(String(c[0])))).toBe(true);
  });
  it('drained: a second healthy cycle acknowledges nothing and prints no CLEAR line', async () => {
    m.acknowledgeFeedHealthAlerts.mockResolvedValueOnce([{ mode: 'live' }]).mockResolvedValue([]);
    vi.spyOn(mon, 'generateReport').mockReturnValue(report('healthy', 'A'));
    await runFeedIntegrityCheck('auto');
    const log = vi.spyOn(console, 'log');
    await runFeedIntegrityCheck('auto');
    expect(m.acknowledgeFeedHealthAlerts).toHaveBeenCalledTimes(2); // called each healthy cycle — idempotent by its WHERE
    expect(log.mock.calls.some((c) => /\[FeedIntegrity\]\[CLEAR\]/.test(String(c[0])))).toBe(false);
  });
  it('a warning or critical cycle never acknowledges', async () => {
    vi.spyOn(mon, 'generateReport').mockReturnValueOnce(report('warning', 'C')).mockReturnValueOnce(report('critical', 'F'));
    await runFeedIntegrityCheck('auto');
    await runFeedIntegrityCheck('auto');
    expect(m.acknowledgeFeedHealthAlerts).not.toHaveBeenCalled();
  });
});

describe('the check-failed path is throttled through the shared state (Langston Q1)', () => {
  it('a throw mints once; a second throw inside the explicit cooldown mints nothing; a healthy check then clears', async () => {
    const gen = vi.spyOn(mon, 'generateReport');
    gen.mockImplementationOnce(() => { throw new Error('boom'); });
    await expect(runFeedIntegrityCheck('auto')).rejects.toThrow('boom');
    expect(m.createAlert).toHaveBeenCalledTimes(2);
    gen.mockImplementationOnce(() => { throw new Error('boom'); });
    await expect(runFeedIntegrityCheck('auto')).rejects.toThrow('boom');
    expect(m.createAlert).toHaveBeenCalledTimes(2);
    gen.mockReturnValueOnce(report('healthy', 'A'));
    await runFeedIntegrityCheck('auto');
    expect(m.acknowledgeFeedHealthAlerts).toHaveBeenCalledTimes(1);
  });
});

describe('the per-cycle liveness line (Langston C3 — not graded never prints as healthy)', () => {
  it('session segments follow New York time — in daylight time (EDT, UTC-4)', () => {
    expect(sessionSegment(new Date('2026-10-07T13:29:00Z'))).toBe('pre_market'); // 09:29 ET
    expect(sessionSegment(new Date('2026-10-07T13:30:00Z'))).toBe('regular');    // 09:30 ET
    expect(sessionSegment(new Date('2026-10-07T20:00:00Z'))).toBe('after_hours'); // 16:00 ET
    expect(sessionSegment(new Date('2026-10-07T03:00:00Z'))).toBe('overnight');  // 23:00 ET
    expect(sessionSegment(new Date('2026-10-10T15:00:00Z'))).toBe('weekend');    // Saturday
  });
  it('... and after 2026-11-01 in standard time (EST, UTC-5) — where the fixed UTC bounds would have been an hour off', () => {
    expect(sessionSegment(new Date('2026-11-04T13:30:00Z'))).toBe('pre_market'); // 08:30 ET (the old bounds said regular)
    expect(sessionSegment(new Date('2026-11-04T14:30:00Z'))).toBe('regular');    // 09:30 ET
    expect(sessionSegment(new Date('2026-11-04T20:30:00Z'))).toBe('regular');    // 15:30 ET (the old bounds said after_hours)
    expect(sessionSegment(new Date('2026-11-04T21:00:00Z'))).toBe('after_hours'); // 16:00 ET
  });
  it('the weekend is the xStock close, Friday 20:00 ET to Sunday 20:00 ET', () => {
    expect(sessionSegment(new Date('2026-10-16T23:59:00Z'))).toBe('after_hours'); // Fri 19:59 ET
    expect(sessionSegment(new Date('2026-10-17T00:00:00Z'))).toBe('weekend');     // Fri 20:00 ET
    expect(sessionSegment(new Date('2026-10-18T23:59:00Z'))).toBe('weekend');     // Sun 19:59 ET
    expect(sessionSegment(new Date('2026-10-19T00:00:00Z'))).toBe('overnight');   // Sun 20:00 ET
  });
  it('config missing prints not_graded; a class without a threshold prints threshold=absent, not a bare healthy', () => {
    const now = new Date('2026-10-07T03:00:00Z');
    expect(formatLivenessLines({ atMs: 0, configMissing: true, classes: [] }, now)[0]).toMatch(/not_graded=config_missing/);
    const lines = formatLivenessLines({ atMs: 0, configMissing: false, classes: [
      { assetClass: 'crypto_spot', freshestAgeMs: 812, grade: 'healthy', suppressed: false, suppressReason: null, thresholdPresent: true, symbolCount: 460 },
      { assetClass: 'xstock_spot', freshestAgeMs: null, grade: 'healthy', suppressed: true, suppressReason: 'market_closed', thresholdPresent: false, symbolCount: 0 },
    ] }, now);
    expect(lines[0]).toMatch(/class=crypto_spot freshestAgeMs=812 grade=healthy threshold=present .*segment=overnight/);
    expect(lines[1]).toMatch(/class=xstock_spot freshestAgeMs=none grade=healthy threshold=absent suppressed=true suppressReason=market_closed/);
  });
  // Langston 2026-10-10, positive-control ruling condition 1 (leg 1, CAPABILITY): the line objective 3 reads must be shown
  // able to print a non-healthy grade. The grader's own tests prove the grader, not this line.
  it('leg 1: the line prints WARNING and CRITICAL with their real ages, for both classes', () => {
    const now = new Date('2026-10-07T15:00:00Z');
    const lines = formatLivenessLines({ atMs: 0, configMissing: false, classes: [
      { assetClass: 'crypto_spot', freshestAgeMs: 45_000, grade: 'warning', suppressed: false, suppressReason: null, thresholdPresent: true, symbolCount: 460 },
      { assetClass: 'xstock_spot', freshestAgeMs: 900_000, grade: 'critical', suppressed: false, suppressReason: null, thresholdPresent: true, symbolCount: 468 },
      { assetClass: 'crypto_spot', freshestAgeMs: 120_000, grade: 'critical', suppressed: false, suppressReason: null, thresholdPresent: true, symbolCount: 460 },
      { assetClass: 'xstock_spot', freshestAgeMs: 300_000, grade: 'warning', suppressed: false, suppressReason: null, thresholdPresent: true, symbolCount: 468 },
    ] }, now);
    expect(lines[0]).toBe('[FeedIntegrity][liveness] class=crypto_spot freshestAgeMs=45000 grade=warning threshold=present suppressed=false symbols=460 segment=regular');
    expect(lines[1]).toBe('[FeedIntegrity][liveness] class=xstock_spot freshestAgeMs=900000 grade=critical threshold=present suppressed=false symbols=468 segment=regular');
    expect(lines[2]).toMatch(/class=crypto_spot freshestAgeMs=120000 grade=critical threshold=present/);
    expect(lines[3]).toMatch(/class=xstock_spot freshestAgeMs=300000 grade=warning threshold=present/);
    expect(lines.some((l) => /grade=healthy/.test(l))).toBe(false);
  });
});

// Kraken AssetPairs, read 2026-10-07 (1,458 pairs, error []): every admitted online pair whose canonical name differs
// between the old rule (raw base code) and the venue `wsname`, and every pair whose raw wsname differs from our canonical.
const PAIRS: Record<string, { base: string; quote: string; wsname: string; expect: string }> = {
  ZGBPZUSD: { base: 'ZGBP', quote: 'ZUSD', wsname: 'GBP/USD', expect: 'GBP/USD' },
  ZEURZUSD: { base: 'ZEUR', quote: 'ZUSD', wsname: 'EUR/USD', expect: 'EUR/USD' },
  AUDUSD: { base: 'ZAUD', quote: 'ZUSD', wsname: 'AUD/USD', expect: 'AUD/USD' },
  XLTCZUSD: { base: 'XLTC', quote: 'ZUSD', wsname: 'LTC/USD', expect: 'LTC/USD' },
  XETCZUSD: { base: 'XETC', quote: 'ZUSD', wsname: 'ETC/USD', expect: 'ETC/USD' },
  XMLNZUSD: { base: 'XMLN', quote: 'ZUSD', wsname: 'MLN/USD', expect: 'MLN/USD' },
  LTCUSDT: { base: 'XLTC', quote: 'USDT', wsname: 'LTC/USDT', expect: 'LTC/USDT' },
  LTCUSDC: { base: 'XLTC', quote: 'USDC', wsname: 'LTC/USDC', expect: 'LTC/USDC' },
  XXBTZUSD: { base: 'XXBT', quote: 'ZUSD', wsname: 'XBT/USD', expect: 'BTC/USD' },
  XBTUSDT: { base: 'XXBT', quote: 'USDT', wsname: 'XBT/USDT', expect: 'BTC/USDT' },
  XBTUSDC: { base: 'XXBT', quote: 'USDC', wsname: 'XBT/USDC', expect: 'BTC/USDC' },
  XDGUSD: { base: 'XXDG', quote: 'ZUSD', wsname: 'XDG/USD', expect: 'DOGE/USD' },
  XDGUSDT: { base: 'XXDG', quote: 'USDT', wsname: 'XDG/USDT', expect: 'DOGE/USDT' },
  XDGUSDC: { base: 'XXDG', quote: 'USDC', wsname: 'XDG/USDC', expect: 'DOGE/USDC' },
  XETHZUSD: { base: 'XETH', quote: 'ZUSD', wsname: 'ETH/USD', expect: 'ETH/USD' }, // control: always right
};
describe('the recorder names every admitted pair by its venue base (Langston Step-2 C1)', () => {
  it('all 14 + a control come out canonical — none as ZGBP/USD, XLTC/USD, XBT/USD or XDG/USD', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes('/AssetPairs')) {
        return { json: async () => ({ result: Object.fromEntries(Object.entries(PAIRS).map(([k, v]) => [k, { altname: k, base: v.base, quote: v.quote, wsname: v.wsname, status: 'online' }])) }) };
      }
      return { json: async () => ({ result: Object.fromEntries(Object.keys(PAIRS).map((k) => [k, { c: ['100', '1'], v: ['1000', '1000'] }])) }) };
    }) as unknown as typeof fetch;
    const { symbols } = await loadCryptoSpotUniverse({ fetchImpl, minVolumeFloorUsd: 1 });
    expect(symbols).toEqual(Object.values(PAIRS).map((p) => p.expect).sort());
    for (const bad of ['ZGBP/USD', 'ZEUR/USD', 'XLTC/USD', 'XBT/USD', 'XDG/USD']) expect(symbols).not.toContain(bad);
  });
});

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
describe('fences', () => {
  it('the Feed Health card renders OUTSIDE the telemetry gate (Step-7 finding: the gate 500s on a deleted module)', () => {
    const src = read('client/src/pages/ai-transparency.tsx');
    const gateElse = src.indexOf('No telemetry data available');
    const card = src.indexOf('data-testid="card-feed-health"');
    expect(gateElse).toBeGreaterThan(-1);
    expect(card).toBeGreaterThan(gateElse); // after the ternary's else-arm, i.e. outside it
    expect(src.indexOf('</TabsContent>', gateElse)).toBeGreaterThan(card); // still inside the AI Command Center tab
  });
  it('feed_health is prefetched', () => {
    expect(read('server/startup/b72-warmup.ts')).toMatch(/^\s*'feed_health',/m);
  });
  it('the dead alert-id branch and the deleting clean-up are gone', () => {
    expect(read('server/services/feed-integrity-monitor.ts')).not.toMatch(/getActiveAlertId\s*\(|activeAlertId\s*:/);
    expect(read('server/jobs/feed-integrity-auto-check.ts')).not.toMatch(/\.getActiveAlertId\s*\(/); // a CALL; the comment naming it is allowed
    expect(read('server/services/alerts-service.ts')).not.toMatch(/static async cleanupOldFeedAlerts\s*\(/);
  });
});
