# B-DB-HELPER-RETIRE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Batch:** B-DB-HELPER-RETIRE · **Step:** 2 of 11 · **Owner:** Infra Codex (for CC-INFRA) · **Date:** 2026-11-24 · **Scope ref:** `4f9f549c7021502a7f17daa642c7163ee0c7eb1c`

No helper, application file, database object or staging file was changed by this audit. The audit is the decision record that must be reviewed before implementation.

## Previously stated versus now

> **PREVIOUSLY STATED:** the older live census was 88 top-level scripts, 51 `psql` hits and 48 `DATABASE_URL` hits. **NOW:** the complete current population is 89 scripts, 49 `psql` hits and 53 `DATABASE_URL` hits, with zero `PGPASSWORD`, zero `dt-sql` and zero read errors. **REASON:** the live directory changed; the current full-content census supersedes the older snapshot rather than silently blending the two.

> **PREVIOUSLY STATED:** Step 1 named the 53 `DATABASE_URL` files. **NOW:** this audit separately enumerates the complete 49-file `psql` population and the four node-postgres-only files. **REASON:** Coltrane's Step-1 ruling required both sets to remain visible.

> **PREVIOUSLY STATED:** the checked-in helper boundary was the B-DB-MAP artifact's 85 rows. **NOW:** that artifact remains an immutable 85-row source, but the executable connection population is 91 surfaces after adding six current-tree paths its helper regex cannot recognize: standalone shell `psql`, a package command, and `new pg.default.Client`. **REASON:** the source scanner detects a `psql process` only when `spawn|execFile|exec|command|run` precedes the word and detects only `new (pg.)?Client|Pool`; those six real paths fall outside those exact patterns.

> **PREVIOUSLY STATED:** eight checked-in paths and three live B-DISK paths began as conditional or unexplained `OWNER_HOLD`. **NOW:** every row has an owner decision; one exact hold remains on `xstock-hollow-recut.ts`, with the unfinished P6 duty and release condition measured by its owner. The still-needed alias census is not retired or left on hold: its direct read is routed through `dt-sql` while its paired processor and issue-1024 duty remain. **REASON:** an unexplained hold is not an implementation answer, while a measured owner hold with a bounded release condition and a still-needed read with a safe route are approved dispositions.

> **PREVIOUSLY STATED:** `scripts/b-new-34b-prewarm-snapshot.ts` was listed among completed-study candidates. **NOW:** it is `RETAIN_GOVERNED_DIRECT`. **REASON:** the entry-point audit found it is imported by `session-lifecycle-controller.ts`, initialized from `server/index.ts`, and invoked by the Friday/Sunday lifecycle hooks.

> **PREVIOUSLY STATED:** a hash would identify an untracked live deletion. **NOW:** each deleted live file will first be committed as exact non-executable `.removed` bytes with a metadata manifest. **REASON:** a hash can prove identity but cannot reconstruct deleted bytes.

## Audit

### 1. Sources read

The audit used all six required source classes:

1. `docs/database-map/helpers.json` at immutable source R `13154e33eb6db72fdfd7100646e4a72b77a09152`: 85 helper rows across 79 files. A direct diff from R to pre-audit base ref `6fcc5d572065f6f27a1d69d236d50a146f8ab5a6` found no helper/connection-marker change in the mapped roots.
2. The current repository and its real entry points: imports, `package.json`, TypeScript programs, tests, services, cron/systemd material and current governance records.
3. All 89 top-level live `/home/deploy` scripts with suffix `.py|.sh|.mjs|.cjs|.js|.ts`, read as `deploy`; 89/89 reads succeeded.
4. Live systemd units, cron directories, root/deploy crontabs and the complete process list. The same service read found DawnTrader positive controls including `dawntrader-watchdog.service` and `dt-db-map-weekly.service`; the same process read found PM2 and `/home/deploy/dawntrader/dist/index.js`.
5. System Impact Map “Crew database reads” and “Governed database map,” plus System Manual “Crew Database Reads” and the application connection section.
6. `bridge/canonical/`: it preserves the historical application database/migration intent but has no coverage of crew operator helpers, `dt-sql`, or direct operator logins. That absence means it cannot decide these dispositions.

### 2. Entry points first

The 53 live candidates have no current systemd unit, cron entry, running process, top-level live-script caller or cross-reference. This is not inferred from a filename: each of the five surfaces was read, with the positive controls above proving the instruments could find known services and processes.

The checked-in census found one initially misclassified entry point:

- `scripts/b-new-34b-prewarm-snapshot.ts` is imported by `server/services/session-lifecycle-controller.ts`; that controller is initialized by `server/index.ts`; Friday/Sunday lifecycle hooks invoke it. It is retained as application runtime.

Other checked-in retirement candidates have no surviving **production runtime or scheduled** entry point. They do have two real manual CLI entry points today: `b-phase-a2:backfill` and `b-xstock-feed-sanity:recut` in `package.json`. The backfill command retires atomically with its target; the recut command stays because the owner hold below proves it has unfinished work. The fresh reader caught the earlier absolute wording; a direct `package.json` read re-derived both commands, with the retained `db:migrate=tsx scripts/db-migrate.ts` command as the positive control. `scripts/b5-w20c-provenance-replay.ts` is the sole input to `tsconfig.w20c-census.json`, so that config is retired with it.

The full exact-path reference pass found these non-executing consumers: `b-db-size-relief-hot-horizon.test.ts` reads the B-DISK eligibility tool and four replay/audit tools; `b-sizing-legacy-deletion-fence.test.ts` uses the W2a sweep as a positive control; and `regime-thresholds.ts` cites the two B4 regime studies in historical comments. Tests receive synthetic/surviving controls, and historical comments receive immutable Git/archive citations, in the same change as deletion. A reference is not silently left dangling.

The two supplemental B-PRICE-SIDE shell runners each have one non-login Python processor: `b_price_side_alias_census.py` and `b_price_side_p7h_limiter_class_census.py`. Each processor is named only by its paired runner and the durable historical record; neither has an independent entry point. If the paired runner retires, its processor retires atomically as a companion rather than becoming stranded dead code. These two processors are not extra database-connection surfaces and therefore do not change the 91-surface denominator.

