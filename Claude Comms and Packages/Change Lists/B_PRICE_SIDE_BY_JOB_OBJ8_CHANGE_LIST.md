# B-PRICE-SIDE-BY-JOB r5 — OBJ-8 CHANGE LIST (commit 2, the decision layer)

**READY AT:** `origin/migration/aws-supabase` @ `2676d0b2b`
**Owner:** CC-C · **Step:** 4 of 11 · **Scope row:** `8f` (D9) · **Change-class:** `architecture`

---

## WHAT THIS COMMIT DOES

Row **`8f`**: *"Non-USD pairs are refused new admission, with a reason. Open positions keep their quote-currency exits, and their USD P&L shows as unavailable (D9)."*

**D9's own text is the hinge and it is why this is the interim, not the answer:** refuse *"until a timestamped currency conversion exists (`#966`)"*. `8f` is the block; row `12.7` (`B-QUOTE-CURRENCY-DENOMINATION`) is the conversion that **lifts** it.

---

## NEW FILES

### `shared/symbol-legs.ts` — `parseSymbolLegs(symbol) → {base, quote} | null`
Policy-free. Parses, or reports unparseable. **No refuse, no flag, no fallback, no log, and no quote allowlist inside** — a parser that knows the valid quote set goes stale the day the venue lists a new one. Tolerance lives at the call site (`parseSymbolLegs(s)?.base ?? s`), never behind a flag: strict-plus-a-tolerance-flag is two shapes wearing one name.

**WELL-FORMED = EXACTLY ONE `/`, BOTH LEGS NON-EMPTY.** `BTCUSD` → `null`, not `{base:'BTCUSD'}`.

### `shared/admitted-quotes.ts` — `ADMITTED_QUOTES = ['USD','USDT','USDC']`
The SSOT, with **all three consumers named at the definition site** so the list cannot be edited blind.

⛔ **The test is SET MEMBERSHIP, never "is it pegged."** Peggedness is an assertion about an asset with no instrument behind it: the day `USDC` prints 0.88 a peggedness predicate still reads ADMIT. Membership is decidable at any ref. **Peggedness is the REASON for the set and lives in the docblock; it is never the test.** The monitoring gap that leaves is stated and homed — row `3n.g`.

---

## MODIFIED

### `active-filter-pool.ts` — the gate, at **THREE** doors
```
private quoteRefusalReason(symbol) → 'symbol_unparseable' | `quote_not_admitted:${quote}` | null
```
Called from **`addSurvivors`, `addPatternPoolSurvivors` AND `addFamilyPoolSurvivors`** — three separate admission paths into pools the orchestrator reads.

⚠️ **I found doors 2 and 3 only because an insertion asserted `count == 1` and got 2.** Gating one would have left two open while the suite read green.

`addSurvivors` returns `refusedQuote`, documented as a **SUBSET of `skipped`**, not additional to it. Doors 2 and 3 return void, so their refusals are visible only in the log — which is one shape across all three and carries the door name.

### `universe-loader.ts` + `kraken-mirror-balance.ts` + `crypto-universe-filter.json` — the conversion
Both prior consumers moved onto the SSOT under the **(a)(b)(c) predicate**:
- **(a) set-identity** — each pinned against its pre-conversion literal, **frozen at `a9785babc`, spelled INLINE** in the test, never imported from the module or the JSON.
- **(b) domain unchanged** — the loader still normalises then tests (plain space); the mirror still matches raw `Balance` keys with no normalisation. Only provenance moved.
- **(c) no surviving second runtime source** — by **DELETION** on the loader side (`allowedQuotes` removed from the JSON *and* from `CryptoFilterConfig`, so no unread key is left looking tunable) and by **IN-PLACE REPLACEMENT** on the mirror. **Discharged, not waived.**

⛔ **The mirror derives the PREIMAGE, not a union with a hand-placed alias.** `new Set(ADMITTED_QUOTES.flatMap(rawQuoteFormsOf))`. `rawQuoteFormsOf` is exported; `ZQUOTE_TO_PLAIN` stays module-private, so the contract is the mapping question, not the table. **`[...ADMITTED_QUOTES, 'ZUSD']` is right today only by coincidence — admit `EUR` and it yields no `ZEUR`, which is how Kraken keys a euro balance, in the component that sizes real money (`#734`).**

Both parity-asserting comments deleted: the code now enforces what they claimed.

---

## VERIFICATION

**32 tests across three suites, all green. tsc 377 — the known baseline, zero in any file touched.** Every existing test that feeds the pool re-run: 17 green.

**EXPECTED OUTPUTS WERE WRITTEN BEFORE EACH IMPLEMENTATION RAN** (`#744` rider).

**MUTATION-TESTED, EACH CONTROL FIRING ON A DIFFERENT CLAUSE:**

| mutant | result |
|---|---|
| parser → the legacy OR-fallback shape | 9 of 13 fail |
| parser → drop the empty-leg clause only | 4 of 13 fail |
| parser → accept >2 parts, take the first two | 2 of 13 fail |
| `ADMITTED_QUOTES` → add a member | 3 of 10 fail |
| gate removed from **door 1** only | 6 of 9 fail |
| gate removed from **door 3** only | 1 of 9 fail (the family-door test) |

All restores verified byte-identical.

---

## ⛔ STATED LIMITS — THINGS THE SUITE DOES **NOT** PROVE

1. **No test can separate the preimage from the union shorthand at today's admitted set, because they produce the IDENTICAL set.** That is what "correct by coincidence" means. Mutation-tested twice: swapping the mirror to the shorthand leaves the suite **green**. ⇒ **recorded in the test file rather than implied away.** What it buys: it fires **the day the admitted set changes**, the only day the difference can hurt. What guards it meanwhile is `rawQuoteFormsOf`'s own EUR/GBP/CHF contract tests.
2. **`shared/symbol-legs.ts` has ZERO consumers on the legacy paths — deliberately.** 8f CREATES the SSOT and MIGRATES NOTHING; the 19 ad-hoc `split('/')` sites are `#1050` and belong to row `3n.h`. ⇒ **`#1050`'s acceptance is a census at close returning exactly one implementation and zero ad-hoc splits — not "the helper exists."**
3. **The `allowedTradingPairs` coupling is NOT fixed here**, and its five-way disposition is stated at row `3n.i` as the precondition for shipping this gate: `kraken.ts:695`/`:724` → **(5)** dead, delete; `active-scan-diagnostic.ts:141`/`:208` → **(3)** reconnect, or the gate and the diagnostic screen will disagree; the DB column → **(5)**, its non-empty default reads tunable and is not.

---

## THE JUDGEMENT CALLS I WANT ATTACKED

1. **Siting the gate at `active-filter-pool` rather than at each producer.** It is the one choke point all three writers pass through — but it is *downstream* of the scanners, so a refused pair still costs a full scan before being dropped. Cheaper to gate earlier; harder to prove complete. I chose provable completeness.
2. **Door 2 and door 3 return no refusal count.** Changing their signatures touches callers outside this row. The log carries the door name instead. If you want the counts, say so and it lands here rather than later.
3. **`refusedQuote` as a subset of `skipped` rather than a sibling.** A caller summing `added + updated + skipped` stays correct; one summing all four double-counts. The field is documented as a subset — I think that is the right trade and it is the reverse of the usual instinct.
