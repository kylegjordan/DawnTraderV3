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
const stripComments = (src: string) => src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const code = (rel: string) => stripComments(readFileSync(join(REPO, rel), 'utf-8'));

// The cap takes positions WITH their stamped class (Langston Step-4 FINDING-1); these helpers keep the tests readable.
const crypto = (symbol: string) => ({ symbol, assetClass: 'crypto_spot' });
const xstock = (symbol: string) => ({ symbol, assetClass: 'xstock_spot' });

function seed() {
  _rows['b67_3_enabled'] = true;
  _rows['b67_3_universe_split_active'] = false;
  _rows['b67_3_max_concurrent_per_underlying'] = 2;
}
beforeEach(() => { for (const k of Object.keys(_rows)) delete _rows[k]; _throw = null; seed(); });

describe('P-9 — the per-underlying cap reads its three rows with no fallback', () => {
  it('CONTROL: the seeded rows (true, false, 2) give a real decision — the cap reached at 2 open', async () => {
    const d = await checkPerUnderlyingCap(crypto('ETH/USD'), [crypto('ETH/USD'), crypto('ETH/EUR')]);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('cap_reached');
    expect(d.cap).toBe(2);
  });

  // MUTATION: put `?? false` back on the enabled read and this fails (a missing row would silently DISABLE the cap).
  it('a MISSING enabled row is a config error — never "cap off"', async () => {
    delete _rows['b67_3_enabled'];
    await expect(checkPerUnderlyingCap(crypto('ETH/USD'), [])).rejects.toBeInstanceOf(PerUnderlyingCapConfigError);
  });

  it('a missing split row, a missing cap row, and malformed values are config errors too', async () => {
    for (const [k, v] of [['b67_3_universe_split_active', undefined], ['b67_3_max_concurrent_per_underlying', undefined],
      ['b67_3_max_concurrent_per_underlying', '2'], ['b67_3_max_concurrent_per_underlying', 0], ['b67_3_enabled', 'true']] as const) {
      seed();
      if (v === undefined) delete _rows[k]; else _rows[k] = v;
      await expect(checkPerUnderlyingCap(crypto('ETH/USD'), []), `${k}=${String(v)}`).rejects.toBeInstanceOf(PerUnderlyingCapConfigError);
    }
  });

  it('the two failure classes are told apart: config_missing vs lookup_failed', async () => {
    delete _rows['b67_3_enabled'];
    const cfg = await checkPerUnderlyingCap(crypto('ETH/USD'), []).catch((e) => e);
    expect(classifyPerUnderlyingCapFailure(cfg)).toBe('config_missing');
    _throw = new Error('connection reset');
    const net = await checkPerUnderlyingCap(crypto('ETH/USD'), []).catch((e) => e);
    expect(classifyPerUnderlyingCapFailure(net)).toBe('lookup_failed');
  });
});

