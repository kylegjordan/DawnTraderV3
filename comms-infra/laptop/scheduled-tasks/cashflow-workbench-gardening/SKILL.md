---
name: cashflow-workbench-gardening
description: Daily check of the Cashflow Workbench for queued learnings; folds them into the operating manual when enough accumulate.
---

Autonomous maintenance pass for the Cashflow Workbench. Work in the project directory:
`I:\Shared drives\Mundo TNMI Shared Files\1 TNMI\OpsPlat Build`

## Step 1 — Check whether there is anything to do (usually there isn't)

Read `workbenches/cashflow/working_memory.md` and find the pickup block at the bottom — it is delimited by the lines `# ══════ FOR CLAUDE CODE — graduate these into OPERATING_MANUAL.md ══════` and `# ══════ END CLAUDE CODE PICKUP BLOCK ══════`. It has no `##` markdown heading. Count the bullet lines between those markers (ignore any line containing "none pending").

**If fewer than 3 candidates: STOP. Do nothing, write nothing, commit nothing.** Reply with one short line: "Gardening check: N candidates pending, below threshold — no action." Silence is the correct outcome most days.

**If 3 or more: run the gardening pass below.**

## Step 2 — The gardening pass

These candidates are business learnings the Claude-for-Excel sidebar captured during Kyle's working sessions. Your job is to fold the durable ones into `workbenches/cashflow/OPERATING_MANUAL.md` — curated, not pasted.

Read the operating manual first, in full, then for each candidate:

- **Place it in the right existing section** (§2 supply chain / Tokai terms, §4 driver tabs + their subsections, §5 reactive tabs, §6 Cash Requirement, §8 customer payment patterns, §10 workbook conventions, §10.1 editing safety, §11.5 sanity check, §12 scenario analysis, §13.1 conversation style). Create a new subsection only if nothing fits.
- **Compress it.** One or two clear sentences beats a paragraph. The manual's value depends on staying lean — a bloated manual degrades the assistant that reads it.
- **Check for contradictions.** If a candidate corrects something the manual already says, REPLACE the old text, don't append alongside it. Past passes caught genuine errors this way (e.g. a steri-sample rule that was wrong). Flag any correction you make in your summary.
- **Drop candidates that are transient** (a one-off state, something already in the manual, or something that only mattered that week). Note what you dropped and why.
- **Write context, not rules.** This manual is a briefing for an informed colleague — it explains how things work; it does not command. Never write "must", "always reject", "the assistant SHALL". Kyle's judgment is final.

Then in `workbenches/cashflow/working_memory.md`, replace the entire body between the two pickup-block marker lines with a single line recording what was folded in and the date, in this form:
`- *(none pending — YYYY-MM-DD pass folded in: <short comma-separated list of topics with section refs>)*`

Leave the rest of working memory untouched — it is the sidebar's live state.

## Step 3 — Commit

CRITICAL git rule for this repo: the working tree is a Google-Drive-synced folder AND a server writes governance snapshots to the same branch. **Never use `git rebase` or `git checkout` of many files here** — Drive races the operation and can propagate regressions.

The safe pattern:
1. `git add` the two files you changed, commit with a message describing what was folded in.
2. `git fetch origin staging`
3. If anything is untracked/modified under `workbenches/` (the server or sidebar wrote it), `git add workbenches/` and commit that separately first — otherwise the merge will fail.
4. `git merge -X ours origin/staging -m "Merge server snapshots — local governance content is newest"`
5. `git push origin staging`

If the merge or push fails, do NOT force anything — stop and report what happened.

## Step 4 — Report

Summarize in a few lines: how many candidates, what you folded in and where, anything you corrected, anything you dropped and why. If you found something that looks like a real problem in the workbook data or the system (not just a learning to file), say so clearly at the top — that is worth Kyle's attention.