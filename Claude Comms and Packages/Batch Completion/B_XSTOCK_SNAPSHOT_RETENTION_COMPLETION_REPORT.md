# B-XSTOCK-SNAPSHOT-RETENTION — Completion Report

**Status:** **CLOSED 2026-11-12** — Coltrane confirmed the exact Step-11 package ref `d121d7bdab5cf00c9b5d5b555bb9e6cc605aeb74` at 2026-11-12T01:06:44Z

**Scope items left open:** **NONE within `#1194`.** All seven objectives are green. The separately registered KD-19, `#1250`, xStock-bar observation/tally, active-fill, snapshot-freshness (`#441`), shadow-censoring (`#1196`), and missed-cron (`#691`) work were neither created nor closed by this batch and remain under their existing owners and closing conditions.

**Owner:** CC-C / ANALYST Codex

**Change class:** `architecture`

**Placement:** pre-sprint Stage 3 order 6, issue `#1194`, after `B-B75-SCRIPT-TEST-HARNESS` and before `B-CRON-MISSED-CATCHUP`

**Deployed runtime:** `fbbe0b5e4af86be3a87fa0d6c2362f3e7bc899e4`

**Step-8 confirmed evidence ref:** `33e5162af1fbb460fddec9b204322fcb9fe8528e`

**Step-10 governance ref:** `9aa79d56aa22500fc262a0f9584fff3463b9dc03`

## 1. Intended outcome and what was delivered

The two xStock snapshot readers were deliberately bounded to the newest 240 fifteen-minute or 60 sixty-minute rows per symbol, but the stored tables kept every historical key. This batch added one governed storage lifecycle without changing the bars or live read shape: each table keeps 30 complete UTC days plus its per-symbol live floor, and older complete days move through B75 before removal.

One frozen selector identity now drives discovery, export, downloaded proof, exact evidence and deletion. Source, exported and downloaded counts, ordered keys, canonical full rows and object checksum must all agree; deletion then targets only those proven keys under the shared kernel lock and short database lock. A mismatch, timeout or contention leaves the source intact. Cache write-back and prewarm share the floor contract and refuse archived-key resurrection, while historical consumers outside the hot horizon must use a proven rehydrate object or refuse.

The supervised backlog archived and removed 2,163,663 fifteen-minute rows in 100 objects and 573,523 sixty-minute rows in 111 objects. The same frozen selector then returned zero eligible rows and zero eligible symbols in both tables against nonzero 495-symbol controls; live writers advanced afterward, and the next retention run completed with zero deletes and zero failures.

## 2. Numeric delta

**PREVIOUSLY STATED:** the Step-1 moving intra-day read selected 2,170,469 fifteen-minute rows and 574,432 sixty-minute rows.

**NOW:** the frozen complete-day audit and executed cleanup selected 2,163,663 fifteen-minute rows and 573,523 sixty-minute rows.

**REASON:** the final selector freezes the cutoff at the complete UTC-day boundary `2026-10-12T00:00:00Z`, keeping the partial boundary day hot; writers also continued between the two reads.

## 3. Scope objectives

| objective | verdict | evidence |
|---|---|---|
| OBJ-1 — one governed retention contract | **YES** | The Step-11 live read returned exactly the five current values: 30/240 for 15-minute, 30/60 for 60-minute, and mutation enabled. The same frozen selector was exercised for both tables; Step 8 reproduced zero remaining eligible rows and symbols against nonzero 495-symbol live controls. |
| OBJ-2 — reuse B75's move-not-delete path | **YES** | The Step-11 per-object join found 100 fifteen-minute objects covering 2,163,663 rows and 111 sixty-minute objects covering 573,523 rows, one distinct exact-evidence row per manifest, and zero mismatches across identity, manifest/evidence row counts, source/export/download counts, checksum, selector, ordered-key digest and full-row digest. Temporal proof-before-delete rests on the apply records and deployed gate, not this later census alone. |
| OBJ-3 — prune only the exact proven population | **YES** | The deployed sequence performed archive, downloaded readback, exact proof, proven-key delete and post-delete absence. The one-second lock and five-second locked-statement failure path was exercised; contention deferred work rather than weakening proof. At Step 11 the root schedule was corrected from the refused direct command to the checked-in launcher, then a harmless live private-lock probe proved an aged holder rejected both cron-shaped and manual-shaped contenders, a killed holder released immediately to exactly one successor, and that successor remained exclusive. |
| OBJ-4 — preserve cache and prewarm guarantees | **YES** | Post-apply writers wrote or updated 11,832 fifteen-minute and 489 sixty-minute rows at the independent Step-8 read; `captured_at` alone does not distinguish inserts from UPSERT updates. The next retention run found no new eligible object and ended with zero deletes and zero failures; focused tests preserve the live 240/60 floors and beyond-horizon refusal. |
| OBJ-5 — preserve availability and decision provenance | **YES** | The availability anchor stayed `2026-11-09T00:05:00Z`; all five named event waits remained unacknowledged; archive evidence advanced by exactly 211 completed objects, and no evidence table was a delete target. |
| OBJ-6 — make historical consumers honest | **YES** | The reviewed reader census and focused tests keep recent-hot consumers unchanged, require the proven rehydrate path outside the hot horizon, and leave the dormant AMR shadow unreachable. |
| OBJ-7 — execute cleanup safely and prove the bound | **YES** | The full registered populations were archived and removed, the post-clean selector was empty against live controls, natural writers continued, the next run was clean, and the deployed and evidence refs each passed all four CI jobs. UI is N/A because this server-side lifecycle has no UI surface. |

