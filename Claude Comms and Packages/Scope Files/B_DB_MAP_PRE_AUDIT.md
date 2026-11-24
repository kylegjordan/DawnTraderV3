# B-DB-MAP — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Owner:** Infra Codex (standing in for Infra Claude / CC-INFRA)
**Scope:** `B_DB_MAP_SCOPE.md` r1, Step-1 PROCEED at `2c621d2f422142d1930e484fc7558bf3850fad46`
**Audit ref:** `8130531b5089edbf080cb1de028b82dce77bec73`
**Decision:** KD-101 · sprint row 5a2 · after `B-DB-READONLY-ROLE`, before `B-DB-HELPER-RETIRE`

---

## 0. Previously stated versus now

1. **PREVIOUSLY STATED:** the scope repeated the System Manual warning as 26 RLS-enabled `auth`/`storage` relations. **NOW:** the complete mapped population has 27 RLS-enabled relations and 0 forced-RLS relations. **REASON:** the broader relation population also includes the RLS-enabled `realtime.messages` partitioned table; the warning remains the same—visible rows through `dt_reader` are not proof of absence.
2. **PREVIOUSLY STATED:** `RUNNING_ISSUES #672` measured 390 physical base tables and 206/210 “logical tables” in August 2026, with the normalisation rule unresolved. **NOW:** the fixed audit population is 697 relations: 675 ordinary tables, 17 partitioned parents and 5 views; 419 ordinary tables are partition children, leaving 278 logical relations after each child is folded under its parent. **REASON:** the database grew, and this audit names the physical-versus-logical rule instead of comparing unlike counts.
3. **PREVIOUSLY STATED:** the January schema references and canonical corpus describe roughly 14–160 tables, depending on the document. **NOW:** the catalog holds 697 relations and 11,511 columns. **REASON:** those documents are historical or hand-curated views, not a current catalog extraction; this batch keeps them but does not use them as the inventory.
4. **PREVIOUSLY STATED (first Step-2 review ref `b2f20c997`):** the audit-ref repository population was 2,427 code-bearing files, with 2,324 included and 103 excluded. **NOW:** it is 2,466 code-bearing files, with 2,363 included and the same 103 excluded. **REASON:** the suffix-only census omitted 38 extensionless shebang programs plus the root `Dockerfile`; all 39 are real scanner inputs and are now included.

No other Step-1 sizing number moved: the fixed scope read remains 697 relations, 11,511 columns, 688 primary keys, 60 foreign keys, 222 unique constraints, 2,199 indexes and approximately 105 GB summed catalog storage over base/materialized relations.

---

## 1. Audit frame and sources read

All six Step-2 sources were read where applicable:

1. **Actual code at the audit ref.** Read `dt-sql`, `dt-sql-login`, the repository census/history aids, the database pool entry point, the existing staging watchdog/timers, alert failure tooling, old schema references, and representative Drizzle/raw-SQL callers. Search results were used only to enumerate; the cited files were opened.
2. **Runtime logs and database.** Read the current 50-line PM2 tails on both app streams, the full live timer list, both root/deploy crontabs, and guarded `dt-sql` catalog sessions. The audit extraction and final self-review extraction each positively identified `current_user = dt_reader` and returned the same population. One intervening self-review query had a SQL grouping error, returned no data, left `dt-sql` unlocked and was not used as evidence.
3. **System Impact Map.** Read the crew database-read path and current app-pool rows, including upstream credential/TLS/lock dependencies and downstream users (`SYSTEM_IMPACT_MAP.md`, crew database reads near line 1425).
4. **System Manual.** Read the database schema/migration chapter and crew-read contract. The Manual records that migration replay is not a complete reconstruction of the live schema, which is why the live catalog—not migration history or `shared/schema.ts`—is authoritative for existence.
5. **Reports and ledgers.** Read KD-101, sprint rows 5a1–5a3, both predecessor completion reports, `BATCH_CATALOG`, `RUNNING_ISSUES #1259`, and the older `B-CATALOG-1` record at `RUNNING_ISSUES #672` plus its plan rows.
6. **`bridge/canonical/`.** Read the database sections of the core-files reference, architecture/execution flow, project history and invariants. They establish the original intent of a central Drizzle schema/storage layer, but they do not cover a generated whole-database map and are not current-state truth.

No staging UI navigation applies: this batch has no page, route or application control. No observation window applies, so Step 2 files no `DEPLOY_WINDOWS.jsonl` row.

---

## 2. Audit findings

### F1 — the catalog must be the existence authority

