# B-REST-SIDES-TO-CACHE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Part A (§0-§6): increment 1 (OBJ-8, OBJ-10, OBJ-11, and OBJ-9's measurement half), approved. Part B (§7-§11): increment 2 (OBJ-1..7), at its own Step 2.**
**Scope:** `B_REST_SIDES_TO_CACHE_SCOPE.md` §8 (r5, approved with conditions C1-C7, 2026-09-26 20:39Z). **Read at:** `origin/migration/aws-supabase` @ `b34c8ac8e`. **Author:** CC-C, 2026-09-26.
**change-class: architecture** (unchanged).

---

## 0. PREVIOUSLY STATED vs NOW (at the top, per the step rule)

| | previously stated | now | reason |
|---|---|---|---|
| **N-1** ⛔ *superseded by N-1b below: my mechanism read a dead method* | **C1 (Langston):** after OBJ-8, GBP/USD and ETC/USD stop reporting 24h volume 0 *"to the scanner"*: *"a scanner filter input going 0 → real."* | **The volume store is not a scanner input. It feeds one label, a new position's `volumeBucket`, and only as its THIRD fallback, plus the UI.** The scanner already sees real volume for both pairs: `[DIAG_PATTERN]` at 20:44:27Z reads GBP/USD `volume24hUSD=4203001.6`, and at 20:43:57Z ETC/USD `volume24hUSD=301049.6`. | Census of `market-volume-cache` consumers (§2.3). **Direction after OBJ-8: the label on a new GBP/USD or ETC/USD position, when FX5 metadata and the filter pool both lack a volume, moves from `Very Low` to its true bucket. No decision reads it.** |
| **N-1b** | **N-1 (mine):** the volume store's match fails for both pairs today, so both read volume 0. | **Both of us read the dead method (Langston's Step-2 ruling, re-derived by CC-C).** The `:170-183` match is in `getVolumes`, which has **no callers** (`:143` is its only occurrence). The live consumer, `aee:5510`, calls `getVolume` → `fetchFromKraken` (`:102-135`), which takes `Object.keys(data.result)[0]` (`:119-123`) and matches no key at all. Kraken accepts the altname, so **the store returns REAL volume for both pairs today.** | **After OBJ-8: NO CHANGE on the volume path** (the request moves from altname to primary, Kraken answers the same ticker, the first key is the same one). **C1 is WITHDRAWN by Langston.** Same shape as his crypto OBJ-6 retraction: a true reading taken at the object next to the live one. |
| **N-2** | `#1056` amendment 2 (mine): the 25 unmapped primaries are *"not tested here"*. | **3 of the 25 are REST-polled today, all by `vtsSimulation`: `BTC/CAD`, `ZEC/EUR`, `USD/CAD`. None is USD-quoted.** | OBJ-9's measurement half (§2.1). Per Langston's §8.2 test, they stay in row `3n.l-a`; no Design-C amendment is proposed here. |

---

## 1. THE SIX SOURCES — WHICH WERE READ

| # | source | read? | what it gave |
|---|---|---|---|
| 1 | Code at the ref | yes | every site cited below |
| 2 | Logs + DB | yes | the rotated `out__2026-09-26_20-09-39.log` and `out.log` (19:29:12Z → ~21:15Z); `closed_trades`, `active_open_positions`, `vts_open_trades`, `exit_decision_archive`, `rtb_shadow_pool_members`, `signal_eval_archive` (7 days) |
| 3 | `SYSTEM_IMPACT_MAP.md` | yes | the price-cache entry (`:388`, *"~448 lines"*; the file is 743) and the registry row (`:1235`). ⚠️ **No entry exists for `kraken-symbol-map.ts` or `kraken-symbol-resolver.ts`.** That silence is a governance gap, owed at Step 10. |
| 4 | `SYSTEM_MANUAL.md` | yes | §9 *"Kraken Symbol Resolution"*: tier 0 is *"manually verified"*. **False for the two altname rows.** Correction owed at Step 10. |
| 5 | Ledger | yes | `#1056` (amendments 1-3), `#937` (fiat half held), `#977` (the `openTrade` lane) |
| 6 | Provenance | yes (scope §8) | the map's directive, `de3049193`, spec line 69: populate from *"Kraken's own asset legend"* |

---

## 2. THE AUDIT

