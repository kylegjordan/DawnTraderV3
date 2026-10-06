# B-ENGINE-STOP-DURATION-COLUMN — SCOPE (Step 1, r1)

change-class: non_architecture

**Issue:** `#1067` (with its amendment 1) · **Plan row:** `SPRINT_TO_LIVE_PLAN` 2a0 (first in CC-B's queue; moved from row 173 on 2026-10-06 — Langston asked the lists be reconciled, `PHASE_19_PLAN` 3n.u4 had already named CC-B) · **Owner:** CC-B · **Why now:** its second incident halted the governed `PAPER-RESET-3000` mid-sequence on 2026-10-06 (15:45:49Z; recovered 15:53:00Z under Langston's conditions). **Ships after the 24-hour no-deploy window (`#1154`, to 2026-10-07T15:53Z).**

## 0. The defect (measured; full record in `#1067`)
- The engine stop computes `runDuration = stoppedAt − startedAt` and writes it into **`runForMs`** (`server/services/active-engine-service.ts:995-1002` at `3576d3981`). The column is `integer("run_for_ms")` with the comment *"If time-limited simulation"* (`shared/schema.ts:2077`) — a PostgreSQL `integer` caps at 2,147,483,647 ms ≈ **24.85 days**. Session `paper_-i05tFriAB` (started 2026-07-16) threw at 65.4 days (2026-09-20) and at 82 days (2026-10-06).
- **Two defects, not one:** the overflow, and a **wrong-object write** — `run_for_ms` is the REQUESTED run length (an input, set at start, `:594`, and used to compute `ends_at`, `:577-579`); the stop overwrites it with the ELAPSED duration (an output).
- **A second write of the same kind:** the B8.2 resume-refused path writes `runForMs: Date.now() − startedAt` (`:1228`) inside a `try/catch` — it fails silently, leaves the row `running`, and the resume re-refuses and re-alerts on every boot (Langston C1; the `#520` shape).
- **What the throw skips:** everything after the session write — `reset24hWindow('paper')` / `resetHourlyScanHistory('paper')` (`:1004-1006`), the cluster-bus `trading_state_changed` emit, and the flag verification (`:1074`). The positions were already flattened: **the stop looks failed and is done; the row looks running and is not.**

## 1. Provenance (TIER 1)
| thing | introduced | intent | disposition |
|---|---|---|---|
| `run_for_ms` column | `e4384759f` 2025-10-19 (Replit: *"Introduce new schema and methods for paper simulation sessions…"*) | the comment says it: *"If time-limited simulation"*; `ends_at` *"Calculated from runForMs"* — a requested time limit | **(1) correct as the limit — keep** |
| stop-path write `runForMs: runDuration` (`:1001`) | `c7f3e287d` 2025-10-19 (Replit: *"Improve paper trading simulation and AI analysis reporting"*; no rationale for the field) | none stated — an incidental reuse of a column with another meaning; `INFERRED-FROM-CODE` | **(4) connected, should be removed** |
| resume-refused write (`:1228`) | `2d163cf08` 2026-07-16 (B-STAGING-LIVENESS-WATCH: *"resume refusal now stops the row w/ runForMs (no re-refusing corpse)"*) | the intent is to STOP THE ROW (correct); the elapsed value copied the existing pattern | **(2) keep the stop, drop the elapsed write** |
Corpora searched: `RUNNING_ISSUES` (by symbol `runForMs` / `run_for_ms`), `git log -S` unpathed, the SIM session-table entry (Step 2).

## 2. Objectives
1. **The stop never writes an elapsed duration into `run_for_ms`.** It writes `status = 'stopped'` and `stopped_at` only; the duration it logs stays an in-memory value. *Verify:* a unit test stops a session started 30 days ago: the stop completes, the row reads `stopped` with `stopped_at` set and `run_for_ms` unchanged; **mutation-proved** — with the old write restored the test fails (an integer-range value).
2. **The resume-refused path likewise** stops the row without the elapsed write. *Verify:* a test that a refused session older than 25 days ends `stopped`, not `running`.
3. **A failure in the final session write can never skip the teardown that follows.** The window resets, the bus emit and the flag verification run whether or not the session write succeeds; a failed session write raises one breakage alert naming the session. *Verify:* a test that forces the session write to throw and shows the three later steps still run and the alert is raised.
4. **Nothing reads `run_for_ms` as a duration.** Census (Step 2): readers today — `:1131` (surfaces the field in status) and `:577-579` (computes `ends_at` from the requested limit). If a duration is wanted anywhere it is derived from `started_at` / `stopped_at`. *Verify:* census at the ref, zero duration readers.
5. **Records:** `#1067` closed with both incidents; SIM's engine-session entry states `run_for_ms` is the requested limit and the duration is derived. *Verify:* text at the ref.

## 3. Out of scope
- **A migration.** None: the column keeps its meaning and type; no duration column is added (derivable). Existing rows whose `run_for_ms` holds an elapsed value (sessions stopped before 24.85 days, written since 2025-10-19) are historical and inert — Step 2 counts them and states whether `:1131` would show them as limits.
- **The inverted `/status` contract** (`isRunning = !!dbSession || hasManager`, noted by Langston) — Step 2 checks whether objective 3 already removes the case that exposed it; if not, it gets a disposition there.

## 4. Blast radius
The stop and resume-refused paths of `active-engine-service.ts` only; `active_engine_sessions` rows written from now on; no signal, sizing or exit behaviour. Deploy after 2026-10-07T15:53Z.
