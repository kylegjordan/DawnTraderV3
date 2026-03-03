# DawnTrader Frozen Snapshots Log

> **Purpose**: Tracks frozen baseline states of the repository for rollback.
> Each snapshot records the exact commit hash, date, and what was done after it.
> To rollback to any snapshot, run: `git reset --hard <commit_hash>` in the clone repo.

---

## Snapshots

### SNAPSHOT-000: Pre-Directive Baseline
- **Date**: 2026-02-22
- **Commit**: `5632a370`
- **Full Hash**: `5632a370` (run `git rev-parse HEAD` to get full)
- **Branch**: `dawntrader-v4`
- **Description**: Clean baseline before any Phase 12 directives. All governance documents in place. Onboarding complete. Push script deployed. All three repos in sync.
- **What comes next**: Batch 1 — Critical math fixes
- **Rollback command**: `git reset --hard 5632a370`

### SNAPSHOT-001: After Batch 1 (BUG-004 fix)
- **Date**: 2026-02-22
- **Commit**: `ea6551af`
- **Branch**: `dawntrader-v4`
- **Description**: Batch 1 applied — DI Probability Divergence (BUG-004) fixed. Signal orchestrator now uses geometric DI from `calculateDirectionalIntegrity(closePrices)` instead of confidence-derived fake DI.
- **What was changed**: `server/services/signal-orchestrator.ts` (import + DI calculation, 2 changes)
- **Rollback command**: `git reset --hard 5632a370` (reverts to SNAPSHOT-000)

### SNAPSHOT-002: After Batch 1B (Governance Updates)
- **Date**: 2026-02-22
- **Commit**: `dc17cfd6`
- **Branch**: `dawntrader-v4`
- **Description**: Batch 1B applied — governance documents updated to reflect BUG-004 resolution. DIRECTIVE_INDEX, CHANGES_AND_FIXES, SYSTEM_IMPACT_MAP, SYSTEM_MANUAL all updated. CLAUDE_CODE_PROJECT_INSTRUCTIONS.md added.
- **What was changed**: 5 files in `1-system-manual/` (documentation only, no code changes)
- **Rollback command**: `git reset --hard ea6551af` (reverts to SNAPSHOT-001)

### SNAPSHOT-003: Before Batch 2 (Directive 12.1.2 — Dual Friction Fix)
- **Date**: 2026-02-22
- **Commit**: `dc17cfd6` (same as SNAPSHOT-002 — no intervening changes)
- **Branch**: `dawntrader-v4`
- **Description**: Pre-batch freeze point for Directive 12.1.2 (RISK-009). Dual friction model fix — replacing BASE_FEE_SLIPPAGE flat rate with canonical cost model in signal-orchestrator.ts, expectancy.ts, and analysis-utils.ts.
- **What comes next**: Batch 2 — Fix dual friction models (3 files)
- **Rollback command**: `git reset --hard dc17cfd6` (reverts to SNAPSHOT-002)

### SNAPSHOT-004: After Batch 2 (RISK-009 fix)
- **Date**: 2026-02-22
- **Commit**: `8393a1ef`
- **Branch**: `dawntrader-v4`
- **Description**: Batch 2 applied — Dual friction model fix (RISK-009). Replaced `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` flat rate with canonical `computeTotalRoundTripCost()` in signal-orchestrator.ts (2 locations), expectancy.ts (1 location). Deprecated `calculateFriction()`, `calculatePerUnitFriction()`, `getFrictionRate()` in analysis-utils.ts.
- **What was changed**: `server/services/signal-orchestrator.ts`, `server/core/calculations/expectancy.ts`, `server/utils/analysis-utils.ts`
- **Rollback command**: `git reset --hard dc17cfd6` (reverts to SNAPSHOT-002/003)
- **NOTE**: Replit checkpoint commit `c566fbc2` appeared between SNAPSHOT-003 and this batch. It duplicated our friction fix changes + reformatted files. Our batch `8393a1ef` was committed on top. Autonomy constraints added to `replit.md` to prevent recurrence.

