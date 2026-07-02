/**
 * P19-B7.2c — pending-maker lifecycle tests (Kyle model, SIMPLIFIED 2026-07-02).
 *
 * Covers the OBJ-7 named list's pure/logic surface:
 *  - fill-on-trade-through (side-aware) / no-fill-without-trade-through
 *  - fill-wins-on-same-tick precedence (R2)
 *  - hard-drop = drop, period (no convert) / rest before the deadline
 *  - marketable-at-placement predicate (the stored-taker check's trigger)
 *  - inert-tier guard: the maker fill price is the limit EXACTLY (Langston Q4 —
 *    catches an accidental future wiring of the placeholder tier knobs at CI)
 *  - config invariant: maker_max_pending_ms >= maker_time_budget_ms throws LOUDLY (Q5)
 *  - twin kill-knob semantics (numeric 1/0)
 * Engine-integration behaviors (slot hold/free across loops, non-trade telemetry,
 * weekend deadline pause, UI badges) are staging-verified at Step-7/8 per the scope.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  tradedThrough,
  isMarketableAtPlacement,
  evaluatePendingMaker,
  makerFillPrice,
} from '../../core/trading/pending-maker-logic.js';

// ── config resolvers: mock the module-constants cache (fail-hard getter) ──────────
const constants = new Map<string, number>();
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: (module: string, constant: string, _key: unknown) => {
    const v = constants.get(`${module}.${constant}`);
    if (v == null) throw new Error(`missing ${module}.${constant}`);
    return v;
  },
}));
import { resolveMakerMaxPendingMs, resolveTwinEnabled } from '../../services/maker-taker-config.js';

describe('P19-B7.2c — pending-maker pure logic (shared paper+VTS)', () => {
  it('fill-on-trade-through: a resting BUY fills iff price <= limit (side-aware)', () => {
    expect(tradedThrough('buy', 99.99, 100)).toBe(true);
    expect(tradedThrough('buy', 100, 100)).toBe(true);      // touch-through boundary
    expect(tradedThrough('buy', 100.01, 100)).toBe(false);  // above the limit = no fill
    // sell side is symmetric (build-it-correct §5 #11 even though long-only today)
    expect(tradedThrough('sell', 100.01, 100)).toBe(true);
    expect(tradedThrough('sell', 99.99, 100)).toBe(false);
  });

  it('no-fill-without-trade-through: a null/NaN price can NEVER fill', () => {
    expect(evaluatePendingMaker({ side: 'buy', currentPrice: null, limit: 100, nowMs: 0, deadlineMs: null })).toBe('rest');
    expect(tradedThrough('buy', NaN, 100)).toBe(false);
  });

  it('R2 precedence: trade-through AND past-deadline in the SAME tick → FILL WINS', () => {
    expect(evaluatePendingMaker({
      side: 'buy', currentPrice: 99, limit: 100, nowMs: 2_000, deadlineMs: 1_000,
    })).toBe('fill');
  });

  it('hard-drop: past the deadline with no trade-through → DROP, period (no convert outcome exists)', () => {
    const out = evaluatePendingMaker({ side: 'buy', currentPrice: 101, limit: 100, nowMs: 2_000, deadlineMs: 1_000 });
    expect(out).toBe('drop');
    // the outcome union has NO 'convert' member — the convert valve was cut by design
    expect(['fill', 'drop', 'rest']).toContain(out);
  });

  it('rest: before the deadline with no trade-through → keep resting (slot stays held)', () => {
    expect(evaluatePendingMaker({ side: 'buy', currentPrice: 101, limit: 100, nowMs: 500, deadlineMs: 1_000 })).toBe('rest');
    // a pending with no deadline recorded rests indefinitely rather than guessing
    expect(evaluatePendingMaker({ side: 'buy', currentPrice: 101, limit: 100, nowMs: 500, deadlineMs: null })).toBe('rest');
  });

  it('marketable-at-placement: market already at/through the limit (a real post-only would reject)', () => {
    expect(isMarketableAtPlacement('buy', 99.5, 100)).toBe(true);   // best ask below our buy limit
    expect(isMarketableAtPlacement('buy', 100.5, 100)).toBe(false); // limit rests below market — honest rest
  });

  it('inert-tier guard (Langston Q4): the maker fill price is the limit EXACTLY — no tier haircut', () => {
    expect(makerFillPrice(100)).toBe(100);
    expect(makerFillPrice(0.1234567891)).toBe(0.1234567891);
    // makerFillPrice takes ONLY the limit — the placeholder tier knobs are not inputs,
    // so wiring them in requires a signature change this test (and Step-4) would catch.
    expect(makerFillPrice.length).toBe(1);
  });
});

describe('P19-B7.2c — config resolvers (fail-hard + the Q5 invariant)', () => {
  beforeEach(() => constants.clear());

  it('maker_max_pending_ms resolves when coherent (max >= time budget)', () => {
    constants.set('maker_taker.maker_max_pending_ms', 3_600_000);
    constants.set('maker_taker.maker_time_budget_ms', 60_000);
    expect(resolveMakerMaxPendingMs('crypto_spot' as any)).toBe(3_600_000);
  });

  it('Q5 invariant: a hard-drop SHORTER than the expected-fill window throws LOUDLY at load', () => {
    constants.set('maker_taker.maker_max_pending_ms', 30_000);
    constants.set('maker_taker.maker_time_budget_ms', 60_000);
    expect(() => resolveMakerMaxPendingMs('crypto_spot' as any)).toThrow(/incoherent config/);
  });

  it('fail-hard: a missing knob throws (no hidden default — §5 r15)', () => {
    expect(() => resolveMakerMaxPendingMs('crypto_spot' as any)).toThrow(/missing/);
  });

  it('twin kill-knob: numeric 1 = on, 0 = off (DB-switchable without deploy)', () => {
    constants.set('maker_taker.twin_enabled', 1);
    expect(resolveTwinEnabled('crypto_spot' as any)).toBe(true);
    constants.set('maker_taker.twin_enabled', 0);
    expect(resolveTwinEnabled('crypto_spot' as any)).toBe(false);
  });
});
