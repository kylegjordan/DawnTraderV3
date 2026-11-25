import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyPhaseA } from '../../../scripts/b8c-off-removal-verify-a.mjs';
import { levelGeometryOf, levelGeometryStampOf } from '../../core/trading/crypto-birth-levels.js';
import { readCryptoLevelBuildKnobs } from '../../core/trading/level-build-config.js';

const getRequired = vi.hoisted(() => vi.fn());
vi.mock('../../services/module-constants-service.js', () => ({ getCachedNumberRequired: getRequired }));

const controls = {
  level_build_max_age_ms: 60_000,
  level_build_max_spread_fraction: 0.5,
  level_build_drift_ref_60s: 0.00429,
};
const root = resolve(__dirname, '../../..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');
const retired = ['crypto', 'birth', 'sided', 'enabled'].join('_');
const allowlist = [
  'drizzle/migrations/2026-11-08-b-price-side-8c-level-build-knobs.sql',
  'drizzle/migrations/2026-11-08-b-price-side-8c-level-build-knobs-rollback.sql',
  '1-system-manual/RUNNING_ISSUES.md',
  '1-system-manual/pm/DECISIONS.md',
  '1-system-manual/pm/slot-checks/20261120T031720Z_CC-C_xstock-atr-record-gap-the-xstock-path-co.md',
  '1-system-manual/pm/slot-checks/20261122T105459Z_CC-C_b-db-regime-enum-align-bring-the-databas.md',
  'Claude Comms and Packages/Change Lists/B_PRICE_SIDE_BY_JOB_8C_CHANGE_LIST.md',
  'Claude Comms and Packages/Scope Files/B_PRICE_FEED_COVERAGE_PRE_AUDIT.md',
  'Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_8C_AUDIT_AND_PLAN.md',
  'Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_8C_OFF_REMOVAL_SCOPE.md',
  'Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_8C_OFF_REMOVAL_PRE_AUDIT.md',
  'Claude Comms and Packages/Scope Files/B_RTB_PROMOTION_RETRY_STORM_SCOPE.md',
  '1-system-manual/_archive/deleted-code/b-price-side-by-job-8c-off-removal/crypto-birth-sided-switch-2026-11-24.md',
  '1-system-manual/DELETED_COMPONENTS_LOG.md',
  'Claude Comms and Packages/Change Lists/B_PRICE_SIDE_BY_JOB_8C_OFF_REMOVAL_CHANGE_LIST.md',
  'Claude Comms and Packages/Batch Completion/B_PRICE_SIDE_BY_JOB_8C_OFF_REMOVAL_COMPLETION_REPORT.md',
];

function checkFossils(paths: string[]) {
  const unexpected = paths.filter(path => !allowlist.includes(path));
  if (unexpected.length > 0) throw new Error(`retired switch outside allowlist: ${unexpected.join(', ')}`);
  const missing = allowlist.filter(path => existsSync(resolve(root, path)) && !paths.includes(path));
  if (missing.length > 0) throw new Error(`fossil positive controls missing: ${missing.join(', ')}`);
}

function checkBirthSeam(orchestrator: string) {
  const first = orchestrator.indexOf("if (sizingContext.assetClass === 'crypto_spot') {\n      const _cbSigSym");
  const last = orchestrator.indexOf('— VENUE PRICE GRID', first);
  if (first < 0 || last < first) throw new Error('active crypto birth seam missing');
  const seam = orchestrator.slice(first, last);
  if (/\bsidedEnabled\b|levelGeometry\s*:\s*['"]mid['"]/.test(seam)) {
    throw new Error('active crypto birth can use OFF or midpoint');
  }
  if (!seam.includes('..._cb.stamp') || seam.split('baseCryptoLevelsAtBirth(').length !== 2) {
    throw new Error('active crypto birth must apply its sided result exactly once');
  }
}

describe('8c OFF removal', () => {
  beforeEach(() => {
    getRequired.mockReset().mockImplementation((_module: string, key: keyof typeof controls) => {
      if (!(key in controls)) throw new Error(`missing ${key}`);
      return controls[key];
    });
  });

  it('reads only the three retained controls and never defaults a missing one', () => {
    expect(readCryptoLevelBuildKnobs()).toEqual({ maxAgeMs: 60_000, maxSpreadFraction: 0.5, driftRef60s: 0.00429 });
    expect(getRequired.mock.calls).toEqual(Object.keys(controls).map(key => [
      'level_basis', key, { exchange: '*', assetClass: 'crypto_spot', strategy: '*', regime: '*' },
    ]));
    getRequired.mockImplementationOnce(() => { throw new Error('missing'); });
    expect(() => readCryptoLevelBuildKnobs()).toThrow(/missing/);
  });

  it('finds every present fossil and rejects a hit outside the exact allowlist', () => {
    // git grep returns exit 1 on no matches and throws on read errors. There are real historical hits.
    const paths = execFileSync('git', ['grep', '-z', '-l', '-F', '-e', retired], { cwd: root, encoding: 'utf8' })
      .split('\0').filter(Boolean);
    expect(paths).toContain('drizzle/migrations/2026-11-08-b-price-side-8c-level-build-knobs.sql');
    expect(() => checkFossils(paths)).not.toThrow();
    expect(() => checkFossils([...paths, 'server/retired-switch-regression.ts'])).toThrow(/outside allowlist/);
  });

  it('requires one sided birth seam and catches restored OFF, midpoint, and dropped-stamp mutations', () => {
    const orchestrator = source('server/services/signal-orchestrator.ts');
    expect(() => checkBirthSeam(orchestrator)).not.toThrow();
    const marker = 'const _cb = baseCryptoLevelsAtBirth(';
    expect(() => checkBirthSeam(orchestrator.replace(marker, 'if (!knobs.sidedEnabled) return null; ' + marker))).toThrow(/OFF/);
    expect(() => checkBirthSeam(orchestrator.replace('..._cb.stamp', "levelGeometry: 'mid'"))).toThrow(/midpoint/);
    expect(() => checkBirthSeam(orchestrator.replace('..._cb.stamp', '...{}'))).toThrow(/sided result/);
  });

  it('retains the midpoint decoder for xStock, VTS and historical records', () => {
    expect(levelGeometryOf({ assetClass: 'xstock_spot' })).toBe('mid');
    expect(levelGeometryOf({ caller: 'vts' })).toBe('mid');
    expect(levelGeometryStampOf({ levelGeometry: 'mid' })).toBe('mid');
    expect(levelGeometryStampOf({ levelGeometry: 'sided' })).toBe('sided');
    expect(levelGeometryStampOf({ levelGeometry: 'SIDED' })).toBeNull();
  });

  it('requires exact Phase A and rejects an older process serving a newer build file', () => {
    const sha = 'a'.repeat(40);
    const bundle = '/app/dist/index.js';
    const process = { status: 'online', pid: 42, cwd: '/app', script: bundle, restart: 715, uptime: 2000 };
    const evidence = {
      head: sha, built: sha, recordSha: sha, healthSha: sha, process, appDir: '/app', bundle,
      bundleMtime: 1500, deployedAt: 2500, restart: 715,
    };
    expect(() => verifyPhaseA(sha, evidence)).not.toThrow();
    expect(() => verifyPhaseA('b'.repeat(40), evidence)).toThrow(/SHA mismatch/);
    expect(() => verifyPhaseA(sha, { ...evidence, process: { ...process, uptime: 1000 } })).toThrow(/process/);
  });
});