### SNAPSHOT-005: After Batch 2B (Governance Updates for RISK-009)
- **Date**: 2026-02-23
- **Commit**: `67dd76d1`
- **Branch**: `dawntrader-v4`
- **Description**: Batch 2B applied — governance documents updated to reflect RISK-009 resolution. RISK-009 marked RESOLVED in CHANGES_AND_FIXES. UNIFY-001 marked PARTIALLY RESOLVED. FINDING-P1-02 marked RESOLVED in SYSTEM_MANUAL. Cost Model and Signal Orchestrator contamination lines updated in SYSTEM_IMPACT_MAP. Directive 12.1.2 marked COMPLETE in DIRECTIVE_INDEX. Full directive write-up and batch README created in `directives/12.1.2/`. CLAUDE_CODE_PROJECT_INSTRUCTIONS.md completely rewritten with hardened workflow rules. replit.md updated with No Autonomous Changes invariant.
- **What was changed**: 8 files — `CLAUDE_CODE_PROJECT_INSTRUCTIONS.md`, `CHANGES_AND_FIXES.md`, `SYSTEM_IMPACT_MAP.md`, `SYSTEM_MANUAL.md`, `directives/DIRECTIVE_INDEX.md`, `directives/12.1.2/DIRECTIVE_12.1.2.md`, `directives/12.1.2/BATCH_2_README.md`, `replit.md`
- **Rollback command**: `git reset --hard 8393a1ef` (reverts to SNAPSHOT-004)
- **NOTE**: Replit checkpoint commits `f36a3d44` (runtime logs only — clean) and `2047d2a4` (bundled our governance files with runtime state — no source code, no damage, but violated checkpoint discipline) appeared between Batch 2 and Batch 2B. The `replit.md` autonomy constraints are now live.

### SNAPSHOT-006: Before Batch 3 (Directives 12.1.3 + 12.1.4 + 12.1.5)
- **Date**: 2026-02-23
- **Commit**: `67dd76d1` (same as SNAPSHOT-005 — no intervening changes)
- **Branch**: `dawntrader-v4`
- **Description**: Pre-batch freeze point for Batch 3. Three directives combined: 12.1.3 (JWT fallback removal + auth bypass removal, 12 files), 12.1.4 (BUG-020 simulated price display removal, 1 file), 12.1.5 (RiskManager comment/stub cleanup, 5 files). Total: 17 files modified.
- **What comes next**: Batch 3 — Security hardening + simulated price fix + RiskManager cleanup
- **Rollback command**: `git reset --hard 67dd76d1` (reverts to SNAPSHOT-005)

### SNAPSHOT-007: After Batch 3B (Governance Updates for 12.1.3/12.1.4/12.1.5)
- **Date**: 2026-02-23
- **Commit**: `b52e40ea`
- **Branch**: `dawntrader-v4`
- **Description**: Batch 3B applied — governance documents updated to reflect Directives 12.1.3, 12.1.4, 12.1.5 completion. RISK-049/050/051 and BUG-020 marked RESOLVED in CHANGES_AND_FIXES. FINDING-1/2/3 marked RESOLVED in SYSTEM_MANUAL. Layer 10.2 security status updated in SYSTEM_IMPACT_MAP. DIRECTIVE_INDEX updated: 5/18 directives complete. Full directive write-ups created for 12.1.3, 12.1.4, 12.1.5. CLAUDE_CODE_PROJECT_INSTRUCTIONS.md completely rewritten with checkpoint commit documentation and Rule 11. 9 files total.
- **What was changed**: `CLAUDE_CODE_PROJECT_INSTRUCTIONS.md`, `CHANGES_AND_FIXES.md`, `SYSTEM_IMPACT_MAP.md`, `SYSTEM_MANUAL.md`, `directives/DIRECTIVE_INDEX.md`, `directives/12.1.3/DIRECTIVE_12.1.3.md`, `directives/12.1.3/BATCH_3_README.md`, `directives/12.1.4/DIRECTIVE_12.1.4.md`, `directives/12.1.5/DIRECTIVE_12.1.5.md`
- **Rollback command**: `git reset --hard 0ddc8db1` (reverts to Batch 3 code commit)
- **NOTE**: Replit checkpoint commits `1d1a8047` appeared before our batch commit. Platform behavior — expected and documented.

