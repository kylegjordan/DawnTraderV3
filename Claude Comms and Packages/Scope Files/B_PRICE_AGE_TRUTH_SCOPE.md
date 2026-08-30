# B-PRICE-AGE-TRUTH — SCOPE (Step 1)

**Batch:** `B-PRICE-AGE-TRUTH` (`#951`) · **Owner:** CC-C · **Phase 19, plan row 3b.f**
**change-class**: architecture
> ⚠️ **Declaration is on its own line with the colon OUTSIDE the bold, deliberately — `**change-class:**` FAILS the checker's marker and `**change-class**:` parses, and they render identically (`#968`, 17 of 329 scope files).**

**Created:** 2026-08-30 · **Kyle directive:** *"Let's proceed with the next logical pricing feed batch."*

---

## 1. ⛔⛔ WHY THIS IS THE NEXT PRICING BATCH AND **P1 IS NOT** — P1's FIX WOULD BE BUILT ON A FIELD THAT LIES

`XSTOCK_PRICING_PLAN.md` §4 orders the work **P1 → P2 → P3**, and **P1 is the largest** (*"9.1% of closes used a book older than the entry's own limit. Worst: 25.9 MINUTES"*). **P1's fix is: call the freshness check the entry already calls, on the close, at 15 s.**

⛔ **THAT CHECK READS `observedAt`. ON ONE LIVE PATH `observedAt` IS FABRICATED.** Re-derived at the ref today:

**`live-pricing-adapter.ts:624-631` — `fetchFromKrakenRest`, the rate-limiter branch:**
```ts
if (!restRateLimiter.check(symbol)) {
  const cached = this.priceCache.get(this.normalizeSymbol(symbol));
  console.log(`[8.8.5][REST_BLOCKED] ${symbol}: Rate limited, using cached price=...`);
  krakenWebSocketAdapter.incrementRestFallbackBlocked();
  return cached?.price ?? null;      // ← a BARE NUMBER. cached.observedAt is discarded.
}
```
**and its caller, `fetchLivePrice` at `:540-550`:**
```ts
const krakenPrice = await this.fetchFromKrakenRest(symbol);
if (krakenPrice !== null) {
  return { …, source: 'kraken_rest', producer: 'kraken_rest_poller',
           observedAt: Date.now() };   // ← "a genuine venue read: observed now"
}
```
⇒ ⛔⛔ **WHEN THE RATE LIMITER BLOCKS, A CACHED PRICE OF UNKNOWN AGE IS RETURNED AND STAMPED AS OBSERVED-NOW, UNDER A VENUE SOURCE AND A POLLER PRODUCER. THE COMMENT ASSERTS THE FALSEHOOD IN SO MANY WORDS.**

### 1.1 ⭐ THE DISCRIMINATING CONTRAST — THE SAME CACHE ROW, ONE HOP APART, WITH OPPOSITE PROVENANCE
`fetchLivePrice`'s **last-known-good** leg (`:560-571`) reads **the same `this.priceCache.get(...)` object** and does it correctly:
```ts
source: 'last_known_good', producer: 'last_known_good_all_apis_failed',
observedAt: cached.observedAt,      // #743: carried through, NOT refreshed
```
⇒ ★★ **THE CACHE ROW *HAS* `observedAt` — proven by the honest leg using it. The rate-limited branch does not lack the data; it DISCARDS it.** One leg labels the row a stale fallback carrying its true age; the other launders the identical row into a fresh venue read.
⚠️ **That asymmetry is worse than uniform dishonesty: it makes `observedAt` look trustworthy**, which is exactly why P1 would be built on it.

### 1.2 ⛔ AND THE FABRICATION IS **PERSISTED**, NOT MERELY RETURNED
`getPriceWithFallback` (`:1058`) on a stale/missing cache calls `this.fetchPrice(normalized)` → `fetchLivePrice` (`:463`/`:504`) → the quote above is **written into `priceCache`** → `:1113-1120` returns `updated.observedAt`. ⇒ **the fabricated timestamp becomes the cache's stored `observedAt`**, so the next call taking the *fresh-cache* branch (`age ≤ 2 s`, `:1071-1080`) serves it again with full confidence.
⇒ **Reachability to the exit decision, walked to a real consumer:** `active-execution-engine.ts:1285` `priceObservedAtMs = priceResult.observedAt` — the value the exit's freshness reasoning uses.

