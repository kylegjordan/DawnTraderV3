# B-PRICE-AGE-TRUTH — CHANGE LIST (Step 4)

**Batch:** `B-PRICE-AGE-TRUTH` (`#951`) · **Owner:** CC-C · **Phase 19, plan row 3b.f**
**change-class**: architecture
**READY AT:** `9a541b0eb4663f5ee599394f2f81f15c5a7e1a82`
**Steps 1 and 2 APPROVED** — scope with 7 conditions, plan with 4, all applied.

---

# 1. WHAT SHIPS, AND WHAT DELIBERATELY DOES NOT

| ships here | carved out to `B-PRICE-AGE-REFUSAL` (row 3b.f-b, gated on `#971`) |
|---|---|
| **P1** carry the true age · **P3** the fifth producer token · **P5** re-serve monotonicity · **P7** comment truth · **P9** the read-site check | **P2** the honest `source` literal · **P4** both unions · **P6** the measurement · **P8** the literal's name |

⛔⛔ **THE SAFETY PROPERTY, STATED ONCE: `source` IS UNCHANGED.** The engine's actionable gate is `isKrakenVenueSource(source)`, so the re-serve remains actionable exactly as before. **This batch makes the age RECOVERABLE; it does NOT make the engine REFUSE a stale re-serve.** Refusal is carved out because relabelling routes the blocked population onto the engine's **un-rate-limited** direct REST leg.
**RE-DERIVED AT THE REF, with the discriminator stated:** `active-execution-engine.ts:1289-1300` → `krakenService.getTicker` (`server/exchanges/kraken/kraken.ts:259`) → `makePublicRequest` (**`:177-194`**), whose body is `checkMaintenanceMode()` and a **bare `fetch`** — nothing else.
★ **THE CHECK THAT COULD HAVE COME OUT DIFFERENTLY, AND DID NOT: that file DOES carry rate-limit machinery** — `checkRateLimitLockout` / `handleRateLimitError` — **but it is reached ONLY from `makePrivateRequest` (`:199`, `:231`, `:237`) and is keyed by `userId`, not by symbol.** The public leg never touches it. ⇒ the "un-rate-limited" claim is a **read of the body**, not an inference from the absence of a grep hit.
**And `restRateLimiter.check` has exactly ONE production caller** — `live-pricing-adapter.ts:688`, tests excluded.

---

# 2. THE EXECUTABLE DIFF — `server/services/live-pricing-adapter.ts`

## 2.1 THE DEFECT (before)
```ts
private async fetchFromKrakenRest(symbol: string): Promise<number | null> {
    if (!restRateLimiter.check(symbol)) {
      const cached = this.priceCache.get(this.normalizeSymbol(symbol));
      krakenWebSocketAdapter.incrementRestFallbackBlocked();
      return cached?.price ?? null;          // ← BARE NUMBER: the row's age is discarded
    }
// …and its caller could not tell the two apart, so it stamped both:
      source: 'kraken_rest', producer: 'kraken_rest_poller',
      observedAt: Date.now(),                // ← "a genuine venue read: observed now"
```

## 2.2 AFTER
```ts
interface RestFetchResult {
  price: number;
  /** The ORIGINAL observation time. Fresh only when the venue was actually asked. */
  observedAt: number;
  producer: 'kraken_rest_poller' | 'kraken_rest_rate_limited_reserve';
}

private async fetchFromKrakenRest(symbol: string): Promise<RestFetchResult | null> {
    if (!restRateLimiter.check(symbol)) {
      const cached = this.priceCache.get(this.normalizeSymbol(symbol));
      krakenWebSocketAdapter.incrementRestFallbackBlocked();
      return cached && cached.price != null && cached.observedAt != null
        ? { price: cached.price, observedAt: cached.observedAt, producer: 'kraken_rest_rate_limited_reserve' }
        : null;
    }
    …
    return { price: midpoint, observedAt: Date.now(), producer: 'kraken_rest_poller' };
```
```ts
// the caller — `source` untouched, the other two now come FROM the fetch
      source: 'kraken_rest',
      producer: krakenResult.producer,
      observedAt: krakenResult.observedAt,
```