### 2.1 OBJ-9's measurement half — which of the 25 we actually poll
**Instrument:** the `[A4.R10R-1][PriceCache] Subscribed <symbol> to <bucket>` lines in the two files above, about 105 minutes. **Population:** 239 distinct symbols across `vtsSimulation` (239) and `readyToBuy` (6). **Reach, stated:** `vtsSimulation` re-logs its members every pass (EGLD/USD showed one line a minute on 2026-09-26 09:02-09:04Z), so a live member cannot hide. **The `openTrade` lane logs no `Subscribed` line and is not covered;** it held 8 symbols (Langston's read) and GBP/USD is one of them.
**Result:** `BTC/CAD`, `ZEC/EUR`, `USD/CAD` (Kraken primaries `XXBTZCAD`, `XZECZEUR`, `ZUSDZCAD`), all in `vtsSimulation`. **Controls:** GBP/USD present (`readyToBuy`, `vtsSimulation`), BTC/USD present. ETC/USD absent, so it is not polled today.

### 2.2 The mechanism, at every REST write site (§9.5(a): who WRITES the cache)
**Five write sites in `price-cache.ts`:** `refreshBucket` (`:276`, `:280`), `getPrice` (`:430`, `:433`), `getBatch` (`:549`, `:554`), `updateFromWebSocket` (`:676`), `updateFromRest` (`:707`). **The three REST ticker sites share one shape:** they key the write by `normalizeKrakenPair(pair)` (`:251`, `:405`, `:524`), and rescue the requested key only through `symbolsMatch` (`:305-309`), which normalises BOTH sides with the same function. ⇒ **for `ZGBPZUSD` none of the three rescue, so all three write the phantom `ZGBPZ/USD`.** Two consequences beyond the exit rail, both read at the code and neither measured:
- `getPrice` (`:432-435`) never sets `fetchedData` for GBP/USD, so a cache MISS on GBP/USD returns `null`.
- `getBatch`'s `result` map (`:550`) carries no GBP/USD entry, so a VTS exit cycle that must fetch (WS silent past the 60 s bucket interval) gets no price for GBP/USD.
**OBJ-8 repairs all three sites at once**, because `normalizeKrakenPair('ZGBPZUSD')` then hits `mapByRestPair` (`kraken-symbol-resolver.ts:32`, `:102`).

### 2.3 Who READS `krakenRestPair` (C1's blast radius), repo-wide, tests excluded
| reader | what it does with it | effect of OBJ-8 |
|---|---|---|
| `kraken-symbol-resolver.ts:32` `mapByRestPair` | response-key lookup in `normalizeInternal` | **the fix itself** |
| `toKrakenRest` → `market-volume-cache.ts:106,160,170` | request string; the `:170-183` match (`key === krakenSymbol \|\| key.includes(…)`) fails for both pairs today, so both get `setVolume(symbol, 0)` | request becomes the primary and exact-matches. Consumers of the result: `active-execution-engine.ts:5510` (a position's `volumeBucket`, third fallback after FX5 metadata `:5496` and the filter pool `:5502`) and `routes.ts:12376` (UI). **No decision path reads `volumeBucket`** (repo grep: `routes.ts`, `aee:5535`, `active-filter-pool.ts`, the cache itself). |
| `toKrakenRest` → `mini-book-integrity-monitor.ts:163` | request string; it reads `Object.values(restTickers)[0]` (`:171`) | **none**, the read is key-agnostic |
| `getKrakenRestPair` → `kraken-websocket-adapter.ts:2242`, `:2534` | a diagnostic field `kraken_rest` | label text only |
| `kraken-asset-pairs-service.ts:194-199` | compares the static row with the auto entry to assign a tier | GBP/USD's auto entry moves from "matches" to *"Static map exists but differs"* (tier 2). The same already holds for the 17 primary-keyed static rows. The tier is consulted only by `toKrakenRest` for NON-static symbols (`kraken-symbol-resolver.ts:147-151`), so **no effect** on these two. |
| `price-cache.ts:244` `toKrakenSymbol` | the poller's own request string (`:295-304`, concatenation) | **untouched**; OBJ-8 reaches the poller only through the write key (Langston C1) |

### 2.4 C2 — the both-writers population, and what OBJ-8 adds to it
After OBJ-8 the three REST sites land on `GBP/USD` (and `ETC/USD` when polled), keys the WS path also writes. **FINDING-3 applies:** a REST write replaces the whole entry (`:276`), including WS sides and `venueObservedAtMs`, with REST sides stamped `sidesCapturedAtMs = Date.now()` at RECEIPT. **Direction:** during a WS silence (the `5bfb2af5` shape) the sides become FRESHER, which is the point. During an active WS stream, a REST snapshot can replace a newer WS side and still carry a fresh receipt stamp, by up to one REST round trip. **That bound is not measured here.** Per C2, it is measured at the post-OBJ-8 shape at Step 7 (§4, V4).

### 2.5 OBJ-11 — the dead rows, census of code AND persisted values (C4)
**Code (repo grep for the internal AND compact forms, tests excluded):** the six map rows (`kraken-symbol-map.ts:46,55,64,65,76,86`), plus **four other files that keep their OWN hardcoded lists and never read the map:** `server/scripts/diagnostic-11.4G.ts:94` (`MATIC/USD`, a diagnostic script), `server/services/market-data.ts:76` (`'MATIC': 'MATICUSDT'`), `server/services/market-data/volume-classifier.ts:39,57` (`MATIC/USD`, `MKR/USD`) and `server/services/semantic-guardrail.ts:58` (`'MATIC', 'MATICUSD'`). **Deleting the map rows does not change them.** They are rule-18 legacy of the same pairs. **Q-A for Langston:** remove their entries in this commit (P4b, each list's consumer read at Step 3 first), or give them their own dated item? **Kraken:** none of `EOSUSD`, `ICXUSD`, `MATICUSD`, `MKRUSD`, `REPUSD`, `WAVESUSD` is in `AssetPairs` (control: `ADAUSD` present).
**Persisted values, 2026-09-26:** **0 rows** for all six in `closed_trades`, `active_open_positions`, `vts_open_trades`, `exit_decision_archive`, `rtb_shadow_pool_members` (all time) and `signal_eval_archive` (last 7 days). **Controls in the same queries:** ADA/USD 1 closed trade; POL/USD 196 VTS trades, 13 exit-archive rows, 172 shadow-pool rows and 7,489 signal-archive rows. **Reach:** the signal archive was read for 7 days only (its size), all other tables for all time.
**MATIC → POL (C4):** POL/USD is live and already resolves: it is traded (above) with no static row. **Deleting `MATIC/USD` leaves no live pair unmapped, and POL/USD is NOT added in this commit.** Its REST key `POLUSD` is its own primary, so the altname class does not apply to it.
**After deletion:** `toKrakenRest('MATIC/USD')` falls to the dynamic service, then returns `null` with its explicit warn (`kraken-symbol-resolver.ts:155`), instead of requesting a pair Kraken rejects today.

### 2.6 Entry points (who SCHEDULES work against the cache)
`refreshBuckets` on the cache's own timer (`initialize`, `:162`; per-bucket intervals), `getPrice` and `getBatch` on demand from their callers (the registry row `SYSTEM_IMPACT_MAP.md:1235`: vts-runner exit cycle, FX5 scanner, routes), `updateFromWebSocket` from the WS adapter, `updateFromRest` from the adapter's REST leg. **No new entry point is added by this increment.**

---

## 3. THE PLAN — each item points back at its finding

| item | what | from |
|---|---|---|
| **P1** | `kraken-symbol-map.ts`: `GBP/USD` `krakenRestPair` → `ZGBPZUSD`; `ETC/USD` → `XETCZUSD`. **Amend the `:17` docblock** so it states that the column holds Kraken's PRIMARY pair key (the key Kraken answers by), not the altname (C7). | §2.2, §2.3, C7 |
| **P2** | **OBJ-10, the per-writer stamp:** `CachedPrice` gains `sidesWriter: 'ws' \| 'rest_poller' \| 'rest_fetch' \| 'rest_batch' \| 'rest_adapter' \| null`, set at each of the five write sites. `updateFromRest` carries the previous value forward with the sides it carries forward, so the field always names who wrote the SIDES, not the mark. | §2.2 |
| **P3** | **The write-key ledger (C3's instrument), per SITE (Step-2 condition b).** Each of the three REST ticker sites (`refreshBucket`, `getPrice`, `getBatch`) records, per call, the **requested** symbols, the keys **written**, and the **phantoms** (written keys that match no requested symbol), tagged with the site. `refreshBucket` prints its own pass; `getPrice` and `getBatch` print on their own line, so a phantom is never attributed to the wrong site. **The identity that must hold per call:** every written key is either a requested symbol or a phantom; a requested symbol absent from the written keys is printed as **missing** (Kraken omitted it), which today is invisible to every counter. The `sidesWriter` census rides the `refreshBucket` line. | §2.2, C3, Step-2 conditions a-b |
| **P4** | **OBJ-11:** delete the six rows; `DELETED_COMPONENTS_LOG.md` entry (what, why, the §2.5 census, archive path, commit); archive copy under `1-system-manual/_archive/deleted-code/` with a `.removed` suffix. | §2.5 |
| ~~P4b~~ | **SPLIT OUT (Step-2 condition d):** the four hardcoded lists are four different subsystems, and one is a different object (`market-data.ts:76` is `MATICUSDT`, USDT-quoted; §2.5 tested `MATICUSD`). `volume-classifier.ts` also carries live `ETC/USD`. **Home: `B-DEAD-PAIR-LISTS`, owner CC-C, `PHASE_19_PLAN` row `3n.l-b`, after `3n.l-a`.** Only P4 (the six map rows) ships here. | §2.5 |
| **P5** | **Tests:** `normalizeToInternalSymbol('ZGBPZUSD') === 'GBP/USD'`, `('XETCZUSD') === 'ETC/USD'`, `toKrakenRest` for both; the map contains no row whose REST key is a Kraken altname with a different primary (a fixture of the two pairs); `sidesWriter` is set by each write site; the phantom counter counts a primary absent from the map (fixture `XXBTZCAD`) and does NOT count `ZGBPZUSD`; `toKrakenRest('MATIC/USD')` returns `null`. **Each test gets a mutation that must fail it.** | P1-P4 |

**Nothing in the plan is UNAUDITED.**

---

## 4. VERIFICATION, PRE-REGISTERED BEFORE ANY DATA

- **V1 (C3), re-stated as a PRESENCE (Step-2 condition a):** after the deploy's restart, on a pass whose **requested** list includes `GBP/USD`, **`GBP/USD` appears in the WRITTEN list under its own key**, at each of the three sites that handles it. **Absence of `ZGBPZ/USD` alone is NOT the criterion**, because it is equally satisfied when GBP/USD was simply not requested. As a secondary check, the phantom list names no `ZGBPZ/USD` and no `XETCZ/USD`. **Positive control on the same line: `XXBTZ/CAD`, `XZECZ/EUR`, `ZUSDZ/CAD` ARE named** (the three §2.1 pairs, row `3n.l-a`'s). An empty phantom line would prove the counter, not the fix. **The pre-fix phantom is memory-only and dies with the process: no migration.**
- ⭐ **PRE-REGISTERED BEFORE V1 IS READ (Step-4 ruling): the phantom baseline is NON-ZERO by design.** Every Kraken pair whose primary differs from its altname and that the static map lacks lands on a phantom; today three such pairs are polled (`BTC/CAD`, `ZEC/EUR`, `USD/CAD`, `vtsSimulation`). **A non-zero phantom list containing exactly those is the expected state, not a failure of this fix.** Only a phantom derived from `GBP/USD` or `ETC/USD` fails V1.
- ⏳ **SHELF LIFE: `out.log` keeps about 7 hours** (Langston measured 14 × 1 GB rotations spanning 14:03Z → 21:04Z on 2026-09-26). **The V1-V4 readings are harvested inside that window after the deploy and written to the batch record the same day** (`#1044`'s class).
- **V2:** the `sidesWriter` census shows GBP/USD's sides written by the REST poller on each `openTrade` pass. **Control:** a WS-fed symbol shows `ws`. ➕ *(Restated at increment 2, Langston Step-2 C1: both increments ship on one deploy, so V2 is read in P11's vocabulary: a WS-fed symbol shows `ws_ticker` or `ws_book`, and `ws` never appears.)*
- **V3:** the `8a-P2` rail does not escalate GBP/USD across a WS silence longer than 2 s, if one occurs in the reading window. **An absence of silences is recorded as the test not having run, not as a pass.**
- **V4 (C2):** the FINDING-3 bound is measured on GBP/USD at the post-OBJ-8 shape: how often a REST write replaces a WS side newer than the REST response. GBP/USD had one live open paper position at the Step-4 review, so it can be read at once.
- ⛔ **C6, pre-registered: OBJ-10's first live reading is taken after the one deploy, so it is already post-OBJ-1..3. It can never serve as a pre/post control for this batch's own change.**

---

## 5. RISKS AND WHAT THIS INCREMENT DOES NOT DO

- **The deploy waits** for `8a-P4c`'s window (closes 2026-09-30T00:00Z), `3n.q8`'s fee-window hold, and row `8c`'s window (Langston §8.2). **No ceiling moves; no symbol enters or leaves trading.**
- `fx-conversion-service.ts:30-37` and `:150` are row `3n.l-a`'s (C5); untouched here.
- The 🔒 locked resolver is **not edited**: P1 and P4 change the map's DATA; P2 and P3 change `price-cache.ts`, under scope §2 A3's precedent.

---

## 6. STEP-2 RULING (Langston, 2026-09-26 20:51Z): APPROVED WITH FOUR CONDITIONS, all folded above
- **(a)** N-1 re-corrected: `getVolumes` is dead, `getVolume` is key-agnostic, OBJ-8 is inert on the volume path. **C1 withdrawn** (§0 N-1b).
- **(b)** V1 asserts a PRESENCE: GBP/USD in the WRITTEN list under its own key, with requested / written / phantom / missing printed (§3 P3, §4 V1).
- **(c)** The phantom count is keyed by SITE, so OBJ-8's "all three sites at once" claim is checkable per site (§3 P3).
- **(d)** P4b split to its own item, `B-DEAD-PAIR-LISTS`, row `3n.l-b` (§3).
**Stands as written:** P1, P2, P5; §2.5's persisted census; V1's three `vtsSimulation` positive controls; C6's pre-registration; the SIM and System Manual §9 corrections owed at Step 10.

---
---

# PART B — INCREMENT 2 (OBJ-1..7)

**Scope:** r4 §3 (OBJ-1..7) and r5 §8.2. **Read at:** `origin/migration/aws-supabase` @ `8687169de`. **Author:** CC-C, 2026-09-26. **change-class: architecture** (unchanged).

## 7. PREVIOUSLY STATED vs NOW (increment 2)

| | previously stated | now | reason |
|---|---|---|---|
| **N-3** | Scope §2 A2: *"a one-sided book never reaches `updateFromWebSocket` at all"*; Langston's r3 obligation: prove the book guard is the ONLY way in. | **It is not the only way in, and one of the others guards PER SIDE.** The v2 ticker emit (`kraken-websocket-adapter.ts:905-906`) nulls each side on its own, so it can write one fresh side beside a kept one under a fresh stamp: the shape OBJ-2 forbids on REST. **Seen 0 times** in 245,159 raw ticker messages (§8.1). ⚠️ That count covers zero or null sides only; a negative or non-numeric side is inside P8's predicate (`isFinite && > 0`) and outside the measurement (C5). | the producer census, §8.1 |
| **N-4** | Scope §6 attack 3: routing REST through `updateFromWebSocket` *"would rebuild a known defect"*, argued as a hypothetical. | **Already built, for two producers.** `updateCache` (`live-pricing-adapter.ts:1171`) always calls `updateFromWebSocket`; the engine's REST fallback (`active-execution-engine.ts:2351`) and xStock mark re-write (`:2217`) both reach it. | §8.2 |
| **N-5** | Scope r3 ground 3: `vts-runner.ts:1805-1807`. | `:1854-1856`. On the cold fabricated book (`bid === ask === price`) it gives spread **0**, not the `0.001` fallback. | line drift; §8.3 |
| **N-6** | Scope §5 and §8.2: the one deploy waits for row `8c`'s window to reach its floor or be voided. | **Discharged 2026-09-13.** `8c` audit §3c-READ: n-floor PASS on both lanes (37,220 and 26,478 against 2,000). The deploy still waits for `8a-P4c` (2026-09-30T00:00Z) and `3n.q8`. | read at the ref |
| **N-7** | OBJ-6: write `8c`'s anchor into §3b of the `8c` audit. | **Already there:** §3b's ANCHOR row holds `2026-09-13T07:08:52.378Z` (audit line 189, inside §3b at 179-238), and scope §5 already carries the corrected sentence. **OBJ-6 needs no edit; its verification passes at the ref today.** | read at the ref |
| **N-8** | Part A P2: `sidesWriter` includes `'rest_adapter'`. | Shipped without it: `updateFromRest` stated no sides, so it carried the writer forward. **Added here**, where `updateFromRest` starts stating sides. | increment-1 code |
| **N-9** | `#1060` amendment 4 (mine, 2026-09-13): *"the signal-birth quote age becomes an objective of `3n.l`"*. | **It never reached this scope or the `3n.l` plan row** (both grepped: no `30-45`, `signal birth`, `#1060` or `quote age`), and it collides with the scope's non-goal *"no new poll, no cadence change"*. | §8.5 |
| **N-10** | Scope r4 note: under the pairwise guard a one-sided REST symbol *"reports an honest `no_book`"*. | On a COLD row it reports `locked_or_synthetic` (the writer's legacy substitution fills both sides with the mark when no side exists, and OBJ-1 keeps that rule); on a warm row the prior sides are kept and age out. Neither is recovery; both are honest refusals. | `price-cache.ts:725-726`, `level-basis.ts:221` |

## 8. THE AUDIT (increment 2)

### 8.1 Who WRITES the sides: every route into `updateFromWebSocket` (Langston's r3 obligation)
Repo-wide `git grep` at the ref, tests excluded, for `updateFromWebSocket`, `updateCache`, `emitPriceTick` and `updateFromRest`:

| route | sides passed | guard |
|---|---|---|
| `kraken-websocket-adapter.ts:1361`, direct (v1) | `null, null` | none needed; unreachable (`#742`) |
| `live-pricing-adapter.ts:1171` `updateCache`, from `:1519` (`priceTick` subscriber) ← `emitPriceTick` `kwa:900`, **v2 ticker** | each side on its own: `Number.isFinite(x) && x > 0 ? x : null` (`:905-906`) | ⛔ **PER SIDE** |
| same, ← `kwa:1202`, **book top** | `bestBid, bestAsk` | ✅ **PAIRWISE:** `kwa:1168-1170` skips the whole write if either is `<= 0` |
| same, ← `kwa:1349` (v1) | `null, null` | unreachable (`#742`) |
| same, from `active-execution-engine.ts:2217` (xStock mark) | `null, null` | none needed |
| same, from `active-execution-engine.ts:2351` (engine REST fallback) | `null, null` | none needed |

`updateFromRest` keeps ONE caller: `live-pricing-adapter.ts:897` (`fetchLivePrice :619` → `fetchFromKrakenRest :759`).
⚠️ **The book guard's ARITY is right and its PREDICATE is not a finite test.** Book levels are keyed by a bare `parseFloat` (`kwa:1096-1098`); a `NaN` key makes `Math.max` return `NaN`, and `NaN <= 0` is false, so `:1168` passes it and the writer stores it with a fresh stamp. The ladder refuses it `non_finite_side` (`level-basis.ts:214`), but it also reaches the MARK (the midpoint at `kwa:1173` is `NaN`), which flows on as `price` (for example into `mce.computeContext`, `vts-runner.ts:1481`). The two direct side readers keep it out (`vts-runner.ts:1854` falls back to `0.001`; `recordFeedAgreement` tests `Number.isFinite`, `level-basis.ts:1223-1225`). The checksum arm (`kwa:1132-1147`) `continue`s first wherever precision is known, so the path is open only for a frame with no checksum or an unmapped symbol. Kraken sends numbers: latent.
⇒ **Two producers carry real sides. The book is pairwise; the ticker is not.** Under the writer's OR stamp, a ticker frame with one non-positive side ADVANCES `sidesCapturedAtMs` (`price-cache.ts:739`) and moves `venueObservedAtMs` to the new frame's stamp (`:743`), which is the clock the ladder reads first (`touch-price.ts:177`). The missing side is then **on a warm row, the OLD value: BLOCKER-3's undetectable shape, on the WS path. On a COLD row, the mark itself** (`:725-726`), which on a one-sided frame is `last ?? close ?? c[0]` (`kraken-v2-translator.ts:71,80`): undetectable when it lands on the right side of the real one, refused `crossed_book` (`level-basis.ts:220`) when it does not. (N-10's cold-row refusal holds for REST, where the pairwise guard states no sides at all; it does not hold here.)
**Measured:** 245,159 raw v2 ticker messages (`[I7-WS-RAW] {"channel":"ticker"` lines, `out__2026-09-26_20-09-39.log`, 19:29:12Z → 20:09:42Z): **0** with a zero or null `bid`, **0** with a zero or null `ask`. **Reach:** `[I7-WS-RAW]` logs the first 200 characters of each message (`kwa:646-648`), so this covers the first data entry of each message; `"bid":` and `"ask":` are visible on 245,159 of 245,159 lines; 0 snapshots; no second entry starts inside any head. **Positive control:** the pattern matched both zero-side fixtures and not a `0.05` fixture. ⇒ **real in the code, unseen in 40 minutes of traffic.**
**The REST writer's own population (OBJ-2's):** 1,393 adapter REST ticks (`[8.9.2][REST_TICK]`, `live-pricing-adapter.ts:891`). **None came from the engine's copy of that prefix (`aee:2333`):** the adapter prints `[8.8.3-I6][REST_FALLBACK]` (`:892`) once per tick and the engine never does, and that count is also 1,393 in the same file. Structurally, the adapter calls `updateFromRest` directly (`:897`), never `updateCache`, so it emits no `CACHE_WRITE` line at all, which is why 1,393 REST ticks sit beside 0 `kraken_rest` cache writes (C6, Langston's framing); `out__2026-09-26_21-36-39.log`, 21:04:12Z → 21:36:42Z, 55 symbols: **0** with `bid=0`, **0** with `ask=0`, **0** with `bid == ask`. Control: the pattern matched a `bid=0` and an `ask=0` fixture and not a `0.05` one. ⇒ **OBJ-2's guard acts on nothing observed today; it closes a latent case.**

### 8.2 The "venue pushed" field is advanced by two writers that are not pushes
`lastWsMessageAtMs` (`price-cache.ts:76-87` and `:746-749`; introduced by `5838d64b2`, mine) is documented as *"advanced ONLY by `updateFromWebSocket`"* and *"the only writer fed by a venue PUSH"*. That commit enumerated the cache's own REST writers and missed that `updateFromWebSocket` has a REST caller. `updateCache` calls it whatever its `source` (`live-pricing-adapter.ts:1088-1171`); P19-B8.9a's rename (`:1083-1087`) put the true source on the adapter's own map and not on this hop. So:
- `aee:2351`, REST fallback, `source 'kraken_rest'`: sets `lastSource: 'kraken_ws'` and `lastWsMessageAtMs = now` (`price-cache.ts:735`, `:749`).
- `aee:2217`, xStock mark, re-written every engine cycle from the archiver's latest tick while it is inside the mark-age ceiling: the same, on the engine's clock rather than a push.
Sides and their stamps are untouched on both (null sides; `:739-745` carry them).
**Readers, repo-wide:** the counter `countSymbolsWithWsMessageSince` at `rtb-refresh-service.ts:445`, `signal-orchestrator.ts:2599`, `vts-runner.ts:1620`; the field at `aee:2546`. **All four feed `recordSideAgeAttempt`, which records and decides nothing.** `lastSource` is read at `touch-price.ts:206` (the ticker leg's producer label), `signal-orchestrator.ts:2635` (the F2 split) and `routes.ts:10591-10592` (source counts on the cache status endpoint): labels and display only.
**Three more ways the field and its counter misstate a push** (found by a second reader, each re-derived at the ref):
- **The dual-key REST write copies one key's value onto another.** When a REST response matches a requested symbol spelled differently from its normalised key, the SAME object is written under both (`price-cache.ts:290-294`; also `:450-453`, `:576-581`), carrying the normalised row's `lastWsMessageAtMs` (`:282`). The requested key's field can be advanced or reset to `null` with no push.
- **The counter counts cache KEYS, not symbols** (`:495-500`), so a dual-key symbol counts twice and a phantom counts once, while the recorder describes the term as distinct symbols (`level-basis.ts:763-767`).
- **The per-symbol gap summary pools two clocks.** `_symbolGap` is keyed by symbol alone (`level-basis.ts:913-916`); the exit stage feeds it `lastWsMessageAtMs` (`aee:2546`) and the RTB, signal-birth and VTS stages feed it `lastUpdatedAt` (`rtb-refresh-service.ts:464`, `signal-orchestrator.ts:2594`, `vts-runner.ts:1615`). It is read by `getSymbolGapRows` (`:1048`), the staleness gate's future second term.
**Direct assignment to a cached row's `bid`, `ask` or stamps, anywhere in `server/` including tests: 0** (pattern proved on fixtures). Mutation through `Object.assign` or a spread over the same reference was not searched.
**Magnitude:** `out.log`, 21:04:12Z → 21:33:53Z (Saturday, xStock shut, WS healthy): **1,280,237** `kraken_ws` cache writes, **0** `kraken_rest`, **0** `kraken_equities_ws` (`[I7-WS-D][CACHE_WRITE] … source=` prints on every `updateCache`, `live-pricing-adapter.ts:1174`). ⚠️ **The two zeros have no positive control in the retained window** (no fallback fired and no xStock was open), so they read as *no opportunity*, not as absence. **The cost is conditional on the failure the counter exists to catch:** in a WS outage every held crypto symbol goes to the fallback each cycle and is counted as pushed, so the push count floors at the number of held symbols (7 crypto positions open at 21:36Z) instead of falling toward zero. **Nothing decides on it today; the third term of the staleness gate will** (`3b.f-c`).

### 8.3 Who READS the sides: the §4 census the scope owed
Every `.bid` / `.ask` read of a cache row, repo-wide, tests excluded. All but two (`signal-orchestrator.ts:2629-2630` and `vts-runner.ts:1854-1856`, both in the table) pass through `tickerLegFromCachedQuote` (`touch-price.ts:174-175`) into `buildLevelBasis`, whose ladder refuses `no_book`, `one_sided_book`, `non_finite_side`, `crossed_book`, `locked_or_synthetic_book` in that order before age (`level-basis.ts:212-222`). The ticker leg is the SECOND rung: it decides only when the book rung is missing or refused.

| site | job | kind |
|---|---|---|
| `aee:475` → `crypto-touch.ts:119`, used `aee:1621-1625` | active resting-entry maker fill | **can fill a trade** |
| `aee:2479` → `:2511` → `:2638`, `:2691` (counter `:182`) | active exit trigger (bid) and exit-rest fill | **can close a trade** |
| `vts-runner.ts:2264` | VTS maker placement (ask) | VTS decision |
| `vts-runner.ts:3229` | VTS pending maker fill | VTS decision |
| `vts-runner.ts:3343` → `:3533` | VTS exit trigger and booking | VTS decision |
| `vts-runner.ts:4210` → `:4237`, `:4269` | VTS shadow-lane exit | VTS shadow |
| `signal-orchestrator.ts:2629-2630` | `recordFeedAgreement`, **RAW, no ladder** | record |
| `signal-orchestrator.ts:2643-2657`, `vts-runner.ts:1636-1651` | touch-selection shadows | record |
| `vts-runner.ts:1854-1856` | `VirtualSignal.spread`, read only by the CSV export (`routes/vts.ts:229`) | display |

Every other `priceCache` importer reads `.price`, `lastUpdatedAt` or the side stamps only (census by a second reader; the rows above re-derived at the ref: `level-basis.ts:212-222`, `touch-price.ts:174-206`, `vts-runner.ts:1854-1856`, `signal-orchestrator.ts:2622-2635`).
**What increment 2 changes for them.** 55 symbols were written by `updateFromRest` in 32.5 minutes (1,393 writes, most symbols about once a minute). **16 of them had no other side writer in that window** (not WS-written, not poller-subscribed; the `openTrade` lane logs no subscription line, so this is an upper bound): unless a writer outside the window set their sides, their rows hold the cold fabricated pair and every ladder read refuses them `locked_or_synthetic`. After increment 2 they hold the REST ask and bid, so **the ticker rung can decide where it refused**: an exit trigger, an exit-rest fill, a resting-entry fill, VTS placement, fill and exit. ⛔ **That is a SYMBOL census, not a decision claim (Langston C4).** These rows are written about once per **77 s** (1,393 writes / 55 symbols / 1,950 s) and a REST-stated side carries `venueObservedAtMs: null`, so it ages on the receipt clock. Against each rung's ceiling the share of time a fresh REST side exists is about **2.6% at the exit trigger** (`EXIT_TRIGGER_MAX_AGE_MS = 2_000`, `aee:293`), **10% at the entry fill** (`8_000`, `crypto-touch.ts:64`), **78% at signal birth** (`60_000`, `level-basis.ts:687`), and **all of it at the VTS exit** (`90_000`, `crypto-touch.ts:86`). Assumes an even cadence and no other side writer. The other 39 are also poller-written, 12 of them WS-written as well; for them the adapter's REST sides become one more writer (FINDING-3, §8.4).

### 8.4 FINDING-3 at increment 2's shape
**12 of the 55 are also WS-written** in the same window (`BCH`, `DASH`, `FET`, `GBP`, `PENGU`, `SN51`, `STG`, `SUPER`, `S`, `TREAD`, `VIRTUAL`, `ZRO`, all `/USD`). After increment 2, each adapter REST write replaces their WS sides with a receipt-stamped snapshot (`venueObservedAtMs: null`, OBJ-3), so their ticker rung flips to the receipt clock after every such write, the same flip Part A's C3 recorded for GBP/USD. **Stated, not contested** (scope §7: no recency contest; the stamp is honest and each reader applies its own ceiling).

### 8.5 Two obligations folded into `3n.l` from outside, and where each stands
- **`level-basis.ts:1118-1121`** (F2, 2026-09-13) folded into `3n.l` *"carrying a per-side producer on the cache entry"*, so the `kraken_ws` half of the feed-agreement split can say whether its sides came from the ticker channel or from the book's own top. **Increment 1's `sidesWriter: 'ws'` does not discharge it: both channels arrive as `'ws'`.** The comment at `:1110` also lists a `kraken_equities_ws` value that `PriceSourceTag` (`price-cache.ts:27`) does not have.
- **`#1060` amendment 4** (N-9). The quote at signal birth is 30-45 s old because the active lane reads the shared cache with no bucket and inherits VTS's cadence (`#977` amendments 3-4). Its fix is a cadence or subscription change, which this scope forbids. **Where it goes is ruled in §12.1: `3n.u5`, CC-B** (the crypto sibling of D4; am. 5 homed only the cost table and the `trade` finding into `3n.m`, so the birth read was left unhomed).

### 8.5b Second readers
`REVIEWER r1: claim-only · the producer census (§8.1) and the liveness mechanism (§8.2): what other states are consistent? · both held on the routes named; 7 additions: NaN book side, the one-sided re-date (already §8.1), dual-key copy, keys-not-symbols counter, _symbolGap pooling, lastSource status-route readers, by-reference mutation unsearched · re-derived y (each addition read at the ref; the mutation search run with a fixture control)`
`REVIEWER r2: object (§8.1-§8.3, P8, P9, P12 against the ref) · what other states are consistent? · 4 citation corrections (all-but-two, kwa:1168 file, :746-749, touch-price ends :257); 5 misses (cold one-sided ticker passes the ladder, venue stamp also re-dated, NaN reaches the mark and two raw readers, .symbol dedupe breaks after a single-key write, book_not_eligible); P9(i) loses nothing, flips lastSource so P9 and P11 must land together · re-derived y (each read at the ref; all folded above)`
`REVIEWER r3: object (the nine r2 items against the ref) · satisfied? · 8 of 9 satisfied; item 7 half-wrong (recordFeedAgreement refuses a NaN side) and one overclaim introduced (a cold one-sided row can land crossed and be refused) · re-derived y; both corrected. Cap of three rounds reached; the r3 items are fixed but not re-read by a fourth reader.`
The reader census in §8.3 was compiled by a helper and its rows re-derived at the ref as listed there.

### 8.6 Entry points and blast radius
No new scheduler, timer or subscription: every change is inside an existing write or read. The OBJ-12 edit sits in the v2 ticker handler, the highest-frequency producer in the system (about 245,000 messages in 40 minutes); it changes behaviour only on a frame with a non-positive side, seen 0 times above.

### 8.7 The six sources
Code at the ref (every site above) · logs (`out__2026-09-26_20-09-39.log`, `out__2026-09-26_21-36-39.log`, `out.log` to 21:33:53Z) and `active_open_positions` · `SYSTEM_IMPACT_MAP.md` (`:360` states the cold `bid === ask === price` shape at `price-cache.ts:402-416`, now `:725-726`; the registry row) · `SYSTEM_MANUAL.md:665` (OBJ-4's stale line; it moved from `:663`) · ledger (`#1056` am. 1-5, `#1060` am. 4-5, `#977` am. 3-4, `#742`) · provenance: `5838d64b2` (the liveness field), P19-B8.9a (the `updateCache` rename).

## 9. THE PLAN — each item points back at its finding

| item | what | from |
|---|---|---|
| **P6** | **OBJ-1 + OBJ-3:** `updateFromRest(symbol, price, bid, ask, sidesCapturedAtMs, sidesWriter, markKind, lastTradePrice)` — **the writer tag comes from the CALLER, as it does for `updateFromWebSocket` in P11 (Langston C2): the adapter passes `'rest_adapter'`, P9's engine route passes `'rest_engine'`** — with `updateFromWebSocket`'s side rules: a stated side wins, an unstated side keeps its value, the mark substitution only when neither exists; `sidesCapturedAtMs`, `venueObservedAtMs` (set to `null` when a side is stated, carried when not) and `sidesWriter` move only when a side is stated. `lastSource: 'kraken_rest'` and `lastWsMessageAtMs` carried, as today. **The docblock states the pairwise-or-nothing contract** (r4 condition 3) and names the two producers that meet it. | scope OBJ-1, OBJ-3; §8.1 |
| **P7** | **OBJ-2, the REST producer guard, PAIRWISE:** at `live-pricing-adapter.ts:876-897`, if either parsed side is non-finite or `<= 0`, pass BOTH as `null`. | scope OBJ-2; §8.1 |
| **P8 = OBJ-12 (NEW, fold)** | **One side predicate for every producer that carries sides, applied pairwise:** `Number.isFinite(x) && x > 0` for both, or neither is written. The v2 ticker emit (`kwa:905-906`) moves from per-side to pairwise; the book guard (`kwa:1168`) moves from `<= 0` to the finite test; P7's REST guard uses the same helper. **Without it, P6's docblock states a contract a live producer breaks on day one.** Zero observed frames change. | §8.1, N-3 |
| **P9 = OBJ-13 (NEW, fold)** | **`lastWsMessageAtMs` stops moving at the REST fallback and at dual-key REST writes, and its counter counts instruments** (the xStock re-write is P10's, not this row's; Langston C3). (i) `updateCache` routes `source === 'kraken_rest'` to `priceCache.updateFromRest` with writer tag `'rest_engine'` (null sides, so nothing about the sides moves): the engine's REST fallback stops advancing the field and labelling the row `kraken_ws`. This is the scope's own deletion-refusal argument (attack 3) applied to the one producer already doing what it forbade. (ii) A dual-key REST write gives each key its OWN previous `lastWsMessageAtMs` and last-trade carry, not the normalised row's. (iii) `countSymbolsWithWsMessageSince` and its any-write sibling count each instrument once, by a canonical form of the KEY. ⛔ Not by the row's `.symbol`: that merges a dual-key pair only while both keys hold the shared REST object, and a single-key rewrite (`:728`, `:761`) splits them again. ★ **P9 and P11 land together:** routing the fallback to `updateFromRest` flips `lastSource` to `kraken_rest` on a row whose sides may be WS-pushed, and the ticker leg's label (`touch-price.ts:206`), the F2 split and the status counts would carry that; P11 moves the label to `sidesWriter` in the same change. Nothing the fallback passes is lost: only `lastSource` and `lastWsMessageAtMs` differ between the two writers when no sides are stated. | §8.2, N-4 |
| **P10 (placed, not folded)** | **Two inputs of the staleness gate's second and third terms, which that row designs:** (a) the xStock mark re-write (`aee:2217`) re-publishes a Kraken WS tick on the engine's clock, and what `lastWsMessageAtMs` should hold for it (the archiver's receipt time, or nothing) is a choice of the shut-vs-impaired discriminator; (b) `_symbolGap` pools two clocks across stages. `HOME: added as an item to B-XSTOCK-SESSION-FRESHNESS, owner CC-C, PHASE_19_PLAN row 3b.f-c, placed beside its feed-liveness term.` | §8.2 |
| **P11 = OBJ-14 (NEW, fold)** | **`sidesWriter` names the channel:** `'ws_ticker' \| 'ws_book' \| 'rest_poller' \| 'rest_fetch' \| 'rest_batch' \| 'rest_adapter' \| 'rest_engine' \| null`. ⛔ **Langston BLOCKER (C1): `sidesWriterCensus` (`price-cache.ts:637-640`) types its counts `Record<string, number>`, so a widened union compiles and `counts['ws_ticker']++` prints `NaN`. Key it `Record<SidesWriter \| 'none', number>` so tsc fails on any future widening; Part A's V2 control is restated in this vocabulary in the same commit (§4).** ★ **The stronger reason for P11: `8c`'s own record rules its `byAcceptedSource` split UNINTERPRETABLE because `producer` comes from `lastSource` (`8C_AUDIT` lines 210-213, 304). P11 is what removes that floor.** `updateFromWebSocket` takes it from its caller (`updateCache` derives it from `producer`; the v1 direct call passes `null` sides, so it never sets one). **The ticker leg's producer label (`touch-price.ts:206`) and the F2 split (`signal-orchestrator.ts:2635`) switch from `lastSource` (who wrote the MARK) to `sidesWriter` (who wrote the SIDES)**; the `level-basis.ts:1109-1124` comment is rewritten to say the split is now possible, and drops the non-existent `kraken_equities_ws`. | §8.5 first bullet; touch-price RIDER 1 (`:184`) |
| **P12** | **OBJ-7, the book-present / book-absent split, per lane.** The funnel already emits both halves per lane, class and stage: book cell `attempted` vs `byReason.no_book`. What it lacks is the cross-tab: **ladder acceptances by the ticker rung, split by the book rung's verdict**. Three counters on the ladder cell (`book_absent` = `no_book`; `book_not_eligible`, which no caller produces today since all pass `bookEligible: true`; `book_refused` = every other reason), written in `recordTouchSelection` (`touch-price.ts:226-257`), which holds both verdicts. With P11, `byAcceptedSource` then shows `ticker_bbo:rest_adapter`, which is this increment's own effect by name. | scope OBJ-7; §8.3 |
| **P13** | **OBJ-4:** `SYSTEM_MANUAL.md:665` corrected (the WS writer's live signature), stating what it previously asserted. **OBJ-5:** a `RUNNING_ISSUES` entry for the `🔒 LOCKED` header with both measurements and a `HOME:` line, naming `getAllCachedPrices()` (`price-cache.ts:503`, zero callers, re-checked) as a rule-18 deletion candidate with its home. **OBJ-6:** none (N-7). | scope OBJ-4-6 |
| **P14** | **`#1060` am. 4 withdrawn from `3n.l`** (N-9), **and homed by Langston's ruling at `3n.u5` `B-CRYPTO-BIRTH-FEED`, owner CC-B** (§12.1); am. 4 amended in place. Nothing of it is built in this increment. | §8.5 second bullet |
| **P15** | **Tests, each with a mutation that must fail it:** P6 per arm, including the arms that must NOT move (no sides stated ⇒ both stamps and `sidesWriter` untouched; cold one-sided ⇒ legacy pair, refused `locked_or_synthetic`); P7 `bid=0, ask=real` ⇒ nothing moves (mutation: per-side coalescing); P8 the same on the ticker emit; P8 a `NaN` book side writes nothing; P9 `kraken_rest` leaves `lastWsMessageAtMs` and `lastSource` alone (mutation: always `updateFromWebSocket`), a dual-key write leaves the requested key's own value (mutation: shared object), and two keys for one symbol count once; P11 ticker and book land as `ws_ticker` and `ws_book`; P12 a walk with `no_book` + ticker accept counts `book_absent`, one with `stale_book` + ticker accept counts `book_refused`. | P6-P12 |

**Nothing in the plan is UNAUDITED.** P8, P9 and P11 are folds proposed by this audit (§9.4 disposition 1); each is small, in a file the increment already edits or one line from it, and each is Langston's to accept or send to its own row.

## 10. VERIFICATION, PRE-REGISTERED BEFORE ANY DATA
- **V5 (OBJ-1..3):** P15's fixtures and mutations; `check-tsc-baseline` 377 = 377; the related-file suite green.
- **V6 (live, after the one deploy), PRE-REGISTERED PER RUNG (Langston C4):** on the §8.3 cold-only symbols, `ticker_bbo:rest_adapter` acceptances appear in `byAcceptedSource` at roughly the duty cycle of each rung: **exit trigger ~2.6% of walks, entry fill ~10%, signal birth ~78%, VTS exit near 100%**. ⛔ **The inverse is itself a finding: a MATERIAL rise at the 2 s exit-trigger rung means the REST cadence is not the one §8.2 measured.** A one-sided REST symbol moves to `locked_or_synthetic` (cold) or ages out (warm), which is NOT a regression (N-10).
- **V7 (OBJ-13):** with no WS outage, `lastWsMessageAtMs` behaviour is unchanged and there is nothing live to see; **the test is the fixture, and a live zero is recorded as "no opportunity"**.
- **V8 (OBJ-7):** the per-lane book split and the new cross-tab are printed. **Pre-registered: on the active crypto lane the book is absent on ~100% of walks** (37,187 of 37,187 `no_book` on 2026-09-13), so `book_absent` carries nearly every ticker acceptance until row `3n.m` changes coverage; the split is what makes that change visible instead of confounding.
- **V9 (FINDING-3):** Part A's V4, re-read at this shape on the 12 both-writer symbols.
- **C6 still binds, and is wider than stated (Langston):** the one deploy carries both increments AND every runtime commit since staging's `bc199185e` (the deploy-drift rungs), so no post-deploy reading is a pre/post control for any single change in it.
- ⏳ **Shelf life:** `out.log` keeps about 7 hours; V6-V9 are harvested inside it and written to the record the same day.

## 11. RISKS AND WHAT THIS INCREMENT DOES NOT DO
- **Money-moving blast radius:** P6-P7 let the ticker rung decide on up to 16 symbols where it refused (§8.3), in paper and VTS, **for about 2.6% of the time at the exit trigger and 10% at the entry fill**; most of the change lands at signal birth and in VTS. Every acceptance still passes the full ladder, including age and the spread ceiling.
- **P8 edits the busiest producer in the system;** its only behaviour change is on a frame class seen 0 times in 245,159.
- **The deploy still waits** for `8a-P4c` (2026-09-30T00:00Z) and `3n.q8` (Part A §5); `8c` no longer holds it (N-6).
- **Not done here:** no new REST call, poll or cadence change; the resolver stays untouched (`3n.l-a`); the xStock liveness question (P10) and the signal-birth age (P14) are placed elsewhere.

## 12. STEP-2 RULING (Langston, 2026-09-26 22:03Z): APPROVED WITH SIX CONDITIONS; P14 SENT BACK
He re-derived every code claim at `c84e10119`, including P9(i)'s field-by-field equivalence (with null sides the two writers differ in exactly `lastSource` and `lastWsMessageAtMs`). **The three folds P8, P9, P11 are accepted.** N-6 and N-7 confirmed by him: `8c` no longer holds the deploy; OBJ-6 needs no edit.
| # | condition | where it is met |
|---|---|---|
| **C1** (blocker) | P11 would print `NaN` in the census, which tsc cannot catch, and deletes Part A V2's `ws` control | P11 (counts keyed to the union); §4 V2 restated |
| **C2** | P6 hardcoded `'rest_adapter'` while P11 takes the tag from the caller | P6 (tag from caller; `'rest_engine'` for P9's route) |
| **C3** | P9's title said *"at every writer"*; `aee:2217` is P10's | P9 retitled |
| **C4** | the blast radius was a symbol census written as a decision claim | §8.3 duty cycles per rung; §11; V6 pre-registered per rung with its inverse |
| **C5** | N-3's zero-or-null count does not cover P8's whole predicate | N-3 |
| **C6** | the engine-REST-tick zero rested on a window 2.8 min shorter than the tick count's | §8.1: same-file `REST_FALLBACK` count plus the structural reason |
**P14 is sent back:** the withdrawal from `3n.l` is approved; the destination is argued in §12.1. His note on C6's reach (the deploy also carries the drift backlog) is folded into §10.

### 12.1 P14 — RULED (Langston, 2026-09-26 22:11Z): HOME `3n.u5`, OWNER CC-B, AFTER `3n.u4`
**The question:** the quote that sets the active lane's entry, stop and target at signal birth is 30-45 s old at the median, none of it pushed, because the active lane reads the shared cache with no bucket and inherits VTS's 60 s cadence (`#977` am. 3-4; `#1060` am. 4). Where does *"is that the right feed for this job"* live?
1. **Its sibling is already homed (D4).** The xStock analogue, birth levels from a 15-minute bar while the validity gate measures tick age, was determined by Langston and Coltrane on 2026-09-18 (`B_FEED_BY_SITUATION_AUDIT_FIRST_PASS.md`, DETERMINATIONS row D4) and landed as `3n.u` item (2), owner CC-B. The crypto analogue belongs with it: same class of question, same family, same owner.
2. **It was never homed anywhere.** `#1060` am. 5's disposition (`RUNNING_ISSUES` line 9145) homes exactly two things into `3n.m`: the cost table and the `trade`-channel finding. The birth read appears only in am. 5's ordering paragraph (line 9143, *"fix the birth read (plumbing, no new subscription)"*) and was never dispositioned: **unhomed, not re-homed.** ⚠️ *r2's first version said am. 5 "re-widened" `3n.m`; line 9145 describes a REDUCTION ("amendments 2-4 have already reduced …"). Corrected on Langston's condition 1.*
3. **Kyle's 2026-09-15 directive (`3n.t`) asks this exact question** for every path × class × job, including level-setting at signal birth. `3n.t`'s cell 4 (*"crypto quant birth: cache → smoother → level"*) was routed to `8c` for the SIDE; its freshness rule (first-pass line 9) is relative to the feed's own cadence, so a 30-45 s read of a 60 s bucket passes it and the right-feed question was never asked.
4. **Why `3n.u5` and not `3n.u`:** `3n.u` is DEPLOYED (`323ae2776`, 2026-09-19, Step 8 confirmed, in observation), and that family already splits post-hoc findings into `3n.u2`-`3n.u4`.
5. **The seam (Langston condition 3):** `8c` keeps the SIDE and the level-site conversion on cell 4; `3n.u5` takes which FEED the birth read draws from and at what cadence, and does not edit the level site (if its fix needs the level site, it sequences after `8c`). Written into `3n.u5`'s row and into cell 4's owner column.
6. **Determination gate before it is called a defect (condition 4):** Langston + Coltrane, as for D1-D5; rule-24 outcome 2. When it goes to Kyle (`#977`), **both halves**: ~4 bps of booking, and decision quality, which `#1060` am. 5 (line 9140) says *"is not expressible in bps and should not be argued as though it were"*.
Am. 4's locked-file reason is a sequencing concern: `3n.l` lands its `price-cache.ts` edits before any `3n.u5` change to that file. `3n.m` keeps the book's reach and channel cost, which is an input to `3n.u5`'s answer.
`HOME: B-CRYPTO-BIRTH-FEED, owner CC-B, placed in PHASE_19_PLAN at row 3n.u5, after 3n.u4`

## 13. STEP-3 ADDENDUM (2026-09-27, built at `69c9d8d1b`)
Two things surfaced while building, both folded, both named in the Step-4 change list (§5 calls 1 and 7):
- **P8 reaches three more producers than §9 named.** The cache's own REST ticker sites (`refreshBucket`, `getPrice`, `getBatch`) wrote `parseFloat(x || '0')` for each side unconditionally, with a fresh `sidesCapturedAtMs`: a missing side became a stated `0`. §8.1's census listed the routes into `updateFromWebSocket` and the adapter's `updateFromRest`, and missed these three writers of the same fields. **Fixed with the same predicate, through one builder (`restTickerRow`) that replaces the three copies.** `MISTAKE: enumerator-blind-spot [B-REST-SIDES-TO-CACHE] — the producer census enumerated the two writer functions' callers and not the cache's own direct writes of the same fields.`
- **OBJ-4 also corrects chain step 5** of the same System Manual list (*"THE SIDES ARE NOT ON THE EVENT"*, stale since 2026-09-05).
