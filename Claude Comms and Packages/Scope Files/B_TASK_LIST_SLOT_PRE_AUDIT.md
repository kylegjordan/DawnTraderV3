# B-TASK-LIST-SLOT — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**change-class: non_architecture · owner CC-A · `#1009` · Phase 19, plan row 4.57**
**Scope approved by Langston at `340836b0a` with four conditions; all four applied at `40a1ae5aa`.**

---

## 0. ⛔ PREVIOUSLY STATED vs NOW — AT THE TOP, BECAUSE A NUMBER THAT MOVED IS THE MOST DECISION-BEARING THING HERE

> **PREVIOUSLY STATED (scope r1): "no slot-time trigger exists at all." NOW: FALSE at the object. REASON: `CLAUDE.md:34` states the pointer→file-read route is the PRIMARY trigger and "does NOT depend on skill auto-invocation"; §9.4 already carries that pointer in the always-loaded file. Slot time has the strongest mechanism we own.**
> **PREVIOUSLY STATED (scope r1): "the CLOSE-time half works and is out of scope." NOW: 1 of 3. REASON: measured across all three completion reports since the row landed; I had measured nothing.**
> **PREVIOUSLY STATED (scope r2): the close-time failure is "a template a session may DECLINE to reproduce." NOW: the template was reproduced FAITHFULLY from a copy that predates the row. REASON: CC-C's report carries a full two-tier ledger; only this row is absent, silently.**
> **PREVIOUSLY STATED (scope r2): CC-INFRA's 48 KB is non-conforming. NOW: STRUCK. REASON: non-conformance against a cap nobody wrote (Langston ruling).**
> **PREVIOUSLY STATED (scope r2): the task-list NAME is unratified. NOW: the NAME is ratified at `workflow-10-governance:132`, Kyle-dated 2026-09-05; only the FOLDER is unratified.**

---

# PART ONE — THE AUDIT

## 1. SOURCES READ (workflow-02's six, named)

1. **The CODE at the ref** — `scripts/governance-checker/{config,checker,poller}.mjs`, `.claude/settings.local.json`, `.claude/skills/` (13, tracked), `.github/workflows/ci.yml`, the systemd timer.
2. **RUNTIME** — the checker's timer (`OnUnitActiveSec=30min`), the live alert store, `/var/log/dt-deploy-drift.log` for how an existing check surfaces.
3. **`SYSTEM_IMPACT_MAP.md`** — searched by alternation; documents per-session MEMORY via the hook layer, **no entry for the task lists**.
4. **`SYSTEM_MANUAL.md`** — silent on session bookkeeping; correctly out of its scope (architecture/strategy/regime/filter/pipeline/maths).
5. **THE LEDGER** — `#1009`, `#1006`, `#998`, `#1005`, `#995`, plan rows 4.57/4.6, and all three completion reports since 2026-09-05.
6. **`bridge/canonical/`** — **consulted, NO coverage of session bookkeeping.** Stated because an absence here is itself a finding: this is post-governance machinery with no pre-governance ancestor.

## 2. ⛔⛔ FINDING A — **RETRACTED. I MISREAD THE CITATION, AND THE MISREAD IS WHAT ELIMINATED KYLE'S OPTION 1.**

