# B-WAKE-ARM-EXCLUSIVE (#1140) — COMPLETION REPORT

> **Row 1o, `SPRINT_TO_LIVE_PLAN.md`** (after row 1h, `B-TOKEN-BURN-CUT`). Owner CC-A. **change-class: `non_architecture`.**
> Scope `Scope Files/B_WAKE_ARM_EXCLUSIVE_SCOPE.md` · pre-audit `Scope Files/B_WAKE_ARM_EXCLUSIVE_PRE_AUDIT.md` ·
> change list `Change Lists/B_WAKE_ARM_EXCLUSIVE_CHANGE_LIST.md` · Step 7 `Change Lists/B_WAKE_ARM_EXCLUSIVE_STEP7_VERIFICATION.md`.

## OPEN AT CLOSE — stated first

**One scope objective did not ship, by decision: OBJ-9** (refuse an arm with no `--loop` outright). Measured inert for the
pre-lease arm text, and its only biting form loses wakes silently. Langston CONFIRMED at Step 8 (2026-10-02) — **decided
by the direction of the failure: never trade a self-announcing failure (a duplicate) for a silent one (a lost wake).**
The interim is the terminal state and the batch's honest limit (below). No home is owed: §9.4 disposition 5 on the
residual, Langston-ruled.

**Two items placed elsewhere, both §9.4 disposition 2 → row 1p `B-WAKE-OWNER-LOSS-VISIBLE` (`#1142`, owner CC-A, after
this row):** (a) the `WATCHER-ORPHAN` line stamps a reader's start in LOCAL time beside the lease's UTC `taken_at`
(2 h skew on this laptop, measured live); (b) **`#1140`'s ride-along was NOT done here** — `cc-wake-filter.py:1068`
still justifies a stderr print with "the Monitor treats stdout as the event stream", stale since `#1127`. Row 1p
rewrites that same stderr-only reporting.

## WHAT IT DOES

A session can run only one wake watcher. The arm loop reads its own Windows pid once and passes it as `--loop`; the
filter takes a lease (`~/.claude/cc-wake-state/<ALIAS>.lease`) only when the previous holder's loop is dead AND no reader
of that alias runs, and otherwise refuses — stdout empty, exit 5, one stderr line whose FIRST WORD the session acts on
(shared MEMORY 4.5): `WATCHER-STAND-DOWN` · `WATCHER-STUCK` · `WATCHER-ORPHAN` · `WATCHER-OLD-ARM` · `WATCHER-CENSUS` ·
`WATCHER-INTERPRETER`, plus the arm's own `WATCHER-UPGRADE`. Installed from `eae780d17` (filter, sha256 `8b2bf0848da87ed2…`)
and `555c1ce19` (count script `8be259f116b0d616…`, arm text, first-word rule, session reminder, runbook, heartbeat skill —
one commit, D1). Installed copies re-checked equal to the blobs at the head at close.

## OBJECTIVES

| OBJ | result | evidence |
|---|---|---|
| OBJ-1 a second arm is refused at `--positions` | **YES** | `scripts/analysis/test-wake-lease.py` (19 cases, pre-lease filter as control); live 4/4 (OBJ-8) |
| OBJ-2 the reconnect gap is covered | **YES** | test: live loop pid, no reader → newcomer refused, same `--loop` accepted |
| OBJ-3a a dead holder never strands the alias | **YES** | test; live: CC-A's lease taken over (`19528` → `20852`) after its loop ended |
| OBJ-3b an orphan is refused | **YES** | test with a REAL orphan (C7); live: `WATCHER-ORPHAN … 17328` beside CC-A's old reader |
| OBJ-4 a refusal does not harm the survivor | **YES** | test |
| OBJ-5 no state write under a live foreign lease | **YES** | test (state mtime unchanged) |
| OBJ-6 / 6b reused pid, unreadable process; atomic acquisition | **YES** | tests (access-denied reads alive; two racing newcomers → one wins) |
| OBJ-7a every repo copy of the arm is the leased form | **YES** | C3 census table in the change list, at `555c1ce19` |
| OBJ-7b owed rows | **YES** | CC-B: `MEMORY_CC_B.md:6` points at shared 4.5, re-read at the ref (`4a463ad0b`) |
| OBJ-8 live, all four sessions | **YES — RULED ON REPORTED FACT** | Step-7 record: each re-armed, a deliberate second arm got `WATCHER-STAND-DOWN`, none re-armed; count 1 after in all four |
| OBJ-9 no-`--loop` refused outright | **NO — by decision** | C1 measurement (`scripts/analysis/b-wake-arm-exclusive-c1-measure.py`, run twice, identical); Langston CONFIRMED Step 8 |

