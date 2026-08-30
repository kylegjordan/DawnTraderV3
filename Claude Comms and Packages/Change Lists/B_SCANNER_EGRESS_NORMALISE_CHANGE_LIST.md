# B-SCANNER-EGRESS-NORMALISE — CHANGE LIST (Step 4)

**READY AT: `origin/migration/aws-supabase` @ `218dbfb72`** *(code at `0b18ee530`)* · **1 file changed, 1 executable statement** *(the rest is the comment)*
⛔ **SUPERSEDES the `827ecb359` framing: a third reader found that version UNSAFE (§11), and the provenance read Kyle ordered settled the module choice on citations (§12).**
**change-class:** `architecture` *(declared up — see the scope's header; downgrade at will)* · **Owner:** CC-C · **Phase 19, plan row 5**
**Gate for this dispatch: the diff. One ask.**

> ⭐ **CI/tsc:** baseline **384 = 384**, no regressions.
> ⚠️ **Two second readers ran on this batch and both HIT. One of them stopped an edit to a LOCKED module. Their findings are in the scope §9 and §10 and are summarised below — please read them as part of the diff, because they changed what got built.**

---

## 1. THE WHOLE CHANGE
```ts
+ import { toCanonical } from './utils/symbol-canonicalizer.js';
…
+ batch = batch.map(p => ({
+   ...p,
+   symbol: p.symbol?.includes('/') ? toCanonical(p.symbol) : p.symbol,   // slashed-only guard, §8.1
+ }));
  const evaluatedSymbols = batch.map(p => p.symbol);
```
**One statement, at `market-scanner.ts:658`.** Everything else in the diff is the comment explaining why there and not elsewhere.

## 2. ⭐ THE DEFECT, MEASURED AT THE LIVE VENUE — NOT ARGUED
`RUNNING_ISSUES:4571`:
| form sent | candles | result |
|---|---:|---|
| **`XBT/USD`** *(what the scanner was sending)* | **0** | ⛔ **`EQuery:Unknown asset pair`** |
| `BTC/USD` | 721 | ✅ |
| `ETH/USD` *(also a wsname)* | 721 | ✅ |
⇒ **Kraken's OHLC endpoint rejects Kraken's OWN wsname for Bitcoin while accepting it for Ethereum. 2 of 661 bases: `XBT`, `XDG`.**
**Chain:** raw wsname → venue rejects → 0 candles → `getPairHistoryDays` caches `null` (`kraken.ts:648-653`) → `passesHistoryFilter` fails **closed** on null (`:380-381`) → **`REJECTED XBT/USD: history failed`**, observed live 2026-08-30T14:15Z.

## 3. ⛔ THE JUDGEMENT CALLS I WANT ATTACKED

1. ⛔ **PLACEMENT — SEE §8.4, WHICH CORRECTS THIS ITEM.** Earlier genuinely breaks things (the `pairInfo` join at `:600` and the refill dedupe at `:611` key on the RAW wsname). ⛔ **But my "later means N call-site edits" WAS FALSE — one edit at `kraken.ts:296` would fix every caller.** **The real argument for the scanner is that a venue-boundary fix would NOT repair the membership joins, leaving INVARIANT T2 broken (§8.2). Attack that.**
2. ⛔ **`toCanonical`, NOT `normalizeToInternalSymbol`, AND THE DIFFERENCE IS DOGECOIN.** The resolver's slashed branch (`kraken-symbol-resolver.ts:94-99`) short-circuits on a **one-entry** table `{XBT:BTC}` and never reads its own `mapByWsPair`, so it returns `XDG/USD` unchanged. `toCanonical` carries **both** `XBT→BTC` and `XDG→DOGE`.
3. ✅ **THE RESOLVER IS LEFT ALONE, AND THAT IS DECIDED, NOT ASKED (§8.3).** It is 🔒 LOCKED (*"changes require a formal directive"*, `:1-6`), it cannot resolve `XDG`, and `#229` already homes its repair to **Phase 20**. **A reader caught me proposing to edit it; I have not.** ⛔ **No directive is requested — `#229` owns it.**
4. ⚠️ **ONE BEHAVIOUR DELTA, NAMED NOT ABSORBED:** the scanner's LOCAL benchmark list (`:658`… `['BTC/USD','ETH/USD','SOL/USD','XBT/USD','BTC/EUR','ETH/EUR']`) carries **`XBT/USD` AND `BTC/USD`**, but **`XBT/EUR` is absent while `BTC/EUR` is present.** ⇒ **after normalisation `XBT/EUR` matches as a benchmark where it did not before.** I judge that a strict improvement over a list that plainly intends it — **but it is a change and it is yours to accept.** *(It is also a FOURTH benchmark definition; `#229`-adjacent, not fixed here.)*
> ⛔ **FALSE - THERE ARE FOUR PLUS A CONSEQUENCE. See §9.5 and §10.**

## 4. ✅ BLAST RADIUS — MEASURED, AND SMALLER THAN THE CALL-SITE COUNT SUGGESTS
- **`toCanonical`'s base table changes only `XBT` and `XDG`.** `XLM`/`XRP`/`XTZ` are **identity** entries; its quote entries are **Z-prefixed** forms that never appear in a wsname.
> ⛔ **FALSE - `toCanonical` maps BOTH slots; the blast radius is 56, not 26. See §9.1.**
- **Idempotent** — `toCanonical(toCanonical(x)) === toCanonical(x)` for every slashed form *(replicated against the branch's logic, not called live — stated as such)*.
- ⛔ **CORRECTED (§8.1): "the raw form stays recoverable at `pair.pairInfo.wsname`" IS FALSE for `wsname`-absent entries — it is undefined precisely when it would be needed.** The guard makes this moot: those entries are no longer touched.
- ⚠️ **`evaluatedSymbols` LEAVES the function** (`:436` type, `:1070` return) into `fx5-24h-window.ts:196`, where it feeds a **deduplicated COUNT** (`uniqueEvaluated = evaluatedSet.size`), not a join. ⇒ **TRANSIENT, BOUNDED, COSMETIC: a 24-hour window spanning the deploy holds BOTH spellings for the two bases and counts them as two distinct symbols for ≤24h.** **Named so it is not later mistaken for a defect.**

## 5. ✅ WHAT THE SECOND READERS CHANGED — because it is material to reviewing this
- ⛔ **Reader 1 stopped an edit to a locked module**, and showed my §6/§7 "findings" were a **re-derivation of `#909` (2026-08-26)** — the same 8-of-130 census, the same `{XBT, XDG}` class, **including the correction I thought I was making.** ⇒ **Recorded as CROSS-REFERENCES, not findings.**
- ⛔ **Reader 1 also holed my safety measurement:** "130 pairs, 1 changes" silently picked the **static** map as the population, while the file's own siblings consult the **live AssetPairs fetch (~1,437 pairs)**. **Wrong-object on a denominator.**
- ⭐ **Reader 2 closed the causal chain and reconciled two contradictory records:** the history branches (`:826-836`, `:993-1002`) have **NO `capturePreFilterReject`** while the volume/price/spread branches beside them do ⇒ **a history rejection is never archived.** `#906` read the archive and saw zero; I read the log and saw the evaluation. **Both correct — different instruments, one with a hole exactly where the defect lives.**
- ⭐ **Reader 2 killed my own Dogecoin theory with evidence:** `recordScanResult` is a **no-op** (`adaptive-scan-manager.ts:306-308`, *"Batch 52: PairFailureTracker recording disabled"*) ⇒ the cooldown blacklist cannot be excluding anything.

## 6. ⛔ WHAT THIS DOES NOT DO
1. ⛔ **`OBJ-5` (the missing `capturePreFilterReject` on the history branches) IS NOT IN THIS DIFF, AND THAT IS DELIBERATE.** It is the reason the defect stayed invisible, and it is owed — **but it changes what gets WRITTEN to `signal_eval_archive`, which is a different blast radius from a symbol form.** ⇒ **it lands as its own change, after this one verifies.** ⛔ **Say so if you disagree; I am not asking, I am declaring.**
2. ⛔ **It does not touch the LOCKED resolver, `BENCHMARK_SYMBOLS`, or any filter threshold.** A Bitcoin that is now evaluated and then rejected on **liquidity** is a **PASS** here — that is `#906` objective 1.
3. ⛔ **It does not explain Dogecoin's total absence from evaluation.** `XDG` fails the same venue call, but Dogecoin appears in **0 of 362** distinct evaluated pairs, so it is not reaching the scanner at all. **Stated as OPEN.**
> ⛔ **WITHDRAWN - one rotation of a 300-wide batch read as a universe. See §10.3.**

## 7. ✅ VERIFICATION — FUNCTIONAL, SAME-DAY, NO SOAK
> **Kyle, 2026-08-30:** *"If we see the functionality works for a few, we see it for them all."* **Per-assertion test applied: both of these are code-path facts, not rates.**
- **`OBJ-1a` Bitcoin:** `XBT/USD` stops being rejected on `history failed`. **One log line settles it.**
- **`OBJ-1b` Dogecoin:** a `DOGE/`-base pair APPEARS in the evaluated set. **One line settles it.** ⚠️ **May FAIL — see §6.3; that would be a real result, not a delay.**
> ⛔ **WITHDRAWN ENTIRELY - Dogecoin is excluded by a working price floor, not a symbol form. See §10.3.**
- **`OBJ-6` controls:** XRP, SUI, LINK, ADA still evaluated, and **still rejecting on VOLUME rather than history** — ⛔ **a control shifting to `history failed` is an unmistakable regression.**
- ⛔ **`OBJ-3` may NOT be verified from the `already_active` counter** — it reads a constant 0 (`routes.ts:7748-7758`, `#5415`).


---

## 8. ⛔⛔ WHAT CHANGED AFTER THE FIRST DISPATCH — READ THIS BEFORE THE DIFF

### 8.1 ⛔ MY FIRST VERSION WAS UNSAFE. GUARDED.
`p.symbol` is **NOT always slashed** — `:564` is `pairsObj[pairName]?.wsname || pairName` and `wsname` is **optional** (`kraken-pair-metadata-service.ts:15`). On a non-slashed input `toCanonical` leaves its safe branch: **Pattern 1 (`:188-192`) splits on `lastIndexOf('Z')` ⇒ `XTZUSD → T/USD`, silently wrong**, and the `PF_` branch (`:157-166`) **can THROW inside an unguarded `.map` on the scan path.** ⇒ ✅ **slashed-only guard added; a non-slashed entry is now byte-identical to today.**
⛔ **AND MY "the raw form stays recoverable at `pair.pairInfo.wsname`" WAS FALSE** for exactly those entries — `wsname` is undefined precisely when it bites.

### 8.2 ⭐⭐ THE JUSTIFICATION IS STRONGER THAN "TWO COINS DO NOT TRADE" — **INVARIANT T2 IS NOT HOLDING**
`bridge/canonical/DawnTrader_System_Invariants_Design_Guarantees.md:30` — ***"INVARIANT T2: Maximum one open position per symbol at any time."***
**Its enforcing test is `activeTradeSymbols.has(pair.symbol)` — a RAW venue name against a set built from the `trades.symbol` DB column, which is internal form.** ⇒ ⛔ **for `XBT`/`XDG` it can never match ⇒ T2 IS CURRENTLY UNENFORCEABLE FOR BITCOIN AND DOGECOIN, and a Bitcoin pair with an open position has been re-evaluated every cycle.** ✅ **This batch repairs a founding invariant.**
> ⛔ **WITHDRAWN - the citation is to a table with 0 rows. See §9.2.**

### 8.3 ✅ THE MODULE CHOICE IS DECIDED, ON THREE CITATIONS — NOT PUT TO YOU AS A QUESTION
⚠️ **Three modules are each designated authoritative in three documents** *(Phase-8 history → the resolver; execution-flow §3.1 → the canonicalizer; `symbol-normalize.ts:9` → itself)*. **That is `#229` at its root: the ambiguity is in the founding record.**
⭐ **THE TIE IS BROKEN BY THE NEWEST MODULE, IN WRITING.** `symbol-normalize.ts:88-95` fails soft with **`'crypto_spot raw form not handled — use server/services/utils/symbol-canonicalizer.ts'`** and states *"we recommend callers continue to use the legacy canonicalizer for crypto raw forms."* **And mechanically `normalize()` cannot do this job: `XBT/USD` passes its canonical regex and comes back unchanged.**
⇒ ✅ **`toCanonical` it is. The resolver stays untouched — locked, cannot resolve `XDG`, and homed to `#229`'s Phase-20 consolidation.**

### 8.4 ⛔ THE PLACEMENT ARGUMENT I GAVE YOU WAS PARTLY FALSE — HERE IS THE HONEST VERSION
- **"The only point" is true of an INTERVAL `(614, 658)`, not a point** — everything between is comment.
- ⛔ **"Later would need N call-site edits" IS FALSE.** `kraken.ts:296` hands the string to Kraken **verbatim, no resolver** ⇒ **one edit at the venue boundary would fix every caller of `getOHLCData`/`getPairHistoryDays`.**
- ⚠️ **THEY ARE NOT EQUIVALENT, and that is the real argument for the scanner: a venue-boundary fix does NOT repair the membership joins in §8.2, so it would leave INVARIANT T2 broken.** ⛔ **That is my reasoning; attack it.**

### 8.5 ⚠️ CARRIED, NOT FIXED
- **The designated handler for crypto RAW forms (`toCanonical`) is unsafe on raw forms** (§8.1). **Filed to `#229`.** This batch avoids it via the guard.
- **Two resolvers now compose** — `normalizeToInternalSymbol(toCanonical(x))` at `fx5-scanner.ts:990` — different tables, different quote handling, **untested composition.** `#229`.
- ⛔ **NO TEST exercises this function's symbol form.** The suite does not guard the change ⇒ **all the weight is on `OBJ-6`'s live controls.**


---

## 9. ⛔⛔ STEP-4 CHANGES-NEEDED APPLIED — **TWO OF MY CLAIMS WERE MEASURABLY FALSE, ONE OF THEM INSIDE THE SHIPPED COMMENT**

> ✅ **The executable statement is APPROVED as written; the guard is sound. Everything below is the RECORD, which I called the substance of the diff — so it matters more, not less.**

### 9.1 ⛔ BLOCKER-1 — **THE BLAST RADIUS IS 56 WSNAMES, NOT 26, AND MY EXCLUSION ARGUMENT WAS WRONG AT THE LINE**
**`toCanonical` applies ONE MAP TO BOTH POSITIONS** (`symbol-canonicalizer.ts:121-122`): `krakenToStandard[base] || base` **and** `krakenToStandard[quote] || quote`. **The `// Base currencies` / `// Quote currencies` headings are COMMENTS, NOT STRUCTURE** ⇒ **`XBT` maps in the QUOTE slot too.**
**Census of the live AssetPairs payload (1,437 wsnames): 26 base-side + 31 quote-side, 1 overlap = 56 changed.**
⇒ ⛔ **MY SENTENCE *"its quote entries are Z-prefixed forms that never appear in a wsname"* IS FALSE AND SHIPPED IN THE CODE COMMENT. Deleted from both homes.**
⭐ **AND THE 31 ARE A THIRD BEHAVIOUR DELTA — THE LARGEST.** They are the BTC-quoted pairs `AAVE/XBT … ZRX/XBT`. **Venue-probed by Langston: `ADA/XBT` → 0 candles / `EQuery`; `ADA/BTC` → 721. Same for LINK, ETH, SOL.** ⇒ **they fail closed TODAY exactly as `XBT/USD` does, and after this they PASS — 31 BTC-quoted instruments become eligible for the survivor set FOR THE FIRST TIME.**
⛔⛔ **AND NOTHING IN THIS BATCH ASKED WHETHER SIZING, FRICTION, NET EXPECTANCY OR THE GUARDRAILS ARE DENOMINATED CORRECTLY FOR A NON-FIAT QUOTE.** ⇒ **§9.4 DISPOSITION: its own item — `B-NONFIAT-QUOTE-DENOMINATION`, owner CC-C, placed in `PHASE_19_PLAN.md` after row 5.** ⛔ **Excluding the quote slot is NOT the fix — it would re-introduce a venue-rejecting form.**
✅ **`OBJ-6` AMENDED: the four controls are ALL `/USD` and STRUCTURALLY CANNOT SEE THIS CLASS. One `/XBT` pair is added to the observed set.**

### 9.2 ⛔ BLOCKER-2 — **THE `T2` ARGUMENT IS BUILT ON A DEAD LEG. WITHDRAWN.**
`getActiveTrades` reads the **`trades`** table (`storage.ts:1535-1543`). **MEASURED on staging: `trades` = 0 rows, against `active_open_positions` = 2 and `closed_trades` = 665 as the positive control.**
⇒ ⛔ **`activeTradeSymbols` IS EMPTY FOR EVERY SYMBOL, NOT JUST `XBT`/`XDG` — NO SYMBOL-FORM FIX REPAIRS IT.** ⇒ **my *"a Bitcoin pair with an open position has been re-evaluated every cycle"* IS UNSUPPORTED: there is no Bitcoin open position anywhere.**
⛔⛔ **I TOLD KYLE THIS WAS THE BATCH'S STRONGEST JUSTIFICATION — AN INVARIANT REPAIR. IT IS NOT. WITHDRAWN, AND CORRECTED TO HIM.**
⚠️ **AND THE THIRD READER HAD WARNED ME:** it wrote that this dedupe leg *"is fed by the legacy path and test endpoints only — worth establishing before drawing conclusions from it."* **I drew the conclusion anyway. Being told and not acting is worse than not being told.**
✅ **THE PLACEMENT CONCLUSION SURVIVES on the legs Langston DID verify — `poolSymbols` (internal-form keys), the stablecoin regex, `benchmarkSet`, the `capturePreFilterReject` values and `evaluatedSymbols` — none of which `kraken.ts:296` reaches.** ⛔ **§8.2 must NOT reach the completion report as written.**
➕ **AND WHAT BLOCKER-2 SURFACED IS BIGGER THAN THIS BATCH: the scanner's already-active leg reads a table the ACTIVE PATH DOES NOT WRITE.** Langston is not folding it in; it needs its own home.

### 9.3 ⛔ THE PLACEMENT CLAIM IN THE SHIPPED COMMENT — CORRECTED IN CODE, NOT JUST IN THE DISPATCH
The comment still said *"Later is worse: it would mean N call-site edits."* **I retracted that in the dispatch and left the code carrying the false version.** ✅ **Replaced with the honest argument: one edit at `kraken.ts:296` WOULD fix every venue caller; the reason to fix HERE is that it would NOT repair the membership and archive legs, which never reach that line.**

### 9.4 ⭐⭐ AND `OBJ-1b`'s PREMISE IS SETTLED — **DOGECOIN IS EVALUATED 25,294 TIMES IN THREE DAYS**
**Langston proposed testing the UNIVERSE rather than the batch. Better: the ARCHIVE already answers it.** **`signal_eval_archive`, 3 days: `XDG%` = 25,294 rows · `DOGE%` = 0 · controls `XBT%` = 167,215, `ETH%` = 208,584.**
⇒ ✅ **DOGECOIN REACHES EVALUATION CONSTANTLY. My "0 of 362 ⇒ not reaching the scanner" was a one-rotation window, and the truth is the opposite.**
⇒ ⭐ **SO BITCOIN AND DOGECOIN ARE THE *SAME* FAILURE, NOT TWO — the scope's §8.3 "Dogecoin's cause is NOT the same bug and it is earlier" is WITHDRAWN.** **`OBJ-1a`/`OBJ-1b` collapse back into one objective, and the fix covers both.**
⚠️ **AND THE ZERO `DOGE%` ROWS IS THE CORROBORATION:** the archive holds the RAW form only, never the internal one — exactly what a scanner writing un-normalised symbols produces.


---

## 10. ⛔⛔ ROUND-2 VERDICT APPLIED — **LANGSTON CONFIRMED BOTH BLOCKERS AND FOUND A THIRD. THE THIRD KILLS MY OWN COLLAPSE CLAIM.**

> **He re-derived BLOCKER-1 and BLOCKER-2 himself and matched my numbers to the unit** (56 = 26 base + 31 quote − 1 overlap `XDG/XBT`; `trades` = 0 against controls 2 and 665). **Those are settled. What follows is new.**

### 10.1 ⛔ BLOCKER-3 — **"THEY BECOME TRADABLE" WAS THE SAME OVER-REACH, A THIRD TIME**
**RE-DERIVED, not accepted on his say-so.** 24h, `source='market-scanner'`, `symbol LIKE '%/XBT'`: **`low_volume` = 21,574 rows across 31 of 31 distinct symbols.**
⇒ **every one of the 31 ALREADY REACHES the volume gate and fails it**, on venue-supplied 24h volume attached at the `:600` join — **above my line, so this change cannot move it.**
✅ **CORRECTED IN BOTH HOMES: they become ELIGIBLE TO BE ASSESSED, not tradable.** ⭐ **This CUTS the deploy risk — nothing starts trading on Monday because of this batch.**
★★ **AND THE SHAPE IS THE POINT: this is the third time in one batch I asserted a consequence without checking the next gate.** Blast radius, T2, and now this. **The fix each time was one query I had not run.**

### 10.2 ⭐⭐ AND THE REASON THEY FAIL IS A **UNITS DEFECT**, LIVE TODAY, INDEPENDENT OF THIS BATCH
**`market-scanner.ts:820`: `const volume24h = volume24hCoins * currentPrice;` — and `currentPrice` is `ticker.c[0]`, the price in the QUOTE currency.**
**The comment DIRECTLY ABOVE IT, at `:818`, states the invariant it breaks: *"All filter thresholds (minVolume, patternMinVolume) are in USD. Must compare like units."*** ⇒ **the arithmetic satisfies that ONLY when the quote IS USD.**

| population (24h, `low_volume`) | observed min | median | max | threshold |
|---|---:|---:|---:|---:|
| `%/USD` | 0.00 | **10,218.51** | 499,938.50 | 500,000 |
| `%/XBT` | 0.00 | **0.08** | 15.40 | 500,000 |

⇒ ⛔ **A BTC-QUOTED PAIR WOULD NEED ~500,000 BTC OF DAILY VOLUME TO CLEAR A BAR MEANT TO READ $500,000.** Structurally unreachable. **`ETH/XBT` at 4.66 BTC ≈ $510k of real volume is labelled `low_volume`.**
⛔ **THE MIN-PRICE FLOOR HAS THE IDENTICAL SHAPE** — `currentPrice < activeMinPrice` compares a quote-denominated price against a flat `0.25`. **`XDG/XBT` observed 0.000001 vs 0.25.** ⇒ **BTC-quoted pairs are excluded TWICE OVER by units, not by liquidity.**
⚠️ **AND THE ERROR RUNS BOTH WAYS: a weak-quote pair faces a threshold that is far too LENIENT.** `quote_currencies` is `[]` in every live `screener_filters` row — **no quote restriction exists**, so the universe already admits these and judges them with USD-shaped constants.
⇒ **`#966` REWRITTEN AND BROADENED — it is NOT "non-fiat", it is ANY NON-USD QUOTE, and it now carries the two gates and the line.**

### 10.3 ⛔⛔ **MY §13.2 COLLAPSE IS REFUTED. BITCOIN AND DOGECOIN ARE NOT THE SAME FAILURE — AND NEITHER OF MY TWO PREVIOUS STORIES WAS RIGHT EITHER.**
> ⛔⛔ **HALF-WITHDRAWN — SEE §11.1. The ACTIVE-lane leg stands; *"this batch does nothing for Dogecoin either way"* was measured with an archive gated to the active lane and is FALSE for VTS. `OBJ-1b` is REINSTATED.**
**The presence table settles it. 24h, by exact symbol:**

| symbol | archive rows | dies at |
|---|---:|---|
| **`XBT/USD`** | **0** | ⛔ **the history filter — whose branches carry NO `capturePreFilterReject`, so the rejection is NEVER ARCHIVED** |
| **`XDG/USD`** | **545** | ⛔ **`low_price`: observed **0.0851** vs threshold **0.25** |
| `ADA/USD` *(control)* | 546 | **`low_price`: 0.2013 vs 0.25 — the identical gate, on a coin nobody calls broken** |
| `ETH/USD` *(control)* | 1,995 | `family_imf_di` — reaches the strategy layer |
| `BTC/USD`, `DOGE/USD` | 0, 0 | **the internal forms are not written today — which is the batch's premise** |

**Live `screener_filters`: the active path's `min_price` is `0.25` on every profile but `strong_trend` (`0.001`); VTS's is `0.05`.** ⇒ **Dogecoin at $0.085 clears the VTS floor and fails the active one. That is why it is everywhere in the learning population and nowhere in active trading.**
⇒ ⛔⛔ **DOGECOIN IS EXCLUDED BY A WORKING PRICE FLOOR. IT IS BUG-TAXONOMY OUTCOME (2) — WORKING AS DESIGNED, DECISION MISSING — NOT A DEFECT, AND THIS BATCH DOES NOTHING FOR IT EITHER WAY** (normalising `XDG/USD` to `DOGE/USD` leaves the price at 0.0851 and the floor at 0.25).
⇒ ✅ **`OBJ-1b` IS WITHDRAWN under §9.4 disposition 5**, carrying the citation that dissolves it. **`OBJ-1a` — Bitcoin — is the batch, alone and unchanged.**
➕ **THE DECISION THAT REPLACES IT: is `0.25` the right active-path price floor when it excludes Dogecoin AND Cardano?** **§9.4 DISPOSITION: its own item — `B-PRICE-FLOOR-REVIEW`, owner CC-C, `RUNNING_ISSUES` #967, placed in `PHASE_19_PLAN.md` at row 5.b.** ⛔ **Kyle's call, not mine — he asked for "the fix for Bitcoin and Doge" and half of that request has no defect under it.**

★★ **THE HONEST SCORE ON THIS BATCH'S RECORD: I stated Dogecoin's cause THREE times — "never reaches the scanner" (wrong), "the same failure as Bitcoin" (wrong), and now "a working price floor" (measured, with a control that fails the same gate).** ⛔ **The first two were both asserted without asking which GATE the row died at — one column in the table I was already querying.**

### 10.4 ✅ VERIFICATION INSTRUMENT — HIS IS BETTER THAN MINE, ADOPTED
All seven `capturePreFilterReject` sites sit at `:877`–`:1056`, **downstream of the normalisation at `:658`.** ⇒ post-deploy, on `source='market-scanner'` and `captured_at >` deploy time:
- **`BTC/%` appears and `XBT/%` falls to zero** — two-sided, so a null result is a FAILURE rather than an ambiguity.
- **`ETH/%` unchanged as the control.**
⛔ **`XDG/%` → `DOGE/%` is expected to flip too, and it proves NOTHING about tradability** — Dogecoin will still be rejected at `low_price`, just under a different spelling.
⚠️ **AND THE ARCHIVE STILL CANNOT SEE `OBJ-1a`'s ACTUAL WIN** — history rejections are never captured (`OBJ-5`, deferred). **`XBT/USD` disappearing from the runtime log line is the instrument for that leg, and it is the ONE thing the archive cannot tell us.**

### 10.5 ✅ RIDER-2 APPLIED — the path was ambiguous and the sibling is a trap
The comment cited bare `kraken.ts:296` from inside `server/services/`, where the sibling `kraken.ts` is a deprecated 5-line B78 shim. **Qualified to `server/exchanges/kraken/kraken.ts:296`, with the shim named so the next reader does not repeat the lookup.**

### 10.6 ✅ RIDER-1 APPLIED — the stamps are at the six sites, not only in the tail
**His diagnosis is exact, and it is `fix-follows-pointer` landing on me** — the pattern I adopted from him at F-G-1. I stamped the scope where he pointed and left this document's §3, §4, §6.3, §7 and §8.2 reading clean and false, **and the completion report is written FROM this document.** ✅ **One-line withdrawal stamps now sit AT each of those sites.**


---

## 11. ⛔⛔ ROUND-3 VERDICT — **BOTH BLOCKERS CONFIRMED. ONE OF THEM IS A REAL DEPLOY RISK THIS BATCH CREATED, AND MY §10.3 WITHDRAWAL WAS MEASURED WITH A BLIND INSTRUMENT.**

### 11.1 ⛔⛔ (a) `OBJ-1b` IS **REINSTATED** — my archive measurement CANNOT SEE THE LANE MY CLAIM WAS ABOUT
**RE-DERIVED AT THE REF: every `capturePreFilterReject` call is gated `!isPassiveLearning`** — `:900`, `:907`, `:914`, `:1055`, `:1063`, `:1071`, `:1079`. ⇒ ⛔ **`signal_eval_archive` IS ACTIVE-LANE ONLY.**
⇒ ★★ **§10.3's *"this batch does nothing for Dogecoin either way"* IS A CLAIM ABOUT THE VTS LANE, MADE WITH AN INSTRUMENT THAT STRUCTURALLY CANNOT OBSERVE THE VTS LANE.** **The active-lane leg stands** — Dogecoin dies at `low_price` 0.0851 vs 0.25, `ADA/USD` fails the identical gate, outcome (2). **The lane-wide conclusion does not.**

**MEASURED, THE LEG I NEVER RAN:**
- Live `screener_filters`: **the seven `vts_*` crypto profiles carry `min_price` = 0.05.** ⇒ **Dogecoin at 0.0851 CLEARS the VTS floor** and reaches `passesHistoryFilter(pair.symbol)` at `:922` **under the wsname.**
- **Venue-probed, the exact call:** `XDG/USD` → **`EQuery:Unknown asset pair`** · `DOGE/USD` → **721**. Controls: `ADA/USD` → 721 · `XBT/USD` → EQuery · `BTC/USD` → 721.
- **CORROBORATION with a positive control — VTS closed corpus `logs/virtual_trades`, 151 daily files:** `doge|xdg` = **1 occurrence, in 1 file** · **`ADA/` = 74 of 151 files.**
⇒ ⛔ **DOGECOIN IS ABSENT FROM THE LEARNING POPULATION, NOT PRESENT IN IT — the opposite of what I wrote — AND THIS BATCH REPAIRS THAT.**
✅ **`OBJ-1b` REINSTATED on the VTS-history mechanism, NOT the active-price one.** ⛔ **`#967` (the 0.25 floor) is UNAFFECTED and still goes to Kyle — it is an independent active-lane question.**
★ **DOUBLY INVISIBLE, which is why it survived: the history branches carry no capture, AND the passive lane carries no capture at all.**

### 11.2 ⛔⛔ (b) **THE REAL DEPLOY RISK — B63.3's STRONG-DBS ROUTE HAS NO VOLUME FLOOR, AND THIS BATCH UNLOCKS IT FOR THE 31**
**MY "not tradable" ARGUMENT RESTS ENTIRELY ON THE STANDARD PROFILE'S VOLUME GATE. THE STRONG-TREND ROUTE DOES NOT HAVE ONE.**
**RE-DERIVED at the ref:** the normalisation is at **`:714`**; the B63.3 DBS prefetch calls `ohlcCache.getOHLCData(pair.symbol, 60)` at **`:789`** — **BELOW it.** ⇒ post-fix the `%/XBT` pairs resolve → gain OHLC → gain a DBS score → **`:889` routes any score ≥ 0.35 onto `strongTrendFilters`.**
**Live `screener_filters.active_strong_trend`: `minVolume` = 0.00 · `minPrice` = 0.001 · `minHistoryDays` = 5 · enabled.**
**MEASURED — at least 8 of the 31 clear a 0.001 BTC price floor:** WBTC .9995 · TBTC .98004 · PAXG .0564 · ETH .0318 · XMR .0064 · BCH .0032 · AAVE .0016 · SOL .00135.
⇒ ⛔⛔ **`TBTC/XBT` CARRIES ~0.001 BTC ≈ $110 OF 24h VOLUME AGAINST A FLOOR OF ZERO.**
⚠️ **MY OWN INSTRUMENT WAS WEAKER THAN HIS AND I SHOULD SAY SO: my archive query returned 6, not 8, because the price gate only fires on pairs that PASSED volume, so the two BTC-wrapper tokens never produce a price row. He read live prices; I read rejections.** ★ **A rejection archive cannot enumerate what would happen if the rejection stopped.**

✅ **GUARD IMPLEMENTED — FOLDED IN UNDER §9.4 DISPOSITION 1, BECAUSE THE BATCH DEPENDS ON IT.** At `:889` the strong-DBS bypass now additionally requires a quote that is not BTC.
⭐ **IT IS A TRUE NO-OP FOR TODAY'S BEHAVIOUR:** the 31 already fail `low_volume` on the standard profile and continue to — **same rows, same label, same archive population.** It blocks **only** the path this batch would otherwise open.
⛔ **AND IT IS NOT A UNITS FIX — it is a refusal to grant a gate-BYPASS to a pair whose money gates are denominated wrong (`#966`).** ★ **A zero-volume bypass is only safe if the thing being bypassed was measuring the right quantity.** **Reversible the moment `#966` decides whether BTC-quoted instruments belong in the universe at all.**
★★ **HIS FRAMING, AND IT IS EXACT: this is my own `pre-existing-therefore-fine` pattern landing on me. UNLOCKING A PATH INTRODUCES EVERY ACTION THAT PATH TAKES.**

### 11.3 ✅ (c) THE THREE FALSE COMMENT STATEMENTS — CORRECTED IN PLACE
| was | now |
|---|---|
| *"IT DOES NOTHING FOR DOGECOIN, AND DOGECOIN DOES NOT NEED FIXING"* | **it fixes Bitcoin in the active lane AND Dogecoin in the VTS lane**, with the gating, the probe and the corpus control cited |
| *"Dogecoin is present in the learning population"* | **absent — 1 of 151 files against `ADA/` in 74** |
| *"they become ELIGIBLE TO BE ASSESSED, not tradable"* | **true for the standard profile, FALSE for the strong_trend route** — hence the guard |

### 11.4 ⛔ THE PATTERN, NOW AT FIVE — AND THE FIFTH IS A DIFFERENT FAILURE FROM THE FIRST FOUR
| # | asserted | killed by |
|---|---|---|
| 1 | blast radius = 26 | `toCanonical`'s **second** lookup |
| 2 | this repairs INVARIANT T2 | `SELECT count(*) FROM trades` = 0 |
| 3 | the 31 become tradable | their `low_volume` rows |
| 4 | Bitcoin and Dogecoin are one failure | the `gate_decision` **label** |
| 5 | **this batch does nothing for Dogecoin** | **the `!isPassiveLearning` gate on the instrument itself** |
⛔ **1-4 were "I did not run the query." 5 IS WORSE: I RAN A QUERY THE INSTRUMENT COULD NOT ANSWER AND READ ITS OUTPUT AS THE ANSWER.** ★ **A silence from a lane the instrument does not observe is `#453` — and I have the rule, in my own always-loaded file, naming exactly this.**
**MISTAKE: silence-not-evidence [B-SCANNER-EGRESS-NORMALISE] — read an active-lane-gated archive as evidence about the passive lane.**


---

## 12. ✅ STEP 4 CLOSED — **APPROVED at `fd81ce18c`**, with two conditions carried forward

**Langston re-derived both executable legs rather than reading the report.**

### 12.1 ✅ (i) THE GUARD IS AT THE RIGHT LAYER — and the reason is the no-op property
Of the three options, **denying the bypass is the only one that changes nothing today.** Excluding at admission would remove 31 symbols from the archive population — **a behaviour change shipped as a safety fix** — and a units repair at `:820` is `#966`'s entire subject and may not be smuggled into a Step-4 round.
**`isStrongBullDbs` has exactly four downstream consumers (`:924-927`) plus the history-context branch at `:953`** ⇒ one predicate, one place, all four thresholds move together.

### 12.2 ✅ (ii) `BTC || XBT` IS EXACTLY THE RIGHT SET — and broadening would NOT have been conservative
**`symbol-canonicalizer.ts:100-123`: the only entry that can appear in a slashed wsname's QUOTE slot is `XBT → BTC`** — every other quote entry (`ZUSD`, `ZEUR`, `XXBT`, `XETH`…) is a Z/X-prefixed REST form that never appears slashed. ⇒ **the set of quotes this batch rewrites is exactly `{XBT}`, and the predicate is that set plus its output.** The `XBT` arm is dead post-normalise; **kept deliberately — it costs nothing and it is the arm that survives if the map order ever changes.**
⛔ **AND I WAS WRONG TO CONSIDER BROADENING IT "the safe direction."** **Measured 24h, `signal_eval_archive`, `source='market-scanner'`: EUR carries 534 distinct symbols / 554,317 rows — a hair under USD's 636** — plus AUD, GBP, ETH, JPY, CAD, CHF, DAI, EURC, PYUSD, EUROP. **Those already take the bypass today.** Stripping it from them is **a live behaviour change with no measurement behind it**, and it destroys the no-op property that justified folding a guard into a Step-4 round at all.

### 12.3 ⭐ `#966` CHANGES SHAPE — **the units error is NOT uniformly conservative** *(§9.4 disposition 2 — folds into the existing item)*
- **BTC quote:** the product **overstates the bar** by ~5 orders of magnitude ⇒ **fail-safe**, nothing gets in.
- **EUR quote:** understates by single-digit percent ⇒ negligible.
- ⛔ **A QUOTE WORTH LESS THAN A DOLLAR INVERTS THE SIGN AND THE GATE BECOMES FAR TOO *PERMISSIVE*.** **JPY: 10 symbols / 17,789 rows in the same 24h.**
⚠️ **STATED AS MEASURED: that is the POPULATION, not the SURVIVAL. The inversion is FX arithmetic, not a claim that any JPY pair clears the gate.**
⇒ **`#966` must state DIRECTION PER QUOTE, not merely "denominated wrong" — the BTC case and the JPY case need opposite urgency**, and only one of them is currently safe by accident.

### 12.4 ⛔⛔ (iii) CONDITION ON CLOSE — **THE VERIFICATION PREDICATE CHANGES MEANING AT THE DEPLOY BOUNDARY**
**`capturePreFilterReject` writes `symbol: pair.symbol` at `:934` — the POST-normalise form.**
⇒ **"same rows, same label, same archive" holds for the COUNT and the LABEL but NOT for the SYMBOL STRING.** ⛔ **The `LIKE '%/XBT'` predicate that produced the 21,574-row / 31-symbol baseline returns ZERO after deploy.**
⇒ ★★ **THAT IS THE BATCH WORKING — AND A VERIFIER REUSING THAT PREDICATE READS A FALSE ABSENCE.** Same for the `already_active` `continue` at `:884-888`, which now consumes the canonical form and can skip a pair into producing **no row at all.**
✅ **BINDING ON STEP 8: the anchor is `symbol LIKE '%/BTC' OR symbol LIKE '%/XBT'`, with the pre/post split taken at the deploy boundary.** ⛔ **A single-form predicate is disqualified.**
★ **This is the batch's own failure mode turned on its verification: a name that stops matching is not a thing that stopped existing.**

### 12.5 ✅ THE ONE CORRECTION THAT WENT THE OTHER WAY
He took my 6-vs-8 correction over his own number. **The generalisable line, now standing: *a rejection archive cannot enumerate what happens when the rejection stops*** — same shape as `#704`'s stream/severity rule.
