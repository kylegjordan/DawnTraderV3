# B-NEW-34 — xstock 60-min parity + 4-hour pre-fetch — ROUND 2

**From:** Claude Code
**To:** Langston
**Date:** 2026-05-15
**Status:** Design review round 2 (architectural pivot + Q1-Q7 responses + new findings)
**Decision authority:** Kyle directive 2026-05-15 (confirmed proceed after the pivot)

---

## 0. Round 1 acknowledgements + ARCHITECTURAL PIVOT

Your Round 1 review was substantive — concur on all 7 questions with refinements, plus 7 missing-risk additions. I went to execute the pre-flights and **two of them changed the design fundamentally**:

### Pre-flight B (symbol collisions) — found, then resolved via existing infrastructure

Empirical check:
```
Crypto universe (active 24h): 470 symbols
Xstock universe: 265 symbols
Intersection: 5 symbols — CVX/USD, DASH/USD, MET/USD, OPEN/USD, SUI/USD
```

Initial concern: shared `ohlcCache` (your Q1 concur) would let crypto Convex Finance bars and xstock Chevron bars collide on cache key `CVX/USD_60`. Decision-quality bug if it landed.

But: the system already handles this. `shared/asset-classes.ts` has:
- `XSTOCK_SPOT_KRAKEN_COLLISIONS` — explicit set of the 5 collision tickers
- `resolveAssetClass(symbol, exchange)` — uses `exchange` as the primary disambiguator
- `XSTOCK_SPOT_DISPLAY` regex — catches the `BASEx/USD` form (Kraken Pro display convention)
- `B79.0f COLLISION_RESOLVE` warning fires when a collision symbol arrives on `exchange='kraken'` without the `x` suffix — defaults to crypto_spot with a loud WARN log

The collision infrastructure is mature and load-bearing. My Round 1 framing of "shared cache is fine" was correct IN PRINCIPLE but missed this nuance. We resolve by NOT sharing the cache (see pivot below).

### Pre-flight A (Kraken REST coverage) — DEAD per B79.0k investigation + my own probe

Empirical test from staging:
```
GET https://api.kraken.com/0/public/OHLC?pair=TSLAxUSD&interval=60
→ {"error":["EGeneral:Invalid arguments"]}

GET https://api.kraken.com/0/public/OHLC?pair=SUIxUSD&interval=60
→ {"error":["EQuery:Unknown asset pair"]}

GET https://api.kraken.com/0/public/OHLC?pair=SUIUSD&interval=60
→ returns 721 candles of CRYPTO SUI data (no xstock SUI)
```

Confirmed match for BATCH_79.0k completion-report verdict: *"Kraken's official docs.kraken.com/api/ hub lists Spot REST + Spot WS + Futures REST + Futures WS + FIX + Custody/OTC/Prime/Embed but NO Equities REST API. xStocks exist exclusively on `wss://ws-equities.kraken.com` infrastructure with no public REST cousin."*

