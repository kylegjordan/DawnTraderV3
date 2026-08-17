# P19-B-PERPFEED — Pre-Implementation Audit (Step 2)

**CC-C, 2026-08-17.** Scope approved at `13d20f7c2` (Langston at-ref, Review=Approved on the board). Every number below is a live measurement made today with its object and population named (rule 29a); positive controls noted where silence is load-bearing.

---

## 1. Live probes — Kraken Futures instruments endpoint

**Object:** `GET https://futures.kraken.com/derivatives/api/v3/instruments`, filtered to `tradeable=true`, probed 2026-08-17 from staging.

- **276 tradeable `PF_` linear perps (all USD-quoted) + 4 tradeable `PI_` inverse perps** (`PI_XBTUSD/ETHUSD/LTCUSD/XRPUSD`) — matches Langston's Step-1 counts exactly.
- **★ THE PAYLOAD CARRIES `base`, `quote`, `pair`, AND `category` FIELDS — symbol-string parsing is UNNECESSARY for universe members.** `PF_AVAXUSD → base: "AVAX"`, `PF_AAPLXUSD → base: "AAPLx"`. The canonicalizer mapping for universe members can be built from fields, with the §3 regex trap relevant only to symbols arriving OUTSIDE the loader's field-driven map (defense in depth, not the primary mechanism).
- **★ THE EQUITY DISCRIMINATOR, fully enumerated:** `base` ending in **lowercase `x`** marks exactly **16** instruments — Langston's 16. `category: "xStocks"` marks only **14** of them; the two divergent are `PF_ANTHROPICXUSD` + `PF_OPENAIXUSD`, `category: "Pre-IPO"` (tokenized pre-IPO shares — still tokenized equities). ⇒ **the equity-perp positive marker is the lowercase-x base convention (complete at 16), with `category ∈ {xStocks, Pre-IPO}` as corroboration.**
- **★ A THIRD CONTRACT CLASS NEITHER REVIEW NAMED: FX PERPS.** `tradfi: true` marks exactly **3** instruments — `PF_EURUSD`, `PF_GBPUSD`, `PF_CHFUSD` (FX perpetuals). Neither crypto nor equity. Under any "crypto = not-equity" subtraction they'd be silently misclassified — they fall to UNCLASSIFIED (refused + logged) under the both-sides-positive design **by construction** (base EUR/GBP/CHF is not a base asset of our crypto_spot universe). Named OUT for v1 alongside `PI_`.
- **★ `PF_SPXUSD` is a MEMECOIN** (`base: SPX`, `category: "Meme"` — SPX6900), not the S&P index. The definitive in-payload proof that name-shape reasoning fails and field-driven classification wins.
- **Category census over the 276** (for the record): DeFi 95, Layer 1 38, Community 20, AI 20, Meme 19, Gaming 15, Web3 15, xStocks 14, Layer 2 12, Commodities 5, Stablecoin 4, Forex 3, Privacy 2, RWA 2, Utility 2, DePIN 2, NFT 2, Infrastructure 2, Pre-IPO 2, DEX 1, DTF 1. The crypto positive set is NOT category-driven — it is **base ∈ crypto_spot dynamic universe** (the relevance filter IS the classification filter); everything failing both positive tests → UNCLASSIFIED, refuse + log.

## 2. Generalization premise — CONFIRMED

