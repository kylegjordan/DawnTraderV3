# B-RR-FLOOR-HEADROOM — SCOPE (Step 1, r1)

change-class: non_architecture

**Issue:** `#1183` · **Plan row:** `SPRINT_TO_LIVE_PLAN` 59a (row 59 increment 2, pre-sprint P1a) · **Owner:** CC-B (NEW Claude)
*Read at `origin/migration/aws-supabase` after `191ab383c`; staging read 2026-10-17 ~08:20Z UTC.*

## 0. What `#1183` measured, and why it has to be re-measured before anything changes
At `B-ENTRY-DISTANCE-GUARD` Step 2 (staging 2026-10-10, windows W1/W2), the reward-to-risk measured **at the fill** would have refused **7 of 24 crypto** and **31 of 104 xStock** taker opens against the live `expectancy_gates.min_rr` floors, because constant-RR cells are floored 0.05 below their own RR (≈ 0.017 R headroom) against a p90 adverse slip of ≈ 0.57 R. So that batch shipped the fill-time check in **SHADOW** (`[ENTRY_GEOMETRY][SHADOW]`, `entry-booking.ts` `entryFillShadow()`).
**Two things changed after that measurement:**
- **Crypto entries are maker-only since 2026-10-15** (`B-CLASS-LEG-FILL-MODE`, `30af855f2`): a maker fills at its limit, so the adverse slip that drove the crypto breaches no longer exists on that path.
- **The RTB refresh retires a signal whose live entry has left its levels** (`B-RTB-REFRESH-LIVE-PRICE`, row 59e, 2026-10-12) — stale entries no longer reach the fill.
**First read since (retained logs, 2026-10-16 03:50Z → 2026-10-17 07:51Z — a population, not a decision):** 29 `[ENTRY_GEOMETRY][SHADOW]` lines, **all xStock, 0 crypto** (no crypto taker opens), **0 of 25 graded `would_refuse=true`** (4 read `n/a`). ⇒ the premise of `#1183` may have dissolved; Step 2 must re-measure on the full post-cutover population before any floor moves.

## 1. Provenance (TIER 1 — the behaviour this batch could change)
- **The floors** (`module_constants` `expectancy_gates` / `min_rr`, read 2026-10-17): 15 rows `reorg-b2-3` 2026-06-27 + 2 rows `b-reach-baseline-adjust` 2026-09-20. **reorg-B2.3** (`#380`, 2026-06-24/27): *"calibrate from realized outcomes on the full population"* — per-strategy floors fitted at signal generation; **B-REACH-BASELINE-ADJUST** (row `3n.v`, CC-B, 2026-09-20) seeded `vwap_bounce`/`vwap_pullback` crypto and `strong_bull_trend` xStock at 1.95 — just under the strategies' own constant RR (2.0), **so those cells pass at GENERATION.** ⇒ **the floors were designed as generation gates.** Using them unchanged as a FILL gate is the mismatch `#1183` measured — not a mis-set floor.
- **The fill-time check** (`B-ENTRY-DISTANCE-GUARD` OBJ-2, 2026-10-11): pre-registered to go LIVE only if rule (a) headroom ≥ class p90 slip and rule (b) would-refuse ≤ 5 %; both failed then ⇒ SHADOW.
- Ledger searched: `#1183`, `#372` (Phase-25 per-strategy minRR calibration, *"the reorg-B2 `min_rr=2.5` seed SUPPRESSES most of the strategy suite"*), `#380`, the `B-ENTRY-DISTANCE-GUARD` report.

## 2. The decision this batch carries (options; recommendation after the Step-2 read)
| | what | consequence |
|---|---|---|
| **(a) re-run the pre-registered promotion read on the post-cutover population; if it passes, the fill-time check goes LIVE at today's floors** | no floor moves; the same rule (a)/(b) bar that kept it in shadow decides | a taker fill whose RR fell below its floor is refused live — protects against a bad fill; if it fails again, stays shadow with the new numbers |
| (b) keep generation floors; give the fill check its own tolerance (floor − a slip allowance) | a second number per cell | two floors to calibrate; risks the `#641` two-copies shape |
| (c) lower the generation floors for margin | the original `#1183` framing | loosens selection at generation for every signal to fix a fill-time question — **not recommended** (Kyle's mission: risk limits bound growth, never loosened to make room) |
**Recommendation: (a).** It answers the question the batch exists for with the rule already pre-registered, moves no floor, and either turns the protection on or records why not with current numbers. Floor recalibration stays where `#372` puts it (Phase 25).

## 3. Objectives
1. **Step 2 read (pre-registered here, before the data):** population = taker opens with an `[ENTRY_GEOMETRY][SHADOW]` line, **from 2026-10-15 19:15Z (maker-only cutover) to the read**, per class; plus `closed_trades` (paper, filled) for the same window as a second instrument (RR at fill from `actual_entry_price`, `original_stop_price`, `take_profit` vs the live floor per cell). **Rule (a):** per constant-RR cell with ≥ 5 opens, headroom ≥ that class's p90 adverse slip in the window. **Rule (b):** would-refuse ≤ 5 % per class with ≥ 20 opens; a class under 20 opens is INSUFFICIENT and stays shadow. Both must pass for that class to go live.
2. **If a class passes:** the fill check goes live for that class (refuse the taker open; logged with the same line, `would_refuse` → `refused`); test that a sub-floor fill is refused and an at-floor fill opens.
3. **If a class fails or is insufficient:** shadow stays; the numbers are recorded on `#1183` and the item re-homes to `#372` (Phase 25).
4. Record: System Manual §19 (the fill-time check's state per class), `#1183` closed with the outcome.
**Out of scope:** changing any `min_rr` value (Phase 25, `#372`); maker entries (row 59b).
