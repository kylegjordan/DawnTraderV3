# P19-B-RENAME (#413) — CC-A INDEPENDENT INVENTORY (Claude Old)

**Method:** independent repo sweep (files, schema.ts tables, routes, module_constants, events, env vars, UI ids) + per-item reference counts INCLUDING dynamic `import()` strings and raw-SQL table-name strings (the two ways a static-import grep undercounts) + dead-candidate verification against dynamic/lazy loading. Built WITHOUT reading CC-B's list (Kyle directive 2026-07-02: two independent inventories, then reconcile).

**The naming disease in one line:** paper+live share ONE mode-keyed ACTIVE pipeline, but the engine and its tables say "paper"/"sim" — so the ACTIVE path reads as VTS/simulation. `mode-registry.ts:11` typing BOTH the `'paper'` and `'live'` engine slots as `PaperExecutionEngine` is the conflation in its purest form.

**Naming rule I applied:** "paper" is legitimate ONLY when it designates the paper HALF of the mode axis (mode-scoped data/UI). It is wrong whenever it names the SHARED active infrastructure. "sim" is wrong anywhere on the active path.

---

## CAT-A — SHARED ACTIVE infrastructure misnamed "paper/sim" → rename paper→active (the core of the batch)

### A1. Files (proposed new names)
| Current | Proposed | Refs (incl. dynamic) | Notes |
|---|---|---|---|
| `server/services/paper-execution-engine.ts` (`PaperExecutionEngine`) | `active-execution-engine.ts` (`ActiveExecutionEngine`) | **28** (+ dynamic in routes) | THE shared engine. Also imported by vts-runner for pure exit-logic parity — rename touches VTS-side imports too. |
| `server/services/paper-portfolio-manager.ts` (`PaperPortfolioManager`) | `active-portfolio-manager.ts` | 5 | |
| `server/services/paper-sim-service.ts` (start/stop/status/reset, `getGlobalPaperSimManager`, `getEngineByMode`) | `active-engine-service.ts` | **18** + dynamic imports at `server/index.ts:432` and ≥4 sites in routes.ts | ⚠ dynamic-import strings MUST be swept — a static-only rename leaves boot/routes loading a missing module. |
| `server/services/paper-position-sizing.ts` | `active-position-sizing.ts` | 14 | |
| `server/services/paper-session-reset.ts` | `active-session-reset.ts` | 1 | |
| `server/services/paper_sim_heartbeat.ts` | `active-engine-heartbeat.ts` | 2 (incl. dynamic `index.ts:1417`) | Also fix the underscore-vs-hyphen inconsistency while renaming. |
| `server/services/paper-sim-diagnostic.ts` | `active-scan-diagnostic.ts` | 3 (incl. dynamic `routes.ts:2691`) | Read-only universe/filter-trace diagnostic on the active scan. |
| `scripts/start-paper-sim.sh` | `start-active-engine.sh` | 1 (error-text mention) | + its `PAPER_SIM_TOKEN` env var → `ACTIVE_ENGINE_TOKEN` (server check + script, lockstep). |

### A2. DB tables (highest risk — see §RISK)
| Current | Proposed | Blast radius | Notes |
|---|---|---|---|
| `paper_sim_open_positions` | `active_open_positions` | 2 TS + raw-SQL sites | Open positions of the ACTIVE engine. |
| `paper_sim_trade_logs` | `active_trade_logs` | 2 | |
| `paper_sim_sessions` | `active_engine_sessions` | 4 | `mode` column hardcoded `'paper'` today — widen semantics at rename. |
| `paper_sim_trades` | **DESIGN DECISION — see OPEN-1** | 4 TS + ~15 raw-SQL files + 10 migrations | It is the closed-trade sink for BOTH systems (VTS closes migrate INTO it atomically, B79.0g Q5). "active_trades" would be as wrong for the VTS rows as "paper_sim" is for the active rows. My proposal: `closed_trades` (system-agnostic sink) with the existing source columns distinguishing origin. Needs Kyle+Langston call. |

