# ITEM 4 — Separate VTS / Paper / Live Into Independent Standalone Systems — SCOPE (DRAFT v1)

> Between-Phase-24→19 plan **item 4**, REFRAMED + Kyle-confirmed 2026-06-09. **Supersedes** the narrow `ITEM_4_VTS_STANDALONE_SCOPE.md` (storage-only) — that draft's storage + compute-sharing analysis is folded in here. Architecture verified by the CC + Langston joint dig in `ITEM_4_ARCHITECTURE_INVESTIGATION.md` §0.
>
> **Status:** DRAFT for Langston Step-1 iteration → then Kyle scope approval. **No build; scope only.** Active trading stays OFF throughout.

---

## 0. GOAL (Kyle-confirmed boundary 2026-06-09)
**Structurally SEPARATE the three systems (VTS / paper / live) so they live INDEPENDENTLY of one another — NOT make all three fully working.** Specifically:
- **VTS** runs standalone and is **verified actually running on its own**, regardless of paper/live state.
- **Paper and live are CLEAVED apart**: each gets its **OWN independent on/off switch** (today one switch picks paper-OR-live, one at a time); redesign where the controls sit; paper & live switch on/off **separately**, neither depends on the other, and **neither affects VTS**.
- Build into each system the **standalone infrastructure it needs to run independently** — but stop short of full functional trading (paper's full debug = **Phase 19**; live's real engine build = **Phase 21**).
- The storage system **accepts data from all three** concurrently, with deliberate **what-to-collect / redundancy decisions**.
- A **throughput study** establishes whether the shared calculators/services/queues can carry 2–3 systems at once without confusing data or overloading.

## 1. VERIFIED ARCHITECTURE (from the joint dig — the basis for this scope)
- **VTS HARD-HALTS today** on `tradingActive` (`vts-runner.ts:3108` skip, `:3941-3945` tears down the interval, `:3909` refuses to start). `tradingActive = !passiveLearning = !isEngineActive`. So turning active-paper on today **kills the VTS firehose** — this is the core thing to break.
- **The switch is binary + mutually exclusive:** `isEngineActive` (one on/off) + `tradingMode` ('paper'|'live') selector. One active engine at a time.
- **Paper ≠ live (different engine classes):** PAPER = `PaperExecutionEngine` (flow: orchestrator → SQE → RTB queue → TCL → execution; built via `PaperPortfolioManager` ← `startPaperSimulation`). LIVE = `TradingEngine` (`globalLiveEngine`, older pre-RTB direct-`processSignal` flow paper abandoned). Plus 2 DEAD constructs: `globalPaperEngine` (vestigial, never started) + `global.tradingEngines` (stub object).
- **One shared UI scaffolding:** single `TradingModeContext` (binary mode + localStorage), `invalidateQueries()` on switch; same components re-fetch mode-scoped data; no per-mode pages; VTS = telemetry-only (no trading page).
- **Shared compute is already shareable:** MCE (singleton, per-symbol cache + per-class config, no per-producer state), pattern-detect, strategy-detect math, TEC (stateless over per-class config) — compute-once-fan-out. RTB/SQE + TCL = singletons but **mode-keyed internally** (`Map<TradingMode,…>`); rtb-refresh loops both modes. So the active-path pipeline is partly concurrency-ready ALREADY.
- **Two contamination points (fire the instant paper turns on):** D1 — `run-mode-controller.getCurrentMode()` is one global label (live>paper>vts) → mislabels firehose rows. D9 — the learning store (`outcomeFeedbackStore`, keyed `(assetClass,regime,strategy)`, no producer dim) is ALREADY written by `paper-execution-engine.ts:1397` → paper outcomes pollute firehose learning.
- **Storage substrate exists:** B70 mode-agnostic archive (`mode` column), B75 tiered hot→warm→cold (move-not-delete), `data_archive_manifest` SSOT.
- **Legacy is separable:** the dead constructs + `paper-48hr-simulation.ts` (zero importers) can be quarantined/deleted without touching the active path.

## 2. OBJECTIVES (numbered, with verification criteria)
**O1 — VTS standalone + verified.** Decouple the VTS autonomous loop from the `tradingActive` kill (the `:3108/:3909/:3941` guards + the derivation) so VTS runs always, independent of paper/live on/off. **Verify:** VTS keeps producing cycles with no gap while a paper engine starts AND stops (the firehose never goes dark).

**O2 — Cleave the switch: independent on/off per system.** Replace the binary `isEngineActive` + paper-OR-live selector with **independent controls** — VTS (always-on, own state), paper (own on/off), live (own on/off). **Hard guarantees (verify):** paper & live can be toggled separately; neither depends on the other; neither's running state affects VTS. Redesign where the controls sit (control plane + the UI surface — one shared page may keep a mode view, but the on/off semantics become per-system).

