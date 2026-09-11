# B-PRICE-SIDE-BY-JOB r5 — STEP 4 CHANGE LIST, COMMIT LAYER 1 (OBJ-7, feed and plumbing)

**change-class:** architecture (scope header, unamended) · **owner:** CC-C · **plan row:** `3n` · **issues:** `#952`, `#966`, `#977`, `#1017`, `#951` (age half), `#971`
**Ref:** `origin/migration/aws-supabase`. OBJ-7 code head **`92a78b05e`**. Nine commits, interleaved with other sessions' work, so **read each with `git show <sha>`**; a range diff from the base `928e652f0` also carries B-WAKE-LEAD-NAME, B-LANGSTON-CONTEXT and B-XSTOCK-FEE-CONTRACT changes that are not this batch.
**Approved plan:** `Scope Files/B_PRICE_SIDE_BY_JOB_PRE_AUDIT.md` r6 (Step 2 APPROVED 15:58Z), plan rows P-7a..P-7j; scope §7 rows 7a..7j.

## What this layer changes at runtime, stated plainly

| effect | pieces |
|---|---|
| **changes what an existing decision sees** | **P-7j** — the crypto quant lane's smoothed price, which still sets that lane's levels until P-8c · **P-7h** — an exit tick can now be skipped when the shared REST budget is empty |
| makes existing reads fresher | **P-7a** (crypto ticker on every best-bid/offer change) · **P-7g** (open crypto positions refresh the unified cache every 2 s) |
| subscription hygiene | **P-7b** |
| record-only: new fields, pure modules, counters | **P-7c**, **P-7i**, **P-7d + P-7f**, **P-7e** |

Every commit: its tests shown failing on the pre-change code (or a mutation where the new code is a new module), related suites green, and **tsc 377 errors with an identical file+code multiset** to the previous commit's baseline.

---

## CHUNK 1 — P-7b, P-7a, P-7c, P-7g

### P-7b `ad83d3406` — stopping a symbol cancels its BOOK subscription on every path
**Where:** `server/exchanges/kraken/kraken-websocket-adapter.ts:1572` (call in `unsubscribeFromSymbols`), `:1596` (`sendBookUnsubscribe`); the raw book unsubscribe inside `softResubscribe` removed. Decision D3's precondition ("today `unsubscribeFromSymbols` sends `channel: 'ticker'` only").
```ts
private sendBookUnsubscribe(internalSymbols: string[]): void {
  const byDepth = new Map<number, string[]>();
  for (const internal of internalSymbols) {
    const kraken = this.normalToKrakenSymbol(internal);
    if (!kraken) continue;
    const depth = this.bookDepth.get(internal) ?? 10;   // the depth Kraken GRANTED (#507 ACK)
    const group = byDepth.get(depth) ?? [];
    group.push(kraken); byDepth.set(depth, group);
  }
  for (const [depth, symbol] of byDepth) {
    this.ws?.send(JSON.stringify({ method: 'unsubscribe', params: { channel: 'book', symbol, depth } }));
  }
}
```
**Proof:** `b-price-side-p7b-book-unsubscribe.test.ts` 6/6. Control: test 3 failed pre-fix; test 2's fixture first failed for the wrong reason (symbols not marked subscribed), was corrected, and re-controlled by stashing the adapter change. `#507` suite 12/12.
**Attack:** grouping by granted depth, because the unsubscribe must name the subscription's depth.

### P-7a `7e21b196c` — the crypto trading ticker subscribes with `event_trigger: 'bbo'`
**Where:** `kraken-websocket-adapter.ts:1486`. D3; `#1017`.
**Proof:** `b-price-side-p7a-bbo-trigger.test.ts` 3/3, test 1 failed pre-fix; the live subscribe acknowledgement was probed (`scripts/analysis/bbo_trigger_ack_probe.mjs`); related 79/79.
**Scope limit:** the trading adapter's `subscribeToSymbols` only. The crypto archiver, xStock archiver and universe discoverer keep their subscriptions. **Step 8 carries D3's rate and event-loop-lag check at the live subscription count, with the named revert = drop the parameter.**

