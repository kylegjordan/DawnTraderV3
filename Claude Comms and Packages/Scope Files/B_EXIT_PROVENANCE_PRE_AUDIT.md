# B-EXIT-PROVENANCE — PRE-AUDIT (Step 2)

> Owner: Claude Analyst (CC-C) · 2026-08-23 · change-class **architecture** · design **(B)**, Langston-ruled
> Scope r2: `B_EXIT_PROVENANCE_SCOPE.md` · Ruling staged at `/home/langston/inbox/B-EXIT-PROVENANCE/`

## 0. LANGSTON'S DECIDING ARGUMENT — RE-DERIVED, NOT TAKEN ON REPORT

He ruled (B) on an argument I did not make, and I verified it at source rather than accept it:

```
live-pricing-adapter.ts:67 → export function isKrakenVenueSource(source: string): boolean {
```

**The parameter is `string`, not the union.** So under design (A) — widening the `source` vocabulary —
`tsc` **cannot** catch a missed widening at the one site that IS the trading gate, while flagging it
everywhere else that is typed. **(A) would have put the outage exactly where the safety net has a
hole.** That is a stronger argument than my gate-consumer count and it is why (B) is right.

**★ AND MY OWN CENSUS WAS INCOMPLETE, WHICH IS ITSELF EVIDENCE FOR (B).** I enumerated four consumers
of the *predicate*; (A) widens a *value*, and by-value sites live outside it. All five re-derived
verbatim:

| site | form | why it matters |
|---|---|---|
| `live-pricing-adapter.ts:957` | `cached?.source === 'kraken_ws' \|\| … 'kraken_equities_ws'` | equality, silent on a new value |
| `routes.ts:10503` | `e.source === 'kraken_ws'` | equality |
| `routes.ts:12299` | `priceSource.includes('kraken_ws')` | **survives only by substring accident** |
| `kraken-websocket-adapter.ts:95` | `source: 'kraken_ws';` | the **literal type** on `PriceTickEvent` |
| `live-pricing-adapter.ts:699` | `source: … = 'kraken_ws'` | the **default value** |

**A census being wrong on its first telling is the case for the design where a miss cannot hurt.**

## 1. C-B2 — EVERY WRITER INTO THE PRICE CACHE, WITH ITS HONEST PRODUCER

⚠️ **THIS SECTION WAS REWRITTEN, NOT ANNOTATED.** Its first version censused the *callers* of the
cache and reported "four writers". That was wrong in method, not just in count — censusing callers
**counts a multi-caller writer once and misses a caller-less one entirely**, which is exactly what
happened. Langston's correction; the body is edited so the file never holds two answers.

**Census the `priceCache.set` SITES. THREE writers, one of which fans in:**

| # | `priceCache.set` | function | how it gets its source |
|---|---|---|---|
| **W1** | `live-pricing-adapter.ts:706` | `updateCache` | **fan-in — 3 callers**: priceTick subscriber `:1024`, `aee:1145`, `aee:1220` |
| **W2** | `live-pricing-adapter.ts:784` | `seedLastKnownGoodPrice` | sole caller `aee:3617` |
| **W3** | `live-pricing-adapter.ts:307` | `fetchPrice` | **writes `quote.source` VERBATIM with `cachedAt: Date.now()`** |

**★ W3 IS THE LAUNDERER.** `fetchLivePrice` can return `last_known_good` (`:348`, `:389`, `:418`);
`:307` re-stamps it `cachedAt: Date.now()`; `getPriceWithFallback` then serves it **as fresh**. It is
live — `start()` (`:151-161`) fires `fetchAllPrices()` immediately then every 15 s, armed
unconditionally from `index.ts:954`. **It also stamps `kraken_rest` (`:369`), the same token as the
engine's REST fallback (`aee:1220`)** — one token, two producing handlers.

**COMPILE-TIME NET, honestly:** C-B1's required `producer` on `PriceTickEvent` reaches **only W1's
priceTick caller**. `aee:1145`, `aee:1220`, W2 and W3 all construct or pass `CachedPrice` shapes
directly and sit **outside** it. ⇒ **the census is the protection for four of the six paths.**

## 2. C-B3 — THE CLOSED VOCABULARY, EVERY TOKEN WITH ITS EMIT SITE

| token | emit site | note |
|---|---|---|
| `kraken_ws_ticker` | adapter `:692` `handleV2TickerUpdate` | |
| `kraken_ws_book_mid` | adapter `:916` `handleV2BookUpdate` | **the `#741` path** |
| `kraken_ws_ticker_v1` | adapter `:1049` (defined `:938`) | **UNREACHABLE — `#742`** |
| `kraken_equities_ws` | `aee:1145` | |
| `kraken_rest_engine_fallback` | `aee:1220` | split from the poller |
| `kraken_rest_poller` | `lpa:369` in `fetchLivePrice` → W3 | split from the engine leg |
| `last_known_good_restamp` | `lpa:348` / `:389` / `:418` → W3 | **names the laundering; see the addendum — naming is NOT recovering** |
| `entry_seed` | `lpa:784` (W2) | sole caller `aee:3617` |
| `mock` | `fetchMockPrice`, **defined `lpa:527`** (called `lpa:300`) | enumerated, not excluded |

