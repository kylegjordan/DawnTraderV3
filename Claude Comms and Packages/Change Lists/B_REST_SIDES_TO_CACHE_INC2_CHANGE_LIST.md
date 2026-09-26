# B-REST-SIDES-TO-CACHE — increment 2 — CHANGE LIST (Step 4)

**Graded ref:** `origin/migration/aws-supabase` @ `69c9d8d1b` (code), change list committed after it. **CI:** run `36276784671` on `69c9d8d1b`: TypeScript Check, Test Suite, Build, Docker Build all `success`.

## DISPATCH HEADER

**(i) Declared change-class:** `architecture` (scope header, unchanged).

**(ii) The architecture doc set, row by row** (`scripts/governance-checker/config.mjs` `CLASS_DOCSET.architecture`):
| doc | status |
|---|---|
| scope | **present:** `Claude Comms and Packages/Scope Files/B_REST_SIDES_TO_CACHE_SCOPE.md` |
| pre_audit | **present:** `Claude Comms and Packages/Scope Files/B_REST_SIDES_TO_CACHE_PRE_AUDIT.md` Part B (§7-§12; Step 2 approved with C1-C6, P14 ruled) |
| completion_report | **absent:** Step 11 (one report for both increments) |
| batch_catalog | **absent:** Step 10 |
| phase_history | **absent:** Step 10 |
| system_manual | **partly present:** OBJ-4 lands here (chain steps 5 and 6 corrected in place). The §9 *"tier 0 manually verified"* correction from increment 1 is owed at Step 10 |
| sim | **absent:** Step 10. Owed: the price-cache entry (writers, `sidesWriter` channels, the counters now count instruments), the live-pricing adapter's `updateCache` routing, the new `stated-sides.ts`, and the first entry for the static map + resolver (increment 1) |
| changes_and_fixes (conditional) | **applicable, absent:** Step 10 |
| running_issues (conditional) | **present:** `#1056` am. 6, `#1060` am. 4 amended in place, `#1076` (OBJ-5) |
| roadmap (conditional) | **judged N/A:** no roadmap item moves |
| deleted_log (conditional) | **judged N/A for this increment:** nothing deleted (`getAllCachedPrices` is homed at `3n.l-b`, not deleted) |
| phase_19_plan (conditional) | **present:** row `3n.u5` placed (P14) |
| adjustment_framework (conditional) | **judged N/A:** no constant, fee, epoch or booking rule changes |

**(iii) Step-2 reference:** `B_REST_SIDES_TO_CACHE_PRE_AUDIT.md` Part B, approved 2026-09-26 22:03Z with six conditions; P14 ruled 22:11Z.

---

## 1. FILES

| file | change | plan |
|---|---|---|
| `server/services/market-data/stated-sides.ts` | **NEW**, leaf: `pairwiseStatedSides(bid, ask)` | P8 |
| `server/services/price-cache.ts` | `SidesWriter` by channel; `StatedSides`; `updateFromRest` takes sides; `updateFromWebSocket` takes the writer; ONE REST row builder `restTickerRow` for the three REST ticker sites, per key; counters count instruments; census keyed to the union | P6, P8, P9, P11 |
| `server/services/live-pricing-adapter.ts` | REST read passes its sides (pairwise); `updateCache` routes `kraken_rest` to `updateFromRest`; `sidesWriterOfProducer` (total, `never` arm) | P7, P9, P11 |
| `server/exchanges/kraken/kraken-websocket-adapter.ts` | ticker emit and book guard use the predicate; v1 direct call passes `null` writer | P8, P11 |
| `server/core/calculations/touch-price.ts` | `CachedQuoteSides.sidesWriter` replaces `lastSource`; the ticker leg is labelled by it; `recordTouchSelection` records the book verdict on a ticker acceptance | P11, P12 |
| `server/core/calculations/level-basis.ts` | F2 split gains `WsTicker` / `WsBook`; section docblock rewritten; ladder cells carry `tickerAcceptedByBookVerdict` | P11, P12 |
| `server/services/signal-orchestrator.ts` | F2 fed `sidesWriter` instead of `lastSource` | P11 |
| `1-system-manual/SYSTEM_MANUAL.md` | crypto chain steps 5 and 6 corrected in place | OBJ-4 |
| `1-system-manual/RUNNING_ISSUES.md` | `#1076` (the locked header; `getAllCachedPrices`) | OBJ-5 |
| tests | NEW `b-rest-sides-to-cache-inc2.test.ts` (16); three pinned tests moved to the new shape (`inc1` test 8, `obj8c-ladder-funnel` test 10, `p7k-cache-mark-kind` test 4) | P15 |

## 2. THE LOAD-BEARING HUNKS

