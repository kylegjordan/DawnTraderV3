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
`Backlog` → `Scope` → `Pre-Audit` → `Implementation` → `CI + Deploy` → `Verification` → `Governance` → **`Observation`** → `Complete`

## ★★ `Observation` — WORK DONE, WAITING ON DATA (Kyle directive 2026-08-27; column added the same day)

**THE STATE IT NAMES:** all the work is finished, the code is deployed, **the governance documents are written and RECORD that an observation window is open** — and the batch is now waiting for **a period to elapse or a quantity to accumulate** before anyone can decide anything.

⛔ **IT SITS AFTER `Governance`, NOT BEFORE, AND KYLE’S REASONING IS WHAT DECIDES IT: the governance documents must RECORD that we are in the window and what we are waiting for.** If `Observation` came first those documents would be written before anyone knew what they were recording. ★ **There is a SECOND governance touch on the way OUT** — the result is written into the same documents when the window closes — **but that does not need its own column; it is what leaving `Observation` MEANS.**

⛔ **`Complete` IS UNREACHABLE FROM `Observation` UNTIL BOTH HAPPEN: THE DATA IS IN *AND* A DECISION OR ACTION HAS BEEN TAKEN ON IT.** An elapsed window with data nobody concluded anything from is **not** a finished batch.

★ **WHY THIS COLUMN EXISTS AT ALL, in Kyle’s words:** *"if we go ahead and close these things while we are waiting for data to come in, then it is easy for those to slip through the crack and we forget that we need to look back at the data."* ⇒ **A batch parked here is a STANDING, VISIBLE REMINDER.** An alert quietly waiting in a queue is not. **That is the whole argument for the column, and it is the stronger one.**
★ **AND IT DOES NOT BLOCK YOU.** A batch sitting in `Observation` is not work in progress — **move on to the next batch and come back when the data is there.** That is the point of separating it from the working stages.

**THE REPORT TRACKS THE COLUMN, ONE DOCUMENT THROUGHOUT:** while the card is in `Observation` the batch has a **progress report**; when the data arrives and the decision is taken, **the same file becomes the completion report** — not a rewrite. *(Full rule: `workflow-10-governance`; the conversion: `workflow-11-completion`.)*
*(Steps 5–6 merged: they always happen together. Steps 7–9 merged: a card sits in Verification while the iterate loop runs.)*

**FIELDS ON EVERY CARD:**
| field | values | meaning |
|---|---|---|
| **Owner** | Claude Old · Claude New · Analyst · Langston · Kyle | who is doing the work |
| **Type** | Batch · Sub-batch · Hotfix · Phase · Task | what kind of item |
| **Issue** | free text, e.g. `#637 #642` | the `RUNNING_ISSUES` number(s), **blank if none** |
| **Review** | Not required · **Approved** (green) · **SENT BACK TO OWNER** (red) | Langston's verdict at the last gate |
| **Blocked on** | Nothing · **Kyle** (orange) · Langston · External | who we are waiting for |
| **Phase** | Earlier · Phase 16 · Phase 19 · Phase 20 · Phase 21 · Phase 25 | **which phase this batch belongs to — added 2026-08-24 so the ARCHIVE stays answerable** (§2b). Set when the card is CREATED. |

