# B-DB-POOL-GUARD — COMPLETION REPORT (r4 = B-DB-APP-TLS included)

- **Batch:** `B-DB-POOL-GUARD` · owner CC-A (OLD Claude) · sprint stage 00 row 3 · Kyle KD-2 (order 3), KD-100 (r4) · `#1239` (absorbs `#1062`)
- **CHANGE-CLASS: architecture** (scope header r4)
- **Record:** `Scope Files/B_DB_POOL_GUARD_SCOPE.md` r4 · `Scope Files/B_DB_POOL_GUARD_PRE_AUDIT.md` · `Change Lists/B_DB_POOL_GUARD_CHANGE_LIST.md`
- **Status at writing (2026-11-21):** CLOSED — Langston Step 11 CONFIRMED, Discord `1573524419488391220`.

> **No scaffolding.** Every objective marked YES below is live on staging and was exercised there. Nothing in this batch waits on a later batch to become functional.

---

## 0. OPEN ITEMS — STATED FIRST, EACH WITH ITS HOME

| # | item | why it is open | home (owner) | closes when / fails when |
|---|---|---|---|---|
| 1 | **OBJ-6 Step-7 UI leg (cross-batch)** — does the Passive Archive Capture card's own fetch complete while its sibling panels contend for the pool | the Chrome check rides the Drift Dashboard read already owed under row 119 / `#1037` am.5 | `SPRINT_TO_LIVE_PLAN.md` row 119 / `#1037` (CC-A) | closes on one Chrome read of the card loading with its siblings; fails if the card times out while the diagnostics pool is idle |
| 2 | **Writer slot reservation — the third guard `#1239` names — NOT BUILT** | measured unnecessary at Step 2: the heavy diagnostics reads were moved to their own pool instead, and every main-pool wait is now bounded and paged | no work: recorded on `#1239` (2026-11-21 note); reopen only if `db-pool-wait` / `db-pool-acquire-timeout` page under a writer burst | — |
| 3 | **A connection leaked OUTSIDE a transaction is invisible to the pool monitor**; no crash-loop or event-loop-stall detection | the monitor reads idle-in-transaction and pool counts; neither sees a checked-out idle connection | stated reach, System Manual Ch.11 §1 and System Impact Map `server/db.ts` row; no work placed | — |
| 4 | **Standalone scripts and `postgres_exporter` are outside the TLS boot gate**; the boot check does not read certificate dates (pinned root valid to 2031-04-26) | the gate is imported only by `server/index.ts`; `postgres_exporter` holds its own DSN | stated in `REPO_TOPOLOGY_AND_SYNC_RUNBOOK.md` "Database transport" and pre-audit T-C4; the exporter's DSN is its own owner's (Infra Claude) | — |
| 5 | **`#340` delivery-stamp residual** | pre-existing alert-delivery limit this batch's pages inherit | `RUNNING_ISSUES.md` `#340` (the residual line, :639) | as recorded there |
| 6 | **`#661` leg 3 — the pages' silence is not evidence** until each family has fired once on real traffic | `db-pool-wait` and `db-pool-acquire-timeout` fired on organic staging traffic (2026-11-26, §7). Idle-in-transaction coverage here still rests on the forced checks | standing rule; no work | — |
| 7 | **`#1254` archival-scheduler leg** | WITHDRAWN (§9.4 disposition 5) at r3 with its citation | `RUNNING_ISSUES.md` `#1254` | — |

---

## 1. OBJECTIVES — YES / NO / PARTIAL