**P6 — `updateFromRest` (BEFORE: `(symbol, price, markKind, lastTradePrice)`, sides always carried):**
```ts
  updateFromRest(symbol, price, markKind, lastTradePrice, sides: StatedSides | null): void {
    const stated = sides ?? null;
    ...
      ask: stated ? stated.ask : (existing?.ask ?? price),
      bid: stated ? stated.bid : (existing?.bid ?? price),
      lastSource: 'kraken_rest',
      sidesCapturedAtMs: stated ? stated.capturedAtMs : (existing?.sidesCapturedAtMs ?? null),
      venueObservedAtMs: stated ? null : (existing?.venueObservedAtMs ?? null),
      sidesWriter: stated ? stated.writer : (existing?.sidesWriter ?? null),
      lastWsMessageAtMs: existing?.lastWsMessageAtMs ?? null,
```
`StatedSides = { bid, ask, capturedAtMs, writer }`: one object, so a caller cannot state half a book (r4 condition 3), and the writer comes from the caller (Step-2 C2).

**P7 — the adapter's REST read (BEFORE: `priceCache.updateFromRest(normalized, midpoint, _restKind, _lastTradeOrNull);`):**
```ts
      const _restSides = pairwiseStatedSides(bid, ask);
      priceCache.updateFromRest(normalized, midpoint, _restKind, _lastTradeOrNull,
        _restSides ? { bid: _restSides.bid, ask: _restSides.ask, capturedAtMs: Date.now(), writer: 'rest_adapter' } : null);
```

**P8 — the predicate, and the two WS producers:**
```ts
export function pairwiseStatedSides(bid, ask): { bid: number; ask: number } | null {
  if (typeof bid !== 'number' || typeof ask !== 'number') return null;
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
  if (!(bid > 0) || !(ask > 0)) return null;
  return { bid, ask };
}
// kwa ticker emit, BEFORE: bid: Number.isFinite(bid) && bid > 0 ? bid : null, ask: Number.isFinite(ask) && ask > 0 ? ask : null,
      const _statedSides = pairwiseStatedSides(bid, ask);
        bid: _statedSides?.bid ?? null,
        ask: _statedSides?.ask ?? null,
// kwa book guard, BEFORE: if (bestBid <= 0 || bestAsk <= 0) { continue; }
      if (!pairwiseStatedSides(bestBid, bestAsk)) { continue; }
```
Not the uncrossed test: a crossed pair is a real venue state the ladder counts as `crossed_book`.

**P8 extended at Step 3 — the cache's own three REST ticker sites.** They wrote `ask: parseFloat(ticker.a?.[0] || '0')` and `bid: …` unconditionally with `sidesCapturedAtMs: Date.now()`: a missing side became a stated `0` under a fresh stamp (refused downstream as `non_finite_side`, but destroying a good prior side). The three copies are now ONE builder:
```ts
  private restTickerRow(key, normalizedSymbol, ticker, writer, now): CachedPrice {
    const existing = this.cache.get(key);
    const price = parseFloat(ticker.c?.[0] || '0');
    const sides = pairwiseStatedSides(parseFloat(ticker.b?.[0] || '0'), parseFloat(ticker.a?.[0] || '0'));
    return { symbol: normalizedSymbol, price,
      ask: sides ? sides.ask : (existing?.ask ?? price), bid: sides ? sides.bid : (existing?.bid ?? price), …
      sidesCapturedAtMs: sides ? Date.now() : (existing?.sidesCapturedAtMs ?? null),
      venueObservedAtMs: sides ? null : (existing?.venueObservedAtMs ?? null),
      sidesWriter: sides ? writer : (existing?.sidesWriter ?? null),
      lastWsMessageAtMs: existing?.lastWsMessageAtMs ?? null,
      markKind: 'last', ...carryLastTrade(existing, price, now), lastUpdatedAt: now };
  }
```

**P9 — (i) the routing, (ii) per-key rows, (iii) instruments:**
```ts
    // live-pricing-adapter.ts updateCache, BEFORE: priceCache.updateFromWebSocket(… every source …)
    const _writer = sidesWriterOfProducer(producer);
    if (source === 'kraken_rest') {
      const _paired = pairwiseStatedSides(bid, ask);
      priceCache.updateFromRest(normalized, price, markKindOfProducer(producer), lastTradePrice ?? null,
        _paired && _writer !== null && sidesCapturedAtMs !== null ? { …, writer: _writer } : null);
    } else {
      priceCache.updateFromWebSocket(…, lastTradePrice ?? null, _writer);
    }
    // price-cache.ts refreshBucket, BEFORE: this.cache.set(requestedSymbol, cachedPrice)  (the SAME object)
              this.cache.set(requestedSymbol, this.restTickerRow(requestedSymbol, normalizedSymbol, ticker, 'rest_poller', now));
    // counters, BEFORE: n++ per KEY
    for (const [key, p] of this.cache) if (…) seen.add(this.instrumentOf(key));   // normalizeKrakenPair(key), memoised
```

