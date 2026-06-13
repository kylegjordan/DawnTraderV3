# P19-B3b — #137 Baseline Triage + Active-Path Error Fixes (Pre-Audit / Step 2)

> **Phase 19 · Batch 3 · sub-batch B.** Author: Claude New (CC-B). Reviewer: Langston (split-gate). Decider: Kyle (autonomous-iteration directive 2026-06-13).
> Ground truth: bench `69e03c3a3`, `npx tsc --noEmit` = **474 errors / 66 files** (baseline `.tsc-baseline.json` froze 494 at `b0a4292`; B3a already retired 20 under-baseline). This doc sorts ALL 66 files into FIX-now (active paper-trading path + the 2 named landmines) vs HOMED (concrete future home each). **Nothing is fixed until Langston signs off on this split.**

---

## PREVIOUSLY-STATED-VS-NOW (§9.2)
- **Real error count: PREVIOUSLY "231/54" (stale P19-B1-era). NOW: 474 errors / 66 files (current tsc), baseline 494. REASON: the baseline was never line-triaged; #137 = this triage.**
- **B3b fix-set size: PREVIOUSLY implied "all 66 files." NOW: 13 active-path files (59 errors) + the 2 landmines. REASON: blast-radius tracing (SIM Layers 3–6 + 2 reachability sweeps) shows ~390 of the 474 are OFF the active paper-trading runtime path → homed, not fixed here.**

---

## 1. How the split was derived (blast-radius method, per Kyle 2026-06-13 directive)
Grounded in **SIM Layers 3–6** = the active paper-trading runtime pipeline (FX5 scanner → active-filter-pool → signal-orchestrator → SQE → RTB → TCL → paper-execution-engine → trailing-exit/pre-exec-validator; regime via MCE). Layer 7 (VTS) is a SEPARATE system (rule 20). Two Explore reachability sweeps traced every ambiguous file's importers; CC then directly verified the rule-20 filename-trap files. A file is **ACTIVE-PATH** only if a canonical pipeline file imports/calls it.

**Verification catches (where filename ≠ reachability):**
- `factor-ablation-emitter.ts` — labeled observational, but signal-orchestrator imports it (:114) and CALLS it (:1010) per admitted signal → **ACTIVE-PATH** (red-flag catch).
- `commitTradeAndUpdatePortfolio.ts` — looks active, but only the **dormant live** `trading-engine.ts:483` + a manual route (`routes.ts:5420`) call it; the paper engine never does → **HOME-G (Phase-21 live)**.
- `paper-portfolio-manager.ts` — reached via `paper-sim-service.ts` (the active-paper engine/lifecycle manager that owns `startPaperSimulation`/`stopPaperSimulation`) → **ACTIVE-PATH**.
- `unified-core.ts` (21 errors) — name suggests core; actually an admin-gated cognitive self-check aggregator (queries the **dropped** `ethical_audit_log` table, stale singleton names) → **HOME-C**, several lines are rule-18 legacy.

---

## 2. THE SPLIT — all 66 files, 474 errors (exhaustive; CI baseline unchanged for HOMED)

### 2a. FIX in B3b — ACTIVE PAPER-TRADING PATH (13 files, 59 errors)
| File | errs | Dominant fix pattern |
|---|---|---|
| signal-orchestrator.ts | 18 | OHLC object-vs-array shape (1349–1368); metrics type missing regime/driftScore/volZ; **wrong import path** `../../config/`→`../config/strategy-governance.js` (568); missing `assetClass` arg (1153/1161); SizedStrategySignal/StrategySignal shape |
| ready_to_buy_service.ts | 9 | **LANDMINE #2** — `ngc`/`riskScore`/`profitRate` read but absent from `SQESignalInput` |
| paper-execution-engine.ts | 3 | `signalType`/`patternType`/`patternStrength` metadata not on StrategySignal (2116–2118) |
| pre-execution-validator.ts | 2 | `string\|null`→`string` null-safety (92–93) |
| trailing-exit-controller.ts | 5 | arg-count (586/593); warmup-status missing `refreshFailCount`/`stalenessMs` (1374/1384/1391) |
| market-context-engine.ts | 1 | `regimeScore` not on RegimeCalculationResult (1776) |
| fx5-scanner.ts | 6 | null-safety (789/1189–1191); `ScanDiagnostics.familyPaths` missing (1395); `isBenchmark` union (1592) |
| per-underlying-cap.ts | 3 | `{}`→`ResolutionKey` (asset-class resolution; B69 threading) |
| paper-portfolio-manager.ts | 5 | arg-counts (65/597/606/622); `userId` not in `{mode}` (409 — rule-18) |
| run-mode-controller.ts | 1 | `Promise<RunMode>`→`Promise<void>` (53) |
| adaptive-scan-manager.ts | 1 | `string`→`MarketRegime` (193) |
| guardrail-policy.ts | 4 | `lockedByUser` removed (447/522 — rule-18); stale `activeFilterPool` import (467); **missing `./global-live-engine.js`** (481 — LIVE branch, see Q4) |
| factor-ablation-emitter.ts | 1 | `{}`→`ResolutionKey` (212 — same B69 pattern as per-underlying-cap) |

