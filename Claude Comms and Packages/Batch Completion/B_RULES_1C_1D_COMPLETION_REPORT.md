# B-RULES-1c / 1d — COMPLETION REPORT

**The `CLAUDE.md` slim: the workflow becomes twelve skills**

| | |
|---|---|
| **Owner** | CC-A (Claude Old) |
| **Dates** | 2026-08-21 → 2026-08-23 |
| **change-class** | `non_architecture` |
| **Reviewed ref** | `cb01111eb` (Step-4 CHANGES-NEEDED at `40b84932c` → applied → returned) |
| **CI** | **4/4 GREEN, verified PER-JOB** — run `32636232272` |
| **Deploy** | **NONE — judged explicitly, see §4** |
| **Issues** | #739, #740, #741 opened · #732 tripwired · alert `fe7c2385` acked |

---

## 1. WHAT THIS BATCH WAS FOR

`CLAUDE.md` is loaded on **every session start and every compaction, by every session**, so every byte in it is paid for repeatedly. The goal was to reduce that cost **without deleting anything** — by moving content to homes that load on demand, each leaving a named pointer behind.

**RESULT: 122,354 B → 108,513 B.** The reduction did **not** come from compression. **The eleven-step workflow left the always-loaded file entirely and now loads one step at a time.**

---

## 2. OBJECTIVES

| # | objective | outcome | evidence |
|---|---|---|---|
| 1 | The workflow leaves `CLAUDE.md` | **YES** | `§2` removed completely; 12 skills built; 11/11 step texts preserved **byte-for-byte verbatim** |
| 2 | A trigger that does not depend on skill auto-invocation | **YES** | `§0.a` table → step file path. An ordinary Read; no skill machinery on the primary leg |
| 3 | Define what a hotfix IS | **YES** | `workflow-hotfix` — qualifying test, NOT-list, mandatory blast-radius audit, Langston gate **before** staging |
| 4 | Move depth out of `§3`, `§6`, `§9.5` | **YES** | tier lists → step-10 skill · 4 narratives → history doc · 6 blocks → comms runbook. All verbatim |
| 5 | Nothing deleted, nothing demoted | **YES** | every mover leaves a named pointer; 4 single-homed rules verified still in `§3` |
| 6 | Step skills IMPROVED, not just moved | **YES** | all 12 carry the failure we actually keep repeating at that step, each with a dated incident |

---

## 3. WHAT SHIPPED

**TWELVE SKILLS** (58 KB total, **one loads at a time**): `workflow-01-scope` … `workflow-11-completion`, plus `workflow-hotfix`.

**`§0.a`** — Kyle's design, replacing my first build. The index lives in the rules file and points **straight at each step file**. Two triggers, explicitly labelled **unequal**: the table is the primary (an ordinary read), auto-invocation is the backup (measured-unreliable). The umbrella skill was **deleted** — nothing makes an umbrella fire first, so it could not route.

**`§2` REMOVED COMPLETELY** (Kyle: *"there shouldn't be a second set of references to it"*), with a three-line forwarding heading kept **on measurement, not preference**: `§2` is cited **136 times across 107 files**, overwhelmingly frozen completion reports.

**THE HOTFIX PATH — written for the first time.** Measured before writing: **"hotfix" appeared 256 times in the governance corpus and every occurrence was a USAGE.** No definition, no test, no steps — so the fast path was whatever a session in a hurry decided it was. It is also **the missing half of rule 23**, which has ordered a *"mini-cycle through Langston"* since July without ever saying what one is.

**`§3` → the step-10 skill** (14,299 → 10,338 B). **Batch NAMING, CHANGE-CLASS and the MEMORY rules did NOT move** — they fire at batch creation and session start.

**STEP-6 DEPLOY doubled** (3.4 → 6.8 KB), every fact read off the live `dt-deploy` header — including the one written down nowhere: **rollback is a deploy, not a command.** The **delivery board** is now in all eleven step skills.

**TWO RENAMES**, numbers unchanged: `§9` → *Investigation, Findings & Reporting Discipline*; `§3` → *Batch Identity, Governance Documents & Memory Rules*. **Measured first: 237 citations use `§9`, only 3 use its title.**

---

## 4. VERIFICATION

**CI 4/4 GREEN per-job**, run `32636232272`. ⚠️ The run is on a **descendant** of my commit (CC-C pushed after me); I confirmed containment with `git merge-base --is-ancestor` rather than assuming it covered me.

**DEPLOY: NONE, and the judgement is stated rather than assumed.** Zero files under `server/ client/ shared/ drizzle/` — measured, with a positive control (39 files in range, so the filter is not what is empty). ★ **And the step-6 rule earned its place the same day:** checking the range from the deployed sha found **NINE undeployed runtime files including a migration**, all CC-C's. Flagged to him once, not deployed — a migration is not mine to run.

**STEP 7 — no staging surface, and that is SAID rather than skipped** (§9.3). What exists was verified: 12/12 skills valid frontmatter with zero colon-space · every skill path and every `1-system-manual/` path cited in `CLAUDE.md` resolves · 10 governance docs present in the step-10 skill **and** the 4 rules that must NOT have moved still in `§3` · board block in all 11 step skills · 4 hooks parse, `load-conduct` emits 20,062 B · all auto-loaded files under cap · 14 sections, no doubled separators.
⚠️ One reported failure was **my own probe**, not the file — it matched an instruction to re-test a model daily and read it as a claim. Checked the context before concluding.

