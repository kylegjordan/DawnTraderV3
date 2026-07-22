/**
 * P19-B8.5e — the mark-staleness ceiling policy (`#548`).
 *
 * WHAT THIS PROTECTS. The ceiling decides whether we are allowed to evaluate a position
 * against its last known price. Get it too LOOSE and we act on a price that has silently
 * gone wrong — at exactly the moment a fast move made it wrong. Get it too TIGHT and we
 * refuse to manage healthy positions (the 49×/24h symptom that started `#548`).
 *
 * ★ THE INVARIANT THESE TESTS EXIST TO PIN: **the tolerance must shrink as the danger
 * rises.** A position near its stop must get a TIGHTER window than one with room, and
 * every degenerate input must land on the FLOOR (tightest), never the cap.
 */
import { describe, it, expect } from 'vitest';
import {
  computeStalenessCeiling,
  type MarkStalenessConfig,
} from '../../asset_classes/xstock_spot/mark-staleness.js';

// Seeded values from 2026-07-21-p19-b8-5e-mark-staleness-knobs.sql
const CFG: MarkStalenessConfig = {
  budgetK: 0.5,
  nullStopBudgetPct: 0.005,
  floorMs: 15_000,
  capMs: 300_000,
  sigmaFullCreditMs: 300_000, // = seeded sigma_refresh_after_ms
};

// Live-measured σ (fractional move per second, 30-min window, staging 2026-07-22)
const SIGMA_FAST = 6.877e-5; // MU
const SIGMA_SLOW = 1.419e-5; // C — ~4.8× calmer

