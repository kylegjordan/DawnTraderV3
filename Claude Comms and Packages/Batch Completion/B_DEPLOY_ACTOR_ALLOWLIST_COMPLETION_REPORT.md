# B-DEPLOY-ACTOR-ALLOWLIST — COMPLETION REPORT

**Owner:** CC-B · **Issue:** `#656` residual · **Plan row:** `PHASE_19_PLAN.md:498` (`2.4a`) · **change-class:** `non_architecture`
**Deployed:** `a4bcbe3c1bf45efb0c92942e9ab83a03a35c9556` @ 2026-09-04T19:40:02Z, `deployed_by_claimed=cc-b`, engine resumed. **Rollback sha:** `f8870022f`.
**CI:** run **`33911423728`** at that exact head — **4/4 per job**: Build ✅ · TypeScript Check (baseline gate) ✅ · Test Suite ✅ · Docker Build ✅.
**Langston:** Step-1 APPROVED w/ conditions · Step-2 APPROVED w/ condition · Step-4 APPROVED w/ three conditions · **Step-8 CONFIRMED, every check reproduced by him on the box.**
**No progress report exists for this batch** — there was no observation window, so this is written fresh rather than converted.

---

## ⛔ OPEN AT CLOSE — STATED AT THE TOP, NOT BURIED

**`#1004` — the sanctioned deploy path's own executable is not derived from the reviewed ref.** Opened by this batch, **deliberately not closed by it.**
- **Owner:** unassigned. **Home:** `P19-B12`, alongside `#652` and the `#649` installed-copy carry.
- **Closing condition:** the existing comparator at `daily_deploy_check.sh:33-38` is **scheduled and alerting** — it already compares the installed `sha256sum` against the blob at the recorded sha and prints MATCH/DIFFERS. Measured with controls: **0 crontab entries and 0 systemd timers name it**, against 11 live DawnTrader cron jobs and 25 timers on the same box.
- **Failure condition:** a future `dt-deploy` change reaches staging with `/usr/local/bin/dt-deploy` still holding the previous version and nothing reporting it.
- ⚠️ **Interim state, and it is held by hand:** installed manually at Step 7; old copy at `/root/dt-deploy.pre-b-deploy-actor-allowlist-20260904`. **Langston verified three-way hash identity independently: repo blob = clone = installed = `6dbfe2dd`.**

---

## 1. OBJECTIVES

| # | objective | verdict | evidence |
|---|---|---|---|
| **OBJ-1** | `--by` validated against the canonical actor set, exact after trim + lowercase, refusal names the set | **YES** | **On the box:** `cc-analyst` and `'langston (reviewer)'` ACCEPTED; `cc-session-2026-09-04` REFUSED naming the six. Langston reproduced all of it. |
| **OBJ-2** | the record stores the **canonical** value, not the raw input | **PARTIAL — code-read verified, not live-proven** | `BY="$BY_CANON"` precedes both the lock-holder write and the record write; Langston confirmed the ordering at the object. ⚠️ **No live proof an ALIAS lands canonicalised — my deploy used `cc-b`, which is canonical either way.** See residual. |
| **OBJ-3** | usage string names the real set, including `cc-infra` | **YES** | `dt-deploy` with no args prints `<cc-a\|cc-b\|cc-c\|cc-infra\|kyle\|langston>`; fenced by the parity test |
| **OBJ-4** | the record-line parseability guarantee **preserved, not replaced** | **YES** | Re-expressed as a **property of the table** asserted in the parity test, with a positive control proving it discriminates. *(Langston: an output-side runtime guard would be unreachable by construction and deleting it would change nothing.)* |
| **OBJ-5** | `#987` carry-forward — date the bare `782 rows` comment | **YES** | The comment now carries its measurement date and an instruction to re-measure rather than quote it |

**Plan items P1–P7 all landed.** P7 was added mid-batch to fix `#1000`.

---

## 2. WHAT SHIPPED

`dt-deploy --by` was validated **by SHAPE ONLY** (`^[A-Za-z0-9_-]{2,24}$`), so `cc-session-2026-09-04` passed and `deployed_by_claimed` was free text one namespace over from the alert file `#987` had just fixed. It is now an exact match against a **13-key table DERIVED from `ALERT_ACTORS` where `tag !== 'machine'`** — six deployers plus seven aliases — **total: canonical value or refuse, with no pass-through arm.** Refusals name the set and **never echo the rejected value**, at all five sites. Parity is fenced **fail-closed**.

