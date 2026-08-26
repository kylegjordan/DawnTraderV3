# B-RULES-1e — SCOPE

change-class: non_architecture

**Owner:** CC-A · **Opened:** 2026-08-25 · **Card:** `PVTI_lAHODmulEM4BfQP4zg4BQXs` (Status `Scope`) · **Carries:** #739, #740, **#741 (CC-A — *Langston's 900-second invocation ceiling*)**, plus the long-parked ORDERING question.

> ⚠️ **CITED BY NUMBER *AND* SUBJECT THROUGHOUT, AND NOT AS A STYLE CHOICE.** `#741` currently resolves to **two different issues** — mine (the invocation ceiling) and CC-C's (maker exit fills reading a contaminated midpoint). **This bit me inside this very scope:** my first read of "#741" pulled CC-C's entry and I began scoping the wrong problem. Langston's interim convention is in force until `B-ISSUE-BLOCK-GUARD` ships.

---

## 1. WHAT THIS BATCH IS FOR

**Three rules that exist, are emphatic, and were followed ZERO times — each needs a MECHANISM, not more instruction.** That is the whole thesis, and it is Kyle's standing instruction: *"Note the rules we want followed, but then have them enforced."*

★ **THE COMMON SHAPE, and it is why these three belong in one batch rather than three:** each is **an instrument whose silence means something other than what it appears to mean.** A liveness log that is never written reads as "nothing to report." A dropped skill description reads as a populated listing. A timed-out review reads as a busy reviewer. **In all three the absent thing wears the present thing's clothes**, so no amount of diligence at read-time recovers it.

---

## 2. OBJECTIVES

### OBJ-1 — #739 *(the daily model/feature check never writes its proof-of-life row)*

**RE-MEASURED TODAY, NOT TAKEN FROM THE ISSUE — and the number has moved against us.**
- The task is **ENABLED and ran THIS MORNING**: `lastRunAt` **2026-08-25T07:23:10Z**, `nextRunAt` 2026-08-26. **It is alive.**
- §RUN LOG holds **TWO rows, and NEITHER WAS WRITTEN BY THE TASK**: the 2026-08-06 seed (honest about being a seed) and a 2026-08-23 row explicitly labelled *"HAND-WRITTEN BY CC-A, NOT BY THE TASK — recorded while diagnosing #739."*
- ⇒ **2026-08-06 → 2026-08-25 is NINETEEN days and ZERO task-written rows.** The issue said seventeen; **it has run twice more since and still written nothing.**
- **Positive control:** the same git query against `RUNNING_ISSUES.md` returns 128 commits, so the query is not what is failing.

⛔ **MORE INSTRUCTION IS PROVABLY NOT THE FIX — CITATION CORRECTED AND VERIFIED AT THE OBJECT.** The instruction lives at `~/.claude/scheduled-tasks/daily-claude-model-check/SKILL.md`, **not** in `.claude/skills/`. ⚠️ **My first attempt to verify it returned NOTHING and I nearly filed the citation as unresolvable** — I searched the two *skills* directories, and scheduled tasks live in their own tree. **`wrong-object`: right name, wrong location.** Verbatim: *"**EVERY run (finding or silent), append ONE dated row to the RUN LOG section**"* — in bold, followed by the full explicit-path git sequence, closing *"the row IS the proof the task lives; a silent day still writes its row."* **Followed 0 times in 19 opportunities.**

★ **THE STRUCTURAL POINT: a liveness artifact that depends on the thing being measured to report itself is not an instrument, it is a request.**

**BUILD:** the row becomes a **by-product of the run**, not a step the run is asked to remember — either the wrapper stamps it, or liveness is derived from the scheduler's own `lastRunAt` rather than from a self-report.

**VERIFY:** a run happens and the row appears **without the run being asked to write it**; and the derived-liveness path is shown to go RED when the task is disabled (**positive control — its silence must be earned**).

### OBJ-2 — #740 *(a colon-space in a skill description silently disarms that skill's trigger)*