**WHAT I WROTE:** *“slot time already has the PRIMARY mechanism — `CLAUDE.md:34` says the pointer→file-read route does not depend on auto-invocation.”*
⛔ **FALSE, AND THE ERROR IS THE ANTECEDENT.** `:34` reads *“THIS TABLE IS THE INDEX, AND IT IS THE PRIMARY TRIGGER… ⇒ rules file → READ THE STEP FILE.”* **“This table” is the §0.a ELEVEN-STEP WORKFLOW TABLE** — I read the lines immediately above it and they are steps 6-11 of that table. **The mechanism it describes is a pointer to a NAMED STEP FILE.**
★★ **§9.4's SLOT-TIME OBLIGATION HAS NO STEP FILE TO POINT AT.** §9.4 itself says the rule *“live[s] in `workflow-10-governance`'s Tier-1 ledger row, NOT here”* — and that skill is gated **`STEP 10 ONLY`**. **That is the §9.5 pattern `CLAUDE.md` names explicitly: a trigger behind a gate that excludes its own trigger conditions.**
⛔ **AND MY OWN PLAN ROW SAYS THE OPPOSITE OF WHAT I WROTE.** Row 4.57: *“the SLOT-time half has NO TRIGGER AT ALL, and it cannot live in a step skill because §9.4 fires 'with no batch and no step open'.”*
★ **HOW IT HAPPENED, RECORDED BECAUSE IT IS THE PATTERN NOT THE SLIP: Langston asserted this and I verified THE LINE SAID WHAT HE SAID — I never checked WHAT “this table” REFERRED TO.** Right line, wrong referent: `wrong-object` in its purest form, and I imported it into my own audit as a correction.
⇒ ⛔ **CONSEQUENCE: “a fourth trigger cannot fix what failed under the best trigger” DOES NOT APPLY TO THE SLOT-TIME HALF. KYLE'S OPTION 1 IS BACK ON THE TABLE FOR THAT HALF, and must be argued rather than eliminated.**

## 2a. ✅ WHAT SURVIVES THE RETRACTION — THE CLOSE-TIME EVIDENCE, WHICH IS MEASURED

| end | trigger available | outcome |
|---|---|---|
| **SLOT** | ⛔ **NONE** — §9.4 points at a `STEP 10 ONLY` skill; row 4.57 says so and I wrongly contradicted it | untested, no instrument |
| **CLOSE** | a named row INSIDE the step file you must open to do the step — **a real and strong trigger** | ⛔ **the row is present in exactly ONE report** |

⇒ **THE SURVIVING ARGUMENT IS NARROWER AND STILL DECISIVE FOR THE CLOSE-TIME HALF: there, a strong trigger existed and the outcome still failed — so a check is needed THERE.**
⚠️ **IT SAYS NOTHING ABOUT THE SLOT-TIME HALF, WHERE NO TRIGGER EXISTS AT ALL. The two halves need separate arguments and my first draft gave them one.**

## 3. ⭐⭐ FINDING B — THE MECHANISM OF THE CLOSE-TIME FAILURE, AND IT DECIDES THE REMEDY

**`B_EXIT_BOOK_AGE_STAMP_COMPLETION_REPORT.md:79-99` carries a FULL two-tier ledger** — Tier-1 table, Tier-2 table, an explicit *"judged applicable and updated"* framing. **Nothing was declined. The task-list row is simply absent, with no `N/A`.**
★ **A session writing a completion report COPIES THE LAST COMPLETION REPORT. It does not open the skill.**
⇒ **A row added to the skill reaches nobody who copies a predecessor, and the omission is invisible because the copied ledger looks complete.**
⇒ ⛔ **THE REMEDY MUST COMPARE THE PRODUCED DOCUMENT AGAINST THE CURRENT REQUIREMENT.** Nothing that only *tells* a session does this — the session was already told, by the strongest channel we have, and copied a predecessor anyway.

## 4. ⛔ ENTRY-POINT CENSUS — EVERY PLACE A CHECK COULD LIVE, ENUMERATED REPO-WIDE BEFORE CHOOSING ONE

| # | entry point | when/where | can it COMPARE doc vs requirement? | **independent of the session that erred?** |
|---|---|---|---|---|
| 1 | **`governance-checker`** | staging, **every 30 min**, reads **at the ref**, mints alerts | ✅ **ALREADY DOES** — `findEntryDoc` does `showFile(path)` then a **regex over CONTENT** | ✅ **YES — it grades the BRANCH, not a session** |
| 2 | Claude Code hooks | laptop, per-session; **arm at session start** | ✅ could | ⛔ **NO — fires only inside the session doing the writing** |
| 3 | CI (`ci.yml`) | on push | ✅ could | ✅ yes |
| 4 | Langston | on dispatch | ✅ (human-equivalent) | ⚠️ only when dispatched |