**O3 — Standalone scaffolding for paper + live (structural, not full-function).** Build the infrastructure each needs to run independently. Paper: independently startable, runs its pipeline (full debug deferred to Phase 19). Live: own switch + standalone scaffolding so it's independent + non-interfering — **without** rebuilding its stale `TradingEngine` trading path (real live build = Phase 21). Decide disposition of the 2 dead constructs (quarantine now vs. flag to Phase 16). **Verify:** paper and live each start/stop independently without error and without disturbing VTS or each other (no real trades required).

**O4 — Storage for three concurrent producers + data-collection decisions.** D1 mode-stamp per-producer + D9 single-writer learning + the storage-architecture decision extended to THREE producers: what each captures, what's **redundant and skippable** (Kyle: we decide what we take in), the strict partition (no pooling sim/paper/live), and the hot/warm/cold tiering/retention. **Verify:** with all three simulated-on, each producer's rows carry its own correct `mode`, a calibration-style query selects exactly one producer with zero cross-pooling, and the learning store has a single writer.

**O5 — Shared-compute model (compute-once fan-out).** MCE/pattern/strategy/TEC computed once per (symbol, cycle), fanned out read-only to all producers (R-I exactly-once invariant; R-J `Object.freeze` the published context+indicators — freeze, don't copy). Per-producer state = positions, selection policy, learning, telemetry. **Verify:** one MCE compute per symbol per cycle under concurrency (no triple-count of the cycle counter / telemetry).

**O6 — Throughput study (Kyle directive).** A measured study: can the shared calculators (MCE, pattern, strategy), the queues/services (RTB/SQE/TCL/refresh), and the storage writers carry **2 then 3 systems concurrently** without (a) confusing/cross-contaminating data, or (b) overloading (latency, queue depth, CPU, write backpressure)? **Deliverable:** instrumentation + a load/parity test (or a measured projection where a live load isn't possible), with pass/fail thresholds. Designed in Phase A, run in Phase B. **Verify:** documented headroom under the 3-producer model + no data-integrity violations.

## 3. SCOPE BOUNDARY
- **IN:** O1–O6 — the structural separation, independent switches, standalone scaffolding, storage-for-3 + data decisions, shared-compute model, throughput study; VTS verified standalone.
- **OUT:** making paper fully work/debugged (**Phase 19**); building live's real trading engine / RTB-queue reconciliation (**Phase 21**); deleting the dead engine constructs (**Phase 16**, unless trivially needed for separation). Active trading stays **OFF** — "independent on/off" is verified structurally (start/stop without error + isolation), not by live money or a full paper soak.

## 4. PHASING — design-before-build, TWO Kyle gates (NO-PATCHES §5#15)
- **GATE 1 — this scope** → Langston Step-1 consensus → **Kyle approves the scope.**
- **Phase A (design):** deep pre-audit (exact switch/start-stop wiring; the divergent live engine; dead-construct disposition; the control-redesign surface incl. UI) + the **storage-architecture design doc** (3-producer partition, data-collection/redundancy decisions, tiering) + the **throughput-study methodology**. → **GATE 2 — Kyle approves the design.**
- **Phase B (build):** in safe order — (1) VTS decouple + verify standalone; (2) D1 mode-stamp + D9 single-writer (contamination fixes); (3) switch cleave / independent controls; (4) paper+live standalone scaffolding; (5) storage-for-3; (6) run the throughput study → review/CI/deploy/verify/govern/close.

## 5. OPEN QUESTIONS FOR LANGSTON (Step-1)
- Q1: Can live get an independent on/off switch + standalone scaffolding WITHOUT reconciling its stale `TradingEngine` engine — i.e., is the control/separation cleanly separable from the engine internals, so "independent but not functional" is achievable for live now?
- Q2: Does "VTS always-on" need a real independent process (Phase 19), or does removing the `tradingActive` kill + a lifecycle guard suffice for item 4? (Earlier R-B: in-process decoupling now, separate process deferred.)
- Q3: Disposition of the 2 dead constructs (`globalPaperEngine`, `tradingEngines` stub) — quarantine in item 4, or tag to Phase 16?
- Q4: Throughput-study methodology — synthetic concurrent load on staging vs. instrumented measured projection; what pass/fail thresholds (latency, queue depth, CPU, write backpressure, data-integrity)?
- Q5: Storage data-collection decisions — which producer-streams are redundant enough to skip (e.g., do all three need full pair-scan capture, or is scan substrate shared/once)?
- Q6: The shared `pair_scan` substrate (MCE scan runs once, feeds all) — producer-agnostic tag-once, or per-producer? (Carried from the earlier R-D fork.)

## 6. GOVERNANCE
Tier-2 docs in play: SIM (§7.1 VTS, §B70/§B74/§B75 storage, the active-path components), System Manual (data pipeline + the trading-mode taxonomy §5#20), MULTI_ASSET_VTS_EXPANSION_PLAN (firehose working-list), data_lifecycle registry. This is a substantial multi-sub-batch effort; Phase A + Phase B likely each break into sub-batches with their own reviews.
