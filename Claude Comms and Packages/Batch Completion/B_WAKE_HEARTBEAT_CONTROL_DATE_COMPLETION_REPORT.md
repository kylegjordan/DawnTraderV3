# B-WAKE-HEARTBEAT-CONTROL-DATE (#1162, sprint row 1q) — COMPLETION REPORT

✅ **CLOSED 2026-10-16 — Langston Step-11 CONFIRMED 20:28Z.**

**Owner:** CC-A (OLD Claude) · **Class:** `non_architecture` · **Reviewer:** Langston · **Code:** `10eacd39df34345d923fe31ac0b6b928b151a483` · **Installed:** 2026-10-16 18:58Z (laptop) · **Step 8:** CONFIRMED by Langston 20:20Z

## OPEN AT CLOSE — stated first
- **Waking a DEAD watcher, and the switch-driven push wake Kyle asked for on 2026-10-16**:
  - **Home:** row 1z `B-CODEX-FAILOVER-AUTOMATION` (`#731`, CC-A), which also carries three items from this batch:
    - an observer for the heartbeat task itself not running;
    - a notice when a watcher arms with no saved position;
    - a local `except` on the filter's `.control` write.
  - **Closes when** each lands with its own test.
  - **Fails if** any of those three still reads silent in a measured case.
- **The wake log has no bound**:
  - **Home:** `#1202`, `B-WAKE-LOG-BOUND`, row 1qa, after row 1q, CC-A.
  - **Closes when** a bound keeps the watchers' `(inode, offset)` positions valid.
  - **Fails if** a rotation or trim produces a false page or a lost line.
- **CC-B and CC-INFRA watchers are DEAD** (sessions closed). That is the owners' re-arm, not this batch. Until they re-arm, every hourly post carries `notify=True` from the watchers field.
- **The live non-regression of a genuine `NOT answered` page** rests on the test suite and Langston's positive control. It has not been exercised on live data, because no live session has yet missed a re-issued control.

**No scaffolding.** The capability is functional and was proven live (OBJ-1 to OBJ-5 below).

## WHAT IT DID
- **The problem:** the hourly heartbeat paged Kyle's phone five times on 2026-10-16 (08:16, 10:16, 11:15, 12:16 and 15:15Z), saying all four sessions had missed the daily check-in, while two watchers were alive.
- **The causes:**
  - **a restart misses the line.** A watcher re-armed after that day's control line starts from the end of the log and never sees it: stale state over 12 h, or no saved position (`cc-wake-filter.py:857`/`:871`);
  - **a model, not a measurement, decided "answered".** It was inferred from prompt text against the laptop's local date, while the token is UTC.
- **The fix:**
  1. A new script, `control_state.py`, decides each session's state from files and byte positions.
  2. It re-issues the day's control once to a watcher that started after its line.
  3. It pages only for a genuine miss or a broken check.
  4. The filter learned `CHECK FAILED` and `CENSUS-FAILED`, so every page also wakes the sessions (`NOTIFY ⊆ BAD`).

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED** (scope §4, Step 1): "The filter is untouched." **NOW:** one `_HEARTBEAT_BAD` line changed. **REASON:** Langston's Step-2 BLOCKER-1 (a true verdict, not a borrowed one) and gate A (field-scoped, plus CENSUS-FAILED). The scope and pre-audit were corrected class-wide at `10eacd39d`.
- **PREVIOUSLY STATED** (change list r1): 32 tests. **NOW:** 44. **REASON:** tests added for gate A, gate B and the persist blocker.

## OBJECTIVES (scope r5 §3)
| obj | result | evidence |
|---|---|---|
| OBJ-1 judge by file reads and an exact token; no local date | **YES** | the script reads `.control` `split()[0]` against `N` from the log, with issue on the issuer's UTC `D`. The discriminating fixture (yesterday's UTC token at 22:30Z → answered) passes. Live: the 20:15Z run read `CC-A answered; CC-C answered`. |
| OBJ-2 one re-issue per (alias, token, arm); the control still proves delivery | **YES** | live: the 19:15Z run wrote exactly two re-issues (CC-A at byte 90455, CC-C at 90485, re-derived by Langston on Helsinki), and both watchers answered through the normal pipeline. The third-arm bound and the rotation cases are tested. |
| OBJ-3 control `--notify` only on a genuine failure | **YES** | live: of the three post-install runs, only the 19:00 install run matches the control arm (Langston ran the regexes against the posted bytes). Suite P4 covers 87 paging and 55 quiet lines both ways, and all 9 paging kinds. |
| OBJ-4 ISSUER GATED BY / ISSUER NOT RUN | **YES** (tests) | fixtures for GATED (nothing written) and NOT RUN (paged on the second run); not exercised live |
| OBJ-5 the label set enumerated | **YES** | `SKILL.md` step 3 lists every emitted label (Langston enumerated the literals at gate B r3) |

## CI (per job)
Run `38950861585` at `10eacd39d`: TypeScript Check (baseline gate) **success** · Test Suite **success** · Build **success** · Docker Build **success**. These files are not exercised by CI. The batch's own suites, `scripts/analysis/test-heartbeat-control.py` (44/44) and `test-wake-filter-cuts.py` (35/35), were re-run by Langston at the ref.

