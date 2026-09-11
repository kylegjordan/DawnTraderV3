# B-WAKE-LEAD-NAME — COMPLETION REPORT

**⏳ CLOSING 2026-09-11 — Steps 1-10 done; this report is with Langston; the batch closes on Kyle's acknowledgement.**
change-class `non_architecture` · owner Infra Claude · `#1040` · plan row 4.51.

## ⛔ OPEN AT CLOSE — stated first
- **OLD Claude (CC-A) has NO wake watcher.** Measured at 16:52Z from the laptop's process list. It cannot be woken by any Discord message, Langston reply or wake-file line until it arms one. **Route:** system alert `9f4f08a1-1922-4b35-8b2e-396b224b0de0` (`owner=CC-A`), which reaches it at the top of its next turn. **Closes when** a CC-A watcher process exists.
- **Which filter version each watcher runs:**
  - the 16:49Z install is the Step-4-approved `c05e9d1fa` blob;
  - the FINDING-A/FINDING-D version (`0df01c687`) was installed after Langston carried his Step-4 approval to it (17:32Z);
  - both changes are display-only (the routing tag), so the crew is **not** asked to re-arm a second time — each session picks it up at its next natural arm;
  - §8's re-arm table records who runs what.
- **`#1043` `B-READ-MODEL-BLOB-VERIFY`** — row 4.51a, owner Infra Claude. Langston's pinned-sha raw reads served the wrong file twice.
- **Residual, by design (scope §3):** *"Kyle — OLD Claude, this bit is yours … `[[ALERT owner=CC-B]]`"* stays silent for CC-A. A mid-body name with another owner's marker is still the `#995` cut.
- **Residual, `#1004` class:** the live filter is a hand-copied file, and each running watcher holds the code it armed with.

## CHANGE-CLASS LEDGER — copied from Step 10

`CHANGE-CLASS: non_architecture`

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | entry added, marked CLOSING |
| T1 | `PHASE_HISTORY.md` | ✅ | plain-language entry added |
| T1 | `PHASE_19_PLAN.md` | ✅ | row 4.51 marked CLOSING; row **4.51a** `B-READ-MODEL-BLOB-VERIFY` placed after it |
| T1 | shared `MEMORY.md` + `MEMORY_CC_INFRA.md` | ✅ | mine: position at every step boundary. Shared: no session-start command or consensus truth changed — the MEMORY.md 4.5 watcher command is byte-unchanged |
| T1 | the batch `SCOPE` | ✅ | `B_WAKE_LEAD_NAME_SCOPE.md` r2 (`928e652f0`) |
| T1 | the batch `PRE_AUDIT` | ✅ | `B_WAKE_LEAD_NAME_PRE_AUDIT.md` §1-§8 |
| T1 | the `COMPLETION_REPORT` | ✅ | this file |
| T1 | the four session task lists | ✅ mine / N/A ×3 | `CC_INFRA_SESSION_TASK_LIST.md` **created** — it did not exist (the same listing showed `CC_A_SESSION_TASK_LIST.md`); the other three are not mine |
| T1 | Langston's `MEMORY.md` | ✅ drafted, lands on his pick | his loaded set is in BREACH of its only-decreasing ceiling (149,000 B against 143,856 B at 17:20Z), so a ~500 B entry cannot be appended alone. It is handed to him with the ask to name a closed block to trim by at least as much — reshaping his own file is his (r7 C-1(i)) |
| T2 | `SYSTEM_MANUAL.md` | N/A | nothing under `server/`, `client/` or `shared/`; a laptop comms filter is outside the trading-system architecture the manual documents |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | content update beside `B-WAKE-QUIET`'s; the §10.5 owner-routing sentence corrected (superseded twice) |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1040` FIXED · `#1004` amended (two-layer hand-install) · `#1043` opened and homed |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | `FIX-2026-09-11-A` — a real defect, fixed |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | no phase-level change; the one new item is placed in the phase plan |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | no trading parameter touched |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional change |
| T2 | `STORAGE_POLICY.md` | N/A | no table or retention touched |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | no asset class, threshold or xStock calibration item touched |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no onboarding learning |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | no role or gate changed; the re-arm measurement is recorded as a procedure on `#1004` |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | his model, runtime, invocation, read path, auth and files are unchanged; the read-path defect is homed in `#1043`, which will change §6 |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | no stable rule changed |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | no `CLAUDE.md` rule change |
| T2 | `DELETED_COMPONENTS_LOG.md` | N/A | no component removed — the replaced tag code sat inside the edited branch |
| T2 | `MISTAKE_PATTERNS.md` | N/A | no `MISTAKE:` trailer on this batch's commits |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A | no exception granted |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | ✅ | step 3: an opening name wakes despite another owner's marker, and the tag; step 4 routing sentence; the stale "Infra onboarding deferred" line corrected |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | board columns and fields unchanged |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | the daily model check did not run in this batch |

## OBJECTIVES

