/**
 * B-PRICE-SIDE-BY-JOB r5 OBJ-8, row 8f — the admitted-quote SSOT and its two conversions.
 *
 * ⛔ THIS FILE IS THE SURVIVING RECORD OF WHAT THE TWO CONVERTED SITES USED TO SAY
 * (Langston, 2026-09-12). Every EXPECTED value below is SPELLED INLINE and is never imported
 * from the module under test or from the JSON. An expectation imported from the thing it
 * checks is a tautology that passes through any drift — the same degenerate-estimand shape
 * as comparing `split('/')[0]` against `split('/')[0]`.
 *
 * ★ THE ACTUAL VALUES ARE IMPORTED FROM THE MODULES, AND THAT IS THE POINT — inline EXPECTED
 * against imported ACTUAL. My first draft RECOMPUTED the derivation inside the test instead
 * of importing the module's set, and mutation-testing caught it: reverting the mirror to the
 * union shorthand left all nine tests GREEN. It proved `flatMap` works and said nothing about
 * whether the module uses it. A control that cannot fire is the defect it guards.
 *
 * ★ THE LITERALS ARE FROZEN AT REF `a9785babc`, THE LAST COMMIT BEFORE THE CONVERSION.
 *   ⇒ A FAILURE HERE ASKS "DID THE UNIVERSE CHANGE ON PURPOSE?" — it is NOT a value to update
 *     reflexively. If the admitted set genuinely changes, change `ADMITTED_QUOTES` and update
 *     these literals in the SAME commit, with the reason in the message.
 *
 * WHAT (a), (b), (c) MEAN HERE — Langston's conversion predicate, 2026-09-12:
 *   (a) SET-IDENTITY PROVEN — the derived value equals the literal it replaces.
 *   (b) MATCHING DOMAIN UNCHANGED — no normalization added or removed at either call site.
 *   (c) NO SURVIVING SECOND RUNTIME SOURCE. ⛔ NOT "waived" for the mirror and NOT vacuous:
 *       it is DISCHARGED BY IN-PLACE REPLACEMENT there (the old bytes are what the edit
 *       overwrites), and discharged by DELETION on the loader side (the JSON key and its
 *       `CryptoFilterConfig` field both go). Same rule, two mechanics.
 */

import { describe, it, expect } from 'vitest';
import { ADMITTED_QUOTES } from '../../../shared/admitted-quotes';
import { rawQuoteFormsOf } from '../../services/passive-archive/universe-loader';
import { DEPLOYABLE_USD_CODES } from '../../services/kraken-mirror-balance';

describe('ADMITTED_QUOTES — the SSOT, pinned against its pre-conversion literal', () => {
  it('(a) equals the set the archive JSON carried at a9785babc', () => {
    // FROZEN from server/config/crypto-universe-filter.json:8 at a9785babc:
    //   "allowedQuotes": ["USD", "USDT", "USDC"]
    expect([...ADMITTED_QUOTES].sort()).toEqual(['USD', 'USDC', 'USDT']);
  });

  it('is a set of plain-space codes — no Kraken Z-prefixed form belongs here', () => {
    for (const q of ADMITTED_QUOTES) {
      expect(q).not.toMatch(/^Z[A-Z]{3}$/);
    }
  });
});

describe('rawQuoteFormsOf — the preimage, not a union with a hand-placed alias', () => {
  it('returns the plain form plus every raw Kraken key that normalises to it', () => {
    expect([...rawQuoteFormsOf('USD')].sort()).toEqual(['USD', 'ZUSD']);
  });

  it('returns just the plain form when Kraken has no Z-prefixed alias for it', () => {
    expect([...rawQuoteFormsOf('USDT')].sort()).toEqual(['USDT']);
    expect([...rawQuoteFormsOf('USDC')].sort()).toEqual(['USDC']);
  });

  it('⛔ IS CORRECT FOR QUOTES WE DO NOT ADMIT YET — this is the whole reason it exists', () => {
    // Langston's blocker, 2026-09-12: `new Set([...ADMITTED_QUOTES, 'ZUSD'])` is right today
    // ONLY BY COINCIDENCE. Admit EUR and the union form yields no `ZEUR` — which is exactly
    // how Kraken keys a euro balance — in the component that sizes real money. EUR is #734's
    // named scenario, not a hypothetical. The preimage form is correct before that happens.
    expect([...rawQuoteFormsOf('EUR')].sort()).toEqual(['EUR', 'ZEUR']);
    expect([...rawQuoteFormsOf('GBP')].sort()).toEqual(['GBP', 'ZGBP']);
    expect([...rawQuoteFormsOf('CHF')].sort()).toEqual(['CHF', 'ZCHF']);
  });

  it('covers the BASE-leg map not at all — XBT must never appear as a quote form', () => {
    // XBASE_TO_PLAIN is a separate map for the base leg. Reaching into it here would admit
    // base aliases as settlement currencies.
    expect([...rawQuoteFormsOf('BTC')].sort()).toEqual(['BTC']);
  });

  it('does not invent a form for something Kraken has never heard of', () => {
    expect([...rawQuoteFormsOf('PYUSD')].sort()).toEqual(['PYUSD']);
  });
});