Skill frontmatter is YAML; an unquoted scalar containing a colon-space is ambiguous, so the parser **drops the `description` key** and the app falls back to the file's first heading — **which reads like a description, so the listing looks populated.** **MEASURED 2026-08-21/22:** `workflow-05-ci` and `workflow-07-verify-cc` both lost their descriptions this way. **Nothing errored.**

⛔ **NOT COSMETIC — THE DESCRIPTION *IS* THE AUTO-INVOCATION TRIGGER.** A dropped description silently removes **the entire backup leg**, which is the only reason these are skills rather than plain markdown.

⚠️ **AND THE DETECTION STORY IS THE ARGUMENT FOR MECHANISING IT: I caught it BY CHANCE**, when the listing re-rendered after an unrelated edit. **No check I ran would have found it.** The interim mitigation is a *procedure* (*"after editing a description, read the LISTING, not the file"*) — the thing this project keeps proving does not hold.

**BUILD:** a mechanical assertion over `.claude/skills/*/SKILL.md` — **parse the frontmatter as YAML and assert a `description` key survives parsing**, rather than pattern-matching for the colon-space.

★ **PARSE, DO NOT PATTERN-MATCH, and this is a real design constraint rather than a preference:** colon-space is the instance we hit; the defect class is *"the parser dropped the key."* A regex for the colon-space would pass a description broken by any other YAML ambiguity — **a check that cannot fail the way the real defect fails.**

**VERIFY:** feed it a deliberately broken description ⇒ it FAILS (positive control). Feed it the current twelve ⇒ passes.

### OBJ-3 — #741 *(CC-A — a review dispatch over Langston's 900-second ceiling fails silently)*

**MEASURED from `journalctl`:** three consecutive failures at ~15-minute intervals, then PARKED. `CLAUDE_TIMEOUT = 900`.

⛔ **THE DANGEROUS HALF IS NOT THE CEILING — IT IS `suppressed in channel`.** From the sender's side a timed-out review is **indistinguishable from a busy reviewer**, and the correct-looking response (wait, re-poke politely) **re-triggers the identical failure.**

★★ **AND THE SIM READ CHANGED THIS OBJECTIVE'S SCOPE — the receiver side is NOT out of reach.** The issue treats this as Langston-side infrastructure with only a sender-side remedy. **The SIM states the bridge sources are REPO-CANONICAL at `comms-infra/discord/`**, and `discord-langston-bridge.py:68` holds `CLAUDE_TIMEOUT = 900` **in this repo**. ⇒ **the silent-suppression path is ours to fix.**

**PROVENANCE (TIER 1).** `comms-infra/discord/discord-langston-bridge.py:513-517`. Introduced whole in the original build commit `04d7cb3e9` — *"B-DISCORD (build phase): parallel Discord comms bridges + feasibility study"*, quoted verbatim; **the timeout is a default from the build, not a tuned value.** The suppression carries its own stated intent in the code: *"infra error, not a real reply — mirror only, don't spam the channel."*

⇒ **DISPOSITION (2) — RELEVANT BUT NEEDS UPDATING TO TODAY'S INTENT.** Suppression was right for **transient infra noise** and is wrong for **a review that timed out and will never arrive**; the original collapses the two. **The fix is not raising the ceiling** — a longer ceiling still fails silently. **BUILD: a timeout posts a short, explicit failure naming the dispatch**, so the sender learns the review is dead instead of inferring a busy reviewer.

**VERIFY:** force a timeout ⇒ a failure line appears in-channel. A genuine transient error ⇒ still suppressed (**the noise fix must survive**).

### OBJ-4 — ORDERING: RULE ON IT, AND MY RECOMMENDATION IS TO DROP IT

This is the item 1e was originally named for. **It was already ruled on:** *"PREVIOUSLY STATED: reordering `CLAUDE.md` is free and should go first. NOW: it goes LAST, **if at all**. REASON: Langston — no published ordering effect for an always-loaded file; it is an in-place rewrite of 664 lines churning a file two other sessions pull, for an unevidenced benefit."*

**NOTHING HAS CHANGED THAT REASONING, and I looked rather than assumed:** there is still no published ordering effect, the file is still pulled by three sessions, and the cost is still a whole-file churn.