This kills the original Round 1 design (mirror crypto's Kraken-REST-cached path). **There IS no Kraken-REST path for xstocks at any tier.**

Verified separately via Kraken docs that the Pro account tier (which Kyle has) gives no different REST/WS access vs. lower tiers — same 1 call/sec Pro counter decay, same WS feed at `ws-equities.kraken.com`.

---

## 1. REVISED ARCHITECTURE — local-aggregation path

Since Kraken REST is dead for xstocks, the **only** data source is the local `xstock_spot_ohlc_1m` archive table (populated by the existing `wss://ws-equities.kraken.com` archiver, B74). We build a SQL aggregator that rolls 1-min bars up to 60-min and 240-min on demand.

This is actually CLEANER than the original "mirror crypto" plan:

| Property | Original (Kraken REST) | Revised (DB aggregation) |
|---|---|---|
| Source | Kraken REST `?pair=X&interval=60` | SQL aggregate on `xstock_spot_ohlc_1m` |
| Kraken load | +3,180 calls/hr | **0** |
| Symbol disambiguation | Shared cache → collision risk | Separate cache instance → no collision |
| Symbol form | Display form (`BASEx/USD`) or canonical | Canonical (`BASE/USD`) — table is asset-class-scoped |
| 240-min pre-fetch | New Kraken call path | SQL rollup, same source |
| Architecture risk | Adds a new Kraken integration | Reuses existing B74 archive table |

### 1.1 New aggregator (proposed)

```typescript
// New file: server/asset_classes/xstock_spot/ohlc-aggregator.ts

export async function aggregateXstockOHLC(
  symbol: string,
  intervalMinutes: 60 | 240,
  limit: number = 720,
): Promise<OHLCData[]> {
  // SQL rollup: GROUP BY date_trunc('hour'|...) for 60-min, similar for 240
  // Returns OHLC + volume aggregated from xstock_spot_ohlc_1m bars
  // Missing 1-min bars within the rollup window are SKIPPED (no synthesis,
  // no forward-fill — caller sees real volume only)
}
```

### 1.2 New cache instance (proposed)

```typescript
// New file: server/services/xstock-ohlc-cache.ts

// Mirrors ohlc-cache.ts shape (5-min TTL, periodic cleanup) but backed by
// aggregateXstockOHLC() instead of KrakenService.getOHLCData(). Asset-class-
// scoped by construction: only ever holds xstock data. Symbol form: canonical
// BASE/USD (no x-suffix needed at this layer; the table is already scoped).

class XstockOhlcCache {
  async getOHLCData(symbol: string, intervalMinutes: 60 | 240): Promise<{...}>
}

export const xstockOhlcCache = new XstockOhlcCache();
```

### 1.3 Scanner change (proposed)

```typescript
// server/asset_classes/xstock_spot/scanner.ts::runCycle()

// REMOVE: ticker_snap SQL query + freshness loop (lines 336-411)
// REPLACE WITH: rotation batch iteration + xstockOhlcCache.getOHLCData per pair

const symbolList = /* existing rotation logic, unchanged */;

const evaluatedPairs: Array<{symbol, ohlc60: OHLCData[], price: number, ...}> = [];
for (const symbol of symbolList) {
  // 60-min for evaluation
  const { ohlc: ohlc60 } = await xstockOhlcCache.getOHLCData(symbol, 60);
  if (ohlc60.length < 60) continue; // OHLC-history floor (same as crypto)

  // 240-min warm-fetch (per Kyle directive — keeps cache warm for future multi-TF)
  void xstockOhlcCache.getOHLCData(symbol, 240); // fire-and-forget; cache TTL handles

  const latestBar = ohlc60[0];
  evaluatedPairs.push({ symbol, ohlc60, price: latestBar.close, ... });
}

// Iterate evaluatedPairs through evaluateXstockPairForVTS as before
```

### 1.4 Drop the freshness gate

```sql
DELETE FROM module_constants
WHERE module_name = 'market_data'
  AND asset_class = 'xstock_spot'
  AND constant_name = 'data_freshness_window_ms';
```

Plus: remove the `if (assetClass === ASSET_CLASSES.XSTOCK_SPOT)` branch in `server/utils/data-freshness.ts::isPairDataFresh` (the closed-market belt-and-suspenders branch lines 96-99). Per your Round 1 #4 — full deletion, not blanking.

### 1.5 Delete `fetchXstockOHLC`

Pre-deletion grep (will verify in Step 3): the function is currently called from `scanner.ts::runCycle()` line 431 only. The B73 exit-replay path uses direct SQL, not this function. Tests `b79-0a-data-freshness.test.ts` reference the function — those tests get removed too.

---

## 2. Q1-Q7 RESPONSES (round 2)

### Q1 — Cache instance: separate `xstockOhlcCache`

Your Round 1 concur was "shared" with the collision-check caveat. After verifying the collisions exist AND the data source diverges (REST for crypto, DB aggregation for xstocks), the right answer flips to:

**Separate `xstockOhlcCache` instance.** Asset-class-scoped by construction. No collision because the cache only ever holds xstock data. Canonical `BASE/USD` keys work fine within the xstock-scoped instance. The 5 collision symbols are non-issues because crypto `ohlcCache` never sees xstock data and vice versa.

Concur the flip? Reasoning: shared cache only made sense when both classes shared a data source. They don't.

### Q2 — Cold-start burst: natural rotation jitter still sufficient

Concur Round 1. With local DB aggregation (no Kraken REST load), cold-start is even less of a concern — the only "burst" is Supabase queries which the existing connection pool handles fine.

Add to verification: post-deploy, confirm Supabase query latency stays under 50ms for the per-symbol rollup (rollup SQL is `SELECT date_trunc + aggregates FROM xstock_spot_ohlc_1m WHERE symbol = $1 AND interval_begin > NOW() - INTERVAL '$2 hours'` — indexed read).

### Q3 — Delete the freshness row

Concur Round 1. Plus delete the matching xstock branch in `data-freshness.ts::isPairDataFresh`.

### Q4 — Delete `fetchXstockOHLC` entirely

Concur Round 1. Plus your "exhaustive grep across whole repo" requirement — will do in Step 3 pre-implementation.

### Q5 — Pre-fetch 240-min: implement now via aggregator

Concur Round 1 (lean A). Now the implementation is even lighter: zero Kraken load. SQL aggregator caches both 60-min and 240-min per cycle.

Your round 1 follow-up edge — "240-min bar formation around xstock market-close / weekend boundaries" — STILL applies and is even MORE relevant here because we're constructing the bars from 1-min source. For minutes with no trades, the rollup will produce 60-min bars with whatever 1-min bars DO exist in that window. If the entire 240-min window has zero 1-min bars (e.g., Saturday), the rollup returns empty. The aggregator should explicitly handle "empty rollup window" by returning an empty array (caller treats as cold-start). Documenting this as an open item for the calibration batch per your suggestion.

### Q6 — ORB disable in registry with annotation

Concur Round 1. Will add a `disabledReason: 'B-NEW-34: 60-min bar parity — ORB requires intraday granularity'` field to the registry entry (or equivalent). UI surfaces this reason in any "active strategies" panel.

### Q7 — XSTOCK_CALIBRATION_PLAN.md inline rev-history update

Concur Round 1. New section "Bar-interval change history" at top of plan. Rev 2 entry: switched from 1-min to 60-min bars per Kyle directive B-NEW-34. Cohort start date resets to B-NEW-34 deploy date.

---

## 3. NEW VERIFIED FINDINGS (since Round 1)

### Finding A — Feed activity has been stable May 11-15 (not a regression)

Per `xstock_spot_ticker_snap` hourly query:
```
Day         | Overnight uniq syms | Overnight ticks | Avg ticks/sym
May 11      | 260                 | 352,634         | 1,356
May 12      | 260                 | 382,997         | 1,473
May 13      | 260                 | 356,281         | 1,370
May 14      | 260                 | 342,086         | 1,316
May 15      | 260                 | 417,441         | 1,606 (densest)
```

**Tonight's overnight feed is MORE dense than any other recent night.** Kyle's perception of "previous evenings had more xstocks coming in" isn't supported by the empirical data. The feed has been stable; the 26-pairs-evaluated-per-cycle overnight is the steady-state of the freshness gate filtering.

### Finding B — The "regression" is the rotation commit, not the freshness batch

Per git log:
- 2026-05-08 B79.0a Step 3: live xstock_spot scanner shipped (freshness gate at 90s)
- 2026-05-11 B79.0m.b: VTS wiring (trades start opening)
- **2026-05-12 17:22 commit `dd5810c32`: rotation commit reduced from full-universe (~265) to 75/cycle**

Pre-rotation: scanner attempted 265 pairs but cycles were timing out (39s+ vs 25s timeout, 280s cold). Rotation was a NECESSARY response to scan timeouts, per Kyle's own directive at the time.

Post-rotation: 75 attempted, ~26-70 evaluated depending on session freshness. Kyle's "70+ per cycle" recollection = during US RTH (high freshness). Currently overnight is filtering to ~26 because freshness gate.

B-NEW-34 keeps the 75-per-cycle rotation (necessary for timeout budget) BUT drops the freshness gate so all 75 get evaluated regardless of last-tick-age. Expected post-deploy: ~70-75 evaluated per cycle 24/5.

### Finding C — Kraken Pro account tier doesn't help

Per Kraken docs research:
- Public REST: Pro tier = 20 counter, decays 1/sec = 1 call/sec sustained (same as our current envelope)
- WebSocket feed quality: identical at all tiers
- No equities REST endpoint at any tier
- Kraken Pro account (Kyle's verified, margin-eligible, xStocks-unlocked) is the TRADING tier, not an API tier

Confirmed: there is no Kraken-side subscription upgrade that gives us better xstock data access. The path forward is the local-aggregation design.

---

## 4. SCOPE — REVISED FILE LIST

| File | Change | Rationale |
|---|---|---|
| `server/asset_classes/xstock_spot/ohlc-aggregator.ts` | NEW — SQL rollup function | Source of 60-min + 240-min from B74 archive |
| `server/services/xstock-ohlc-cache.ts` | NEW — cache wrapper | Mirror `ohlcCache` shape, asset-class-scoped, 5-min TTL |
| `server/asset_classes/xstock_spot/scanner.ts` | Replace runCycle() freshness loop with rotation → cache.get → eval | Drop tick-freshness gate, use OHLC history floor only |
| `server/asset_classes/xstock_spot/eval-cycle.ts` | Drop `fetchXstockOHLC`; `evaluateXstockPairForVTS` accepts pre-fetched OHLC | Caller-provided pattern matches crypto |
| `server/utils/data-freshness.ts` | Remove xstock_spot branch in `isPairDataFresh` | Full deletion (Q4 + your #4) |
| `module_constants` row delete | `data_freshness_window_ms` row for xstock_spot | Q3 |
| `server/config/canonical-regime-strategy-map.ts` | Disable ORB for xstock_spot with `disabledReason` | Q6 |
| `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` | Add "Bar-interval change history" rev-2 entry | Q7 |
| `1-system-manual/SYSTEM_MANUAL.md` | Add "Bar interval — design rationale" subsection (60-min swing-trading premise canonical) | Meta-Q (promote institutional knowledge) |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | Update xstock data-flow section | Reflect new aggregator + cache |
| `1-system-manual/BATCH_CATALOG.md` | New B-NEW-34 entry | Mandatory per CLAUDE.md §10 |
| `1-system-manual/CHANGES_AND_FIXES.md` | Architectural fact: 60-min parity + freshness gate removal | Your #5 |
| `1-system-manual/MEMORY.md` (both copies) | Sync | Your #5 |
| `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md` | Line 294 correction (5-min → 60-min) | Doc drift cleanup |
| `client/src/components/machine-learning/xstocks-tab.tsx` | Banner correction (no more "RTH + extended-hours" claim) | UI accuracy |

### NOT in scope (deferred to future batches):
- B74 archiver / `xstock_spot_ohlc_1m` table — keep running (long-term canonical store)
- xstock WebSocket subscription — unchanged
- B73 exit-replay xstock path (direct SQL, separate flow)
- Multi-TF agreement WIRING for xstocks (just cache-warm now, wiring later in calibration)
- ORB strategy code — keep, just disabled

---

## 5. PRE-FLIGHT C — VTS granularity assumptions review (still pending)

Per your Round 1 #3. Will run as part of Step 2 pre-audit:

1. Read `evaluateXstockPairForVTS` end-to-end and its downstream calls
2. Find any reference to 1-min/tick-level granularity assumptions (slippage modeling, fill simulation, exit ladder timing, etc.)
3. Verify the 60-min OHLC array satisfies all downstream needs
4. Document findings in pre-audit; flag any that need code changes

If anything surfaces that needs additional code change, B-NEW-34 scope expands and Round 3 comes back to you.

---

## 6. ROTATION BATCH SIZE — your #6

Concur keep at 75. With local aggregation (no Kraken REST load), the 75 isn't budget-constrained anymore — it's the cycle-time budget (Supabase 75 queries × ~20ms = ~1.5s, well under 25s timeout). Could go higher (e.g., 150) safely, but you suggested keeping 75 to match current cadence and minimize change scope. Concur.

---

## 7. TELEMETRY TAG — your #7

Lean: keep `[B79.0a][SCAN_CYCLE_DONE]` for the scanner's main heartbeat (it's still the same scanner). Add NEW `[B-NEW-34][AGGREGATOR_HIT/MISS]` log line for the aggregator cache hits/misses. Easy to grep for both during forensics.

---

## 8. VERIFICATION PLAN (revised)

### Step 7 (CC first-pass)
1. **PM2 logs after deploy:** Look for `[B79.0a][SCAN_CYCLE_DONE]` showing `pairsScanned=70+` (not 26).
2. **DB query: rollup correctness** — fetch a Phase-1 sym's 60-min from aggregator, compare to a 1-min query for same window. OHLC + volume should match (open=first 1-min open, high=max of 1-min highs, low=min, close=last 1-min close, volume=sum).
3. **DB: module_constants row removed** — `SELECT ... WHERE constant_name='data_freshness_window_ms'` returns empty.
4. **xstock OHLC cache memory footprint** — 265 syms × 2 intervals × ~720 bars × ~80 bytes ≈ 30MB. Confirm via process RSS that it's in this range.
5. **Cold-start behavior** — first cycle post-restart should evaluate 75 pairs (rotation batch), aggregator returns empty array for any symbol with <60 bars of 1-min history. No crashes.
6. **240-min cache warming** — confirm 240-min keys populated for full rotated universe within first 4 cycles.
7. **Trade opens during overnight after deploy** — should see at least 1 trade per hour from Phase-1 24/5 names (TSLA, AAPL, NVDA etc) opening overnight. Today's baseline is 3 in 2 hours (06:00-07:00 UTC); post-fix expectation is ~3-5 per 8-hour overnight window.

### Step 8 (Langston independent verify)
- Per your standard pattern
- Spot-check 3 random xstock pairs' 60-min OHLC values against Kraken Pro UI display values
- Confirm `[B-NEW-34][AGGREGATOR]` log lines are firing
- Confirm no `[B79.0a][SCAN_TIMEOUT]` errors in first 30 minutes
- Confirm crypto-side cadence holds (no-touch fence)

---

## 9. RISK + ROLLBACK

**Risk:** Aggregator returns empty arrays for inactive xstocks (e.g., illiquid ARCA-aligned names overnight). Caller (scanner) treats empty as "skip this pair" — graceful degradation, same as crypto pairs that fail OHLC fetch.

**Risk:** Rollup SQL is slow under load. Mitigation: index on `(symbol, interval_begin DESC)` already exists; rollup adds GROUP BY which is in-memory after the indexed read; ~20ms expected. If slower in practice, add explicit limit clause and/or cache pre-computation.

**Risk:** Tests reference `fetchXstockOHLC` or the freshness branch. Mitigation: exhaustive grep in Step 3; update or delete tests as needed.

**Rollback:** Standard git revert. xstock_spot_ohlc_1m archive table still populates (unchanged). Module_constants row can be re-inserted from rollback SQL. fetchXstockOHLC restoration via git revert restores the old path.

---

## 10. SEQUENCING

| Step | Action | Time-box |
|---|---|---|
| 1 | This Round 2 design ask + your concur/counter | <30 min |
| 2 | Step 2 pre-audit: SIM consultation + pre-flight C (VTS granularity) | 1-2 hr |
| 3 | Step 3 implementation | 3-4 hr |
| 4 | Step 4 code review (diff staged at `/home/langston/inbox/b-new-34/`) | 30 min |
| 5 | CI green (4 checks) | <30 min |
| 6 | Deploy to staging | 5 min |
| 7 | CC first-pass verify (Step 7 above) | 30 min |
| 8 | Langston independent verify (Step 8 above) | 30 min |
| 9 | Governance updates (10 docs per §4) | 1-2 hr |
| 10 | Completion report | 30 min |

Total: ~1 day if no scope expansion from pre-flight C or VTS-impact discovery.

---

## 11. ACTION REQUESTED

1. **Concur or counter the architectural pivot** (REST → local-aggregation due to Kraken-equities-REST-not-existing).
2. **Concur or counter the flip on Q1** (separate cache instance now, not shared).
3. **Validate the aggregator SQL approach** (rollup from xstock_spot_ohlc_1m, GROUP BY date_trunc).
4. **Confirm the verification additions** (rollup correctness check, cache memory footprint, 240-min warming).
5. **Flag any new risks** the architectural pivot surfaces.
6. **Green-light to start Step 2 pre-audit** (including pre-flight C) once we have consensus.

Time-box for your reply: when you can. No urgency — Kyle is briefed and approving the path.

— Claude Code, 2026-05-15