### 1.3 ⇒ IT GATES THREE DOWNSTREAM BATCHES, WHICH IS WHY IT IS FIRST
> ⛔ **OVERSTATED — SEE §7.4. It gates TWO (`P1`, `F-C`); `F-G-2` is DECOUPLED with a design carve-out, which is a different relationship.**
| downstream | why it is blocked |
|---|---|
| **P1 — the freshness guard** | a 15 s bound cannot fire on a timestamp fabricated as `Date.now()`, and the rate limiter blocks **under load**, i.e. exactly when prices move |
| **F-C / `#743` — the staleness bound (plan row 6)** | same reason: **you cannot bound an age you have fabricated** |
| **F-G-2 / P2** | already stated on `#951`: *"placed at 3b.f WITH the other price-provenance prerequisites and BEFORE `F-G-2`"* |

---

## 2. ✅ MANDATORY 1.b — THE PROVENANCE READ

**Corpora searched, named:** `RUNNING_ISSUES.md` (by symbol `restRateLimiter`, `observedAt`, and by issue `#951`/`#743`/`#742`), `BATCH_CATALOG.md`, `PHASE_19_PLAN.md`, the Scope Files directory, and `git log -S` **not path-limited**.

**TIER 1 — the two halves this batch changes:**

| half | introducing commit | date |
|---|---|---|
| the rate-limiter cached-price branch | **`30b753e5b`** — *"Improve system stability by managing WebSocket connections and API rate limits"* | **2025-12-30** |
| the `observedAt: Date.now()` stamp | **`b95d8e708`** — *"B-EXIT-PROVENANCE Step-3 stage 1: the producer union, the origin time, and a narrowing that makes a fourth producer a compile error"* | **2026-08-23** |

⇒ ★★ **THE TWO HALVES WERE BUILT EIGHT MONTHS APART, BY DIFFERENT BATCHES, FOR DIFFERENT PURPOSES. NEITHER WAS WRONG WHEN IT LANDED. THE DEFECT IS AT THEIR JUNCTION.** The rate-limiter branch (Dec 2025) **predates the `observedAt` concept entirely** — it protects Kraken from rate-limit exhaustion and, at the time, returning a bare cached number lost nothing that existed.

⛔⛔ **AND THE VERBATIM QUOTE THAT MAKES THIS AN INCOMPLETE DISCHARGE RATHER THAN A FRESH DEFECT — from `b95d8e708`'s own message:**
> *"**CONDITION 3, #743's half: observedAt is the ORIGINAL venue observation time, and every last-known-good leg CARRIES IT THROUGH rather than refreshing it.** Before this, the re-serve loop overwr[ote]…"*
> *"The four stale-price legs get four DIFFERENT tokens rather than one, because one token cannot answer 'outage, or gate?' from a row…"*

⇒ ⛔ **THE RATE-LIMITED BRANCH IS A FIFTH STALE-PRICE LEG THAT WAS NOT IN THAT CENSUS OF FOUR — AND IT IS THE ONE THAT DOES NOT CARRY `observedAt` THROUGH.** **Langston's own Condition 3 is satisfied at four sites and missed at a fifth.**
★ **WHY THE CENSUS MISSED IT, and this is the generalisable part: the four are legs that CONSTRUCT A QUOTE at `fetchLivePrice`'s return sites. The fifth SUBSTITUTES A PRICE one call-frame deeper, inside `fetchFromKrakenRest`, and returns a bare `number`.** ⇒ **a census of quote-constructors cannot see a price-substituter. Different shape, same consequence.**

**DISPOSITION — (2) RELEVANT BUT NEEDS UPDATING TO TODAY'S INTENT.** The rate-limiter branch is **still correct in purpose** (venue protection) and must not be removed; what changed is that provenance now exists and this leg does not speak it. **NOT (1)** — it is not correct as-is. **NOT (4)/(5)** — removing it would re-expose the rate-limit problem `30b753e5b` solved.

**TIER 2 — one-line intent notes:** `restRateLimiter` — venue protection, unchanged. `isKrakenVenueSource` (`:224` — NOT `:151`, which is `toCachedProducer`; corrected per Step-1 condition 7) — the engine's actionability policy gate. `priceCache` — the shared re-serve store. `getPriceWithFallback` — the staleness-windowed accessor, **10 non-test call sites**.

---

## 3. ✅ MANDATORY 1.a — THE ARCHITECTURAL READ, AND THE WARNING IT CARRIES FOR THIS BATCH

`SYSTEM_IMPACT_MAP.md` (the B-EXIT-PROVENANCE entry) states the property this batch must not break, **verbatim**:
> *"**THE PROPERTY THAT MAKES THE VOCABULARY SAFE TO WIDEN, and it is load-bearing:** the engine's actionable gate is `isKrakenVenueSource(source)` (`live-pricing-adapter.ts:151`) — it reads **`source` and NEVER `producer`**. ⇒ adding a producer **cannot** cause a price to be rejected… **A future change that makes any gate read `producer` re-arms it — check this before doing so.**"*

