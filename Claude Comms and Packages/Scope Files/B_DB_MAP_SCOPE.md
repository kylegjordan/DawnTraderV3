# B-DB-MAP — SCOPE (Step 1) — r1

change-class: non_architecture

**Owner:** Infra Codex (standing in for Infra Claude / CC-INFRA) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row 5a2 · **Decision:** KD-101 (2026-11-16) · **Ordering:** after `B-DB-READONLY-ROLE`, before `B-DB-HELPER-RETIRE`.

**Class judgement:** this batch adds read-only generation tooling, checked-in database documentation and a scheduled drift comparison. It changes no trading decision, application database pool, database schema, role grant or stored row. The System Impact Map and System Manual are nevertheless applicable because the new generator becomes a scheduled consumer of the governed crew-read path.

---

## 0. What this batch is for

The staging database is the only current source that can say which relations, columns, keys, indexes and relationships actually exist, while the repository is the only source that can say which checked-in code and scripts refer to them. Today DawnTrader has neither a complete generated map nor a repeatable reconciliation between those two sources. This batch creates one: a checked-in, deterministic data dictionary and relationship map generated with the industry database-documentation tool `tbls`, enriched with catalog row/size statistics and a static repository read/write inventory stamped at an exact commit.

Generation is deliberately split at the trust boundary. One fixed catalog extraction runs through `dt-sql` as `dt_reader`; it must make exactly one guarded database connection and write no credential into argv, logs or artifacts. `tbls`, the repository scanner, rendering and comparison then run offline from that extraction. A scheduled regeneration compares the fresh result with the checked-in map and raises a routed alert on drift, failure or staleness; it does not auto-commit, auto-push or touch the application.

---

## 1. Objectives and proof criteria

| # | objective | verification drafted now; filled at Step 7 |
|---|---|---|
| **OBJ-1 — complete catalog map** | Every non-system staging relation in the agreed schema set appears exactly once. For every table or view the map records schema/name/type, columns in ordinal order, PostgreSQL type, nullability, default, identity/generated state, primary/unique/check/foreign-key constraints, indexes, partition parent/child state and RLS state. Relationships name both tables and both column lists. | An independent fixed catalog query and the generated manifest have set equality for relation identity and column identity; counts alone are only a summary. Deliberate fixture additions/removals make the equality check red. |
| **OBJ-2 — honest rows and size per table** | Every table records catalog-estimated live rows and its table/index/TOAST/total bytes at one extraction time. The field is named and rendered as an **estimate** (last-ANALYZE/catalog statistics), never as an exact count. Partition parents and children are distinguished; any rolled-up parent total is separately labelled. No scheduled `COUNT(*)` table scan is allowed. | Recompute representative rows directly from the captured catalog; reconcile each size decomposition and the whole mapped population; prove a stale/NULL statistic renders `unknown`, not zero. |
| **OBJ-3 — readers and writers from an exact repository ref** | For every mapped table, a repository inventory stamped with the full source SHA lists checked-in readers, writers and schema/DDL sources with file and line evidence. The scanner covers tracked TypeScript, JavaScript/MJS, Python, shell and SQL surfaces, including Drizzle table symbols, SQL tags/strings and script-held SQL. Dynamic or unresolvable SQL is emitted into a visible `unresolved` ledger. `none found by scanner at <sha>` is never described as `unused`. | A fixture corpus covers Drizzle reads/writes, raw SQL DML, qualified/unqualified names, aliases, shell/Python SQL and dynamic-name escapes. Mutation tests remove each detection class and must fail. A hand-derived sample across each class is reconciled at the exact ref. |
| **OBJ-4 — industry-standard generated documentation** | Pin an exact `tbls` version and artifact checksum. Feed it the extracted schema offline and generate GitHub-readable table pages plus an ER artifact; DawnTrader enrichment adds the statistics and code-usage evidence without pretending those fields came from `tbls`. The checked-in manifest records tool version, extraction-query hash and generator version. | Regenerate twice from identical catalog/repo fixtures and get byte-identical output; verify the pinned binary checksum; prove a changed relation or usage edge produces a reviewable diff. |
| **OBJ-5 — one governed read-only database session** | A full generation opens exactly one database session, only through `dt-sql`, and the extraction proves `current_user = dt_reader`. No direct DSN, app credential, password file copy, connection pool, parallel query or fallback login is introduced. A failed/ambiguous call inherits dt-sql's lock and stops before offline generation can publish a result. | A connection-counting stand-in sees one connection for a complete run and a mutant that opens a second is killed. Live evidence records the positive-control user and one successful complete extraction. `dt-sql --status` is clean afterwards. |
| **OBJ-6 — checked-in provenance and freshness** | The map is checked in under one stable documentation root. Its top-level receipt records database extraction UTC, database identity without secrets, source SHA, relation/column totals, RLS warning, generator/tbls versions and content hashes. Generated pages carry or link that receipt. A repo ref that does not resolve or a dirty/mixed source tree fails closed. | Fresh checkout regeneration at the recorded ref matches the checked-in hashes. Wrong-ref, dirty-tree, missing-receipt and tampered-page tests each fail. |
| **OBJ-7 — scheduled regeneration and drift alert** | A staging-host schedule regenerates into a private temporary/output area and compares against the checked-in map at the named ref. It runs at a Step-2-measured non-conflicting time, holds a non-blocking single-run lock, retains a bounded receipt, and alerts on database-read failure, generator failure, content drift or an overdue successful run. It never commits, pushes, deploys or restarts the app. | Run the real scheduled entry point once; exercise success, lock-held, drift, generator-failure and stale-success arms with positive controls. Verify the alert routes to CC-INFRA and resolves only after a clean current run. |
| **OBJ-8 — usable hand-off to B-DB-HELPER-RETIRE** | The machine-readable usage inventory identifies direct-login/database helper files separately from application readers/writers, with enough evidence for row 5a3 to decide each helper. This batch does not retire or reroute them. | Reconcile the helper subset against the Step-2 direct-login census; every census member is mapped or explicitly unresolved with a reason. |