⛔ **OBJ-8 IS PERMANENTLY `RULED ON REPORTED FACT`:** it is behavioural on Kyle's laptop, which Langston cannot reach.
Its proven invariant is **"no second watcher was added"**, not "exactly one throughout" — "count before" read 0 in all
four, because each old watcher had just ended by delivering the request. The C1 disposition does not rest on OBJ-8:
Langston re-derived the mechanism and the ORPHAN bound in code at `1f8b1c137`. Evidence-capture home if it ever must be
more than reported: `#1044`. **The test results above were run on the laptop too, and carry the same tag.**

## HONEST LIMIT

An arm with no `--loop` (the pre-lease text) is not refused when no holder exists, and two such arms in one session can
still run two readers — but the second one's own output says `WATCHER-ORPHAN … stop ALL of them`, because that refusal
sits above the `_LOOP is None` return. The double needs a session to arm the OLD text twice AND ignore the first word
of its own output; no repo copy carries the old text (OBJ-7a). **The lease protects leased arms only.**
⛔ **No future instrument may read a watcher refusal off an exit status** — a refused arm's TASK exits 0 (the arm's
`|| break`); read the text. Stated for `B-GATE-GUARD` (`#744`).

## CI (per job)

| ref | run | TypeScript Check | Test Suite | Build | Docker Build |
|---|---|---|---|---|---|
| `eae780d17` (filter) | 36952390808 | success | success | success | success |
| `555c1ce19` (install, D1) | 36952744874 | success | success | success | success |
| `2715460c2` (head when this report was written) | 37062089287 | success | success | success | success |

The Step-7, -8 and -10 commits are documents only. `990efe4b9`'s own run was cancelled by a later push; the head's run
above covers it.

## GOVERNANCE FILES CHANGED — transcribed from the Step-10 ledger (`990efe4b9`)

CHANGE-CLASS: non_architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry added: what the lease does, what was measured (19 cases, OBJ-8 4/4, OBJ-9 inert), homes placed |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry: one listener per session, checked live in all four, why the old text is not forced |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 1o) | ✅ | status moved to Step 10; the report link lands at Step 11 |
| T1 | PHASE_19_PLAN.md | N/A — no row there | the batch id appears nowhere in it; its row is sprint row 1o |
| T1 | shared MEMORY.md + MEMORY_CC_A.md | ✅ | shared 4.5 carries the leased arm and the first-word rule (555c1ce19); mine: position at Step 10 |
| T1 | the batch SCOPE | ✅ | §2.5 records the OBJ-9 outcome and its bound (9d3dd8eb5) |
| T1 | the batch PRE_AUDIT | ✅ | written at Step 2, unchanged here |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | the Observation column | N/A | no observation window: every objective was measured or dispositioned before close |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-A: 1o at Step 10; 1p now carries the UTC stamp and the stale Monitor comment |
| T1 | Langston's MEMORY.md | ✅ | his own Step-8 block is in his part (Infra reconciled #1057, 5th); my line dropped as redundant, my write refused exit 4 and not forced, so no bytes from me |
| T2 | SYSTEM_MANUAL.md | N/A | nothing under server/ changed; no trading-pipeline component touched |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | the lease as new cross-session state, the WATCHER- vocabulary, the count's new meaning, the honest limit |
| T2 | RUNNING_ISSUES.md | ✅ | #1140 status (the :803 ride-along not done, re-homed); #1142 two added items |
| T2 | CHANGES_AND_FIXES.md | N/A | no trading-system bug or risk entry; the defect is tracked as #1140 |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase-level change |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | no parameter touched |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional change |
| T2 | STORAGE_POLICY.md | N/A | no table or retention touched; the lease is a laptop-local state file |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | no VTS or xStock code touched, so nothing on its working list moves |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no asset-class learning |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | no role or gate changed |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | his build untouched |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no rule changed; §6.9 points at MEMORY 4.5 for the command |
| T2 | CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md rule changed |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | nothing removed |
| T2 | MISTAKE_PATTERNS.md | ✅ | two trailers recorded: instrument-too-narrow #5 (the CR count), wrong-object #9 (the detached watcher) |
| T2 | GOVERNANCE_EXCEPTIONS.md | N/A | no exception granted |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | the ack/resolve process is unchanged |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | columns and fields unchanged |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | the daily check is not part of this batch |

Outside the ledger, at `555c1ce19`: `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md`, `.claude/hooks/session-reminder.mjs`, the
heartbeat `SKILL.md` (installed, sha verified).

## REVIEW RECORD

Step 1 APPROVED (seven conditions, scope §7) · Step 2 ruled (D1–D6) · **Step 4 APPROVED at `22336156f`**, conditions at
`6233125b9`, r2 `ab946879a`, r3 `eae780d17` · install `555c1ce19` · Step 7 `1f8b1c137` · **Step 8 CONFIRMED by Langston
2026-10-02** (inbox id 1555401835894804482), conditions applied at `9d3dd8eb5` · Step 10 `990efe4b9`.
`REVIEWER:` no fresh reader was spawned in this batch's Steps 7-11; the C1 mechanism was re-derived by Langston at the
ref. **NOT RE-READ:** none of this report's claims was routed to a separate reader.
