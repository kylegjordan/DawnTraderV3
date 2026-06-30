import { describe, it, expect } from 'vitest';
import {
  freshestSymbolAgeMs,
  proportionFresh,
  gradeFeedAliveness,
  assessWsReadiness,
  computeRollingWindowReadiness,
  gradePerClassFeedLiveness,
  type SymbolFreshness,
  type PerClassLivenessOpts,
} from '../../services/market-data/feed-health-aggregate';

const s = (symbol: string, ageMs: number | null): SymbolFreshness => ({ symbol, ageMs });

describe('P19-B6.7 feed-health-aggregate — freshestSymbolAgeMs (ALARM aggregate)', () => {
  it('returns the minimum ageMs across symbols that have ticked', () => {
    expect(freshestSymbolAgeMs([s('A', 5000), s('B', 800), s('C', 30000)])).toBe(800);
  });

  it('skips never-ticked (null) symbols when others have ticked', () => {
    expect(freshestSymbolAgeMs([s('A', null), s('B', 1200), s('C', null)])).toBe(1200);
  });

  it('returns null when NO symbol has ticked (feed silent / no data)', () => {
    expect(freshestSymbolAgeMs([s('A', null), s('B', null)])).toBeNull();
    expect(freshestSymbolAgeMs([])).toBeNull();
  });

  // The inverse-of-the-bug guard: ONE legitimately-quiet illiquid symbol must NOT
  // drag the feed-level signal to "stale" while other symbols are ticking fresh.
  it('one quiet illiquid symbol does NOT mask a healthy feed (freshest stays fresh)', () => {
    const ageMs = freshestSymbolAgeMs([s('ILLIQUID', 45000), s('BTC/USD', 600), s('ETH/USD', 900)]);
    expect(ageMs).toBe(600); // freshest is the lively pair → feed reads alive
  });
});

describe('P19-B6.7 feed-health-aggregate — gradeFeedAliveness (ALARM grade, 2 thresholds, 1 aggregate)', () => {
  const warn = 5000;
  const crit = 10000;

  it('(silent) fresh feed → healthy', () => {
    expect(gradeFeedAliveness(800, warn, crit)).toBe('healthy');
  });

  it('warning band → warning', () => {
    expect(gradeFeedAliveness(6000, warn, crit)).toBe('warning');
  });

  it('(positive) feed dead / freshest past critical → critical', () => {
    expect(gradeFeedAliveness(12000, warn, crit)).toBe('critical');
  });

  it('(positive) NO symbol ticked at all (null) → critical-eligible', () => {
    expect(gradeFeedAliveness(null, warn, crit)).toBe('critical');
  });

  // (negative) one quiet illiquid symbol while others tick → freshest is fresh → NOT critical.
  it('(negative) one quiet symbol + others fresh → healthy, NOT critical', () => {
    const freshest = freshestSymbolAgeMs([s('ILLIQUID', 60000), s('BTC/USD', 700)]);
    expect(gradeFeedAliveness(freshest, warn, crit)).toBe('healthy');
  });

  it('thresholds are inclusive at the critical boundary', () => {
    expect(gradeFeedAliveness(10000, warn, crit)).toBe('critical');
    expect(gradeFeedAliveness(9999, warn, crit)).toBe('warning');
  });
});

describe('P19-B6.7 feed-health-aggregate — proportionFresh (GO-LIVE GATE aggregate, conservative)', () => {
  it('fraction of the set that is fresh within threshold', () => {
    const items = [s('A', 500), s('B', 800), s('C', 30000), s('D', 600)];
    expect(proportionFresh(items, 2000)).toBe(0.75); // 3 of 4 fresh
  });

  it('never-ticked (null) symbols count as NOT fresh', () => {
    expect(proportionFresh([s('A', 500), s('B', null)], 2000)).toBe(0.5);
  });

  // Conservative for a go-live gate: an empty / unknown set is "not ready" (0), never PASS.
  it('empty set returns 0 (vacuously not-ready, never false-PASS)', () => {
    expect(proportionFresh([], 2000)).toBe(0);
  });

  // The gate must NOT pass off one lively symbol when most of the set is stale.
  it('one fresh symbol among many stale → low proportion (gate would block)', () => {
    const items = [s('A', 600), s('B', 40000), s('C', 50000), s('D', 60000)];
    expect(proportionFresh(items, 2000)).toBe(0.25);
  });
});

