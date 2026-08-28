---
name: workflow-10-governance
description: STEP 10 ONLY of the DawnTrader batch workflow - Governance Updates. Use when updating the Tier 1 and Tier 2 governance documents a batch touched, including BATCH_CATALOG, PHASE_HISTORY, SYSTEM_MANUAL, SYSTEM_IMPACT_MAP and Langston's own MEMORY file. NOT for writing the completion report, which is step 11.
---

# STEP 10 — GOVERNANCE UPDATES

**Ends when:** every applicable Tier-1 and Tier-2 document has landed its CONTENT update.

## ⛔ THE DOCUMENT SET — FULL TEXT, RELOCATED FROM `CLAUDE.md` §3 ON 2026-08-23
> **This is the authoritative list, moved here VERBATIM rather than summarised.** It lived in the always-loaded rules file and was paid for on every start and every compaction by every session — but it is consulted at exactly ONE moment, the governance turn, which is the textbook case for a skill. **`CLAUDE.md` §3 keeps only what fires OUTSIDE this step:** batch NAMING and the CHANGE-CLASS declaration (they fire when a batch is created, at Step 1) and the MEMORY-file rules (they fire at session start).

**Tier 1 — EVERY batch (no exceptions):**
- `1-system-manual/BATCH_CATALOG.md` — add the new batch entry
- `1-system-manual/PHASE_HISTORY.md` — update phase status
- `1-system-manual/PHASE_19_PLAN.md` — **⏳ TEMPORARY RULE — DURING PHASE 19 ONLY (Kyle directive 2026-06-12, reaffirmed 2026-06-13):** the running Phase-19 plan MUST be updated after EVERY Phase-19 batch AND sub-batch — update §1 status board + §5 decision log, no exceptions. Owns sequencing + live status + phase-scoped decisions (item detail stays homed in `POST_AUDIT_ROADMAP.md` §3.2). **🗑 SELF-REMOVING: delete this Tier-1 line (and Langston CLAUDE.md §14, the matching rule) at Phase-19 close — this is a temporary rule, not permanent governance.**
- `.claude/memory/MEMORY.md` — volatile state block (phase / batch / next-step) every batch
- `Claude Comms and Packages/Scope Files/BATCH_N_SCOPE.md` — written in Step 1
- `Claude Comms and Packages/Batch Completion/BATCH_N_COMPLETION_REPORT.md` — written in Step 11, includes list of governance files changed

> **Note:** `CLAUDE_CODE_PROJECT_INSTRUCTIONS.md` (CCPI) was RETIRED 2026-04-20. Role absorbed by this file + MEMORY.md + BATCH_CATALOG + PHASE_HISTORY. Historical copy preserved at `1-system-manual/_archive/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md` — do not edit, do not cite as live governance.

**Tier 2 — When applicable:**
- `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` — living plan for B78-B81 stretch (created 2026-05-07). Update BEFORE each batch (sanity-check assumptions) + AFTER (record what landed + deltas vs plan + threshold table populations).
  - **⏳ TEMPORARY (Kyle directive 2026-06-03 — while xStock calibration is in progress; REMOVE this note when calibration completes):** the bottom of `MULTI_ASSET_VTS_EXPANSION_PLAN.md` carries the **"WORKING LIST — items to reset/recalibrate for the xStock 15-MINUTE BAR switch."** REVIEW + UPDATE that tracker (status ☐/◐/☑, add newly-surfaced items) as part of **every governance batch** during the xStock calibration arc. Stop maintaining it (and delete this note + retire the list) once the calibration is done.
