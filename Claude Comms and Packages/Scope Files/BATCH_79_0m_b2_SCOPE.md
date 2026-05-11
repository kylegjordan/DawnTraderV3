# BATCH 79.0m.b2 — Scope

> **Status:** DRAFT — awaiting Langston Step 2 review.
> **Author:** Claude Code
> **Created:** 2026-05-11 (post-B79.0m.b PM2 #221 ship; commits `914a25e05` → `38d19b559`)
> **Parent batch:** B79 (Phase 24, xstock_spot onboarding)
> **Previous sub-batch:** B79.0m.b (Layer-1 starter pipeline wired; 0 trades opened on staging as of 2026-05-11 19:25 UTC)

---

## 🚨 SCAFFOLDING-VS-FUNCTIONAL DECLARATION (CLAUDE.md §9.1)

This batch **WILL MAKE XSTOCK PATTERN-PATH FUNCTIONAL.** Pattern strategies will fire through the parallel pattern pipeline. xstock VTS trades will open + close through asset-class-correct OHLC routing. The xstock pipeline reaches functional crypto parity at the end of this batch.

**What this batch does NOT do:** activate live trading for xstocks (Phase 19 gate stays closed), recalibrate Layer-1 cloned thresholds (Layer-3 evidence-driven, future sub-batch), or fix the xStocks UI tab (Section B from handoff tracker — deferred to a UI-focused sub-batch after pipeline correctness is verified).

---

## 🚨 PREVIOUSLY-STATED-VS-NOW (CLAUDE.md §9.2)

| Topic | Previously stated | Now | Reason |
|---|---|---|---|
| Strategy count for xstock_spot | "10 strategies" in some docs, "7 strategies" in others (incl. xStocks UI tab) | **10 strategies enabled** (DB authoritative: `module_constants.strategy_gates` rows where `asset_class='xstock_spot' AND constant_name='enabled' AND value=true`) | UI was showing only invoked strategies; 3 of the 10 (`breakout`, `sma_trend_ride`, `vwap_bounce`) hadn't fired yet in observed cycles. DB is SSOT per B79.0m.a Langston Step 1 R1. |
| ORB LONG-only status | "ORB enabled for xstock, LONG-only per system invariant" | **ORB allows SELL signals on down-break** ([orb.ts:254-264](server/strategies/orb.ts:254)) | Audit during this batch's strategy-list verification. Violation will produce SHORT trades on xstock once pattern path enables more pair/regime combinations. Bundled fix into this batch. |
| `getOHLCSourceForTrade` exit-path helper status | "Deferred to B79.0m.b2" | **Partially landed in commit `c0a69fb7d`** (exit-side price routing partitions by `assetClass`; xstock symbols read `xstock_spot_ticker_snap`). B73 replay path (`exit-strategy-replay-service.ts:128`) still routes ALL symbols through `ohlcCache.getOHLCData()` which is Kraken-crypto-REST only — xstock close-time B73 replay will fail silently. | Code reading. The original deferred-item scope was broader than just exit price; the B73 replay piece is unresolved. |

---

## Objectives (locked architectural commitment, no debate per handoff doc)

> The xstock pipeline mirrors crypto's `fx5-scanner.ts` + `vts-runner.ts` exactly. Same six filter paths (5 quant families + 1 pattern), same fan-out (pairs in multiple paths get duplicate entries), same family-routed strategy iteration via `STRATEGY_FAMILY_MAP`, same per-pair post-detect math (`computeFinalScore` + `computeNetExpectancyKernel` + `VTS_NET_EV_FLOOR`), same exit-cycle TEC. Differences live in DB rows — NOT code.

### Obj 1 — Parallel pattern path (A1 in handoff)

1.1 **DB seed** — `screener_filters` rows for `asset_class='xstock_spot'`:
- `(mode='paper', filter_path='vts_pattern')` cloned from crypto `(mode='paper', filter_path='vts_pattern', asset_class='crypto_spot')`: `lq_min=43`, `vn_max=0.98`, `di_min=3`, `di_max=100`, `min_price=0.05`, `min_volume=150000`.
- `(mode='live',  filter_path='active_pattern')` cloned from crypto baseline: `lq_min=43`, `vn_max=0.98`, `di_min=5`, `di_max=100`, `min_price=0.25`, `min_volume=250000`.
- Tagged `last_updated_by='b79.0m.b2-pattern-path-cloned-from-crypto'`.

1.2 **DB rows ALREADY EXIST** — verified via psql 2026-05-11: `module_constants.pattern_pool_gates.xstock_spot.{final_score_floor=0.45, max_position_pct=0.50}` were seeded by migration `2026-05-07-b79-xstock-module-constants.sql` (`updated_by='B79_inherit_crypto'`). **No additional seed required.** The new `pattern-filter.ts` module CONSUMES these via `getCachedNumberRequired('pattern_pool_gates', 'final_score_floor', {assetClass: 'xstock_spot', ...})` and `getCachedNumberRequired('pattern_pool_gates', 'max_position_pct', ...)`.

1.3 **Code** — new file `server/asset_classes/xstock_spot/pattern-filter.ts` (~60 LOC):
- `evaluateXstockPatternGlobalFilter(symbol, ohlc, lastPrice, volume24h, mode)` — reads `vts_pattern`/`active_pattern` row, applies `min_price`/`max_price`/`min_volume`/`min_history` (proxy via OHLC depth). Mirrors `global-filter.ts` shape.
- `evaluateXstockPatternIMF(symbol, ohlc, mode)` — reads same row's `lq_min`/`vn_max`/`di_min` thresholds. Returns `{passed, counters, metrics}`. Mirrors `imf-evaluator.ts` per-pair contract.

1.4 **Code** — refactor `eval-cycle.ts`:
- Before strategy iteration, run pattern-global-filter and pattern-IMF in parallel with the quant chain. Detected patterns via `scanPatterns(candles, symbol)` (already imported).
- Pairs surviving pattern filter + pattern IMF tagged `sourcePool='pattern'`.
- Pattern strategies (`STRATEGY_FAMILY_MAP[strategy] === 'pattern'`) iterate ONLY when the pair is on the pattern path. Currently inside-quant-loop pattern firing (current code lines 280-369) is removed; pattern strategies fire via the parallel path with `patternInput = matching detected pattern`.
- Quant survivors run only quant + hybrid + strong_trend strategies (eligibility via existing `STRATEGY_FAMILY_MAP` + `HYBRID_FAMILY_ELIGIBILITY` + `MULTI_FAMILY_ELIGIBILITY` gates).

### Obj 2 — Family fan-out (A2 in handoff)

2.1 **Code** — in `eval-cycle.ts`, replace the single-iteration loop with one iteration per qualifying family. A pair passing 3 family IMFs produces 3 separate strategy-evaluation entries tagged `sourcePool='xstock-${family}'` (e.g. `xstock-trend`, `xstock-reversal`, `xstock-strong_trend`). Each entry runs strategies whose primary family OR multi-family entry matches that lane. Mirrors `fx5-scanner.ts:1607-1643`.

2.2 **Code** — fan-out + pattern path can BOTH admit the same pair, producing duplicate `signal_eval_archive` rows (per Kyle confirmation; matches crypto behavior). The per-pair iteration is `for each (family qualified) UNION { 'pattern' if pattern-passed } { evaluate strategies eligible for that lane }`.

2.3 **Counter accounting** — `XstockEvalCycleCounters.familyFanOutSum` already exists (B79.0m.b iteration 2); preserve. Add `XstockEvalCycleCounters.patternFanOut` (pairs admitted to pattern path). Pattern survivors counted both in their family lanes AND under pattern when both apply (the union semantic is identical to crypto's `taggedVtsSurvivors`).

### Obj 3 — ORB LONG-only fix (newly discovered violation)

3.1 **Code** — in [server/strategies/orb.ts:254-264](server/strategies/orb.ts:254), replace the `else { direction = 'SELL'; ... }` branch with `setNullReason('sell_disabled_long_only'); return null;` (mirrors [inside-bar-reversal.ts:131-134](server/strategies/inside-bar-reversal.ts:131)). The down-break branch then becomes a no-signal return, preserving the strategy's `signalType: 'QUANT'` invariant in regime-strategy map.

3.2 **Code** — in [server/config/canonical-regime-strategy-map.ts:817](server/config/canonical-regime-strategy-map.ts:817), add `orb: 'breakout'` to `STRATEGY_FAMILY_MAP`. ORB without a family-map entry currently bypasses the family-eligibility gate entirely (it runs against every pair); after this entry it routes through the `breakout` family lane, consistent with its `signalType='QUANT'` + Opening-Range-Breakout semantics.

3.3 **Audit** — quick grep + visual scan of the 6 class-method quant strategies (`breakout`, `mean_reversion`, `range_trade`, `sma_trend_ride`, `vwap_bounce`, `vwap_pullback`) in `strategy-engine.ts` for direction assignment. Document findings in completion report. No code change unless a SELL leakage is found.

### Obj 4 — `getOHLCSourceForTrade` exit-path helper (deferred-from-b.b carry-over, partially)

4.1 **Already-landed verification** — re-confirm via Read of `vts-runner.ts:1985-2074` that exit-side price routing partitions by `assetClass`. No code change to this part.

4.2 **Code (new gap)** — extend the helper concept to the B73 replay path. `exit-strategy-replay-service.ts:128` (`fetchOhlcForReplay`) currently calls `ohlcCache.getOHLCData(symbol, 1, sinceSeconds, ...)` for all symbols. Branch by `tradeRow.asset_class`:
- `crypto_spot` → existing `ohlcCache.getOHLCData()` path.
- `xstock_spot` → query `xstock_spot_ohlc_1m` over the same window (mirrors `eval-cycle.ts:fetchXstockOHLC` shape, widened for arbitrary time range).
- Other asset classes → log + skip (no replay).

4.3 **Caller-site change** — `fetchOhlcForReplay` signature gains optional `assetClass: string` parameter (default `'crypto_spot'` for back-compat). Caller in `exit-strategy-replay-service` threads it from the trade row.

### Obj 5 — Schema-file drift hotfix

5.1 **Code** — `shared/schema.ts:480-483` `screenerFilters` table-options block. Update `uniqueModePath` index definition from `(table.mode, table.filterPath)` to `(table.mode, table.assetClass, table.filterPath)` to match production DB state (`screener_filters_mode_class_path_idx`). The DB constraint is correct; this is closing schema-source-of-truth drift only. **No data migration needed; index already exists in production with correct columns.** Will rename the constant + index name in TS to match production.

---

## Out of scope (explicitly deferred)

- **UI fixes on xStocks tab** (Section B in handoff: `undefined` rendering, missing per-family rows, `[object Object]` applicability, 7-vs-10 strategy display, etc.). Tracked for the next sub-batch (B79.0m.c or similar). Per Kyle: pipeline first, UI second.
- **Per-strategy threshold authoring** for the 9 non-ORB xstock strategies (still on wildcard `module_constants.strategy.<name>` rows). Layer-3 evidence-driven.
- **Family threshold recalibration** (VN dominance in current diagnostics: 402/1295 family-IMF fails are VN). Layer-3 evidence-driven, post-pattern-path-flow.
- **Regime classifier 4 remaining branches** (RBS/IE/HVU/ST authored explicit rows; only TFS done). Separate sub-batch.
- **Skipped-signals `asset_class` field + Filter Diagnostics co-mingling fix.** Small separate task.
- **Asset-class log-tag refactor** — partial coverage today; full consistency pass is a separate cleanup.
- **B73 ablation panel for xstock_spot** (the parallel ablation framework per onboarding workflow §F.0). After enough trade volume to make panels meaningful.

---

## DB seed values (locked, paper + live)

```sql
-- vts_pattern (paper)
INSERT INTO screener_filters
  (mode, asset_class, filter_path,
   lq_min, vn_max, di_min, di_max,
   min_price, max_price, min_volume, max_bid_ask_spread,
   min_history_days, min_liquidity, min_market_cap,
   exclude_stablecoins, last_updated_by)
VALUES
  ('paper', 'xstock_spot', 'vts_pattern',
   43.00, 0.9800, 3.00, 100.00,
   0.05, 100000.00, 150000.00, 1.50,
   21, 150000.00, 50000000.00,
   false, 'b79.0m.b2-pattern-path-cloned-from-crypto')
ON CONFLICT (mode, asset_class, filter_path) DO NOTHING;

-- active_pattern (live)
INSERT INTO screener_filters
  (mode, asset_class, filter_path,
   lq_min, vn_max, di_min, di_max,
   min_price, max_price, min_volume, max_bid_ask_spread,
   min_history_days, min_liquidity, min_market_cap,
   exclude_stablecoins, last_updated_by)
VALUES
  ('live', 'xstock_spot', 'active_pattern',
   43.00, 0.9800, 5.00, 100.00,
   0.25, 100000.00, 250000.00, 1.50,
   21, 250000.00, 50000000.00,
   false, 'b79.0m.b2-pattern-path-cloned-from-crypto')
ON CONFLICT (mode, asset_class, filter_path) DO NOTHING;

-- pattern_pool_gates rows ALREADY EXIST per `2026-05-07-b79-xstock-module-constants.sql`
-- (verified 2026-05-11: 2 rows, updated_by='B79_inherit_crypto'). No INSERT needed.
```

---

## Verification gates

| Gate | Acceptance criterion | Verification method |
|---|---|---|
| G1 — CI green | TS check + tests + build + Docker GREEN on push | GitHub Actions |
| G2 — DB seeds confirmed | `SELECT COUNT(*) FROM screener_filters WHERE asset_class='xstock_spot' AND filter_path IN ('vts_pattern','active_pattern')` = 2 (this batch seeds these). `pattern_pool_gates.xstock_spot.*` already = 2 (pre-existing). | psql |
| G3 — Pattern path emits counters | Per-cycle `SCAN_EVAL_DONE` log shows `pattern_passed>0` and `pattern_imf_passed>0` during RTH hours | PM2 logs |
| G4 — Fan-out evident | `familyFanOutSum > familyQualifiedUnique` (sum strictly greater because some pairs pass >1 family) | PM2 log or `/api/xstocks/filter-diagnostics` curl |
| G5 — First xstock signal admitted | At least 1 `signal_eval_archive` row with `asset_class='xstock_spot'` AND `reject_stage='admitted'` AND `final_score > 0` within 4h of RTH open | psql |
| G6 — First xstock trade opens | `SELECT COUNT(*) FROM vts_open_trades WHERE asset_class='xstock_spot'` ≥ 1 | psql |
| G7 — Pattern strategy fires through pattern path | At least 1 admitted signal with `strategy IN ('morning_star','inside_bar_reversal','pivot_shift')` AND `source_pool='pattern'` | psql |
| G8 — ORB LONG-only | No `signal_eval_archive` rows where `strategy='orb' AND features->>'direction'='SELL'` | psql |
| G9 — Exit-path safe for xstock | A synthetic xstock trade closed via TEC produces a B73 replay row (or, if synthetic not feasible, code review of `exit-strategy-replay-service.ts` patch confirms asset-class branch) | psql + code review |
| G10 — Crypto no-touch fence | 10 factor families × 7-8/hr ±10% baseline unchanged 1h post-deploy | `regime_factor_alternates` query (see no-touch SQL in MEMORY) |
| G11 — Schema-file drift closed | `npm run typecheck` clean after Drizzle schema update | Local + CI |
| **G12 — Pattern strategy params resolution** (Langston rev1 edit #6) | When pattern strategies fire on first xstock signal, `getCachedNumbersForModule` resolution returns either an xstock-scoped row OR a documented wildcard fallback. No `undefined` resolution paths. | Code review + first-fire log inspection |

**G7 SQL** (Langston precheck correction — sourcePool lives in jsonb, not top-level): `WHERE asset_class='xstock_spot' AND features->>'sourcePool' = 'pattern' AND strategy IN ('morning_star','inside_bar_reversal','pivot_shift') AND reject_stage='admitted'`.

**Verification posture per CLAUDE.md §9.3:** PM2 logs + DB state are ground truth. Claude-in-Chrome navigation of xStocks UI tab is *secondary* — the tab has known display bugs (Section B in handoff) that are intentionally NOT fixed in this batch. UI verification of `Machine Learning` page is required, but failures on the xStocks tab specifically don't block this batch as long as G3-G7 + G10 pass.

---

## Implementation order

1. Author DB migration SQL (Obj 1.1; 1.2 is no-op — rows pre-exist; 5.1 separately)
2. Build `pattern-filter.ts` (Obj 1.3) — per-cycle hard-coded 60-bar floor (matches global-filter.ts:109), `min_history_days` treated as corpus metadata per §-1.1
3. Refactor `eval-cycle.ts` for parallel pattern path + family fan-out (Obj 1.4 + 2.1 + 2.2 + 2.3) — add `patternRejectByMinHistory` + `patternFanOut` counters
4. ORB fixes (Obj 3.1 + 3.2 + 3.3) — capture pre-deploy crypto baseline SQL per §-1.7
5. B73 replay branching (Obj 4.2 + 4.3) — add `[B73-REPLAY][XSTOCK] err=...` log + `b73_xstock_replay_errors` counter per §-1.6
6. Schema-file drift (Obj 5.1)
7. Add unit tests: ORB LONG-only return-null; pattern path admits a fixture pair; family fan-out produces N entries; **pattern-strategy `getCachedNumbersForModule` resolves with wildcard fallback (Langston edit #5)**
8. Deploy → verify G1-G12 in order. Capture ORB rollback baseline SQL pre-deploy (§-1.7).
9. Governance updates (BATCH_CATALOG, PHASE_HISTORY, SIM, SYSTEM_MANUAL, CHANGES_AND_FIXES, RUNNING_ISSUES, MEMORY × 2 paths, Langston MEMORY).
10. Completion report with G1-G12 evidence + governance-files-changed list + EXPLAIN ANALYZE result + ORB pre/post baseline + calibration-debt callout for §-1.2/§-1.3.

---

## Open architectural questions for Langston

(Only true ambiguities — no Q1-Q5 to Kyle per resolution discipline.)

**Q-L1.** Pattern path with fan-out: when a pair passes pattern IMF AND ≥1 family IMF, my plan emits `1 + N_families` entries (one pattern + N family lanes). Crypto's `fx5-scanner.ts:1607-1643` does the same shape. Confirm or flag.

**Q-L2.** ORB family-map entry: I'm adding `orb: 'breakout'`. Alternative is `orb: 'pattern'` since "Opening Range Breakout" detects an intraday-shape signal similar to a chart pattern. My read: ORB's `signalType='QUANT'` + range-breakout geometry argues for `breakout` family; the pattern path is reserved for `scanPatterns()`-detected technical formations. Confirm.

**Q-L3.** B73 replay branching by asset_class — the `fetchOhlcForReplay` extension adds a Drizzle query for `xstock_spot_ohlc_1m`. This means the replay service now imports `db` + `sql` directly. Anything I'm missing about that path being async fire-and-forget and the cost of adding a DB read per closed-trade replay?

---

*End of B79.0m.b2 scope. Awaiting Langston Step 2 review.*
