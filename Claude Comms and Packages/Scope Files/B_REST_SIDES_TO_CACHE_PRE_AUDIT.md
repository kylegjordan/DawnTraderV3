# B-REST-SIDES-TO-CACHE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Increment 1 (OBJ-8, OBJ-10, OBJ-11, and OBJ-9's measurement half).** Increment 2 (OBJ-1..7) gets its own section in this file at its own Step 2.
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
- **V2:** the `sidesWriter` census shows GBP/USD's sides written by the REST poller on each `openTrade` pass. **Control:** a WS-fed symbol shows `ws`.
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