**P11 — the writer, by channel, from the caller:**
```ts
export type SidesWriter = 'ws_ticker' | 'ws_book' | 'rest_poller' | 'rest_fetch' | 'rest_batch' | 'rest_adapter' | 'rest_engine';
// sidesWriterOfProducer: ticker producers → 'ws_ticker'; kraken_ws_book_mid → 'ws_book'; engine fallback → 'rest_engine';
// kraken_rest_poller → 'rest_adapter'; equities mark, re-serves, seeds, mock, walks → null; default: never.
// census (Step-2 C1): const counts: Record<SidesWriter | 'none', number> = { ws_ticker: 0, ws_book: 0, …, none: 0 };
// touch-price.ts, BEFORE: producer: q.lastSource ?? 'unknown'
    producer: q.sidesWriter ?? 'unknown',
// signal-orchestrator.ts, BEFORE: tickerSidesSource: _lbCache?.lastSource ?? null,
            tickerSidesSource: _lbCache?.sidesWriter ?? null,
// level-basis.ts F2: rest_* (or legacy kraken_rest) → Rest; ws_ticker → WsTicker; ws_book → WsBook; other string → Ws; none → Unknown
```

**P12 — the book verdict on a ticker acceptance (`recordTouchSelection`):**
```ts
  const _bookVerdict = sel.ok && sel.bookRefusal !== null
    ? (sel.bookRefusal === 'no_book' ? 'book_absent' : sel.bookRefusal === 'book_not_eligible' ? 'book_not_eligible' : 'book_refused')
    : undefined;
```
Ladder rows gain `tickerAcceptedByBookVerdict: { book_absent, book_not_eligible, book_refused }`; `book` rows carry zeros.

## 3. BEHAVIOUR CHANGE, STATED

- **Symbols served by the adapter's REST read** (55 in 32.5 min on 2026-09-26, pre-audit §8.3) now carry the REST ask and bid instead of whatever an earlier writer left. On the 16 with no other side writer, the ticker rung can accept where it refused `locked_or_synthetic`, at the per-rung duty cycles pre-registered in V6 (~2.6% of exit-trigger walks, ~10% entry fill, ~78% signal birth, ~100% VTS exit).
- **FINDING-3:** on the 12 symbols also WS-written, an adapter REST write replaces WS sides with receipt-stamped ones, so their ticker rung flips to the receipt clock after each such write.
- **A one-sided frame** (ticker, book `NaN`, REST ticker, adapter REST) now states no sides: the row keeps its sides AND their stamps, which then age out honestly. Observed 0 times in the pre-audit's populations.
- **The engine's REST fallback** writes `lastSource: 'kraken_rest'` and leaves `lastWsMessageAtMs` alone (the only two fields that differ, Langston Step 2).
- **Dual-key REST writes** give each key its own liveness and last-trade carry. `symbol` stays the normalised key on both rows, as before. ➕ *(Step-4 C4b)* **`getPrice` now RETURNS the requested key's row** (built from that key's own previous row) where it used to return the one shared object; the price and sides in it are the same REST read.
- **The two liveness counters** count instruments: a symbol held under two keys counts once. A phantom key (`3n.l-a`) still counts as its own instrument.
- ⛔ **SERIES DISCONTINUITIES, pre-registered:** (1) the ticker leg's `producer` label (so `byAcceptedSource` keys) changes from `kraken_ws` / `kraken_rest` to the `SidesWriter` values; (2) the F2 `bothPresentTickerWs` cell empties into `WsTicker` / `WsBook`; (3) ➕ *(Step-4 C3)* **F2's `bothPresentTickerUnknown` gains a population:** a cold mark-substituted row (`bid === ask === price`, `sidesWriter: null`) still counts in `bothPresent` (`signal-orchestrator.ts:2629-2630`) and now lands in `Unknown`, where before it was filed under whatever `lastSource` said; (4) ➕ *(Step-4 C4a)* **the two liveness counters count instruments instead of keys** (recorded raw by all three call sites; no gate reads them). **No reading from before the deploy is comparable with one after it on these fields** (C6 already rules out pre/post on this deploy).
- **Unchanged:** the price stored, the mark kind, `lastUpdatedAt`, every decision's ladder and ceilings, the adapter's own map.

## 4. EVIDENCE AT THE REF

