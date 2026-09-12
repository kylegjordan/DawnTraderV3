# B-PRICE-SIDE-BY-JOB r5 — OBJ-8 CHANGE LIST (commit 2, the decision layer)

**READY AT:** `origin/migration/aws-supabase` @ `2676d0b2b` → **r2 after Langston's CHANGES-NEEDED of 2026-09-12; new ref below.**
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
Called from **`addSurvivors`, `addPatternPoolSurvivors` AND `addFamilyPoolSurvivors`**.

⛔⛔ **CORRECTED r2 — MY r1 CLAIM WAS FALSE IN TWO PLACES, AND BOTH WERE LOAD-BEARING (Langston BLOCKERS 1 and 2, re-derived by me at the ref).**
1. **"Doors 2 and 3 return void" is FALSE for door 2.** `addPatternPoolSurvivors` returns `{ added, skipped }` and its caller already destructures both (`fx5-scanner.ts:1436`). **Adding `refusedQuote` is additive and touches NO caller** — so judgement call (b) rested on a false premise and is **overturned for door 2**. Worse, door 2 was doing a bare `skipped++`: live cycles print `added=6, skipped=28`, so 8f's refusals would have vanished into that 28. **Door 2 now returns `refusedQuote`, same subset semantics as door 1.**
2. **"Three separate admission paths into pools the orchestrator reads" is FALSE — only TWO are live.** `addFamilyPoolSurvivors` has **ZERO production callers** at the ref. ★ **My mutation control for that door fires only against the test's own direct call: it demonstrates the gate, never its reachability** — *the existence of a symbol is not the reachability of it.* It is hardened anyway, because `getFamilyPool` **is** read live (`signal-orchestrator.ts:2039`), so a dead writer sits beside a live reader. **That asymmetry is homed at `#1052` / row `3n.k`, not silently hardened.**

✅ **(c) upheld but INCOMPLETE in r1, and this is the half that mattered:** `refusedQuote` was returned and **printed nowhere**, so at every site a human reads, `skipped` would jump with nothing saying why. **All three printers now carry it** — `fx5-scanner.ts` pool + pattern lines and `unified-filter-gateway.ts`.

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
| gate removed from **door 3** only | 1 of 9 fail ⚠️ **DEMONSTRATES THE GATE, NOT REACHABILITY** — it fires against the test's own direct call, and that door has no production caller (`#1052`). Recorded as a weak control rather than presented as a strong one |
| gate removed from **door 2** only | 1 of 9 fail (added r2 — door 2 IS live, and this control is the strong one of the two) |

All restores verified byte-identical.

---

## ⛔ STATED LIMITS — THINGS THE SUITE DOES **NOT** PROVE

1. **No test can separate the preimage from the union shorthand at today's admitted set, because they produce the IDENTICAL set.** That is what "correct by coincidence" means. Mutation-tested twice: swapping the mirror to the shorthand leaves the suite **green**. ⇒ **recorded in the test file rather than implied away.** What it buys: it fires **the day the admitted set changes**, the only day the difference can hurt. What guards it meanwhile is `rawQuoteFormsOf`'s own EUR/GBP/CHF contract tests.
2. **`shared/symbol-legs.ts` has ZERO consumers on the legacy paths — deliberately.** 8f CREATES the SSOT and MIGRATES NOTHING; the 19 ad-hoc `split('/')` sites are `#1050` and belong to row `3n.h`. ⇒ **`#1050`'s acceptance is a census at close returning exactly one implementation and zero ad-hoc splits — not "the helper exists."**
3. **The `allowedTradingPairs` coupling is NOT fixed here**, and its five-way disposition is stated at row `3n.i` as the precondition for shipping this gate: `kraken.ts:695`/`:724` → **(5)** dead, delete; `active-scan-diagnostic.ts:141`/`:208` → **(3)** reconnect, or the gate and the diagnostic screen will disagree; the DB column → **(5)**, its non-empty default reads tunable and is not.

---

## ⭐ THE MAGNITUDE, AND IT IS PRE-REGISTERED AS A STEP-8 PREDICTION RATHER THAN READ AFTERWARDS

⛔ **8f REMOVES ROUGHLY A THIRD OF THE LIVE CRYPTO EVALUATION UNIVERSE. That is the number this change list omitted in r1** (Langston BLOCKER-3, measured on staging `out.log`, 486,199-line slice ending 2026-09-12T13:07:41Z):
- **Distinct orchestrator eval-lane symbols:** admitted **70 USD + 9 USDC + 6 USDT = 85** · refused **20 EUR + 6 GBP + 6 CAD + 5 CHF + 5 AUD + 3 JPY + 2 SOFID = 47**.
- **By occurrence:** 3,081 admitted vs **1,758 refused**.

✅ **AND AT THE OBJECT THAT DECIDES WHETHER TO SHIP IT — `closed_trades`, all slashed symbols, positive control the USD row returning: 96 of 755 closed active-path trades (12.7%) are in non-admitted quotes** — EUR 54, GBP 20, CHF 9, AUD 8, CAD 5 — spanning 2026-07-15 to **2026-09-11, i.e. yesterday. D9's defect is realised in the live record and still producing rows.** That is the case for shipping, not an argument against it.

**PRE-REGISTERED STEP-8 PREDICTION, written before the deploy so it cannot be fitted afterwards:** after 8f lands, **eval-lane refusals appear at roughly the rates above and the admitted set stops acquiring new non-admitted quotes entirely** — zero new `closed_trades` rows in a non-admitted quote, on any row whose entry postdates the deploy. **A single such row is a FAIL, not noise.**

⚠️ **AND A CONSEQUENCE THAT IS NOT `#966` AND NEEDS ITS OWN HOME:** those 96 rows contaminate **every P&L-derived consumer of that sink** — F-G-2's window, the `#596` outcome corpus, learning, dashboard earnings. **Blocking new ones does not clean the existing ones.** `HOME: folded into row 12.7 B-QUOTE-CURRENCY-DENOMINATION as an added objective` — the back-correction rides the conversion that makes it computable.

---

## THE JUDGEMENT CALLS I WANT ATTACKED

1. **Siting the gate at `active-filter-pool` rather than at each producer.** It is the one choke point all three writers pass through — but it is *downstream* of the scanners, so a refused pair still costs a full scan before being dropped. Cheaper to gate earlier; harder to prove complete. I chose provable completeness.
2. **Door 2 and door 3 return no refusal count.** Changing their signatures touches callers outside this row. The log carries the door name instead. If you want the counts, say so and it lands here rather than later.
3. **`refusedQuote` as a subset of `skipped` rather than a sibling.** A caller summing `added + updated + skipped` stays correct; one summing all four double-counts. The field is documented as a subset — I think that is the right trade and it is the reverse of the usual instinct.