### Not in this batch

- No database schema, role, grant, data, RLS policy or application pool changes.
- No application/dashboard work and no DawnTrader process restart.
- No exact full-table row counts; the database is large enough that scheduled scans would violate the no-burst/no-load intent of KD-93.
- No retirement or rerouting of direct-login helpers; that is `B-DB-HELPER-RETIRE` (row 5a3).
- No claim that an RLS-shaped zero means a table is empty, or that a static-analysis miss means a table is unused.
- No deletion or replacement of the January-2026 directive-specific `docs/schema_reference_v1_5_1.md` / `v1_5_2.md`; they are historical narrow documents, not the current whole-database map.

---

## 2. Architectural read

**System Impact Map, “Crew database reads” (`SYSTEM_IMPACT_MAP.md:1425`), re-read 2026-11-24.** `dt-sql` and `dt-sql-login` are the governed upstream: one verified-TLS attempt, a non-blocking lock and INTENT, the dedicated `dt_reader` role, and no fallback credential. The downstream blast radius of a map-generation failure is documentation freshness only; the app's Node pools and trading process are outside this path. A failed or ambiguous extraction can lock later crew reads until Infra establishes the cause and performs the governed unlock, so the scheduled entry point must stop on the first failed call and page rather than retry.

**System Manual, “Crew Database Reads” (`SYSTEM_MANUAL.md:8633-8641`), re-read 2026-11-24.** `dt_reader` has `pg_read_all_data` and `pg_monitor`, no elevated attributes, and database-enforced refusal of the seven governed persistent-write classes. The important read-side limit is RLS: the verified population contains 26 RLS-enabled `auth`/`storage` tables that appear empty to `dt_reader`. The map therefore records schema metadata and RLS state from catalogs, labels row figures as catalog estimates, and carries the warning; it does not reinterpret visible zero rows as absence.

**One live catalog read through `dt-sql`, 2026-11-24.** Positive control returned `current_user = dt_reader`. Population: non-system relations with `relkind` table/partitioned-table/view/materialized-view/foreign-table and schemas excluding `pg_catalog`, `information_schema` and `pg_toast*`. Result: **697 relations** = **692 tables/partitioned tables + 5 views**, **11,511 columns**, **688 primary keys**, **60 foreign keys**, **222 unique constraints**, **2,199 indexes**, and **105 GB** summed `pg_total_relation_size` over base/materialized relations. Relation population by schema: `auth` 27, `dawntrader_v2` 8, `extensions` 2, `public` 645, `realtime` 3, `storage` 10, `vault` 2. These are sizing facts for the generator, not a close claim; Step 7 repeats and set-reconciles the current population.

