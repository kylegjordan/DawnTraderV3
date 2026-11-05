# B-XSTOCK-CORRELATION-COLLECT — CHANGE LIST (Step 3 → Step 4), CC-A, 2026-11-05

| field | value |
|---|---|
| **(i) declared change-class** | `architecture` (scope header) |
| **(ii) the class's doc set** | scope `Scope Files/B_XSTOCK_CORRELATION_COLLECT_SCOPE.md` — **present** (r3, PROCEED) · pre-audit `Scope Files/B_XSTOCK_CORRELATION_COLLECT_PRE_AUDIT.md` — **present** (r2 + condition, PROCEED) · change list — **this file** · System Manual, System Impact Map, `XSTOCK_CALIBRATION_PLAN.md`, `BATCH_CATALOG`, `PHASE_HISTORY`, `CHANGES_AND_FIXES`, `RUNNING_ISSUES`, task list — **absent, owed at Step 10** · `DELETED_COMPONENTS_LOG.md` — **present** (entry added this commit) · completion report — **absent, Step 11** |
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
- The pre-registered control ("crypto `b68_3` rows in the same window keep accruing") counts **VTS-sourced rows only** (`source_type = 'vts_trade'`). Langston measured 13:02Z that the PAPER active-signal path fails every write (`#231`: a string signal id into an integer column), so paper-sourced rows are 0 for a reason outside this batch. This batch's new xStock record also goes through the VTS source (`kind: 'vts_trade'`, `factor-ablation-emitter.ts:224`), so `#231` does not touch it.
- **Deploy sha:** `0f4835b5a` (CI 4/4) — before NEW Claude's unreviewed `21c614a0a` and CC-A's unreviewed `e43cae96e`; its range from the deployed `0abfd7102` is this batch only. Held until P-9 (after 14:30Z).

## P-9 — the US-hours repeat of A-2, PASS (2026-11-05 14:36:52Z, CC-A)
- **Run:** `corr_measure.ts` (scratchpad; the cache's own read path reproduced read-only — snapshot read + live overlay + merge, no write-back) on staging as deploy at the deployed `0abfd7102`, 6 min after the US open; universe 473, population the 472 non-SPY symbols.
- **Pre-registered threshold (pre-audit P-9, Langston's 90 % stop line):** ≥ 90 % of non-SPY symbols with ≥ 30 shared 15-minute timestamps with SPY. **Result: 461 of 472 = 97.7 %** (median shared 98) — **PASS** (overnight read: 98.5 %).
- **Controls in the same run:** served ≥ 30 bars 469 of 472; non-finite or non-positive closes in the last 30: 0; **index-aligned 30/30 with SPY: 42 of 469 (9.0 %)** — positional pairing would still pair different hours for 91 % of symbols, so the time alignment is load-bearing in US hours too. 60 m for reference: 285 of 472 (60.4 %) aligned ≥ 30 — this batch uses 15 m for xStock.
- ⇒ Step 3 closes; deploy at `0f4835b5a` follows.
