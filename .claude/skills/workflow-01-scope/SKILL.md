---
name: workflow-01-scope
description: STEP 1 ONLY of the DawnTrader batch workflow - Planning and Scope. Use when a Kyle directive starts a new batch and a BATCH_N_SCOPE.md must be drafted with numbered objectives, a change-class header, the architectural read and the provenance read. NOT for auditing, NOT for writing code, NOT for any later step.
---

# STEP 1 — PLANNING + SCOPE

**Ends when:** Langston approves the scope.

## DO
1. Kyle gives a directive → draft `Claude Comms and Packages/Scope Files/BATCH_N_SCOPE.md` with **numbered objectives + verification criteria for each**.
2. **Declare the change-class on a header line** — `change-class: architecture | non_architecture | sub_batch | hotfix`. Written NOW, so Langston reviews it before code exists. **Undeclared or unparseable defaults to the STRICTEST doc-set AND raises a flag** (fail-closed).
3. **If the batch is a row of `1-system-manual/SPRINT_TO_LIVE_PLAN.md` §4 — or a line of its §5 — write its batch id into that row's `batch / reference` cell (the §5 line's `item` cell) in the scope commit**, leading the cell (`B-…`, `T-…`, `P<n>-B…`). An id left in the item cell, or behind `— batch named at Step 1`, cannot be matched to the batch's completion report.
4. Dispatch to Langston, leading the post with **"Langston"** (his bridge only engages when his name STARTS the post).

## ⛔ MANDATORY 1.a — ARCHITECTURAL READ BEFORE DRAFTING
Read the relevant sections of `SYSTEM_IMPACT_MAP.md` **and** `SYSTEM_MANUAL.md` for **every** component the batch touches. **Caller-site counts, dependencies, blast radius and surface-API claims come from those reads or a compile-driven probe — NOT from grep and NOT from memory.**

## ⛔ MANDATORY 1.b — PROVENANCE READ: LEARN WHAT THE THING WAS BUILT TO DO
For every service/module/function/helper/route the batch touches, **record its ORIGINAL INTENT in the scope before proposing any change.** This is §9.5(b) made a standing obligation of EVERY scope, not only of audits.
- **TIER 1 — full provenance** for anything whose **behaviour this batch changes**.
- **TIER 2 — a one-line intent note** for things merely read or called.
- **Why tiers:** an unbounded rule gets skipped, and a 40-file batch cannot do tier 1 on everything.

**Where to look, in order:** (a) `BATCH_CATALOG.md` + completion reports + `RUNNING_ISSUES.md`, searched by **FILE/SYMBOL name, not by symptom** — and **search FORMER filenames too** (the `active-*` family was renamed 2026-07-03; searching the new name returns nothing written under the old one); (b) `git log -S "<symbol>" --reverse`, **NOT path-limited so it survives renames**, then READ the introducing commit's message and any directive attached to it; (c) if it predates the 2026-01/02 governance change → `bridge/canonical/`, which documents **what we INTENDED then** and is **never current-state truth and never edited**.

★ **AID (a lead, not the read):** `node scripts/crew-tooling/history.mjs <path> --ref origin/migration/aws-supabase` lists, per file, the batches that touched it (former names followed), their documents and the ledger rows that cite it. Open what it lists; its silence proves nothing. Table, standing and limits of all the aids: `workflow-02-audit-and-plan`, "THE AUDIT AIDS".

**EVIDENCE STANDARD:** name the corpora actually searched, and **QUOTE the introducing commit verbatim with a ref — do not summarise it.** Where intent is not recoverable, **say so and mark it `INFERRED-FROM-CODE`, not established.**