Named for the **producing handler, not the feed** — the feed name is what conflated a ghost midpoint
with a ticker print in the first place.

**★ `no_book_for_class` WAS DROPPED.** It existed nowhere but this document — a closed fence with an
unproducible member is #546 wearing the fix's clothes — and it was wrong because it **conflated two
facts**: the producer vocabulary answers *where the PRICE came from*; *"this class has no order
book"* is a property of the **`bookMid` field**.

**`mock` is ENUMERATED with evidence, not assumed unreachable:** gate is
`process.env.ENABLE_MOCK_PRICING === 'true'` (`index.ts:952`); staging's **process env does not set
it** (read from `pm2 jlist`, not `.env`); `NODE_ENV=production`; and the running process's own boot
line reads **`2026-08-22 22:01:00Z [B9.PRICING] Mock mode: DISABLED (production mode)`**. Unreachable
in this deployment, producible by one env var ⇒ it must exist in the fence.

## 3. THE DEAD PRODUCER — FINDING KEPT, DELETION REFUSED, AND HIS REASONING IS BETTER THAN MINE

`handleTickerUpdate` (`:938`) is unreachable: **one occurrence in the whole tree** (its own
definition — population: `server/`, `client/`, `shared/`, `server/tests/`), `private` so no external
caller is possible, and `handleMessage:458` routes only on `message.channel`, which a v1 array payload
does not carry.

**I proposed deleting it here. He refused, on three grounds I accept:** this batch's entire safety
case is *"no decision path changes,"* and a rule-18 deletion **changes what rollback means** (today:
drop the columns); **under (B) my own argument for deleting it evaporates** — a handler that never
emits gets no producer stamp, so it is no longer coupled to the design; and a 3,483-line adapter with
one dead v1 handler probably carries more v1 residue, which wants **one sweep, not picking**.

**§13 home: `B-WS-V1-RESIDUE-SWEEP`, owner CC-C, due 2026-09-05.** In this batch: a scope line and one
comment at `:938` recording that producer #3 is unreachable — so a later reader does not read
two-of-three stamped as a **missed** stamp.

## 4. ★ THE `manual_stop_` FINDING — MY SITE WAS RIGHT, MY MECHANISM WAS WRONG, THE REAL DEFECT IS BIGGER

I claimed `forceClosePosition` *"has no price context at all"* and proposed an `operator_supplied`
sentinel. **Both wrong.** Re-derived: it has exactly two callers, both inside
`forceCloseAllOpenPositionsOnStop` (`active-portfolio-manager.ts`), and **both carry price context**:

- `:320` — the position's own entry price, tagged `'entry_price_fallback'`
- `:335` — `getPriceWithFallback(symbol, 5000)` — **the same adapter, same cache, same producer chain
  as a normal close** — tagged `` `manual_stop_${priceResult.source}` ``

So `operator_supplied` would have been **a mislabel of exactly the kind this batch exists to fix**:
this is a *system-initiated close-all on engine stop*, not an operator supplying a number.

**And nulls were never the risk on that path — UNENUMERATED VALUES are.** `priceSource` already
defaults to `'manual_stop'` (`:804`), and `manual_stop_kraken_ws` is a **constructed string that would
fail OBJ-1's fence on day one.**

⇒ **OBJ-5 RE-STATES: no post-deploy close carries a value outside the enumerated vocabulary.**
⇒ **And the honest decomposition is three separate facts that are currently concatenated into one:**
`manual_stop` is the exit **condition** (already `type:'manual_stop'` at `:815`); the venue tag is the
**source**; the handler is the **producer**. **Stop concatenating them.**

## 5. BLAST RADIUS

| | |
|---|---|
| **Decision paths** | **none.** `source` is untouched, so `isKrakenVenueSource` and all five by-value sites are untouched **by construction** — the reason (B) was chosen. |
| **Type surface** | `PriceTickEvent` (`:95`), `CachedPrice` (`:51`), `PriceQuote` (`:58`), `updateCache` (`:699`), `getPriceWithFallback`. `producer` **required + closed union** (C-B1) ⇒ a future producer #4 is a **compile error**, not a silent absence. |
| **Cross-cutting** | `PriceTickEvent` / `CachedPrice` are read by **entry as well as exit** ⇒ change-class **architecture**; SIM cross-cutting registry takes a content update. |
| **Write path** | `closePosition` + its three call sites, symmetric per the B8.6 rule. |
| **Rollback** | drop the columns + revert the type widening; nothing reads them yet. |