⭐⭐ **THE DISCRIMINATOR IS THE LAST COLUMN.** The close-time failure is *a session producing a document that looks complete to itself*. **A hook runs inside that same session — the one that already believes it is finished.** The checker is the only mechanism that reads the artefact **from outside the session that wrote it**, on a schedule, at the ref.
✅ **AND IT IS NOT A NEW CAPABILITY: `DOCS` already mixes `kind:'file-glob'` (does a file exist) with `kind:'entry'` (does a pattern appear INSIDE a named file).** The task-list check is a third predicate over machinery that already reads content and alerts.
⚠️ **HONEST LIMIT, STATED: the checker is a LAGGING check** — it fires within 30 minutes of the push, not at the moment of writing. **That is the right shape given `#995`:** preventive instruction was measured to fail three times; a lagging check that ALERTS is a different mechanism, not a fourth nudge.

## 5. ⚠️ FINDING C — SLOT-TIME AND CLOSE-TIME ARE THE SAME CHECK

§9.4's own mechanics require a slotted item to land in **`RUNNING_ISSUES.md`** and **the phase plan**; `workflow-10`'s row adds **the session task list**. **All three are files the checker already reads** (`running_issues` and `phase_19_plan` are existing `DOCS` entries).
⇒ **the slot-time check is a CROSS-DOCUMENT CONSISTENCY check** — an item present in one destination and absent from the others — **and it runs on the same machinery as the close-time row check.** Objectives 1 and 5 converge on one mechanism rather than two.

## 6. ⚠️ GAPS AND SILENCES FLAGGED (workflow-02: a silence in the maps is itself a finding)

- **`SYSTEM_IMPACT_MAP`** documents per-session MEMORY (via the hook layer) and **has no entry for the task lists.** ⭐ **Precedent settles the counter-argument: `B_CONDUCT_FILE_COMPLETION_REPORT.md:78` records the session-instruction hook estate getting a SIM entry precisely because it had none, "flagged as a governance gap, not quietly added."** A cross-session instruction artefact has precedent. ⇒ **entry required.**
- **`bridge/canonical/`** — consulted, no coverage. Recorded as an absence, not skipped.
- **The task-list FOLDER is unratified** (`CLAUDE.md:132` scopes `Scope Files/` to scopes, pre-audits, audit discussion docs). The NAME is ratified.

---

# PART TWO — THE IMPLEMENTATION PLAN
*Every item back-references the audit finding it falls out of. Anything with no audit treatment is flagged `UNAUDITED`.*

