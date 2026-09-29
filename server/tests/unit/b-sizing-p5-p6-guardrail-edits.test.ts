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

describe('P5 + 2b — the sizing percentages are bounded: 1 <= p <= 100 (RULE_012), 0 < e <= 100 (RULE_013)', () => {
  // CONTROL: a valid pair passes both rules, so a failure below is the value's doing.
  it('CONTROL — 5 / 100 passes', () => {
    const f = fails({ maxPositionPercentPct: 5, maxTotalExposurePct: 100 });
    expect(f).not.toContain('RULE_012');
    expect(f).not.toContain('RULE_013');
  });

  // MUTATION: delete the RULE_012 loop entry and these fail. Reasons (increment 2b moved the floor from > 0 to >= 1):
  // 0 and -1 are below the floor; 500 and 100.01 above the ceiling; NaN and '' are not numbers.
  it.each([[0], [-1], [500], [100.01], [Number.NaN], ['']])('position % %s is refused', (v) => {
    expect(fails({ maxPositionPercentPct: v })).toContain('RULE_012');
  });

  // Increment 2b (PRE_AUDIT §15.1 G1): the floor is 1. MUTATION: put the floor back to `> 0` and 0.5 / 0.99 pass.
  // 0.5 is the decimal slip that would derive floor(100 / 0.5) = 200 positions since 2a.
  it.each([[0.5], [0.99]])('position % %s is refused — below the floor of 1', (v) => {
    expect(fails({ maxPositionPercentPct: v })).toContain('RULE_012');
  });
  it.each([[1], [100]])('position % %s is accepted — the edges of 1 <= p <= 100', (v) => {
    expect(fails({ maxPositionPercentPct: v })).not.toContain('RULE_012');
  });
  // RULE_013 keeps its > 0 floor (an exposure typo is loud: the budget collapses and the band alert fires).
  it('exposure % 0.5 is accepted — RULE_013 has no floor of 1', () => {
    expect(fails({ maxTotalExposurePct: 0.5 })).not.toContain('RULE_013');
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

// (P5's `getEffective` masking tests left with getEffective itself — increment 2d, #1089: its only readers were an uncalled
//  route and a report nothing displayed. The legacy-deletion fence asserts it does not come back.)

describe('P6 — one audit row per CHANGED field: the payload\'s fields, the WRITTEN row\'s values', () => {
  const old = {
    mode: 'paper', maxPositionPercentPct: '20.00', maxTotalExposurePct: '100.00', dailyLossWarning1Pct: '50.00',
    lockedByUser: { a: true }, isManualOverride: false, lastUpdatedBy: 'someone',
  };
  const written = (over: Record<string, unknown>) => ({ ...old, ...over });

  // MUTATION: go back to a hand-written per-field list without exposure and this fails.
  it('an exposure change is audited (the old list missed it)', () => {
    const e = buildGuardrailAuditEntries(old, written({ maxTotalExposurePct: '90.00' }), ['mode', 'maxTotalExposurePct'], 'u1', 'paper');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ field: 'maxTotalExposurePct', oldValue: '100.00', newValue: '90.00', changedBy: 'u1', tradingMode: 'paper' });
  });

  // FINDING-1: the value logged is what the database TOOK. A field sent but not written (the merge list
  // dropped it) is NOT logged. MUTATION: read the new value from the payload instead and this fails.
  it('a field the database did not change gets no row, whatever was sent', () => {
    const e = buildGuardrailAuditEntries(old, written({}), ['maxPositionPercentPct'], 'u1', 'paper');
    expect(e).toHaveLength(0);
  });

  it('the logged value is the stored one', () => {
    const e = buildGuardrailAuditEntries(old, written({ maxPositionPercentPct: '6.56' }), ['maxPositionPercentPct'], 'u1', 'paper');
    expect(e[0].newValue).toBe('6.56');
  });

  // MUTATION: compare as strings and this fails — "20" vs "20.00" would log a change that is not one.
  it('the same number in another format is NOT audited', () => {
    expect(buildGuardrailAuditEntries(old, written({ maxPositionPercentPct: '20' }), ['maxPositionPercentPct'], 'u1', 'paper')).toHaveLength(0);
  });

  it('mode and lastUpdatedBy never get a row; the lock map compares as JSON', () => {
    const f = ['mode', 'lastUpdatedBy', 'lockedByUser'];
    expect(buildGuardrailAuditEntries(old, written({ lastUpdatedBy: 'u1' }), f, 'u1', 'paper')).toHaveLength(0);
    const e2 = buildGuardrailAuditEntries(old, written({ lockedByUser: { a: false } }), f, 'u1', 'paper');
    expect(e2.map((x) => x.field)).toEqual(['lockedByUser']);
  });

  it('booleans compare as values', () => {
    expect(buildGuardrailAuditEntries(old, written({}), ['isManualOverride'], 'u1', 'paper')).toHaveLength(0);
    expect(buildGuardrailAuditEntries(old, written({ isManualOverride: true }), ['isManualOverride'], 'u1', 'paper')).toHaveLength(1);
  });

  it('no existing row ⇒ no rows (nothing to diff against)', () => {
    expect(buildGuardrailAuditEntries(null, written({ maxPositionPercentPct: '5.00' }), ['maxPositionPercentPct'], 'u1', 'paper')).toHaveLength(0);
  });
});

// (FINDING-3's `validate(getEffective(row))` test left with getEffective in increment 2d. RULE_013 on a stored exposure of
//  0 is still pinned above — 'exposure % 0 is refused' — on the path that remains, validate() of the saved values.)
