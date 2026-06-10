/**
 * B-4.5 R1 (Langston amendment 2) — validator fee-override semantics lock.
 *
 * The system_context fee columns are an OPERATOR OVERRIDE surface: NULL means
 * "no override — use the DB-governed per-class fee_model rates"; any explicit
 * value — INCLUDING ZERO (Kraken promo tiers exist) — wins. The check must be
 * an explicit null check; a truthiness check would swallow a legitimate 0.
 * Active trading is OFF, so this path gets no live exercise — this lock is
 * how the R1 ships verified rather than presumed.
 */
import { describe, it, expect } from 'vitest';
import { resolveValidatorFeeRates } from '../../services/pre-execution-validator.js';

const FRICTION = { feeRateMaker: 0.004, feeRateTaker: 0.008 }; // resolved Tier-1

describe('B-4.5 R1: validator fee override-wins semantics', () => {
  it('NULL / absent overrides fall through to the resolved per-class rates', () => {
    expect(resolveValidatorFeeRates({ makerFeePct: null, takerFeePct: null }, FRICTION))
      .toEqual({ makerFeePct: 0.004, takerFeePct: 0.008 });
    expect(resolveValidatorFeeRates({}, FRICTION))
      .toEqual({ makerFeePct: 0.004, takerFeePct: 0.008 });
    expect(resolveValidatorFeeRates(null, FRICTION))
      .toEqual({ makerFeePct: 0.004, takerFeePct: 0.008 });
  });

  it('explicit operator overrides win over the resolved rates', () => {
    expect(resolveValidatorFeeRates({ makerFeePct: '0.0010', takerFeePct: '0.0020' }, FRICTION))
      .toEqual({ makerFeePct: 0.001, takerFeePct: 0.002 });
  });

  it('an explicit ZERO override wins (null-check, not truthiness)', () => {
    expect(resolveValidatorFeeRates({ makerFeePct: '0', takerFeePct: '0.0000' }, FRICTION))
      .toEqual({ makerFeePct: 0, takerFeePct: 0 });
  });

  it('mixed: one override set, the other falls through', () => {
    expect(resolveValidatorFeeRates({ takerFeePct: '0.0050' }, FRICTION))
      .toEqual({ makerFeePct: 0.004, takerFeePct: 0.005 });
  });
});
