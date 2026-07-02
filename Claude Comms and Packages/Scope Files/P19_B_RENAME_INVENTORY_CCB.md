# P19-B-RENAME — CC-B independent inventory (#413)

**Author:** Claude New (CC-B), 2026-07-02. Built blind of CC-A's list per Kyle's double-blind directive; to be diffed against CC-A's, reconciled, and the merged list taken to Kyle+Langston for sign-off BEFORE any rename.
**Categories (Kyle spec):** **(a)** shared active-path (paper+live) → mode-agnostic name containing **active** · **(b)** VTS piece misnamed "paper" → de-paper · **(c)** dead → retire/delete (rule 18) · **(d)** genuinely paper-only or live-only → KEEPS paper/live in the name.
**Method:** filename find (repo-wide, archives excluded) + schema pgTable scan + per-file importer grep (static AND dynamic `import()`) + per-table reference grep (drizzle export identifier AND raw SQL string) + route/script/config registration sweep — run on the C:\dev bench at head `3b2fe9d3a`.

---

## 1. SERVER FILES

| # | Current | Cat | Proposed | Callers (must update in lockstep) | Notes |
|---|---|---|---|---|---|
| F1 | `server/services/paper-execution-engine.ts` | **(a)** | `active-execution-engine.ts` | STATIC: micro-execution-service, mode-registry, paper-48hr-simulation (F9, dies), paper-portfolio-manager · DYNAMIC: routes.ts ×~6 (`getEngineSessionStart` :12236 etc.) | THE active engine, mode-keyed (rule-20). Internal class/export names (`PaperExecutionEngine`) ride the rename. |
| F2 | `server/services/paper-portfolio-manager.ts` | **(a)** | `active-portfolio-manager.ts` | STATIC: paper-48hr-simulation (dies) · via paper-sim-service (S1 `Map<mode,Manager>`) | Per-mode manager (S1). `globalPaperPortfolioManager` global + accessors ride. |
| F3 | `server/services/paper-position-sizing.ts` | **(a)** | `active-position-sizing.ts` | STATIC: signal-orchestrator, xstock active-dispatch, paper-execution-engine + 2 test files | Sizer for BOTH pipes. |
| F4 | `server/services/paper-sim-service.ts` | **(a)** | `active-trading-service.ts` (or `active-sim-service.ts`) | STATIC: routes, xstock active-dispatch, auto_test_harness, trade-safety, paper-session-reset · DYNAMIC: server/index.ts:432, routes ×~10 (start/stop/manager getters), paper-trading-stop (dies) | Start/stop lifecycle for the active engine, both modes. Exports (`startPaperSimulation`/`stopPaperSimulation`/`getGlobalPaperSimManager`/`getEngineByMode`…) ride. |
| F5 | `server/services/paper-session-reset.ts` | **(a)** | `active-session-reset.ts` | DYNAMIC ONLY: routes.ts :11284/:11530 (`paperSessionResetService`) | Zero static importers — dynamic-only; a grep-for-imports-only sweep MISSES it (why this inventory greps `import(` too). |
| F6 | `server/services/paper_sim_heartbeat.ts` | **(a)** | `active_sim_heartbeat.ts` (align dashes?) | STATIC: auto_test_harness · DYNAMIC: server/index.ts:1417 | Heartbeat for the engine. Note underscore vs dash inconsistency — normalize in this batch? (decision) |
| F7 | `server/services/paper-metrics.ts` | **(a)**? | `active-metrics.ts` | DYNAMIC ONLY: routes.ts :5292/:5323 (`PaperMetricsService`) | Zero static importers but LIVE via dynamic import. Verify mode-keying at rename. |
| F8 | `server/services/paper-sim-diagnostic.ts` | **(a)** | `active-sim-diagnostic.ts` | STATIC: signal-orchestrator · DYNAMIC: routes.ts:2691 · CLIENT: paper-sim-diagnostic.tsx (F15) | Diagnostic service + panel pair. |
| F9 | `server/services/paper-48hr-simulation.ts` | **(c)** | DELETE | Imported ONLY by paper-trading-start.ts (F10, also dead) | Legacy 48hr validation harness; unreachable from the live system. |
| F10 | `server/paper-trading-start.ts` | **(c)** | DELETE | No importer; direct exec BLOCKED by the A3.R9.0.B guard; no npm/PM2/script invoker found | Superseded by `POST /api/paper-sim/start` (the .sh wrapper calls the API, not this file). |
| F11 | `server/paper-trading-stop.ts` | **(c)** | DELETE | Same as F10 (guard + no invoker) | Superseded by the API stop. |
| F12 | `server/routes/paper_validation.ts` | **(c)**? | DELETE (verify) | DYNAMIC: routes.ts:21867 registers it (LIVE registration of a legacy M5-era surface) | Wired-but-legacy: the M5 validation era. Deleting removes a live route registration — Kyle/Langston confirm the validation UI surface is dead first. |
| F13 | `server/services/paper_validation_engine.ts` | **(c)**? | DELETE (verify) | STATIC: routes/paper_validation.ts (F12), routes/pricing.ts (⚠️ a LIVE route file imports it — check what pricing.ts uses before cutting) | Rides F12's decision; the pricing.ts import is the blast-radius item to trace. |
| F14 | `scripts/start-paper-sim.sh` | **(a)** | `start-active-trading.sh` (or keep — ops-facing) | Calls the API (`POST /api/paper-sim/start`); references env `PAPER_SIM_TOKEN` | ⚠️ Renaming the API PATH (see §4) cascades here. |
| F15 | `client/src/components/goals/paper-sim-diagnostic.tsx` | **(a)** | `active-sim-diagnostic.tsx` | Its importer page (goals area) — enumerate at implementation | Pairs with F8. |
| F16 | `test-guardrails-paper.ts` (repo root) | **(c)** | DELETE | None (root stray) | Dead root-level stray. |
| F17 | `after-click-paper.png` (repo root) | **(c)** | DELETE | None | Screenshot junk. |
| — | `drizzle/migrations/2026-06-14-*paper-sim-calibration-state*.sql` | **KEEP AS-IS** | no rename | n/a | Migrations are immutable history — never renamed. |

