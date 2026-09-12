/**
 * shared/symbol-legs.ts — B-PRICE-SIDE-BY-JOB r5 OBJ-8, row 8f (`#1050`).
 *
 * THE ONE PLACE A TRADING SYMBOL IS SPLIT INTO ITS BASE AND QUOTE LEGS.
 *
 * ═══ WHY IT EXISTS ═══
 * The legs are currently derived at 19 ad-hoc `split('/')` sites in THREE mutually
 * inconsistent shapes (`#1050`, measured 2026-09-12 at `origin/migration/aws-supabase`):
 *   1. `active-execution-engine.ts:4172` — `signal.symbol.split('/')[0]`, OR-fallback to the symbol
 *   2. `routes.ts:12958`                 — `position.symbol.split('/')[0]`, OR-fallback to the symbol
 *   3. `routes.ts:5082-5083`             — a suffix-strip, and a TWO-WAY quote ternary
 * Shape 3 is correct only on the UNSLASHED form: `BTC/USD` yields base `"BTC/"`, and its
 * quote answer is `endsWith('USDT') ? 'USDT' : 'USD'` against a population carrying EIGHT
 * distinct quote legs — so every EUR, GBP, CHF, AUD, CAD and USDC pair reads as USD-quoted.
 *
 * ★ THE TWO HALVES FAIL DIFFERENTLY, AND THAT DECIDES WHICH IS URGENT (Langston, 2026-09-12):
 * the BASE half fails LOUD — `"BTC/"` is a visibly malformed string a reader flags on sight.
 * The QUOTE half fails SILENT — a plausible `'USD'` wears a correct answer's clothes on 116
 * non-USD rows. That is the `#546` absent-as-valid shape, and it is the one to fear.
 *
 * ═══ ⛔ THIS FUNCTION IS POLICY-FREE, AND IT MUST STAY THAT WAY ═══
 * It PARSES, or it REPORTS UNPARSEABLE. It does NOT refuse, flag, fall back, or log.
 *
 * ⛔ NO QUOTE ALLOWLIST LIVES HERE. Which quotes may be TRADED is row 8f's refuse-policy and
 *    belongs at the admission gate. A parser that knows the valid quote set goes stale the
 *    day the venue lists a new one, and then silently mis-parses rather than visibly refusing.
 *
 * ⛔ TOLERANCE LIVES AT THE CALL SITE, NEVER BEHIND A FLAG. The existing sites are TOLERANT
 *    (`|| symbol`); 8f's admission assertion is STRICT. One helper built to the strict shape
 *    plus a `tolerant: true` option would be TWO SHAPES WEARING ONE NAME — worse than the
 *    three honest ones it replaces. A caller that genuinely wants the old behaviour writes it
 *    where a reader can see it:  `parseSymbolLegs(s)?.base ?? s`
 *
 * ═══ SCOPE OF THIS COMMIT (Langston's boundary, 2026-09-12) ═══
 * 8f CREATES this SSOT; it MIGRATES NOTHING. The three sites above are `#1050`'s fix and
 * belong to `PHASE_19_PLAN` row `3n.h` (`B-QUOTE-LEG-INTEGRITY`), not here. It is sited in
 * `shared/` precisely so `3n.h` can adopt it WITHOUT importing 8f's admission guard —
 * otherwise the conversion either drags the guard along or skips the helper, and a fourth
 * shape appears.
 * ⚠️ `#1050`'s acceptance is therefore NOT "the helper exists": it is a census at close
 *    returning EXACTLY ONE implementation and ZERO ad-hoc splits. A helper nobody adopted
 *    satisfies the word "one derivation" and none of its purpose.
 */

/** The two legs of a well-formed trading symbol, both upper-cased and trimmed. */
export interface SymbolLegs {
  /** The asset being traded — `BTC` in `BTC/USD`. */
  base: string;
  /** The currency it is priced and settled in — `USD` in `BTC/USD`. */
  quote: string;
}

/**
 * Split a trading symbol into its base and quote legs.
 *
 * WELL-FORMED means EXACTLY ONE `/`, with BOTH legs non-empty after trimming. Anything else
 * returns `null` — including the zero-slash form (`BTCUSD`) that the legacy OR-fallback
 * silently accepts by storing the whole symbol as the base leg.
 *
 * @returns the two legs, trimmed and upper-cased, or `null` if the symbol is not well-formed.
 *          **`null` means "I cannot tell", never "USD" and never the input echoed back.**
 */
export function parseSymbolLegs(symbol: string): SymbolLegs | null {
  if (typeof symbol !== 'string') return null;

  const parts = symbol.split('/');
  if (parts.length !== 2) return null;          // zero slashes, or more than one

  const base = parts[0]!.trim().toUpperCase();
  const quote = parts[1]!.trim().toUpperCase();
  if (base === '' || quote === '') return null; // whitespace is not content

  return { base, quote };
}