| # | plan item | falls out of | verification |
|---|---|---|---|
| **P1** | **TEACH THE CHECKER THE ROW.** ⛔ **THE PREDICATE'S EXACT TARGET, stated because my first criterion could be satisfied by a PROSE MENTION:** the Tier-1 table row naming all four lists with a verdict cell — the literal `the four session task lists` row shape from `workflow-10-governance:132`, **NOT** the phrase “session task list” loose in a governance-files sentence. ⛔ **AND A `2026-09-05` PREDICATE-SCOPED CUTOFF:** `ENFORCEMENT_CUTOFF_MS` is `2026-06-23`, so without one this grades every enforceable closed batch against a requirement that did not exist when it closed — **measured blast radius ≈4 immediate alerts on already-closed batches, which is the exact retroactive-grading class that cutoff exists to prevent.** ⚠️ **AND CHECK `GOV_SHADOW` ON THE BOX FIRST** — the repo unit says `GOV_SHADOW=1`, in which case “the existing alert path” is a log file, not an alert. **NEW `kind` + `docPresent` branch + its own alert copy** (the docgap wording says a doc is “absent or hollow”, wrong for a missing row). A new `DOCS`-shaped predicate: for a batch whose completion report exists, assert the report contains the four-session task-list ledger row. Absence ⇒ the existing alert path. | **Findings A, B, §4** | ⛔ **MY FIRST CRITERION WAS TOO WEAK AND THE POPULATION WAS UNDEFINED.** Corrected: **POPULATION = files whose BASENAME matches the checker's own `/COMPLETION\|COMPLETE/i` in `Batch Completion/`, for batches enforceable after the P1 cutoff.** ⚠️ **My own first population query was wrong — it matched the FOLDER name “Batch Completion”, not basenames.** **BASELINE, measured: the row is present in EXACTLY ONE report** (`B_DEPLOY_DRIFT_LINE`, mine, written after Kyle flagged it). ⛔ **A 1-positive test written by me against the same documents discriminates nothing** — so the criterion is a **SEEDED** one: inject the row into a copy of a failing report ⇒ must pass; delete the verdict cells leaving the prose mention ⇒ **must still FAIL.** |
| **P2** | ⛔ **SPLIT OUT — NOT BUILDABLE AS I WROTE IT, on three grounds I verified.** **(a) THE JOIN KEY DOES NOT EXIST:** the checker's only key is a batch-id regex, but §9.4 fires on *“anything outside the scope”* and dispositions 2/4/5 produce items with **no batch-id at all**; in the phase plan roughly a third of table rows carry no `#NNN` either. **(b) A PRESENCE TEST CANNOT ANSWER THE QUESTION:** `findEntryDoc` returns true if the token appears ANYWHERE — and `#1009` appears on four lines of `RUNNING_ISSUES.md`, mostly cross-references in other entries. ⭐ **§9.4's own words are “NAMING IS NOT PLACING”, and a presence test can only see naming — it would pass the precise defect it was built for.** **(c) IT COVERS TWO OF THREE DESTINATIONS:** the task lists are not in `DOCS`, and my Finding C's *“all three are files the checker already reads”* is **FALSE for them**. ⇒ **carried as a named follow-on, not built here.** | **Finding C, corrected** | n/a — removed from this batch's deliverables |
| **P3** | **NORMALISE THE LISTS — convention + shells only.** Inherit the ratified NAME (`CC_<X>_SESSION_TASK_LIST.md`); **CHOOSE AND JUSTIFY the folder**; create conforming shells; **each session populates its own.** | **Scope obj 3 + §6** ⛔ **RE-SCOPED TO WHAT THIS BATCH CAN DO ALONE:** the convention stated and justified, **conforming shells created**, and the requirement **posted to the crew**. ⚠️ **My first criterion (“four files at one folder”) depended on THREE OTHER SESSIONS ACTING, with no named mechanism and no owner — the batch could not have closed on its own work.** Each session populating its own list is a **named dependency**, not a deliverable of mine. |
| **P4** | **`OPEN AND STALLED` AS THE PRIMARY SECTION** of each list, plus the `SYSTEM_IMPACT_MAP` entry. | **Kyle amendment; §6 precedent** ⛔ **SAME RE-SCOPE: the SIM entry and the SHAPE definition are mine and verifiable; “each list leads with it” is a dependency on the other three sessions and is recorded as such, not as a pass condition I control.** |
| **P5** | **PRE-REGISTERED MEASUREMENT.** Baseline close-time = **1 of 3**. PASS = the next three completion reports after ship carry the row. ⛔ **FAIL = the rate does not move ⇒ the mechanism hypothesis is WRONG and the batch says so.** | **Scope §7b** | The rate, measured the same way on the same population definition. |

## ⛔ WHAT I AM *NOT* DOING, AND WHY — the rejected candidates, argued

