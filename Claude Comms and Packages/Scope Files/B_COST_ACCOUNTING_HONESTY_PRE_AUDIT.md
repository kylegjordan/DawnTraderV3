# B-COST-ACCOUNTING-HONESTY — PRE-AUDIT (Step 2)

change-class: non_architecture
**Owner:** Claude Analyst (CC-C) · Scope: `B_COST_ACCOUNTING_HONESTY_SCOPE.md`

## SIM / System Manual consultation
- **System Manual:** the closed-trade cost/P&L model (gross / total-cost / net semantics) is architectural-adjacent documentation → **CONTENT update in scope** (record the actual-fill gross, the explicit-only cost line, and the industry basis).
- **SIM:** `closed_trades` cost-field semantics change meaning (not shape). No new component, no cross-cutting runtime state, no schema/migration. Brief note.

## Component census (§9.5)
- **WRITES the cost/P&L fields:** `active-execution-engine.ts` close path (`:1809` gross, `:1812` totalCost, `:1815` net, `:1816` netPnlPercent → the `updateClosedTrade` write at `:1968`). Single site.
- **COMPUTES slippage:** `order-placer.ts:78` (entry, `(fill − intended)×qty`) and `:120` (exit, `(requested − fill)×qty`). **UNCHANGED by this batch** — the columns keep their values and meaning; they simply stop being *deducted*.
- **READS `total_cost` / `gross_pnl` / `net_pnl`:**
  - `paper-trade-adapter.ts` → `costs` (closed table Costs column), `grossProfitValue/Percent`, `netProfitValue/Percent` — display.
  - `routes.ts:12306-12323` realized-balance path reads **`pnl`/`net_pnl` only** — *not* `gross_pnl` or `total_cost` ⇒ **the balance cannot move** (independently the reason M3 held in `B-PROMOTION-RACE-FIX`).
  - The exploration anneal / budget counters key on `admissionBasis` + `closed_at`, **not** on cost fields ⇒ unaffected.
- **Who else deducts slippage?** Repo-wide check required at implementation: confirm no OTHER consumer subtracts `entry_slippage`/`exit_slippage` from a P&L, or removing it here would create an inconsistency (state the finding explicitly per rule 22 — an asserted absence needs presence-evidence).

## Blast radius
Four arithmetic lines in ONE function + the doc/test set. No schema, no migration, no admission/sizing/ranking/exit input, no client change required (the adapter maps the same fields). **Net P&L provably identical** ⇒ balance, realized P/L, win rate, profit factor and every downstream metric that reads net are untouched. The *displayed* gross, costs and net-% change — that is the intended correction, and §9.2 PREVIOUSLY/NOW applies to `netPnlPercent`.

## Industry basis (full citations — the research Kyle asked for)
- **Perold, A. (1988) "The Implementation Shortfall: Paper vs. Reality," *Journal of Portfolio Management* 14(3):4–9** — origin of IS. Delay-cost extension attributed to **Wagner (1991)**. CFA L3 form: `Delay = (P_arrival − P_decision)×S_filled`; `Trading = (P_exec − P_arrival)×S_filled`; `Opportunity = (P_close − P_decision)×S_unfilled`; plus fees. ⚠️ The Kissell/Wagner and CFA formulations are **algebraically identical in total but attribute differently between delay and opportunity** — if we ever report per-component numbers we must state which convention we use.
- **Harris, L. (2002) *Trading and Exchanges*, Ch. 21** — explicit vs implicit costs: explicit "a cost accountant would easily identify"; implicit "require some benchmark… a difficult and imprecise science." Also, verbatim: *"traders who demand liquidity tend to pay transaction costs while those who offer liquidity have **negative** transaction costs"* ⇒ negative slippage is structurally normal for a maker strategy, not an anomaly.
- **Zipline `finance/slippage.py`** (reference backtest engine) — `process_order()` returns `(execution_price, execution_volume)`: **slippage baked into the fill price, never a separate cost**; commissions are a **separate model**. Default `FixedBasisPointsSlippage` is bounded non-negative (a strictly one-directional penalty). **QuantConnect** differs (permits bidirectional slippage) — both keep slippage and fees separate.
- **GIPS 2020** — trade-date accounting; transaction costs are never "added back" when deriving gross-of-fees, i.e. treated as part of the trade rather than an overlay.
- **PRIIPs (from 2023-01-01)** — investor-facing transaction costs **may no longer be negative** (floored at explicit costs) after funds reported negative figures; the FCA conceded slippage "should average out to approximately zero." ⇒ our design (signed diagnostic, explicit-only cost line) matches both the internal-TCA and the disclosure practice without adopting either wholesale.
- **SEC Rule 605 (as amended 2024)** — price improvement is reported as its **own metric**, not netted into a cost.
- **No industry standard on sign convention** — Talos (positive = underperformance/cost), Anboto (negative = cost), retail FX ("positive slippage" = benefit) are mutually exclusive ⇒ we state ours explicitly (**positive = cost**).
- **Honest limits of the research** (recorded, not papered over): Perold's original is paywalled (worked from sources citing it); no source states the double-counting prohibition in those words — it is a well-supported *inference* from Harris + Zipline; MiFID II RTS 27/28 best-execution reporting **no longer exists** (scrapped by ESMA/FCA), so it cannot be cited as a live mandate — the arrival-price mandate lives in PRIIPs cost disclosure, a different instrument.

## Risk / what could go wrong
1. **Double-counting inversion** — if gross moves to actual fills but slippage stays in the cost line, every trade is penalised twice. The batch removes both together; the net-unchanged test is the fence.
2. **A hidden consumer of `total_cost`** expecting slippage inside it → the census above must be executed repo-wide at implementation, with the result stated.
3. **Historical comparability** — old rows keep old semantics (no backfill). Any cross-period cost analysis must not blend them; noted in the completion report.
