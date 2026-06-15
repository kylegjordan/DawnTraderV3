/**
 * P19-B4b D5 — paper/live split-brain isolation tests.
 *
 * Covers the Phase-21 co-run WITNESS (the H2 liveness invariant-check) and the per-mode
 * isolation of the two worst split-brain singletons (S1 portfolio manager, S4 risk-concentration).
 * Langston Step-4 required these in-batch: the witness gates the Phase-21 flip, so it cannot ship
 * untested.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isFlipSettled, livenessSplitsForMode } from '../../services/trading-state-sync.js';

// risk-concentration's config getter resolves three thresholds from module_constants; in a headless
// unit test the cache is empty, so override just that resolver (preserve every other export).
vi.mock('../../services/module-constants-service.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const defaults: Record<string, number> = {
    correlation_threshold: 0.7,
    max_concentration_score: 2.0,
    min_scaling_factor: 0.5,
  };
  return {
    ...actual,
    getCachedNumberRequired: (_module: string, key: string) => defaults[key] ?? 1,
  };
});

describe('P19-B4b D5 — liveness invariant witness (H2)', () => {
  it('split FIRES when the DB SSOT disagrees with engine presence', () => {
    // DB says active but the engine is absent → divergence
    expect(livenessSplitsForMode('paper', true, false, true)).toHaveLength(1);
    // DB says inactive but the engine is present → divergence
    expect(livenessSplitsForMode('live', false, true, null)).toHaveLength(1);
  });

  it('NO split when the DB SSOT agrees with engine (and orchestrator) presence', () => {
    expect(livenessSplitsForMode('paper', true, true, true)).toHaveLength(0);
    expect(livenessSplitsForMode('live', false, false, null)).toHaveLength(0);
  });

  it('paper also checks orchestrator presence; live (null) does not', () => {
    // engine agrees but orchestrator disagrees → one split, keyed paper-orchestrator
    const paper = livenessSplitsForMode('paper', true, true, false);
    expect(paper.map(s => s.key)).toEqual(['paper-orchestrator']);
    // live passes orchestratorPresent=null → never produces an orchestrator split
    expect(livenessSplitsForMode('live', true, true, false)).toHaveLength(0);
  });

  it('settling SUPPRESSES the check within the window and allows it after', () => {
    const now = 1_000_000;
    const settlingMs = 15_000;
    expect(isFlipSettled(now, now - 5_000, settlingMs)).toBe(false);   // 5s ago → in-flight, suppress
    expect(isFlipSettled(now, now - 20_000, settlingMs)).toBe(true);   // 20s ago → settled, run check
    expect(isFlipSettled(now, 0, settlingMs)).toBe(true);              // never flipped → settled
  });
});

describe('P19-B4b D5 — risk-concentration per-mode isolation (S4 no-clobber)', () => {
  let analyzer: any;
  beforeEach(async () => {
    ({ riskConcentrationAnalyzer: analyzer } = await import('../../services/risk-concentration.js'));
    analyzer.reset(); // clear all modes
  });

  it('paper and live position weights do not clobber each other', () => {
    analyzer.updatePositionWeights('paper', { 'BTC/USD': 100, 'ETH/USD': 50 });
    analyzer.updatePositionWeights('live', { 'SOL/USD': 200 });
    expect(analyzer.getDiagnostics('paper').positionCount).toBe(2);
    expect(analyzer.getDiagnostics('live').positionCount).toBe(1);
  });

  it('resetting one mode leaves the other intact', () => {
    analyzer.updatePositionWeights('paper', { 'BTC/USD': 100 });
    analyzer.updatePositionWeights('live', { 'SOL/USD': 200 });
    analyzer.reset('paper');
    expect(analyzer.getDiagnostics('paper').positionCount).toBe(0);
    expect(analyzer.getDiagnostics('live').positionCount).toBe(1);
  });
});

describe('P19-B4b D5 — paper-sim manager per-mode isolation (S1)', () => {
  it('paper and live managers occupy separate slots', async () => {
    const { getGlobalPaperSimManager, setGlobalPaperSimManager, clearGlobalPaperSimManager } =
      await import('../../services/paper-sim-service.js');
    clearGlobalPaperSimManager('paper');
    clearGlobalPaperSimManager('live');

    const paperMgr = { id: 'paper-mgr' };
    const liveMgr = { id: 'live-mgr' };
    setGlobalPaperSimManager(paperMgr, 'paper');
    setGlobalPaperSimManager(liveMgr, 'live');

    expect(getGlobalPaperSimManager('paper')).toBe(paperMgr);
    expect(getGlobalPaperSimManager('live')).toBe(liveMgr);
    expect(getGlobalPaperSimManager()).toBe(paperMgr); // default mode = paper (back-compat)

    clearGlobalPaperSimManager('paper');
    expect(getGlobalPaperSimManager('paper')).toBeNull();
    expect(getGlobalPaperSimManager('live')).toBe(liveMgr); // unaffected by clearing paper
    clearGlobalPaperSimManager('live');
  });
});
