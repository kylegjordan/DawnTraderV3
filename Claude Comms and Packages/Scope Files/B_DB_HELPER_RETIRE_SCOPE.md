# B-DB-HELPER-RETIRE — SCOPE (Step 1) — r1

change-class: non_architecture

> **Step-1 ruling — PROCEED.** Coltrane approved r1 at exact ref `4f9f549c7021502a7f17daa642c7163ee0c7eb1c`, Discord 2026-11-24T10:24:26Z. Step 2 must resolve every conditional/held row, enumerate the complete 49-file live `psql` population (not only the 53 `DATABASE_URL` files), and pre-register reconstructible rollback material—not hashes alone—for each untracked live deletion. No edit, deletion, staging install, deploy or Step-3 work was authorized by the ruling.

**Owner:** Infra Codex (standing in for Infra Claude / CC-INFRA) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row 5a3 · **Decision:** KD-100 (2026-11-16) · **Issue:** `#1259` · **Ordering:** after the closed `B-DB-MAP`, before `B-CONVERSATION-INDEX`.

**Class judgement:** this is a staging-operations and repository-tooling reduction. It removes obsolete direct-login helpers, routes still-needed crew reads through the existing `dt-sql` / `dt_reader` boundary, and explicitly governs the few paths that must retain a write-capable or test-local connection. It changes no trading decision, application database pool, database schema, role grant, RLS policy or stored row.

---

## 0. What this batch is for

`B-DB-READ-TOOL` reduced one raw `psql` call from two login attempts to one, and `B-DB-READONLY-ROLE` gave governed crew reads their own database-enforced read-only role. Neither batch removed the older helpers that still build database logins from the application credential. Those helpers can still bypass the read-only boundary, retain write power, and make a second run after a password rotation sufficient to trigger the Supabase address ban recorded in `#1259`.

This batch decides **each helper individually**. A helper is not changed merely because a static scanner called it an operator path. Every candidate receives one exact disposition: retire; route a still-needed read through `dt-sql`; retain a named governed direct connection because it performs a write, role bootstrap, migration, or isolated test; or hold it under an active owning batch until that owner releases it. Blank, implicit and population-wide dispositions are forbidden.

The two populations are deliberately separate:

- **Checked-in exact-ref population:** `B-DB-MAP` records **85 helper rows across 79 files**. Of those, **43 rows across 40 files** carry `evidence_class=operator`; the other 42 rows are runtime, test-only or migration/DDL evidence and are not automatically retirement candidates.
- **Live top-level staging population, measured 2026-11-24:** 89 files under `/home/deploy` with suffix `.py|.sh|.mjs|.cjs|.js|.ts`; **49 contain `psql`, 53 contain `DATABASE_URL`, 0 contain `PGPASSWORD`, 0 contain `dt-sql`, and 0 of 89 were unreadable**. This is a content census, not proof that every file is executed. It supersedes the older 88-file / 51-`psql` / 48-`DATABASE_URL` census for current population only; the file-by-file delta must be explained at Step 2.

The live and repository populations do not have set equality. Many live `lang_*.sh`, `obj0_*.sh` and ad-hoc query files are untracked, while many checked-in analysis tools are not installed at `/home/deploy`. The implementation therefore needs one reconciled disposition ledger spanning both sources; deleting only the checked-in 40 or only the live 53 would leave the problem open.

---

## 1. Objectives and proof criteria