describe('P19-B8.5e — computeStalenessCeiling: tolerance shrinks as danger rises', () => {
  it('★ THE CORE INVARIANT: a position NEAR its stop gets a TIGHTER ceiling than one with room', () => {
    const far = computeStalenessCeiling({ currentPrice: 100, stopPrice: 96, sigmaRatePerSec: SIGMA_FAST, sigmaAgeMs: 0 }, CFG);
    const near = computeStalenessCeiling({ currentPrice: 100, stopPrice: 99.5, sigmaRatePerSec: SIGMA_FAST, sigmaAgeMs: 0 }, CFG);
    expect(near.ceilingMs).toBeLessThan(far.ceilingMs);
    expect(far.basis).toBe('risk_to_stop');
    expect(near.basis).toBe('risk_to_stop');
  });

  it('★ a CALM symbol earns a LONGER window than a FAST one at identical risk — the whole point of per-symbol', () => {
    const fast = computeStalenessCeiling({ currentPrice: 100, stopPrice: 99.5, sigmaRatePerSec: SIGMA_FAST, sigmaAgeMs: 0 }, CFG);
    const slow = computeStalenessCeiling({ currentPrice: 100, stopPrice: 99.5, sigmaRatePerSec: SIGMA_SLOW, sigmaAgeMs: 0 }, CFG);
    expect(slow.ceilingMs).toBeGreaterThan(fast.ceilingMs);
  });

  it('★ THE DRIFT PROPERTY holds — EXCEPT where the floor binds, which is a REAL HOLE, not a rounding artifact', () => {
    // ★★ THIS TEST ORIGINALLY ASSERTED THE UNCONDITIONAL CLAIM ("drift never exceeds
    // budget") AND FAILED — correctly. The floor OVERRIDES the budget: when a position
    // is close enough to its stop that the budget-derived ceiling would be under
    // `floorMs`, we hold the window OPEN at the floor and the symbol can then drift
    // MORE than the budget. Measured against live σ (2026-07-22):
    //   MU  @0.10% room → raw 7s, floored to 15s, drift 0.103% = 2.06× the BUDGET, 1.03× the ROOM
    //   AMD @0.05% room → raw 5s, floored to 15s, drift 0.078% = 3.1× the budget
    // i.e. ON A FAST SYMBOL WITHIN ~0.1% OF ITS STOP, THE STOP CAN BE CROSSED INSIDE THE
    // FLOOR WINDOW WITHOUT US SEEING IT. Break-even is `room > σ × floor`: MU needs
    // >0.103% room, C only >0.021%.
    //
    // ⚠️ This is NOT fixable by lowering the floor — the floor exists because a
    // sub-second ceiling would refuse on every ordinary tick gap. And note the exposure
    // is NOT created by the ceiling: near the stop with a stale mark we are unprotected
    // EITHER WAY (act on a possibly-wrong price, or refuse and also not close). That is
    // `#563` — our stop is evaluated IN-PROCESS, so it dies with our own liveness; a
    // venue-resting stop would execute regardless. Recorded here so the next reader
    // meets the limitation at the test rather than in production.
    for (const sigma of [SIGMA_FAST, SIGMA_SLOW]) {
      for (const stop of [96, 99, 99.5, 99.9]) {
        const r = computeStalenessCeiling({ currentPrice: 100, stopPrice: stop, sigmaRatePerSec: sigma, sigmaAgeMs: 0 }, CFG);
        const driftFraction = sigma * (r.ceilingMs / 1000);
        const budget = r.budgetFraction ?? 0;
        const floorBinds = r.ceilingMs === CFG.floorMs && (budget / sigma) * 1000 < CFG.floorMs;
        if (floorBinds) {
          // The documented exception — assert it is the ONLY way the budget is exceeded.
          expect(r.ceilingMs).toBe(CFG.floorMs);
        } else {
          expect(driftFraction).toBeLessThanOrEqual(budget + 1e-9);
        }
      }
    }
  });

  it('★ pins the floor-binding threshold so a knob change surfaces the exposure instead of hiding it', () => {
    // If someone raises floorMs, THIS is the number that moves: the room-to-stop below
    // which the stop becomes crossable inside the blind window.
    const breakEvenRoom = SIGMA_FAST * (CFG.floorMs / 1000); // ≈ 0.00103 (0.103%)
    const justInside = computeStalenessCeiling(
      { currentPrice: 100, stopPrice: 100 * (1 - breakEvenRoom * 2), sigmaRatePerSec: SIGMA_FAST, sigmaAgeMs: 0 }, CFG);
    expect(justInside.ceilingMs).toBeGreaterThan(CFG.floorMs); // budget still governs
    const justOutside = computeStalenessCeiling(
      { currentPrice: 100, stopPrice: 100 * (1 - breakEvenRoom / 2), sigmaRatePerSec: SIGMA_FAST, sigmaAgeMs: 0 }, CFG);
    expect(justOutside.ceilingMs).toBe(CFG.floorMs); // floor now governs ⇒ exposure window
  });

  it('CAPS an absurdly long raw ceiling — a very calm symbol must not earn an unbounded blind window', () => {
    // C with lots of room computes ~1409s raw; the cap must cut it to 300s.
    const r = computeStalenessCeiling({ currentPrice: 100, stopPrice: 96, sigmaRatePerSec: SIGMA_SLOW, sigmaAgeMs: 0 }, CFG);
    expect(r.ceilingMs).toBe(CFG.capMs);
    expect(r.clamped).toBe(true);
  });

  it('FLOORS a tiny ceiling — we must not refuse faster than the floor or we skip constantly', () => {
    const r = computeStalenessCeiling({ currentPrice: 100, stopPrice: 99.99, sigmaRatePerSec: SIGMA_FAST, sigmaAgeMs: 0 }, CFG);
    expect(r.ceilingMs).toBe(CFG.floorMs);
    expect(r.clamped).toBe(true);
  });

  it('uses the fixed conservative budget when the position has NO stop — never fails open', () => {
    const r = computeStalenessCeiling({ currentPrice: 100, stopPrice: null, sigmaRatePerSec: SIGMA_SLOW, sigmaAgeMs: 0 }, CFG);
    expect(r.basis).toBe('null_stop_budget');
    expect(r.budgetFraction).toBe(CFG.nullStopBudgetPct);
    // 0.005 / 1.419e-5 ≈ 352s → capped at 300s
    expect(r.ceilingMs).toBe(CFG.capMs);
  });

  it('★ FAIL-CLOSED on absent σ — lands on the FLOOR, never the cap', () => {
    const r = computeStalenessCeiling({ currentPrice: 100, stopPrice: 96, sigmaRatePerSec: null, sigmaAgeMs: 0 }, CFG);
    expect(r.ceilingMs).toBe(CFG.floorMs);
    expect(r.basis).toBe('no_sigma');
    expect(r.budgetFraction).toBeNull();
  });

  it('FAIL-CLOSED on a non-positive or non-finite σ', () => {
    expect(computeStalenessCeiling({ currentPrice: 100, stopPrice: 96, sigmaRatePerSec: 0, sigmaAgeMs: 0 }, CFG).ceilingMs).toBe(CFG.floorMs);
    expect(computeStalenessCeiling({ currentPrice: 100, stopPrice: 96, sigmaRatePerSec: -1, sigmaAgeMs: 0 }, CFG).ceilingMs).toBe(CFG.floorMs);
    expect(computeStalenessCeiling({ currentPrice: 100, stopPrice: 96, sigmaRatePerSec: NaN, sigmaAgeMs: 0 }, CFG).ceilingMs).toBe(CFG.floorMs);
  });

  it('FAIL-CLOSED on an unusable mark', () => {
    const r = computeStalenessCeiling({ currentPrice: 0, stopPrice: 96, sigmaRatePerSec: SIGMA_FAST, sigmaAgeMs: 0 }, CFG);
    expect(r.ceilingMs).toBe(CFG.floorMs);
    expect(r.basis).toBe('degenerate_input');
  });

  it('★ price AT or THROUGH the stop ⇒ zero room ⇒ the tightest window, not a wide one', () => {
    const at = computeStalenessCeiling({ currentPrice: 100, stopPrice: 100, sigmaRatePerSec: SIGMA_FAST, sigmaAgeMs: 0 }, CFG);
    expect(at.ceilingMs).toBe(CFG.floorMs);
    // and through it (long position already below its stop) — |diff| keeps this defined
    const through = computeStalenessCeiling({ currentPrice: 99, stopPrice: 100, sigmaRatePerSec: SIGMA_FAST, sigmaAgeMs: 0 }, CFG);
    expect(through.ceilingMs).toBeGreaterThanOrEqual(CFG.floorMs);
  });

  it('★ STALE-LOW σ: an AGEING σ must TIGHTEN the window, never widen it (the fail-OPEN hole)', () => {
    // The scenario ANALYST found: symbol was quiet, σ measured low, then it stops being
    // quiet. The cached σ is not null so no guard fires — and σ is in the DENOMINATOR, so
    // without an age penalty that pre-spike σ buys a FULL-WIDTH window during the spike.
    const base = { currentPrice: 100, stopPrice: 98, sigmaRatePerSec: SIGMA_FAST };
    const fresh = computeStalenessCeiling({ ...base, sigmaAgeMs: 0 }, CFG);
    const aging = computeStalenessCeiling({ ...base, sigmaAgeMs: CFG.sigmaFullCreditMs * 2 }, CFG);
    const older = computeStalenessCeiling({ ...base, sigmaAgeMs: CFG.sigmaFullCreditMs * 3 }, CFG);
    expect(aging.ceilingMs).toBeLessThan(fresh.ceilingMs);
    expect(older.ceilingMs).toBeLessThan(aging.ceilingMs);
    // monotonically tightening — the direction is the whole point
    expect(aging.sigmaAgeInflation).toBeGreaterThan(1);
    expect(older.sigmaAgeInflation).toBeGreaterThan(aging.sigmaAgeInflation);
  });

  it('★ a σ of UNKNOWN age is treated as MAXIMALLY stale, not as fresh', () => {
    const unknown = computeStalenessCeiling(
      { currentPrice: 100, stopPrice: 98, sigmaRatePerSec: SIGMA_FAST, sigmaAgeMs: null }, CFG);
    const fresh = computeStalenessCeiling(
      { currentPrice: 100, stopPrice: 98, sigmaRatePerSec: SIGMA_FAST, sigmaAgeMs: 0 }, CFG);
    expect(unknown.ceilingMs).toBeLessThan(fresh.ceilingMs);
  });

  it('a σ INSIDE the full-credit period pays NO penalty — steady state must not be punished', () => {
    const r = computeStalenessCeiling(
      { currentPrice: 100, stopPrice: 98, sigmaRatePerSec: SIGMA_FAST, sigmaAgeMs: CFG.sigmaFullCreditMs - 1 }, CFG);
    expect(r.sigmaAgeInflation).toBe(1);
  });

  it('★ floorBoundNearStop flags ONLY the case where the stop is crossable inside the floor window', () => {
    // Near-stop on a fast symbol: room 0.05% < σ×15s (0.103%) ⇒ crossable ⇒ flagged.
    const nearStop = computeStalenessCeiling(
      { currentPrice: 100, stopPrice: 99.95, sigmaRatePerSec: SIGMA_FAST, sigmaAgeMs: 0 }, CFG);
    expect(nearStop.ceilingMs).toBe(CFG.floorMs);
    expect(nearStop.floorBoundNearStop).toBe(true);

    // A calm symbol that merely CLAMPS at the cap is not near-stop — must NOT be flagged,
    // or the counter becomes noise and stops meaning anything.
    const calmFar = computeStalenessCeiling(
      { currentPrice: 100, stopPrice: 96, sigmaRatePerSec: SIGMA_SLOW, sigmaAgeMs: 0 }, CFG);
    expect(calmFar.clamped).toBe(true);
    expect(calmFar.floorBoundNearStop).toBe(false);
  });

  it('reports `clamped` honestly so a log reader can see when the raw value was bounded', () => {
    const mid = computeStalenessCeiling({ currentPrice: 100, stopPrice: 98, sigmaRatePerSec: SIGMA_FAST, sigmaAgeMs: 0 }, CFG);
    // 0.5 × 0.02 / 6.877e-5 ≈ 145s — inside both bounds, so untouched
    expect(mid.clamped).toBe(false);
    expect(mid.ceilingMs).toBeGreaterThan(CFG.floorMs);
    expect(mid.ceilingMs).toBeLessThan(CFG.capMs);
  });
});
