/**
 * B-EPOCH-KEYING-PARITY — FENCE
 *
 * ⛔ WHAT THIS EXISTS TO STOP, stated as the incident rather than as a principle:
 * B-OBSERVATION-EPOCH DECIDED both-leg keying, argued it in its scope §4, and pinned it with four
 * tests. It then shipped the rule into ONE reader. MEASURED on staging 2026-08-24, all three
 * figures on ONE card at ONE moment:
 *
 *     Earnings 24h/7d/30d   -$4.91  over  6 trades   <- computeRollingEarnings  (both-leg)
 *     Lifetime Net P/L      +$5.76  over 13 trades   <- getLifetimeScoreboard   (close-keyed)
 *     Win rate 66.7%                over  9 trades   <- trades/analytics 24h    (unscoped)
 *
 * Three answers to one question, each looking authoritative — the exact failure that scope says
 * the batch exists to prevent. The four passing tests could not catch it because they tested the
 * FUNCTION, not the PARITY: every reader has to reach the same verdict on the same trade.
 *
 * ⇒ THIS FENCE TESTS THE SHARED PREDICATE, and the production readers all call it. A reader that
 * re-inlines its own copy of the rule is exactly what regressed, so keep it exported and shared.
 */
import { describe, it, expect } from 'vitest';
import { isInObservationEpoch, clampWindowToEpoch, computeRollingEarnings } from '../../services/dashboard-metrics.js';

const EPOCH = new Date('2026-08-22T22:01:00Z');
const before = '2026-08-21T12:00:00Z';
const after  = '2026-08-23T12:00:00Z';

describe('B-EPOCH-KEYING-PARITY — the both-leg rule', () => {
  it('counts a trade with BOTH legs after the epoch', () => {
    expect(isInObservationEpoch({ openedAt: after, closedAt: after, pnl: 1 }, EPOCH)).toBe(true);
  });

  it('★ EXCLUDES a STRADDLER — opened before, closed after. This is the whole point.', () => {
    // Its entry price was taken through the contaminated mini-book (#741), so it is not
    // "properly traded with the right pricing data". Close-keyed logic wrongly admits it —
    // that single row is the difference between +$5.76 and -$4.91 on the live card.
    expect(isInObservationEpoch({ openedAt: before, closedAt: after, pnl: 99 }, EPOCH)).toBe(false);
  });

  it('excludes a trade closed before the epoch', () => {
    expect(isInObservationEpoch({ openedAt: before, closedAt: before, pnl: 1 }, EPOCH)).toBe(false);
  });

  it('FAILS CLOSED on an unplaceable trade (no openedAt) — absent is not a pass', () => {
    expect(isInObservationEpoch({ closedAt: after, pnl: 1 }, EPOCH)).toBe(false);
    expect(isInObservationEpoch({ openedAt: null, closedAt: after, pnl: 1 }, EPOCH)).toBe(false);
  });

  it('OBJ-5: with NO epoch, everything counts — including a row with no openedAt', () => {
    // Guarding this matters: the naive SQL form (opened_at >= -infinity) would have DROPPED
    // null-openedAt rows and silently changed the no-epoch behaviour the batch promised to leave.
    expect(isInObservationEpoch({ closedAt: before, pnl: 1 }, null)).toBe(true);
    expect(isInObservationEpoch({ openedAt: before, closedAt: before, pnl: 1 }, null)).toBe(true);
  });
});

describe('B-EPOCH-KEYING-PARITY — the window clamp', () => {
  it('a window can never reach back past the epoch', () => {
    const since = new Date('2026-07-25T00:00:00Z');          // a 30d window, well before the epoch
    expect(clampWindowToEpoch(since, EPOCH).toISOString()).toBe(EPOCH.toISOString());
  });
  it('a window INSIDE the epoch is left alone', () => {
    const since = new Date('2026-08-24T00:00:00Z');          // 24h window, after the epoch
    expect(clampWindowToEpoch(since, EPOCH).toISOString()).toBe(since.toISOString());
  });
  it('no epoch ⇒ the bound is untouched', () => {
    const since = new Date('2026-07-25T00:00:00Z');
    expect(clampWindowToEpoch(since, null).toISOString()).toBe(since.toISOString());
  });
});

describe('B-EPOCH-KEYING-PARITY — ★ THE PARITY ITSELF', () => {
  // One population containing the exact shape that broke: clean rows plus a straddler
  // carrying a large positive P&L, which is what flipped the sign of the lifetime figure.
  const trades = [
    { openedAt: after,  closedAt: after,  pnl: -4.91 },   // clean, in-epoch
    { openedAt: before, closedAt: after,  pnl: 10.67 },   // STRADDLER — must never count
    { openedAt: before, closedAt: before, pnl: -50 },     // wholly pre-epoch
    { closedAt: after,  pnl: 999 },                       // unplaceable — must never count
  ];

  it('every window agrees, and the straddler is in none of them', () => {
    const now = new Date('2026-08-24T10:26:00Z');
    const e = computeRollingEarnings(trades, now, EPOCH);
    // -4.91 only. If the straddler leaked in this would read +5.76 — the live bug, to the cent.
    expect(e.last24h).toBeCloseTo(-4.91, 2);
    expect(e.last7d).toBeCloseTo(-4.91, 2);
    expect(e.last30d).toBeCloseTo(-4.91, 2);
  });

  it('★ Kyle’s requirement: on day one, 24h === 7d === 30d', () => {
    const now = new Date('2026-08-24T10:26:00Z');
    const e = computeRollingEarnings(trades, now, EPOCH);
    expect(e.last24h).toBe(e.last7d);
    expect(e.last7d).toBe(e.last30d);
  });

  it('the shared predicate and the rolling windows select the SAME set', () => {
    // The parity assertion proper: whatever the predicate admits is exactly what gets summed.
    const admitted = trades.filter(t => isInObservationEpoch(t, EPOCH));
    const sum = admitted.reduce((s, t) => s + Number(t.pnl), 0);
    const e = computeRollingEarnings(trades, new Date('2026-08-24T10:26:00Z'), EPOCH);
    expect(admitted).toHaveLength(1);
    expect(e.last30d).toBeCloseTo(sum, 6);
  });
});