| objective | result | evidence |
|---|---|---|
| **OBJ-1** an ended idle connection never crashes the app | **YES** | `d6ce6b042` + OBJ-1b/1c guard module `server/db-pool-guards.ts`; deployed `93cead7f2` 2026-11-04 23:13:58Z (CI `41931666034` 4/4) |
| **OBJ-2** every statement bounded by the database below the client's 30 s | **YES** | increment 3 `942c65424`: `statement_timeout` 25 s; staging `pg_sleep(26)` ended with 57014 at 25,027 ms; boot invariant `[DB_POOL_INIT] statement_timeout must be below query_timeout` |
| **OBJ-3** a connection handed back mid-transaction is ended by the database | **YES** | increment 3: `idle_in_transaction_session_timeout` 60 s; a 62 s idle-in-transaction connection ended with 25P03 |
| **OBJ-3b** many-short-statements transaction bound | **WITHDRAWN at r3** | Step-2 measurement (pre-audit r2 F3, Langston C1) |
| **OBJ-4** waiting for a free slot has a time limit | **YES** | increment 3: `connectionTimeoutMillis` 10 s; acquire time-out at 10,002 ms with the named error |
| **OBJ-5 (a)/(b)** pages for waits and wait time-outs, self-clearing | **YES** | increment 3b `1d4be9cf7` (+ `4f9fe259f`): `db-pool-wait:<pool>`, `db-pool-acquire-timeout:<pool>`, `db-pool-idle-in-tx:<pool>`, `db-pool-idle-in-tx-ended:<pool>`, each with `:blind`; forced on staging; 3,385 minute lines over 6,195,853 checkouts read |
| **OBJ-5(c)** unplanned process restart pages | **YES** | `app-unplanned-restart:<time>`, resolved at the next deploy |
| **OBJ-6** heavy diagnostic reads cannot hold main-pool slots | **PARTIAL** — mechanism YES, UI leg open (item 0.1) | P5 `5c3b14496` (Step-3 `2de102383`, folds `96082c4d6` / `228d0f964`): `dawntrader_diag`, 4 slots, serves `computeDataArchiveStatus` and `computePassiveArchiveStatus`; stage-attrition cache removed (`DELETED_COMPONENTS_LOG.md` 2026-11-07) |
| **OBJ-7** `#1062` gets its disposition | **YES** | `RUNNING_ISSUES.md` `#1062` note 2026-11-21 (§9.4 disposition 1; the no-unbounded-scans rule stays) |
| **OBJ-8** governance swept by class (every stale Neon reference) | **YES** | System Manual :50, :9458, Ch.11 §1 table and Connection Configuration rewrite, §11 monitor (200 GB, 0.65/0.80), superseded/historical notes |
| **OBJ-T1** every app connection uses verified TLS | **YES** | T-P3 `2a501de33` deployed 2026-11-21 00:08:05Z: `pg_stat_ssl` main 10/10 at 00:15:26Z, diagnostics 1/1 TLSv1.3 at 00:16:19Z, pool monitor `t`; control `postgres_exporter` `f` |
| **OBJ-T2** fail closed at boot | **YES** | `server/db-tls-boot-gate.ts` first import of `server/index.ts` (C-2 `a328ae1ff`); unit tests; boot-check line before pool init (out.log:51102); CI boots the built bundle against the gate (C-1 `2a8af16d0`) |
| **OBJ-T3** a wrong certificate is refused | **YES** | self-generated root `CN = cca-wrong-root` pinned → `SELF_SIGNED_CERT_IN_CHAIN`, server never asked for a password (change list :175) |
| **OBJ-T4** page if any app connection is unencrypted | **YES** | T-P1 `ecbdf882e`: `db-unencrypted-connection:<app>` / `db-unencrypted-blind`; the pre-switch pages `0a4276cb` / `13ee54de` self-resolved 00:08:52Z |

**r4 refs:** T-P1 `ecbdf882e` · C-2 `a328ae1ff` · T-P3 `2a501de33` (deployed; rollback order C-2: previous sha `6a9b6802f` FIRST, then the root-only `.env` copy) · C-1 `2a8af16d0` · change-list close `17ce1d990` · governance this commit.

---

## 2. CI — PER JOB, ON THE FINAL SHA

The deployed code sha `2a501de33` passed 4/4 (run `44838992059`, success). Every later run on the branch to 00:35Z was **cancelled** by concurrent pushes (`44843574186` on `2a8af16d0`, `44843916224` on `17ce1d990`, among others) — **a cancelled job is not green.** The per-job result on the final governance sha is recorded in §2a at Step 11.

