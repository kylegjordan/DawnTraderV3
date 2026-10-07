# B-CLUSTER-BUS-PERSIST-DISPOSITION — PRE-AUDIT AND IMPLEMENTATION PLAN (Step 2, r1)

change-class: non_architecture · **Issue:** `#1159` · **Plan row:** `SPRINT_TO_LIVE_PLAN` 2a0c · **Owner:** CC-B
**Scope:** `B_CLUSTER_BUS_PERSIST_DISPOSITION_SCOPE.md` r2 (`d8d176cea`, Langston Step-1 PROCEED with C1-C5).
**Read at:** `origin/migration/aws-supabase` (head `1fd17e93c`); staging DB and `/var/log/dawntrader/` 2026-10-07 ~01:20Z.

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED: 16 non-heartbeat rows, newest 2025-10-21. NOW: 22, newest non-heartbeat 2025-11-06. REASON:** grouping by source_node alone dropped `paper_sim_heartbeat/health_alert` (Langston C4; carried into scope r2).
- **PREVIOUSLY STATED (scope §3, `#1163`): the Phase 17-22 cluster layer "may be unreachable". NOW: it RUNS and is reachable from the UI. REASON:** measured in §A6 — the autonomy scheduler logs `Running cluster rebalance` on a schedule, the autonomy controller evaluates cluster delegation, and two System-page admin tabs call the cluster routes. `#1163` is amended (its question becomes "it runs in a single-server system — what does it do, keep or remove each").

## SOURCES READ
| # | source | read |
|---|---|---|
| 1 | code at the ref | `server/services/cluster-bus.ts` (whole), `shared/schema.ts:4291`, `:4367-4378`, `:4606-4609`, `:4645-4647`, `server/scripts/b75-retention-sweep.ts:146-212`, `:827-972`, `:1136-1156`, `server/tests/unit/b-engine-heartbeat-dead-paths.test.ts:253-258`, the cluster route block `server/routes.ts:19312-19590` |
| 2 | runtime + DB | staging: `bus_event_topic` labels and dependent columns; `cluster_bus_event` row count and size; the seed row; root crontab; `/var/log/dawntrader/out*.log` (15 files, 2026-10-06 02:36Z → 2026-10-07 01:15Z) |
| 3 | System Impact Map | 2 mentions (`:140`, `:180`) — **no component entry for the cluster bus's persist half** (gap; lands at Step 10) |
| 4 | System Manual | 12 mentions; `:7924` already flags the whole Phase 17.0 cluster system **"POTENTIAL LEGACY — REQUIRES INTENT CONFIRMATION … Flagged for Kyle review"**; `:11053` lists `cluster_bus_event` in the table inventory (**the System Manual is therefore APPLICABLE** — that row changes) |
| 5 | ledger | `#1159` (this), `#1158`/`#521` (2a0b), `#1163` (2a0e), `STORAGE_POLICY.md:51` (the row 2a0b added), `DELETED_COMPONENTS_LOG` 2a0b entry — no prior decision to keep the persist half |
| 6 | provenance | `7b22bcd04` 2025-10-18 (the bus + table), `4556a834e`/`cde62eb56` 2025-10-19 (the `health_alert` publishers in `paper_sim_heartbeat.ts`), `4a17ca8f4` (2a0b removed them); the Phase-17 directive in `attached_assets/` names the table "for audit" |

## A. AUDIT

