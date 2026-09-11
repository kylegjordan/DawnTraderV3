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
⚠️ **Stated limits:** `levelReadKind` counts the active crypto quant lane's read only (`signal-orchestrator.ts`); the VTS level lane reads the same rows, so its mixture shows in `rowKind`, not in a read count. The `:572` raw-symbol against `:1124` normalised-symbol difference you flagged is in the adapter's private cache, not this row; it is unchanged and still fails to absence.

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
| **C3** — a third lane | the stated limits now name the crypto PATTERN lane: levels from a bar close (`signal-orchestrator.ts:2224`, `:2286`, `:2291-2293`), no cache row read, in neither field, and not expressible as `mid`/`last` (`venue_close`, OBJ-8's) | `price-cache.ts` `noteLevelRead` docblock | — |
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

## THE ASK — one gate per dispatch

Three dispatches, one per chunk. Each asks for a ruling on that chunk's commits only, at the ref, with this file as the context.
