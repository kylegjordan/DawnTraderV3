---
name: workflow-01-scope
description: STEP 1 ONLY of the DawnTrader batch workflow - Planning and Scope. Use when a Kyle directive starts a new batch and a BATCH_N_SCOPE.md must be drafted with numbered objectives, a change-class header, the architectural read and the provenance read. NOT for auditing, NOT for writing code, NOT for any later step.
---

# STEP 1 — PLANNING + SCOPE

**Ends when:** Langston approves the scope.

## DO
1. Kyle gives a directive → draft `Claude Comms and Packages/Scope Files/BATCH_N_SCOPE.md` with **numbered objectives + verification criteria for each**.
2. **Declare the change-class on a header line** — `change-class: architecture | non_architecture | sub_batch | hotfix`. Written NOW, so Langston reviews it before code exists. **Undeclared or unparseable defaults to the STRICTEST doc-set AND raises a flag** (fail-closed).
3. Dispatch to Langston, leading the post with **"Langston"** (his bridge only engages when his name STARTS the post).

## ⛔ MANDATORY 1.a — ARCHITECTURAL READ BEFORE DRAFTING
Read the relevant sections of `SYSTEM_IMPACT_MAP.md` **and** `SYSTEM_MANUAL.md` for **every** component the batch touches. **Caller-site counts, dependencies, blast radius and surface-API claims come from those reads or a compile-driven probe — NOT from grep and NOT from memory.**

## ⛔ MANDATORY 1.b — PROVENANCE READ: LEARN WHAT THE THING WAS BUILT TO DO
For every service/module/function/route the batch touches, **record its ORIGINAL INTENT in the scope before proposing any change.**
- **TIER 1 — full provenance** for anything whose **behaviour this batch changes**.
- **TIER 2 — a one-line intent note** for things merely read or called.

**Where to look, in order:** (a) `BATCH_CATALOG.md` + completion reports + `RUNNING_ISSUES.md`, searched by **FILE/SYMBOL name, not by symptom** — and **search FORMER filenames too** (the `active-*` family was renamed 2026-07-03; searching the new name returns nothing written under the old one); (b) `git log -S "<symbol>" --reverse`, **NOT path-limited so it survives renames**, then READ the introducing commit; (c) if it predates the 2026-01/02 governance change → `bridge/canonical/`, which documents **what we INTENDED then** and is **never current-state truth and never edited**.

**EVIDENCE STANDARD:** name the corpora actually searched, and **QUOTE the introducing commit verbatim with a ref — do not summarise it.** Where intent is not recoverable, **say so and mark it `INFERRED-FROM-CODE`, not established.**

**Answer one of the FIVE dispositions, explicitly:** (1) still relevant and correct · (2) relevant but needs updating to today's intent · (3) disconnected, should be RECONNECTED · (4) connected, should be REMOVED · (5) disconnected and should stay disconnected / be deleted. **A scope that cannot say which is unfinished.**

## ⛔ BEFORE YOU SCOPE IT: DOES IT ALREADY EXIST, AND WAS IT ALREADY DECIDED?
**Two failures, opposite directions, both expensive, both measured on this project:**
- **BUILDING WHAT ALREADY EXISTS.** `CONDUCT.md`: *use what already exists before proposing new code.* Grep the repo for the CAPABILITY, not just for the name you would give it.
- **★ ASSUMING A RULE EXISTS BECAUSE THE WORD DOES.** Measured 2026-08-21: **"hotfix" appeared 256 times across the governance corpus and every single occurrence was a USAGE.** There was no definition, no qualifying test and no steps — for months, while every session cited it. ⇒ **A term in constant use is NOT evidence that it is governed. Search for the RULE, not the WORD — and a search returning only usages IS a finding.**
- **AND THE LEDGER (§9.5(b-ii)):** grep `RUNNING_ISSUES.md` + `BATCH_CATALOG.md` + the completion reports before scoping a fix. **A deliberate, Kyle-approved, Langston-reviewed decision re-scoped as a defect is worse than no scope at all.**


## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
Move the card to **`Scope`**. On dispatch to Langston set **Blocked on = Langston**. ⚠️ **A batch that starts without a card is INVISIBLE** — the card must already exist in `Backlog` with Owner, Type, Issue and a plain-language description before Step 1 begins.
★ **YOU move the card; LANGSTON sets `Review`.** *(Kyle 2026-08-03 — his approval gates the move but is not the move, or the board freezes every time he is mid-review.)*
⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

