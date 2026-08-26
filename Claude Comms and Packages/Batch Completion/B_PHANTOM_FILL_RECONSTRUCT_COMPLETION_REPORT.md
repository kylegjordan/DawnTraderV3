# B-PHANTOM-FILL-RECONSTRUCT — COMPLETION REPORT

> **Owner:** Claude Analyst (CC-C) · **Closed 2026-08-26** · **change-class: architecture**
> ⛔ **CORRECTED 2026-08-26 — THIS REPORT DECLARED `non_architecture` WHILE ITS OWN SCOPE DECLARED `architecture`.** Langston refused the N/A and he is right: the scope declares architecture **specifically because** the batch changes the canonical meaning of realized P&L for every reader. **A completion report that contradicts its own scope on the class is the #641 shape inside one batch** — and it is the SECOND time I shipped that exact contradiction in one day (the other was `B-EXIT-PROVENANCE`'s change-class body, caught at r4).
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
⛔⛔ **THE N/A CALL IS WITHDRAWN. BOTH DOCS WERE OWED AND ARE NOW WRITTEN.** This report originally judged SYSTEM_MANUAL and SIM *"not applicable — five columns on an existing table."* **That judged the COLUMNS and not the MEANING.** Langston, refusing it at the ref: *"the system now has a new definition of realized profit and loss, and every place money is displayed was repointed onto it — headline totals, win rate, profit factor, the equity curve, the per-strategy breakdown, the asset-class split. Nothing on screen changed... but the MEANING of what we made changed system-wide, even though the number did not."*

**SYSTEM_MANUAL — WRITTEN:** the canonical definition of realized P&L is now `COALESCE(reconstructed_net_pnl, pnl)`, and the tri-state contract that governs it (`(false, NULL)` = **NOT ASSESSED**, never assessed-clean).
**SIM — WRITTEN:** the five columns, their readers, and ⚠️ **the fact that the expression exists TWICE** — once in SQL (`storage.ts` `HONEST_PNL`) and once in TS (`dashboard-metrics.ts` `honestNetPnl()`) — which is precisely what the SIM exists to record.

⚠️ **AND THE GUARD OVER THAT DUPLICATION IS REAL BUT UNPROVEN, stated rather than claimed:** the row-by-row parity fence runs over rows where `reconstructed_net_pnl IS NOT NULL`, and **that set is currently EMPTY (0 of 547)**. The two expressions agree today only because the third column they both fall back to is identical on every row. **The fence cannot fail until F-E populates the column** — tracked as `#900`'s sibling.