## 2.3 THE FIFTH PRODUCER TOKEN
`kraken_rest_rate_limited_reserve`, added to `PriceProducer` and to **`toCachedProducer`'s NON-null arm**.
★ **The union's own comment already specified this: *"#951 splits it when it fixes that branch."*** A distinct token, not a reuse of `last_known_good_*`, for the reason those four were split from each other — **one token cannot answer "outage, or gate?" from a row.** An outage means the venue failed us; this means **we chose not to ask.**

---

# 3. ⛔⛔ THE PART I MOST WANT ATTACKED — THREE ROUNDS OF READERS, AND EACH ROUND BROKE THE PREVIOUS ROUND'S FIX

**Kyle required readers on the implementation before it reached you. They did not confirm it; they broke it, twice.**

## 3.1 ROUND 1 — a regression I introduced, and a test that could not fail
- ⛔ **THE REGRESSION.** I rewrote `cached?.price ?? null` as `cached ? {…} : null` — moving the null test from the **price** to the **row**. They diverge on one input: a row present with an absent price. Mine returns `price: undefined`, the cache-write guard is `quote.price !== null` (**true for undefined**), so undefined would be written to the cache and reach the exit evaluation. **Found independently by both readers.**
- ⛔ **THE NON-FAILING TEST.** My "split's own falsifier" sliced the `CachedPrice` **type declaration**. A reader mutated the **stamping site** to make the re-serve non-actionable — a genuine trading-decision change — and **all 19 tests passed.**

## 3.2 ROUND 2 — it defeated my *replacement* fence FOUR ways
Each applied to the real file, suites run: **M1** mutate `source` after the literal (outside the slice) · **M2** refuse on age inside the branch, never touching `source` · **M4** spread a conditional `source` override **into the very literal the test slices** · **M6** strengthen the predicate to `price > 0`, which diverges from the original at `price === 0`. **All passed.**
⇒ ⛔ **My mutation-proof had been ONE mutation generalised to "any ternary or derivation" — itself the overclaim.**

## 3.3 ⇒ THE STRUCTURAL FIX: THE FENCES NOW **EXECUTE THE BRANCH**
**Every fence in that file matched STRINGS, and a string fence guards the text, not the predicate that governs the return.**
✅ **The rate limiter is deterministic — one `check()` arms a per-symbol cooldown, so the next call is blocked with no mocking, no timing, no network.** Four tests seed the private cache and **call the code**:
| test | catches |
|---|---|
| carries the ORIGINAL `observedAt`, never a fresh stamp | the laundering itself |
| returns **null** when the cached price is absent | the row-vs-price regression, and the parenthesise-evasion |
| **still serves a cached price of 0** — the predicate must not be STRENGTHENED | M6 |
| calling `fetchLivePrice`: **the EMITTED quote keeps `source: 'kraken_rest'`** | **M1 and M4**, which no fetch-level test can see |

**Re-proved against all four: M1 1 failed · M2 3 failed · M4 1 failed · M6 1 failed · revert 24/24.**

## 3.3b ⛔⛔ ROUND 3 FOUND THE ONE THAT MATTERS — MY FENCES ASSERTED **ONE HOP SHORT OF THE ENGINE**
**RE-DERIVED BY ME AT THE REF BEFORE IT MOVED ANYTHING (a reader hit is a lead, not a verdict):**
| hop | line | carries |
|---|---|---|
| the engine calls | `active-execution-engine.ts:1257` | `getPriceWithFallback(symbol, 2000)` — **NOT `fetchLivePrice`, which is what every fence asserted on** |
| and reads | `:1285` | `priceObservedAtMs = priceResult.observedAt` |
| which returns | `live-pricing-adapter.ts:1169`, `:1183` | `observedAt: cached.observedAt` — **cache rows** |
| written at | ⛔ **`:538`** | `observedAt: quote.observedAt ?? Date.now()` — **the ONLY occurrence of `quote.observedAt` in the repo** |

⛔ **CHANGING `:538` TO A BARE `Date.now()` RE-INTRODUCES THE WHOLE #743/#951 LAUNDERING — every poll re-stamps the row, so the branch "carries the true age" of a value that was itself just re-stamped — AND THE READER RAN THE FULL SUITE AGAINST IT: 2,851 tests, all green.** My four behavioural tests hand-seed the cache, which **bypasses the only writer that can launder.**
✅ **FIXED: a fifth behavioural fence now spans the WRITE** — it seeds an old row, forces the re-serve, drives the real cache writer (`fetchPrice`), then reads back through `getPriceWithFallback`, the engine's own entry. **Mutation-proved: under the `:538` mutation it fails on `expected 1788170441485 to be 1600000000000` — the fresh stamp against the true one. It is the only test in the repo that goes red.**

