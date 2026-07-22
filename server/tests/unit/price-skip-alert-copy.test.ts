/**
 * The price-skip alert's BRANCH — a staleness rejection and a genuine absence are
 * different facts and must not share wording.
 *
 * ★ WHY THESE TESTS ASSERT WHAT THEY ASSERT (Analyst's ruling, 2026-07-22): **pin the
 * BRANCH, not the wording.** A test asserting exact message text fights the next person
 * who improves it and fails for the RIGHT change — a test that punishes maintenance. So
 * nothing here asserts a full sentence; each case asserts the CLAIM the message must or
 * must not make.
 *
 * ★ WHAT WENT WRONG, so a future reader knows what is being defended: the original copy
 * asserted the absence case for BOTH branches — *"neither the live feed nor the direct
 * query returned a usable price"* and *"the position cannot be exited until the venue
 * quotes again."* Measured while it was firing on six symbols, **every one had a mark
 * 40-156s old**: the venue WAS quoting and a price DID exist. It had been rejected as too
 * old. **"Cannot be exited" is a claim about CAPABILITY; "the mark is older than the
 * ceiling" is what is actually known** — and the first sends an operator hunting a feed
 * that is not broken.
 */
import { describe, it, expect } from 'vitest';
import { buildPriceSkipAlertCopy } from '../../services/active-execution-engine.js';

const base = { symbol: 'C/USD', mode: 'paper', streak: 40 };

describe('price-skip alert copy — the branch, not the wording', () => {
  it('★ a STALENESS rejection must NOT claim the position cannot be exited', () => {
    const c = buildPriceSkipAlertCopy({ ...base, reason: 'equity_tick_stale_risk_to_stop', detail: 'mark 148s old, ceiling 90s' });
    expect(c.isStaleReject).toBe(true);
    // The capability claim the evidence falsified — must be absent in ANY future rewording.
    expect(c.body).not.toMatch(/cannot be exited/i);
    // And it must not assert that no price was obtainable, because one was.
    expect(c.body).not.toMatch(/returned a usable price/i);
  });

  it('★ a staleness rejection MUST carry the two numbers a reader needs to judge', () => {
    const c = buildPriceSkipAlertCopy({ ...base, reason: 'equity_tick_stale_risk_to_stop', detail: 'mark 148s old, ceiling 90s' });
    expect(c.body).toContain('mark 148s old, ceiling 90s');
    // Langston's point: without both numbers the reader has to re-query to know if it matters.
  });

  it('★ a GENUINE ABSENCE keeps the stronger wording — it is TRUE for that case', () => {
    // The fix must not soften the real no-price case into vagueness; crypto relies on it.
    const c = buildPriceSkipAlertCopy({ ...base, symbol: 'BTC/USD', reason: 'rest_no_data' });
    expect(c.isStaleReject).toBe(false);
    expect(c.body).toMatch(/returned a usable price/i);
    expect(c.title).toMatch(/no Kraken price/i);
  });

  it('the two branches produce DIFFERENT titles — an alert list must be scannable', () => {
    const stale = buildPriceSkipAlertCopy({ ...base, reason: 'equity_tick_stale_risk_to_stop' });
    const absent = buildPriceSkipAlertCopy({ ...base, reason: 'rest_no_data' });
    expect(stale.title).not.toBe(absent.title);
  });

  it('EVERY equity_tick_stale_* variant takes the stale branch, including the near-stop one', () => {
    // The floor-bound reason is a distinct countable, but it is still a staleness rejection —
    // if it fell through to the absence branch it would re-introduce the false claim.
    for (const r of ['equity_tick_stale_risk_to_stop', 'equity_tick_stale_no_sigma',
                     'equity_tick_stale_null_stop_budget', 'equity_tick_stale_floor_bound_near_stop']) {
      const c = buildPriceSkipAlertCopy({ ...base, reason: r });
      expect(c.isStaleReject, `${r} must take the stale branch`).toBe(true);
      expect(c.body, `${r} must not claim the position cannot be exited`).not.toMatch(/cannot be exited/i);
    }
  });

  it('a missing detail degrades gracefully rather than emitting an empty parenthetical', () => {
    const c = buildPriceSkipAlertCopy({ ...base, reason: 'equity_tick_stale_risk_to_stop' });
    expect(c.body).not.toMatch(/\(\)/);
  });
});