`scripts/xstock-hollow-recut.ts` has no runtime caller, but it is read as text by `b-xstock-feed-sanity-book-state.test.ts` and `b-xstock-feed-sanity-fence.test.ts`, and comments in `book-state.ts` still cite it. That is a real repository dependency, not an execution entry point. Its final owner disposition decides whether those controls remain or are replaced; deleting the file without changing them is forbidden.

The installed `/usr/local/bin/psql` wrapper is first in `PATH`, so all 49 bare `psql` helpers receive its one-attempt transport and lock safeguards. It still executes `/usr/bin/psql` with the supplied application `DATABASE_URL`; it does not change authority to `dt_reader`. The four node-postgres-only files bypass that wrapper. The defect is therefore retained application-role write authority, not a missing retry wrapper.

### 3. Checked-in B-DB-MAP source: 85 of 85 exact dispositions

Reason keys: **T** isolated CI/test-local connection; **G** named governed infrastructure, migration, writer or application runtime; **R** completed one-off/replay with no surviving entry point; **O** owner released recorded evidence; **L** real lifecycle entry point.

| # | exact helper row | kind | disposition | reason |
|---:|---|---|---|---|
| 1 | `.github/workflows/ci.yml:207` | psql process | `RETAIN_TEST_LOCAL` | T: isolated CI Postgres |
| 2 | `.github/workflows/ci.yml:206` | dt-sql login | `RETAIN_TEST_LOCAL` | T: wrapper tests against isolated CI service |
| 3 | `comms-infra/security/reviewer-staging-access/reviewer_staging_access.py:352` | psql process | `RETAIN_GOVERNED_DIRECT` | G: current source calls governed `dt-sql`; B-CREW verifier remains owned |
| 4 | `comms-infra/staging/dt-api-set-crew-password:32` | psql process | `RETAIN_GOVERNED_DIRECT` | G: named credential writer |
| 5 | `comms-infra/staging/dt-install-drift:118` | dt-sql login | `RETAIN_GOVERNED_DIRECT` | G: installed-state verifier already uses boundary |
| 6 | `comms-infra/staging/dt-sql:38` | psql process | `RETAIN_GOVERNED_DIRECT` | G: boundary implementation |
| 7 | `comms-infra/staging/dt-sql:6` | dt-sql login | `RETAIN_GOVERNED_DIRECT` | G: boundary implementation |
| 8 | `comms-infra/staging/dt-sql-login:23` | psql process | `RETAIN_GOVERNED_DIRECT` | G: dedicated `dt_reader` login |
| 9 | `comms-infra/staging/dt-sql-login:2` | dt-sql login | `RETAIN_GOVERNED_DIRECT` | G: dedicated `dt_reader` login |
| 10 | `comms-infra/staging/dt-sql-role-setup:30` | dt-sql login | `RETAIN_GOVERNED_DIRECT` | G: privileged role bootstrap/verifier |
| 11 | `comms-infra/staging/psql-wrapper:9` | psql process | `RETAIN_GOVERNED_DIRECT` | G: installed one-attempt safety wrapper |
| 12 | `comms-infra/staging/tests/dt_sql_login_tests.py:6` | psql process | `RETAIN_TEST_LOCAL` | T: isolated fixture |
| 13 | `comms-infra/staging/tests/dt_sql_login_tests.py:2` | dt-sql login | `RETAIN_TEST_LOCAL` | T: isolated fixture |
| 14 | `comms-infra/staging/tests/dt_sql_mutations.py:3` | dt-sql login | `RETAIN_TEST_LOCAL` | T: mutation fixture |
| 15 | `comms-infra/staging/tests/dt_sql_role_setup_tests.py:332` | psql process | `RETAIN_TEST_LOCAL` | T: isolated fixture |
| 16 | `comms-infra/staging/tests/dt_sql_role_setup_tests.py:5` | dt-sql login | `RETAIN_TEST_LOCAL` | T: isolated fixture |
| 17 | `comms-infra/staging/tests/dt_sql_tests.py:228` | psql process | `RETAIN_TEST_LOCAL` | T: isolated fixture |
| 18 | `comms-infra/staging/tests/dt_sql_tests.py:2` | dt-sql login | `RETAIN_TEST_LOCAL` | T: isolated fixture |
| 19 | `comms-infra/staging/tests/setter_tests.py:351` | psql process | `RETAIN_TEST_LOCAL` | T: isolated credential-writer fixture |
| 20 | `drizzle/migrations/2026-05-19-b-new-35-phase1-dedup-xstock-spot.sql:31` | psql process | `RETAIN_GOVERNED_DIRECT` | G: immutable migration text |
| 21 | `drizzle/migrations/2026-11-05-b-close-writer-costs-open-positions-mode.sql:67` | psql process | `RETAIN_GOVERNED_DIRECT` | G: immutable migration text |
| 22 | `migrate-19g.js:4` | node-postgres Pool | `RETIRE` | R: March one-off; no caller or current governance home |
| 23 | `scripts/analysis/b_db_pool_guard_weekday_qd_read.py:38` | psql process | `RETIRE` | O: B-DB-POOL-GUARD closed; no surviving duty |
| 24 | `scripts/analysis/b_disk_headroom_eligibility.ts:57` | node-postgres Client | `RETIRE` | O: P2-P4 proof-night helper; Dec-1 P11 is direct size evidence |
| 25 | `scripts/analysis/b_ohlc_frame_guard_futures_partial_bar_check.py:33` | psql process | `RETIRE` | O: B-OHLC-FRAME-GUARD closed; no caller |
| 26 | `scripts/analysis/b_xstock_bar_availability_c6_timing_read.ts:40` | node-postgres Client | `RETIRE` | O: C6 timing read completed and was ruled; R2-prime uses its separate runner |
| 27 | `scripts/analysis/obj_pa_pb.cjs:27` | node-postgres Client | `RETIRE` | R: closed B-XSTOCK-FEED-SANITY instrument |
| 28 | `scripts/analysis/xstock-refusal-holds.py:69` | psql process | `RETIRE` | O: increment-A measurement is durable; no remaining registered read |
| 29 | `scripts/analysis/xstock-wide-book-stop-vs-next-open.py:8` | psql process | `RETIRE` | O: OBJ-6 evidence is durable and independently confirmed |
| 30 | `scripts/b-1-5-universe-audit.ts:49` | node-postgres Pool | `RETIRE` | R: completed audit, no caller |
| 31 | `scripts/b-crypto-feed-watchdog-witness-backfill.ts:46` | node-postgres Client | `RETIRE` | O: B-CRYPTO-FEED-WATCHDOG closed; one-off writer completed |
| 32 | `scripts/b-new-34b-prewarm-snapshot.ts:315` | node-postgres Pool | `RETAIN_GOVERNED_DIRECT` | L: live Fri/Sun lifecycle hook |
| 33 | `scripts/b-pattern-evidence-15m-study.ts:309` | node-postgres Client | `RETIRE` | R: completed study, no caller |
| 34 | `scripts/b-pattern-winner-traits-study.ts:188` | node-postgres Client | `RETIRE` | R: completed study, no caller |
| 35 | `scripts/b-phase-a2-backfill.ts:183` | node-postgres Pool | `RETIRE` | R: completed backfill; remove stale package command |
| 36 | `scripts/b-xstock-calib-b1a-replay.ts:306` | node-postgres Client | `RETIRE` | R: completed replay, no caller |
| 37 | `scripts/b-xstock-calib-b3-regime-audit.ts:276` | node-postgres Client | `RETIRE` | R: completed audit, no caller |
| 38 | `scripts/b-xstock-calib-b31a-gate-audit-2.ts:181` | node-postgres Client | `RETIRE` | R: completed audit, no caller |
| 39 | `scripts/b-xstock-calib-b31a-gate-audit.ts:121` | node-postgres Client | `RETIRE` | R: completed audit, no caller |
| 40 | `scripts/b4-bar-frequency-study.ts:132` | node-postgres Client | `RETIRE` | R: completed study, no caller |
| 41 | `scripts/b4-dbs-15m-recompute.ts:413` | node-postgres Pool | `RETIRE` | R: completed recompute tool, persisted state remains |
| 42 | `scripts/b4-regime-parity.ts:501` | node-postgres Client | `RETIRE` | R: completed parity study, no caller |
| 43 | `scripts/b4-regime-recalib-study.ts:443` | node-postgres Client | `RETIRE` | R: completed recalibration, no caller |
| 44 | `scripts/b4-vndi-recalib-study.ts:371` | node-postgres Client | `RETIRE` | R: completed recalibration, no caller |
| 45 | `scripts/b5-w20c-provenance-replay.ts:121` | node-postgres Client | `RETIRE` | R: completed replay; retire sole-input tsconfig |
| 46 | `scripts/b5-w2a-geometry-sweep.ts:292` | node-postgres Client | `RETIRE` | R: completed sweep; replace test positive control |
| 47 | `scripts/b5c-diag.cjs:4` | node-postgres Client | `RETIRE` | R: completed one-off diagnostic |
| 48 | `scripts/b5c-poll.cjs:4` | node-postgres Client | `RETIRE` | R: completed one-off poller |
| 49 | `scripts/b5c-verify.cjs:4` | node-postgres Client | `RETIRE` | R: completed one-off verifier |
| 50 | `scripts/db-map/tests/core.test.mjs:103` | node-postgres Pool | `RETAIN_TEST_LOCAL` | T: database-map fixture |
| 51 | `scripts/db-map/tests/snapshot-control.mjs:6` | node-postgres Client | `RETAIN_TEST_LOCAL` | T: database-map fixture |
| 52 | `scripts/db-migrate.ts:216` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: named migration writer |
| 53 | `scripts/hce/hce_ohlc_sim.py:57` | psql process | `RETIRE` | R: completed simulation, no caller |
| 54 | `scripts/hce/hce_rawfeat.py:26` | psql process | `RETIRE` | R: completed study, no caller |
| 55 | `scripts/measure-gate/test-guard-result-shape.mjs:42` | psql process | `RETAIN_TEST_LOCAL` | T: isolated result-shape fixture |
| 56 | `scripts/xstock-hollow-recut.ts:76` | node-postgres Client | `OWNER_HOLD` | O: P6 historical recut unfinished; preserve writer, command and tests until reviewed completion/withdrawal |
| 57 | `server/db-pool-alerts.ts:495` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: application runtime |
| 58 | `server/db.ts:106` | node-postgres Pool | `RETAIN_GOVERNED_DIRECT` | G: application pools |
| 59 | `server/scripts/b-disk-file-tiering.ts:305` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed operational writer |
| 60 | `server/scripts/b-storage-archival-health.ts:455` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed operational check |
| 61 | `server/scripts/b-xstock-bar-availability-capacity-gate.ts:417` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed scheduled gate |
| 62 | `server/scripts/b-xstock-bar-availability-verdict-runner.ts:508` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed scheduled runner |
| 63 | `server/scripts/b-xstock-freshness-monitor.ts:224` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed monitor |
| 64 | `server/scripts/b70-b62-relabel-runner.ts:249` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed operational writer |
| 65 | `server/scripts/b70-create-monthly-partitions.ts:80` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: partition DDL writer |
| 66 | `server/scripts/b70-table-export.ts:146` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed export |
| 67 | `server/scripts/b75-cold-audit.ts:546` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed archive audit |
| 68 | `server/scripts/b75-cold-bind.ts:243` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed archive writer |
| 69 | `server/scripts/b75-cold-liveness.ts:41` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed archive liveness |
| 70 | `server/scripts/b75-cold-proof.ts:130` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed archive proof |
| 71 | `server/scripts/b75-cold-rotator.ts:516` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed archive writer |
| 72 | `server/scripts/b75-rehydrate.ts:622` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed rehydration writer |
| 73 | `server/scripts/b75-retention-sweep.ts:162` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed retention writer |
| 74 | `server/scripts/context-bridge-log-ttl.ts:661` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed retention writer |
| 75 | `server/scripts/perpfeed-daily-probe.ts:46` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed scheduled probe |
| 76 | `server/scripts/perpfeed-gate-test.ts:64` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: governed operational gate |
| 77 | `server/services/crew-coordination.ts:92` | node-postgres Pool | `RETAIN_GOVERNED_DIRECT` | G: application service runtime |
| 78 | `server/services/passive-archive/xstock-db-snapshot.ts:34` | node-postgres Client | `RETAIN_GOVERNED_DIRECT` | G: application archive runtime |
| 79 | `server/tests/enum-parity/enum-parity.parity.ts:28` | node-postgres Client | `RETAIN_TEST_LOCAL` | T: isolated test fixture |
| 80 | `server/tests/integration/b-cron-fire-evidence-legacy-clock.test.ts:17` | node-postgres Client | `RETAIN_TEST_LOCAL` | T: isolated test fixture |
| 81 | `server/tests/integration/b-db-size-relief-cutover.test.ts:33` | node-postgres Client | `RETAIN_TEST_LOCAL` | T: isolated test fixture |
| 82 | `server/tests/integration/b-xstock-bar-availability-gate-read.test.ts:45` | node-postgres Client | `RETAIN_TEST_LOCAL` | T: isolated test fixture |
| 83 | `server/tests/integration/b-xstock-bar-availability-revision.test.ts:111` | node-postgres Client | `RETAIN_TEST_LOCAL` | T: isolated test fixture |
| 84 | `server/tests/integration/b-xstock-snapshot-retention-db.test.ts:24` | node-postgres Client | `RETAIN_TEST_LOCAL` | T: isolated test fixture |
| 85 | `server/tests/unit/b-db-pool-guard.test.ts:12` | node-postgres Pool | `RETAIN_TEST_LOCAL` | T: isolated test fixture |