| # | objective | verification drafted now; filled at Step 7 |
|---|---|---|
| **OBJ-1 — exact two-source census** | At the implementation ref, enumerate every checked-in helper row and every top-level live staging script that contains a direct-login marker: bare `psql`, absolute `/usr/bin/psql`, the installed wrapper path, `DATABASE_URL`, `PGPASSWORD`, `new Client`, `new Pool`, or `dt-sql`. Record file identity, helper kind, tracked/live status and current owner/batch when known. Generated files, dependencies and the application runtime are counted separately, never silently mixed into the operator denominator. | Independent scanner and hand-derived controls have set equality. Positive controls find one bare `psql`, one absolute-path caller, one node-postgres client, one governed `dt-sql` caller and one non-candidate runtime pool. A deliberate hidden absolute-path fixture makes the equality test red. |
| **OBJ-2 — one disposition per helper** | Every member of OBJ-1 has exactly one ledger disposition: `RETIRE`, `ROUTE_DT_SQL`, `RETAIN_GOVERNED_DIRECT`, `RETAIN_TEST_LOCAL`, or `OWNER_HOLD`. Each retained/held row names why, the authority/owner and its release condition. No file inherits another file's answer by prefix or directory. | Schema validation rejects a missing, duplicate or unknown disposition and rejects retained/held rows without reasons. Independent count reconciliation proves `candidates = retire + route + governed-direct + test-local + owner-hold`. |
| **OBJ-3 — retire obsolete one-off login paths** | Remove obsolete completed-study and ad-hoc live helpers that have no current reader, service, timer, alert, runbook or open-batch need. Checked-in deletions remain recoverable in Git; live untracked removals are named by path and pre-removal SHA-256 in the change record. No executable backup, renamed copy or runnable archive remains on staging. | Exact-path absence checks after install; positive control finds a deliberately retained governed helper. Service/timer/cron/process and repository-reference census shows zero surviving caller to each retired path. Mutation test leaves one fenced retired name and fails. |
| **OBJ-4 — route still-needed crew reads through `dt-sql`** | A helper whose only required operation is a crew/operator read must invoke the installed governed read path and therefore authenticate as `dt_reader`; it must not parse the app `.env`, construct a DSN, set its own password, call absolute `psql`, or instantiate its own node-postgres client/pool. Multi-statement reads are passed as SQL input to one `dt-sql` call, not split into retrying calls. | Static fence plus live executions. The login audit attributes one `dt-sql` attempt to the helper, `current_user=dt_reader`, and a harmless persistent-write probe is refused by the role. Wrong-path mutants for `.env`, `DATABASE_URL`, `/usr/bin/psql`, `new Client` and `new Pool` all fail. |
| **OBJ-5 — preserve and govern legitimate exceptions** | Do not force write-capable migrations, credential changes, role bootstrap, application pools, local CI fixtures or isolated result-shape tests through a read-only command. A retained direct path is allowed only when the ledger names its purpose and boundary. The initial retained set includes `dt-api-set-crew-password`, `dt-sql-role-setup`, `scripts/db-migrate.ts`, the `dt-sql` login implementation, CI's isolated database and the measure-gate local test; Step 2 must confirm their exact connection surfaces. | Each exception has a source-level test or operational proof of the named boundary, and the retirement fence allowlists the exact file plus kind rather than a directory or wildcard. A new unlisted direct-login path fails CI. |
| **OBJ-6 — do not steal active-batch evidence** | A helper belonging to an open observation or implementation batch is `OWNER_HOLD`, not deleted or rewritten behind its owner. Known first-pass holds include `B-DISK-HEADROOM`, `B-CREW-ACCESS-HARDEN`, `B-XSTOCK-BAR-AVAILABILITY`, `B-XSTOCK-BID-TRIGGER-RELAND`, `B-DB-POOL-GUARD`, `B-OHLC-FRAME-GUARD` and `B-CRYPTO-FEED-WATCHDOG`. A hold ends only on the owner's recorded release or batch close, after which this batch re-dispositions the file. | Re-read the plan, memory/task ledgers and completion reports at implementation time. The final ledger contains zero unexplained holds and records the release evidence for every hold that was cleared. |
| **OBJ-7 — close the live bypass surface without disturbing the app** | After the reviewed install, no top-level `/home/deploy` helper outside the exact retained/held manifest directly reads `DATABASE_URL`, directly invokes `psql`, or creates a node-postgres connection. The app checkout, PM2 process, application pool, deployed ref, database schema and data remain unchanged. `dt-install-drift` remains green for governed installed files. | Repeat the full live census with the same suffix population and zero read errors; reconcile every remaining hit to the manifest. Prove the app deploy record, PM2 start/restart counters and application pool files did not change. A real governed read still succeeds. |
| **OBJ-8 — durable prevention and operator record** | CI owns a direct-login census/fence for checked-in operator tooling, including absolute-path callers, and the runbook names how a future helper requests a governed exception. The database map remains the inventory source; this batch adds the disposition layer rather than changing scanner evidence to hide retained paths. | CI 4/4 green; add one unlisted helper fixture and see the fence fail. Regenerate/verify the database map and show retained helpers remain honestly visible with their exact kinds. |

### Not in this batch

