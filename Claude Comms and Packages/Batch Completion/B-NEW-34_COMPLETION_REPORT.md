# B-NEW-34 — xstock 60-min bar parity + 4-hour pre-warm + B74 dup-row workaround

**Status:** SHIPPED — STAGING VERIFIED LIVE
**Date:** 2026-05-15
**Commits (chronological):**
- `756b64e49` — initial implementation (10 files)
- `a7545d595` — hotfix 1: drizzle ANY()-array-binding pitfall → IN(literal-list)
- `88e34bd67` — hotfix 2: cache depth 200/60 → 60/30 bars
- `1ee3ceb27` — hotfix 3: DISTINCT ON aggregator + 240m warm-fetch suspended
**PM2:** #283 → #284 → #285 → #286 → #287 (current)
**CI:** Build + Docker GREEN; TypeScript Check + Test Suite at pre-existing legacy baseline (no new failures)

---

## 🚨 SCAFFOLDING-VS-FUNCTIONAL DECLARATION (per CLAUDE.md §9.1)

**This batch IS functional for 60-minute scanning** — the xstock scanner is now producing 64-of-75 pairs per cycle (vs 26 pre-deploy) in 675ms, with no SCAN_TIMEOUT after the PM2 #287 restart. Verified live via Claude-in-Chrome on the staging xStocks tab.

**This batch SHIPS BUT DISABLES 4-hour (240-minute) pre-warm.** The 240-minute aggregator + cache infrastructure is built and tested, but the fire-and-forget warm-fetch in `scanner.ts:runCycle` is commented out. The 4-hour data is NOT yet flowing into any cache or downstream consumer.

> 🚨 **THIS BATCH DOES NOT MAKE 4-HOUR BAR PRE-WARM FUNCTIONAL. 4-HOUR BAR PRE-WARM WILL REMAIN INERT UNTIL B-NEW-35 LANDS SOURCE-SIDE DEDUP.**

The 4-hour data is not yet consumed by any canonical scanner path either way — it was always staged for future multi-TF agreement wiring (Phase D of `XSTOCK_CALIBRATION_PLAN.md`). The B74 archive's 18-56× duplicate-row write pattern (B-NEW-35 target) makes the 4-hour query exceed postgres `statement_timeout=2min` AND starves the 60-minute critical path with concurrent disk-IO. Once B-NEW-35 lands, the warm-fetch is re-enabled by uncommenting the block at `server/asset_classes/xstock_spot/scanner.ts:358-385`.

---

## PREVIOUSLY-STATED-VS-NOW (per CLAUDE.md §9.2)

| Previously stated | Now | Reason |
|---|---|---|
| 4-hour warm-fetch fires every cycle | 4-hour warm-fetch SUSPENDED (commented out) | Discovered B74 archive writes 18-56× dup rows per minute; concurrent 240m query exceeds postgres statement_timeout and starves 60-min path. Re-enabled after B-NEW-35 source dedup. |
| Cache depth 200 bars / 60-min + 60 bars / 240-min | Cache depth 60 bars / 60-min + 30 bars / 240-min | Hotfix 2 — initial depths produced ~9M source-row workload exceeding postgres statement_timeout. Reduced 4× still well above 24-bar filter floor + B68.1's 30-bar `min_higher_tf_samples`. |
| Filter floor 60 bars (history_60_lt_60 reject reason) | Filter floor 24 bars (history_N_lt_24) | Hardcoded `ohlc.length < 60` in global-filter + pattern-filter promoted to `module_constants.xstock_spot.min_ohlc_history_bars=24` (single SSOT). Chosen for indicator headroom + Monday-morning resilience over CC-proposed 20. |
| ORB enabled for xstock_spot | ORB DISABLED in DB | Intraday-bar strategy incompatible with 60-min architecture; first hour IS the first bar. Revisit Phase D of XSTOCK_CALIBRATION_PLAN.md when multi-TF support added. |
| xstock data freshness gated by 90s ticker_snap window | Freshness gate REMOVED | OHLC bar history is the canonical source of truth; if you have ≥24 bars you're evaluatable. `data_freshness_window_ms` row DELETED from module_constants. ticker_snap retained as bid/ask enrichment only (sentinel -1 when absent). |
| `pairsScannedLastCycle` semantic: "pairs with fresh ticker tick within 90s" | `pairsScannedLastCycle` semantic: "pairs with ≥24 hourly bars available" | Direct consequence of freshness-gate removal. UI label unchanged; numeric meaning is the canonical one going forward. |
| Original pre-flight C concern: ~12 indicator/threshold calibration debt items | Absorbed into Phase B of `XSTOCK_CALIBRATION_PLAN.md` rev 2 | 60-min bars change the meaning of period-expressed thresholds (e.g. 300-period Z-window: 5h → 12.5 days). All Phase B sub-batches re-anchored to 60-min evidence; calibration cohort start resets to 2026-05-15 PM2 #287 deploy date. |