#### 3.1 Six executable connection surfaces outside the 85-row helper regex

The B-DB-MAP artifact is not rewritten or weakened. These are current-tree additions to this batch's disposition ledger, found by the broader marker/entry-point audit:

| # | exact surface | kind | disposition | reason |
|---:|---|---|---|---|
| 86 | `package.json:13` (`db:b69-retag`) | direct psql package command | `RETAIN_GOVERNED_DIRECT` | named B69 migration writer; the catalog records ticker-snap retag work as deferred, so removal would erase a still-valid migration mechanism |
| 87 | `scripts/analysis/b_disk_headroom_lock_sampler.sh:45` | bare psql shell | `RETIRE` | P4 proof-night sampler; no Dec-1 P11 duty |
| 88 | `scripts/analysis/b_disk_headroom_set_retention.sh:50` | bare psql shell writer | `RETIRE` | P3/P5/P8 guarded setter; proof stages complete |
| 89 | `scripts/analysis/b_price_side_alias_census.sh:5` | bare psql shell | `ROUTE_DT_SQL` | O: issue 1024 still owes a current collision census; preserve runner + processor but replace the direct application-credential read with `dt_reader` |
| 90 | `scripts/analysis/b_price_side_p7h_limiter_class_census.sh:6` | bare psql shell | `RETIRE` | O: bounded September overlap is durable; no later read/caller; retire paired processor atomically |
| 91 | `scripts/b5-amr-correctness-audit.ts:270` | `new pg.default.Client` | `ROUTE_DT_SQL` | permanent AMR audit surface; its one direct DB leg is a read and must use `dt_reader` |