⇒ ⛔⛔ **THE BLAST RADIUS IS EXACTLY THERE, AND IT IS THE BATCH'S ONE REAL DECISION.** The laundered branch currently stamps `source: 'kraken_rest'`, **which passes `isKrakenVenueSource`**. If the fix relabels it honestly (e.g. `last_known_good`), **those prices become NON-ACTIONABLE and the position is skipped that tick** — a live trading-behaviour change, not a labelling change.
✅ **AND KYLE HAS ALREADY RULED ON THAT SHAPE**, quoted in `XSTOCK_PRICING_PLAN.md` §2: *"we don't use some backup price that may or may not be applicable; we hold until we get the pricing we need."* ⇒ **skipping the tick is the intended effect, the same way P3's fix reduces overnight entries by design.** ⚠️ **Stated as the plan's own precedent, NOT as licence — OBJ-2 puts the size of the reduction in front of Langston before it ships.**

---

## 4. OBJECTIVES

| # | objective | verification criterion |
|---|---|---|
| **OBJ-1** | **The rate-limited branch stops discarding age.** `fetchFromKrakenRest`'s cached-price return carries the cache row's real `observedAt` to its caller instead of a bare number. | The branch no longer returns `number`; a post-deploy quote served under rate-limiting carries `observedAt !== Date.now()` — **shown against a control**: a genuine REST read in the same window whose `observedAt` IS ≈ now. |
| **OBJ-2** | **The labels tell the truth, and the actionability consequence is MEASURED BEFORE IT SHIPS.** A rate-limited re-serve is labelled as a re-serve, not as `kraken_rest`/`kraken_rest_poller`. | ⛔ **Pre-registered, before the relabel lands: how many ticks/day currently take this branch, per asset class.** That number IS the trading-behaviour delta. Langston rules on it; **Kyle rules if it is large.** |
| **OBJ-3** | ⭐ **The census the original Condition 3 could not do: enumerate every site that SUBSTITUTES a price, not every site that CONSTRUCTS a quote.** | A repo-wide list of return paths that serve a cached/fallback price, each marked carries-age / fabricates-age / no-age. **If exactly one other exists, say so explicitly** (an asserted absence needs presence-evidence). |
| **OBJ-4** ⛔ *falsifier REPLACED, see §7.3 — the original could not fire* | **The persisted poison is addressed.** A fabricated `observedAt` currently enters `priceCache` and is re-served by the fresh-cache branch. | After the fix, no cache row's `observedAt` is newer than the venue read it came from. **Falsifier: a row whose `observedAt` post-dates its own `cachedAt` origin.** |
| **OBJ-5** | **`#743`/F-C is NOT folded in, and the boundary is written down.** | This scope states the boundary (§5) and `#743` remains at plan row 6 with its own batch. |

---

## 5. ⛔ WHAT THIS BATCH DELIBERATELY DOES NOT DO — THE `#743` BOUNDARY

**`#743` / F-C (plan row 6) and this batch are ADJACENT AND DISTINCT, and conflating them would produce one batch that does neither well:**
| | `#951` — THIS BATCH | `#743` / F-C — row 6 |
|---|---|---|
| the defect | **you cannot TELL the price is old** — the age is fabricated | **you can tell, and nothing STOPS it** — the age is honest but unbounded |
| the fix | carry the true age | **bound** the age with a threshold |
| ordering | **first** | **depends on this** — you cannot bound an age you have fabricated |

⛔ **This batch introduces NO max-age threshold and refuses NO price on grounds of age.** Choosing a bound is F-C's job and F-C's evidence.
⛔ **It does not touch the three `last_known_good` legs** — they already carry age correctly (`#743` is about their *bound*, not their *honesty*).
⛔ **It does not change P1, P2 or P3.** It makes P1 buildable.

---

## 6. ⚠️ WHAT IS UNKNOWN AND WILL BE ANSWERED AT STEP 2, NOT ASSERTED HERE

1. **How often the rate-limited branch actually fires, per class.** `incrementRestFallbackBlocked()` is called on it — **there is a counter, and Step 2 reads it rather than guessing.**
2. **Whether any OTHER caller of `fetchFromKrakenRest` exists** beyond `:540`. One is visible; **OBJ-3 proves it rather than assuming it.**
3. **Whether the honest label should be a NEW token or an existing one.** `b95d8e708` gave four stale legs four distinct tokens *"because one token cannot answer 'outage, or gate?' from a row"* — **the same argument likely demands a fifth**, but that is a Step-2 design call with Langston.
4. **Whether `xstock` takes this branch at all** — the class has its own REST gate (`rest_ask=skipped`, `#743`), so the population may be crypto-only.

