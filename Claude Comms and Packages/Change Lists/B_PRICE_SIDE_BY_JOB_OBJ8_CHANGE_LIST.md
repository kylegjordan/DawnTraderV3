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
2. **"Three separate admission paths into pools the orchestrator reads" is FALSE — and r2 only half-corrected it. There is exactly ONE door into evaluation (Kyle, 2026-09-13).** `signal-orchestrator.ts:2057` builds `eligibleSymbols` from **`getActivePool` ALONE**, and the loop at `:2109` iterates only that. ⇒ **`addSurvivors` is the door.** The pattern and family pools do not add symbols — they only TAG symbols with strategy families for selection (`:2043-2054`), so a pattern-pool symbol absent from the active pool is tagged and never evaluated. ✅ **Gating them is cheap and means a future change that makes them evaluable arrives pre-gated — but it is NOT defence of a live hole and is not claimed as one.** Separately, `addFamilyPoolSurvivors` has **ZERO production callers** at the ref. ★ **My mutation control for that door fires only against the test's own direct call: it demonstrates the gate, never its reachability** — *the existence of a symbol is not the reachability of it.* It is hardened anyway, because `getFamilyPool` **is** read live (`signal-orchestrator.ts:2039`), so a dead writer sits beside a live reader. **That asymmetry is homed at `#1052` / row `3n.k`, not silently hardened.**

✅ **(c) upheld but INCOMPLETE in r1:** `refusedQuote` was returned and **printed nowhere**, so at every site a human reads, `skipped` would jump with nothing saying why.
⛔⛔ **AND r2 FIXED THREE OF FIVE — `fix-follows-pointer` LANDING ON ME INSIDE THE FIX FOR IT (Langston CONDITION 1).** He named three call sites; I fixed the three sites and **not the class**. `active-filter-pool.ts:493` still printed the **same `[14.5][PATTERN_POOL]` tag** as the fixed `fx5-scanner.ts:1436`, so one grep on that tag would return a line carrying the count beside a line carrying the bare `skipped=28` **that this blocker was about**. `:395` had the same shape for door 1.
✅ **r3 FIXES THE CLASS, and the control is stated: a whole-tree grep for `skipped=${` across the three pool modules returns FIVE printers, FIVE carrying `refusedQuote`, ZERO without** — and both `[14.5][PATTERN_POOL]` lines carry it, so the tag can no longer return a mixed pair.

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

## ⭐ CONDITION 2 — THE PRE-DEPLOY OPEN-POSITION SNAPSHOT (captured BEFORE the gate is live)

**`Batch Completion/B_PRICE_SIDE_BY_JOB_EVIDENCE/obj8_8f_predeploy_open_positions_2026-09-12.txt`**, captured 2026-09-12T13:26Z at ref `4920a19a8`.

★ **WHY IT HAD TO BE TAKEN NOW: the Step-8 criterion keys on the ENTRY postdating the deploy.** The gate is not live yet, so a non-admitted entry can still open before it lands — and a post-deploy CLOSE of a pre-deploy entry would then be adjudicated after the fact. ⛔ **Without the captured `(id, symbol, opened_at)` list the FAIL condition is unfalsifiable in exactly the direction that looks like a PASS.**

**Contents: 5 open, all USD** — `CRWD/USD`, `MDB/USD`, `GEV/USD` (xstock), `SUI/USD`, `AERO/USD` (crypto), earliest `opened_at` 2026-09-10T14:06Z. **None would be refused by 8f.**
✅ **POSITIVE CONTROL, so the snapshot's clean reading is not mistaken for a predicate that always says yes: the same test over `closed_trades` discriminates.**
⛔ **CORRECTED (Langston, 2026-09-12): my `654 admitted / 96` MIXED THE CLASSES and the correct figure is `crypto_spot` 385 admitted / 96 non-admitted.** `xstock_spot` contributes 274 of 274 admitted **BY CONSTRUCTION** — every xStock pair is USD-quoted, so those rows CANNOT be non-admitted and can only DILUTE the share. ★ **Always quote 385 / 96 with the class named.** The open set is simply clean; the predicate is not trivially true.

---

## ⛔⛔ 8f IS LOG-ONLY. KYLE CANNOT SEE IT ON ANY SCREEN.

