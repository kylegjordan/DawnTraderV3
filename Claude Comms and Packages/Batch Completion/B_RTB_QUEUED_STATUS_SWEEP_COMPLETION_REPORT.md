# B-RTB-QUEUED-STATUS-SWEEP — COMPLETION REPORT

**Owner:** CC-B (NEW Claude) · **change-class:** `non_architecture` (Langston-ruled at Step 1) · **Sprint plan row:** 59g · **Issue:** `#1204`
**Scope / audit / change list:** `Scope Files/B_RTB_QUEUED_STATUS_SWEEP_SCOPE.md`, `Scope Files/B_RTB_QUEUED_STATUS_SWEEP_PRE_AUDIT.md`, `Change Lists/B_RTB_QUEUED_STATUS_SWEEP_STEP4_CHANGE_LIST.md` · **Step-7 record:** `Change Lists/STEP7_DEPLOY_162ae0537_2026-10-17.md` (row 59g sections)
**Code:** `7ae6329f6` (Step 3) · `a3b7430fc` (Step-4 folds) · `162ae0537` (migration split, part 1) · `be6101c78` (part 2) · `749c3e5d3` (Step-8 record items, test + rollback comment)
**Deployed:** `162ae0537` 2026-10-17T13:03:42Z · `07bf5d37b` 13:32:26Z (another row's fold, same build line) · **`0dabe1a78` 14:12:52Z — migration part 2** (migrate 14:12:29Z, 847 ms)

**Open at close (stated first):** nothing in scope. Carried, each with a home: `rtb_shadow_pairings.promoted_trade_id` — a different table, a live `?? null` writer, 0 non-null → `#1124`, plan row 134a; the drizzle snapshot still lists the three dropped columns and the old default → `#1006` (open, its own fix); the four unwritten enum labels stay (Postgres cannot drop an enum value on a live table) — and the scope's **interlock** stands: the RTB list endpoint passes `?status=` into the filter, so a later enum cleanup must validate that parameter first or a retired label becomes a 500.

## 1. What the batch was for
The RTB queue writes two statuses — `active` (admission) and `reconfirmed` (the refresh) — and has since Directive 8.8.4-A3.R8 (2025-12-18). Code from the earlier design still asked for `queued`: a promotion clean-up that therefore never matched (its `rtb:cleared` broadcast never fired), an expired clean-up that always found nothing (expiry has been an immediate DELETE since A3.R9.0), a TCL count term that was always 0, a client fallback, and three columns no path could write. Rule-24 outcome (3), legacy: remove it, and make the two-status contract the stated one.

## 2. Objectives
| # | objective (scope §2) | verdict | evidence |
|---|---|---|---|
| 1 | delete the promotion handler and `removeSignalBySymbol`; archive | **YES** | deleted in `7ae6329f6`; archive `1-system-manual/_archive/deleted-code/b-rtb-queued-status-sweep.removed`; test: constructing the service registers no `PROMOTION` listener (`b-rtb-queued-status-sweep.test.ts`), names fenced absent |
| 2 | delete the dead-status reads (and `cleanupExpiredSignals`, `uiStatus`, the client fallback and arms, the union narrowed, `logRtbTrace` re-labelled) | **YES** | `7ae6329f6` + `a3b7430fc`; `updateRtbSignal` folded in (its only production caller was the deleted lookup — found by the deletion-time census); tests: `getQueuedSignals` and `getLivePoolCount` ask for exactly `active` + `reconfirmed`; the FSM-isolation test re-pointed, not deleted |
| 3 | drop the status default, hand-written migration + tracked rollback + MANIFEST; `#1006` not closed by it | **YES** (extended) | part 1 `2026-10-17-b-rtb-queued-status-sweep.sql` (`DROP DEFAULT`), deployed `162ae0537`; **extended at Step 2-4 (Langston A3 + ruling (b), expand/contract):** part 2 `…-part2.sql` drops `promoted_at`, `promoted_trade_id`, `expired_at` (no reachable writer, no reader; 0 non-null of 22 with `block_reason` 22/22 as control, Langston 2026-10-17), shipped in the deploy AFTER the build that stopped naming them — `dt-deploy` migrates before the restart, and the old build's bare `select()` names every column. Both rollbacks tracked; MANIFEST lines 234 / 235. `#1006` open and annotated |
| 4 | verify on staging, with the insert positive control | **YES** | after `162ae0537`: TCL line without `queued=` (`active=0 reconfirmed=24 total=24`); 0 expired-cleanup lines at start; `status` `column_default` empty; 0 column / null / queue-drop lines; insert control **29** `RTB signal upserted successfully` lines, rows written `active`. After **`0dabe1a78`**: the three columns absent from `information_schema.columns` (the three survivors `block_reason`, `expires_at`, `status` print — control); the refresh rewrote **21 of 21** rows (`last_refreshed_at` after the restart); **insert control met** — `TIA/USD/inside_bar_reversal` upserted `status=active` 14:28:46Z and re-issued 14:29:15Z, refreshed to `reconfirmed` 14:40:45Z; **0** `does not exist` / `null value in column` / `[RTB_QUEUE_DROP]` lines in out + error since 14:12:52Z (the pattern matched PostgreSQL's own wording on a psql error of mine the same hour — the instrument reads it) |

**CI:** run `39041022256` at `f058b1375` (contains every code commit of the batch, incl. `749c3e5d3`) — TypeScript Check ✅ · Test Suite ✅ · Build ✅ · Docker Build ✅. Deploy gates: `39038658137` at `63ce20c2d` (Langston's part-2 ruling ref) and `39039443353` at `0dabe1a78` (the deployed head), each 4/4 per job.

## 3. What was found that was not in scope
- **`updateRtbSignal`** became writer-less of any production caller once the lookup went — folded (§9.4 disposition 1; `DELETED_COMPONENTS_LOG`).
- **`expired_at`** — same class as `promoted_at` / `promoted_trade_id`; taken in part 2 with Langston's confirmation.
- **`rtb_shadow_pairings.promoted_trade_id`** — a different table's empty column behind a live writer → `#1124` / row 134a (disposition 2).
- **The four AI Command Center routes that import a module deleted in 2025** (found at row 3a's Step 7, same deploy) → `#1210`, row 59g1.
- **The OHLC archive writer's two critical alerts at 14:13-14:14Z** began 10 s after this batch's part-2 restart. Not this batch's component (the writer's pool and timeouts, `#705`, owner CC-C); reported to Langston with the window, the comparator (no such failure at the 13:03Z and 13:32Z restarts the same day) and what is not established (why this restart). Langston routed both to CC-C.

## 4. Honest residual
- The enum keeps four labels nothing writes; only the code contract is two-status. A reader of the type alone would still see six.
- The rollback for part 2 re-adds the columns at the END of the table — not a positional restore (immaterial: no positional INSERT on `rtb_signals`).
- The force-refresh route lost its `expiredCount` field; zero readers in client / shared / scripts were found at the ref — an external caller outside the repo would not be visible to that census.

## 5. Tier ledger (Step 10, transcribed)
CHANGE-CLASS: `non_architecture`

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry: what was broken, the fix, the result, what is left |
| T1 | PHASE_HISTORY.md | ✅ | 2026-10-17 entry |
| T1 | PHASE_19_PLAN.md | N/A | 59g is a sprint-plan row; PHASE_19_PLAN takes no new rows since 2026-09-30 |
| T1 | shared MEMORY.md + MEMORY_CC_B.md | ✅ | own position block updated at close; shared file N/A — no project-consensus truth changed |
| T1 | the batch SCOPE | ✅ | r2 + the Step-1 approval folds |
| T1 | the batch PRE_AUDIT | ✅ | audit and plan, A1-A6, plan items 1-7 |
| T1 | COMPLETION_REPORT | ✅ | this report |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-B row 59g added to the open table (it was missing) and closed at Step 11; CC-A, CC-C, CC-INFRA lists not mine |
| T1 | Langston's MEMORY.md | BLOCKED — Langston's own write | asked in the Step-11 dispatch |
| T2 | SYSTEM_MANUAL.md | ✅ | the enum row states the two written statuses; the `rtb_signals` table row corrected (Ready-to-Buy, 33 columns, 7 indexes, measured) |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | §4.3 RTB Service: the status contract and the four removed edges the SIM was silent on |
| T2 | RUNNING_ISSUES.md | ✅ | `#1204` closed (outcome 3); `#1006` annotated (snapshot gap wider); `#1124` item added (Step 2); `#1210` filed |
| T2 | CHANGES_AND_FIXES.md | N/A | a legacy removal, not a bug or risk registry item |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase-level change |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | no tunable |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional rule |
| T2 | STORAGE_POLICY.md | N/A | three empty columns dropped from a hot table; no tier or retention change |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | nothing under the VTS |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no onboarding learning |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | the method did not change |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | the reviewer's build did not change |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no stable rule changed |
| T2 | _archive/CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md rule changed |
| T2 | DELETED_COMPONENTS_LOG.md | ✅ | every removed piece, the four entry points, the state-write census, both migrations and rollbacks, what stays |
| T2 | ACTIVE_PATH_FLOW.md | ✅ | the six RTB exits re-derived with line text (Step 3) |
| T2 | MISTAKE_PATTERNS.md | ✅ | one `wrong-object` ×3 instance: the two Step-1 trailers (`1e349c39f`, `32a476041`) and the Step-10 wrong-folder search (pushed in `f058b1375`, corrected in the closing commit) |
| T2 | GOVERNANCE_EXCEPTIONS.md | N/A | no exception for this batch |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | no alert process touched |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | board columns and fields unchanged |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | the daily check did not run in this batch |
