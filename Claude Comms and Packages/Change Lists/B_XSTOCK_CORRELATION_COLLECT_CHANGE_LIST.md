# B-XSTOCK-CORRELATION-COLLECT — CHANGE LIST (Step 3 → Step 4), CC-A, 2026-11-05

| field | value |
|---|---|
| **(i) declared change-class** | `architecture` (scope header) |
| **(ii) the class's doc set** | scope `Scope Files/B_XSTOCK_CORRELATION_COLLECT_SCOPE.md` — **present** (r3, PROCEED) · pre-audit `Scope Files/B_XSTOCK_CORRELATION_COLLECT_PRE_AUDIT.md` — **present** (r2 + condition, PROCEED) · change list — **this file** · System Manual, System Impact Map, `XSTOCK_CALIBRATION_PLAN.md`, `BATCH_CATALOG`, `PHASE_HISTORY`, `CHANGES_AND_FIXES`, `RUNNING_ISSUES`, task list — **present (Step 10)** · `DELETED_COMPONENTS_LOG.md` — **present** (entry added this commit) · completion report — **absent, Step 11** |
| **(iii) Step-2 reference** | `B_XSTOCK_CORRELATION_COLLECT_PRE_AUDIT.md` (PROCEED `1567796287091249224`, condition folded at `00a794cab`) |