**Whole-tree census at the deployed ref `2dbc512ee` (Langston, re-derived): `refusedQuote` appears in `active-filter-pool.ts`, the FIVE log printers, and the unit test. ZERO routes. ZERO client files.**
⛔ **AND MY OWN "the gate's visible surface is the filter-diagnostics counts" WAS WRONG AT THE OBJECT.** That panel's `skipped*` columns are a DIFFERENT POPULATION — `pairsSkippedNoPrice`, `pairsSkippedInsufficientOHLC`, `nullReasons.*` (`vts-filter-diagnostics-panel.tsx:911-917`) are PER-EVALUATION skips, not POOL ADMISSION. **8f's only surface is `error.log`.**

⇒ **RULE 24 OUTCOME (2) — a scope decision, not a defect: either plumb `refusedQuote` into the diagnostics payload as its own row, or say plainly that it is invisible. SAID PLAINLY HERE.** ★ **Chosen: do NOT grow a deployed batch.** `HOME: §9.4 (2), folded into PHASE_19_PLAN row 3n.i (B-QUOTE-ADMISSION-LEGACY-SWEEP)` — which already carries the reconnect of `active-scan-diagnostic`'s quote counter for the same reason: **otherwise the gate and the screen disagree, which is the `#938`/`#921` family one layer up.**

---

## ⛔ STATED LIMITS — THINGS THE SUITE DOES **NOT** PROVE

1. **No test can separate the preimage from the union shorthand at today's admitted set, because they produce the IDENTICAL set.** That is what "correct by coincidence" means. Mutation-tested twice: swapping the mirror to the shorthand leaves the suite **green**. ⇒ **recorded in the test file rather than implied away.** What it buys: it fires **the day the admitted set changes**, the only day the difference can hurt. What guards it meanwhile is `rawQuoteFormsOf`'s own EUR/GBP/CHF contract tests.
2. **`shared/symbol-legs.ts` has ZERO consumers on the legacy paths — deliberately.** 8f CREATES the SSOT and MIGRATES NOTHING; the 19 ad-hoc `split('/')` sites are `#1050` and belong to row `3n.h`. ⇒ **`#1050`'s acceptance is a census at close returning exactly one implementation and zero ad-hoc splits — not "the helper exists."**
3. **The `allowedTradingPairs` coupling is NOT fixed here**, and its five-way disposition is stated at row `3n.i` as the precondition for shipping this gate: `kraken.ts:695`/`:724` → **(5)** dead, delete; `active-scan-diagnostic.ts:141`/`:208` → **(3)** reconnect, or the gate and the diagnostic screen will disagree; the DB column → **(5)**, its non-empty default reads tunable and is not.

---

## ⭐ ROW `8a` — D3 AT THE xSTOCK EXIT TOUCH PRICE (added 2026-09-13, ref `77423bdc4`)

**THE DEFECT.** After withholding `hollowSkipCap` consecutive ticks **because the book was unusable**, the yield **fell through and acted on the mark of that same unusable book** — and `_eqTick.price` is the **MIDPOINT** whenever both sides exist (`equity-spot-archiver.ts:210`), however absurd those sides are. The branch said so in its own comment: *"the engine is about to act on this mark."*

**MEASURED, `CRM/USD` 2026-09-12T00:16:31Z (`#958`):** book **7.00 / 1000.00** ⇒ midpoint **503.50**, booked `target_hit` at **+$7.15**.

**THE FIX — D3, decided 2026-09-11, supersedes the fall-through.** Ladder: book top where valid and fresh → else the ticker sides where valid and inside D6's age → **else REFUSE the price-dependent action, which for an exit is a HOLD.** ★ **On this leg the ticker snap IS the sides** — xStock has no separate depth feed — **so a `hollow` verdict has already failed BOTH rungs on the same object and the ladder terminates at REFUSE.** The yield now records the skip, engages the escalation rail, and `continue`s. **No `updateCache`**, for the same reason as the skip branch (Langston C1): the engine did not act, so the cache must not say it did.

⛔⛔ **A CORRECTION TO MY OWN JUSTIFICATION — MEASURED, AND IT STRENGTHENS THE FIX.** I claimed a usable price existed and was ignored: the ticker 91 s earlier at **bid 235.00 / ask 248.40**. **The predicate disagrees and it is right** — that bid is a **4.86% drop against a 0.400% trailing spread**, so it reads `hollow:bid_collapsed` **on our own measure**. A 12-point bid move on a name quoting a 1-point spread seconds earlier is a handover artefact, not a price.
⇒ **EVERY frame from the boundary on was unusable, which is exactly why the guard withheld 60 ticks (≈90 s, 00:15:00 → 00:16:31) before yielding. Acting on 503.50 was not a choice between two prices — it was inventing one.**