describe('P19-B6.7 / B6.9 feed-health-aggregate — assessWsReadiness (parity-gate, BOTH directions)', () => {
  // P19-B6.9 (#398): opts no longer carries simulationDurationMs; uptime is the rolling-window
  // value (windowedUptimePercent) passed in by the caller from feedIntegrityMonitor.
  const opts = {
    minWsUptimePercent: 99,
    freshTickMaxMs: 10_000,
    minSymbolsFreshPercent: 80,
  };

  it('PASSES on a healthy primary feed (connected, windowed uptime 100, all symbols fresh)', () => {
    const r = assessWsReadiness(
      { isConnected: true, windowedUptimePercent: 100 },
      [s('BTC/USD', 600), s('ETH/USD', 900), s('SOL/USD', 1200)],
      opts,
    );
    expect(r.passed).toBe(true);
    expect(r.uptimePercent).toBe(100);
    expect(r.freshPercent).toBe(100);
    expect(r.warmingUp).toBe(false);
  });

  // P19-B6.9 (#398) REGRESSION — the failure the rolling window fixes: a long-lived process can
  // have huge LIFETIME reconnects yet a perfectly clean RECENT window. The old cumulative formula
  // spuriously failed the go-live gate; with the rolling-window uptime (100 here), it must PASS.
  it('PASSES with a clean recent window despite high lifetime reconnects (#398 fix)', () => {
    const r = assessWsReadiness(
      { isConnected: true, windowedUptimePercent: 100 }, // rolling 1h: 0 recent reconnects
      [s('BTC/USD', 600), s('ETH/USD', 900), s('SOL/USD', 1200)],
      opts,
    );
    expect(r.passed).toBe(true);
    expect(r.uptimePercent).toBe(100);
  });

  // P19-B6.9 (#398): warming up — too few recent samples → windowedUptimePercent null →
  // fail-closed (do NOT clear go-live on an unknown feed), surfaced via warmingUp.
  it('BLOCKS (fail-closed) when warming up — windowed uptime null (insufficient recent samples)', () => {
    const r = assessWsReadiness(
      { isConnected: true, windowedUptimePercent: null },
      [s('BTC/USD', 600), s('ETH/USD', 900), s('SOL/USD', 1200)],
      opts,
    );
    expect(r.passed).toBe(false);
    expect(r.warmingUp).toBe(true);
    expect(r.uptimePercent).toBeNull();
  });

  // P19-B6.9: a rolling-window uptime below the floor → blocks (recent instability caught).
  it('BLOCKS when the rolling-window uptime is below the floor', () => {
    const r = assessWsReadiness(
      { isConnected: true, windowedUptimePercent: 80 },
      [s('BTC/USD', 600), s('ETH/USD', 900), s('SOL/USD', 1200)],
      opts,
    );
    expect(r.passed).toBe(false);
    expect(r.warmingUp).toBe(false);
  });

  // THE dead-feed scenario: the removed 2nd WS stayed TCP-connected while delivering
  // zero ticks. Connected-but-stale MUST BLOCK (the false-PASS B6.7 killed).
  it('BLOCKS when connected but NO symbol is delivering fresh ticks (the dead-feed false-PASS)', () => {
    const r = assessWsReadiness(
      { isConnected: true, windowedUptimePercent: 100 },
      [s('BTC/USD', 45000), s('ETH/USD', 60000), s('SOL/USD', null)],
      opts,
    );
    expect(r.passed).toBe(false);
    expect(r.freshPercent).toBe(0);
  });

  it('BLOCKS when disconnected (uptime 0)', () => {
    const r = assessWsReadiness(
      { isConnected: false, windowedUptimePercent: 100 },
      [s('BTC/USD', 600)],
      opts,
    );
    expect(r.passed).toBe(false);
    expect(r.uptimePercent).toBe(0);
  });

  it('BLOCKS when only a minority of symbols are fresh (below the conservative proportion floor)', () => {
    const r = assessWsReadiness(
      { isConnected: true, windowedUptimePercent: 100 },
      [s('A', 600), s('B', 40000), s('C', 50000), s('D', 60000)], // 25% fresh < 80%
      opts,
    );
    expect(r.passed).toBe(false);
    expect(r.freshPercent).toBe(25);
  });
});