## What changed, by plan item
| plan | file | change |
|---|---|---|
| **P-1** | `server/core/metrics/pair-correlation.ts` | `resolveCorrelationInputs(assetClass, pairOhlc, config, sources?)` — crypto: Kraken 60-minute reference through the SAME inline mapper the call sites carried (moved verbatim), pair untouched (same array), `alignedByTimestamp=false`; xStock: the pair's own interval read from its timestamps (`inferIntervalMinutes`, 15 or 60 else `{ skip }`), the xStock bar store at that interval, both series reduced to shared timestamps (`alignByTimestamp`). Sources injected for tests. |
| **P-2** | `drizzle/migrations/2026-11-05-b-xstock-correlation-collect.sql` (+ rollback, MANIFEST) | `b68_3_apply_factor` `*`=true, `xstock_spot`=false; xStock `b68_3_compute_correlation_enabled` → true; in-transaction count check. **Dry-run on staging inside a rolled-back transaction:** four rows as intended inside, 0 apply rows after rollback. |
| **P-2** | `server/services/market-context-engine.ts` | loads `b68_3_apply_factor`; missing ⇒ the existing throw (no default). |
| **P-3** | `signal-orchestrator.ts`, `vts-runner.ts` | `?? getCurrentPairCorrelationConfig()` removed for this factor (null ⇒ skip + one line naming the class); `resolveCorrelationInputs` replaces the inline Kraken fetch; `if (cfg.applyFactor) chain *= result.factor`; the alternate input carries `applied`, `intervalMinutes`, `alignedByTimestamp`. |
| **P-4** | `pair-correlation.ts` `buildB68_3Alternate` (+ `factor-ablation-builders.ts`) | new REQUIRED `opts` param. Not applied ⇒ **top-level `alternate.confidence` = real confidence** (Langston's binding condition), `confidence_without_factor` = real, `confidence_with_factor` = real × factor; applied ⇒ unchanged divide-out. Every row gains `factor_applied`, `interval_minutes`, `aligned_by_timestamp`. |
| **P-5** | `server/asset_classes/xstock_spot/eval-cycle.ts` | after `registerOpenVtsTrade` returns an id: compute and emit one `vts_trade` row, `strategy = strategyKey`, real decision `{ regimeLabel: regime ?? 'UNKNOWN', confidence: mceContext.regime.confidence }`, `applied: false` (this path has no chain). Gated on the class's compute flag; best-effort, logged, never blocks the trade. |
| **P-6** | `factor-replay-core.ts` (+ `replay-ablation.ts`, `scripts/b-new-33-factor-backtest.ts`) | `tradeIndexKey(assetClass, symbol, strategy)` at all four sites; matchers take the class; JSONL records without `assetClass` are skipped, never guessed (4,160 of 4,160 in the retained window carry it). |
| **P-7** | `drift-dashboard-aggregator.ts` | `computeFactorCalibration` only: `alternate_decision->'metadata'->>'factor_applied' IS DISTINCT FROM 'false'`. `computeAblationComparison` (`:532`) unchanged. |
| **fix on find** | `server/strategies/strategy-helpers.ts`, `pair-correlation.ts` | **`spearmanRankCorrelation` looped for ever on one NaN** (`let j = i` then `NaN === NaN` is false, so `i` never advanced; introduced `67afdc1e0`, 2026-03-03). Now `let j = i + 1` — identical ranks for every finite input. `computePairCorrelation` also requires finite CURRENT closes (prev was already guarded by `> 0`). Callers of the routine: this module and `defensive-hedge.ts:186`. Found because the new NaN test hung the test worker. |
| **legacy** | `server/scripts/replay-ablation.ts` | the unused module-level `buildVtsTradeIndex` / `findVtsTradeByNaturalKey` (old class-less key) deleted, archived, logged. |
| **legacy** | `server/services/market-context-engine.ts` | `getCurrentPairCorrelationConfig()` + its field: callers were only the two fallbacks P-3 removed; deleted, logged (no archive copy — four lines, in git). |

## Tests
- **New `server/tests/unit/b-xstock-correlation-collect.test.ts` — 16/16:** routing (crypto → Kraken stub, same pair array; xStock → xStock stub at 15; unreadable interval ⇒ skip with no fetch); time pairing (a gap INSIDE the 30-bar window: aligned bars share timestamps, `sample_count = 29`, positional result differs); bar shape (a NaN close drops a return, `sample_count < 29`; reference closes finite); cold start below 30 shared; record-only alternate exact; applied unchanged; P-3 source fence on both call sites; P-6 DASH/USD cross-class; P-7 filter exactly once and inside `computeFactorCalibration`; the NaN-hang fix with a 2 s timeout.
- **Mutations RUN (each restored):** alignment removed → fails · record-only divides out → fails · replay key without class → fails · rank loop back to `j = i` → the run HANGS (no result in 90 s) · xStock routed to Kraken → fails.
- **Updated for the new signatures:** `b68-3-pair-correlation`, `b76-chain-final-emit`, `b79-0n-confidence-chain-*` (2), `b-new-33-factor-replay-core`, and `reorg-b4-shadow-table-isolation` (its keys now `tradeIndexKey(...)`; its "real key present" positive control is what caught the format change).
- **31 test files that reference the changed modules (incl. the new one and `market-context-engine`): 392 passed, 4 skipped;** `b63-item12-geometry-override` needs a local Postgres and fails identically without these changes (control run).
- **`tsc`:** the error set in every touched file is identical before and after (19 pre-existing, line numbers aside); the checker reads those files, so its silence on the new lines is meaningful.

## For Langston to attack
1. The interval is READ from the pair series' timestamps rather than configured — no literal and no mismatch possible, but a series with irregular spacing reads as its median gap.
2. The NaN fix lives in a shared helper (`defensive-hedge` also calls it). For finite input the change is provably a no-op (`sorted[i].v === sorted[i].v`); the only behaviour change is that NaN input terminates.
3. P-5's emit runs once per opened xStock VTS trade (one cache read, cache-hit within 5 minutes).

## Not done yet in this batch
- **P-9** US-hours repeat of A-2 with its pre-registered 90 % stop threshold — before Step 3 is called closed (US open 14:30Z).
- Step 10 governance (listed above).

## Step 4 — Langston PROCEED on `c74ff4dbf` (Discord `1567830296206901349`); re-land with his conditions
- **Re-land:** the exact inverse of the revert `ca10b8534` (no intervening edits to the batch's files). Verified: every file equals `c74ff4dbf` except `vts-runner.ts`, whose change against head is exactly `c74ff4dbf`'s hunks — ANALYST's `da3415b3b` (`isXstockRailPagingTime`, `:106`, `:4035-4038`) is present in the re-landed file, read. Fresh CI 4/4 per job at the re-land sha is owed; the earlier 16/16 and 392 do not carry forward.
- **C-2 (rule 23, folded):** `defensive-hedge.ts` `computeReturns` now also requires a finite CURRENT close — the same gap as `pair-correlation.ts`. Source fence added to the batch test.
- **C-3:** `loadClosedVtsTradesFromDb` skips a row without `asset_class`, as the JSONL half does (the column is NOT NULL today — a fence).
- **Record items:** (3) the P-7 fence is now bounded on both sides (after `computeFactorCalibration` starts, before the next `export`). (2) **A second reader of the confidence-with/without fields:** `scripts/b-new-37-inversion-forensics.ts:320-323` — a manual one-off; it would read record-only rows as applied. Not changed; any re-run filters `factor_applied`. (1) **P-5 has no counter**, so Step 7 needs a named positive read, pre-registered here: over the first 24 h after deploy, `regime_factor_alternates` rows with `factor_name='b68_3_pair_correlation'`, `asset_class='xstock_spot'`, `alternate_decision->'metadata'->>'factor_applied'='false'`; **expected magnitude: within a factor of two of the xStock VTS trades OPENED in the same window** (one row per opened trade; 7,895 xStock VTS trades closed in the 14 days to 2026-11-05 ≈ 560/day); control: crypto `b68_3` rows in the same window keep accruing. Fewer than a quarter of the opened trades ⇒ the emit is failing and the `[B-XSTOCK-CORRELATION-COLLECT][SKIP|ERROR]` lines are read before anything else.
- Tests: batch file 17/17.

## Step-7 read, clarified before the deploy (2026-11-05 ~13:20Z)
- The pre-registered control ("crypto `b68_3` rows in the same window keep accruing") counts **VTS-sourced rows only** (`source_type = 'vts_trade'`). Langston measured 13:02Z that the PAPER active-signal path fails every write (`#231`: a string signal id into an integer column), so paper-sourced rows are 0 for a reason outside this batch. This batch's new xStock record also goes through the VTS source (`kind: 'vts_trade'`, emitted at `server/asset_classes/xstock_spot/eval-cycle.ts:1407`, inside `if (tradeId)` at `:1396`, after `registerOpenVtsTrade` at `:1388`, at `a61c60f22`), so `#231` does not touch it.
- **Deploy sha:** `0f4835b5a` (CI 4/4) — before NEW Claude's unreviewed `21c614a0a` and CC-A's unreviewed `e43cae96e`; its range from the deployed `0abfd7102` is this batch only. Held until P-9 (after 14:30Z).

## P-9 — the US-hours repeat of A-2, PASS (2026-11-05 14:36:52Z, CC-A)
- **Run:** `corr_measure.ts` (scratchpad; the cache's own read path reproduced read-only — snapshot read + live overlay + merge, no write-back) on staging as deploy at the deployed `0abfd7102`, 6 min after the US open; universe 473, population the 472 non-SPY symbols.
- **Pre-registered threshold (pre-audit P-9, Langston's 90 % stop line):** ≥ 90 % of non-SPY symbols with ≥ 30 shared 15-minute timestamps with SPY. **Result: 461 of 472 = 97.7 %** (median shared 98) — **PASS** (overnight read: 98.5 %).
- **Controls in the same run:** served ≥ 30 bars 469 of 472; non-finite or non-positive closes in the last 30: 0; **index-aligned 30/30 with SPY: 42 of 469 (9.0 %)** — positional pairing would still pair different hours for 91 % of symbols, so the time alignment is load-bearing in US hours too. 60 m for reference: 285 of 472 (60.4 %) aligned ≥ 30 — this batch uses 15 m for xStock.
- ⇒ Step 3 closes; deploy at `0f4835b5a` follows.

## Step 6 + first Step-7 look (2026-11-05)
- **Deploy:** `0f4835b5a4fe3af461113b52f626017b01dbafa9` at 14:40:02Z by cc-a (`dt-deploy` OK, engine resumed, migration 14:39:49Z); range from the previous `0abfd7102` = this batch only. Rollback sha `0abfd7102`.
- **Constants after the migration:** `b68_3_apply_factor` `*`=true, `xstock_spot`=false; `b68_3_compute_correlation_enabled` `*`=true, `xstock_spot`=true — as intended.
- **First look, 14:55Z (15 min, NOT the pre-registered 24 h read):** `regime_factor_alternates`, `factor_name='b68_3_pair_correlation'`, `evaluated_at >= 14:40:02Z`: **xStock 55 rows, all `vts_trade`, `factor_applied=false`, `interval_minutes=15`, `aligned_by_timestamp=true`**; crypto 2 rows `vts_trade`, `factor_applied=true`, `interval_minutes=60`, `aligned_by_timestamp=false` (unchanged path — the control). `[B-XSTOCK-CORRELATION-COLLECT][SKIP|ERROR]` lines in `out.log` + `error.log`: 0 (a silence, not a proof — the tag has never fired, no positive control).
- **Owed:** the pre-registered 24 h read (~2026-11-06 14:45Z): xStock rows within a factor of two of the xStock VTS trades OPENED in the window; crypto VTS rows keep accruing.

## Step 7 — first-pass verification (CC-A, 2026-11-22; reads by `dt-sql`, window 2026-11-05 14:40:02Z → 2026-11-06 14:40:02Z unless stated)
- **The pre-registered coverage read, quoted as written (Step 4, record item 1):** *"expected magnitude: within a factor of two of the xStock VTS trades OPENED in the same window … Fewer than a quarter of the opened trades ⇒ the emit is failing."* **Result: 417 xStock `b68_3` rows (all `vts_trade`, `factor_applied=false`) against 2,409 xStock `vts_open_trades` rows opened = 17 %. AS WRITTEN, THE CRITERION FAILS.**
- **Why, stated beside it and not rewritten:** the denominator I pre-registered counts every opened row in `vts_open_trades`; 1,808 of the 2,409 are shadow rows and 184 are twin rows, and the record is emitted only when a real VTS trade registers (`server/asset_classes/xstock_spot/eval-cycle.ts:1407`, inside `if (tradeId)` at `:1396`, after `registerOpenVtsTrade` at `:1388`, at `a61c60f22`); shadow ids are minted at `vts-runner.ts:1119` and twins at `:5437` go through `insertOpenTrade`, and neither reaches an emit, so those 1,992 can never carry one. **Real xStock VTS trades opened in the window: 417; with a record: 417 (100 %).** From the window's end to 2026-11-22: **3,177 of 3,182**; the 5 misses are TBLL/USD on 2026-11-10, each the designed `[B-XSTOCK-CORRELATION-COLLECT][SKIP]`. TBLL is a 15-minute instrument with missing bars: `inferIntervalMinutes` (`server/core/metrics/pair-correlation.ts:134`) takes the median gap, and on 11-10 its 13 gaps were 15 ×6, 30 ×3, 45, 60, 75 and 90, so the median was 30 and the symbol was skipped. Its daily medians 11-06 → 11-20 were 15, 15, 30, 225, 75, 15, 45, 15, 15, 30, 15 — not 15 on 5 of those 11 days. A coverage gap on the illiquid tail (5 of 3,182 = 0.16 %; exposure across other thin symbols unmeasured) — `RUNNING_ISSUES` `#1266`. ⇒ **Langston's Step-8 ruling: the criterion is VOID AS SPECIFIED — the 17 % stands as measured and is not a FAIL; the objective is discharged on the named object, 417/417 in the window and 3,177/3,182 after it.**
- **Control:** crypto `b68_3` rows in the same window: 43, all `vts_trade`, `factor_applied=true` — the unchanged path kept accruing.
- **Join key:** every xStock record carries a distinct `vts_trade_id` that joins to `vts_open_trades` — 3,594 of 3,594 since the deploy.
- **OBJ-4 (no xStock decision changes):**
  - **Confidence:** on all 417 window records the top-level `alternate.confidence` equals the trade's real confidence, `confidence_without_factor` equals it too, and `confidence_with_factor` = without × factor, with the factor between 1.0047 and 1.0500 and never 1.0 — so the record carries the counterfactual while confidence is untouched. PASS (Langston re-measured at Step 8). The `[B68.3][correlation]` applied-factor 1.0000 lines are in the out stream, which is tiered off the box after about 3.5 days, so they were not read; the record fields are the same fact at the row.
  - **xStock VTS opens:** 21.1 real opens an hour in the 24 h before the deploy (506) against 17.4 after (417); weekday daily counts over the month range 174 to 502. Within normal variation — PASS.
  - **xStock paper positions** (`closed_trades` + `active_open_positions` by `opened_at`; the `trades` table has held no rows since 2026-10-20): 37 in the 24 h before, 42 after; daily counts 2026-10-20 → 11-20 range 1 to 70. PASS.
- **Replay of the new rows** (nightly replay, pre-existing design — it records a decision difference, not P/L), since the deploy: xStock 2,224 `admitted_breakeven` + 1,370 `unreplayable_real_rejected` (3,594, all completed); crypto 252 + 168, 13 pending. Both classes show the same ~38-40 % real-rejected share. **HYPOTHESIS, not a finding:** records are emitted only after a trade registers, so a real-rejected label probably means the replay's lookup misses trades still open at replay time; it is the same in crypto, so it predates this batch. Measured at Step 8 for xStock (section below): the hypothesis holds. DISPOSITION: decision required — no work, proposed to Kyle via PM Claude (Discord `1574060303736381561`); `RUNNING_ISSUES` `#1265`.
- **UI (Claude-in-Chrome, `/analytics` → Drift Dashboard, 2026-11-22 13:36Z):** *Factor Ablation Comparison*, 7 d: `b68_3_pair_correlation` 1,209 rows (1,196 replayed, 13 pending) against 193 for each other factor — the extra 1,016 are the xStock record-only rows, counted and replayed, real values, no "--". 24 h on a Sunday: `b68_3` 39 = every other factor (xStocks are closed at the weekend, so only crypto rows). *Factor Calibration*, 7 d: `b68_3` n = 180 = the other factors — the record-only rows are kept OUT of the calibration view, as intended (OBJ-1 readers).
- ⇒ Step 7 done with one item for Langston's ruling (the denominator) and one scheduled review (the replay label).

## OBJ-2 field census (added at Step 10 — the Step-7 text did not report it)
Over the 417 window records:

| field | value |
|---|---|
| `strategy` | not null on 417 |
| real confidence | not null on 417 |
| `is_btc_self_reference` | false on 417 |
| `btc_reference_available` | true on 417 |
| `cold_start` | false on 417 |
| `sample_count` | min = max = 29 |
| `reference_symbol` | `SPY/USD` (1 distinct) |
| `interval_minutes` | 15 on 417 |
| `aligned_by_timestamp` | true on 417 |
| `factor_applied` | false on 417 |
| spread | 226 symbols, 390 distinct correlations (bars of ≥10) |

**PASS in full.**

**Sample row** — MRNA/USD `morning_star`, 2026-11-21T00:36:35Z: `source_type` vts_trade · `asset_class` xstock_spot · `exchange` kraken · `signal_id` null · `vts_trade_id` `vts_xstock_spot_…` · `factor_state` alternate_disabled. `real_decision`: confidence 0.54196 · regimeLabel STRUCTURAL_TRANSITION · admissionPossible true · sourcePool xstock-trend · calibrationFrameworkVersion b76_chain_final. `alternate_decision.confidence` 0.54196; its `metadata`: label NEUTRAL · sample_count 29 · lookback_bars 30 · interval_minutes 15 · reference_symbol SPY/USD · correlation_to_btc 0.6158 · decorrelation_score 0.3842 · pair_correlation_factor 1.01921 · confidence_with_factor 0.55237 · confidence_without_factor 0.54196 · factor_applied false · compute_disabled false · aligned_by_timestamp true · is_btc_self_reference false · btc_reference_available true · cold_start false. `replay_outcome` admitted_breakeven.
- **Naming carry:** on xStock rows `correlation_to_btc`, `btc_reference_available` and `is_btc_self_reference` hold the `SPY/USD` reference's values (single writer `pair-correlation.ts:376`, no non-test reader). Read `reference_symbol` to know which reference a row used.

## Step 8 — Langston PROCEED (Discord `1574059564003754106`)
- Re-derived at the ref: the three `emitAblationRecord` call sites (`signal-orchestrator.ts:2056`, `vts-runner.ts:3103`, `eval-cycle.ts:1407`); the xStock emit block byte-identical between deployed `0f4835b5a` (`:1345-1378`) and graded `a61c60f22`; the leading-token census shadow 1,808 + vts 601 (184 `_twin`) = 2,409; 0 orphans of 3,594.
- Ruling on the denominator: **VOID AS SPECIFIED** — the 17 % stands as measured and is not a FAIL; discharged on the named object. Successor gap: the SKIP arm has no counter → `#1266`.
- Owed and done at Step 10: the two body corrections above (the TBLL cause, the confidence sentence) and this OBJ-2 table.
- Replay label (answered to PM Claude, Discord `1574061383186784430`): xStock 1,370 `unreplayable_real_rejected`, all join their trade; 1,347 closed after marking, 0 before, 23 still open. Mechanism at `fcd838134`: `server/scripts/replay-ablation.ts:193` selects rows with a null `replay_completed_at` (limit 5,000) and `:233` sets it on marking; `server/services/factor-replay-core.ts:180-182` loads closed, non-shadow trades opened since the cutoff. Crypto ids do not join `vts_open_trades` (0/420) — unmeasured. Re-check after a fix: YES (Discord `1574062181270691952`) — clear both fields, 1,370 is under the cap, provided the fix stops marking a row before its trade closes; the write goes through review. → `#1265`.
- Both gaps proposed to Kyle via PM Claude (Discord `1574060303736381561`); no work started.
- Step 9 not needed.
