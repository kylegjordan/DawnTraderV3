/**
 * B-PRICE-SIDE-BY-JOB r5 OBJ-8, row 8f — the policy-free symbol-leg parser.
 *
 * ⛔ EXPECTED OUTPUTS WERE WRITTEN BEFORE THE IMPLEMENTATION RAN (#744 rider, Langston
 * 2026-09-12). Every clause of the assertion — EXACTLY ONE SLASH, BOTH LEGS NON-EMPTY —
 * has its own failure exercised, because a suite that only proves "USDC in, EUR out"
 * never touches the boundary that will actually arrive.
 *
 * WHY THIS EXISTS (#1050): the base and quote legs are currently derived at 19 ad-hoc
 * `split('/')` sites, in three mutually inconsistent shapes. Two slash-split with an
 * OR-fallback to the whole symbol; a third suffix-strips and answers the quote with a
 * TWO-WAY ternary, reporting every non-USDT pair as USD-quoted.
 *
 * ⛔ THE PARSER IS POLICY-FREE AND STAYS THAT WAY (Langston's boundary, 2026-09-12):
 * it parses, or it reports unparseable. It does NOT refuse, flag, fall back, or log, and
 * it carries NO quote allowlist. The existing sites are TOLERANT (`|| symbol`); 8f's
 * admission assertion is STRICT. One helper built to the strict shape plus a tolerance
 * flag for the other would be two shapes wearing one name — worse than three honest ones.
 * ⇒ TOLERANCE LIVES AT THE CALL SITE: `parseSymbolLegs(s)?.base ?? s`.
 * ⇒ A QUOTE ALLOWLIST IS 8f's REFUSE-POLICY, never the parse — a parser that knows the
 *   valid quote set goes stale the day the venue adds one.
 */

import { describe, it, expect } from 'vitest';
import { parseSymbolLegs } from '../../../shared/symbol-legs';

describe('parseSymbolLegs — the well-formed cases', () => {
  it('splits a canonical pair into its two legs', () => {
    expect(parseSymbolLegs('BTC/USD')).toEqual({ base: 'BTC', quote: 'USD' });
  });

  it('does not care what the quote is — the allowlist is policy, not parse', () => {
    // Every one of these parses. Whether it may TRADE is row 8f's question, not this one.
    expect(parseSymbolLegs('SOL/EUR')).toEqual({ base: 'SOL', quote: 'EUR' });
    expect(parseSymbolLegs('ETH/USDT')).toEqual({ base: 'ETH', quote: 'USDT' });
    expect(parseSymbolLegs('AAPLX/GBP')).toEqual({ base: 'AAPLX', quote: 'GBP' });
    // A quote in NEITHER set — recognised-but-not-traded. The parser is indifferent.
    expect(parseSymbolLegs('XYZ/PYUSD')).toEqual({ base: 'XYZ', quote: 'PYUSD' });
  });

  it('is the ONE shape the three legacy sites disagree about, and it gets them right', () => {
    // `routes.ts:5082` suffix-strip yields "BTC/" here. This yields "BTC".
    expect(parseSymbolLegs('BTC/USD')?.base).toBe('BTC');
    // `routes.ts:5083` two-way ternary yields 'USD' here. This yields 'EUR'.
    expect(parseSymbolLegs('SOL/EUR')?.quote).toBe('EUR');
  });
});

describe('parseSymbolLegs — EXACTLY ONE SLASH, each failure exercised separately', () => {
  it('ZERO slashes is unparseable — and this is the case the OR-fallback hides', () => {
    // `split('/')[0] || symbol` stores the WHOLE symbol as the base leg here and the
    // column still reads populated. #546 absent-as-valid. The parser refuses to guess.
    expect(parseSymbolLegs('BTCUSD')).toBeNull();
    expect(parseSymbolLegs('AAPL')).toBeNull();
  });

  it('MORE THAN ONE slash is unparseable — never "take the first two"', () => {
    expect(parseSymbolLegs('A/B/C')).toBeNull();
    expect(parseSymbolLegs('BTC/USD/PERP')).toBeNull();
    expect(parseSymbolLegs('//')).toBeNull();
  });
});

describe('parseSymbolLegs — BOTH LEGS NON-EMPTY, each leg exercised separately', () => {
  it('an empty BASE leg is unparseable', () => {
    expect(parseSymbolLegs('/USD')).toBeNull();
  });

  it('an empty QUOTE leg is unparseable — the half that fails SILENT downstream', () => {
    // Langston, 2026-09-12: the base half fails LOUD ("BTC/" is visibly malformed and a
    // reader flags it on sight); the quote half fails SILENT, because a plausible 'USD'
    // wears a correct answer's clothes. That asymmetry is why this clause matters most.
    expect(parseSymbolLegs('BTC/')).toBeNull();
  });

  it('whitespace is not content — a blank leg is an empty leg', () => {
    expect(parseSymbolLegs('   /USD')).toBeNull();
    expect(parseSymbolLegs('BTC/   ')).toBeNull();
  });
});

describe('parseSymbolLegs — absent input is unparseable, never a fabricated leg', () => {
  it('returns null for empty, whitespace-only and nullish input', () => {
    expect(parseSymbolLegs('')).toBeNull();
    expect(parseSymbolLegs('   ')).toBeNull();
    expect(parseSymbolLegs(null as unknown as string)).toBeNull();
    expect(parseSymbolLegs(undefined as unknown as string)).toBeNull();
  });

  it('does not throw on a non-string — it reports unparseable', () => {
    expect(parseSymbolLegs(42 as unknown as string)).toBeNull();
    expect(parseSymbolLegs({} as unknown as string)).toBeNull();
  });
});

describe('parseSymbolLegs — normalisation is bounded and stated', () => {
  it('trims surrounding whitespace on each leg', () => {
    expect(parseSymbolLegs(' BTC / USD ')).toEqual({ base: 'BTC', quote: 'USD' });
  });

  it('upper-cases both legs, so the caller never has to remember to', () => {
    expect(parseSymbolLegs('btc/usd')).toEqual({ base: 'BTC', quote: 'USD' });
  });

  it('⛔ NEGATIVE CONTROL — the parser must not be satisfiable by any tolerant shape', () => {
    // If this suite ever passes against an implementation carrying an OR-fallback, the
    // suite is broken, not the implementation. `split('/')[0] || symbol` returns a TRUTHY
    // base for every input below; a correct parser returns null for all of them.
    const tolerantWouldAccept = ['BTCUSD', 'AAPL', 'BTC/', '/USD', 'A/B/C'];
    for (const s of tolerantWouldAccept) {
      expect(s.split('/')[0] || s).toBeTruthy();   // the legacy shape accepts it …
      expect(parseSymbolLegs(s)).toBeNull();        // … and this one does not.
    }
  });
});