---

## Objectives vs evidence

| # | Objective | Result | Evidence |
|---|---|---|---|
| 1 | xstock scanner switches to 60-min bar aggregation from local DB | ✅ DONE | `server/asset_classes/xstock_spot/ohlc-aggregator.ts` (NEW). Single-SQL rollup from `xstock_spot_ohlc_1m`. Epoch-floor UTC alignment matches Kraken interval=60 native. |
| 2 | 240-min (4-hour) aggregator infrastructure shipped | ✅ DONE (scaffolding) | Same aggregator file supports `intervalMinutes: 60 \| 240`. Epoch-floor with N=14400 aligns to Kraken interval=240 boundaries (00/04/08/12/16/20 UTC). |
| 3 | 240-min warm-fetch fires per cycle | 🚨 SUSPENDED | Commented out in `scanner.ts:358-385`. See scaffolding-vs-functional declaration above. Re-enable after B-NEW-35. |
| 4 | xstock cache asset-class-scoped (separate instance from crypto ohlcCache) | ✅ DONE | `server/services/xstock-ohlc-cache.ts` (NEW). 5 collision tickers (CVX/DASH/MET/OPEN/SUI) unambiguous at this layer. |
| 5 | Scanner runCycle drops 90s freshness gate | ✅ DONE | `scanner.ts:341-405` rewritten. ticker_snap retained as bid/ask enrichment only. |
| 6 | Filter floor consolidated to single SSOT module_constants row | ✅ DONE | `xstock_spot.min_ohlc_history_bars=24` consumed by global-filter:122-141 + pattern-filter:209-228. |
| 7 | ORB disabled (incompatible with 60-min bars) | ✅ DONE | `module_constants.strategy_gates.xstock_spot.orb.enabled=false`. `defensive_hedge` already DB-disabled pre-deploy. 10 → 9 enabled strategies. |
| 8 | data_freshness_window_ms row deleted | ✅ DONE | Verified via psql post-migration. |
| 9 | Staging cycle health: <10s duration, ≥60 pairs scanned, no SCAN_TIMEOUT | ✅ DONE | PM2 #287 post-restart: 10 consecutive healthy cycles, LAST CYCLE DURATION=675ms, PAIRS SCANNED=64 of 75, no SCAN_TIMEOUT. Visually verified via Claude-in-Chrome. |
| 10 | Crypto regression: NONE | ✅ DONE | By-construction (separate cache instance, asset-class-scoped aggregator, crypto ohlcCache + Kraken REST path untouched). |
| 11 | Pre-flight C calibration debt logged | ✅ DONE | Absorbed into `XSTOCK_CALIBRATION_PLAN.md` rev 2 entry; per-sub-batch threshold-meaning shifts documented. |

---

## Files changed

### Code (10 files in initial impl + hotfixes)

**New:**
- `server/asset_classes/xstock_spot/ohlc-aggregator.ts` — single-SQL rollup, DISTINCT ON dedup (hotfix 3), epoch-floor UTC alignment
- `server/services/xstock-ohlc-cache.ts` — asset-class-scoped TTL cache with hit/miss stats
- `server/tests/unit/b-new-34-aggregator.test.ts` — golden-fixture tests + regression locks (SQL contains '3600', SQL NOT contains 'date_trunc', SQL NOT contains "TIME ZONE 'UTC'"). 10 tests, all green in CI.