- `1-system-manual/SYSTEM_MANUAL.md` — architecture + math. Any change to system architecture, strategy logic, regime detection, filter design, signal pipeline, or quantitative math MUST be reflected.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — file-level dependency map. Any change adding/removing/modifying a component MUST be reflected. Consulted in Step 2 pre-audit.
- `1-system-manual/CHANGES_AND_FIXES.md` — bug/risk registry
- `1-system-manual/POST_AUDIT_ROADMAP.md` — phase-level roadmap updates
- `1-system-manual/ADJUSTMENT_FRAMEWORK.md` — parameter-adjustment governance changes
- `1-system-manual/AUTHORITY_BASELINE.md` — constitutional baseline changes
- `1-system-manual/RUNNING_ISSUES.md` — open issue tracker, update counts
- `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — when Phase 24 learnings surface (see §3.3)
- `1-system-manual/STORAGE_POLICY.md` — **canonical storage & retention policy reference (Kyle directive 2026-07-08).** The single statement of the hot/warm/cold tiers, per-table retention windows, the move-not-delete path + timing, tunable knobs, and the machinery. Update whenever a retention window / tier boundary / capture cadence / storage-machinery item changes (the System Manual + SIM carry the implementation; this file carries the policy).
- `CLAUDE.md` (this file) — stable workflow/governance/identity changes only, NOT per-batch state
- `1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md` — **the rule-narration companion. When you ADD or MATERIALLY CHANGE a rule in this file, append its backstory here in the SAME turn** (what happened, the measurement, why the rule is shaped that way). A rule without its origin gets optimised away by the next person who finds it inconvenient.
- `1-system-manual/BUILD_METHOD_PLAYBOOK.md` — **★ UPDATE WHEN THE *METHOD* CHANGES (Kyle directive 2026-07-24), NOT for project state.** Trigger: a role added/removed, a gate moved, a tool that replaced another, a rule that earned its place, or a failure that taught something generalisable to any project. **NOT a Tier-1 per-batch doc** — a playbook that tracks batch state decays into a stale second copy of the rules. **When you add a rule there, add the incident that produced it in the same edit.** It is DESCRIPTIVE (portable, role-based, for reuse elsewhere); this file stays authoritative for THIS project.
- `1-system-manual/LANGSTON_ARCHITECTURE.md` — update when the REVIEWER'S BUILD changes (model, runtime, invocation, read path, auth, his files); record what it was BEFORE and why. Not for per-batch review activity.
- `CC/Langston MEMORY.md` — volatile state every batch

## ⛔⛔ WHEN YOU REPORT THIS STEP TO KYLE: **NAME THE DOCUMENTS. ALL OF THEM. BY THEIR REAL NAMES.**

**THIS STEP’S ENTIRE DELIVERABLE IS *WHICH DOCUMENTS YOU UPDATED*.** A report that describes the ideas you wrote and not the files you wrote them into has **omitted the only checkable fact it contained.**

⚠️⚠️ **MEASURED 2026-08-26, AND IT IS WHY THIS SECTION EXISTS. A Step-10 report reached Kyle saying it had written *"the component map"* and *"the architecture manual."*** **THE WORK WAS ENTIRELY REAL** — `SYSTEM_IMPACT_MAP.md` +15 lines and `SYSTEM_MANUAL.md` +26, one commit, verifiable in thirty seconds. **But Kyle read two names we do not own, could match them to nothing, and called the whole report fantasy.** He was right to.
⚠⚠ **MY FIRST DIAGNOSIS OF THIS WAS WRONG AND KYLE CORRECTED IT — recorded because the wrong version is the more flattering one.** I reported that §2’s **file-path** ban and §3’s trading-system-scoped name-protection **"COMBINED TO REQUIRE the paraphrase."** **They did not.** *(Kyle: "a file name is not the same as a file path — calling a file by its name shouldn’t create a conflict.")* ★ **`SYSTEM_IMPACT_MAP.md` is a NAME; `1-system-manual/SYSTEM_IMPACT_MAP.md` is a PATH. §2 banned the path and NEVER banned the name. Nothing forced the paraphrase.**

⇒ **THE REAL GAP IS WEAKER AND STILL WORTH FIXING: §3 never told anyone to KEEP a document’s name, because its protection was scoped to *"a core part of the trading system."* A MISSING INSTRUCTION, NOT A CONTRADICTION.** The paraphrase was a choice the rules failed to prevent.

⚠️ **WHY THE ERROR MATTERS MORE THAN THE FIX: "the rules REQUIRED it" absolves everyone and aims the repair at the wrong place.** I inflated a gap into a defect — **inside a diagnosis Kyle had asked me for, and then broadcast it to the crew as the finding.** Same shape as over-reading his narrow remark into a general rule the day before: **substituting my reconstruction for what was actually said.**

⇒ **WRITE:** *"Updated the System Impact Map and the System Manual"* — **strip the folder, KEEP THE NAME.** A document’s name is not a file path.
⛔ **AND LIST EVERY ONE YOU TOUCHED, not the two most interesting.** The list is the RESULT, not process-narration — the *"Kyle does not want the sausage-making"* rule is about narrating your own corrections, **never about naming your deliverables.**

---

## ⛔⛔ A BATCH THAT CANNOT CLOSE YET GETS A **BATCH PROGRESS REPORT** — AND IT IS LATER *CONVERTED* INTO THE COMPLETION REPORT (Kyle directive 2026-08-26)

**THE TRIGGER, in Kyle’s own shape (2026-08-26):** *"the work has been done, the code deployed on staging, and now we’re at an observational period that’s gonna last a few weeks with a set date for it to complete, **or a set quantity of actions have completed** — and therefore that data can be reviewed and decisioned or actioned."*

⇒ **TWO WINDOW SHAPES, BOTH VALID:** a **set period** (*"four weeks"*, *"+48h"*) **or a set QUANTITY** (*"until 30 trades close"*, *"until the first post-deploy exit"*). **Name which one, and its value.**

⛔⛔ **AND THE CLOSE CONDITION IS *TWO* THINGS, NOT ONE — THIS IS THE PART THAT GETS MISSED: THE DATA MUST BE IN **AND** A DECISION OR ACTION MUST HAVE BEEN TAKEN ON IT.** Kyle: *"once the data is in and the action or the decision has been made, that’s when the batch report is finalized with what data came in and what decision or what action was taken."*
★ **A window that has merely ELAPSED does not close the batch.** Data with no decision on it is an open loop wearing a finished batch’s clothes — **the observation was run and nothing was concluded from it**, which is the whole failure the window existed to prevent.

⚠️ **THIS IS THE ONE PLACE A DATE IS LEGITIMATE (§9.4): a period whose LENGTH is the content.** *"+48h gate"*, *"14-day soak"*, *"until 30 closes accumulate"*. **The batch still gets no due date; the WINDOW gets its length.**

★ **AND THE CARD MOVES TO `Observation`** — the board column added 2026-08-27, sitting between `Governance` and `Complete`. **`Complete` is unreachable from there until the data is in AND a decision has been taken.** The card is the visible reminder; the report is the record.

**WHAT IT IS:** `Claude Comms and Packages/Batch Completion/<BATCH-ID>_PROGRESS_REPORT.md`, titled **`OPEN — <what is being waited on>`**. ★ **NOT a new invention:** `BATCH_67`, `BATCH_68` and `BATCH_73` all have one. ⚠️ **But it was NEVER GOVERNED — measured 2026-08-26: 43 occurrences of "progress report" across the corpus and EVERY governance mention is a USAGE. No definition, no trigger, no conversion rule.** Same shape as "hotfix" before 2026-08-21. **It fell out of use because nothing said to write one.**

**IT MUST CARRY THE WHOLE BATCH UP TO NOW** — a reader must not need the chat scrollback:
1. **What the batch is for**, and what shipped, with refs.
2. **Every step completed**, with its evidence — review verdicts, CI, deploy sha, verification.
3. ⛔ **THE PRE-REGISTERED CLOSE CRITERION: exactly what observation, over exactly what window, would count as PASS — and what would count as FAIL.** ★ **WRITTEN BEFORE THE DATA ARRIVES.** *(`BATCH_73`’s report carries this as "PRE-REGISTERED — do not data-mine", and it is the single most valuable thing in it: a criterion chosen AFTER seeing the window can always be made to pass.)*
4. **What is unproven, stated as unproven**, and what would falsify it.
5. **The governance files changed so far** — same naming rule as above.

**CONVERSION — when the data is in AND the decision or action has been taken:** the progress report **BECOMES** the completion report — same batch, renamed to `<BATCH-ID>_COMPLETION_REPORT.md`, recording **BOTH halves explicitly:**
1. **WHAT DATA CAME IN** — the observation’s actual result, set **against the criterion the report pre-registered** (quote the criterion as written, then the outcome).
2. **WHAT DECISION OR ACTION WAS TAKEN ON IT** — and by whom. ⛔ **A completion report that states the data and not the decision has not closed the loop.**
Then complete the objectives table and the governance-files list. ⛔ **You do not write a fresh report from memory** — the whole point is that the evidence was captured while it was fresh.
⛔⛔ **BEFORE THAT — HOW THIS SITS WITH THE ALERT-GATED CLOSURE WE ALREADY USE. THEY COMPOSE; NEITHER REPLACES THE OTHER (Langston condition 1, 2026-08-27).**

⚠️ **THIS RULE AS FIRST WRITTEN WOULD HAVE RETROSPECTIVELY MIS-CLOSED BATCHES HE HAD ALREADY RATIFIED.** Measured counterexamples at the ref: **`P19-B8.5l` CLOSED 2026-07-27** with OBJ-3’s fence deferred to a named alert · **`B-MBIM-SWITCH-ON` CLOSED 2026-08-24** with the retention flip still armed · and two alerts live right now carrying owned exit criteria. **Under the bare text, every one of those was closed wrongly. They were not.**

★ **THE DISPOSITION: THE SELF-RESCHEDULING ALERT IS THE WINDOW’S *TIMER*; THE PROGRESS REPORT IS ITS *RECORD*.** One fires; the other remembers. ⇒ **A batch may close with a genuinely deferred item PROVIDED the alert carries the criterion and the result is written back when it fires.** ★ **And that supplies the mechanism the sentence below otherwise lacks** — *"it must never quietly wait forever"* is a wish until something re-fires on its own.
⛔ **PROSPECTIVE ONLY. This does not reopen a single closed batch.**

⛔ **AND THE BATCH IS NOT CLOSED UNTIL THAT CONVERSION HAPPENS.** A progress report is an OPEN state. The delivery-board card stays out of `Complete`, and the `RUNNING_ISSUES` entry stays open.
⚠️ **IF THE OBSERVATION FAILS ITS CRITERION, THAT IS A RESULT, NOT A DELAY** — it converts to a completion report recording the failure and what follows, or the batch reopens at the step that needs redoing. **It must never quietly wait forever.**

---

**Rule:** every completion report lists which governance files were changed. If SIM or System Manual were applicable but not updated, batch not complete.

### 3.3 Asset-class onboarding learning-capture rule (ad-hoc since 2026-06-08)

When a substantive asset-class-onboarding learning surfaces in ANY batch, fold it into `ASSET_CLASS_ONBOARDING_WORKFLOW.md` (the SSOT playbook: Part 1 step sequence, Part 2 the `R-*` reference library, Part 3 worked example) in the same governance turn, and note it in that batch's completion report. No mandatory per-batch section — add a learning only when one genuinely emerged. Four lenses frame a good capture: (a) what worked well, (b) what surprised us, (c) recurring structural patterns, (d) the concrete doc edit applied. (Was a time-bounded Phase-24 mandatory rule 2026-05-20 → 2026-06-08; see history doc §3.3.)

---

## ⛔⛔ THE TIER LEDGER — A TABLE YOU FILL IN, NOT A LIST YOU READ (Kyle directive 2026-08-28)

⛔⛔ **KYLE'S COMPLAINT, AND IT IS ABOUT DOING, NOT REPORTING: *"there's this habit of only one or two being updated now, and the other tiers are being ignored."***

★★ **THE STRUCTURAL CAUSE, NAMED — THE NAMING RULE ABOVE FIRES AT *REPORT* TIME, AND THE FAILURE HAPPENS AT *WORK* TIME.** Its heading is *"WHEN YOU REPORT THIS STEP TO KYLE"*. ⇒ **a session that updated two documents and names both has FULLY COMPLIED with it.** ⛔ **It catches under-REPORTING. It cannot catch under-UPDATING, which is the actual habit.**
★★ **AND TIER 2 HAD NO SLOT.** *"Apply the judgement OUT LOUD and write it down"* is a **discipline**, not a **format** — so it degrades into a paragraph nobody writes. ✅ **Contrast the §9.4 disposition line, which works for exactly one reason: IT IS A SLOT YOU CANNOT LEAVE BLANK.** ⇒ **the same fix, applied here.**

⛔⛔ **AND IT GOES IN THE REPORT KYLE RECEIVES — IT IS NOT A PRIVATE WORKING NOTE (Kyle directive 2026-08-28).** ★ **His reason, and it is the design: *"if there are only two updates, then I know something is probably wrong and can call it out."*** ⇒ **the table is FOR SCANNING. He reads the SHAPE of the column, not the entries.**
★★ **AND THE SECOND HALF OF HIS REASON IS THE REAL ONE: *"it gets them in the habit of looking at every file in our tiered governance system — and sometimes just looking at something reminds you that you need to do something."*** ⇒ **the table's job is to put all 20 names in front of you. The verdict column is the by-product; the ENUMERATION is the point.**

⛔ **POST IT WHOLE. EVERY ROW, EVERY BATCH — including the `N/A`s.** ⚠️ **A table with the `N/A` rows deleted defeats it entirely: a short list is exactly what it exists to make visible.**
⛔ **VERDICT ONLY — `✅` or `N/A`. NOT what the update was** (Kyle: *"not what the update was, but whether or not it was updated"*). **The substance is in the documents; this is an index.**

```
GOVERNANCE LEDGER — <batch-id>
TIER 1 (unconditional)          TIER 2 (judged, every row)
  BATCH_CATALOG            ✅     SYSTEM_MANUAL              ✅ / N/A
  PHASE_HISTORY            ✅     SYSTEM_IMPACT_MAP          ✅ / N/A
  PHASE_19_PLAN            ✅     RUNNING_ISSUES             ✅ / N/A
  MEMORY (shared + own)    ✅     CHANGES_AND_FIXES          ✅ / N/A
  the batch SCOPE          ✅     POST_AUDIT_ROADMAP         ✅ / N/A
  the COMPLETION REPORT    ✅     ADJUSTMENT_FRAMEWORK       ✅ / N/A
                                  AUTHORITY_BASELINE         ✅ / N/A
                                  STORAGE_POLICY             ✅ / N/A
                                  MULTI_ASSET_VTS_PLAN       ✅ / N/A
                                  ASSET_CLASS_ONBOARDING     ✅ / N/A
                                  BUILD_METHOD_PLAYBOOK      ✅ / N/A
                                  LANGSTON_ARCHITECTURE      ✅ / N/A
                                  CLAUDE.md / CONDUCT.md     ✅ / N/A
                                  CLAUDE_MD_RULE_HISTORY     ✅ / N/A
                                  Langston's MEMORY          ✅ / N/A