The same broad scan found 45 additional marker hits but no independent login constructor in them. They are closed explicitly so a future scan cannot hide behind a count:

- **12 delegated/runtime consumers of an already-dispositioned connection or config:** `scripts/b79-0n-rtb-backfill-asset-class.ts`; `server/config/index.ts`; `server/db-tls-boot-check.ts`; `server/db-tls-boot-gate.ts`; `server/routes.ts`; `server/routes/status.ts`; `server/scripts/b74-create-daily-partitions.ts`; `server/scripts/b74-create-monthly-partitions.ts`; `server/scripts/backup-verify.ts`; `server/scripts/dump-settings-registry.ts`; `server/services/data-archive/storage-client.ts`; `server/services/trailing-exit-controller.ts`. These import the shared `server/db` pool, validate/describe its setting, derive the storage project name, or print an operator instruction; they do not open a second login. The underlying application pool is row 58.
- **6 marker/document/scanner files:** `comms-infra/laptop/transcript-archive/dt_archive_run.py`; `dt_secret_hashes.py`; `dt_transcript.py`; `scripts/analysis/b_price_side_8c_rescore.py`; `scripts/analysis/xs_frame_false_hollow.py`; `scripts/db-map/scanner.mjs`. They redact/recognize the variable, consume already-exported query output, ignore psql command tags, or contain the scanner regex itself.
- **27 test/fixture files:** `comms-infra/laptop/transcript-archive/test_dt_secret_hashes.py`; `test_dt_transcript.py`; `comms-infra/staging/tests/fakeapp.py`; `fakepsql_outcomes.py`; `fakepsql.py`; `setter_mutations.py`; and `server/tests/{integration/b-alert-insert-contract-db,b-balance-truth-mode-partition-fence,b-expectancy-tuning-rows-retire,b-killswitch-window,b-loss-window-operator-closes-db,b-sizing-inc1-guardrails-db,b-sizing-inc2b-cooldown-db,b-sizing-inc3-db,b72-dbs-routing-guards-consistency,f-g-1-ohlc-arrival-guard,p19-perpfeed-ohlc-upsert-constraint-fence,unit/b-b75-script-test-harness,unit/b-calscore,unit/b-db-app-tls-boot-check,unit/b-db-pool-guard-p3,unit/b-db-size-relief-hot-horizon,unit/b-disk-file-tiering-amendment2,unit/b-disk-file-tiering,unit/b-xstock-snapshot-retention,unit/b79-0m-b2-pattern-strategy-constants-fallback,unit/b79-0n-pattern-detect-naming-convergence}.test.ts`. They use synthetic/local-test settings or inspect strings and remain test-local.

The Step-3 fence must distinguish those typed cases rather than allowlisting whole directories.