The live database cannot be reconstructed from migration history alone; the System Manual says later changes were applied outside a complete replayable chain. The old `docs/schema_reference_v1_5_1.md` and `v1_5_2.md` are narrow January telemetry documents, while the canonical corpus still describes a much smaller historical table set. `shared/schema.ts` is valuable code evidence but cannot enumerate Supabase-managed schemas, raw-SQL-only relations or drift.

**Consequence:** relation/column/constraint/index/partition/RLS existence comes only from one fixed `pg_catalog` extraction. Drizzle declarations and migrations are usage/DDL evidence, never substitutes for catalog membership. The two old schema-reference files remain historical and are not deleted or retitled.

### F2 — the relation identity is schema-qualified and physical

The fixed population is every `r`, `p`, `v`, `m` or `f` relation outside `pg_catalog`, `information_schema` and `pg_toast*`. It currently contains 697 relations: 675 ordinary tables, 17 partitioned parents and 5 views. Seven unqualified names occur in more than one schema, including `users` in three schemas and six other duplicate-name groups.

**Consequence:** every key is `(schema, relation)`, never the bare table name. The official `tbls` JSON receives fully qualified table names. A raw-SQL reference to an ambiguous unqualified name is unresolved unless the scanner can establish its search path or symbol identity.

### F3 — partitions require two simultaneous views

There are 419 partition children and 419 parent-child edges; 16 of 17 partitioned parents currently have children. A physical view must list every child because it owns storage and statistics. A logical view must fold children under the parent because users think of the parent as the table. Counting both a parent roll-up and its children in the same total would double count.

**Consequence:** each relation records `relkind`, `is_partition`, parent identity and physical statistics. Partition parents also get a separately labelled child roll-up with known-child sum plus `unknown_child_count`. Database-wide totals sum physical non-parent relations once; parent roll-ups never enter the same denominator.

### F4 — estimates and sizes have explicit unknown states

Of the 692 table/partition-parent relations, 454 currently have negative `reltuples`; separately, 454 have neither an ordinary nor an auto-analyze timestamp. The audit did not assume those two sets are identical. Neither condition means zero rows. Views have no table storage measurement. Table, index, TOAST and total bytes are separate catalog functions and cannot be inferred from each other.

**Consequence:** estimated rows are a number only when the catalog supplies a non-negative estimate; otherwise they are `unknown` with the reason. Bytes are exact at extraction time for the catalog function used, while rows remain estimates. Views render size/rows as not applicable unless PostgreSQL supplies a real materialized relation. No `COUNT(*)` is introduced.

### F5 — RLS makes visible emptiness non-evidence

The mapped population has 27 RLS-enabled relations and 0 forced-RLS relations. `dt_reader` is intentionally `NOBYPASSRLS`; therefore an empty query against those relations can be a policy result rather than an empty table.

**Consequence:** the map records RLS enabled/forced state and displays a warning. It never labels a relation empty from the reader-visible row set. Row estimates come from permitted catalog statistics, not a table scan.

### F6 — one session must also bind one catalog snapshot

`dt-sql` holds a non-blocking single caller lock, writes INTENT before the attempt, owns the LOCKED state, reads no credential and invokes only `dt-sql-login` (`comms-infra/staging/dt-sql`, lines 33–58 and 358–419). The login helper resolves one address, uses verified TLS, puts the password only in its child environment, sets read-only and statement timeout, and makes one `psql` attempt (`dt-sql-login`, lines 17–19 and 175–185). It refuses input containing a backslash before connecting.

The existing login boundary guarantees one governed connection, but its `PGOPTIONS` set only `default_transaction_read_only=on` and a statement timeout. PostgreSQL 18 §13.2.1 states that each `SELECT` at Read Committed sees a snapshot from that query's start and that successive `SELECT` commands can see different data, so several section queries in one connection could still mix catalog states.

**Consequence:** the generator pipes one plain-SQL script to one `dt-sql --csv` call, and that script contains exactly one catalog `SELECT`. CTEs and one tagged `UNION ALL` stream every versioned section as `(section, section_order, row_order, payload_json)` from the statement's single snapshot. The SQL contains no `psql` meta-command/backslash. A nonzero/ambiguous result publishes nothing and is never retried by the generator. A disposable-PostgreSQL concurrency control changes catalog metadata after an early branch pauses; the one-statement extractor must remain internally consistent, while a split-two-statement mutant must expose the mixed state and fail.

### F7 — the `tbls` adapter is a stable offline boundary

Official `tbls` v1.97.0 was released 2026-11-19. The Linux AMD64 archive is `tbls_v1.97.0_linux_amd64.tar.gz`, size 31,694,635 bytes, SHA-256 `43c81f408495d9b626d0265a6ebb57c6d1c4a5e072d3eecc3e88825cc6c64e9a`. The upstream license is MIT. The official JSON schema requires a `Schema` with tables; tables require name/type/columns; columns require name/type/nullable; constraints, indexes and relations have defined table/column identities. The official README states that `json://...` is a datasource, `tbls doc` generates GFM and ER output, and viewpoints have stable IDs.

