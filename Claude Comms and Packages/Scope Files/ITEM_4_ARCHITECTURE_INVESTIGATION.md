# ITEM 4 — Three-System Untangle: Architecture Investigation + Timing Recommendation

> Kyle directive 2026-06-09: the small "VTS standalone" scope is wrong — all three systems (VTS / paper / live) share helpers and a mode-switch, and must be untangled. Kyle asked: investigate the full shared surface + the switch + throughput, think hard about **timing (do it now vs. a better place)**, and produce findings + a recommendation he reads BEFORE it goes to Langston.
>
> **Status:** CC findings + recommendation, 2026-06-09. Code-level investigation (files cited). No build.

---

## 0. ★ CORRECTED FINDINGS + CONVERGED RECOMMENDATION (CC + Langston code-verified joint dig, 2026-06-09)
**Kyle directed a joint dig with Langston. Result: Kyle's mental model is CORRECT on all four pillars; my §2/§5 first-read below was WRONG on two load-bearing points. This section supersedes them.**

**Kyle's model — VERIFIED correct (Langston, code-level):**
1. **VTS genuinely STOPS when active trading turns on** — it is NOT merely relabeled. The kill is in `vts-runner.ts` (`:3108` skip-cycle, `:3941-3945` the loop calls `stopAutonomousSimulation()` and tears down the interval, `:3909` refuses to start) — all gated on `tradingActive` (= `!passiveLearning` = `!isEngineActive`). `startPaperSimulation` flips `setEngineActive(true)` → VTS interval torn down. **(My draft marked this ◑ "likely relabeled" — WRONG; my grep missed it because the gate var is `tradingActive`, not `isEngineActive`. This is the whole reason item 4 exists: you cannot turn on active-paper today without going dark on VTS learning.)**
2. **Live ≠ a clone of paper.** PAPER runs on `PaperExecutionEngine` (flow: orchestrator → SQE → RTB queue → TCL → execution). LIVE runs on a DIFFERENT, older class `TradingEngine` (`globalLiveEngine`, `routes.ts:99/3651`) on the **pre-RTB-queue direct `processSignal` flow that paper explicitly abandoned**. Plus two DEAD constructs: `globalPaperEngine` (TradingEngine 'paper', `.start()` never called — vestigial) and `global.tradingEngines` (a literal stub object — dead placeholder). **(My draft said "live is literally a 2nd instance of the same class" — WRONG. Lighting up live is a REBUILD, not a copy-paste from paper.)**
3. **One shared UI scaffolding** — single `TradingModeContext` (binary mode, localStorage), `invalidateQueries()` on switch, same components re-fetch mode-scoped data; no per-mode pages; VTS has no trading page (telemetry-only). **Exactly Kyle's model.**
4. **Legacy is SEPARABLE (better than my draft implied):** `PaperExecutionEngine`'s real constructor is `constructor(mode)` (mode-only; the 1 `userId` ref is ignored/audit-only). The genuinely-legacy `paper-48hr-simulation.ts` has ZERO importers (dead). So the to-be-deleted legacy is dead entrypoints, not load-bearing wiring.

**CONVERGED RECOMMENDATION (CC + Langston agree; Langston drew the boundary tighter — adopted):**
- **DO NOW (item 4 — bounded, testable with ZERO real trades):** (a) **decouple VTS's always-on loop from the `tradingActive` kill** (the `vts-runner.ts:3108/3909/3941` guards + the `passiveLearning`/`isEngineActive` derivation) so the firehose keeps learning while active-paper runs — THIS is the real item-4 ask; (b) **D1 mode-stamp per-producer** + (c) **D9 single-writer learning** so active-paper doesn't silently corrupt the firehose's data/learning. Small, bounded, no live involvement.
- **DEFER — do NOT do now (carve OUT of item 4):** the **live `TradingEngine` reconciliation** (RTB-queue parity with paper, deleting the vestigial `globalPaperEngine` + the `tradingEngines` stub, building live properly). This is **Phase-16 legacy cleanup (kill the dead constructs) + Phase-21 live-bringup (build live for real)**. **Building a "live stub" NOW buys nothing** — live stays dormant through Phase 19 regardless, and it's a rebuild not a clone, so a stub now is throwaway work.
- **NET:** item 4 is NOT "untangle all three systems now." It is **"free VTS from the active-trading kill + stop the two contamination points."** The big/scary part (the divergent stale live engine) is real but belongs LATER, where it naturally lands. This keeps the now-work small and de-risks Phase 19 (debug paper-active alone, not paper-active + a concurrency/live rebuild). The throughput/three-on-under-load question is still untouched → deep pre-audit.