## 6. RISKS ACCEPTED, NAMED

1. **`producer` required on `PriceTickEvent` is a breaking type change** — deliberate. Optional would
   let producer #4 omit it, and that absence is indistinguishable from a missed stamp (#546).
2. **The 127 historical unassessable rows are untouched and stay untouched.** This batch is
   forward-only and fixes no existing trade. Stated in the scope, repeated here, and it must not blur.
3. **Storage:** nine nullable columns. ⚠️ The disk gauge is at a warning level; **the completion
   report reads the LIVE gauge, never the alert body** — Langston's note, and the alert's figure is a
   mint from 2026-08-22 rather than a current reading.

---

# B-EXIT-PROVENANCE — §2 ADDENDUM (origin-time) + cite fix

## 1. YOUR NEW FINDING — CONFIRMED, AND THERE IS A DETAIL THAT SHARPENS IT

Re-derived at `1d85c51f0`. Both `last_known_good` legs (`:381-390` all-APIs-failed, `:410-419`
catch) read the cache under **`if (cached && cached.price > 0)` and nothing else** — no age test —
then return `timestamp: new Date().toISOString()`, and `:307` writes `cachedAt: Date.now()`. So each
15 s poll during an outage refreshes **both** freshness fields on a price that never moved. Your
statement holds exactly: a two-hour-old price reads as ≤15 s old indefinitely.

**★ AND THE SHARPENING DETAIL: `cacheAge` IS COMPUTED ON BOTH LEGS AND ONLY LOGGED.**

```
const cacheAge = Date.now() - cached.cachedAt;
console.log(`[8.8.3-I6][LAST_KNOWN_GOOD_FALLBACK] … age=${cacheAge}ms reason=all_apis_failed`);
```

It is never compared to anything. **The one number that would catch this is measured, printed to a
rotating log, and discarded** — which is the *same shape as this batch's founding finding*, where
`exitPriceSource` is computed at close and thrown into `[B8.PNL][CLOSE_ATTEMPT]`. Twice in one
subsystem, the fact needed to detect a defect is produced and dropped.

## 2. THE §2 ADDITION — AN ORIGIN TIME CARRIED *THROUGH* THE RE-STAMP

You are right that `last_known_good_restamp` names the path without making the staleness
recoverable, and that a producer token on a number still lying about its age is a label, not a fence.

**`CachedPrice` and `PriceQuote` gain `observedAt: number` — the ORIGINAL venue observation time.**

- a genuine venue write sets `observedAt = Date.now()` (same instant as `cachedAt`);
- **a `last_known_good` re-stamp CARRIES `observedAt` THROUGH from the cached entry, unrefreshed** —
  that is the whole mechanism; `cachedAt` may move, `observedAt` must not;
- `getPriceWithFallback` returns it, so the close path can read it without new plumbing;
- the exit stamp persists `exit_price_observed_at` beside `exit_price_producer`.

⇒ **true age at the moment of the exit decision becomes `closed_at − exit_price_observed_at`,
recoverable from the row alone.** Without it, `#741`-class forensics on a stale-price close is
impossible after the fact, exactly as it was for the maker fills.

**FENCE (falsifiable, not decorative):** for any post-deploy close with
`exit_price_producer = 'last_known_good_restamp'`, assert `exit_price_observed_at < cachedAt-equivalent`
— i.e. the origin time must be **strictly older** than the write time by more than one poll interval.
**If a re-stamp ever refreshes `observedAt`, the two collapse and the fence fails.** That is the
property under test, and it can actually fail — which is the point.

⚠️ **SCOPE HONESTY:** this fixes the *recoverability* of the staleness, **not the staleness itself.**
The age-unbounded re-serve is a live defect in its own right and this batch does **not** close it —
it makes it visible and measurable. It needs its own §13 home; I am not folding a behaviour change
into a batch whose entire safety case is "no decision path changes."

## 3. CITE FIX

`mock`: the emit site is **`fetchMockPrice`, DEFINED at `lpa:527`**; `lpa:300` is the CALL inside
`fetchPrice`. Same define-vs-emit ambiguity I fixed for `handleTickerUpdate` one section earlier and
then reproduced immediately — noted rather than quietly corrected.

## 4. ALERT READ-BACK, per your instruction

`563d32cd` → `resolved`, `resolved_at 2026-08-23T11:37:49.527Z`
`c59186da` → `resolved`, `resolved_at 2026-08-23T11:37:50.659Z`

Both landed. **But your discipline point stands and the outcome does not excuse the method:** I
reported the discharge without reading either back, and a short id would have no-opped with `exit 1`
while I reported a discharge that never happened. Same class as filing the ledger row and calling it
effective.