⚠️ **AND A SECOND MEASURED SURPRISE, pinned rather than glossed: I expected the 7/1000 frame to read `bid_collapsed` + `ask_spiked`. It reads `mark_deviation`** — with both sides deranged the mark moves far enough to short-circuit before either side arm is reached. Same verdict, different reason. The fixture pins the arm that FIRES, not the one that sounds right.

⚠️ **WHAT IT COSTS, STATED:** the position stays open while the book is unusable, so a genuine adverse move in that window is **not acted on**. The alert above the branch fires and the skip rail escalates. **The alternative is a fabricated fill that also corrupts every P&L-derived consumer of `closed_trades`.**

**VERIFICATION.** Three fixtures on the real CRM row added to `b-xstock-feed-sanity-book-state.test.ts` — **44 green** in that file, **tsc 377** at baseline. One counter, not two: every yield is now a refusal, and `hollowYields` already prints in the `[I7-PRICE-FIX][EVAL_EXIT]` cycle line, so the refusal is visible without new telemetry.

⛔⛔ **r2 — THE BLOCKER: r1 REFUSED ONE TICK TOO EARLY, AND `CRM/USD` WOULD STILL HAVE BOOKED AT 503.50** (Langston, 2026-09-13, measured on the row; re-derived by me).
The yield and the close are **1,583 ms apart — ONE MONITOR TICK**. The row reads `exit_book_state='unknown'`, basis `guard`, `metadata.bookState.yielded=FALSE`; `yields[0]` at 00:16:30.065Z, `closed_at` 00:16:31.648Z. ⇒ **the close did NOT happen on the yield tick.**

**THE APERTURE IS THE REFERENCE DROP ITSELF.** The yield calls `clearBookStateComparator` BEFORE refusing, so next tick the SAME 7.00/1000.00 frame has no prior ⇒ all three hollow arms unreachable ⇒ `unknown`/`no_comparator` ⇒ `_seedable` admits it BY DESIGN ⇒ it seeds ON the hollow frame ⇒ r1 fell through to 503.50. ★ **The existing comment calls that drop the BOUND; it is also the aperture, and both are true — dropping is right, ACTING on what replaces it is not.**
**SPLIT, MEASURED: `NEM/USD` (`hollow`/`yielded=true`, 00:16:30.482Z) closed ON the yield tick and r1 caught it. `CRM/USD` closed on the tick after and r1 did NOT. ONE OF TWO.**

✅ **r2's RULE, and it is D3's own word "valid": act only on `two_sided` AND `comparatorValidated === true`.** A comparator seeded THIS tick has judged nothing — there was nothing to judge it against — so it cannot make a frame valid, and the ladder terminates at REFUSE. ★ **First decision-site consumer of `validated`, the flag whose own docstring records that it "HAD ZERO CONSUMERS" (D3 FIX 2026-09-05); it was returned so a seed frame could be told apart from a judged one.**
⚠️ **COST — CORRECTED r3 (Langston C2): it is TWO ticks, not one, and a stated cost has to be right.** The first post-clear tick refuses on STATE (`unknown`); the second refuses on the STALE `validated=false` snapshot, because `_bs.comparatorValidated` is read PRE-advance. **Fail-safe direction, no harm — but it is the same read-ordering that bounds the r2 blocker, so it is not a coincidence and it is not rounding.**

**THE TWO-TICK FIXTURE, which is the test that would have caught r1:** every other fixture in that file is single-tick and the defect is a MULTI-TICK property. Four cases — tick 1 hollow WITH a comparator; tick 2 the IDENTICAL frame reading `unknown`/`no_comparator` WITHOUT one; the refusal predicate satisfied on tick 2; and a NEGATIVE CONTROL proving a healthy validated frame still ACTS, so the rule cannot be satisfied by refusing everything.
⛔⛔ **r3 — THAT MUTATION PROOF WAS WORTHLESS AND I AM STRIKING IT (Langston C1).** The r2 fixture restated the ENGINE'S RULE as a local boolean inside the test (`const refuses = r.state !== 'two_sided' || comparatorValidated !== true`). ⇒ **DELETE `aee:1610` AND ALL 48 STAY GREEN.** It certified the restatement, never the decision site — the `#1000` condition-1 shape — and **ticks 3-4 are inexpressible in it, which is exactly how the r2 blocker walked through a suite I had called mutation-proved.** It stands as a PREDICATE fixture and **may not be cited as verification of the refusal.**
⚠️ **My FIRST mutation run reported 48 green because the substitution silently did not apply (CRLF mismatch). An unfired mutation is not evidence, so it was re-run with matching line endings before the figure was used.**

