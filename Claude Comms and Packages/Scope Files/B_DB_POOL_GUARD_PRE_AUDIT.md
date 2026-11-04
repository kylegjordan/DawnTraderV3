# B-DB-POOL-GUARD — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN — r1 (2026-11-04)

change-class: architecture · **Owner:** CC-A (OLD Claude) · **Issues:** `#1239`, `#1062` · **Scope:** `B_DB_POOL_GUARD_SCOPE.md` r2, approved by Langston 2026-11-04 with one Step-2 condition (OBJ-3b's mechanism; answered in F3).

## 0. PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED:** OBJ-3's database end is `57P05`. **NOW:** `25P03 terminating connection due to idle-in-transaction timeout` (FATAL). **REASON:** measured on staging (F3); `57P05` is the idle-SESSION timeout.
- **PREVIOUSLY STATED:** OBJ-3b is "a startup parameter". **NOW:** it must go through `options: '-c transaction_timeout=…'`; as a plain config key it does nothing. **REASON:** Langston's census of pg 8.13.1 (no branch) and my run (a 3.4 s transaction completed with the key set to 2000 ms).
- **PREVIOUSLY STATED:** a transaction timeout "bounds" a transaction. **NOW:** it TERMINATES the connection (`25P04`, FATAL), unlike `statement_timeout`, which cancels one statement (`57014`, ERROR) and leaves the connection usable. **REASON:** F3.
- **PREVIOUSLY STATED:** two in-process pools. **NOW:** three (the weekend prewarm job's). **REASON:** Langston, OBJ-1 ruling; built as OBJ-1c.
- **PREVIOUSLY STATED (OBJ-1, `d6ce6b042`):** the pool listener stops an ended connection crashing the app. **NOW:** only an IDLE one; an ended CHECKED-OUT one still crashed it. **REASON:** F1, measured; built as OBJ-1b.

## 1. Sources read
| # | source | what was read |
|---|---|---|
| 1 | code at the ref | `server/db.ts`; `node_modules/pg-pool/index.js` 3.7.0 (`makeIdleListener :51-62`, `_acquireClient` listener removal, `_release`, `query()`'s `once('error')`); `node_modules/pg/lib/client.js` 8.13.1 (`:434-443` startup params, `_handleErrorEvent`); `drizzle-orm/node-postgres/session.js:138-150`; the seven `.transaction(` bodies; `routes.ts:1739-1786` (settings save); `task-queue.ts:87-158`; `scripts/b-new-34b-prewarm-snapshot.ts:259-305`; `qd-probe-service.ts:128`; `drift-dashboard-aggregator.ts:800-953`. |
| 2 | runtime + database | staging, own test client/pool (`application_name cc-a-pool-guard-test`), 2026-11-04 ~22:00-22:40Z: `pg_settings`, `pg_db_role_setting`, `pg_stat_activity`, `pg_stat_statements`, and the termination tests in F1/F3; `error.log` (18:16:23Z `57P01`). |
| 3 | `SYSTEM_IMPACT_MAP.md` | the `server/db.ts` row (`:1261`) and the B-NEW-40 section (`:1366-1425`): pool config, "23 consumers", the TEC dependency. It is **silent** on the pool's error handling and on transactions — a gap OBJ-8 fills. |
| 4 | `SYSTEM_MANUAL.md` | the database chapter (`:10974-10995`, `:11405-11412`, `:11517-11518`) still describes the Neon serverless pool — **contradicts the code**; also `:49`, `:9381`, `:11290`, `:11361`, `:11366`, `:11432`. OBJ-8. |
| 5 | ledger + reports | `#1239`, `#1062`, `#1037` am.1-4, `#705` (and its 2026-10-17 update), `B_NEW_40_COMPLETION_REPORT.md`, `B_XSTOCK_BAR_AVAILABILITY_PRE_AUDIT.md` R5/R5d/R6, sprint row 16a. Nothing here is a reversed decision: B-NEW-40 set the client side deliberately and named "raise max" as the saturation answer, which §4 of the scope declines with its reason. |
| 6 | `bridge/canonical/` | one mention: `DawnTrader_Complete_Project_History.md:89` "PostgreSQL (Neon serverless), Drizzle ORM". **No coverage of pool sizing, timeouts or error handling** — recorded as a finding of absence of intent, not of a decision. |

## 2. Census

**Entry points that create database connections in the app process (repo-wide, tests excluded):** exactly **three** `Pool` builders — `server/db.ts:78` (the app pool, `dawntrader_main`, max 10), `server/services/crew-coordination.ts:92` (crew board, max 2, already bounded and listened), `scripts/b-new-34b-prewarm-snapshot.ts:259` (weekend prewarm, max 1, run in-process by the session-lifecycle controller). Pinned by the census test in `b-db-pool-guard.test.ts` (the list is its own positive control). `server/scripts/*` jobs use their own `Client` and run from cron, outside the app process.

**How app code takes a connection:** `db.*` calls go through `pool.query()` (one checkout per statement, guarded by pg-pool's `once('error')`); every `db.transaction(...)` takes a client with `pool.connect()` (drizzle `session.js:138`) and holds it for the whole transaction with no error listener — the crash path in F1. **No app code calls `pool.connect()` or `pool.query()` directly** (grep for the raw pool import and for `pool.(query|connect)` outside `db.ts`: none).

**The seven transaction sites, each read at its body and its catch:**
| site | what it holds | any non-database wait inside? | on a thrown error (statement cancel, idle end, acquire limit) | verdict |
|---|---|---|---|---|
| `xstock-bar-availability.ts:45` `boundedTransaction` (6 callers) | admission / projection / certify / repair / handoff | no | its own 20 s `SET LOCAL`; R5d retries a projection timeout by substring `canceling statement due to statement timeout` (`ohlc-batch-writer.ts:153-162`) | bounded; **coupled to F3** |
| `drift-dashboard-aggregator.ts:952` `safeCount` | one count, 4 s `SET LOCAL` | no | caught, the panel shows "timed out" | bounded |
| `availability-aggregator.ts:179` | a read-only aggregation (`SET TRANSACTION READ ONLY` when previewing) | no | rejects to the xStock scanner path, which already has a 25 s tick ceiling | acceptable |
| `availability-aggregator.ts:568` | records a settled window manifest | no | rejects to `persistSettledXstockWindowManifest`'s caller; atomic, nothing half-written | acceptable |
| `task-queue.ts:90` | `SELECT … FOR UPDATE SKIP LOCKED` + mark `in_progress` | no | **rolls back, so the row stays `pending` and the lock is released; the catch (`:156-158`) logs and returns `null`; the next fetch picks the task up again.** This is a database queue: the task is **retried from the table, not re-buffered in memory, and never vanishes.** | acceptable |
| `portfolio-anchor-service.ts:148` | read balance, insert anchor event, update balance | no | atomic: neither the event nor the balance lands; throws to its caller (paper re-anchor; the live snap is Phase 21) | acceptable |
| `storage.ts:859` `upsertGuardrailsV2WithAudit` | settings save + its audit rows | no (`buildAudit` is synchronous) | atomic; the only caller, `routes.ts:1739`, returns **HTTP 500 `SERVER_ERROR` with the message**, so the operator sees the save failed and nothing was saved | acceptable |

**No transaction body waits on anything outside the database**, so OBJ-3's idle-in-transaction end can only hit a connection whose owner has gone (the 11-04 leak), never legitimate work. Every site is atomic, so a thrown error never leaves half a write.

## 3. Findings

**F1 — A connection ended while checked out crashed the process, with OBJ-1 in place. MEASURED, fixed as OBJ-1b (`4d9019f19`) and generalised as OBJ-1c (`7043a582e`).** Test pool on staging, transaction held, server ends it (`25P04`), release after 800 ms: without a client listener, exit 1 ("Unhandled 'error' event"); with OBJ-1b, exit 0, one log line, next query on a fresh connection. Released immediately, the error lands after release and the pool listener catches it. This path exists today for any server-side end during a transaction (operator terminate, database restart, network drop), independent of this batch. **Plan: P1.**

**F2 — A third in-process pool had no listener** (Langston). **Plan: P1** (OBJ-1c).

**F3 — The three server-side limits behave differently, and only one leaves the connection alive. MEASURED** (own test client, each with a control in the same run):
| setting | how it must be set | what the app receives | connection after |
|---|---|---|---|
| `statement_timeout` | startup param (`client.js:434`) | `57014` ERROR `canceling statement due to statement timeout` | alive; transaction aborted until rollback |
| `idle_in_transaction_session_timeout` | startup param (`client.js:440`) | `25P03` FATAL `terminating connection due to idle-in-transaction timeout` | **ended** |
| `transaction_timeout` (PG 17.6) | **only** `options: '-c transaction_timeout=…'` (plain key: no effect, measured) | `25P04` FATAL `terminating connection due to transaction timeout` | **ended** |
**Consequences:** (a) OBJ-3 and OBJ-3b end connections, so OBJ-1b must be DEPLOYED before either. (b) R5d's retry matches only the `statement_timeout` text, so a `transaction_timeout` that fires on an xStock projection would be classed permanent and drop the bars (Langston's point, now measured: the text differs). ⇒ **`transaction_timeout` must sit clearly ABOVE the longest statement bound inside any transaction (the xStock 20 s `SET LOCAL`, the session `statement_timeout`)**, so a statement is always cancelled first and the transaction limit only catches the many-short-statements case it exists for. Recorded beside both constants when built. (c) `lock_timeout` is not needed: a lock wait counts toward `statement_timeout`, which is how R5a's 20 s already cut the 11-04 lock queue; stated so it is not left inferred.

**F4 — The statement-duration distribution cannot be read from the database's statistics.** `pg_stat_statements` (reset 2026-03-30; 4,794 statements, 251 million calls for the `postgres` role) gives mean, stddev and **max** per statement. 332 statements have a max above 10 s and 162 above 20 s, including plain inserts (ticker snaps 36-59 s, `context_bridge_log` 112 s) — these maxima are incident tails (statements that ran on after the client gave up), and the role is shared with ad-hoc session queries. **No figure for how many app statements fall between 20 and 30 s is recoverable from it.** ⇒ the value for OBJ-2 (and the risk in scope §6 that it raises the writers' drop rate) needs our own instrument first. **Plan: P2 before P3.**

**F5 — `qd-probe-service.ts:128` runs 8 concurrent queries on the main pool** (8 of 10 slots in a burst). Decided in P5.

**F6 — The Drift Dashboard's data-archive panel holds about one slot continuously while open** (5 serial whole-table counts, no timeout, 30 s refetch; scope OBJ-6). Built as designed (B70: "partitioned tables are small"); the tables grew. **Plan: P5.**

**F7 — The System Manual's database chapter describes a pool that no longer exists** (Neon). **Plan: P7.**

## 4. Plan (each item points back at its finding)
| # | item | from | notes |
|---|---|---|---|
| **P1** | OBJ-1, 1b, 1c — the listeners, one shared module, census test. **Built** (`d6ce6b042`, `4d9019f19`, `7043a582e`); Langston PROCEED on `d6ce6b042`, gate on the rest sent. Deploy, then the Step-7 check: end ONE `dawntrader_main` backend the pool holds (right after a query, inside the 30 s idle window), read `error.log` (the undated file) for one guard line, PM2 restart count unchanged. | F1, F2 | must be live before P3's ending limits |
| **P2** | **Measure first.** A per-pool summary line once a minute from `pool.on('acquire'/'release')` timestamps: checkouts, acquire-wait max and p99, hold-time max and p99, and the count of holds over 10, 20 and 25 s, per pool label. In-memory, no database writes, one line a minute. Observe at least 48 h including a US weekday session. | F4 | gives OBJ-2's value, the longest legitimate transaction for OBJ-3b (Langston: named with its duration, not "none found"), and the slot-wait profile for OBJ-4 |
| **P3** | Set the values from P2's data, in the pool config: `statement_timeout` (below 30 s; scope start 25 s), `idle_in_transaction_session_timeout` (start 60 s), `options: '-c transaction_timeout=…'` (above every statement bound by a margin, F3b), `connectionTimeoutMillis` (sized for the slot wait; the handshake cost stated in seconds). If P2 shows any writer statements between the chosen bound and 30 s, the trade-off (more drops until 16a's re-buffering) goes to Kyle with the count. | F3, F4, scope §6 | one commit, Step 4, then Step 7 per scope OBJ-2/3/3b/4 |
| **P4** | OBJ-5: two self-clearing alerts with their own keys — callers waiting past a bound (from the pool's counts), and any `dawntrader_main` backend idle in a transaction past a bound (a one-connection client outside the pool). Per-window occurrence counts, never a level (Langston, OBJ-1 ruling); separates ten-at-once by an operator from a flap; resolve, never ack; clear edge tested; forced test of each on staging. Consumes the OBJ-1 counters. | F1, F3 | |
| **P5** | OBJ-6: a diagnostic pool (max 2, own `application_name`, own short statement bound, own acquire limit) for the two Drift Dashboard panels; `qd-probe-service` decided from P2's data (move with a concurrency of at most 2, or stay with a cap). | F5, F6 | server code only |
| **P6** | OBJ-7: `#1062`'s disposition recorded. | scope | |
| **P7** | OBJ-8 governance: System Manual Neon sweep and the database chapter rewritten; SIM pool entry; ledger entries. | F7 | Step 10 |

**UNAUDITED:** nothing in the plan lacks a finding. The VALUES in P3 are deliberately not chosen here; they come from P2.

## 5. In plain language
The audit found that the app could crash in a second way: when the database closes a connection the app is in the middle of using. That fix, and the one for a third pool Langston spotted, are built and in review. It also found that the database's own statistics can't tell us how long the app's statements normally take, only the worst cases from past jams. So the plan is to measure first for two days, then set the time limits from those numbers. After that come the alarms, and moving the heavy dashboard reads onto their own connections. One of the limits closes the connection outright instead of just stopping the statement, so it has to be set above ANALYST's 20-second limit, or their retry logic would stop working.