Final checked-in connection-surface count is exactly **91 = 32 `RETIRE` + 36 `RETAIN_GOVERNED_DIRECT` + 20 `RETAIN_TEST_LOCAL` + 2 `ROUTE_DT_SQL` + 1 `OWNER_HOLD`**.

### 4. Live population: 53 of 53 exact identities

All 53 are owned `deploy:deploy`; all have final `RETIRE` dispositions, including the owner-released groups recorded below. The table records the exact current bytes. Step 3 will add the mtime-nanosecond and owner/group fields to the machine-readable archive manifest before any removal.

These are separate installed identities, even where a basename resembles a checked-in file. The ledger therefore carries 85 immutable B-DB-MAP helper **rows**, six supplemental checked-in executable connection surfaces, and 53 live **files**; it does not collapse a live top-level copy into a repository path or infer byte equality from a name.

| exact live path | markers | bytes | mode | SHA-256 |
|---|---|---:|---:|---|
| `/home/deploy/.langston-rerun.py` | psql, DATABASE_URL | 3544 | 0644 | `423bc8262177092dad920181784ced9de8369ef32ed9e1067a22a77cd4c2a7f6` |
| `/home/deploy/_cols.sh` | psql, DATABASE_URL | 312 | 0644 | `45aa3e11770c68f7ce336ce7ea3435e281634b29fef85c237d515ae347f55ca9` |
| `/home/deploy/_pos.sh` | psql, DATABASE_URL | 858 | 0644 | `037662281ccb372fd8851d31ed7ca1cf0f6c36b5d00f01e803675b47316006fb` |
| `/home/deploy/_pos2.sh` | psql, DATABASE_URL | 1457 | 0644 | `184d7150dbe5a65cbbf92dd1380f59c05ff347586bc172eff6fcd664f4eac63d` |
| `/home/deploy/b_disk_headroom_eligibility.ts` | DATABASE_URL | 5355 | 0644 | `cda8a1e13192a28aae4aa203f3097291e938c848b0340a3c7418f844b98128f7` |
| `/home/deploy/b_disk_headroom_lock_sampler.sh` | psql, DATABASE_URL | 3935 | 0750 | `2e801a79fc095953695f58e33f3f2ea96aebad8c9edcc427a10f68947a6a83ca` |
| `/home/deploy/b_disk_headroom_set_retention.sh` | psql, DATABASE_URL | 5724 | 0750 | `d0e1cbb662da2c346084e8863bd3dd05df1aa3298009d2866793981be5e28211` |
| `/home/deploy/ccc_ring.sh` | psql, DATABASE_URL | 780 | 0755 | `92f8c1adc13d329e0ca3b1a98235b7426085759520b2eb7a18b26f2bb51fc902` |
| `/home/deploy/fg1check.sh` | psql, DATABASE_URL | 238 | 0755 | `c9fa4c683e878c5ea5eb560fc9233b3df05910eae92d0dbdbd8d7987cef3f314` |
| `/home/deploy/lang_1250_q1.sh` | psql, DATABASE_URL | 574 | 0644 | `8a203081b410097d233bb174eae52f97c824a4e68e600e8a41955b980224a0f8` |
| `/home/deploy/lang_1250_q2.sh` | psql, DATABASE_URL | 2608 | 0644 | `3fb381720ecc7d14f1919cc66180cd01af50eb5aa09275859df5a5c5c4e0a805` |
| `/home/deploy/lang_1250_q3.sh` | psql, DATABASE_URL | 223 | 0644 | `0bd79c7f7ddccfce20de88f412c7c423f5ad91ceedc1854b35f0f08f13cce245` |
| `/home/deploy/lang_1250_q4.sh` | psql, DATABASE_URL | 1861 | 0644 | `0ac039471bf32736e6bf2a24c0a55dd2358374a37d3b5f5af5395af8f651de24` |
| `/home/deploy/lang_1250_q5.sh` | psql, DATABASE_URL | 488 | 0644 | `b0478859d250bcfbe0ad633f67fb41faa1c5fa87eed59d2802a48c47d1c56369` |
| `/home/deploy/lang_1250_q6.sh` | psql, DATABASE_URL | 699 | 0644 | `e03a06faed8d93a1ec2f46e3934b95dce8cf62f1f359905175a770e44d781db9` |
| `/home/deploy/lang_8c_mig.sh` | psql, DATABASE_URL | 715 | 0644 | `d19238cc7717b92e6242048ca3f9d6f768a21d9d843cd9c1c753b13ffa9e1c08` |
| `/home/deploy/lang_8c_rtb.sh` | psql, DATABASE_URL | 523 | 0644 | `2293f04277ca2aba52448d5c655ee4ecb50766a3f3c2d335aafb8f59d859c549` |
| `/home/deploy/lang_8c_tec.sh` | psql, DATABASE_URL | 334 | 0644 | `86545f604bfe9c3ae17e742cfebe1f9b1d6d13d05c93f56721c3749c347ea308` |
| `/home/deploy/lang_c5cf_q1.sh` | psql, DATABASE_URL | 1200 | 0644 | `4cf38d78b999cc369b6a9edcdf77b216e9b73c26413d6f08e83bda4bc9397f52` |
| `/home/deploy/lang_c5cf_q2.sh` | psql, DATABASE_URL | 340 | 0644 | `faeac90ca40269e54ebc0470058c9d219ac84519ae1daba13ba5c0bc493ddd3e` |
| `/home/deploy/lang_c5cf_q3.sh` | psql, DATABASE_URL | 555 | 0644 | `4137c77522c5c1e9e6414b4854985e05732ad9ac38123b7508ec8036f02749f4` |
| `/home/deploy/lang_c5cf_q4.sh` | psql, DATABASE_URL | 248 | 0644 | `f3e08e27311b5abb7d541c83dc195b1f8a96cd947f048aff0d20829d21ce34c4` |
| `/home/deploy/lang_c5cf_q5.sh` | psql, DATABASE_URL | 882 | 0644 | `8259836b69b39f38392818f62e7dd7bbe5b17dca7152efbcfc33b0eb01cd4d75` |
| `/home/deploy/lang_c5cf_q6.sh` | psql, DATABASE_URL | 590 | 0644 | `c0f05bdfb2fecd075763eea14f4402a27c20c497c614405ea4c7a3dd29908b3f` |
| `/home/deploy/lang_c5cf_q7.sh` | psql, DATABASE_URL | 928 | 0644 | `c75cb0a8e9ca74d9a731181002a85314c95d71ef63175fd7c7532072ec433b44` |
| `/home/deploy/lang_eg_q1.sh` | psql, DATABASE_URL | 572 | 0644 | `e521450e97923f476d39f815ea9f586a3aee98c2a41df94e710a42b8519a8245` |
| `/home/deploy/lang_eg_q2.sh` | psql, DATABASE_URL | 844 | 0644 | `692606917c00cdd7f69f937779021e0d2aa022fd6e6f671454eaa4f62e2c8ea0` |
| `/home/deploy/lang_eg_q3.sh` | psql, DATABASE_URL | 1862 | 0644 | `f25dbe6d9f80328abef53bd06d954bb07270342de3b054db0e287e4b0427063d` |
| `/home/deploy/lang_eg_q4.sh` | psql, DATABASE_URL | 1211 | 0644 | `70e75357d19bbac31d434899e364127df0defee011ad0e45a6627ef6079023bd` |
| `/home/deploy/lang_eg_q5.sh` | psql, DATABASE_URL | 1116 | 0644 | `71ada3ed67ad7b0c334e5249da49238b7753f1e2c94c3e8b6a858979ff0979bd` |
| `/home/deploy/lang_eg_q6.sh` | psql, DATABASE_URL | 462 | 0644 | `1eb1387d309ef3f23b0fd3e78649cb9f93b00dfbf85a05fc73178d3d0959e91e` |
| `/home/deploy/lang_eg_q7.sh` | psql, DATABASE_URL | 1049 | 0644 | `b6ccbe95ff3f242cfdcc7c84c42f79f52e1f811a47896d59d72a788ae3dd41b3` |
| `/home/deploy/lang_eg_q8.sh` | psql, DATABASE_URL | 342 | 0644 | `94be4e236e1900d7b31d2ddcbb635437216257cfbba1339adc14ba184d003506` |
| `/home/deploy/lang_kd19_q1.sh` | psql, DATABASE_URL | 543 | 0644 | `a6b93986cb5e0cd24f539e020097d1fd55f7760de97f563b8f531156049f7678` |
| `/home/deploy/lang_q0.sh` | psql, DATABASE_URL | 301 | 0644 | `ee874d9ea4d38b1bfc19a7ceaf9bf3b1666ea1642dbd03eb72ca68bc7521cc2f` |
| `/home/deploy/lang_q1.sh` | psql, DATABASE_URL | 2251 | 0644 | `c4dee70a370fa0a3ee9908d8209f2fda61e74aa9bc075faecbc41b7015bfdff2` |
| `/home/deploy/lang_q2.sh` | psql, DATABASE_URL | 2981 | 0644 | `022287071db8f12327aa9f95bf693ac1b9cc575643f06ffcc8835cd6c439eee2` |
| `/home/deploy/lang_q3.sh` | psql, DATABASE_URL | 1360 | 0644 | `039de6c1a9194a620561bd0fb69add374b64b11cb86ecfa0c6d445be1a7416cd` |
| `/home/deploy/lang_q4.sh` | psql, DATABASE_URL | 244 | 0644 | `e2c35437304aac3b6c7ba0cd212934d8a92a61c0ff5629bb2cb46d0083c7eaad` |
| `/home/deploy/lang_q5.sh` | psql, DATABASE_URL | 249 | 0644 | `3e058c7b8f90ecac91ba9b0e026b9dad69acd19409b5ba31c5410b9e54762ed1` |
| `/home/deploy/lang_q6.sh` | psql, DATABASE_URL | 249 | 0644 | `e3e02b05d7d174017c3ce470957f247f31357ca256ad9e20e24e28c97b807bdc` |
| `/home/deploy/lang_strk_q.sh` | psql, DATABASE_URL | 1348 | 0644 | `fe2c45db41c3ddec79ecf79a011bd1b71bcd71f748a8fb05c934d9b4151b5049` |
| `/home/deploy/lang_strk_q2.sh` | psql, DATABASE_URL | 874 | 0644 | `32cdd9d510bb9fc85c695344d2f1b2103e1b9966623cbc645d8ecdbe84ed5d05` |
| `/home/deploy/lang_strk_q3.sh` | psql, DATABASE_URL | 1990 | 0644 | `f6e5fac408cf8022371977b4ccb3791efed326cfaf8c894a9687c2825d7e16c5` |
| `/home/deploy/obj0_hollow.sh` | psql, DATABASE_URL | 1801 | 0755 | `cbb8ca4cfb154dfd9cff82af2837e0fe6717376b59b8b9d33a4a4f40f82e160d` |
| `/home/deploy/obj0_hollow_0827.sh` | psql, DATABASE_URL | 1791 | 0755 | `3cf6b2f66a1e28f9206132504f76846c98b6e2478c98a614348328803ccca9a8` |
| `/home/deploy/obj0_hollow_0901.sh` | psql, DATABASE_URL | 1791 | 0755 | `39c0e5a83f5c09c1a1f49e4051e6f0da1b62f586060081e23309ff0d953d6570` |
| `/home/deploy/obj0_run.sh` | psql, DATABASE_URL | 1666 | 0755 | `20a07bbb1adba5997df8531388e883b39567daa2c487a990263b0f6c9ec6089c` |
| `/home/deploy/obj0_sig.sh` | psql, DATABASE_URL | 1214 | 0755 | `450d8e224b14827b829d28dd323c0d770774bf20b5c08c456874ee8287eea01c` |
| `/home/deploy/obj_pa_pb.cjs` | DATABASE_URL, new Client | 8215 | 0755 | `547a1b6344e63b4873216ad591360d0282f426178cbf9060e57b0d7de3ba12e0` |
| `/home/deploy/verify_cols.cjs` | DATABASE_URL, new Pool | 496 | 0644 | `0b672eb1cf151a16a6f61988a36b6378d8f48fcf0b75f8ca9f4ea4f8a4811276` |
| `/home/deploy/vts_trend.cjs` | DATABASE_URL, new Pool | 1227 | 0644 | `88abba31649a5ffbbc6e7f998c1acef5e89fa7b2ed1781028ea94afe0d439473` |
| `/home/deploy/watch_xstock.sh` | psql, DATABASE_URL | 1157 | 0755 | `a4853b9adbd01dc668096b186915cbd521dc48888f1ca919348a5cacdb5a8737` |