### A3. Identifier surfaces that rename WITH A1/A2 (lockstep, same batch)
- **module_constants module keys:** `paper_execution` → `active_execution`; `paper_sizing` → `active_sizing` (DB rows via migration + the code reads + 2 test mocks that hardcode `paper_sizing`).
- **API routes:** `/api/paper-sim/*` (≈30 endpoints) → `/api/active-engine/*`; `/api/internal/paper-sim/*` → `/api/internal/active-engine/*`. Client callers sweep (active-trades-v2, portfolio strip, diagnostic pages). Decide whether to keep temporary aliases for one deploy cycle (I vote NO — nothing external consumes these; clean cut).
- **clusterBus/WS events:** `paper_sim*` family (started/stopped/reset/heartbeat/heartbeat_failure/mode_mismatch/state_inconsistent) → `active_engine*`. ⚠ server emit + client listeners must move in ONE commit.
- **`paper_trade_executed` / `paper_trade_opened` lifecycle events** (`lifecycle-events.ts` ↔ `active-trades-v2.tsx:962`, `portfolio-summary-strip.tsx:48`): these fire from the shared engine for BOTH modes → `active_trade_executed`/`active_trade_opened`.
- **active-filter-pool internal pool keys** `paper_trend|paper_strong_trend|paper_reversal|paper_oscillator|paper_breakout` (+ `live_*` twins, `active-filter-pool.ts:421-449`): here "paper" IS the mode key — **KEEP** (they are per-mode by design). Listed so the reconciliation doesn't mistake them for CAT-A.
- **Exported symbols:** `PaperExecutionEngine`, `PaperPortfolioManager`, `PaperMetricsService`, `getGlobalPaperSimManager`/`set…`/`clear…`, `startPaperSimulation`/`stop…`/`get…Status`/`resetPaperSimService`, `paperOperationQueue` (operation-queue.ts), `InsertPaperSimSession` schema types; tombstone string `PaperExecutionServiceLegacy` (mode-registry.ts:11) — rename or retire with the sweep.
- **Migration file** `2026-06-14-p19-b4a-c6-paper-sim-calibration-state.sql`: historical — do NOT rename shipped migrations; new rename migrations reference the new table names only.

## CAT-B — VTS/straddling items with misleading names
| Item | Problem | Proposal |
|---|---|---|
| `server/services/paper_validation_engine.ts` + `server/routes/paper_validation.ts` (`/api/validation/*`) | M5-era validation harness instrumenting VTS-mode telemetry; "paper_" prefix reads as the active engine | If still wanted: `validation-run-engine.ts` / drop the paper_ prefix. **My actual recommendation: candidacy for DELETION-review (M5 era over; verify Kyle wants the harness at all).** |
| `server/services/m5d-validation-service.ts`, `m5e-validation-service.ts` | VTS-vs-paper comparison harnesses (era-named, opaque) | Leave names (historical harnesses) or fold into the same deletion-review. |
| `server/services/simulation-engine.ts` + `strategic-memory.ts` (`strategic_simulation_log`) | "simulation" ≠ VTS — an older strategic what-if subsystem; catches new readers constantly | No rename needed if documented; add SIM/System-Manual disambiguation line. Flag for the list only. |
| `vts_open_trades` table | Exists ONLY as raw-SQL migration; NO drizzle declaration in shared/schema.ts (all access `db.execute`) | Not a rename — a schema-completeness fix worth folding in (declare it) or homing separately. |

