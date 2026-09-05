# B-WAKE-QUIET — COMPLETION REPORT

**Batch:** `B-WAKE-QUIET` · **owner:** CC-A (OLD Claude) · **issue:** `#995` · **plan row:** `PHASE_19_PLAN` 4.5
**change-class:** `non_architecture` · **closed:** 2026-09-05
**Langston:** Step 4 APPROVED at `fc0aaf174` · Step 8 CONFIRMED at `80936b434` (with a required correction, applied)
**CI:** run `33870742602`, 4/4 green **verified per job** · **Step 6:** recorded NOT-APPLICABLE, Kyle-approved (`ce7c4979a`)

---

## 1. WHAT THE BATCH WAS FOR

Kyle flagged on 2026-09-03 that the sessions talk too much — a running narration of their own work in his chat. `CONDUCT.md` §5 already forbids exactly that. **The batch's job was to find out why a loaded, current, explicit rule was not being followed, and to fix it.**

## 2. ⛔⛔ THE RESULT IS NEGATIVE, AND IT IS THE MOST USEFUL THING HERE

**Starting measurement:** all three sessions answered **~97% of automatic wake events with text**. `CONDUCT.md` was loaded in every session and **byte-identical to origin in every clone**; no setting had changed. **Nothing was broken. The rule was simply not followed.**

**Three fixes of INSTRUCTION shape were tried and measured. All three failed.**

| attempt | measured result |
|---|---|
| the rule as written, in the always-loaded conduct file | **96–98% speak rate** |
| the same rule restated more emphatically | no movement |
| ★ an instruction delivered **at the moment of the event**, inside the wake line itself | **0.5%** and **11.8%** compliance, on two separate instructions |

⇒ ★★ **THE ONLY INTERVENTION THAT CHANGED THE BEHAVIOUR WAS NOT DELIVERING THE EVENT.**

⚠️ **The third row is stated carefully, because its first version was wrong and Langston struck it.** My original compliance proxy measured the **consequent of a conditional** ("re-arm only if dead") — where near-zero is what obedience looks like, not disobedience. **The 11.8% (47 of 400) rests on the UNCONDITIONAL sweep instruction**, which is the only one where non-compliance is unambiguous.

## 3. WHAT SHIPPED

