/**
 * P19-B8.5l (B-ATR-SOURCE-FIX, #581) — the pattern-path ATR re-stamp + restored carry.
 *
 * ROOT CAUSE (code-confirmed + Langston-confirmed): `sizingContext` is one shared object.
 * The quant pass stamps `sizingContext.atr = mceContext.indicators.atr` per-symbol at
 * signal-orchestrator.ts:~2165. The pattern pass (a SEPARATE pass that runs AFTER the quant
 * loop) re-stamped regime/pairDbs per pattern-symbol but NOT atr — so pattern signals read
 * the LAST QUANT SYMBOL's stale `sizingContext.atr`, producing one shared atr per cycle.
 *
 * OBJ-3 fence. A true "≥2 distinct atr across symbols in one cycle" assertion is behavioural
 * and lives in the §9.3 live-data verification at deploy (query rtb_signals.metadata.atr for
 * distinctness in one cycle — the exact check that caught B8.5k). The full pattern path is not
 * unit-testable in isolation (it lives deep in evaluateMarket with MCE/OHLC-cache deps). So
 * these are SOURCE-GUARDS on the fix mechanism: the per-symbol re-stamp is present, RAW (not
 * the fallback-carrying local — gate parity), correctly placed, and the carry is restored.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('P19-B8.5l — pattern-path ATR re-stamp (#581 source fix)', () => {
  const src = read('server/services/signal-orchestrator.ts');

  it('OBJ-1: the pattern path re-stamps sizingContext.atr from the RAW per-symbol context', () => {
    // Present, and RAW (undefined-preserving) — matches the quant stamp `mceContext.indicators.atr`.
    expect(src).toMatch(/sizingContext\.atr\s*=\s*context\.indicators\?\.atr\s*;/);
  });

  it('OBJ-1: it does NOT re-stamp the :1905 fallback-carrying local (gate parity)', () => {
    // The local `const atr = context.indicators?.atr ?? (currentPrice * 0.02)` must NOT be the
    // stamped value — re-stamping it would feed a synthetic ATR into the :1548 invalid_atr LOUD gate.
    expect(src).not.toMatch(/sizingContext\.atr\s*=\s*atr\s*;/);
  });

  it('OBJ-1: the atr re-stamp sits with the sibling regime/DBS re-stamps, before the pattern build', () => {
    // The re-stamp block: regime, pairDbsCategory, pairDbsScore, THEN atr, THEN the build call.
    const block = src.slice(src.indexOf('sizingContext.regime = patternRegime'));
    const reStampIdx = block.indexOf('sizingContext.atr = context.indicators?.atr');
    const buildIdx = block.indexOf('buildSizedSignalForStrategy(');
    expect(reStampIdx).toBeGreaterThan(0);
    expect(buildIdx).toBeGreaterThan(reStampIdx); // re-stamp precedes the build
  });

  it('OBJ-2: the B8.5k carry is restored at the sized-signal metadata rebuild', () => {
    expect(src).toMatch(/^\s*atr: sizingContext\.atr,\s*$/m);
  });

  it('OBJ-1: the quant-pass stamp is unchanged (still raw mceContext.indicators.atr, per-symbol)', () => {
    expect(src).toMatch(/sizingContext\.atr\s*=\s*mceContext\.indicators\.atr\s*;/);
  });
});
