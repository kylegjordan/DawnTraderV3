// B-CALSCORE — Calibration Scoreboard formatter unit tests.
// The DB-dependent assertions (seeded rows present, empty-state for an unknown
// asset_class, unique-constraint/idempotent re-seed) are verified on STAGING
// (psql + Claude-in-Chrome UI per scope §5) since they exercise real DB behavior;
// these vitest cases cover the pure formatter incl. the pg string-coercion guard.
import { describe, it, expect } from 'vitest';
import { fmtCalibrationResult } from '../../../shared/calscore-format.js';

describe('B-CALSCORE fmtCalibrationResult', () => {
  it('renders the rate with raw counts beside it (clean math)', () => {
    expect(fmtCalibrationResult(1, 4)).toBe('25.00% (1/4)');
  });

  it('Number()-coerces STRING inputs (pg returns numeric/bigint as strings) — C5 guard', () => {
    expect(fmtCalibrationResult('1', '4')).toBe('25.00% (1/4)');
    // real seeded row as strings: must be a true rate + comma-grouped raw counts, not string concat
    expect(fmtCalibrationResult('18103', '56725')).toMatch(/^\d+\.\d{2}% \(18,103\/56,725\)$/);
  });

  it('treats a real 0 numerator as 0.00% (the corr_max dead-gate row), NOT em-dash', () => {
    expect(fmtCalibrationResult(0, 283625)).toBe('0.00% (0/283,625)');
    expect(fmtCalibrationResult('0', '283625')).toBe('0.00% (0/283,625)');
  });

  it('returns em-dash when a side is missing or the denominator is 0 (empty planned side)', () => {
    expect(fmtCalibrationResult(null, null)).toBe('—');
    expect(fmtCalibrationResult(5, 0)).toBe('—');
    expect(fmtCalibrationResult('', '')).toBe('—');
    expect(fmtCalibrationResult(10, undefined)).toBe('—');
  });
});