⛔⛔ **STEP 2 WILL BE RUN AS A DISCRETE STEP WITH ITS OWN DOCUMENT AND ITS OWN LANGSTON SIGN-OFF, BEFORE ANY CODE.** ⚠️ **Stated because the immediately preceding batch, `B-SCANNER-EGRESS-NORMALISE`, RAN 1 → 3 AND THE CHECKER CAUGHT IT, NOT ME (`#969`).** The audit content there arrived at Step 4 and overturned the record four times — **which is the cost this line exists to avoid repeating.**


---

# 7. ✅ STEP 1 APPROVED — **7 CONDITIONS APPLIED. THREE OF THEM CORRECT THIS DOCUMENT.**

**Langston, at `ed2413924`, re-deriving every load-bearing claim himself. Each condition below is re-derived by me at the ref before being applied — a reviewer HIT is a lead, not a verdict.**

## 7.1 ⛔ CONDITION 7 — MY GATE CITATION WAS WRONG, AND IT IS THE ERROR I HAVE SPENT TODAY CORRECTING IN OTHERS
**§2 Tier-2 put `isKrakenVenueSource` at `:151`. RE-DERIVED: it is at `:224`. `:151` is `toCachedProducer`.**
✅ **Corrected.** My `:624-631` and `:540-550` citations are right; **the stale ones are in `PHASE_19_PLAN.md`'s own row 3b.f (`:582-586` / `:496-505`) — corrected there in the same commit.**

## 7.2 ⛔ CONDITION 1 — **OBJ-2's POPULATION IS THREE NESTED SETS AND I MEASURED THE OUTERMOST**
`incrementRestFallbackBlocked()` fires at `:630`, **ABOVE** `return cached?.price ?? null` ⇒ it counts branch ENTRIES **including `cached == null`, where nothing is laundered at all.**
| set | what it is |
|---|---|
| **branch-taken** | ⊋ what my 56/95.7min measured |
| **laundered-quote-produced** | ⊋ only when `cached` is non-null |
| **actionable-price-consumed-at-the-exit** | ⭐ **the innermost — and the ONLY one that is the trading-behaviour delta** |
⇒ ⛔ **MY `~843/day` IS THE OUTERMOST SET AND OVERSTATES THE DELTA. Step 2 names all three and measures the innermost.**

## 7.3 ⛔ CONDITION 3 — **OBJ-4's FALSIFIER CANNOT FIRE. THIRD CONTROL-THAT-CANNOT-FIRE I HAVE WRITTEN TODAY.**
**RE-DERIVED at `:474-484`:** the cache write sets `observedAt: quote.observedAt ?? Date.now()` and `cachedAt: Date.now()` **in the same literal, `cachedAt` last** ⇒ **`observedAt ≤ cachedAt` holds on EVERY path, including the fabricated one, TODAY, PRE-FIX.** My falsifier — *"a row whose `observedAt` post-dates its own `cachedAt` origin"* — **is satisfied by construction and could never have failed.**
✅ **REPLACED with his measurable form — RE-SERVE MONOTONICITY: for a given symbol, `observedAt` may advance ONLY when a genuine venue read occurred** — i.e. it must not advance on a tick that logged `REST_BLOCKED` / on which `incrementRestFallbackAllowed` did not fire.
★ **Recorded as a pattern, not an incident: `threshold=0` on the last batch, the unexercised-guard citation, and now this. All three are checks whose only possible output was the passing one.**

## 7.4 ⛔ CONDITION 6 — **§1.3 OVERSTATED THE BLAST RADIUS. IT GATES TWO, NOT THREE.**
`PHASE_19_PLAN.md:41` carries his same-day ruling: **`F-G-2` is DECOUPLED with a design carve-out, NOT gated by this batch.**
✅ **CORRECTED: this batch gates `P1` and `F-C`/`#743`. `F-G-2` carries a carve-out, which is a different relationship.** ⚠️ **His reason for insisting is the one that matters: overstating it is what gets a real finding argued with.**

## 7.5 ✅ CONDITION 1(b) — **AND MY "P1 IS BLOCKED" FRAMING IS WEAKER THAN MY OWN EVIDENCE**
His sharpening, adopted: on the exit path **the only source passing `isKrakenVenueSource` that can carry a fabricated age is `kraken_rest`** — WS legs carry real `observedAt`, and the LKG legs already fail the gate.
⇒ ⭐ **THE CORRECT CLAIM IS NOT *"P1 cannot be built"* BUT *"P1 WOULD GO GREEN WHILE BLIND ON PRECISELY THE POPULATION THAT PRODUCES THE 25.9-MINUTE CASE"*, because the limiter blocks under load.** ✅ **That survives the obvious rebuttal — *"P1 still helps on the WS path"* — and *"blocked"* does not.**

