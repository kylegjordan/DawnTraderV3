# B-RR-FLOOR-HEADROOM — SCOPE (Step 1, r2)

change-class: architecture

**Issue:** `#1183` · **Plan row:** `SPRINT_TO_LIVE_PLAN` 59a (row 59 increment 2, pre-sprint P1a) · **Owner:** CC-B (NEW Claude)
*Read at `origin/migration/aws-supabase` after `e51bbe2c4`; staging read 2026-10-17 ~09:30Z UTC. r2 folds Langston's r1 CHANGES (F1-F7 + the class) — 2026-10-17 09:09Z.*

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED: 0 of 25 graded would refuse. NOW: 1 of 30 (3.33 %). REASON:** r1 read `out.log`, whose retention ended before the window began; the durable archive holds the breach (ORCL/USD `vwap_bounce`, 2026-10-15 20:11:55.551Z, `rrFill` 0.5111 vs floor 1.95, `adverseR` +0.9853). Langston's 1 of 28 was over r1's stated start; the 30 is over the corrected start below.
- **PREVIOUSLY STATED: window starts 2026-10-15 19:15Z. NOW: 16:29:07Z. REASON:** 19:15 was `30af855f2`'s commit time in +02:00, read as UTC — and that commit is a VTS-provenance fix, not the active-path change. The boundary is the `entry_fill_policy` write (both rows `updated_at` 16:29:07Z, `b-class-leg-fill-mode`), one tick after the deploy that introduced the stamp (`097306d1a`, staging reflog 16:28:54Z). Shown, not asserted: xStock `closed_trades` opened 10-15 13:06→16:08Z carry a null policy (18 rows); every one from 17:19:26Z carries `maker_preferred` (54 rows); there are no opens in between.
- **PREVIOUSLY STATED: floors = 15 `reorg-b2-3` + 2 `b-reach-baseline-adjust`; xStock `vwap_pullback` 1.95. NOW: 14 + 3; 1.96. REASON:** miscount — r1's own prose names the three.
- **PREVIOUSLY STATED: crypto is closed because "a maker fills at its limit". NOW: crypto is closed by POLICY (`maker_only`). REASON:** under `maker_preferred` a marketable maker opens as a taker (`active-execution-engine.ts:5944`, `MARKETABLE_TAKER_FALLBACK`); `maker_only` drops it instead (`:5948`).
- **PREVIOUSLY STATED: change-class `non_architecture`. NOW: `architecture`. REASON:** objective 3 can turn on a live refusal on the active path.

## 0. What `#1183` measured, and the population since
At `B-ENTRY-DISTANCE-GUARD` Step 2 (2026-10-10), RR measured **at the fill** would have refused **7 of 24 crypto** and **31 of 104 xStock** taker opens against the live `min_rr` floors, so the fill-time check shipped in **SHADOW**. Constant-RR cells sit 0.04-0.05 below their own RR.
**Population since the cutover — DESCRIPTIVE, not the decision** (`signal_eval_archive`, `source='active-execution-engine'`, `mode='paper_sim'`, 2026-10-15 16:29:07Z → last row 2026-10-16 20:57:22Z, xStock only):
| stage | arm | rows | graded (`rrFill` non-null) | would refuse |
|---|---|---|---|---|
| `admitted` | taker | 30 | 30 | **1** (ORCL, above) |
| `admitted` | maker | 24 | — (no shadow on a maker, by design) | — |
| `entry_fill` | taker | 4 | 0 — ungradeable: ask at/through stop, `risk = fill − stop ≤ 0` ⇒ `rrFill` null; **already refused live** by OBJ-1 | — |
Reconciliation: 30 + 24 = 54 admitted = the 54 xStock `closed_trades` carrying `maker_preferred`. **Crypto: 0 taker opens since the cutover** (last crypto taker open 2026-10-15 08:49:20Z).
Per cell (strategy × floor, graded takers): `vwap_pullback` 1.96 n=17 · `pivot_shift` 2.16 n=5 · `morning_star` 1.00 n=3 · `range_trading` 2.00 n=3 · `sma_trend_ride` 1.95 n=1 · `vwap_bounce` 1.95 n=1. **Positive (adverse) slips: 1 of 30** — 29 fills were at or better than intended; signed p90 `adverseR` = −0.106 R.
⚠️ **Both of us have now seen this population, so it cannot be the read of record.** The decision read is forward (objective 3).

