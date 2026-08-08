# B-FILTER-DIAG-XSTOCK — SCOPE (r1)

change-class: non_architecture *(provisional — see OBJ-0; if the answer is option (c) this becomes `architecture` and is re-declared before Step 3)*

**Owner:** CC-B · **Issue:** #682 · **Due:** 2026-08-12 · **Status:** Step 1, awaiting Langston

---

## ⛔ 0. THE SCOPE I FILED IS THE WRONG SCOPE — read this first

#682 was filed as *"wire `recordActiveStrategyNull` into the xStock eval-cycle so the Paper/Live xStock per-strategy table carries real data."* **The provenance read (§2 1.b) says that is not the job, and building it would produce a misleading screen.**

**TWO FACTS, both measured, that change the shape of the work:**

**(1) THE DECLINE DATA ALREADY EXISTS, per-strategy AND per-reason.** `eval-cycle.ts` already imports the shared null-reason tracker (`:72`) and, on every decline (`:575-589`), already accumulates `counters.byStrategyNullReasons[strategyKey][reason]` — **the exact shape the funnel envelope wants.** It is not missing; it is **stamped `mode:'vts'`** at the archive site (`:592`, with the in-place comment *"xstock eval-cycle is VTS-side — carried stamp"*).

**(2) ★ xSTOCK HAS ONE EVALUATION PATH. CRYPTO HAS TWO. That asymmetry is the whole finding.** Measured at `signal_eval_archive`, 6h window, whole population:

| asset class | VTS evaluation | ACTIVE evaluation |
|---|---|---|
| crypto_spot | `vts-runner`/`vts` **5,597** | `signal-orchestrator`/`paper_sim` **3,537** |
| xstock_spot | `vts-runner`/`vts` **177,997** | `signal-orchestrator`/`paper_sim` **8** |

**Crypto genuinely evaluates twice** — an independent VTS run and an independent active run — so its two tabs legitimately show different numbers. **xStock evaluates ONCE**: `evaluateXstockPairForVTS` runs the whole cycle, and only when a signal actually forms does it *also* fan that signal out to the active pipeline (`:1130`, `dispatchXstockActiveSignal`, fire-and-forget). **Those 8 active rows are FORWARDED SIGNALS, not evaluations.**

⇒ **A decline never reaches the xStock active path, and never can, because the active path only ever receives completed signals.** Wiring the recorder in would simply copy the VTS numbers onto the Paper/Live tabs.

**★ AND THIS ANSWERS KYLE'S STANDING QUESTION** (*"is the xStock issue just reporting, or is something actually wrong with the pipeline affecting paper trading?"*): **it is NOT only reporting.** xStock has **no independent active-trading evaluation** — it rides the VTS cycle. That is a real structural difference from crypto and is the most likely explanation for xStock's active-path scarcity, which #682's pre-audit thread flagged as untested. **It is a DESIGN STATE, not a defect** (rule-24 outcome 2) — but Kyle should decide whether it is the intended one.

---

## OBJ-0 — THE DECISION THIS BATCH CANNOT MAKE FOR ITSELF (Langston + Kyle)

**What should the Paper/Live xStock "Why Each Strategy Declined" table show, given one shared evaluation?**

- **(a) MIRROR the VTS numbers, labelled honestly** — e.g. *"xStock evaluates once; these are the same evaluations shown on the VTS tab."* **Cheap, truthful, and standardises the six tabs as Kyle asked.** ⚠️ Risk: two tabs showing identical numbers invites the reader to believe they are independent confirmations when they are one measurement.
- **(b) KEEP the honest not-instrumented card** (shipped in B-FILTER-DIAG-STANDARDIZE, live now) **until/unless xStock gets its own active evaluation.** Costs nothing, tells no lies, leaves the tab emptier than Kyle wants.
- **(c) GIVE xStock an independent active evaluation**, matching crypto. **Genuinely fixes the asymmetry and probably raises xStock trading volume** — but it is a real architecture change, flips this batch to `architecture`, and needs its own pre-audit.

**CC-B's lean: (a) now, with (c) raised separately as the trading-volume question** — because (a) satisfies the standardisation ask today at near-zero risk, while (c) is a trading-behaviour decision that should not ride inside a diagnostics batch. **Not choosing unilaterally.**

---

## OBJECTIVES (conditional on OBJ-0)

**If (a):**
1. Surface `byStrategyNullReasons` from the xStock cycle into the funnel envelope for `xstock_spot`, both modes.
2. Render it with an explicit provenance line stating it is the shared single evaluation — **never presented as an independent active measurement.**
3. **DELETE `STRATEGY_NULL_INSTRUMENTED_CLASSES` outright** (do not add a second class — a membership set enumerating the universe is a fence with no far side). ⚠️ **§9.5(a-ii): the blast-radius census must trace every READ of that constant, not just its definition** — a surviving reader of a deleted writer is invisible to both tsc and CI.
4. Fence test pinning that xStock's table can never silently become an empty `{}` again (the #546 absent-as-valid trap this family exists to close).

**If (b):** no code; close #682 with the finding recorded and re-home the volume question.

**If (c):** re-declare `architecture`, own pre-audit, out of scope here.

## VERIFICATION
Six-tab DOM walk (the acceptance standard from the predecessor batch); xStock Paper/Live shows either real numbers with the provenance line, or the honest not-instrumented card — **never an empty table**.

## PROVENANCE READ — corpora actually searched
`eval-cycle.ts` (read at `:71-72`, `:288`, `:553-595`, `:1120-1136`); `active-dispatch.ts` (`:74-101`, `:137-197`); `signal_eval_archive` population query (6h, all rows, grouped by source+mode); `RUNNING_ISSUES` #682/#684/#648; the predecessor batch's completion record. **Original intent recovered from the in-place comments at the archive site and the `P19-B4a (C2)` dispatch block — quoted verbatim above, not summarised.**
