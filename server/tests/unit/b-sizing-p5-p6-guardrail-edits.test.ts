/**
 * B-SIZING-DEC-RESTORE P5 + P6 (PRE_AUDIT §13 F7, F8, F13) — a hand-edited sizing % is bounded,
 * never masked, and every changed field gets an audit row.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../storage', () => ({ storage: {} }));

import { guardrailPolicy } from '../../services/guardrail-policy';
import { buildGuardrailAuditEntries } from '../../services/guardrail-audit';

const fails = (payload: Record<string, unknown>) =>
  guardrailPolicy.validate({ mode: 'paper', ...payload } as any).failures.map((f) => f.ruleId);

describe('P5 — both sizing percentages are bounded to 0 < x <= 100 (RULE_012 / RULE_013)', () => {
  // CONTROL: a valid pair passes both rules, so a failure below is the value's doing.
  it('CONTROL — 5 / 100 passes', () => {
    const f = fails({ maxPositionPercentPct: 5, maxTotalExposurePct: 100 });
    expect(f).not.toContain('RULE_012');
    expect(f).not.toContain('RULE_013');
  });

  // MUTATION: delete the RULE_012 loop entry and these fail.
  it.each([[0], [-1], [500], [100.01], [Number.NaN], ['']])('position % %s is refused', (v) => {
    expect(fails({ maxPositionPercentPct: v })).toContain('RULE_012');
  });

  it.each([[0], [150], ['abc']])('exposure % %s is refused', (v) => {
    expect(fails({ maxTotalExposurePct: v })).toContain('RULE_013');
  });

  // F13: the sizer is B x e x p, so p above e is coherent — today's LIVE row (30 / 25) must pass.
  it('p above e is NOT refused (the live row, 30 / 25)', () => {
    const f = fails({ maxPositionPercentPct: 30, maxTotalExposurePct: 25 });
    expect(f).not.toContain('RULE_012');
    expect(f).not.toContain('RULE_013');
  });

  // An absent field is not validated (a partial save of other fields must not trip these rules).
  it('an absent field is not checked', () => {
    expect(fails({ symbolCooldownMinutes: 10 })).not.toContain('RULE_012');
  });
});

describe('P5 — getEffective no longer masks a stored value with a hard-coded 30 / 10', () => {
  // MUTATION: restore `value ? parse : (paper 30 | live 10)` and this fails — 0 reads as 30.
  it('a stored 0.00 reads as 0, not 30', () => {
    const eff = guardrailPolicy.getEffective({ mode: 'paper', maxPositionPercentPct: '0.00', lockedByUser: {} } as any);
    expect(eff.maxPositionPercentPct).toBe(0);
  });
  it('CONTROL — a stored 5.00 reads as 5', () => {
    const eff = guardrailPolicy.getEffective({ mode: 'paper', maxPositionPercentPct: '5.00', lockedByUser: {} } as any);
    expect(eff.maxPositionPercentPct).toBe(5);
  });
});

describe('P6 — one audit row per CHANGED field, derived from the payload', () => {
  const old = {
    mode: 'paper', maxPositionPercentPct: '20.00', maxTotalExposurePct: '100.00', dailyLossWarning1Pct: '50.00',
    lockedByUser: { a: true }, isManualOverride: false, lastUpdatedBy: 'someone',
  };

  // MUTATION: go back to a hand-written per-field list without exposure and this fails.
  it('an exposure change is audited (the old list missed it)', () => {
    const e = buildGuardrailAuditEntries(old, { mode: 'paper', maxTotalExposurePct: '90' }, 'u1', 'paper');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ field: 'maxTotalExposurePct', oldValue: '100.00', newValue: '90', changedBy: 'u1', tradingMode: 'paper' });
  });

  it('a position % change is audited', () => {
    const e = buildGuardrailAuditEntries(old, { mode: 'paper', maxPositionPercentPct: '5' }, 'u1', 'paper');
    expect(e.map((x) => x.field)).toEqual(['maxPositionPercentPct']);
  });

  // MUTATION: compare as strings and this fails — "5.00" vs "5" would log a change that is not one.
  it('re-saving the same number in another format is NOT audited', () => {
    expect(buildGuardrailAuditEntries(old, { mode: 'paper', maxPositionPercentPct: '20' }, 'u1', 'paper')).toHaveLength(0);
  });

  it('mode and lastUpdatedBy never get a row; the lock map compares as JSON', () => {
    const e = buildGuardrailAuditEntries(old, { mode: 'paper', lastUpdatedBy: 'u1', lockedByUser: { a: true } }, 'u1', 'paper');
    expect(e).toHaveLength(0);
    const e2 = buildGuardrailAuditEntries(old, { mode: 'paper', lockedByUser: { a: false } }, 'u1', 'paper');
    expect(e2.map((x) => x.field)).toEqual(['lockedByUser']);
  });

  it('booleans compare as values', () => {
    expect(buildGuardrailAuditEntries(old, { mode: 'paper', isManualOverride: false }, 'u1', 'paper')).toHaveLength(0);
    expect(buildGuardrailAuditEntries(old, { mode: 'paper', isManualOverride: true }, 'u1', 'paper')).toHaveLength(1);
  });

  it('no existing row ⇒ no rows (nothing to diff against)', () => {
    expect(buildGuardrailAuditEntries(null, { mode: 'paper', maxPositionPercentPct: '5' }, 'u1', 'paper')).toHaveLength(0);
  });
});
