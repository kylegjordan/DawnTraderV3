# P19-B-RENAME Pre-Audit (Step-2) — #413 paper→active naming cleanup

**CC-B, 2026-07-03.** Scope: `P19_B_RENAME_SCOPE.md` (Langston Step-1 + Step-2 PROCEED on the scope; this doc executes the four named Step-2 tasks). Item-level SSOT: `P19_B_RENAME_INVENTORY_MERGED.md` (Kyle-ruled §5).

## 1. OPEN-6 liveness walk — `paper_sim_trade_logs` → **RENAME (`active_trade_logs`), not delete**
The near-orphan hypothesis is REFUTED. The table is live active-path lifecycle logging:
- **Writers:** `paper-execution-engine.ts` at FIVE sites (`storage.createPaperSimTradeLog(this.mode, …)` — :771/:1523/:2122/:2239/:2812) + `paper-portfolio-manager.ts:606` (mode-threaded per P19-B3b).
- **Readers:** `routes.ts:12968` (`getPaperSimTradeLogs('paper', …)` — a live API endpoint) + the engine's own `getRecentTradeLogs` (:2952).
- **Storage:** typed interface methods (create/get/deleteAll, mode-keyed) + drizzle schema + 3 indexes.
Disposition: Wave-3 rename with its siblings; its storage methods (`createPaperSimTradeLog`→`createActiveTradeLog`…) ride the same wave.

## 2. Neutral-name test (Langston Step-2 condition) — **PASS for both targets**
Full-tree write/read sweeps for `paper_sim_open_positions` and `paper_sim_sessions`:
- `paper_sim_open_positions` is touched ONLY by active-path members: paper-execution-engine, paper-portfolio-manager, tec-evaluator (comment at :106 — paper/live callers pass its id; TEC itself doesn't write the table), trailing-exit-controller, trade-safety, per-underlying-cap, i1-diagnostics, routes, storage. **NO VTS writer** (vts-runner/eval-cycle absent; the VTS open store is `vts_open_trades`).
- `paper_sim_sessions` is touched ONLY by: paper-sim-service, single-tenant config, startup invariants, operation-queue, storage. **NO VTS writer.**
So `active_open_positions` / `active_engine_sessions` are CORRECT names — these are genuinely active-engine-only stores; the `closed_trades` neutral-name reasoning applies only to `paper_sim_trades` (the both-systems sink, as merged-inventory §4 found).

## 3. OPEN-3 gate verified — the pricing latency endpoints are LIVE → **extract-then-delete confirmed**
`server/routes/pricing.ts` serves `GET /api/pricing/latency` (:51 — `paperValidationEngine.getRollingLatencyAverages()`) and `GET /api/pricing/cache-info`, both real registered endpoints. Option (iii) (delete the endpoints too) is OFF the table; the Kyle-consensus disposition stands: **extract the rolling-latency tracker into its own small module** (new home: `server/services/feed-latency-tracker.ts`, ~the tracker class + its ring buffers), repoint pricing.ts's import, THEN delete the M5 harness (`paper_validation_engine.ts` + `routes/paper_validation.ts` + the routes.ts:21867 registration). Regression check at Wave 1: both endpoints serve identical shapes before/after.

## 4. Per-item active-path evidence (CAT-A, for the Step-4 per-item lines)
| File | One-line active-path evidence |
|---|---|
| paper-execution-engine.ts | Referenced by 12+ live files incl. signal-orchestrator, SQE, ready_to_buy_service, mode-registry, event-bus (multiline imports; tsc is the authoritative import-leg check at Step-4) |
| paper-portfolio-manager.ts | Imported/referenced by intent-executor, paper-sim-service, regime-phase + writes trade logs (§1) |
| paper-sim-service.ts | Imported by routes, trade-safety, paper-session-reset, xstock active-dispatch (engine lifecycle owner) |
| paper-position-sizing.ts | Imported by signal-orchestrator + paper-execution-engine + xstock active-dispatch (live sizing path) |
| paper-session-reset.ts | Referenced by routes.ts + paper-sim-service (dynamic/multiline import — loose-grep verified; NOT an orphan) |
| paper_sim_heartbeat.ts | Referenced by auto_test_harness + the clusterBus heartbeat event family (renames with the event key in ONE commit) |
| paper-sim-diagnostic.ts (server) | Imported by routes.ts + signal-orchestrator (scan/filter-trace diagnostic — CAT-A rename; the CLIENT sibling is CAT-C dead, zero importers) |
| start-paper-sim.sh + PAPER_SIM_TOKEN | Ops entry script + its auth token env (lockstep rename) |

## 5. SIM Cross-Cutting registry read (mandatory Step-2)
The registry names the active-engine singletons by their CURRENT file/component names (paper-execution-engine per-mode instances via mode-registry, the operation queue, the B7.2c pending/twin lifecycle callout, the B7.2d shared-helper paragraph). **No structural hazard for a rename** — the registry documents mode-keyed singletons, and B-RENAME changes NAMES not lifecycle/keying. CAT-E must update: the SIM component rows + registry mentions, SysManual mentions, CLAUDE.md rule-20 trap paragraph, Langston's CLAUDE.md :394 trap note (his §13 OPEN-5 rider). The `vts_open_trades` missing-drizzle-declaration gap is REAL (schema.ts has no declaration; raw SQL only) — homed per scope OBJ-4 (RUNNING_ISSUES entry at close, not fixed in-batch).

## 6. Wave-1 deletion dispositions re-verified at head
- CLI chain (`paper-trading-start/stop.ts`, `paper-48hr-simulation.ts`, `scripts/test-phase-6-5-setup.ts`): guard-blocked, importers only within the chain itself (+ the 48hr file is the sole importer of paper-portfolio-manager outside live members — dies together). 
- Client `paper-sim-diagnostic.tsx`: zero importers (CC-A verified, CC-B conceded — stands).
- Root strays (`test-guardrails-paper.ts`, `after-click-paper.png`): untracked-in-code, no importers.
- Walter tables `paper_daily_briefs` + `paper_ai_reports` (Kyle-ruled DELETE): the ai-reports client query is provably dead (no server route); DROP migration + storage-method removal + the ai-insights client read removal; future-roadmap note (daily reports return on our own ML) lands in POST_AUDIT_ROADMAP.
- `PAPER_TRADING_USER_ID` env + `PaperExecutionServiceLegacy` tombstone: die with their owners.

## 7. Execution plan restated (unchanged from scope)
Wave 1 deletions (incl. the §3 extract) → Wave 2 file/symbol/route/event/module-key renames (tsc + enumerated grep-to-zero for compiler-invisible legs) → Wave 3 table renames (own deploy; likely own sub-batch — Langston's call at Step-4). Each wave: own commit set + CI-green + deploy + verify. D7-style: every wave provably name-only (identical vitest pass counts before/after).