### SNAPSHOT-008: After Batch 4 (Directive 12.2.7 — NLAI System Removal)
- **Date**: 2026-02-24
- **Commit**: `5d5c2051`
- **Branch**: `dawntrader-v4`
- **Description**: Batch 4 applied — NLAI system removed (Wave 4.7). 5 NLAI files deleted (nlai-interpreter.ts, nlai-execution-broker.ts, nlai-action-registry.ts, contextual-nlai-interpreter.ts, execution-policy-controller.ts). 6 consuming files cleaned (routes.ts, live-trading-service.ts, auto_test_harness.ts, paper-sim-service.ts, config-update-service.ts, cognitive-tuner.ts). ~2,147 lines of dead code removed. First dead code purge batch.
- **What was changed**: 5 files deleted, 6 files modified (see above)
- **Rollback command**: `git reset --hard b52e40ea` (reverts to SNAPSHOT-007)
- **NOTE**: Three checkpoint commits (`080078bd`, `b271610e`, `ddc77d86`) appeared before our batch commit. Push script failed to push — official commit created manually via Replit Shell. Platform behavior documented.

### SNAPSHOT-009: After Batch 4B (Governance Updates for Directive 12.2.7)
- **Date**: 2026-02-24
- **Commit**: `dbe063d4`
- **Branch**: `dawntrader-v4`
- **Description**: Batch 4B applied — governance documents updated to reflect Directive 12.2.7 (NLAI System Removal) completion. RISK-037 marked RESOLVED in CHANGES_AND_FIXES. NLAI marked REMOVED in SYSTEM_MANUAL and SYSTEM_IMPACT_MAP. DIRECTIVE_INDEX updated: 6/18 directives complete. Full directive write-up and batch README created in `directives/12.2.7/`. Permission settings section and Scope Files path added to CLAUDE_CODE_PROJECT_INSTRUCTIONS.md. Rules 12 and 13 added.
- **What was changed**: 7 files — `CLAUDE_CODE_PROJECT_INSTRUCTIONS.md`, `CHANGES_AND_FIXES.md`, `SYSTEM_IMPACT_MAP.md`, `SYSTEM_MANUAL.md`, `directives/DIRECTIVE_INDEX.md`, `directives/12.2.7/DIRECTIVE_12.2.7.md`, `directives/12.2.7/BATCH_4_README.md`
- **Rollback command**: `git reset --hard 5d5c2051` (reverts to SNAPSHOT-008)
- **NOTE**: Replit checkpoint commit `8a0f387c` appeared between Batch 4 and Batch 4B. Platform behavior — expected and documented.

### SNAPSHOT-010: Before Batch 5 (Directive 12.2.3 — Wave 3 Sub-Batch A)
- **Date**: 2026-02-24
- **Commit**: `dbe063d4` (same as SNAPSHOT-009 — no intervening changes)
- **Branch**: `dawntrader-v4`
- **Description**: Pre-batch freeze point for Batch 5. Wave 3 Sub-Batch A: delete 9 Walter service files with zero external importers (~2,792 lines). Clean up 1 test file. No active service modifications.
- **What comes next**: Batch 5 — Walter safe deletions (9 files)
- **Rollback command**: `git reset --hard dbe063d4` (reverts to SNAPSHOT-009)

### SNAPSHOT-011: Before Batch 6 (Directive 12.2.3 — Wave 3 Sub-Batch B)
- **Date**: 2026-02-26
- **Commit**: `8a286e64` (After Batch 5B governance updates)
- **Branch**: `dawntrader-v4`
- **Description**: Pre-batch freeze point for Batch 6. Wave 3 Sub-Batch B: delete 10 remaining Walter backend service files + 1 middleware + 5 frontend files + ancillary docs/screenshots. Surgery on 9 backend consumers (routes.ts, index.ts, ai-analyst.ts, ai-opportunities.ts, context-refresh-coordinator.ts, event-broker.ts, corpus-domain-service.ts, feed-integrity-auto-check.ts, formula-auto-audit.ts) + 2 frontend files (App.tsx, sidebar.tsx) + 2 test files. Remove 28 Walter route handlers from routes.ts. HIGH complexity.
- **What comes next**: Batch 6 — Walter importers + frontend + routes cleanup
- **Rollback command**: `git reset --hard 8a286e64` (reverts to Batch 5B)