`GET https://futures.kraken.com/api/charts/v1/trade/PF_XBTUSD/1m` served **2,000 one-minute candles** (latest bar live at probe time). The REST OHLC path works unchanged for crypto perp symbols; **no second parameter axis needed** (Langston's OBJ-3 premise check passes).

## 3. Storage measurements — the sizing model, measured not assumed

**Object:** `pg_total_relation_size` per partition of `xstock_perp_ohlc_1m` + `xstock_perp_ticker_snap`; row counts per partition; 24h capture rates; staging DB, 2026-08-17.

| partition | size | rows |
|---|---|---|
| ohlc 2026-04 | 35 MB | (partial month — B74 deployed 04-30) |
| ohlc 2026-05 | **882 MB** | **446,400** |
| ohlc 2026-06 | 176 MB | — |
| ohlc 2026-07 | 173 MB | **446,400** |
| ohlc 2026-08 | 89 MB @ day 17 | — |
| ticker 2026-07 | 2,563 MB | (full month, 10 syms) |
| ticker 2026-08 | 987 MB @ day 17 | — |

- **★ THE MAY "OUTLIER" IS PHYSICAL BLOAT, NOT DATA:** May and July hold **identical row counts (446,400 = 10 syms × 1,440 × 31, zero duplicates by `(symbol, interval_begin)`)** in 882 vs 173 MB. The 5× difference is dead space from the deploy-era churn. Consequences: (a) the per-symbol rate model uses July (steady state, ~407 bytes/row all-in); (b) **the May partition is a ~700 MB reclaim candidate for one repack command — handed to the CC-B retention batch as a note, not this batch's work.**
- **★ THE SESSION-HOURS PREMISE IS OVERTURNED BY THE DATA — perps stream 24/7 regardless of the underlying's session.** OHLC: 14,398 rows/24h = the full 1,440/sym/day clock rate. Ticker: 188,252 rows/24h, distributed **dead flat ~7,800/hour through all 24 hours** (hourly histogram measured — no session shape whatsoever). The scope's uptime normalization is therefore NOT hours-of-session; the variable is **ticker message DENSITY**, bounded above by the 1s throttle.
- **The per-symbol steady-state model:** OHLC = **~18 MB/sym/month** (clock-driven, activity-independent, 1,440 bars/day × ~407 B). Ticker = **[256 MB observed … 1,180 MB throttle-ceiling]/sym/month** (xstock observes ~0.22 msg/sec/sym flat; a busy crypto perp can saturate the 1 msg/sec throttle = 4.6×).
- **★ THE LEVER THAT MAKES A USEFUL N AFFORDABLE: a PER-LEG ticker throttle.** The existing `b74_ticker_snapshot_min_interval_ms` (1,000 ms) is GLOBAL — one value for all legs (`setTickerThrottle`, `ticker-batch-writer.ts`). **Recommendation: a per-leg override for the crypto-perp leg at 5,000 ms**, capping its ticker at ~236 MB/sym/month ≈ the xstock observed rate. Cost to Phase-26 learning ≈ nil: funding rate moves hourly, open interest slowly, and 1m OHLC carries the price shape. Budget table (leg total, at the 5s-throttled ceiling + OHLC ≈ 254 MB/sym/mo): **budget 2.5 GB/mo → N≈10; 5 GB/mo → N≈20; 10 GB/mo → N≈39.** Without the per-leg throttle, worst case is ~1.2 GB/sym/mo → N≈4 per 5 GB. N is then re-derived monthly against the RESIDENT set per scope OBJ-1(a).

## 4. ⚠️ CORRECTION TO THE APPROVED GATE-EXIT SUBJECT (evidence-based; needs Langston's re-ruling)

The r6 amendment names *"a measured byte drop on an existing `xstock_perp_ohlc_1m` monthly partition — the 2026-05 one (882 MB, age-eligible)."* **Measured today, that subject cannot produce the evidence:**

- **Object:** `module_constants`, `module_name='data_lifecycle'`. `xstock_perp_ohlc_1m.hot_retention_days = 365`. The 2026-05 partition is ~3.5 months old — **not age-eligible until 2027-05** under the configured window. (It is also mostly BLOAT, not sweepable data — §3.)
- Under the whole-partition eligibility rule, the FIRST naturally-eligible partitions in this family are the **July TICKER partitions** (30-day windows): newest July row + 30d ⇒ eligible **~2026-08-30/31** — consistent with Langston's own 03fad8a4 triage ("ages out on its own around August 31st").
- The ticker sweep entries carry the CORRECT `captured_at` column, so that first drop **tests the sweep machinery end-to-end on this family but does NOT specifically prove the #685 OHLC column fix** — and under the current 365-day OHLC windows, **no OHLC partition becomes naturally eligible until 2027**, so the OHLC-specific proof cannot come from natural aging in any useful timeframe.
- **Proposed corrected exit (for Langston to rule on):** the gate exit's evidence is **(i)** a measured byte drop on the first naturally-eligible partition of this family under whatever windows Kyle's retention decision sets (natural first candidate: `xstock_perp_ticker_snap_2026_07`, 2,563 MB, ~08-30), **plus (ii)** the #685 OHLC column fix proven by the sweep's own per-table run log processing an OHLC table without the missing-column failure (or by a shortened OHLC window making a real OHLC drop measurable, if Kyle's decision shortens it). This keeps the principle — measured bytes, never a configured window — while naming a subject that can actually exist.

## 5. Reconciliation of the two RULED-ON-REPORTED-FACT items

- **#685's second defect ("crypto_spot retention constant does not exist at all"): NOT TRUE TODAY.** Measured: `crypto_spot_ohlc_1m.hot_retention_days = 365` and `crypto_spot_ticker_snap.hot_retention_days = 30` both exist in `module_constants`. Either seeded since #685's 08-08 measurement or #685's object differed — **reconcile against #685's record before the CC-B batch relies on it; #685's DEFECT 1 (the `'ts'` column) remains independently confirmed by Langston at-ref.**
- **The CC-B retention batch:** not yet visible as a filed batch at this pre-audit (no scope file; board not checked for it here). The dependency line stays as written — if #685 lands elsewhere, the line changes, not the gate.
- **New small finding while measuring:** three ORPHAN old-name constant rows exist under the B69-era names (`equity_perp_ohlc_1m.*`, `equity_perp_ticker_snap.*`, `equity_spot_*`) alongside the current-name rows. Nothing reads them (the sweep reads current names). Disposition at batch close (delete or annotate) — recorded here so a later grep doesn't read them as live config.

## 6. SIM census at every affected component (§9.5a — the five census questions)

**`crypto_perp_ohlc_1m` / `crypto_perp_ticker_snap` (new):** writers = the generalized archiver's crypto leg ONLY (via the shared batch writers). Readers = none at v1 (telemetry-only; drift-dashboard stats read counters, not tables). Mutators = none. **Deleters = `b75-retention-sweep.ts` via `PARTITIONED_TABLES`** (entering the list is OBJ-2 work; correct columns per scope). Schedulers = bootstrap (startup), REST poll timer (60s), partition cron (28th), retention sweep (nightly), monthly membership recompute (new).
**`equity-perp-archiver.ts` → generalized:** the singleton→instance conversion moves `ASSET_CLASS`, `state`, `getEquityPerpStats()` (consumed at `drift-dashboard-aggregator.ts:849`) and the bootstrap call site — the complete enumerated blast radius; no other importer exists (`grep -rn equity-perp-archiver server/` = 2 hits: bootstrap + aggregator, both named).
**`universe-loader.ts`:** gains the dynamic crypto-perp selector (instruments endpoint, field-driven). Existing three selectors untouched.
**`ticker-batch-writer.ts`:** gains the per-leg throttle override (recommendation §3) — today's global `setTickerThrottle` behavior preserved as the default.
**`symbol-canonicalizer.ts` + `shared/asset-classes.ts` (`:215` regex, `:625` `resolveAssetClass`, `:82-83` registry nulls):** per scope §3/OBJ-4. Membership sets exported from the loader's field-driven map; both sites consume them; UNCLASSIFIED refuses + logs.
**Kill-switches:** existing `b74_perp_capture_enabled` asserted unchanged (scope OBJ-3d); new key for the crypto leg.

## 7. Behaviour-preservation baselines (indicative; the FORMAL baseline re-measures immediately pre-deploy per scope OBJ-3a)

24h ending 2026-08-17 ~09:30Z: `xstock_perp_ohlc_1m` **14,398 rows** (= 10 syms × 1,440, complete); `xstock_perp_ticker_snap` **188,252 rows** (~7,800/hr flat). Post-deploy matched-window comparison targets these rates; the byte-level round-trip assertion covers the current static 10 (and the 10→16 capture-expansion question stays a §4-gated decision inside OBJ-4).