**Consequence:** a DawnTrader adapter writes official schema JSON with fully qualified relation names, catalog columns, indexes, constraints and FK relations. `tbls` receives only `json://<private file>`; it never receives a PostgreSQL DSN or environment credential. DawnTrader-only row/size/partition/RLS/code-usage facts stay in separately labelled enrichment files and table-page sections.

### F8 — a complete ER needs bounded views as well as a complete relation set

A 697-relation all-column diagram is review-hostile even though the underlying relationship set is complete. The catalog has only 60 foreign keys, so a relationship-focused overview is useful, while schema-specific diagrams remain navigable.

**Consequence:** check in the complete `tbls` schema and table pages, a complete ER artifact restricted to key/related columns, and stable viewpoints for each mapped schema plus a cross-schema relationship viewpoint. The machine-readable FK set remains the completeness authority; a diagram is a view, not the inventory.

### F9 — the existing census aid proves why a purpose-built scanner is needed

At the audit ref the tracked repository contains 2,466 code-bearing files. The scanner population is 2,363 files across application, operator, migration, CI and crew-tooling roots; 103 code-bearing report/document/output files are excluded with named reasons. The population rule includes the named language suffixes, any tracked blob whose first bytes are `#!`, and the root `Dockerfile`. A positive-control census found 49 extensionless paths: 38 are shebang programs, one is the root `Dockerfile`, and 10 are non-code configuration/symlink objects. The 38 programs include `dt-api-set-crew-password`, `dt-sql-login`, `dt-sql-role-setup` and `psql-wrapper`; omitting them would make the helper-retirement handoff incomplete. Included roots contain 1,146 `server`, 379 `drizzle`, 264 `scripts`, 185 `client`, 191 `comms-infra`, 112 `token-watch`, 27 root files, 23 `.claude`, 13 `shared`, and smaller named roots. The population includes 545 test/fixture files, labelled `test_only`, not silently dropped.

`census.mjs --table telemetry_history` found the real Drizzle declaration and 30 typed uses in 3 files, but its raw-SQL leg searched only 1,086 files. `--table users` returned 160 name lines while only 33 lines carried an SQL-shaped token and could not distinguish three schemas. `--table xstock_bar_revision_event` found 30 raw name lines but no Drizzle declaration. The aid itself says it cannot see computed imports, HTTP-string reach, live-host timers, several entry-point forms, string-keyed access, non-TypeScript importers or dynamic table names.

**Consequence:** the production scanner is not a wrapper around `census.mjs`. Its versioned root/suffix/shebang/Dockerfile/exclusion rules enumerate the candidate tree anew; 2,363 included paths and 103 excluded paths are the audit-ref result, not a frozen allowlist. It labels test/migration/operator/runtime evidence, resolves Drizzle symbols with the TypeScript compiler, lexes conservative SQL across all named languages, and writes every dynamic/ambiguous case to an unresolved ledger.

### F10 — reader/writer claims need operation semantics, not name matches

The scanner must distinguish read, insert, update, delete, DDL and unknown. Drizzle symbols can identify `public.users` despite the duplicate bare name; a raw `FROM users` cannot always do so. A table name in a comment, variable name or migration rollback must not become a live reader. Conversely, computed SQL must not disappear because the table token is absent.

**Consequence:** typed Drizzle operations are primary evidence. Raw SQL is tokenised into statements and table positions for `FROM`/`JOIN`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `COPY`, and DDL. Comments and non-SQL prose are excluded. Concatenated identifiers, unknown search paths, parser failures and dynamic imports become explicit unresolved rows; no table is ever called unused.

### F11 — exact-ref generation has a self-reference problem that the manifest must solve

A generated artifact cannot contain the SHA of the commit that first contains itself. Pinning only the final artifact commit is circular; pinning only a dirty working tree is unreviewable.

**Consequence:** generation peels an explicit clean input ref to immutable 40-hex commit `R`, archives/scans exactly `R`, and writes `source_ref = R`. The child artifact commit `C` may change only an enumerated artifact/governance allowlist; verification rejects any covered code, migration, extraction-query, scanner-config or executable-mode change in `R..C`. Every comparison re-enumerates both trees under the versioned population rules and requires path-set equality before comparing a canonical ordered sequence of `(path, mode, blob-id)` tuples. Added, removed, renamed or mode-changed covered files therefore cannot hide behind the `R`-era set, while an artifact-only commit creates no source drift. `artifact_hashes` explicitly excludes `manifest.json`; the manifest is schema-validated, and its Git blob plus artifact commit `C` are anchored in the reviewed change list/completion record rather than self-hashed.

