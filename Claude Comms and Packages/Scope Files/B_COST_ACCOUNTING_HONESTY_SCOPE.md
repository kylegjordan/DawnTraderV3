# B-COST-ACCOUNTING-HONESTY — SCOPE

change-class: non_architecture

**Owner:** Claude Analyst (CC-C) · **Kyle-directed 2026-07-28**: *"Let's definitely have the gross trigger off of the actual entry price… let's move forward with it and close it out"* + *"confirm… how we're calculating slippage and that it adds up"* + *"take a look at what trading firms are doing… what do industry standards say?"*

## 1. THE VERIFICATION KYLE ASKED FOR — the arithmetic ADDS UP (no money is wrong)
Traced end-to-end in code:
- **Entry slippage** (`order-placer.ts:78`): `(fillPrice − intendedPrice) × fillQty`, `intendedPrice = signal.entryPrice`.
- **Exit slippage** (`order-placer.ts:120`): `(requestedPrice − fillPrice) × quantity`.
- Both signed **positive = cost / negative = price improvement** — correct and consistent for buy and sell respectively.
- **Gross** (`active-execution-engine.ts:1809`): `(exitPrice_REQUESTED − intendedEntryPrice) × qty` — the IDEAL trade at both ends.
- `totalCost = entryFee + exitFee + entrySlippage + exitSlippage`; `netPnl = gross − totalCost`.

**The algebra telescopes exactly.** With `B_int/B_act` = intended/actual entry, `E_req/E_act` = requested/actual exit:
```
net = (E_req−B_int)q − fees − (B_act−B_int)q − (E_req−E_act)q
    = (E_act − B_act)q − fees          ← TRUE ECONOMICS
```
**Measured confirmation:** across **all 293** closed trades carrying actual fills (incl. **all 57** with negative `total_cost`), `net_pnl` equals `(actual_exit − actual_entry)×qty − (entry_fee+exit_fee)` with **ZERO divergences**. ⇒ **This is NOT a money defect (rule-24 outcome 2/3).** The ONLY problems are presentational.

## 2. WHAT IS ACTUALLY WRONG (presentation)
1. **Gross is measured against prices we never traded at**, so a profitable trade can display a negative gross (ONDO: true +$22.38 gross, displayed −$11.86).
2. **`total_cost` goes negative** (57/364 = 16%) when price improvement exceeds fees — meaningless as a "cost".
3. **Two distortions cancel exactly** ⇒ ⚠️ **the naive fix (clamp `total_cost ≥ 0`) would BREAK a currently-correct net on 57 trades.** Kyle's named rule-24 fear.

## 3. INDUSTRY STANDARD (researched; full citations in the pre-audit)
- **Implementation Shortfall** (Perold 1988, *JPM* 14(3); CFA L3 curriculum) decomposes decision→fill into **delay cost** `(arrival − decision)×filled`, **trading cost** `(exec − arrival)×filled`, **opportunity cost** (unfilled) + fees. Our conflated "slippage" = delay + trading, undecomposed.
- **Zipline** (the reference backtest engine, `finance/slippage.py`): slippage is **baked into the fill price**; commissions are a **separate model**. Never both.
- **Harris, *Trading and Exchanges* Ch.21:** explicit costs (fees/commissions) are accounting entries; **implicit costs (spread/impact/slippage) are estimates against a benchmark, not bookable entries**. ⇒ computing gross from actual fills AND subtracting modeled slippage **double-counts** (flagged by the research as a well-supported *inference*, not a citable rule).
- **Negative cost:** legitimate internally — Harris: *"traders who offer liquidity have negative transaction costs"* (we post maker orders). BUT investor-facing regimes (PRIIPs, from 2023) **floor it at zero** because the measure is noisy and ~averages to zero. ⇒ **keep the signed number as a DIAGNOSTIC; do not let it be the cost line.**
- **Sign convention: NO standard exists** — three mutually contradictory conventions in live use (two crypto TCA vendors directly contradict each other). ⇒ **our convention must be stated explicitly at the point of use.**