```
**WHEN A TIER-2 ROW APPLIES — the triggers, so applicability is decided from a list and not from memory:** `SYSTEM_MANUAL` = architecture · strategy · regime · filter · signal pipeline · math · `SYSTEM_IMPACT_MAP` = any component added/removed/re-keyed, or cross-cutting state · `RUNNING_ISSUES` = issues opened/closed/annotated · `CHANGES_AND_FIXES` = bug or risk registry · `POST_AUDIT_ROADMAP` = phase-level change · `ADJUSTMENT_FRAMEWORK` = parameter-adjustment governance · `AUTHORITY_BASELINE` = constitutional change · `STORAGE_POLICY` = retention or tiering · `MULTI_ASSET_VTS_PLAN` = B78-B81 stretch · `ASSET_CLASS_ONBOARDING` = Phase-24 learnings (§3.3) · `BUILD_METHOD_PLAYBOOK` = the METHOD changed (a role, a gate, a rule that earned its place) · `LANGSTON_ARCHITECTURE` = the REVIEWER'S BUILD changed · `CLAUDE.md`/`CONDUCT.md` = a stable rule changed, **NOT per-batch state** · `CLAUDE_MD_RULE_HISTORY` = **mandatory in the SAME turn as any `CLAUDE.md` rule change** · Langston's `MEMORY` = §10.b, same turn as your own.

⇒ ✅ **THE POSTED TABLE IS THIS STEP'S DELIVERABLE, and it is what the completion report's governance-files-changed list is COPIED FROM.**

⚠️ **IT IS AN EXPRESS EXCEPTION TO `CONDUCT.md` §6's *"two or three sentences, all plain language"* — STATED HERE BECAUSE THE COLLISION WOULD OTHERWISE PRODUCE THE EXACT BEHAVIOUR THIS SECTION EXISTS TO STOP.** A session obeying §6 literally would compress twenty rows to *"updated the usual governance docs"*, which is the habit Kyle is describing. ★ **§6 governs the PROSE; this table is an INDEX, and §3 already requires our documents be called by their real names.** ⇒ **post the table AND the three-part body; the table does not replace them.**
⛔⛔ **DO NOT WRITE THAT LIST FROM WHAT YOU REMEMBER DOING.** ★ **That is the second half of the same defect: the report is written by the session, from its own recollection, so the checklist and the report are never compared and a skipped tier is invisible in both.**
⚠️ **`N/A` IS A REAL ANSWER AND IS OFTEN CORRECT — a display-only change is SIM-scope, not System-Manual-scope.** ⛔ **But it is an ANSWER, so it is written down. Silence is not `N/A`.**
⚠️ **HONEST LIMIT: nothing enforces this table.** The governance checker grades the doc-set at close against the declared change-class, but **its `DOCS` table has no `CLAUDE.md` / `CONDUCT.md` entry, and per `#754` it cannot see a batch at all until the completion report first-adds.** ⇒ **this is a format that makes the omission VISIBLE, not a gate that prevents it.**