## 3.3c THREE MORE ROUND-3 HITS, ALL RE-DERIVED, ALL FIXED
- ⛔ **MY OWN CLAIMED CORRECTION WAS WRONG.** The round-2 commit said *"the slice hardening was single-sited … both slices now assert their end marker."* **There are THREE slices.** The third had **no guard at all** and was bounded by *"the first `};` after the call"*, which is not anchored to the literal — **so a reader's behaviour-identical wrapper turned it RED on a pure no-op**, swallowing the last-known-good leg twenty lines below. ⇒ **now bounded at the next section's first line of CODE and guarded.** ⚠️ **And my first attempt at that anchor was a COMMENT — but `code()` strips comments before the fence runs, so it resolved to `-1`. I picked it by reading the RAW file while the test operates on the STRIPPED copy. The new guard caught it on its first run.**
- ⛔ **A TEST THAT COULD PASS FOR THE WRONG REASON.** The null-return test's only assertion was `toBeNull()`, with **no positive control that the branch was ever entered.** The reader proved it: with the cooldown cleared, a real request went to Kraken, was rejected as an unknown pair, and returned `null` — **the assertion is satisfied identically whether or not the fenced branch runs**, and on a runner with no egress it passes too. ⇒ **all four now assert `restRateLimiter.getStats().blockedCount` rose**, which happens only when the branch is taken. *(This is the file's own header warning — "a control that cannot fire is the defect it guards" — landing on the file itself.)*
- ⛔ **THE GUARD I ADDED IN ROUND 2 SELECTED ON THE WRONG PROPERTY.** `!= null` blocks `null`/`undefined`, which the type forbids and no writer produces, **while ADMITTING `NaN` — the value that actually hurts**: `isPriceVenueQuiet` (`:293`) computes `ageMs > VENUE_QUIET_MS`, and `NaN > 60000` is **false**, so an age of unknown value reads as **fresh venue data**. ⇒ **now `Number.isFinite`**, which covers null, undefined, NaN and Infinity in one.
- ⛔ **AND MY COMMENT ON THAT GUARD WAS OVERSTATED.** It read *"if we cannot state the age honestly, WE DO NOT SERVE THE PRICE."* **Returning null does not refuse** — it falls through to the last-known-good leg at `:620`, which re-serves the same row and emits `observedAt: cached.observedAt` **unguarded** at `:631`. What actually changes is the **tag**: `source: 'last_known_good'` fails `isKrakenVenueSource` and is therefore **non-actionable**. **Corrected in-source.**

## 3.3d ⚠️ WHAT ROUND 3 DEFEATED AND I HAVE **NOT** CLOSED — DISCLOSED, NOT FIXED
**Three further mutations pass green, and they share ONE shape: the fixture pins one symbol, one cached-row shape, and one blocked-reason, so ANY condition keyed on a dimension the fixture happens to satisfy is invisible.**
| defeat | the condition | why the fence cannot see it |
|---|---|---|
| gate on `getBlockedReason(symbol) === 'cooldown'` | the test arms via cooldown, so it is always `'cooldown'` here | the **`'no_tokens'`** arm — a REST storm, exactly when the re-serve matters — silently becomes non-actionable |
| relabel `source` only when `trackedSymbols.has(symbol)` | `ZZZTEST/USD` is in no tracked set | **every real symbol** gets the carved-out refusal; the synthetic one is structurally exempt |
| gate on `cached.source === 'kraken_rest'` | the seed writes exactly that | most real rows are `kraken_ws` and would return null |
⛔ **I am NOT claiming these are closed, and I do not think more fixtures is the answer** — that is an arms race against my own test data. **I want your ruling on whether this residual is acceptable for a provenance-only batch, given `source` is unchanged and the refusal behaviour is carved out anyway.**
⚠️ **ALSO DISCLOSED:** the fence leaves a poisoned row and a live 60s cooldown in two module-level singletons; **vitest's DEFAULT isolation contains it and nothing in this repo pins that default** (`isolate: false` is a routine CI speed-up). ⇒ **explicit `afterEach` cleanup added rather than relying on a config value we do not control.**