**FINDINGS 1 AND 2 TAKEN.** `hollowYieldRefusals` was declared, never incremented, never printed — and `tsconfig.json` has no `noUnusedLocals`, so tsc structurally could not see it, which is why "tsc 377 at baseline" was consistent with it existing. Replaced by `unvalidatedRefusals`, which IS incremented and IS printed in the `EVAL_EXIT` cycle line. ✅ **CONTROL: all three counters in that block are declared-and-printed, 3 of 3.** The header comment *"a yield is a tick acted on at the cap"* is corrected — false since D3.

⛔ **FINDING 3 — THE LABEL CONSEQUENCE, AND MY OWN PASS CRITERION WAS BROKEN TWICE OVER.** `exit_book_state='hollow'` + basis `guard` was producible ONLY by the yield tick's own close, which is now refused ⇒ **forward it goes to ZERO.** ⇒ my pre-registered criterion *"zero closes with `hollow` + `guard` + `yielded=false`"* became **SATISFIABLE BY CONSTRUCTION** — and it was **ALREADY BLIND TO CRM**, which reads `unknown`/`false`.
✅ **REPLACED — r3 FORM, and the r2 form is struck (Langston C3).**
⛔⛔ **THE r2 REPLACEMENT CARRIED NO DENOMINATOR, NO WINDOW FLOOR AND NO n-FLOOR — and my OWN amendments 1 and 2, TWENTY LINES BELOW IT, are exactly those two rules applied to the sibling criterion. `fix-follows-pointer`, in the same document, against my own text.** It was also **satisfiable-by-construction in the OTHER direction**: refusing HOLDS positions, so boundary closes stop and the numerator goes to zero because the POPULATION EMPTIED, not because the defect stopped.
**THE CRITERION, r3:** *zero new xStock closes, on any row closing after the deploy, where `ABS(exit_decision_price - exit_price) / exit_price > 5%` —* **printed BESIDE its boundary-minute close denominator.**
- **WINDOW FLOOR:** enumerate SESSION BOUNDARIES (`00:15`, `20:15`, `13:45` ET-derived) at which **≥1 xStock position was open**; the window closes only once that count reaches its floor, not on elapsed days.
- **POSITIVE CONTROL, mandatory, or the zero is unreadable:** `unvalidatedRefusals` and `_recordPriceSkip(..., 'book_state_yield_refused')` **must be NON-ZERO in-window.** A zero numerator beside a zero control means the mechanism never ran.
- **n BELOW FLOOR ⇒ `INCONCLUSIVE-EXTEND`, never PASS.**
**Pre-fix baseline, unchanged: 9 of 22 boundary-minute rows exceeded 5% (max 92.7%) against 0 of 15 off-boundary.**
➕ **AND `ready_to_buy_service.ts:2299-2300` keeps a `guard` arm that can no longer match — a live predicate bound to a frozen historical population. NOT a defect; unreadable later if not written down now.**

⛔ **FINDING 4 — ESCALATION REACH, AS A MAGNITUDE RATHER THAN A REASSURANCE.** `hollow_skip_cap=60`, `max_consecutive_price_skips=40`, and the skip branch never calls `_recordPriceSkip` ⇒ **the rail needed 40 yields = 2,400 consecutive hollow ticks ≈ 60 MINUTES.** The yield alert dedupes on `book-state-hollow-${mode}-${symbol}` and is **suppressed while unresolved**, so a first occurrence alarms in ≈90 s and a repeat on the same unresolved symbol alarms nothing while the position stays open.
⚠️ **r2 NARROWS THE FIRST HALF ONLY: the reseed refusal DOES call `_recordPriceSkip`, so the rail now advances every tick rather than every 60.**
✅ **THE ALERT HALF IS HOMED, NOT FIXED HERE (Langston, §13 disposition 2):** the first-occurrence-only behaviour is the SHARED dedupe / non-terminal-ack semantics at `system-alerts.ts:388-389`, so a local workaround in 8a would be a **patch on a shared contract**. **HOME: an item on `B-ALERT-QUEUE-INTEGRITY`, `PHASE_19_PLAN` row `2.4b`, owner CC-B.**

