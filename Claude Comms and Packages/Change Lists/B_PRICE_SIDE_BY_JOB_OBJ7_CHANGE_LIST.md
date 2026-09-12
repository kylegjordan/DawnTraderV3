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
✅ **Ruled at Step 4 (chunk 3 (1)):** the absence claim is confirmed, and D6's knife-edge note is corrected in its body. It named the wrong gate: the sawtooth measures against the crypto exit path's 2 s `cachedAt` window, which it passes by construction, and the refusal is OBJ-8's crypto age check (scope 8g).

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

- **Known, not new: the unified cache's crypto `price` is a MIXTURE of last trade and midpoint** (`1-system-manual/PRICING_DATA_ARCHITECTURE.md` F1, the 09-08 Codex review): its REST poller stores REST `c[0]` as `price` beside midpoints from the other writers, with no kind recorded. Not referenced in 3n's scope, decisions or pre-audit. P-8c's move of levels to the sides removes its effect on LEVELS; the smoother (kept as a feature, D4) is still fed the mixture. ~~Proposed: lands with P-8c.~~ ✅ **Ruled at Step 4 (chunk 3 (2)): NOT with P-8c. It goes ahead of it as P-7k (scope 7k), record-only: the baseline must be measured while the mixture still feeds levels, and the mixture outlives P-8c (the smoother, MCE and the VTS anchor all keep reading it).**
- **P-8b** must detect a new trade (above).
- **The skew between Kraken's clock and ours** must be measured before a decision site uses the venue clock.
- **D6's knife-edge note** (above) — ✅ corrected in D6's body at Step 4.

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

## STEP 4 r2 — CHUNKS 2 AND 3, AND CHUNK 1 r2's CONDITIONS: WHERE EACH ITEM LANDED

### Chunk 2 — your verdict 18:08Z, CHANGES-NEEDED

| item | fix | where | proof |
|---|---|---|---|
| **BLOCKER-1** — the re-warm was stiff and lagged | Option (a). The warm's input is now stated: the orchestrator's **60-minute** bars, up to 720 (`signal-orchestrator.ts:2395`), fed through a per-step `Q`. At the end of the warm `P` is inflated so the first live observation receives `REWARM_FIRST_LIVE_GAIN = 0.9` (K = P/(P+R), so P = R·g/(1−g); it never lowers P), and the gain then decays on its own. `[9.3][REWARM]` prints `rawPrice` and `gapFrac = abs(x − raw)/raw`. `measurementNoise(ER)` is the one definition of R, shared by the update and the warm. ⚠️ **Attack the 0.9:** a model constant beside the R clip and the Q floor, chosen so the prior keeps 10% | `adaptive-kalman.ts` `REWARM_FIRST_LIVE_GAIN`, `measurementNoise`, `warmFromHistory(…, liveObservation)`; `getSmoothedPrice` passes `price` | p7j 11 (first live K = 0.9); 12 (720 hourly closes at 100, then a live 105, lands at or above 104.5 — r1 gave about 100.65); 13 (the REWARM line carries both numbers); 9 pins no closes, no inflation. Against r1: 11-13 fail, and 6-7 fail because their reference now carries the inflation |
| **BLOCKER-2** — the copy attributed the streak to the last tick | The engine keeps the streak's reason histogram (`_priceSkipReasons`: same key and lifecycle as the streak, cleared only with it on a venue price, never on a change of reason). `buildPriceSkipAlertCopy` branches on the DOMINANT reason, prints its share (`39 of them (98%)`; title `(39 of 40 ticks)`) and lists the rest. A tie goes to the reason the streak ended on. The last tick's `detail` prints only under its own reason. `PRICE_SKIP_ESCALATION` keeps its prefix and appends `reasons=` and `dominant=` | `active-execution-engine.ts` `buildPriceSkipAlertCopy`, `_recordPriceSkip`, the reset beside `_priceSkipStreak.delete` | NEW `b-price-side-p7h-skip-streak-reasons.test.ts` drives `_recordPriceSkip` 39 times with `rest_no_data`, then once with `rest_token_exhausted`, and reads the raised alert (absence copy, `39 of 40 ticks`); a source fence pins the single clear site. 5 copy tests. Against r1: both engine tests and 4 of the 5 copy tests fail; the single-reason test passes on r1 by design |
| **FINDING-1** — `restAgeExempt` is identically `withRestPrice` | Stated at the object: on that branch the counter cannot differ, and it does not count exits the exemption saved; its use is OBJ-8's age check | `aee` comment above `restAgeExempt++` | — |
| **FINDING-2** — the dedupe key has no reason term | `HOME: B-PRICE-SIDE-BY-JOB OBJ-8 item 8h, owner CC-C, placed in PHASE_19_PLAN at row 3n (scope §7.3 row 8h; pre-audit P-8h), after 8g`. Proposed shape: the copy's fact class in the key, with the `price-skip-<mode>-<symbol>` prefix kept | scope; pre-audit | — |
| **FINDING-3** — token exhaustion is plausible when WS is dark | Step 8: per cycle, `restTokenExhausted` against `tokenOnlyBlockedCount` and `blockedCount`, with `price-cache.ts`'s own governor beside them, read against Kraken's published public-REST limit | Steps 5-8 plan | — |
| **FINDING-4** — residuals announced, not disposed | (a) The re-serve passes the 2 s window: `HOME: OBJ-8, owner CC-C, PHASE_19_PLAN 3n`. **No OBJ-8 row carried the refusal scope 7h promised**, so it is now **8g / P-8g, the crypto exit age check**. (b) No harness drives `checkOpenPositions`: folded into Step 7; the EVAL_EXIT counters and a real escalation's `reasons=` and `dominant=` are the live proof. (c) The two REST governors: a review scheduled at Step 8, with FINDING-3. (d) P-7j sets the quant lane's levels until P-8c: already homed at P-8c | scope 7h, 8g; pre-audit P-8g; Steps 7-8 plan | — |

### Chunk 3 — your verdict 18:14Z, APPROVED with three conditions and a carry

| item | fix | where | proof |
|---|---|---|---|
| **C1** — the pair split on `undefined` | One predicate, `lastTradePrice != null`, decides both halves in `updateCache`; the quote write uses the same predicate | `live-pricing-adapter.ts` `updateCache`; the quote write | p7i 9 (an `undefined` keeps the prior pair with its original stamp) and 10 (a three-argument write stores neither half); both fail on r1 |
| **C2** — the seed erased the pair | `seedLastKnownGoodPrice` carries the row's pair with its original receipt time; the `CachedPrice` docblock names all three writers | the adapter's seed; `CachedPrice` docblock | p7i 11 fails on r1; 12 (a row that never printed) passes on r1 by design |
| **C3** — one `maxAgeMs` for both legs | Stated at the object, and carried onto P-8a: per-leg ages, or the commit states, with the number, that one ceiling governs both | `touch-price.ts` `TouchPolicy.maxAgeMs`; pre-audit P-8a | — |
| **(1)** D6's knife-edge | Corrected in D6's body with your wording and the P-7f query; this file's two notes marked ruled | `PRICING_DECISIONS_2026-09-11.md` D6 | — |
| **(2)** F1's mixture instrument | Placed as **P-7k / scope 7k**: record-only, deploys ahead of OBJ-8, in P-7i's vocabulary and under its carry rule; not a gate on OBJ-7's deploy. Built next and reviewed as its own gate | scope 7k; pre-audit P-7k | — |
| **(3)** the carry rule, unbounded in age | Kept, and the boundary is written into the docblock: no write-side age cut; the reader applies its own ceiling (`#546`) | adapter docblock | — |
| `:572` raw `symbol` against `:1124` normalised key | Fails to absence, the safe direction; checked when P-7k gives the unified row these fields | P-7k | — |
| P-7e Step-8 notes | `aligned` beside every fire count (the crypto book covers open positions only, F2); once armed, resolve, never ack | Steps 7-8 plan | — |

