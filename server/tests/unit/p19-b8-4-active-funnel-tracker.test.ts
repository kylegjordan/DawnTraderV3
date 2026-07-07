/**
 * P19-B8.4 Part-2 — active-funnel-tracker (S21) unit + synthetic-emit proof.
 *
 * The counters are ZERO until active trading turns on at B8.5, so "the numbers are zero" cannot distinguish
 * WIRED from NOT-WIRED (Langston §6/§9.7). This is the test-only synthetic injection that proves the
 * plumbing: it drives the writers directly and asserts the read path returns the expected (mode,assetClass)-
 * keyed breakdown, the SQE gate-id derivation (canonical + uncategorized), and the honest SQE double-count.
 * It NEVER touches a production emit point.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordActiveSignalsGenerated,
  recordActivePreSqeReject,
  recordActiveSqeEvaluation,
  recordActiveRtbRefresh,
  getActiveFunnelStats,
  hasActiveFunnelActivity,
  getActiveFunnelStartedAt,
  extractSqeGateId,
  resetActiveFunnelStats,
  reloadCheckpointFromDisk,
  _writeRawCheckpointForTest,
  ACTIVE_FUNNEL_KEY_SCHEMA,
  SQE_CANONICAL_GATES,
} from '../../core/observability/active-funnel-tracker.js';

describe('P19-B8.4 active-funnel-tracker (S21)', () => {
  beforeEach(() => resetActiveFunnelStats());

  it('is dormant (all zeros, no activity, null startedAt) before any write', () => {
    expect(getActiveFunnelStartedAt()).toBeNull();
    const s = getActiveFunnelStats('paper', 'crypto_spot');
    expect(s.signalsGenerated).toBe(0);
    expect(s.sqeEvaluated).toBe(0);
    expect(Object.keys(s.preSqeRejects)).toHaveLength(0);
    expect(s.rtbRefresh.cyclesRun).toBe(0);
    expect(hasActiveFunnelActivity('paper', 'crypto_spot')).toBe(false);
  });

  it('keys on (mode, assetClass) 2×2 — no cross-contamination (the bug B8.4 fixes)', () => {
    recordActiveSignalsGenerated('paper', 'crypto_spot', 5);
    recordActiveSignalsGenerated('paper', 'xstock_spot', 3);
    recordActiveSignalsGenerated('live', 'crypto_spot', 7);
    expect(getActiveFunnelStats('paper', 'crypto_spot').signalsGenerated).toBe(5);
    expect(getActiveFunnelStats('paper', 'xstock_spot').signalsGenerated).toBe(3);
    expect(getActiveFunnelStats('live', 'crypto_spot').signalsGenerated).toBe(7);
    expect(getActiveFunnelStats('live', 'xstock_spot').signalsGenerated).toBe(0); // untouched cell stays 0
    expect(getActiveFunnelStartedAt()).not.toBeNull(); // a write stamps the window start
  });

  it('records pre-SQE rejects by reason AND by strategy', () => {
    recordActivePreSqeReject('paper', 'crypto_spot', 'strategy_gate', 'vwap_pullback');
    recordActivePreSqeReject('paper', 'crypto_spot', 'strategy_gate', 'vwap_pullback');
    recordActivePreSqeReject('paper', 'crypto_spot', 'reachability', 'abcd_long');
    recordActivePreSqeReject('paper', 'crypto_spot', 'sizing_zero'); // no strategy
    const s = getActiveFunnelStats('paper', 'crypto_spot');
    expect(s.preSqeRejects).toEqual({ strategy_gate: 2, reachability: 1, sizing_zero: 1 });
    expect(s.preSqeRejectsByStrategy.vwap_pullback).toEqual({ strategy_gate: 2 });
    expect(s.preSqeRejectsByStrategy.abcd_long).toEqual({ reachability: 1 });
    expect(s.preSqeRejectsByStrategy.sizing_zero).toBeUndefined(); // strategy-less reject not bucketed by strategy
  });

  it('extractSqeGateId: canonical tokens key stably (delimiter contract), unknown → uncategorized', () => {
    expect(extractSqeGateId('FinalScore 0.2500 < 0.35 (quant threshold)')).toBe('FinalScore');
    expect(extractSqeGateId('RegimeWeight 0.20 < 0.30')).toBe('RegimeWeight');
    expect(extractSqeGateId('ROI 1.20% < 2.00% for TFS')).toBe('ROI');
    expect(extractSqeGateId('Confidence 0.40 < floor 0.55 (mode=paper)')).toBe('Confidence');
    expect(extractSqeGateId('AMR hard_pause: no live weather read')).toBe('AMR');
    expect(extractSqeGateId('Governance: my_strat (HIGH dep) blocked in UNSTABLE')).toBe('Governance');
    expect(extractSqeGateId('unclassifiable_asset_class')).toBe('unclassifiable_asset_class');
    expect(extractSqeGateId('xstock_weekend_closure')).toBe('xstock_weekend_closure');
    expect(extractSqeGateId('asset_class_disabled:xstock_spot')).toBe('asset_class_disabled'); // colon-delimited
    // rename-safety: a reworded reason whose first token is unknown lands in uncategorized (surfaced, not silent)
    expect(extractSqeGateId('SomeNewGate 0.1 < 0.2')).toBe('uncategorized');
    // every canonical id is self-mapping (guards the set stays in sync with itself)
    for (const g of SQE_CANONICAL_GATES) expect(extractSqeGateId(g)).toBe(g);
  });

  it('records SQE per-gate rejects (multi-failure) + pass/fail denominator + honest double-count by phase', () => {
    // generation-phase: 1 pass, 1 fail on two gates
    recordActiveSqeEvaluation('paper', 'crypto_spot', true, undefined, 'generation');
    recordActiveSqeEvaluation('paper', 'crypto_spot', false, ['FinalScore 0.1 < 0.35', 'RegimeWeight 0.2 < 0.30'], 'generation');
    // refresh-phase: the SAME signal re-SQE'd later, fails ROI
    recordActiveSqeEvaluation('paper', 'crypto_spot', false, ['ROI 1.0% < 2.0% for TFS'], 'refresh');
    const s = getActiveFunnelStats('paper', 'crypto_spot');
    expect(s.sqeEvaluated).toBe(3);
    expect(s.sqePassed).toBe(1);
    expect(s.sqeGateRejects).toEqual({ FinalScore: 1, RegimeWeight: 1, ROI: 1 });
    // MUST-4: two labelled numbers, never summed
    expect(s.sqeAttempts).toEqual({ atGeneration: 2, atRefresh: 1 });
  });

  it('accumulates RTB-refresh counters (single home, partial deltas add)', () => {
    recordActiveRtbRefresh('paper', 'crypto_spot', { cyclesRun: 1, refreshedAttempted: 4, reconfirmed: 3, rejectedInRefresh: 1 });
    recordActiveRtbRefresh('paper', 'crypto_spot', { cyclesRun: 1, promoted: 2 });
    const s = getActiveFunnelStats('paper', 'crypto_spot');
    expect(s.rtbRefresh).toEqual({ cyclesRun: 2, refreshedAttempted: 4, reconfirmed: 3, rejectedInRefresh: 1, promoted: 2 });
    expect(hasActiveFunnelActivity('paper', 'crypto_spot')).toBe(true);
  });

  it('getActiveFunnelStats returns a deep copy — callers cannot mutate the singleton', () => {
    recordActivePreSqeReject('paper', 'crypto_spot', 'strategy_gate', 'vwap_pullback');
    const s = getActiveFunnelStats('paper', 'crypto_spot');
    s.preSqeRejects.strategy_gate = 999;
    s.rtbRefresh.promoted = 999;
    const fresh = getActiveFunnelStats('paper', 'crypto_spot');
    expect(fresh.preSqeRejects.strategy_gate).toBe(1);
    expect(fresh.rtbRefresh.promoted).toBe(0);
  });

  // ── MUST-2 / MUST-3: the durable-restart guarantee (the safety-critical property — a post-deploy zero
  //    must read as "nothing ran", not "everything rejected"). Langston Step-4 "strongly prefer". ──────
  describe('checkpoint reload (restart durability)', () => {
    it('restores counts AND startedAt from a valid same-schema checkpoint', () => {
      _writeRawCheckpointForTest({
        keySchema: ACTIVE_FUNNEL_KEY_SCHEMA,
        startedAt: '2026-01-01T00:00:00.000Z',
        stats: { 'paper::crypto_spot': { signalsGenerated: 42, sqeEvaluated: 10, sqePassed: 4 } },
      });
      reloadCheckpointFromDisk();
      expect(getActiveFunnelStartedAt()).toBe('2026-01-01T00:00:00.000Z'); // window continues across restart
      const s = getActiveFunnelStats('paper', 'crypto_spot');
      expect(s.signalsGenerated).toBe(42);
      expect(s.sqeEvaluated).toBe(10);
      expect(s.sqePassed).toBe(4);
      // absent nested fields fill from blank (no undefined leaks)
      expect(s.rtbRefresh).toEqual({ cyclesRun: 0, refreshedAttempted: 0, reconfirmed: 0, rejectedInRefresh: 0, promoted: 0 });
    });

    it('DISCARDS a mismatched-keySchema checkpoint → fresh window (no restore)', () => {
      _writeRawCheckpointForTest({
        keySchema: 'SOME_OLD_SCHEMA/v0',
        startedAt: '2020-01-01T00:00:00.000Z',
        stats: { 'paper::crypto_spot': { signalsGenerated: 999 } },
      });
      reloadCheckpointFromDisk();
      expect(getActiveFunnelStartedAt()).toBeNull();               // NOT seeded from a stale-cardinality file
      expect(getActiveFunnelStats('paper', 'crypto_spot').signalsGenerated).toBe(0);
    });

    it('DISCARDS an orphan/unknown-key bucket but keeps the valid ones (Langston hardening)', () => {
      _writeRawCheckpointForTest({
        keySchema: ACTIVE_FUNNEL_KEY_SCHEMA,
        startedAt: '2026-01-01T00:00:00.000Z',
        stats: {
          'paper::crypto_spot': { signalsGenerated: 7 },   // valid
          'paper::bogus_class': { signalsGenerated: 5 },   // orphan assetClass → dropped
          'staging::crypto_spot': { signalsGenerated: 3 }, // orphan mode → dropped
        },
      });
      reloadCheckpointFromDisk();
      expect(getActiveFunnelStats('paper', 'crypto_spot').signalsGenerated).toBe(7);
      expect(hasActiveFunnelActivity('paper' as any, 'bogus_class' as any)).toBe(false);
      // the two orphan buckets were not loaded (only the one valid key restored)
    });
  });
});