⛔⛔ **r3 — THE BLOCKER: r2's GATE SELF-CLEARS IN TWO TICKS AND `CRM/USD` STILL BOOKS 503.50** (Langston, 2026-09-13, every line re-read by him; re-derived by me).
- **tick 2** (reseed): advance with `validatedByTwoSided = false` ⇒ `validated=false` ⇒ r2 refuses. ✅
- **tick 3**, SAME 7.00/1000.00 frame, comparator now IS that frame: `bidDep = askDep = midDep = 0` against a threshold ≥ 0.01 ⇒ **no arm reachable ⇒ `two_sided`** ⇒ the advance runs FIRST with `validatedByTwoSided = true` ⇒ **`validated` → TRUE.**
- **tick 4:** `two_sided` + validated ⇒ the gate does not fire ⇒ **503.50 booked, ≈4.7 s after the yield instead of 1,583 ms.**
★★ **AND THE FILE I CHANGED STATES THIS MECHANISM 50 LINES ABOVE MY CHANGE:** *"a comparator seeded from a hollow frame makes the next hollow frame read `two_sided`, and that verdict is what would validate it … This fix stops the field lying; it does not close the hole."* ⇒ **I wired in a flag whose own docstring says it does not close the hole. Wiring `validated` into the decision site does not escape the circularity — it IS the circularity's output.**

✅ **r3's FIX, his direction, NO NEW KNOB: on a yield-clear DROP THE POINT REFERENCE BUT RETAIN THE CHAIN'S SPREAD RING, and refuse to promote `validated` on a new chain whose SEED SPREAD exceeds `kRel ×` that retained median.** `CRM`: retained ≈0.40%, `kRel×` = 1.2%, seed spread (1000−7)/503.5 = **197%** ⇒ never validates ⇒ **HOLD**, which is the stated policy, with the alert already firing. ★ **A healthy re-seed qualifies immediately, so the latch the clear exists to fix stays fixed.**
★ **A REFERENCE CANNOT JUDGE ITS OWN SEED. The retained ring is the one datum from OUTSIDE the new chain that costs nothing.**
⚠️ **COST, WRITTEN DOWN RATHER THAN DISCOVERED: a book that never recovers HOLDS INDEFINITELY.** The position stays open throughout — real exposure, not a free win.
✅ **`kRel` is PASSED IN, not resolved inside the writer** — resolving it there would make a test that cannot reach the config take the fail-safe branch and **pass for the wrong reason**. `null` ⇒ unreadable ⇒ seed treated as implausible.

**THE TEST HE ASKED FOR, AT THE TRACKER — `b-price-side-obj8-reseed-selfvalidation.test.ts`, 8 cases.** It drives the REAL state machine (`advanceBookStateComparator` / `clearBookStateComparator` / `readBookStateComparator`) and asserts the FIELDS the engine branches on. **No rule is restated in it.** Ticks 1→4 including **tick 3's self-validation pinned as measured**, plus THREE controls: a healthy re-seed validates immediately; a cold start with no retained ring still seeds; an unreadable `kRel` fails safe.
✅ **MUTATION-PROVED AT THE DECISION SURFACE, both firing:** removing `seedImplausible` from `validated` (i.e. reverting to r2) fails **2 of 8**; making the clear stop retaining the ring fails **3 of 8**. **56 green across both book-state files; tsc 377 at baseline.**

⛔⛔ **r4 — BLOCKER-2: THE IMPLAUSIBLE CHAIN OWN RING BECAME THE NEXT SEED PLAUSIBILITY DATUM, AND THE GATE SELF-CLEARED AFTER THE SECOND YIELD CYCLE** (Langston, 2026-09-13; traced by him, re-derived by me).
`spreads` is computed BEFORE the implausibility check, so chain B ring is `[1.9722]`; the clear retained it **unconditionally**, and the seed had already deleted the healthy `[0.004…]`. Traced:
- Chain B seeds 7.00/1000.00 ⇒ `seedImplausible=true` ⇒ HOLDS. ✅ r3 works on cycle one.
- That ring median 1.9722 ⇒ threshold `max(3 × 1.9722, 0.01)` = **5.917** ⇒ **both side arms unreachable**, leaving only the absolute 5% `mark_deviation`. The book wanders 7/1000 → 7/1200 ⇒ hollow ⇒ 60 ticks ⇒ yield ⇒ clear retains `[1.9722,…]`.
- Reseed 7/1200: seed spread `(1200−7)/603.5` = **1.977** vs `3 × 1.9722` = **5.917** ⇒ **PLAUSIBLE** ⇒ next tick self-compares to zero departures ⇒ `two_sided` ⇒ `validated=true` ⇒ **603.50 booked. Same terminal row, ~3 minutes later instead of 4.7 s.**
★★ **MY OWN STATED PRINCIPLE NAMED THE DEFECT AND I DID NOT APPLY IT TO MY OWN MECHANISM:** *the circularity needs a datum from OUTSIDE the new chain.* **After one cycle, an unconditionally-retained ring IS the broken chain.**

