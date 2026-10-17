/**
 * B-FEED-HEALTH-GRADE-ARM (#1123, SPRINT_TO_LIVE_PLAN row 3a) — Step 9, the monitor itself, EXECUTED (not structure):
 *   F-3  the monitor counts completed reconnects from the adapter's monotonic counter (it read a counter that resets on
 *        every open, so it almost never saw one);
 *   F-1  the status no longer locks itself at critical: one connection term — completed reconnects over the ring once it is
 *        ready, over the latest interval while it warms — against 3 / 5; latency grades nothing;
 *   F-2  the xStock leg comes from the equities recorder with its class asserted, and reads recorder_warming while cold.
 * Langston's Step-9 r1-r4 rulings, `Langston Design Asks/B_FEED_HEALTH_GRADE_ARM_STEP9_R1_DESIGN.md`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const st = vi.hoisted(() => ({
  reconnectsCompleted: 0,
  reconnectAttempts: 0, // the counter the old code read: reset to 0 on every open
  heartbeatMs: 1001,
  crypto: [{ symbol: 'BTC/USD', ageMs: 300 }] as { symbol: string; ageMs: number | null }[],
  recorderWarm: true,
  recorder: [{ symbol: 'AAPL/USD', ageMs: 2_000 }] as { symbol: string; ageMs: number }[],
}));
vi.mock('../../exchanges/kraken/kraken-websocket-adapter.js', () => ({
  krakenWebSocketAdapter: {
    getStatus: () => ({ isConnected: true, isConnecting: false, subscribedCount: 1, pendingCount: 0,
      reconnectAttempts: st.reconnectAttempts, reconnectsCompleted: st.reconnectsCompleted, healthy: true }),
    getI8EWsHealth: () => st.crypto,
    getHealthMetrics: () => ({ avgHeartbeatLatency: st.heartbeatMs }),
  },
}));
vi.mock('../../services/passive-archive/equity-spot-archiver.js', () => ({
  getEquityTickerUpdateAges: () => st.recorder,
  isEquityTickingCountWarm: () => st.recorderWarm,
}));
const CFG: Record<string, number> = {
  'crypto_spot:warning_age_ms': 5_000, 'crypto_spot:critical_age_ms': 10_000,
  'xstock_spot:warning_age_ms': 60_000, 'xstock_spot:critical_age_ms': 120_000, 'xstock_spot:warmup_grace_ms': 0,
};
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: (_m: string, name: string, ctx: { assetClass: string }) => {
    const v = CFG[`${ctx.assetClass}:${name}`];
    if (v === undefined) throw new Error(`no ${name} for ${ctx.assetClass}`);
    return v;
  },
}));

import { FeedIntegrityMonitorService } from '../../services/feed-integrity-monitor';

const WED_OPEN = new Date('2026-10-14T15:00:00Z'); // Wednesday 11:00 ET — xStock open
const FIVE_MIN = 5 * 60_000;
let mon: FeedIntegrityMonitorService;
/** One cycle: `n` completed reconnects since the last one, then a snapshot five minutes on. */
function cycle(n = 0) {
  st.reconnectsCompleted += n;
  vi.setSystemTime(new Date(Date.now() + FIVE_MIN));
  mon.recordSnapshot();
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(WED_OPEN);
  Object.assign(st, { reconnectsCompleted: 0, reconnectAttempts: 0, heartbeatMs: 1001, recorderWarm: true,
    crypto: [{ symbol: 'BTC/USD', ageMs: 300 }], recorder: [{ symbol: 'AAPL/USD', ageMs: 2_000 }] });
  mon = new FeedIntegrityMonitorService();
  mon.recordSnapshot(); // baseline
});
afterEach(() => vi.useRealTimers());

describe('F-3: completed reconnects are counted from the monotonic counter', () => {
  it('a drop that recovers inside one interval counts 1 (the reset-on-open counter read 0 here)', () => {
    // What the adapter's old counter looked like at snapshot time: back to 0 after the successful open.
    st.reconnectAttempts = 0;
    cycle(1);
    const h = mon.getHealthHistory();
    expect(h[h.length - 1].reconnectsSinceLastCheck).toBe(1);
  });
  it('the first snapshot sets a baseline and counts nothing it did not see', () => {
    st.reconnectsCompleted = 7;
    const fresh = new FeedIntegrityMonitorService();
    fresh.recordSnapshot();
    expect(fresh.getHealthHistory()[0].reconnectsSinceLastCheck).toBe(0);
  });
});

