/**
 * B-FILTER-DIAG-STANDARDIZE — fence tests for the SHARED classifier (Langston Step-2 rider R3).
 *
 * The classifier is shared precisely so the engine and the UI cannot disagree about what a gate id
 * or a lane means. These tests pin that: the canonical sets must be EQUAL, the free-text prefix match
 * must behave identically to the engine's, and the Net-EV display label must be the VTS label verbatim
 * (Kyle's "same fields, same display" is satisfied at the label or not at all).
 */
import { describe, it, expect } from 'vitest';
import {
  SQE_GATE_IDS, classifySqeGate, sqeGateLabel, isQuantLane, laneBucket,
} from '@shared/sqe-gate-classifier';
import { SQE_CANONICAL_GATES, extractSqeGateId } from '../../core/observability/active-funnel-tracker.js';

describe('B-FILTER-DIAG-STANDARDIZE — shared SQE gate classifier', () => {
  it('the shared canonical set EQUALS the engine set (drift here = a confident number under the wrong label)', () => {
    expect([...SQE_GATE_IDS].sort()).toEqual([...SQE_CANONICAL_GATES].sort());
  });

  it('classifies the REAL live reason string to NetEV (the string is prose, so this is the pinned contract)', () => {
    const live = 'NetEV -0.011175 <= 0 (chosen maker mode — non-positive net expectancy after friction)';
    expect(classifySqeGate(live)).toBe('NetEV');
    // and it must agree with the engine's own extractor on the same input
    expect(classifySqeGate(live)).toBe(extractSqeGateId(live));
  });

  it('agrees with the engine extractor across every canonical gate', () => {
    for (const gate of SQE_CANONICAL_GATES) {
      const reason = `${gate} some trailing prose that must not matter`;
      expect(classifySqeGate(reason)).toBe(extractSqeGateId(reason));
    }
  });

  it('buckets an unknown token as uncategorized, on BOTH sides', () => {
    const r = 'SomeBrandNewGate blah';
    expect(classifySqeGate(r)).toBe('uncategorized');
    expect(extractSqeGateId(r)).toBe('uncategorized');
  });

  it('handles null/undefined/empty without throwing (renderers pass whatever the payload had)', () => {
    expect(classifySqeGate(null)).toBe('uncategorized');
    expect(classifySqeGate(undefined)).toBe('uncategorized');
    expect(classifySqeGate('')).toBe('uncategorized');
  });

  it('★ the Net-EV row reads the VTS label VERBATIM from either lane key', () => {
    expect(sqeGateLabel('NetEV')).toBe('Net EV Below Floor');
    expect(sqeGateLabel('Net_EV_Negative')).toBe('Net EV Below Floor');
  });

  it('the withdrawn meaningless label can never come back', () => {
    for (const id of [...SQE_GATE_IDS, 'uncategorized', 'anything-else']) {
      expect(sqeGateLabel(id)).not.toMatch(/Pre-promotion/i);
    }
    expect(sqeGateLabel('uncategorized')).toBe('Unrecognised reason token');
  });
});

describe('B-FILTER-DIAG-STANDARDIZE — the lane rule (absence IS the quant marker)', () => {
  it('mirrors isQuantPool: absent/quant/quant-* are QUANT', () => {
    expect(isQuantLane(null)).toBe(true);
    expect(isQuantLane(undefined)).toBe(true);
    expect(isQuantLane('')).toBe(true);
    expect(isQuantLane('quant')).toBe(true);
    expect(isQuantLane('quant-trend')).toBe(true);
  });

  it('pattern is NOT quant', () => {
    expect(isQuantLane('pattern')).toBe(false);
    expect(laneBucket('pattern')).toBe('pattern');
  });

  it('★ a NULL sourcePool buckets to QUANT — reading it as "unrecorded" cost a scope amendment', () => {
    expect(laneBucket(null)).toBe('quant');
    expect(laneBucket(undefined)).toBe('quant');
  });

  it('xStock family lanes are quant families, not pattern', () => {
    expect(laneBucket('xstock-trend')).toBe('quant');
    expect(laneBucket('xstock-strong_trend')).toBe('quant');
  });
});