### P-7c `2027f22b7` — one total mapping from producer to basis, derived not stored
**Where:** `server/services/market-data/price-basis.ts:50` (`BASIS_BY_PRODUCER`, frozen, `Record<PriceProducer, …>`).
**Proof:** 6/6 with a built-in control; totality mutation (remove `mock`) → TS2741.
**Attack:** (1) derived from the already-recorded producer rather than a second stored column (#641); the SIDE a decision reads is stamped at the decision sites in OBJ-8. (2) The enum grew beyond D3's four: `book_depth` and `archive_ticker_snap` (fill-estimate walks), `rest_ticker` (A-9.8), and `not_an_observation` for re-serves, seeds, mock, reuse and no price.

### P-7g `0314c00e4` — the 2-second `openTrade` lane has members, reconciled every tick
**Where:** `server/services/price-cache.ts:107-108` (`legacyMembers`, `reasonOwners`), `:307` `setReasonMembers`, `:319` `getBucketMembers`; engine `active-execution-engine.ts:1225`. D7; `#977` am. 6.
```ts
priceCache.setReasonMembers(
  'openTrade', `engine:${this.mode}`,
  openPositions.filter((p) => ((p as { assetClass?: string | null }).assetClass ?? 'crypto_spot') === 'crypto_spot')
               .map((p) => p.symbol),
);
```
Membership is the UNION of reasons; `subscribe()` keeps working as the legacy reason; releasing one owner never drops another's symbol.
**Proof:** 6 tests (1-5 structural, 6 the engine fence), 6/6 failed pre-fix; related 85/85; the three baseline engine tsc errors shifted +25 lines.
**Scope limit:** refreshes the UNIFIED cache (signal birth, state sync, display). **The exit path reads the live-pricing adapter's own cache, so exit freshness is unchanged.** The RTB `readyToBuy` reason is still one-way.
**Residuals stated at your chunk-1 read:** (i) `unsubscribe()` no longer force-evicts, so no owner-independent eviction path exists; (ii) `asset_class` is `notNull().default('crypto_spot')` (`shared/schema.ts:1945`), so the `?? 'crypto_spot'` fires only for a storage projection that omits the column, which the cast would hide. **Step 8:** the health line's `open=` equals the CRYPTO open count, not the total.
**Attack:** reconcile-by-owner per tick instead of a subscribe/unsubscribe pair at seven delete sites.

---

## CHUNK 2 — P-7j and P-7h (the two that change what existing decisions see)

### P-7j `f61dcbae2` — the smoother moves once per new price, and re-warms after a restart
**Where:** `server/utils/adaptive-kalman.ts:87` `updateIfNew`, `:104` `warmFromHistory`, `:121` `applyObservation`, `:270-278` `getSmoothedPrice`; the single caller `signal-orchestrator.ts:2422`. D7; SIM S26; PR-A6.
```ts
const smoothedPrice = getSmoothedPrice(symbol, rawPrice, ER, VolNoise, cachedPrice?.lastUpdatedAt ?? undefined, closePrices);

updateIfNew(key, price, ER, VolNoise) {
  if (this.x !== null && key === this.lastObservationKey) return this.x;   // same observation: no movement
  const out = this.update(price, ER, VolNoise); this.lastObservationKey = key; return out;
}
warmFromHistory(closes, ER, VolNoise) {       // only when cold; quiet steps; ONE [9.3][REWARM] line
  if (this.x !== null) return 0; ... applyObservation(c, ER, VolNoise, true) ...
}
```
**Why `lastUpdatedAt` is a valid observation key — census of the unified cache's writers:** the price-cache REST polls (three, each a real read); `updateFromRest` (`live-pricing-adapter.ts`, after a real REST read); `updateFromWebSocket` via `updateCache` (WS ticks, the engine's REST fetch, the xStock mark); the unreachable v1 path. **Re-serves write only the adapter's private cache**, so they cannot advance the smoother.
**Proof:** 10 tests; against the pre-change sources 6 fail and 4 pass by design (regression guards); 41/41 with `adaptive-kalman.test.ts`.
⚠️ **Behaviour:** the crypto quant lane's smoothed price changes, and it sets that lane's levels until P-8c moves levels to the transactable side.
**Attack:** (1) **the re-warm source** — bar closes the orchestrator already holds, versus persisted state (stale after downtime, needs a store) or a cold flag (visible, but not a re-warm); the warm applies the current ER and VolNoise to every close, and suppresses per-step `[9.3][KALMAN]` lines so A-4's gain distribution is not polluted. (2) **A REST poll that returns an unchanged quote counts as a new observation** (the venue was asked again).