⇒ **RECOMMEND: CLOSE IT EXPLICITLY AS "NOT DOING, FOR WANT OF EVIDENCE"** rather than carrying it forward as a perpetually-deferred item. ⛔ **A deferral nobody will ever act on is worse than a decision** — it reads as planned work. **Langston's call; if he wants it kept, it needs a stated evidence threshold that would trigger it.**

### OBJ-5 — a stale live-config assertion found during the mandatory SIM read

**`SYSTEM_IMPACT_MAP.md:2675` asserts Langston runs `--model claude-opus-4-8[1m]`. The repo-canonical bridge at `comms-infra/discord/discord-langston-bridge.py:69` reads `claude-opus-5[1m]`.**

★ **SAME CLASS AS THE 17-DAY MEMORY DRIFT, AND THE FIX IS THE SAME ONE WE ALREADY LEARNED: an authoritative document must not assert a live config VALUE — it must name WHERE TO READ IT.** Correct by pointer, not by substituting today's value, which would only restart the clock.

⚠️ **AND A SECOND SITE OF THE SAME SHAPE, FOUND IN THE SAME READ AND FLAGGED RATHER THAN QUIETLY FIXED: `CLAUDE_CODE_FEATURE_WATCH.md` asserts *"Langston = `claude-opus-5[1m]` (since 2026-07-27)."*** It is **correct today** — which is exactly why it is worth naming: **the memory-file assertion was also correct on the day it was written, and was wrong for seventeen days afterwards.** A value that happens to be right is not a mechanism. ⇒ **treat both sites the same way; correctness-today is not a reason to leave one.**

---

### OBJ-5b — THE MODEL VALUE IS FORKED ACROSS THREE COPIES OF ONE EXECUTABLE — **CC-A + LANGSTON DECIDE THE FIX**

⚠️ **ATTRIBUTION CORRECTED, AND THE CORRECTION MATTERS BECAUSE IT CHANGES WHO OWNS THIS.** An earlier revision of this objective opened *"KYLE MADE OBJ-5 A RULE"* and quoted him. **He was talking about something narrower, and he said so:** *"I don't know if we need to carry my rule. I thought we were talking about something different... I know that when we changed Langston's model, it needs to be changed in two places, but all of these other files that call it and that need to be updated I'm not aware of. So however is the best way to make sure that that reflects reality is up to you and Langston."*
⇒ **THERE IS NO KYLE RULE HERE. The disposition is CC-A + Langston's to settle** (§6.7 iterate-and-decide), and it is **not** a decision he owns. ★ **Recorded rather than silently rewritten, because a scope that cites the decider as its authority and is wrong about that is the more dangerous half of the error — it would have carried a manufactured mandate into Step 4.**
**The FINDING below is unaffected: it was measured, not inferred from anything he said.**

**MEASURED POPULATION — 20 files assert a model value.** The **frozen** ones (completion reports, closed scope files, Telegram archives) are historical records and are **NOT rewritten**. **The LIVE authoritative set is eight:** `CLAUDE.md` · the shared `MEMORY.md` · `LANGSTON_ARCHITECTURE.md` · `SYSTEM_IMPACT_MAP.md` · `COMMS_BRIDGE_RUNBOOK.md` · `CLAUDE_CODE_FEATURE_WATCH.md` · `PHASE_19_PLAN.md` · `comms-infra/discord/DISCORD_BRIDGE_DESIGN.md`.

⛔⛔ **AND THE MEASUREMENT TURNED UP A HARDER PROBLEM THAN STALE PROSE: `langston-call` — ONE OF THE TWO LIVE MODEL SITES — HAS NO REPO-CANONICAL SOURCE, AND TWO STALE FORKS THAT LOOK LIKE ONE.**

| copy | model it names | last touched |
|---|---|---|
| **LIVE** `root@204.168.141.77:/usr/local/bin/langston-call` | **`claude-opus-5[1m]`** — the truth | 2026-08-07 |
| `Claude Comms and Packages/comms-infra/langston-call.sh` | `claude-fable-5[1m]` | 2026-08-06 |
| `Claude Comms and Packages/Langston/langston-call.sh` | `claude-opus-4-7` | 2026-05-07 |