✅ **r4 — TWO LINES, STILL NO NEW KNOB:** the clear **retains only when `!prev.seedImplausible`**, and the seed **consumes the ring only when the seed was judged plausible**. ⇒ **the ring stays the last PLAUSIBLE instrument evidence and is consumed by the first plausible seed.**
⚠️ **COST, WRITTEN DOWN NOT INHERITED: a GENUINE permanent re-rating of the instrument spread now holds until a restart clears the module singleton.** That is the fail direction already accepted — but it is now stated rather than assumed.

✅ **MUTATION-PROVED, BOTH HALVES, EACH HITTING A DIFFERENT TEST:** retaining unconditionally (the r3 state) fails **1 of 11**; consuming unconditionally at the seed fails **1 of 11**. **59 green across both book-state files; tsc 377 at baseline.**

⚠⚠ **TWO RESIDUALS — PINNED AS TESTS, NOT FIXED, so the criterion is not read as covering them (Langston):**
1. **THE RESTART PATH IS NOT CLOSED.** r3/r4 close the YIELD-CLEAR path. With **no retained ring at all**, a process coming up mid-hollow seeds unvalidated (refused — correct), and then **tick 2 self-compares to zero departures, reads `two_sided`, and VALIDATES.** ★ **Asserted as-is in the suite so the gap is visible rather than assumed absent.**
2. **The `kRel === null` arm is UNREACHABLE IN PRODUCTION** — `resolveBookStateConfigSync` throwing exits at `aee` `knobs_missing` BEFORE the advance. **Defensive only; nobody may cite it as a live control.** Relabelled in the test.

⛔⛔ **r5 — BLOCKER-3: `!seedImplausible` IS THE ABSENCE OF A NEGATIVE, NOT A POSITIVE, AND THE ONE CHAIN CLASS IT LETS THROUGH IS THE ONE THAT CAN SEED HOLLOW** (Langston, 2026-09-13).
A COLD-START chain gets `seedImplausible = false` **VACUOUSLY** — `retainedMedian === null`, so the check never runs. ⇒ restart mid-hollow on 7.00/1000.00 → tick 1 refused → tick 2 self-validates (the pinned residual) → the book wanders to 7.00/1200.00 → `mark_deviation` → 60 skips → yield → **the clear retains `[1.9722,…]` AS THE INSTRUMENT DATUM.** Every later seed is then judged against median 1.9722, threshold 5.917, and reads PLAUSIBLE.
★★ **That is r3's defect restored through the COLD-START DOOR, permanent until restart, and in the PERMISSIVE direction — strictly worse than the hold-forever cost I had written down for the other direction.**

✅ **r5 — THE DISCRIMINATOR IS HIS AND IT COSTS NO KNOB: a real book MOVES; a frozen artefact does not.** New field `observedMovement`, set the first time an advance sees `bid` or `ask` differ from the prior. **The retain gate is now a POSITIVE property** — `!seedImplausible && observedMovement` — so a frozen 7.00/1000.00 chain can never write its ring into the slot the mechanism defines as OUTSIDE. ⚠️ **Frame count alone would not do it: an unchanging broken book reads `two_sided` forever, which is the circularity one level up again.**

✅ **MUTATION-PROVED: reverting the gate to `!seedImplausible` alone (the r4 state) fails 1 of 14.** **62 green across both book-state files; tsc 377 at baseline.**

⛔⛔ **AND THE GATE BROKE FOUR OF MY OWN TESTS ON LANDING, WHICH WAS THE FIXTURE AND NOT THE GATE:** `seedHealthyChain` advanced **five IDENTICAL frames**, which is not what a live book does. Corrected to a moving chain. ➕ **The consequence is pinned rather than hidden by the new fixture: a genuinely healthy but PERFECTLY FROZEN book never sets `observedMovement` either, so its ring is not retained and a later seed gets the same vacuous `seedImplausible = false`. It cannot CONTAMINATE — nothing broken is kept — but it does NOT REFUSE.** Same residual class, reached a different way, asserted as-is.