### 2a. Final sha
Run `44853032767` on `cbfeab87793510bcb995f5119d912e7feaee27b7` (2026-11-21, started 01:56:05Z): **Build success · TypeScript Check (baseline gate) success · Test Suite success · Docker Build success — 4/4 per job.** That sha contains this batch's governance commit `c2bc48286` and the last memory commit `99d75b844` (both checked with `git merge-base --is-ancestor`). The five runs before it on post-governance shas (`44849625293`, `44849761864`, `44851640280`, `44851834583`, `44852792866`) each had at least one job **cancelled** by a newer push (`cancel-in-progress: true` on group `ci-<ref>`); none failed. The commit that fills this section touches only this report.

---

## 3. GOVERNANCE FILES CHANGED — THE STEP-10 TIER LEDGER, TRANSCRIBED

`CHANGE-CLASS: architecture`

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | entry added: why, what it built, verified, not discharged |
| T1 | `PHASE_HISTORY.md` | ✅ | plain-language entry added |
| T1 | `SPRINT_TO_LIVE_PLAN.md` row 3 | ✅ | status set to "at Step 10" with this report named; flips to CLOSED at Step 11 |
| T1 | `PHASE_19_PLAN.md` | N/A | no row there — not a `P19-*` batch and no in-flight row names it |
| T1 | shared `MEMORY.md` + `MEMORY_CC_A.md` | ✅ | own position block moved to Step 10 (shared file: no consensus truth changed) |
| T1 | the batch `SCOPE` | ✅ | r4 present (written at Step 1, unchanged this step) |
| T1 | the batch `PRE_AUDIT` | ✅ | T-P2 C-3 AS-BUILT note added |
| T1 | the `COMPLETION_REPORT` | ✅ | this file |
| T1 | the `Observation` column | N/A | nothing in scope or pre-audit is an observe-then-decide window; the card goes Governance → Complete |
| T1 | the four session task lists | ✅ | `CC_A_SESSION_TASK_LIST.md` §00 item 1 set to Step 10; the other three: N/A — not mine |
| T1 | Langston's `/home/langston/MEMORY.md` | ✅ | via `langston-memory-write`: r4 live, Step 8 PROCEED, close pending |
| T2 | `SYSTEM_MANUAL.md` | ✅ | Ch.11 §1 Connection Configuration rewritten (two pools, boot invariant, monitoring, transport gate), §11 monitor, Neon references superseded |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | ★ DATABASE TRANSPORT callout; `server/db.ts` row carries the bounds, the diag pool, the monitor and its reach |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1062` disposition note, `#1239` answered note, app-TLS done line |
| T2 | `CHANGES_AND_FIXES.md` | N/A | the batch is new protection, not a recorded bug fix; no registry entry names it as a fix |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | no phase-level roadmap change |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | the bounds are code constants, not tunable parameters under adjustment governance |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional change |
| T2 | `STORAGE_POLICY.md` | ✅ | §6: a restored server needs the pinned root before the app will boot |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | no VTS or asset-class change |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no onboarding learning |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | the method did not change |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | the reviewer's build did not change |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | no stable rule changed |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | no `CLAUDE.md` rule change |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ (earlier increment) | the stage-attrition cache, refresher and route removal recorded 2026-11-07 (P5-4); nothing removed in r4 |
| T2 | `MISTAKE_PATTERNS.md` | N/A | no `MISTAKE:` trailer written in this batch's commits |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ at Step 11 | the open row (:47) is retired at close, never re-dated |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | the ack/resolve process did not change |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | the board did not change |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | not a feature-check run |
| — | `REPO_TOPOLOGY_AND_SYNC_RUNBOOK.md` | ✅ | "Database transport" section: the pinned root, rollback order, operations |
| — | `Change Lists/B_DB_POOL_GUARD_CHANGE_LIST.md` | ✅ | Langston's two C-1 limits folded (exit code discarded; placeholder CA) |

---

## 4. LANGSTON'S STEP-8 NOTES, CARRIED

- The crew-coordination pool (`server/services/crew-coordination.ts`, max 2) is covered by the same `DATABASE_URL` transport and the boot gate.
- The pool monitor's alerts are raised and resolved by `db-pool-monitor` and are **never acked by the crew**.
- `dc4b2ce0` was already resolved before Step 8; no action owed.

