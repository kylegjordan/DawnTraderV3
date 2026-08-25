# B-RULES-1c / 1d — COMPLETION REPORT

**The `CLAUDE.md` slim: the workflow becomes twelve skills**

| | |
|---|---|
| **Owner** | CC-A (Claude Old) |
| **Dates** | 2026-08-21 → **CLOSED 2026-08-25** |
| **Board** | `B-RULES-1c` `PVTI_...zg1qnO4` + `B-RULES-1d` `PVTI_...zg1X8Ig` — both **`Review = Approved`** (set by Langston), both moved to **Complete**, `Blocked on = Nothing`. **Read back from each item’s `fieldValues`, not `item-list`** — the latter is the false-negative instrument (his measurement). |
| **change-class** | `non_architecture` |
| **Reviewed ref** | **Step-4 APPROVED at `44b165e0b`** (two CHANGES-NEEDED rounds first: `40b84932c` enumeration drift → `cb01111eb` truncation blocker → approved). Two riders applied after approval. |
| **CI** | **4/4 GREEN, verified PER-JOB** — run `32636232272`; re-verified at close on run `32903457198` (Build, Test Suite, TypeScript Check, Docker Build all `success`). ⚠️ **The run is on a DESCENDANT of my head** — containment confirmed with `merge-base --is-ancestor`, never assumed. ★ **And a sibling run on the same branch reads `cancelled`** — three sessions pushing minutes apart cancel each other, and `cancelled` ≠ `failure` ≠ `success`. Only the per-job `conclusion` is a pass. |
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

**THE ALERT-ROUTING TRUNCATION (Langston Step-4 blocker).** The owner marker was matched against a **400-character truncation** while it sits on the **last line** of a triage whose median length is ~2,300 characters. **Measured, both tailed files, all history: 1,026 of 1,031 markers past byte 400 - 99.5% discarded before the regex ran.** Old code routed **4**; the fix routes **1,031 - 100% of well-formed markers.**
⚠️ **AND THE CAUSE I HAD COMMITTED WAS WRONG - STRUCK, NOT SOFTENED.** I attributed the cross-session wake to a missing `CC-C` alternative and wrote that into a code comment AND the alert protocol, where it read as established. **The marker never reached the alternation at all.** Right observation, adjacent object. Both defects were real; only the attribution was wrong.
★ **MY RESIDUAL OF "8 FAILING" WAS WRONG IN MY OWN DISFAVOUR AND LANGSTON CORRECTED IT UPWARD.** I reported 8 markers failing as malformed. He enumerated all 8: **every one is his own PROSE discussing the format in backticks. ZERO genuine markers fail to route.** They are also the multiplicity hazard, which makes **last-match** load-bearing rather than stylistic.
★★ **THE LESSON THAT LET IT PAST ME, now a rule in `workflow-07-verify-cc`: A POSITIVE CONTROL MUST MATCH THE POPULATION'S *SIZE*, NOT ONLY ITS *STREAM*.** Six controls - right stream, right field, right kind, all passing - all a few hundred characters against a median of 2,300. **The controls were correct and the conclusion was false, because they were the wrong SHAPE.**

**The alert-marker suppression fix.** A marker naming CC-C matched nothing, so **no session was silenced** and an alert owned by one woke others.

---

### ★★ THE FIFTH, AND THE LARGEST: BOTH ALWAYS-LOADED FILES WERE ARRIVING AT ~10% OF THEMSELVES
**Found by CC-C, not by me, and not by any check in this batch — he noticed he had closed two batches without the report-format header and traced it back rather than assuming he had forgotten.**

**THE MECHANISM.** A `SessionStart` hook whose stdout exceeds **~10 KB is not delivered**. The harness persists it to disk and injects a **~2 KB preview**, **while still logging `hook success`** — that line reports the hook’s **exit code**, not delivery. `CONDUCT.md` (~23 KB) and every `MEMORY_CC_*.md` (~21 KB) had therefore been arriving truncated **on every start, resume and compaction.** Of 140 persisted hook outputs on this machine, **every single one** was one of those two files.
⛔ **WHICH MEANS THIS BATCH’S OWN PREMISE WAS PARTLY FALSE WHILE IT RAN.** `B-CONDUCT-FILE` closed five days earlier claiming the behavioural rules now *"arrive BEFORE you act."* **They did not.** §6 (the report format Kyle had asked for repeatedly), §6b (self-review), §13 (recurring mistakes) all sit past the cutoff and **had never once reached a session.** ★ **That also retires a mystery this project kept re-explaining as a discipline problem** — sessions were not ignoring the report format; **they were never given it.**

