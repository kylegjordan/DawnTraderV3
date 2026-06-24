/**
 * reorg-B3.3 — strategy-level VTS tag-don't-drop (the corrected un-strangle).
 *
 * Pins the §3 disposition table — the SSOT `guardForcesDrop(gr, disposition)` in strategy-helpers.ts —
 * which is the single decision point the 18 strategies' guard blocks now call instead of bare `!_gr.pass`:
 *   - 'enforce' (DEFAULT — active/live): ANY guard fail drops (byte-identical to pre-B3.3).
 *   - 'tag' (VTS learning path): QUALITY/EV fails (rr_below_min, unreachable) DON'T drop (flow forward to be
 *     tagged + simulated); DATA-VALIDITY fails (invalid_atr, stop_distance) STILL drop on every path.
 *   - a PASS never drops on either path.
 *
 * The malformed-geometry safety net (invalid_geometry → drop) lives downstream in the reorg-B2 normalizer
 * (signal-target-normalizer.ts), re-derived on the crypto VTS path per reorg-B3.2; that is covered there.
 */
import { describe, it, expect } from 'vitest';
import { guardForcesDrop, type GuardResult, type GuardDropReason } from '../../strategies/strategy-helpers.js';

// Build a GuardResult with a given pass/dropReason (rr/atrsToTarget are immaterial to the disposition).
function gr(pass: boolean, dropReason: GuardDropReason): GuardResult {
  return { pass, rr: pass ? 3.0 : 1.0, atrsToTarget: pass ? 2.0 : 9.9, dropReason };
}

describe('reorg-B3.3 guardForcesDrop — §3 per-path disposition table', () => {
  it('PASS never drops, on either path', () => {
    expect(guardForcesDrop(gr(true, null), 'enforce')).toBe(false);
    expect(guardForcesDrop(gr(true, null), 'tag')).toBe(false);
  });

  it("'enforce' drops on EVERY guard-fail reason (active/live unchanged)", () => {
    for (const reason of ['rr_below_min', 'unreachable', 'invalid_atr', 'stop_distance'] as GuardDropReason[]) {
      expect(guardForcesDrop(gr(false, reason), 'enforce')).toBe(true);
    }
  });

  it("'tag' does NOT drop the QUALITY/EV gates (rr_below_min, unreachable) — they get tagged + simulated", () => {
    expect(guardForcesDrop(gr(false, 'rr_below_min'), 'tag')).toBe(false);
    expect(guardForcesDrop(gr(false, 'unreachable'), 'tag')).toBe(false);
  });

  it("'tag' STILL drops the DATA-VALIDITY gates (invalid_atr, stop_distance) — garbage is never learning signal", () => {
    expect(guardForcesDrop(gr(false, 'invalid_atr'), 'tag')).toBe(true);
    expect(guardForcesDrop(gr(false, 'stop_distance'), 'tag')).toBe(true);
  });

  it("default disposition is 'enforce' (an un-threaded/active caller is byte-identical to pre-B3.3)", () => {
    // omitting the 2nd arg must behave exactly like 'enforce' — drops every fail, passes a pass.
    expect(guardForcesDrop(gr(false, 'rr_below_min'))).toBe(true);
    expect(guardForcesDrop(gr(false, 'unreachable'))).toBe(true);
    expect(guardForcesDrop(gr(false, 'invalid_atr'))).toBe(true);
    expect(guardForcesDrop(gr(true, null))).toBe(false);
  });

  it("future-proof: a hypothetical NEW non-taggable reason falls through to DROP on the 'tag' path", () => {
    // Only rr_below_min + unreachable are in the taggable set; anything else (incl. a future reason) drops.
    expect(guardForcesDrop(gr(false, 'stop_distance'), 'tag')).toBe(true);
  });
});
