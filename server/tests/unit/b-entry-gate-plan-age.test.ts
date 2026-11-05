/**
 * B-ENTRY-GATE (`#1224`) increment B, P11 — the stale-plan limit at promotion ships with NO value (pre-audit r10, r13):
 * the reader exists, no row is seeded, so the limit is OFF and says so; a bad row refuses loudly, never falls back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decidePlanAge } from '../../core/rtb/plan-age-limit';

describe('P11 — decidePlanAge', () => {
  it('no row ⇒ off (the shipped state)', () => {
    expect(decidePlanAge({ ageMs: 9e9, limitMs: undefined })).toBe('off');
  });
  it('a valid row decides fresh / stale at the edge', () => {
    expect(decidePlanAge({ ageMs: 1000, limitMs: 1000 })).toBe('fresh');
    expect(decidePlanAge({ ageMs: 1001, limitMs: 1000 })).toBe('stale');
    expect(decidePlanAge({ ageMs: 5, limitMs: '1000' })).toBe('fresh');
  });
  it('a row that is not a positive finite number is invalid, never treated as off', () => {
    for (const v of [0, -1, Number.NaN, 'abc', null]) expect(decidePlanAge({ ageMs: 1, limitMs: v })).toBe('invalid_limit');
  });
  it('an unknown age with a live limit is not judged as fresh', () => {
    expect(decidePlanAge({ ageMs: Number.NaN, limitMs: 1000 })).toBe('age_unknown');
  });
});

describe('P11 — wired at promotion, before the claim delete; no row is seeded', () => {
  const src = readFileSync('server/core/rtb/ready_to_buy_service.ts', 'utf-8').replace(/\/\/.*$/gm, '');
  it('reads the per-class row with the optional reader and decides before the claim', () => {
    const p = src.indexOf('async promoteSignal(');
    const read = src.indexOf("getCachedConstant('entry_gate', 'rtb_plan_max_age_ms'", p);
    const claim = src.indexOf('const removed = await storage.deleteRtbSignals({ mode, id: signal.id });', p);
    expect(read).toBeGreaterThan(p);
    expect(claim).toBeGreaterThan(read);
    expect(src.slice(read, claim)).toMatch(/return 'stale_plan';/);
    expect(src.slice(read, claim)).toMatch(/return 'plan_age_unresolved';/);
  });
  it('no migration seeds rtb_plan_max_age_ms (the value is withdrawn, r13)', () => {
    const mig = readFileSync('drizzle/migrations/2026-11-05-b-entry-gate.sql', 'utf-8');
    expect(mig).not.toMatch(/rtb_plan_max_age_ms/);
  });
});
