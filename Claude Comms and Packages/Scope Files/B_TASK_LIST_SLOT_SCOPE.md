# B-TASK-LIST-SLOT — SCOPE

**change-class: non_architecture**
**owner: CC-A · issue `#1009` (filed as `#1006`, renumbered on collision with CC-B's `#1006`) · Phase 19, plan row 4.57**
**READY AT: `<ref on dispatch>`**

> **KYLE-DIRECTED 2026-09-05, and he fixed its position himself after reading the queue:** *"let's do the deploy drift line as you suggested… and then I would say that we go to the b task list slot next, because this is something I'm dealing with with each of the sessions and it needs to be cleaned up."* `B-DEPLOY-DRIFT-LINE` closed 2026-09-09, so that condition is met.

---

## 0. THE ONE-SENTENCE PROBLEM

**The rule is half-wired at BOTH ends, and I asserted otherwise without measuring.**
- **SLOT-time: no trigger exists at all.** (§2)
- ⛔⛔ **CLOSE-time: the slot IS being left blank, and my first draft called it working.** (§2b — measured, 1 of 3.)
★ **So the failure Kyle complained about — work started and left “flapping in the wind” — is not covered at either end.**

---

## 1. ⛔ DOES IT ALREADY EXIST? — CHECKED, AND IT DOES NOT

**Capability, not name** (`CONDUCT.md`: use what exists before proposing new code).
⚠️ **MY FIRST PASS ENUMERATED `.claude/skills/` IN ONE CLONE, AND A FRESH READER WAS RIGHT THAT A DIRECTORY IS NOT THE ESTATE** — this project has already measured a heterogeneous skill/hook estate across the four clones, and user-level or plugin skills never appear in a project-dir listing.
✅ **RE-DONE AGAINST THE AUTHORITY: the LIVE SKILL LISTING the session is actually offered**, which is strictly larger than any directory. It carries the **13 project skills** (the eleven workflow steps, `workflow-hotfix`, `bug-investigation`) plus the Anthropic/tooling set (`artifact-*`, `dataviz`, `code-review`, `schedule`, `loop`, `run`, `init`, …). **Not one of them fires when a session DECIDES AND SLOTS a new piece of work**: every project skill is either step-gated by its own frontmatter or triggered by finding a suspected defect, and the tooling set is unrelated to governance.
⇒ ✅ **NO SLOT-TIME SKILL EXISTS — established against the invocable set, not a folder.**
⚠️ **I SHIPPED A RESIDUAL THAT WAS CLOSABLE IN ONE COMMAND, AND A READER CLOSED IT FOR ME: `.claude/skills/` IS TRACKED IN GIT**, so the skill estate is uniform across the four clones **by construction**, not by luck. **Residual struck rather than carried.**
⛔ **THE ESTATE RISK THAT DOES SURVIVE, and it only matters if the answer is a hook: `settings.local.json` is tracked, but hooks ARM AT SESSION START (rule 22).** So a hook remedy is live per-session on RESTART, not on merge — and shared `MEMORY.md` already records exactly this heterogeneity for the hook estate. **That belongs in objective 2's demonstration plan.**

**And the ledger check (§9.5(b-ii)) — was this already decided?** Yes, and *that is the point rather than a reason to stop*: it was decided by Kyle on 2026-09-05 and **deliberately left half-built**, with the missing half filed as this issue. The decision is not being re-litigated; the unbuilt half is being built.

---

## 2. ⛔⛔ THE ARCHITECTURAL FINDING — VERIFIED AT THE OBJECT, AND IT IS THE REASON THE BATCH EXISTS

| what | where | verified |
|---|---|---|
| the slot-time rule's pointer | `CLAUDE.md:539`, inside **§9.4** | §9.4's own trigger text: it fires *"the moment you find the thing"*, which **"can happen with no batch and no step open"** |
| what it points AT | `workflow-10-governance`'s Tier-1 ledger row | that skill's own frontmatter: **`STEP 10 ONLY`** |

⇒ ⛔ **A RULE THAT FIRES WITH NO STEP OPEN IS POINTED AT A SKILL THAT DECLARES ITSELF STEP-10-ONLY.**
⚠️ **PRECISION THE FIRST DRAFT LACKED, and a fresh reader was right to force it: the frontmatter gates AUTO-INVOCATION, it does not forbid access.** A session can still read the file or call the skill explicitly. **So the defect is NOT “the document cannot be reached”.**
★ **IT IS THIS: the mechanism being relied upon at slot time is AUTO-INVOCATION, and this project has already measured that leg as a COIN FLIP** (`CLAUDE.md` §0.a: *“the backup leg is a COIN FLIP and is never relied on”*) — **worst precisely where a skill overlaps trained behaviour.** A description that says `STEP 10 ONLY` is a signal AGAINST firing at slot time, on a leg that is unreliable even when the signal points the right way. **The rule therefore rests on the weakest mechanism available, pointed the wrong way.**
★ **THIS IS NOT A NEW ARGUMENT; IT IS §9.5's, ONE SECTION OVER.** `CLAUDE.md` §9.5 keeps its own trigger in the always-loaded file for exactly this reason, stating that burying it in `workflow-02` *"would put the rule behind the exact gate that excludes two of its three triggers — and it would READ AS COVERED."* **The same defect now exists at §9.4, and the precedent for the fix is already written down.**

---

## 2b. ⛔⛔ THE CLOSE-TIME HALF DOES NOT WORK EITHER — MY OWN PREMISE, FALSIFIED BY MEASUREMENT

**My first draft said *“the CLOSE-time half has a slot that cannot be left blank”* and put it out of scope. A fresh reader asked what I had measured. The answer was NOTHING.**

**Object: every completion report added since the Tier-1 row landed (`bfdd1197f`, 2026-09-05). Population: 3 — all of them, not a sample.**

| report | owner | ledger row present | `N/A` rows |
|---|---|---|---|
| `B_EXIT_BOOK_AGE_STAMP_COMPLETION_REPORT.md` | **CC-C** | **0** | **0** — no tier ledger at all |
| `B_DRIFT_RUNTIME_PREDICATE_COMPLETION_REPORT.md` | CC-A | 1 | **0** — prose sentence, no table |
| `B_DEPLOY_DRIFT_LINE_COMPLETION_REPORT.md` | CC-A | 2 | 7 — the actual table |

✅ **CONTROL: the same greps return 1 and 2 on the other two reports, so CC-C's zero is a real absence.**
⇒ ⛔ **ONE OF THREE.** And **the session that omitted it entirely is CC-C — the same session this scope measures as having NO task list.** The row did not catch that.
★★ **AND THE ONE REPORT THAT DOES CARRY IT IS THE ONE I WROTE TODAY, AFTER KYLE TOLD ME IT WAS MISSING FROM MY REPORT TO HIM.** **Even my own compliance was produced by Kyle noticing, not by the slot.** That is the strongest single piece of evidence in this scope and it is evidence against my own draft.

⇒ **THE MECHANISM IS NOT “a slot that cannot be left blank”. It is a TEMPLATE A SESSION MAY DECLINE TO REPRODUCE, and nothing checks that it was reproduced.** The governance checker's `DOCS` table grades whether DOCUMENTS exist; it has no entry for a report SECTION. **A slot you can leave blank by deleting the form is the `#1005` shape, not the fix for it.**
⚠️ **HONEST LIMIT: n=3, and two were progress reports converted later.** Small — but it is three of three, and the scope previously asserted the opposite from zero.

---

## 3. ⭐ THE MEASUREMENT — RE-TAKEN 2026-09-09 AT THE REF, NOT QUOTED FROM 09-05

**Object: every file matching `TASK_LIST` in `git ls-tree -r origin/migration/aws-supabase`. Population: all four sessions. Sizes from the object store (`git show <ref>:<path>`), one surface, named.** *(One unrelated match excluded: `attached_assets/…Replit…task-list….txt`, a 2025 UI hand-off.)*

| session | location | bytes | state |
|---|---|---|---|
| **CC-A** | `Claude Comms and Packages/Scope Files/CC_A_SESSION_TASK_LIST.md` | **28,084** | conforming location + name |
| **CC-INFRA** | same folder, `CC_INFRA_SESSION_TASK_LIST.md` | **48,082** | conforming location; **~1.7× CC-A** |
| **CC-B** | `1-system-manual/CLAUDE_NEW_PHASE_19_TASK_LIST.md` | **17,079** | ⛔ **wrong folder AND a phase-scoped name** — it expires when Phase 19 does |
| **CC-C** | — | — | ⛔ **NONE** |

⛔ **MY FIRST CONTROL WAS CIRCULAR AND A FRESH READER CAUGHT IT: “the same search returns 1 for `CC_A_SESSION_TASK_LIST`” only proves the instrument finds THE STRING IT WAS BUILT FROM.** It says nothing about a list named differently — **and CC-B's file is direct evidence that naming is NOT uniform**, which makes the circularity load-bearing rather than pedantic.
✅ **RE-DONE NAMING-AGNOSTIC:** every path at the ref matching `cc[_-]?c|analyst`, unfiltered by any task-list vocabulary. **Ten matches, and not one is a task list** — `MEMORY_CC_C.md`, archived `cc-comms-bridge` code, a 2026-07-27 scratch checklist, and another batch's scope/pre-audit. ⇒ **CC-C's absence survives a search that could not have been built from CC-A's filename.**
⚠️ **STILL NOT EXCLUDED, and stated rather than glossed:** an UNCOMMITTED list in CC-C's working copy, or one kept inside their memory file, is invisible at the ref. **That is a real limit — but it is also the point: a list only this batch's owner can see is not an index anyone else can read.**
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

⛔⛔ **THE ALTERNATIVE READING THAT WOULD CANCEL THIS BATCH, RAISED BY A FRESH READER AND EXCLUDED AT THE OBJECT.**
**The reading:** *"deliberately never built"* might really mean **"explicitly REJECTED by Kyle"** — `CLAUDE.md` §9.4 does record him striking a proposed six-line slot-time rule the same morning, with `#998` as the reason. **If that is what happened, the mis-aimed pointer is a documentation tidy-up, not a missing mechanism, and building a slot-time skill re-litigates a settled call AND adds a fourth rule layer to a system whose own closed batch measured that rules-as-written do not change behaviour.** ★ **That is the strongest argument against this batch and it deserves a direct answer.**
✅ **EXCLUDED BY HIS OWN WORDS, QUOTED ABOVE FROM `bfdd1197f`: what he struck was the LAYER, not the CAPABILITY.** *"I don't think that this becomes a new rule. **I think this gets added into each of the skills files for the steps in the workflow. Or maybe it is its own skill file** - anytime a session has to create or slot in a new task, whether it be a batch, a sub-batch, investigation, or hotfix, **that skill is triggered**."*
⇒ **He rejected putting it in `CLAUDE.md` and named TWO mechanism alternatives in the same breath. Both are mechanisms; neither is "do nothing".** The struck six lines and the proposed skill are not the same object.
✅ **AND HE RE-CONFIRMED IT TWICE SINCE:** he fixed this batch's queue position on 2026-09-05 (*"we go to the b task list slot next"*), and on **2026-09-09 he directed it to start.** A rejected capability does not get a plan row, a queue position and a start instruction.
⚠️ **WHAT THE READER IS STILL RIGHT ABOUT, AND IT BINDS OBJECTIVE 1: the `#998` hazard is real and survives this exclusion.** If the answer to objective 1 is *"another instruction"*, the batch inherits `B-WAKE-QUIET`'s measured negative. **Kyle rejecting the rules-file layer is EVIDENCE FOR that hazard, not against it.**

**DISPOSITION (of the five): (2) RELEVANT BUT NEEDS UPDATING TO TODAY'S INTENT.** The close-time half works as designed and is not touched. The slot-time half was **specified and never built**; this batch builds it. ⛔ **NOT disposition (1)** — nothing here is "still correct as-is", because half of it does not exist.

---

## 5. ⚠️ GOVERNANCE GAP FOUND WHILE READING (workflow-01: silence in the maps is itself a finding)

⚠️ **MY FIRST VERSION SEARCHED ONE STRING AND CLAIMED “ZERO MENTIONS”. A fresh reader called it a vocabulary miss, and it was.** Re-run as an ALTERNATION at the ref: `task list` 0 · `TASK_LIST` 0 · `session task` 0 · `session ledger` 0 · `session index` 0 — **but `per-session` returns 4 and `Scope Files` returns 20.**
✅ **READ AT THE OBJECT, THE FOUR `per-session` HITS ARE: a rename key, the Discord bridge, display-name routing, and `load-own-memory.mjs`'s `CLONE_TO_SESSION` map.** **None is the task lists.**
⇒ ⭐ **THE CORRECTED FINDING IS SHARPER THAN THE ORIGINAL: the SIM DOES document the per-session MEMORY files — via the hook layer that loads them — and has NO entry for the per-session TASK LISTS.** Same class of artefact, one recorded and one not, in the map whose job is cross-cutting state. **Folded into objective 4.**
⚠️ **AND THE COUNTER-ARGUMENT IS LIVE, NOT DISMISSED:** if the SIM's charter is components with feeders, consumers and shared state, a markdown index may be out of scope and its absence compliance rather than a gap — in which case rule 7 (one source of truth per domain) would FORBID an entry. **The pre-audit must settle which, not assume the gap.**

---

## 6. OBJECTIVES — each with what would count as done

| # | objective | verification criterion |
|---|---|---|
| **1** | ⛔ **DECIDE THE MECHANISM AND SAY WHY — AND IT IS NOT A BINARY.** Kyle named two (own skill · a clause in each step skill). ⭐ **A THIRD EXISTS AND THE PRE-AUDIT MUST BE ALLOWED TO CHOOSE IT: a file-write HOOK.** §9.4's own mechanics require the item to land in `RUNNING_ISSUES.md` and the phase plan — **those are FILE WRITES, i.e. a mechanical observable.** Verified: `.claude/settings.local.json` is **tracked** (so a hook propagates to all four clones by git), and **every `PreToolUse`/`PostToolUse` matcher today is `Bash`** — an `Edit\|Write` matcher is unused space. ⚠️ **`#998`'s hook decline does NOT cover this:** read at the object, it is scoped to `MessageDisplay` firing on ASSISTANT TEXT with no blocking event — the commentary problem. **If the pre-audit rules a hook out it must be on that reading, stated.** | The pre-audit argues ONE mechanism **against the auto-invocation evidence**, not from preference. ⛔ **Do not add rule text to `CLAUDE.md`** — Kyle struck a six-line version; `#998` is the reason. ★ **And `CLAUDE.md` rule 29's own ranking applies: PREFER IMPOSSIBLE OVER INTERCEPTED — a hook outranks auto-invocation, which this project calls a coin flip.** |
| **2** | **BUILD IT.** A slot-time trigger covering batch · sub-batch · investigation · hotfix. | ⛔ **MY FIRST CRITERION WAS “the session REACHES it” AND IT CANNOT DISCRIMINATE** — “reaches” is satisfied by explicitly invoking it, and §2 says the defect is NOT access. **A criterion passed by remembering to invoke tests the half that was never broken.** ★ **REPLACED: an UNPROMPTED fire, by a session that did NOT build it, on a slot occurring for its own reasons — with the session named and pass/fail written BEFORE the build.** |
| **3** | **DEFINE the convention and CREATE the shells — NOT populate other sessions' lists.** ⚠️ **My first version had me creating CC-C's list and moving CC-B's file. I cannot do either properly:** `workflow-10`'s own row says *“`N/A — not mine` is the CORRECT answer”* for the other three and *“touching another session's list needs a reason”*; objective 4 makes **open-and-stalled** the primary content, **which only that session knows**; and renaming CC-B's file while CC-B is live is the shared-file collision class rule 25.c exists for. | A stated convention (location + name + shape); conforming shells created; **each session populates its OWN**, named as explicit dependencies. ⛔ **The CC-B move needs Kyle's or the crew's authorisation, not mine.** ⭐ **AND the location must be CHOSEN AND JUSTIFIED, because “where CC-A's already is” is not a justification:** `Scope Files/` is documented in `CLAUDE.md` §4 as holding *“`BATCH_N_SCOPE.md`, `BATCH_N_PRE_AUDIT.md`, audit discussion docs”* — **a task list is none of those, so CC-A's own conformance is itself unratified.** ⭐ Plus a size/shape convention or an explicit finding that none is needed. |
| **4** | ⭐ **THE PRIMARY SECTION IS *OPEN AND STALLED*, NOT THE QUEUE** (Kyle amendment 2026-09-05). Every batch the session opened and did not close, the step it stalled at, and what it waits on. | Each list leads with that section. **CC-A had FOUR such batches, invisible until 2026-09-05** — the format must make that visible without anyone hunting. Plus the `SYSTEM_IMPACT_MAP` entry from §5. |
| **5** | ⛔ **CLOSE THE REVIEW GAP — ARGUE WHICH, DO NOT DO BOTH.** `workflow-10` has no review gate and the governance checker's `DOCS` table cannot see the task lists. Option A: teach the checker the three-destination rule. Option B: make the filled ledger a named Step-11 item Langston must rule on. | The pre-audit **argues one and says why the other was rejected.** ⚠️ Doing both by default is the failure the objective names. |

---

## 7. ⛔ THE HAZARD THIS BATCH MUST NOT CREATE — NAMED IN THE ORIGINAL RULE

**A per-session list is a SECOND ORDERING of the same work, and two sources of truth drifting is this project's most expensive recurring failure.** The rule already answers it — **the plan is the authority, the list is the index; when they disagree the LIST is stale** — and any mechanism built here must preserve that, not quietly invert it by making the list easier to update than the plan.

## 7b. ⛔⛔ THE PRE-REGISTERED FAILURE CONDITION — WITHOUT ONE THIS BATCH CANNOT BE SHOWN TO FAIL

⚠️ **My first draft named the `#998` hazard and then armed NOTHING against it — it said only that the pre-audit “has to survive the argument”. An argument is not a measurement, and this is the exact failure `B-WAKE-QUIET` exists to record.**
★ **Its neighbour in the plan does this properly.** Row 4.6 `B-RULES-LAYER` carries: *“PRE-REGISTERED FAILURE CONDITION: if the speak-rate does not move, the layer hypothesis is WRONG and the batch says so.”* **`#995` was decisive only because it had a RATE.** This batch had neither a baseline nor a target.

**REGISTERED NOW, BEFORE ANY BUILD:**
- **BASELINE (close-time, measured §2b): 1 of 3 completion reports since 2026-09-05 carried the tier ledger.**
- **BASELINE (slot-time): UNMEASURED, and honestly so.** ⚠️ **A reader offered “`bug-investigation` has not fired in 11 days” as the prior. I checked and WITHDREW it: the corpus cannot distinguish a MENTION from a FIRING — my control shows `workflow-10-governance` with comparable mention counts, and I know that one fired today.** ⇒ **the prior is UNMEASURED, not zero. Saying so is the point: a batch whose whole subject is invisible work must not open with an invisible baseline.**
- **PASS:** the next N completion reports after this batch ships carry the ledger, **and** at least one slot-time fire happens **unprompted, in a session that did not build the mechanism**.
- ⛔ **FAIL, AND IT IS NOT A DELAY:** if the ledger rate does not move, or no unprompted slot-time fire is observed, **the mechanism hypothesis is WRONG and the batch says so** — exactly as row 4.6 pre-registers for itself.
⭐ **AND THE INSTRUMENT MAY ALREADY EXIST: `/skill-doctor`** is logged in `CLAUDE_CODE_FEATURE_WATCH.md` (2026-09-05) in this project's own words as *“the missing INSTRUMENT for the governance programme”*, because *“skill auto-invocation is a coin flip we have never been able to measure”*. **Kyle's decision on it is pending. If objective 1 answers “a skill”, this is how objective 2 gets MEASURED instead of asserted** — and it should be named as a dependency rather than discovered later.

## 7c. ⚠️ WHO IS EVEN IN THE POPULATION — THE ROSTER SAYS “FOUR SESSIONS, ONE SHAPE” IS A DESIGN CHOICE, NOT A GIVEN

Read at the object: **CC-INFRA is `NON-BATCH` and does not take DawnTrader batch work; CC-C is a scoped-lift lane.** The close-time trigger is *“every batch close”*. **A uniform shape across a non-batch session, a scoped lane and two batch sessions is a decision this scope never made** — and it compounds §3's own finding, since CC-INFRA's 48 KB is being called non-conforming against **two** unwritten assumptions: an absent size cap AND an assumed uniform shape.
⭐ **AND NEW SINCE THE 09-05 CENSUS, ONE DAY BEFORE THIS SCOPE: the roster gained CODEX as a `non_session_participant` (2026-09-08).** It produces audits, therefore §9.4-triggering findings, has its own repo copy, **and cannot be woken.** **Whether it is in the population is undecided and must be decided — one line, either way.**

## 8. HONEST LIMITS OF THIS SCOPE

- ⛔ **STRUCK. My first draft said “it does not touch the close-time half — that works and is out of scope”, which was BOTH false (§2b) AND self-contradictory: objective 5's two remedies are ENTIRELY close-time (`workflow-10`'s gate, or a Step-11 ruling). A reviewer approving that sentence would have approved excluding the thing objective 5 builds.** The close-time half IS in scope, for the reason §2b measured.
- **It cannot verify objective 2 by inspection.** A trigger that "exists" is the thing this batch is fixing — the close-time half exists too, and the slot-time half being *specified* is exactly why it read as covered. **Verification must be a real slot, observed.**
- **`#998`'s failure condition applies to this batch too:** if the answer to objective 1 turns out to be "another instruction", `B-WAKE-QUIET`'s measured result says it will not fire. That is an argument the pre-audit has to survive, not one it may skip.
