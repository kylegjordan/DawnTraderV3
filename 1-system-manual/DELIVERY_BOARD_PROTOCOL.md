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
- **The issue** *(only when the card carries an Issue number)* — **the issue's NAME and a one-line plain description, not just the number** (Kyle directive 2026-08-04). The `Issue` field cannot hyperlink and the issues file is too large for reliable deep-links, so **the card body carries enough that Kyle never has to go hunting**: what the issue is, in the same plain language as the rest.

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

★ **THE OWNER MOVES THE CARD. LANGSTON SETS `Review`.** *(Kyle's decision, 2026-08-03.)* His approval gates the move but is not itself the move — otherwise the board freezes whenever he is mid-review, at four separate points per batch. ✅ **He HAS board write access as of 2026-08-04** — Kyle-issued classic token, `project` scope only (board read/write, zero code access — the reviews-never-pushes rule is preserved by construction), installed at `/etc/langston/github-board.env`, **verified live: read, write and delete all exercised as his user.** He sets `Review` himself; the how-to is in his auto-loaded MEMORY.md. His actual words remain in Discord and the batch documents — the board is the third place a verdict is written, never the only one.

## 4b. ★ THE BACKLOG IS ORDERED — top of the column IS the next thing (Kyle directive 2026-08-03)

**`Backlog` is not a bag. Its vertical order IS the queue order, and it must reflect what we would actually pick up next.** ⇒ **when priority changes, MOVE THE CARD** — do not leave the true order living only in a conversation, a memory file, or somebody's head.

★ **WHY IT IS A RULE AND NOT A NICETY:** the whole point of the board is that Kyle should not have to ask what is next. **A backlog in arbitrary order answers "what exists" while silently failing to answer "what is next" — and looks authoritative doing it.** That is the same failure as a stale card: confidently wrong beats absent, in the bad direction.
**First application:** `B-DEPLOY-LOCK` (#649) was placed at the TOP on Kyle's instruction, ahead of the queued cleanup work, because it protects the correctness of every verification claim we make.

## 4c. ★ RECONCILIATION — roadmap, phase plan and board must agree (Kyle directive 2026-08-03)

**TRIGGER: at the close of every batch, its OWNER reconciles three records and confirms they match** — `POST_AUDIT_ROADMAP.md`, the active phase plan (`PHASE_19_PLAN.md` during Phase 19), and this board.

**The check is three questions, and each has a precise answer — none of them require judgement:**
1. **Does every OPEN batch in the phase plan have a card?** A batch with no card is invisible to Kyle.
2. **Does every non-Complete card correspond to something the plan or roadmap still lists?** A card with no plan entry is either stale or work nobody agreed to.
3. **Does the card's column match where the batch actually is?** In particular, **a card reading `Complete` whose completion report is not at the graded ref is the single most damaging wrong state on the board** — it tells Kyle something is finished when it is not.

⚠️ **THE OWNER CONFIRMS IT EXPLICITLY IN THE COMPLETION REPORT — a line stating the three were reconciled.** *(Kyle's wording: confirmed by the completing batch's owner.)* **An unstated reconciliation did not happen** — this project has twice shipped a completion report claiming governance files were updated when they had not been (#594, #637), and nothing catches that, because nobody re-verifies a list of things someone says they did.

⏸️ **AUTOMATION DELIBERATELY DEFERRED (Kyle, 2026-08-03): the governance checker COULD do the precise parts of this** — it already extracts batch-ids from commit subjects and grades doc-sets, so *"this batch has commits and no card"* and *"this card says Complete and the report is absent"* are exact, non-heuristic checks. ⛔ **But it is NOT being built yet, on purpose: "hold off and see how well it is used first."** ★ **And when it is built, it must check only what is CHECKABLE — never "should this card be in Verification rather than Implementation," which a commit cannot tell you. A nag that is frequently wrong gets ignored, and an ignored alert channel is exactly how the blind spots this project spent a week clearing were created.**

### 5.x ⚠ ADDING A SINGLE-SELECT OPTION IS A CLOBBER EVENT (measured 2026-08-06)

Adding one option to a single-select field (Owner, Type, Status, …) via `updateProjectV2Field` **regenerates EVERY option ID on that field**, which (a) **silently clears the field's value on every existing card** (27 cards lost their Owner the night this was learned), and (b) makes every cached option ID a **silent no-op — the mutation returns success and changes nothing** (caught only by read-back). The trap is the platform mutation itself; executing it "carefully" does not avoid it. **Procedure for ANY options-list change:** (1) snapshot title→value for the whole board FIRST; (2) apply the option change; (3) re-set every card from the snapshot using FRESHLY-FETCHED option IDs; (4) READ BACK the full histogram — a success exit proves nothing; (5) never trust a cached option ID across an options-list change (helper scripts must fetch the field map per run, not from a cache file).

## 5. Honest limits — stated so nobody trusts this further than it earns

⚠️ **NOTHING AUTOMATES THIS.** No hook, no check, no CI step moves a card. **If sessions do not update it, it becomes a confidently wrong second record** — and a stale board is more dangerous than no board, because Kyle will believe it. **This is the same failure mode as the four documents that agreed with each other and disagreed with the code (#641).**
⚠️ **THE BOARD IS NOT THE ISSUE LIST.** `RUNNING_ISSUES.md` remains the record of findings, with its own numbering. **Existing numbers are NOT migrated** — they are threaded through commit messages, scope files and live alert `resolution_evidence` tokens that cannot be rewritten. **A card POINTS AT `#NNN`; it does not replace it.**
⚠️ **A browsable copy of the issue list, reachable from the board, is wanted but is explicitly NOT a priority** (Kyle, 2026-08-03).
