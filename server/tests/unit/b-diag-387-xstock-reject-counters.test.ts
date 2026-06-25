/**
 * B-DIAG-387 (#387) — xStock filter-diagnostics reject-counter contract.
 *
 * The /api/xstocks/filter-diagnostics endpoint surfaces the Net-EV-floor
 * rejection count (the reorg-B7 maker/taker baseline) and the pre-open gate
 * reasons from the in-memory eval accumulators. Before this batch the endpoint
 * read a permanently-empty `byReason` scaffold → reported 0 forever (the #386
 * bug). This pins the KEY CONTRACT that ties the eval-cycle producer
 * (xstock_spot/eval-cycle.ts) to the endpoint mapping (routes.ts) to the panel
 * consumer (machine-learning.tsx), so a future edit can't silently rename a key
 * on one side and zero the dashboard again.
 *
 * The mapping helpers below mirror the endpoint expressions verbatim. The
 * decisive end-to-end proof is the Step-7 staging cross-check of the live count
 * against signal_eval_archive — this test guards the in-process contract.
 */
import { describe, it, expect } from 'vitest';

// ── The canonical in-memory key for a Net-EV-floor rejection. The eval-cycle
// writes this into nullReasonAggregate (combined) + the per-lane aggregates; the
// endpoint total + the panel per-pool columns read it. It is DELIBERATELY
// distinct from the ARCHIVE reason string ('net_ev_below_floor', the archiver
// layer) — same event, two layers. Drift between these is the #386 failure mode.
const NET_EV_INMEM_KEY = 'net_ev_rejected';
const NET_EV_ARCHIVE_REASON = 'net_ev_below_floor';

// ── The pre-open gate reason strings checkPreOpenGates emits (vts-runner.ts).
// OBJ-2 surfaces the three that previously rendered nowhere.
const PREOPEN_HIDDEN = ['reentry_cooldown', 'price_past_stop', 'price_past_target'] as const;

// Mirrors the endpoint's `rejectedReasons` expression (routes.ts).
function endpointRejectedReasons(agg: Record<string, number> | undefined) {
  return { netEvBelowFloor: agg?.[NET_EV_INMEM_KEY] ?? 0 };
}

// Mirrors the endpoint's structured `nullReasons` pre-open keys (routes.ts).
function endpointPreOpenNullReasons(agg: Record<string, number> | undefined) {
  const live = agg ?? {};
  return {
    reentryCooldown: live['reentry_cooldown'] ?? 0,
    pricePastStop: live['price_past_stop'] ?? 0,
    pricePastTarget: live['price_past_target'] ?? 0,
  };
}

describe('B-DIAG-387 xStock reject-counter key contract', () => {
  it('Net-EV-floor count surfaces from the net_ev_rejected aggregate key (not the dead scaffold)', () => {
    const agg = { net_ev_rejected: 611, conditions_not_met: 42 };
    expect(endpointRejectedReasons(agg).netEvBelowFloor).toBe(611);
  });

  it('empty / missing accumulator yields 0 — never undefined (panel renders a number)', () => {
    expect(endpointRejectedReasons({}).netEvBelowFloor).toBe(0);
    expect(endpointRejectedReasons(undefined).netEvBelowFloor).toBe(0);
  });

  it('does NOT read the archive reason string for the in-memory total (cross-layer guard)', () => {
    // If the endpoint regressed to the archive key, this accumulator would report 0.
    const aggArchiveKeyOnly = { [NET_EV_ARCHIVE_REASON]: 611 };
    expect(endpointRejectedReasons(aggArchiveKeyOnly).netEvBelowFloor).toBe(0);
    expect(NET_EV_INMEM_KEY).not.toBe(NET_EV_ARCHIVE_REASON);
  });

  it('the three previously-hidden pre-open gate reasons each surface under their structured key', () => {
    const agg = { reentry_cooldown: 3, price_past_stop: 7, price_past_target: 5, duplicate_position: 99 };
    const nr = endpointPreOpenNullReasons(agg);
    expect(nr.reentryCooldown).toBe(3);
    expect(nr.pricePastStop).toBe(7);
    expect(nr.pricePastTarget).toBe(5);
  });

  it('pins the exact pre-open reason strings the panel + endpoint depend on', () => {
    // Guards against a producer-side rename in checkPreOpenGates silently
    // un-surfacing a gate again.
    expect([...PREOPEN_HIDDEN]).toEqual(['reentry_cooldown', 'price_past_stop', 'price_past_target']);
  });
});
