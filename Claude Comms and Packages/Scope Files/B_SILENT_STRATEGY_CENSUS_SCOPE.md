# B-SILENT-STRATEGY-CENSUS — SCOPE (sprint row 52, CC-B)

change-class: non_architecture

> **Why this file exists now (2026-10-16):** row 52 had no scope file. Its first piece — switching strong_bull_trend on for xStock — went ahead on Kyle's 2026-09-30 + 2026-10-16 directions with its own pre-registered record (`B_SILENT_STRATEGY_CENSUS_SBT_XSTOCK_SWITCH_ON.md`, Coltrane APPROVED `b554b120f`, Langston ratified 2026-10-16 11:52Z). The governance checker then raised alert `0c3a716a` (change-class undeclared) when a commit led with this batch id. **This scope declares the class and sets out the rest of the row for Langston's Step-1 review; it does not reopen the switch-on.**
> **Class reasoning:** every objective is a database setting (`module_constants strategy_gates`) or a measurement; the only code touched so far is one comment in the SQE (`ff60daff8`, no behaviour change). If an objective below grows code (O4's detection test, O5's wiring), the class is re-declared then.

## Source of the work
Sprint plan row 52 (`SPRINT_TO_LIVE_PLAN.md`), quoting Kyle 2026-09-30: *"proceed as recommended — liquidity_trap and defensive_hedge stay off for good; ORB stays on its own path (15-minute validation, roadmap 25-14); the five with no recorded reason (strong_bull_trend, adaptive_flow, reverse_impulse, volatility_edge, support_bounce) are the candidates, switched on one or two at a time, each with a pass/fail criterion written before it goes on, strong_bull_trend first; and the overdue per-strategy check of the nine already on (Phase D.1) runs before any is added; dhma and abcd_long need an equity-bar detection test before they are candidates."* Carries `#1070` (three wired strategies never evaluated), `#238`, `#411`. Provenance of the current list: `XSTOCK_STRATEGY_ENABLEMENT_PROVENANCE_2026-09-30.md`.

## Objectives
| # | objective | verification |
|---|---|---|
| **O1** | strong_bull_trend ON for xStock with a pre-registered pass/fail | ✅ done 2026-10-16 10:47:40Z — record `…_SBT_XSTOCK_SWITCH_ON.md` §3-§6; verdict at the first 20 filled closes or 21 days (alert `dd588f0d`, 2026-11-06T10:47:40Z) |
| **O2** | **D.1 — the per-strategy check of the nine already on for xStock** | a per-strategy table on `closed_trades` (filled = `actual_entry_price` not null; P&L = `net_pnl_percent`), by session, with each strategy's disposition. ⚠️ **Kyle's order put D.1 BEFORE any addition; O1 went first by his 10-16 instruction, and the switch-on record §6 item 5 states the cost.** |
| **O3** | the other four candidates (adaptive_flow, reverse_impulse, volatility_edge, support_bounce), one or two at a time | each with a pass/fail written and committed before its switch; none switched before O1's verdict and O2's table |
| **O4** | dhma and abcd_long — an equity-bar detection test | a test that the detectors fire on 15-minute xStock bars; only then candidates |
| **O5** | `#1070` — the three wired crypto strategies never evaluated | census of why each produces no evaluation, with a §9.4 disposition each |
| **O6** | the stale SQE comment ("only the 6") | ✅ done `ff60daff8` (comment only) |

## Out of scope
liquidity_trap and defensive_hedge (off for good, Kyle); ORB (roadmap 25-14).