➕ **RESIDUAL 1's PIN UPGRADED, because his objection was that it under-stated:** the restart chain **still self-validates** (open, asserted) — but it can **no longer contaminate the retained ring**, and the pin now says both halves. *"A bounded-sounding label on an unbounded exposure"* was the right criticism of the r4 wording.

➕ **FINDING-1 TAKEN — `_retainedSpreads` IS REGISTERED IN THE SIM AS `S25b`** (§17; the census returned one file and zero doc hits). **Its bound is stated rather than implied: THERE IS NO EVICTION AND NO AGE TERM.** `_comparators` is bounded by held names and refreshed every frame; **this map is written at a clear and deleted only at a plausible seed, so a ring left behind when a position closes mid-implausible NEVER EXPIRES and can be the yardstick for a seed days later.** Conservative in the refusing direction, unbounded in time, nothing evicts it.

⛔⛔ **r6 — BLOCKER-4, AND THE RULING THAT MATTERS MOST: STOP GATING. LANGSTON HAS RULED r5 THE LAST GATE (2026-09-13).**

**THE HOLE:** `observedMovement` is EARNED on frame 2 of a COLD-SEEDED hollow chain, by that chain's own broken ring. Cold start 7.00/1000.00 seeds vacuously plausible; tick 2 with the live side ticking ONE CENT gives `bidDep = −0.0014` against `kRel × 1.986` = **5.96**, so **no arm is reachable** ⇒ `two_sided` ⇒ advance ⇒ **movement earned by a book that never recovered.** The ring then retains and the reseed passes.
★★ **MOVEMENT IS A PROPERTY OF THE FEED, NOT OF THE CHAIN'S PLAUSIBILITY. A stub-ask book with a live bid is the CANONICAL half-hollow shape — FROZEN was the CRM instance, not the class.** My r5 generalised from one row.

⛔ **AND IT IS NOT CLOSEABLE BY GATING, WHICH IS THE ACTUAL RULING:** retention happens AT A YIELD, and a yield is proof the reference was unusable; the only datum from outside is the previous ring; **so genesis must come from SOME yielding chain.** A `seedJudgedPlausible` gate makes the mechanism permanently **INERT** — the original deadlock shape this guard already died of once. **A SEVENTH positive property fails the same way.**
✅ **r6 ADDS NO MECHANISM. It pins the hole as a test, corrects a sign error in two places, and fixes one comment.**

⛔⛔ **THE SIGN ERROR, AND IT IS THE BOUNDED-SOUNDING-LABEL CRITICISM LANDING A THIRD TIME.** Residual 1 and SIM `S25b` both claimed the surviving door is *"conservative in the REFUSING direction"*. **WRONG IN SIGN for a CONTAMINATED ring:** the seed check is `seedSpread > kRel × retainedMedian`, so a **LARGER** median **RAISES** the bar and **FEWER** seeds are refused.
**MEASURED, both directions: median 0.004 ⇒ threshold 0.012 ⇒ a 1.986 seed IS refused. Median 1.986 ⇒ threshold 5.958 ⇒ the SAME seed is ADMITTED.** ★ **A contaminated ring FAILS OPEN.** Corrected in both places.

✅ **FINDING-1 — EVICTION: NO, and Langston reversed his own instinct to say so. STALENESS IS NOT THE HAZARD; PROVENANCE IS.** A stale HEALTHY ring is the only thing that makes a reseed judgeable at all and it fails REFUSING. **Evicting on age or at position close would delete the good rings with the bad and make every post-close reseed VACUOUSLY PLAUSIBLE — permissive.** The bound stays STATED, not fixed. **I did not invent a term.**

✅ **FINDING-2 (non-blocking):** the r4 comment quoted the threshold as `max(kRel × median, 0.01)` — that is the **ARM** threshold (`book-state.ts:200`). The **SEED** check (`:180`) is a bare `kRel × median` with **no floor**. Two different expressions; the comment now says so.

**63 green across both book-state files; tsc 377 at baseline.**

⛔ **WHAT I HAVE NOT DONE AND AM NOT CLAIMING: there is no unit test of the ENGINE-LOOP control flow itself.** The change is `continue` where a fall-through stood, inside a large monitor method with no existing harness. **The predicate half is covered on real rows; the control-flow half is readable but unproven, and Step 7 must verify it on staging — `hollowYields > 0` with ZERO new `kraken_equities_ws_mid` producers on boundary closes.**

---

## ⭐ THE MAGNITUDE, AND IT IS PRE-REGISTERED AS A STEP-8 PREDICTION RATHER THAN READ AFTERWARDS