## CAT-C — DEAD → DELETE (rule 18; verified incl. dynamic imports)
| Item | Evidence |
|---|---|
| `client/src/components/goals/paper-sim-diagnostic.tsx` | 0 importers static AND dynamic/lazy (App.tsx clean). Server sibling stays (renamed per A1). |
| `test-guardrails-paper.ts` (repo root) | 0 refs; imports pre-V3 paths that no longer exist; no npm script. |
| `server/paper-trading-stop.ts` | 0 importers; CLI relic. |
| `server/paper-trading-start.ts` + `server/services/paper-48hr-simulation.ts` + `scripts/test-phase-6-5-setup.ts` | Chain reachable only from itself; runtime execution hard-blocked since 8.8.4-A3.R9.0.B; Phase-6.5 era. Delete all three together (blast-radius: the only importer of 48hr-sim is the dead chain + paper-sim-service? — verify at Step-2: my sweep shows 48hr-sim imported by paper-trading-start + test-phase-6-5-setup only, plus PaperPortfolioManager import FROM it). |
| Client dead query: `ai-insights.tsx:18` → `/api/paper/ai-reports` | NO server route exists. Either delete the client query + `paperAIReports` table (my lean: it's userId-coupled legacy → delete both) or build the missing route (nobody has missed it). |
| `PaperExecutionServiceLegacy` tombstone check (mode-registry.ts:11) | Retire with the rename. |

## CAT-D — GENUINELY paper-MODE-scoped → KEEP "paper" (explicit designation, correct per #413)
- Tables: `goals_paper` + `goal_analysis_history_paper` (mode-mirrors of `goals_live` — the naming MODEL to copy), `paper_daily_briefs` (userId-coupled legacy flag noted), `paperAIReports` IF kept (see CAT-C).
- **`paper_trades` (legacy table)** — schema-commented "legacy," still read by 10 files across BOTH systems (metrics, trade-safety, vts-runner, audits). NOT a rename candidate; it needs its OWN retirement/migration decision — **OPEN-2** (don't fold into B-RENAME; home it as a named follow-up).
- `/api/paper/*` metrics/briefs routes + `paper-metrics.ts`: these serve paper-MODE data readouts — mode-scoped, defensible to keep, BUT they read the legacy `paper_trades` table, so their fate rides OPEN-2, not the rename.
- Mode literals `'paper' | 'live'`, UI mode buttons/testids (`button-mode-paper` etc.), `TradingMode` types — the mode axis itself. KEEP everywhere.
- Env: `PAPER_TRADING_USER_ID` dies with the CAT-C CLI deletions; metadata literals `PAPER_EXEC_SRC`/`PAPER_RECORD_FAILED`/`PAPER_TRADE_RECORDED` rename with the engine (they mark active-engine actions).

## CAT-E — Governance/doc wording (same batch, per #413)
- CLAUDE.md rule 20 (the "paper-execution-engine has 'paper' in its name" trap paragraph — rewrite to the new names + retire the trap warning once the trap is gone).
- System Manual + SIM: every component row/chapter naming the paper-* files/tables; SIM's singleton registry entries.
- MEMORY files + Langston CLAUDE.md/MEMORY mentions at close.

---

## RISK ORDER (my recommendation)
1. **Wave 1 — deletions (CAT-C)**: zero-risk, shrinks the rename surface first.
2. **Wave 2 — file/symbol/route/event renames (A1/A3)**: tsc makes this mechanically verifiable; the dynamic-import strings and raw-string references (routes, event names, module keys, test mocks) are the ONLY non-compiler-checked pieces — enumerate + grep-sweep each explicitly in the Step-4 diff.
3. **Wave 3 — DB table renames (A2)**: highest risk (25 server files + 17 migrations touch `paper_*` strings; raw SQL is compiler-invisible). One migration with `ALTER TABLE … RENAME`, lockstep query updates, staged verify. Do LAST, possibly as its own sub-batch.
4. module_constants key renames ride Wave 3 (DB rows + reads lockstep, b72-warmup fail-hard proves the seed).

## OPEN QUESTIONS for the reconciled list (Kyle + Langston sign-off)
- **OPEN-1:** `paper_sim_trades` target name — it's a BOTH-systems closed-trade sink (`closed_trades`?). Naming it "active_trades" would re-create the same lie in the other direction.
- **OPEN-2:** legacy `paper_trades` retirement — own follow-up batch, not B-RENAME.
- **OPEN-3:** delete vs rename the M5 validation harness family (CAT-B).
- **OPEN-4:** route aliases for one deploy cycle or clean cut (I vote clean cut).
- **OPEN-5:** does anything OUTSIDE the repo reference the API paths or event names (Langston's queue scripts, alert bodies, ops muscle-memory)? Sweep at Step-2.