## 4. Review and verification

- Coltrane approved the Step-1 scope only after the selector was bound to a frozen cutoff/ranking identity, ordered key set and canonical full-row digest.
- Coltrane approved the Step-2 plan only after the unsafe stale-lock reclaim was replaced with one kernel-owned lock, crash recovery was made owner-safe, contention mutations were added, and vacuum was limited to once per deleting table/run.
- Coltrane approved the corrected implementation at deployed ref `fbbe0b5e4af86be3a87fa0d6c2362f3e7bc899e4` after the dry-read timeout and ranked-floor cost were corrected without relaxing the one-second/five-second delete safeguards.
- Step 8: Coltrane independently reproduced every registered leg and returned **PROCEED** at exact evidence ref `33e5162af1fbb460fddec9b204322fcb9fe8528e` on 2026-11-11T20:19:54Z.
- Deployed-code CI run `43086693898`: TypeScript Check **SUCCESS**, Test Suite **SUCCESS**, Build **SUCCESS**, Docker Build **SUCCESS**.
- Step-8 evidence CI run `43092508271`: TypeScript Check **SUCCESS**, Test Suite **SUCCESS**, Build **SUCCESS**, Docker Build **SUCCESS**.
- Step-10 governance CI run `43128218338`: TypeScript Check **SUCCESS**, Test Suite **SUCCESS**, Build **SUCCESS**, Docker Build **SUCCESS**.
- Exact archive population: 100 fifteen-minute objects / 2,163,663 rows and 111 sixty-minute objects / 573,523 rows; 211 of 211 objects have complete exact evidence.
- Step-11 current-policy read: exactly five wildcard rows — 15-minute 30 days/240 floor, 60-minute 30 days/60 floor, mutation `true`.
- Step-11 per-object proof census: 100/100 and 111/111 distinct manifest/evidence joins, with zero identity, count, checksum, selector or digest mismatches.
- Exact post-clean population: zero eligible rows and zero eligible symbols in both tables under the frozen cutoff/ranking identity; positive controls found all 495 represented symbols in each live table.
- Writer/next-run control: 11,832 later fifteen-minute writes/updates and 489 later sixty-minute writes/updates at the independent read; the registered next run completed with zero objects, deletes and failures.
- Availability continuity: the graded-window anchor and all five named waits remained unchanged and unacknowledged; only the two completed retention-failure alerts were resolved with successful-run evidence.
- Scheduled-entry and process-lock control: the root schedule now names `b75-retention-run.sh`; the private live fixture at deployed repository/build ref `fbbe0b5e4` aged its lock seven hours, observed cron/manual refusals, killed the holder, admitted exactly one of two simultaneous successors and rejected a third contender. The private fixture directory was removed in the same command.

## 5. Honest residuals and separate work

1. The evidence proves the registered backlog and the next post-writer retention run. It does not guarantee future database or archive-provider availability.
2. Writer contention deliberately fails closed and may defer an object to a later run. It cannot authorize an unproved delete.
3. Ordinary vacuum makes freed pages reusable inside the database but does not promise immediate physical file shrinkage.
4. KD-19 alert `7e20ed0f`, the `#1250` UI/window work, xStock-bar final gate and daily tallies, active-fill alert `78be13a6`, snapshot freshness `#441`, shadow censoring `#1196`, and the next sequenced missed-cron batch `#691` remain under their existing records. They are separately placed work, not residual scope from `#1194`, and none was acknowledged or resolved here.

## 6. Governance files changed — transcribed from Step-10 commit `9aa79d56a`

CHANGE-CLASS: architecture