## 7.6 ✅ CONDITION 2 — **OBJ-2 GAINS ITS SECOND COLUMN, WHICH I DROPPED**
`PHASE_19_PLAN.md:41` requires **two columns**, not one: **(1)** the honest open-market rate, **and (2)** whether there was a **concurrent WS-write gap on that symbol during the `REST_BLOCKED` burst.**
⇒ **Column (2) governs the magnitude of everything: if WS overwrites the cache slot milliseconds later, the laundered row is rarely consumed. The hypothesis is that it wins precisely when WS is quiet — which is the same condition driving the REST poll in the first place.**

## 7.7 ✅ CONDITION 2(b) — **REFUSAL IS UNCONDITIONAL ON PROVENANCE, SO CARRY THE AGE *DISTRIBUTION*, NOT A COUNT**
The relabel refuses on provenance, not on age ⇒ **a 200 ms rate-limited re-serve is skipped identically to a 25-minute one. Blunt by design, until F-C bounds it.**
⇒ **OBJ-2 must carry the AGE DISTRIBUTION of the refused population.** ⭐ **And his conditional conclusion is adopted in advance: if that distribution is dominated by sub-second re-serves, the answer is to PULL `#743`/F-C FORWARD — not to weaken this batch.**

## 7.8 ✅ CONDITION 3(b)/4 — **TWO §6 UNKNOWNS ARE ANSWERED; STEP 2 STATES THEM, DOES NOT REDISCOVER THEM**
- **§6.2 — `fetchFromKrakenRest` is `private` with EXACTLY ONE call site (`:540`).** ✅ Independently confirmed by me: whole-tree grep over `server/`+`client/`+`shared/`, tests excluded, returns the definition plus one call; **0 test references.** The definition appearing in the same grep is the presence-evidence that the search can find occurrences.
- **§6.4 — xStock CANNOT reach the branch, STRUCTURALLY.** ✅ **RE-DERIVED: the xstock gate at `:513` (`safeResolveAssetClass(symbol,'kraken') === 'xstock_spot'`) returns ABOVE the `:540` call.** ⇒ **the population is crypto-only by construction.**
⛔ **MY OWN §6.4 ANSWER WAS THE WEAKER ONE AND I SHOULD SAY SO: I measured zero xStock rows, correctly refused to read that as an answer (Saturday, market shut), and then STOPPED — when a structural answer was three lines up the same function.** ★ **Refusing a bad instrument is not the same as finding a good one.**

## 7.9 ⛔ CONDITION 5 — **THE `toCachedProducer` TRAP IS LIVE FOR THIS BATCH, AND IT WOULD FAKE A PASS ON OBJ-4**
`toCachedProducer` (`:151`) maps a `PriceProducer` to `CachedProducer | null`, and **a `null` return SUPPRESSES the cache write at `:474`.** Its own comment at `:160-168` warns of exactly this.
⇒ ⛔⛔ **A new fifth producer placed in the `null` arm would stop the laundered row being cached — which would INCIDENTALLY satisfy OBJ-4 while BREAKING re-serve entirely.** **The placement is a STATED DECISION in Step 2, never a default.**
⚠️ **And `CachedPrice['source']` must be extended properly — the write at `:478` rides `quote.source as CachedPrice['source']`, an `as` cast, which will silently accept a new literal the type does not list.**

## 7.10 ✅ CONDITION — Q3 ANSWERED: **A FIFTH TOKEN, AND THE TWO FIELDS SPLIT**
- **`producer`: a new fifth token.** Free, diagnostic, no behaviour change. His Condition-3 argument applies verbatim — **`last_known_good_all_apis_failed` means OUTAGE; a limiter re-serve means WE CHOSE NOT TO ASK.** Different cause, different remediation, different duration; **collapsing them makes the existing LKG population unreadable.**
- **`source`: a NEW LITERAL, not a reuse of `last_known_good`.** ⭐ **It inherits non-actionability FOR FREE because `:224` enumerates three literals — the gate outcome is obtained WITHOUT TOUCHING THE GATE.**
- ⛔ **DO NOT solve it by making any gate read `producer` — that re-arms exactly what the SIM warns about.**

---

**⇒ STEP 2 PROCEEDS UNDER THESE SEVEN CONDITIONS, as a discrete step with its own document and its own sign-off before any code.**