The complete 49-file `psql` set is every row above except `b_disk_headroom_eligibility.ts`, `obj_pa_pb.cjs`, `verify_cols.cjs`, and `vts_trend.cjs`. Those four are the complete node-postgres-only set. No prefix or range substitutes for this enumeration.

### 5. Provenance, owners and state

- `_cols`, `_pos*`, `verify_cols` and `vts_trend` are old schema/position reads with no caller.
- `fg1check.sh` belongs to completed F-G-1; its non-login SQL text may remain as historical evidence.
- `lang_1250_q1..q6` belongs to the withdrawn/settled #1250 analysis.
- `lang_q0..q6` belongs to closed B-BALANCE-SESSION-PAIRING.
- `obj0_*`, `obj_pa_pb.cjs`, `ccc_ring.sh` and `watch_xstock.sh` belong to old xStock studies/watches. Their CSV/log outputs remain historical evidence; only executable login paths are retired.
- The three B-DISK files were proof-night instruments for P2-P4. The only remaining B-DISK wait is P11 direct size evidence on 2026-12-01, so INFRA releases them.
- OLD Codex released `/home/deploy/lang_c5cf_q1.sh` through `lang_c5cf_q7.sh` in Discord `1574746839448559617`, after the direct owner handoff in chat `01a1358d-8dc8-7042-91fe-0c3a9bf06897`. He independently re-read all seven files and hashes, found no current process/systemd/cron/bin/crontab consumer, and stated they carry no continuing B-DB-SIZE-RELIEF duty. Coltrane acknowledged that exact disposition at 2026-11-24T11:21:55Z. No execution, deploy or restart was authorized by either message.
- NEW Codex released `/home/deploy/lang_eg_q1.sh` through `lang_eg_q8.sh` in Discord `1574740272527577089`. Their date-bound 2026-11-14 results are durable in `B_ENTRY_GATE_PROGRESS_REPORT.md` and `B_ENTRY_GATE_STEP4_INC_B_CHANGE_LIST.md`; his exact live recheck found no process, systemd, cron, repository or live-script caller/reference. He directed retirement rather than rerouting through `dt-sql` because the direct app-credential copies are obsolete.
- ANALYST Codex released live `lang_8c_{mig,rtb,tec}.sh`, `lang_kd19_q1.sh`, `lang_strk_q{,2,3}.sh` and `.langston-rerun.py`, plus checked-in C6 timing, refusal-holds and wide-book helpers, in Discord `1574741149124530270`. Each result is durable, no future registered read calls the file, and any later state read must be fresh/governed.
- The same owner message placed `scripts/xstock-hollow-recut.ts` on exact `OWNER_HOLD`. A governed read found 251 still-eligible pre-deploy xStock closes, including 24 with `exit_decision_price`; zero rows carry `decision_price`, `minute_proxy` or `market_state_predicate` recut bases, while 919 current rows with `guard` basis are the positive control. Release requires the B-XSTOCK-FEED-SANITY P6 historical relabel to be run and reviewed, or formally withdrawn and reviewed. Until then the write-capable script, package command and source-reading tests remain unchanged.
- ANALYST Codex dispositioned the two supplemental shell runners in Discord `1574747055417593927`. He released `b_price_side_p7h_limiter_class_census.sh`: its September 10–11 population and result are durable, and no later registered read or caller exists. He held `b_price_side_alias_census.sh` against retirement because issue 1024 still owes a fresh current collision set after the original observation window; this audit maps that continuing read duty to `ROUTE_DT_SQL`, preserving the runner + paired processor while removing its direct application-credential login. Release to deletion requires the governed issue-1024 rerun to be durably recorded, or the duty to be formally superseded/withdrawn.

