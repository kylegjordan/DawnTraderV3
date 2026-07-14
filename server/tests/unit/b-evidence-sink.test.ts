/**
 * B-EVIDENCE-SINK — switch-on-evidence-sink unit tests (CC-A 2026-07-14).
 *
 * Verifies:
 * - each emit builds the correct row shape for its proof_type (discriminated, superset-nullable)
 * - the sequence-backed evidence_id is left undefined (→ SQL DEFAULT)
 * - the maker/taker row carries the full haircut snapshot (Phase-25 pFill-calibration substrate)
 * - ISOLATION (Langston Flag A): a throw inside the enqueue path is SWALLOWED — the emit never
 *   throws into the live decision (degrades to the caller's console.log).
 *
 * The batch writer is mocked so this exercises the emit/row-shape logic, not the DB write path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../services/data-archive/archive-batch-writer.js', () => ({
  registerArchiveTable: vi.fn(),
  enqueueArchiveRow: vi.fn(() => true),
}));

import { enqueueArchiveRow, registerArchiveTable } from '../../services/data-archive/archive-batch-writer.js';
import {
  registerSwitchOnEvidenceSink,
  emitSqeShadow,
  emitEvReject,
  emitMakerTaker,
} from '../../services/data-archive/switch-on-evidence-sink.js';

const TABLE = 'switch_on_shadow_evidence';
const ctx = { symbol: 'BTC/USD', strategy: 'vwap_pullback', assetClass: 'crypto_spot', regime: 'ST', sourcePool: 'quant-strong_trend', mode: 'paper' };

describe('B-EVIDENCE-SINK — switch-on-evidence-sink', () => {
  beforeEach(() => {
    vi.mocked(enqueueArchiveRow).mockClear();
    vi.mocked(enqueueArchiveRow).mockImplementation(() => true);
  });

  it('registers the table with evidence_id defaulted', () => {
    registerSwitchOnEvidenceSink();
    expect(registerArchiveTable).toHaveBeenCalledWith(TABLE, expect.any(Array), ['evidence_id']);
  });

  it('emitSqeShadow builds a sqe_shadow row (would_have_rejected computed) with evidence_id undefined', () => {
    emitSqeShadow(ctx, { finalScore: 0.20, threshold: 0.35 });
    expect(enqueueArchiveRow).toHaveBeenCalledWith(TABLE, expect.objectContaining({
      proof_type: 'sqe_shadow', symbol: 'BTC/USD', strategy: 'vwap_pullback', asset_class: 'crypto_spot',
      regime: 'ST', source_pool: 'quant-strong_trend', mode: 'paper',
      final_score: 0.20, final_score_threshold: 0.35, would_have_rejected: true,
      chosen_net_ev: null, chosen_entry_mode: null,
    }));
    const row = vi.mocked(enqueueArchiveRow).mock.calls[0][1] as Record<string, unknown>;
    expect(row.evidence_id).toBeUndefined();
    expect(typeof row.captured_at).toBe('string');
  });

  it('emitEvReject builds an ev_reject row with the offending netEV', () => {
    emitEvReject(ctx, { chosenNetEv: -0.0031, rejectReason: 'non-positive after friction' });
    expect(enqueueArchiveRow).toHaveBeenCalledWith(TABLE, expect.objectContaining({
      proof_type: 'ev_reject', chosen_net_ev: -0.0031, reject_reason: 'non-positive after friction',
      final_score: null, chosen_entry_mode: null,
    }));
  });

  it('emitMakerTaker carries the full haircut snapshot (pFill-calibration substrate)', () => {
    emitMakerTaker(ctx, {
      chosenEntryMode: 'taker', takerNetEv: 0.97, makerNetEvAdjusted: -7.41,
      signalStrength: 0.295, adverseSelectionPct: 0.0025, nonFillCostPct: 0.0010,
      makerFillProbability: 0.50, hardFloorFired: false,
    });
    expect(enqueueArchiveRow).toHaveBeenCalledWith(TABLE, expect.objectContaining({
      proof_type: 'maker_taker', chosen_entry_mode: 'taker', taker_net_ev: 0.97, maker_net_ev_adjusted: -7.41,
      signal_strength: 0.295, adverse_selection_pct: 0.0025, non_fill_cost_pct: 0.0010,
      maker_fill_probability: 0.50, hard_floor_fired: false, chosen_net_ev: null,
    }));
  });

  it('ISOLATION: a throw in enqueue is swallowed — the emit never throws (Flag A)', () => {
    vi.mocked(enqueueArchiveRow).mockImplementation(() => { throw new Error('sink DOWN'); });
    expect(() => emitSqeShadow(ctx, { finalScore: 0.2, threshold: 0.35 })).not.toThrow();
    expect(() => emitEvReject(ctx, { chosenNetEv: -0.01 })).not.toThrow();
    expect(() => emitMakerTaker(ctx, { chosenEntryMode: 'maker', takerNetEv: 1, makerNetEvAdjusted: 2 })).not.toThrow();
  });
});