**Tool choice.** `tbls` is selected over a custom renderer because its official project documents PostgreSQL support, checked-in GitHub-flavoured Markdown, ER output, deterministic diff/lint workflows, JSON input/output and CI-oriented use. It does not own DawnTrader's row/size or code-usage claims; the batch's enrichment layer does, and the artifact labels that provenance. SchemaSpy was considered: its official output covers HTML documentation, ER diagrams, columns, indexes and row displays, but its Java/HTML output is a poorer fit for the repository's Markdown review and offline extracted-schema boundary.

---

## 3. Provenance read

**Binding decision.** `DECISIONS.md` KD-101 requires an industry-standard, catalog-generated data dictionary with every table/column, keys/relationships, row counts/size and code/script readers/writers; it places this batch after the read-only role and before helper retirement. The introducing governance commit is `56488438721d986e78ca24df9bf5c4cfe003ad03`, subject verbatim: **“Governance ledger: KD-101 B-DB-MAP placed before live (Infra)”**. No decision against the map or its placement was found in `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, `PHASE_HISTORY.md` or the completion reports for its two predecessors.

**Live schema source versus repository schema declarations.** `shared/schema.ts` began at `5951a3195f20f8fbf40284a51c72055fc3d41efa` (*“Add AI assistant and user interface improvements for trading app”*) and has accumulated hundreds of changes across many batches; `server/db.ts` shares that origin and later pool-guard work. Neither path is proof of the complete live database, which also includes Supabase-managed schemas and migration/runtime drift. Their disposition is reader/writer/DDL evidence only; the live catalog is authoritative for what exists.

**Governed extraction path.** `dt-sql` was introduced at `18cb46eb289af0de9418a7cc9c57574fe59e4578` (*“B-DB-READ-TOOL Step-3: dt-sql, the psql wrapper, tests and mutants, drift enrolment”*) and then moved to `dt_reader` by `B-DB-READONLY-ROLE`. Its completion report explicitly leaves this comprehensive inventory open and warns that the earlier eight-object census was representative, not exhaustive. Disposition: unchanged safety boundary; the map calls it once rather than creating another login path.

**Existing documentation/tool search.** A positive-control search for `B-DB-MAP` found the plan, decision and predecessor records. A targeted tracked-file search found no `.tbls` configuration, tbls-generated root or SchemaSpy output; the only current `schema_reference_v1_5_*` files describe a narrow January-2026 telemetry directive. Disposition: keep those historical files and add a separately named, generated whole-database map.

---

## 4. Step-2 questions the audit must settle before implementation

1. Which `tbls` JSON/schema adapter shape preserves PostgreSQL partitions, views, constraints and comments without granting `tbls` a database credential.
2. The exact tracked source roots, generated-file exclusions and parser rules for Drizzle symbols, raw SQL and dynamic SQL; every exclusion must be named and tested.
3. The stable checked-in output path and whether the whole-database ER needs bounded viewpoints in addition to the complete machine-readable relationship set.
4. The safe schedule time after measuring staging cron/systemd collisions, plus the alert key, stale threshold, retained receipt count and private temporary path.
5. The exact pinned `tbls` release/checksum and install location, with license and update procedure recorded.
6. How partition child sizes and parent roll-ups are rendered without double counting, and how stale/NULL catalog row estimates are shown.

---

## 5. Anticipated files and governance reach

Expected implementation surfaces: a fixed catalog query/extractor under `comms-infra/staging/`, an offline repository-usage scanner and tests, a pinned `tbls` installer/configuration, generated documentation under a stable `docs/` root, a staging scheduler/install record, CI tests, and one alert definition. Exact paths are decided at Step 2; no production app path is expected.

At Step 10, at minimum: `BATCH_CATALOG`, `PHASE_HISTORY`, `SPRINT_TO_LIVE_PLAN`, INFRA task list and memory, scope/pre-audit/change-list/completion report, System Impact Map, System Manual and `RUNNING_ISSUES #1259`. `STORAGE_POLICY`, trading plans, adjustment/authority documents and application change registries are expected N/A unless the Step-2 audit finds a real touched contract.

---

## 6. Reviewer gate

Coltrane is asked to rule **PROCEED** or **SEND BACK** on: (a) `tbls` plus DawnTrader enrichment as the correct industry-standard boundary; (b) catalog-estimated rows rather than exact full-table scans; (c) one guarded `dt-sql` extraction followed by offline generation; (d) the static-analysis honesty rule and unresolved ledger; and (e) scheduled regenerate-and-compare with alerting but no automatic commit/push.