### Chunk 1 r2 — your verdict 18:31Z, APPROVED with three conditions; BLOCKER-2 carries to Step 6

| item | fix | where | proof |
|---|---|---|---|
| **C1** — `LiveTouchBasis` was hand-written | Derived: the table is `Object.freeze({…} as const satisfies Record<PriceBasisOrNone, boolean>)`, and `LiveTouchBasis` is a mapped type over its `true` keys | `price-basis.ts` | p7c 7/7; tsc unchanged |
| **C2** — `isLiveTouchBasis` has no caller | **Pre-placed for OBJ-8's decision-side basis stamp; no non-test caller until then.** Stated here and at the object | `price-basis.ts` docblock | — |
| **C3** — F-G-2 §0 contradicted §0b | §0's rate is marked SUPERSEDED in its body, with both populations. §0's is the 7 days before the window, when the arm existed for only about 2.3 days (deployed 2026-09-02T08:49:47Z), so about 3 stamped closes a day, not 1. §0b's is the armed arm since 09-02, about 5 a day | `F_G_2_PROGRESS_REPORT.md` §0 | — |
| **BLOCKER-2** carry | Step 6 fills §4a's and D3's slots with the sha and UTC, and commits that, before the restart; Step 8 shows them filled | Steps 5-8 plan | — |
| `bookDepth` is never deleted | **No work now (disposition 5), with the citation.** Every production book subscribe asks depth 10 (`kraken-websocket-adapter.ts:1516-1518`); the only other request is the depth-1 path below, which never reaches the ACK. So every recorded depth is 10, and a stale entry names the depth being unsubscribed. **Re-opened by the first change that requests a second depth**, which must clear the entry on unsubscribe in that same change | — | — |
| the depth-1 path (`switchToBookChannel`, `:2730`): does it fire, and is it rejected? | **Measured: it does not fire, and it cannot.** (i) `[I7-WS-G][CHANNEL_SWITCH]` = 0 across all 15 `out` files on staging (`out.log` plus 14 rotated; the oldest closed 2026-09-10T05:25Z); positive control, `Sub OK:` = 129 in the same files. (ii) The sibling branch `[I7-WS-G][RESUBSCRIBE]` = 0 in 13 of those 15 files (the two oldest not read), and `[I7-WS-G][UNSTABLE]` = 0 in the error logs for 2026-09-09 onward, so `triggerCorrectiveAction` did not act in that reach. (iii) Every `Sub Error:` in the error logs rotated 2026-09-04 onward is `Already subscribed` (316 of 316); no depth rejection. (iv) The mechanism: the gate is `internalSymbol.includes(hint.replace('/', ''))` (`:2713-2719`), and `normalizeToInternalSymbol` returns `BASE/QUOTE` with the slash (`kraken-symbol-resolver.ts:90-116`), so for all four hints, e.g. `'TIA/USD'.includes('TIAUSD')`, it is false. Unreachable by construction. (v) Kraken's v2 book documentation: depth is *one of `10`, `25`, `100`, `500`, `1000`*, so a depth-1 request is invalid by specification. **Proposed rule-18 disposition (b), for your ruling:** delete `switchToBookChannel`, `scheduleBookChannelRevert` and the `prefer_book` hint, `HOME: OBJ-8 item 8i, owner CC-C, PHASE_19_PLAN 3n`, with the rule-18 census at the deletion | scope 8i; pre-audit P-8i | — |

**Proof for all three:** 18 related test files, 263/263. tsc 377, identical file+code multiset to chunk 1 r2's.

## STEP 4 r3 — CHUNK 2 r2's FIVE CONDITIONS, AND YOUR TWO RULINGS

Your verdicts: chunk 2 r2 APPROVED with five conditions (18:57Z); chunks 3 and 1 r2 APPROVED, all six conditions discharged, BLOCKER-2 carried to Step 6 (19:03Z). None of the five gates the deploy; they are folded in before Step 5 so CI grades one head.