### 2b. FIX in B3b — LANDMINE #1 (vts-runner.ts, subset of its 25 — see Q2)
Phase10TradeRecord learning-substrate completeness: `assetClass` missing on Phase10TradeRecord (3802), record not assignable (3867), `netEV` on VirtualSignal (3742/3761), + the ~13 optional context fields the lean literal leaves blank → archived `undefined` (documented in-code at L563–567 / L1990–1998; B-NEW-53.1 already fixed one such field). The active-paper path will write into this same labeled substrate (Item-4 Phase-B), so it must be clean.

### 2c. HOMED — NOT fixed in B3b, stays suppressed in baseline (each with a concrete home, rule §9.4)
| Home | Files (count) | errs | Concrete destination |
|---|---|---|---|
| **A — routes/API surface** | routes.ts, routes/vts.ts (2) | 200 | **NEW batch "P19-B6 routes/API type-alignment."** API surface, not the runtime pipeline; tsc errors in request handlers don't break the trading loop. |
| **B — storage/schema + userId** | storage.ts (1) | 19 | **NEW batch "storage/schema type-alignment + userId-decouple."** 10/19 are rule-18 `table.userId` on schemas that dropped the column. (See Q5 — 3 paper-sim lines may pull into B3b.) |
| **C — advisory/cognitive meta** | unified-core, autonomy-scheduler/controller, actuation-policy, reasoning-orchestrator, adaptive-objective-engine, state-awareness, knowledge-retrieval, ethics-consensus-orchestrator, ethical-reasoning-engine, ethical-reasoner, gemini-adaptive-profiler, memory-lifecycle (13) | 67 | **NEW "cognitive/advisory subsystem audit"** — admin-gated self-check/ethics/awareness layer, none on the trade path. Several are rule-18 legacy (unified-core → dropped `ethical_audit_log`) → DELETED_COMPONENTS candidates within that audit. |
| **D — UI/client** | machine-learning.tsx, enhanced-system-monitoring.tsx, active-trades-v2.tsx, ready-to-buy-table.tsx, guardrails-tab.tsx, copy-to-live-modal.tsx, alert-banner.tsx (7) | 37 | **Phase 20 UI type-cleanup batch.** |
| **E — VTS/learning passive** | telemetry-aggregator, adaptive-learning-repository, vts-service, vts-telemetry, drift-detector, drift-dashboard-aggregator, paper-48hr-simulation, learning-feedback (8) | 29 | **NEW "VTS/learning type-cleanup."** Layer-7 passive (rule 20). (vts-runner's non-substrate errors land here too if Q2=subset.) |
| **F — infra/validation/jobs** | m5d/m5e/c13/stage-b/paper_validation validators, intent-executor, diagnostic-controller, alert-action-handler, narrative-feed, system-config, system-health-check-task, ai-summary-task, screener-recalibration-task, auto_test_harness, feed-integrity-auto-check, replay-ablation, partition-exporter (17) | 31 | **NEW "infra/test-harness type-cleanup."** Test harnesses + jobs + scripts; none gate live trades. |
| **G — live-dormant (Phase 21)** | trading-engine, commitTradeAndUpdatePortfolio (2) | 4 | **Phase 21 (live mode).** Bypassed during paper-active; both carry rule-18 `userId`. |
| **H — legacy-candidate (rule 18)** | command-router, experience-memory (2) | 3 | **DELETED_COMPONENTS_LOG review / dated deletion.** command-router superseded by intent-executor (no live callers); experience-memory has no importers. |

**Coverage check:** 13+1 (fix) + 13+2+1+7+8+17+2+2 (home) = **66 files / 474 errors, zero unassigned.**

---

## 3. Recurring root-cause patterns (the "accumulated change broke the dormant path" — rule 20)
1. **Asset-class threading gaps (B69):** `{}`→`ResolutionKey` in per-underlying-cap + factor-ablation-emitter; missing `assetClass` arg in orchestrator. The DB-resolution layer isn't receiving the class key.
2. **Legacy userId coupling (rule 18):** storage.ts ×10, guardrail-policy `lockedByUser`, paper-portfolio-manager :409, commitTradeAndUpdatePortfolio/trading-engine. System is mode-based; these read a dropped dimension.
3. **Type-shape drift:** OHLC `{ohlc,last}` treated as array; metrics tuple missing fields; warmup-status missing fields; ScanDiagnostics missing `familyPaths`.
4. **Stale/wrong imports:** orchestrator path typo (real file, wrong `../`); guardrail-policy missing live-engine module; guardrail-policy stale `activeFilterPool` re-export.
5. **Arg-count drift:** signatures changed, callers not updated (trailing-exit, paper-portfolio-manager).

---

## 4. THE TWO LANDMINES (silent-failure bugs Kyle named)

### Landmine #2 — RTB silently drops EVERY signal (CRITICAL; active-path) ✅ root-caused
`signal-orchestrator.ts:646–672` builds `sqeSignalInput` and **never sets `ngc`, `riskScore`, `profitRate`** (not in the literal). `queueSQESignal` then does `input.ngc.toFixed(4)` (:1671), `input.riskScore.toString()` (:1737), `input.profitRate.toString()` (:1738). At runtime `input.ngc` is `undefined` → `TypeError` → the fire-and-forget `.catch(err => console.error(...))` at `:678` swallows it. **When paper-active turns on, every SQE-qualified signal throws and is silently dropped → zero trades ever queue.** `extendedMetrics` already carries `riskScore` + `profitRate` (visible in its own error type); they're just not threaded into the literal.

**Proposed fix:** (a) declare `ngc`/`riskScore`/`profitRate` on `SQESignalInput`; (b) populate them at the orchestrator build-site (`riskScore`/`profitRate` from extendedMetrics; `ngc` ← confidence per the `:1736` "Use NGC as confidence" mapping); (c) make the `:678` catch LOUD (counter + distinct ERROR, not a quiet console.error that reads as normal). **This restores intended behavior — not an architecture change.** See **Q3** for the `ngc`-naming decision.

### Landmine #1 — VTS learning substrate archives blanks ✅ root-caused
The lean `Phase10TradeRecord` (vts-runner :483) has ~13 OPTIONAL context fields a builder can leave unset; the admitted-features archive reads them → `undefined`. B-NEW-53.1 already fixed `expectedEdge` (read from the SSOT `OpenVirtualTrade` instead). Remaining: align the record + archive read so every field active-paper will co-write is populated (+ the tsc gaps: `assetClass` on Phase10TradeRecord, `netEV` on VirtualSignal, record-assignability). **Proposed fix:** complete the record type + repoint the archive read at the SSOT open-trade for the blank fields; add `assetClass`. See **Q2** for scope (substrate-subset vs whole-file).

---

## 5. OPEN DECISIONS FOR LANGSTON (split-gate)
- **Q1 (the split):** Agree with §2's 4-way split + the 8 concrete homes (A–H)? Any file in HOME-C/E/F you read as actually active-path (beyond the factor-ablation-emitter catch)? Confirm commitTradeAndUpdatePortfolio→HOME-G is right (only dormant-live + manual-route callers).
- **Q2 (landmine #1 scope):** Fix only vts-runner's **learning-substrate subset** in B3b and HOME the ~18 VTS-internal telemetry/diagnostics errors (quantPatternDetected→patternDetected, ScanDiagnostics, VTSCycleMetrics, snapshot tuples, filterTier-on-OpenVirtualTrade) to HOME-E? Or clear all 25 here?
- **Q3 (landmine #2 naming):** SIM says NGC was "replaced" by deterministic confidence. (3a) add `ngc` as a field (cements legacy naming, matches DB `ngc` column) vs (3b) retire `ngc` from the RTB read path, use `confidence`, keep writing the DB column from confidence. Recommend **3b** (don't re-entrench retired naming) — your call. And: agree the `:678` catch becomes a loud surfaced failure?
- **Q4 (guardrail-policy live branch):** `global-live-engine.js` doesn't exist; referenced only in the dormant LIVE kill-switch branch. Make it a typed explicit "live kill-switch not wired until Phase-21" path (no broken import), paper branch untouched — agree?
- **Q5 (storage.ts):** Pull the 3 paper-sim lines (paper_sim_sessions :3647, portfolio cash/cryptoValue :3781–3782, session :4225) into B3b active-path (active-paper writes through them at runtime) and HOME the other 16 (userId/drizzle) to HOME-B? Or HOME all 19?

**No fixes land until Q1–Q5 are answered. Kyle's standing directive: surface only genuine legacy-vs-current ambiguity or architecture-changing decisions — none of the above changes architecture; they restore the dormant path.**
