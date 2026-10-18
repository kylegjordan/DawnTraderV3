# B-B75-EXPORT-COMPLETENESS (#1195) — COMPLETION REPORT (2026-10-18)

**Owner:** CC-A (OLD Claude). **Change-class:** `architecture` (scope header). **Plan:** `SPRINT_TO_LIVE_PLAN.md` §0a stage 3, in parallel with `B-XSTOCK-BAR-AVAILABILITY`'s observation window.
**Records:** scope `Scope Files/B_B75_EXPORT_COMPLETENESS_SCOPE.md` (r6, Step 1 approved on r5 `29d23c2e9`) · pre-audit `Scope Files/B_B75_EXPORT_COMPLETENESS_PRE_AUDIT.md` (r6) · change list `Change Lists/B_B75_EXPORT_COMPLETENESS_CHANGE_LIST.md` · verification `Scope Files/B_B75_EXPORT_COMPLETENESS_STEP7_VERIFICATION.md` (parts 1 and 2).
**Fresh reader:** none spawned for this report. Every load-bearing number cites the staging read that produced it, and ships `NOT RE-READ`; Langston re-derived the Step-8 legs.

## ⚠️ READ FIRST — WHAT THIS BATCH IS AND IS NOT

**FORWARD-ONLY. NOTHING IS RECOVERED, BY KYLE'S DECISION (option 3, 2026-10-17): recover nothing, record the gaps everywhere.**
- Every archive copy made from 2026-10-18 carries its proof. **On 2026-10-18, 4 of 576 copies are proven.** The other 572 are labelled as what they are: 568 `unverified-legacy` and 4 `gate-deployed-unrecorded`.
- **No scope item is left open.** The two placed follow-ups are listed under **Homes** below.

**FORWARD-BINDING CONDITION (Langston, Step 8, beside disposition 5 on the tier fence):** a cold copy inherits its warm copy's proof. That inheritance is held by **code and a comment, not the schema** — the tie trigger is deliberately tier-blind (it keys on `(source_table, partition_label)`). ⇒ **Any FOURTH writer that stamps `source-count-matched` on a cold row must insert its own evidence row or re-verify, and this is checked at that batch's Step 4.** `B-B75-EVIDENCE-TIER-FENCE` is **not** placed (Langston: "do not place").

**SUPERSEDES:** `Batch Completion/B_GOV_INTEGRITY_1_COMPLETION_REPORT.md:30` recorded the generic timestamp-only archive cursor as "deliberately kept". That record is superseded: the count gate (`B-B75-COUNT-GATE`) and this batch replaced the decision it described.

## WHAT IT WAS FOR

The nightly archive (B75) copies each old day out of the database, then deletes the original. From 2026-05-06 to the count-gate hotfix on 2026-10-16 the copy dropped rows at page boundaries, and nothing recorded which copies had been checked. So a short copy and a whole one looked the same, and each could be deleted against or reused as though proven. This batch makes every copy say how its completeness is known, requires proof before anything is deleted or reused, and makes the restore tool say so wherever it prints a count.

## OBJECTIVES