**FIXED under `B-CONDUCT-DELIVERY-HOTFIX`** (separate batch, Langston-approved at `32d2f0f44`): both loaders slice on line boundaries into registered chunks, each under the ceiling.
⚠️ **AND MY FIRST CEILING WAS WRONG, from the wrong instrument** — I binary-searched using **Bash tool** output and applied that number to **hooks**. Different limits. The next session start showed 11 KB chunks still persisting. **`wrong-object` again: right method, wrong channel.**
★ **THE PROPERTY THAT MAKES IT SELF-REPORTING, and it is Langston’s design, not mine:** every chunk’s first line is a manifest — `[CONDUCT 1/4 · 6992 B · 6992/6919/6885/2903]` — printing **`slices.length`, the TRUE total, never the registered count.** A manifest keyed to the registered count would read `4/4` while a fifth chunk went nowhere: *the original defect wearing the fix’s clothes.*
**PROVEN AT A REAL SESSION START:** 8 of 8 chunks inline, nothing persisted, 0 source lines missing from either file.

★ **THE GENERALISABLE RULE, recorded because this is the THIRD instance of the class in one week** (Langston’s 900-second invocation ceiling — #741; the 400-character alert-marker truncation): **AN ALWAYS-LOADED FILE MUST NOT EXCEED ITS CHANNEL’S DELIVERY CEILING, AND THE CEILING MUST BE MEASURED ON THE CHANNEL, NOT A LOOKALIKE.** All three share one shape — **a silent ceiling on a delivery path, where the sender’s success signal reports something other than arrival.**

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
- **#739/#740/#741 all need mechanisms, not procedures** — homed to `B-RULES-1e`, CC-A, **queued** — ⛔ no batch due dates (§9.4, Kyle 2026-08-25).
- **The crew-board CODE is not removed** — only the two rules. Homed to `B-CREW-BOARD-REMOVAL`, CC-A, **queued behind Infra Claude’s onboarding — gated on KYLE, not on a date.**
- **Infra Claude’s onboarding is deferred by Kyle**, deliberately — named so it is not lost. ★ **His “1-2 weeks” was an ESTIMATE, not a commitment, and is recorded as one.**
- **Langston's clearance covers the repo artifact, NOT the laptop deployment.** The wake filter's live twin is off his filesystem.
- **A KNOWN, HOMED GAP IN THE SAME FILE:** the marker path now reads the untruncated body, but the **other** match sites still read the 400-char string. Langston measured **~118 of 2,820 of his non-marker replies name a CC only past byte 400** (~4%) - they wake nobody, **failing toward SILENCE, not noise.** The comment asserting a global invariant was narrowed to the marker path rather than left overclaiming. **Sweep homed: `B-CREW-BOARD-REMOVAL`, CC-A, queued.**
- **BOARD, and I got this wrong:** I told Langston I had "found no card" **without having looked.** Both cards exist - `B-RULES-1c` (`PVTI_lAHODmulEM4BfQP4zg1qnO4`) and `B-RULES-1d` (`PVTI_lAHODmulEM4BfQP4zg1X8Ig`). **An asserted absence with no check behind it is the exact class this batch spent the day fixing.** Both moved to `Governance`, `Blocked on = Kyle`, read back to confirm.

---

## 8. GOVERNANCE FILES CHANGED

`CLAUDE.md` · `CONDUCT.md` · `.claude/skills/workflow-*/SKILL.md` (12) · `.claude/hooks/{fresh-rules,guard-push-tsc-baseline}.mjs` · `scripts/check-tsc-baseline.mjs` · `comms-infra/laptop/cc-wake-filter.py` · `1-system-manual/{RUNNING_ISSUES,MISTAKE_PATTERNS,DELETED_COMPONENTS_LOG,ALERT_HANDLING_PROTOCOL,COMMS_BRIDGE_RUNBOOK,CLAUDE_CODE_FEATURE_WATCH,BATCH_CATALOG,PHASE_HISTORY,PHASE_19_PLAN}.md` · `1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md` · `Claude Comms and Packages/Langston/BOOTSTRAP.md` · `.claude/memory/{MEMORY,MEMORY_CC_A}.md` · this report.

**SIM and SYSTEM MANUAL judged NOT APPLICABLE, explicitly:** no component added, removed or re-keyed; no architecture, strategy, regime, filter, signal-pipeline or math change. This batch changes **how sessions are instructed**, not what the system does.
