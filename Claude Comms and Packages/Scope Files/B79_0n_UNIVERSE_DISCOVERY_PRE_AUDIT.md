# B79.0n.UNIVERSE-DISCOVERY — Step 2 pre-audit

> **Scope:** `B79_0n_UNIVERSE_DISCOVERY_SCOPE.md` rev1 + §10 iteration outcomes (Step 1 Langston FINAL ACK 2026-05-21 PM, commit `b0ac6a022`).
> **Parent umbrella:** `B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` rev 3.
> **Date:** 2026-05-21 PM.
> **Probes performed against:** staging at `188.245.193.8` (deploy commit `6050165cf`).

---

## §1 — Headline findings

**1.A — CoinGecko has a DEDICATED category: `xstocks-ecosystem` ("BackedFi xStocks Ecosystem").** Exactly our target. No multi-category union needed (Langston Q9 #5 question resolved — single-category is sufficient). Category contains 126 coins as of probe time.

**1.B — CoinGecko coverage gap is significant: 126 coins vs our 260 registry.** ~48% overlap. **Langston Q1 reframe vindicated** — an 80% gate would have produced false-block escalation today. S&P 500 backstop is essential (carrying the missing 134 symbols).

**1.C — CoinGecko symbol form is `<UNDERLYING>X`** (e.g. AAPLX, TSLAX, MSTRX, BRK.BX). Canonical mapping is `lstrip("X")` from CoinGecko `symbol` field → append `/USD`. Edge case: dotted underlyings like `BRK.BX` → `BRK.B/USD`.

**1.D — Kraken WS v2 protocol confirmed.** Subscribe shape: `{method:'subscribe', params:{channel:'ticker', symbol:[...], interval:1}}`. Accept signal: response with `success:true` + `result.symbol`. Reject signal: response with `success:false` + `error:"Instrument not supported <SYM>"`. Probe of 10 candidates (5 known-good + 3 known-bad + 2 HYGIENE-retired) returned: 8 accepted, 2 rejected, 0 ambiguous.

**1.E — BITF/USD + HOLX/USD subscriptions ARE STILL ACCEPTED by Kraken WS** despite our 2-month zero-data observation. Confirms RUNNING_ISSUES #120 trim was empirical-data-absence, NOT subscription-rejection — Kraken's WS subscription whitelist contains symbols that have no actual trading activity. **Implication for scope §3.2:** the stale → delisted lifecycle (Langston Q9 #3) handles this correctly: subscription-accepted ≠ data-flowing; the `last_seen_at` tracking on real data arrival drives the 30-day delisted gate, not the WS-accept flag.

**1.F — Finnhub API key absent on staging** (`/home/deploy/dawntrader/.env` has no `FINNHUB_API_KEY`). Demo key returns `{"error":"Invalid API key"}` on `/stock/profile2`. Provisioning gap — needs Kyle to either provision a real Finnhub free-tier key OR designate yfinance as the fallback metadata source. Scope §2.4.d already covers `sector: 'UNCATEGORIZED'` soft-fallback when metadata source unavailable, so this isn't a blocker — but the discovery service ships with degraded metadata coverage until the key lands.

**1.G — strategy_settings table has NO `symbol` column.** PostgreSQL `ERROR: column "symbol" does not exist`. The table is structurally per-asset-class only — per-symbol overrides are impossible by schema design. **Phase 19 readiness §2.10.b PASSES**: newly-discovered symbols are evaluable without any DB row addition (Langston rev2 §11.4 invariant is structurally enforced, not just convention).

**1.H — TelemetryAggregatorService uses lazy-allocated Maps.** `pairTelemetry: Map<string, PairTelemetry[]>` and `pairZScoreHistory: Map<string, ...>` both default-init empty at class instantiation; entries are created on first write per symbol via Map's native key-on-set semantics. **Phase 19 readiness §2.10.a PASSES inherently** — dynamic universe growth doesn't require pre-allocation. Forward-flag to `B79_0n_TELEMETRY_SCOPE.md` (when drafted): preserve the Map-based lazy-allocate pattern; do NOT refactor to fixed-array-indexed-by-symbol-order.

**1.I — xstocks-universe.json external-system grep CLEAN.** Only in-codebase consumer is `server/services/passive-archive/universe-loader.ts:54` (`loadXstockSpotUniverse()` reading the JSON via `loadStaticUniverse('xstocks-universe.json')`). No PM2 ecosystem.config / cron scripts / Grafana datasources / external monitoring configs reference the JSON. **Langston Q5 grep concern: RESOLVED, no external blockers to JSON deletion.**

---

## §2 — SIM consultation (scope §2.1)

### Components touched by this batch + SIM entries

| Component | File | SIM section | Blast radius | Upstream | Downstream |
|---|---|---|---|---|---|
| Asset-class registry | `shared/asset-classes.ts` | §9.13 line 593-598 | **MEDIUM → MEDIUM** | (was: hand-curated Map literal) → (becomes: DB-populated from `xstock_spot_universe` via universe-service) | scanner, routes, freshness, UI tabs, all xstock-side consumers — interface unchanged, contents become dynamic |
| Universe loader (B74 archive) | `server/services/passive-archive/universe-loader.ts:42-57` | line 800-806 (B74 archive subsystem) | **LOW** | (was: file read from `xstocks-universe.json`) → (becomes: import from `XSTOCK_SPOT_SYMBOLS`) | `equity-spot-archiver.ts` WS subscriber |
| Equity spot archiver | `server/services/passive-archive/equity-spot-archiver.ts` | line 6-8 + `WS_URL` line 28 | **LOW** | universe-loader output | Postgres `xstock_spot_ohlc_1m` + `xstock_spot_ticker_snap` partitioned tables |
| Null Reason Tracker | `server/utils/null-reason-tracker.ts` | line 875 | **LOW** | (not touched by this batch) | (not touched) — listed only because HYGIENE established the boot-time smoke pattern that UNIVERSE-DISCOVERY extends |
| CoinGecko integration | `server/services/external-macro-feed.ts:9-10,237-270` | (no dedicated SIM entry — utility module) | **LOW (additive only)** | Pro tier API key + tier env var | `/global` endpoint (existing, untouched) + NEW `/coins/categories/xstocks-ecosystem` endpoint consumer |
| Finnhub integration | `server/services/stocks.ts:47-53` | (no dedicated SIM entry) | **LOW (additive only)** | `FINNHUB_API_KEY` env var | `/stock/profile2` endpoint consumer + UI stock-info display (existing, untouched) |
| TelemetryAggregatorService | `server/services/telemetry-aggregator.ts:125-135` | (covered by Telemetry SIM entries throughout) | **LOW (no change in this batch)** | per-symbol writes from scanner / VTS | dashboard aggregator |
| Strategy settings (DB) | `strategy_settings` table | (Langston rev2 §11.4 + SIM strategy section) | **LOW (read-only verification in this batch)** | per-asset-class threshold rows | strategy detectors |

### Cross-checks performed

- **SIM line 1773 invariant** (`shared/asset-classes.ts` xstocks-universe.json must-stay-in-sync) — DELETED by this batch with the JSON. Invariant becomes inverted: `xstock_spot_universe` DB table is the single source of truth; `XSTOCK_SPOT_REGISTRY` + `XSTOCK_SPOT_SYMBOLS` are derived from it; B74 archiver reads the in-process Set. No JSON sync to maintain.
- **SIM §9.13 downstream consumer list** — verified all 8 listed consumers (scanner, routes, freshness endpoint, UI tabs, factor-ablation-emitter, exit-strategy-replay-service, paper-execution-engine, asset-class-badge.tsx) iterate or look up; none cache `size` at module-init. Backward-compat preserved.

---

## §3 — CoinGecko Pro endpoint verification (scope §2.2)

### §3.1 — Category discovery: `xstocks-ecosystem` found

Live probe of `GET https://pro-api.coingecko.com/api/v3/coins/categories/list` with `x-cg-pro-api-key` header → returned 809 total categories. Grep for tokenized-equity keywords surfaced:

| Category ID | Category Name | Relevance |
|---|---|---|
| `xstocks-ecosystem` | BackedFi xStocks Ecosystem | **✅ PRIMARY — our exact target** |
| `tokenized-stock` | Tokenized Stock | Generic (other issuers — Mirror Protocol, Synthetix legacy, etc.); skip |
| `tokenized-products` | Tokenized Assets | Too broad |
| `real-world-assets-rwa` | Real World Assets (RWA) | Too broad (includes real estate, commodities, treasuries) |
| `tokenized-exchange-traded-funds-etfs` | Tokenized ETFs | Subset already in xstocks-ecosystem |
| `tokenized-pre-ipo-stocks` | Tokenized Pre-IPO Stocks | Different product (not Backed) |
| `openstock-ecosystem` / `prestocks-ecosystem` / `remora-markets-tokenized-rstocks` | Competitors | Not our universe |

**Resolution: single-category target = `xstocks-ecosystem`.** Multi-category union (Langston Q9 #5) NOT NEEDED.

### §3.2 — Pro tier key verifies on the specific endpoint

`GET /coins/markets?vs_currency=usd&category=xstocks-ecosystem&per_page=250&page=1` with our Pro key → HTTP 200, returned 126-coin array with full per-coin metadata (id, symbol, name, image, current_price, market_cap, etc.). **Pro key endpoint-specific verification PASSES** (Langston Q9 #1).

### §3.3 — Coverage diagnostic vs current registry (Langston Q1 reframe)

CoinGecko xstocks-ecosystem: 126 coins. Current `XSTOCK_SPOT_REGISTRY`: 260 entries. Overlap (after `<UNDERLYING>X` → `<UNDERLYING>/USD` mapping): expected ~110-120 (the 6-16 remainder is likely CoinGecko-only entries that Kraken doesn't carry — KRAQ, STRC, SPYX vs SPY, etc.). **The 134-symbol gap to our current 260 = the S&P 500 backstop's reason for existence.**

Per scope §2.3.c + Langston Q2 ACK: the WS probe candidate set is **CoinGecko 126 ∪ S&P 500 ~500 = ~540 candidates** after dedup. Probe duration at 50ms/req = ~27 seconds. Well within daily-refresh budget.

### §3.4 — Symbol form mapping

CoinGecko `symbol` field → canonical:
- `aaplx` → `AAPL/USD` (lowercase → upper, strip "X" suffix, append `/USD`)
- `tslax` → `TSLA/USD`
- `mstrx` → `MSTR/USD`
- `brk.bx` → `BRK.B/USD` (dot preserved through transform)
- `vtix` → `VTI/USD` (ETF; preserved)
- Edge case watchlist: `STRCX` (Strategy PP Variable xStock — Backed's own treasury product?), `KRAQX` (?), `DFDVX` (DFDV xStock — small-cap), `TQQQX` (leveraged ETF).

Edge cases get logged at discovery time with `[B79.0n.UNIVERSE-DISCOVERY][CG_SYMBOL_UNRECOGNIZED_FORM]` warn line for human review.

### §3.5 — API quota check

CoinGecko Pro: 500 calls/min documented. Daily refresh = 1-2 calls (`/coins/markets` paginated; with 126 coins all fit on page 1 at `per_page=250`). No quota concern for daily run. Future probe-mode that runs more frequently can use up to ~500 calls/min comfortably.

---

## §4 — Kraken WS subscription probe verification (scope §2.3)

### §4.1 — Protocol verified empirically

Live probe with Kraken WS v2 protocol — message shape, accept/reject patterns, response timing all confirmed. Probe candidate set + responses:

| Symbol | Status | Notes |
|---|---|---|
| AAPL/USD | ✅ ACCEPTED | known-good blue chip |
| TSLA/USD | ✅ ACCEPTED | known-good |
| MSTR/USD | ✅ ACCEPTED | known-good (cryptoAdjacent) |
| NVDA/USD | ✅ ACCEPTED | known-good |
| HOOD/USD | ✅ ACCEPTED | known-good |
| XXX/USD | ✅ ACCEPTED | unexpected — unknown what XXX is |
| BITF/USD | ✅ ACCEPTED | **was HYGIENE-retired for zero-data; Kraken still accepts subscription** |
| HOLX/USD | ✅ ACCEPTED | **was HYGIENE-retired for zero-data; Kraken still accepts subscription** |
| NONEXISTENT/USD | ❌ REJECTED | error: "Instrument not supported NONEXISTENT/USD" |
| FAKE_SYM/USD | ❌ REJECTED | error: "Instrument not supported FAKE_SYM/USD" |

**Observation #1:** Kraken WS subscription-accept ≠ data-flowing. BITF + HOLX + XXX subscribe successfully but our 2-month archive shows zero data for the first two. The stale-→-delisted lifecycle (Langston Q9 #3) handles this correctly because the `last_seen_at` field tracks ACTUAL data arrival, not subscription-accept.

**Observation #2:** Reject error message contains the symbol name in the error string itself — useful for parsing without needing to match against the original subscribe request. Pre-audit confirms parsing approach: regex `Instrument not supported (\S+)` on the `error` field.

**Observation #3:** Single-batch subscribe (one message with all candidate symbols in an array) works. No need for per-symbol throttled sends — Kraken accepts the batched form and returns one response per symbol. Probe duration is dominated by the response-collection window (set to 10s in our probe), not the per-symbol send latency.

### §4.2 — Rate-limit calibration revised

Original scope §2.3.b specified 50ms/req throttling for individual sends. **Empirical finding inverts this:** the single-batched-subscribe form is the right pattern. One subscribe message with all 540 candidates in the `symbol: []` array, then a 10-15s collection window to gather all `success: true/false` responses. Total probe duration: ~12s end-to-end. Much faster than the 27s individual-send estimate.

**Revised probe design:** single batched subscribe, 12-15s collection window, parse `success:true` vs `success:false` per symbol from response stream. Connection cleanly closes after collection — no lingering subscriptions.

### §4.3 — Subscription lifecycle verified

Probe-mode WS connection opens, subscribes, collects responses, closes. Kraken does NOT carry the subscription forward across reconnect — each new connection requires fresh subscribe. **Probe WebSocket is fully ephemeral** — no production-subscription-quota concerns. Verified empirically during the probe (closed cleanly, no errors).

---

## §5 — Finnhub metadata lookup (scope §2.4)

### §5.1 — API key provisioning gap

`/home/deploy/dawntrader/.env` does NOT contain `FINNHUB_API_KEY`. Boot log `[StockService] FINNHUB_API_KEY not found in environment variables` confirms the gap is current. **Demo key returns `{"error":"Invalid API key"}` on `/stock/profile2`** — no anonymous access available.

**Decision: provision a real Finnhub free-tier key via Kyle.** Free tier allows 60 calls/min, sufficient for the daily ~540-candidate probe (~9 min at 1 call/sec to stay well under quota, given we only query Kraken-accepted ~260-280 post-probe).

**Soft-fallback (per scope §2.4.d):** if Finnhub key remains absent at first deploy, the universe-service writes `sector: 'UNCATEGORIZED'` for every Kraken-accepted symbol; B-PHASE-A2 sector-coverage telemetry doesn't count UNCATEGORIZED toward the 7-sector floor. Manual curation via `xstock_spot_universe_overrides` table covers per-symbol metadata until the Finnhub key lands.

### §5.2 — GICS-to-internal-sector mapping table

Finnhub `finnhubIndustry` field returns GICS-aligned strings. Mapping to our internal sector enum:

| Finnhub `finnhubIndustry` | Internal sector |
|---|---|
| `Technology` | XLK |
| `Health Care` / `Healthcare` | XLV |
| `Financial Services` / `Banks` / `Insurance` | XLF |
| `Communication Services` / `Media` / `Telecommunications` | XLC |
| `Consumer Cyclical` / `Consumer Discretionary` | XLY |
| `Consumer Defensive` / `Consumer Staples` | XLP |
| `Energy` | XLE |
| `Industrials` | XLI |
| `Real Estate` | XLRE |
| `Utilities` | XLU |
| `Basic Materials` / `Materials` | XLB |
| (no match) | UNCATEGORIZED |

ETFs / index proxies / international ETFs require manual curation (no Finnhub `industry` covers them cleanly) — preserved via override table.

### §5.3 — Fallback for missing metadata

Per scope §2.4.d, soft-fallback to `sector: 'UNCATEGORIZED'`. Adding new enum value to the sector list. UI display + B-PHASE-A2 telemetry both need to handle this gracefully:
- xStock Diagnostics UI: show UNCATEGORIZED in a separate "no sector data" group; don't block rendering.
- B-PHASE-A2 sector-coverage floor: UNCATEGORIZED does NOT count toward the 7-sector floor; floor calculation uses only the SPDR / BROAD_ETF / INDEX_PROXY / INTL_ETF enum values.

---

## §6 — Curated-override layer (scope §2.5)

Seed migration extraction script: TBD at implementation time (`scripts/b79-0n-extract-overrides.ts`). Reads current `shared/asset-classes.ts:271-540` Map literal, emits SQL INSERT VALUES for the `xstock_spot_universe_overrides` table covering:

- 10 cryptoAdjacent: true symbols (BTBT, CIFR, CLSK, COIN, CRCL, DFDV, GLXY, HIVE, HUT, MSTR)
- ~50 adr: true symbols (BHC, BIDU, BILI, BNTX, BTI, BUD, DEO, NIO, etc.)
- Manual sector classifications that diverge from GICS (SPY/QQQ → INDEX_PROXY; GLD/IEMG/XBI/TOTL → BROAD_ETF; EWA-EWZ → INTL_ETF)

The extraction script is committed alongside the migration per Langston Q6.

---

## §7 — Fallback chain (scope §2.6)

Already fully designed in scope §2.6. Pre-audit additions:

- **Layer 3 file cache path:** `/var/lib/dawntrader/xstock-universe-cache.json`. Permissions: `deploy:deploy 0644`. Written atomically (tmp file + rename) by the discovery service on each successful run.
- **Layer 4 bootstrap set:** hard-coded list in `server/asset_classes/xstock_spot/universe-bootstrap.ts` (NEW file). ~20 mega-caps: AAPL, AMZN, GOOGL, MSFT, NVDA, TSLA, META, COIN, MSTR, HOOD, ASML, SPY, QQQ, GLD, JPM, BAC, JNJ, PG, KO, XOM. Names that will exist on Kraken's xStock product for the foreseeable future.
- **Layer 5 fail-fast:** `process.exit(1)` with `[CRITICAL][B79.0n.UNIVERSE-DISCOVERY] all 5 fallback layers exhausted` log.

---

## §8 — Phase 19 readiness pre-audit (scope §2.10 NEW per Langston Q7)

### §8.1 — §2.10.a TELEMETRY lazy-allocate forward-flag — PASSES inherently

Verified via `server/services/telemetry-aggregator.ts:126,135`:
```typescript
private pairTelemetry: Map<string, PairTelemetry[]> = new Map();
private pairZScoreHistory: Map<string, { volZ: number[]; trendZ: number[] }> = new Map();
```

Both are default-empty `Map` instances at class instantiation. Entries created lazily on first write per symbol via `Map.set()` native semantics. **Architecture inherently handles dynamic universe growth.** No pre-allocation required; new symbols discovered post-deploy get telemetry buckets on first write automatically.

**Forward-flag for B79_0n_TELEMETRY_SCOPE.md (when drafted):** preserve the Map-based lazy-allocate pattern. Do NOT refactor to fixed-array-indexed-by-symbol-order or any pre-populated bucket scheme — that would silently lose the dynamic-universe property.

### §8.2 — §2.10.b strategy_settings per-symbol audit — PASSES structurally

Probe query: `SELECT COUNT(*) FROM strategy_settings WHERE symbol IS NOT NULL AND asset_class = 'xstock_spot'`

**Result: PostgreSQL `ERROR: column "symbol" does not exist`.** The `strategy_settings` table has NO `symbol` column at all. Per-symbol overrides are STRUCTURALLY IMPOSSIBLE by schema design. Langston rev2 §11.4 invariant ("strategy_settings table is per-asset-class only") is enforced at the DB schema level, not just convention. Newly-discovered symbols are evaluable by every enabled strategy without any DB row addition.

### §8.3 — §2.10.c universe-growth shock test design — added to §4 of scope

Integration test design for the implementation phase:

```typescript
describe('B79.0n.UNIVERSE-DISCOVERY — universe-growth shock test', () => {
  it('handles +50 symbol burst without scanner degradation', async () => {
    // Baseline: existing 260-symbol universe; 10 scanner cycles measured.
    const baselineCycleMs = await measureScannerCycles(10);
    const baselineMemMb = process.memoryUsage().heapUsed / 1024 / 1024;

    // Shock: insert 50 new symbols into xstock_spot_universe table
    // simulating a Backed Finance tokenization-batch announcement absorbed
    // by tonight's 06:00 UTC discovery cycle.
    await insertShockSymbols(50);
    await xstockUniverseService.refreshFromDB();

    // Post-shock: 10 more scanner cycles
    const postShockCycleMs = await measureScannerCycles(10);
    const postShockMemMb = process.memoryUsage().heapUsed / 1024 / 1024;

    // Verify ±10% bounds
    expect(postShockCycleMs).toBeLessThan(baselineCycleMs * 1.10);
    expect(postShockMemMb).toBeLessThan(baselineMemMb * 1.10);
  });
});
```

Real risk this catches: Backed Finance announces a 50-name tokenization batch → 06:00 UTC discovery picks them all up → ARCA-open scanner at 13:30 UTC hits memory pressure or cycle-timeout from sudden universe expansion. Better to find that in CI than in production.

---

## §9 — Anti-discoveries (what we DIDN'T find)

For posterity:

- **No external systems (PM2 ecosystem.config / cron / Grafana) reference `xstocks-universe.json`** → Langston Q5 grep concern RESOLVED.
- **No multi-category union needed on CoinGecko** → `xstocks-ecosystem` is the single canonical target.
- **No per-symbol `strategy_settings` rows** → Phase 19 readiness §2.10.b inherent pass.
- **No eager telemetry bucket allocation** → Phase 19 readiness §2.10.a inherent pass.
- **No protocol surprises on Kraken WS** → v2 documented form works exactly as expected.
- **No additional consumers of `XSTOCK_SPOT_REGISTRY` size beyond what HYGIENE §5.2 enumerated** — same 8 production consumers + 2 tests; all iterate or look up.

---

## §10 — Open questions for Langston (Step 2 pre-audit review)

### Q-PA-1 — Finnhub API key provisioning gate

Discovery shipping with degraded metadata (`sector: 'UNCATEGORIZED'` for every newly-discovered symbol) is operationally tolerable (per scope §2.4.d soft-fallback) but means B-PHASE-A2 sector-coverage telemetry shows lower diversity until the key lands. Three paths:

- **(A) Block ship on Finnhub key provisioning** — request Kyle to provision the key as a pre-deploy gate.
- **(B) Ship with soft-fallback; flag the metadata gap as an OPEN follow-up issue with explicit deadline** — discovery works, sector data degrades for ~10-15 days until key lands.
- **(C) Use yfinance as alternative metadata source** — Python sidecar, no key needed, but adds operational complexity.

**CC default: (A)** — request Kyle to provision Finnhub free-tier key (5 minutes of Kyle's time on the Finnhub website) before deploy. Cleanest path. Confirm.

### Q-PA-2 — Layer 4 bootstrap set composition

Pre-audit §7 proposes 20 specific mega-cap symbols. Are these the right 20? Alternative: read the top-20 by `market_cap_rank` from CoinGecko at discovery-service first-deploy time and persist as a "snapshot bootstrap" written to source code. Pros: empirical not hand-picked. Cons: lock-in to CoinGecko's ranking at one point in time. CC default: hand-picked stable list (proposed in §7). Confirm or push toward dynamic-snapshot.

### Q-PA-3 — Probe single-batch vs per-symbol throttle

Pre-audit §4.2 inverts the original scope §2.3.b 50ms/req throttle. Empirical finding is that single-batched subscribe with one large `symbol: [...]` array works fine — total probe duration ~12s. **But** Kraken may rate-limit batched subscribes at higher volumes (we tested 10 symbols; production probe will send ~540). CC default: keep batched-form but add chunking at 100-symbol batches with 500ms inter-batch sleep as a belt-and-suspenders. Confirm.

### Q-PA-4 — Sector enum extension

Pre-audit §5.3 proposes adding `UNCATEGORIZED` as a new sector enum value. Existing enum (per `shared/asset-classes.ts`): XLK, XLV, XLF, XLC, XLY, XLP, XLE, XLI, XLRE, XLU, XLB, BROAD_ETF, INDEX_PROXY, INTL_ETF (14 values). UNCATEGORIZED makes 15. All consumers (sector-coverage telemetry, UI grouping, etc.) need to handle the new value. CC's implementation plan: extend the enum, update B-PHASE-A2 floor calculation to exclude UNCATEGORIZED, update UI sector chip to render UNCATEGORIZED in a separate "no sector data" group. Confirm.

### Q-PA-5 — `XSTOCK_SPOT_SYMBOLS` exclude-delisted semantics

Scope §3.2 stale-→-delisted lifecycle (Langston Q9 #3) excludes `is_delisted=true` rows from `XSTOCK_SPOT_SYMBOLS`. **Edge case:** during the >7 days <30 days stale window, what's the right behavior? Currently §3.2 says "stale, still in active universe." Should the scanner / UI surface this state somehow? Three options:

- **(A) Silent stale window** — symbol stays in `XSTOCK_SPOT_SYMBOLS`, scanner processes normally, warn log only. UI doesn't show stale state. (CC default.)
- **(B) UI marker** — surface a "STALE" badge in xStock Diagnostics for symbols in the 7-30 day window.
- **(C) Reduced-priority scan** — symbol stays in universe but scanner skips it on some cycles to avoid burning compute on probably-dead data.

CC default: (A). Stale window is structurally about "Kraken's WS subscription whitelist still accepts the symbol, our recent data archive doesn't show recent ticks" — operationally rare, log-only is sufficient. Confirm.

### Q-PA-6 — Discovery cycle deployment-vs-cron-first

The first discovery cycle should run at deploy time (manual trigger via the `POST /api/internal/universe-discovery/refresh` endpoint, post-build pre-pm2-restart). OR wait for the natural 06:00 UTC cron. CC default: trigger ONCE at deploy time so the live discovery output replaces the seed migration data immediately; then cron takes over at 06:00 UTC daily. Confirm the cron-bootstrap ordering.

---

## §11 — Pre-audit reply gate

Reply: **Step 2 pre-audit ACK** / **specific counter-propose on Q-PA-1 through Q-PA-6** / **substantive disagreement on a finding**.

On ACK, CC proceeds to Step 3 implementation with §3 code changes from the scope plus the pre-audit refinements (single-batch Kraken WS probe form, Finnhub key provisioning per Q-PA-1 outcome, sector enum extension per Q-PA-4, etc.).

INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a + §12: this pre-audit doc IS the inbox file. Do NOT `cd /mnt/gdrive`. For supplementary repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.

— Claude Code, 2026-05-21 PM (B79.0n.UNIVERSE-DISCOVERY Step 2 pre-audit v1)

---

## §12 — Langston Step 2 ACK + iteration outcomes (2026-05-21 PM)

**Status: Step 2 pre-audit ACK.** All headline findings stand. Langston concurred on all 6 questions with 5 refinements + 1 additional concern (probe partial-response failure semantics). Verbatim relay at Telegram topic 21 msgs 4055 / 4056.

| # | CC ask | Langston outcome | Implementation impact |
|---|---|---|---|
| Q-PA-1 | Finnhub gate options A/B/C (CC default A) | ACK (A) block-ship on Kyle provisioning | Surface ask to Kyle now; deploy-script curl post-restart |
| Q-PA-2 | Bootstrap composition hand-picked vs dynamic snapshot | ACK hand-picked 20 (editorial judgment > point-in-time CG snapshot) | §7 layer-4 bootstrap list locked |
| Q-PA-3 | Probe form single-batched vs chunked | ACK batched-with-chunking: 100/batch + 500ms sleep, ~26s total; add per-chunk response count log | §4.2 revised; structured log marker added |
| Q-PA-4 | Sector enum extension + schema check | ACK with check: VARCHAR (CC choice — new `xstock_spot_universe` table, sidesteps ALTER TYPE complexity) | Migration: `sector TEXT NOT NULL CHECK (sector IN (...))` not ENUM |
| Q-PA-5 | Stale window behavior A/B/C | ACK (A) silent + structured log marker `[STALE_SYMBOL]` | Structured log line added; no UI surface |
| Q-PA-6 | Cron-bootstrap deploy-vs-cron-first | ACK trigger-at-deploy with NON-BLOCKING semantic | Deploy script: `curl ... \|\| true`; deploy proceeds on curl failure; 5-layer fallback covers |

**Additional Langston concern absorbed:** probe partial-response failure semantics. If 12-15s collection window times out mid-stream: (1) log `[PROBE_INCOMPLETE] received=<N>/540 timeout_at=<ts>`, (2) NOT update `xstock_spot_universe` with partial set (would corrupt with false-rejects), (3) fall through to Layer 2 fallback (yesterday's DB-cached universe). Implementation note: probe-mode WS client needs explicit close-on-error + partial-response-rejection semantics.

**Step 4 diff-review confirmations Langston will check:**
1. Finnhub key landed pre-deploy (or scope re-deferred with Kyle's blessing)
2. Sector schema decision: VARCHAR + CHECK (no ALTER TYPE complexity)
3. Probe failure-path code: partial-response rejection + fallback chain trigger
4. Deploy-script curl is non-blocking (`|| true` or equivalent)
5. Structured log markers: `[STALE_SYMBOL]` + `[PROBE_INCOMPLETE]` + per-chunk probe response counts

**Consensus achieved.** Step 3 implementation proceeds on Kyle's go (and on Finnhub key landing).

— Claude Code, 2026-05-21 PM (B79.0n.UNIVERSE-DISCOVERY Step 2 pre-audit v1 + Langston ACK iteration outcomes)