### SNAPSHOT-012: Before Batch 7 (Directive 12.2.3 — Wave 3 Sub-Batch C)
- **Date**: 2026-02-26
- **Commit**: `eaacf34c` (After Batch 6B governance updates)
- **Branch**: `dawntrader-v4`
- **Description**: Pre-batch freeze point for Batch 7. Wave 3 Sub-Batch C: remove Bob ecosystem (15 files) + Cortex ecosystem (5 files) + related services (purpose-layer, system-truth-diagnostic, provenance-debug, corpus-domain-service, phase-8.6.5 routes) + Walter_Learning_Files training data. Surgery on 12 consuming files (routes.ts, index.ts, lazy-loader.ts, config-change-handler.ts, diagnostic-controller.ts, cognitive-interpreter.ts, phase-8.6.5-enhancements.ts, self-repair.ts, intent-executor.ts, context-refresh-coordinator.ts, enhanced-system-monitoring.tsx, diagnostic-system.test.ts). Split into 7A (deletions) and 7B (surgery). HIGHEST complexity.
- **What comes next**: Batch 7A — Bob + Cortex deletions, Batch 7B — Surgical modifications
- **Rollback command**: `git reset --hard eaacf34c` (reverts to Batch 6B)

### SNAPSHOT-013: After Batch 7B + Hotfix (Directive 12.2.3 COMPLETE)
- **Date**: 2026-02-26
- **Commit**: `39dc23b1`
- **Branch**: `dawntrader-v4`
- **Description**: Directive 12.2.3 (Wave 3: Walter/Bob/Cortex Removal) is COMPLETE. Batch 7A deleted 28 files + 3 directories + 718-file training data tree. Batch 7B surgically modified 12 consuming files (routes.ts ~339 lines, index.ts, lazy-loader.ts, config-change-handler.ts, diagnostic-controller.ts, cognitive-interpreter.ts, phase-8.6.5-enhancements.ts, self-repair.ts, intent-executor.ts, context-refresh-coordinator.ts, enhanced-system-monitoring.tsx, diagnostic-system.test.ts). Batch 7B-hotfix fixed 11 missed broken imports across 4 additional files (routes.ts truth-check routes, reasoning-orchestrator.ts specialist Bob domains, autonomy-controller.ts TradingBob method, learning-cycle-service.ts deleted). Total removal across Directive 12.2.3: ~17,100 lines across ~65 files over Batches 5–7B.
- **Test baseline**: 800 pass / 81 fail (881 total)
- **What comes next**: Batch 7B governance update, then next directive
- **Rollback command**: `git reset --hard eaacf34c` (reverts to SNAPSHOT-012, before Batch 7)

### SNAPSHOT-014: Before Batch 8 (Directive 12.2.1 — Wave 1 Safe Deletions)
- **Date**: 2026-02-27
- **Commit**: `e74e4646` (After Batch 7B governance)
- **Branch**: `dawntrader-v4`
- **Description**: Pre-batch freeze point for Batch 8. Directive 12.2.1 Wave 1 Safe Deletions: delete orphaned DHMA strategy module (dhma.ts, 656 lines) and LATTi safety monitor component (latti-safety-monitor.tsx, 306 lines). Remove LATTi system residuals from routes.ts (orphaned handleLATTITargets, ~137 lines), index.ts (audit telemetry lattiManaged properties, ~53 lines), schema.ts (lattiBaselineHistory table + 3 systemContext fields, ~43 lines). Clean LATTi text references from 7 client goal components (~60 lines). Remove expectedDuration from SizedStrategySignal interface. 13 files total, ~1,254 lines removed.
- **What comes next**: Batch 8 — LATTi residuals + DHMA orphan + expectedDuration cleanup
- **Rollback command**: `git reset --hard e74e4646` (reverts to Batch 7B governance)

### SNAPSHOT-015: After Batch 8 (Directive 12.2.1 — Wave 1 Safe Deletions COMPLETE)
- **Date**: 2026-02-27
- **Commit**: `8086264c`
- **Branch**: `dawntrader-v4`
- **Description**: Batch 8 applied — Directive 12.2.1 (Wave 1 Safe Deletions) COMPLETE. 2 files deleted (dhma.ts 656 lines, latti-safety-monitor.tsx 306 lines). 11 files surgically modified: routes.ts (handleLATTITargets function + LATTI route comment removed, ~137 lines), index.ts (LATTI comment/log removed, lattiManaged→systemManaged rename in 2 audit blocks), schema.ts (lattiBaselineHistory table + 3 systemContext LATTI fields removed), enhanced-system-monitoring.tsx (LATTISafetyMonitor import+render removed), target-daily-goals.tsx (full rewrite: LATTI query/interface removed, static pace defaults), 5 client goal components (LATTI text→system text), signal-orchestrator.ts (expectedDuration field+write removed). ~1,254 lines of dead code removed across 13 files.
- **Test baseline**: 800 pass / 81 fail (881 total) — unchanged
- **What comes next**: Batch 8B governance update, then next directive
- **Rollback command**: `git reset --hard e74e4646` (reverts to SNAPSHOT-014, before Batch 8)

