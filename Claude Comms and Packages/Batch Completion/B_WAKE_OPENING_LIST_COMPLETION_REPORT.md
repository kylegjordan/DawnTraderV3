# B-WAKE-OPENING-LIST — COMPLETION REPORT

**✅ CLOSED 2026-11-06 — Step 11 CONFIRMED by Langston (msg `1568094991685918786`), on the condition below, which this closing commit lands: the System Impact Map's "If I Change X, Check Y" lines for the Langston gate and for a session rename still described the retired rule; both now name `address_list.py`.**

**Batch:** `B-WAKE-OPENING-LIST` · **owner:** Infra Claude (CC-INFRA) · **issue:** `#1241` · **plan:** `SPRINT_TO_LIVE_PLAN.md` row 1a · **Kyle:** KD-20, widened by KD-21 (2026-11-04)
**change-class:** `non_architecture`
**Scope:** `Claude Comms and Packages/Scope Files/B_WAKE_OPENING_LIST_SCOPE.md` (r4a) · **pre-audit and plan:** `…/B_WAKE_OPENING_LIST_PRE_AUDIT.md` (r2a) · **change list (every step's record):** `Claude Comms and Packages/Change Lists/B_WAKE_OPENING_LIST_CHANGE_LIST.md`
**Reviewed and installed sha:** `f38220b83` (Step 4 graded ref `768ee2657`, an ancestor of `f38220b83`. This batch's commits in between: the P4 start-limit fix `3cf619b87`, re-landed to its one home `aa0ce9eb5` (Langston P4 PASS, msg `1568050477927628924`), and `40d958e5d`, which folded his two pre-install items; every other commit in the range is another session's or a record) · **CI:** run `42133297627`, TypeScript Check / Test Suite / Build / Docker Build all `success`, read per job.

## ⚠️ OPEN AT CLOSE — stated first

| item | owner | placed home | closes when | fails when |
|---|---|---|---|---|
| **A6 — Coltrane cannot wake Langston by any wording** (his bridge accepts non-Kyle posts only from the CC bot or webhook) | Kyle decides | with Kyle via PM Claude (recorded in pre-audit §A6 and `#1241`) — not a slot until Kyle agrees one | Kyle rules: allow it, or keep it closed | — (a decision, not a defect) |
| **Q1 / Q2** (Kyle's own posts; accepting the session-side narrowing) | Kyle | with Kyle via PM Claude; the batch built the recommended defaults: Q1(b) Kyle keeps name-anywhere, Q2 accept | Kyle confirms or picks the other option | — |
| **B-BRIDGE-ERROR-VISIBLE** — a Langston invoke that ends in a bridge error posts nothing (Langston's Step-8 finding; 61 rows 2026-06-22 → 11-06, `discord-langston-bridge.py:649` (`mirror_event("langston_silent", …, reason="bridge_error_suppressed")`; corrected 2026-11-06 from `:658`, a different branch)) | Infra Claude | **added to `B-AGENT-INVOKE-FAILURE-NOTICE`** as an explicit objective (`#1198` note + plan row 137, PM Claude 2026-11-06; a separate batch would duplicate it) | that batch closes | — |
| Coltrane's stop-path gap (no process-group kill) | Infra Claude | `B-AGENT-INVOKE-FAILURE-NOTICE` (`#1206`), placed at Step 1 | that batch closes | — |
| `§6.9` roster table lists only CC-A/CC-B; `CLAUDE.md:261` named a form CC-C never posts under | Kyle slots | `RUNNING_ISSUES` entry passed to PM at Step 1 (scope "Out of scope") | Kyle slots it | — |

## What the batch was for

Three wake rules lived in three places. Langston's bridge engaged a session's post only if it **started** with his name; Coltrane's bot had its own name-first copy; each session's filter woke on a name **anywhere**. So "Coltrane, Langston — …" reached Coltrane and not Langston (KD-20), and a passing "as OLD Claude said" woke OLD Claude (KD-21). The batch makes one rule, in one file, for every reader: **the names in a post's opening list are who it is for; a name later in the text wakes nobody.**

## Objectives

| # | objective | result | evidence |
|---|---|---|---|
| OBJ-1 | one opening-list parser, one copy of the rule, every installed copy checks itself | **YES** | `comms-infra/discord/address_list.py` (`opening_list`), sha `e07d7b32…`, loaded by path and sha-pinned in the sender, Langston's bridge, Coltrane's bot and the laptop filter. Every unit case in scope OBJ-1 is in `address_list_test.py` (66/0); mutation runner 18/18 caught. Bad-module behaviour per consumer tested (`test_address_gates.py` 67/0, `test_coltrane_address.py` 23/0, filter suite 136/0). |
| OBJ-2 | Langston's bridge wakes on the opening list; dead `CC_NAME_RE` deleted | **YES** | Gate replaced; `CC_NAME_RE`, `ADDRESS_START_RE` logged in `DELETED_COMPONENTS_LOG.md`. Live (Step 7): "Coltrane, Langston — …" (`1568054873147187241`) enqueued at 00:10:14Z — the old gate would have dropped it — and answered "probe ok"; "Langston — … Coltrane may comment" enqueued 00:10:45Z and answered. |
| OBJ-3 | Coltrane's bot wakes on the opening list | **YES** | `NAME_START_RE` removed (asserted absent by its suite). Live: check 1 woke him (one `codex exec` 00:10:15Z, "probe ok"); check 2, where he is mentioned only later, did not. Installed once, idle, with the start-limit fix (`StartLimitIntervalSec=5min`) in its one home `comms-infra/systemd/`. |
| OBJ-4 | each session's filter wakes on the opening list for session posts | **YES** | Replay over all 17,705 session posts (Langston re-derived): 13 change, +25 wakes, 0 lost, no other post changed; positive control 536 of 549 Kyle-led rows gain nothing. Live: "OLD Claude, Infra Claude — …" (`1568054692347379826`) woke OLD Claude, whose reply woke me through the new filter. |
| OBJ-5 | install and verify live, each process on its own terms | **YES** | Installed at `f38220b83` 2026-11-06 00:02-00:07Z: bridges group 15 files (`live-vs-sha.py` 15/15), laptop filter + module, Coltrane after the `pgrep` quiet check. Langston's bridge restarted **mid-invoke on purpose**; the interrupted review (`1568035689608642732`) was re-fed and answered 00:51:49Z. `verify-agent-artifacts.py`: match 17, differ 3 (all B-CREW-ACCESS-HARDEN's, not this batch). |
| OBJ-6 | governance — every statement of a wake rule, swept by class | **YES** | See the ledger below; every always-loaded rule file and both reviewers' rule files restated. |

**Narrowed by Langston at Step 8 (leg 6), and carried here as narrowed:** the live laptop check proves the filter is **alive and not latched** on the new module. It does **not** exercise a non-leading wake, so it is not evidence that list-reading works on the laptop. That evidence is the suites and the replay above.

## Steps and reviews

| step | result | record |
|---|---|---|
| 1 | Langston APPROVED r4a (three text amendments landed) | scope header |
| 2 | Langston PROCEED on r2a, conditions A and B landed (`5e577e841`) | pre-audit header |
| 3 | built across `29900e378`…`768ee2657` | change list |
| 4 | three parts, each PROCEED; final graded ref `768ee2657` | change list, Step 4 |
| 5 | CI `42133297627` 4/4 per job | change list |
| 6 | installed `f38220b83` (record `a1180369e`) | change list, Step 6 |
| 7 | all live checks pass (`436f2f383`) | change list, Step 7 |
| 8 | Langston CONFIRMED, PROCEED (msg `1568085628879376577`), one leg narrowed, one finding surfaced | change list, Step 8 |
| 9 | P4 re-landed to the one home `comms-infra/systemd/` after his blocker (`aa0ce9eb5`) | change list |
| 10 | governance below | this report |

**The predicted install cost, realised:** two superseded whole-diff dispatches were re-fed by the restart's 24-hour recovery floor and each hit the 900-s invoke ceiling again — about 30 minutes of Langston's worker, one-time. And two older posts were replayed late as the accepted install residual (OBJ-5), with no new ask.

## Governance files changed — copied from the Step 10 ledger

CHANGE-CLASS: non_architecture

| tier | document | required/judged | verdict | one line |
|---|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | REQUIRED | ✅ | entry added, flipped to CLOSED at Step 11 |
| T1 | `PHASE_HISTORY.md` | REQUIRED | ✅ | plain-language entry added |
| T1 | `SPRINT_TO_LIVE_PLAN.md` row 1a | REQUIRED | ✅ | status → closing, report linked, A6 and the finding named |
| T1 | `PHASE_19_PLAN.md` | judged | N/A | not a `P19-*` batch and it has no row there |
| T1 | shared `MEMORY.md` + `MEMORY_CC_INFRA.md` | REQUIRED | ✅ | shared item 4.6 restated as the opening list (`2fc17e37b`); my position updated |
| T1 | scope | REQUIRED | ✅ | r4a present |
| T1 | pre-audit | REQUIRED | ✅ | r2a present |
| T1 | completion report | REQUIRED | ✅ | this file |
| T1 | Observation column | judged | N/A | nothing was deferred to an observation window; every live check ran at Step 7 |
| T1 | session task lists | REQUIRED (mine) | ✅ | `CC_INFRA_SESSION_TASK_LIST.md` row → Step 11; CC_A / CC_B / CC_C: N/A — not mine |
| T1 | Langston's `MEMORY.md` | REQUIRED | ✅ | section added via `langston-memory-write`, part `00-legacy.md`, net −35 B (`a9a35791` → `a576cc94`) |
| T2 | `SYSTEM_MANUAL.md` | judged | N/A | comms only — no trading architecture, strategy, regime, filter or maths changed |
| T2 | `SYSTEM_IMPACT_MAP.md` | judged | ✅ | `address_list.py` row: the one rule, its four consumers, blast radius (`be4101ec8`); and its "If I Change X, Check Y" lines for the Langston gate and a session rename (the closing commit, Langston's Step-11 condition) |
| T2 | `RUNNING_ISSUES.md` | judged | ✅ | `#1241` annotated installed; `#979` amended (99 world-readable `/tmp` drafts → B-SHARED-TMP-ISOLATION) |
| T2 | `CHANGES_AND_FIXES.md` | judged | ✅ | FIX-2026-11-06-A |
| T2 | `POST_AUDIT_ROADMAP.md` | judged | N/A | no phase-level change |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | judged | N/A | no tunable parameter added or changed |
| T2 | `AUTHORITY_BASELINE.md` | judged | N/A | no constitutional change |
| T2 | `STORAGE_POLICY.md` | judged | N/A | no table or retention touched |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | judged | N/A | not B78-B81 work |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | judged | N/A | no asset-class learning |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | judged | ✅ | the reviewer-gate rule now says "opening list, one shared file" |
| T2 | `LANGSTON_ARCHITECTURE.md` | judged | ✅ | address gating restated; change-log row with BEFORE/AFTER/why |
| T2 | `CLAUDE.md` / `CONDUCT.md` | judged | ✅ / N/A | `CLAUDE.md` §6 (:224 :255 :261 :265 :268) and §6.9 items 1-2 (`2fc17e37b`); `CONDUCT.md` states no wake rule |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | REQUIRED with a CLAUDE.md change | ✅ | entry added in the same commit (`2fc17e37b`) |
| T2 | `DELETED_COMPONENTS_LOG.md` | judged | ✅ | `ADDRESS_START_RE`, `CC_NAME_RE`, `NAME_START_RE`, and the duplicated codex/ unit copies |
| T2 | `MISTAKE_PATTERNS.md` | judged | N/A | one `MISTAKE: wrong-object [B-WAKE-OPENING-LIST]` trailer is in commit `aa0ce9eb5`; the weekly pass harvests trailers, and no per-instance row is written at close |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | judged | N/A | no exception granted |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | judged | N/A | its five wake lines (:26 :30 :32 :33 :37) describe the Langston-reply rail, which this batch did not touch: the filter still decides his replies on `OPEN_RE` (`cc-wake-filter.py:215`), and `opening_list` is reached only on the crew branch (Langston, Step 11) |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | judged | N/A | the board's columns, fields and ownership did not change (corrected 2026-11-06, Langston: KD-35 retired the PHONE status board, `/status-board`, not the GitHub Projects delivery board, which is live); the card was moved to Complete at close |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | judged | N/A | the daily check did not run in this batch |
| — | other rule files | — | ✅ | Langston's rules file (`3f6c38510`, net −46 B, installed); Coltrane's `AGENTS.md`, `CODEX_DISCORD_RULES.md` and `COMMS_BRIDGE_RUNBOOK.md` (`790d8ed78`) |

## New findings

- **Langston's bridge-error finding** (Step 8) — folded into `B-AGENT-INVOKE-FAILURE-NOTICE`; see the open-items table.
- **A6** — Coltrane cannot wake Langston; in the open-items table.

## Honest residual

- The laptop leg is liveness only (Langston's narrowing, above).
- Each running watcher holds the code it armed with; a session that has not re-armed since the install still runs the old filter until it does.
- The replay proves the rule on past traffic; it cannot prove how sessions will phrase posts now that the rule is different.
