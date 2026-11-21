# B-DB-POOL-GUARD — COMPLETION REPORT (r4 = B-DB-APP-TLS included)

- **Batch:** `B-DB-POOL-GUARD` · owner CC-A (OLD Claude) · sprint stage 00 row 3 · Kyle KD-2 (order 3), KD-100 (r4) · `#1239` (absorbs `#1062`)
- **CHANGE-CLASS: architecture** (scope header r4)
- **Record:** `Scope Files/B_DB_POOL_GUARD_SCOPE.md` r4 · `Scope Files/B_DB_POOL_GUARD_PRE_AUDIT.md` · `Change Lists/B_DB_POOL_GUARD_CHANGE_LIST.md`
- **Status at writing (2026-11-21):** Step 10 complete; Step 11 awaits Langston's confirmation.

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
| 6 | **`#661` leg 3 — the pages' silence is not evidence** until each family has fired once on real traffic | `db-pool-wait`, `db-pool-acquire-timeout` and `db-pool-idle-in-tx` were forced in tests and on staging, not seen on organic load | standing rule; no work | — |
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
*(filled at the Step-11 dispatch)*

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

- No page family has fired on organic traffic yet; each was forced. Until one does, their silence is not evidence of a healthy pool (item 0.6).
- The OBJ-6 benefit under real panel contention is unobserved in the UI (item 0.1).
- The TLS gate proves the URL's settings and a pinned, readable root at boot; it does not prove the root is still the one Supabase signs with — a rotation shows as connection failures after boot.