### P-7h `cdb953290` — the exit engine's direct Kraken query spends from the shared REST budget
**Where:** `server/services/market-data/rest-rate-limiter.ts:92` `takeToken`; NEW `server/services/market-data/engine-rest-fallback.ts:39` `classifyEngineRestFailure`, `:44` `resolveEngineRestFallback`; engine `active-execution-engine.ts:1568` (call), `:1604` (`restAgeExempt`), `:1629` (catch classification); `price-basis.ts:100` `AGE_EXEMPTION_BY_PRODUCER`; `buildPriceSkipAlertCopy` (`aee:172`) third branch. D7; A-9.4; your P-7h ruling (a), 16:27Z.
```ts
if (!deps.takeToken()) return { kind: 'skip', reason: 'rest_token_exhausted' };   // the venue is never asked
let ticker;
try { ticker = await deps.getTicker(restPair); }
catch (error) { return { kind: 'skip', reason: classifyEngineRestFailure(error), error }; }   // no refund
```
**Your three conditions:** (1) `rest_token_exhausted` and `rest_venue_rate_limited` are their own reasons, counted on the EVAL_EXIT line beside `restAgeExempt`; (2) `AGE_EXEMPTION_BY_PRODUCER` is total over producers and names exactly `kraken_rest_engine_fallback_mid/_last` as `fetch_fresh_by_construction`, counted where used; (3) there is no refund method, and the engine's catch never touches the limiter (test 11).
**Proof:** 12 tests + 3 copy tests; related 77/77. Mutations, each restored: venue called before the token → test 4; venue rate-limit pooled into `rest_failed` → test 6; engine given a token source that always says yes → tests 10-11; `takeToken` arming a cooldown → test 2; a token refusal taking the absence copy → the copy tests.
⚠️ **Behaviour:** an exit tick is skipped, under its own reason, when the 10-token bucket is empty.
**Residuals, stated:** a rate-limited re-serve is still written back with a fresh `cachedAt` and `source: kraken_rest`, so it passes the engine's 2 s window; its `observedAt` is honest (the `#951` fence, end to end) and the refusal is OBJ-8's crypto age check. No test harness drives `checkOpenPositions`; the refusal is proven on the extracted helper and the wiring by source fence.

---

## CHUNK 3 — P-7i, P-7d + P-7f, P-7e (record-only)

