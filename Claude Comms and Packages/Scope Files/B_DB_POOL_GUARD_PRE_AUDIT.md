# B-DB-POOL-GUARD — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN — r2 (2026-11-05)

change-class: architecture · **Owner:** CC-A (OLD Claude) · **Issues:** `#1239`, `#1062` · **Scope:** `B_DB_POOL_GUARD_SCOPE.md` r2, approved by Langston 2026-11-04 with one Step-2 condition (OBJ-3b's mechanism; answered in F3).

> **r1 → r2 (Langston CHANGES on r1 at `b1a5556`, two measured defects and the carrier, all folded):** C1 a whole-transaction limit cannot be ordered below the statement limit when a transaction has more than one statement (his psql run: FATAL at ~6 s inside a statement whose own 4 s clock had reached ~3 s) ⇒ **OBJ-3b is withdrawn at the pool level** (F3, scope r3). C2 pg-pool's `acquire` fires after the wait and carries no caller, so P2 needs an acquisition wrapper that timestamps the request and labels the checkout (P2). C3 stdout keeps ~26.5 h, so the per-minute line goes to `error.log` (14 daily files) in summable buckets (P2). Minor: §2's builder sentence; the prewarm builder is `:260` at the ref (it moved one line with OBJ-1c's import).

## 0. PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (r1 F3b):** a `transaction_timeout` set above every statement bound means a statement is always cancelled first. **NOW:** true only for a one-statement transaction; every one of the seven sites has more. **REASON:** Langston's measurement (C1); the transaction clock starts at BEGIN, the statement clock at each statement.
- **PREVIOUSLY STATED (r1 P2):** acquire wait can be read from `acquire`/`release`. **NOW:** it cannot; `acquire` fires at hand-over, after the wait, and no event marks a request entering the queue (pg-pool `:188/:208`). **REASON:** C2.
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

**Entry points that create database connections in the app process (repo-wide, tests excluded):** exactly **three** `Pool` builders *(FOUR since P5, `2de102383`: `server/db.ts` also builds the diagnostic pool `dawntrader_diag`, max 4 — the census fence checks every config per file)* — `server/db.ts:79` (the app pool, `dawntrader_main`, max 10), `server/services/crew-coordination.ts:92` (crew board, max 2, already bounded and listened), `scripts/b-new-34b-prewarm-snapshot.ts:259` (weekend prewarm, max 1, run in-process by the session-lifecycle controller). Pinned by the census test in `b-db-pool-guard.test.ts` (the list is its own positive control). `server/scripts/*` jobs use their own `Client` and run from cron, outside the app process.

**Other `Pool` builders outside the app process:** `scripts/*` one-off tools (`b-1-5-universe-audit`, `b-phase-a2-backfill`, `b4-dbs-15m-recompute`) build a `Pool` and nothing in `server/` imports them; `server/scripts/*` cron jobs build `Client`s and none of those files is imported by app code (Langston's second-route census). The prewarm builder is `scripts/b-new-34b-prewarm-snapshot.ts:260` at the ref.

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
**Consequences:** (a) OBJ-3 ends connections, so OBJ-1b had to be live first — it is (deployed `93cead7f2`, 23:13:58Z). (b) R5d's retry matches only the `statement_timeout` text (`ohlc-batch-writer.ts:161`), so a `transaction_timeout` ending an xStock projection would be classed permanent and drop the bars. ⛔ **r1's remedy (set it above every statement bound) is wrong for any transaction of more than one statement** (Langston C1, measured: `PGOPTIONS="-c transaction_timeout=6000 -c statement_timeout=4000"`, `pg_sleep(3)` then `pg_sleep(3.5)` ⇒ FATAL at ~6 s inside the second statement). All seven sites have more than one statement.
**DECISION (scope r3): OBJ-3b is WITHDRAWN at the pool level.** Why that leaves no hole TODAY: every transaction in the app runs a FIXED, small number of statements with no loop — `boundedTransaction` callers 1-4 statements plus its `SET LOCAL` (boot registration 4: `xstock-bar-availability.ts:157/158/166/177`; handoff 3: `:216/:279/:300`; certify, repair, admission, apply 1 each), `task-queue.ts:90` 2, `portfolio-anchor-service.ts:148` 3, `storage.ts:859` 2, `availability-aggregator.ts:179` 1-2, `:568` 2, `drift-dashboard-aggregator.ts:952` 2 — so OBJ-2's statement bound times that count already bounds each one, and OBJ-3 ends one whose owner went idle. **The per-transaction tool exists and is measured:** `SET LOCAL transaction_timeout = …` inside one transaction ended it at ~2 s (2,055 ms; `25P04`, connection ended), and the same work without it finished in 2,878 ms (control). **Residual, stated:** a FUTURE transaction with a loop of short statements is bounded by nothing until it sets its own `SET LOCAL transaction_timeout`; the xStock writer must never set one (R5d). Written into the System Manual chapter (P7) so it is found where a transaction is written.
(c) `lock_timeout` is not needed: a lock wait counts toward `statement_timeout`, which is how R5a's 20 s cut the 11-04 lock queue.

**F4 — The statement-duration distribution cannot be read from the database's statistics.** `pg_stat_statements` (reset 2026-03-30; 4,794 statements, 251 million calls for the `postgres` role) gives mean, stddev and **max** per statement. 332 statements have a max above 10 s and 162 above 20 s, including plain inserts (ticker snaps 36-59 s, `context_bridge_log` 112 s) — these maxima are incident tails (statements that ran on after the client gave up), and the role is shared with ad-hoc session queries. **No figure for how many app statements fall between 20 and 30 s is recoverable from it.** ⇒ the value for OBJ-2 (and the risk in scope §6 that it raises the writers' drop rate) needs our own instrument first. **Plan: P2 before P3.**

**F5 — `qd-probe-service.ts:128` runs 8 concurrent queries on the main pool** (8 of 10 slots in a burst). Decided in P5.

**F6 — The Drift Dashboard's data-archive panel holds about one slot continuously while open** (5 serial whole-table counts, no timeout, 30 s refetch; scope OBJ-6). Built as designed (B70: "partitioned tables are small"); the tables grew. **Plan: P5.**

**F7 — The System Manual's database chapter describes a pool that no longer exists** (Neon). **Plan: P7.**

## 4. Plan (each item points back at its finding)
| # | item | from | notes |
|---|---|---|---|
| **P1** | OBJ-1, 1b, 1c — the listeners, one shared module, census test. **Built** (`d6ce6b042`, `4d9019f19`, `7043a582e`); Langston PROCEED on `d6ce6b042`, gate on the rest sent. Deploy, then the Step-7 check: end ONE `dawntrader_main` backend the pool holds (right after a query, inside the 30 s idle window), read `error.log` (the undated file) for one guard line, PM2 restart count unchanged. | F1, F2 | must be live before P3's ending limits |
| **P2** | **Measure first, at the acquisition wrapper (Langston C2).** In `server/db-pool-guards.ts`, wrap the pool's `connect` and `query` on the instance: stamp the REQUEST time before calling the original, and on hand-over record wait = hand-over − request (this covers the queue time pg-pool emits nothing for; pg-pool's `query()` calls `this.connect`, so one wrapper sees both paths, flagged by which entry was used). Hold = hand-over → release. **Label:** a `pool.query()` checkout is `query`; a `pool.connect()` checkout — every drizzle transaction — is labelled with the first non-`node_modules` frame of the stack captured at the call (drizzle's `transaction()` reaches `pool.connect()` synchronously, `session.js:138`; pg-pool 3.7.0's `query()` reaches `this.connect(cb)` synchronously at `index.js:399` (`this.connect((err, client) => {`), so the caller's file:line is on that stack), i.e. one of the seven sites by name. **Carrier (C3):** one line a minute per pool to `console.error` → `error.log` (14 daily files retained, `error__2026-10-22` onward, measured), not stdout (~26.5 h retained). Counts in FIXED buckets so they SUM across lines and survive a restart — wait over 0.1 / 1 / 5 / 10 s; hold over 1 / 5 / 10 / 20 / 25 s — plus the minute's max per label. A PM2 restart resets only the current minute; P3 aggregates across the retained lines. **No database writes** (the instrument must not take the slot it measures). Observe at least 48 h including a US weekday session. | F4 | gives OBJ-2's value; names the longest legitimate TRANSACTION by site with its measured duration (Langston r2 condition); and the wait profile for OBJ-4 and OBJ-5 |
| **P3** | Set the values from P2's data, in the pool config: `statement_timeout` (below 30 s; scope start 25 s), `idle_in_transaction_session_timeout` (start 60 s), `connectionTimeoutMillis` (sized for the slot wait; the handshake cost stated in seconds). No `transaction_timeout` (F3 decision). If P2 shows any writer statements between the chosen bound and 30 s, the trade-off (more drops until 16a's re-buffering) goes to Kyle with the count. | F3, F4, scope §6 | one commit, Step 4, then Step 7 per scope OBJ-2/3/3b/4 |
| **P4** | OBJ-5: two self-clearing alerts with their own keys — callers waiting past a bound (from P2's per-minute wait buckets, an occurrence count per window, not `waitingCount`'s level), and any `dawntrader_main` backend idle in a transaction past a bound (a one-connection client outside the pool). Per-window occurrence counts, never a level (Langston, OBJ-1 ruling); separates ten-at-once by an operator from a flap; resolve, never ack; clear edge tested; forced test of each on staging. Consumes the OBJ-1 counters. | F1, F3 | |
| **P5** | OBJ-6: a diagnostic pool (max 2, own `application_name`, own short statement bound, own acquire limit) for the two Drift Dashboard panels; `qd-probe-service` decided from P2's data (move with a concurrency of at most 2, or stay with a cap). | F5, F6 | server code only |
| **P6** | OBJ-7: `#1062`'s disposition recorded. | scope | |
| **P7** | OBJ-8 governance: System Manual Neon sweep and the database chapter rewritten; SIM pool entry; ledger entries. | F7 | Step 10 |

**UNAUDITED:** nothing in the plan lacks a finding. The VALUES in P3 are deliberately not chosen here; they come from P2.

## 5. In plain language
The audit found that the app could crash in a second way: when the database closes a connection the app is in the middle of using. That fix, and the one for a third pool Langston spotted, are built and in review. It also found that the database's own statistics can't tell us how long the app's statements normally take, only the worst cases from past jams. So the plan is to measure first for two days, then set the time limits from those numbers. After that come the alarms, and moving the heavy dashboard reads onto their own connections. The limit that would have bounded a whole transaction is dropped from the shared settings: it closes the connection mid-statement whenever a transaction runs more than one statement, which would have broken ANALYST's retry logic. Today's transactions are each a few fixed statements, so the per-statement limit already caps them.

## AMENDMENT inc 3 (2026-11-07, CC-A) — P2's readings and the P3 values proposed from them

> ✅ **VALUES APPROVED by Langston subject to four conditions (Discord `1568673730790424837`, re-derived from 3,410 lines cut at 17:01:31Z); the writer census corrected IN PLACE below; OBJ-5(a) redesigned to his measured threshold. The conditions C1-C4 are at the end of this section and all land in the P3 commit.**

**Instrument and population.** `[B-DB-POOL-GUARD][POOL_MINUTE_V2]` lines, pool `dawntrader_main`, read from `/var/log/dawntrader/error__2026-11-06_00-00-00.log`, `error__2026-11-07_00-00-00.log` and `error.log` on staging: **3,385 minute lines, 2026-11-05 08:09:21 → 2026-11-07 16:36:31** (≈ 56 h, includes the 11-05 and 11-06 US sessions and three restarts). Fixed buckets summed across lines; per-label figures come from each minute's top-3 code labels + top-3 statement families, so they are **FLOORS**.

**What the database runs with today (read live, 2026-11-07):** `show statement_timeout` = **2min** (the server default; nothing sets it); `show idle_in_transaction_session_timeout` = **0** (off); the pool's client-side `query_timeout` = **30 s** (`server/db.ts`, `POOL_CONFIG`). ⇒ **a hold of ~30,000 ms is the CLIENT giving up, not the statement finishing** — the server keeps running that statement for up to 2 minutes, holding a backend the app no longer counts. That is the gap OBJ-2 closes.

**Totals:** 6,195,853 checkouts (6,067,417 by `query`, 128,436 by `connect`). **Wait:** > 100 ms 418,969 (6.8 %); **> 1 s: 2**; > 5 s: 0; max **1,167 ms** (`boundedTransaction<runPendingCertificateRepair`, 11-06 12:45:54). **Hold:** > 1 s 7,163; > 5 s 1,580; > 10 s 382; > 20 s 56; **> 25 s: 30**; max 30,002 ms. Gauges: `open` max 10, `waiting` max 11.

**Minutes in which a label held past 10 / 15 / 20 / 25 / 28 s (floors):**

| label | >10s | >15s | >20s | >25s | >28s | kind |
|---|---|---|---|---|---|---|
| `sql:with:xstock_spot_ohlc_15m_snapshot` | 248 | 79 | 33 | 14 | 13 | read |
| `sql:select:signal_eval_archive` | 45 | 3 | 3 | 2 | 1 | read |
| `sql:select:xstock_spot_ticker_snap` | 23 | 9 | 6 | 4 | 3 | read |
| `sql:select:scheduled_tasks_audit` | 9 | 1 | 1 | 1 | 1 | read |
| `sql:with:xstock_spot_ohlc_1m` | 7 | 3 | 1 | 0 | 0 | read |
| `sql:insert:signal_eval_archive` | 5 | 3 | 0 | 0 | 0 | **write** (max 18,644 ms) |
| `sql:insert:xstock_qd_probe_history` | 5 | 2 | 2 | 1 | 1 | **write** (max 29,999 ms) |
| `boundedTransaction@…<index.js:38134` | 1 | 1 | 1 | 1 | 0 | transaction (max 26,519 ms) |
| `boundedTransaction@…<index.js:38236` | 1 | 1 | 0 | 0 | 0 | transaction (max 16,320 ms) |

**Proposed values (P3):**
1. **`statement_timeout` = 25 s, set on the pool's connections** (server side), **with `query_timeout` STAYING at 30 s** — the ordering is the point: pg 8.13.1's `query_timeout` errors the caller but sends no cancel and does not destroy the connection (the 11-04 mechanism, `xstock-bar-availability.ts:29-40`), so the server bound must fire first; precedent `xstock-db-snapshot.ts:37-38` (server 2,000 ms, client 2,500 ms, the same ~20 % ratio). 20 s would newly fail ~26 more completions per 56 h (hold > 20 s = 56 vs > 25 s = 30). **Writer census between 25 s and 30 s: EMPTY — no write is evidenced completing in the band** (corrected; r1 here read the `xstock_qd_probe_history` 29,999 ms as a completion). That value is the client's 30 s ABANDON: its minute (11-07 00:15:55) carries `[P19-B5c][qd-probe][cron] fire threw: Query read timeout` at 00:15:40, and 29,999-30,002 appears on three labels in three minutes, each beside a logged abandon (±2 ms jitter on one timer). Langston enumerated 28 of the 30 band occurrences inside minutes with a logged 30 s abandon; the other two are a read (`15m_snapshot` 26,605 ms, 11-05 08:23) and a transaction (`boundedTransaction<index.js:38134` 26,519 ms, 11-07 06:56). Top-3 truncation means *none evidenced*, not *none exists*, but the blind side is the error-release path, which hides abandons, not completions. ⇒ **P3's Kyle clause does not fire.**
2. **`idle_in_transaction_session_timeout` = 60 s** (scope start). The longest transaction hold seen is 26.5 s; nothing idles near 60 s.
3. **`connectionTimeoutMillis` = 10 s.** Max wait seen 1.167 s, > 1 s twice in 6.2 M checkouts; 10 s is ~8× the max and well inside the 25 s statement bound.
4. **OBJ-5(a) wait alert — redesigned (Langston (3)):** both waits > 1 s fell in ONE minute line (11-06 12:45:54), so the worst 5-minute window in 56 h holds 2 and ≥ 3 is one above observed. Three triggers: **(a)** ≥ 3 waits > 1 s in one window; **(b)** any single wait in the > 5 s bucket (measured 0 in 6.24 M checkouts; positive control: the > 100 ms bucket counts 423,585); **(c)** any `connectionTimeoutMillis` rejection (impossible today). The window is built from each line's own covered interval, never by counting lines (the emit offset drifts, 13:19:56 → 13:21:50 = 114 s). Clears on TWO consecutive 0 windows. The window's occurrence count and max wait are written into the body at mint (a re-surface replays the mint, it does not re-measure).
5. **OBJ-6 evidence:** `sql:with:xstock_spot_ohlc_15m_snapshot` is the longest reader by far (248 minutes over 10 s). Its callers are named at Step 3 before any move.

**Conditions (Langston), all in the P3 commit:**
- **C1** — `'timeout exceeded when trying to connect'` (pg-pool 3.7.0's acquire-timeout text, `index.js:205`) added to `isTransientWriteError` (`ohlc-batch-writer.ts:105-112`) with a fence test; today only the writers' own 5 s guard text (`'pool slot timeout'`, `:370`) matches, and the default is PERMANENT by design (`#705`), so without it the new acquire bound would drop an archive batch on the most transient error there is.
- **C2** — the two R5/R5d coupling comments (`xstock-bar-availability.ts:41-45`, `ohlc-batch-writer.ts:153-162`) rewritten: the binding condition becomes **`XSTOCK_TX_STATEMENT_TIMEOUT_MS` stays below the POOL's `statement_timeout`**, and the `statement_timeout < query_timeout` invariant goes next to `POOL_CONFIG` in `db.ts` with its reason.
- **C3** — the other two in-process pools get a stated disposition: `scripts/b-new-34b-prewarm-snapshot.ts:258-265` (`query_timeout: 180_000`, no server bound — a bound, or why 180 s unbounded is accepted) and the crew pool, one line each.
- **C4** — `[stage-attrition] refresh FAILED … Query read timeout` at 11-07 13:20:33 came from the main pool, yet the covering line (13:21:50) reads `hold_gt_25000ms=0`, max 9,381 ms. Explain it, or publish the hold census as a **floor** (one miss against ~24 matched events).
  - **C4 EXPLAINED (CC-A, Step 3):** the abandon at 13:20:33 happened in the OLD process, ~26 s before the joint-deploy restart (`e0e68dfdb` live 13:20:59Z). P2 counts in memory and writes once a minute; a PM2 restart drops the current minute's unflushed counts (P2 row: *"A PM2 restart resets only the current minute"*), so the old process's last partial minute (from 13:19:56) was never written, and the 13:21:50 line is the NEW process's first minute. ⇒ **The hold census is a FLOOR around restarts** (three restarts in the window), stated as such in the readings above.
**Step-4 r1 (Langston, Discord `1568680729225732117`): PROCEED on everything but the fence's reach — now widened:** the sibling fence (`b-db-pool-guard.test.ts`) asserts server `statement_timeout` < client `query_timeout` for EVERY in-process pool builder it derives (db.ts, the prewarm pool; the crew board is the named exemption and its EQUAL 4 s/4 s is recorded as NOT satisfying the invariant), and the P3 fence takes a census of every `SET LOCAL statement_timeout` in server code (control: ≥ 2 sites) plus the xStock snapshot client. Both mutation-proved. The Drift Dashboard comment that said the pool has no acquire timeout is corrected. **Step-7 residual folded (Langston (1)):** 57 h cannot contain a weekly or monthly job — `archival-scheduler.ts:101`/`:131` (weekly regime-metrics archival, monthly compression) run on this pool; a 25-30 s statement there used to be abandoned client-side yet COMMITTED server-side, and is now cancelled and rolled back with no retry classifier. Read at Step 7, stated as the window's residual. **Surfaced for Kyle, NOT placed (Langston (2)):** no `process.on('unhandledRejection')` exists in server code; the exposure looks bounded (fire-and-forget sites carry `.catch`), but the connect-timeout path has no history.
**Step 7, short:** the setting LANDS (`show statement_timeout` on a pool connection + the `[DB_POOL_INIT]` line); one statement forced past 25 s returns `57014`, the connection stays live, the ROLLBACK is prompt, and NO `Query read timeout` is logged.

### Increment 3 Step 7 — first pass (CC-A, 2026-11-07; Langston r1-r3, Discord `1568685403500847185`, `1568686619693940869`)
Deployed `942c65424` 17:51:31Z (CI `42397602218` 4/4; rollback `d01da3d86`). `[DB_POOL_INIT]` 17:51:22 shows all three bounds (control: the 16:23:31 line lacks them). **The setting on the live pool is DISCHARGED BY CONSTRUCTION, not by a live-pool readback:** pg sends `statement_timeout` / `idle_in_transaction_session_timeout` in the startup packet of every connection built from `POOL_CONFIG`; **the confirming observation is the first real 57014 on `dawntrader_main` itself.** Each bound EXERCISED in a separate harness process with a pool built from `POOL_CONFIG` (script in a private `/tmp` dir, deleted; the staging worktree clean): `pg_sleep(26)` → 57014 at 25,027 ms (pool.query) and 25,026 ms (inside BEGIN; ROLLBACK 25 ms; connection and pool usable after); BEGIN then 62,002 ms idle → `25P03 terminating connection due to idle-in-transaction timeout`, caught by the OBJ-1b checked-out guard **in the HARNESS process** (the app's own `checkedOutClientErrors` stays 0 — `counts` is a per-process map; nobody may read this exercise into the app's counters or OBJ-5); a `max:1` pool held busy → `timeout exceeded when trying to connect` at 10,002 ms.
**Folded into OBJ-5 (Langston r3, no new slot):** one server-side termination raises the checked-out counter TWICE (25P03, then `Connection terminated unexpectedly` on the same client; `db-pool-guards.ts:27-29` counts both by design) ⇒ **OBJ-5 counts INCIDENTS, not errors** (or states the 2:1 ratio). **Langston's Step-8 leg:** pg-pool's acquire timeout is a bare `Error` with no `code` — his census of catch sites on the live path that return `[]`/`0`/`null` on an uncoded DB error.

### AMENDMENT inc 3b (2026-11-07, CC-A) — P4 build plan: the three OBJ-5 pages (Step 2, design only; one Langston gate before code)
**One new module, `server/db-pool-alerts.ts`, started at app boot; one new machine actor `db-pool-monitor` in `ALERT_ACTORS` (the one table); every key resolves itself through `resolveAlertsByDedupeKey(…, 'db-pool-monitor', …)` and is never acked.**

**OBJ-5(a) — callers waiting for a slot** · key `db-pool-wait:dawntrader_main` · severity `warning`.
- **Input:** a per-flush record from the P2 instrument — `{ startMs, endMs, waitsOver1s, waitsOver5s, acquireTimeouts }` — handed to the evaluator through a new `onFlush` option on `attachPoolInstrument` (no second timer, no log parsing). `startMs` is the previous flush (or the attach time), `endMs` this flush, so the window is built from **covered time, never from a line count** (Langston (3)).
- **`acquireTimeouts`:** counted in the existing connect wrapper when the rejection's message is EXACTLY pg-pool 3.7.0's `timeout exceeded when trying to connect` (a bare `Error`, no `code` — matched by message equality, with a fence on the literal).
- **Fires** on the 5-minute covered window when: waits > 1 s ≥ 3 **or** any wait > 5 s **or** any acquire timeout. **Clears** after **10 minutes of covered time with zero of all three** (two consecutive empty 5-minute windows). The body is written at mint: the window's span, the three counts, the max wait and its label.
- **Incidents, not errors (Langston r3):** each input is ONE event — a checkout's wait, or one rejected acquire. The OBJ-1 checked-out error counter (where one server end counts twice) is NOT an input to (a).

**OBJ-5(b) — a backend idle inside a transaction** · key `db-pool-idle-in-tx:dawntrader_main` · severity `warning` · blind key `db-pool-idle-in-tx:blind`.
- **Reader:** a dedicated ONE-connection `pg.Client` outside the pool (`application_name` `dawntrader_pool_monitor`, `statement_timeout` 2 s < `query_timeout` 2.5 s, `connectionTimeoutMillis` 3 s — the `xstock-db-snapshot.ts` pattern), every 60 s: `count(*)` and `max(now() − state_change)` over `pg_stat_activity` where `application_name = 'dawntrader_main'` and `state` in (`idle in transaction`, `idle in transaction (aborted)`) and `now() − state_change > 30 s`.
- **Bound 30 s** — half the server's 60 s `idle_in_transaction_session_timeout`, so a page arrives BEFORE the server ends the session, and above the longest measured transaction hold (26.5 s). **Fires** at count ≥ 1; **clears** after two consecutive reads of 0. A failed read (connect, query, or a malformed row) ⇒ the blind key, never silence; the blind key clears on the next good read.
- **Shown able to fire (scope):** a harness transaction held idle 45 s on a `dawntrader_main` connection ⇒ the row id recorded.

**OBJ-5(c) — an unplanned process restart** · key `app-unplanned-restart:<live_restart_time>` · severity `critical` · blind key `app-unplanned-restart:blind`. Exactly the scope row: read `pm2 jlist` (name-filtered to `dawntrader`, as `dt-deploy` does) and `/home/deploy/dawntrader-deploy.record`'s last `restart_time=`; HIGHER ⇒ crash-restart (with the delta), LOWER ⇒ boot-resurrect (cause labelled a HYPOTHESIS: a host reboot). **Suppressed** while `/home/deploy/dawntrader-deploy.lock` is held by a LIVE pid (a lock whose pid is dead does NOT suppress). **Clears** when live == record (the next `dt-deploy`). Unreadable ⇒ the blind key. **Cadence:** 60 s after boot, then every 5 minutes (a `pm2 jlist` spawn is not free; a crash is caught within 5 minutes of the restarted process booting).

**Tests (all three):** mint once, no re-mint while open, the clear edge, the blind key; (a) the covered-time window across an irregular flush gap; (c) a second crash mints a second row, lock-held suppression, dead-pid lock does NOT suppress. **Staging forced tests:** (a) has no safe forcing path on the LIVE app pool (forcing it means stalling real callers), so (a) is fence-only plus its first real firing — stated, not claimed (#661 leg 3). (b) the 45 s harness transaction. (c) HIGHER by a deliberate `pm2 restart dawntrader` outside `dt-deploy` (row id, pinned to the deployed sha); LOWER by an injected record — labelled *comparator arm exercised, reboot mechanism NOT*.

### AMENDMENT inc 3b r2 (2026-11-07, CC-A) — Langston's six CHANGES on the P4 plan folded (Discord `1568689297870028962`); this SUPERSEDES r1 above where they differ
**Keys, now five (plus blind keys), all machine actor `db-pool-monitor`:**

| key | kind | fed by | fires | clears |
|---|---|---|---|---|
| `db-pool-wait:dawntrader_main` | **LEVEL** (warning) | the `onFlush` record | ≥ 3 waits > 1 s or any wait > 5 s in the 5-min covered window | itself, after 10 min of covered time at zero |
| `db-pool-acquire-timeout:dawntrader_main` | **INCIDENT** (warning) | the connect wrapper, exact message `timeout exceeded when trying to connect` | the first rejection; later ones merge `count` and `last_at` into the open row (`mergeAlertMetadata`) | **never by itself** — a person resolves it with evidence (a point incident; 10 quiet minutes must not erase the only notice) |
| `db-pool-idle-in-tx:dawntrader_main` | **LEVEL** (warning) | the one-connection monitor client, **every 25 s** (Langston C1: capture needs period ≤ kill − bound = 60 − 30) | count ≥ 1 of `dawntrader_main` backends idle in transaction > 30 s | itself, after two consecutive zero reads |
| `db-pool-idle-in-tx-ended:dawntrader_main` | **INCIDENT** (warning) | the OBJ-1b checked-out guard, **`code === '25P03'` only** (the follow-on `Connection terminated unexpectedly` is `code=none` and is NOT counted — one per incident, never the 2:1 total) | each server end of an idle transaction; merges `count` while open | never by itself (deterministic arm, zero sampling loss) |
| `app-unplanned-restart:<live_restart_time>` | **INCIDENT per value** (critical) | the app at boot (+60 s) — the FIRE path — and every 5 min (the CLEAR-edge poll) | live ≠ record, both directions | at the next `dt-deploy` (live == record): **EVERY non-terminal row under the `app-unplanned-restart:` prefix is resolved** (C2 — `resolveAlertsByDedupeKey` is exact-key, so an earlier crash's row would otherwise be unclearable) |

**Blind keys (never silence):** `db-pool-wait:blind` — no `onFlush` for ≥ 3 intervals (reaches a cleared timer, a detached instrument or a throwing flush; **NOT an event-loop stall**, stated); `db-pool-idle-in-tx:blind` — the monitor client cannot read; `app-unplanned-restart:blind` — the record is missing, its `restart_time` is NON-NUMERIC (`dt-deploy.sh:292-295` can write `unknown`, C3), `pm2 jlist` fails, or the lock exists with an absent/unreadable `pid` for longer than 10 minutes (within 10 minutes of the lock's mtime it SUPPRESSES — `holder` is written at `:200` before `pid` at `:203`, C3).

**(c) aborted deploy vs crash (C4):** a HIGHER count with the record's `sha` ≠ `git -C /home/deploy/dawntrader rev-parse HEAD` is labelled as either an aborted deploy (the restart at `:253` happened, the record at `:289+` did not) or a crash; the body names BOTH hypotheses and both shas. **The limit it buys, stated:** the monitor lives inside the process whose restart it reports, so it cannot report a crash the app never recovers from (crash loop, `pm2 stop`, failed boot); those belong to the liveness watch.

**(a) wiring (C5):** `onFlush` is passed at the ONE `attachPoolInstrument` call in `server/db.ts`; a `subscribePoolFlush(label, fn)` throws if the pool is not instrumented (the re-attach path returns a no-op), fenced. The flush's `open`/`waiting` gauges go in the BODY, not the trigger (an in-progress pin adds nothing to the wait buckets until release; the gauge tells a responder a pin from a flap). The body's span is rendered from wall-clock (the instrument's `now` is `performance.now()`); the accumulator resets at a restart, stated.

**OBJ-1 counters (C6):** `getPoolGuardCounts` gains its reader through the `25P03` incident key; the plain totals stay as log fields only, recorded as such (rule 18: no counter left with no reader).

**Census (fold):** `b-db-pool-guard.test.ts`'s server < client check extends to every `new pg.Client(` builder in server code (the monitor client 2 s / 2.5 s and `xstock-db-snapshot.ts` 2 s / 2.5 s), each named.

**Residual, stated:** a checkout leaked OUTSIDE a transaction (before BEGIN, after COMMIT) is invisible to all of these — no release ⇒ no wait counts, not `idle in transaction` ⇒ the sampler is blind, and `idleTimeoutMillis` does not apply to a checked-out client. Only the `open` gauge (in the (a) body) sees it.

**Forced tests:** (b) the harness holds a `dawntrader_main` transaction idle 45 s; the record names how many 25 s polls covered it (needing a retry to go green is the defect). The harness client carries the 60 s startup parameter (built from `POOL_CONFIG`), so it exercises the detector under the real ceiling; the `25P03` incident key is exercised by letting the same harness transaction run past 60 s. (c) a deliberate `pm2 restart dawntrader` outside `dt-deploy` (row id, pinned to the deployed sha); a second deliberate restart then one `dt-deploy` ⇒ BOTH rows resolved; the LOWER arm by an injected record, labelled *comparator arm exercised, reboot mechanism NOT*. (a) fence-only plus its first real firing, stated.

### AMENDMENT inc 3b r3 (2026-11-07, CC-A) — Step 4 and Step 7 record; the self-clearing keys LATCH UNTIL PROMOTED (Langston rulings `1568702965877973165`, `1568707237172748390`, `1568712632809033783`); this SUPERSEDES r2's "clears itself" wherever they differ
**Step 4 on P4.** `885f1a314` → CHANGES C-1 (the wait blind key minted behind a `known` guard, so a row resolved while still blind never re-minted) and C-2 (the callback connect arm, the one `pg-pool` `query()` takes at `index.js:399`, had no test). Folded at `1d4be9cf7` (mutation-proved), PROCEED, CI `42403770541` 4/4. Deployed `1d4be9cf7` 19:06:27Z (restart 683), carrying ANALYST's `#1250` (its own PROCEED at `cc4d2a9fc`).

**Step 7 forced test (b) — PASSED.** Harness scripts ran in a private directory on staging, deleted after; the staging worktree stayed clean.
- **App wiring.** A `dawntrader_main`-named connection was held idle in a transaction for 57 s (19:10:13 → ROLLBACK 19:11:10). The app's sampler minted `ffb9952e` at 19:10:57 with `max_s` 43.9 — ONE poll covered it (the one before, at about 19:10:32, saw about 19 s). It cleared after two clean reads (19:11:47, `db-pool-monitor`, evidence `#1239`).
  - **Why 57 s, not the planned 45 s:** a 45 s hold leaves a 15 s window above the 30 s bound, under the 25 s poll period, so a miss there would be by design rather than a defect.
- **Module end to end, outside the app's wiring (stated).** A harness process ran `startProductionDbPoolAlerts('cca_harness')` on its own pool.
  - The idle level `79857f58` minted at 19:13:55 (`max_s` 49.9).
  - The server killed the session at 19:14:05.746, raising exactly ONE 25P03 incident, `92390fc4`. The follow-on with no code, at .843, was not counted.
  - The level cleared at 19:14:45.652, and the incident row was resolved by hand as a test row.

**Step 7 forced test (c) — the incident arm PASSED; the clearing leg rides the next deploy.**
- **Two deliberate `pm2 restart`s outside `dt-deploy`**, announced in channel first: 684 → `ac7dac78` (minted 19:17:46) and 685 → `513eb051` (19:19:33). Both are `HIGHER`, both bodies read "HEAD matches the record's sha … most likely a crash-restart", and both were promoted at 19:29:46.788Z. Langston confirmed they were orderly SIGTERM restarts, `unstable_restarts=0`.
- **The LOWER arm:** the real `productionRestartInputs` was run with an injected record (`restart_time=690` against live 685) and returned verdict `LOWER`. **This exercises the comparator arm, NOT the reboot mechanism.**

**THE GAP STEP 7 FOUND — a self-clearing row can be resolved before anyone is sent it.**
- **Mechanism.** `addAlert` writes `state:'scheduled'`, `fired_at:null` (`server/services/system-alerts.ts:534/541`). Only `fireDue` (`:580`, stamping `fired_at` at `:590`) promotes and pushes, and it runs on the 15-minute `system-alerts-dispatcher.timer`.
- **Measured.** `ffb9952e` lived 50.1 s and `79857f58` 50 s, both with `fired_at` null: never promoted, never sent. The incident rows were promoted at the next tick.
- **"About 1 in 10" for the idle level is a lifetime ratio, not a measured delivery rate** (the delivered population is n=1, and it was the incident).
- **Premise withdrawn:** r2's "a page arrives BEFORE the server ends the session" is false at 15-minute delivery. The 25P03 incident is the durable record of a killed leak, and it is delivered.

**THE FOLD (`6be0c81f2`, Step-4 PROCEED with conditions; `+` C2/C3 in the next commit):**
- **Latch until promoted.** A self-clearing key (both levels, all three blind keys) resolves only once its open row carries `fired_at`.
  - Until then the key stays in `known` and every clear arm retries on its next pass. The deferral is logged once per key.
  - **`fired_at` IS PROMOTION, NOT DELIVERY** (Langston condition 1). `fireDue` stamps it before the push, and a promotion's push is not delivery-checked while a resurface's is. The residual is homed on `#340` (`3a6e3d265`), owner CC-A, with no slot. Fixing it needs a delivery stamp, which is a schema change.
- **A re-firing level merges** into its open row instead of being deduped into a frozen one (Langston condition 2). The merged fields are `fires`, `first_at`/`last_at`, and the running worst: max `n`/`max_s` for idle; max over-1 s, over-5 s and `maxWaitMs` (with its site) for wait.
  - **C3:** the wait merge also takes the LATEST window's `fromWallMs`, so the span in the metadata matches the 5-minute maxes beside it. `first_at` records when the condition began.
  - **The BODY stays as minted** and says so ("as first seen"). Its "At the latest flush" line is frozen, while metadata `open`/`waiting` keep updating.
  - A row minted by the pre-fold build has no `fires`/`first_at`. Its first merge stamps `fires: 2` with no `first_at`: the count is right, the provenance is absent. Accepted.
- **C2 — the restart family's MACHINE clear excludes unpromoted rows.** On `match`, the clear excludes every open `app-unplanned-restart:` row with no `fired_at`. `match` persists after a deploy, so the 5-minute poll retries until each row is promoted.
  - **Why:** a crash followed by a quick `dt-deploy` is the likeliest sequence. Without this exclusion it would wipe the notice unsent — the same defect at a third site.
- **Cost, stated.**
  - While a level fires: one `openRow` (a whole-file read, about 64 ms measured by Langston) plus one merge write per pass — every 25 s for idle, every minute for wait.
  - While a clear is pending: one `openRow` per pass, for up to 15 minutes.
  - At each `match` poll: one prefix read.
- **Restart inside a deferral:** `known` is re-seeded from the open rows at boot, so the clear resumes. Idle needs two fresh clean reads.
- **Tests:** 27. M3 (the gate removed) fails 3 tests; M4 (the merge removed) fails 2; M5 (unpromoted rows not excluded) fails the C2 test; M6 (`fromWallMs` not merged) fails the wait test. The suite's tsc and full-suite legs are discharged by CI per job at the deployed sha, not by the local run.

**Forced test for the fold (Langston: by exercise, not inspection) — owed after the deploy.** Hold a `dawntrader_main` leak until the idle level mints, roll it back, and show:
1. the row surviving its two clean reads, with the deferral logged;
2. the row taking `fired_at` at the next dispatcher tick;
3. the row resolving on the first clean pass after that.

The same deploy's `match` must resolve `ac7dac78`/`513eb051` — both already promoted — while excluding nothing.

**Step 7 after the fold — deployed `4f9fe259f` 20:09:22Z (restart 686; Langston PROCEED, CI `42408201480` 4/4).**
- **(c) clearing leg:** the boot `match` resolved `ac7dac78` (20:10:18.107) and `513eb051` (20:10:18.197), `db-pool-monitor`. Both rows had been promoted at 19:29:46, so the exclude set was `{blind}` and nothing was held back — **C2's exclusion arm is fence-proved only (#661 leg 3); this clean clear is NOT evidence that it works.**
- **The fold's forced test — PASSED.** A `dawntrader_main` connection held idle 57 s (20:09:39 → ROLLBACK 20:10:36).
  - Row `c1b22bf7` minted 20:10:33.022, `max_s` 53.9, `fires` 1.
  - At 20:11:23 the condition was clear and the log said, ONCE: *resolve deferred until the dispatcher promotes the row*.
  - At the next dispatcher tick the row took `fired_at` 20:14:50.378, and the alerts webhook posted it at 20:15:10.780 (`langston_alert_inbound` in the channel log; the two pre-fold idle rows, `ffb9952e` and `79857f58`, never appear there).
  - It resolved on the first clean pass after promotion: 20:15:08.187, `db-pool-monitor`.
  - The merge arm (a re-fire into a pending row) is fence-proved only in this run: no second leak occurred while the row was pending.
- **Mutations M3-M6 were RUN, not predicted** (each with the mutation confirmed present by grep, then restored).

### AMENDMENT inc 3c r1 (2026-11-07, CC-A) — P5 build plan: the diagnostic pool (OBJ-6). Design only; one Langston gate before code
**Measured input — the per-SQL-family slow-hold census.**
- **Population:** every `POOL_MINUTE_V2` line for `pool=dawntrader_main` in `error__2026-11-06`, `error__2026-11-07` and `error.log` on staging. That is 3,603 minute lines, 2026-11-05 08:09 → 11-07 20:18, split at the P3 deploy (17:51:31).
- **Instrument:** `slow_hold_sql` carries each family's LONGEST hold in that minute, so these are minute-maxima, not per-statement counts.
- **Control:** the same script returned 0 lines on `out*.log`. Those files hold no minute lines, which a grep confirmed (0 / 0 / 0 against 1,212 in `error.log`). The census reads the right file.

| family (pre-P3, 3,459 minutes) | minutes with a slow hold | p50 ms | max ms | > 10 s | caller | disposition in P5 |
|---|---|---|---|---|---|---|
| `with:xstock_spot_ohlc_15m_snapshot` | 1,634 | 4,450 | 30,002 | 248 | scanner / `xstock-ohlc-cache` / warmup | **stays** — a trading read, not diagnostic; its slowness is ANALYST's R6 (`B-XSTOCK-BAR-AVAILABILITY`, scope §5) |
| `select:signal_eval_archive` | 497 | 5,990 | 29,999 | 45 | **`stage-attrition-cache.ts:80`** — see below | **a decision for this gate** (below) |
| `select:xstock_spot_ticker_snap` | 411 | 1,708 | 30,001 | 23 | about 15 trading readers (dispatch, depth, VTS, sigma, scanner, qd-probe) — the label cannot separate them | qd-probe below; the rest stay |
| `with:xstock_spot_ohlc_1m` | 461 | 1,634 | 20,367 | 7 | xStock trading reads | stays |
| `insert:xstock_qd_probe_history` | 179 | 4,526 | 29,999 | 5 | the probe's own capture write | stays (a capture write) |
| `select:scheduled_tasks_audit` | 128 | 3,656 | 30,000 | 9 | `cron-fire-evidence-verifier.ts:94` (a watchdog that raises alerts) | **stays** — an alerting path needs the main pool's reliability; its slowness is a query-shape lead, put to you here rather than placed |

Post-P3 (144 minutes, a Saturday with xStocks shut) the 15-minute snapshot family has not appeared at all. **That is the market, not P3, until a weekday says otherwise.**

**FINDING (the census attributed it; §9.4) — the stage-attrition refresher has no reader.**
- **What it does:** `startStageAttritionRefresher` (`server/index.ts:1558`) runs a 6-hour GROUP BY over `signal_eval_archive` every 5 minutes.
- **Measured:** 479 of the 501 gaps between slow `select:signal_eval_archive` minutes are exactly 5 minutes, at 12 per hour, so the slow family IS this job (p50 about 6 s of one main slot per run, up to the 30 s cap).
- **Its only consumer is gone:** `StageAttritionTable` was deleted from `vts-filter-diagnostics-panel.tsx` by `22f54c4a6` (`B-FILTER-DIAG-STANDARDIZE`, 2026-08-07; its scope item 5 said the table "survives ONLY if it maps onto a VTS-spec table … or goes").
- **Proof there is no other reader:** `git grep -i attrition -- client/` returns nothing; the control `drift` returns hits in the same tree. The route `/active-engine/diagnostics/stage-attrition` stays, and nothing in the repo calls it.
- **`#648` is stale:** it still says the instrument "SHIPPED" on the Filter-Diagnostics tabs.
- **Owner:** the cache is CC-B's (`B-FILTER-DIAG-PAPER`). I tell CC-B once.

**THE PLAN**
- **P5-1 — `server/db.ts` gains `diagPool` / `diagDb`.**
  - Settings: `application_name: 'dawntrader_diag'`, `max: 3`, `statement_timeout: 25_000` below `query_timeout: 30_000` (the same invariant and census fence as the main pool), `idle_in_transaction_session_timeout: 60_000`, `connectionTimeoutMillis: 5_000` (a panel fails fast instead of queueing), `idleTimeoutMillis: 30_000`, keepAlive.
  - `attachPoolInstrument` + `attachPoolGuards` under `dawntrader_diag`, so its own minute line separates it and an ended idle client cannot crash the process.
  - **NOT paged:** OBJ-5's pages watch `dawntrader_main`, and the diagnostic pool's failures land in the panels, by design. Stated, not silent.
  - The `[DB_POOL_INIT]` line prints both pools.
- **P5-2 — both Drift Dashboard functions read through `diagDb`:** `computeDataArchiveStatus` (`:813`) and `computePassiveArchiveStatus` (`:905`, including its untimed `diskBytesForParent`).
  - `PASSIVE_COUNT_CONCURRENCY` drops 3 → 2, so both panels refreshing together peak at 1 + 2 = 3 = `max`, and the pool never queues on itself (scope §6's "queues on itself" risk).
  - Server only; no page change; panel logic untouched. Time-boxing the data-archive counts stays with `#1037` (row 119, CC-B).
- **P5-3 — `qd-probe-service.ts:128` stays on the MAIN pool, with its burst capped 8 → 4.**
  - **What it is:** a CAPTURE job — `server/index.ts:96-99`: *capture-only; friction-extraction → B81/Phase-25*. No trading code reads `xstock_qd_probe_history`: the only other server references are its metrics module and the retention sweep (`b75-retention-sweep.ts:195`).
  - **Why it stays:** its loss is calibration data, and the diagnostic pool is fail-fast and shared with dashboards, so a capture would be dropped whenever a panel holds the slots.
  - **Why the cap:** each statement is a LIMIT-1 indexed seek, but 8 in flight asks for 8 of 10 slots in a burst. 4 caps it at 40%. Its duration changes from 5 batches to 10 batches of millisecond seeks.
  - **The limit, stated:** its holds cannot be separated from about 15 other readers of the same table in P2's labels, so the cap rests on the burst arithmetic, not on a measured hold of its own.
- **P5-4 — the stage-attrition refresher. Your ruling, two options:**
  - **(i) Delete it** under rule 18 + rule 23: the refresher, the cache module, the route and the `index.ts` start, with the `DELETED_COMPONENTS_LOG.md` entry, `#648` corrected, and SIM's B-FILTER-DIAG-PAPER section retired.
  - **(ii) Move it to `diagDb`** and home the delete-or-restore question on `#648` for CC-B.
  - **I recommend (i).** It has no reader. Moving it still runs a pointless 6 s query on the database every 5 minutes, which costs the database, not just the pool. The instrument it served can be rebuilt from the archive whenever `#648` needs it.
  - **What makes (i) safe:** the census shows no `server` caller beyond the route and the starter, nothing in `client/`, and scripts and docs reference it only as prose.
  - **What (i) does NOT do:** decide `#648`'s analysis. That stays CC-B's.

**Tests planned:**
- the pool-config fence extended to `diagPool` (invariant, `application_name`, `max`);
- a fence that both panel functions import `diagDb`, not `db`;
- the passive concurrency equals the diagnostic pool's `max` minus the data-archive panel's one;
- the qd-probe cap value;
- for (i), the starter and route absent and `tsc` clean.

**Forced test (Step 7):**
- In Claude-in-Chrome, load Analytics → Drift Dashboard while reading `pg_stat_activity` by `application_name`. The panels show under `dawntrader_diag`, `dawntrader_main` stays under its max, and `error.log` holds no `pool slot timeout` in the window (scope OBJ-6). This needs Kyle's Chrome signed in to staging.
- The Passive Archive Capture card check for `B-OHLC-FRAME-GUARD` §8.1 rides the same tab-open.

### AMENDMENT inc 3c r2 (2026-11-07, CC-A) — P5 BUILT to Langston's ruling (Discord `1568734628930519283` and `1568736965413707777`): P5-4 delete, C-1 to C-4 folded
**THE HOLD CENSUS ABOVE IS A FLOOR, NOT A COUNT — and the mechanism is why (Langston, C4 answered).**
- pg 8.13.1's `query_timeout` errors the caller and drops the callback, but sends NO cancel and does NOT destroy the connection (`db.ts:72-77`).
- The instrument stamps a hold on RELEASE (`db-pool-instrument.ts:249-250`). So an abandoned checkout adds nothing to the minute it failed in; its hold lands in whatever later minute the statement finishes.
- Before P3 there was no server bound, so such a statement ran on toward the server default (`statement_timeout` 120000 on staging, Langston measured).
- **Consequence:** the census under-reports exactly the families that time out — the stage-attrition family among them. That is also the explanation for the 13:20:33 `refresh FAILED … Query read timeout` beside a minute reading `hold_gt_25000ms=0` (C4 above).
- After P3 the 25 s server cancel closes the gap. "The 15-minute snapshot is absent after P3" stays a Saturday observation, never a P3 effect, until a weekday says otherwise.

**WHAT WAS BUILT**
- **P5-1 `server/db.ts`:** `diagPool` / `diagDb`, built as specified.
  - Settings: `application_name 'dawntrader_diag'`, `DIAG_POOL_MAX = 4` (Langston's sizing preference: `max_connections` 90 with 23 in use, measured), statement 25 s below query 30 s, idle-in-transaction 60 s, acquire 5 s, the instrument and the shared guards, and its own `[DB_POOL_INIT]` line.
  - **C-3:** the comment names where a diagnostic failure is visible, and only there: its own `POOL_MINUTE_V2` line (with `acquire_timeouts`), its `POOL_CLIENT_ERROR` guard line, and the panels. It is not paged; the OBJ-5 pages read `dawntrader_main` alone. A quiet `dawntrader_diag` is not evidence that it is healthy.
- **P5-2 `drift-dashboard-aggregator.ts`:** both panel functions take `diagDb`.
  - **C-1:** the data-archive panel's catch sets `timedOut = true`, so a failed count renders the client's existing QUERY TIMEOUT badge instead of "0 rows". The log line keeps the real error.
  - **C-2:** `PASSIVE_COUNT_CONCURRENCY = DIAG_POOL_MAX - 1` (3), with `DISK_PARENT_FANOUT = 2` named and checked at its use. The peak `max(3, 2) + 1 = 4 ≤ 4` is FENCED from the derived values. The old "shared with the archive writers" rationale is rewritten.
  - **Same class:** `diskBytesForParent` failures are collected and logged ONCE per call. They still render 0 bytes, because the field is a number and this batch changes no page.
- **P5-3:** `qd-probe` stays on the main pool with its burst at 8 → 4 (`SNAP_QUERY_CONCURRENCY`), and its cron gains `noOverlap: true` (node-cron 4.2.1).
  - **C-4, the arithmetic corrected:** the live universe is **473** (`scheduled_tasks_audit.meta.universe_size`, 2,010 fires over 7 days; two error fires carry none). So 8 meant 60 rounds and 4 means 119 rounds.
  - Measured run time is p50 3.3 s / p99 12.3 s / max 64 s, so doubling stays inside the 5-minute cadence, and `noOverlap` makes stacking impossible.
  - ⚠️ **Langston's 100 versus this 473:** his figure came from the summary log lines and mine from the audit table, so the two read different fields. The audit field is the one the cron itself writes per fire. Stated for him to reconcile, not resolved by me.
- **P5-4 DELETED:** the stage-attrition cache module (archived `.removed` by `git mv`), its `index.ts` start and its route.
  - **The rule-18 sweep:** `signal-eval-archiver.ts:113` comment rewritten; SIM `:586` rewritten; SIM B-FILTER-DIAG-PAPER section gets a DELETED banner (its funnel-tracker paragraph stays live); SIM `:168` is a different object (`strategyAttrition`), untouched; `DELETED_COMPONENTS_LOG.md` entry with the restore path and "no stored data lost".
  - **`#648`:** its body was REWRITTEN in place — not in service, outcome (2), CC-B's reader decision, attribution `19ba83c1e` kept.
  - **The KD-32 pack's section 5:** corrected by PM Claude (`48b6a80d5`).
  - **Runtime absence (Langston's own two instruments):** nginx 0 versus control 2, and the app log 0 versus control 2, filtered on the `/api/` prefix (the bare-path hits are the boot route dump).
- **Tests:**
  - New `b-db-pool-guard-p5.test.ts` (6 tests): behaviour for C-1 through a mocked pool — all 5 tables `timedOut`, 5 diagnostic calls, 0 main-pool calls; fences for the wiring, the derived peak, the probe cap and `noOverlap`; the deletion, with a sibling-route control.
  - The census in `b-db-pool-guard.test.ts` now checks EVERY pool config per file, so `db.ts`'s second pool is checked rather than certified unseen by a first-match read (checked = 3).
  - Two panel suites' `db.js` mocks gain `diagDb` and `DIAG_POOL_MAX`.
  - Mutations, each confirmed present: M7 (`timedOut` removed), M8 (pool 2), M9 (the second pool's server bound 40 s), M10 (the panel back on the main pool) — each fails its test.
  - Full suite: the same 11 local-only failing files as before, by file-list diff; tsc 324.

### AMENDMENT inc 3c r3 (2026-11-07, CC-A) — Langston's Step-4 CHANGES on `2de102383` folded (Discord `1568751619972010025`)
- **C-4, reconciled by Langston:** his 100 is WITHDRAWN. It was the crypto screener's `universeSize` top-N cap (`[REB2.9C][FX5][CycleStart]`, `kraken.ts:734`), which shares the field name; 473 is the probe's live universe.
  - The universe is NOT static: `XSTOCK_SPOT_SYMBOLS` is replaced on each daily discovery load (`universe-service.ts:128`; historically 260 / 489 / 473).
  - The headroom is therefore stated, not asserted: max 64 s × 2 ≈ 128 s against the 300 s cadence, about 2.3×, and it halves if the universe doubles. The code comment says this.
- **C-5 (required):** `safeCount` now books pg-pool's acquire timeout as LOAD — `isAcquireTimeout(err)` → `unknownCount('timeout')`, no fault line. Before this it fell to `error` and into `countFaults`, inverting the distinction the comment above it declares load-bearing. It was unreachable on the old 10-slot / 10 s pool, and it is the steady state on 4 slots / 5 s. Test 3b in `b-ohlc-frame-guard-archive-counts.test.ts`; mutation M11 (branch disabled) fails it.
- **C-6 (required):** the `db.ts` comment is narrowed to the two heavy panels and NAMES the two that stay on `dawntrader_main`, so a responder is not told to stop looking at the main pool while the dashboard is open.
- **C-7 — the census rows owed for the Drift Dashboard's other two panels (OBJ-6 "every other candidate is decided per caller"):**

| caller | reads | measured | decision |
|---|---|---|---|
| `computeAblationComparison` (`drift-dashboard-aggregator.ts:490`, route `/api/analytics/ablation-comparison`) | `regime_factor_alternates` | **No hold measured:** nginx shows 1 request in two weeks (2026-11-04 18:02:16, status 200), before the minute-line census window (11-05 08:09 onward); the census itself has 0 slow minutes for the table (control: `signal_eval_archive` found in the same run). Table: ~55,879 rows, 104 MB, indexed on `(asset_class, evaluated_at)`, `(pair_symbol, evaluated_at)`, `(factor_name, evaluated_at)` | **STAYS on `dawntrader_main`** — small, indexed, requested about once a fortnight; moving it would add a connection to the diagnostic pool's peak (the page loads every panel at once: 1 + 3 + 2 = 6 > 4), turning these into fail-fast acquire timeouts |
| `computeFactorCalibration` (`:1189`, routes `/api/analytics/factor-calibration` and `/api/xstocks/factor-calibration`) | `regime_factor_alternates` | the same: 1 nginx request (11-04 18:02:09, 200), none in the census window | **STAYS**, same reasons |

  - **The honest limit:** "small and indexed" is a size argument, not a measured hold. Their first in-window load is the evidence that would test it, and the main pool's minute line will name the family if it is ever slow.
  - Also seen in that two-week nginx sample: both `data-archive-status` requests ended **499** (the client gave up) at 18:02:35 and 18:03:07 on 11-04 — the heavy panel this increment moves and time-boxes. A fact, not a new finding: it is `#1037`'s subject (row 119, CC-B).
- **Cheap takes:**
  - (a) A skipped qd-probe fire now logs a NAMED line (`_cronTask.on('execution:overlap', …)`; node-cron's own warning names no task, and a skipped fire writes no audit row). Fenced; M13 fails it.
  - (b) The C-1 test gains a non-timeout failure case; M12 (timedOut narrowed to timeouts) fails it.
  - (c) The tautological disk fan-out `throw` is removed; the coupling is the named constant plus the derived-peak fence.
  - (d) The "three `Pool` builders" prose above is corrected in place.
- **Note recorded (Langston):** both panel suites alias `db` and `diagDb` to one mock object, so they are pool-blind by construction. They may not be read green as pool evidence; M10 and the P5 file's call counts are the pool evidence.

### AMENDMENT inc 3c r4 (2026-11-08, CC-A) — Step 4 PROCEED on `9cdc05633` (Langston, Discord `1568761405039972353`); his measurement replaces my C-7 hedge; the one fold before close
- **C-7, now MEASURED (Langston, `EXPLAIN (ANALYZE)` on staging), superseding r3's "a size argument, not a measured hold":**
  - `computeAblationComparison` takes 2.5 ms at `rolling_24h` (284 buffers, all hits) and 86 ms at `rolling_30d` (15,672 rows, bitmap via `pair_time_idx`).
  - `computeFactorCalibration` takes 101 ms at `rolling_30d` (14,872 rows, the partial `(asset_class, evaluated_at)` index, whose `WHERE replay_completed_at IS NOT NULL` its predicates match exactly).
  - **The cost is bounded by the 30-day window, so it does not grow with the table.** Both stay on `dawntrader_main`. Live rows 56,345 against my 55,879: growth, not a discrepancy.
- **nginx frequency — the readability Langston could not re-derive (his account cannot open `access.log*`, `0640 www-data:adm`):** my reads ran as `root` on staging, and **15 of 15** rotated files decompressed and read (`zcat -f` succeeded on each; measured 2026-11-08). No file read as zero by being unreadable. No longer load-bearing, since the cost is measured directly.
- **C-5 version coupling (noted, not blocking):** `ACQUIRE_TIMEOUT_MESSAGE` is our literal. The existing fence `b-db-pool-alerts.test.ts` ("the acquire-timeout literal is pg-pool 3.7.0's own text") reads `node_modules/pg-pool/index.js` and asserts the source contains `new Error('<our literal>')`, so a pg-pool message change fails THAT test rather than silently reverting C-5.
- **THE FOLD (§13 disposition 1, into P5):** `computeDataArchiveStatus` now keeps load and faults apart, as the passive panel does.
  - A statement timeout or an acquire timeout is LOAD: the table shows QUERY TIMEOUT and no error line is written.
  - A real error is collected and logged ONCE per call (`[B70][archive-status] N of 5 table reads failed — shown as QUERY TIMEOUT; first: …`), never per table. `error.log` is the stream `#1037`'s drop check reads.
  - `timedOut = true` is unchanged for any failure.
  - Test: load (both kinds) writes no line; a fault writes one line naming 5 of 5. M14 (load counted as a fault) fails it.