## 2. DB TABLES

| # | Current | Cat | Proposed | References (drizzle export ∪ raw SQL string) | Notes |
|---|---|---|---|---|---|
| T1 | `paper_sim_trades` (`paperSimTrades`) | **(a)** | `active_trades` (or `active_sim_trades`) | storage.ts, per-underlying-cap, replay-ablation · RAW STRING in 14 files: routes, i1-trade-lifecycle-diagnostics, paper-execution-engine, paper-metrics, pattern-recognizer, provenance-governance, rtb-shadow-store, state-awareness, tec-evaluator, trade-executor, trade-safety, trailing-exit-controller, single-tenant, invariants + 3 test files | THE closed-trades store, mode-keyed (`mode` col). Highest-traffic rename. |
| T2 | `paper_sim_open_positions` (`paperSimOpenPositions`) | **(a)** | `active_open_positions` | storage.ts · raw string in 8 files (subset of the T1 list) | The open-positions store incl. the new B7.2c `state` col. |
| T3 | `paper_sim_sessions` (`paperSimSessions`) | **(a)** | `active_sessions` | storage.ts, paper-sim-service, operation-queue · raw ×3 | Session lifecycle. |
| T4 | `paper_sim_trade_logs` (`paperSimTradeLogs`) | **(a)**/(c)? | `active_trade_logs` OR delete | storage.ts only · raw ×1 | Near-orphan — verify the storage method's callers; if zero, this is a rule-18 delete not a rename. |
| T5 | `paper_trades` (`paperTrades`) — "GLOBAL (legacy table)" per its own schema comment | **(c)**? | DELETE (verify) | storage.ts, routes, ai-summary-task, m5d/m5e-validation-service, screener-recalibration-task, trade-safety, vts-live-comparison-audit (+ vts-runner is a FALSE POSITIVE — a local variable named `paperTrades`, not the table) | The pre-paper_sim legacy trades table. M5-era consumers may themselves be dead — needs the writer/reader liveness walk before disposition. If genuinely written, it's (a). |
| T6 | `paper_daily_briefs` (`paperDailyBriefs`) | **(d)**? | KEEP name (verify) | storage.ts only | Paper-mode briefs; "same structure as live briefs" → a genuine per-mode pair candidate. ⚠️ `user_id`-coupled (the rule-18 userId theme) — flag. |
| T7 | `paper_ai_reports` (`paperAIReports`) | **(d)**? | KEEP name (verify) | storage.ts + client ai-insights.tsx | Same shape as T6; userId-coupled. |
| T8 | `goals_paper` (`goalsPaper`) | **(d) KEEP** | no rename | storage.ts, state-awareness · raw ×2 | Genuine per-mode PAIR with `goals_live` — the exact category-(d) case; the guardrails/goals system reads per mode. |
| T9 | `goal_analysis_history_paper` | **(d) KEEP** | no rename | storage.ts | Pair with `goal_analysis_history_live`. |

