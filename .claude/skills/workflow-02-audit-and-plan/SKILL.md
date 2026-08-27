---
name: workflow-02-audit-and-plan
description: STEP 2 ONLY of the DawnTrader batch workflow - the Pre-Implementation Audit AND Implementation Plan, one merged document. Use after the scope is approved and before any code is written, to read real files, consult SYSTEM_IMPACT_MAP.md per component and write BATCH_N_PRE_AUDIT.md. NOT for drafting the scope, NOT for editing code.
---

# STEP 2 — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

**ONE step. ONE document. Langston signs off ONCE, on both.** (Renamed 2026-08-21; the merge was #694 piece 5, adopted by Langston.)
**Ends when:** he clears the merged document.

## ⛔ THE ORDERING IS THE WHOLE POINT
**The AUDIT comes FIRST in the document; the PLAN falls out of it.** Under the old two-document way the plan was approved first, so **an audit that overturned the design arrived after the approval was already spent.** This ordering is what let an audit kill a design *before* a plan was built on it.

## ⛔ BINDING FORMAT REQUIREMENT
**Every plan item back-references the audit finding it falls out of.** Anything in the plan with **no** audit treatment is flagged **`UNAUDITED`** in-document.
*Why: on this format's first use, an item that appeared only in the plan half was never audited — and it was precisely the risk the audit had already identified.*

## DO
1. **Read actual files. Check PM2 logs. Query the database. Navigate the UI.** Not inference.
2. **MANDATORY: consult `SYSTEM_IMPACT_MAP.md` for every affected component** — upstream feeders, downstream consumers, shared state, background execution, blast radius. **Skipping the SIM review is how cascade bugs get through. Non-negotiable.**
3. **If the scope contradicts the System Manual, one of them is wrong — flag it.** If either doc is SILENT on something the batch touches, **that silence is itself a governance gap — flag it.**
4. Write the plan, each item pointing back at its finding.
5. End with the **plain-language summary**: here is what the audit turned up, here is the plan.

## ⛔⛔ THE SIX SOURCES — YOU READ ALL SIX THAT APPLY, AND YOU NAME WHICH YOU READ
> ★ **Kyle, 2026-08-21, on why this is written out as a list instead of "be thorough": these are the things he finds himself repeating every time.** A rule he has to repeat is a rule that is not written down where it fires. **Now it is.**
> ⛔ **THE STANDARD IS NOT "I LOOKED." It is: you understand what the thing DOES, what FLOWS INTO IT, what FLOWS OUT OF IT, and WHAT IT WAS BUILT TO DO — before you propose changing, adding to, or removing anything from it.** A plan written without that is a guess wearing a plan's formatting.

| # | source | what it answers | ⛔ |
|---|---|---|---|
| 1 | **The actual CODE**, read at `origin/migration/aws-supabase` | what it really does *now* | **Read the file. Not grep, not inference, not memory.** Quote `path:line` from the ref, never from your working tree. |
| 2 | **The RUNTIME LOGS** (`/var/log/dawntrader/out.log`, PM2) + the **DATABASE** | what it does when it *runs* — which is regularly not what the code appears to say | A behaviour you have not observed is a hypothesis. |
| 3 | **`SYSTEM_IMPACT_MAP.md`** — per component | upstream feeders, downstream consumers, shared state, background execution, blast radius | **Non-negotiable. Skipping the SIM review is how cascade bugs get through.** |
| 4 | **`SYSTEM_MANUAL.md`** | the architectural + mathematical truth it is *supposed* to implement | Scope contradicts it ⇒ one of them is wrong, **flag it**. Silent on something you touch ⇒ **that silence is itself a governance gap, flag it.** |
| 5 | **THE BATCH REPORTS + THE LEDGER** — `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, the completion reports | whether this was already decided, already known, or already fixed | **§9.5(b-ii). See the block below — this one is not optional and it was missing from this step.** |
| 6 | **`bridge/canonical/`** — the pre-governance corpus | **what it was BUILT to do, and why** | **§9.5(b). Required for anything disputed, surprising, or predating the 2026-01/02 governance change.** NOT current-state truth — the architecture has changed completely; its value is the INTENT. |

## ⛔ 5 — SEARCH THE LEDGER BEFORE YOU FILE ANYTHING AS A FINDING (§9.5(b-ii))
Grep `RUNNING_ISSUES.md` + `BATCH_CATALOG.md` + the completion reports **for the component AND for the symbol** before recording any behaviour as a defect.
**A deliberate, Kyle-approved, Langston-reviewed decision reported as a defect is WORSE than no finding** — it burns review cycles and impugns work that was done correctly.
★ **AND WHEN THE CODE COMMENT NAMES ITS OWN PROVENANCE — a batch id, an issue number, "Langston-approved" — FOLLOW IT. Do not read it and move on.** *(Origin: an audit reported shadowed gates as a discovery; the comment beside them cited a three-day-old Langston-approved decision. Kyle caught it from memory.)*
A finding that survives this check is real. One that does not becomes a **cross-reference**, and any new insight is recorded **ON the existing issue**, not as a fresh one.

## ⛔ 6 — THE PROVENANCE READ (§9.5(b)) — ORIGINAL INTENT, NOT JUST CURRENT STATE
⚠️ **THIS OBLIGATION LIVED ONLY IN STEP 1 UNTIL 2026-08-21 — which meant that by the time a session was actually DECIDING HOW TO CHANGE something, it was no longer in front of them.** That is the moment it matters most.
For any component whose behaviour is **disputed, surprising, or older than the 2026-01/02 governance change**, do both:
- **`bridge/canonical/`** — the architecture/execution-flow, current-state-reference, project-history, invariants and phase-history documents. **Kyle's framing: these record the system we INTENDED to build then. The purpose is unchanged; the architecture has completely changed — so they are NEVER cited as current truth. Their value is WHY something was built the way it was.**
- **Git archaeology of the origin** — `git log -S "<symbol>" --reverse`, then **READ the introducing commit's message**, its attached directive or spec (Replit-era commits often attach it under `attached_assets/`), and **what it deleted.**

**RECORDING RULE:** state what the provenance read found — **including "consulted `bridge/canonical/`, no coverage of this component", which is itself a finding.** *(The canonical corpus documented only ONE of the two RTB refresh mechanisms — which is exactly how a seven-month dual-execution bug survived two audits.)*

## ⛔ §9.5(a) — COMPONENT CENSUS AT EVERY HOP, NOT A PATH TRACE
An end-to-end trace is **satisfied by the first sufficient explanation at each hop** — it never asks "is there a SECOND thing doing this?" That is how a dual mechanism ran for seven months through two audits. At each component ask, repo-wide grep, tests excluded:
| question | why |
|---|---|
| who **writes/creates** here? | multiple producers |
| who **reads** here? | hidden consumers |
| who **mutates** here? | competing updaters |
| ★ who **DELETES** here? | **highest-yield — this one alone surfaces duplicates** |
| who **schedules/starts** work against it? | timers, clock subs, `.start()`, bootstrap, cron |
**If a list has exactly one member, SAY SO explicitly** — an asserted absence needs presence-evidence. **Two or more schedulers over one component require a mutual-exclusion check.**

## ⛔ §9.5(a-ii) — DELETION-TIME STATE-WRITE CENSUS
Before cutting ANY code, **enumerate the state it WRITES and grep for READERS of each.** A removed WRITER whose READER survives produces **no compile error and no failing test** — caller-tracing, green CI and clean `tsc` all pass while the deletion silently breaks a live dependency.
⇒ **A deletion is verified by "zero callers AND every state it wrote has no surviving reader" — not by zero callers alone.**


## ⛔ BEFORE THIS STEP LEAVES YOUR HANDS — REVIEW IT THE WAY LANGSTON WOULD
**Against the OBJECT, not your memory** (`CONDUCT.md` §6b — the full mechanism and why it is positional rather than clever). Before dispatching: **every census list, every "exactly one exists", every number — re-derive it from the object.** An audit built on a remembered read is the failure this step exists to prevent.
✅ **Fix what you find and move on.** In-task corrections belong in the commit message, **never in a report to Kyle.**

### ★ AND FOR A LOAD-BEARING CLAIM, DO NOT SIMULATE STATELESSNESS — PRODUCE IT (Langston ruling, 2026-08-27)
⛔ **A SESSION CANNOT REVIEW ITS OWN WORK STATELESSLY, AND WILL REPORT THAT IT DID.** *(Langston: "a session verifying its own statelessness would have to compare against the state it is claiming not to have" — the instrument that cannot fail.)* ★ **What makes HIM catch things is not discipline, it is a PROCESS BOUNDARY: a fresh process holding only what it was handed.**
⇒ **For a number, a cause, or a completion that this step rests on: spawn a fresh-context reviewer and hand it ONLY THE OBJECT AND THE CLAIM.** ✅ **STANDING APPROVAL — KYLE, 2026-08-27: spawn them for load-bearing claims at ANY point in the workflow, no permission needed.** ⚠️ **This line previously read *"Kyle must approve spawning one"* — MINE, and it turned the mechanism into a request. MEASURED CONSEQUENCE: it was written into four skills and SPAWNED ZERO TIMES in two days, including on the dispatches whose errors it was built to catch.** ★ **A rule that cannot be executed without asking is worse than no rule — it reads as covered.** *(Never call it a "process boundary" to Kyle; it is "a second reader who was never in the room.")*
★★ **ASK IT ONE THING, AND NOT THE OBVIOUS ONE:** not *"does this support the claim?"* but **"WHAT OTHER STATES OF THE WORLD ARE CONSISTENT WITH THIS OBJECT?"** — handed a directory listing for *"the key was dropped"* it answers *present / absent / empty* **without needing to know the right file. The ASK reaches wrong-object; a yes/no handoff cannot.**
⛔ **SCOPE IT TO THAT ONE OUTPUT — never a disposition, never true/false.** The moment it rules on the conclusion it is guessing from a stub.
⚠️ **THE LIMIT THAT WILL BITE, and it is Langston’s own measured case: a fresh context is blind to context it NEEDS, not only to context it should ignore.** He vacated a ruling of his own because a fresh invoke could not see his three earlier ones. **Hand it your SUMMARY and it reviews your summary — the same failure one level down.**

★★ **TWO MODES, AND MODE B IS MANDATORY FOR A MECHANISM CLAIM OR AN ABSENCE CLAIM (Langston condition (ii), 2026-08-27).**
| mode | you hand it | use for |
|---|---|---|
| **A** | the **object + the claim** | *"is this number right"* — cheap, and cheap is fine here |
| **B** | ★ **THE CLAIM ALONE** — *"name the objects that would settle this, then: what other states of the world are consistent with them?"* | ⛔ **MANDATORY: any MECHANISM claim and any ABSENCE claim** |
★ **WHY B EXISTS — IT MOVES THE OBJECT SELECTION ACROSS THE BOUNDARY, WHICH IS THE HALF MODE A CANNOT REACH.** In mode A **you** still choose what to hand it, and **a fresh reviewer handed the ADJACENT object returns a clean, confident, useless verdict.** ⚠️ **Langston’s own #675 retraction is the proof: his failure was not misreading the file, it was believing that file WAS the object.** A reader given only the claim must go and find it.
★ **WHAT DOES NOT CROSS THE BOUNDARY, and it is smaller than it looks: the CLAIM FRAME** — whether that was the right question at all. **A wrongly-framed claim is on the page and auditable; a wrongly-chosen object never was.** That residual is Langston’s, as the outer boundary.

⛔⛔ **A HIT IS A LEAD; A CLEAN IS NOT EVIDENCE (Langston condition (i), and it is the asymmetry that licenses the whole mechanism).**
- **A reviewer HIT must be RE-DERIVED at the ref, with a control, before it moves anything.** Same standing as his `langston-recall` §19.
- ⛔ **A reviewer CLEAN may NEVER be cited as support for a claim — not in a scope, not in a report, not to Langston.** *"The reviewer found nothing"* **is not evidence and he will bounce it as one.** ⚠️ **This is #453: a silence is not an absence.**
- ⛔ **EVERY SPAWN LEAVES A ONE-LINE RECORD where its finding lands** (the §9.4 disposition slot is the home): **`REVIEWER: <object handed | claim-only> · <question> · <verdict> · re-derived y/n`**. ★ **WITHOUT A DENOMINATOR THE BAR CAN NEVER RISE ABOVE "one run"** — we would be arguing from anecdote in a month, **with no way to tell a mechanism that works from one that is simply not firing.** *(That is exactly how the gated version read as covered while spawning zero times.)*

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
Move the card to **`Pre-Audit`**. On dispatch set **Blocked on = Langston**.
★ **LANGSTON SETS THE `Review` FIELD; THE SESSION MOVES THE CARD.** *(Kyle’s wording, 2026-08-24.)* ⛔ **His approval is NOT the move** — he sets `Review = Approved`, then YOU move it and update `Blocked on`. If approval also moved the card the board would freeze every time he is mid-review, at FOUR gates per batch.
⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

2. **Pre-Implementation Audit AND Implementation Plan** — ⚠️ **RENAMED 2026-08-21 (Kyle). The step was merged with the plan by #694 piece (5) and Langston ADOPTED it, but THE NAME NEVER FOLLOWED** — the concept was recorded and the label was not, so the workflow still read as two steps. **ONE step, ONE document, Langston signs off once, and the AUDIT comes BEFORE the plan inside it** (that ordering is the whole gain: under two documents the plan is approved first, so an audit that overturns the design arrives after the approval is already spent). **Every plan item back-references the audit finding it falls out of; anything unaudited is flagged `UNAUDITED` in-document.** — Read actual files, check PM2 logs, query Supabase, screenshot UI. **MANDATORY: consult `SYSTEM_IMPACT_MAP.md` for every affected component** (deeper than Step 1.a — per-component upstream + downstream + shared-state + background-execution + blast-radius enumeration). Document in `BATCH_N_PRE_AUDIT.md`. Langston reviews. Skipping the SIM review is how cascade bugs get prevented — non-negotiable.