describe('P19-B6.7 feed-health-aggregate — gradePerClassFeedLiveness (ALARM, OBJ-3 matrix)', () => {
  // crypto symbols start XBT/ETH..., xStock symbols end in "x/USD" in this stub classifier.
  const classify = (sym: string): string => (/x\/USD$/.test(sym) ? 'xstock_spot' : 'crypto_spot');
  const thresholds = {
    crypto_spot: { warningMs: 5000, criticalMs: 10000 },
    xstock_spot: { warningMs: 60000, criticalMs: 120000 },
  };
  const base = (over: Partial<PerClassLivenessOpts> = {}): PerClassLivenessOpts => ({
    classify,
    thresholds,
    xstockClassKey: 'xstock_spot',
    isXstockSymbolOpen: () => true,
    xstockWarmupRemainingMs: 0,
    ...over,
  });

  it('(silent) all symbols fresh → overall healthy', () => {
    const r = gradePerClassFeedLiveness([s('XBT/USD', 600), s('ETH/USD', 900), s('AAPLx/USD', 1500)], base());
    expect(r.overall).toBe('healthy');
  });

  it('(positive) crypto feed dead (all crypto stale) → overall critical', () => {
    const r = gradePerClassFeedLiveness([s('XBT/USD', 30000), s('ETH/USD', 45000)], base());
    expect(r.overall).toBe('critical');
  });

  it('(negative) one quiet illiquid crypto symbol + others fresh → healthy (freshest, not worst-case)', () => {
    const r = gradePerClassFeedLiveness([s('ILLIQ/USD', 60000), s('XBT/USD', 700)], base());
    expect(r.overall).toBe('healthy');
  });

  it('xStock market CLOSED (all xStock symbols closed) → xStock SUPPRESSED (market_closed), overall not critical', () => {
    const r = gradePerClassFeedLiveness(
      [s('XBT/USD', 700), s('AAPLx/USD', 9_000_000), s('TSLAx/USD', 9_000_000)],
      base({ isXstockSymbolOpen: () => false }),
    );
    const xs = r.classes.find((c) => c.assetClass === 'xstock_spot')!;
    expect(xs.suppressed).toBe(true);
    expect(xs.suppressReason).toBe('market_closed');
    expect(r.overall).toBe('healthy'); // crypto fresh; xStock legitimately quiet
  });

  it('half-day: only OPEN xStock symbols are graded (per-symbol gate)', () => {
    const openOnly = (sym: string) => sym === 'AAPLx/USD'; // TSLAx closed (half-day)
    const r = gradePerClassFeedLiveness(
      [s('AAPLx/USD', 1500), s('TSLAx/USD', 9_000_000)],
      base({ isXstockSymbolOpen: openOnly }),
    );
    const xs = r.classes.find((c) => c.assetClass === 'xstock_spot')!;
    expect(xs.suppressed).toBe(false);
    expect(xs.symbolCount).toBe(1);       // only the open symbol counted
    expect(xs.grade).toBe('healthy');     // and it is fresh
  });

  it('(positive) xStock OPEN + dead, past warmup → critical', () => {
    const r = gradePerClassFeedLiveness(
      [s('AAPLx/USD', 200000)],
      base({ isXstockSymbolOpen: () => true, xstockWarmupRemainingMs: 0 }),
    );
    expect(r.overall).toBe('critical');
  });

  it('(reopen grace) xStock just reopened, stale-at-close age, WITHIN warmup → suppressed, NOT critical', () => {
    const r = gradePerClassFeedLiveness(
      [s('AAPLx/USD', 9_000_000)], // hours since last close
      base({ isXstockSymbolOpen: () => true, xstockWarmupRemainingMs: 120000 }),
    );
    const xs = r.classes.find((c) => c.assetClass === 'xstock_spot')!;
    expect(xs.suppressed).toBe(true);
    expect(xs.suppressReason).toBe('warmup_grace');
    expect(r.overall).toBe('healthy');
  });

  it('(reopen grace expired) still stale after grace → critical', () => {
    const r = gradePerClassFeedLiveness(
      [s('AAPLx/USD', 9_000_000)],
      base({ isXstockSymbolOpen: () => true, xstockWarmupRemainingMs: 0 }),
    );
    expect(r.overall).toBe('critical');
  });

  it('mixed: crypto healthy + xStock open-and-dead → overall critical (worst non-suppressed class)', () => {
    const r = gradePerClassFeedLiveness(
      [s('XBT/USD', 700), s('AAPLx/USD', 200000)],
      base({ isXstockSymbolOpen: () => true }),
    );
    expect(r.overall).toBe('critical');
  });
});

