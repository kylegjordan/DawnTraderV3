# WORKFLOW SKILL ORIGINAL TEXT — the verbatim CLAUDE.md §2 text each step skill carried, archived

> **B-WORKFLOW-IMPROVE OBJ-11 (Q10), 2026-11-20.** Until this move each step skill ended with the word-for-word text `CLAUDE.md` §2 held for that step before §2 was removed on 2026-08-21. That text now lives here, unchanged (SHA-256 per block in `Claude Comms and Packages/Change Lists/B_WORKFLOW_IMPROVE_MOVE_LEDGER.json`, checked in CI by `scripts/crew-tooling/move-ledger-check.mjs`).
> **Every rule in these blocks is carried by its skill's summary;** the reconciliation that checked each one, and what was folded in, is `Claude Comms and Packages/Change Lists/B_WORKFLOW_IMPROVE_RECONCILIATION.md`. **What lives ONLY here:** origin cases, dates, issue numbers and the history of corrections. Read here when a rule's history matters.
> **Frozen.** Do not edit a block; a rule change goes in the skill.

## workflow-01-scope

<!-- WI-MOVED id=WI-A01 -->
### WI-A01 — the original text of workflow-01-scope

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

1. **Planning + Scope** — Kyle directive → CC drafts `BATCH_N_SCOPE.md` in `Claude Comms and Packages/Scope Files/` with numbered objectives + verification criteria → Langston reviews + approves.

    **MANDATORY 1.a — Architectural read BEFORE drafting (Kyle directive 2026-05-24):** read relevant sections of `1-system-manual/SYSTEM_IMPACT_MAP.md` AND `1-system-manual/SYSTEM_MANUAL.md` for every component the batch touches. The scope's architectural claims (caller-site counts, dependencies, blast-radius, surface-API enumeration) MUST come from direct SIM + System Manual reads (and/or compile-driven probes), NOT from grep or memory. See history doc §2.1a for the discipline origin (B79.0n.STRATEGY scope v1 underestimated caller surface 2 → 7 files; v2 fixed via compile-driven probe; reading upfront would have saved an iteration).

    **★ MANDATORY 1.b — PROVENANCE READ BEFORE DRAFTING: LEARN WHAT THE THING WAS BUILT TO DO (Kyle directive 2026-07-29 — REQUIRED IN EVERY SCOPE, not just audits).** For **every** service / module / function / helper / route the batch touches, **dig into its history and record its ORIGINAL INTENT in the scope** before proposing any change. This EXTENDS §9.5(b), which required a provenance read only for audits and disputed behaviour; it is now a **standing scope obligation for all implementation batches**.
    **★ SCOPE OF THE OBLIGATION — TIERED, because an unbounded rule gets quietly skipped (Langston amendment D):** **TIER 1 — full provenance** for anything whose **BEHAVIOUR this batch changes**. **TIER 2 — a one-line intent note** for things merely read or called. Kyle's cost argument is strongest on tier 1, and a 40-file batch cannot do tier 1 on everything.
    **Where to look, in order:** (a) **`BATCH_CATALOG.md` + the batch's completion report + `RUNNING_ISSUES.md`** — search by FILE/SYMBOL name, not only by symptom (#174 was missed for seven weeks because the search was for the symptom; the filename would have returned it instantly); **★ and search FORMER filenames too (Langston amendment C)** — P19-B-RENAME (2026-07-03) renamed the whole `active-*` family plus three tables, so searching `active-execution-engine.ts` returns NOTHING written while it was `paper-execution-engine.ts`; (b) **git archaeology** — `git log -S "<symbol>" --reverse`, **NOT path-limited, so it survives renames**, then READ the introducing commit's message and any attached directive; (c) **if it predates the 2026-01/02 governance change → `bridge/canonical/`** (the pre-governance corpus) **plus the old unorganised phase/batch reports** in the archived folders. ⚠️ The canonical corpus documents **what we INTENDED to build then** — it is **NOT current-state truth** and is **NEVER edited** (frozen historical record).
    **★ EVIDENCE STANDARD (Langston amendment B):** **NAME the corpora actually searched**, and **QUOTE the introducing commit/directive verbatim with a ref — do not summarise it** (#452: a reviewer ruling on your gloss is ruling on the wrong thing). **Where intent is NOT recoverable, say so and mark the disposition `INFERRED-FROM-CODE`, not established** — #453: an asserted absence of provenance needs presence-evidence. Without this box, a scope under pressure picks the most plausible disposition and asserts it, which is exactly the `0.7`-default failure this rule cites.
    **What the read must ANSWER — the FIVE dispositions, stated explicitly in the scope:** is this thing **(1) still relevant and correct**, **(2) relevant but needing an update to today's intent**, **(3) disconnected and it should be RECONNECTED**, **(4) connected but should be REMOVED**, or **★ (5) disconnected and should STAY disconnected / be removed** — genuinely dead code (Langston amendment A; route to rule 18/§15: delete on the spot or a placed deletion, `DELETED_COMPONENTS_LOG` + `_archive`). **(5) exists because without it dead code hits no box and the nearest are (3) "reconnect" — wrong, and precisely the accidental-re-entry risk §15 exists to prevent — or (4), which falsely asserts it is connected.** An implementation that cannot say which of the five it is has not finished its scope.
    **★ WHY THIS EARNS ITS TOKEN COST (Kyle's own reasoning, recorded because a future reader will want to trim it):** it is not free — it adds reading to every batch. But we **already** spend far more context on the alternative: re-litigating "fixes" to things that were working, retracting announced causes, and wild-goose chases into behaviour that turns out to be correct-by-design. Rule 24's three outcomes (**real defect / working-as-designed-but-unaddressed / legacy that no longer fits**) are **unanswerable without the intent**, so skipping this read does not save the cost — it defers it into a more expensive form.
<!-- /WI-MOVED id=WI-A01 -->

## workflow-02-audit-and-plan

<!-- WI-MOVED id=WI-A02 -->
### WI-A02 — the original text of workflow-02-audit-and-plan

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

2. **Pre-Implementation Audit AND Implementation Plan** — ⚠️ **RENAMED 2026-08-21 (Kyle). The step was merged with the plan by #694 piece (5) and Langston ADOPTED it, but THE NAME NEVER FOLLOWED** — the concept was recorded and the label was not, so the workflow still read as two steps. **ONE step, ONE document, Langston signs off once, and the AUDIT comes BEFORE the plan inside it** (that ordering is the whole gain: under two documents the plan is approved first, so an audit that overturns the design arrives after the approval is already spent). **Every plan item back-references the audit finding it falls out of; anything unaudited is flagged `UNAUDITED` in-document.** — Read actual files, check PM2 logs, query Supabase, screenshot UI. **MANDATORY: consult `SYSTEM_IMPACT_MAP.md` for every affected component** (deeper than Step 1.a — per-component upstream + downstream + shared-state + background-execution + blast-radius enumeration). Document in `BATCH_N_PRE_AUDIT.md`. Langston reviews. Skipping the SIM review is how cascade bugs get prevented — non-negotiable.
<!-- /WI-MOVED id=WI-A02 -->

## workflow-03-implementation

<!-- WI-MOVED id=WI-A03 -->
### WI-A03 — the original text of workflow-03-implementation

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

3. **Implementation** — CC edits directly in the clone repo on the migration branch. Surgical edits explicitly documented. No speculative refactoring.
<!-- /WI-MOVED id=WI-A03 -->

## workflow-04-code-review

<!-- WI-MOVED id=WI-A04 -->
### WI-A04 — the original text of workflow-04-code-review

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

4. **Code Review** — Langston reviews the actual `git diff` **AT THE GRADED REF (`origin/migration/aws-supabase`) — i.e. AFTER the push to the REVIEW branch, and BEFORE it advances to `main`.** Code-level, not high-level gloss. Change list in `Claude Comms and Packages/Change Lists/`. **(Corrected 2026-07-23 — Kyle: "Langston reviews the review branch on GitHub, so it's already been pushed." The old "BEFORE push" wording contradicted §6.5's own instruction to commit-and-push before dispatching, and contradicted reality: he reads at a ref, so an unpushed diff is a file that does not exist for him. The review gate is the advance to `main`, not the push to the review branch.)**
<!-- /WI-MOVED id=WI-A04 -->

## workflow-05-ci

<!-- WI-MOVED id=WI-A05 -->
### WI-A05 — the original text of workflow-05-ci

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

5. **GitHub Push + CI** — Push to GitHub. CI runs 4 jobs: TypeScript Check, Test Suite, Build, Docker Build. **All 4 must be GREEN.** Do not push on top of red CI.
<!-- /WI-MOVED id=WI-A05 -->

## workflow-06-deploy

<!-- WI-MOVED id=WI-A06 -->
### WI-A06 — the original text of workflow-06-deploy

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

6. **Staging Deploy** — `ssh root@188.245.193.8 "su - deploy -c 'dt-deploy <full-40-char-sha> --by <session>'"` (**B-DEPLOY-LOCK #649: `dt-deploy` is THE deploy path — NEVER the raw git-pull/build/restart chain.** It locks against concurrent deploys, refuses a dirty worktree, runs `db:migrate` in-chain per the SYSTEM_MANUAL invariant, conditionally `npm ci`s on a lockfile change, and asserts sha-identity + ENGINE RESUMED before recording. `--pre-restart '<npm script>'` for batch-specific steps. **The sha is the FULL 40-char reviewed commit — #621.**)
<!-- /WI-MOVED id=WI-A06 -->

## workflow-07-verify-cc

<!-- WI-MOVED id=WI-A07 -->
### WI-A07 — the original text of workflow-07-verify-cc

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

7. **First-Pass Verification (CC)** — Check PM2 logs, psql to Supabase, UI via Claude-in-Chrome, CI status, server health. Capture evidence.
<!-- /WI-MOVED id=WI-A07 -->

## workflow-08-verify-langston

<!-- WI-MOVED id=WI-A08 -->
### WI-A08 — the original text of workflow-08-verify-langston

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

8. **Second-Pass Verification (Langston)** — Independent UI + evidence verification. Mandatory.
<!-- /WI-MOVED id=WI-A08 -->

## workflow-09-iterate

<!-- WI-MOVED id=WI-A09 -->
### WI-A09 — the original text of workflow-09-iterate

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

9. **Iterate** — If any scope objective not met: fix → Langston reviews → push → deploy → verify. Repeat until all green.
<!-- /WI-MOVED id=WI-A09 -->

## workflow-10-governance

<!-- WI-MOVED id=WI-A10 -->
### WI-A10 — the original text of workflow-10-governance

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

10. **Governance Updates** — Update ALL applicable Tier 1 + Tier 2 docs (see §3). If batch touched architecture/math → update SYSTEM_MANUAL.md. If batch touched components → update SYSTEM_IMPACT_MAP.md. Failing to update either when applicable = incomplete batch.

    **MANDATORY 10.b — Langston memory sync (Kyle directive 2026-05-07):** at the same time you update your own MEMORY.md, also update Langston's `/home/langston/MEMORY.md` on Hetzner with the batch closure block + sequencing changes + operational invariants. Langston's MEMORY auto-loads every `claude -p` invocation; stale MEMORY → wrong baseline at next review. Mirror your MEMORY structure (state block, recent-batch row, sequencing update, open-issue diff). Keep ≤200 lines — ⛔ **SUPERSEDED: his load is capped as a SUM that may only go down (row 2.8b); read BOTH numbers — the ceiling and the measured total — from `langston-size-watch --status`. See §10.b above.** *(This preserved-verbatim block declares itself authoritative on divergence, which is exactly why the stale number is corrected HERE and not only above.)* Sync via:

    ⛔ **THE `/tmp` + `cp` RECIPE THAT STOOD HERE IS REPLACED (B-LANGSTON-CONTEXT P-6b, 2026-09-11)** — corrected in THIS block too, because it declares itself authoritative on divergence and a session reading bottom-up would otherwise follow the hazard. It wrote through the fixed, pre-creatable path `/tmp/langston_memory.md` (a symlink there steers a root write; an owned file there injects text into every Langston invoke), with no compare-and-swap and no copy of what it overwrote. Use `langston-memory-write` as shown in §10.b above:

    ```bash
    # SINCE P-2 (2026-09-12): edit the PART, not MEMORY.md (generated). DISCOVER the part; do not hard-code it.
    ssh root@204.168.141.77 'ls /home/langston/memory-parts/'          # ONE part today (00-legacy.md); many after the retrofit
    PART=00-legacy.md                                                 # the part you are editing (the ledger part declares ledger:true)
    ssh root@204.168.141.77 "cat /home/langston/memory-parts/$PART" > langston_part.md   # the bytes you will edit
    SHA=$(sha256sum langston_part.md | cut -d' ' -f1)                              # the sha OF THOSE BYTES - never a fresh one at write time
    # edit, then declare the change you intend (L ledger bullets, R retraction entries); --part asserts the target:
    ssh root@204.168.141.77 "cd /home/langston && langston-memory-write --expect-sha $SHA --part $PART --ledger-delta L --retractions-delta R --by '<session>' --reason '<batch-id>'" < langston_part.md
    ```

    Update `/home/langston/CLAUDE.md` only when comms protocol or his persona changes (rare). **Repo-side docs reach Langston off the REVIEW BRANCH — so a doc he needs must be pushed, not merely saved** (`LANGSTON_ARCHITECTURE.md` §6).
<!-- /WI-MOVED id=WI-A10 -->

## workflow-11-completion

<!-- WI-MOVED id=WI-A11 -->
### WI-A11 — the original text of workflow-11-completion

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

11. **Completion Report** — Scope objectives checklist with YES / NO / PARTIAL + evidence. List ACTUALLY-edited governance files (including Langston's MEMORY per 10.b). Save to `Claude Comms and Packages/Batch Completion/BATCH_N_COMPLETION_REPORT.md`. Langston reviews + confirms. Batch CLOSED only after Kyle's acknowledgment. ⛔ **SUPERSEDED 2026-09-02 (Kyle): a close needs no acknowledgement from him — see the top of this skill.**
<!-- /WI-MOVED id=WI-A11 -->