1. **Planning + Scope** — Kyle directive → CC drafts `BATCH_N_SCOPE.md` in `Claude Comms and Packages/Scope Files/` with numbered objectives + verification criteria → Langston reviews + approves.

    **MANDATORY 1.a — Architectural read BEFORE drafting (Kyle directive 2026-05-24):** read relevant sections of `1-system-manual/SYSTEM_IMPACT_MAP.md` AND `1-system-manual/SYSTEM_MANUAL.md` for every component the batch touches. The scope's architectural claims (caller-site counts, dependencies, blast-radius, surface-API enumeration) MUST come from direct SIM + System Manual reads (and/or compile-driven probes), NOT from grep or memory. See history doc §2.1a for the discipline origin (B79.0n.STRATEGY scope v1 underestimated caller surface 2 → 7 files; v2 fixed via compile-driven probe; reading upfront would have saved an iteration).

    **★ MANDATORY 1.b — PROVENANCE READ BEFORE DRAFTING: LEARN WHAT THE THING WAS BUILT TO DO (Kyle directive 2026-07-29 — REQUIRED IN EVERY SCOPE, not just audits).** For **every** service / module / function / helper / route the batch touches, **dig into its history and record its ORIGINAL INTENT in the scope** before proposing any change. This EXTENDS §9.5(b), which required a provenance read only for audits and disputed behaviour; it is now a **standing scope obligation for all implementation batches**.
    **★ SCOPE OF THE OBLIGATION — TIERED, because an unbounded rule gets quietly skipped (Langston amendment D):** **TIER 1 — full provenance** for anything whose **BEHAVIOUR this batch changes**. **TIER 2 — a one-line intent note** for things merely read or called. Kyle's cost argument is strongest on tier 1, and a 40-file batch cannot do tier 1 on everything.
    **Where to look, in order:** (a) **`BATCH_CATALOG.md` + the batch's completion report + `RUNNING_ISSUES.md`** — search by FILE/SYMBOL name, not only by symptom (#174 was missed for seven weeks because the search was for the symptom; the filename would have returned it instantly); **★ and search FORMER filenames too (Langston amendment C)** — P19-B-RENAME (2026-07-03) renamed the whole `active-*` family plus three tables, so searching `active-execution-engine.ts` returns NOTHING written while it was `paper-execution-engine.ts`; (b) **git archaeology** — `git log -S "<symbol>" --reverse`, **NOT path-limited, so it survives renames**, then READ the introducing commit's message and any attached directive; (c) **if it predates the 2026-01/02 governance change → `bridge/canonical/`** (the pre-governance corpus) **plus the old unorganised phase/batch reports** in the archived folders. ⚠️ The canonical corpus documents **what we INTENDED to build then** — it is **NOT current-state truth** and is **NEVER edited** (frozen historical record).
    **★ EVIDENCE STANDARD (Langston amendment B):** **NAME the corpora actually searched**, and **QUOTE the introducing commit/directive verbatim with a ref — do not summarise it** (#452: a reviewer ruling on your gloss is ruling on the wrong thing). **Where intent is NOT recoverable, say so and mark the disposition `INFERRED-FROM-CODE`, not established** — #453: an asserted absence of provenance needs presence-evidence. Without this box, a scope under pressure picks the most plausible disposition and asserts it, which is exactly the `0.7`-default failure this rule cites.
    **What the read must ANSWER — the FIVE dispositions, stated explicitly in the scope:** is this thing **(1) still relevant and correct**, **(2) relevant but needing an update to today's intent**, **(3) disconnected and it should be RECONNECTED**, **(4) connected but should be REMOVED**, or **★ (5) disconnected and should STAY disconnected / be removed** — genuinely dead code (Langston amendment A; route to rule 18/§15: delete on the spot or a dated deletion, `DELETED_COMPONENTS_LOG` + `_archive`). **(5) exists because without it dead code hits no box and the nearest are (3) "reconnect" — wrong, and precisely the accidental-re-entry risk §15 exists to prevent — or (4), which falsely asserts it is connected.** An implementation that cannot say which of the five it is has not finished its scope.
    **★ WHY THIS EARNS ITS TOKEN COST (Kyle's own reasoning, recorded because a future reader will want to trim it):** it is not free — it adds reading to every batch. But we **already** spend far more context on the alternative: re-litigating "fixes" to things that were working, retracting announced causes, and wild-goose chases into behaviour that turns out to be correct-by-design. Rule 24's three outcomes (**real defect / working-as-designed-but-unaddressed / legacy that no longer fits**) are **unanswerable without the intent**, so skipping this read does not save the cost — it defers it into a more expensive form.
