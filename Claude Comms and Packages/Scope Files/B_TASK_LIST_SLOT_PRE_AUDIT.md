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

## 2. ⭐ FINDING A — THE FAILURE IS NOT A MISSING TRIGGER, AND THE EVIDENCE IS AT BOTH ENDS

| end | trigger available | outcome |
|---|---|---|
| **SLOT** | the **PRIMARY** mechanism: `CLAUDE.md` §9.4 pointer in the always-loaded file → ordinary file read (`:34`) | untested — no instrument |
| **CLOSE** | **stronger still**: a named row INSIDE the step file you must open to do the step | ⛔ **1 of 3** |

⇒ **A fourth trigger cannot fix an outcome that already failed under the best trigger available.** Every remedy below is therefore ranked as a **CHECK**.

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
| **P1** | **TEACH THE CHECKER THE ROW.** A new `DOCS`-shaped predicate: for a batch whose completion report exists, assert the report contains the four-session task-list ledger row. Absence ⇒ the existing alert path. | **Findings A, B, §4** | Re-run against the three 2026-09-05→09 reports: it must flag **exactly the two** that lack the row and pass the one that has it. **A predicate that flags all three or none is not discriminating.** |
| **P2** | **THE CROSS-DESTINATION CONSISTENCY CHECK.** An item in the phase plan with no `RUNNING_ISSUES` entry, or vice versa, raises. | **Finding C** | Seeded positive control: a known-consistent item passes, a deliberately half-slotted one raises. |
| **P3** | **NORMALISE THE LISTS — convention + shells only.** Inherit the ratified NAME (`CC_<X>_SESSION_TASK_LIST.md`); **CHOOSE AND JUSTIFY the folder**; create conforming shells; **each session populates its own.** | **Scope obj 3 + §6** | Four files at one folder under the ratified name. ⛔ **CC-B's move is posted to the crew; CC-B renames their own file. I do not touch it.** |
| **P4** | **`OPEN AND STALLED` AS THE PRIMARY SECTION** of each list, plus the `SYSTEM_IMPACT_MAP` entry. | **Kyle amendment; §6 precedent** | Each list leads with it; SIM entry present. |
| **P5** | **PRE-REGISTERED MEASUREMENT.** Baseline close-time = **1 of 3**. PASS = the next three completion reports after ship carry the row. ⛔ **FAIL = the rate does not move ⇒ the mechanism hypothesis is WRONG and the batch says so.** | **Scope §7b** | The rate, measured the same way on the same population definition. |

## ⛔ WHAT I AM *NOT* DOING, AND WHY — the rejected candidates, argued

- **A new slot-time SKILL (Kyle option 1): REJECTED.** It is a fourth trigger where three already exist and the strongest one already failed (Finding A). It also inherits `#995`.
- **A CLAUSE IN EACH STEP SKILL (Kyle option 2): REJECTED, and more sharply** — Finding B shows sessions copy the previous *report*, not the skill. **A clause inside a file nobody opens is the exact failure being fixed.**
- **A FILE-WRITE HOOK (the third option I raised): REJECTED, on the audit's own discriminator** — it runs **inside the session that already believes it is finished** (§4, last column). ⚠️ **I proposed this one; the census is what rules it out, not preference.** It also arms only at session start and is per-clone.
- ⚠️ **`/skill-doctor` is NO LONGER A DEPENDENCY** — it measures skill auto-invocation, and no remedy here relies on auto-invocation. **Condition 4 is discharged by the mechanism choice, not by the instrument being granted.**

## ⛔ HONEST RESIDUALS

- **The checker is LAGGING** (≤30 min post-push), not preventive. Stated, and argued as correct given `#995`.
- **P2's slot-time check has no baseline** — the slot-time rate was never measured and the corpus cannot distinguish a mention from a firing. **P5 measures the close-time rate only; the slot-time claim will rest on the seeded control, not on a before/after rate.**
- **The FOLDER choice is a judgement** with no precedent either way; P3 must argue it rather than inherit CC-A's.