★ **The derivation is the point.** A hand-listed six is right today and silently wrong the first time a machine actor is added.

★ **The provenance read changed the framing.** The charset check was written to keep the record's `key=value` line parseable and its own comment says so. It was **never an identity allowlist** — so this is §9.4 disposition (2), an extension to today's intent, **not a defect in what was built.**

---

## 3. NEW FINDINGS — both investigated to a settled disposition

### `#1000` — RESOLVED HERE. The actor gate `#987` shipped two days earlier was not total.
`normaliseAlertActor` ended with a lookup on a **plain object literal**, so it fell through to `Object.prototype` and `??` never saw the inherited value. **Executed, not reasoned about:** `constructor` returned the `Object` function, passed the gate, and `JSON.stringify` then **dropped it** — the row landed with **no `acknowledged_by` key at all**. ⇒ **an ABSENT attribution inside the gate built to prevent free-text attribution.** Fixed with two independent guards; **mutation-proved** — restoring the defect turns four tests red. **Reachability is low and is stated as low:** nobody types it at a CLI; the API route takes `by` from a request body. **No occurrence claimed in the live file — it was not enumerated.**

### `#1004` — OPENED, not closed. See the block at the top.
**`a4bcbe3c1` — the commit that makes the deploy actor set canonical — was itself deployed by the old free-text gate.** Langston ruled it **its own PROVENANCE class**, not an amendment to `#649`'s BYPASS class: an amendment would inherit `#649`'s disposition and close with it. **Name the class, not the file** — any repo-tracked executable installed outside the tree; `langston-call` and the Discord bridge are known instances.

### The `mkdir` wrong-cause message — DISPOSITION 2, added to `P19-B12`, deliberately not folded.
`dt-deploy.sh:84` treats any non-zero `mkdir` as lock-held, so a missing parent prints the full tier-3 stale-lock protocol for a lock that does not exist. Low severity on staging. **It is `#649`'s lock and out of scope per the audit's §7.**

---

## 4. ⛔ NUMERIC DELTAS AND CORRECTIONS

> **PREVIOUSLY STATED:** *"three deploys, three spellings, three sessions."*
> **NOW:** **five recorded attributions, three sessions, FOUR distinct spellings** — and **two of them are the same session one day apart.**
> **REASON:** I attributed one spelling per session by inference from the string. CC-C corrected it; re-derived at the objects.

