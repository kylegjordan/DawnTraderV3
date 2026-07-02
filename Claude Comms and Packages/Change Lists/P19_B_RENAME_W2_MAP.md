# P19-B-RENAME Wave-2 — THE AUTHORITATIVE RENAME MAP (code identifiers only)

**CC-B, 2026-07-03.** Boundary (Langston-ruled): code identifiers ONLY — files/symbols/routes/event keys/module_constants keys. The persisted `'paper_sim'` discriminator (LearningSource/RunMode vocabulary + the `'paper_sim_'` SOURCE_PREFIXES parser in outcome-feedback-store:144) is **keep-as-data** (his ruling; RUNNING_ISSUES entry at close) and is FORKED from everything renamed here (inline literals + its own type; verified no shared constant). His hard condition discharged: the persisted-write path shares NO source symbol with any renamed key; a guard test pins the vocabulary + prefixes unchanged.

## Files (git mv)
| Old | New |
|---|---|
| server/services/paper-execution-engine.ts | server/services/active-execution-engine.ts |
| server/services/paper-portfolio-manager.ts | server/services/active-portfolio-manager.ts |
| server/services/paper-sim-service.ts | server/services/active-engine-service.ts |
| server/services/paper-position-sizing.ts | server/services/active-position-sizing.ts |
| server/services/paper-session-reset.ts | server/services/active-session-reset.ts |
| server/services/paper_sim_heartbeat.ts | server/services/active-engine-heartbeat.ts |
| server/services/paper-sim-diagnostic.ts | server/services/active-scan-diagnostic.ts |
| start-paper-sim.sh | start-active-engine.sh |

## Symbols (word-boundary, tsc-verified)
PaperExecutionEngine→ActiveExecutionEngine · PaperPortfolioManager→ActivePortfolioManager · PaperSimResult→ActiveEngineResult · PaperSimMode→ActiveEngineMode · get/set/clearGlobalPaperSimManager→get/set/clearGlobalActiveEngineManager · PaperPositionSizingParams→ActivePositionSizingParams · PaperPositionSizingResult→ActivePositionSizingResult · sizePaperPositionForSignal→sizeActivePositionForSignal · validatePaperPortfolioValue→validateActivePortfolioValue · PaperSessionResetService→ActiveSessionResetService · paperSessionResetService→activeSessionResetService · PaperSimHeartbeatService→ActiveEngineHeartbeatService · paperSimHeartbeat→activeEngineHeartbeat · PaperSimDiagnosticService→ActiveScanDiagnosticService · paperSimDiagnosticService→activeScanDiagnosticService · paperOperationQueue→activeOperationQueue · startPaperSimulation→startActiveEngine · stopPaperSimulation→stopActiveEngine · getPaperSimulationStatus→getActiveEngineStatus · hardResetPaperSimulation→hardResetActiveEngine (Langston Step-4 catch — the service entry-point API, folded same commit) · PAPER_SIM_TOKEN→ACTIVE_ENGINE_TOKEN · (test-local) PAPER_EXEC_SRC→ACTIVE_EXEC_SRC. **KEPT (already mode-agnostic):** OpenOutcome, getEngineSessionStart, StrategyType, DSEAdjustedResult, applyDSEMultiplier, checkBalanceConfirmationRequired, confirmPortfolioBalance, getEngineByMode, getOrchestratorByMode, HardResetResult, OperationQueue class + the 'paper-trading'/'live-trading' queue labels (mode pairing).

## Event keys (EXACT-string, ordered longest-first; server emit + client listeners + tests SAME commit; old strings grep-to-ZERO)
paper_sim_heartbeat_failure→active_engine_heartbeat_failure · paper_sim_mode_mismatch→active_engine_mode_mismatch · paper_sim_state_inconsistent→active_engine_state_inconsistent · paper_sim_started→active_engine_started · paper_sim_stopped→active_engine_stopped · paper_sim_reset→active_engine_reset · paper_sim_heartbeat→active_engine_heartbeat (AFTER the path form) · paper_trade_executed→active_trade_executed · paper_trade_opened→active_trade_opened

## Routes (clean cut, client callers same commit)
`/api/paper-sim/*` → `/api/active-engine/*` (all `paper-sim` route-string occurrences after the file-path replacements are consumed; ~13 sites routes.ts + client queryKeys)

## module_constants keys (+ DB rows migration `2026-07-03-p19-b-rename-w2-module-keys.sql`)
'paper_execution'→'active_execution' · 'paper_sizing'→'active_sizing' (reads + 2 test mocks + UPDATE module_constants SET module_name)

## Log-only literals (proven console-tag-only)
[PAPER_TRADE_RECORDED]→[ACTIVE_TRADE_RECORDED] · [PAPER_RECORD_FAILED]→[ACTIVE_RECORD_FAILED]

## ORDERING (collision control)
1. File-path/import strings (hyphen + the `/paper_sim_heartbeat` path form) — longest first.
2. Symbols (word-boundary).
3. Event keys exact (heartbeat LAST of its family, after path form consumed).
4. Bare route string 'paper-sim' → 'active-engine' (only routes/comments remain by then).
5. Module keys + token + log tags.

## EXCLUSIONS (never touched — enforced by exact-match construction)
Bare `'paper_sim'` + `'paper_sim_'` prefix (persisted vocabulary, keep-as-data) · paper_sim_trades / paper_sim_open_positions / paper_sim_sessions / paper_sim_trade_logs + their idx names + getPaperSim* storage methods (WAVE 3) · paperTrades/paper_trades (OPEN-2) · paper-metrics.ts + /api/paper/metrics* (OPEN-2) · the 'paper'|'live' mode axis, goals_paper, per-mode pool keys · shipped migration filenames · _archive/**.

## Guard test (Langston condition)
`p19-b-rename-w2-persisted-fence.test.ts`: pins LearningSource === {'vts','paper_sim','live'}, SOURCE_PREFIXES contains 'paper_sim_', and calibration-epoch/b72 warm-up literals unchanged — fails if any future rename drags the persisted vocabulary.