**All three md5s differ.** `comms-infra/discord/deploy.sh` **does not ship `langston-call` at all** — so unlike the Discord bridge (repo-canonical, deployed), **the live file has no source in this repo and the two that look like sources are both wrong.**

★ **AND THE 2026-08-06 COPY IS THE ARGUMENT FOR KYLE'S RULE, NOT A COUNTEREXAMPLE TO IT.** Its commit is titled *"Reconcile Langston comms files to live Helsinki state (repo was stale through three model switches)"* — **somebody already did this reconciliation deliberately, and it was CORRECT ON THE DAY.** The model reverted to Opus 5 afterwards and **the reconciled copy was stale again within 19 days.** ⇒ **A MANUAL RECONCILIATION OF A VALUE THAT LIVES SOMEWHERE ELSE ROTS IMMEDIATELY. That is precisely why the fix is a pointer and not a correction.**

⚠️ **CONSEQUENCE, stated plainly: restoring `langston-call` from either repo copy silently downgrades Langston's model** — and one of them names `claude-fable-5`, which our own ledger records as erroring on invocation.

**DISPOSITIONS (§1.b), and the second is a decision I am NOT taking unilaterally:**
- `Claude Comms and Packages/Langston/langston-call.sh` — **(5) disconnected, should stay disconnected**: that folder is the historical "Langston setup reference" (`CLAUDE.md` §4). **Mark it as historical, or remove it under rule 18.**
- `Claude Comms and Packages/comms-infra/langston-call.sh` — **(3) or (5), and it is Langston's call:** either **RECONNECT** it (make `langston-call` genuinely repo-canonical and shipped by `deploy.sh`, as the Discord bridge already is) or **REMOVE** it. ⛔ **What it must not remain is a third forked copy that reads like a source.**

**HOME for the fork itself:** `RUNNING_ISSUES` **#746** (minted from my own block, 730-759).

⛔ **AND THE EIGHT-DOCUMENT SWEEP IS NOT ADOPTED — IT IS A PROPOSAL FOR LANGSTON TO RULE ON.** The population measurement stands (20 files assert a model value; 8 are live). **Whether the answer is a pointer sweep, a single named source of truth, or simply fixing the executable fork and leaving the prose alone, is the open question.** ★ **My own view, offered not assumed: the EXECUTABLE fork is the real defect and is worth fixing on its own merits; the prose sweep is the cheaper, more speculative half and should be argued for separately rather than smuggled in behind it.**

---

### ✅ LANGSTON'S RULING ON OBJ-5b — APPROVED WITH CONDITIONS (2026-08-26). He re-derived the whole census himself before ruling; the measurement stands as filed.

**Q1 — (3) RECONNECT, not remove.** His reasoning, adopted: `langston-call` **is not archival** — it is one of his two live model sites and the caller of `langston-log-loaded` at `:104`. ★ **Deleting the repo copy leaves a live executable with NO SOURCE AT ALL — unversioned, unreviewable, outside every gate. That is a worse rule-18 outcome than the fork.**

⚠️ **AND HE CORRECTED MY PRECEDENT BY ONE STEP, WHICH CHANGES WHAT WE COPY.** I wrote *"make it repo-canonical and shipped by `deploy.sh`, as the bridge already is."* **`deploy.sh` does NOT copy the bridge** — step 3 is `# code (expects files already scp'd to $BRIDGE_DIR)`; it chmods, it never installs. **The ONLY executable `deploy.sh` genuinely installs is `cc-send`** (`install -m 0755 "$BRIDGE_DIR/cc-send" /usr/local/bin/cc-send`). ⇒ **COPY THE `cc-send` PATTERN, NOT THE BRIDGE — a working precedent instead of an aspirational one.**