**Answer one of the FIVE dispositions, explicitly:** (1) still relevant and correct · (2) relevant but needs updating to today's intent · (3) disconnected, should be RECONNECTED · (4) connected, should be REMOVED · (5) disconnected and should stay disconnected / be deleted. **A scope that cannot say which is unfinished.**
**(5) routes to CLAUDE.md rule 18:** delete it on the spot or place a named deletion in the plan, recorded in `DELETED_COMPONENTS_LOG.md` with the file archived under `_archive/deleted-code/`. **Why (5) exists:** without it, dead code lands in (3) "reconnect" (wrong, and it risks accidental re-entry) or (4) (which falsely asserts it is connected).

## ⛔ BEFORE YOU SCOPE IT: DOES IT ALREADY EXIST, AND WAS IT ALREADY DECIDED?
**Two failures, opposite directions, both expensive, both measured on this project:**
- **BUILDING WHAT ALREADY EXISTS.** `CONDUCT.md`: *use what already exists before proposing new code.* Grep the repo for the CAPABILITY, not just for the name you would give it.
- **★ ASSUMING A RULE EXISTS BECAUSE THE WORD DOES.** Measured 2026-08-21: **"hotfix" appeared 256 times across the governance corpus and every single occurrence was a USAGE.** There was no definition, no qualifying test and no steps — for months, while every session cited it. ⇒ **A term in constant use is NOT evidence that it is governed. Search for the RULE, not the WORD — and a search returning only usages IS a finding.**
- **AND THE LEDGER (§9.5(b-ii)):** grep `RUNNING_ISSUES.md` + `BATCH_CATALOG.md` + the completion reports before scoping a fix. **A deliberate, Kyle-approved, Langston-reviewed decision re-scoped as a defect is worse than no scope at all.**


## ⛔ BEFORE THIS STEP LEAVES YOUR HANDS — REVIEW IT THE WAY LANGSTON WOULD
**Against the OBJECT, not your memory** (`CONDUCT.md` §6b — the full mechanism and why it is positional rather than clever). Before dispatching: re-open `SYSTEM_IMPACT_MAP.md`, the completion reports and the ledger you cite and **confirm each citation says what you claim** — do not cite from what you remember reading.
✅ **Fix what you find and move on.** In-task corrections belong in the commit message, **never in a report to Kyle.**

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
**CREATE THE CARD IF IT DOES NOT EXIST — YOU create it, nobody else** (protocol §3b): a card is created the moment a finding turns into a batch or sub-batch, or when phase planning assigns you one. Default entry `Backlog`, **placed in priority order**; straight to `Scope` only if you are starting now. Then move the card to **`Scope`**. On dispatch to Langston set **Blocked on = Langston**. ⚠️ **A batch that starts without a card is INVISIBLE** — the card must already exist in `Backlog` with Owner, Type, Issue and a plain-language description before Step 1 begins.
★ **The board rules every step shares — Langston sets `Review`, the session moves the card, nothing automates it, and the card holds status, owner, order and the description only — are in `1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §2 (`WI-B1`).** Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## ◇ DRAFT — B-WORKFLOW-IMPROVE (non-blocking until the OBJ-9 pilot; any part becomes a gate only by the reviewer's recorded ruling)
- **Proof record per objective.** Each numbered objective carries a PROOF line written now, before any data: the instrument that will show it done, where that instrument runs, and its PASS and FAIL conditions. The batch ledger: `scripts/crew-tooling/ledger-schema.json`, checked by `node scripts/crew-tooling/ledger-validate.mjs <ledger.json>`.
- **Criterion change control.** A PASS or FAIL condition changed after data arrives is a scope amendment: write PREVIOUSLY / NOW / REASON, and the reviewer rules on it before the new condition is graded.

## THE ORIGINAL RULES-FILE TEXT — ARCHIVED (`WI-A01`)
The word-for-word `CLAUDE.md` §2 text for this step is archived, unchanged, at `1-system-manual/_archive/WORKFLOW_SKILL_ORIGINAL_TEXT.md` (`WI-A01`; B-WORKFLOW-IMPROVE Q10, 2026-11-20). **Every rule in it is carried by the summary above;** the archive keeps the origin cases, dates and issue numbers. Read it when a rule's history matters.