> **PREVIOUSLY STATED:** *"the record holds one row, so there is no historical population"* (mine) and *"3 of 3, saturated"* (Langston's).
> **NOW:** **both withdrawn.** The completion reports transcribe every `--by`, and that corpus persists and is re-derivable.

> **PREVIOUSLY STATED:** *"the deploy path installs from the blob at the deployed sha, so this reaches the box on the first deploy AFTER it lands"* — asserted three times, through two of Langston's reviews.
> **NOW:** **FALSE. `dt-deploy` does not install itself.**
> **REASON:** the System Impact Map's `#649` entry says the installed copy is *"installed … from the git blob at the deployed sha"*. **I read a PROVENANCE statement as a MECHANISM statement.** It says where the bytes came from, never that the deploy puts them there. **It survived because nobody executed it**, and Langston repeated it in his own Step-7 instruction — **my unverified claim propagated into his ruling.** Corrected at all three of its homes, with the original wording preserved as a quotation.

> **PREVIOUSLY STATED (mine):** *"that is the `P19-B12` drift check, unbuilt."*
> **NOW:** **the comparator EXISTS, in a script I wrote myself** (`daily_deploy_check.sh:33-38`), and it had the reach — it would have said DIFFERS. **Only the schedule is absent.** An asserted absence about my own tooling.

> **PREVIOUSLY STATED (mine):** *"every `dt-deploy` change in this project's history has needed a manual install step"* — implying months of silent drift.
> **NOW:** **not measurable where I pointed, and smaller than I implied.** The record holds one row, overwritten per deploy. The Aug-6 backup **hashes exactly to `d0e4a65f1`'s blob**, so that copy was current for its era, and the script did not change between then and `b054b8e62` — **drift was structurally impossible in that window.** ⇒ **an invariant held only by unrecorded human habit, correctly maintained twice.**

---

## 5. GOVERNANCE FILES CHANGED — transcribed from the Step-10 tier ledger, `N/A` rows included

**CHANGE-CLASS: `non_architecture`**

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | Full entry — what it did, why the derivation matters, the two issues that outlived it |
| T1 | `PHASE_HISTORY.md` | ✅ | Dated entry carrying the provenance-vs-mechanism method note |
| T1 | `PHASE_19_PLAN.md` | ✅ | Row `2.4a` closed with the deployed sha and the three issue outcomes |
| T1 | shared `MEMORY.md` + `MEMORY_CC_B.md` | ✅ | Deploy identity canonical; the warning that `dt-deploy` does not install itself |
| T1 | the batch `SCOPE` | ✅ | r2, plus the Step-7 correction applied at its own home |
| T1 | the batch `PRE_AUDIT` | ✅ | r5 — Langston's locator condition, re-derived before applying |
| T1 | the `COMPLETION_REPORT` | ✅ | This document |
| T1 | Langston's `/home/langston/MEMORY.md` | ✅ | Batch close, his rider verified live, both of his record corrections |
| T2 | `SYSTEM_MANUAL.md` | N/A | No file under `server/` changed strategy, regime, filter, pipeline or maths — the diff is a shell script, an identity validator and two tests |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | `#649` entry corrected: the install is manual; the comparator exists but is unscheduled |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#656` residual closed, `#1000` resolved, `#1004` opened |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | The shape-only risk closed, with the replacement risk named |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | No phase-level change; the item was placed in the Phase 19 plan |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | No trading parameter, threshold or risk knob in the diff |
| T2 | `AUTHORITY_BASELINE.md` | N/A | The batch narrows *identity*, not authority — who may deploy is unchanged |
| T2 | `STORAGE_POLICY.md` | N/A | No table, retention tier or partition touched |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | ✅ | Working-list review recorded — no status changes, reason checkable against the diff |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | Nothing asset-class-specific; the diff is class-agnostic tooling |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | No role, gate or gate-order changed; the method lesson landed in `MISTAKE_PATTERNS.md` |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | His model, runtime, invocation, read path, auth and files are unchanged |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | No stable rule changed — this batch applied existing rules |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | Conditional on a `CLAUDE.md` change; there was none |
| T2 | `DELETED_COMPONENTS_LOG.md` | N/A | Nothing removed — the check at `:81` was replaced in place |
| T2 | `MISTAKE_PATTERNS.md` | ✅ | Two trailers, plus the duplicate row-6 collision renumbered |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A | No exception sought or granted; every gate ran |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | The ack/resolve process is unchanged — `#1000` fixed a validation defect without altering documented behaviour, and the protocol points at `ALERT_ACTORS` rather than restating it |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | No column, field or ownership rule changed |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | The daily model check did not run in this batch |

---

## 6. HONEST RESIDUAL — what this batch did NOT establish

1. ⛔ **No live proof that an ALIAS lands canonicalised in the record.** Langston's stated residual. `BY="$BY_CANON"` is code-read verified and he confirmed the ordering, but my deploy used `cc-b`, canonical either way. **The next deploy by any session using an alias settles it** — worth one look at the record afterwards.
2. ⛔ **The installed copy is correct because I installed it by hand.** Nothing enforces that it stays correct. That is `#1004`.
3. ⚠️ **The parity test fences the TREE, never the box.** Langston's standing instruction, recorded here so it is not lost: **nobody may cite the tree test as evidence that the installed copy refuses.**
4. ⚠️ **`MEMORY_CC_B.md` remains over its 24,576 B cap** — 141 B smaller than at batch start, so not worsened, but still ~3.9 KB over. The structural fix (several `★FEEDBACK` entries are RULES that now duplicate `CLAUDE.md` rule 29, so they should become pointers) needs coordination on a shared file and overlaps CC-A's `#998`. **Flagged, not done.**

---

## 7. WHAT THIS BATCH COST AND WHY IT WAS WORTH IT

Five files, +316/−17, closing a residual that had been correctly recorded and left open since 2026-08-06. **The two things worth more than the change itself** are `#1000` — a defect in code shipped two days earlier, found only because a fresh reader was handed the claim rather than the conclusion — and `#1004`, which exists only because someone finally executed a sentence that four reviews had read.
