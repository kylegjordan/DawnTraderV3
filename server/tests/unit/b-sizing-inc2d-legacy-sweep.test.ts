/**
 * B-SIZING-DEC-RESTORE increment 2d — the legacy sweep's BEHAVIOUR changes (PRE_AUDIT §18, Langston's ruling §18.5).
 * The deletions themselves are fenced in integration/b-sizing-legacy-deletion-fence.test.ts; this file pins what changed.
 *
 *   P-9  the per-underlying cap FAILS CLOSED: a missing or malformed module_constants row is a CONFIG ERROR, a thrown lookup
 *        is TRANSIENT; both refuse, each under its own reason, on the active lane AND the VTS (counted, never silent).
 *   P-7  a signal with no valid asset-class stamp is REFUSED at execution entry (never re-derived from the ticker), and the
 *        RTB writer rejects a present-but-invalid stamp at its source.
 *
 * P-9 ships UNEXERCISED on staging (the three rows are seeded): these tests are the only evidence the refusal fires, and a
 * post-deploy silence is never cited as proof that it does (#661 leg 3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const _rows: Record<string, unknown> = {};
let _throw: Error | null = null;
vi.mock('../../services/module-constants-service.js', () => ({
  GLOBAL_KEY: { exchange: '*', assetClass: '*', strategy: '*', regime: '*' },
  getConstant: vi.fn(async (_m: string, name: string) => {
    if (_throw) throw _throw;
    return _rows[name];
  }),
}));
vi.mock('../../services/fx-conversion-service.js', () => ({
  fxConversionService: { parseSymbol: (s: string) => ({ baseCurrency: s.split('/')[0] }) },
}));

import {
  checkPerUnderlyingCap, classifyPerUnderlyingCapFailure, PerUnderlyingCapConfigError,
} from '../../services/per-underlying-cap';

const REPO = resolve(__dirname, '../../..');
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = (rel: string) => stripComments(readFileSync(join(REPO, rel), 'utf-8'));

function seed() {
  _rows['b67_3_enabled'] = true;
  _rows['b67_3_universe_split_active'] = false;
  _rows['b67_3_max_concurrent_per_underlying'] = 2;
}
beforeEach(() => { for (const k of Object.keys(_rows)) delete _rows[k]; _throw = null; seed(); });

describe('P-9 — the per-underlying cap reads its three rows with no fallback', () => {
  it('CONTROL: the seeded rows (true, false, 2) give a real decision — the cap reached at 2 open', async () => {
    const d = await checkPerUnderlyingCap('ETH/USD', ['ETH/USD', 'ETH/EUR']);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('cap_reached');
    expect(d.cap).toBe(2);
  });

  // MUTATION: put `?? false` back on the enabled read and this fails (a missing row would silently DISABLE the cap).
  it('a MISSING enabled row is a config error — never "cap off"', async () => {
    delete _rows['b67_3_enabled'];
    await expect(checkPerUnderlyingCap('ETH/USD', [])).rejects.toBeInstanceOf(PerUnderlyingCapConfigError);
  });

  it('a missing split row, a missing cap row, and malformed values are config errors too', async () => {
    for (const [k, v] of [['b67_3_universe_split_active', undefined], ['b67_3_max_concurrent_per_underlying', undefined],
      ['b67_3_max_concurrent_per_underlying', '2'], ['b67_3_max_concurrent_per_underlying', 0], ['b67_3_enabled', 'true']] as const) {
      seed();
      if (v === undefined) delete _rows[k]; else _rows[k] = v;
      await expect(checkPerUnderlyingCap('ETH/USD', []), `${k}=${String(v)}`).rejects.toBeInstanceOf(PerUnderlyingCapConfigError);
    }
  });

  it('the two failure classes are told apart: config_missing vs lookup_failed', async () => {
    delete _rows['b67_3_enabled'];
    const cfg = await checkPerUnderlyingCap('ETH/USD', []).catch((e) => e);
    expect(classifyPerUnderlyingCapFailure(cfg)).toBe('config_missing');
    _throw = new Error('connection reset');
    const net = await checkPerUnderlyingCap('ETH/USD', []).catch((e) => e);
    expect(classifyPerUnderlyingCapFailure(net)).toBe('lookup_failed');
  });
});

describe('P-9 — both callers REFUSE on either failure, each under its own reason', () => {
  // MUTATION: restore either caller's "allowing through" catch and its test fails.
  it('the active lane (signal orchestrator) returns null and counts position_cap_<reason>', () => {
    const src = code('server/services/signal-orchestrator.ts');
    expect(src).not.toContain('allowing through');
    expect(src).toMatch(/const why = classifyPerUnderlyingCapFailure\(err\);[\s\S]{0,400}recordActivePostSqeReject\(sizingContext\.mode, _fClass, `position_cap_\$\{why\}`\);\s*return null;/);
  });

  it('the VTS returns null and sets its own null reason, distinct from a real cap reject', () => {
    const src = code('server/services/vts-runner.ts');
    expect(src).not.toMatch(/cap-check\]\[VTS\] Failed for \$\{symbol\}; allowing through/);
    expect(src).toMatch(/const why = classifyPerUnderlyingCapFailure\(err\);[\s\S]{0,300}setNullReason\(`per_underlying_cap_unavailable_\$\{why\}`\);\s*return null;/);
    expect(src).toContain("setNullReason('per_underlying_cap');"); // CONTROL: the real cap reject keeps its own reason
  });
});

describe('P-7 — a missing class stamp is refused, not re-derived', () => {
  it('execution entry refuses a signal with no valid stamp (UNCLASSIFIABLE), with no ticker fallback at that read', () => {
    const src = code('server/services/active-execution-engine.ts');
    const at = src.indexOf('const _amrStamp = asValidAssetClass(signal.metadata?.assetClass);');
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, at + 900);
    expect(block).toContain('[B-SIZING-DEC-RESTORE][STAMP_MISSING_REFUSED]');
    expect(block).toContain("return { opened: false, stage: 'UNCLASSIFIABLE'");
    expect(block).not.toContain('safeResolveAssetClass(signal.symbol');
  });

  it('the RTB writer rejects a present-but-invalid class at its source', () => {
    const src = code('server/core/rtb/ready_to_buy_service.ts');
    expect(src).toContain('const resolvedAssetClass = asValidAssetClass(input.assetClass);');
    expect(src).toMatch(/if \(!resolvedAssetClass\) \{\s*throw new Error\(\s*`\[B-SIZING-DEC-RESTORE\]\[STAMP_INVALID\]/);
  });
});
