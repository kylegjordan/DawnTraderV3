# B-CLUSTER-BUS-PERSIST-DISPOSITION — Step-4 change list (Langston code review)

**Batch:** `B-CLUSTER-BUS-PERSIST-DISPOSITION` · `#1159` · sprint row 2a0c · owner CC-B.
**Graded ref:** commit `b523c86bfe1586b98ac640eebe7d560b1fe1f028` on `origin/migration/aws-supabase` (one commit, 8 paths incl. 2 migrations).
**CI:** run recorded in the dispatch post.

## DISPATCH HEADER
**(i) CHANGE-CLASS:** `non_architecture` (scope header; confirmed against `CLASS_DOCSET` at Step 1, SIM judged applicable).
**(ii) DOC SET for `non_architecture`, at this ref:**
| document | state |
|---|---|
| batch `SCOPE` | present — `Scope Files/B_CLUSTER_BUS_PERSIST_DISPOSITION_SCOPE.md` r2 (§4a your Step-1 conditions) |
| batch `PRE_AUDIT` | present — `Scope Files/B_CLUSTER_BUS_PERSIST_DISPOSITION_PRE_AUDIT.md` (plan item 4 carries your Step-2 condition 1) |
| `SYSTEM_IMPACT_MAP.md` | OWED at Step 10 — a cluster-bus entry (in-memory only; the live raw-emit path; the Phase 17-22 publishers) |
| `SYSTEM_MANUAL.md` | OWED at Step 10 — `:11053` table-inventory row removed; `:7924` annotated with row 2a0e |
| `STORAGE_POLICY.md` (T2) | OWED at Step 10 — the `:51` `cluster_bus_event` row removed (table gone) |
| `DELETED_COMPONENTS_LOG.md` (T2) | OWED at Step 10 — table, enum, persist branch, retention entry; archive copies |
| `RUNNING_ISSUES.md` (T2) | `#1163` amended twice (Step 2); `#1159` closes at Step 11 |
| `COMPLETION_REPORT`, `BATCH_CATALOG`, `PHASE_HISTORY`, plan, task list, MEMORYs | Steps 10-11 |
**(iii) STEP-2 REFERENCE:** the pre-audit, plan items 1-8, and your Step-2 PROCEED (condition 1 = rollback order).

## 1. Plan item → change
| plan item | change |
|---|---|
| 1 | `server/services/cluster-bus.ts` — `publish()` keeps its signature and only `emit`s; `persistTopics`, the persist branch and the `db` / `clusterBusEvent` / two type imports removed; header says in-memory only and points at `#1163` |
| 2 | `shared/schema.ts` — `busEventTopicEnum`, `clusterBusEvent`, `insertClusterBusEventSchema`, `InsertClusterBusEvent`, `ClusterBusEvent` removed; `BusEventTopic` is a plain union of the same eight labels (C2) |
| 3 | `server/scripts/b75-retention-sweep.ts` — the `cluster_bus_event` entry and its comment removed |
| 4 | `drizzle/migrations/2026-10-07-b-cluster-bus-persist-remove.sql` (in `MANIFEST.txt`): `DELETE` the seed, `DROP TABLE IF EXISTS cluster_bus_event`, `DROP TYPE IF EXISTS bus_event_topic` — **no `CASCADE`**. Rollback `…-rollback.sql` (tracked, not in the manifest): recreates the type (labels byte-copied from `2026-04-22-initial-schema.sql:205-214`), the table, its primary key and three indexes, re-inserts the seed, deletes the `_migrations` row; **header: RUN THIS FIRST, THEN REVERT THE CODE** (your condition 1) |
| 5 | `server/tests/unit/b-cluster-bus-persist-remove.test.ts` (6 tests) + 2a0b's fence inverted |
| 6 | deploy constraint — in the migration header and the commit message |
| 7-8 | Step 7 / Step 10 |

## 2. Load-bearing hunks
**`publish` (after):**
```ts
  async publish(topic: BusEventTopic, payload: Record<string, any>, sourceNode?: string): Promise<void> {
    this.emit(topic, payload, sourceNode);
  }
```
**Forward migration body:** `DELETE FROM module_constants WHERE module_name = 'data_lifecycle' AND constant_name = 'cluster_bus_event.hot_retention_days'; DROP TABLE IF EXISTS cluster_bus_event; DROP TYPE IF EXISTS bus_event_topic;` in one transaction, `lock_timeout 5s`.
**Why the forward order is safe (A4):** `dt-deploy` checks out (the entry leaves) → builds → migrates (the seed leaves), so between the two the seed is an inert orphan; the sweep reads source at 02:15 UTC, so a deploy outside 02:00-02:30 UTC cannot straddle it.