⛔ **8f REMOVES ROUGHLY A THIRD OF THE LIVE CRYPTO EVALUATION UNIVERSE. That is the number this change list omitted in r1** (Langston BLOCKER-3, measured on staging `out.log`, 486,199-line slice ending 2026-09-12T13:07:41Z):
- **Distinct orchestrator eval-lane symbols:** admitted **70 USD + 9 USDC + 6 USDT = 85** · refused **20 EUR + 6 GBP + 6 CAD + 5 CHF + 5 AUD + 3 JPY + 2 SOFID = 47**.
- **By occurrence:** 3,081 admitted vs **1,758 refused**.

✅ **AND AT THE OBJECT THAT DECIDES WHETHER TO SHIP IT — `closed_trades`, positive control the USD row returning: 96 non-admitted, 12.7%** — EUR 54, GBP 20, CHF 9, AUD 8, CAD 5 — **latest EUR entry 2026-09-11, i.e. yesterday. D9's defect is realised in the live record and still producing rows.** That is the case for shipping, not an argument against it.
⚠️ **TWO DENOMINATORS, BOTH CORRECT, STATED SO THEY DO NOT READ AS A CONTRADICTION: 96 of 755 over ALL rows (Langston's, and `closed_trades` writes a row AT OPEN) versus 96 of 750 filtered to `closed_at IS NOT NULL` (mine, the standing filter for that table). The numerator is identical either way and the share moves by 0.05 points.**
⛔⛔ **AND 2026-07-15 IS `closed_trades`' OWN RETENTION FLOOR, NOT THE DEFECT'S ORIGIN (Langston CONDITION 3).** Every quote leg's `min(opened_at)` is 07-15 — **including USD**, which is the tell. **Retention is not history.** ⇒ **the span is a FLOOR: the defect is at least this old and its true start is unmeasured by this table.** Nobody may later read 07-15 as when D9 started.

**PRE-REGISTERED STEP-8 PREDICTION, written before the deploy so it cannot be fitted afterwards** — **AMENDED 2026-09-12 BEFORE THE WINDOW IS READ (Langston, two `#661` reach legs, both sized rather than asserted):**
- **THE SIGNAL:** eval-lane refusals appear at roughly the rates above, and the system stops acquiring NEW non-admitted positions. **A single leaked row is a FAIL, not noise.**
- ⛔ **AMENDMENT 1 — THE WINDOW HAS A FLOOR, because as first written the criterion carried NO DURATION AT ALL and a zero would have been unreadable.** Base rate measured: **22 non-admitted crypto entries in the last 30 days**, 2026-08-19T21:28Z → 2026-09-11T03:16Z, the last **34 hours before the deploy** — ≈**0.73/day**. ⇒ **a zero under ~2 days means nothing. THE WINDOW IS FLOORED AT 7 DAYS (≈5 expected absent the gate).**
- ⛔ **AMENDMENT 2 — THE INSTRUMENT'S REACH: `closed_trades` ALONE CANNOT SEE A LEAK THAT HAS NOT CLOSED YET, and crypto holds run days.** ⇒ **the predicate is ZERO non-admitted rows in BOTH SINKS** — `closed_trades` by `opened_at`, AND `active_open_positions` — **each printed with its own denominator.**

⚠️ **AND A CONSEQUENCE THAT IS NOT `#966` AND NEEDS ITS OWN HOME:** those 96 rows contaminate **every P&L-derived consumer of that sink** — F-G-2's window, the `#596` outcome corpus, learning, dashboard earnings. **Blocking new ones does not clean the existing ones.** `HOME: folded into row 12.7 B-QUOTE-CURRENCY-DENOMINATION as an added objective` — the back-correction rides the conversion that makes it computable.

---

## THE JUDGEMENT CALLS I WANT ATTACKED

1. **Siting the gate at `active-filter-pool` rather than at each producer.** It is the one choke point all three writers pass through — but it is *downstream* of the scanners, so a refused pair still costs a full scan before being dropped. Cheaper to gate earlier; harder to prove complete. I chose provable completeness.
2. **Door 2 and door 3 return no refusal count.** Changing their signatures touches callers outside this row. The log carries the door name instead. If you want the counts, say so and it lands here rather than later.
3. **`refusedQuote` as a subset of `skipped` rather than a sibling.** A caller summing `added + updated + skipped` stays correct; one summing all four double-counts. The field is documented as a subset — I think that is the right trade and it is the reverse of the usual instinct.