## 3.4 TWO MORE OF MY OWN, FOUND BY ROUND 2
- ⛔ **`observedAt` was left UNGUARDED in the same expression where I had just guarded `price`** — relying on exactly the *"the types forbid it today"* posture I had refused one line earlier, and **it is a NEW exposure** because the old code emitted `Date.now()` there. Now guarded on the batch's own premise: **if we cannot state the age honestly, we do not serve the price.**
- ⛔ **The slice hardening was SINGLE-SITED** — the same commit that hardened one instance **shipped a fresh unguarded copy twenty lines below it.** Both now assert their end marker.

---

# 4. VERIFICATION
**tsc 384 = 384 baseline** (re-run after the round-3 fixes). **Fence suite 25/25.** **All four adapter-touching suites 45/45.**
⚠️ **PREVIOUSLY STATED: 24/24 and 44/44. NOW: 25/25 and 45/45. REASON: the round-3 end-to-end fence adds one test.**
**Named, because a glob is not a census:** `b-exit-provenance-fence`, `p19-b8-2-resume-refusal`, `p19-b8-9-venue-only-source`, `p19-b8-9a-source-tag-honesty` — the four files in `server/tests/` that reference the adapter.
★ **MUTATION RECORD AT THIS COMMIT:** `:538` end-to-end → **1 failed** (the new fence, and only it) · M2 age-refusal → **4 failed** (up from 3) · M6 `price > 0` → **1 failed** · revert → **25/25**.
**P9 discharged by reading both `getAllPrices` consumers in full:** `server/index.ts` uses `price`+`symbol`; `routes.ts` uses `length`+`timestamp`. **Neither branches on `producer`, `observedAt` or `source`.**

---

# 5. WHAT THIS BATCH DOES **NOT** CLAIM
- ⛔ **It does not make the engine refuse a stale re-serve.** (P2, carved out.)
- ⛔ **It states no daily rate.** The earlier `~843/day` was withdrawn — a 3.5-minute burst divided by a 95.7-minute window.
- ⛔ **"Changes no trading decision" is NOT asserted flatly.** `toCachedProducer` IS a producer-dependent branch; the accurate claim is that **the one existing producer branch routes this token identically to the one it replaces** — placement, fence-tested and mutation-proved, not an absolute. **`SYSTEM_MANUAL` carried the absolute and it is withdrawn there too.**
- ⛔ **`OBJ-3`'s census is NOT discharged** — withdrawn, remainder homed to `#976`.

★ **DISCLOSED RESIDUAL — `timestamp` IS STILL FRESHLY STAMPED ON A RE-SERVE, AND I AM *NOT* FILING IT AS A DEFECT.**
`live-pricing-adapter.ts:600` still emits `timestamp: new Date().toISOString()` on the rate-limited path. **I checked whether that is the same laundering one field over. It is not** — `active-execution-engine.ts:1280-1283` documents the two-field split explicitly: *"`observedAt` is the ORIGINAL venue observation time … which is exactly why it is the honest freshness measure and `timestamp` is not."* ⇒ **`timestamp` means "when this quote object was produced"; `observedAt` means "when the venue was seen."** Both are now true.
**The one place `timestamp` is READ is the health endpoint** (`routes.ts:6105-6115`, `lastUpdate = max(timestamp)`), and cache-write time is the correct quantity for *"is the pricing service alive"* — a re-serve IS a live service. ⇒ **§9.4 disposition 5, withdrawn on the citation above, recorded here rather than as a fresh issue.**
⚠️ **I raise it because it is the first thing a reviewer would reach for, and an undisclosed adjacent-field asymmetry reads as one I missed.**

★ **SECOND-ORDER EFFECT, DISCLOSED: this batch changes emitted data OUTSIDE the branch it edits.** The re-serve is self-feeding, so under the old code a rate-limited re-serve refreshed the row's `observedAt` on **every poll** — meaning the four legs that already carried `cached.observedAt` *honestly* were carrying a **laundered** value whenever a rate-limited re-serve had recently touched that symbol. **Pinning it makes all four emit the true origin time.**

⚠️ **AND AN INSTRUMENT CONSEQUENCE, recorded on `#951`:** `exit_price_producer` is already read back as an analytic population, and the new token carries **no mid/last kind** — so part of the crypto cohort will answer neither side of that census. **It also shares the `kraken_rest` prefix, so any hand-written `LIKE 'kraken_rest%'` cohort silently gains members.** ⇒ **ENUMERATE that column, never `LIKE` it.**