## 5. HONEST RESIDUAL

- The `app-unplanned-restart:blind` family fired on organic staging state on 2026-11-24 and self-cleared after the stranded lock object was removed (§6). §7 records organic pool waits and acquisition timeouts. The idle-in-transaction result still rests on forced checks (item 0.6).
- The OBJ-6 benefit under real panel contention is unobserved in the UI (item 0.1).
- The TLS gate proves the URL's settings and a pinned, readable root at boot; it does not prove the root is still the one Supabase signs with — a rotation shows as connection failures after boot.

---

## 6. 2026-11-24 OPERATIONAL FOLLOW-UP — STRANDED DEPLOY-LOCK OBJECT

Alert `ae6f7712-b820-43a8-8488-db06966fc2d7` (`app-unplanned-restart:blind`) fired because `/home/deploy/dawntrader-deploy.lock` existed as a root-owned, zero-byte regular file instead of the directory `dt-deploy` creates. The wrong-type object made the restart reader unable to read `pid`, `holder`, `sha` or `since`, and the same pathname would refuse the next deploy's atomic `mkdir`. Its creator is not attributable: process accounting and audit logging were inactive, and the host record retained only a one-second root SSH session at the file's birth time.

OLD Codex applied the documented #540 tier-3 break on the exact object (inode `285446`, mtime `2026-11-24T07:08:00.140039801Z`): the installed deploy tool first refused with exit 2; three uncontaminated process samples found zero live `dt-deploy` processes; and the lock mtime remained unchanged from 07:24:04Z through 07:26:11Z. The zero-byte file was removed at 07:26:41Z and the removal was immediately posted to Discord. No deploy or restart ran.

The monitor resolved the alert itself at `2026-11-24T07:28:05.902Z` as `db-pool-monitor`, transport `engine`, evidence `#1239`. A read at 07:28:52Z positively controlled the absence check with the still-present deploy record, found the lock path absent, and found zero open `app-unplanned-restart:*` rows. The crew never acknowledged the alert.

`REVIEWER: claim-only · objects that settle the wrong-type lock cause, blocking effect and removal safety; other consistent states · HIT: origin remained unproven and an actual refusal plus multi-sample/≥60-second evidence were required · re-derived yes`

---

## 7. 2026-11-26 OPERATIONAL FOLLOW-UP — ORGANIC MAIN-POOL ACQUISITION TIMEOUTS

**Incident.** OBJ-5(a) alert `d32b69f7-fd41-43a0-9b98-2d8e89f012e0` (`db-pool-acquire-timeout:dawntrader_main`) folded **382** failed acquisitions across the two `POOL_MINUTE_V2` flushes in staging `error.log`. The alert body preserves the first flush. `first_at`, `last_at` and `count` in the alert ledger capture both. Phase A was serving `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016` on PID `235604`, restart `716`.

| Flush UTC | Completed checkouts | Acquisition timeouts | Open / total / idle / waiting at flush | Timing witness |
|---|---:|---:|---|---|
| 14:56:07 | 2,494 | 0 | 0 / 10 / 10 / 0 | Longest reported client hold was a 24,615 ms scheduled-occurrence lock. |
| 14:57:26.555 | 202 | 232 | 9 / 10 / 0 / 72 | One 75,371 ms client hold, labeled `sql:select:portfolio_state`. |
| 14:58:26.555 | 1,860 | 150 | 10 / 10 / 0 / 51 | 18 completed checkouts waited over 10 s. The 75,336 ms maximum was a ticker-snapshot waiter. Three distinct SQL families logged roughly 17 s client holds. |
| 14:59:26 | 2,582 | 0 | 9 / 10 / 1 / 0 | The next flush measured a 1,181 ms maximum wait. |