describe('P19-B6.9 (#398) — computeRollingWindowReadiness (rolling-window WS uptime)', () => {
  const MIN = 6; // matches feed-integrity-monitor.MIN_READINESS_SAMPLES

  it('full clean window (12 snapshots, 0 reconnects) → 100% uptime, ready', () => {
    const r = computeRollingWindowReadiness(new Array(12).fill(0), MIN);
    expect(r.ready).toBe(true);
    expect(r.uptimePercent).toBe(100);
    expect(r.samplesPresent).toBe(12);
    expect(r.windowReconnects).toBe(0);
  });

  it('DENOMINATOR is samples-present, NOT since-boot: 1 reconnect over 12 present → 91.7%', () => {
    const ring = [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]; // 12 present, 1 reconnect
    const r = computeRollingWindowReadiness(ring, MIN);
    expect(r.samplesPresent).toBe(12);
    expect(r.windowReconnects).toBe(1);
    expect(r.uptimePercent).toBeCloseTo((1 - 1 / 12) * 100, 5);
  });

  it('SELF-HEAL: a bad window aged down to a clean 8-sample window → 100% (old reconnects rolled off)', () => {
    // The bad snapshots have shifted out of the ring; only clean recent intervals remain.
    const r = computeRollingWindowReadiness([0, 0, 0, 0, 0, 0, 0, 0], MIN);
    expect(r.ready).toBe(true);
    expect(r.uptimePercent).toBe(100);
  });

  it('MIN-SAMPLE FLOOR (fail-closed warm-up): < MIN samples → ready:false, uptimePercent:null', () => {
    const r = computeRollingWindowReadiness([0, 0], MIN); // only 2 present
    expect(r.ready).toBe(false);
    expect(r.uptimePercent).toBeNull();
    expect(r.samplesPresent).toBe(2);
  });

  it('cold start (empty ring) → warm-up (ready:false, null)', () => {
    const r = computeRollingWindowReadiness([], MIN);
    expect(r.ready).toBe(false);
    expect(r.uptimePercent).toBeNull();
  });

  it('heavy recent instability (≥1 reconnect/interval avg) → clamped to 0%, not negative', () => {
    const r = computeRollingWindowReadiness([2, 1, 3, 1, 2, 1, 1, 1], MIN); // Σ12 over 8
    expect(r.uptimePercent).toBe(0);
    expect(r.ready).toBe(true); // ready to JUDGE (enough samples); the gate then blocks on 0% < floor
  });

  it('at exactly MIN samples it computes (boundary inclusive)', () => {
    const r = computeRollingWindowReadiness(new Array(MIN).fill(0), MIN);
    expect(r.ready).toBe(true);
    expect(r.uptimePercent).toBe(100);
  });
});