**Original first-read findings (§2/§5 below) retained for the record — but the two ❌ corrections above override them.**

---

## 1. WHAT I INVESTIGATED (at code level)
The mode-switch (`trading-state-sync.ts`, `mode-registry.ts`, `run-mode-controller.ts`), and the six shared systems Kyle named or implied: signal orchestrator, SQE + ready-to-buy queue, RTB-refresh, TCL watchdog, TEC (trailing-exit), and the paper/live execution engine — plus how VTS relates to all of them, and whether live mode actually exists.

## 2. THE KEY FINDING (changes the size of this materially)
**The system is FAR more concurrency-ready than "one-pipeline-with-a-switch" suggested.** Through the Phase-27 mode-registry work + the B79.0n per-class/per-mode umbrella, most of the active-path pipeline is **already built to run paper AND live at the same time.** The "one mode at a time" constraint is NOT spread through every component — it's concentrated in the **switch (control plane)** plus a few genuinely-shared single-instance points.

**Concurrency-readiness, per component (code-verified):**
| System | Today's shape | Concurrency-ready? |
|---|---|---|
| **Execution engine** (`paper-execution-engine.ts`) | `class`, `constructor(mode)`, registered per-mode in `mode-registry.ts` | ✅ **per-mode-instanced** — live is literally a 2nd instance of the same class |
| **Signal orchestrator** (`signal-orchestrator.ts`) | `class`, holds `private mode: 'live'\|'paper'`, constructed per-mode | ✅ **per-mode-instanceable** |
| **SQE + Ready-to-Buy** (`ready_to_buy_service.ts`) | singleton, but state is `Map<TradingMode, …>` (intervals, handlers, failsafe) | ✅ **mode-keyed internally** (serves paper+live concurrently) |
| **RTB-refresh** (`rtb-refresh-service.ts`) | singleton; `refreshModeSignals(mode)` loops `['paper','live']` each cycle | ✅ **mode-concurrent by design** |
| **TCL watchdog** (`tcl_watchdog.ts`) | singleton, state is `Map<TradingMode, TCLState>` | ✅ **mode-keyed internally** |
| **TEC** (`trailing-exit-controller.ts`) | stateless functions over per-asset-class config; no per-mode state | ✅ **shareable** (like MCE) |
| **MCE / pattern / strategy math** | singletons, per-symbol cache + per-class config, no per-producer state | ✅ **shareable** (compute-once, fan out — F7) |
| **The switch** (`trading-state-sync.ts`) | `isEngineActive` is a single binary; `passiveLearning = !isActive` (derived) | ❌ **the core constraint — mutually exclusive by derivation** |
| **Global run-mode label** (`run-mode-controller.ts`) | one global `getCurrentMode()`, precedence live>paper>vts | ❌ **mislabels firehose rows once paper on (D1)** |
| **Learning store** (`outcomeFeedbackStore`) | one shared store, key `(assetClass,regime,strategy)`, no producer dim; `paper-execution-engine.ts:1397` already writes it | ❌ **contaminates firehose learning once paper on (D9)** |
| **VTS runner** (`vts-runner.ts`) | runs the 60s loop; **NO internal `isEngineActive` gate found** — governed by how it's started, not a live self-halt | ◑ **likely keeps running / only relabeled — confirm in pre-audit** |