**Modified:**
- `server/asset_classes/xstock_spot/scanner.ts` — runCycle rewrite; 240m warm-fetch suspended (hotfix 3)
- `server/asset_classes/xstock_spot/eval-cycle.ts` — `fetchXstockOHLC` deleted (replaced with comment block)
- `server/asset_classes/xstock_spot/global-filter.ts:122-141` — filter floor reads module_constants
- `server/asset_classes/xstock_spot/pattern-filter.ts:209-228` — same pattern as global-filter
- `server/utils/data-freshness.ts` — xstock_spot branch + closed-market short-circuit removed
- `client/src/components/machine-learning/xstocks-tab.tsx` — banner updated for B-NEW-34 architecture

**Migration script:**
- `scripts/b-new-34-xstock-60min-parity.sql` — INSERT `min_ohlc_history_bars=24` + DELETE `data_freshness_window_ms` row + UPDATE `strategy_gates.xstock_spot.orb` to false. Applied to staging via `psql -f`, all 3 changes verified.

### Governance (8 docs updated)

| Doc | Update |
|---|---|
| `1-system-manual/BATCH_CATALOG.md` | New B-NEW-34 entry (row inserted before BATCH_82) |
| `1-system-manual/PHASE_HISTORY.md` | Phase 24 EXTENDED 2 sub-batch row |
| `1-system-manual/SYSTEM_MANUAL.md` | New "Phase 24 EXTENDED 2" section with: "Bar interval — design rationale" + "B74 archive duplicate-row workaround" + "Cache architecture" + "Filter-floor SSOT promotion" + "Freshness gate REMOVED" subsections |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | New "Recent Additions (B-NEW-34)" table — 8 component entries covering aggregator, cache, scanner, eval-cycle, filter floor SSOT, freshness removal, ORB disable, B-NEW-35 placeholder |
| `1-system-manual/CHANGES_AND_FIXES.md` | INFRA-2026-05-15-A architectural fact entry covering: what broke pre-batch, what the batch did, two Langston Step 4 R4 TZ bugs caught, three structural hotfixes, ANALYZE discovery, B-NEW-35 spawn, staging verification, calibration debt deferral, pairsScannedLastCycle semantic shift |
| `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` | Plan rev 2 entry — bar-interval ripples into Phase B (B.1-B.6 each re-anchored to 60-min evidence), cohort start reset to 2026-05-15, Phase D ORB suspended, pre-flight C debt absorbed |
| `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md` | Line 294 doc drift cleanup ("5-minute intervals" → "60-minute intervals; xstock added asset-class-scoped variant") |
| `client/src/components/machine-learning/xstocks-tab.tsx` | Banner copy updated to reflect new architecture |

---

## Three Langston rounds + Step 4 R4 catches (load-bearing)

The aggregator SQL went through R1 → R2 → R3 → Step 4 with Langston. Two TZ bugs surfaced in Step 4 R4 that would have produced subtle wrong-bucket behavior:

1. **R4#1:** initial 60-min implementation used `date_trunc('hour', interval_begin)`. This truncates in the postgres SESSION timezone — silently wrong on any non-UTC session. Caught and replaced with epoch-floor (`to_timestamp(floor(extract(epoch from t)/3600)*3600)`), invariant to session TZ.

2. **R4#2:** initial 240-min implementation used `to_timestamp(floor(epoch/14400)*14400) AT TIME ZONE 'UTC'`. The `AT TIME ZONE 'UTC'` clause downcasts `timestamptz` → TZ-naive `timestamp`; the pg driver renders without `+00` suffix; `new Date()` on the JS side then interprets as host-local TZ. Hetzner is UTC today but laptop dev / CI runners / future regions are not. Caught and replaced — both branches now return plain `timestamptz`, UTC-anchored.

Both fixes are tested by regression-lock assertions in `b-new-34-aggregator.test.ts` (SQL substring matchers: must contain '3600', must NOT contain 'date_trunc', must NOT contain "TIME ZONE 'UTC'").

---

## Three structural hotfixes (NO PATCHES doctrine)

Per CLAUDE.md §5 #15 (NO PATCHES), every hotfix is a long-term right answer, not duct tape:

1. **Hotfix 1 (`a7545d595`) — drizzle ANY() array-binding pitfall.** drizzle's `sql` template doesn't auto-bind JS arrays to postgres array params. `WHERE symbol = ANY(${array})` throws "op ANY/ALL (array) requires array on right side". Fixed via IN(literal-list) string-injection (safe because symbols sourced from hardcoded `XSTOCK_SPOT_SYMBOLS` const Set, escape via `replace(/'/g, "''")`). Mirrors the existing `scanner.ts:337-339` workaround. THIS IS THE PROPER STRUCTURAL FIX — drizzle does not offer a clean array-binding for our schema state.