**THE THREE CONDITIONS, binding:**
| # | condition | why it is not a formality |
|---|---|---|
| **i** | The committed body is **BYTE-EXACT FROM THE LIVE FILE** (`md5 150eba15bb69393834d15abd21e8dfe9`), **verified by md5 AFTER the commit.** Direction is **live → repo**, **never a merge of the two forks.** | ⛔ **A reconnect that ships the CURRENT repo body silently flips his alert/queue path to `claude-fable-5`** — exactly the failure `.claude/memory/MEMORY.md:25` predicted for the bridge and nobody read back. |
| **ii** | It lands in **`comms-infra/discord/`** — the tree `deploy.sh` actually operates from — and is **named as installed, no `.sh`.** | **Two `comms-infra` trees is itself part of the reads-like-a-source problem.** |
| **iii** | `Claude Comms and Packages/Langston/langston-call.sh` → **(5) REMOVE** under rule 18, with the `DELETED_COMPONENTS_LOG` entry. | B78.1's completion report already carries the history, so nothing is lost. |

**Q2 — THE EIGHT-DOCUMENT SWEEP DOES NOT SURVIVE AS DISPATCHED. A NARROWER ONE DOES, AND ITS EVIDENCE IS NOT SPECULATIVE.**
⛔ **MY DENOMINATOR WAS WRONG, and it is the `wrong-object` slug again at the population level:** *"documents that NAME the model"* is not the population. **The population is documents that ASSERT A LIVE CONFIG VALUE INSTEAD OF NAMING THE SITE THAT OWNS IT.** A file may name the model and be fine; a file may assert one and be a defect.

★★ **AND HIS STRONGEST INSTANCE IS ONE I COULD NOT HAVE FOUND, BECAUSE IT IS NOT IN THE REPO — IT IS HIM.** *"My own always-loaded `/home/langston/MEMORY.md` told me this invoke that I am `claude-fable-5[1m]`. Both live sites say otherwise. **I loaded a false fact about myself with full confidence, today.**"* ⇒ the reviewer who grades our measurements is himself running on a stale self-assertion, **right now**, from an always-loaded file — the identical shape as the 17-day drift in ours.

**METHOD, per his ruling:** enumerate and label each file **ASSERTS or POINTS**; convert only the asserters.
⛔ **DO NOT TOUCH DATED RECORDS** — `LANGSTON_ARCHITECTURE.md:149`, `BATCH_CATALOG`, completion reports. **A change-log row that was TRUE AT ITS DATE is not drift, and rewriting it is the back-dating shape he has already ruled against.**

*(His mechanism note, carried as he framed it — a hypothesis, not a claim: `/usr/local/bin/langston-call.bak-fable` carries fable-5 while the live file is opus-5 at Aug 7, **consistent with** flip-then-revert; he has not proven the revert and will not assert it.)*

---

## 3. OUT OF SCOPE — stated so the boundary is not a judgement call later

- **CC-C's #741** (maker exit fills) — different issue, same number. Not touched.
- **Raising `CLAUDE_TIMEOUT`** — the defect is the silence, not the ceiling. Changing it is a separate question with its own evidence.
- **`B-GATE-GUARD` / `B-ISSUE-BLOCK-GUARD`** — queued separately, same hook family.
- **Any rule whose mechanism is unproven** — the standing 1a/1b boundary, unchanged.

## 4. THE READS THIS SCOPE IS BUILT ON (§1.a / §1.b)

- **SIM: APPLICABLE FOR ONE COMPONENT ONLY, judged not assumed.** Searched for all five things this batch touches; only `discord-langston-bridge` appears (7 hits). **Positive control: `SQE` returns 56 in SIM / 61 in the System Manual**, so the search works and the four zeros are real absences, not a broken query.
- **SYSTEM MANUAL: NOT APPLICABLE, explicitly.** No architecture, strategy, regime, filter, signal-pipeline or math change. This batch changes **how sessions are instructed and how failures announce themselves.**
- **PROVENANCE: TIER 1** on the bridge suppression path (above, commit quoted verbatim). **TIER 2:** the RUN LOG contract was introduced by `88e624656` (B-RULES-1b C1) — *the ledger gains the authoritative procedure + the committed-liveness RUN LOG, seed row honest about its own provenance*; **the skill-frontmatter check is NEW code with no provenance to read**, stated rather than left blank.
- **LEDGER (§9.5(b-ii)):** all three issues are open, homed to this batch, and none has a prior decision recorded against it.