describe('Step-4 FINDING-1 — the cap counts SAME-CLASS opens only', () => {
  // DASH is the one base measured under both classes in closed_trades (Langston, at 7c43e2422).
  // MUTATION: drop the class comparison inside checkPerUnderlyingCap and this fails (open=2 → cap_reached).
  it('two open DASH xStock positions do not count against a DASH crypto signal', async () => {
    const d = await checkPerUnderlyingCap(crypto('DASH/USD'), [xstock('DASH/USD'), xstock('DASH/USD')]);
    expect(d.currentOpenCount).toBe(0);
    expect(d.allowed).toBe(true);
  });

  it('CONTROL: two open DASH crypto positions DO reach the cap for the same signal', async () => {
    const d = await checkPerUnderlyingCap(crypto('DASH/USD'), [crypto('DASH/USD'), crypto('DASH/EUR'), xstock('DASH/USD')]);
    expect(d.currentOpenCount).toBe(2);
    expect(d.reason).toBe('cap_reached');
  });

  it('(source-text) the VTS hands the cap its entry-resolved class and each open record with its own class', () => {
    const src = code('server/services/vts-runner.ts');
    expect(src).toContain('.map((t) => ({ symbol: t.symbol, assetClass: t.assetClass }));');
    expect(src).toContain('const capDecision = await checkPerUnderlyingCap({ symbol, assetClass: _assetClass }, openPositions);');
  });

  it('a candidate with no class stamp is REFUSED as a failed lookup, never counted against everything or nothing', async () => {
    const e = await checkPerUnderlyingCap({ symbol: 'DASH/USD', assetClass: '' }, [crypto('DASH/USD')]).catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(classifyPerUnderlyingCapFailure(e)).toBe('lookup_failed');
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
  // Stage renamed at Step 4 (Langston nit a): STAMP_MISSING, so it never shares a counter with an unclassifiable SYMBOL.
  it('execution entry refuses a signal with no valid stamp (STAMP_MISSING), with no ticker fallback at that read', () => {
    const src = code('server/services/active-execution-engine.ts');
    const at = src.indexOf('const _amrStamp = asValidAssetClass(signal.metadata?.assetClass);');
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, at + 900);
    expect(block).toContain('[B-SIZING-DEC-RESTORE][STAMP_MISSING_REFUSED]');
    expect(block).toContain("return { opened: false, stage: 'STAMP_MISSING'");
    expect(block).not.toContain("stage: 'UNCLASSIFIABLE'");
    expect(block).not.toContain('safeResolveAssetClass(signal.symbol');
  });

  // Object-round fold: the class checks sat BELOW the tiebreak, which expires the incumbent before the throw. MUTATION:
  // move them back below `expireSignal(existingSignal.id` and this fails.
  it('the RTB writer checks the class BEFORE the duplicate check and the tiebreak can act', () => {
    const src = code('server/core/rtb/ready_to_buy_service.ts');
    const fn = src.indexOf('async queueSQESignal(');
    const invalid = src.indexOf('[B-SIZING-DEC-RESTORE][STAMP_INVALID]', fn);
    const missing = src.indexOf('[B79.0n.RTB][STAMP_MISSING]', fn);
    const dup = src.indexOf('storage.hasActivePair(normalizedSymbol', fn);
    const expire = src.indexOf('this.expireSignal(existingSignal.id', fn);
    for (const i of [invalid, missing, dup, expire]) expect(i).toBeGreaterThan(fn);
    expect(missing).toBeLessThan(dup);
    expect(invalid).toBeLessThan(dup);
    expect(invalid).toBeLessThan(expire);
  });

  it('the RTB writer rejects a present-but-invalid class at its source', () => {
    const src = code('server/core/rtb/ready_to_buy_service.ts');
    expect(src).toContain('const resolvedAssetClass = asValidAssetClass(input.assetClass);');
    expect(src).toMatch(/if \(!resolvedAssetClass\) \{\s*throw new Error\(\s*`\[B-SIZING-DEC-RESTORE\]\[STAMP_INVALID\]/);
  });
});

describe('fresh-reader round 1 folds — the cap counts real positions; manual closes keep their class', () => {
  // MUTATION: point the cap back at storage.getActiveTrades (the legacy `trades` table, 0 rows on staging) and this fails.
  it("the active lane's per-underlying cap counts the ENGINE's open positions, not the legacy trades table", () => {
    const src = code('server/services/signal-orchestrator.ts');
    const at = src.indexOf('const capDecision = await checkPerUnderlyingCap(');
    expect(at).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, at - 400), at);
    expect(before).toContain('const openPositions = await storage.getActiveOpenPositions(sizingContext.mode);');
    expect(before).not.toContain('getActiveTrades');
    // …and hands the cap each position WITH its class, and the candidate with the pipe's stamp (FINDING-1).
    const call = src.slice(at, at + 300);
    expect(call).toContain('{ symbol: rawSignal.symbol, assetClass: sizingContext.assetClass }');
    expect(call).toContain('openPositions.map((p) => ({ symbol: p.symbol, assetClass: p.assetClass }))');
  });

  it('both manual close writers carry the asset class of the position (was the crypto_spot column default)', () => {
    const src = code('server/routes.ts');
    const manual = src.slice(src.indexOf('const closedTradePayload = {'), src.indexOf('const closedTradePayload = {') + 400);
    expect(manual).toContain('assetClass: position.assetClass,');
    const strandedAt = src.indexOf("closeReason: 'stranded_clear'");
    const stranded = src.slice(src.lastIndexOf("await storage.createClosedTrade('paper', {", strandedAt), strandedAt);
    expect(stranded).toContain('assetClass: position.assetClass,');
  });
});
