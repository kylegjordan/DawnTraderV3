# B-WAKE-OWNER-LOSS-VISIBLE (#1142) — COMPLETION REPORT

> **Row 1p, `SPRINT_TO_LIVE_PLAN.md`** (after row 1o). Owner CC-A. **change-class: `non_architecture`.**
> Scope `Scope Files/B_WAKE_OWNER_LOSS_VISIBLE_SCOPE.md` · pre-audit `Scope Files/B_WAKE_OWNER_LOSS_VISIBLE_PRE_AUDIT.md` ·
> change list `Change Lists/B_WAKE_OWNER_LOSS_VISIBLE_CHANGE_LIST.md` · Step 7 `Change Lists/B_WAKE_OWNER_LOSS_VISIBLE_STEP7_VERIFICATION.md`.

## OPEN AT CLOSE — stated first

**No scope objective is open.** One finding outside the scope is homed: **`#1151`** — a read-only wake-state directory makes
`--once` exit 1 after the wake prints (measured on Linux), so the arm loop retries and the task never ends. It predates `#1142`
and concerns the position state. §9.4 disposition 4: a scheduled review — put to Langston as one question after this close; its
home follows his ruling.

## WHAT IT DOES

When a session's wake filter cannot save its alert-owner record, it now appends one line to
`~/.claude/cc-wake-state/<ALIAS>.alert-owners.lost.jsonl` naming the alerts and owners it lost (`ts` = message time,
`at` = wall-clock UTC). The per-turn alert hook reads the file's last 64 KB and shows that session the loss in every emit —
unreachable, zero due, full list and narrowed — ending "tell Langston, leading with his name". Before, the loss went only to
stderr, in a task output nobody reads, while the alert silently showed to every session.
**Found by the batch's own test and fixed here:** an owner record that exists but cannot be read raised inside the per-line
handler and **dropped the wake**. It is now parsed against an empty record, never saved over the unreadable one, and reported
as a loss.
Also: the `WATCHER-ORPHAN` reader stamp is UTC, and the stale "the Monitor treats stdout" comment is gone (`#1140`'s ride-along,
checked by a grep for the string, Langston's condition A).

## PREVIOUSLY STATED vs NOW
**PREVIOUSLY STATED (scope §2): "A `--once` watcher exits on its first wake." NOW: it exits at the first `#@CAUGHTUP` after a
delivery. REASON: Langston's Step-1 correction; it strengthened the chosen design (a sidecar append) over a next-save counter.**

## OBJECTIVES

| OBJ | result | evidence |
|---|---|---|
| OBJ-1 a failed save leaves an in-band record of the loss, with ids, that survives the process exiting | **YES** | `test-wake-filter-cuts.py`: Windows held-file leg (same run prints the wake AND leaves the line, C7); Linux directory / read-only legs; CI step "Wake filter tests" success |
| OBJ-2 the hook shows the loss to the session that lost it, and stops once re-stated or after 24 h | **YES** | `test-alert-split.mjs` 42/42 (later / equal / older message ts, null ts never clears, owner match, expiry by `at`, torn lines, `__proto__`, both report wordings); live: the installed hook in the real alert list showed a planted loss and nothing before or after |
| OBJ-3 the wake is still delivered on a failed save | **YES** | same suite; on the previous filter the unreadable-record case DROPPED the wake (`woke=False, dropped=True`) |
| OBJ-4 the ORPHAN stamp is UTC with a `Z` | **YES — laptop only** | `test-wake-lease.py` PASS; the previous filter FAILS it. PowerShell-only, so **zero CI reach** — RULED ON REPORTED FACT |
| OBJ-5 the stale comment is gone | **YES** | `grep -c "the Monitor treats stdout"` = 0 at `a23e42871`, control `UNROUTED LINE` = 1 — re-derived by Langston at the ref |
| OBJ-6 installed and live | **YES** | filter sha256 `26a2371a…` = the blob at `a23e42871`, still equal at the head on 2026-10-06; all four clones' `inject-due-alerts.mjs` and `alert-split.mjs` equal the blob and their run stamps carry it (Langston's condition); every session's reader started after the install |

⛔ **RULED ON REPORTED FACT for Langston: every laptop measurement here** (Windows test runs, the live hook check, the clone and
process censuses). **What is not:** CI 37076538062 and the code-side review, which he re-derived at the ref.