**STEP 8 — no-op, stated.** No staging surface exists to second-pass.

---

## 5. FINDINGS OUTSIDE SCOPE — FOUR OF ONE SHAPE

★★ **AN INSTRUMENT WHOSE SILENCE MEANS SOMETHING OTHER THAN WHAT IT CLAIMS.** Four instances in one day, all found in passing:

1. **The push guard refused on a file that existed — at TWO layers.** A relative path inside a fail-closed gate. Fixed both; the second was found only by applying the step-9 rule about identical sites.
2. **#739 — the rule-21 liveness row was never written in 17 days while the task ran daily.** Worse, the alarm's own wording (*"a missing row means the task is dead"*) **would have condemned a living task.** Corrected at source.
3. **#740 — a `": "` in a skill description silently disarms its auto-invoke trigger.** Valid file, no error, plausible fallback. **Caught by chance, not by any check I ran.**
4. **The shared `MEMORY.md` asserted the wrong model for Langston for 17 days — having predicted that exact failure in the same sentence.** The fix is not a corrected value: **an always-loaded file must not assert a live config value; name WHERE to read it.**

**#741 — a review dispatch that exceeds Langston's 900s ceiling fails SILENTLY.** Measured: three consecutive failures at ~15-minute intervals, then parked. **From the sender's side it is indistinguishable from a busy reviewer**, and the polite response re-triggers it. **The cause was mine** — four asks in one invocation. The rule (*one gate per dispatch, cheapest first, evidence in the message*) is now in the step-4 skill. **Honest residual: this fixes the sender's side only.**

**The alert-marker suppression fix.** A marker naming CC-C matched nothing, so **no session was silenced** and an alert owned by one woke others.

---

## 6. LANGSTON

**GATE 2 — PASS, tagged `RULED ON REPORTED FACT`, permanently.** He reached neither instrument. It stands only because the finding is **decision-inert**. ⛔ **His condition: this may never be cited as measured precedent that a path-scoped mechanism is reliable.**

**Ruling (b) on the tier fold — the enumeration CUT.** His argument beat mine: **the list is not what detects a skipped governance turn.** Three things do, and his own check lives in *his* always-loaded file and survives the fold. He also caught a latent double-home in my replacement text.

**Crew board — KILL.** His reframe, adopted: the deciding number is **three claims made, zero ever released** — a protocol nobody completes, so its empty state was never *earned*.

**§13 — HOLD, and he corrected my tally DOWN.** Instance 3 was a different pattern; `read-the-field` has two instances, and `fragment-not-whole` was split out. Both filed with refs so the next promotes by grep.

**Step-4 — CHANGES-NEEDED, then applied.** ★ **I fixed ONE of FOUR copies of the alert-owner enumeration** — while fixing a *drift* bug. The one that mattered governs **the emitter**. Fixed structurally: one `ALERT_OWNERS` tuple, regex derived from it, so a second list cannot exist.
★ **And he refuted my own change request by tracing it:** I argued to drop `CC-INFRA`; the real choice was **deterministic-nobody vs non-deterministic-WRONG-CC**, and I had the sign backwards.

---

## 7. HONEST RESIDUAL

- **Three times I made `CLAUDE.md` BIGGER while slimming it** — writing justification into the file I was trimming. All three caught and relocated, but it is a real tendency.
- **Runbooks are measured-weak:** 3 commits and 9 mentions across five runbooks, against 370 for `RUNNING_ISSUES.md`. **So `§6` was NOT gutted** — Kyle's point stands that the comms rules got followed *because* they were always-loaded.
- **#739/#740/#741 all need mechanisms, not procedures** — homed to `B-RULES-1e`, CC-A, due 2026-09-05.
- **The crew-board CODE is not removed** — only the two rules. Homed to `B-CREW-BOARD-REMOVAL`, CC-A, due 2026-09-05.
- **Infra Claude's onboarding is deferred by Kyle**, deliberately, date open — named so it is not lost.
- **Langston's clearance covers the repo artifact, NOT the laptop deployment.** The wake filter's live twin is off his filesystem.

---

## 8. GOVERNANCE FILES CHANGED

`CLAUDE.md` · `CONDUCT.md` · `.claude/skills/workflow-*/SKILL.md` (12) · `.claude/hooks/{fresh-rules,guard-push-tsc-baseline}.mjs` · `scripts/check-tsc-baseline.mjs` · `comms-infra/laptop/cc-wake-filter.py` · `1-system-manual/{RUNNING_ISSUES,MISTAKE_PATTERNS,DELETED_COMPONENTS_LOG,ALERT_HANDLING_PROTOCOL,COMMS_BRIDGE_RUNBOOK,CLAUDE_CODE_FEATURE_WATCH,BATCH_CATALOG,PHASE_HISTORY,PHASE_19_PLAN}.md` · `1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md` · `Claude Comms and Packages/Langston/BOOTSTRAP.md` · `.claude/memory/{MEMORY,MEMORY_CC_A}.md` · this report.

**SIM and SYSTEM MANUAL judged NOT APPLICABLE, explicitly:** no component added, removed or re-keyed; no architecture, strategy, regime, filter, signal-pipeline or math change. This batch changes **how sessions are instructed**, not what the system does.