### F12 — the schedule can use a quiet, measured slot without touching the app

The live staging timer list and root crontab have dense work from 00:00–06:00 UTC, frequent 5/15/30/60-minute jobs, and a Monday 09:00 weekly watchdog heartbeat. There is no DawnTrader timer or cron at Sunday 06:30 UTC. PM2 logs show the app actively trading and broadcasting; no database-map process currently exists.

**Consequence:** the weekly generator runs Sunday 06:30 UTC with up to 10 minutes of systemd random delay, `Persistent=true`, a 30-minute service timeout and a non-blocking lock. A separate daily receipt-only stale check runs at 07:15 UTC and makes no database connection. Neither service restarts or signals the app.

### F13 — failure, structural drift and two kinds of staleness are distinct states

An execution failure is not a clean comparison; structural drift is not a failed read; a missing week is not detectable by the weekly job that failed to run; and a healthy weekly job does not make a months-old reviewed baseline fresh. Row estimates and byte sizes naturally move even when structure and code usage do not, so whole-artifact byte comparison would false-page. The existing staging unit-failure handler provides a last-resort OnFailure page, while the system-alert CLI supports stable dedupe keys and evidence-backed resolve.

**Consequence:** compare a canonical structural/usage projection that excludes extraction time and volatile row/byte statistics. Preserve fresh statistics in the private successful receipt. Use separate keys `db-map:failure`, `db-map:drift`, `db-map:run-stale` and `db-map:baseline-stale`, each routed to CC-INFRA. A verified successful run resolves failure; a verified structural match resolves drift; a fresh receipt resolves run-stale; only a reviewed checked-in baseline refresh resolves baseline-stale. The daily checker alerts after no successful receipt for more than 8 days or a checked-in baseline older than 35 days. Lock-held is a recorded skip, not success or failure. The generic unit OnFailure path remains the floor if the runner cannot load.

### F14 — `B-DB-MAP` overlaps an older unfinished catalogue, but does not replace all of it

`RUNNING_ISSUES #672` and Phase 19 rows 12.2/12.4 already place `B-CATALOG-1`. Its structural catalogue and ORM↔database drift objectives overlap KD-101 directly. Its lookalike register, semantic ownership/purpose fields, glossary, `B-STORAGE-CATALOG` paper close and #601 log-folder remainder do not. The current pre-live records still list both names without reconciling the overlap.

**Consequence:** `B-DB-MAP` supersedes only `B-CATALOG-1` OBJ-A’s generated structure and OBJ-B’s ORM/code-reference drift. It does not absorb the lookalike register or the other semantic/governance objectives. At Step 10, update #672 and the plan rows to name the split rather than closing the whole older batch. This needs Coltrane’s explicit Step-2 ruling.

### F15 — this batch changes documentation infrastructure, not trading behavior

The System Impact Map accurately covers `dt-sql` but has no database-map component yet. The System Manual covers schema/migration limitations and crew reads but not the new generator, scanner, artifacts or schedule. The canonical corpus likewise has no generated-map design.

**Consequence:** Step 10 adds the new map/schedule/read path to the System Impact Map and System Manual. There is no trading formula, authority, application pool, UI or database-write change.

---

## 3. Component census and entry points

Entry points are enumerated before the trace. Tests are listed separately from production entry points.

| component/state | writers/creators | readers | mutators | deleters | schedulers/starters |
|---|---|---|---|---|---|
| live PostgreSQL catalog | existing database/app/migrations, outside this batch | **exactly one new reader:** the fixed catalog extractor through one `dt-sql` call | none in batch | none in batch | weekly generator only |
| captured catalog JSON | **exactly one writer:** extractor/normaliser | adapter, enrichment renderer, verifier | none; immutable per run | private run cleanup only | generator |
| exact-ref repository archive | Git at explicit ref | **exactly one scanner process** plus verifier | none | private run cleanup only | generator |
| official `tbls` schema JSON | **exactly one writer:** adapter | pinned `tbls` and schema validator | none; regenerated wholesale | private run cleanup only | generator |
| DawnTrader usage inventory | **exactly one writer:** scanner | renderer, helper-retirement handoff, verifier | none; regenerated wholesale | private run cleanup only | generator |
| checked-in `docs/database-map` baseline | human-reviewed artifact commit only | crew, reviewer, CI integrity checks, weekly comparator | later reviewed regeneration commits only | no automatic deletion | no runtime starter |
| private candidate output | weekly generator | comparator/verifier | atomic receipt update after complete success | candidate directory removed after comparison; only 8 small receipts retained | weekly systemd timer |
| receipt state | clean generator | daily stale checker and install-drift check | atomic replace | bounded retention after 8 receipts | weekly writer; daily read-only checker |
| four alert keys | weekly runner/daily stale checker; generic unit failure as floor | system-alert dispatcher and crew queue | only each key's named verified condition may call `resolve-key` | alert store retention, outside batch | weekly/daily services |