- **A new slot-time SKILL (Kyle option 1): REJECTED.** It is a fourth trigger where three already exist and the strongest one already failed (Finding A). It also inherits `#995`.
- **A CLAUSE IN EACH STEP SKILL (Kyle option 2): REJECTED, and more sharply** — Finding B shows sessions copy the previous *report*, not the skill. **A clause inside a file nobody opens is the exact failure being fixed.**
- **A HOOK: NOT REJECTED ON MY FIRST REASON, WHICH WAS INVALID.** I wrote that it *“runs inside the session that already believes it is finished.”* ⛔ **That proves too much and the repo refutes it: `guard-push-tsc-baseline.mjs` is a `PreToolUse` hook on `git push` that REFUSES, and `guard-bare-commit.mjs` calls `process.exit(2)` to BLOCK.** A hook is deterministic code in a separate process; **the session's belief is not an input.** `CLAUDE.md` rule 25 calls one of these a *“mechanical backstop”*. **And a hook is PREVENTIVE, which the checker explicitly is not.**
  ✅ **THE SOUND OBJECTIONS ARE THE ONES I LISTED AS AFTERTHOUGHTS, and they are now the argument: hooks are PER-CLONE, ARM AT SESSION START, and the shared `MEMORY.md` already records `B-HOOK-ESTATE-VERSION` — *“other clones run the version their last session start refreshed”*.** A check that four sessions run four versions of is not one check.
  ⚠️ **STATED PLAINLY: I proposed the hook, then rejected it for the wrong reason. The estate argument is what rules it out, and it is weaker than what I first claimed — a hook remains the only PREVENTIVE candidate.**
- ⚠️ **`/skill-doctor` is NO LONGER A DEPENDENCY** — it measures skill auto-invocation, and no remedy here relies on auto-invocation. **Condition 4 is discharged by the mechanism choice, not by the instrument being granted.**

## ⛔ THE TWO CANDIDATES I ELIMINATED WITHOUT ARGUING — AND KYLE NAMED ONE OF THEM EXPLICITLY

- **CI (`ci.yml`): scores ✅/✅ in my own §4 census — identical to the checker on both columns, AND non-lagging — and I never mentioned it again.** ⛔ **That is a census-then-choose method dropping a candidate its own table scored top.** **ARGUED NOW: CI runs on push, before the merge that publishes the omission, and is estate-uniform. Against it: it gates the PUSH, and a governance omission is not a reason to refuse code — a red CI on a missing table row trains people to bypass CI, which is `workflow-05`'s own stated hazard.** ⇒ **rejected on that, not on silence.**
- ⛔⛔ **THE LANGSTON STEP-11 GATE — KYLE NAMED IT AND SAID *“Argue which; do not do both by default”*, AND MY FIRST DRAFT NEVER ARGUED IT AT ALL.** **ARGUED NOW: it is the only candidate that can judge whether an entry is TRUE rather than PRESENT** — the checker can only see that a row exists, not that its verdicts are honest. **Against it: it fires only when a batch is dispatched, so a batch that never reaches Step 11 is never checked, and it adds load to the one reviewer we cannot scale.**
★ **MY RECOMMENDATION, AND IT IS NOW A PAIR RATHER THAN A SINGLETON: the CHECKER for PRESENCE (mechanical, estate-uniform, independent of the session), and LANGSTON for TRUTH at Step 11 — which is what he already does.** ⚠️ **That is arguably “doing both”, which Kyle warned against. I am putting it up as a deliberate exception with the reason — presence and truth are different properties and no single mechanism holds both — rather than sliding into it by default.**

## ⛔ HONEST RESIDUALS

- **The checker is LAGGING** (≤30 min post-push), not preventive. Stated, and argued as correct given `#995`.
- **P2's slot-time check has no baseline** — the slot-time rate was never measured and the corpus cannot distinguish a mention from a firing. **P5 measures the close-time rate only; the slot-time claim will rest on the seeded control, not on a before/after rate.**
- **The FOLDER choice is a judgement** with no precedent either way; P3 must argue it rather than inherit CC-A's.
