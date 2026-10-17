# B-SILENT-STRATEGY-CENSUS — SCOPE (sprint row 52, CC-B)

change-class: non_architecture

> **Why this file exists now (2026-10-16):** row 52 had no scope file. Its first piece — switching strong_bull_trend on for xStock — went ahead on Kyle's 2026-09-30 + 2026-10-16 directions with its own pre-registered record (`B_SILENT_STRATEGY_CENSUS_SBT_XSTOCK_SWITCH_ON.md`, Coltrane APPROVED `b554b120f`, Langston ratified 2026-10-16 11:52Z). The governance checker then raised alert `0c3a716a` (change-class undeclared) when a commit led with this batch id. **This scope declares the class and sets out the rest of the row for Langston's Step-1 review; it does not reopen the switch-on.**
> **Class reasoning:** every objective is a database setting (`module_constants strategy_gates`) or a measurement; the only code touched so far is one comment in the SQE (`ff60daff8`, no behaviour change). If an objective below grows code (O4's detection test, O5's wiring), the class is re-declared then.

## Source of the work
Sprint plan row 52 (`SPRINT_TO_LIVE_PLAN.md`), quoting Kyle 2026-09-30: *"proceed as recommended — liquidity_trap and defensive_hedge stay off for good; ORB stays on its own path (15-minute validation, roadmap 25-14); the five with no recorded reason (strong_bull_trend, adaptive_flow, reverse_impulse, volatility_edge, support_bounce) are the candidates, switched on one or two at a time, each with a pass/fail criterion written before it goes on, strong_bull_trend first; and the overdue per-strategy check of the nine already on (Phase D.1) runs before any is added; dhma and abcd_long need an equity-bar detection test before they are candidates."* Carries `#1070` (three wired strategies never evaluated), `#238`, `#411`. Provenance of the current list: `XSTOCK_STRATEGY_ENABLEMENT_PROVENANCE_2026-09-30.md`.

## r2 (2026-10-17) — Langston's Step-1 ruling folded (2026-10-16 21:15Z): class APPROVED, scope CHANGES NEEDED
1. **The pre-audit is REQUIRED for this class** (`config.mjs:140-146`, `non_architecture.required` = scope, pre_audit, completion_report, batch_catalog, phase_history). **O2's D.1 table and O5's census ARE pre-audit content** — they are written as `B_SILENT_STRATEGY_CENSUS_PRE_AUDIT.md`, not as objectives whose output lands elsewhere.
2. **O4 is code (a detection test) and leaves this batch** — homed as its own row (below). O5's census is measurement and stays; any wiring it turns up gets its own row and class at the moment it is found.
3. **The System Manual is applicable at every switch** — live xStock membership is documented there (first applied `0dbf18213`, the enablement line corrected).
4. `0c3a716a` self-cleared (resolved by `governance-checker` 2026-10-16T21:19:02Z on `fef9a75d4`) — the class line parses.

## Objectives
| # | objective | verification |
|---|---|---|
| **O1** | strong_bull_trend ON for xStock with a pre-registered pass/fail | ✅ done 2026-10-16 10:47:40Z — record `…_SBT_XSTOCK_SWITCH_ON.md` §3-§6; verdict at the first 20 filled closes or 21 days (alert `dd588f0d`, 2026-11-06T10:47:40Z) |
| **O2** | **D.1 — the per-strategy check of the nine already on for xStock** (written in the pre-audit) | the table, built under the four definitions below. ⚠️ Kyle's order put D.1 BEFORE any addition; O1 went first by his 10-16 instruction (switch-on record §6 item 5 states the cost). |
| **O3** | the other four candidates (adaptive_flow, reverse_impulse, volatility_edge, support_bounce), one or two at a time | each with a pass/fail written and committed before its switch; **none switched before O1's verdict AND O2's table**; each switch updates the System Manual's enablement line |
| **O5** | `#1070` — the three wired crypto strategies never evaluated (written in the pre-audit) | census of why each produces no evaluation, a §9.4 disposition each |
| **O6** | the stale SQE comment ("only the 6") | ✅ done `ff60daff8` (comment only) |