## 3. Tests and their honest strength
- `publish` delivers to a subscriber for a formerly-persisted topic (`task_completed`) with a `db` mock that throws on any property access, and the mock records zero touches; `unsubscribe` stops delivery.
- Fences (source text): no `../db` import / `clusterBusEvent` / `insert(` in the bus; no `pgTable("cluster_bus_event"` / `pgEnum("bus_event_topic"` in the schema and `BusEventTopic` is a union; no `cluster_bus_event` in the sweep; the removal migration in the manifest and its rollback not; the type drop has no `CASCADE` (code form — the header names the word on purpose; first draft matched the comment and was narrowed); the rollback carries the run-first instruction and the seed.
- 2a0b's fence now asserts the entry is ABSENT and both the 2a0b seed and this removal are in the manifest (located at `:269-276` at this ref).
- **Mutation:** adding `CASCADE` to the type drop fails the fence (run, restored). **Run:** 28/28 across both files. **tsc baseline 337 = 337.** These are reported fact.
- **Not tested:** the migrations against a database (no DB in CI) — Step 7 reads the table and type gone on staging and the next sweep's line set.

## 4. Residual
- The table's 269k rows go with the `DROP`; with this batch, 2a0b's first-sweep evidence line for `cluster_bus_event` exists only if 2a0b deploys at least one 02:15 UTC sweep BEFORE this batch (your Q2 (a)).
- `#1163` (row 2a0e): the Phase 17-22 layer runs (`cluster_rebalance` ~144/day) and writes nothing.

## 5. Ask — the deploy sha today
The review branch is linear: **any sha at or after this commit includes this batch.** Today's 15:53 UTC deploy carries 2a, 2a0, 2a0h and 2a0b (all approved). Two options: **(a)** deploy at `b523c86bf^` (`0c8ef5da2`) — this batch and anything pushed after it waits for the next deploy, as your Q2 (a) intended; **(b)** if you approve this batch at Step 4 before the deploy, it rides the same deploy — 2a0b's sweep never runs against the table (it simply drops), so 2a0b's Step-7 hard gate is read on the OTHER tables' lines only. I recommend **(a)**: it keeps your sequencing and 2a0b's evidence intact; the cost is that any later commit by another session also waits a deploy.

## Step-4 VERDICT — Langston, recorded by CC-C at the 2026-10-10 release (CC-B was not running)
Langston gave this verdict in Discord at 11:57:24Z (message `1558448355061792849`) and RE-AFFIRMED it on substance at 14:16:05Z, after a separate stateless run (12:02Z) had read only this file, found no verdict here, and said hold. He ruled that the 12:02 finding (the record did not carry the verdict) was real and its HOLD vacated; nothing withdrawn, no rollback. Shipped in release `ad01f5339b558ee968a7686d719e98b66e5fd01d` (2026-10-10T11:59:29Z, `RELEASE_DEPLOY_2026-10-10_PLAN.md`). Step 7 is CC-B's.
- **APPROVED at `9ab39a45a`.** The §5 ask (protect 2a0b's first-sweep evidence) is discharged by elapsed time: the 10-08 02:15Z sweep's 18 tables were enumerated at 2a0b's close, `cluster_bus_event` the 18th, and 2a0b is closed. **Migration safety, measured by Langston on staging:** `cluster_bus_event.topic` is the only column on `bus_event_topic`; DROP TABLE precedes DROP TYPE in one transaction; zero FKs; zero dependent views; the enum carried 8 labels; the `data_lifecycle` seed row is present. **After the deploy (re-derived 14:16Z):** zero production references to `cluster_bus_event` / `clusterBusEvent` / `bus_event_topic` at the deployed sha (3 non-test hits, all comments; positive control `clusterBus` finds live subscribers, including the kill-switch listener at `trading-state-sync.ts:545`); the table and enum are gone. Row count at the drop: 79,387 (85,153 on 10-08; 2a0b put it on the nightly sweep). **Rollback is now the strictly worse direction:** at `0c8ef5da2`, `cluster-bus.ts:48` inserts into the dropped table, so a code rollback restores a writer pointing at a missing relation.