describe('F-1: the status follows the connection — it does not lock', () => {
  it('a clean hour of snapshots grades healthy (the cumulative-uptime status locked itself at critical here)', () => {
    for (let i = 0; i < 12; i++) cycle(0);
    const r = mon.generateReport();
    expect(r.metrics.status).toBe('healthy');
    expect(r.metrics.uptimePercent).toBe(100);
    expect(r.metrics.reconnectBasis).toBe('ring');
    expect(r.overallGrade).toBe('A');
  });
  it('ring ready: 2 reconnects in the window → healthy, 3 → warning, 5 → critical (12 samples)', () => {
    for (let i = 0; i < 11; i++) cycle(0);
    cycle(2);
    expect(mon.generateReport().metrics.status).toBe('healthy');
    cycle(1);
    expect(mon.generateReport().metrics.status).toBe('warning');
    cycle(2);
    const r = mon.generateReport();
    expect(r.metrics.status).toBe('critical');
    expect(r.metrics.reconnectCount).toBe(5);
  });
  it('the same bars at 6 samples (the ring has just become ready)', () => {
    for (let i = 0; i < 4; i++) cycle(0);
    cycle(3); // 6 snapshots incl. the baseline
    const r = mon.generateReport();
    expect(r.metrics.reconnectBasis).toBe('ring');
    expect(r.metrics.status).toBe('warning');
  });
  it('WARMING (BLOCKER-1): a burst of 5 in one interval with < 6 samples grades critical on the interval count', () => {
    cycle(5);
    const r = mon.generateReport();
    expect(r.metrics.reconnectBasis).toBe('interval');
    expect(r.metrics.uptimePercent).toBeNull();
    expect(r.metrics.status).toBe('critical');
  });
  it('ready + the same burst: the ring alone counts it — 5, not 10 (no double count)', () => {
    for (let i = 0; i < 11; i++) cycle(0);
    cycle(5);
    const r = mon.generateReport();
    expect(r.metrics.reconnectCount).toBe(5);
    expect(r.metrics.status).toBe('critical');
  });
  it('warming never prints a number for uptime', () => {
    cycle(0);
    const r = mon.generateReport();
    expect(r.metrics.uptimePercent).toBeNull();
    expect(r.summary.join('\n')).toMatch(/Connection uptime: warming up \(2\/6 snapshots\)/);
  });
  it('latency grades nothing: a 6 s heartbeat interval leaves the status healthy and the grade A', () => {
    st.heartbeatMs = 6_000;
    for (let i = 0; i < 12; i++) cycle(0);
    const r = mon.generateReport();
    expect(r.metrics.status).toBe('healthy');
    expect(r.overallGrade).toBe('A');
    expect(r.issues.some((i) => /atency/.test(i))).toBe(false);
  });
  it('the grade says what one reconnect costs: 1 in a 12-sample ring = 91.67 % ⇒ C', () => {
    for (let i = 0; i < 11; i++) cycle(0);
    cycle(1);
    const r = mon.generateReport();
    expect(r.metrics.uptimePercent).toBeCloseTo(91.67, 2);
    expect(r.overallGrade).toBe('C');
  });
  it('the ring publishes its real span, so a stalled scheduler cannot widen the "hour" silently', () => {
    for (let i = 0; i < 5; i++) cycle(0);
    vi.setSystemTime(new Date(Date.now() + 40 * 60_000)); // a 40-minute stall
    mon.recordSnapshot();
    const r = mon.generateReport();
    expect(r.metrics.ringSpanMs).toBe(5 * FIVE_MIN + 40 * 60_000);
  });
});

describe('freshness is graded per class on its own thresholds (found in implementation — not a fixed seconds bar)', () => {
  it('an xStock quote 15 s old is healthy for xStock: grade A, no data-age issue', () => {
    st.recorder = [{ symbol: 'AAPL/USD', ageMs: 15_000 }];
    for (let i = 0; i < 12; i++) cycle(0);
    const r = mon.generateReport();
    expect(r.overallGrade).toBe('A');
    expect(r.issues).toEqual([]);
  });
  it('a crypto tick 7 s old (past its 5 s warning) caps the grade at C and names the class', () => {
    st.crypto = [{ symbol: 'BTC/USD', ageMs: 7_000 }];
    for (let i = 0; i < 12; i++) cycle(0);
    const r = mon.generateReport();
    expect(r.metrics.status).toBe('warning');
    expect(r.overallGrade).toBe('C');
    expect(r.issues).toContain('Warning: crypto_spot freshest tick 7s old');
  });
});

describe('F-2: the xStock leg from the recorder', () => {
  it('a cold recorder reads recorder_warming, never market_closed', () => {
    st.recorderWarm = false;
    mon.recordSnapshot();
    const x = mon.getLastLiveness()!.classes.find((c) => c.assetClass === 'xstock_spot')!;
    expect(x.suppressReason).toBe('recorder_warming');
  });
  it('warm and stale in session → graded (critical past 120 s)', () => {
    st.recorder = [{ symbol: 'AAPL/USD', ageMs: 150_000 }];
    mon.recordSnapshot();
    const x = mon.getLastLiveness()!.classes.find((c) => c.assetClass === 'xstock_spot')!;
    expect(x.suppressed).toBe(false);
    expect(x.grade).toBe('critical');
  });
  it('a collision ticker fed from the recorder (STX/USD) is counted as xStock, not crypto', () => {
    st.recorder = [{ symbol: 'STX/USD', ageMs: 1_000 }];
    mon.recordSnapshot();
    const cls = mon.getLastLiveness()!.classes;
    expect(cls.find((c) => c.assetClass === 'xstock_spot')!.symbolCount).toBe(1);
    expect(cls.find((c) => c.assetClass === 'crypto_spot')!.symbolCount).toBe(1); // BTC/USD only
  });
  it('a closed market (Saturday) with a warm recorder reads market_closed', () => {
    vi.setSystemTime(new Date('2026-10-17T15:00:00Z'));
    mon.recordSnapshot();
    expect(mon.getLastLiveness()!.classes.find((c) => c.assetClass === 'xstock_spot')!.suppressReason).toBe('market_closed');
  });
});