The weekly generator and daily stale checker are two entry points over the receipt/alert state, not two database readers. They share the non-blocking map lock; the stale checker skips while a generation is active and retries at its next daily fire. There is no second catalog connection, app bootstrap, PM2 entry, HTTP route, event listener or UI entry point.

---

## 4. Audit-aid runs and their blind spots

### Aid runs

- `census.mjs --table telemetry_history`: 30 typed uses in 3 files; 13 raw name lines; 3 reached files. Its own output says raw SQL is not type checked, computed/string-keyed access is missed, scripts are outside the TypeScript program, host timers are not visible, and several scheduler/event forms are not enumerated.
- `census.mjs --table users`: 116 typed uses in 9 files; 160 raw name lines, only 33 SQL-shaped; the aid cannot assign an unqualified raw name among `auth.users`, `dawntrader_v2.users` and `public.users`.
- `census.mjs --table xstock_bar_revision_event`: no Drizzle declaration; 30 raw name lines, 17 SQL-shaped; reach is empty even though live runtime and operator code use the table through raw SQL.
- `history.mjs server/db.ts`: 13 commits, 11 attributed to two database batches and 2 unattributed. The aid says it cannot cover prose-only issues, pre-path history, multi-hop renames or every sub-batch form.
- `history.mjs shared/schema.ts`: 288 commits, only 77 attributed to 58 batches, with 211 unattributed. That history is evidence of a high-churn code declaration file, not proof of the live catalog.

### Eight mandatory blind-spot classes

1. **Two value lists agreeing:** touched. Catalog relation/column/constraint sets are compared for exact set equality with adapter/map sets; counts alone cannot pass.
2. **Literal copies of a list:** touched. Scanner roots/extensions live in one exported manifest consumed by scanner, tests and receipt; unit fixtures mutate each root/class so a copied divergent list fails.
3. **Properties and fields:** limited by scope. Table-level read/write evidence is required; column-level code readership is not claimed. Catalog columns still receive exact set equality.
4. **Sibling producers of one label/panel:** N/A for UI—there is no panel. Alert producers are separately enumerated by key and tested for dedupe/resolve behavior.
5. **What a site means:** touched. Parent zero, negative `reltuples`, RLS-visible emptiness, views and ambiguous bare names each have distinct rendered states and fixtures.
6. **Error paths:** touched. Pre-connect refusal, SQL failure, ambiguous lock, checksum failure, parser failure, `tbls` failure, lock-held skip, compare drift and stale receipt are separate outcomes.
7. **Library behavior:** touched. The official v1.97.0 JSON schema validates the adapter; the pinned binary is checksum-verified and smoke-tested offline against a fixture before publication.
8. **Files outside the TypeScript programs (`scripts/`):** touched. At the audit ref, the rule-derived 2,363-file population includes 264 `scripts`, 379 `drizzle`, Python, shell, JavaScript/MJS, SQL, YAML, 38 extensionless shebang programs, the root `Dockerfile`, crew tooling and root entry files; 103 exclusions are named with reasons. Candidate-side re-enumeration prevents that audit-ref set from becoming a stale allowlist.

---

## 5. Implementation plan

Every item cites the findings that require it. There are no unaudited plan items.

### P1 — fixed one-session catalog extraction (`F1–F6`)

Add one plain-SQL catalog query under `scripts/db-map/` and a generator command that passes it once to `dt-sql --csv`. The script has one catalog `SELECT`; CTEs and one tagged `UNION ALL` emit a versioned set of sections for database identity (non-secret), schemas, relations, columns, constraints and their ordered columns, indexes and ordered columns, partition edges, RLS policies/state, comments, enums and extraction metadata including `current_user` and UTC. Column rows carry ordinal, type, nullability, default, identity and generated state. Constraint rows carry primary, unique, check and foreign-key type, ordered local/referenced columns and the catalog definition. The normaliser refuses anything other than `dt_reader`, duplicate identities, missing sections or cross-section references that do not resolve.

The query uses catalog estimates and size functions only; no user-table `COUNT(*)`. It contains no backslash/meta-command. The complete captured dataset is written only after the one call exits cleanly.

### P2 — canonical physical and logical data model (`F2–F5`)

