# B-INSTRUMENTS-OVER-RULES — COMPLETION REPORT

**Batch:** `B-INSTRUMENTS-OVER-RULES` · **Owner:** CC-A (OLD Claude) · **Plan:** `PHASE_19_PLAN.md` row **3.5**; `SPRINT_TO_LIVE_PLAN.md` §0 ("FINISH the measure, then close") · **Issues:** `#1038` (OBJ-1), `#970` (OBJ-8's spawn) · **change-class:** `non_architecture`
**Scope:** `Claude Comms and Packages/Scope Files/B_INSTRUMENTS_OVER_RULES_SCOPE.md` · **Pre-audit:** `B_INSTRUMENTS_OVER_RULES_PRE_AUDIT.md` (written 2026-10-01 for OBJ-2 — see the Step-2 gap below) · **Measure:** `Change Lists/B_INSTRUMENTS_OVER_RULES_USAGE_MEASURE.md`
**Opened:** 2026-08-30, Kyle: *"Yes, please scope it as a batch."* **Closed:** 2026-10-01 (UTC).

## OPEN AT CLOSE

| item | home | owner |
|---|---|---|
| **OBJ-3 — change WHAT LOADS** (path-scoped rule files; measured before/after; paired negative control) | the after-live list `PRE_LIVE_SPRINT.md`, "Crew, reviewer, governance and alert tooling", directly after `B-RULES-1e` (same subject, which §0 already paused to after live) — Langston-ruled close-out shape, 2026-10-01 | CC-A |
| the ten unread functions in `market-scanner.ts` (TS 6133) | a rule-18 read already homed under `#1038` (CC_A task list open loops) — not this batch's | CC-A |

## THE STEP-2 GAP — FOUR FACTS, AND AN AMBIGUITY LEFT STANDING

1. Langston's Step 1 of 2026-08-30 reads *"OBJ-1 CLEARS AND PROCEEDED IMMEDIATELY; it did not wait for the other two."*
2. No PRE_AUDIT existed for this batch until 2026-10-01.
3. No `GOVERNANCE_EXCEPTIONS.md` row covered it.
4. **OBJ-1 ran without a Step 2. The pre-audit written on 2026-10-01 covers OBJ-2 only and may not be cited as having gated OBJ-1** (`#1005` precedent). Langston will not read his 08-30 line as a waiver and cannot recall what he meant; the ambiguity is recorded and left standing.

## OBJECTIVES

| # | objective | | evidence |
|---|---|---|---|
| **OBJ-1** | Give sessions an instrument for "does this exist / who calls this" | **YES as an instrument; NOT USED — the pre-registered usage measure FAILED** | The code-search tool loads in every session (fixed 2026-09-11, `#1038`: missing plugin cache copy, then a fragile Windows launch replaced by a local plugin) and answers correctly (65 references in 10 files on `toCanonical`, after a ~10 s warm-up). The in-session demo ran 2026-09-18. **Usage, pre-registered before any data:** zero calls outside the demo, by any session, in any admissible 14-day window, main chain or subagents (421 transcript files); worst-case in-window active days CC-B 7, CC-C 11, Infra 5 against the bar *"active ≥5 days with zero calls"*. **By the rule: availability was not the blocker, the error-reduction claim is not supported by use, and no rule is added to make sessions use it.** Laptop transcripts: RULED ON REPORTED FACT for the reviewer, unreachable by construction; derivation and raw output committed. |
| **OBJ-2** | Stop the confessional in production source | **YES** | `market-scanner.ts`: the 97-line block above the symbol normalisation became 35 lines of what and why, with issue numbers instead of line numbers. Langston judged the prose at Step 4 (approved at `0a6cf2240`, three conditions met at `f597ba3a1`: the locked resolver named, the 661-base population, the active/VTS lane split; plus the `#966` dependency). Zero non-comment lines changed (Langston re-derived: 0 of 123). Every removed fact is recorded in the B-SCANNER-EGRESS-NORMALISE records (pre-audit §2.2). Folded: the sibling guard's three drifted line references now name what they point at. |
| **OBJ-3** | Change what loads, not what exists | **MOVED** | to the after-live list with `B-RULES-1e` (above). |
| **OBJ-4** | Size the review to the change | **STRUCK** at Step 1 (`[L CHANGE 2]`): its sizing input does not exist; homed as `B-REVIEW-SIZING-BY-BLAST-RADIUS`. |
| **OBJ-5** | Governance | **YES** | the ledger below. |
| **OBJ-6** | Does the provenance read fire? | **YES (done earlier)** | scope §OBJ-6: the skip generalises; improving, not solved. |
| **OBJ-7** | The recommendation Kyle was holding for | **YES** | delivered at the Step-1 close (`PHASE_19_PLAN.md` row 3.5 records it). |
| **OBJ-8** | The prose class gets a bounded measurement | **YES (done earlier)** | 556 IDs, 27 % multi-homed; ruled "build nothing"; spawned `#970` → `B-DISAGREEMENT-FINDER`. |

## WHAT THE BATCH ESTABLISHED, PLAINLY
⛔ **CITE WITH ITS TAG (Langston, Step-11 condition):** the usage counts are laptop-only, unreachable by the reviewer by construction, so this verdict is **RULED ON REPORTED FACT** permanently. It was accepted only because its consequence is inaction. **Every forward citation of "availability was not the blocker" carries that tag and is never cited as a measured finding** (`#452`).


The diagnosis was that sessions get things wrong because they lack instruments, not rules. The one instrument this batch could build — code search that understands the code — was built, fixed, proven to work, and then **not used by any session in three weeks**. That is the result, and the batch states it rather than writing a rule telling sessions to use the tool (three instruction-shaped fixes have already been measured failing, `#995`). The prose half of the problem has no such instrument; it is being measured in `B-DISAGREEMENT-FINDER`.

## GOVERNANCE — CHANGE-CLASS: non_architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | entry added at close |
| T1 | `PHASE_HISTORY.md` | ✅ | entry added at close |
| T1 | `SPRINT_TO_LIVE_PLAN.md` | ✅ | §0's line ("FINISH the measure, then close") closed with this report |
| T1 | `PHASE_19_PLAN.md` — row 3.5 | ✅ | in flight there, so required: closed with this report |
| T1 | shared `MEMORY.md` + `MEMORY_CC_A.md` | ✅ / ✅ | shared unchanged in content by this batch (N/A for it); my position block updated |
| T1 | the batch `SCOPE` | ✅ | `B_INSTRUMENTS_OVER_RULES_SCOPE.md` |
| T1 | the batch `PRE_AUDIT` | ✅ | `B_INSTRUMENTS_OVER_RULES_PRE_AUDIT.md`, with the Step-2 gap stated |
| T1 | `COMPLETION_REPORT` | ✅ | this file |
| T1 | the `Observation` column | N/A | the one observation window (the usage measure) is read and closed here |
| T1 | session task lists | ✅ mine / N/A — not mine ×3 | CC_A's in-flight line closed |
| T1 | Langston's `MEMORY.md` | ✅ | one line: the measure's verdict and the Step-2 gap |
| T2 | `SYSTEM_MANUAL.md` | N/A | nothing under architecture, strategy, regime, filter, pipeline or math changed |
| T2 | `SYSTEM_IMPACT_MAP.md` | N/A | a comment-only change; no component, state or caller changed |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1038` verdict recorded, then closed with this report |
| T2 | `CHANGES_AND_FIXES.md` | N/A | no trading-system bug or risk entry |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | no phase-level change |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | no parameter change |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional change |
| T2 | `STORAGE_POLICY.md` | N/A | no table or retention change |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | not a VTS expansion item |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no asset-class learning |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | the method is unchanged; the finding (a tool built and not used) is recorded here and in `#1038` |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | his build is unchanged |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | no rule changed — deliberately: the measure's own rule forbids adding one |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | no `CLAUDE.md` change |
| T2 | `DELETED_COMPONENTS_LOG.md` | N/A | nothing removed (comment text only; its facts preserved, pre-audit §2.2) |
| T2 | `MISTAKE_PATTERNS.md` | N/A | trailers in commits (`enumerator-blind-spot`); the weekly pass harvests them |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A | no exception — Langston refused the `na-skip` for the pre-audit; a real one was written |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | no alert-process change |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | no board change |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | no model or feature finding |
| — | `PRE_LIVE_SPRINT.md` | ✅ | OBJ-3 placed after `B-RULES-1e`; section count 70 → 71 |

**CI:** run `36943538344` at `f597ba3a1` — the last commit carrying any of this batch's code (a comment-only change; `0a6cf2240` is its ancestor and passed too, run `36942653325`) — **4/4 per job:** TypeScript Check (baseline gate) `success` · Test Suite `success` · Build `success` · Docker Build `success`. The closing commits are documents only, so their runs are not the gate.

## HONEST RESIDUAL

- **The usage counts are laptop-only** and cannot be re-derived by the reviewer; the derivation and raw output are committed.
- **Infra Claude's leg sits exactly on the bar** (worst case 5 active days against ≥5). CC-B's and CC-C's legs fix the verdict without it.
- **Why no session used the tool is not established.** The measure was built to show whether availability was the blocker, not why use did not follow.
