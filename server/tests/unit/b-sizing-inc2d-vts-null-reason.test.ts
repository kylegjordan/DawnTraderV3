/**
 * B-SIZING-DEC-RESTORE increment 2d — Langston Step-4 FINDING-3: how the VTS counts and archives a null reason.
 * A post-signal rejection (the strategy produced a signal; a later gate refused it) is counted as `rejected` and archived
 * under that gate's stage; everything else is a true strategy null. The per-underlying cap's three refusals were counted
 * as strategy nulls, so a config outage read as "the strategy found nothing" in the population `#1070` reads.
 * These are BEHAVIOUR tests: they call the one function the VTS loop calls (classifyVtsNullReason).
 */
import { describe, it, expect } from 'vitest';
import { classifyVtsNullReason } from '../../services/vts-runner.js';

describe('classifyVtsNullReason — one table for the counter and the archived stage', () => {
  // MUTATION: remove any of the three cap rows from VTS_POST_SIGNAL_STAGE and its case fails.
  it('all three per-underlying-cap refusals are post-signal rejections at the capacity (tcl) stage', () => {
    for (const r of ['per_underlying_cap', 'per_underlying_cap_unavailable_config_missing', 'per_underlying_cap_unavailable_lookup_failed']) {
      expect(classifyVtsNullReason(r), r).toEqual({ isPostSignalRejection: true, stage: 'tcl' });
    }
  });

  it('CONTROL: the three reasons the table always held keep their stage (no behaviour change)', () => {
    expect(classifyVtsNullReason('net_ev_rejected')).toEqual({ isPostSignalRejection: true, stage: 'sqe' });
    expect(classifyVtsNullReason('duplicate_position')).toEqual({ isPostSignalRejection: true, stage: 'tcl' });
    expect(classifyVtsNullReason('max_open_trades')).toEqual({ isPostSignalRejection: true, stage: 'tcl' });
  });

  it('a true strategy null stays a strategy null — including an inherited object key', () => {
    for (const r of ['conditions_not_met', '', 'constructor', 'toString']) {
      expect(classifyVtsNullReason(r), JSON.stringify(r)).toEqual({ isPostSignalRejection: false, stage: 'strategy_internal' });
    }
  });
});
