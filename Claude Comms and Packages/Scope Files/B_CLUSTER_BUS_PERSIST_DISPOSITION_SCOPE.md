# B-CLUSTER-BUS-PERSIST-DISPOSITION — SCOPE (Step 1, r2 — Langston PROCEED with C1-C5, 2026-10-07)

change-class: non_architecture

**Class confirmed against `CLASS_DOCSET` (`scripts/governance-checker/config.mjs:140-145`, Langston's non-blocking flag):** `non_architecture` requires scope, pre-audit, completion report, `BATCH_CATALOG` and `PHASE_HISTORY`, and carries the System Impact Map and `DELETED_COMPONENTS_LOG` as CONDITIONAL. This batch drops a table and a persistence component, so the **System Impact Map update is judged APPLICABLE** and lands, as does `STORAGE_POLICY`; the System Manual is not touched (no strategy, regime, filter, pipeline or math). `architecture` would REQUIRE a System Manual entry with nothing to record — so the class stays.

**Issue:** `#1159` · **Plan row:** `SPRINT_TO_LIVE_PLAN` 2a0c (after 2a0b) · **Owner:** CC-B · **Origin:** Langston, `B-ENGINE-HEARTBEAT-DEAD-PATHS` Step 2 §13 (2026-10-06).
**Read at:** `origin/migration/aws-supabase` (head `975f5e14a`) + staging DB 2026-10-06.

## 0. What is there (measured)
1. **The persistence half of the cluster bus.** `ClusterBus.publish` (`server/services/cluster-bus.ts:38-62`) emits in memory, and for seven `persistTopics` (`node_status_change`, `rebalance_triggered`, `circuit_breaker`, `health_alert`, `learning_delta`, `model_sync`, `task_completed`) also inserts a `cluster_bus_event` row "for audit".
2. **After 2a0b it has no reader.** The only reader was `auto_test_harness.ts` (deleted in 2a0b); `getRecentEvents`/`cleanup` (deleted in 2a0b) had zero callers. 2a0b gives the table a 30-day delete-only retention and records it in `STORAGE_POLICY` as a write-only audit log.
3. **Its non-heartbeat writes are near-zero (C4 — Langston's measurement, enumerated by (topic, source_node), not source_node alone):** **22 rows** across four pairs, **newest non-heartbeat row 2025-11-06** — `walter_nlai/task_completed` 9 · `paper_sim_heartbeat/health_alert` 6 (2025-10-23 → 2025-11-06) · `live_trading/task_completed` 4 (a deleted stub) · `api_trigger/learning_delta` 3. Heartbeat rows: `active_engine_heartbeat` 242,538 (still writing until 2a0b deploys) and `paper_sim_heartbeat/task_completed` 26,611. Table: 269,174 rows, 107 MB. **Step 2 names where the `health_alert` publisher went** — the publisher list below carries none.
   **PREVIOUSLY STATED: 16 rows, newest 2025-10-21. NOW: 22, newest 2025-11-06. REASON: grouping by source_node alone dropped the six `paper_sim_heartbeat/health_alert` rows.** Remaining publishers on persisted topics (10 `publish` sites tree-wide): `routes.ts:19580` (`POST /learning/sync` → `learning_delta`), `circuit-breaker.ts:259` (`circuit_breaker`), `cross-domain-reasoning.ts:324`, `learning-coordinator.ts:210`, `model-consistency-manager.ts:182`, `task-router.ts:116/178/316/416` (`task_assigned` is NOT persisted; `task_completed` / `rebalance_triggered` are).
4. **The in-memory half stays — and the live path never enters `publish()` (C3 — Langston's measurement).** All nine live `clusterBus.publish` sites and both `clusterBus.subscribe` sites are inside the Phase 17-22 layer of §3. The genuinely live traffic uses the raw emitter with OFF-enum topics: `trading-state-sync.ts:345` `emit('engine_state_changed')` → `server/jobs/feed-integrity-auto-check.ts:324` `on(...)`, plus `active-engine-service.ts` `emit('active_engine_stopped')` and the dynamic imports in `active-engine-service.ts` and `safety-guardrails.ts:305`. ⇒ **removing the DB branch of `publish` cannot touch the live path.** The seam itself (a typed pub/sub whose live users bypass its types — why nobody noticed the persisted half had no readers) goes with §3's home.

## 1. Provenance (TIER 1)
| thing | introduced | intent | disposition |
|---|---|---|---|
| `cluster-bus.ts` + `persistTopics` + `cluster_bus_event` | `7b22bcd04` 2025-10-18 (Replit, *"Update system metrics and introduce cluster coordination services"*); `task_completed` added Phase 22 (*"Autonomous execution audit trail"*) | an audit trail for a multi-node cluster (Phase 17: node registry, rebalancing, a per-node circuit breaker) | **proposed (4): connected, should be removed** — an audit trail no one reads is not an audit trail; the system runs single-node |
| `circuit-breaker.ts` | Phase 17.5 | a per-NODE circuit breaker (`cluster_circuit_breaker` table) — **not the trading kill switch** | out of scope here — see §3 |

## 2. Objectives (recommended option: remove the persistence, keep the in-memory bus)
1. **Remove the database write** from `publish` (and `persistTopics`); the in-memory emit is unchanged. *Verify:* a unit test that `publish` emits to subscribers and writes nothing; a fence that `cluster-bus.ts` no longer imports `db`/`clusterBusEvent`.
2. **Drop the table** by migration, and remove 2a0b's retention registration + seed in the same deploy (the sweep's `loadConfig` reads every registered constant — the two must leave together). Rollback recreates the table (empty) and restores the seed. *Verify:* migration + rollback, the sweep's first post-deploy run logs every other table and no `cluster_bus_event` line, no `relation does not exist` error anywhere.
3. **Census at Step 2 (before any cut):** every reader of `cluster_bus_event` / `clusterBusEvent` tree-wide, including SQL in scripts, reports and the schema's exported types (§9.5(a-ii): a removed writer whose reader survives breaks silently).
**Alternative (keep):** leave the write-only audit log as 2a0b leaves it (30-day retention, `STORAGE_POLICY` entry). Cost today ≈ 16 rows a year; the cost is the standing "zero readers" question every future census will re-ask.

## 3. Found, not folded — the wider cluster layer (HOMED, C5)
The Phase 17-22 cluster-coordination services (node registry, task router, rebalancing, the per-node circuit breaker, learning/model sync) were built for a multi-node deployment we do not run. `HOME: B-CLUSTER-LAYER-REACHABILITY, owner CC-B, placed in SPRINT_TO_LIVE_PLAN at row 2a0e, after row 2a0d` (`#1163`). **Its census is THIS batch's objective-3 census, run once at Step 2:** per service — constructed at boot? entry point ever called? reached by any route, scheduler or engine? — censused at the HOOK SITE, not the export.

## 4. Blast radius
`cluster-bus.ts` (`publish` loses its DB branch), `shared/schema.ts` (the `clusterBusEvent` table, `insertClusterBusEventSchema`, `ClusterBusEvent`, `InsertClusterBusEvent` — **NOT `BusEventTopic` or `busEventTopicEnum`, C2**), `b75-retention-sweep.ts` (one entry), one migration + rollback. No trading behaviour.

## 4a. Conditions carried (Langston Step-1 PROCEED, 2026-10-07)
- **Q1 = REMOVE** (bug-taxonomy outcome 3). **Q2 = (a):** 2a0b ships as approved; this batch removes the registration, the seed and the table together, one deploy later.
- **C1 — atomic in one deploy:** the `PLAIN_RETENTION_TABLES` entry, the seed row and the `DROP TABLE` leave together; rollback restores all three in 2a0b's rollback order. **Step 2 reads the sweep's per-table error handling below `b75-retention-sweep.ts:206`** and states whether a `relation does not exist` on one plain table aborts the rest — if it does, the ordering inside the deploy is load-bearing.
- **C2 — `BusEventTopic` and `busEventTopicEnum` survive** (`publish`/`subscribe`/`unsubscribe` are typed on `BusEventTopic`; `busEventTopicEnum` has exactly one column, `cluster_bus_event.topic`). Step 2 picks: keep the Postgres type as a declared orphan, or drop it and replace the derived TS type with a plain union. **No outcome may leave a `pgEnum` declaring a type that no longer exists.**
- **C3 / C4** — folded into §0.4 / §0.3.
- **C5** — §3 homed at row 2a0e.

## 5. Questions for Langston (Step 1) — ANSWERED 2026-10-07
1. Remove — **YES** (§4a).
2. Order — **(a)**, the deploy after 2a0b's (§4a).
