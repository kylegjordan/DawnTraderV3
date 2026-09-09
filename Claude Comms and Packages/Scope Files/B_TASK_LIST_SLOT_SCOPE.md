# B-TASK-LIST-SLOT — SCOPE

**change-class: non_architecture**
**owner: CC-A · issue `#1009` (filed as `#1006`, renumbered on collision with CC-B's `#1006`) · Phase 19, plan row 4.57**
**READY AT: `<ref on dispatch>`**

> **KYLE-DIRECTED 2026-09-05, and he fixed its position himself after reading the queue:** *"let's do the deploy drift line as you suggested… and then I would say that we go to the b task list slot next, because this is something I'm dealing with with each of the sessions and it needs to be cleaned up."* `B-DEPLOY-DRIFT-LINE` closed 2026-09-09, so that condition is met.

---

## 0. THE ONE-SENTENCE PROBLEM

**The rule is exactly half-wired: the CLOSE-time half has a slot that cannot be left blank, and the SLOT-time half has no trigger at all** — so work gets *started* invisibly, which is the failure Kyle actually complained about.

---

## 1. ⛔ DOES IT ALREADY EXIST? — CHECKED, AND IT DOES NOT

**Capability, not name** (`CONDUCT.md`: use what exists before proposing new code). Enumerated `.claude/skills/` at the ref: **13 skills — the eleven workflow steps, `workflow-hotfix`, and `bug-investigation`.** Every one is either **step-gated** (`STEP N ONLY` in its own frontmatter) or fires on a **different trigger** (finding a suspected defect).
⇒ ✅ **NO SLOT-TIME SKILL EXISTS.** Nothing to reuse; this is genuinely absent, not merely un-found.

**And the ledger check (§9.5(b-ii)) — was this already decided?** Yes, and *that is the point rather than a reason to stop*: it was decided by Kyle on 2026-09-05 and **deliberately left half-built**, with the missing half filed as this issue. The decision is not being re-litigated; the unbuilt half is being built.

---

## 2. ⛔⛔ THE ARCHITECTURAL FINDING — VERIFIED AT THE OBJECT, AND IT IS THE REASON THE BATCH EXISTS

| what | where | verified |
|---|---|---|
| the slot-time rule's pointer | `CLAUDE.md:539`, inside **§9.4** | §9.4's own trigger text: it fires *"the moment you find the thing"*, which **"can happen with no batch and no step open"** |
| what it points AT | `workflow-10-governance`'s Tier-1 ledger row | that skill's own frontmatter: **`STEP 10 ONLY`** |

⇒ ⛔ **A RULE THAT FIRES WITH NO STEP OPEN IS POINTED AT A SKILL THAT DECLARES ITSELF STEP-10-ONLY.** A session slotting a new item mid-batch — or with nothing open at all — is directed to a document gated against the moment it is needed.
★ **THIS IS NOT A NEW ARGUMENT; IT IS §9.5's, ONE SECTION OVER.** `CLAUDE.md` §9.5 keeps its own trigger in the always-loaded file for exactly this reason, stating that burying it in `workflow-02` *"would put the rule behind the exact gate that excludes two of its three triggers — and it would READ AS COVERED."* **The same defect now exists at §9.4, and the precedent for the fix is already written down.**

---

## 3. ⭐ THE MEASUREMENT — RE-TAKEN 2026-09-09 AT THE REF, NOT QUOTED FROM 09-05

**Object: every file matching `TASK_LIST` in `git ls-tree -r origin/migration/aws-supabase`. Population: all four sessions. Sizes from the object store (`git show <ref>:<path>`), one surface, named.** *(One unrelated match excluded: `attached_assets/…Replit…task-list….txt`, a 2025 UI hand-off.)*

| session | location | bytes | state |
|---|---|---|---|
| **CC-A** | `Claude Comms and Packages/Scope Files/CC_A_SESSION_TASK_LIST.md` | **28,084** | conforming location + name |
| **CC-INFRA** | same folder, `CC_INFRA_SESSION_TASK_LIST.md` | **48,082** | conforming location; **~1.7× CC-A** |
| **CC-B** | `1-system-manual/CLAUDE_NEW_PHASE_19_TASK_LIST.md` | **17,079** | ⛔ **wrong folder AND a phase-scoped name** — it expires when Phase 19 does |
| **CC-C** | — | — | ⛔ **NONE** |

✅ **CONTROL: the same search returns 1 for `CC_A_SESSION_TASK_LIST`, so the zero for CC-C is a real absence, not a broken instrument.**
⇒ **THE 2026-09-05 FINDING HOLDS UNCHANGED FOUR DAYS LATER.** Nothing self-corrected; **stated as a re-measurement, not a repetition.**
⚠️ **NEW, and not in the 09-05 record: there is no stated SIZE convention for these files at all.** "Non-conforming, 48 KB" was a judgement against a cap that does not exist in writing. **Objective 3 must either state one or stop calling size non-conformance.**

---

## 4. ⛔ PROVENANCE (§9.5(b) / MANDATORY 1.b) — QUOTED, NOT SUMMARISED

**Corpora searched:** `PHASE_19_PLAN.md` row 4.57 · `RUNNING_ISSUES` `#1009`/`#1006`/`#998`/`#1005` · `workflow-10-governance` · `CLAUDE.md` §9.4/§9.5 · `git log -S "SESSION_TASK_LIST"` (not path-limited).

**TIER 1 — the rule itself. Introducing commit `357273a17`, verbatim:**
> *"Every session keeps its own task list holding the batches assigned to it, the sub-batches already identified, the hotfixes, and the findings still to investigate, IN THE ORDER THEY WILL BE WORKED. Two unconditional triggers: every batch close, and every time a new item is decided and slotted."*
> *"His reason is a coordination failure, not a tidiness one: 'we keep losing track of which session is working on which batches, and what order they need to work on those things in.'"*
> ⭐ *"THE PLAN IS THE AUTHORITY AND THE LIST IS THE INDEX — derive the list from the plan, and when they disagree the LIST is stale, not the plan."*

**TIER 1 — the relocation. Commit `bfdd1197f`, verbatim, Kyle's own words inside it:**
> *"I don't think that this becomes a new rule. I think this gets added into each of the skills files for the steps in the workflow. Or maybe it is its own skill file - anytime a session has to create or slot in a new task, whether it be a batch, a sub-batch, investigation, or hotfix, that skill is triggered."*
> *"SLOT-TIME half: NO TRIGGER EXISTS. §9.4 fires the moment you find the thing, which by its own text can happen with no batch and no step open. A step skill therefore cannot carry it - the same argument that pins §9.5's trigger in CLAUDE.md rather than inside workflow-02."*

**DISPOSITION (of the five): (2) RELEVANT BUT NEEDS UPDATING TO TODAY'S INTENT.** The close-time half works as designed and is not touched. The slot-time half was **specified and never built**; this batch builds it. ⛔ **NOT disposition (1)** — nothing here is "still correct as-is", because half of it does not exist.

---

## 5. ⚠️ GOVERNANCE GAP FOUND WHILE READING (workflow-01: silence in the maps is itself a finding)

**`SYSTEM_IMPACT_MAP.md` contains ZERO mentions of the session task lists** — control: `Hook Layer` returns 1 in the same file, so the search works. Four per-session documents, each a second ordering of the plan, and the map that exists to record cross-cutting state does not know they exist. **Folded into objective 4.**

---

## 6. OBJECTIVES — each with what would count as done

| # | objective | verification criterion |
|---|---|---|
| **1** | ⛔ **DECIDE skill-vs-step-skills AND SAY WHY.** Kyle named both options; §9.4's trigger fires with no step open, which is evidence for one of them. | The pre-audit states the choice **with the trigger analysis as its argument**, not a preference. ⛔ **Do not add rule text to `CLAUDE.md`** — Kyle struck a six-line version the same morning; `#998` is the reason. The existing two-line pointer stays. |
| **2** | **BUILD IT.** A slot-time trigger covering batch · sub-batch · investigation · hotfix. | The artefact exists, and a session slotting an item **with no batch and no step open** reaches it. **Demonstrated on a real slot, not asserted.** |
| **3** | **NORMALISE the four lists to one shape and location.** | All four at one location under one naming convention; CC-C's created; CC-B's moved off its phase-scoped name. ⭐ **AND either a stated size/shape convention or an explicit finding that none is needed** — §3 shows the current judgement rests on an unwritten cap. |
| **4** | ⭐ **THE PRIMARY SECTION IS *OPEN AND STALLED*, NOT THE QUEUE** (Kyle amendment 2026-09-05). Every batch the session opened and did not close, the step it stalled at, and what it waits on. | Each list leads with that section. **CC-A had FOUR such batches, invisible until 2026-09-05** — the format must make that visible without anyone hunting. Plus the `SYSTEM_IMPACT_MAP` entry from §5. |
| **5** | ⛔ **CLOSE THE REVIEW GAP — ARGUE WHICH, DO NOT DO BOTH.** `workflow-10` has no review gate and the governance checker's `DOCS` table cannot see the task lists. Option A: teach the checker the three-destination rule. Option B: make the filled ledger a named Step-11 item Langston must rule on. | The pre-audit **argues one and says why the other was rejected.** ⚠️ Doing both by default is the failure the objective names. |

---

## 7. ⛔ THE HAZARD THIS BATCH MUST NOT CREATE — NAMED IN THE ORIGINAL RULE

**A per-session list is a SECOND ORDERING of the same work, and two sources of truth drifting is this project's most expensive recurring failure.** The rule already answers it — **the plan is the authority, the list is the index; when they disagree the LIST is stale** — and any mechanism built here must preserve that, not quietly invert it by making the list easier to update than the plan.

## 8. HONEST LIMITS OF THIS SCOPE

- **It does not touch the close-time half.** That works and is out of scope.
- **It cannot verify objective 2 by inspection.** A trigger that "exists" is the thing this batch is fixing — the close-time half exists too, and the slot-time half being *specified* is exactly why it read as covered. **Verification must be a real slot, observed.**
- **`#998`'s failure condition applies to this batch too:** if the answer to objective 1 turns out to be "another instruction", `B-WAKE-QUIET`'s measured result says it will not fire. That is an argument the pre-audit has to survive, not one it may skip.