**Attribution.** Staging `out.log` independently records timer delays of 75,352 ms (14:56:11.079–14:57:26.481 UTC) and 16,961 ms (14:57:26.979–14:57:43.990 UTC). The latter window also appears in the event-loop histogram at 16,643 ms. During the first gap, `error.log` records VTS escalations in all 74 interior seconds (362 escalation lines). The watchdog measures late timer callbacks. The pool records client wall time from checkout to release (`server/db-pool-instrument.ts`), which includes scheduling delays and cannot identify the time spent running a specific statement at Supabase. The maximum-wait label identifies a waiter, so it cannot name the borrower that held a slot. The timings support app-side delay alongside main-pool saturation. The upstream cause and any contribution from a database writer burst remain unestablished. Item 0.2’s trigger for reopening writer reservation has therefore not been met.

**VTS cross-check.** ANALYST's `8a824936e4e74562cf814618876a45560d6a4d0d` records 450 xStock warnings minted 14:56:11.131–14:57:43.008 UTC. A separate grouping of the 450 distinct per-trade keys by their durable `created_at` counted 369 in the first watchdog gap and 81 in the second. The two bracketing VTS sweep logs measured the ledger growing from 7,560,307 to 8,424,775 bytes. On the serving ref, `vts-runner.ts:4118` awaits the crossing serially, `vts-rail-reporting.ts:166` awaits the new per-trade alert, and `system-alerts.ts:472,516,582–593` shows the synchronous read and full rewrite for each new row. That workload is a candidate contributor to timer delay. Per-write or CPU timing is unavailable for this event. The same VTS evidence captured stale xStock inputs before the wave, from 14:42:11 UTC, and still found 450 of 450 xStock looks without a transactable side at 15:14:27 UTC, after acquisition timeouts had cleared. OLD relayed the incident timing and its attribution limits to ANALYST in Discord `1575531733443547177` for the existing `#1191` follow-up.

**Recovery and disposition.** The two timeout flushes are the positive control. All 19 consecutive flushes from 14:59:26 through 15:17:26 UTC reported completed traffic (48,761 released checkouts total), zero acquisition timeouts and zero completed waits over 5 s. Maximum completed wait was 1,569 ms. The final flush reported 2,500 checkouts and zero waiting. The process continued on restart `716`. Resolve this specific incident with this record after confirming the alert's folded count and last timestamp still match. The separate `db-pool-wait:dawntrader_main` row `bc6f0264-0de8-47c2-853c-7cd0a0841d2f` is owned by its monitor and was still active at 15:20:26 UTC.

`REVIEWER: claim-only · objects that settle recovery, timer delay and attribution, and other states consistent with them · HIT: VTS stderr shows continued progress during the first watchdog gap, and the long wall time matches a timer delay rather than measuring database execution · re-derived yes`

---

## 8. 2026-11-27 OPERATIONAL FOLLOW-UP — MAIN-POOL ACQUISITION TIMEOUTS BEFORE R3

**Incident and impact.** OBJ-5(a) alert `a3d72a6a-8b8d-463d-a3f5-dd52b8d7f716` has `count=201` and `first_at=last_at=2026-11-27T01:36:27.728Z`. This was the only main-pool timeout flush in the continuous 29-flush `POOL_MINUTE_V2` read from 01:30:27 through 01:58:27 UTC. At the affected flush the pool had completed 1,064 checkouts, including seven that waited over 10 s. Maximum completed wait was 21,279 ms. The instantaneous flush showed three checked out, seven idle and zero waiting. Separately, `error.log` recorded 201 `SIGMA_CACHE` refresh failures with the acquisition-timeout message at 01:35:50 UTC. On serving Phase A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, `sigma-rate-cache.ts:95–101,126–146` shows those refreshes are background work and a failed refresh leaves the existing cache to expire to the safe floor. This record does not quantify how many evaluations reached that floor.

