---
name: workflow-03-implementation
description: STEP 3 ONLY of the DawnTrader batch workflow - Implementation. Use when actually editing code in the clone on the migration branch after the audit and plan are signed off. Covers surgical edits, commit discipline and explicit paths. NOT for planning, NOT for review, NOT for deploying.
---

# STEP 3 — IMPLEMENTATION

**Ends when:** the code is written, committed with explicit paths, and pushed.

## DO
- Edit **directly in your own clone**, on `migration/aws-supabase`. **No staged-changes folders. No zip packages.**
- **Surgical edits, explicitly documented. No speculative refactoring.**
- **NO PATCHES.** Every fix long-term, structural, scalable. When a problem surfaces, find the **root cause** and design the right architecture. No "good enough for now."
- **No hard-coded fallbacks for DB-governed settings.** If it should come from the DB, **fail hard when the DB is empty** — never silently default.
- **Never leave legacy lingering.** At the moment you surface it: delete it now through the full workflow, or **place a concrete deletion in the active plan** (never a date — §9.4). Record removals in `DELETED_COMPONENTS_LOG.md`.

## ⛔ COMMIT DISCIPLINE — THE MANDATED FORM
```
git add <explicit paths>
git diff --cached          # READ THE CONTENT, not just --name-only
git commit -F <msgfile> -- <the same explicit paths>
```
⚠️ **`--name-only` CANNOT CATCH THE REAL RISK.** On a shared branch three sessions write into the same governance docs, so **the path is always right — which is exactly why the explicit-path habit cannot catch this.** A staged file you do not remember staging is a **SIGNAL**: read WHOSE content it is before committing.
⚠️ **`git diff HEAD` DOES NOT SHOW UNTRACKED FILES** and says nothing about the omission. **Cross-check `git status --porcelain` for `??` before calling any diff "the change set."**
⚠️ **Never carry a multi-hour uncommitted diff** — it breaks Langston's ability to verify at a ref. **Quote `path:line` from the ref, never from your worktree.**

## ⛔⛔ WHY ANOTHER SESSION'S CONTENT APPEARS IN YOUR INDEX — SOLVED 2026-08-21, DO NOT RE-DIAGNOSE IT
**It is NOT another session writing into your clone. It never was.** `.claude/hooks/fresh-rules.mjs` refreshes stale shared documents with `git checkout <ref> -- <path>`, and **that command writes the INDEX as well as the working tree.** So the hook silently STAGED every file it refreshed, holding **origin's content — i.e. other sessions' work — under a path you recognise as your own.**
**IDENTIFIED ONCE:** 2026-08-21 (CC-C's #736/#737 found staged in CC-A's index, one `git commit` away from being published under the wrong name) — **and fixed 18 minutes later.**
⚠️ **DATE CORRECTED 2026-08-31 (B-CROSS-SESSION-BLEED):** this read *"MEASURED TWICE … 2026-08-09, and 2026-08-21"*. **There was no 2026-08-09 event** — the stash so labelled has a reflog date of **2026-08-18**, and `#753`'s instance table does not list it. ★ **The retraction was written into a review dispatch and into `fresh-rules.mjs`, and this THIRD copy was missed until someone read this skill to follow it** — `fix-follows-pointer` on the very file that teaches the pattern.
**FIXED** — the hook now runs `git reset -- <path>` immediately after the checkout. ⇒ **If you still find content you did not stage: STASH it (do not commit, do not discard), pull, and confirm it arrived from origin. KEEP THE STASH until the CAUSE is established** — the 08-09 stash was dropped once the work was proven safe, which destroyed the only artifact showing how it got there. **Recovering the work and diagnosing the incident are two different jobs.**
★ **THE GENERAL LESSON, which outlives this hook: A MATCHING NAME IS NOT A MATCHING THING.** Explicit paths protect you from the wrong FILE and are structurally blind to the wrong CONTENT.


## ⛔ BEFORE THIS STEP LEAVES YOUR HANDS — REVIEW IT THE WAY LANGSTON WOULD
**Against the OBJECT, not your memory** (`CONDUCT.md` §6b — the full mechanism and why it is positional rather than clever). Before committing: **read the staged hunk, not the filename**, and re-check that what you changed does what you say it does — at the code, not from the plan you wrote earlier.
✅ **Fix what you find and move on.** In-task corrections belong in the commit message, **never in a report to Kyle.**

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
Move the card to **`Implementation`**, **Blocked on = Nothing**.
★ **The board rules every step shares — Langston sets `Review`, the session moves the card, nothing automates it, and the card holds status, owner, order and the description only — are in `1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §2 (`WI-B1`).** Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT — ARCHIVED (`WI-A03`)
The word-for-word `CLAUDE.md` §2 text for this step is archived, unchanged, at `1-system-manual/_archive/WORKFLOW_SKILL_ORIGINAL_TEXT.md` (`WI-A03`; B-WORKFLOW-IMPROVE Q10, 2026-11-20). **Every rule in it is carried by the summary above;** the archive keeps the origin cases, dates and issue numbers. Read it when a rule's history matters.