**A1 — readers of `cluster_bus_event` / `clusterBusEvent` / its types (§9.5(a-ii)), tree-wide at the ref, docs excluded.** Live code: `cluster-bus.ts:3-5,48` (the writer and its imports) · `shared/schema.ts` (definition, insert schema, two types) · `b75-retention-sweep.ts:148-153` (the 2a0b registration) · `b-engine-heartbeat-dead-paths.test.ts:253-256` (2a0b's fence asserting that registration) · comments in `active-engine-heartbeat.ts:21` and `cluster-bus.ts:77-78`. Non-code: the 2026-04-22 initial schema and the 2a0b seed/rollback migrations (history, untouched), `migrations/0000_*` + `meta/*_snapshot.json` (the retired drizzle-kit lane, history), one `backups and data dumps/` SQL dump, and Replit-era `attached_assets/` directives. **Zero readers.** The only ever-reader was `auto_test_harness.ts`, deleted in 2a0b.

**A1b — the indirect forms (a claim-only second reader, then re-derived by me at the ref).** `server/services/schema-audit.ts:45-80` reads table names from `information_schema` AND from the schema module's exports, and `COUNT(*)`s each — so it would touch the table. **Harmless to this batch:** after the drop and the schema removal both sides stop listing it together. **And unreachable:** its only importer is `provenance-governance.ts:12`, and `provenance-governance` is imported by nothing in `server/`, `client/`, `shared/` or `scripts/` (control: `active-engine-service` 25 files, same command form). `xstock-ohlc-cache.ts:388`'s `sql.raw(tableName)` is a named-constant OHLC table (B.4), not this one. The retention sweep's subquery (`:937-944`) is the 2a0b registration plan item 3 removes. Outside the repo (Supabase dashboard, manual `psql`, host backups) cannot be ruled out by a code read — a dropped table is recoverable only from the rollback's empty recreate plus backups, which is acceptable for a log with zero readers.
REVIEWER: claim-only · "what else could read `cluster_bus_event`, including indirect and runtime-assembled forms?" · HIT on `schema-audit.ts` (generic table iterator) + lead on `xstock-ohlc-cache.ts` · re-derived y (both above).
**§9.4 — a find outside this batch:** `schema-audit.ts` + `provenance-governance.ts` are a zero-importer pair (rule 18). DISPOSITION: added to `B-ROOT-DUPLICATE-SCANNER-RETIRE` (row 2a0d, at Step 1 with Langston) as an item — that batch already retires unreferenced code with an importer census, so the census method and the record are the same.

**A2 — writers.** Exactly one: `publish()`'s persist branch (`cluster-bus.ts:46-59`), gated on seven `persistTopics`. Its live publishers sit in the Phase 17-22 layer (§A6); the live engine traffic never enters `publish()` (Langston C3: `trading-state-sync.ts:345` and `active-engine-service.ts` use the raw `emit`, off-enum topics, consumed by `server/jobs/feed-integrity-auto-check.ts:324`).

**A3 — where `health_alert` went (C4 ask).** Its only publisher was `paper_sim_heartbeat.ts` (added `4556a834e`, extended `cde62eb56`), later renamed to `active-engine-heartbeat.ts`; 2a0b (`4a17ca8f4`) removed all three `publish('health_alert', …)` sites. After 2a0b deploys, nothing publishes that topic.

**A4 — the sweep's failure modes (C1 ask).** Two different shapes, measured in the code:
- **A missing SEED aborts the WHOLE sweep.** `loadConfig` reads every registered constant and `throw`s on a missing one (`:189-196`) before any table is touched.
- **A missing TABLE fails that table only.** `sweepPlainTables` wraps each table in its own `try/catch` (`:831-972`): a `relation does not exist` increments `failed`, raises a per-table `warning` alert, and moves on; the run ends `DONE … plain_failed=N` and exits non-zero (`:1142-1156`).
⇒ **The deploy must never leave "entry present, seed absent".** The sweep runs from SOURCE at **02:15 UTC** (`15 2 * * *` in root's crontab; staging is UTC, measured) via `npx tsx`, and `dt-deploy` changes the source, builds, then migrates within minutes. **So a deploy that does not straddle 02:15 UTC lands the code and the migration together from the sweep's point of view.** The remaining hazard is a FAILED migration after the checkout: then the sweep reads source with no entry, and the seed and table still exist — the safe direction (the table is simply not swept).

**A5 — the topic type (C2).** `bus_event_topic` exists in Postgres with eight labels, and exactly one column uses it (`cluster_bus_event.topic` — measured on staging). `BusEventTopic` is derived from the `pgEnum` (`schema.ts:4647`); its only importer is `cluster-bus.ts` (`publish`/`subscribe`/`unsubscribe` signatures). **Pick: DROP the Postgres type with the table, and replace the derived type with a plain TypeScript union of the same eight labels, kept in `shared/schema.ts` so the import path does not move.** Reason: once the table goes, a `pgEnum` declaration with no column is exactly the lingering legacy rule 18 forbids, and keeping a Postgres type for a TypeScript signature is backwards. No outcome leaves a `pgEnum` declaring a type that no longer exists: the declaration and the type leave in the same commit and deploy.

**A6 — the cluster layer is LIVE (the objective-3 census, shared with 2a0e, run once; hook sites, not exports).**
| service | how it is reached | runtime evidence (logs 2026-10-06 02:36Z → 2026-10-07 01:15Z) |
|---|---|---|
| `task-router` | `autonomy-scheduler.ts:1277` scheduled job `cluster_rebalance` → `taskRouter.rebalanceStuckTasks()`; `autonomy-controller.ts:466` delegation checkpoint; routes `/cluster/status`, `/queue`, `/results`, `/rebalance` | `Running cluster rebalance` **137 lines**; `Evaluating cluster delegation` **24** (control: `AutonomyScheduler` 1,140) |
| `cluster-registry` | `autonomy-scheduler.ts:1246` job `cluster_heartbeat`; `autonomy-controller.ts:467`; `task-router.ts:13`; routes `:19319/:19343/:19411` | `ClusterRegistry` tag 0 — **not settled**: the job's own log text is a 2a0e item |
| `circuit-breaker` (per-node, not the kill switch) | routes `/cluster/circuit-breaker`, `/reset/:nodeId` | — |
| `learning-coordinator`, `model-consistency-manager`, `cross-domain-reasoning` | routes `/learning/*` (`:19510-19580`); `cross-domain-reasoning.ts:3` imports the coordinator | — |
| UI | `client/src/pages/systems.tsx` → `enhanced-system-monitoring.tsx:40-41` → `cluster-tab.tsx` (status, nodes, queue, rebalance, circuit-breaker, audit-logs) and `learning-network-tab.tsx` (all six `/learning/*`) | — |
⚠️ **Instrument note:** the first caller search returned zero for every route because Git Bash rewrites an argument starting with `/` into a Windows path; the control (`/trading/status`, a path the client certainly calls) also returned zero, which exposed it. Re-run with `MSYS_NO_PATHCONV=1`: control 5 files, results above.
**What this means for THIS batch:** nothing. Removing the persist branch leaves `emit` untouched, so every subscriber above still receives every event. **What it means for 2a0e:** the question is no longer "reachable?" — it runs every cycle and has UI — but "what does it do in a single-server system, and should it". The System Manual's own flag (`:7924`) is the standing record of that question.

**A7 — blast radius of removing the write.** Callers of `publish` are unaffected (it still resolves; the `await` returns at once). Tests: 2a0b's fence (`:253-256`) asserts the registration and must invert. The tsc baseline holds no `cluster-bus.ts`/`schema.ts` cluster-bus entries to move (checked at Step 3 by the gate).

## B. PLAN (each item points at its finding)
1. **`cluster-bus.ts`** — remove the persist branch, `persistTopics`, and the `db`/`clusterBusEvent`/`InsertClusterBusEvent`/`ClusterBusEvent`/drizzle imports; `publish` keeps its signature and emits. Header comment: the bus is in-memory only. *(A1, A2, A7)*
2. **`shared/schema.ts`** — remove `clusterBusEvent`, `insertClusterBusEventSchema`, `InsertClusterBusEvent`, `ClusterBusEvent`, `busEventTopicEnum`; `BusEventTopic` becomes a plain union of the same eight labels. *(A5, C2)*
3. **`b75-retention-sweep.ts`** — remove the `cluster_bus_event` entry. *(A4, C1)*
4. **Migration `2026-10-0x-b-cluster-bus-persist-remove.sql`** (registered in `MANIFEST.txt`): `DELETE` the `data_lifecycle / cluster_bus_event.hot_retention_days` row; `DROP TABLE IF EXISTS cluster_bus_event`; `DROP TYPE IF EXISTS bus_event_topic`. **Rollback** (tracked in git): `CREATE TYPE` with the eight labels, `CREATE TABLE` + its three indexes exactly as `2026-04-22-initial-schema.sql:1753-1760`, `:13758-13772` (plus the primary key), and re-`INSERT` the seed; its header says **revert the code first**, same order as 2a0b's rollback. *(A4, C1)*
5. **Tests** — new `b-cluster-bus-persist-remove.test.ts`: `publish` emits to a subscriber and makes no DB call (mocked `db` asserted untouched); fences: `cluster-bus.ts` imports no `db`, `schema.ts` has no `cluster_bus_event`/`bus_event_topic`, the sweep has no `cluster_bus_event` entry, the migration is in the manifest. **Invert 2a0b's fence** (`b-engine-heartbeat-dead-paths.test.ts:253`) to assert the entry is ABSENT (the 2a0b seed file stays as history). Mutation check: restoring the persist branch fails the new test. *(A1, A7)*
6. **Deploy constraint** — rides the deploy AFTER 2a0b's (Langston Q2 (a)); **not within 02:00-02:30 UTC**. *(A4)*
7. **Step 7** — on staging after deploy: `\dt cluster_bus_event` and the type are gone; the next 02:15Z sweep log shows every other table's line, **no** `cluster_bus_event` line, zero `missing … data_lifecycle` lines, `plain_failed=0`; the live path still runs (an engine flip produces the feed-integrity `engine_state_changed` handling line). *(A2, A4)*
8. **Step 10** — System Impact Map: a cluster-bus component entry (in-memory only, its live raw-`emit` users, the Phase 17-22 publishers); System Manual `:11053` row removed and `:7924` annotated with the 2a0e home; `STORAGE_POLICY.md:51` row removed (table gone); `DELETED_COMPONENTS_LOG` + `_archive/deleted-code/` for the table definition and persist branch; `#1163` amended per §A6. *(A6, sources 3-4)*

No item is UNAUDITED.

## C. HONEST LIMITS
- The `cluster_heartbeat` job's runtime presence is not settled (its log tag returned 0); it does not bear on this batch, and it is 2a0e's first read.
- 107 MB / 269,276 rows (staging, measured) is the table this batch drops. The heartbeat writer that produces almost all of it stops with 2a0b's deploy.