**Timing and load.** The app watchdog recorded 21,240 ms of excess timer delay from 01:35:29.222–01:35:50.512 UTC and 21,391 ms from 01:35:50.885–01:36:12.326 UTC. The interval histogram independently recorded a 21,441.28 ms maximum. In the second watchdog gap, the alert ledger records 97 distinct `vts-exit-monitor` engine resolutions from 01:35:50.978 to 01:36:12.112 UTC. All 97 were Nov 26 xStock rail warnings with `DECIDED-AFTER-MINT` evidence. The sweep independently logged 97 resolutions at 01:36:12 UTC. The first watchdog gap preceded those resolution stamps and the prior 01:33:29 sweep logged zero resolutions. `7977b2d01` introduced per-row evidence-based clearing. At the serving ref, `vts-rail-reporting.ts:267–280` awaits each eligible resolution separately and `system-alerts.ts:687–702` reads and synchronously rewrites the whole ledger in each call. This is a candidate for compounding the second delay and is relevant to the existing `#1191` work. The first delay's cause is open. Pool hold labels, including the 22,264 ms certificate-repair client hold, measure release wall time and cannot establish the time spent executing a statement at the database. A database writer burst remains unestablished under item 0.2.

**Recovery and preflight.** Acquisition timeouts returned to zero in the next flush at 01:37:27 UTC. Max completed wait fell to 2,435 ms, then 1,039 ms at 01:38:27 and 234 ms at 01:39:27. The 22 consecutive recovery flushes through 01:58:27 recorded 44,139 completed checkouts, no timeouts or completed waits over 5 s, and zero waiters at each flush. Longest completed wait across that whole recovery population was 3,653 ms. In the last flush there were 1,814 completed checkouts and ten idle connections. Phase A remained online on PID `235604` / restart `716`. The recovered event adds no current hold to the Nov 27 R3 preflight. Recheck pool health at the usual preflight checkpoint and retain every independently required gate for the 02:30–02:55 UTC staging slot, the 03:00 UTC natural read and the conditional 06:10–06:35 UTC return. OLD informed ANALYST, INFRA and NEW in Discord `1575692586176348357`. Resolve only this acquisition-timeout incident against this record after a fresh check that its count and last timestamp still match.

`REVIEWER: claim-only · objects that settle the duration, same-process recovery and order of the VTS sweep · HIT: the single timeout flush did not bound the slower-checkout tail or imply individual refresh recovery; the sweep log is completion evidence and needed per-row ledger clocks · re-derived yes`

---

## 9. 2026-11-27 OPERATIONAL FOLLOW-UP — MAIN-POOL WAIT WARNING SELF-CLEARED

**Observed waits.** The exact OBJ-5(a) warning `552e6dc4-6be4-443c-973a-c862b9538a0d` (`db-pool-wait:dawntrader_main`) was promoted at 12:27:53.153 UTC and was active/unacknowledged on first read. Its initial covered window was 12:22:29.200–12:27:29.209 UTC. The five flushes ending in that window contained 9,908 completed checkouts, including 96 waits over 1 s, all in the 12:27:29 flush. At 12:33:29 another 91 of 1,963 checkouts waited over 1 s. Across the 27 consecutive main-pool flushes from 12:17:28 through 12:43:29 UTC, 187 of 54,342 completed checkouts waited over 1 s. None waited over 5 s, no acquisition timed out, and each flush recorded no waiter present. The longest completed wait was 1,515 ms and its label identifies the xStock ticker-snapshot waiter. The label supplies no cause or database execution time. The alert's `fires=10` came from overlapping five-minute evaluations and `waitsOver1s=96` is the worst rolling count. The raw minute flushes supply the non-overlapping total.

**Quiet period and disposition.** The two affected flushes are the positive control. The next ten consecutive flushes, ending 12:34:29–12:43:29 UTC, showed 20,540 completed checkouts, no waits over 1 s or 5 s, no acquisition timeouts and no waiters at those flushes. Maximum completed wait was 474 ms. At 12:43:29.340 UTC the monitor resolved the exact warning as `db-pool-monitor` via `engine` with evidence `#1239`, consistent with the covered ten-minute self-clear rule in `server/db-pool-alerts.ts` at the serving ref. The crew left the row to the monitor. Staging HEAD and build both matched literal Phase A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, online on PID `235604`, restart `716`. This recovered warning adds no current hold. Repeat the normal fresh pool check before the tentative Nov 28 R3 rollout and conditional Phase A return. The staging gates and natural-read plan remain in the Universe Refresh Acts Change List.
