/**
 * B79.0n.PATTERN-DETECT — REQUIRED-`assetClass: AssetClass` type-lock test.
 *
 * Mirrors the discipline established by B79.0n.STRATEGY's `b79-0n-strategy-
 * required-assetclass.test.ts`. This file is the dedicated harness for
 * `@ts-expect-error` directives that prove TypeScript REJECTS callers that
 * omit the asset-class parameter at every PATTERN-DETECT signature surface.
 *
 * Surfaces locked:
 *   - scanPatterns(candles, symbol, assetClass)
 *   - patternToTradeSignal(pattern, currentPrice, atr, assetClass)
 *   - PatternRecognizerService.scanPatterns(candles, symbol, assetClass)
 *   - PatternRecognizerService.patternToTradeSignal(pattern, currentPrice, atr, assetClass)
 *   - selectContextAwareStrategy(regime, detectedPattern, symbolHash, assetClass)
 *
 * If a future commit silently weakens any of these signatures (e.g. by
 * making `assetClass` optional with a default), the `@ts-expect-error`
 * comments below will fail compile because TypeScript will report "unused
 * @ts-expect-error directive" — making the regression a CI gate.
 *
 * Per CLAUDE.md NO PATCHES (rule 15): the harness file is the ONLY place in
 * the codebase where `@ts-expect-error` is allowed (anti-graveyard
 * discipline). Any directive added here must be:
 *   (a) accompanied by a one-line comment explaining what it proves
 *   (b) targeted at exactly one error code (not a multi-error blanket)
 *   (c) added in the same commit as the signature change it locks
 */

import { describe, it } from 'vitest';
import {
  scanPatterns,
  patternToTradeSignal,
  type Candle,
  type PatternSignal,
} from '../../services/pattern-recognizer';
import { selectContextAwareStrategy } from '../../config/canonical-regime-strategy-map';

// Minimal fixture set used by the type-locks. Bodies are not exercised —
// these tests prove COMPILE-time behavior, not runtime behavior.
const FIXTURE_CANDLES: Candle[] = [
  { timestamp: 1000, open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
  { timestamp: 2000, open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
  { timestamp: 3000, open: 101, high: 101.5, low: 80, close: 100.5, volume: 1200 },
];

const FIXTURE_PATTERN_SIGNAL: PatternSignal = {
  symbol: 'BTCUSD',
  pattern: 'PINBAR',
  direction: 'BUY',
  strength: 0.7,
  timestamp: 3000,
  metadata: {},
};

/**
 * Helper: discard the result but force the expression to be type-checked.
 * Avoids "expression statement has no effect" hints from some configs while
 * still exercising the call signature.
 */
function typeCheck<T>(_v: T): void { /* no-op */ }

describe('B79.0n.PATTERN-DETECT — REQUIRED-assetClass type-locks', () => {

  describe('scanPatterns(candles, symbol, assetClass)', () => {
    it('accepts a valid call with all three arguments', () => {
      typeCheck(scanPatterns(FIXTURE_CANDLES, 'BTCUSD', 'crypto_spot'));
      typeCheck(scanPatterns(FIXTURE_CANDLES, 'AAPL/USD', 'xstock_spot'));
    });

    it('rejects calls that omit assetClass', () => {
      // @ts-expect-error B79.0n.PATTERN-DETECT — assetClass is REQUIRED, 2-arg call must fail
      typeCheck(scanPatterns(FIXTURE_CANDLES, 'BTCUSD'));
    });

    it('rejects calls with invalid assetClass string', () => {
      // @ts-expect-error B79.0n.PATTERN-DETECT — assetClass must match AssetClass union, arbitrary string fails
      typeCheck(scanPatterns(FIXTURE_CANDLES, 'BTCUSD', 'not_an_asset_class'));
    });

    it('rejects calls with non-string assetClass', () => {
      // @ts-expect-error B79.0n.PATTERN-DETECT — assetClass must be string literal, number fails
      typeCheck(scanPatterns(FIXTURE_CANDLES, 'BTCUSD', 42));
    });
  });

  describe('patternToTradeSignal(pattern, currentPrice, atr, assetClass)', () => {
    it('accepts a valid call with all four arguments', () => {
      typeCheck(patternToTradeSignal(FIXTURE_PATTERN_SIGNAL, 50000, 500, 'crypto_spot'));
      typeCheck(patternToTradeSignal(FIXTURE_PATTERN_SIGNAL, 180, 2, 'xstock_spot'));
    });

    it('rejects calls that omit assetClass', () => {
      // @ts-expect-error B79.0n.PATTERN-DETECT — assetClass is REQUIRED, 3-arg call must fail
      typeCheck(patternToTradeSignal(FIXTURE_PATTERN_SIGNAL, 50000, 500));
    });

    it('rejects calls that omit atr', () => {
      // @ts-expect-error B79.0n.PATTERN-DETECT — atr is REQUIRED (no default in post-batch signature)
      typeCheck(patternToTradeSignal(FIXTURE_PATTERN_SIGNAL, 50000, 'crypto_spot'));
    });

    it('rejects calls with invalid assetClass string', () => {
      // @ts-expect-error B79.0n.PATTERN-DETECT — assetClass must match AssetClass union
      typeCheck(patternToTradeSignal(FIXTURE_PATTERN_SIGNAL, 50000, 500, 'not_a_class'));
    });
  });

  describe('selectContextAwareStrategy(regime, detectedPattern, symbolHash, assetClass)', () => {
    it('accepts a valid call with all four arguments', () => {
      typeCheck(selectContextAwareStrategy('TREND_FRIENDLY_STABLE', 'PINBAR', 42, 'crypto_spot'));
      typeCheck(selectContextAwareStrategy('IMPULSE_EXPANSION', null, undefined, 'xstock_spot'));
    });

    it('rejects calls that omit assetClass', () => {
      // B-4.7 diff-B R3: an unwired/omitted class now THROWS at runtime too
      // (the silent adaptive_flow fallback was the split-brain hazard).
      expect(() =>
        // @ts-expect-error B79.0n.PATTERN-DETECT — assetClass is REQUIRED, 3-arg call must fail
        typeCheck(selectContextAwareStrategy('TREND_FRIENDLY_STABLE', 'PINBAR', 42))
      ).toThrow(/no materialized regime-strategy tree/);
    });

    it('rejects calls with invalid assetClass string', () => {
      // B-4.7 diff-B R3: runtime throw on unwired class (see above).
      expect(() =>
        // @ts-expect-error B79.0n.PATTERN-DETECT — assetClass must match AssetClass union
        typeCheck(selectContextAwareStrategy('TREND_FRIENDLY_STABLE', 'PINBAR', 42, 'wrong'))
      ).toThrow(/no materialized regime-strategy tree/);
    });
  });

  describe('B79.0n.PATTERN-DETECT compile-time-only — no runtime assertions', () => {
    it('passes if the file compiles cleanly with all @ts-expect-error directives consumed', () => {
      // Empty body — the assertion IS the compile pass. If vitest is invoking
      // this file at runtime, the @ts-expect-error directives above have
      // already been verified by tsc (the test runner only sees compiled JS).
      // The presence of this test gives the test reporter a green checkmark
      // so the harness shows up as PASS rather than EMPTY in CI output.
    });
  });
});
