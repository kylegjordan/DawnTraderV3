# B-STORAGE-HARDEN — Wave D Pre-Audit (Step 2, OBJ-4 + OBJ-3)

change-class: architecture
**Owner:** CC-A · **Reviewer:** Langston · **Date:** 2026-07-08
**Scope:** `B_STORAGE_HARDEN_WAVE_D_SCOPE.md` (Langston Step-1 APPROVED-to-Step-2). Kyle dials: bigger safe cut ~1/8-10s, rolling-30 daily partitions, keep all 477 symbols, xStock-spot-only.

## 1. Q1 (throttle→cadence) — the hard gate — measured, additive not multiplicative
**Gap distribution at throttle=1000ms** (238,261 real gaps, 2026-07-06 market hours): **p50=1275 ms, p90=~3000 ms** — *above* the 1000 ms floor, so capture is **tick-limited** (ticks arrive ~1.3 s median / ~3 s p90), not throttle-limited. **Implication:** at throttle=8000 ms, the throttle becomes the binding limit (8 s ≫ 3 s p90 tick gap) → actual ≈ throttle + one tick ≈ **8–11 s**, well under the **15 s** xStock fill-freshness gate (`active_fill_max_age_ms` + `fill_depth_gate.warmth_max_age_ms` for xstock_spot, both 15 s). It is ADDITIVE (throttle-dominated), NOT multiplicative — a 3–4× fear case does not arise.
- **OBJ-4 target: `passive_archive.b74_ticker_snapshot_min_interval_ms` 1000 → 8000** (~6–7× fewer rows; actual median gap ~1.3 s → ~8–9 s). 8000 chosen over 10000 for **margin** (worst-case p90 ~11 s vs ~13 s under the 15 s gate). Keep all 477 symbols.
- **Confirmation (Langston Q1 hard gate — measured, not extrapolated):** after setting 8000 on staging, measure the ACTUAL inter-capture gap distribution at the new throttle over a ≥10-min market-hours window; require p90 ≤ ~12 s (≥3 s margin under 15 s). If p90 exceeds that, step back to a lower throttle. This live-measure IS the OBJ-4 verification.
- **Depth-median sanity:** the B.1.5 20-min rolling-median depth at ~8 s cadence = ~150 samples/window — ample for a robust median.
- **★ Aggregation safety (Kyle's concern, VERIFIED):** the capture cut touches ONLY `xstock_spot_ticker_snap` (the bid/ask quote stream → spread/depth/freshness). The strategies' 15-/60-/240-MINUTE decision bars are rolled up by `ohlc-aggregator.ts` from `xstock_spot_ohlc_1m` (a SEPARATE WebSocket-fed 1-minute table Wave D does NOT touch). Confirmed: no decision bar is affected. (The "15" that matters to fills is the 15-SECOND freshness gate on the latest quote — unrelated to the 15-minute bar.)

## 2. OBJ-3 — rolling-30 via daily partitioning — the cutover design (the risky part)
**Q2 = transition-forward (no live-table repartition).** `xstock_spot_ticker_snap` is monthly RANGE-partitioned by `captured_at`. Design:
- **Cutover at a MONTH boundary** (the next clean month-start after deploy, e.g. `2026-08-01`). July-and-earlier stay **monthly** partitions; from the cutover month the partition creator makes **daily** partitions (`xstock_spot_ticker_snap_YYYY_MM_DD`). **Zero range-bound overlap** (Langston Q2 requirement): the July monthly partition is `[2026-07-01, 2026-08-01)`; the first daily is `[2026-08-01, 2026-08-02)` — they abut exactly, no overlap (an overlap fails inserts). No existing partition is detached/reshaped — the 63 GB live table is untouched; only NEW partitions change granularity.
- **Transition window (~Aug–Oct):** old monthly partitions (July, June…) age out to warm/cold under the existing sweep as their whole month passes 30 d; new daily partitions age out at a true rolling 30 d. Once the last monthly partition is tiered (~Oct), the hot window is fully rolling-30. No gap, no double-tier (each partition is uniquely monthly OR daily).
- **Partition creator (`b74-create-monthly-partitions.ts`):** add a DAILY mode for `xstock_spot_ticker_snap` from the cutover date — create a forward window of daily partitions (e.g. next 45 days) each run; keep monthly for the other B74 tables (they're not changing). Self-heal current day. **Must run frequently enough** that a day never arrives without its partition (the creator cron is monthly `30 2 28 * *` — TOO SPARSE for daily partitions; needs a DAILY creator run for the daily-partitioned table, or a look-ahead window ≥ the gap between creator runs). **Step-2 decision: add a daily cron for the daily-partition creation (e.g. `0 1 * * *`) with a 7-day look-ahead so a missed run can't leave a day unpartitioned.**
- **b75-retention-sweep partition detection (Q4):** the current regex `(\d{4})_(\d{2})$` matches monthly. For daily (`YYYY_MM_DD`), the trailing `_(\d{2})$` would mis-read `_DD` as the month → silent mis-tiering. **Fix: match the DAILY pattern `(\d{4})_(\d{2})_(\d{2})$` FIRST; only if it doesn't match, try monthly `(\d{4})_(\d{2})$`.** The sweep then tiers a daily partition when its DAY is >30 d old (rolling), and a monthly partition when its whole month is >30 d (legacy). The export's per-day slicing already handles day-granular objects. Golden-fixture test for both name shapes.
- **Migration:** create the transition — the cutover only needs (a) the daily creator to start making daily partitions from the cutover month + (b) the sweep regex change. No data migration (transition-forward). A migration file documents the cutover date + creates the first N daily partitions so day-1 is covered.

## 3. Per-table warm-window knob (Kyle 2026-07-08 — fold in)
`default_warm_retention_days=365` is global. Add optional per-table override `data_lifecycle.<table>.warm_retention_days` read by `b75-cold-rotator.ts` (falls back to the global default when absent) — so a table can reach cold sooner (or a rarely-re-read table go straight-ish to cold) without code. Default behavior unchanged (no per-table rows seeded now). Documented in STORAGE_POLICY.md §7. **Recommendation: leave all at the 365 default for now** (the calibration data benefits from warm fast-access; cost delta is pennies) — the knob just makes it a future one-line dial.

## 4. Verification (Step-7)
- OBJ-4: throttle=8000 on staging; MEASURED p90 inter-capture gap ≤ ~12 s over a market-hours window; rows/hour ~6–7× lower; latest-tick reads + 20-min depth median still served; NO freshness-gate regression. (Active trading is OFF so no live fills at risk during the measure.)
- OBJ-3: daily partitions being created for the cutover month (zero overlap with the sealed monthly); a bounded proof that a daily partition >30 d tiers hot→warm→drop-after-verify on the rolling window; the sweep correctly parses daily-first (golden test); the daily creator cron look-ahead verified; no gap/double-tier at the monthly↔daily seam.
- CI 4-green; governance (STORAGE_POLICY.md + SIM + System Manual data-capture/retention + CHANGES + RUNNING_ISSUES + MULTI_ASSET_VTS working-list + catalog/history/plan + completion + both MEMORYs). **Batch B-STORAGE-HARDEN FULLY CLOSES at Wave D close.**

## 5. Risks
- **R1 — a daily partition arrives unprovisioned → insert fails.** Mitigated: daily creator cron + ≥7-day look-ahead + self-heal-current-day + fail-loud alert. This is the #1 daily-partitioning risk; the look-ahead margin is the guard.
- **R2 — sweep regex mis-parse (daily as monthly).** Mitigated: daily-first matching + golden-fixture test for both shapes.
- **R3 — throttle raised too high → fills block at switch-on.** Mitigated: 8000 (not 10000) for margin + the MEASURED-p90 gate (≤12 s) before commit; active trading is OFF today so no live impact during tuning.
- **R4 — the monthly↔daily seam double-tiers or gaps at cutover.** Mitigated: exact abutting bounds (no overlap) + each partition uniquely one granularity + the transition-window analysis (§2).

## 6. Open questions for Langston (Step-2)
1. throttle=8000 (vs 10000) for the 3 s-p90-tick margin under 15 s — agree, with the MEASURED-p90≤12 s gate as the commit condition?
2. Cutover month-boundary + transition-forward (no live repartition) — agree? Cutover date = first clean month-start post-deploy (name it at implement).
3. Daily creator cron (`0 1 * * *`, 7-day look-ahead) as a NEW cron for the daily-partitioned table (the monthly `30 2 28` creator is too sparse for daily) — agree?
4. Sweep regex daily-first — agree that's the safe parse order + a golden test on both shapes?
5. Per-table warm-window knob added but left at default — agree (a future dial, not a behavior change now)?
