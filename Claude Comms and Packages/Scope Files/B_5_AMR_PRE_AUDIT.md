# B-5 AMR BODY — Step-2 PRE-IMPLEMENTATION AUDIT

> Scope: `B_5_AMR_BODY_SCOPE.md` v3-final (all Step-1 conditions folded, commit `9c51375c5`). SIM + SYSTEM_MANUAL consulted per §2/§9 for every touched component. Audited 2026-06-11 (UTC morning). (File named B_5_AMR_* — plain `B_5_PRE_AUDIT.md` belongs to the B.5 xStock-calibration batch.)

## §0 — PREVIOUSLY-STATED-VS-NOW
- **PREVIOUSLY (scope §3.2 item 1): the EV-gap reader rides telemetry-aggregator.** **NOW: it rides the VTS trade-CLOSE path.** REASON: code read shows `PairTelemetry` is a scan-time scoring record (finalScore/regimeWeight/confidence) carrying NO realized PnL and NO predicted expectancy — the realized-vs-predicted gap can only be computed where closed-trade outcomes and at-entry expectancy meet. Design in §3.1.
- **PREVIOUSLY (scope Obj-3 verify, ◆M3 pending): 04-22 fixture class attribution to be confirmed.** **NOW: CONFIRMED CRYPTO.** `B65_5_PHASE_A0_WINDOW_CONTROL.md` contains ZERO xStock-form symbols (`*x/USD` count = 0) — the 04-22 hostile day is crypto-era VTS data, exactly as Langston suspected. Fixture relabeled (§4).

## §1 — The complete legacy consumer surface (parity walk)
Grep-verified: the ENTIRE production surface of the 11.7S overlay is **4 files**:

| Site | What it does today | Parity path under disabled/shadow |
|---|---|---|
| `signal_quality_evaluator.ts:339-341` | `meetsConfidenceFloor(input.confidence, input.regimeStability)` + mode for the log line; `:353` governance gate reads `isStrategyEligible(strategy, stability, dependency)` | unchanged — same per-signal stability in, same floor out |
| `paper-execution-engine.ts:2505-2616` | computes stability FROM SIGNAL METADATA with defaults (`driftScore ?? 0.5`, `volZ ?? 0`, `conf ?? 0.5`), floor-checks, applies size/stop/TP overlay, `recordModeExecution` | unchanged under disabled/shadow; under `active` this is the PRIMARY consumer swap (per-class posture replaces per-signal stability) |
| `vts-runner.ts:1204-1228` | same per-signal compute; floor check is LOG-ONLY (cold-start bypass); overlay applied to sizing | **stays on the legacy path FOREVER (scope delta 6): VTS pins NORMAL-equivalent behavior + gains the weather/mode STAMP** — the stamp is what changes, never the dials |
| `routes.ts:2184-2208` | diagnostic endpoint (current mode/stability/overlay tables) | extended to the per-class AMR shape; legacy fields kept for back-compat |

**Parity nuance the ◆A2 fixture must encode:** paper-execution-engine's stability inputs come from signal metadata with 0.5/0/0.5 DEFAULTS — many signals lack the fields, so today's paper path can sit at whatever stability the defaults classify. The frozen fixture includes: a defaults-only signal, a fully-populated hostile signal (→SURVIVAL), a transition signal (→DEFENSIVE), and a mixed cycle (two signals, different vol-Z → different modes, same cycle).

## §2 — Gate-insertion map (post-item-4 control plane)
Entry-decision chokepoints where the Obj-5/6/7 gates land (AMR-first = cheapest reject, ◆ratified):
1. **SQE admission** (`signal_quality_evaluator.evaluate`) — roster + source-pool allowance BEFORE the confidence floor; signal already carries `assetClass`.
2. **RTB promotion** (`core/rtb/ready_to_buy_service.ts`, driven by the paper-engine 30s promotion loop) — slot-cap + hard-pause RE-CHECK at promotion time (queue residency means admission-time checks can stale).
3. **Execution entry** (`paper-execution-engine.processSignal` + `realtime-paper-executor.executeTrade`) — final hard-pause + slot-cap + dial application. Both engines post-item-4; the realtime executor is the live-mode scaffold and gets the same gate calls (dormant until live).

Exits untouched at all three (entry-only invariant). Dry-run (◆A4): each gate function takes `execution: 'enforce' | 'dry_run'`; shadow calls them dry-run at these SAME sites and routes results to the ledger with per-gate tags (◆B3).

