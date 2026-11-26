import { describe, expect, it, vi } from 'vitest';
import {
  vtsEquityIncidentCohort, VtsIncidentTradeMap, VtsFeedIncidentWindows, VTS_FEED_INCIDENT_SAMPLE_MS, type VtsFeedIncidentCohort,
} from '../../services/vts-feed-incident-windows.js';
import { VtsIncidentRecoveryWindows } from '../../services/vts-feed-incident-recovery.js';
import type { SelectedXstockUpdate } from '../../asset_classes/xstock_spot/vts-xs-selected-update.js';

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
    lastTransportMs: now, warmedUp: true, members, subscriptionRevision: 0,
  };
}

function observePair(tracker: VtsFeedIncidentWindows, secondLook: string[], options: { skipSamples?: boolean; cohort?: VtsFeedIncidentCohort } = {}) {
  for (let now = 0; now <= 120_000; now += VTS_FEED_INCIDENT_SAMPLE_MS) {
    if (options.skipSamples && now >= 65_000 && now < 80_000) continue;
    tracker.sample(options.cohort ?? common, evidence(now), now);
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
    const feed = evidence(120_000);
    const grade = (cohort = common, current = feed, now = 120_000) => {
      const tracker = new VtsFeedIncidentWindows();
      observePair(tracker, symbols.slice(0, 10));
      return tracker.evidenceAtCrossing(firstSymbol, cohort, current, now);
    };
    expect(grade()).not.toBeNull();
    expect(grade(common, evidence(120_000, { update: symbols[8] }))).toBeNull();
    expect(grade(common, evidence(120_000, { generation: 2 }))).toBeNull();
    expect(grade(common, evidence(120_000, { continuousFromMs: 1 }))).toBeNull();
    expect(grade(common, evidence(120_000, { acknowledged: noReceipt }))).toBeNull();
    expect(grade(common, { ...feed, subscriptionRevision: 2 })).toBeNull();
    expect(grade({ ...common, key: 'different-verified-session' })).toBeNull();
    expect(grade({ ...common, symbols: new Set(symbols) })).toBeNull();
    expect(grade(common, { ...feed, warmedUp: false })).toBeNull();
    expect(grade(common, feed, 135_001)).toBeNull();

    const interrupted = new VtsFeedIncidentWindows();
    observePair(interrupted, symbols.slice(0, 10), { skipSamples: true });
    expect(interrupted.evidenceAtCrossing(firstSymbol, common, feed, 120_000)).toBeNull();
  });

  it('shares one grade across unchanged crossings and rechecks transport, updates and completed windows', () => {
    const tracker = new VtsFeedIncidentWindows();
    observePair(tracker, symbols.slice(0, 10));
    const feed = evidence(120_000);
    const firstGrade = tracker.evidenceAtCrossing(firstSymbol, common, feed, 120_000);
    expect(firstGrade?.qualified).toEqual(symbols.slice(0, 10));
    expect(tracker.evidenceAtCrossing(symbols[1], common, { ...feed, lastTransportMs: 120_001 }, 120_001)).toBe(firstGrade);
    expect(tracker.evidenceAtCrossing(symbols[1], common, { ...feed, continuousFromMs: 120_001 }, 120_001)).toBeNull();
    expect(tracker.evidenceAtCrossing(symbols[1], common, evidence(120_001, { update: firstSymbol }), 120_001)).toBeNull();
    expect(tracker.evidenceAtCrossing(noReceipt, common, feed, 120_001)).toBeNull();
    for (let now = 125_000; now <= 180_000; now += VTS_FEED_INCIDENT_SAMPLE_MS) {
      tracker.sample(common, { ...feed, lastTransportMs: now }, now);
      if (now === 130_000) for (const symbol of symbols.slice(0, 10)) tracker.observeStale(symbol, now);
    }
    const next = tracker.evidenceAtCrossing(firstSymbol, common, { ...feed, lastTransportMs: 180_000 }, 180_000);
    expect(next).not.toBe(firstGrade);
    expect(next).toMatchObject({ startMs: 60_000, endMs: 180_000, qualified: symbols.slice(0, 10) });
  });

  it('rebuilds the monitored symbol set on trade changes and checks the exact session on every read', () => {
    const trades = new VtsIncidentTradeMap<{ assetClass: string; state: string; symbol: string }>();
    const beforeClose = Date.parse('2026-11-28T00:59:59.999Z');
    const atClose = beforeClose + 1;
    const xstock = { assetClass: 'xstock_spot', state: 'open', symbol: firstSymbol };
    trades.set('first', xstock);
    trades.set('sibling', { ...xstock });
    trades.set('pending', { ...xstock, state: 'pending', symbol: symbols[1] });
    const original = trades.incidentCohort(beforeClose);
    expect(original.symbols).toEqual(new Set([firstSymbol]));
    expect(trades.incidentCohort(beforeClose)).toBe(original);
    expect(trades.incidentCohort(atClose)).toEqual({ ...original, key: 'kraken-equities/ticker/known-weekend-closure' });
    expect(trades.incidentCohort(beforeClose)).toBe(original);
    trades.delete('first');
    expect(trades.incidentCohort(beforeClose)).toBe(original);
    trades.set('sibling', { assetClass: 'xstock_spot', state: 'open', symbol: symbols[2] });
    expect(trades.incidentCohort(beforeClose).symbols).toEqual(new Set([symbols[2]]));
    trades.setTradeState('pending', 'open');
    expect(trades.incidentCohort(beforeClose).symbols).toEqual(new Set([symbols[1], symbols[2]]));
    trades.clear();
    expect(trades.incidentCohort(beforeClose).symbols.size).toBe(0);
    expect(original.symbols).toEqual(new Set([firstSymbol]));
  });

  it('starts new windows after the monitored set leaves and returns between samples', () => {
    const trades = new VtsIncidentTradeMap<{ assetClass: string; symbol: string }>();
    for (const symbol of common.symbols) trades.set(symbol, { assetClass: 'xstock_spot', symbol });
    const now = Date.parse('2026-11-27T16:00:00Z');
    const cohort = trades.incidentCohort(now);
    const tracker = new VtsFeedIncidentWindows();
    observePair(tracker, symbols.slice(0, 10), { cohort });
    const feed = evidence(120_000);
    expect(tracker.evidenceAtCrossing(firstSymbol, cohort, feed, 120_000)?.qualified).toHaveLength(10);
    trades.delete(firstSymbol);
    trades.set(firstSymbol, { assetClass: 'xstock_spot', symbol: firstSymbol });
    const restored = trades.incidentCohort(now);
    expect(restored.symbols).toEqual(cohort.symbols);
    expect(tracker.evidenceAtCrossing(firstSymbol, restored, feed, 120_001)).toBeNull();
  });
});

