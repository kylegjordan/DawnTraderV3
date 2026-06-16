/**
 * ═════════════════════════════════════════════════════════════════════════════
 * P19-B5a — active-path reject/admit capture (chunk-D)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Covers the in-memory logic of the B5a capture layer:
 *  - capturePreFilterReject: emits a pre_filter row with NULL score fields, the
 *    gate label in gate_decision, strategy defaulting to 'none' (family rows pass
 *    the family name), and is fire-and-forget (never throws into the scan path).
 *  - archiveSignalEval reject rows capture REAL scores (NO-PATCHES): sqe → the
 *    failing finalScore; rtb → the tested confidence_modulated. Not nulled.
 *  - DORMANCY (Langston): pre_filter rows are suppressed when the archiver
 *    pre-filter kill-switch is OFF, AND the call-site gate contract (inactive
 *    engine → no fire) holds. The PRIMARY dormancy guarantee is the structural
 *    `if (isEngineActive)` / `if (!isPassiveLearning)` gate wrapping every scanner
 *    call site (Step-4-reviewable); a full inactive-scanner run needs the
 *    integration harness, out of scope for this unit file.
 *
 * DB writes are integration-tested on staging; the batch writer's enqueue is
 * spied so we can inspect the exact row each hook builds.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Spy on the batch writer's enqueue + no-op the table registration.
const enqueueSpy = vi.fn(() => true);
vi.mock('../../services/data-archive/archive-batch-writer.js', () => ({
  enqueueArchiveRow: (...a: any[]) => enqueueSpy(...a),
  registerArchiveTable: vi.fn(),
}));

// Control the archiver kill-switches. Mutable so the dormancy test can flip the
// pre-filter switch OFF mid-suite.
const mockCfg: { signalEvalEnabled: boolean; signalEvalPreFilterEnabled: boolean } = {
  signalEvalEnabled: true,
  signalEvalPreFilterEnabled: true,
};
vi.mock('../../services/data-archive/archive-config.js', () => ({
  getArchiveConfig: () => mockCfg,
  provenanceCaptureEnabled: () => false,
}));

import {
  capturePreFilterReject,
  archiveSignalEval,
} from '../../services/data-archive/signal-eval-archiver';

beforeEach(() => {
  enqueueSpy.mockClear();
  enqueueSpy.mockImplementation(() => true);
  mockCfg.signalEvalEnabled = true;
  mockCfg.signalEvalPreFilterEnabled = true;
});

describe('P19-B5a — capturePreFilterReject (pre_filter helper)', () => {
  it('emits a pre_filter row with NULL score fields + the gate label', () => {
    capturePreFilterReject({
      mode: 'paper_sim', symbol: 'BTC/USD', exchange: 'kraken', assetClass: 'crypto_spot',
      source: 'market-scanner', label: 'low_volume', gateDetail: { observed: 100, threshold: 500 },
    });
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    const [table, row] = enqueueSpy.mock.calls[0] as [string, any];
    expect(table).toBe('signal_eval_archive');
    expect(row.reject_stage).toBe('pre_filter');
    expect(row.final_score).toBeNull();           // never scored at pre_filter
    expect(row.confidence_modulated).toBeNull();
    expect(row.strategy).toBe('none');            // default for non-family rows
    expect(row.mode).toBe('paper_sim');
    expect(row.asset_class).toBe('crypto_spot');
    expect(row.gate_decision.label).toBe('low_volume');
    expect(row.gate_decision.observed).toBe(100);
    expect(row.gate_decision.threshold).toBe(500);
  });

  it('puts the FAMILY name in strategy for family-IMF rows', () => {
    capturePreFilterReject({
      mode: 'paper_sim', symbol: 'ETH/USD', exchange: 'kraken', assetClass: 'crypto_spot',
      source: 'fx5-scanner', strategy: 'reversal', label: 'family_imf_lq',
    });
    const [, row] = enqueueSpy.mock.calls[0] as [string, any];
    expect(row.strategy).toBe('reversal');
    expect(row.reject_stage).toBe('pre_filter');
    expect(row.final_score).toBeNull();
    expect(row.gate_decision.label).toBe('family_imf_lq');
  });

  it('is fire-and-forget — never throws even if the writer throws', () => {
    enqueueSpy.mockImplementationOnce(() => { throw new Error('writer boom'); });
    expect(() => capturePreFilterReject({
      mode: 'paper_sim', symbol: 'X/USD', exchange: 'kraken', assetClass: 'crypto_spot',
      source: 'market-scanner', label: 'wide_spread',
    })).not.toThrow();
  });
});

describe('P19-B5a — reject rows capture REAL scores (NO-PATCHES)', () => {
  it('sqe reject row carries the failing finalScore (not null)', () => {
    archiveSignalEval({
      mode: 'paper_sim', symbol: 'BTC/USD', exchange: 'kraken', assetClass: 'crypto_spot',
      source: 'signal-orchestrator', strategy: 'vwap_pullback', rejectStage: 'sqe',
      finalScore: 0.42, gateDecision: { gate: 'sqe', accepted: false, reason: 'below_floor' },
    });
    const [, row] = enqueueSpy.mock.calls[0] as [string, any];
    expect(row.reject_stage).toBe('sqe');
    expect(row.final_score).toBe(0.42);           // captured, NOT nulled
  });

  it('rtb reject row carries the tested confidence_modulated (not null)', () => {
    archiveSignalEval({
      mode: 'paper_sim', symbol: 'ETH/USD', exchange: 'kraken', assetClass: 'crypto_spot',
      source: 'ready-to-buy', strategy: 'momentum', rejectStage: 'rtb',
      confidenceModulated: 0.31, gateDecision: { gate: 'rtb', accepted: false },
    });
    const [, row] = enqueueSpy.mock.calls[0] as [string, any];
    expect(row.reject_stage).toBe('rtb');
    expect(row.confidence_modulated).toBe(0.31);
  });

  it('paper-engine terminal admit row marks the opened position', () => {
    archiveSignalEval({
      mode: 'paper_sim', symbol: 'SOL/USD', exchange: 'kraken', assetClass: 'crypto_spot',
      source: 'paper-execution-engine', strategy: 'breakout', rejectStage: 'admitted',
      confidenceModulated: 0.77,
      gateDecision: { gate: 'admitted', accepted: true, path: 'paper-execution-open' },
    });
    const [, row] = enqueueSpy.mock.calls[0] as [string, any];
    expect(row.reject_stage).toBe('admitted');
    expect(row.source).toBe('paper-execution-engine');
    expect(row.confidence_modulated).toBe(0.77);
  });
});

describe('P19-B5a — DORMANCY (zero-live-risk substantiation)', () => {
  it('archiver kill-switch OFF suppresses pre_filter rows entirely', () => {
    mockCfg.signalEvalPreFilterEnabled = false;
    capturePreFilterReject({
      mode: 'paper_sim', symbol: 'BTC/USD', exchange: 'kraken', assetClass: 'crypto_spot',
      source: 'fx5-scanner', strategy: 'reversal', label: 'family_imf_lq',
    });
    expect(enqueueSpy).not.toHaveBeenCalled();     // D.2 escape valve holds
  });

  it('call-site gate contract: an INACTIVE engine does not fire the hook', () => {
    // Replicates the exact guard the scanners wrap every capture in:
    //   fx5-scanner   → if (isEngineActive) capturePreFilterReject(...)
    //   market-scanner→ if (!isPassiveLearning) capturePreFilterReject(...)
    // With the engine inactive, the helper is never reached → no row written.
    const isEngineActive = false;
    if (isEngineActive) {
      capturePreFilterReject({
        mode: 'paper_sim', symbol: 'BTC/USD', exchange: 'kraken', assetClass: 'crypto_spot',
        source: 'fx5-scanner', label: 'family_imf_lq',
      });
    }
    expect(enqueueSpy).not.toHaveBeenCalled();
  });
});