## ⛔ THE ANTI-PATTERNS
- **"I'll update governance after the deploy."** No. Deferred governance becomes forgotten governance.
- **"We reorganised that doc recently so it must be current."** **Reorganising is not updating.** A TOC add, a history-archive move, a consolidation — none of them discharge the obligation to record THIS batch's change.
- **Skipping by default.** Use judgement on applicability — a display/data-quality service is SIM-scope, not System-Manual-scope — **but apply the judgement OUT LOUD and write it down.**

## 10.b — LANGSTON'S MEMORY
Sync `/home/langston/MEMORY.md` in the same turn you update your own: batch closure, sequencing changes, operational invariants. **His MEMORY auto-loads every invocation — stale memory means a wrong baseline at the next review.** Keep it ≤200 lines.

## ⛔⛔ IF A DOCUMENT STATES A NUMBER, CHECK IT AGAINST THE LIVE VALUE
**A governance document that asserts a constant, a threshold, a window size or a count is making a CLAIM ABOUT THE RUNNING SYSTEM — and it goes stale SILENTLY, because nothing compares the two.**
**MEASURED 2026-08-21:** `SYSTEM_MANUAL.md` ch.12 **and** `POST_AUDIT_ROADMAP.md` both state that the AMR's EV-gap window warms at **"30 obs/class."** The live value for crypto is **100**. Consequence: the AMR activation checklist item requiring *EV-gap window warm (30 obs/class)* is **UNSATISFIABLE AS WRITTEN** — and nobody noticed, because the document reads perfectly plausibly.
⇒ **When your batch touches a component, re-read every NUMBER the governance docs state about it and confirm each against the live value.** On divergence: **fix the doc, or fix the value, and say which** — never leave both standing. **A rule that a document and a database disagree about is not a rule.**