| # | objective | outcome |
|---|---|---|
| OBJ-1 | `CONDUCT.md` onto the escalated push notice **and** `fresh-rules.mjs` | ✅ `ff339aa5b` — it was on **neither** while being injected at every session start from a local copy nothing refreshed |
| OBJ-2 | the rule-history archive off the escalation list | ✅ |
| OBJ-3 | the issues ledger off the escalation list (**Kyle's call**) | ✅ — that alarm was **73% false**, interrupting mid-task on ledger edits. ⛔ **Langston condition: RE-OPENED if `B-ISSUE-BLOCK-GUARD` (`#745`) drifts** |
| OBJ-4 / 4′ | deliver *act-don't-report* at the event | ⛔ **STRUCK WITH EVIDENCE** — see §2 row 3; and the premise (that silence was unreachable) was refuted by a fresh reader: 4,756 wake turns, 37 text-free |
| OBJ-5 | — | ⛔ **STRUCK WITH EVIDENCE** |
| OBJ-6 / 6′ | conditional heartbeat | ⛔ **STRUCK WITH EVIDENCE — the heartbeat is delivered THROUGH the watcher it reports on, so it cannot detect a dead one.** Its only absence-signal is regularity, which conditional firing destroys. Re-homed as `B-HEARTBEAT-RESCOPE` (`#999`, row 4.7) |
| OBJ-7 | the alarm's recovery recipe | ✅ `9d1f1c7b4` — it taught a bare `git checkout <ref> -- <path>`, which writes the **index** as well as the worktree, so following the message staged origin content under a path the session recognised as its own |
| OBJ-8 | ship the measurement as a committed instrument | ✅ `scripts/analysis/wake_narration.py` + pre-/post-cut baselines — **so the numbers are second-party re-derivable rather than reported** |
| OBJ-9 | put `dt-push-notice.sh` in the repository (**Langston's blocker**) | ✅ `d971f9d81` — it had **never** been committed, so the reviewer could not read the object the batch was editing. Plus its installer line and a deployed-vs-committed drift check |
| OBJ-10 | cut the all-clear hourly heartbeat wake | ✅ `cb9c14c89` (Kyle: "Yes, cut both") |
| OBJ-11 | cut the duplicate alert-owner wake | ✅ `cb9c14c89` |

**Both cuts are content-keyed and fail SAFE: anything that is not exactly the recognised routine shape is DELIVERED.** A reworded future heartbeat wakes everyone, deliberately. A heartbeat reporting a dead or partial bridge still wakes. **13 behavioural test cases, one subprocess per case, all pass** — and the harness aborts loudly if it emits nothing, because three earlier hand-fed filter tests read PASS while processing nothing at all.

## 4. ⛔ THE CORRECTION LANGSTON REQUIRED AT STEP 8 — CARRIED IN EVERY RECORD

I published *"28 alert markers posted, 0 delivered as wakes"* as evidence the cut worked. **It was a tautology.** The instrument classifies on the literal `WAKE[ALERT-OWNER` label, and OBJ-11 deleted the print that emits it — **so the zero could not have come out any other way.**

**His re-derivation is the figure that stands: 28 markers across 25 messages, of which 21 still wake their owner through the prose-name fall-through. Only 4 were marker-only.** ⇒ **the cut's real reach is roughly one seventh of what I claimed.** Recorded in `MISTAKE_PATTERNS.md` (`wrong-object`), in the System Impact Map, and in `ALERT_HANDLING_PROTOCOL.md`, where it changes the operative instruction: **if you want the owner woken, name them in the prose.**

## 5. ⛔ THE GOVERNANCE FAILURE THIS BATCH COMMITTED, STATED BY THE BATCH

**STEP 2 WAS SKIPPED.** No pre-audit existed until Step 10, when the tier ledger's `PRE_AUDIT` row asked for one and there was nothing to point at. **This is the `#754` shape: `1 → 3` reads as a smooth sentence in prose and as visibly wrong only as numbers** — and the batch's memory position block never carried the numeric `STEP: N of 11` field that exists for exactly this.

**★ THE PART WORTH KEEPING IS THAT THE TRIPWIRE BUILT FOR THIS COULD NOT SEE IT.** `MISTAKE_PATTERNS.md`'s second tripwire greps commit messages for confessions. **Measured against this batch's own 22 commit messages (33,028 bytes): ZERO hits; positive control on a phrase known present: 49.** ⇒ **its stated limit is now measured rather than predicted.** What caught it was **a slot in a table that cannot be left blank.** Filed at `#1005`; `#754`'s unbuilt checker legs return to priority, homed on `B-GATE-GUARD` (`#744`).

A retrospective pre-audit is written and **labelled on its first line as not having gated the implementation.** ⛔ **It may not be cited as though it did.**

## 6. 🟨 FINDINGS THAT OUTLIVE THE BATCH

- **`#1001` — staging ran 55 commits behind the review branch, with `active-execution-engine.ts` and `signal-orchestrator.ts` undeployed, while active paper trading was on.** Found by accident, by this batch checking whether its own inert files needed shipping. Routed to CC-C, who owns both in-flight batches. **DISPOSITION: added to the owner's work, not adopted.**
- **`#1002` `B-DEPLOY-DRIFT-LINE` — nothing compares the deployed sha to the branch head.** The deploy gate checks the deploy *event*; the daily check compares the *record* to the *live machine*. **Neither notices the branch moving on afterwards**, which is how every check read green throughout. **DISPOSITION: own batch, placed at `PHASE_19_PLAN` row 4.55, ahead of 4.6 on Kyle's direction.**
- **`#999` `B-HEARTBEAT-RESCOPE` — `_HEARTBEAT_BAD` is a hand-written word list, and every live delivery came through its `STALE` arm, six of them matching the word inside a negation.** **DISPOSITION: own batch, row 4.7** (Langston's condition: *"'its own small piece' isn't a home. Give it a row."*).
- **`#998` `B-RULES-LAYER` — our behavioural rules sit in the weakest available layer, and the vendor documents that adherence falls as the rules file grows.** **DISPOSITION: own batch, row 4.6, Kyle-directed to follow this one.** ⚠️ **Its failure condition is pre-registered: it is a fourth instruction-shaped attempt and differs from the three failures only in WHERE the instruction lives.**

## 7. WHAT IS UNPROVEN, STATED AS UNPROVEN

- **The estate is heterogeneous by construction.** A running Monitor holds the code it armed with, so both cuts are inert for any session that has not re-armed. `B-HOOK-ESTATE-VERSION` (CC-C) owns that class.
- **The speak-rate has not been re-measured post-cut over a full window.** The cuts remove *events*; whether the residual wake population produces a materially lower narration volume is the question `B-RULES-LAYER` inherits, and its instrument is the one this batch committed.
- **The measurement counts turns that produced text. It does not measure whether the text was worth having** — and a named dissent (that the narration keeps a long session coherent) is recorded unrefuted in `#998`.

## 8. ⛔ TIER LEDGER — TRANSCRIBED FROM THE GOVERNANCE COMMIT

**CHANGE-CLASS: `non_architecture`** — evidence: the batch's **26 files touch nothing under `server/`, `client/` or `shared/`**.

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | Full entry — the negative headline, what shipped, what was struck with evidence, and the skipped Step 2. |
| T1 | `PHASE_HISTORY.md` | ✅ | Dated narrative entry in plain language, including both failures rather than only the fixes. |
| T1 | `PHASE_19_PLAN.md` | ✅ | Row 4.5 closed with refs; rows 4.55 / 4.6 / 4.7 already placed in-batch. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_A.md` | ✅ | Consensus truth added (no instruction-shaped fix works; do not propose another rule); CC-A position block updated. **Both under cap: 23,916 B and 24,527 B against 24,576.** |
| T1 | the batch `SCOPE` | ✅ | `B_WAKE_QUIET_SCOPE.md` at r3, carrying the struck objectives with their evidence. |
| T1 | the batch `PRE_AUDIT` | ✅ **with a stated failure** | Written **RETROSPECTIVELY at Step 10** and labelled as such. ⛔ **The batch skipped Step 2 — `#1005`.** Not `N/A`: the class is right, the step was missed. |
| T1 | `COMPLETION_REPORT` | ✅ | This document. |
| T1 | Langston's `/home/langston/MEMORY.md` | ✅ | Synced in the same turn. ⚠️ **Live size read at the box: 222 lines / 65,056 B against his bytes-first ~24 KB cap — 2.6× over.** The trim is `#946`, **Infra Claude's**, not mine. |
| T2 | `SYSTEM_MANUAL.md` | N/A | Nothing under `server/` changed — no architecture, strategy, regime, filter, signal-pipeline or math surface is in the 26 files. |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | Three content updates: the `fresh-rules.mjs` row (`CONDUCT.md` added), the `dt-push-notice.sh` row (repo-canonical + drift check), and a new block for the two wake cuts with Langston's corrected reach. |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#995` closed; `#1005` opened against myself; `#1001` / `#1002` / `#999` / `#998` filed in-batch. |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | `FIX-2026-09-05-A` — the recovery-recipe defect, the three-version drift check, and the syntax error that reached a live 2-minute cron. |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | No phase-level change: every item this batch produced is placed as a `PHASE_19_PLAN` row (4.5, 4.55, 4.6, 4.7). |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | The diff changes no threshold, coefficient or parameter — no file under `server/core/` is in it. |
| T2 | `AUTHORITY_BASELINE.md` | N/A | No constitutional or authority boundary moved; the one exception granted is recorded in `GOVERNANCE_EXCEPTIONS.md` instead. |
| T2 | `STORAGE_POLICY.md` | N/A | No table, column, retention tier or migration in the diff — nothing under `drizzle/` or `shared/schema`. |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | No asset-class surface: nothing under `server/asset_classes/` is in the diff. Its xStock 15-minute-bar working list was reviewed and is unchanged by this batch. |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | No onboarding learning surfaced — the batch touched comms and session tooling only. |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | ✅ | The negative result is a **method** finding and is written up portably: a rule the agent can read is not a rule the agent follows, with the three measured failures and the two honest caveats. |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | His build is untouched — no model, runtime, invocation, read path, auth or file of his is in the 26. *(The CLI-version finding sits in `CLAUDE_CODE_FEATURE_WATCH.md`, Kyle-pending, and is not a build change.)* |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | Neither file is in the diff. `CONDUCT.md` was **added to two watch lists**, not edited — no rule text changed. |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | Follows from the row above: no `CLAUDE.md` rule was added or materially changed. |
| T2 | `DELETED_COMPONENTS_LOG.md` | N/A | No component removed. The two cuts remove **behaviour inside two surviving files** (`cc-wake-filter.py`, the notice body); no file was deleted or stubbed. |
| T2 | `MISTAKE_PATTERNS.md` | ✅ | Seven instance rows across four slugs (`wrong-object`, `silence-not-evidence`, `fix-follows-pointer`, `hook-blind-compound`), plus the **`#754` step-skip tripwire hit** with its measured grep result. |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | Kyle's approval to record Step 6 as NOT-APPLICABLE, with the reason it is narrow and is not a precedent for infra batches skipping deployment. |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | ✅ | The owner marker is now a **suppressor only**; the operative instruction changed to *name the owner in the prose*, carrying Langston's corrected 21-of-28 figure. |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | The board's columns, fields and ownership are unchanged; only this batch's card moved. |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | ✅ | The 2026-09-04 run-log row and two dedup rows landed during this batch — Fable 5.1 blocked by a **CLI version gate, not an entitlement**, and Langston's CLI ~100 releases behind. *(Committed by the scheduled task itself, not by this batch's commits.)* |