- `b-rest-sides-to-cache-inc2.test.ts`: **16/16**. Positive control stated in its header: every test fails against the pre-increment code.
- **Mutations, 17/17 killed** (script `mutate_inc2.py`, run against the inc2 + inc1 + obj8c files): M1 REST writer re-stamps with no sides · M2 venue stamp carried over stated sides · M3 writer tag hardcoded (C2) · M4 adapter REST per side · M5 ticker emit per side · M6 book guard `<= 0` · M7 predicate drops the finite test · M8 `updateCache` sends REST to the WS writer · M9 dual-key row built from the normalised key · M10 push counter counts keys · M11 census table forgets a writer (C1) · M12 book labelled ticker · M13 F2 loses the book-echo cell · M14 every ticker acceptance filed `book_absent` · M15 ticker leg labelled by `lastSource` · M16 REST ticker sites per side · M17 any-write counter counts keys.
- **26 related test files, 392 tests**: green (every unit test touching the price cache, the adapter, the WS adapter's side paths, touch-price, level-basis, feed agreement, side age, the funnels, the provenance fences).
- `node scripts/check-tsc-baseline.mjs`: **377 = 377**; `updateFromWebSocket`'s new required parameter is at every production caller (tsc).
- CI: run `36276784671` on `69c9d8d1b`, 4/4 `success` per job.

## 5. JUDGEMENT CALLS TO ATTACK

1. **`restTickerRow` consolidates increment 1's three REST constructions into one builder.** The plan said P8 covers "every producer that carries sides" and named three; these three REST sites also carry sides and were missed in the audit. I fixed them at Step 3 rather than homing them, because the defect (a missing side stored as `0` under a fresh stamp) is exactly OBJ-2's, and the fix is the same predicate. It touches the lines increment 1 just shipped.
2. **`sides` is required in the type and `?? null` at runtime.** Test files are outside tsc and some call `updateFromRest` with four arguments; `undefined` is treated as "no sides". A production caller cannot omit it.
3. **Producers that state no sides map to a `null` writer** (the equities mark, re-serves, seeds, walks). If one ever starts stating sides it would store them under `null` until someone names it here; the docblock says so. The alternative (a name for every producer now) invents writers that never write sides.
4. **The counters' canonical form is `normalizeKrakenPair(key)`, memoised per key.** It matches `symbolsMatch`, so two keys merge exactly when a REST write would have written both. Phantoms stay separate (they match nothing). The memo is bounded by the number of cache keys.
5. **F2's bps histograms stay pooled.** Only the counts split; the docblock says a feeds-agree claim may cite the Rest and WsTicker counts, not the pooled histograms.
6. **F2 still files a legacy `kraken_rest` string as REST**, so a caller not yet moved off `lastSource` is not misfiled as WS. Nothing passes it today.
7. **OBJ-4 also corrects chain step 5** ("THE SIDES ARE NOT ON THE EVENT"), stale since 2026-09-05 and adjacent to the line OBJ-4 named. Same list, same correction.

## 6. STEP-4 RULING (Langston, 2026-09-26 23:00Z): APPROVED WITH FOUR CONDITIONS, NO BLOCKER — how each was met (code at the next commit)
| # | condition | done |
|---|---|---|
| **C1** | `updateFromWebSocket` still keyed its arms on `bid !== null \|\| ask !== null`: a one-sided call stored a new side beside a carried one under a refreshed stamp | the writer states sides only as a pair `pairwiseStatedSides` accepts; `updateFromRest`'s docblock ("the rules are `updateFromWebSocket`'s") is now true. Test 17; mutation M18 killed |
| **C2** | sides stated with a `null` writer were stored under `sidesWriter: null`, which the census reads as "no stated sides" and F2 as "unknown" | a pair with no named writer is not stored (the REST writer's rule). Test 18; mutation M19 killed |
| **C3** | the discontinuity list missed F2's `Unknown` cell gaining the cold rows; `AgreementCell`'s `TickerUnknown` comment still said "no source stated" | §3 item (3); the comment rewritten to say what the cell now holds |
| **C4** | (a) the counters' keys-to-instruments change belongs under discontinuities; (b) `getPrice`'s return value changes | §3 item (4) and the dual-key bullet |
**His re-derivations, recorded:** three `bid:` constructors survive in `price-cache.ts` and all nine `set` sites route through them; with no sides the two writers differ in exactly `lastSource` and `lastWsMessageAtMs`; the counters' memo is safe because `normalizeInternal` reads only maps built at module init. **`#1076`: he rules (b), the governed meaning.**
**Evidence after the conditions:** 18/18 in the increment file; 19/19 mutations killed (17 + M18, M19); the related suite and `check-tsc-baseline` re-run on the pushed head (in the commit message).

## 7. WHAT THIS DOES NOT DO

No new REST call, poll or cadence change. No ceiling moves. The resolver stays untouched (`3n.l-a`). The xStock mark re-write's liveness and the per-symbol gap pooling are placed on `3b.f-c` (P10). The signal-birth feed question is `3n.u5` (CC-B). **One deploy for both increments, after `8a-P4c` (2026-09-30T00:00Z) and `3n.q8`'s fee window (not before 2026-10-02T20:10Z).**
