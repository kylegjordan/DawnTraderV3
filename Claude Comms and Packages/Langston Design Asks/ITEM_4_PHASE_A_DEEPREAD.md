# Item 4 — Phase A deep-read (parallel split with Langston)

Phase A of the system-separation design (Gate-1 scope approved). CC is doing the scalar-mode-reader census (A1: ~107 sites) + the storage design + throughput methodology. Please take these three bounded code deep-reads (verify on `ssh staging`, repo `/home/deploy/dawntrader`) so they run in parallel. Findings only — figure-out-the-architecture, not a sign-off.

## DR1 — Live "thin scaffold" feasibility (O3 / Q1)
The live active path is `TradingEngine` (`globalLiveEngine`, `routes.ts:99`, started at `:3651`) — the stale pre-RTB direct-`processSignal` flow paper abandoned. We want live to get an **independent on/off switch + standalone scaffolding NOW** that **consumes compute + writes telemetry but routes ZERO orders** — without rebuilding the real engine (that stays Phase 21). Trace `TradingEngine.start()` and its order-execution path (`executeTrade` ~`:313`). **Answer:** what is the minimal, clean way to make the live switch start a no-op-guarded scaffold (a flag that short-circuits before any Kraken order + before the stale signal flow), so we exercise zero broken/order paths? Is there a natural seam, or does the engine entangle execution with everything else?

## DR2 — Dead-construct importer confirmation (O3 / Q3)
Confirm, with grep evidence: (a) `globalPaperEngine` (TradingEngine 'paper') — its live importers (`routes.ts:103` CommandRouter ctor + `:4683`); is `.start()` ever called? (b) `global.tradingEngines` Map (`live-trading-service.ts:160`) — any real consumer, or pure stub? (c) `paper-48hr-simulation.ts` + `paper-trading-start.ts` — confirm zero production importers (safe to quarantine). Goal: which can be quarantined-in-place now vs. must wait for Phase 16.

## DR3 — Per-system guardrails / kill-switch independence (O2/O3 verify; Langston addition #2)
`adaptive-guardrails.ts` has ~10 mode-readers; `guardrailPolicy.resetKillSwitch(mode)` looks per-mode. **Answer:** are the guardrail state, kill-switch, and daily-loss caps genuinely INDEPENDENT per mode (so tripping paper's kill switch does NOT affect live or VTS), or is there shared guardrail state that would couple them? Name any shared-state coupling that violates "neither system's state affects the other."

Reply with findings per DR. No build.