## 1. Provenance (TIER 1) and the five dispositions
- **The floors** (`expectancy_gates.min_rr`, 17 rows): 14 `reorg-b2-3` 2026-06-27 (`#380`, *"calibrate from realized outcomes on the full population"*) + 3 `b-reach-baseline-adjust` 2026-09-20 (row `3n.v`: crypto `vwap_bounce`, crypto `vwap_pullback`, xStock `strong_bull_trend`, seeded just under their own constant RR so they pass **at generation**). **Built as generation gates; using them unchanged as a fill gate is the mismatch `#1183` measured.** → **Disposition 1 (still relevant and correct) — as generation gates. Not changed here; recalibration is `#372` (Phase 25).**
- **The fill-time check** (`B-ENTRY-DISTANCE-GUARD` OBJ-2, 2026-10-11, `entry-booking.ts` / the shadow block at `active-execution-engine.ts:6049-6050`): pre-registered to go live only if rule (a) and rule (b) passed; both failed ⇒ shadow. → **Disposition 2 (relevant, needs updating to today's intent): the promotion read is re-run on the post-cutover system.**
- **`_consumptionArm`** (`active-execution-engine.ts:6072`, `'maker_to_taker' | 'direct_taker'`): computed at the open, written only to log lines (`:6079`, `:6093`), so the archive cannot split the xStock taker population into its two halves. → **Disposition 3 (disconnected, should be RECONNECTED) — §9.4 disposition 1, folded into this batch (Langston F4).**
- **`maker_taker.entry_fill_policy`** (crypto `maker_only`, xStock `maker_preferred`, `B-CLASS-LEG-FILL-MODE`): read, not changed. → Disposition 1.
- Ledger searched: `#1183`, `#372`, `#380`, the `B-ENTRY-DISTANCE-GUARD` and `B-CLASS-LEG-FILL-MODE` reports.

## 2. The decision this batch carries
| | what | consequence |
|---|---|---|
| **(a) re-run the promotion read, corrected, on a forward post-cutover window; if a class passes, the fill-time check goes LIVE for it at today's floors** | no floor moves | a taker fill whose RR fell below its floor is refused live; otherwise shadow stays with current numbers |
| (b) a separate fill tolerance per cell | a second number per cell | two floors to calibrate — the `#641` two-copies shape |
| (c) lower generation floors for margin | the original `#1183` framing | loosens selection for every signal to fix a fill question — **not recommended** (risk limits bound growth, never loosened to make room) |
**Recommendation: (a).** ⚠️ **Expected outcome, stated now:** at the observed rate (1 adverse slip in 30), rule (a)'s minimum adverse population is unlikely to accrue inside the cap, so the likely result is **INSUFFICIENT → shadow stays → re-home to `#372`**. The batch still earns its place: it records the read honestly and reconnects the arm field the next read needs.

## 3. Objectives
1. **Reconnect the arm (Step 3).** Stamp `consumptionArm` (`direct_taker` | `maker_to_taker`) on the archive row of every taker open — `admitted` and `entry_fill` — from the value already computed at `:6072`. **Test:** a direct taker and a marketable-maker fallback each produce an archive row carrying their own arm; a maker fill carries none.
2. **The read of record — PRE-REGISTERED HERE, forward.** Population: `signal_eval_archive`, `source='active-execution-engine'`, `mode='paper_sim'`, `reject_stage='admitted'`, `gate_decision.entryArm='taker'`, `rrFill` non-null, **from the Step-6 deploy of objective 1** until **30 graded taker opens per class or 21 days**, whichever first. **Denominator:** graded admitted takers. `entry_fill` rows are counted and reported beside it, never in it. Every figure is split by `consumptionArm`; the decision is on the pooled class.
   - **Rule (b):** would-refuse ≤ 5 % per class with ≥ 20 graded opens; under 20 ⇒ **INSUFFICIENT**.
   - **Rule (a):** a cell (strategy × floor) qualifies with ≥ 5 graded opens **and** ≥ 5 positive-`adverseR` fills. In a qualifying cell, the p90 of **positive** `adverseR` must not exceed the slip the cell can absorb, `s* = (RR − floor) / (1 + floor)` (a fill `s` R above intended gives `rrFill = (RR − s)/(1 + s)`). ⚠️ *New in r2, my derivation: r1 compared headroom in RR units with slip in R; s\* is the exact bound (vwap_pullback: 0.04/2.96 = 0.0135 R).* **INSUFFICIENT** if no cell qualifies, or the class's positive-adverse population is under 5, or qualifying cells cover under 50 % of the class's graded opens — **never PASS by absence.** Coverage stated per cell.
   - **Both rules PASS ⇒ that class goes live.** Crypto: **INSUFFICIENT by policy** while `maker_only` holds.
3. **If a class passes:** the fill check refuses that class's taker open live (`would_refuse` → `refused`, same line and archive row). **Test:** a sub-floor fill is refused; an at-floor fill opens.
4. **If a class fails or is INSUFFICIENT:** shadow stays; the numbers go on `#1183` and the item re-homes to `#372` (Phase 25).
5. **Forward-binding rider (Langston F4):** if crypto moves to `maker_preferred` (row 59b), the crypto taker path returns **with the shadow unpromoted**, and crypto's own read starts at that change. Written into System Manual §19, `#1183`, and row 59b's plan line.

**Docset (architecture):** scope, pre-audit, completion report, `BATCH_CATALOG`, `PHASE_HISTORY`, **System Manual §19** (the fill check's state per class + the rider), **System Impact Map** (the fill-time checks entry at `SYSTEM_IMPACT_MAP.md:712` — the archive row gains `consumptionArm`).
**Out of scope:** any `min_rr` value (`#372`); maker entries (row 59b).