### P-7i `c501bded3` — the venue's real last trade is kept beside the midpoint
**Where:** `server/services/market-data/kraken-v2-translator.ts:56` (field), `:83`; tick event emits `kraken-websocket-adapter.ts:848` (v2: the translator's print), `:1142` (book: null), the v1 path (its raw `c[0]`); `live-pricing-adapter.ts:569` (quote carry at the cache write), `:887` (REST poller `c[0]`), `:1120` (`updateCache`); engine xStock mark (`EquityTick.raw.last`) and REST fallback (`_rest.lastTrade`). D7; `#952`; A-9.1 rows 1 and 4.
```ts
const lastTrade = typeof update.last === 'number' && Number.isFinite(update.last) && update.last > 0 ? update.last : null;
// updateCache: a write that carries no print keeps the row's pair, WITH its original receipt time
const _lastTradePrice = lastTradePrice ?? _prevRow?.lastTradePrice ?? null;
const _lastTradeReceivedAtMs = lastTradePrice !== null ? now : (_prevRow?.lastTradeReceivedAtMs ?? null);
```
**Proof:** 8 tests on two ticker frames captured live from Kraken's public v2 feed at 2026-09-11T17:03:37Z (ETH/USD discriminates: last 2576.65, midpoint 2576.63); 8/8 failed pre-change; related 156/156; tsc identical, which also shows every production caller of `updateCache`'s new required parameter was updated.
**Carried to P-8b:** a ticker frame repeats the last trade on every quote change, so "a trade goes strictly through" (D2) must detect a NEW trade, not read the `last` level.

### P-7d + P-7f `cf7394996` — one rule picks the touch price, and every age names its clock
**Where:** NEW `server/core/calculations/touch-price.ts:86` `selectTouchPrice`; pre-audit **STEP 3 RECORD — P-7f**; `scripts/analysis/b_price_side_p7f_entry_age_rung.sql`. D3; D6.
**The rule:** a valid, fresh book top if the book is ELIGIBLE; else the ticker's sides if valid and within the age; else refuse with both legs' reasons. Each leg's rules are `buildLevelBasis`'s, not a copy. Every quote carries `clockBasis` beside `ageMs`, named by the caller. A venue stamp ahead of our clock refuses as `age_unknown` — no skew tolerance invented. No caller yet (OBJ-8 wires it).
**P-7f's query:** no gate compares a re-served price's age to 15 s. The 15 s gate is xStock-only and reads the archive table's latest capture (`active-dispatch.ts:74`, `:181-182`); the 14.3 s rung is the crypto adapter's rate-limited re-serve; crypto entries gate on the book's age (5,000 ms). **Entries on `kraken_rest_rate_limited_reserve`: 0 of 109** closed trades since 2026-08-26; positive control: one `kraken_rest_poller` entry. The instrument that looks like an entry age (`opened_at − entry_observed_at_ms`) is not one — 22 of 24 crypto values negative — and was discarded.
**Proof:** 10 tests; mutations (ticker before book; eligibility ignored; age dropped; clock hard-coded) each caught.
⚠️ **For your ruling:** D6's knife-edge note pairs an xStock gate with the crypto re-serve sawtooth; the code has no such coupling. Raised here rather than edited in the consensus record.

### P-7e `92a78b05e` — a record-only check that our order book matches Kraken's own top
**Where:** NEW `server/services/market-data/book-ticker-disagreement.ts:69` `observeBookTickerPair`, `:35` `BOOK_TICKER_ALERT_ARMED = false`; hook `kraken-websocket-adapter.ts:861`; `routes.ts:8203`. D3; A-9.7 r6.
**The rule, ported from the validated probe:** aligned = the book last updated within 250 ms of the ticker frame; disagree = one tick or more on either side (the venue's published tick); fire once at the third consecutive disagreeing aligned pair; an unaligned frame neither extends nor resets; crossed or locked books excluded; no tick = not judged. Crypto only. A fire logs `[P-7e][BOOK_TICKER_DISAGREE] RECORD-ONLY`; the alert copy names our book maintenance as the subject.
**Proof:** 8 tests: negative control (1,000 identical pairs → 0 disagree, 0 fires) and the one-tick injection (+1 tick on every 5th of 1,000 → 200 of 200 detected, 0 invented, 0 fires). Mutations (fire on the first disagreement; unaligned resets; two-tick threshold; armed; hook compares the ticker with itself) each caught. Related 213/213.
**Attack:** the one-directional alignment (the probe's form) and the arm switch as a reviewed code constant.

---

## STEP-2 CONDITIONS, CARRIED

1. **OBJ-8a** does not deploy until F-G-2's window is discharged against its own §4 rule (resolve `cbb55dc9`). Nothing in OBJ-7 touches it.
2. **A-9.5 citations, RE-DERIVED AT HEAD.** The carry block is byte-identical to the Step-2 ref `9ceaf73e1`, shifted +68 lines by OBJ-7: F-G-2 OBJ-0 comment `aee:2747-2748` (was `:2679-2680`) · `fg2Shadow` carry `:2752` (was `:2684`) · B-XSTOCK-FEED-SANITY comment `:2753-2754` (was `:2685-2686`) · `bookState` carry `:2753-2758` (was `:2685-2690`). Re-derive again at P-8a.
3. **`#943`:** your closing read (17:23Z) discharged your condition 2 — OBJ-7 is clear to deploy on that gate.
4. **`#951`:** read-then-deploy before OBJ-7 deploys; resolve `0db25f1d`, never ack.

## FOUND IN STEP 3, FOR PLACEMENT

- **Known, not new: the unified cache's crypto `price` is a MIXTURE of last trade and midpoint** (`1-system-manual/PRICING_DATA_ARCHITECTURE.md` F1, the 09-08 Codex review): its REST poller stores REST `c[0]` as `price` beside midpoints from the other writers, with no kind recorded. Not referenced in 3n's scope, decisions or pre-audit. P-8c's move of levels to the sides removes its effect on LEVELS; the smoother (kept as a feature, D4) is still fed the mixture. **Proposed: the record-only half — kind and last trade on the unified row, with a capture stamp — lands with P-8c.**
- **P-8b** must detect a new trade (above).
- **The skew between Kraken's clock and ours** must be measured before a decision site uses the venue clock.
- **D6's knife-edge note** (above).

## STEP 4 r2 — CHUNK 1: YOUR VERDICT AND WHERE EACH ITEM LANDED

| item | fix | where |
|---|---|---|
| **BLOCKER-1** — a rejected unsubscribe was silently discarded | every unsubscribe carries a `req_id`; the reply is matched to what we asked; a rejection logs `[P-7b][WS_UNSUB_REJECTED]` with channel, symbols, depth and error; `Unsub OK` now prints channel and depth | `kraken-websocket-adapter.ts` `handleV2SystemMessage`, `trackUnsubscribe`, both unsubscribe sends |
| **BLOCKER-2** — OBJ-7's deploy splits F-G-2's crypto window under A4 | recorded in F-G-2 §4a as the fourth event; the split sha is written there at Step 6 before the restart | `F_G_2_PROGRESS_REPORT.md` §4a; Step 6 prep |
| P-7b: pin the `softResubscribe` ordering | comment at the clear block, plus a test that the unsubscribe carries the granted depth | adapter; test 8 |
| P-7b: a mixed-depth test | two symbols at 10 and 25 → two messages, partitioned by depth | test 7 |
| P-7b finding: cleanup before the book send | the send moved below the local cleanup | adapter; test 10 |
| P-7c (a): `venue_close` read as live | `isLiveObservationBasis` replaced by `isLiveTouchBasis` over a total `LIVE_TOUCH_BY_BASIS` | `price-basis.ts` |
| P-7c (b): the header's false kind invariant | reworded: the suffix states the kind where present; `kraken_rest_poller` is not split | `price-basis.ts` header |
| P-7c (c): D3 enumerates four bases | D3 amended with the four added values and the `ticker_bbo` era-boundary slot | `PRICING_DECISIONS_2026-09-11.md` D3 |
| P-7g residuals and the Step-8 check | stated under P-7g above | this file |
| chunk-2 carry: two REST governors | stated in the chunk-2 dispatch | — |

Also recorded from your F-G-2 closing read: §0b in `F_G_2_PROGRESS_REPORT.md`, and the window-sizing item placed on P-8a.

## THE ASK — one gate per dispatch

Three dispatches, one per chunk. Each asks for a ruling on that chunk's commits only, at the ref, with this file as the context.
