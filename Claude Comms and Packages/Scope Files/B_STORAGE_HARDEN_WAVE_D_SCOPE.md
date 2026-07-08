# B-STORAGE-HARDEN — Wave D Scope (OBJ-4 capture reduction + OBJ-3 rolling-30 retention) — the LAST wave

change-class: architecture
**Owner:** CC-A · **Reviewer:** Langston · **Parent:** B-STORAGE-HARDEN (Waves A+C done). **Kyle dial decisions:** 2026-07-08 (AskUserQuestion).

> Closes the batch. Reduces the #1 disk consumer (`xstock_spot_ticker_snap`, 63.6 GB/mo) via TWO orthogonal levers, both bounded by the consumer audit so no consumer is starved.

## 0. Consumer audit (the mandatory pre-cut investigation — DONE)
Every reader of `xstock_spot_ticker_snap` traced (15 files). Two read patterns:
- **Latest-tick-per-symbol** (`ORDER BY captured_at DESC LIMIT 1`, index-served): qd-probe, price-liveness, active-dispatch, vts-runner, depth-source, routes diag. Needs only the CURRENT price — insensitive to cadence *provided capture stays under the freshness gates*.
- **Window reads (scanner):** a 30-min `DISTINCT ON` enrichment (needs ≥1 tick/sym/30min — trivial) + the **B.1.5 rolling-MEDIAN top-of-book depth over ~20 min** (`percentile_cont(0.5)`, CLAUDE.md rule #13) — needs ENOUGH ticks/20min for a robust median (at ~1/4s = ~300 samples — ample).
- **Binding freshness gates (matter at the imminent active-trading switch-on):** `xstock_fill_safety.active_fill_max_age_ms=15000`; `fill_depth_gate.warmth_max_age_ms` = **5000 AND 15000 (DUPLICATE ROW — must resolve which is live; the tighter 5 s bounds cadence)**; `market_data.data_freshness_window_ms=90000`; `qd_probe.freshness_ceiling_ms=600000`. **Current capture:** ~1 tick/sym/**1.8 s** (throttle `passive_archive.b74_ticker_snapshot_min_interval_ms=1000`, actual ~1.8 s), 477 symbols, ~160 M rows/mo.
- **★ The audit prevented a naive 15× cut** — capture is roughly matched to the fill-freshness gates, not wildly over-provisioned. Cadence reduction is a trading-risk-vs-disk dial → Kyle-decided (below).

## 1. Kyle dial decisions (LOCKED 2026-07-08)
- **Cadence:** CONSERVATIVE — slow to ~1 tick/4 s (**~2×**, 63→~30 GB/mo). Stays under the 5 s depth-gate (Step-2 confirms the exact safe throttle after resolving the dup — likely 3000–4000 ms with margin). **NO freshness thresholds changed** — safe for the switch-on.
- **Retention (OBJ-3):** YES — rolling-30 via daily partitioning (~2× hot cut; stacks with cadence → ~4× combined).
- **Symbol set:** KEEP ALL 477 (no narrowing — no symbol goes data-blind if it becomes tradeable).

## 2. Objectives
**OBJ-4 — reduce capture cadence (module_constants knob, NO code):** set `passive_archive.b74_ticker_snapshot_min_interval_ms` 1000 → the safe value (3000–4000 ms, Step-2-confirmed under the live depth-gate warmth). Applies to xstock_spot (+ confirm whether xstock_perp/crypto_spot share the knob or have their own). Verify: (a) the new throttle < the live `fill_depth_gate.warmth_max_age_ms` with margin; (b) the 20-min depth median still has ample samples; (c) measured rows/hour drops ~2×. **No freshness threshold touched (Kyle: conservative).**

**OBJ-3 — rolling-30 via DAILY partitioning (schema change — the higher-risk half):** convert `xstock_spot_ticker_snap` (+ siblings per Step-2) from monthly to **daily** RANGE partitions so a true rolling-30-day hot window is possible with O(1) partition-DROP reclaim (monthly can only drop whole months → up to ~60 d hot). Touches: (a) the partition creator (`b74-create-monthly-partitions.ts` → daily granularity + forward window); (b) the **b75-retention-sweep** partition-detection (regex `(\d{4})_(\d{2})$` monthly → needs `YYYY_MM_DD` daily handling + the tier-at-30d logic); (c) a migration for the partition-scheme transition (existing monthly partitions + go-forward daily — decide: transition-forward vs backfill-repartition; **Step-2 must design the safe cutover** — the write path, the write-sealed invariant, query plans, and NO data loss). B75 export already slices by day, so the warm side is ready. **Alternative if daily-partitioning proves too invasive (Step-2 judgment): monthly + shortened retention** — but Kyle chose rolling-30, so daily is the target unless Step-2 surfaces a blocker.

## 3. Verification (Step-7)
- OBJ-4: throttle constant changed; measured capture rate ~2× lower (rows/hour); depth median + all latest-tick reads still served; no freshness-gate regression (staleness under the live threshold).
- OBJ-3: a 30-day-old daily partition tiers+drops on the rolling window; hot footprint of the ticker table trends to a rolling ~30 d; write path + daily partition-creation cron + the b75 sweep verified on daily partitions; a bounded real proof (create/age/tier/drop a daily partition) mirroring Wave-A/C discipline.
- CI 4-green; governance (SIM + System Manual data-capture/retention chapters, CHANGES, RUNNING_ISSUES, MULTI_ASSET_VTS_EXPANSION_PLAN working-list, catalog/history/plan, completion, both MEMORYs). **Batch B-STORAGE-HARDEN fully CLOSED at Wave D close.**

## 4. Open questions for Langston (Step-1)
1. **Resolve the `fill_depth_gate.warmth_max_age_ms` dup (5000 vs 15000)** — which is live (most-specific-wins vs last-wins)? This sets the exact safe OBJ-4 throttle. (Also a data-quality dup → #433-class; fix or flag.)
2. **Daily-partitioning cutover design** — transition-forward (new daily partitions from a cutover date, existing monthly partitions age out under the old scheme) vs full repartition-backfill (higher risk, cleaner). I lean transition-forward (no backfill of the live 63 GB table; the sweep handles both granularities during the overlap). Agree?
3. **Which tables get daily partitioning** — just `xstock_spot_ticker_snap` (the 63 GB consumer), or the perp/crypto ticker siblings too? (crypto is 2.9 GB — much smaller; may not be worth the schema churn.) I lean xStock-spot-only + confirm.
4. **The b75-retention-sweep partition-detection change** — extend the `YYYY_MM` regex/logic to also handle `YYYY_MM_DD` daily partitions (so the ONE sweep tiers both B74-monthly + B70-monthly + xStock-daily). Agree that's cleaner than a separate daily sweep?
5. change-class = architecture (schema + capture-behavior).
