# B-DTREVIEW-ABSENCE-PROVENANCE — COMPLETION REPORT

change-class: non_architecture · owner Infra Claude · `#1181` · sprint plan row 1w1 · record of every step: `Claude Comms and Packages/Change Lists/B_DTREVIEW_ABSENCE_PROVENANCE_CHANGE_LIST.md`

## Open at close — stated first
**Nothing in scope is open.** One behaviour is **unproven live**, and that is not open work: a by-id fetch that actually transfers a side-branch commit the mirror lacks (the `served` arm). At test time all 135 origin branch tips were already in the mirror (my `ls-remote --heads` against `cat-file -e` at 12:36Z, and Langston's re-derivation at Step 8 through the API: 0 absent, 0 tags, 0 PRs). There was nothing to fetch. That arm is carried by T1 on a synthetic origin. Langston measured at Step 8 that GitHub **accepts** a by-id want for a real tip (rc 0, probe ref removed). That proves negotiation, not a transfer, and it may not be quoted wider. If the arm were broken, the output would be a refusal carrying its own provenance, never a wrong answer. **Evidence when it happens:** a `refs/dt-review/pins/<sha>` ref, counted with `git --git-dir=/srv/dawntrader-backup.git for-each-ref refs/dt-review/pins | wc -l`.

## What it was for
On 2026-10-08 Langston saw `dt-review` refuse `2bfe98d4d` as "not in the mirror" and filed it as a false absence (`#1181`). Objective 1 of the row, reproduce it, was done from his own session record on 2026-11-14 (`c0250099b`). The refusals ran at 06:59:54Z. The side branch was pushed at 06:55:23Z and reached the mirror on the 07:00:04Z sync pass, so the refusal was true. The "07:14Z / fourteen minutes" in the filing came from the refusal's own "last synced 14m ago". Langston withdrew the claim (his `LEDGER.md`) and ruled (b): keep the row for one change (Discord `1571115568788934797`). The real gap is that `dt-review` fetches only the review branch, so for up to 15 minutes after a side-branch push it says "not in the mirror", which is true, and a reader takes it as "not at origin".

## Objectives
| # | objective | result | evidence |
|---|---|---|---|
| OBJ-1 | a missed full-id pin is fetched from origin by id inside the lock hold, then served as today | **YES** (by its scope criterion; live transfer unproven, above) | T1: a side-branch commit absent before the call is served on the first call, with a pin ref; CONTROL: the installed-before copy (`445b6a505`) refuses it |
| OBJ-2 | three-way refusals; (a) only after a by-id fetch that ran and was refused | **YES** | T3 (synthetic) and `c` (real GitHub: `fatal: remote error: upload-pack: not our ref …`) give (a); T5 / d4 give "no origin check was made: the branch fetch was FAILED"; T6 the timeout wording; T4 / F3-9 the short-id wording; live (b) and (c) on the real mirror. Wording is "did not serve", never "does not have" (Langston Step-1 condition 1). |
| OBJ-3 | five-disposition read on every pin-miss branch | **YES** | pre-audit A.7: ten branches; R1 and R8 reworded, R10 extended, seven kept |
| OBJ-4 | the fetched commit does not depend on gc timing; no `--depth` | **YES** | T7: pin ref survives `reflog expire --expire=now --all` + `gc --prune=now`; CONTROL with the ref removed drops it; a `--prune "+refs/heads/*:refs/heads/*"` fetch keeps the ref; not shallow. T1/C-2: `--no-tags` writes exactly one ref and zero tags; CONTROL without it writes the tag. |
| OBJ-5 | latency bounded and stated | **YES** | own `PIN_FETCH_TIMEOUT=60` (plain assignment): worst hold 120 + 60 = 180 s against `dt-backup-sync`'s 300 s; a by-id round trip to GitHub 1.50-1.87 s (pre-audit A.4); `124` maps to the timeout wording (T6). T11 shows `9>&-` reaches the ssh grandchild (fd census, with a control). |
| OBJ-6 | shipped = committed and installed, installed sha256 = blob at the shipping head | **YES** | `deploy.sh --sha 87966ab3e… --only readers` (installer bytes = blob `d4787047…` at the sha), rc 0, 2026-11-14 12:34:51Z; `/usr/local/bin/dt-review` `d5ee2e2f…` → **`42c8ec1c…`** = the blob at `87966ab3e`, re-derived by Langston at Step 8 against the graded ref and the then-current head |
| OBJ-7 | docs follow the change | **YES** | System Impact Map, `LANGSTON_ARCHITECTURE.md` change log, Langston's own memory (written by him after the install); bridge prompt N/A (it keys on the unchanged `OFF-BRANCH:` prefix) |

## Steps
- Step 1 scope (`2df51fbc9`): Langston APPROVE WITH CONDITIONS (`1571121378738962435`), six conditions.
- Step 2 audit and plan (`6489caa3a`): APPROVE WITH CONDITIONS (`1571126004296974478`); C-1 to C-3 and the P8 fold folded at `3554c63ce`.
- Step 3 code `18a10e7e8`; Step 4 APPROVE WITH CONDITIONS (`1571135217438167187`); the amendment `87966ab3e` (holder count, T11 fd census, T6 claim corrected, pre-audit pointer) APPROVED (`1571141255281508527`).
- Step 5 CI run `43593983548` at `87966ab3e`: TypeScript Check (baseline gate), Test Suite, Build, Docker Build, all success per job (re-read by Langston from the API).
- Step 6 install 2026-11-14 12:34:51Z, Helsinki, from `87966ab3e`, attributed per `#1004`.
- Step 7 live first pass, (a) to (e), on the real mirror as langston. Step 8 Langston CONFIRM (`1571144016815202367`), every Step 5-7 fact re-derived.
- Step 9: no objective failed, so no iteration.
- Step 10 governance `bcfbbdbdf` (CI run `43596669139`, 4/4 per job).
- Step 11: this report.

## Tests
132 pass, 0 fail, on Helsinki as langston in `/tmp/dtr-test`. The suite was staged with the new copy, the baseline and r1-r6 (r6 = the previously installed blob). Mutants, each killed:
- removing `--no-tags` (T1-tags, T7-ctl and T10 fail);
- making the "did not serve" class never match (`c` and T3 fail);
- not mapping 124 to timeout (T6 fails);
- removing `9>&-` from the pin fetch only (T11 CONTROL shows fd 9 on the ssh grandchild).

## Numeric deltas
- **PREVIOUSLY STATED (scope OBJ-5): the extra fetch adds at most 120 s. NOW: its own 60 s bound, worst hold 180 s. REASON:** Langston's Step-1 condition 4 bounds the other lock holder; measured round trip 1.5-1.9 s.
- **PREVIOUSLY STATED (my Step-4 delta dispatch): `dt-review` +12/−2, tests +35/−2. NOW: +11/−3 and +34/−3** (`numstat 18a10e7e8..87966ab3e`). **REASON:** my count was wrong; Langston re-derived it.

## Governance files changed — copied from the Step 10 ledger (`bcfbbdbdf` commit message)
CHANGE-CLASS: non_architecture

| tier | document | verdict | line |
|---|---|---|---|
| R | scope | ✅ | written at Step 1 (`2df51fbc9`), unchanged since approval |
| R | pre-audit | ✅ | Step 2 (`6489caa3a`), conditions folded (`3554c63ce`), C-4 pointer fixed (`87966ab3e`) |
| R | completion report | ✅ | this file |
| R | BATCH_CATALOG.md | ✅ | entry added: why, what it built, verified, unproven live |
| R | PHASE_HISTORY.md | ✅ | plain-language entry added |
| T1 | SPRINT_TO_LIVE_PLAN.md | ✅ | row 1w1 → Step 10 of 11 (closed at this report) |
| T1 | PHASE_19_PLAN.md | N/A | no row there (not a P19-* batch) |
| T1 | shared MEMORY.md | N/A | no shared truth changed; Helsinki crew tooling only |
| T1 | MEMORY_CC_INFRA.md | ✅ | position line → Step 10 |
| T1 | Observation column | N/A | no observation window (KD-56 N/A, Langston Step 2) |
| T1 | session task lists | ✅ mine / N/A ×3 | row added to `CC_INFRA_SESSION_TASK_LIST`; the other three are not mine |
| T1 | Langston's MEMORY.md | ✅ (by Langston) | he wrote his two facts after the install, per his C-3 ordering (Step 8 `1571144016815202367`) |
| T2 | SYSTEM_MANUAL.md | N/A | crew tooling; no trading architecture |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | `dt-review` row: by-id pin fetch, three-way refusals, OFF-BRANCH holders; new row `refs/dt-review/pins` (writer, no automatic deleter, count and removal commands, nothing alarms on the count) |
| T2 | RUNNING_ISSUES.md | ✅ | `#1181` annotated built and installed; closes with this report |
| T2 | CHANGES_AND_FIXES.md | N/A | no trading bug or risk change |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase-level change |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | no parameter governance |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional change |
| T2 | STORAGE_POLICY.md | N/A | no retention tier; the pin namespace is recorded in the SIM |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | no VTS or xStock change |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no asset-class learning |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | method unchanged |
| T2 | LANGSTON_ARCHITECTURE.md | ✅ | change-log row 2026-11-14: before/after of his read path |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no stable rule changed |
| T2 | CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md change |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | nothing removed |
| T2 | MISTAKE_PATTERNS.md | N/A | no MISTAKE trailer this batch |
| T2 | GOVERNANCE_EXCEPTIONS.md | ✅ | declared-open row filed at the first code push (`9e76249b0`); flips to open-retired at close |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | unchanged |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | unchanged (card moved per protocol) |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | not this batch |

## New findings
- **Plan row 6 (`B-DISK-HEADROOM`) read "Step 4" while the batch was at Step 9**, so Langston could not find its owner and routed its open-batch reminders to OLD Claude by inference. Corrected at `853a7ab2b`. Langston confirmed the owner (Infra Claude) at the ref. DISPOSITION: folded (status cell corrected in place); no work owed.

## Honest residual
- The live by-id transfer (above).
- The `served` and `present` arms that end in exit 3 have no test. Langston accepted them on inspection at Step 4: they are reachable only by a race or by a non-commit served by id. Per `#661` leg 3, silence on those arms is not evidence that they fire.
- T11's clean arm would false-fail if a shell ever gave the stand-in's pipe fd 9. It measured fd 10 in both runs, so this is latent (Langston). The CONTROL arm carries the proof.
- The pin namespace has no automatic deleter and nothing alarms on its count. Its growth was not measured.
- The test harness's fixed `/tmp/dtr-test` is pre-existing and already homed at `#979` / `B-SHARED-TMP-ISOLATION`.