### SNAPSHOT-016: Before Batch 9 (Directives 12.2.9 + 12.2.2 — Frontend Dead Pages + MarketScanner Removal)
- **Date**: 2026-02-27
- **Commit**: `8e6e18aa` (After Batch 8B governance)
- **Branch**: `dawntrader-v4`
- **Description**: Pre-batch freeze point for Batch 9. Directive 12.2.9: delete 6 orphaned frontend pages (admin.tsx, analysis.tsx, command-center.tsx, history.tsx, search.tsx, settings-old-backup.tsx, ~2,453 lines). Directive 12.2.2: remove MarketScanner class from market-scanner.ts (~633 lines), preserve collectAdaptiveBatch + diagnostic buffers. Surgery on routes.ts (import, instantiation, startHourlyScanning, /market/overview route), market-scan-task.ts, startup.ts, status.ts, App.tsx (stale History import). ~3,100 lines removed across 11 files.
- **What comes next**: Batch 9 — Frontend dead pages + MarketScanner class removal
- **Rollback command**: `git reset --hard 8e6e18aa` (reverts to Batch 8B governance)

### SNAPSHOT-017: After Batch 9 (Directives 12.2.9 + 12.2.2 — COMPLETE)
- **Date**: 2026-02-27
- **Commit**: `8b6bb540`
- **Branch**: `dawntrader-v4`
- **Description**: Batch 9 applied — Directives 12.2.9 (Frontend Dead Pages) + 12.2.2 (MarketScanner Class Removal) COMPLETE. 6 frontend pages deleted (admin.tsx 302, analysis.tsx 512, command-center.tsx 901, history.tsx 252, search.tsx 186, settings-old-backup.tsx 248 = ~2,453 lines). MarketScanner class removed from market-scanner.ts (1,363→726 lines, 637 lines deleted). collectAdaptiveBatch + diagnostic buffers preserved. 5 consuming files cleaned: routes.ts (import, instantiation, startHourlyScanning, /market/overview route), market-scan-task.ts (dead import+instantiation), startup.ts (service list entries), status.ts (health check entry), App.tsx (stale History import). ~3,110 lines removed total.
- **Test baseline**: 800 pass / 81 fail (881 total) — unchanged
- **What comes next**: Batch 9B governance update, then next directive
- **Rollback command**: `git reset --hard 8e6e18aa` (reverts to SNAPSHOT-016, before Batch 9)

### SNAPSHOT-018: Before Batch 10 (Directive 12.2.8 — Walter-Era Learning Services + Residual Cleanup)
- **Date**: 2026-02-27
- **Commit**: `19e2c376` (After Batch 9B governance)
- **Branch**: `dawntrader-v4`
- **Description**: Pre-batch freeze point for Batch 10. Directive 12.2.8: delete 3 orphaned service files (cognitive-interpreter.ts 589, event-broker.ts 247, phase-8.6.5-enhancements.ts 527 = ~1,363 lines). Fix autonomy-controller.ts broken getLearningStats() call + remove TradingBob from agents array. Remove LATTi lazy-loader stub (RISK-044). Clean misleading [LATTIManager] log prefixes in routes.ts. Remove 3 orphaned Walter storage methods from storage.ts. ~1,500 lines removed across 7 files.
- **What comes next**: Batch 10 — Dead learning services + bug fix + residual cleanup
- **Rollback command**: `git reset --hard 19e2c376` (reverts to Batch 9B governance)

