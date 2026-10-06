# B-CLUSTER-BUS-PERSIST-DISPOSITION — SCOPE (Step 1, r1)

change-class: non_architecture

**Issue:** `#1159` · **Plan row:** `SPRINT_TO_LIVE_PLAN` 2a0c (after 2a0b) · **Owner:** CC-B · **Origin:** Langston, `B-ENGINE-HEARTBEAT-DEAD-PATHS` Step 2 §13 (2026-10-06).
**Read at:** `origin/migration/aws-supabase` (head `975f5e14a`) + staging DB 2026-10-06.

## 0. What is there (measured)
1. **The persistence half of the cluster bus.** `ClusterBus.publish` (`server/services/cluster-bus.ts:38-62`) emits in memory, and for seven `persistTopics` (`node_status_change`, `rebalance_triggered`, `circuit_breaker`, `health_alert`, `learning_delta`, `model_sync`, `task_completed`) also inserts a `cluster_bus_event` row "for audit".
2. **After 2a0b it has no reader.** The only reader was `auto_test_harness.ts` (deleted in 2a0b); `getRecentEvents`/`cleanup` (deleted in 2a0b) had zero callers. 2a0b gives the table a 30-day delete-only retention and records it in `STORAGE_POLICY` as a write-only audit log.
3. **Its non-heartbeat writes are near-zero:** 16 rows in twelve months, newest 2025-10-21 — `walter_nlai` 9 (`task_completed`), `live_trading` 4 (`task_completed`, a deleted stub), `api_trigger` 3 (`learning_delta`). Remaining publishers on persisted topics (10 `publish` sites tree-wide): `routes.ts:19580` (`POST /learning/sync` → `learning_delta`), `circuit-breaker.ts:259` (`circuit_breaker`), `cross-domain-reasoning.ts:324`, `learning-coordinator.ts:210`, `model-consistency-manager.ts:182`, `task-router.ts:116/178/316/416` (`task_assigned` is NOT persisted; `task_completed` / `rebalance_triggered` are).
4. **The in-memory half is live and stays** — e.g. `feed-integrity-auto-check.ts:324` subscribes to `engine_state_changed`; the active-engine service emits `active_engine_stopped` (a full subscriber census is a Step-2 item). Nothing in this batch touches emit/subscribe.

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

## 3. Found, not folded — the wider cluster layer
The Phase 17-22 cluster-coordination services (node registry, task router, rebalancing, the per-node circuit breaker, learning/model sync) were built for a multi-node deployment we do not run. Whether they are reachable at all, and whether they should exist, is a rule-18 question **larger than this batch** — Step 2 reports the reachability census; the disposition is a separate placed item if the census shows them dead.

## 4. Blast radius
`cluster-bus.ts` (`publish` loses its DB branch), `shared/schema.ts` (`clusterBusEvent` table + its types), `b75-retention-sweep.ts` (one entry), one migration. No trading behaviour.

## 5. Questions for Langston (Step 1)
1. Remove (recommended) or keep as the write-only log 2a0b establishes?
2. If remove: the drop rides the deploy AFTER 2a0b's (so 2a0b's registration exists to be removed), or 2a0b ships without the registration and this batch drops the table directly?