Writers were not treated as reads. `b_disk_headroom_set_retention.sh` writes one guarded module constant; its proof duty is complete. Checked-in backfills/recompute tools wrote durable database state; deleting their obsolete executable code does not delete that state. The surviving application readers, migrations, reports and Git history remain. `scripts/b-new-34b-prewarm-snapshot.ts` is a current writer and therefore retained.

The exact retired-writer set is bounded: `migrate-19g.js` wrote `screener_filters`; `b-crypto-feed-watchdog-witness-backfill.ts` wrote witness timestamps on `closed_trades`; `b-phase-a2-backfill.ts` inserted `xstock_dbs_backfill`; and `b4-dbs-15m-recompute.ts` archived/rebuilt that history. The live B-DISK setter is the fifth. `xstock-hollow-recut.ts`, which updates two `closed_trades` book-state label fields, is explicitly **not** in the retirement set. Implementation executes none of the retired writers and runs no SQL: repository deletion plus exact-path file removal cannot delete their persisted rows. The application/server readers, schema migrations and historical reports are outside the deletion list. Git/archive bytes preserve the former writer logic for audit or an explicitly reviewed restore.

### 6. Rollback is reconstructible

Before any live deletion, Step 3 will add exact raw bytes under:

`1-system-manual/_archive/deleted-code/live-staging/2026-11-24-b-db-helper-retire/<basename>.removed`

The `.removed` suffix is non-executable. A machine-readable manifest records original absolute path, archive path, SHA-256, byte count, owner, group, mode, mtime in UTC/nanoseconds, disposition and source batch. The installer refuses a file whose live bytes or metadata differ from the reviewed manifest. A restore copies the exact reviewed bytes back and restores ownership/mode only after a separate reviewer-approved action. No executable backup or renamed runnable copy remains on staging.

All 53 files were read in full during this audit. They reference the credential through environment/file loading and contain no embedded credential value, so committing the exact bytes does not copy a secret into Git.

