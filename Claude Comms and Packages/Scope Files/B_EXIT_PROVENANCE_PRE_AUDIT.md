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

Repo-wide, tests excluded. **Four writers, and #4 is one neither of us had counted:**

| # | writer | honest `producer` |
|---|---|---|
| 1 | `live-pricing-adapter.ts:1024` — the `priceTick` subscriber | **fans in from 3 adapter producers** (below) |
| 2 | `active-execution-engine.ts:1145` — equities tick | `kraken_equities_ws` |
| 3 | `active-execution-engine.ts:1220` — REST fallback | `kraken_rest` |
| 4 | **`active-execution-engine.ts:3617` — `seedLastKnownGoodPrice`** | `entry_seed` |

Writer #1's three upstream producers:

| adapter site | handler | what it emits | producer |
|---|---|---|---|
| `:692` | `handleV2TickerUpdate` | last trade | `kraken_ws_ticker` |
| `:916` | `handleV2BookUpdate` | **book midpoint** | `kraken_ws_book_mid` ← the `#741` path |
| `:1049` | `handleTickerUpdate` (v1) | last trade | `kraken_ws_ticker_v1` — **unreachable, see §3** |

## 2. C-B3 — THE CLOSED VOCABULARY

`kraken_ws_ticker` · `kraken_ws_book_mid` · `kraken_ws_ticker_v1` · `kraken_equities_ws` ·
`kraken_rest` · `entry_seed` · `last_known_good` · `entry_price_fallback` · `no_book_for_class`

Named for the **producing handler, not the feed** — his condition, and the whole point: the feed name
is what conflated a ghost midpoint with a ticker print in the first place.

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