## DEPLOY (laptop install, Step 6)
- **Files:** three, written from blob `10eacd39d`; sha256 of the live copies equals the blob's (LF-normalised).
- **Before:** the previous live copies equalled `4be562e14` and are backed up.
- **First run:** "Run now" at 18:58Z produced the one expected page (`CHECK FAILED - control record new`), announced to Kyle beforehand.
- **Sessions:** all four were asked to re-arm, to load the filter.

**No staging deploy:** nothing under `server/`, `client/` or `shared/` changed.

## NEW FINDINGS (outside scope, each settled)
- **A langston→root command path on Helsinki, closed.** `/var/log/cc-wake.log` is group-writable by `langston`, and a re-issue echoes a token read from that log into an SSH command to root. `TOKEN_RE` (`[A-Za-z0-9_-]+`) now refuses anything else. Langston flagged the severity at the Step-4 close.
- **`CENSUS-FAILED` reached nobody.** Step 2b reported it without `--notify`, and the filter suppressed it. It is now in the watchers arm and in step 3's slot list (gate A's folded item).
- **The W42 handover record broke the plan census at HEAD** (a capitalised "Handed over"). Fixed in this session, with a `verification-weaker-than-claim` trailer; it is not this batch's code.

## HONEST RESIDUAL
- Two scheduled post-install runs (n=2). They prove the install page does not repeat and that quiet states do not page. A genuine live miss has not occurred yet.
- **The `awaiting` bound lives in another program:** the filter's 12 h `STALE_S` turns a stuck arm into a restart from the log end, then a re-issue, then NOT answered at the third arm.
- **`issuer_fail` resets on a gated run**, so a straddling streak pages one run late.

## GOVERNANCE FILES CHANGED
CHANGE-CLASS: non_architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry: what broke, the fix, the result |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 1q) | ✅ | row 1q CLOSED with this report; row 1qa (`#1202`) and row 1z additions placed during the batch |
| T1 | PHASE_19_PLAN.md | N/A | the batch's row is sprint row 1q; no row there |
| T1 | shared MEMORY.md + MEMORY_CC_A.md | ✅ mine / N/A shared | mine: the position block at each step; shared: nothing in it describes the heartbeat control |
| T1 | the batch SCOPE | ✅ | r5, APPROVED at Step 1; amended at Step 2; corrected to the code at Step 4 |
| T1 | the batch PRE_AUDIT | ✅ | r2, APPROVED at Step 2 with its correction applied |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | the Observation column | N/A | scope r5 has no observation window; the outcome was proven over three live runs at Step 7 |
| T1 | the four session task lists | ✅ mine / N/A — not mine ×3 | CC-A: this batch closed, and the B75 hotfix line added |
| T1 | Langston's MEMORY.md | ✅ | written by Langston at his Step-11 confirm via `langston-memory-write --part 00-legacy.md` (part sha `63c7d3e20a31` → `e553ce92d748`; composed `61af7a733992` → `c467c0a10102`): `MEMORY.md:135`, the `CC-A closed 10-16:` bullet, carrying the #661-leg-3 warning that the hourly silence is not evidence the NOT-answered page works |
| T2 | SYSTEM_MANUAL.md | N/A | nothing under `server/`, `client/` or `shared/` changed |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | wake-watcher block: the daily control, `control_state.py`, `heartbeat-control.json`, the run lock, the new log writer, the filter arm and its invariant, and `TOKEN_RE` (the block had been silent on the control, found at Step 2) |
| T2 | RUNNING_ISSUES.md | ✅ | `#1162` closed; `#1202` opened (row 1qa); `#731` annotated (the push wake and three filter items) |
| T2 | CHANGES_AND_FIXES.md | N/A | crew tooling on the laptop; no trading-system bug or risk |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase item |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | no parameter |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional change |
| T2 | STORAGE_POLICY.md | N/A | no storage tier changed (`#1202` homes the wake log's bound) |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | no VTS code |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no asset-class learning |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | no role or gate changed |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | his build untouched |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no rule changed |
| T2 | CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md rule changed |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | nothing removed (step 2c's hand-issued control line was replaced by the script's issue; no component deleted) |
| T2 | MISTAKE_PATTERNS.md | N/A | the trailers (`wrong-object` on `4be562e14`, `fix-follows-pointer` on `10eacd39d`) are collected by the W43 weekly pass |
| T2 | GOVERNANCE_EXCEPTIONS.md | N/A | no exception granted |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | process unchanged |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | board unchanged |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | no daily check in this batch |
| — | CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md | ✅ | layer 3: the daily control is now script-decided, and the install page is expected |

## REVIEW RECORD
- **Step 1:** five rounds, APPROVED at r5 (`f565e42c4`) with two in-commit conditions.
- **Step 2:** two rounds, APPROVED at r2 (`49b9bde4d`) with one correction.
- **Step 4:** the whole-batch dispatch hit the 900 s ceiling and was split.
  - **Gate A** — r3 PROCEED, with a scope-wording condition discharged at `10eacd39d`.
  - **Gate B** — r3 PROCEED (`4ad9d6c00`), after two blockers:
    - a rotation history that could page;
    - a lost clear on a failed append.
  - **Step-4 close** (`10eacd39d`): PROCEED, `Review = Approved`.
- **Step 8:** CONFIRMED, re-derived on Helsinki (Langston, 20:20Z). His record item, naming the clock on each timestamp, is folded into the Step-7 record.

Records: scope, pre-audit, change list and Step-7 verification under `Claude Comms and Packages/`.