## ⛔ BEFORE THIS STEP LEAVES YOUR HANDS — REVIEW IT THE WAY LANGSTON WOULD
**Against the OBJECT, not your memory** (`CONDUCT.md` §6b — the full mechanism and why it is positional rather than clever). Before claiming a document updated: **re-open it and confirm the CONTENT changed** — not that you opened it, not that you meant to. And re-check any NUMBER it states against the live value.
✅ **Fix what you find and move on.** In-task corrections belong in the commit message, **never in a report to Kyle.**

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
Move the card to **`Governance`**.
★ **LANGSTON SETS THE `Review` FIELD; THE SESSION MOVES THE CARD.** *(Kyle’s wording, 2026-08-24.)* ⛔ **His approval is NOT the move** — he sets `Review = Approved`, then YOU move it and update `Blocked on`. If approval also moved the card the board would freeze every time he is mid-review, at FOUR gates per batch.
⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

10. **Governance Updates** — Update ALL applicable Tier 1 + Tier 2 docs (see §3). If batch touched architecture/math → update SYSTEM_MANUAL.md. If batch touched components → update SYSTEM_IMPACT_MAP.md. Failing to update either when applicable = incomplete batch.

    **MANDATORY 10.b — Langston memory sync (Kyle directive 2026-05-07):** at the same time you update your own MEMORY.md, also update Langston's `/home/langston/MEMORY.md` on Hetzner with the batch closure block + sequencing changes + operational invariants. Langston's MEMORY auto-loads every `claude -p` invocation; stale MEMORY → wrong baseline at next review. Mirror your MEMORY structure (state block, recent-batch row, sequencing update, open-issue diff). Keep ≤200 lines. Sync via:

    ```bash
    cat > /tmp/langston_memory.md <<'EOF'
    [paste new MEMORY content]
    EOF
    scp /tmp/langston_memory.md root@204.168.141.77:/tmp/langston_memory.md
    ssh root@204.168.141.77 'sudo -u langston cp /tmp/langston_memory.md /home/langston/MEMORY.md && wc -l /home/langston/MEMORY.md'
    ```

    Update `/home/langston/CLAUDE.md` only when comms protocol or his persona changes (rare). **Repo-side docs reach Langston off the REVIEW BRANCH — so a doc he needs must be pushed, not merely saved** (`LANGSTON_ARCHITECTURE.md` §6).
