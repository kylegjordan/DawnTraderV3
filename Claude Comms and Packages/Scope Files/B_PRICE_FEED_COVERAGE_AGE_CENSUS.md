# B-PRICE-FEED-COVERAGE (#1222) — census of every price-age check (Step-1 evidence)

**Read at `origin/migration/aws-supabase` = `c8dfa3db1` (2026-11-07 ~20:00Z), read-only.** Produced by a fresh reader (REVIEWER: object handed · "enumerate every place a price's age is compared to a bound, with checkpoint, class, bound, clock, decides-or-displays, introducing commit" · 46 rows · re-derived y for the two load-bearing claims below, n for the rest — the rest is Step 2's to re-derive per §9.5(a)).
**Re-derived by CC-B at the ref:** (1) signal birth reads `priceCache.getCachedPrice(symbol)` with NO age check — only a non-zero test (`signal-orchestrator.ts:2451-2458`); (2) a WebSocket reconnect clears the set and re-subscribes open positions only (`server/exchanges/kraken/kraken-websocket-adapter.ts:776-782`).

**Enumeration method (the reader's):** age-variable-vs-bound comparisons (130 lines), `now − timestamp` vs bound, constants named `*MAX_AGE*` / `*STALE*` / `*FRESH*` / `*TTL*` / `*QUIET*`, quoted `module_constants` keys containing age/stale/fresh/cold/quiet and their migration seeds, SQL `NOW() - INTERVAL` windows, callers of each judging function; ~30 files read in their relevant sections. **Not every one of the 164 files matching "stale" was read line by line**; ordinary cache lifetimes that are not price ages were excluded on purpose (list at the end). Seeded values are from migrations, not the live DB. Commit lookups were not path-limited, so a first hit can be a design document (named in "Not resolved").

⚠️ **STATUS (Coltrane, scope r2): a CANDIDATE INVENTORY, not an exhaustive census.** The title says "every price-age check"; the method did not read all 164 keyword matches, so a missing row cannot be ruled out. Step 2 reconciles it against an independent decision-seam-first enumeration and the live `module_constants` values.

**Count: 46 rows; 26 carry DECIDES.** ⚠️ **PREVIOUSLY STATED (r1/r2 header): "22 change a trading action (11 crypto, 9 xStock, 2 both)". NOW: 26 rows carry DECIDES (12 crypto / 11 xStock / 3 both — Langston's parse, re-derived by CC-B with the same 7-cell split). REASON: the reader's 22 silently excluded four source-selection rows; the set is now ENUMERATED below, not counted.** "Receipt" = our own receive/write time.

### THE DECIDING SET, BY ROW ID (scope r3, OBJ-6 binds against this list)
| bucket | rows | disposition |
|---|---|---|
| **ENTRY estimand — in scope** | **#1, #2, #3, #5, #6, #8, #9, #10, #23, #46**, plus **B0 = crypto signal birth** (`signal-orchestrator.ts:2452`, NO bound today — absent from the table because there is nothing to find) | read the entry instantiation of the standard (OBJ-2, OBJ-6) |
| **EXIT estimand — in scope, separate instantiation** | **#7, #11, #12, #18, #19** | read the exit instantiation (distance = the stop budget, event = crossing the stop/target), derived separately; until it is derived and reviewed, each keeps its current measured contract |
| **VTS learning lane — excluded** | #20, #21, #24 | the VTS is the learning lane, not the trading pipeline; any alignment is a separate decision |
| **source selection, not a trading action — demoted** | #13, #14, #16, #26 | each decides WHICH source to read or whether to re-fetch, not whether a trade acts; they serve the central reader and are re-checked at Step 2 for any trading consequence |
| **feed maintenance — inputs to `sourceHealthy` (OBJ-1)** | #30, #39 | resubscribe / reconnect operations, not price admission |
| **close grading — excluded** | #28 | grades a close against a witness after the fact (`B-CRYPTO-FEED-WATCHDOG`) |
| **ranking sample use — excluded** | #40 | AMR friction-sample freshness, not a price that decides an action |
Total: 10 + 5 + 3 + 4 + 2 + 1 + 1 = **26** census rows, plus B0.

| # | file:line | checkpoint | class / feed | bound and source | clock | decides? | introducing commit (first `-S` hit) |
|---|---|---|---|---|---|---|---|
| 1 | `xstock_spot/active-dispatch.ts:184` | xStock active dispatch | xStock / DB snapshot | 15,000 — `xstock_fill_safety.active_fill_max_age_ms` (seed 2026-06-14) | DB `NOW()−MAX(captured_at)` | DECIDES (skip + alert) | 69e65b24e 2026-06-15 "P19-B4a C3 design ask: freshness(15s)+equity-session(RTH liquidity gate)+silent-stall watchdog; evidence from Fri session" |
| 2 | `execution/depth-source.ts:306` ← `active-execution-engine.ts:622,645` | entry fill, open depth gate | both / crypto WS book, xStock DB snapshot | 5,000 crypto, 15,000 xStock — `fill_depth_gate.warmth_max_age_ms` (seed 2026-06-16) | crypto book receipt; xStock `captured_at` | DECIDES | b74526dc3 2026-06-16 "P19-B4b.1 Step-3: depth-walked paper fill + partial-open + #295 24/5 book-depth-sufficiency gate (DORMANT til B7b)" |
| 3 | `depth-source.ts:284` ← `engine:6413` | entry fill, re-checked at use | both | #2 + elapsed since read | source age + monotonic elapsed | DECIDES | c47156dba 2026-10-15 "B-ENTRY-CONSUMPTION-FRESHNESS: audit consumption seam" |
| 4 | `depth-source.ts:306` ← `engine:4662` | close fill (warmth stamped) | both | as #2 | as #2 | RECORD | b74526dc3 |
| 5 | `xstock_spot/price-liveness.ts:192` ← `engine:6209` | entry (open seam) | xStock / DB snapshots | `window_ms` 2,700,000, `min_moves` 1 — `price_discovery_liveness` (seed 2026-06-26) | `captured_at` | DECIDES (≥1 last-price change in 45 min) | 98b89e413 2026-06-26 "P19-B6.6 Step-2: pre-audit — OBJ-1 measurement + single-window (no-tier) recommendation (#236)" |
| 6 | `core/trading/crypto-touch.ts:70` ← `engine:1887` | resting maker entry fill | crypto / WS book, then cache sides | 8,000 hardcoded | book receipt; sides venue-else-receipt | DECIDES (no fill this tick) | 0b6c93d20 2026-09-15 "B-PRICE-SIDE-BY-JOB 8a-P3 r4: the entry-fill age limit measured on the lane that feeds it - 8 s, not the exit lane's 2 s" |
| 7 | `crypto-touch.ts:151` ← `engine:3264` | exit trigger | crypto | 2,000 hardcoded | as #6 | DECIDES | b434511cf 2026-09-14 "B-PRICE-SIDE-BY-JOB 8a-P2 Step 3: the exit trigger moves off the midpoint - the selector was built, wired and connected to nothing" |
| 8 | same constant ← `rtb-retirement-ask.ts:49` | RTB refresh (retirement) | crypto | 2,000 | as #6 | DECIDES (refused ⇒ keep, unpriced) | b434511cf; read: 581e773c4 2026-10-12 (B-RTB-REFRESH-LIVE-PRICE Step-2) |
| 9 | `rtb-retirement-ask.ts:76` (cold-mark `:61`) | RTB refresh (retirement) | xStock / in-memory tick | per-symbol ceiling as #18 | tick receipt | DECIDES | 581e773c4 |
| 10 | `core/rtb/rtb-price-retirement.ts:59` | RTB refresh, decide-time re-check | both | `ceilingMs` from #8/#9 | age at read + elapsed | DECIDES (`ask_expired`) | e8f575d3c 2026-10-12 "B-RTB-REFRESH-LIVE-PRICE Step-4 r2: Langston conditions 1-3 folded …" |
| 11 | `exit-price-age.ts:19` ← `engine:2936` | exit mark read | crypto / adapter cache, else REST | 2,000 hardcoded | `cachedAt` | DECIDES re-fetch | cde9cbb75 2026-10-11 "B-PRICE-STALENESS-BOUND Step-3 part 2: the crypto exit age check (8g) and the stored-row tripwire (8g-bis)" |
| 12 | `exit-price-age.ts:39` ← `engine:2972` | exit decision re-check | crypto | 2,000 | `observedAt` | DECIDES (refuses exit) | cde9cbb75 |
| 13 | `live-pricing-adapter.ts:1407` | `getPriceWithFallback` fast path | crypto / WS cache | 2,000 `WS_CACHE_FRESH_MS` | `cachedAt` | DECIDES source served | 51b28b02e 2025-12-08 "Improve REST fallback logic for trading platform with new diagnostics" |
| 14 | `live-pricing-adapter.ts:1421` | flatten (`active-portfolio-manager.ts:294`), stale-row reconcile (`active-engine-service.ts:404`), diagnostics, routes | crypto | default 5,000; callers 5,000 / 2,000 / 30,000 | `cachedAt` | DECIDES re-fetch; stale still served as `last_known_good` | 8f1911909 2025-10-15 "Improve real-time trading simulation with accurate slippage and fee modeling" |
| 15 | `live-pricing-adapter.ts:525`, `:569` | `getPrice` / `getAllPrices` | crypto | 1,000 `CACHE_TTL_MS` | `cachedAt` | display / metrics | fc3ca003d 2025-12-04 |
| 16 | `live-pricing-adapter.ts:1306` | trade-open last-known-good seed | crypto | 60,000 literal | `cachedAt` | DECIDES overwrite | eff82572e 2025-12-06 |
| 17 | `live-pricing-adapter.ts:382` | venue-quiet badge (`routes.ts:4882`, `:12063`) | both | 60,000 `VENUE_QUIET_MS` | `observedAt` | DISPLAY | b28cf7074 2026-07-17 (P19-B8.9) |
| 18 | `engine:2516` (formula `mark-staleness.ts:~219`) | exit decision; xStock pending entry fill shares the frame | xStock / in-memory tick | `clamp(budget/σ, 15,000, 300,000)`, `budget_k` 0.5, `null_stop_budget_pct` 0.005 — `mark_staleness` (seed 2026-07-21) | receipt of last CHANGED frame | DECIDES (skip exit check) | e48a623da 2026-07-22 "P19-B8.5e Step-3: risk-derived per-symbol mark-staleness ceiling (#548)" |
| 19 | `engine:2489` | exit, cold mark | xStock | `min(cold_mark_max_ms 15,000, ceiling)` (seed 2026-10-11) | replay receipt | DECIDES (wait vs skip) | 9d7af7398 2026-10-11 (B-PRICE-STALENESS-BOUND Step-2 r3) |
| 20 | `xstock_spot/vts-xs-guard.ts:43` ← `vts-xs-select.ts:58` | VTS exit bid, entry ask, pending fill | xStock / DB snapshot | #18's per-symbol ceiling | `captured_at` | DECIDES | d5c758f10 2026-09-30 (B-PRICE-SIDE-BY-JOB 8a-P4c) |
| 21 | `vts-runner.ts:3710`, `:4742` (SQL) | VTS xStock quote rows | xStock / DB | 5 min hardcoded | `captured_at` | DECIDES (`no_row`) | not looked up |
| 22 | `vts-runner.ts:6780` (SQL) | VTS UI price map | xStock / DB | 5 min | `captured_at` | DISPLAY | not looked up |
| 23 | `xstock_spot/scanner.ts:647` (SQL) | signal birth quote enrichment + VTS entry quote | xStock / DB | 30 min hardcoded | `captured_at` | DECIDES (no quote ⇒ no ask) | unreliable lookup |
| 24 | `crypto-touch.ts:92` ← `vts-runner.ts:2459`, `:3836`, `:3992`, `:4800` | VTS placement / pending fill / exit / shadow exit | crypto | 90,000 hardcoded | as #6 | DECIDES | 35710a5b7 2026-09-15 (B-PRICE-SIDE-BY-JOB 8a-P3 r2) |
| 25 | `level-basis.ts:719` ← `signal-orchestrator.ts:2734`, `vts-runner.ts:1825` | signal birth, active + VTS | both | 60,000 hardcoded | as #6 | RECORD only (shadow) | 8f18763ec 2026-09-05 |
| 26 | `price-cache.ts:637` (intervals `:220-223`) | RTB refresh (readyToBuy bucket), VTS (vtsSimulation bucket) | crypto / REST poll | openTrade 2,000 · readyToBuy 15,000 · fx5Snapshot 30,000 · vtsSimulation 60,000 | `lastUpdatedAt` | DECIDES REST fetch | d414ed482 2025-12-22 |
| 27 | `vts-runner.ts:6805` | VTS open-trade distances | crypto | 120,000 | `lastUpdatedAt` | DISPLAY | 00ba0d25c 2026-01-21 |
| 28 | `core/trading/witness-vouch.ts:46` ← `engine:4734` | close-fill grading | crypto / archive | 21,600,000 `close_fill_contract.witness_max_age_ms` (seed 2026-11-04) | `captured_at` | DECIDES grading | 4e779ffc8 2026-11-04 (B-CRYPTO-FEED-WATCHDOG) |
| 29 | `reserve-row-tripwire.ts:76` | stored closed rows | crypto | 2,000 + 1,500 | `closed_at − exit_observed_at_ms` | ALERT | 839aeb386 2026-10-12 |
| 30 | `kraken-websocket-adapter.ts:3392` | subscription audit (open positions) | crypto / WS | 30,000 | WS receipt | DECIDES resubscribe | 828c676bc 2025-12-09 |
| 31 | `kraken-websocket-adapter.ts:2110` | `getStaleSymbols` | crypto | 3,000 | WS receipt | DISPLAY | 24ea44a38 2025-11-02 |
| 32 | `kraken-websocket-adapter.ts:2256` | tick-health log | crypto | 3,000 | WS receipt | LOG | 00d1c1c8b 2025-12-08 |
| 33 | `kraken-websocket-adapter.ts:2416`, `:2425` | WS-vs-REST label | crypto | 25,000 | WS receipt | DISPLAY | 71688c3f3 2025-12-10 |
| 34 | `health-monitor.ts:532` (value `:190`) | heartbeat health | crypto / WS freshest | 20,000 | WS receipt | ALERT / DISPLAY (recovery branch `:742` unreachable) | 2c59788f8 2025-11-02 |
| 35 | `market-data/feed-health-aggregate.ts:160` ← `feed-integrity-monitor.ts:331` | feed-integrity alarm | both | crypto 5,000/10,000, xStock 60,000/120,000 `feed_health` | receipt | ALERT | d0a40fabc 2026-06-26 |
| 36 | `xstock_spot/qd-probe-metrics.ts:98` | quote-depth probe | xStock | 600,000 `qd_probe.freshness_ceiling_ms` | `captured_at` | TELEMETRY | eab5fde27 2026-06-16 |
| 37 | `routes.ts:8159-8160` | xStocks observation tab | xStock | 90 s / 600 s | `lastTickAt` | DISPLAY | c927924df 2026-05-10 |
| 38 | `routes.ts:10271` | price-cache diagnostics | crypto | 2,000 | `lastUpdatedAt` | DISPLAY | 97c92ab3a 2025-12-09 |
| 39 | `passive-archive/equity-spot-archiver.ts:604` | xStock feed stall watchdog | xStock / WS | 75,000 RTH / 750,000 off-hours `xstock_fill_safety` | data receipt | DECIDES reconnect + alert | d2313476a 2026-06-15 |
| 40 | `xstock_spot/friction-sample-store.ts:135`, `:164` | AMR spread samples | xStock | 150 s `amr_friction_sample.freshness_window_seconds` | capture | DECIDES sample use | 0cfd7e361 2026-06-11 |
| 41 | `venue-quiet-alerting.ts:147` | venue-quiet verdict | xStock | 60,000 | receipt | ALERT | fe830d69c 2026-10-10 |
| 42 | `market-data/book-ticker-disagreement.ts:76` | book vs ticker probe | crypto | 250 | book receipt | RECORD / ALERT | 92a78b05e 2026-09-11 |
| 43 | `xstock_spot/vts-xs-instrument.ts:119` | VTS what-if ceilings | xStock | 15/30/60/120/300 s | `captured_at` | TELEMETRY | da65fda23 2026-09-22 |
| 44 | `unified-filter-gateway.ts:101-103` | filter-pool freshness label | crypto | 300,000 / 600,000 | entry ts | DISPLAY | 5282e3314 2025-10-23 |
| 45 | `alert-context-engine.ts:148` | alert context | — | 5 / 10 / 30 s | `tick_age_sec` | none — **no importer (rule-18 candidate)** | 20ccad58c 2025-10-21 |
| 46 | `xstock-ohlc-cache.ts:224`, `:280` | xStock signal-birth price = latest 15-min bar close (`scanner.ts:922`) | xStock / bars | 300,000 cache lifetime | `fetchedAt` | DECIDES re-fetch only; **nothing bounds the bar's own age** | not looked up |

**Left out on purpose (not a price's age):** the σ estimate's own age (`sigma-rate-cache.ts:84,:167`, `sigma_max_age_ms` 900,000 — feeds #18); RTB cost-geometry age (`ready_to_buy_service.ts:369`); macro-feed staleness; spread/volume/OHLC indicator caches; `RTB_TTL_SECONDS`; the price-cache refresh scheduler; `level-basis.ts` histogram edges; the retired `exit_integrity.max_equity_tick_age_ms`.

## (a) Which crypto symbols get a trading-WebSocket subscription; what prices signal birth
- Added on: trade open (`active-execution-engine.ts:7055`), crypto RTB upsert when not already subscribed (`ready_to_buy_service.ts:2373-2375`), engine start via the open-positions provider (`engine:1343`, adapter `:3281`), the 5 s audit (open positions only, `:472`, `:3415`), a diagnostic route (`routes.ts:9816`).
- **Signal birth has no age bound.** `signal-orchestrator.ts:2452` uses whatever cache row exists — a WebSocket write if subscribed, else the VTS runner's REST batch in the 60 s bucket (`vts-runner.ts:5612-5626`). The `fx5Snapshot` bucket is never filled at this ref; the comment at `signal-orchestrator.ts:2449-2450` relying on it is stale.

## (b) What a reconnect re-subscribes
- Reconnect branch (`:776-782`): clears the set; `i8cResubscribeAllOpenPositions` re-subscribes the provider's crypto **open positions only**. RTB-queued symbols return only on their next upsert.
- Non-reconnect open (`:783-789`): re-sends the prior set. `softResubscribeAll` (`:4255`) saves the set (RTB symbols included), closes, clears, reconnects, and re-subscribes the saved set one second later **only if connected at that moment** (`#1222` Langston B5).

## (c) Where xStock prices are read
| stage | source | where |
|---|---|---|
| signal birth price | latest 15-min bar close | `scanner.ts:922` (OHLC cache `:595`) |
| signal birth bid/ask + VTS entry quote | DB snapshot, 30-min window | `scanner.ts:636-648` |
| active dispatch freshness | DB snapshot | `active-dispatch.ts:74-85` |
| open depth gate, consumption check | DB snapshot | `depth-source.ts:89-100` |
| open liveness | DB snapshots | `price-liveness.ts:147` |
| pending entry fill, exit mark | in-memory tick (`getLatestEquityTick`) | `engine:2425-2516` |
| RTB refresh | in-memory tick | `rtb-retirement-ask.ts:59` |
| VTS | DB snapshot | `vts-runner.ts:3700-3712` |

## Not resolved by the census (Step 2 owns them)
- First-hit commits that are documents, not code: 69e65b24e, 98b89e413, eab5fde27, 4e779ffc8, d2313476a, 9d7af7398, 0cfd7e361; rows 21, 22, 46 not looked up; #23's lookup unreliable.
- Live `module_constants` values not queried (seeds shown).
- Not traced: whether the VTS REST batch runs before signal birth reads the cache in the same cycle; the xStock pending fill's reuse of the exit's judged frame (taken from comments `engine:2389-2392`).
- Possible dead code: `alert-context-engine.ts` (no importer); `health-monitor.ts:742` unreachable.