★ **REVIEW AND BLOCKED-ON ARE FIELDS, NOT COLUMNS, AND THAT IS DELIBERATE (Kyle's catch, 2026-08-03).** Langston reviews at **four** gates — scope, pre-audit, code diff, completion report — so a "Langston Review" column would have to be visited four times and would tell you nothing about *which* review. Blocking is the same: it can happen at any stage. **Both are orthogonal to position, so both are fields; the card keeps its real workflow position while showing that it is waiting and on whom.**

**VIEWS:** `View 1` (all work, board) · `Needs Kyle` · `Needs Langston` · `Claude Old` · `Claude New` · `Analyst`.

## 3. What goes on a card

**EVERY card carries a plain-language description. Kyle's requirement, verbatim intent: the batch headers are not always intuitive, so opening a card must explain what it is.** Three short parts:

- **What it is** — one or two sentences, ordinary English. **No batch ids, no file paths, no function names, no acronyms Kyle has not used himself.**
- **Why it matters** — the consequence of *not* doing it. If you cannot state one, question whether the card belongs on the board.
- **Done when** — the observable condition that ends the work. Not "implemented" — what will be *true*.
- **The issue** *(only when the card carries an Issue number)* — **the issue's NAME and a one-line plain description, not just the number** (Kyle directive 2026-08-04). The `Issue` field cannot hyperlink and the issues file is too large for reliable deep-links, so **the card body carries enough that Kyle never has to go hunting**: what the issue is, in the same plain language as the rest.

⚠️ **Write it for someone who has not read the batch documents, because that is exactly who is reading it.**

## 2b. ★ `Complete` IS A PHASE LEDGER — IT FILLS ALL PHASE, THEN ARCHIVES AT THE TRANSITION (Kyle directive 2026-08-24)

⛔ **A CARD THAT REACHES `Complete` STAYS THERE FOR THE REST OF THE PHASE. It is NOT archived, hidden or tidied when the batch closes.** `Complete` accumulates every batch of the CURRENT phase and is meant to — **it is the at-a-glance record of what this phase has actually delivered**, which is exactly the view Kyle loses if finished cards vanish one by one.
⚠️ **DO NOT TIDY `Complete` BETWEEN PHASES.** A card removed early takes its delivery out of the phase record and leaves the completion report as the only survivor — a worse answer to the single question the board is best at: *what has this phase actually shipped?*

### ★ AT THE PHASE TRANSITION — STAMP, ARCHIVE, THEN OPEN THE NEXT PHASE. ONE EVENT, THREE PARTS.
Done in the SAME session with Langston that splits the new phase into batches (§3b trigger 2), so the board never sits half-way between two phases.
1. **STAMP** — every card still in `Complete` gets its **`Phase`** value if it does not already have one. ⛔ **This is what makes the archive answerable later; skip it and the archive becomes one undated pile.**
2. **ARCHIVE** — archive those cards (`gh project item-archive --owner kylegjordan --id <PVTI_…>`, or the card’s own … menu). **Archiving is NOT deletion:** the card leaves the board and stays fully readable in the project’s **Archived items** view — open the project, `…` menu → **Archived items** — and can be restored to the board at any time.
3. **OPEN THE NEXT PHASE** — create the next phase’s cards into `Backlog`, in priority order (§3b, §4b).

★ **THEN "WHAT DID PHASE 19 DELIVER?" IS A FILTER, NOT AN EXCAVATION** — the Archived items view filtered to `Phase = Phase 19`.

### ⚠️ THE `Phase` FIELD WAS CREATED CAREFULLY, AND THE CARE IS THE REUSABLE PART (2026-08-24)
§5.x records that **adding an OPTION to an EXISTING single-select field is a clobber event** — it regenerates every option ID, silently clears that field on every card, and turns cached IDs into successful no-ops. **Creating a NEW field is a different mutation and does not carry that risk** — but that was PROVEN, not assumed: a 53-card snapshot was taken first, the field created, and the full board re-read and compared field-by-field. **0 values disturbed.**
⛔ **AND THIS IS WHY `Phase` SHIPPED WITH EVERY OPTION IT WILL NEED (`Earlier` → `Phase 25`) RATHER THAN ONE:** adding `Phase 26` later IS the clobber-prone operation. **Front-loading the options means we never have to perform it.** If a phase beyond this list is ever needed, follow §5.x in full — snapshot, change, re-set from the snapshot with FRESHLY-FETCHED option IDs, read back the histogram.
⚠️ **AND THE SNAPSHOT HAS A KNOWN HOLE:** `gh project item-list` reported `Blocked on` as empty on all 53 cards while it was demonstrably set on two. **That field cannot be snapshotted with this tool** (§5 records the same class). Re-set it by hand after any options-list change rather than trusting a restore.

## 3. What goes on a card

**EVERY card carries a plain-language description. Kyle's requirement, verbatim intent: the batch headers are not always intuitive, so opening a card must explain what it is.** Three short parts:

- **What it is** — one or two sentences, ordinary English. **No batch ids, no file paths, no function names, no acronyms Kyle has not used himself.**
- **Why it matters** — the consequence of *not* doing it. If you cannot state one, question whether the card belongs on the board.
- **Done when** — the observable condition that ends the work. Not "implemented" — what will be *true*.
- **The issue** *(only when the card carries an Issue number)* — **the issue's NAME and a one-line plain description, not just the number** (Kyle directive 2026-08-04). The `Issue` field cannot hyperlink and the issues file is too large for reliable deep-links, so **the card body carries enough that Kyle never has to go hunting**: what the issue is, in the same plain language as the rest.

⚠️ **Write it for someone who has not read the batch documents, because that is exactly who is reading it.**

## 2b. ★ `Complete` IS A PHASE LEDGER, NOT AN OUTBOX — IT CLEARS AT THE PHASE CHANGE (Kyle directive 2026-08-24)

⛔ **A CARD THAT REACHES `Complete` STAYS THERE. It is NOT archived, hidden or removed when the batch closes.** `Complete` accumulates every batch of the CURRENT PHASE and is meant to — **it is the at-a-glance record of what this phase has actually delivered**, which is exactly the view Kyle loses if cards vanish the moment they finish.

**IT IS CLEARED ONLY AT A PHASE TRANSITION**, as part of opening the next phase — the same session with Langston that splits the new phase into batches and assigns them (§3b trigger 2). **Clearing `Complete` and creating the next phase’s `Backlog` are two halves of ONE event**, so the board never sits half-way between two phases.

⚠️ **DO NOT TIDY `Complete` BETWEEN PHASES.** A card removed early takes its delivery out of the phase record, and the completion report is the only place that survives — which is a worse record for the one question the board is best at answering: *what has this phase actually shipped?*

## 3b. ★ WHO CREATES A CARD, AND WHAT TRIGGERS IT (Kyle directive 2026-08-24 — previously UNWRITTEN)

⚠️ **THIS WAS A REAL GAP.** §4 said a card must exist before Step 1 and that a batch without one is invisible — but **nothing said who puts it there or when.** So "when does a card get created" was answered by whoever happened to be looking, which means work with no card was both invisible AND nobody’s fault.

**WHO: the session that will OWN the work creates its own card.** Not Kyle, not Langston, not whoever noticed.

**THE TWO TRIGGERS — these are the moments, and there is no third:**
1. **A FINDING DURING A BATCH CREATES A NEW BATCH OR SUB-BATCH.** ⇒ **the session that surfaced it creates the card THEN AND THERE**, in the same turn it decides the work is real. ★ **This is the same instant §9.4 requires a named owner and a dated home — the card IS that home made visible.** Do not defer it to "when I start it".
2. **PHASE PLANNING.** When a phase closes and the next is opened with Langston, the phase is split into batches and each is assigned to a session. ⇒ **each session then creates cards for ITS OWN assigned batches**, all into `Backlog`, and moves the one it is starting to `Scope`.

**SET `Phase` WHEN YOU CREATE THE CARD** — the phase the batch belongs to. It costs one click at creation and it is what makes the archive answerable at the transition (§2b); back-filling 30 cards later is the alternative.

**PLACEMENT: `Backlog` is the default and the normal entry point.** A card goes straight to `Scope` only when work begins immediately — something urgent enough to jump the queue.
⛔ **AND CREATING A CARD INCLUDES PLACING IT IN THE ORDER (§4b): `Backlog` is not a bag — its vertical order IS the queue.** Adding to the bottom without asking whether it belongs there leaves the true priority living only in a conversation.

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

★ **LANGSTON SETS THE `Review` FIELD; THE SESSION MOVES THE CARD.** *(Kyle’s wording, 2026-08-24.)* ⛔ **AND THAT INCLUDES AFTER HE APPROVES — HIS APPROVAL IS NOT THE MOVE.** He sets `Review = Approved`; **the SESSION then moves the card to the next column and updates `Blocked on`.** *(Kyle asked directly, 2026-08-24. If his approval also moved the card, the board would freeze every time he is mid-review — at FOUR gates per batch.)* *(Kyle's decision, 2026-08-03.)* His approval gates the move but is not itself the move — otherwise the board freezes whenever he is mid-review, at four separate points per batch. ✅ **He HAS board write access as of 2026-08-04** — Kyle-issued classic token, `project` scope only (board read/write, zero code access — the reviews-never-pushes rule is preserved by construction), installed at `/etc/langston/github-board.env`, **verified live: read, write and delete all exercised as his user.** He sets `Review` himself; the how-to is in his auto-loaded MEMORY.md. His actual words remain in Discord and the batch documents — the board is the third place a verdict is written, never the only one.

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

### ⚠️ `gh project item-list` is NOT a trustworthy read-back for every field (CC-B, 2026-08-07)

Setting **Blocked on** on a card succeeded, and `gh project item-list --format json` reported `blockedOn = None` for the same card in the same minute. Querying the item's `fieldValues` through the GraphQL API showed `Blocked on = Langston`, correctly set. **The write was fine; the READ-BACK was wrong.**

**Why this is dangerous rather than merely annoying:** §5.x already tells you a success exit proves nothing and to read back. Follow that with `item-list` and you get a **false negative** — you conclude the write silently no-opped, and the documented response to a silent no-op is to re-apply, escalate, or start suspecting the options-list clobber. **An instrument that under-reports sends you hunting a bug that is not there**, which is the mirror image of the clobber it was added to catch.

**RULE: verify card fields against the item's `fieldValues` via the API, not `item-list`.** The convenience command is fine for "does a card exist" and for the fields it does report; it is not authoritative for absence. Same family as every other lesson here — **a silent zero is a claim about the instrument before it is a claim about the data.**