describe('the mirror-balance deployable set — pinned against ITS pre-conversion literal', () => {
  it('(a) THE MODULE OWN SET equals the hardcoded literal it replaced at a9785babc', () => {
    // FROZEN from server/services/kraken-mirror-balance.ts:33 at a9785babc:
    //   const DEPLOYABLE_USD_CODES = new Set(['ZUSD', 'USD', 'USDT', 'USDC']);
    // ⛔ THIS IMPORTS THE MODULE'S SET RATHER THAN RECOMPUTING THE DERIVATION HERE.
    // My first draft asserted `new Set(ADMITTED_QUOTES.flatMap(rawQuoteFormsOf))` — which
    // proves flatMap works and says NOTHING about whether the module uses it. Mutation-
    // tested: reverting the module to the union shorthand left all 9 tests GREEN. A
    // control that cannot fire is the defect it guards.
    expect([...DEPLOYABLE_USD_CODES].sort()).toEqual(['USD', 'USDC', 'USDT', 'ZUSD']);
  });

  it('⛔ the module derives the preimage — it does NOT carry a union with a hand-placed alias', () => {
    // ⛔⛔ STATED LIMIT, MEASURED NOT ASSUMED: NO TEST CAN SEPARATE THE UNION SHORTHAND FROM
    // THE PREIMAGE AT TODAY'S ADMITTED SET, because they produce the IDENTICAL set. That is
    // exactly what "correct by coincidence" means. Mutation-tested twice: swapping the module
    // to `new Set([...ADMITTED_QUOTES, 'ZUSD'])` leaves this whole suite GREEN, and I am
    // recording that rather than implying a guard I do not have.
    // ★ WHAT THIS TEST DOES BUY: it fires THE DAY THE ADMITTED SET CHANGES, which is the day
    //   the two forms diverge and the only day the difference can hurt. Admit EUR under the
    //   shorthand and `ZEUR` is absent — the loop below fails on it immediately.
    // ⚠️ WHAT GUARDS IT IN THE MEANTIME IS NOT THIS SUITE: it is `rawQuoteFormsOf`'s own
    //   contract tests above (EUR/GBP/CHF) plus the derivation being written correctly.
    for (const q of ADMITTED_QUOTES) {
      for (const raw of rawQuoteFormsOf(q)) {
        expect(DEPLOYABLE_USD_CODES.has(raw)).toBe(true);
      }
    }
    // and nothing beyond that preimage leaked in
    expect(DEPLOYABLE_USD_CODES.size).toBe(new Set(ADMITTED_QUOTES.flatMap(rawQuoteFormsOf)).size);
  });

  it('⛔ NEGATIVE CONTROL — the union shorthand passes TODAY and diverges on the first new quote', () => {
    // Proves the two forms are NOT interchangeable AT A DIFFERENT SET, which is the whole
    // claim — they ARE interchangeable at this one. This runs the divergence in-test on a
    // hypothetical EUR admission precisely because the live configuration cannot show it.
    const union = new Set([...ADMITTED_QUOTES, 'ZUSD']);
    const derived = new Set(ADMITTED_QUOTES.flatMap(rawQuoteFormsOf));
    expect([...union].sort()).toEqual([...derived].sort());          // agree at a9785babc …

    const withEur = ['USD', 'USDT', 'USDC', 'EUR'];
    const unionEur = new Set([...withEur, 'ZUSD']);
    const derivedEur = new Set(withEur.flatMap(rawQuoteFormsOf));
    expect(unionEur.has('ZEUR')).toBe(false);                        // … and diverge after.
    expect(derivedEur.has('ZEUR')).toBe(true);
  });
});
