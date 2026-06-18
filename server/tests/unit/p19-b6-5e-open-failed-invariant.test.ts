/**
 * P19-B6.5e — RTB metrics open-stage-failure accounting.
 *
 * Locks the structural fix behind the crypto open-path silent failure: the I3 invariant
 * now reconciles the POST-guardrail open stage too — `attempts === opened + blocked + openFailed` —
 * so a sized signal can no longer vanish unaccounted (the `attempts=11/opened=0/blocked=0`
 * symptom). Pre-B6.5e, an open-stage bail (EV gate, depth gate, fill, dup, trade-insert) was a
 * silent `return` that broke the invariant; now each is recorded via `recordOpenFailed`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { rtbMetricsService } from '../../services/rtb-metrics-service';

describe('P19-B6.5e — rtb-metrics openFailed accounting', () => {
  beforeEach(() => {
    rtbMetricsService.reset();
  });

  it('recordOpenFailed increments openFailedTotal + the per-stage breakdown', () => {
    rtbMetricsService.recordAttempt('BTC/USD', 'breakout');
    rtbMetricsService.recordOpenFailed('BTC/USD', 'breakout', 'DEPTH_GATE', 'no_book');
    const s = rtbMetricsService.getSummary();
    expect(s.totals.openFailed).toBe(1);
    expect(s.openFailedByStage.DEPTH_GATE).toBe(1);
    expect(s.openFailedByStage.EV_REJECT).toBe(0);
  });

  it('the I3 invariant reconciles attempts = opened + blocked + openFailed (the headline fix)', () => {
    // 11 attempts: 0 open, 0 guardrail-block, 11 depth-gate open-failures — the exact dry-run shape.
    for (let i = 0; i < 11; i++) {
      rtbMetricsService.recordAttempt('ETH/USD', 'vwap_pullback');
      rtbMetricsService.recordOpenFailed('ETH/USD', 'vwap_pullback', 'DEPTH_GATE', 'no_book');
    }
    const s = rtbMetricsService.getSummary();
    expect(s.totals.attempts).toBe(11);
    expect(s.totals.opened).toBe(0);
    expect(s.totals.blocked).toBe(0);
    expect(s.totals.openFailed).toBe(11);
    // attempts === opened + blocked + openFailed → invariant HOLDS (was a MISMATCH pre-B6.5e)
    expect(s.invariantCheck.valid).toBe(true);
    expect(s.invariantCheck.message).toContain('OK');
  });

  it('a mixed funnel (opened + guardrail-block + open-failed) still reconciles', () => {
    // 1 opened
    rtbMetricsService.recordAttempt('SOL/USD', 'breakout');
    rtbMetricsService.recordOpen('SOL/USD', 'breakout');
    // 1 guardrail block
    rtbMetricsService.recordAttempt('ADA/USD', 'mean_reversion');
    rtbMetricsService.recordBlock('ADA/USD', 'mean_reversion', 'COOLDOWN');
    // 2 open-stage failures (different stages)
    rtbMetricsService.recordAttempt('DOT/USD', 'range_trading');
    rtbMetricsService.recordOpenFailed('DOT/USD', 'range_trading', 'EV_REJECT', 'negative net expectancy');
    rtbMetricsService.recordAttempt('AVAX/USD', 'breakout');
    rtbMetricsService.recordOpenFailed('AVAX/USD', 'breakout', 'FILL_REJECTED', 'no fillable book');

    const s = rtbMetricsService.getSummary();
    expect(s.totals.attempts).toBe(4);
    expect(s.totals.opened).toBe(1);
    expect(s.totals.blocked).toBe(1);
    expect(s.totals.openFailed).toBe(2);
    expect(s.invariantCheck.valid).toBe(true);
    expect(s.openFailedByStage.EV_REJECT).toBe(1);
    expect(s.openFailedByStage.FILL_REJECTED).toBe(1);
    // guardrail "blocked" accounting stays clean (NOT polluted by open-failures)
    expect(s.byReason.COOLDOWN).toBe(1);
  });

  it('per-symbol funnel folds open-failures into blocked with an OPEN_<stage> reason key', () => {
    rtbMetricsService.recordAttempt('LINK/USD', 'breakout');
    rtbMetricsService.recordOpenFailed('LINK/USD', 'breakout', 'DUP_POSITION', 'duplicate position');
    const bySymbol = rtbMetricsService.getBySymbol();
    expect(bySymbol['LINK/USD'].attempts).toBe(1);
    expect(bySymbol['LINK/USD'].opened).toBe(0);
    // per-symbol struct has only attempts/opened/blocked → open-fail folds into blocked so attempts=opened+blocked still holds
    expect(bySymbol['LINK/USD'].blocked).toBe(1);
    expect(bySymbol['LINK/USD'].byReason['OPEN_DUP_POSITION']).toBe(1);
  });

  it('reset() clears the openFailed accounting', () => {
    rtbMetricsService.recordAttempt('BTC/USD', 'breakout');
    rtbMetricsService.recordOpenFailed('BTC/USD', 'breakout', 'TRADE_INSERT_ERROR', 'db threw');
    rtbMetricsService.reset();
    const s = rtbMetricsService.getSummary();
    expect(s.totals.openFailed).toBe(0);
    expect(s.openFailedByStage.TRADE_INSERT_ERROR).toBe(0);
    expect(s.invariantCheck.valid).toBe(true); // 0 === 0 + 0 + 0
  });

  it('an unrecorded open-stage failure (the OLD bug) would break the invariant — guard against regression', () => {
    // Simulate the pre-B6.5e behavior: an attempt with NO corresponding open/block/openFailed.
    rtbMetricsService.recordAttempt('XBT/USD', 'breakout');
    const s = rtbMetricsService.getSummary();
    // attempts(1) !== opened(0) + blocked(0) + openFailed(0) → the invariant CATCHES it now.
    expect(s.invariantCheck.valid).toBe(false);
    expect(s.invariantCheck.message).toContain('MISMATCH');
  });
});
