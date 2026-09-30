# B-PLAN-CURRENCY-CHECK — COMPLETION REPORT

**Owner:** CC-A (OLD Claude) · **Sprint plan row 1** — PRE-SPRINT (Kyle, 2026-09-30) · **change-class `non_architecture`** · **Status:** ✅ **CLOSED 2026-09-30** — Step 11 CONFIRMED by Langston (he re-derived CI per job, the ancestry to the graded ref `c1ed80893` — ten files after the last code commit, all governed docs — his memory part's sha and load, and every placement); board card `Complete`. Standing after close: A2's first live read is the W41 census row (above).
**Record:** scope `Claude Comms and Packages/Scope Files/B_PLAN_CURRENCY_CHECK_SCOPE.md` (with `B_PLAN_CURRENCY_CHECK_OBJ1_RECUT.md`) · pre-audit `B_PLAN_CURRENCY_CHECK_PRE_AUDIT.md` · change list `Claude Comms and Packages/Change Lists/B_PLAN_CURRENCY_CHECK_CHANGE_LIST.md` · dry-run file `Scope Files/B_PLAN_CURRENCY_CHECK_P44_DRY_RUN.md` · W40 handover record `Scope Files/B_PLAN_CURRENCY_CHECK_CENSUS_2026-W40_HANDOVER.md` + its committed baseline `…_CENSUS_2026-W40.json`.

## ⚠️ LEFT OPEN AT CLOSE — each with an owner and a placed home

| item | owner | home | closes when | fails if |
|---|---|---|---|---|
| **The census's handover states (A2) have not yet run LIVE** — proven on fixtures and a dry run at the tip (`handed over 148: 135 unplaced, 6 placed, 7 closed`) | CC-A | the W41 census row itself, `gov-plancensus:2026-W41` (Monday 2026-10-05, first tick at or after 09:00Z) — the checker mints it; nothing to schedule | its body or metadata reports the three states for the W40 set, by id | the W41 row reports every W40 item as never surfaced (the handover record was not read) |
| **List (c) can fire only on fixtures now** — after the history-strike fix the corpus holds no live dated home, so a future 0 from that list does not prove itself (#546/#661 leg 2) | CC-A | stated in `census.mjs` beside `historyStruck` and in the change list; keep that sentence attached wherever the list's output is quoted | a live dated home appears and the list reports it | — (a limit, not a pending action) |
| `census.mjs`:5 still opens `⛔ DORMANT:` (its body is conditional) — relabel `⛔ GATED` as in `config.mjs` and `poller.mjs` | CC-A | on next touch of `census.mjs` (recorded in the change list) | relabelled | — |
| The 55 census items with no owner, plus CC-A's #439 #575 #596 #613 | CC-A | `B-CENSUS-OWNERLESS-TRIAGE` (`#1139`), sprint row 1n, after row 1m | each has an owner and a place, or is closed with its citation | — |
| Langston's review reader cannot read a review branch (`dt-review` fetches only the review branch's parent; it refused two of this batch's shas while reporting `DT_SYNC_PASS`) | Infra Claude | `B-DT-REVIEW-SIDE-BRANCH` (`#1138`), sprint row 1m | he can read a review-branch sha through his sanctioned, re-hashed path | — |
| Deleting a row silently resolves its plan-currency alert | CC-A | `B-PLAN-ROW-DISAPPEARANCE` (`#1134`), sprint row 1k | — | — |
| The checker's enrolment window is 300 commits, a proxy for time | CC-A | `B-GOV-ENROLMENT-WINDOW-OBJECT` (`#1133`), sprint row 1j | — | — |

## WHAT IT DOES

The governance checker now keeps the active plan current. **(1) The plan-state check (`gov-planline`):** once a batch has a completion report, its own §4 row — and its §5 row if it has one — must show it closed with the report linked. **(2) The weekly census (`gov-plancensus:<week>`):** every Monday it compares the plan with `RUNNING_ISSUES.md`, the after-live list and the roadmap and hands CC-A a worklist (reports in no plan line, OPEN issues with no place, homes still booked against a date, id-less rows, dangling "after row N" references, plan lines not closed although the batch reported, and a recount of §6); from W41 it also reads the committed handover records and reports each handed item as still unplaced, placed, closed or vanished. **(3) The weekly mistake pass (`gov-mistakepass:<week>`)** replaces the self-chaining alert `8a07c40b`, which had stopped firing after 2026-09-03. Around them: one fetch point for the graded ref (N8), new batch-id patterns (P31), the sprint-plan generators deleted (OBJ-5), the heartbeat's own failure now alerting (`OnFailure=` notifier installed on staging).

## OBJECTIVES

| objective | verdict | evidence |
|---|---|---|
| **OBJ-1** plan-line check (re-cut from a close-diff rule to a STATE check, Langston §10g) | **YES** | live `84b1dbb71` (Langston Step 4 approved against it); P61: ticks 1-4 each `fail=0 malformed=0` after the first, ~5 s; tick 1 matched the offline preview at the same ref exactly and opened only the pre-registered key; `776b4228` resolved itself on tick 2 once CC-B filled the row — Langston's stronger control: 1 fire of 3 identical-looking §5 cells, discriminated on the completion-report predicate |
| **OBJ-2** every plan row carries its batch id once named | **YES** | the one-time pass and P31's patterns (change list, Groups 3 and 6); `malformed=0` on every live tick |
| **OBJ-3** the weekly census | **YES** | live `13fa6bbce`; W40 (`3333bbb0`) matched its pre-registration list for list at the landed ref; worked and RESOLVED at `d1b1632ac`; fixes live `e0b8b578c` (history-struck: list (c) 12 → 0, all 13 lines enumerated as conversion notes; handover states, A2) |
| **OBJ-4** the weekly mistake pass on the same clock | **YES** | live `8cb328671`; W40 (`8342c441`) matched its pre-registration; THE WEEKLY PASS run at `46b5f307e`; `8342c441` and `8a07c40b` RESOLVED (the latter with the former's id, P49) |
| **OBJ-5** delete the plan generators under rule 18 | **YES** | `DELETED_COMPONENTS_LOG.md` entry + four `.removed` archives |
| **OBJ-6** one copy of the working order | **YES** | the generated sort sheet removed from `PRE_LIVE_SPRINT.md` (P20), owner divergence reconciled first (change list) |
| **OBJ-7** prune-reason audit | **SPLIT OUT** (Step 1) | `B-PRUNE-REASON-AUDIT`, sprint row 1a (`#1114`) |
| **OBJ-8** homes that still carry a date, handed to owners | **YES** | the conversions (their history notes are what list (c) now strikes); W40 list (c) 12 → 0 with #696 excluded by name |
| **OBJ-9** one-time plan correction | **YES** | the P11 recount and the `<file>:<line>` sweep (change list); §6 agrees with its stated Total on every census (245 at W40's ref, 246 now) |
| **OBJ-10** governance content and the checker's own record | **YES** | Group 8 (P47-P60): the checker's texts and README, `MISTAKE_PATTERNS.md`, the SIM blocks, workflow-10, ledger hygiene, Langston's `CLAUDE.md` §14 (Infra, P57, Langston signed), Langston's memory (P55) — the ledger below |

**CI:** the batch's last code commit `8e18f518d` is contained in `f1057c0b8`; run **36778141140** there: TypeScript Check, Build, Test Suite, Docker Build — all **success**, and no checker file changed after `8e18f518d`. On the reviewed shas: `36771306532` (`a511a0bd0`), `36772454614` (`b2fcb6630`), `36770585151` (`e0b8b578c`), all 4/4. Tests: poller **445**/0 on Linux (442 on the Windows laptop — the win32-skipped inode block holds three `ok(`), census 150/0 in CI (the live-git leg skips in the shallow checkout; 151 locally), heartbeat 103/0.

## GOVERNANCE FILES CHANGED — transcribed from the Step 10 commit `f1057c0b8`

CHANGE-CLASS: non_architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | the batch's entry: what the three checks do, what went live and when, what review caught |
| T1 | `PHASE_HISTORY.md` | ✅ | a plain-language entry for 2026-09-30 |
| T1 | `SPRINT_TO_LIVE_PLAN.md` | ✅ | rows 1j 1k 1l 1m 1n 149a placed and the tally recounted; row 1 closed with this report linked (this commit) |
| T1 | `PHASE_19_PLAN.md` | ✅ | its header now says nothing new is added and in-flight rows finish there (Langston R2-Q1); no row of this batch there |
| T1 | shared `MEMORY.md` + `MEMORY_CC_A.md` | ✅ | my position line at every step; shared MEMORY unchanged by this batch and 12 B under its cap |
| T1 | SCOPE | ✅ | `B_PLAN_CURRENCY_CHECK_SCOPE.md`, with the OBJ-1 re-cut |
| T1 | PRE_AUDIT | ✅ | `B_PLAN_CURRENCY_CHECK_PRE_AUDIT.md`; its hand placement figures marked superseded by the P44 dry-run file |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | Observation column | ✅ | the scope's window (the first four plan-state ticks and the first census) observed and met; no Observation card needed |
| T1 | session task lists | ✅ mine / N/A ×3 | CC_A's in-flight line brought to Step 11 and the triage row named as next |
| T1 | Langston's `MEMORY.md` | ✅ | *(was BLOCKED at `f1057c0b8`: MEMORY.md written outside the composer; Infra reconciled it under #1057)* written through `langston-memory-write`, part `00-legacy.md` `e25a1092…` → `16e9b81c…`: a closed batch's mechanics collapsed to a pointer and this batch's line added; load 173,251 → 172,945 B (ceiling 143,856), ledger 31 → 31, retractions 13 → 13 |
| T2 | `SYSTEM_MANUAL.md` | N/A | nothing under `server/`, `client/` or `shared/` changed; the checker is tooling |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | the plan and the Monday gate as checker-read artefacts, the CI row, the #637 state keys, the five-file drift list, the hollowness line, read-sites for the flags |
| T2 | `RUNNING_ISSUES.md` | ✅ | #1133 #1134 #1137-#1139 filed; CC-A's 31 W40 items closed, withdrawn or placed by id |
| T2 | `CHANGES_AND_FIXES.md` | N/A | no trading-system bug or risk changed; the checker's own defects are recorded in RUNNING_ISSUES and the change list |
| T2 | `POST_AUDIT_ROADMAP.md` | ✅ | its canonical-status pointer names the sprint plan and its after-live list |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | no parameter changed |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional change |
| T2 | `STORAGE_POLICY.md` | N/A | no table or retention changed (the census writes one ~28 KB file a week under `/var/lib/governance-checker/census` on the checker box) |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | working list read (A-F); no item touches the checker or the plan |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no onboarding learning |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | ✅ | automated checkers: grading the plan, the weekly census, and the two switch-on lessons |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | his model, runtime, invocation, read path, auth and file set are unchanged (his `CLAUDE.md` §14 wording was re-pointed by Infra, P57) |
| T2 | `CLAUDE.md` / `CONDUCT.md` | ✅ / N/A | `CLAUDE.md`: always-engage line, checker citation by symbol, the plan wording (`c5b4ff00a`, `0bd0327bf`, `3296e4da8`); `CONDUCT.md` not touched by this batch |
| T2 | `CLAUDE_MD_RULE_HISTORY.md` | ✅ | the same two `CLAUDE.md` changes recorded (`c5b4ff00a`, `3296e4da8`) |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | the sprint-plan generators `plan_doc.py`, `sort.py`, `order.py` and `push_keys.json` |
| T2 | `MISTAKE_PATTERNS.md` | ✅ | THE WEEKLY PASS fired by the checker, the gap row, and the first W40 pass |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | who confirms each exception type (P22) |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | ✅ | the verification row for the weekly census and mistake pass: CC-A, resolve never ack |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | ✅ | the `PHASE_19_PLAN` sibling line (P56) |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | no model or feature check ran in this batch |

## NEW FINDINGS (outside the original scope, each settled)

- **The census counted history as live dates** (NEW Claude, W40): all 13 list-(c) lines were OBJ-8's own conversion notes. Fixed in the batch (`historyStruck`, wired-tested after Langston's BLOCKER-1).
- **Documents stated checker flags' values** and went stale at the census flip (Langston, P62): eight sites rewritten as read-sites, the class grepped; the exclusion of dated planning records stated (change list, P62).
- **The census could not tell handed-over from never-raised** (Langston, A2): the handover records and three states, before W41.
- **Langston's alert owners churn**, so per-session alert narrowing barely narrows: `#1137`, `B-ALERT-OWNER-ON-ROW`, sprint row 1l (found in `B-TOKEN-BURN-CUT`, cited here because W40's owner reads depend on it).

## HONEST RESIDUAL

- **List (c)'s ability to fire is proven on fixtures only** (above).
- **The 2026-09-03 → 09-28 mistake-pass gap is never revisited:** under R1-Q14 (b) the window rolls forward; "filed ad hoc" is a coverage assertion, not an enumeration.
- **The plan-state check grades only rows whose batch cell parses to an id** (136 ids at the last tick of 246 §4 rows); §0 lines are not graded (the census sees them).
- **§6 is hand-maintained:** the census compares its stated Total with the cells; nothing checks each cell against §4 owners.
- **Several of Langston's Step-4 reads were through the commits API**, not his re-hashed `dt-review` path (`#1138`), and he stated which.
- `NOT RE-READ`: no claim in this report went to a fresh reader; the load-bearing ones (the live tick and census outputs, the resolves) were re-derived by Langston on the box at each gate.
