# B-ENGINE-STOP-DURATION-COLUMN — PRE-AUDIT AND IMPLEMENTATION PLAN (Step 2)

change-class: non_architecture (as scoped; §3 asks whether the recommended option re-declares it)
**Issue:** `#1067` · **Row:** `SPRINT_TO_LIVE_PLAN` 2a0 · **Owner:** CC-B · **Scope:** `B_ENGINE_STOP_DURATION_COLUMN_SCOPE.md` (r1 + §5 Langston Step-1 conditions C1-C4)
**Code read at:** `origin/migration/aws-supabase` `934d0d6a3` (line numbers below are at that ref). **DB + logs:** staging, 2026-10-06 ~18:15Z.

---

## 0. PREVIOUSLY STATED → NOW (top, because three of them move the plan)

| # | PREVIOUSLY STATED (scope) | NOW (measured) | REASON |
|---|---|---|---|
| 1 | §1: `run_for_ms` column — **disposition (1) correct as the limit, keep** | **disposition (5): disconnected, never connected — delete (rule 18)** | the time limit was specified 2025-10-19 with an enforcer that was **never built**; no caller has ever passed one; nothing reads `ends_at`; 0 of 163 rows has `ends_at` (A4, A2) |
| 2 | §5 C2: after a failed session write, *"the next boot's resume reconciles it (it finds `isEngineActive = false` and marks the orphan row stopped)"* | **FALSE.** With the flag false, `resumeActiveEngines` logs *"not active - no resume needed"* and touches no row (`:1304`). The row stays `running`, and **the next START ADOPTS it** — *"already running (manager reconciled)"* (`:535-559`) — carrying the OLD `startedAt` and `startingBalance` | read at the code (A5). This is how `paper_-i05tFriAB` (started 07-16) lived to 10-06: every start reused it, so its elapsed time only grew until it overflowed |
| 3 | §3: *"Step 2 counts"* the historical rows holding an elapsed value | **158 of 162 stopped rows** hold one (all 158 non-null values; `|run_for_ms − (stopped_at − started_at)| < 60 s` matched **158/158** — the instrument's positive control is that it matched at all). **None can reach `/status`** (it reads running rows only, `:1106`), as C4 said | DB query A2 |
| 4 | C4 census: live writers of session rows = the engine service | **plus a second boot-time entry point — `active-engine-heartbeat.ts`** (started at `server/index.ts:1484-1492`: `recoverSessions()` then a 30-second `start()`), with its own writes at `:158` and `:289`. **Both are dead in practice:** they need `session.userId`, a column removed in Phase 2C (P19-B3b note, `storage.ts:4049`), so every session hits *"missing required fields — skipping"*: **2,188 such warn lines in today's `error.log`**, and the boot recovery skipped once. | A3 |

---

## 1. AUDIT (six sources)

**A1 — the code (source 1).** Session-row writers at the ref, repo-wide (`git grep` of `createActiveEngineSession|updateActiveEngineSession`, tests excluded):
| site | what it writes | live? |
|---|---|---|
| `active-engine-service.ts:601` | create row (`runForMs: options?.runForMs || null`, `endsAt` from it, `:577-595`) | yes |
| `:691` | `startingBalance` (anchor) | yes |
| `:709`, `:769` | `status: 'failed'` (start rollback) | yes |
| **`:998-1002`** | stop: `status 'stopped'`, `stoppedAt`, **`runForMs: runDuration`** — the defect | yes |
| **`:1225-1229`** | resume-refused: `status 'stopped'`, `stoppedAt`, **`runForMs: elapsed`** in a try/catch that swallows the throw | yes |
| `active-engine-heartbeat.ts:158` | mode-mismatch auto-stop | **unreachable** (A3) |
| `active-engine-heartbeat.ts:289` | boot recovery "cleanly stopping" | **unreachable** (A3) |
Readers of `run_for_ms`/`ends_at`: `:578-579` (computes `ends_at` from the requested limit), `:1131-1132` (`/status` echoes both). **No reader acts on `ends_at`** — `git grep -n "endsAt\|ends_at"` outside the service and schema returns only diagnostics JSON snapshots (all `null`), a 2025 SQL dump and the 2025-10-19 design notes. Client: zero (C4).
Callers of `startActiveEngine` (5): `routes.ts:3687` (`skipAutoWatchlist`, `startingBalance`), `routes.ts:11246`, `routes.ts:11315` (`startingBalance`), `active-engine-heartbeat.ts:267` (none), `auto_test_harness.ts:146` (none). **None passes `runForMs`.**

**A2 — the database (source 2), staging `active_engine_sessions`, all 163 rows:**
| mode | status | n | `run_for_ms` set | elapsed-like | `ends_at` set | first start | last start |
|---|---|---|---|---|---|---|---|
| paper | running | 1 | 0 | 0 | 0 | 2026-10-06 15:52:57Z | (same) |
| paper | stopped | 162 | 158 | 158 | **0** | 2025-12-08 | 2026-10-06 |
The running row is `paper_swtTrAmXFy` (the post-reset session). `paper_-i05tFriAB` is stopped (15:52:52Z) with `run_for_ms` NULL — its stop wrote no duration because the reset closed it through another route. **⇒ in the table's whole history the column has held only elapsed durations, never a limit.**

**A3 — the second entry point (census: who schedules work against the row).** Repo-wide enumeration of schedulers over `active_engine_sessions`: (i) `resumeActiveEngines` (boot), (ii) `activeEngineHeartbeat.recoverSessions` (boot, `index.ts:1489`), (iii) the heartbeat's 30-second `runHeartbeatCheck` (`index.ts:1492`), (iv) the HTTP start/stop/status routes. (ii) and (iii) gate on `session.userId` (`heartbeat.ts:131`, `:248`), which the single-tenant table no longer has ⇒ they skip every session (2,188 warns today; 84 heartbeat cycles in the current `out.log` window, each "Found 1 active session(s)" and nothing after). **Mutual exclusion between (i) and (ii): moot today because (ii) is inert** — but if anyone "fixes" the `userId` guard, (ii) with `AUTO_RESUME_SIMULATIONS=true` would call `startActiveEngine` at boot concurrently with (i). The heartbeat's live part is small: the orphaned-manager heal (`:67-70`) and a `simulation_heartbeat` bus event. Its consistency check reads `status.reconciliation`, a field `getActiveEngineStatus` does not return (it returns `diagnostics`, `:1134`) ⇒ also dead.

**A4 — provenance (sources 5-6).** The time limit's design, verbatim, from the 2025-10-19 Replit context (`attached_assets/4. Dawn Trader Context for New Chat as of 10.19.25 part 2_1760892711009.md:6785-6789, :7848-7864`):
> `startPaperSim({userId, mode:'paper', runForMs?:number, startingBalance?:number})` … `getPaperSimStatus(...) -> { isRunning:boolean, startedAt?:ISO, endsAt?:ISO, sessionId?:string }` … *"Runs every 30 seconds. Queries paper_sim_sessions for status='running'. Checks each session's ends_at or run_for_ms."* … *"On application startup: … If the session ends_at > now → resume monitoring. If expired → set status='stopped' and stopped_at=now()"*.
The enforcer half was never written: `git log -S "endsAt" --reverse -- server` returns one commit (`c7f3e287d`, the one that also added the stop-path elapsed write), and the heartbeat built for it says so itself — *"For now, we don't have a duration limit"* (`active-engine-heartbeat.ts:257`). Kyle 2026-10-04 (recorded on `#577`): **no max-hold time in paper** — a per-trade rule, but the same intent: paper runs are open-ended. `bridge/canonical/`: no coverage of session time limits (searched `run_for_ms`, `runForMs`, `ends_at`, `time-limit`) — recorded as a finding.
Ledger (§9.5(b-ii)): `RUNNING_ISSUES` by symbol — `#1067` (this), `#520` (the orphan sweep deletion that the B8.2 resume-refused write came with), `#585` (resume cannot recover a malformed session row). No prior decision to keep the time limit.

**A5 — the orphan-row lifecycle (C2's open question).** After a stop whose session write fails, today: teardown skipped, flag stays TRUE, row `running` ⇒ next boot RESUMES the old session (`:1197-1265`). After objective 3 (teardown runs, flag cleared, row still `running`): next boot does nothing (`:1304`); `/status` reports `isRunning: true` with no manager (`:1123`, the inverted contract); **the next start adopts the stale row** (`:535-559`) with its old `startedAt` and `startingBalance` — after a paper reset that would resurrect the pre-reset session's anchor. ⇒ **objective 3 alone moves the failure, it does not close it.** The adoption branch exists for a real case — the manager lost while the engine is meant to run (flag true) — and the flag is what tells the two apart.

**A6 — SIM / System Manual (sources 3-4).** SIM: the engine-session lifecycle is described under the active engine service; it is **silent on** `run_for_ms` meaning, on the heartbeat's dead `userId` gate, and on the start path adopting an orphan row. System Manual Chapter 5 (Trade Execution & Lifecycle): no session time limit described (consistent with it never existing). Both gaps flagged; fixed under plan item 7.

---

## 2. PLAN — each item ← its finding

**OPTION B (RECOMMENDED) — remove the dead time limit instead of protecting it.**
1. **Delete the time-limit feature** (rule 18, disposition 5): `options.runForMs` from `startActiveEngine`'s options (`:461`), the `endsAt` computation and both create-time fields (`:577-595`), the two `/status` fields (`:1131-1132`), the schema columns (`shared/schema.ts:2077-2078`), and a migration `ALTER TABLE active_engine_sessions DROP COLUMN run_for_ms, DROP COLUMN ends_at` (rollback re-adds both, nullable). **No information is lost:** the 158 values are exactly `stopped_at − started_at` (A2, 158/158 within 60 s), so the duration stays derivable; `ends_at` was never set. `DELETED_COMPONENTS_LOG` + `_archive`. ← A1, A2, A4
2. **With the column gone, both wrong-object writes go with it** — the stop (`:1001`) and resume-refused (`:1228`) write only `status` + `stoppedAt`. The integer overflow becomes impossible by construction, not guarded. ← scope objectives 1-2, A1
3. **Teardown is not hostage to the session write** (scope objective 3, C1's enumerated list): the window resets, `active_engine_stopped` emit, stop_ack log, `logBalanceReconciliation`, `setEngineActive(false)` and the flag verification run whether or not the row write succeeds; a failed write still fails the stop loudly (error to the caller naming the session write + one breakage alert). ← C1, C2
4. **The start path stops adopting a row the engine was stopped out of** — in the `existingSession && !existingManager` branch (`:535`), if `system_context.isEngineActive` is false the row is a leftover: mark it `stopped` (one retry, alert on failure) and fall through to a fresh session; if the flag is true, keep today's reconcile. ← A5 (closes C2's real gap; without it objective 3 only moves the failure)
5. **The inverted `/status`** (`isRunning = !!dbSession || hasManager`, `:1123`): **proposed disposition 2 — added to an existing batch, not fixed here**, because after items 3-4 the only remaining way to see a running row with no manager is the seconds between a process crash and the next boot, where reporting "running" is arguably right (the engine is meant to run). Recorded on `#1067`; if you rule it must change, the minimal form is `isRunning = hasManager` with `hasDbSession` kept in diagnostics. ← C4 note, A5
6. **The heartbeat's dead paths** (A3): its `checkSession` and `recoverSessions` can never run (missing `userId`) and write 2,188 warn lines a day; its consistency check reads a field that does not exist. **Proposed disposition 3, own batch** — `B-ENGINE-HEARTBEAT-DEAD-PATHS`, CC-B, placed directly after this one (row 2a0b): remove `checkSession`/`recoverSessions`/the `AUTO_RESUME_SIMULATIONS` boot call, keep the orphaned-manager heal and the bus event, with its own reader census. Not folded: it is a different component and this batch's tests would not cover it. ← A3
7. **Records:** SIM engine-session entry (no time limit; duration derived from `started_at`/`stopped_at`; the start path's orphan rule; the heartbeat's dead gate until row 2a0b), System Manual Ch. 5 one paragraph, `#1067` closed with both incidents, `DELETED_COMPONENTS_LOG`. ← A6
8. **Tests (payload-based, C3):** (a) stop of a 30-day-old session hands `updateActiveEngineSession` `{status, stoppedAt}` and no `runForMs` key; (b) resume-refused likewise; (c) a forced throw in the session write still runs every step in C1's list and raises the alert; (d) start with a `running` row, no manager and flag false ⇒ the row is stopped and a NEW session id is created; with flag true ⇒ reconciled as today; (e) a fence that `run_for_ms`/`runForMs`/`ends_at`/`endsAt` appear nowhere in `server/`, `shared/` or `client/` outside the migration files. Mutation: (a), (b), (d) run against the ref's code and must fail.

**OPTION A (the scope as approved)** — items 2-3 only, writing `status` + `stoppedAt` and leaving the dead limit columns and option in place. Cheaper (no migration) but leaves a column whose only meaning was never wired (rule 18) and does not close A5.

**Change-class:** Option B adds a migration dropping two columns from a table nothing reads them from, and changes the start path's orphan handling. I believe it stays `non_architecture` (no strategy, signal, sizing or exit behaviour; the start-path change narrows an existing branch) — **asking you to confirm or re-declare.**

No plan item is `UNAUDITED`.

## 3. Asks (one gate: approve the audit + plan)
1. Option B over Option A.
2. Plan item 4 (the start path's flag-gated orphan close) — the right fix for A5, or do you want it elsewhere.
3. Dispositions for item 5 (inverted `/status`, not fixed here) and item 6 (heartbeat dead paths, own batch after this one).
4. The change-class.

Deploy after 2026-10-07T15:53Z (`#1154`), and not in the same deploy as `B-ATR-BAD-PRINT` unless you prefer one restart.