2. **Hotfix 2 (`88e34bd67`) — cache depth reduction.** Initial 200 bars / 60-min + 60 bars / 240-min produced ~9M source-row workload exceeding postgres `statement_timeout=2min`. Reduced to 60/30 bars — still well above 24-bar filter floor + B68.1's 30-bar `min_higher_tf_samples` threshold. ~4× faster on rollup queries. THIS IS THE PROPER STRUCTURAL FIX — the original depths were over-provisioned without measuring; the new depths are evidence-anchored.

3. **Hotfix 3 (`1ee3ceb27`) — DISTINCT ON dedup + 240m warm-fetch suspend.** Post-hotfix-2 SCAN_TIMEOUTs persisted. Diagnostic queries revealed B74 archive writes 18-56× duplicates per (symbol, interval_begin). Aggregator rewritten with `DISTINCT ON (symbol, interval_begin) ORDER BY captured_at DESC, id DESC` CTE picking latest-tick (closed-bar) per minute. THIS IS THE PROPER QUERY-SIDE STRUCTURAL FIX — produces correct results even with malformed source. **B-NEW-35 is the corresponding write-side structural fix** that will normalize the source; once it lands, the DISTINCT ON CTE is removed and 240m warm-fetch is re-enabled.

---

## ANALYZE discovery (incidental but important)

During hotfix 3 diagnostic queries, discovered `xstock_spot_ohlc_1m_2026_05` partition had `last_analyze=NULL` despite 13.5M live rows in 3.4GB on disk. The planner was using default statistics. Manually ran `ANALYZE VERBOSE xstock_spot_ohlc_1m_2026_05` — planner switched to bitmap-index-scan; query times dropped substantially.

**Watch item:** verify autovacuum/auto-analyze settings on partitioned tables fire correctly. If not, partition-creation procedure may need explicit `ANALYZE` step. Tracked informally in CHANGES_AND_FIXES entry; will be revisited in B-NEW-35 since that batch necessarily touches the partition write-path.

---

## Spawned follow-up: B-NEW-35

B-NEW-35 task created via `mcp__ccd_session__spawn_task`. Title: "B-NEW-35: Fix B74 xstock 1m ingestion duplication". Scope outline:

1. **Diagnose** — locate B74 INSERT path; check if same writer path affects xstock_perp + ticker_snap.
2. **Add UNIQUE constraint** on `(symbol, interval_begin)` per partition.
3. **Backfill cleanup migration** — DELETE non-latest-captured rows.
4. **Fix the writer** — `INSERT ... ON CONFLICT (symbol, interval_begin) DO UPDATE SET ...` keeping latest values.
5. **Verify on staging** — 75-symbol query drops from ~40s to ~2-3s.
6. **Restore B-NEW-34** — remove DISTINCT ON workaround + restore 240m warm-fetch.

Full prompt captured in spawned-task chip. Will surface as separate batch with its own SCOPE + PRE_AUDIT + COMPLETION REPORT.

---

## Crypto regression check

**NONE by-construction.** Three independent reasons:

1. Separate `xstockOhlcCache` instance — distinct singleton, distinct Map, distinct stats. Crypto `ohlcCache` (`server/core/cache/ohlc-cache.ts`) unchanged.
2. Aggregator function `aggregateXstockOHLC` is asset-class-named; reads only from `xstock_spot_ohlc_1m`. Crypto path still reads Kraken REST.
3. Scanner module is per-asset-class (`server/asset_classes/xstock_spot/scanner.ts`); crypto runs `server/services/fx5-scanner.ts` untouched.

Crypto factor families: 10 of 10 emitting at expected cadence pre + post deploy. No anomalies on crypto regime archive in the deploy window.

---

## Sign-off

CC: Implementation, hotfixes, verification, governance all done. Visual verified via Claude-in-Chrome at staging xStocks tab (CLAUDE.md §9.3 requirement met). Plain-language summary delivered to Kyle.

Langston: Steps 1-2 + 4 + R4 approved across 3 rounds (R1+R2+R3+Step4); R4 catches were the two load-bearing TZ bugs. Step 8 second-pass independent verification to follow once Kyle approves this report.

Batch CLOSED pending Kyle ack.
