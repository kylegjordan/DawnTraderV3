import { describe, expect, it, vi } from 'vitest';
import {
  vtsEquityIncidentCohort, VtsFeedIncidentWindows, VTS_FEED_INCIDENT_SAMPLE_MS,
} from '../../services/vts-feed-incident-windows.js';

vi.mock('../../services/passive-archive/equity-spot-archiver.js', () => ({
  EQUITY_TICKER_MAX_TRANSPORT_GAP_MS: 15_000,
}));

const symbols = Array.from({ length: 12 }, (_, index) => `XS${index}/USD`);
const [firstSymbol] = symbols;
const noReceipt = 'NO-ACK/USD';
const common = { key: 'kraken-equities/ticker/verified-common-session', symbols: new Set([...symbols, noReceipt]) };

function evidence(now: number, changes: { generation?: number; continuousFromMs?: number; update?: string; acknowledged?: string } = {}) {
  const members = new Map(symbols.map(symbol => [symbol, {
    acknowledgedAtMs: 0, updatedAtMs: changes.update === symbol ? now : null,
  }]));
  if (changes.acknowledged) members.set(changes.acknowledged, { acknowledgedAtMs: now, updatedAtMs: null });
  return {
    generation: changes.generation ?? 1, continuousFromMs: changes.continuousFromMs ?? 0,
    lastTransportMs: now, warmedUp: true, members,
  };
}

function observePair(tracker: VtsFeedIncidentWindows, secondLook: string[], options: { skipSamples?: boolean } = {}) {
  for (let now = 0; now <= 120_000; now += VTS_FEED_INCIDENT_SAMPLE_MS) {
    if (options.skipSamples && now >= 65_000 && now < 80_000) continue;
    tracker.sample(common, evidence(now), now);
    const looks = now === 10_000 ? symbols.slice(0, 10) : now === 80_000 ? secondLook : [];
    for (const symbol of looks) tracker.observeStale(symbol, now);
  }
}

describe('#1191 covered VTS feed-incident windows', () => {
  it('keeps the four unverified endpoint aliases out of the common cohort', () => {
    const monitored = [firstSymbol, 'AAPL/USD', 'HOOD/USD', 'MSTR/USD', 'SPY/USD'];
    const eligible = vtsEquityIncidentCohort(monitored, false);
    const closed = vtsEquityIncidentCohort(monitored, true);
    expect(eligible).toEqual({ key: 'kraken-equities/ticker/common-session', symbols: new Set([firstSymbol]) });
    expect(closed.key).toBe('kraken-equities/ticker/known-weekend-closure');
    expect(closed.symbols).toEqual(eligible.symbols);
  });

  it('requires the same ten subscribed symbols in both windows and leaves an unacknowledged symbol independent', () => {
    const tracker = new VtsFeedIncidentWindows();
    observePair(tracker, symbols.slice(0, 10));
    const feed = evidence(120_000);
    expect(tracker.evidenceAtCrossing(firstSymbol, common, feed, 120_000)).toMatchObject({
      subscribed: 12, qualified: symbols.slice(0, 10), startMs: 0, endMs: 120_000, missing: [noReceipt],
    });
    expect(tracker.evidenceAtCrossing(noReceipt, common, feed, 120_000)).toBeNull();
    expect(tracker.evidenceAtCrossing(symbols[11], common, feed, 120_000)).toBeNull();

    const overlap = new VtsFeedIncidentWindows();
    observePair(overlap, symbols.slice(2));
    expect(overlap.evidenceAtCrossing(symbols[2], common, feed, 120_000)).toBeNull();
  });

  it('keeps the per-trade path when clocks, membership or current-socket evidence change', () => {
    const tracker = new VtsFeedIncidentWindows();
    observePair(tracker, symbols.slice(0, 10));
    const feed = evidence(120_000);
    const grade = (cohort = common, current = feed, now = 120_000) =>
      tracker.evidenceAtCrossing(firstSymbol, cohort, current, now);
    expect(grade()).not.toBeNull();
    expect(grade(common, evidence(120_000, { update: symbols[8] }))).toBeNull();
    expect(grade(common, evidence(120_000, { generation: 2 }))).toBeNull();
    expect(grade(common, evidence(120_000, { continuousFromMs: 1 }))).toBeNull();
    expect(grade(common, evidence(120_000, { acknowledged: noReceipt }))).toBeNull();
    expect(grade({ ...common, key: 'different-verified-session' })).toBeNull();
    expect(grade({ ...common, symbols: new Set(symbols) })).toBeNull();
    expect(grade(common, { ...feed, warmedUp: false })).toBeNull();
    expect(grade(common, feed, 135_001)).toBeNull();

    const interrupted = new VtsFeedIncidentWindows();
    observePair(interrupted, symbols.slice(0, 10), { skipSamples: true });
    expect(interrupted.evidenceAtCrossing(firstSymbol, common, feed, 120_000)).toBeNull();
  });
});