describe('#1191 recovery uses two covered windows and frozen membership', () => {
  const watched = symbols.slice(0, 10);
  const incident = { alertId: 'episode', members: watched.map(symbol => ({ tradeId: `trade:${symbol}`, symbol })) };
  const gapMs = 15_000;
  const feedAt = (nowMs: number, generation = 1) => ({ generation, continuousFromMs: 0, lastTransportMs: nowMs, warmedUp: true });

  function update(index: number, atMs: number): SelectedXstockUpdate {
    return { rowId: String(atMs + index), bootId: 'boot', generation: 1, frameOrdinal: atMs, rowOrdinal: index,
      receivedAtMs: atMs, selectedAtMs: atMs + 1, acceptedAtMs: atMs + 2 };
  }

  function pair(recovery: VtsIncidentRecoveryWindows, startMs: number, first: string[], second: string[], beforeSecond?: () => void) {
    let proof: ReturnType<VtsIncidentRecoveryWindows['sample']> = [];
    for (let offset = 0; offset <= 120_000; offset += VTS_FEED_INCIDENT_SAMPLE_MS) {
      const nowMs = startMs + offset;
      proof = recovery.sample(feedAt(nowMs), nowMs, gapMs);
      if (offset === 10_000) first.forEach((symbol, index) => recovery.observe(symbol, update(index, nowMs)));
      if (offset === 80_000) {
        beforeSecond?.();
        second.forEach((symbol, index) => recovery.observe(symbol, update(index, nowMs)));
      }
    }
    return proof;
  }

  it('requires the same eight symbols twice, rather than two totals of eight', () => {
    const recovery = new VtsIncidentRecoveryWindows();
    recovery.snapshot([incident], 0);
    expect(pair(recovery, 0, watched.slice(0, 8), watched.slice(2))).toEqual([]);
    recovery.snapshot([incident], 125_000);
    const [proof] = pair(recovery, 125_000, watched.slice(0, 8), watched.slice(0, 8));
    expect(proof).toMatchObject({ alertId: incident.alertId, startMs: 125_000, boundaryMs: 185_000, endMs: 245_000,
      members: incident.members, denominator: 10, required: 8, common: watched.slice(0, 8).sort() });
    expect(proof.first.map(([symbol, look]) => [symbol, look.rowId])).toEqual(watched.slice(0, 8).map((symbol, i) => [symbol, String(135_000 + i)]));
    expect(proof.second.map(([symbol, look]) => [symbol, look.rowId])).toEqual(watched.slice(0, 8).map((symbol, i) => [symbol, String(205_000 + i)]));
  });

  it('keeps terminals in the frozen denominator until another attempt and keeps siblings as exact trade IDs', () => {
    const recovery = new VtsIncidentRecoveryWindows();
    const sibling = { tradeId: 'same-symbol-sibling', symbol: watched[0] };
    const withSibling = { ...incident, members: [...incident.members, sibling] };
    const smaller = { ...incident, members: [...incident.members.slice(0, 8), sibling] };
    recovery.snapshot([withSibling], 0);
    expect(pair(recovery, 0, watched.slice(0, 7), watched.slice(0, 7), () => recovery.snapshot([smaller], 80_000))).toEqual([]);
    recovery.snapshot([smaller], 125_000);
    const [proof] = pair(recovery, 125_000, watched.slice(0, 7), watched.slice(0, 7));
    expect(proof).toMatchObject({ denominator: 8, required: 7, members: smaller.members });
    expect(proof.common).toHaveLength(7);
  });

  it('excludes reused source identities, timestamps spanning the boundary, and discontinuous coverage', () => {
    const recovery = new VtsIncidentRecoveryWindows();
    const one = { ...incident, members: incident.members.slice(0, 1) };
    recovery.snapshot([one], 0);
    let result: ReturnType<VtsIncidentRecoveryWindows['sample']> = [];
    for (let ms = 0; ms <= 120_000; ms += VTS_FEED_INCIDENT_SAMPLE_MS) {
      result = recovery.sample(feedAt(ms), ms, gapMs);
      if (ms === 10_000) recovery.observe(watched[0], update(0, ms));
      if (ms === 60_000) recovery.observe(watched[0], { ...update(0, ms - 1), selectedAtMs: ms + 1, acceptedAtMs: ms + 2 });
      if (ms === 80_000) recovery.observe(watched[0], { ...update(1, ms), frameOrdinal: 10_000, rowOrdinal: 0 });
    }
    expect(result).toEqual([]);

    recovery.snapshot([one], 125_000);
    expect(pair(recovery, 125_000, [watched[0]], [watched[0]], () => recovery.sample(feedAt(205_000, 2), 205_000, gapMs))).toEqual([]);
    recovery.snapshot([one], 250_000);
    expect(recovery.sample(feedAt(250_000), 250_000, gapMs)).toEqual([]);
    recovery.observe(watched[0], update(0, 255_000));
    expect(recovery.sample(feedAt(270_000), 270_000, gapMs)).toEqual([]); // invalid gap, even with a current heartbeat
    expect(recovery.sample(feedAt(370_000), 370_000, gapMs)).toEqual([]);
  });
});
