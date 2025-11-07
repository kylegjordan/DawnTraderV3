DawnTrader Stabilization & Reintegration Plan (Concise)
What we are keeping

Core loop (Feed → Filter → Strategy → Guardrails/Kill-Switch → Orders → Portfolio → Telemetry). No behavior changes here.

LATTI/Lottie (all 4 services) retained; issues are hygiene (self-HTTP + hardcoded creds), not design. Keep behind a feature flag; operate passively first.

Orchestrators retained:

SignalOrchestrator (tight with TradingEngine; do not decouple)

ReasoningOrchestrator (lazy/on-demand start instead of auto-start)

CLEOrchestrator (gated with flag; “isolate in place”)

EthicsConsensus (on-demand; keep)

Bobs (domain agents) remain registered via ReasoningOrchestrator (correcting earlier removal claims).

What we are changing (hygiene, not behavior)

Remove self-HTTP and hardcoded creds in LATTI
Replace axios → http://localhost:5000/... + test creds with direct TypeScript imports to telemetry/services. Outcome: no secrets in code, lower latency, no localhost coupling.

Feature-flag control for autonomy

ENABLE_LATTI (default true; start in passive mode)

CLE_ENABLED (default false until Phase 8)

REASONING_ENABLED (true; but no auto-start on import)

ETHICS_CONSENSUS_ENABLED (true)
This lets us disable any module without code edits and stage rollouts safely.

ReasoningOrchestrator → on-demand lifecycle
Remove module-load auto-start; start worker explicitly from server/index.ts when enabled (or first use). Trims startup noise; easier to test.

I/O hygiene in LATTI

Add 5-min telemetry cache (collapse repeated reads)

Batch oversight logs hourly (≈92% fewer writes)
Improves DB and log hygiene without changing signals/decisions.

Legacy cleanup
Drop the unused ai_orchestrator_logs table via migration to remove schema noise.

Config Registry (Phase 6)
Externalize presets/thresholds/filters/guardrails to a DB-backed registry + API, with versioning. Eliminates remaining “magic numbers” and keeps presets configurable (not hard-coded).

Four-Phase execution (fast track)
Phase 5B — Security & Hygiene (6–8h)

Goal: Remove fragility and security smells with zero behavior change.

Tasks (in this order)

LATTI: remove self-HTTP; delete hardcoded creds; swap to direct imports (+5-min cache; hourly batch logs).

Orchestrators: add flags; Reasoning -> lazy start; CLE gated.

DB: drop ai_orchestrator_logs.

Exit gates

No plaintext creds in repo; no axios calls to localhost inside services.

Server boots cleanly; Reasoning doesn’t start until asked.

Oversight logs: ≤24 rows/day (batched).

Phase 6 — Configuration Registry (2–3 days)

Goal: Make all operational parameters config-driven (but keep defaults identical).

Tasks

Create config_registry (key, value JSON, version, category, metadata).

Sweep and migrate guardrails, filters, presets (baseline/optimistic/maximum), and learning knobs into the registry.

Add GET/PUT /api/config/* and audit log per change.

Exit gates

No hard-coded numeric tuning values remain in code paths.

UI reads presets from registry; toggles stay, but their sources are config, not code.

Phase 7 — End-to-End Stability (≈1 week)

Goal: Prove the core pipeline is rock-solid in paper mode before adaptive re-enable.

Runbook

72-hour paper session: ENABLE_LATTI=true (passive only), CLE_ENABLED=false.

Verify cadence (30s signals), guardrails/kill-switch, order lifecycle, portfolio updates, telemetry completeness.

Capture latency, cache hit ratio, DB write counts; zero unhandled exceptions.

Exit gates

No crashes; guardrails enforce; trade lifecycle clean; mem growth <5% over 72h.

Phase 8 — Controlled Autonomy Re-enable (2–3 days)

Goal: Turn on learning safely and only after we have a paper-stable baseline.

Steps

Keep LATTI passive until: ≥150 trades or ≥24h runtime baseline met, P&L guardrails satisfied.

Flip passiveLearning=false (paper first), keep throttles (≤3 changes/24h) + coherency checks.

Optionally enable CLE_ENABLED=true after paper soak passes; monitor correlations and pause thresholds.

Exit gates

Behavioral changes logged; no latency regressions; measurable performance lift vs. passive.

Decisions & conflict resolution from the five plans

Retain Lottie & Orchestrators: All five recommend keep-and-refactor vs. removal; earlier “legacy” classification was outdated.

Bobs status: One plan implied they were removed; the orchestrator audit (and Replit plan) shows Bobs are active via ReasoningOrchestrator. We keep them.

Priority ordering: Hygiene/flags before config registry; then multi-day paper; then autonomy—this sequence is consistent across plans.

Interface hygiene: Remove self-HTTP and hardcoded creds; prefer direct imports or an internal adapter/event bus—unanimous.

Concrete deliverables checklist (you can paste this into Replit issues)

P0 – Security & correctness

 server/services/latti-manager.ts: replace all localhost axios calls; delete getAuthToken(); no creds string literals remain.

 server/services/lottie-oversight-service.ts: same as above + hourly log batching.

 server/services/strategy-telemetry-service.ts: add if missing (single import surface for strategies telemetry).

P1 – Flags & lifecycle

 Add env flags: ENABLE_LATTI, CLE_ENABLED, REASONING_ENABLED, ETHICS_CONSENSUS_ENABLED. Wire checks at module start.

 ReasoningOrchestrator: remove auto-start; start from server/index.ts.

P2 – I/O hygiene

 Add 5-min in-process telemetry cache used by LATTI.

 Batch lottie_oversight_log hourly; flush on shutdown.

P3 – Cleanup

 DB migration: DROP TABLE IF EXISTS ai_orchestrator_logs.

P4 – Config Registry

 Create config_registry + service/API; migrate presets & guardrails/filters.

Validation

 72-hour paper soak (LATTI passive, CLE off); guardrails/kill-switch verified.

 Autonomy re-enable (paper), then optional CLE; monitor deltas and throttle adherence.

What will not change

Kill-switch logic, guardrails semantics, trading cadence, and strategy math remain intact; we are only improving wiring and configuration hygiene (not the trading rules). This matches the intent across plans.

Short rationale (why this plan)

It preserves every capability you care about (adaptive learning, oversight, orchestrated tasks) while directly addressing the few issues that could have undermined stability (self-HTTP, creds, auto-start). That’s the shared consensus in all five documents.