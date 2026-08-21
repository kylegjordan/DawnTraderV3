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