Represent relations by `(schema,name)`. Emit one physical row per relation plus explicit parent/child edges. Parent roll-ups contain known child sums and unknown-child counts; they are excluded from physical database totals. Negative/NULL estimates become `unknown`, never zero. Views are not assigned table storage. RLS enabled/forced state and the read-visibility warning are first-class fields.

### P3 — pinned offline `tbls` adapter and views (`F7–F8`)

Pin `tbls` v1.97.0 and the Linux AMD64 SHA-256 above. The installer downloads only that named release, verifies size and checksum before an atomic root-owned install under `/usr/local/lib/dt-db-map/tbls-v1.97.0`, records the MIT license, and exposes no auto-update path.

Convert captured catalog data to the official v1.97.0 JSON schema: qualified table names, ordered columns, indexes, constraints and FK relations. Map column defaults to the official `default` field, identity/generated clauses to `extra_def`, and primary/unique/check/FK definitions to the official constraint objects; also retain default/identity/generated as separate typed fields in DawnTrader `catalog.json` so rendering is not dependent on presentation text. Validate against the checked-in upstream JSON schema copy/hash. Run `tbls doc` only with `json://...`, no network/DSN, into a private candidate directory. Generate complete GFM table pages, the complete relationship data, an overview ER showing related/key columns, and stable per-schema plus cross-schema viewpoints.

### P4 — exact-ref repository scanner (`F2`, `F9–F11`)

Require a ref that peels to one immutable 40-hex commit and a clean source repository. Materialise an archive of exactly that commit into a private run directory; never use a worktree. Apply versioned root, suffix, leading-shebang, root-Dockerfile and exclusion rules to the candidate tree itself, then record the complete included and excluded path sets with reason. The 2,363 included / 103 excluded counts describe audit ref `8130531b5089edbf080cb1de028b82dce77bec73`; future candidates are required to re-enumerate and may legitimately have different counts. Label runtime, operator, migration/DDL, test-only and legacy evidence.

Use the TypeScript compiler API for Drizzle declaration/import/re-export/operation identity. Use a conservative SQL lexer for TypeScript/JavaScript/MJS/CJS, Python, shell, SQL and YAML. Classify read/insert/update/delete/DDL/unknown with exact ref, file and line. Resolve qualified names and typed Drizzle symbols; send ambiguous bare names, computed identifiers, unsupported statements and parser failures to `unresolved.json`. A scanner miss is rendered as `none found by scanner at <sha>`, never `unused`.

### P5 — DawnTrader enrichment and helper handoff (`F4`, `F5`, `F9–F10`)

Generate `catalog.json`, `usage.json`, `unresolved.json` and a human index under `docs/database-map/`. Each table page links the `tbls` structure to separately labelled DawnTrader statistics, partition/RLS state and code-usage evidence. Produce a direct-login/helper subset based on real client construction/login execution—not mere `DATABASE_URL` prose—so `B-DB-HELPER-RETIRE` receives one row per helper with its operation/table evidence or unresolved reason.

### P6 — provenance and self-reference-safe manifest (`F7`, `F9`, `F11`)

Write `docs/database-map/manifest.json` with schema version, extraction UTC, non-secret database identity, peeled immutable `source_ref R`, extraction-query hash, generator/scanner versions, pinned `tbls` release/archive checksum, population/set hashes, inclusion/exclusion counts and the RLS warning. Its scanner-input tree hash is over the byte-stable ordered sequence of `(repository-relative path, Git mode, blob-id)` tuples from a freshly enumerated candidate population. `artifact_hashes` covers every generated artifact except `manifest.json`, avoiding manifest self-reference; the manifest is schema-validated and its final Git blob is anchored outside itself in the reviewed change list/completion record. The checked-in baseline is generated from `R` and committed in child `C`; it does not pretend to know `C` before C exists.

The verifier checks the recorded ref is a 40-hex commit object, the source tree is clean, candidate-side population enumeration completed, path-set equality and the canonical tuple hash match where required, every artifact hash matches, and no likely credential/DSN appears in output. For a checked-in baseline it also requires `R` to be an ancestor of `C` and every `R..C` path/mode change to fall inside the enumerated artifact/governance allowlist; a covered source/config/query change invalidates the baseline as stale at birth.

### P7 — verification and mutation suite (`F2–F11`, `F13`)

Add fixtures for all current relation kinds, duplicate schema names, partitions, stale/negative estimates, RLS, views, comments, column defaults, identity columns, generated columns, ordered compound primary/unique keys, check constraints, FK relations, expression/partial indexes and unsafe future identifiers. Assert set equality not only for relation/column identity but for each column's ordinal/type/nullability/default/identity/generated tuple and every primary/unique/check/FK constraint definition plus ordered columns. Add Drizzle/read-write-delete and raw-SQL fixtures for every language/root class, aliases/re-exports, multi-line/quoted SQL, CTEs, migrations/rollbacks, comments, dynamic names and ambiguous search paths. Include extensionless shebang helpers and the root `Dockerfile` as positive controls.