- No application/dashboard work. The main dashboard remains outside this batch.
- No edit to `server/db.ts`, application pools, trading runtime, database schema, roles, grants, RLS or stored data.
- No deploy or PM2 restart. The only possible live action is a separately reviewed install/removal of staging helper files.
- No automatic rewrite of arbitrary SQL. If a helper's semantics cannot be preserved through `dt-sql`, it is held or returned to review; it does not receive a compatibility fallback.
- No deletion of evidence needed by another open batch, and no change to `reviewer_staging_access.py` while `B-CREW-ACCESS-HARDEN` owns it without explicit coordination.
- No claim that a file containing a login marker is executed, safe, unsafe or obsolete until its callers and provenance are read.
- No unban API watcher. KD-93 RECOVER remains a separate undecided proposal in `#1259`.

---

## 2. Architectural read

**System Impact Map, “Crew database reads,” re-read 2026-11-24.** `dt-sql` and `dt-sql-login` are the governed read boundary: one verified-TLS attempt, serialized fail-closed intent, dedicated `dt_reader`, no fallback credential. A still-needed crew read belongs downstream of that boundary. The application pools are a different trust class and stay outside this batch.

**System Manual, “Crew Database Reads,” re-read 2026-11-24.** `dt_reader` carries database-enforced read-only privileges and can still see RLS-shaped partial/empty results. Routing a helper through `dt-sql` therefore changes its authority intentionally and may change what it can observe; Step 2 must compare the helper's required relations with the role's visible result before choosing `ROUTE_DT_SQL`. A zero-row result is not proof that the helper is obsolete.

**B-DB-MAP hand-off.** The exact-ref helper inventory is a source R/C static-analysis artifact, not a deletion verdict. It separates evidence classes and preserves unresolved SQL rather than claiming a miss. This batch keeps that honesty: it consumes the rows and adds dispositions without weakening the scanner to make the counts look clean.

**Blast radius.** A mistaken retirement can remove a diagnostic needed to close an observation batch; a mistaken route can turn a required write into a silent no-op or narrow an RLS-visible result; an over-broad retained exception can preserve the original app-credential bypass. The controls are exact-file disposition, owner holds, database-role refusal, and a default-deny CI fence—never a directory-wide allowlist.

---

## 3. Provenance and initial dispositions

The Git audit aid was used only as a lead; each cited introducing ref below resolved and its subject is quoted verbatim. These are **Step-1 initial outcomes**, not permission to delete. Step 2 must read current callers and batch state and then freeze the exact ledger before implementation.

### 3.1 Governed infrastructure and isolated tests — outcome (1), relevant and correct, unchanged

| file(s) | introducing provenance | initial disposition |
|---|---|---|
| `.github/workflows/ci.yml` | `02e18f208416085d55be7df37e7e4456fd12862e` — “Batch 40: Migration scaffolding — Dockerfile, GitHub Actions CI/CD, nginx, PM2, env template” | `RETAIN_TEST_LOCAL`; its Postgres is the isolated CI service, not staging. |
| `comms-infra/staging/dt-sql`, `comms-infra/staging/psql-wrapper` | `18cb46eb289af0de9418a7cc9c57574fe59e4578` — “B-DB-READ-TOOL Step-3: dt-sql, the psql wrapper, tests and mutants, drift enrolment” | `RETAIN_GOVERNED_DIRECT`; these implement/enforce the boundary. |
| `comms-infra/staging/dt-sql-login`, `comms-infra/staging/dt-sql-role-setup` | `f9087a56c0b43f33466baba0d4945e25e8cfac93` — “B-DB-READONLY-ROLE Step 3: dt-sql logs in as its own read-only role dt_reader” | `RETAIN_GOVERNED_DIRECT`; reader login and privileged role bootstrap are different named operations. |
| `comms-infra/staging/dt-api-set-crew-password` | `bd698603a600314b2c281a2bb194d67747b73115` — “B-CREDENTIALS-PRIVATE-REPO Step-3: OBJ-1 crew login — dt-api, setter, dtmint, install drift, the agents' mint” | `RETAIN_GOVERNED_DIRECT`; a credential writer cannot use the read-only role. |
| `comms-infra/staging/dt-install-drift` | same `bd698603…` subject above | `RETAIN_GOVERNED_DIRECT`; its read is already through `dt-sql`, retained as a positive control. |
| `scripts/db-migrate.ts` | `a129e567b0ac04a2e22bb40546f5e1891b3b7b60` — “B65.1-HF2 + HF3: baseCurrency insert fixes + proper db:migrate runner” | `RETAIN_GOVERNED_DIRECT`; explicit migration writer, never routed to a read-only helper. |
| `scripts/measure-gate/test-guard-result-shape.mjs` | `d1f7754d4ab7e51eae9feb7699a40872e38ada45` — “B-MEASURE-GATE Step-3: OBJ-6c built, proven 28/28, wired on PostToolUse, delivery measured live” | `RETAIN_TEST_LOCAL`; Step 2 verifies it cannot select the staging credential. |