| objective | result | evidence |
|---|---|---|
| **OBJ-1** — a reply that OPENS with a session's name wakes it, whatever markers it ends with | **YES** | **(a)** replay, dropped-with-opening-name → **0** for all four. **(b)** the join: every newly woken reply resolves to a message written by that session — **28/28/29/24 MATCH, 0 mismatch, 0 alert-path, 0 no-trigger**. Controls were stop conditions: positive `1547973065172979794` → CC-INFRA; a NEW Claude fixture → MISMATCH |
| **OBJ-2** — nothing else changes | **YES** | wakes on replies that do NOT open with the session's name: **0 changed** in the replay window. Suite **22/22**: the 13 existing + scope (a)(b)(c) + conditions 3, 4, 5 + FINDING-A + FINDING-D ×2. **Outside the window:** Langston's all-history replay finds **2 wakes lost, both spurious** (quoted marker templates) — the intended condition-3 effect |
| **OBJ-3** — the fix reaches every session | **PARTIAL** | the live file equals the reviewed blob modulo line endings ✅ · crew re-arm note ✅ · a **live tagged wake** on a re-armed watcher (Langston's 16:53:15Z reply → `WAKE[LANGSTON->CC-INFRA] [alert routed to CC-B]`) ✅ · re-armed on the new file, per process start time: CC-INFRA, CC-C, CC-B ✅ · **CC-A: no watcher at all** ⛔ — alert raised; see OPEN AT CLOSE |
| **OBJ-4** — the wake line must not hide the routing | **YES, widened twice in review** | **Approved form:** the tag names the last other owner. **FINDING-A:** every distinct owner. **FINDING-D:** on BOTH sides of the owner test, self excluded. `LANG_MARKER_MINE_NAMED` asserts no tag. The replay checks the tag on **every** wake — tagged CC-A 31 · CC-B 42 · CC-C 34 · CC-INFRA 24, **0 wrong** |

## THE NUMBERS — each with the convention that produced it
- **This batch's replay:** one entry per `langston_outbound` ROW, no body dedup, since 2026-09-03. The population grows with every reply, so each figure carries its time.
- **Langston's replay:** counts WAKE EVENTS (not lines — multi-line bodies inflate `wc -l`) and deduplicates colliding body prefixes. **99/99 MATCH** since 09-03; all history newly woken CC-A 69 · CC-B 44 · CC-C 121 · CC-INFRA 23.

> **PREVIOUSLY STATED:** 104 dropped replies (F-3, 16:07Z) → 107 (Step 3, 16:33Z). **NOW:** 109 = 28+28+29+24 (17:14Z). **REASON:** new replies since; same row convention. Langston's 99 is the deduplicated-events convention, not a disagreement.
> **PREVIOUSLY STATED:** "two" of his replies to me were dropped (16:19Z, 16:24Z). **NOW:** three — 16:07:22, 16:19:17, 16:24:04. **REASON:** Langston enumerated his outbound rows since 16:00Z.
> **PREVIOUSLY STATED:** "80 bodies with ≥2 distinct owners". **NOW:** 80 is ALL history; since 2026-09-03 it is **38 rows, 8 of which woke a session with no tag** before FINDING-D. **REASON:** the window was not named.

## CI
- **`c05e9d1fa`** (the Step-4 ref): covered by run `34623482499` on `aee2bc191`, 4/4 per job. Its own run `34623470603` was cancelled by a later push.
- **`0df01c687`** (FINDING-D): covered by run `34627129368` on `74be7e7a0`, **4/4 per job** (TypeScript Check, Test Suite, Build, Docker Build). Its own run `34627007920` was cancelled by a later push.

## REVIEW RECORD
Langston:
- Step 1 — APPROVED WITH REVISIONS (join, strip-first, OBJ-4);
- Step 2 — APPROVED, 5 conditions, all met;
- Step 4 — APPROVED at `c05e9d1fa`, re-derived (suite both copies, `OWNER_CANON`, `wake_narration.py`, `WAKE[` consumer census); FINDING-1 comment fixed at `e4d6d01db`;
- Step 8 — CONFIRMED, re-derived on the live row through both blobs; FINDING-A folded and approved (`32780211d`); FINDING-B → the CC-A alert; FINDING-C → `#1043`; FINDING-D folded (`0df01c687`).

`REVIEWER: claim-only · Step 2 entry-point enumeration · agreed at that level, raised 4 leads · re-derived y` (pre-audit §2).

## HONEST RESIDUAL
- **The key is proven on NON-alert replies.** The bridge prefixes the addressee only there; alert-path replies (150 since 09-03) never opened with a session name, so none entered the key.
- **The condition-3 class has zero rows in the replay window.** It is pinned by a fixture and by Langston's all-history population of 2.
- **Filter installs remain a procedure** (`#1004`), not a mechanism.
- ⚠️ **THE TAG CAN NAME A SESSION WHOSE MARKER WAS ONLY QUOTED** (Langston, Step-4 on the FINDING-D hunk; §9.4 disposition 5 — no work, stated).
  - **Why:** the tag is built from EVERY marker in the body, but suppression keys on the LAST one precisely because earlier markers can be quoted or discussed rather than issued — 42 bodies in all history carry more than one match.
  - **The effect:** a quoted owner shows up in the tag, and the reader cannot tell, because every marker is stripped from the printed body.
  - **Direction:** it over-reports and never under-reports — the same accepted trade as condition 5's spurious wake.
- ⛔ **REPLAY PART (d) CANNOT DETECT THAT CLASS, BY CONSTRUCTION.** It checks each wake line against the implementation's own definition of the tag, so **0 wrong proves the implementation matches its spec, not that the spec names only issued routing.**