Required mutants remove a relation, column, column default, identity marker, generated expression, primary/unique/check/FK constraint, index, partition edge, source root, shebang/executable classification leg, Drizzle alias, raw-SQL operator, unresolved row, artifact hash, manifest ref, checksum or second-connection guard; each must fail. Provenance mutants add, change, delete and rename an included file; change its executable mode; alter the scanner/extraction config between `R` and `C`; and combine a covered-source change with an artifact change. Each must fail. An artifact-only documentation commit is the no-drift control. A connection-counting stand-in proves one complete generation invokes `dt-sql` once and kills a two-call mutant. A disposable-PostgreSQL control mutates catalog metadata while the one statement is paused and proves the output remains one snapshot; a split-two-statement mutant must fail by returning a mixed population. Fixed-input runs must be byte-identical. The real pinned binary must render an offline fixture and pass schema validation.

### P8 — CI integrity gate, without a live database (`F7`, `F11`)

Extend the existing Test Suite with fixture/mutation tests, manifest/artifact hash verification, candidate-side population re-enumeration, the `R..C` artifact-only fence, official-schema validation and the pinned-tool metadata check. CI does not connect to staging and does not claim live freshness. It catches an internally inconsistent checked-in map, changed scanner roots or generated tampering; live drift belongs to the staging schedule.

### P9 — weekly compare and daily stale watcher (`F6`, `F11–F13`)

Install a deploy-owned private state root `/var/lib/dt-db-map` mode 0750; each run directory is 0700. Use `/run/lock/dt-db-map.lock` non-blocking. The weekly timer fires Sunday 06:30 UTC, `RandomizedDelaySec=600`, `Persistent=true`, service timeout 30 minutes. It fetches only `origin/migration/aws-supabase` without checkout, peels that remote-tracking ref to an immutable commit, archives/scans it, makes one `dt-sql` call, renders offline, verifies, compares the canonical structural/usage projection with the checked-in baseline, retains fresh statistics plus bounded evidence in only eight small private receipts, then removes the private candidate directory.

The daily 07:15 UTC stale checker reads receipts plus the checked-in baseline manifest and makes no database connection. It alerts after more than 8 days without a successful current run and separately after more than 35 days without a reviewed baseline refresh. Both units use `OnFailure` as a floor. They never commit, push, deploy, alter the worktree, restart the app or send a signal to it.

### P10 — alert lifecycle (`F13`)

Route `db-map:failure`, `db-map:drift`, `db-map:run-stale` and `db-map:baseline-stale` to CC-INFRA with source ref, baseline ref/hash, extraction time and bounded evidence paths. Drift is emitted only after both candidate and baseline verify and their canonical structural/usage projections differ; stats-only change never occupies that key. A verified successful run resolves failure; a verified structural match resolves drift; a fresh successful receipt resolves run-stale; only a reviewed checked-in artifact refresh resolves baseline-stale. Lock-held produces a receipt marked skipped and no success timestamp.

### P11 — install drift and operator documentation (`F6–F7`, `F12–F13`)

Enroll the installed binary, runner, query, units/timers, private directory modes and recorded installed SHA in `dt-install-drift`. Document one manual regeneration command, one compare-only command, one status/receipt command, checksum update procedure and uninstall/rollback. The operator flow never asks for or prints a database password.

### P12 — governance reconciliation and closeout (`F1`, `F14–F15`)

At Step 10 add the database-map component and weekly/daily schedule to the System Impact Map and System Manual; update BATCH_CATALOG, PHASE_HISTORY, sprint/task records and completion/change-list files. Amend `RUNNING_ISSUES #672` and its plan rows so only structural catalogue/ORM-drift work is superseded by B-DB-MAP; keep the lookalike register, semantic glossary/ownership, `B-STORAGE-CATALOG` paper close and #601 remainder open with CC-A. Keep both January schema-reference files unchanged.

---

## 6. Verification matrix