| # | document | verdict | one-line reason |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | Added the Step-10 architecture record, exercised totals and known limits. |
| T1 | `PHASE_HISTORY.md` | ✅ | Added the dated Step-10 lifecycle result and pending Step-11 boundary. |
| T1 | active `SPRINT_TO_LIVE_PLAN.md` row | ✅ | Advanced pre-sprint Stage 3 order 6 to Step 10 complete with deploy and evidence refs. |
| T1 | `PHASE_19_PLAN.md` | N/A | This non-`P19-*` batch has no row there. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_C.md` | ✅ | Added the retention invariant and advanced Analyst position to Step 11 while keeping both files under cap. |
| T1 | batch `SCOPE` | ✅ | Recorded the seven-objective green disposition and exact exercised populations. |
| T1 | batch `PRE_AUDIT` | ✅ | Reconciled P1-P10 to the deployed design, live values and known limits. |
| T1 | `COMPLETION_REPORT` | ✅ | Step 11 creates the final report from this exact ledger; no report is written early. |
| T1 | `Observation` column | N/A | The registered natural-writer and next-run proof completed inside Step 7; no post-close window remains. |
| T1 | four session task lists | ✅ mine / N/A ×3 | Updated `CC_C_SESSION_TASK_LIST.md`; the OLD, NEW and INFRA lists are not mine. |
| T1 | Langston `/home/langston/MEMORY.md` | ✅ | Replaced a fetchable B75 mechanics line with the retention invariant; loaded set fell 143,031 → 143,004 bytes. |
| T2 | `SYSTEM_MANUAL.md` | ✅ | Corrected false stored-row bounds and documented the ranked archive/delete lifecycle. |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | Corrected both snapshot components and added the retention lifecycle component. |
| T2 | `RUNNING_ISSUES.md` | ✅ | Marked `#1194` fixed with exact exercised evidence; Step 11 close remains explicit. |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | Added the defect, repair, evidence and known-limit record. |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | The batch changes no phase-level sequence or roadmap item. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | No strategy, regime, filter or calibration parameter changed. |
| T2 | `AUTHORITY_BASELINE.md` | N/A | No constitutional authority or decision boundary changed. |
| T2 | `STORAGE_POLICY.md` | ✅ | Added both tables, 30-day-plus-floor policy, proof contract, kernel launcher and exercised manifest evidence. |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | ✅ | Reviewed the 15-minute working list: no status/epoch change; older eras now require proven rehydrate. |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | No asset-class onboarding learning or new class was introduced. |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | No role, workflow gate or build method changed. |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | The reviewer runtime, invocation and read path are unchanged. |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | No stable crew rule changed. |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | `CLAUDE.md` was not changed. |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | Recorded the retired age-reclaimed/unlinked O_EXCL lock and its replacement by the checked-in kernel-lock launcher; this Step-10 ledger correction was found and filled during Step 11. |
| T2 | `MISTAKE_PATTERNS.md` | N/A | No `MISTAKE:` trailer was written and no weekly pass ran. |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A | Kyle granted no exception to a governed rule. |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | Alert acknowledgement and resolution semantics are unchanged; separate waits remain open. |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | Existing protocol was followed; only the card status moved to Governance. |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | The daily model/feature check did not run in this batch. |

The ledger's future-tense completion-report row is satisfied by this file. The report carries the Step-10 list as written, including every N/A row; it was not reconstructed from memory.

## 7. Delivery reconciliation

The Post-Audit Roadmap, the active Sprint-to-Live Plan and the Delivery Board are reconciled at close: this batch has the agreed Stage-3 order-6 plan row, no roadmap row owns a different state, and the card is `Complete` / `Approved` / blocked on `Nothing`. The next sequenced plan row is `B-CRON-MISSED-CATCHUP`; separately named waits remain where they were.

## 8. Fresh-reader record

`REVIEWER: claim-only · name the objects and alternative states that could leave this seven-objective batch not closable · HIT — captured-at counts did not distinguish inserts from UPSERT updates; the pre-registered live process-lock leg was absent from the retained close evidence; aggregate archive totals did not alone prove per-object equality; current policy needed a fresh five-row read; technical readiness was not workflow closure; and “no unplaced residual” was broader than the named objectives · re-derived yes`

The report now says writes/updates rather than inserts. The root schedule's direct-command drift was corrected and read back, then the live aged-holder/crash/successor fixture passed. A fresh join across all 211 objects found zero per-object identity/count/checksum/selector/digest mismatches, and the fresh policy read returned the five exact current values. The pushed ref, four-job CI, issue close, board move and Coltrane confirmation now exist; separately placed `#441`, `#1196`, `#691` and event/window waits remain named rather than hidden inside an absence claim.

## 9. Final reviewer confirmation

At 2026-11-12T01:06:44Z, Coltrane **CONFIRMED** exact Step-11 package ref `d121d7bdab5cf00c9b5d5b555bb9e6cc605aeb74`. He independently reproduced the five policy values, all 100/100 fifteen-minute and 111/111 sixty-minute manifest/evidence joins with zero mismatches, the deployed repository/build identity, the corrected scheduled launcher, and the live aged-holder/crash/successor lock behavior. CI run `43130764991` passed TypeScript Check, Test Suite, Build and Docker Build at that exact ref.

`#1194` is closed, the Delivery Board is `Complete` with `Blocked on = Nothing`, and the next sequenced batch is `B-CRON-MISSED-CATCHUP`. Every separately named event/window wait and residual remains open under its existing record.
