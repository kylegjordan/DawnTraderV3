import { beforeEach, describe, expect, it } from 'vitest';
import type { ModuleConstant } from '../../../shared/schema.js';
import { assertLevelBuildKnobsAtBoot, LEVEL_BASIS_MODULE } from '../../core/trading/level-build-config.js';
import { _seedModuleCacheForTests, clearModuleConstantsCache } from '../../services/module-constants-service.js';

const knob = (constantName: string, value: unknown, scope: Partial<ModuleConstant> = {}): ModuleConstant => ({
  moduleName: LEVEL_BASIS_MODULE, constantName, value,
  assetClass: 'crypto_spot', exchange: '*', strategy: '*', regime: '*',
  updatedAt: new Date(0), updatedBy: 'test', ...scope,
});
const age = knob('level_build_max_age_ms', 60_000);
const spread = knob('level_build_max_spread_fraction', 0.5);
const drift = knob('level_build_drift_ref_60s', 0.00429);
const retained = [age, spread, drift];
const retired = knob(['crypto', 'birth', 'sided', 'enabled'].join('_'), 1);

beforeEach(() => clearModuleConstantsCache());

describe('8c Phase B crypto boot contract', () => {
  it('reads the exact three crypto rows from the real cache', () => {
    _seedModuleCacheForTests(LEVEL_BASIS_MODULE, [...retained, knob('fixture', true, { assetClass: 'xstock_spot' })]);
    expect(assertLevelBuildKnobsAtBoot()).toEqual({ maxAgeMs: 60_000, maxSpreadFraction: 0.5, driftRef60s: 0.00429 });
  });

  it.each([
    ['cold module', undefined, 'is not warm'],
    ['missing row', [age, spread], 'found 2'],
    ['retired switch', [...retained, retired], 'found 4'],
    ['extra unmatched, non-numeric row', [...retained, knob('fixture', true, { exchange: 'kraken' })], 'found 4'],
    ['wrong name', [age, spread, knob('fixture', drift.value)], 'unexpected name'],
    ['wrong retained value', [age, spread, { ...drift, value: 0.00430 }], 'unexpected name'],
    ['wrong retained type', [age, spread, { ...drift, value: '0.00429' }], 'unexpected name'],
    ['wrong exchange', [age, spread, { ...drift, exchange: 'kraken' }], 'unexpected name'],
    ['wrong strategy', [age, spread, { ...drift, strategy: 'breakout' }], 'unexpected name'],
    ['wrong regime', [age, spread, { ...drift, regime: 'IMPULSE_EXPANSION' }], 'unexpected name'],
    ['wrong asset class', [age, spread, { ...drift, assetClass: '*' }], 'found 2'],
    ['duplicate name', [age, spread, age], 'unexpected name'],
  ] as const)('rejects %s', (_case, rows, message) => {
    if (rows) _seedModuleCacheForTests(LEVEL_BASIS_MODULE, [...rows]);
    expect(() => assertLevelBuildKnobsAtBoot()).toThrow(message);
  });
});