### O2's four definitions — fixed BEFORE the table is built (Langston's blocker)
- **(a) What the table can and cannot carry.** It is an outcome-sourced per-strategy reading on `closed_trades`, and **`#596` (outcome-corpus representativeness: bias outranks volume) blocks using it as a RANKING**, with `#648`'s finding that six of nineteen strategies have never traded guaranteeing tiny per-strategy n. ⇒ **The table can say "this strategy is losing on the active path at this n"; it cannot say "this strategy is worse than that one", and it does not by itself switch anything off.** A switch-off from it is a Kyle decision, put to him with the n.
- **(b) Minimum n.** A strategy with **fewer than 20 filled closes gets no disposition from P&L** — it is listed with its n and `INSUFFICIENT`. 20 matches O1's own pass/fail population, so the incumbents and the candidate are read on one bar.
- **(c) Population.** **Active path only**: `closed_trades`, `mode = paper`, `asset_class = xstock_spot`, filled = `actual_entry_price IS NOT NULL`, P&L = `net_pnl_percent`, since the 2026-10-06 15:53Z paper reset (and, separately labelled, since 09-20). **VTS closes (`vts_open_trades` + the JSON sink) are a different question — "does the strategy work" vs "does it earn on the active path" — and are NOT pooled.** Rows carrying `reconstructed_net_pnl` / `reconstructed_pnl_percent` are **excluded**, and their count per strategy is printed beside the table.
- **(d) Session.** **One predicate: the engine's `getXstockSession` (09:30-16:00 ET)**, applied to `opened_at`, never the feed's `is_extended_hours` (which flips at 13:45:00Z, 15 minutes apart). Each strategy gets an in-session and an off-session column.

### ✅ Step 1 APPROVED (Langston, 2026-10-17 ~02:45Z). Two folds, each gating its own step:
- **Before O2's table — the join key.** `strategy_gates.strategy` carries **`range_trade`**; `closed_trades.strategy_name` carries **`range_trading`**. The table uses an explicit gate-name → trade-name mapping and asserts membership BOTH ways (every enabled gate maps to a name, every traded name maps to a gate) — without it `range_trade` reads n = 0 while it has 10 closes (the mismatch B-FILTER-DIAG-STANDARDIZE caught on its first run).
- **(c)'s reconstructed-row exclusion is a measured no-op today** — 0 reconstructed rows in the whole population (Langston, re-derived); kept as a rule, stated as measured.
- **Before O3's first switch — a feasibility read per candidate.** None of adaptive_flow / reverse_impulse / volatility_edge / support_bounce has an `xstock_spot` `reach_atr_max` or `min_rr` row, so each would run on the class defaults 4.0 and 2.0. strong_bull_trend is feasible only because `b-reach-baseline-adjust` seeded xStock 6.5 / 1.95 on 09-20 (on crypto under 4.0 it passed 0 of 298,731, `SYSTEM_MANUAL.md:448`). ⇒ **read each candidate's declared target multiple and reward-to-risk against its effective rows before its switch**, so a 21-day window cannot expire at zero closes on a configuration fact.
- Langston's preview of the table (not the table): filled paper xStock closes since the 10-06 reset — vwap_pullback 120 @ −1.624 %, morning_star 37 @ −1.097 %, pivot_shift 26 @ −0.573 %, sma_trend_ride 23 @ −1.423 %, range_trading 10 @ −0.168 %, vwap_bounce 1 @ −1.631 %; breakout, inside_bar_reversal, mean_reversion, strong_bull_trend none. Every window negative — definition (a): no ranking, any switch-off goes to Kyle with the n.

## Moved out of this batch
- **O4 — dhma and abcd_long, an equity-bar detection test.** `HOME: B-XSTOCK-EQUITY-BAR-DETECTION, owner CC-B, placed in SPRINT_TO_LIVE_PLAN at row 52b, after row 52a` — its own Step 1 and class (it is code). The two stay off until it passes.

## Out of scope
liquidity_trap and defensive_hedge (off for good, Kyle); ORB (roadmap 25-14).
