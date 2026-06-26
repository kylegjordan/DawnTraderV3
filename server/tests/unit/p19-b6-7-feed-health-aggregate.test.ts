import { describe, it, expect } from 'vitest';
import {
  freshestSymbolAgeMs,
  proportionFresh,
  gradeFeedAliveness,
  assessWsReadiness,
  type SymbolFreshness,
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

describe('P19-B6.7 feed-health-aggregate — assessWsReadiness (parity-gate, BOTH directions)', () => {
  const opts = {
    simulationDurationMs: 600_000,
    minWsUptimePercent: 99,
    freshTickMaxMs: 10_000,
    minSymbolsFreshPercent: 80,
  };

  it('PASSES on a healthy primary feed (connected, no reconnects, all symbols fresh)', () => {
    const r = assessWsReadiness(
      { isConnected: true, reconnectAttempts: 0 },
      [s('BTC/USD', 600), s('ETH/USD', 900), s('SOL/USD', 1200)],
      opts,
    );
    expect(r.passed).toBe(true);
    expect(r.uptimePercent).toBe(100);
    expect(r.freshPercent).toBe(100);
  });

  // THE dead-feed scenario: the removed 2nd WS stayed TCP-connected while delivering
  // zero ticks. Connected-but-stale MUST now BLOCK (the false-PASS this batch kills).
  it('BLOCKS when connected but NO symbol is delivering fresh ticks (the dead-feed false-PASS)', () => {
    const r = assessWsReadiness(
      { isConnected: true, reconnectAttempts: 0 },
      [s('BTC/USD', 45000), s('ETH/USD', 60000), s('SOL/USD', null)],
      opts,
    );
    expect(r.passed).toBe(false);
    expect(r.freshPercent).toBe(0);
  });

  it('BLOCKS when disconnected (uptime 0)', () => {
    const r = assessWsReadiness(
      { isConnected: false, reconnectAttempts: 0 },
      [s('BTC/USD', 600)],
      opts,
    );
    expect(r.passed).toBe(false);
    expect(r.uptimePercent).toBe(0);
  });

  it('BLOCKS when only a minority of symbols are fresh (below the conservative proportion floor)', () => {
    const r = assessWsReadiness(
      { isConnected: true, reconnectAttempts: 0 },
      [s('A', 600), s('B', 40000), s('C', 50000), s('D', 60000)], // 25% fresh < 80%
      opts,
    );
    expect(r.passed).toBe(false);
    expect(r.freshPercent).toBe(25);
  });
});