## 3. VTS-NAMED-PAPER CHECK (category b)

**No VTS FILE carries "paper" in its filename** (vts-runner / vts-service / vts-trade-persistence are clean). The rule-20 trap runs the OTHER way — "paper"-named files that are really the ACTIVE path (F1–F8). VTS-side "paper" residue is INTERNAL IDENTIFIERS ONLY (e.g. vts-runner's local `paperTrades` variable + `getPaperSessionTrades()` naming) → a rename-in-place sweep item, not a file rename.

## 4. BEYOND FILES/TABLES — the lockstep-reference surfaces (Kyle's "anything that calls them")

1. **API endpoint paths**: `/api/paper-sim/*` (start/stop/active-trades/trades…) — client pages + `start-paper-sim.sh` + any external caller hit these. Renaming routes = a CLIENT-side sweep + ops-script change. **Decision needed: rename routes in this batch or keep API paths stable (alias) and rename only internals.**
2. **Storage method names**: `getPaperSimTrades`/`createPaperSim*`/`updatePaperSimOpenPosition`… (~dozens on IStorage). Ride the table renames or defer? (My recommendation: ride — a half-renamed seam is worse.)
3. **Exported symbol names**: `startPaperSimulation`, `getGlobalPaperSimManager`, `PaperExecutionEngine`, `paperSimHeartbeat`… — every rename cascades through the import sites enumerated above.
4. **Env/config**: `PAPER_SIM_TOKEN` (start script); grep confirms no PM2/package.json "paper" entries.
5. **Log prefixes/UI strings** ("paper" in log tags like `[PAPER_...]`, UI labels "Paper Guardrails") — OUT of scope for the rename (display language, rule-20 taxonomy still calls the MODE "paper"); the batch renames SHARED-PIPE artifacts, not the mode's name.
6. **Governance wording**: CLAUDE.md rule-20's imprecise phrasing corrected in this batch (Kyle #413); SIM/SysManual references sweep at governance.
7. **DB rename mechanics**: `ALTER TABLE … RENAME` migrations + lockstep drizzle schema + raw-SQL sweep; staging + CI DBs pick it up via db:migrate. **Sequencing recommendation: FILES-FIRST (deploy, soak), tables second** — per #413's own risk note.

## 5. Open decisions for Kyle+Langston at sign-off

- D1: exact new-name convention — `active-*` files / `active_*` tables (my proposals above); `paper-sim-service` → `active-trading-service` vs `active-sim-service`.
- D2: API route paths rename now vs alias-and-defer (client blast radius).
- D3: T5 `paper_trades` + F12/F13 validation surface + T4 trade_logs — delete vs rename (liveness walks required; rule-18 dispositions if deleted).
- D4: T6/T7 briefs/reports — genuine (d) keeps, or legacy userId-coupled deletes?
- D5: underscore/dash normalization while renaming (F6).