| condition | fix | where | proof |
|---|---|---|---|
| **1** — the 0.9's derivation and its cadence dependence | Written into `REWARM_FIRST_LIVE_GAIN`'s docblock with your numbers: `Q_warm = Q_live x 3600/t`; 0.85 / 0.75 / 0.64 at 15 / 30 / 60 s; 0.9 at about 8.5 s; 0.64-0.85 at the `#951` sawtooth; the fail-safe direction; the falsifier (the 2 s `openTrade` lane makes it about 0.97); one constant is exact at one (R, Q, t) only; and `updateCount` includes the warm's steps (diagnostics only) | `adaptive-kalman.ts` | — |
| **2** — pin the decay length | Test 12 computes the steady-state gain from `P^2 = Q(P + R)` and asserts the trajectory: 0.9 at observation 1, 0.479 at 2, and the 12th live observation is the first within 10% of steady state | p7j test 12 | passes on r2 by design (one ER throughout); it pins the number |
| **3** — lazy inflation | The warm only sets `pendingRewarmInflation`; the next `applyObservation` inflates `P` with its own R; `reset()` clears the flag. The REWARM line prints `firstLiveGain=0.9` instead of a P it has not applied | `adaptive-kalman.ts` | test 14 (warm at ER 0.95, live read at ER 0.05: first live K = 0.9) **fails on r2**, where K was about 0.39; test 15 (a reset clears the flag) passes on r2 by design |
| **4** — the Step-8 expectation, before the read | `gapFrac` distribution at the restart, and `K` at live observations 1 and 12 per symbol. Expected: K = 0.9 at 1; within 10% of steady state at 12; **median `gapFrac` at most 0.01**; above that is a scope decision, not a tuning one | Steps 5-8 plan | — |
| **5** — class versus reason | Noted at the object (`buildPriceSkipAlertCopy`'s `reasonCounts` docblock, with the 15/13/12 case); class-first ranking with that fixture folded into **scope 8h / pre-audit P-8h**; the fence is symmetric: the streak's delete site is pinned at one as well | `aee` docblock; scope 8h; skip-streak test 2 | — |

| ruling | recorded |
|---|---|
| **1** — the depth-1 path: rule 18 (b) APPROVED as 8i, with three census conditions (the `currentChannel` field and its diagnostics reader; the channel-hints route's new shape with `low_liquidity` kept; the RESUBSCRIBE-only behaviour change named) | scope 8i and pre-audit P-8i, in their bodies |
| **2** — `bookDepth`: disposition 5 AGREED, with the re-open trigger as written | this file, the chunk 1 r2 table |

**Proof:** control against the r2 smoother at HEAD: 1 of 15 p7j tests fails (14). After: 20 related test files, 291/291. tsc 377, identical file+code multiset.

## CHUNK 4 — P-7k (record-only; placed at Step 4 by your chunk-3 ruling (2))

### P-7k — the unified price cache says which quantity each price is
**Where:** `server/services/price-cache.ts` — `CachedPrice.markKind` (`'mid' | 'last' | null`), `lastTradePrice`, `lastTradeReceivedAtMs`; `carryLastTrade` (P-7i's carry rule, one predicate for both halves); the three REST poller sites; `updateFromWebSocket(…, markKind, lastTradePrice)` and `updateFromRest(symbol, price, markKind, lastTradePrice)`, both new parameters REQUIRED; `logHealthLine` (extracted from the 60 s interval), `noteLevelRead`, `getMarkKindCensus`. `price-basis.ts` `MARK_KIND_BY_PRODUCER`, total over `PriceProducer`. Callers: `live-pricing-adapter.ts` REST leg (`markKindOf(bid, ask)` and REST `c[0]`) and `updateCache` (`markKindOfProducer(producer)` and this write's print); `kraken-websocket-adapter.ts` v1 writer (`'last'`); `signal-orchestrator.ts` counts its level-setting read.

**The writer census — F1's three writers, at HEAD:**

| writer | `price` it stores | `markKind` stated | print |
|---|---|---|---|
| the cache's own REST poller — `refreshBucket`, `getPrice`, `getBatch` (3 sites) | REST `c[0]` | `'last'` | `c[0]` |
| `updateFromRest`, called by the `live-pricing-adapter.ts` REST leg | a REST midpoint, or `c[0]` on a one-sided book | `markKindOf(bid, ask)` | `c[0]` |
| `updateFromWebSocket`, called by `updateCache` (WS ticker, book, xStock mark, engine REST fallback) | the producer's mark | `MARK_KIND_BY_PRODUCER[producer]` | the write's own print |
| `updateFromWebSocket`, called by the v1 writer (unreachable, `#742`) | v1 `c[0]` | `'last'` | `c[0]` |

Carry: a write with no print keeps the row's pair with its original stamp; the pair is unbounded in age by design (your (3)).

**The instrument:** the existing HEALTH line (every 60 s) gains `rowKind=mid:N,last:N,unknown:N`, a snapshot of cache keys by kind (alias keys included, as in `cacheSize`), and `levelReadKind=mid:N,last:N,unknown:N`, the kind of each price signal generation read to set levels since the previous line, reset at every line so each line is one interval. Nothing parses the HEALTH line: a whole-tree grep finds no reader outside `price-cache.ts`.
⚠️ **Stated limits:** `levelReadKind` counts the active crypto quant lane's read only (`signal-orchestrator.ts`); the VTS level lane reads the same rows, so its mixture shows in `rowKind`, not in a read count. The crypto pattern lane (levels from a bar close) and the xStock active lane (`asset_classes/xstock_spot/eval-cycle.ts`) read no cache row and appear in neither field (added at the chunk-4 hold). The `:572` raw-symbol against `:1124` normalised-symbol difference you flagged is in the adapter's private cache, not this row; it is unchanged and still fails to absence.

**Proof:** 11 tests (`b-price-side-p7k-cache-mark-kind.test.ts`): each writer's kind and print; the carry with its original stamp; an `undefined` print splits nothing; a source fence on the three poller sites with its control; the adapter hop for a `_mid` and a `_last` producer; the adapter REST leg; the table total over `BASIS_BY_PRODUCER`'s keys and agreeing with every suffix; the HEALTH line's interval reset; fences on the orchestrator's count and the v1 writer. **Against the pre-P-7k sources: 11 of 11 fail.** After: 20 related test files 289/289, and the one other test file that touches the cache 25/25. tsc 377, identical file+code multiset.
⚠️ **Behaviour:** none; no decision reads the new fields. The HEALTH line grows two fields.
**Attack:** (1) whether `MARK_KIND_BY_PRODUCER` belongs beside the producer union in `live-pricing-adapter.ts` instead; (2) whether the orchestrator's read is the right place to count what fed levels; (3) the REST poller's fixed `'last'`: it stores `c[0]` whatever the sides are, so its kind is fixed, not decided per read.

## STEP 4 r2 — CHUNK 4's CONDITIONS, AND STEP 4 r3's RESIDUALS

Your verdicts: chunk 4 APPROVED with four conditions (19:11Z; board `Review` unset until they land); Step 4 r3 APPROVED with three residuals, none gating the push (19:15Z).

### Chunk 4

| condition | fix | where | proof |
|---|---|---|---|
| **C1** — the count sat above the invalid-price guard | `priceCache.noteLevelRead(cachedPrice)` moved below the guard, so a present row with price 0 (a poller row, stated `'last'`) is not counted | `signal-orchestrator.ts` | test 10 now asserts the call sits after the guard and before the smoother starts, and not above the guard; **fails on r1** (the pre-C1 orchestrator). The first draft used a 400-byte distance and failed on the fixed code too (411 bytes on the CRLF working tree); replaced by the structural marker |
| **C2** — the population | `levelReadKind` restated where it lives: the kind at entry to each crypto quant-lane evaluation with a usable price, an **upper bound** on level-setting reads, with the direction named (the true level-setting mixture is likely more midpoint-heavy); the two fields cover different populations and are never numerator and denominator | `price-cache.ts` `logHealthLine`, `levelReadKinds`, `noteLevelRead` docblocks | — |
| **C3** — a third lane | the stated limits now name the crypto PATTERN lane: levels from a bar close (`signal-orchestrator.ts:2224`, `:2286`, `:2293-2295`, corrected at the hold), no cache row read, in neither field; at the hold, the xStock active lane (`asset_classes/xstock_spot/eval-cycle.ts`) is named too, and not expressible as `mid`/`last` (`venue_close`, OBJ-8's) | `price-cache.ts` `noteLevelRead` docblock | — |
| **C4** — two evaluations of the kind and the print | the REST leg computes `_restKind` and `_lastTradeOrNull` once; the unified-row write and the returned result both use them | `live-pricing-adapter.ts` REST leg | tsc unchanged; p7i test 6 and p7k test 6 cover both uses |
| CI at the ruled ref | run `34636371003` on `cc88748f7`: TypeScript Check, Test Suite, Build, Docker Build all success, per job | — | — |

**Residuals for the completion report, named as you asked:** (1) a reader joining a stored producer to `MARK_KIND_BY_PRODUCER` gets `null` for `kraken_rest_poller` while that write's row states `'mid'` or `'last'`; the join site must ask the row. (2) P-7i's carry rule has two implementations, `carryLastTrade` (`price-cache.ts`) and the inline `_hasPrint` triple (`live-pricing-adapter.ts` `updateCache`); they agree today (`!= null` both).

### Step 4 r3 residuals

| residual | fix | where | proof |
|---|---|---|---|
| **FINDING-1** — condition 4 not yet evaluable | The Step-8 comparator is each symbol's OWN steady-state K from the R and Q on its 12th KALMAN line; the population is symbols with a REWARM line in the first 10 minutes after the restart; n-floor 20, below which the result is a count, not a distribution; the REWARM lines and each symbol's first 12 KALMAN lines are copied from `out.log` to an evidence file within 30 minutes of the restart | Steps 5-8 plan | — |
| **FINDING-2** — test 12 hard-coded R and Q | `measurementNoise` is exported and `processNoise` added (the Q formula, now one definition used by `applyObservation`); test 12 derives R and Q from them, and says `toBe(12)` is a knife-edge pin (observation 11 at 0.142795 against 0.142332) | `adaptive-kalman.ts`; p7j test 12 | against the HEAD smoother test 12 fails only because `processNoise` is not exported there, which says nothing about behaviour |
| **FINDING-3** — `restoreState` left three fields | `restoreState` clears `pendingRewarmInflation`, `lastObservationKey` and `warmedFromCloses` | `adaptive-kalman.ts` | test 16 (a warm then a restore: the restored covariance governs the first read, the warm count is 0, a key seen before the restore still advances) **fails on the HEAD smoother** |

**Proof:** 20 related test files, 292/292. tsc 377, identical file+code multiset.

## STEP 4 — CI FOR THE CHUNK-4 HOLD, AND ITS TWO RESIDUALS

- **CI on a ref carrying both fix commits:** run `34639582983` on `3124e2d3a`, per job: TypeScript Check, Test Suite, Build, Docker Build all success. `e14053773` and `14442f622` are both ancestors of `3124e2d3a`, and nothing between `14442f622` and `3124e2d3a` touches `server/`, `shared/`, `client/`, `drizzle/`, package files, test config or CI config (six files: Langston-memory infra scripts, one analysis script, session memory). The run on `14442f622` itself (`34638551140`) was cancelled by later pushes.
- **Residual 1:** the pattern lane's levels are at `signal-orchestrator.ts:2293-2295`, not `:2291-2293`; corrected in the `noteLevelRead` docblock and in this file.
- **Residual 2:** the xStock active lane is a third level-setting lane outside the counter: `asset_classes/xstock_spot/eval-cycle.ts` builds entry, stop and target (`:722-726`, `:814-818`, `:1193-1197`) and contains no `priceCache`, `getCachedPrice` or `noteLevelRead` reference (positive control: the same search finds three `getCachedPrice` lines in `signal-orchestrator.ts`). Named in the docblock and in this file.

## STEP 8 PRE-REGISTRATION — the P-7j re-warm check (written 2026-09-11, before any capture)

Your chunk-4 hold asked for the tolerance and the approximation's direction in the plan before the capture.
- **The comparator** is each re-warmed symbol's INSTANTANEOUS-parameter steady state, from the R and Q on its 12th `[9.3][KALMAN]` line: P = (Q + sqrt(Q^2 + 4QR)) / 2, K = P / (P + R). It is not the filter's actual steady state over observations 1-12, and the sign of the gap between them is not fixed; it depends on how R and Q moved.
- **Tolerance:** K at observation 12 within x1.1 of the comparator (test 12's).
- **Scope:** only symbols whose R and Q each stayed within 10% of their observation-12 values across observations 1-12. The rest are excluded and counted, because no single steady state exists for them.
- **Population and floor:** symbols with a `[9.3][REWARM]` line in the first 10 minutes after the restart; n-floor 20 in scope.
- **PASS:** at least 80% of in-scope symbols meet the tolerance. **FAIL:** fewer than 80%. **Below the floor:** a count, no verdict.
- **Also expected:** K = 0.9 at observation 1 for every re-warmed symbol, and median `gapFrac` at most 0.01; above that is a scope decision, not a tuning one.
- **Capture:** every REWARM line and each re-warmed symbol's first 12 KALMAN lines, copied from `out.log` to an evidence file within 30 minutes of the restart.

## STEP 6 — DEPLOY NOTE (one restart, two batches) — the OBJ-7 half, written before the restart

**Rulings (Langston, 2026-09-11), in words:** one restart with two named boundaries stands (19:39Z, to CC-B), with its conditions 1-5 plus 6 and 7 (19:48Z, to CC-C). The 18:17Z sequencing ruling is discharged, because its premise, an unmeasured shared resource, is now measured from both directions. The 19:28Z migration hold and its four conditions are vacated; CC-B stood the hold down without committing it. The 19:30Z request is satisfied by CC-C's runtime measurement ("discharged on its own first disjunct", 19:51Z). CC-B's half: `Change Lists/B_XSTOCK_FEE_CONTRACT_CHANGE_LIST.md` §9.

**The sha:** `b597f1bf210a954e1031e75eb939e5f75483237e`, CI 4/4 per job (run `34640169287`: TypeScript Check, Test Suite, Build, Docker Build). `dt-deploy --by cc-c`, invoked no earlier than 20:05Z and only after CC-B's baseline commit lands. Staging before the deploy, read at 19:52:07Z: `a5273ad6d387ef5a7cc453ca788c970818ba8c87` (deployed 16:24:47Z by cc-infra), clean worktree, no deploy lock; that is the rollback reference. **Deployed:** `dt-deploy` reported OK (sha live, engine resumed, identity asserted; `dist/BUILD_SHA` equals the sha). The deploy record's `deployed_at` is `2026-09-11T20:09:47Z` (`deployed_by_claimed=cc-c`), the named boundary for both batches. In the chain, `db:migrate` applied exactly one pending migration, `2026-09-11-b-xstock-fee-contract.sql`, at 20:09:36Z (827 ms), and `pm2 restart` ran at 20:09:37Z; the P-7j capture window starts there, because re-warm lines begin at process start, ten seconds before the record is written. CC-B's frozen baselines landed at `75ca497860edc3f72126cdce785f1f6cb81650b6` before the restart (verified on origin by ancestry).

| boundary | class | what changes at this sha | windows it starts or splits |
|---|---|---|---|
| OBJ-7: the exit-mark cadence (P-7a best-bid/offer ticker) and the exit leg's REST budget (P-7h) | crypto | the crypto exit trigger's ticker cadence and tick availability | F-G-2's crypto window under A4 (§4a filled with this sha before the restart); D3's `ticker_bbo` era (filled with this sha) |
| B-XSTOCK-FEE-CONTRACT: the fee and the epoch | xStock | xStock fees 0.008 / 0.004 to 0.0010 / -0.0002; xStock calibration epochs +1; `cost_model` deleted | CC-B's P8 and Arm B start here; `#951`'s xStock arm splits here; any xStock outcome aggregate spanning this sha is two populations |

**The cost of one boundary, named (Langston 19:39Z):** it buys no attribution between the fee change and OBJ-7. The pre-registered P8 and Arm B criteria are insulated (p0 frozen immediately before; both decision sites stay `'mid'`), so their PASS or FAIL is safe; anything unexpected in the window is unattributable, and neither "it was OBJ-7" nor "it was the fee" is available.

**The coupling question, discharged:**
- **The shared REST limiter has THREE production sites:** `check()` at `live-pricing-adapter.ts:762`, inside `fetchFromKrakenRest`, whose only caller `fetchLivePrice` returns every xStock symbol at the class gate (`:628`) above it; `takeToken()` at `active-execution-engine.ts:1611`, in the non-xStock branch of the engine's pricing split; and the authenticated diagnostics routes, `GET /api/diagnostics/8.8.5/rate-limiter` (`routes.ts:10962`, `getStats()`) and `POST /api/diagnostics/8.8.5/reset-rate-limiter` (`routes.ts:10981`, `reset()`), which is class-agnostic and can only refill the bucket. Earlier dispatches counted one or two; the third site does not confound the xStock arms.
- **Runtime:** the limiter's 25 symbols across 206,623 checks (2026-09-10 03:28:51Z to 2026-09-11 19:32:59Z) meet the xStock gate's 10 symbols in 0 and the 147 traded xStock symbols in 1, `DASH/USD` (`scripts/analysis/b_price_side_p7h_limiter_class_census.sh` and `.py`). That window bounded the sample, not the population, so condition 6 below uses a static census.
- **Residual, stated not closed:** the discharge rests on the resolver and the stored `assetClass` being right for every xStock symbol. A mis-resolved xStock position fails loudly (a skipped tick and one spent token), never with a contaminated xStock mark. The resolver is not proven.

**CONDITION 6 — the alias exclusion, re-derived by CC-C against the full xStock universe before the restart (19:54:58Z):** Kraken's live `AssetPairs` (1,449 pairs; 666 distinct wsnames ending `/USD`) intersected with staging's `xstock_spot_universe` (498 rows, 498 distinct symbols) on the exact cache key gives 17 symbols, identical to Langston's 19:48Z census: `A` · `ADI` · `CAT` · `CVX` · `DASH` · `EDU` · `ES` · `IR` · `MET` · `OPEN` · `PEP` · `STRK` · `STX` · `SUI` · `T` · `WELL` · `WEN`, all `/USD`. Translating XBT and XDG to the internal BTC and DOGE adds none. Control: `DASH/USD` is in both lists. **Exclusion form (Langston 19:51Z):** only the `(symbol, xstock_spot)` rows of these 17 leave P8's and Arm B's verdict counts, until `#1024` lands; crypto-class rows stay in; the excluded n is published beside every verdict. **Counting convention:** `DASH/USD` has 4 closed trades across both classes, 2 `xstock_spot` and 2 `crypto_spot`. Script: `scripts/analysis/b_price_side_alias_census.py` and `.sh`; output: `Batch Completion/B_PRICE_SIDE_BY_JOB_EVIDENCE/obj7_pre_restart_alias_census_2026-09-11T1954Z.txt`.

**CONDITION 7 (CC-B's arms, recorded so this half is complete):** the excluded set's historical share is 3 of 274 xStock closes, 1.09%, above P8's 1.0% threshold. If restoring the excluded rows could flip either arm, that arm is INCONCLUSIVE-EXTEND, never PASS on the remainder.

**Langston's residual on the census, stated not closed:** it reads the venue's live catalog, not the scanner's stored universe, and the universe's delisted rows are not filtered; over-inclusion is the safe direction. Re-run it if `#1024` slips past this window.

**Condition 6, re-derived independently by Langston (20:02Z):** 17, the same 17, every supporting number reproduced off live Kraken and staging; the exclusion form as amended, and the `DASH/USD` convention (4 closes, 2 xStock and 2 crypto; only the xStock two leave) confirmed. His residual, stated beside the excluded n and not chased: the Kraken side is the live catalog at 19:54Z applied to a window that opened earlier, so a pair Kraken delisted since then collided then and is invisible now. That is the under-exclusion direction, so it matters only if a verdict lands near its threshold, and then it is a re-derivation, not a pass. The universe side is historically complete (rows are flagged `is_delisted`, never deleted; all 17 carry `first_seen_at` 2026-05-21), and 3 of the 17 (`EDU`, `SUI`, `WEN`) are already delisted in the universe, so taking the whole table is the conservative choice.

**#951 terminal read, at the pre-deploy build `a5273ad6d` (19:52:14Z), with `scripts/analysis/b_price_age_truth_terminal_read.sql`:** population 82; producers `kraken_ws_book_mid` 53 (53 carry `exit_observed_at_ms`), `kraken_equities_ws_mid` 25 (25), no producer 4 (0); touched arm 0; reserve rows 0; every fail count 0. **The stopping rule binds:** the touched arm is empty at the third read (44, then 66, then 82 rows), so the progress report converts rather than extends. The proposed conversion below goes to Langston after the restart, and gate `0db25f1d` is resolved when the conversion is written. Output: `Batch Completion/B_PRICE_SIDE_BY_JOB_EVIDENCE/obj7_pre_restart_951_terminal_read_2026-09-11T1952Z.txt`.

**Proposed #951 conversion, drafted before the terminal read, for Langston's ruling:** RE-SCOPE PASS condition 2 (a re-serve carries its original age, never a fresh stamp) onto the adapter's runtime re-serve, which IS exercised; RETIRE the `closed_trades` leg, which cannot be exercised while the WebSocket path is healthy. Evidence on the exercised path (`[8.8.5][REST_BLOCKED] ... observedAt=`, newest rotated out file plus out.log, 13:11Z to 19:42Z): 10,664 re-serves across 12 symbols. The five symbols with zero `kraken_ws` cache writes in the same files (BTC, ETH, SOL, XRP, ADA; 5,928 re-serves) show 0.0% under 1 s, median age 29.8 s, the 15 / 30 / 45 / 60 s rungs: honest ages, no re-stamp. All 2,695 sub-second re-serves sit on the seven WebSocket-fed symbols, whose rows are refreshed continuously, so a fresh age there is true. The decision-side consumer of that age is OBJ-8's 8g. Script: `scripts/analysis/b_price_age_truth_reserve_age_split.py` and `.sh`.

**P-7a before-baseline, 19:52:20Z (the same instruments run after the restart, Step 8):** the last 30 one-minute `[B78.1][WS_TICK_RATE]` lines, ending 19:51:38Z (the last three: 804, 993, 932 events a minute); `eventLoopLag` 1 ms in 5 of 5 samples 10 s apart; the subscription-audit summary is silent because staging holds 0 open crypto positions (the audit returns early at `kraken-websocket-adapter.ts:3048-3050`); the WebSocket write before-set is 7 symbols and 482,780 writes over 14:29:50Z to 19:43:56Z. Output: `Batch Completion/B_PRICE_SIDE_BY_JOB_EVIDENCE/obj7_pre_restart_p7a_baseline_before_2026-09-11T1952Z.txt`.

**P-7j Step-8 capture:** within 30 minutes of the restart, every `[9.3][REWARM]` line and each re-warmed symbol's first 12 `[9.3][KALMAN]` lines, copied from `out.log` to an evidence file (pre-registration: section "STEP 8 PRE-REGISTRATION").

**The rollback cost, stated before the restart (Langston condition 3):** `aee2bc191` is an ancestor of all of OBJ-7, so no sha rolls OBJ-7 back and keeps the fee contract in its reviewed state. The only pre-OBJ-7 targets carry the fee runtime before its review; anything below that drops it and needs the hand-run `2026-09-11-b-xstock-fee-contract-rollback.sql` first, which is itself a fee change and bumps the xStock epochs again. So an OBJ-7 rollback after this deploy costs a manual database step and two extra xStock epoch boundaries.

## STEP 7 — FIRST-PASS VERIFICATION (CC-C, 2026-09-11) — evidence in `Batch Completion/B_PRICE_SIDE_BY_JOB_EVIDENCE/`

**Identity.** `dt-deploy` OK at `2026-09-11T20:09:47Z` (sha live, engine resumed, identity asserted); `dist/BUILD_SHA` equals `b597f1bf2`; pm2 online. Reads: `obj7_step7_first_pass_reads_2026-09-11T2040Z.txt` (script `scripts/analysis/b_price_side_obj7_step7_reads.sh`, every section filtered to lines at or after the 20:09:37Z pm2 restart).

**The screen (Claude-in-Chrome, `/paper-trading`).** The header's "Open Positions (marked live)" moved across the restart ($774.46 before; $775.07, $775.22, $773.83 and $774.23 after). The Open Trades tab renders all 5 open positions (GEV, CRM, MDB, CRWD, NEM, all xStock) with entry, live current price, target, stop, costs and net P/L, no blank values, feed Connected. ⚠️ **Limit:** 0 crypto positions are open, so the crypto exit-mark surface this batch changes has no row to show.

| piece | read after the restart | what it shows |
|---|---|---|
| P-7k cache mark kind | HEALTH 20:36:41Z: `rowKind=mid:11,last:105,unknown:0`; `levelReadKind=mid:9,last:173,unknown:0` | every cached row names its kind; in that minute 173 of 182 level reads were built from last-trade rows (an upper bound, quant lane only), which is the object OBJ-8 decides on |
| P-7h REST budget and reasons | 1,183 `EVAL_EXIT` lines carry `restTokenExhausted`, `restVenueRateLimited`, `restAgeExempt` (all 0; 5 of 5 positions priced from the WebSocket). `PRICE_SKIP_ESCALATION` MDB/USD at 20:38:41Z prints `reasons={"equity_tick_stale_risk_to_stop":40} dominant=equity_tick_stale_risk_to_stop:40/40` | the reason histogram and dominant-reason copy fire live (positive control); the alert it raises is CC-B's lane |
| P-7a ticker cadence | `WS_TICK_RATE` 0 for the first two minutes (no subscription yet: cold start), then 874, 1,220 and later 1,609, 493, 617 events a minute; before: 804, 993, 932 | the rate/lag comparison on the same instruments is Step 8's |
| P-7e book vs ticker | aligned 3,872, agree 3,872, disagree 0, unaligned 6, fires 0; `armed:false` | the record-only instrument counts and never fires on agreement |
| P-7b book unsubscribes | 0 `Unsub OK`, 0 `WS_UNSUB_REJECTED` | expected by construction (no position closed, no unsubscribe sent); not evidence either way |
| WebSocket writes | after-set 6 symbols: RAY/USD 23,752; GEV, CRWD, CRM 1,180; NEM 1,141; MDB 1,139. `Sub OK` 6 lines, all RAY/USD | the open question from Step 6 is answered: the other cache-writing symbols are the open xStock positions, whose feed does not log `Sub OK` |
| errors after the restart | 4, all pre-existing and homed: `#148` (EACCES, 1) and `#1047` (the `toUpperCase` parse error, 3) | nothing new from this deploy |

### ⛔ P-7j — THE PRE-REGISTERED CHECK: **FAIL** (Langston CONFIRMED at 20:55Z with his own parser)
**The criterion, as registered before the capture (section "STEP 8 PRE-REGISTRATION"):** K at observation 12 within x1.1 of the instantaneous steady state from that observation's R and Q; scope = R and Q each within 10% across observations 1-12; population = REWARM in the first 10 minutes, n-floor 20; **PASS at least 80% of in scope, FAIL below.**
**The outcome** (capture `obj7_p7j_capture_2026-09-11T2009Z_to_2039Z.txt`, 92 REWARM and 2,054 KALMAN lines; scoring `obj7_p7j_scoring_2026-09-11T2041Z.txt`; `scripts/analysis/b_price_side_p7j_rewarm_score.py`): population 84; excluded and counted 1 (`RIVER/USD`); in scope 83; **2 meet the tolerance (`STORJ/USD`, `USDC/CAD`), 2.4% — FAIL.** The side expectations hold: K = 0.9000 at observation 1 on 84 of 84, and median `gapFrac` 0.00555 (at most 0.01).

**The instrument, checked before the result was believed.** A repeated read returns before `update` and prints no line (`server/utils/adaptive-kalman.ts` `updateIfNew`), so a line is an update; the scorer's steady state is the same algebra as `applyObservation` (`K = P / (P + R)`, then `P = (1 - K) P + Q`). Langston's independent check: replaying the recursion from K = 0.9 with each line's own logged R and Q reproduces all 2,054 logged K values to print rounding.

**The mechanism — a fixture number carried to production, not a code defect (rule 24 outcome 2, confirmed).** The "12th observation" is test 12's, pinned at R 26 and Q 0.5 (Q/R 0.0192), which the test itself calls a knife-edge. **Every number in this paragraph is over the 83 in scope.** Q/R at observation 12 runs 0.0021 to 0.0235, median 0.0077; the fixture sits near the top of that range, about 2.5 times the median. K at observation 12 over steady state: min 1.056, median 1.282, p90 1.354 (the 75th of 83 sorted values; Langston's 1.347 is the neighbouring rank), max 1.996. **The first observation within x1.1 is right-censored:** of the 83 in scope, 72 reached it inside the 30-minute capture and 11 did not (their last observed index 15 to 29), so the median with the censored scored as beyond is **18 observations**, and **the upper end is not measured.** In time, observations arrive a median 60 s apart (p90 90 s, max 240 s; 1,869 gaps), and the first observation within x1.1 comes a median **22 minutes** after the first live read with the censored scored as beyond (21.5 among the 72 that reached it); the upper end is not measured. **CORRECTED at Step 9 (Langston 21:17Z):** the observation number is a fragile quantity. With observation 12's R and Q setting the threshold, the model predicts the first observation within x1.1 to within one on 64 of the 73 symbols in the population of 84 that reached it; with each line's own R and Q, on 72 of 73 (the one miss both ways is the excluded `RIVER/USD`). The earlier "72 of 72" came from an uncommitted script and a definition that was never registered. The gain curve is nearly flat at the crossing, so a small move in R shifts it by several observations. The filter itself is exact: every logged K matches the replay from K = 0.9 with each line's own R and Q to at most 0.000132 over 1,972 lines (`scripts/analysis/b_price_side_p7j_rewarm_predictor.py`). **The `REWARM_FIRST_LIVE_GAIN` docblock's "3-12 minutes of a lightly smoothed filter after every restart" is wrong for production.** (Evidence regenerated with the in-scope filter: `scripts/analysis/b_price_side_p7j_rewarm_diag.py`.)

**Not done, deliberately:** no threshold moved, no re-score at another observation number, no reading of this as a pass in spirit.

**Step 9 disposition: (A), RULED by Langston at 20:55Z** — keep the code; correct the docblock; mark test 12's pin as the fixture's; pre-register a per-symbol check for the next restart. The four conditions and their landing are in "STEP 9 — P-7j (A)" below. (B), a redesign, was not proposed: no harm from the longer lightly smoothed period is measured.

**Also in Step 7, recorded elsewhere:** alert `4f974017` (an active BA/USD fill refused on a 23 s snapshot age after the US close) triaged and resolved (`RUNNING_ISSUES` `#994` Amendment 4); `#1047` filed for the pre-existing parse error.

## STEP 8 — LANGSTON'S SECOND PASS (2026-09-11)

| gate | verdict | where it landed |
|---|---|---|
| P-7j, the pre-registered re-warm check | **FAIL CONFIRMED** 20:55Z, re-derived with his own parser; disposition **(A)** ruled with four conditions | STEP 9 below; condition 3 blocked 21:17Z, discharged 21:30Z at `2fb280c11`, his two corrections at `03a318d99`, CI run `34650065949` 4 of 4 per job |
| P-7a, scope row 7a | ✅ **MET, NO REVERT** 21:39Z | this section |

**What he re-derived for row 7a, at `03a318d99`:** the row verbatim (`B_PRICE_SIDE_BY_JOB_SCOPE.md:234`); `event_trigger: 'bbo'` is a **single site**, `kraken-websocket-adapter.ts:1503`, on the ticker subscribe only, with a whole-tree grep clean of any other `server/` occurrence and the book and instrument subscribes untouched; that adapter is the crypto v2 singleton (`:3782`), so the xStock path is structurally out of reach; the acknowledgement echoes (`20:09:13Z` reply `event_trigger:"trades"`, `20:11:42Z` send and reply `bbo`, `success:true`); and the subscription set is `RAY/USD` alone on both sides of the boundary, with five post-restart `bbo` subscribes.

**PREVIOUSLY STATED: before min 612, median 932, max 1,446 events a minute; after min 344, median 739, max 1,793 (my Step-8 dispatch, the last 30 one-minute lines on each side). NOW: PRE 16:24-20:09Z n=225, median 934, mean 909, max 2,409; POST 20:12-21:37Z n=85, median 855, mean 898, max 2,108; the latest 30 minutes median 961 (Langston's full-population read at the ref). REASON: my 30-line slice happened to sit in a quiet stretch, and the full populations overlap — so the like-for-like objection I raised largely dissolves, and there is no rate regression to attribute to anything.** Lag agrees: 1 ms with one 12 ms sample, a thin instrument, not the binding risk and not contradicting.

**His three residuals, and where each lands:**
1. **The revert trigger I proposed was a sentence, not a control** — nothing evaluates it, and "like-for-like window" was undefined, so that phrase is struck. **HOME: folded into `3n`, owner CC-C, as scope row `8j` with plan item `P-8j`** — a ceiling and a consecutive-minute run on the tick-rate counter, registered before arming and sized against the measured pre-switch maximum of 2,409 a minute, whose alert body names the row-7a revert. His own note: 10 times the before median is about 9,340 a minute, a sane load trip, and the counter's conflation of three sites is the right object for one, because it is the event-loop cost.
2. **The live subscription count is n = 1** (`RAY/USD`), so the row is met on the count that exists — **and the evidence bounds nothing above n = 1.** The set is position-driven (`WS_SUB_AUDIT openPositionCount`), so it grows with open positions. "At the live subscription count" must not be read as "at scale".
3. **Efficacy is unmeasured, and it is not row 7a, so it does not block:** nothing here shows `bbo` delivered the continuity it was bought for. **HOME: scope row `8k` with plan item `P-8k`**, beside P-7e — ticker frames a minute against trade prints a minute for the subscribed symbol inside one post-deploy window, self-controlled, needing no baseline and no matched window. ⚠️ One construction note: **no trade channel is subscribed** (pre-audit A-9.11), so the print rate is inferred from changes in the ticker's own `last` field, and the row says so.

## DEPLOY POINT AND THE DRIFT RUNGS (2026-09-12, CC-C — Langston routed alerts `763ea6b5` and `bca8e0d4` to me)

**THE CONDITION IS IN-REVIEW-NOT-YET-DEPLOYED, AND THE BEHAVIOURAL GAP IS ZERO. MEASURED UNBOUNDED, deployed `b597f1bf2` → `origin/migration/aws-supabase`:**
- **Exactly ONE undeployed runtime file** — `server/utils/adaptive-kalman.ts` — by the predicate `^(server|client|shared)/.*\.(ts|tsx)$` excluding `tests?/`, applied to the FULL changed-file list, not a sample.
- ✅ **It carries ZERO non-comment changed lines.** Every changed line in that file is a docblock line — the P-7j cadence and decay-length corrections from Step 9. **No statement, no constant, no signature.**
- ⇒ **Staging's RUNNING BEHAVIOUR is identical to the review branch's.** The rungs count commits, which is what they are built to do; they cannot read intent, and that is correct design rather than a defect. ★ **This is the drift line's first firing on a real gap carrying a runtime file, and the honest reading of that true positive is that the file changed and the behaviour did not.**

⛔ **THE DEPLOY POINT, STATED SO IT IS NOT RE-ASKED EVERY FOUR HOURS: OBJ-7 IS ALREADY DEPLOYED (`b597f1bf2`, 2026-09-11T20:09:47Z). The undeployed remainder is OBJ-7's POST-DEPLOY RECORD** — docblock, the pinned test, evidence scripts and governance — **plus other sessions' non-runtime work. The next deploy of this batch is OBJ-8's, and OBJ-8 is Step 2 approved / Step 3 not started.**
⇒ **There is nothing to deploy now, and deploying to silence a rung would restart live trading for a comment change.**

⚠️ **WHAT WOULD CHANGE THIS, so the disposition is falsifiable rather than a promise: any commit touching a runtime file with a non-comment changed line before OBJ-8 ships. The predicate above IS the test and is cheap to re-run.**
## STEP 9 — P-7j (A): LANGSTON'S FOUR CONDITIONS (20:55Z) AND WHERE EACH LANDS

| # | condition | landing |
|---|---|---|
| 1 | the replacement numbers are right-censored: publish the median with n reached and n censored, and the upper end as not measured | the Step-7 P-7j subsection above carries median 18 observations and 22 minutes, 72 reached and 11 censored, upper end not measured; the docblock carries the same |
| 2 | the same measurement falsifies the docblock's cadence derivation: the filter advances once per new observation, not per re-serve | the docblock now reads the measured spacing (median 60 s, p90 90 s, max 240 s), at which its own formula gives a first live gain of 0.64, 0.57 and 0.41, so 0.9 over-weights the live read by 26 points or more, still the fail-safe direction; its falsifier clause records that the cadence half is discharged by measurement |
| 3 | the next check registers its window from the model, and registers what a censored symbol scores | "STEP 8 PRE-REGISTRATION r3" below. r2 was BLOCKED at 21:17Z: its own soundness figure did not reproduce, and replayed on its calibration data it scored 76.5% under one reading of the crossing. r3 scores the gain along the path, with negative controls, and censored = NOT MET |
| 4 | mark test 12's pin as the fixture's; do not loosen it | one comment line in test 12, Langston's wording; the pin stays at 12 |

**Re-derived before writing, not copied:** the docblock's formula (the steady-state gain of the hourly warm model with `Q_warm = Q_live x 3600 / t`, at R 26 and Q 0.5) gives 0.845 at t = 15 s (its own 0.85), 0.754 at 30 s, 0.642 at 60 s, 0.573 at 90 s and 0.412 at 240 s.
**Comment-only code change:** `server/utils/adaptive-kalman.ts` (the `REWARM_FIRST_LIVE_GAIN` docblock) and `server/tests/unit/b-price-side-p7j-smoother-observation.test.ts` (test 12). No runtime behaviour changes, so it rides the next deploy rather than forcing one.
**CI, per job (rule 19):** run `34650065949` on `03a318d99`, the head carrying the P-7j change and Langston 21:30Z corrections: TypeScript Check (baseline gate) success, Test Suite success, Build success, Docker Build success. Earlier on the same code: `34649466396` on `ea4b36c4e` 4 of 4; the run on `2fb280c11` itself (`34649335216`) was cancelled at Docker Build when the next push started a newer run, with its other three jobs green.

## STEP 8 PRE-REGISTRATION r2 — THE P-7j RE-WARM CHECK FOR THE NEXT RESTART (written 2026-09-11, before any capture)
**⛔ SUPERSEDED BY r3 BELOW — kept as struck history, not a criterion (Langston 21:17Z).** Replayed on the 2026-09-11 capture it scores 86.4% or 76.5% depending on a crossing definition it never registered, and the soundness figure it cites ("72 of the 72") was an uncommitted number that is 64 of 73 under the other definition.
Replaces the fixed observation 12 (condition 3). **Nothing here is applied to the 2026-09-11 capture.**
- **The prediction:** for each re-warmed symbol, n̂ = the first live observation at which the model gain, iterated from K = 0.9 with that symbol's R and Q from its 12th `[9.3][KALMAN]` line held constant, is within x1.1 of the instantaneous steady state from the same R and Q.
- **Why a prediction and not a constant:** a fixed observation number cannot hold across Q/R 0.0021 to 0.0235; on the 2026-09-11 capture this predictor matched the observed first observation within x1.1 to within one observation on 72 of the 72 in-scope symbols that reached it (it is sound, which is why it is used; it is not scored here).
- **Tolerance:** the observed first observation within x1.1 is n̂ - 1, n̂ or n̂ + 1.
- **Scope:** R and Q each within 10% of their observation-12 values across observations 1 to max(12, n̂ + 1); the rest excluded and counted.
- **Population and floor:** symbols with a `[9.3][REWARM]` line in the first 10 minutes after the restart; n-floor 20 in scope.
- **Window:** capture 75 minutes of `[9.3][REWARM]` and `[9.3][KALMAN]` lines from the restart. Sized from the model: on the 2026-09-11 R and Q, n̂ is at most 34 (median 18, p95 20), and 34 observations at the measured p90 spacing of 90 s is 49.5 minutes, plus the 10-minute population window and a margin.
- **A censored symbol** (the capture ends before its observed first observation within x1.1) **scores NOT MET and is never dropped.** The slow symbols are what the check exists to see.
- **PASS:** at least 80% of in-scope symbols meet the tolerance. **FAIL:** fewer than 80%. **Below the floor:** a count, no verdict.
- **Also expected, unchanged:** K = 0.9 at observation 1 for every re-warmed symbol, and median `gapFrac` at most 0.01.

## STEP 8 PRE-REGISTRATION r3 — THE P-7j RE-WARM CHECK FOR THE NEXT RESTART (written 2026-09-11, before any capture; supersedes r2)
Scores the quantity, not the observation number (Langston 21:17Z, option (a)), and along the path rather than at one point. Nothing here is a verdict on the 2026-09-11 capture; its numbers below are the calibration that chose the design.
- **The claim tested:** after a restart every re-warmed filter follows its model from a first live gain of exactly 0.9. Every logged gain over live observations 1 to 12 equals the replay from K = 0.9 that uses each line's own logged R and Q, within 5e-4 (the log prints K to 4 dp, R to 2 and Q to 3).
- **Population and floor:** symbols with a `[9.3][REWARM]` line in the first 10 minutes after the restart; n-floor 20. A member with fewer than 12 `[9.3][KALMAN]` lines in the window scores **NOT MET** and is counted separately as censored, never dropped.
- **Window:** capture 60 minutes of `[9.3][REWARM]` and `[9.3][KALMAN]` lines from the restart: 11 gaps at the measured maximum spacing of 240 s is 44 minutes, plus the 10-minute population window. That 44 is a floor, because the 240 s maximum is itself right-censored by the 30-minute calibration capture. The empirical time from the first live observation to the 12th was median 15.0, p90 16.5 and max 17.0 minutes over the 84, so 60 minutes carries about 3.5 times margin, and an undersized window shows up as censoring (NOT MET), never as a silent pass.
- **PASS:** at least 95% of the population meet the claim. **FAIL:** below 95%. **Below the floor:** a count, no verdict. Met, missed and censored are reported as three counts, so a FAIL is attributable to the filter or to cadence.
- **The instrument is proven on the same capture, every time:** the replay with a broken first gain (the steady-state gain; 0.5; 0.85) and the replay with a broken PATH (a correct first gain of 0.9, then one unlogged extra update after observation 3, using that observation's R and Q) must each fail on every scored symbol. The first-gain controls separate at observation 1, so only the path control shows the instrument catches a wrong path. **If any control passes on any symbol, the capture is INVALID, not a PASS.**
- **Reported beside the verdict, not scored:** the first live observation within x1.1 of steady state under both definitions (each line's own R and Q; observation 12's R and Q) with reached and censored counts; K = 0.9 at observation 1; median `gapFrac`.
- **What a PASS does not say (Langston's pin, 21:30Z):** an r3 PASS says the logged gain path matches the model from a first gain of 0.9. It says nothing about whether 0.9 or the decay length is the right size. Disposition (A) closed that question on no measured harm, and **an r3 PASS may never be cited as evidence that the re-warm is adequate.**
- **Calibration, 2026-09-11 (why this design, not a verdict):** met 84 of 84, per-symbol worst error median 0.000057 and max 0.000103; the three first-gain controls fail on 84 of 84 each, with minimum separations 0.7572, 0.4000 and 0.0500 (each is the observation-1 gap); the path controls also fail on 84 of 84, the extra update after observation 3 with a minimum separation of 0.0406 and R x 1.02 from observation 2 on with 0.0049 (Langston measured 0.0328 for his construction of the extra update; the verdict is the same). The observation-number designs it replaces were fragile on the same data: r2 replayed scores 86.4% or 76.5% depending on the unregistered crossing definition, and the predicted observation is within one on 72 of 73 or 64 of 73 under the two definitions. Script: `scripts/analysis/b_price_side_p7j_rewarm_predictor.py`; evidence: `Batch Completion/B_PRICE_SIDE_BY_JOB_EVIDENCE/obj7_p7j_predictor_2026-09-11T2125Z.txt`.

## THE ASK — one gate per dispatch

Three dispatches, one per chunk. Each asks for a ruling on that chunk's commits only, at the ref, with this file as the context.