### 3.2 Paths owned by open work — outcome (3) for now, intentionally retained but not free-standing

| file | introducing provenance | initial disposition / release condition |
|---|---|---|
| `comms-infra/security/reviewer-staging-access/reviewer_staging_access.py` | `88855908d4880f2b03f0334065a79af4b66812b7` — “B-CREW-ACCESS-HARDEN: preserve reviewer staging parity” | `OWNER_HOLD`; that batch owns the verifier. Re-disposition only after its current increment lands or owner coordination is recorded. |
| `scripts/analysis/b_db_pool_guard_weekday_qd_read.py` | `02830e87581b3a356f528cf1f72b1d5d1fa75469` — “B-DB-POOL-GUARD Step 7: the weekday qd-probe read (no main-pool effect) and the archival-scheduler leg withdrawn; #1254 filed” | `OWNER_HOLD`; close/release of B-DB-POOL-GUARD. |
| `scripts/analysis/b_disk_headroom_eligibility.ts` | `434d0873143d5973f7470e629effa455c0147b68` — “B-DISK-HEADROOM Step-2: pre-audit and plan - the sweep's own eligibility code predicts every proof night, tonight's sweep is its control” | `OWNER_HOLD`; B-DISK-HEADROOM is in observation through its 2026-12-01 read. |
| `scripts/analysis/b_ohlc_frame_guard_futures_partial_bar_check.py` | `c0b102ebfb05df56a9c528f91677dd5f16e88615` — “B-OHLC-FRAME-GUARD Step 2 r2: two defects folded in, and half of the counter fix I had approved was wrong (#1029, #1030)” | `OWNER_HOLD`; current batch state and surviving verification duty re-read at Step 2. |
| `scripts/analysis/b_xstock_bar_availability_c6_timing_read.ts` | `6c675bdba8459b6a843b798b6d574a3dc1386c87` — “B-XSTOCK-BAR-AVAILABILITY C6: timing-read harness over the widest surviving span (not a grade)” | `OWNER_HOLD`; its batch is still open and the map records its special helper reason. |
| `scripts/analysis/xstock-refusal-holds.py` | `39b70d56e231b4dea20d23badb4ec8c80ca1d1a6` — “B-XSTOCK-BID-TRIGGER-RELAND Step-2 r2: objective 1b stays; measured on absolute spread per hold” | `OWNER_HOLD`; open observation/evidence use. |
| `scripts/analysis/xstock-wide-book-stop-vs-next-open.py` | `a38b912d68d8d17083bfa10d147c7e3c5c161264` — “B-XSTOCK-BID-TRIGGER-RELAND: objective 6 delegated by Kyle to CC-C + Langston + Coltrane; spread_blown arming design r1 with the wide-book stop evidence” | `OWNER_HOLD`; same owner/release boundary. |
| `scripts/b-crypto-feed-watchdog-witness-backfill.ts` | `208e824a6553cb9d40d4eb43d8edcf15336d8189` — “B-CRYPTO-FEED-WATCHDOG Step-3: recorder connection watch, live-share grade, vouched witness, witness age (#1232)” | `OWNER_HOLD`; current witness/backfill duty re-read before any change. |

### 3.3 Completed-study and one-off candidates — outcome (2), useful intent but unsafe implementation changes now

The following paths introduced legitimate study or backfill work. Their intent is not rejected; their direct application-credential login is. Step 2 must prove whether each still has a caller or open obligation. If yes and read-only, it becomes `ROUTE_DT_SQL`; if its work is complete and no caller remains, it becomes `RETIRE`. No member may remain on this conditional outcome at the Step-4 implementation gate.

| file | introducing ref and verbatim subject |
|---|---|
| `scripts/analysis/obj_pa_pb.cjs` | `f1980fc0016ae0e34478e60d02926c6d6fa0435c` — “B-XSTOCK-FEED-SANITY Step 2: pre-implementation audit AND implementation plan (draft 2), with the P-A/P-B/feasibility instrument” |
| `scripts/b-1-5-universe-audit.ts` | `20f9754414f3d46896bf2f67706791fd63eb2404` — “B.1.5 — xStock liquidity filter now uses live order-book depth instead of broken 24h volume” |
| `scripts/b-new-34b-prewarm-snapshot.ts` | `d9031fe8de2abcbbfa96d5850780e33dd4489f13` — “B-NEW-34b: xStock 60-min snapshot architecture (replaces B-NEW-34a lookback-tuning approach)” |
| `scripts/b-pattern-evidence-15m-study.ts`, `scripts/b-pattern-winner-traits-study.ts` | `51f3bd329b84920776e980f531d15cd4b0ebe5fd` — “Pattern edge analysis: conditional-edge studies + hidden-contextual-edge study plan” |
| `scripts/b-phase-a2-backfill.ts` | `d567399bc57a01f6d3d59a09b32085e66eec1384` — “B-PHASE-A2 (E): xstock_dbs_backfill table + backfill script” |
| `scripts/b-xstock-calib-b1a-replay.ts` | `9d0a10271d5f976d6fd64c597238cce1ef04002d` — “B-XSTOCK-CALIB B.1 — sibling-feature helpers + archive-replay harness” |
| `scripts/b-xstock-calib-b3-regime-audit.ts` | `db10e26d2bd87b5919c98c46f71f995b85822b20` — “B.3 audit replay script (offline diagnostic, read-only) — Langston Step-4 ACK” |
| `scripts/b-xstock-calib-b31a-gate-audit-2.ts` | `3835e0129554e6d0800c70e5e67a36c8655b0f8e` — “B3.1a: gate-correctness audit chunk-2 engine + findings report + Langston review ask” |
| `scripts/b-xstock-calib-b31a-gate-audit.ts` | `3c90b8dd49601228e607d23cae739b176c773db9` — “B3.1a gate-correctness audit engine — chunk 1 (core + L1 pure-filter)” |
| `scripts/b4-bar-frequency-study.ts` | `4aa7929a41845e64fc944bdc048cf11b50f96236` — “B3.1b CLOSED: governance (BATCH_CATALOG/PHASE_HISTORY/RUNNING_ISSUES #199/completion report) + W1 bar-frequency engine” |
| `scripts/b4-dbs-15m-recompute.ts` | `8175a1c63e4545acfc7388da387b2caa60199f42` — “B.4 foundation: DBS 15m recompute (full per-bar history) + weekend prewarm warms 15m snapshot” |
| `scripts/b4-regime-parity.ts` | `e7f4e52d13ad5f0352686c214bbda3ad78f6823c` — “B.4 foundation Phase-II: 14 regime thresholds recalibrated for 15m + PARITY exit gate PASS” |
| `scripts/b4-regime-recalib-study.ts` | `0bbeafc813b163b48e87e57c3c05a4bf4cbe06b9` — “B.4 foundation Step-3 (Phase-II): 15m regime-recalibration study engine” |
| `scripts/b4-vndi-recalib-study.ts` | `5baa15bef6c4de7ac651f493e541cb904c07ab92` — “B.4 foundation: VN/DI (IMF screen) 15m recalibration study + export computeDirectionalIntegrity” |
| `scripts/b5-w20c-provenance-replay.ts` | `1284db5dcd6c93d84abf621b566bf4b41aa78a42` — “Replay-parity study: provenance-fed W2.0c harness + post-accrual findings — coverage 100.00% of 1.648M decisions, Tier-1 70.73% (gate not cleared), root cause = the settled-bar REFERENCE leg (snapshot table vs engine in-memory series; RI-a checksum 33% exact / 64% within 0.1%); three replay-side artifacts fixed in-run (era disposition, flush-time anchor, MCE 60s cache) that also contaminated the old 80% ceiling; defined exit = micro-batch after the switch-on adds a settled-window integrity leg (hash or the 5 decision-time indicators) + re-accrual alert; #206 updated (alert 7362f63f resolved)” |
| `scripts/b5-w2a-geometry-sweep.ts` | `4a4950ff129ba20f37924a8b3f4446816107a63d` — “B.5 W2.0a geometry-sweep harness + results (read-only diagnostic) for Langston review” |
| `scripts/b5c-diag.cjs`, `scripts/b5c-poll.cjs`, `scripts/b5c-verify.cjs` | `76e3050bf784b47702fcf60cdb17e830e8915cb7` — “P19-B5c Step-10/11 governance: SIM (S15 registry + component note + #86 flip) + System Manual friction xref + catalog/history/plan/running-issues/multi-asset + completion report” |
| `scripts/hce/hce_ohlc_sim.py` | `e707a7d02f828e71e013aac8167420ec175d11a6` — “HCE P2: OHLC managed-exit validator (pre-registered bar) + RUNNING_ISSUES #204 xStock units-bug 45x” |
| `scripts/hce/hce_rawfeat.py` | `1e5b5f9ce043ee5b4c0668661703dadf442a532c` — “HCE broader angles: deeper selectivity (xStock EV-gate works, crypto inverts) + raw-feature buy-the-dip lead” |
| `scripts/xstock-hollow-recut.ts` | `3b2c4966c9c9e84c659b1f96d67b2d4dc2943226` — “B-XSTOCK-FEED-SANITY Step 3: the book-state guard on the xStock exit path (#943, closes #567) — build only, DEPLOY HELD to 2026-09-07” |

### 3.4 Live untracked helper population — provenance unavailable in Git; inferred, not asserted

The 53 current live files containing `DATABASE_URL` are: `.langston-rerun.py`, `_cols.sh`, `_pos.sh`, `_pos2.sh`, `b_disk_headroom_eligibility.ts`, `b_disk_headroom_lock_sampler.sh`, `b_disk_headroom_set_retention.sh`, `ccc_ring.sh`, `fg1check.sh`, `lang_1250_q1.sh` through `lang_1250_q6.sh`, `lang_8c_mig.sh`, `lang_8c_rtb.sh`, `lang_8c_tec.sh`, `lang_c5cf_q1.sh` through `lang_c5cf_q7.sh`, `lang_eg_q1.sh` through `lang_eg_q8.sh`, `lang_kd19_q1.sh`, `lang_q0.sh` through `lang_q6.sh`, `lang_strk_q.sh`, `lang_strk_q2.sh`, `lang_strk_q3.sh`, `obj0_hollow.sh`, `obj0_hollow_0827.sh`, `obj0_hollow_0901.sh`, `obj0_run.sh`, `obj0_sig.sh`, `obj_pa_pb.cjs`, `verify_cols.cjs`, `vts_trend.cjs`, and `watch_xstock.sh`.

These files are outside Git, so an introducing commit/subject cannot be recovered. Their names suggest reviewer queries, batch evidence, one-off object checks and watches, but that is **inference only**. Step 2 must read owner, mode, mtime, content hash, caller references and scheduled/process use before assigning the final disposition. The `b_disk_headroom_*` live files begin as `OWNER_HOLD`; no other filename prefix receives a group answer.

---

## 4. Step-2 questions the audit must settle before implementation

1. The exact final disposition and reason for every member of both populations, with no conditional rows left.
2. Which live untracked helpers have a current cron/systemd/process/runbook/caller and which are inert one-offs; file mtime alone is not a usage verdict.
3. Whether each read-only candidate's required relations and results remain visible to `dt_reader`, including RLS-shaped differences.
4. Which repository study scripts remain reproducibility assets even after their batch closed; a retained reproducibility tool must still lose the app credential or be proven isolated from staging.
5. The exact CI fence roots and allowlist schema, including absolute `/usr/bin/psql`, node-postgres client/pool construction and shell indirection without flagging the application runtime as an operator helper.
6. The install/removal manifest and rollback boundary for untracked live files, with hashes but no executable backup left on staging.
7. Coordination receipts and release conditions for every `OWNER_HOLD`, especially B-CREW-ACCESS-HARDEN and B-DISK-HEADROOM.

---

## 5. Anticipated files and governance reach

Expected implementation surfaces are a machine-readable disposition ledger and validator under `scripts/` or `comms-infra/`, exact edits/deletions to the subset approved at Step 2, staging install/removal tooling and tests, CI wiring, the `dt-sql` runbook, and the database-map operations note. No application source path is expected.

At Step 10, at minimum: scope/pre-audit/change-list/completion report, `BATCH_CATALOG`, `PHASE_HISTORY`, `SPRINT_TO_LIVE_PLAN`, INFRA task list and memory, `RUNNING_ISSUES #1259`, System Impact Map, System Manual, `DELETED_COMPONENTS_LOG`, and the database-map/helper operations record. `STORAGE_POLICY`, trading plans, adjustment/authority documents and application change registries are expected N/A unless Step 2 finds a real touched contract.

---

## 6. Reviewer gate

Coltrane is asked to rule **PROCEED** or **SEND BACK** on: (a) the two-source population boundary; (b) exact per-helper dispositions rather than blanket deletion; (c) routing still-needed reads through `dt-sql` while preserving named write/test exceptions; (d) owner holds for active-batch evidence; (e) no app/dashboard/schema/deploy reach; and (f) the proposed default-deny CI fence plus live exact-path absence proof.