| obj | objective | result | evidence |
|---|---|---|---|
| OBJ-1 | The register: `completeness_basis`, four values, only `source-count-matched` proven, backfilled 568 / N / 0 / 0, and a falsifying control | **YES** | Census after deploy: 568 `unverified-legacy` · 4 `gate-deployed-unrecorded` · 0 · 0 (Step 7 part 1 §1). Census after the first night: 568 / 4 / **4** / 0 = 576 (part 2 §5). Falsifying control: the dry run's P5 refused a `source-count-matched` stamp with no evidence row (change list A6). |
| OBJ-2 | Stamped at write by every writer, in one transaction; the cold rotator carries the basis | **YES** (sweep: live; ctx lane and rotator: tests + dry run) | The 2026-10-18 02:15Z sweep (run_id `6f7ef0d4-990e-4766-b1f5-9ae9f346c81a`): each of its 4 new rows is `source-count-matched` with exactly one evidence row. ctx lane: unscheduled (`#169`), so proven by tests only. Rotator: `ON CONFLICT … SET completeness_basis = EXCLUDED.completeness_basis` in source; the dry run's P6b admitted a cold copy with the inherited basis. |
| OBJ-3 | The restore tool says so at the point of print | **YES** | Staging, read-only, both ways. **Unproven:** `context_bridge_log 2026-02` printed `rows(unproven)=29069 completeness=unverified-legacy`, a NOT-proven warning, and a sidecar with `proven:false` (part 1 §2). **Proven, 2026-10-18 ~03:15Z on build `f0abf8494`:** `crypto_perp_ohlc_1m 2026-09-16..17` printed `2026-09-17: rows=264960 completeness=source-count-matched` with no warning and a sidecar with `proven:true`, beside `2026-09-16: rows(unproven)=264960 completeness=gate-deployed-unrecorded` with its warning; `DONE … rows_proven=264960 rows_unproven=264960 unproven_objects=1`. Temp folder removed; the staging tree was clean after. |
| OBJ-4 | `STORAGE_POLICY.md` names the window, the cause, the decision, each value, and what `source-count-matched` does NOT mean | **YES** | `STORAGE_POLICY.md` §4.5 at `2307edb8b`. |
| OBJ-5 | Keyed alerts with a resolve edge at every site; machine actor `b75-retention-sweep` | **YES** (tests; not exercised live) | Behavioural tests for the key and class functions; the first night raised no alert, so no key was minted or resolved live (part 2 §6). |
| OBJ-6 | The plain lane names a count mismatch; the partition alert's promise rewritten | **YES** (tests) | Tests per wording; no mismatch occurred live. |
| OBJ-7 | Proof for every lane: evidence per export, writer literals replaced, build sha logged not refused | **YES** | Live: 4 evidence rows, each with its own `source_table`, tier `warm`, contract `text-ts-tiegroup-v1`, and source = exported = downloaded (part 2 §5). Tests: an xStock warm export keeps `XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT`; a replay with a different build sha keeps the first. |
| OBJ-8 | Proof, not presence, at every gate; no proof made by a re-export | **YES** (tests + dry run; not exercised live) | `decideExistingCopy` behavioural tests on every arm. The first night had no existing row for any label it processed, so the reuse and refusal arms had no live population (part 2 §6; Langston's bound stated before the run). |

**What the live night did NOT exercise, stated rather than implied:** the reuse arm and its recount, the refusal arms, alert minting and resolving, the plain lane's export (first eligible 2027-05-11), and the ctx lane. These rest on the tests and the staging dry run.

## CI AND DEPLOYS
- **CI, read per job (TypeScript Check, Test Suite, Build, Docker Build, all `success`):** `39029631884` at `fef7f0cc7` · `39031907558` at `7b078a343`.
- **Deploys:** `fef7f0cc7`, `dt-deploy --by cc-a`, 2026-10-17T11:44:52Z (migration ran 11:44:39Z). The Step-7 rehydrate fix `7b078a343` rode NEW Claude's deploy `162ae0537` (2026-10-17T13:03:42Z). The first night ran on `f0abf8494`, a descendant of both.
- **The Step-8 item-2 fold** (a log line at the plain lane that prints the full cutoff and says whether it is day-floored): see **Step-8 fold** below.

## STEP-8 FOLD
Langston's Step-8 item 2: the plain lane's log printed the cutoff as a date only, so the day-floored archive lane and the exact-cutoff delete-only lane read the same. The fix is one log string in `server/scripts/b75-retention-sweep.ts`, no behaviour change. **Langston PROCEED 2026-10-18 ~03:25Z** on the test leg, after two mutations: the old line restored fails the positive assertion; the new line kept with the old date-only form appended fails the negative assertion. It lands on migration with this report and rides the next deploy.
**Two limits of the test, recorded at Langston's direction:**
1. Both assertions match literal text in the source. So this exact date-only form cannot come back silently. Other spellings would pass unnoticed, such as `substring(0, 10)`, `split('T')[0]` or a local variable.
2. The positive assertion depends on how that line is formatted. Splitting the ternary across lines would fail it. That failure is loud, so it is a maintenance cost, not a defect.

## HOMES (§9.4)
- **`B-B75-SCRIPT-TEST-HARNESS` (`#1208`, CC-B)** — the four B75 scripts run `main()` at import, so their wiring is tested by source structure, not executed. `HOME: B-B75-SCRIPT-TEST-HARNESS, owner CC-B, placed in SPRINT_TO_LIVE_PLAN §0a stage 3, after B-B75-EXPORT-COMPLETENESS` (Langston, Step-4 gate C).
- **`#169` (Infra Claude)** — the context-bridge lane is unscheduled. This batch folds its gate into the shared decision; scheduling it stays at `#169`.

## NEW FINDINGS
- **The restore tool's row totals were concatenated, not added** (found at Step 7). The database returns a 64-bit count as text, and `+=` joined the strings (`029069`). The pre-batch total had the same defect. Fixed at the read site in `7b078a343`, probed on staging (`744960` for three days, correct). Folded into this batch.

## TESTS
- `server/tests/unit/b-b75-export-completeness.test.ts`: 51 named tests and 4 table-driven groups — behavioural for the decision, the evidence writer and the recount; structural for the script wiring (`#1208`).
- `server/tests/unit/b-xstock-bar-availability-archive.test.ts`: updated for the renamed table.
- **Caveat:** in one full-suite run 2 tests failed and passed on the next run with no change; their names were not captured. CI was green on both runs above.

## GOVERNANCE FILES CHANGED — copied from the Step-10 tier ledger

| tier | document | verdict | line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | entry added for the batch, flipped to CLOSED at close |
| T1 | `PHASE_HISTORY.md` | ✅ | 2026-10-18 entry added |
| T1 | `SPRINT_TO_LIVE_PLAN.md` | ✅ | §0a stage 3: the batch marked CLOSED with this report linked |
| T1 | `PHASE_19_PLAN.md` | N/A | not a `P19-*` batch, and it has no row there |
| T1 | shared `MEMORY.md` + `MEMORY_CC_A.md` | ✅ mine / N/A shared | mine: the position block and the batch's one-line history. Shared: no line added — the truth file already reads 24,641 B (LF), over its 24,576 B cap before this batch, and the rule's home is `STORAGE_POLICY.md` §4.5 |
| T1 | the batch `SCOPE` | ✅ | r6 |
| T1 | the batch `PRE_AUDIT` | ✅ | r6 |
| T1 | the `COMPLETION_REPORT` | ✅ | this file |
| T1 | the `Observation` column | N/A | the scope names no observe-then-decide window; the first night was Step-7 verification, done (part 2) |
| T1 | the four session task lists | ✅ mine / N/A ×3 | `CC_A_SESSION_TASK_LIST.md`: the batch closed; CC-B's `#1208` row was already added at `b283740cb` — N/A, not mine |
| T1 | Langston's `/home/langston/MEMORY.md` | ✅ | via `langston-memory-write`: one line on the close and the forward-binding condition; a closed batch's line (`B-DEPLOY-DRIFT-LINE`) collapsed to a pointer; 78,378 → 78,069 B, loaded set 155,326 → 155,017 B (still over the 143,856 B ceiling — row 2.8b, not this batch's) |
| T2 | `SYSTEM_MANUAL.md` | ✅ | the archive completeness rule (`2307edb8b`) |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | the register, the evidence table rename, the tie trigger, the shared decision (`2307edb8b`) |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1195` annotated and closed; `#169` folds; `#1208` opened and placed |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | `FIX-2026-10-17-A` |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | no phase-level change |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | no parameter or calibration value changed |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional change |
| T2 | `STORAGE_POLICY.md` | ✅ | §4.5: the window, the cause, Kyle's decision, the four values, and what proven does not mean |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | no VTS or asset-class change |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no onboarding learning |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | the method did not change |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | the reviewer's build did not change |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | no stable rule changed |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | no `CLAUDE.md` rule changed |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | the three removed resolve transports' use, the reused field, the `:703` short-circuit (`2307edb8b`) |
| T2 | `MISTAKE_PATTERNS.md` | N/A | six `MISTAKE:` trailers written on this batch's commits; they are collected at the weekly pass |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | the open row (`c5cae4462`, corrected `610a17bef`), closed at this close |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | ✅ | the sweep's keyed alerts and its machine actor (`2307edb8b`) |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | the board's columns and fields did not change |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | the daily check is not this batch's |

## HONEST RESIDUAL
- **Only 4 of 576 copies are proven.** The 572 others stay unproven forever, by decision.
- **"Proven" means the copy matches the table as it stood at export.** It does not prove the table held everything it should have — that is the recorder's question (`STORAGE_POLICY.md` §4.5).
- **The reuse, refusal, alert and ctx paths have not run live.** They rest on tests and the staging dry run.
- **The cost claim is one equal-row night on one table:** `crypto_perp_ohlc_1m`, 264,960 rows on both nights, ran 27,360 → 25,203 ms with the new read pass. The other three tables changed row count between nights, so they do not separate the two causes. The claim is "no measurable cost", not "zero cost".
- **The cold-inherits-warm rule is held by code, not schema** — the forward-binding condition above.