## 3.5 ★ CENSUS FINDING — THE FORMULA LIVES AT **THREE** SITES, NOT ONE (§9.5(a); corrects this scope's own first draft)
The repo-wide census found the same gross/total-cost/net arithmetic **duplicated at three sites**, each explicitly documented in-code as a deliberate mirror of the engine. **Citations pinned at sha `b3b44408b`** (CC-A peer-check refinement 1 — quote at a sha, never a bare line number; pointers rot): the surviving mirror comments are `routes.ts:12640` *"same formula as active-execution-engine.ts line 772-780"* and `routes.ts:12651` *"same as engine line 766-768"*. ⚠️ **Two further mirror comments citing engine lines 787 and 791 existed pre-change and were DELETED by this batch's own edit** — which is itself a live demonstration of the rot: the anchors they cited had already moved, and my first draft quoted "787" from a comment that no longer exists at head. **None of those line numbers point at the cost math today.**

| # | Site | Path | Note |
|---|---|---|---|
| 1 | `active-execution-engine.ts:1809-1816` | **engine close** (stop/target/trailing/time) | the primary path |
| 2 | `routes.ts:~12652-12660` | **manual close** (operator clicks Close) | writes the SAME closed_trades fields |
| 3 | `routes.ts:~12151-12167` | **open-positions live display** | `estTotalCost` with ESTIMATED exit costs; feeds the Open Trades gross/net |

**⚠️ ALL THREE MUST CHANGE TOGETHER.** Fixing only the engine would make an engine-closed trade and a manually-closed trade report different gross/cost for identical economics, and the Open tab would disagree with the Closed tab. **This is precisely what the census exists to catch — a path trace from the engine would have found site 1 and stopped.** Site 3 has no actual exit yet, so its form is `gross = (currentPrice − ACTUAL entry) × qty`, `estTotalCost = entryFee + estExitFee` (fees only), `net = gross − fees`.

## 4. OBJECTIVES
1. **Gross from ACTUAL fills** (Kyle's directive): `grossPnl = (actualExitPrice − actualEntryPrice) × quantity`.
2. **Cost line = EXPLICIT costs only**: `totalCost = entryFee + exitFee`. Slippage LEAVES the cost line (it is already inside the actual fills — removing it is what PREVENTS double-counting).
3. **★ NET IS PROVABLY UNCHANGED:** `net = gross − totalCost = (E_act−B_act)q − fees` — algebraically identical to today's value on every row. **No money figure moves.** This is the batch's central safety property and must be asserted by test.
4. **Slippage RETAINED as execution-quality telemetry** (signed, columns unchanged) — reported, not deducted. Document the sign convention explicitly (positive = cost) since no standard exists.
5. **`netPnlPercent` denominator** → actual entry value (currently `intendedEntryValue`), for consistency with (1). ⚠️ this DOES move a displayed % — surface as a PREVIOUSLY/NOW per §9.2.
6. **Historical rows:** NOT backfilled (honest-absent convention). New closes carry the new semantics; old rows keep theirs. State this in the completion report.

## 5. OUT OF SCOPE (named, not silently dropped)
- **Delay-vs-trading-cost split** (Perold's decomposition) requires capturing an **arrival price** (best ask at order placement) distinct from the decision price — a NEW capture we do not currently persist. **HOME (§9.4): its own batch `B-IMPLEMENTATION-SHORTFALL` (owner CC-C), sequenced after this one.** The measured motivation: mean |intended−actual| entry gap is **0.278%** (plausible execution slippage) but **24 trades exceed 1%** and max is **8.771%** — a gap that large is signal staleness, not execution cost, and today they are indistinguishable.
- Any change to fee computation, sizing, admission, ranking or exits.

## 6. VERIFICATION
- Unit tests: net-unchanged property on the ONDO shape + a price-improvement case + a normal case; `total_cost ≥ 0` always (it is fees).
- **Live proof:** recompute net for the current closed population under both formulas and assert equality (the 293-row check, re-run post-deploy).
- §9.3 UI: Closed Trades tab — gross now matches actual price movement; Costs column never negative.
- CI 4-green; coordinated deploy window.

## 7. GOVERNANCE
Tier-1 (BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN §5, completion report, this scope, pre-audit) + **SYSTEM_MANUAL** (the cost-accounting model + the industry basis) + **SIM** (closed-trade cost field semantics) + RUNNING_ISSUES (the §5 out-of-scope item homed). MEMORY_CC_C.