## 3. WHAT THIS MEANS
- **"Untangle three systems" is NOT a ground-up rebuild.** The per-mode pipelines (orchestrator, execution, RTB/SQE, RTB-refresh, TCL) already exist; the shared compute (MCE/pattern/strategy/TEC) is already shareable. The real untangle is the **control plane**: (a) the switch — change from "one engine active at a time" to **independent on/off per system**; (b) the 2 contamination/labeling points (D1 mode-stamp per-producer, D9 single-writer learning); (c) confirm + cement VTS as genuinely always-on (it may already be — needs the pre-audit to confirm it's not externally stopped on engine-start).
- **Live mode = the dormant second instance of the paper engine.** There is no separate, fully-built live system to untangle — "rebuild paper, copy-paste for live" is literally the existing design (`getEngine('live')` → a `PaperExecutionEngine`). Live doesn't need to WORK for this untangle; it stays the dormant instance until Phase 21.
- **Throughput is more bounded than "3× everything."** Shared compute runs ONCE (MCE/pattern computed per symbol per cycle, fanned out). The marginal cost of paper+live is their per-mode pipeline instances — which already exist. The real throughput question is the per-mode execution loops + the queue refresh under concurrency; that needs MEASURING (load probe), not guessing — flagged for the pre-audit, not asserted here.

## 4. HONEST UNCERTAINTIES (go to the deep pre-audit; do NOT change the recommendation's shape, only its exact size)
1. Whether VTS is actually STOPPED on engine-start or merely RELABELED (the grep found no self-halt; needs the start/stop wiring traced).
2. The exact start/stop mutual-exclusion wiring (which route/code enforces "one at a time").
3. A real throughput/capacity measurement with all three on.
4. Any shared single-instance state I haven't yet hit (cost-model, friction, SQE confidence chain, telemetry exclusivity — Langston's R-L list).

## 5. RECOMMENDATION ON TIMING — do the control-plane untangle NOW; stage the rest

**Recommendation: YES, untangle now — but understand it's the CONTROL PLANE, which is smaller than it sounded, and it does NOT mean "prove all three systems working concurrently now."** Reasoning, weighing the debugging-pain concern:

- **The pre-19 minimum is already most of the untangle, and it's unavoidable.** Item 4 exists because VTS must keep learning through Phase 19's start/stop debugging. The two contamination fixes (D1/D9) MUST land before paper-active turns on regardless (else paper silently corrupts VTS data + learning). And keeping VTS always-on through engine restarts is the switch's job. So the "minimum to make Phase 19 safe" already IS the control-plane untangle.
- **It's bounded and cheap to debug, because nothing real is trading yet.** The untangle is testable in isolation: does VTS keep running + stay cleanly partitioned when a paper engine starts/stops, with zero real trades? That's a control-plane test, not a "does the strategy make money" test. Breakage now is cheap — the system isn't live.
- **It does NOT compound with Phase 19's big unknown.** Phase 19's real risk — does paper-active even work after months of drift — is SEPARATE from and AFTER the untangle. Doing the untangle now means Phase 19 debugs ONE thing (paper-active working), not two (paper-active working AND a concurrency rebuild). That directly avoids the "finding breaks for a long time" pain Kyle's worried about — we don't front-load debugging of systems (paper-active, live) that aren't working yet.
- **The alternative (defer the untangle) is the moving-target trap.** If Phase 19 builds/debugs paper-active on the current mutually-exclusive switch, then VTS is interrupted throughout Phase 19 (lost firehose), AND we'd later have to re-open and re-test the now-working paper path to make it concurrent — re-debugging a thing we just stabilized. Worse.

**So the staging is:** (1) **NOW — control-plane untangle** (switch → independent on/off; D1 mode-stamp; D9 single-writer learning; always-on-VTS decoupling; shared-compute fan-out seam). Live stays dormant. (2) **Phase 19** — get paper-active actually working, now running cleanly alongside the always-on VTS. (3) **Phase 21** — light up the live engine instance once paper is proven + calibrated. We get the architectural untangle "over with" now, on a not-yet-trading system; we do NOT try to prove three-way-under-load now — that stages naturally as paper (19) then live (21) come online.

**Net to Kyle:** do it now, but it's the control plane (bounded, mostly-scaffolded-already), not a three-system rebuild — that's better news than the worry. The full pre-audit confirms the exact size (the §4 uncertainties). The corrected item-4 scope becomes "untangle the control plane / make VTS+paper+live independently controllable + cleanly partitioned," superseding the small storage-only scope.

## 6. NEXT STEP
Kyle reads this → if aligned, send to Langston for his read → then I write the corrected (control-plane-untangle) scope + the deep pre-audit that resolves the §4 uncertainties. No build until the scope + design are approved.