### SNAPSHOT-019: Before Batch 11 (Directives 12.2.6 + 12.2.5 — Goal Alignment Gate + Friction Functions)
- **Date**: 2026-02-27
- **Commit**: `86aa8d79` (After Batch 10B governance)
- **Branch**: `dawntrader-v4`
- **Description**: Pre-batch freeze point for Batch 11. Directive 12.2.6: remove Goal Alignment Gate — delete alignment-verifier.ts (379 lines) and strategic-policy-guard.ts (379 lines). Surgery on autonomy-controller.ts (remove gate check), routes.ts (remove /alignment/* routes ~138 lines + strategicPolicyGuard references in 3 strategic routes + /strategic/compliance endpoint), schema.ts (remove alignmentAuditLog + valueAlignmentMatrix tables ~35 lines), enhanced-system-monitoring.tsx (remove AlignmentTab ~295 lines). Directive 12.2.5: remove 3 deprecated friction functions from analysis-utils.ts (~39 lines). Migrate vts-service.ts to canonical cost model. ~1,440 lines removed across 10 files.
- **What comes next**: Batch 11 — Goal Alignment Gate removal + deprecated friction function removal
- **Rollback command**: `git reset --hard 86aa8d79` (reverts to Batch 10B governance)

### SNAPSHOT-020: After Batch 12 (Directive 12.3.2 — Strategy Specification Placement)
- **Date**: 2026-03-03
- **Commit**: `aa269823`
- **Branch**: `dawntrader-v4`
- **Description**: Batch 12 applied — Directive 12.3.2 (Strategy Routing Expansion) spec phase COMPLETE. Mathematical specification for 8 unimplemented strategies (3 PATTERN + 5 HYBRID) placed in `1-system-manual/directives/12.3.2/`. Specification vetted by 4 LLMs across 2 rounds with 30 consensus decisions incorporated (6 bugs, 3 safeguards, 11 calibrations, 10 enhancements). Documentation only — no code changes, no runtime impact. DIRECTIVE_INDEX.md updated to show 12.3.2 as SPEC COMPLETE.
- **What was changed**: 2 files created (`DIRECTIVE_12.3.2.md`, `STRATEGY_SPECIFICATION_12.3.2_FINAL.md`), 1 file modified (`DIRECTIVE_INDEX.md`)
- **Test baseline**: 800 pass / 81 fail (881 total) — unchanged
- **What comes next**: Batch 12B governance update
- **Rollback command**: `git reset --hard 2064d5c9` (reverts to Batch 11B governance, before Batch 12)

### SNAPSHOT-021: After Batch 13 (Phase 12.3 Pipeline Unification — Directives 12.3.1 + 12.3.3 + 12.3.2 Implementation)
- **Date**: 2026-03-03
- **Commit**: `4d8ef060`
- **Branch**: `dawntrader-v4`
- **Description**: Batch 13 applied — Phase 12.3 Pipeline Unification mega-batch. Three directives implemented in one batch: Directive 12.3.1 (Regime Authority Resolution — DSS rewired to `calculatePairRegime()`, canonical 5-regime model, EXTREME_NOISE preserved as pre-filter, BUG-006 RESOLVED, BUG-008 partially resolved). Directive 12.3.3 (NGC replaced with deterministic confidence formula, rolling normalization bypassed). Directive 12.3.2 (8 new strategy modules implemented — morning_star, inside_bar_reversal, support_bounce, pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge. StrategySignal type expanded from 9 to 17. strategy-sync.ts updated to 17 canonical strategies. Signal orchestrator wired with 8 new evaluation blocks).
- **What was changed**: 5 files modified (dynamic-strategy-selector.ts, signal-orchestrator.ts, strategy-engine.ts, strategy-sync.ts, quality_index.ts), 10 files created (8 strategy modules + strategy-helpers.ts + index.ts barrel export)
- **Test baseline**: 791 pass / 90 fail (881 total) — 9 new failures from expected interactions (regime string detection in new files, telemetry aggregator import changes)
- **What comes next**: Batch 13B governance update
- **Rollback command**: `git reset --hard aa269823` (reverts to SNAPSHOT-020, before Batch 13)
- **NOTE**: Replit checkpoint commit `67afdc1e` appeared before our official batch commit `4d8ef060`. The checkpoint contains all actual code changes (18 files, 5087 ins / 2414 del). The official batch commit only contains a trivial log file change. Platform behavior — expected and documented.

---

*New snapshots added before each batch of changes.*
