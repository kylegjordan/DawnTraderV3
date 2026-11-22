---
name: workflow-02-audit-and-plan
description: STEP 2 ONLY of the DawnTrader batch workflow - the Pre-Implementation Audit AND Implementation Plan, one merged document. Use after the scope is approved and before any code is written, to read real files, consult SYSTEM_IMPACT_MAP.md per component and write BATCH_N_PRE_AUDIT.md. NOT for drafting the scope, NOT for editing code.
---

# STEP 2 — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

**ONE step. ONE document. Langston signs off ONCE, on both.** (Renamed 2026-08-21; the merge was #694 piece 5, adopted by Langston.)
**Ends when:** he clears the merged document.

## ⛔ THE ORDERING IS THE WHOLE POINT
**The AUDIT comes FIRST in the document; the PLAN falls out of it.** Under the old two-document way the plan was approved first, so **an audit that overturned the design arrived after the approval was already spent.** This ordering is what let an audit kill a design *before* a plan was built on it.

## ⛔⛔ THE DOCUMENT'S OWN TITLE SAYS BOTH HALVES (Kyle directive 2026-09-05)
**The first line of the file reads `# <BATCH-ID> — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN`.** The filename stays `<BATCH>_PRE_AUDIT.md` — **it is cited across the corpus and the governance checker keys on it** — but the TITLE inside must name the plan.
★ **WHY, and it is not cosmetic: the step was merged in `#694` piece 5 and the NAME never followed, so the workflow read as two steps for months.** A document titled only *"Pre-Audit"* invites a session to write only the audit half and feel finished — **the plan is then missing and nothing in the document's own header asks for it.**
⚠️ **MEASURED 2026-09-05 across the existing pre-audits: NOT ONE of them titles itself with both halves** — they read *"pre-audit"*, *"PRE-AUDIT (Step-2)"*, *"Pre-Implementation Audit"*. **The convention did not exist until now; do not read an old file's title as the standard.**

## ⛔ BINDING FORMAT REQUIREMENT
**Every plan item back-references the audit finding it falls out of.** Anything in the plan with **no** audit treatment is flagged **`UNAUDITED`** in-document.
*Why: on this format's first use, an item that appeared only in the plan half was never audited — and it was precisely the risk the audit had already identified.*

## DO
1. **Read actual files. Check PM2 logs. Query the database. Navigate the UI.** Not inference.
2. **MANDATORY: consult `SYSTEM_IMPACT_MAP.md` for every affected component, deeper than the Step-1.a read** — upstream feeders, downstream consumers, shared state, background execution, blast radius. **Skipping the SIM review is how cascade bugs get through. Non-negotiable.**
3. **If the scope contradicts the System Manual, one of them is wrong — flag it.** If either doc is SILENT on something the batch touches, **that silence is itself a governance gap — flag it.**
4. Write the plan, each item pointing back at its finding.
5. ⛔ **IF THIS BATCH'S VERIFICATION READS AN OBSERVATION WINDOW ON STAGING** (a soak, a trading session, a count of closes), **file its `open` row in `1-system-manual/DEPLOY_WINDOWS.jsonl` IN THE STEP-2 COMMIT**, and close it with a reason code when the window ends. The grammar is in `scripts/obs-windows.py`'s header; every window carries a `review_by`. `dt-deploy` refuses to land in an open window unless the deploy names it, so **an unfiled window is unprotected**, and Langston gates Step 2 on the row (`B-DEPLOY-WINDOW-GUARD`, `#1249`).
6. End with the **plain-language summary**: here is what the audit turned up, here is the plan.

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
★ **Aid for this read: `history.mjs` — a lead, never a verdict; its limits are in "THE AUDIT AIDS" below.**
⚠️ **THIS OBLIGATION LIVED ONLY IN STEP 1 UNTIL 2026-08-21 — which meant that by the time a session was actually DECIDING HOW TO CHANGE something, it was no longer in front of them.** That is the moment it matters most.
For any component whose behaviour is **disputed, surprising, or older than the 2026-01/02 governance change**, do both:
- **`bridge/canonical/`** — the architecture/execution-flow, current-state-reference, project-history, invariants and phase-history documents. **Kyle's framing: these record the system we INTENDED to build then. The purpose is unchanged; the architecture has completely changed — so they are NEVER cited as current truth. Their value is WHY something was built the way it was.**
- **Git archaeology of the origin** — `git log -S "<symbol>" --reverse`, then **READ the introducing commit's message**, its attached directive or spec (Replit-era commits often attach it under `attached_assets/`), and **what it deleted.**

**RECORDING RULE:** state what the provenance read found — **including "consulted `bridge/canonical/`, no coverage of this component", which is itself a finding.** *(The canonical corpus documented only ONE of the two RTB refresh mechanisms — which is exactly how a seven-month dual-execution bug survived two audits.)*

## ⛔ §9.5(a) — COMPONENT CENSUS AT EVERY HOP, NOT A PATH TRACE
★ **Aid for this census: `census.mjs` — a lead, never a verdict; its limits are in "THE AUDIT AIDS" below.**
An end-to-end trace is **satisfied by the first sufficient explanation at each hop** — it never asks "is there a SECOND thing doing this?" That is how a dual mechanism ran for seven months through two audits. At each component ask, repo-wide grep, tests excluded:
| question | why |
|---|---|
| who **writes/creates** here? | multiple producers |
| who **reads** here? | hidden consumers |
| who **mutates** here? | competing updaters |
| ★ who **DELETES** here? | **highest-yield — this one alone surfaces duplicates** |
| who **schedules/starts** work against it? | timers, clock subs, `.start()`, bootstrap, cron |
**If a list has exactly one member, SAY SO explicitly** — an asserted absence needs presence-evidence. **Two or more schedulers over one component require a mutual-exclusion check.**

## ⛔⛔ ENUMERATE THE ENTRY POINTS **FIRST**, REPO-WIDE — BEFORE THE TRACE AND BEFORE ANY CUT
> **CARRIED FROM `CLAUDE.md` §9.5(a-ii) (B-CLAUDEMD-SLIM, 2026-08-28).** ⚠️ **It fires at BOTH triggers and the clause names both deliberately: at an AUDIT HOP, and BEFORE ANY DELETION.** Its source home was the deletion rule; landing it only at the audit census would carry it out of the deletion path it was written for.

★★ **TRACING FORWARD FROM ONE ENTRY POINT STRUCTURALLY CANNOT DISCOVER A SECOND ENTRY POINT.** ⇒ **enumerate every scheduler, timer, clock subscription, service `.start()`, bootstrap call, cron and event subscription FIRST, repo-wide, tests excluded** — **then** trace, **then** cut.
⚠️ **THIS IS NOT THE PER-HOP CENSUS ABOVE, AND THE DISTINCTION IS THE WHOLE POINT.** The census asks *"is there a SECOND thing doing this HERE?"* — **incuriosity at a hop the trace VISITED.** This asks *"is there a hop the trace NEVER VISITED?"* — **unreachability.** ⇒ **Different failure, different cure: the hop-census fixes the first; ONLY prior repo-wide enumeration fixes the second.**
**If exactly ONE exists, SAY SO** — an asserted absence needs presence-evidence (rule 22). **Two or more concurrent entry points additionally require a mutual-exclusion check.**

## ⛔ §9.5(a-ii) — DELETION-TIME STATE-WRITE CENSUS
Before cutting ANY code, **enumerate the state it WRITES and grep for READERS of each.** A removed WRITER whose READER survives produces **no compile error and no failing test** — caller-tracing, green CI and clean `tsc` all pass while the deletion silently breaks a live dependency.
⇒ **A deletion is verified by "zero callers AND every state it wrote has no surviving reader" — not by zero callers alone.**


## ★ THE AUDIT AIDS — LEADS, NEVER VERDICTS (B-WORKFLOW-IMPROVE OBJ-8, 2026-11-20)
**The one home for the aids' table and standing** — Step 1, the hotfix path, `CLAUDE.md` §9.5 and `AGENTS.md` §2 point here. Plain Node scripts in `scripts/crew-tooling/`; both crews run them from Git Bash at the repo root.
| aid | what it lists | command |
|---|---|---|
| code search | every type-aware use of one symbol | `node scripts/crew-tooling/code-refs.mjs <symbol> [--file <declaring file>]` |
| census | uses, plus the entry points that reach the target (bootstrap, timers, cron, PM2, systemd) and drizzle and raw-SQL table hits | `node scripts/crew-tooling/census.mjs --symbol <s> [--file <f>]` · `--path <file>` · `--table <name>` |
| history | the batches behind a file, their scope, audit and completion documents, and the `RUNNING_ISSUES`, `DECISIONS` and `DELETED_COMPONENTS_LOG` rows that cite it | `node scripts/crew-tooling/history.mjs <path> --ref origin/migration/aws-supabase` |
| close-out matrix | the governance documents the declared change-class requires for a batch, each row's verdict from the repo at `--head`; imports the governance checker's own tables. **Cannot see:** it reads the scope's change-class marker the same way the governance checker does, so a marker the checker misses it misses too; an omitted update is silent in a diff, so a row it fills is a lead, not a verdict; and its diff legs are the whole `--base..--head` range, not the batch's own commits, so another batch's touch in that range reads `UPDATED` and another batch's deletions feed the deleted-log hint | `node scripts/crew-tooling/closeout.mjs --class <c>` · `--batch <ID> --base <ref> --head <ref>` · `--compare` |
| search index | — | **not yet delivered; do not cite it** |

⛔ **They answer WHERE. They resolved none of the pilot's five escapes; for one they produced the governing lead, and the miss was in following it. Quote each run's "cannot see" lines in the pre-audit.** Their silence is **not evidence** for: two value lists agreeing (a type against a database enum, or against a literal list or `Set`) · literal copies of a list · properties and fields (the symbol modes take top-level declarations only) · sibling producers of one label or panel · what a site MEANS (counted before or after a filter; an empty result versus a failed read) · error paths · a library's own behaviour · files outside the TypeScript programs (`scripts/`). ⚠️ **The `scripts/` exclusion is NOT stated in the census output, so there is no line to quote: write it into the pre-audit yourself.**
⛔ **THE PRE-AUDIT CARRIES ONE NAMED LINE PER BLIND-SPOT CLASS ABOVE (eight lines):** for a class the batch touches, the lists or sites named and compared by hand; for one it does not, `N/A — <why>`. A declared N/A is checkable at Step 4; a missing line reads as a skip.
⚠️ **`--table` misled in 3 of the 4 pilot replays** — an enum type, a misnamed table, and a real table of that name belonging to a different system (the real store was a file). **A `--table` zero, or a hit, counts only after the object is confirmed from its WRITE SITE** — a name match is not an object match.
*(Why: the pilot replayed four closed batches chosen to cover four defect classes — a purposive sample, so "all five escapes were value or meaning misses" is NOT a frequency claim; its load-bearing output is the blind-spot list, each entry a named run with a named wrong result — `Change Lists/B_WORKFLOW_IMPROVE_PILOT.md`. No aid is a required gate (Langston, Step-4 gate 1, 2026-11-20): the census and provenance obligations are already mandatory, and the aids are entry points into them.)*

## ⛔ THE PRE-AUDIT CARRIES A "PREVIOUSLY-STATED-VS-NOW" SECTION AT THE TOP
> **CARRIED FROM `CLAUDE.md` §9.2 (B-CLAUDEMD-SLIM, 2026-08-28).** ⚠️ **The COMPLETION half already lived in `workflow-11`; the PRE-AUDIT half lived nowhere but the rules file** — verified absent here, twice, before the carry.

**List EVERY prior-number → new-number delta, with the decision source cited:**
> **PREVIOUSLY STATED: X. NOW: Y. REASON: \<one line\>.**

★ **It goes at the TOP, not in a footnote.** A number that moved between the scope and the audit is the single most decision-bearing thing in the document — **the reader is deciding whether to approve a plan built on it.**
⚠️ **A number you corrected silently reads as a number that never changed.**

## ⛔ BEFORE THIS STEP LEAVES YOUR HANDS — REVIEW IT THE WAY LANGSTON WOULD
**Against the OBJECT, not your memory** (`CONDUCT.md` §6b — the full mechanism and why it is positional rather than clever). Before dispatching: **every census list, every "exactly one exists", every number — re-derive it from the object.** An audit built on a remembered read is the failure this step exists to prevent.
✅ **Fix what you find and move on.** In-task corrections belong in the commit message, **never in a report to Kyle.**

### ★ AND FOR A LOAD-BEARING CLAIM — A FRESH READER (`1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §1 · `WI-F1`)
⛔ **Read §1 of the shared contract before this step publishes a number, a cause, an absence or a completion it rests on. The rule is held there once, word for word, and that text is authoritative.** The trigger, in short: spawn a fresh reader without asking (Kyle's standing approval, 2026-08-27); hand it the object and the claim, or **the claim alone for any mechanism or absence claim (mandatory)**; one reader, one pass, then Langston; a hit is a lead to re-derive at the ref, a clean is never evidence; leave the `REVIEWER:` record; label any load-bearing claim you did not route `NOT RE-READ`.

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
Move the card to **`Pre-Audit`**. On dispatch set **Blocked on = Langston**.
★ **The board rules every step shares — Langston sets `Review`, the session moves the card, nothing automates it, and the card holds status, owner, order and the description only — are in `1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §2 (`WI-B1`).** Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT — ARCHIVED (`WI-A02`)
The word-for-word `CLAUDE.md` §2 text for this step is archived, unchanged, at `1-system-manual/_archive/WORKFLOW_SKILL_ORIGINAL_TEXT.md` (`WI-A02`; B-WORKFLOW-IMPROVE Q10, 2026-11-20). **Every rule in it is carried by the summary above;** the archive keeps the origin cases, dates and issue numbers. Read it when a rule's history matters.