Every checked-in deletion also receives the binding legacy-removal treatment from `CLAUDE.md` rule 18: an exact, non-compilable `.removed` quick-browse copy under `1-system-manual/_archive/deleted-code/`, plus a `DELETED_COMPONENTS_LOG.md` row naming what, why, caller/blast-radius proof, archive path and commit. Git at the exact pre-delete ref remains the authoritative rollback source.

### 7. Audit aids and their limits

`census.mjs --path` was run only as a lead. It found the application entry point for `b-new-34b-prewarm-snapshot.ts`; it returned no entry point for the other conditional scripts. Its own limits apply: it cannot see host systemd/cron, shell/Python importers, computed import/require, HTTP routes or nonstandard entry points. It also missed `package.json` commands, proving why a clean result is never evidence.

The eight blind spots were handled explicitly:

1. **Value-list agreement:** the 85 JSON rows and 53 live identities were compared as exact sets, not counts alone.
2. **Literal copies:** 49 `psql` and four node-only live files were enumerated independently.
3. **Properties/fields:** login markers and connection construction were read directly; symbol search was not treated as semantics.
4. **Sibling producers:** package scripts, tsconfig ownership and test consumers were read alongside the helper.
5. **Meaning:** a content hit is not execution; every candidate was traced through caller, schedule, process, governance and owner surfaces.
6. **Error paths:** the real `psql` wrapper and `dt-sql` failure/lock paths were read directly.
7. **Library behavior:** actual shell/pg client construction was read; authority was not inferred from the word `psql`.
8. **Files outside TypeScript programs:** the complete host population, package commands, shell and Python files were enumerated explicitly.

### 8. Governance gaps and boundaries

The current live 53 authenticate with the application credential even though only one performs a bounded write. This contradicts the current crew-read rule that directs operator reads through `dt-sql`/`dt_reader`. The plan closes that live bypass by retirement, not by weakening the map or by hiding retained runtime paths.

No dashboard, application pool, schema, role, grant, RLS policy, stored row, app deploy or PM2 restart is in scope. No observation window is needed: this is a static population reduction with exact installation and immediate post-install proof.

## Implementation plan

Every plan item points back to an audit finding; no unaudited item is introduced.

1. **Disposition ledger and validator.** Encode the 85 immutable B-DB-MAP rows, six supplemental checked-in executable surfaces and 53 live rows, with exact allowed disposition, reason/authority and owner receipt. Reject missing, duplicate, unknown or reasonless rows. This implements Audit §§3–5.
2. **Default-deny checked-in fence and map correction.** Scan the current tree for bare/absolute `psql`, package-command and standalone-shell execution, installed wrapper paths, `DATABASE_URL`, `PGPASSWORD`, property-chain constructors such as `new pg.default.Client`, ordinary `new Client`/`new Pool`, and `dt-sql`; require exact ledger set equality. Typed exclusions must prove “fixture/marker/delegated shared pool,” never allowlist a directory. Extend the B-DB-MAP helper scanner/population so these executable forms are visible in its future artifacts, without rewriting immutable source R; regenerate the post-change map and weekly baseline only from the reviewed implementation. Add mutants for hidden absolute path, package/shell `psql`, app `.env`, ordinary and property-chain node clients/pools, missing row, duplicate row and unknown disposition. This closes Audit §8, the six-row source-map blind spot and the aid failure in §7.
3. **Repository retirement, route and archive.** Route the permanent AMR audit's single direct read and the retained alias census's database read through installed `dt-sql`, proving `current_user=dt_reader` for both; preserve the alias processor and issue-1024 duty. For each of the 32 reviewed checked-in connection one-offs, add the required exact `.removed` quick-browse copy and deletion-log record, then delete the compilable source; retire the sole-use P7h Python processor atomically with its shell runner, so the repository removes 33 obsolete executable source files rather than stranding a companion. Remove only package commands whose targets retire (`b-phase-a2:backfill`; the B69 migration and held recut commands stay), remove `tsconfig.w20c-census.json`, update tests that read B-DISK/replay files with synthetic or surviving controls, and replace current comments that point at deleted B4 study paths with immutable Git/archive citations. Preserve the held recut script/tests, live prewarm/runtime and all exact governed/test-local entries. This follows Audit §§2–3 and `CLAUDE.md` rule 18.
4. **Exact live archive.** Add the 53 raw `.removed` files and metadata manifest before any staging action, in the same non-compilable archive tree but a distinct `live-staging/2026-11-24-b-db-helper-retire/` namespace. Validate byte/hash/metadata equality. This implements Audit §6.
5. **Reviewed exact-path remover.** Install/run only a manifest-driven removal command. It refuses drift, deletes only the 53 exact top-level paths, leaves historical outputs and `fg1check.sql`, makes no app checkout edit and performs no deploy/restart. This implements Audit §§4–6.
6. **Post-install verification.** Repeat the same 89-file population census with zero read errors; require zero unmanifested top-level direct-login hits. Run a real `dt-sql` read and prove `current_user=dt_reader`; prove a persistent-write probe is refused. Prove app ref, PID/restart count and connection files are unchanged. This proves Audit §8 without claiming root lacks capability.
7. **Operator record.** Update the `dt-sql` runbook, database-map operations note, change list and deletion log with the exact disposition/restore process. Re-verify the database map still reports retained helpers honestly. This preserves the source separation in Audit §1.

### Plain-language result

This batch will remove old database shortcuts that nobody runs anymore, while preserving the real application, migration and test connections. Before a live shortcut is deleted, its exact bytes will be stored in Git so it can be restored; afterward the same full scan must show that crew reads go through the read-only tool and that the trading app was untouched.

REVIEWER: claim-only · “Every proposed live/check-in retirement has no surviving execution entry point, and retiring any former writer leaves its durable state and current readers intact.” · HIT — `package.json:24` is a current executable entry point to the RETIRE `b-phase-a2-backfill.ts`; the reader also identified the recut package command and replay/recut test/config consumers · re-derived y at `239f9a295` with retained `db:migrate` as the same-instrument positive control. Corrected claim: no production/scheduled entry point exists for the retirement set, and no manual CLI/test/config reference will survive the planned atomic companion removals; writer state is not deleted by source retirement.