| claim | proof |
|---|---|
| complete catalog | independent fixed query versus manifest set equality for relations; full column ordinal/type/nullability/default/identity/generated tuples; primary/unique/check/FK definitions and ordered columns; indexes and partition edges; targeted removal mutants red |
| honest row/size semantics | representative raw captured rows plus stale/negative/parent/view fixtures; database total excludes parent roll-ups |
| one governed connection and snapshot | current-user positive control, connection-counting stand-in, two-call mutant, one-statement catalog stream, concurrent catalog-change control versus split-statement mutant, clean `dt-sql --status` after the live run |
| offline `tbls` | process environment/arguments contain only `json://` input; network-disabled fixture render; pinned SHA and version readback |
| scanner coverage | candidate-side rules re-enumerate the full path set; the audit-ref 2,363 included / 103 excluded result reconciles exactly; suffix, shebang and root-Dockerfile controls plus added/deleted/renamed/mode/root/language mutants red; hand sample from each operation class |
| no unused overclaim | unresolved/ambiguous fixtures remain visible and a removal mutant fails; zero-hit wording includes scanner/ref limitation |
| deterministic artifacts | identical catalog/ref fixture renders byte-identically; all non-manifest artifact hashes verify; `R..C` artifact-only fence and manifest self-hash exclusion hold |
| schedule isolation | real unit entry point success, concurrent lock skip, structural drift, stats-only no-drift, failure, run-stale and baseline-stale positive controls; PM2 identity/restart counters unchanged |
| alert lifecycle | four keys mint independently, dedupe while open and resolve only on their named clean condition |
| helper handoff | exact direct-login census reconciled to mapped or unresolved helper rows |

---

## 7. Expected implementation surfaces

Exact filenames may be tightened during Step 3, but the planned homes are now fixed:

- `scripts/db-map/` — catalog SQL, generator, adapter, scanner, verifier, JSON schema/config and tests.
- `docs/database-map/` — checked-in manifest, catalog/usage/unresolved data, GFM pages and ER/viewpoint artifacts.
- `comms-infra/staging/` — pinned-tool installer, weekly runner, stale checker and install-drift enrollment.
- `comms-infra/staging/systemd/` — weekly generation and daily staleness service/timer pairs plus failure hooks.
- `.github/workflows/ci.yml` — offline fixture/integrity tests only.
- Governance files named in P12 at Step 10.

No application route, client page, application pool, database schema, database row, grant, role or RLS policy is changed. No staging deploy window is opened because verification is one-shot infrastructure execution rather than an observation soak.

---

## 8. Reviewer gate

Coltrane is asked to rule **PROCEED** or **SEND BACK** on the merged audit and plan, with particular attention to:

1. the v1.97.0 official JSON adapter and offline-only `tbls` boundary, including default, identity/generated and primary/unique/check/FK mapping;
2. schema-qualified scanner identity, candidate-side suffix/shebang/Dockerfile population re-enumeration, the audit-ref 2,363-file inclusion / 103-file exclusion result and unresolved ledger;
3. physical partition rows plus separately labelled logical roll-ups, with no double counting;
4. the Sunday 06:30 weekly generation plus independent daily 8-day run-stale and 35-day baseline-stale checks;
5. the self-reference-safe `source_ref R` / artifact commit `C` model, including immutable refs, candidate path enumeration, canonical `(path, mode, blob-id)` hashing, the `R..C` artifact-only fence and explicit manifest self-hash exclusion; and
6. the one-statement, one-snapshot catalog stream and its concurrent-change control; and
7. the narrow `B-CATALOG-1` split in F14/P12.

`REVIEWER: claim-only · Does the R/C provenance model avoid self-reference and distinguish covered-source drift from artifact-only documentation commits? · HIT: six missing discriminators · re-derived y`

The hit was re-derived on this draft with positive controls that found the existing `source_ref R`, artifact-hash and audit-population language, followed by absence checks for candidate-side enumeration, immutable 40-hex identity, an `R..C` fence, manifest self-hash treatment, canonical path/mode/blob hashing and the required mixed/no-drift mutants. F11 and P4/P6–P10 now contain those discriminators. Per the one-pass rule, this corrected object goes directly to Coltrane.

**NOT RE-READ:** the live catalog population/statistics, audit-ref repository population counts, official `tbls` release/schema facts, live schedule-slot absence and `B-CATALOG-1` overlap were re-derived by the owner but were not routed to the fresh reader. Coltrane independently reproduced those gates during his first Step-2 review. His SEND BACK then identified extensionless sources, snapshot consistency and missing explicit identity/generated/check tests; each finding was re-derived against the exact objects and corrected above without a second fresh-reader pass.

---

## 9. Plain-language summary

The audit confirmed that the database itself must supply the structural truth: the old hand-written references and code declarations cover only parts of a 697-relation live system. The plan uses one protected read-only database session and one consistent catalog statement, turns that result into standard `tbls` documentation offline, adds a conservative exact-ref code-usage map including extensionless helpers, and checks it weekly without touching the trading app.

The important correction is that an older unfinished catalogue already owns several broader governance tasks. `B-DB-MAP` will replace only its generated structure and code-reference work; the older batch keeps the lookalike register, semantics and other distinct items, so nothing is duplicated or silently dropped.
