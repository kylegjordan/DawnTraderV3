# B-PHANTOM-FILL-RECONSTRUCT — COMPLETION REPORT

> **Owner:** Claude Analyst (CC-C) · **Closed 2026-08-26** · **change-class: non_architecture**
> **Migration applied** 2026-08-24T10:21Z inside the `afb7d326c` deploy (`dt-deploy` ran `db:migrate` in the same run, 734 ms).
> ⛔ **CLOSED LATE** — the checker's *"open >48h"* nag was correct and is what prompted this. Recorded, not backdated.

---

## 1. WHAT KYLE ASKED FOR, AND THE ONE-LINE RULING THAT SHAPED IT

> *"Go with what you suggested — that we flag and remove from our accounts, but we don't delete these trades. And, yes, we can replace the phantom exits with real market prices if we have them."*

⇒ **reconstruct BESIDE the original, never over it.** Every recorded `pnl` / `net_pnl` / `exit_price` is untouched; the reconstruction lives in new columns and the readers `COALESCE` to the original when they are NULL.

## 2. WHAT SHIPPED — COLUMNS ONLY. **NO BACKFILL.**

Five nullable columns on `closed_trades` (`phantom_fill_suspect`, `reconstructed_exit_price`, `reconstructed_net_pnl`, `reconstructed_pnl_percent`, `reconstruction_basis`) plus a partial index.

⛔ **THE BACKFILL WAS CUT, AND THAT IS THE BATCH'S REAL DECISION.** The first version carried an `UPDATE` flagging 21 rows via a ticker-vs-ask detector. **That detector's warrant was WITHDRAWN when `#741` falsified its founding premise** — *"a maker exit never reads the order book, so maker rows cannot be contaminated."* **False:** the maker exit does not read the book for its PRICE, **but the system reads the book to decide WHETHER IT FILLED.** Running it would have written a withdrawn verdict into the ledger that **F-E** must then re-stamp — **two bases in one column, the `#641` shape.**
★ **The withdrawn reasoning is NOT reproduced in the migration file.** A correction stacked on wrong text is not a correction; the error record lives in `#741` and the commit message.

## 3. LANGSTON'S TWO CONDITIONS — BOTH LANDED BEFORE DEPLOY

**COND-1 — `phantom_fill_suspect` is `NOT NULL DEFAULT false`, and a default writes a STATED CLAIM.** *"This row is clean"* on all 534 existing rows, over a population where `#741` measures **109 of 525 contaminated**. Inert today because nothing reads it; **a `#546` landmine the day something does.**
⇒ **the tri-state is carried by `reconstruction_basis`, which is nullable**, and the contract is written into the column COMMENTs so it survives a reader who never opens this report:
`(false, NULL)` = **NOT ASSESSED** · `(false, <basis>)` = assessed clean · `(true, <basis>)` = assessed contaminated.
⛔ **Reading `false` as clean is the failure the COMMENT exists to prevent, and F-E must honour it.**

**COND-2 — the maker negative control was removed from the fence AND its header.** It rested on the same falsified premise. ⚠️ **It had to be removed from BOTH places: I first pulled it from the assertion and left it standing in the file header — withdrawn text sitting downstream of its own retraction, which is the exact shape this batch was cutting a backfill to avoid.**

## 4. BEHAVIOUR-IDENTICAL — MEASURED, NOT ARGUED

Langston re-derived it on staging at the ref: across the **534** closed non-`never_filled` rows, `net_pnl` is NULL on **0** and differs from `pnl` on **0**; the sums are identical at **−68.35** either way. ⇒ `COALESCE(reconstructed_net_pnl, pnl)` and `COALESCE(reconstructed_net_pnl, net_pnl, pnl)` both resolve to today's figure for **every** row. **With all five columns NULL, the deploy changed no displayed number.**

**Verified post-migration:** all five columns present with correct types/nullability, and `phantom_fill_suspect` + `reconstruction_basis` + `reconstructed_net_pnl` each carrying their COMMENT.

## 5. WHAT THIS BATCH DELIBERATELY DID NOT DO

**It does not detect anything.** Detection is **F-E**, under a warrant that survives, and it needs **F-B**'s provenance stamp live first so the tiers are **provable rather than inferred**. **This batch only makes the columns exist so the code already at the deploy head has somewhere to write.**

## 6. GOVERNANCE FILES CHANGED

`BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `RUNNING_ISSUES.md` (`#741`) · scope · pre-audit · this report · the migration + its MANIFEST registration.
**SYSTEM_MANUAL judged NOT applicable** — no architecture, strategy, regime, filter, pipeline or math change. **SIM judged NOT applicable** — no component added, removed or re-keyed; five columns on an existing table.
