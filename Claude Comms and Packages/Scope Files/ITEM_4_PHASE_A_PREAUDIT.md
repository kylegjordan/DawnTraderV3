# ITEM 4 — Phase A Pre-Audit (the design-stage deep read)

> Between-plan item 4, **Phase A** (design-before-build; Gate-1 scope approved by Kyle 2026-06-09). Produces: this deep pre-audit + the storage-architecture design doc + the throughput-study methodology → **Gate 2 (Kyle approves the design)** → Phase B build. Architecture basis: `ITEM_4_ARCHITECTURE_INVESTIGATION.md` (CC + Langston joint dig). No build.
>
> **Status:** IN PROGRESS, 2026-06-09. Active trading OFF.

## A1 — Scalar "current-mode" reader census (Langston Step-1 addition #1 — the split-brain risk)
**Finding: ~107 single-current-mode read sites across `server/`.** Once paper + live can both be ON, "the mode" is ambiguous at each one. The underlying state is ALREADY per-mode (`isEngineActivePaper`/`isEngineActiveLive` separate rows) — so this is an audit-and-disposition job, not a rebuild — but every site below needs a per-call-site decision ("when both on, which mode does THIS read mean?").

| Pattern | Count | Meaning |
|---|---|---|
| `.tradingMode` reads | 51 | user/context/req `.tradingMode` scalar |
| `req.mode` reads | 29 | request-declared mode (validateMode middleware) |
| `getTradingMode(` | 11 | tradingStateSync per-user scalar |
| `x-app-mode` / `appMode` | 10 | request header mode |
| `getCurrentMode()` | 6 | the global vts/paper_sim/live collapse (run-mode-controller) |

**Density (top files):** `routes.ts` 45 · `trading-state-sync.ts` 12 · `adaptive-guardrails.ts` 10 · `storage.ts` 5 · `paper_sim_heartbeat.ts` 4 · `audit-anomaly-detection.ts` 3 · `index.ts` 3 · `live-pricing-adapter.ts` 2 · `pair-scan-archiver.ts` 2 · `command-router.ts` 2 · `kraken-websocket-adapter.ts` 2 · `signal-orchestrator.ts` 1.

**Disposition framework (to apply per site in the design doc):** each reader is one of — (a) **request-scoped** (a user is viewing paper OR live in the UI → keep scalar, it's the viewer's selected mode, harmless); (b) **producer-scoped** (the code is acting AS a producer → must read THAT producer's mode explicitly, not the global); (c) **genuinely-global** (system-state display → keep, but it must mean "any active" not "the one mode"). The D1 firehose stamp is ONE producer-scoped case; the census says there are ~dozens more to classify. **This is the load-bearing Phase-A deliverable for O2.**

## A2 — Remaining pre-audit tasks (to complete before the design doc)
- **A2.1** Live engine internals (`TradingEngine`): confirm the stale/divergent flow + exactly what a "thin live scaffold that consumes compute + writes telemetry but routes zero orders" requires (Q1).
- **A2.2** Dead-construct disposition: `globalPaperEngine` (live importers at `routes.ts:103/4683` via CommandRouter — quarantine, defer delete to Phase 16) + `global.tradingEngines` stub + `paper-48hr-simulation.ts` (confirm zero importers).
- **A2.3** VTS decouple surface: the 3 `tradingActive` guards + the lifecycle guard needed for always-on (Q2 in-process).
- **A2.4** Per-system guardrails/kill-switch (`adaptive-guardrails.ts` 10 mode-readers; `guardrailPolicy.resetKillSwitch(mode)`): confirm per-mode independence (Langston addition #2).
- **A2.5** Control-redesign surface: the UI on/off control + the start/stop route path → independent per-system switches.
- **A2.6** Storage: B70 `mode` stamping sites (D1) + the D9 learning-writer sites (`vts-service` + `paper-execution-engine`) + the 3-producer partition + data-collection/redundancy decisions (the shared-once-vs-per-producer rule).

## A2-RESOLVED — Langston deep-read findings (DR1/DR2/DR3, code-verified 2026-06-09)
- **DR1 (live thin-scaffold — A2.1) = a ONE-LINE seam, no rebuild.** Order routing is NOT entangled with signal generation: `TradingEngine.start()` → SignalOrchestrator → `processSignal()` (all compute+telemetry) → `executeTrade()` at `trading-engine.ts:290`; ALL Kraken order calls live below `:290`. **A `scaffoldNoOp` flag on the `TradingEngine` class, short-circuited in `processSignal` right before `:290` (emit a `LIVE_SCAFFOLD_NOOP` trace + return null), makes the live switch run the full compute+telemetry path with ZERO orders and zero stale commit/bracket/portfolio flow.** Nuance: the pre-seam slippage calc reads the Kraken orderbook (a READ, not an order) — fine for a scaffold; flag only if the bar is "zero Kraken contact" vs "zero orders." → O3 for live is cheap.
- **DR2 (dead constructs — A2.2):** **(c) `paper-48hr-simulation.ts` + `paper-trading-start.ts` = fully orphaned (zero importers, self-disabled) → quarantine NOW.** **(a) `globalPaperEngine`:** the `paper-sim-service.ts:280-281` branch reading `(global as any).globalPaperEngine` is DEAD (never assigned) → quarantine that branch now; the OBJECT has live importers (CommandRouter ctor + status + closeTrade endpoint) → defer object removal to Phase 16. **(b) ★ `global.tradingEngines` Map is NOT a stub — it's a REAL second, parallel per-user live-engine registry** wired to the live-activation endpoints (`routes.ts:5402/5421/...`) + 6 consumer services, coexisting with the Phase-27 `globalLiveEngine` singleton. **→ TWO live-engine instantiation models exist** — a genuine entanglement; cannot quarantine now → **Phase 16/21.** (This is why live's real build is correctly deferred — it's not just a stale engine, it's two competing engine models.)
- **DR3 (guardrails/kill-switch — A2.4) = genuinely per-mode for paper↔live.** `tripKillSwitch(mode)` writes only that mode's `guardrails_v2` row, sets that mode's `isEngineActive=false`, clears that mode's pool, stops only that mode's engine; daily-loss caps per-mode (paper 30% / live 10%); no shared in-memory tripped boolean. **Log (benign):** cross-mode RULE_ID-keyed telemetry counters + shared read-only rules YAML. **★ SAFETY DECISION for the design:** VTS is NOT in the `TradingMode` enum at all → it's structurally immune to paper's kill switch, BUT **VTS has no kill-switch of its own in this subsystem** — does the standalone VTS need its own safety control? Explicit decision, not an assumption.

## A3 — Owed at Gate 2 (the three Phase-A deliverables)
1. This pre-audit (complete A2).
2. Storage-architecture design doc — incl. the **D9 learning-distribution decision for Kyle** (does paper-fill outcomes train the same learning brain as VTS virtual outcomes, or kept separate?).
3. Throughput-study methodology (per O6 / Langston Q4).
