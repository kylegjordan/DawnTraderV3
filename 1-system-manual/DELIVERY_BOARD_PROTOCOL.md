# DELIVERY BOARD PROTOCOL

**Board:** https://github.com/users/kylegjordan/projects/1 (private, user-scoped)
**Created:** 2026-08-03 (B-DELIVERY-BOARD, CC-B, Kyle-directed)
**Status:** ⏳ ADOPTION PENDING — CC-A, CC-C and Langston have not yet confirmed.

> **★ WHY THIS FILE IS SEPARATE AND NOT IN `CLAUDE.md`.** Kyle's stated problem was that finding out what a session was doing meant *"reading through paragraphs and paragraphs of broken sentences of commentary before I know what I'm looking at."* Solving that by adding several hundred lines to the always-loaded rules file would be the same disease in a new place. **CC-A is concurrently slimming `CLAUDE.md` to move depth into referenced files; this file is written to that pattern deliberately, not against it.** `CLAUDE.md` carries a pointer of a few lines and nothing more.

---

## 1. What the board is for — and the one thing it must never become

**PURPOSE: state legible at a glance.** Kyle opens one page and sees what every session is working on, which stage it is at, what Langston has approved or sent back, and what is waiting on him. **No prose required.**

⛔ **THE BOUNDARY, AND IT IS THE WHOLE RISK: THE BOARD HOLDS STATUS, OWNER, ORDER AND A PLAIN-LANGUAGE DESCRIPTION. NOTHING ELSE.**
**Every finding, citation, measurement, provenance read and verdict stays in the repo — `RUNNING_ISSUES.md`, the scope/pre-audit/completion documents — and the card LINKS to it.**
★ **The moment evidence is written into a card, we have built the two-sources-of-truth failure that has cost us repeatedly** — the code-vs-docs divergence (#641), the ledger-vs-heading drift, the alert store reporting a wrong actor. **A card that disagrees with the repo is worse than no card, because it looks authoritative and nothing re-derives it.**

## 2. Structure

**COLUMNS (Status) — the workflow, condensed from 11 steps to 8:**
`Backlog` → `Scope` → `Pre-Audit` → `Implementation` → `CI + Deploy` → `Verification` → `Governance` → `Complete`
*(Steps 5–6 merged: they always happen together. Steps 7–9 merged: a card sits in Verification while the iterate loop runs.)*

**FIELDS ON EVERY CARD:**
| field | values | meaning |
|---|---|---|
| **Owner** | Claude Old · Claude New · Analyst · Langston · Kyle | who is doing the work |
| **Type** | Batch · Sub-batch · Hotfix · Phase · Task | what kind of item |
| **Issue** | free text, e.g. `#637 #642` | the `RUNNING_ISSUES` number(s), **blank if none** |
| **Review** | Not required · **Approved** (green) · **SENT BACK TO OWNER** (red) | Langston's verdict at the last gate |
| **Blocked on** | Nothing · **Kyle** (orange) · Langston · External | who we are waiting for |

★ **REVIEW AND BLOCKED-ON ARE FIELDS, NOT COLUMNS, AND THAT IS DELIBERATE (Kyle's catch, 2026-08-03).** Langston reviews at **four** gates — scope, pre-audit, code diff, completion report — so a "Langston Review" column would have to be visited four times and would tell you nothing about *which* review. Blocking is the same: it can happen at any stage. **Both are orthogonal to position, so both are fields; the card keeps its real workflow position while showing that it is waiting and on whom.**

**VIEWS:** `View 1` (all work, board) · `Needs Kyle` · `Needs Langston` · `Claude Old` · `Claude New` · `Analyst`.

## 3. What goes on a card

**EVERY card carries a plain-language description. Kyle's requirement, verbatim intent: the batch headers are not always intuitive, so opening a card must explain what it is.** Three short parts:

- **What it is** — one or two sentences, ordinary English. **No batch ids, no file paths, no function names, no acronyms Kyle has not used himself.**
- **Why it matters** — the consequence of *not* doing it. If you cannot state one, question whether the card belongs on the board.
- **Done when** — the observable condition that ends the work. Not "implemented" — what will be *true*.

⚠️ **Write it for someone who has not read the batch documents, because that is exactly who is reading it.**

## 4. ★ Card-update steps — folded into the 11-step workflow

**These are additions to the existing workflow, not a parallel process.** The card moves when the work moves; it is never a separate status to remember.

| workflow step | card action |
|---|---|
| **Before Step 1** | Card exists in `Backlog` with Owner, Type, Issue and the description written. **A batch that starts without a card is invisible.** |
| **Step 1** (scope) | → `Scope`. On dispatch to Langston, set **Blocked on = Langston**. |
| **Step 2** (pre-audit) | → `Pre-Audit`. On dispatch, **Blocked on = Langston**. |
| **Step 3** (implementation) | → `Implementation`, **Blocked on = Nothing**. |
| **Step 4** (his diff review) | stays in `Implementation`; **Blocked on = Langston**. On his verdict set **Review = Approved** or **SENT BACK TO OWNER**. ⚠️ **On sent-back the card does NOT move.** |
| **Steps 5–6** (CI, deploy) | → `CI + Deploy`. If CI is running, **Blocked on = External**. |
| **Steps 7–9** (verify, iterate) | → `Verification`. His second pass sets **Blocked on = Langston**. |
| **Step 10** (governance) | → `Governance`. |
| **Step 11** (completion report) | **Blocked on = Langston** for his sign-off, then **Blocked on = Kyle** for acknowledgement, then → `Complete`. |
| **any point** | Waiting on a Kyle decision, credential or approval ⇒ **Blocked on = Kyle**. The card keeps its column. |

★ **THE OWNER MOVES THE CARD. LANGSTON SETS `Review`.** *(Kyle's decision, 2026-08-03.)* His approval gates the move but is not itself the move — otherwise the board freezes whenever he is mid-review, at four separate points per batch. ⚠️ **He cannot write to GitHub at all today** — no CLI, no token, and the key on his box is a deploy key registered to no account. **Until Kyle issues a scoped token, the OWNER records his verdict in the `Review` field on his behalf, and his actual words remain in Discord and the batch documents — the board is the third place it is written, never the only one.**

## 5. Honest limits — stated so nobody trusts this further than it earns

⚠️ **NOTHING AUTOMATES THIS.** No hook, no check, no CI step moves a card. **If sessions do not update it, it becomes a confidently wrong second record** — and a stale board is more dangerous than no board, because Kyle will believe it. **This is the same failure mode as the four documents that agreed with each other and disagreed with the code (#641).**
⚠️ **THE BOARD IS NOT THE ISSUE LIST.** `RUNNING_ISSUES.md` remains the record of findings, with its own numbering. **Existing numbers are NOT migrated** — they are threaded through commit messages, scope files and live alert `resolution_evidence` tokens that cannot be rewritten. **A card POINTS AT `#NNN`; it does not replace it.**
⚠️ **A browsable copy of the issue list, reachable from the board, is wanted but is explicitly NOT a priority** (Kyle, 2026-08-03).