## HONEST RESIDUAL
- **A real lost routing on a live watcher was never observed** — not before this batch (0 in 1,436 task outputs) and not since
  (all four loss files absent on 2026-10-03 and again 2026-10-06; control: all four owner records listed in the same directory).
  The behaviour is proven by forced failures in temp folders, not by a live event.
- The loss file has **no deleter**; past 1 MB it is set aside once as `.old`. An out-of-repo deletion silently drops the report.
- A session closed for longer than 24 h never sees its loss line; stderr in the task output stays the durable copy.
- Whether a Windows process holding the loss file open blocks the 1 MB rename is a HYPOTHESIS, unmeasured; a failed rename never
  blocks the append (tested).

## CI (per job)
| ref | run | TypeScript Check | Test Suite | Build | Docker Build |
|---|---|---|---|---|---|
| `a23e42871` on `migration/aws-supabase` | 37076538062 | success | success | success | success |
Test Suite's two new steps — "Wake filter tests (owner record, lost routing)" and "Alert hook tests (split, lost routing)" —
both success (Langston re-derived the run per job and per step). Review-ref runs before approval: 37073143571 (r1),
37074597195 (r2), 37076549878 (r2 + conditions), all 4/4.

## GOVERNANCE FILES CHANGED — transcribed from the Step-10 ledger (`330b2f4e2`)

CHANGE-CLASS: non_architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry: what the record does, the wake-drop found and fixed, the tests now in CI, homes placed |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry: a lost alert routing is shown to the session that lost it |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 1p) | ✅ | status moved to Step 10; the report link lands at Step 11 |
| T1 | PHASE_19_PLAN.md | N/A — no row there | the batch's row is sprint row 1p |
| T1 | shared MEMORY.md + MEMORY_CC_A.md | ✅ | mine: position at Step 10; shared 4.5 unchanged (the arm command did not change) |
| T1 | the batch SCOPE | ✅ | written at Step 1, unchanged |
| T1 | the batch PRE_AUDIT | ✅ | carries the Step-2 ruling (B1, B2, C8-C11) |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | the Observation column | N/A | no window: scope §5, every objective is a test or a grep at close |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-A: 1p at Step 10 |
| T1 | Langston's MEMORY.md | ✅ | one line for this batch, swapped for a collapsed closed-batch line through langston-memory-write; his load 185,398 -> 185,378 B |
| T2 | SYSTEM_MANUAL.md | N/A | nothing under server/, client/ or shared/ changed |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | the lost-routing record (writer, reader, clocks, rotation, no deleter) and the hook row's new behaviour |
| T2 | RUNNING_ISSUES.md | ✅ | #1142 status; #1151 filed (read-only state directory, --once exit 1) with a scheduled-review disposition |
| T2 | CHANGES_AND_FIXES.md | N/A | no trading-system bug or risk entry |
| T2 | POST_AUDIT_ROADMAP.md | N/A | this batch changes no phase item (16.8 was amended separately, e6c90ec47) |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | no parameter touched |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional change |
| T2 | STORAGE_POLICY.md | N/A | no table or retention; the new file is laptop-local state |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | no VTS or xStock code touched |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no asset-class learning |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | no role or gate changed (two test suites joined an existing CI job) |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | his build untouched |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no rule changed |
| T2 | CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md rule changed |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | nothing removed |
| T2 | MISTAKE_PATTERNS.md | ✅ | wrong-object #10 (plan status vs report column) and #11 (a guarded gate read as live) |
| T2 | GOVERNANCE_EXCEPTIONS.md | N/A | no exception granted |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | ack/resolve unchanged; only what the per-turn list shows |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | columns and fields unchanged |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | the daily check is not part of this batch |

Also changed by this batch, outside the ledger: `.github/workflows/ci.yml` (two Test Suite steps), the three test files.

## REVIEW RECORD
Step 1 APPROVED (Option B, C1–C7) · Step 2 CLEARED (B1, B2, C8–C11) · Step 4 r1 CHANGES NEEDED (BLOCKER-1, C-1, C-2) → r2
APPROVED with two in-commit conditions, landed at `a23e42871` · Step 8 CONFIRMED 2026-10-03 with the hook-half census, met at
Step 10 · Step 10 `330b2f4e2`.
`REVIEWER:` no fresh reader was spawned in this batch. **NOT RE-READ:** none of this report's claims was routed to a separate
reader; Langston is the second pass.