## §3 — New-plumbing feasibility findings
### §3.1 EV-gap reader (corrected home)
Per-class rolling buffer `{ts, predictedNetEv, realizedNetPnl}` fed at the **VTS close hook** — the one place both sides exist in scope today (the close path already resolves assetClass per B79.0n.CONFIDENCE-CHAIN R-10). Per-class N (◆B2: crypto seed 100, xstock seed 30), insufficient-N → null. Source-mode filter on the feed (vts now; paper rows join via the paper engine's close hook in Phase 19 — same buffer, source-tagged; the source FLIP is the separate operator decision per ◆B2). NOT persisted v1 — rebuilds in ≤N closes after a restart and `staleness[]` reports `ev_gap: warming` meanwhile (an honest marker, not a silent gap).
### §3.2 Time-in-state + flip tracker
In-aggregator `Map<AssetClass, {regime, sinceTs, flips: ts[]}>` fed by the per-class vote each cycle; idle-aware (no flip counted across an IDLE gap — B-4.7 re-seed doctrine). The dead #219 flipRate feed is NOT reused (stays Phase-16-homed for removal).
### §3.3 Friction + DBS trend buffers + seed provenance
Buffers ride the existing per-class computes (`computeGlobalFrictionWithDetails(assetClass)`, per-class DBS snapshots) — in-aggregator, no cache changes. **Seed-provenance task (◆delta-11):** before Step-3 thresholds are pinned, pull 24h of both classes' friction + DBS series from staging and set CHOPPY/STORMY friction multipliers against the POST-B-4.5 baseline (round-trip ≈1.80%; crypto friction currently ~30 / High-Liquidity band at n=10). AGGRESSIVE seeds cross-checked against B.5 W2-W3 per-strategy calibration + B3.1 gate-correctness outputs. Thresholds enter the migration with provenance comments, not guesses.
### §3.4 Module-constants surface
3 new modules: `amr_runtime` (per-class flag rows), `amr_response_dials` (per mode × class: 4 numeric dials + 2 JSONB allowances + slot cap + hard-pause + base cooldowns), `amr_weather_rules` (per-class thresholds + dwell/hysteresis/epoch-counting params). `governance_modes` gains per-class rows (4 modes × 2 classes; wildcard kept ONLY as inactive-class fallback — boot assertion enforces explicit rows for ACTIVE classes, B79.TEC pattern). Resolver precedence (asset_class weight-2 beats wildcard) verified; all new keys are new names — no collision.
### §3.5 Ledger
`amr_decision_ledger`: `(id, cycle_ts, asset_class, inputs_schema_version, weather jsonb, continuous_score, resolved_mode, would_dials jsonb, would_blocks jsonb, flag_state)`. Index `(asset_class, cycle_ts)`; 90-day retention via the B-NEW-47 sweep (◆B4). ~2,880 rows/day both classes.

## §4 — ◆M3 resolution (fixture relabel)
The hostile-day acceptance fixture becomes **class-agnostic by signature**: the 04-22 input signature (TFS-labeled votes + collapsing realized outcomes + era friction pattern) fed to the CRYPTO aggregator → STORMY ≤60 simulated minutes (historically truthful — it WAS crypto). The same signature fed synthetically to the xStock aggregator → STORMY too (signature-driven, not class-driven), while the OTHER class on a calm fixture stays CALM (cross-class independence preserved). The xStock-SPECIFIC case is the IDLE fixture (Memorial-day/weekend boundary). Scope Obj-3 verify text updated at Step-3.

## §5 — Blast radius + file enumeration (~16 prod files)
**NEW:** `amr-weather-report.ts` · `amr-gates.ts` (roster/slot/pause/cooldown + dry-run arg) · EV-gap buffer (in-aggregator or sibling) · ledger schema + migration · `b5-amr-*.test.ts` suites.
**MODIFIED:** `strategy-modes.ts` (AGGRESSIVE + per-class overlay resolution + per-class stats) · `signal_quality_evaluator.ts` (gate calls) · `ready_to_buy_service.ts` (promotion re-check) · `paper-execution-engine.ts` (consumer swap + gates + dry-run) · `realtime-paper-executor.ts` (same, dormant) · `vts-runner.ts` (stamp only + close-hook feed) · `routes.ts` (endpoint) · `schema.ts` (+ledger) · migration seeds · `ranking-weights.ts` + SIM §1.5 (#217 removal — OWN COMMIT per ◆A6) · `analytics.tsx` (endpoint-backed AMR panel data).
Chain order SQE→RTB→TEC→engines unchanged; AMR inserts as the first admission read + a dial-overlay swap. NOT touched: regime-classifier math, B.4 lookbacks, exits, capital allocation, `computeGlobalStability` internals, `applyGovernance`/flipRate (#219).

## §6 — Risks & open questions for the Step-2 review
1. **RTB promotion re-check is NEW surface** (the scope said "SQE/RTB/execution" but the promotion loop specifically wasn't enumerated) — confirm promotion-time is the right second checkpoint vs gating only at execution entry.
2. **EV-gap home correction (§0)** — ratify the close-hook design + v1 non-persistence with the warming marker.
3. **Paper-engine metadata defaults (§1 nuance)** — under `active`, the per-class posture replaces a stability that today is often DEFAULT-driven; the ledger's would-vs-actual will show systematic divergence from this alone. Expected, not a bug — flag for the flip-decision read.
4. **Diff plan:** diff A = aggregator + flag + ledger + stamps + #217-own-commit (additive, shadow-safe); diff B = gates + consumer swap + endpoint (dormant until flag). Recommend SHIP A WITH B in one deploy — unlike B-4.7's C1, nothing bleeds today, so no early-deploy pressure; single deploy, full §9.3 verify.
5. Boot-assertion count: `amr_runtime` (2) + `amr_response_dials` (2 classes × 4 modes × ~9 keys) + `amr_weather_rules` (2 × ~12) + `governance_modes` (8) ≈ **~100 seeded rows** — finite, reviewable, enumerated in the migration with provenance comments.
