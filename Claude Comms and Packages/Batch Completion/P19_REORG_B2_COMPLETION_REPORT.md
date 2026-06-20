# P19 reorg-B2 — Completion Report

> **Batch:** reorg-B2 · **Phase:** 19 · **change-class:** architecture · **Author:** NEW Claude (CC-B) · **Date:** 2026-06-20
> **Title:** Rung-1 — per-class target-floor + universal RR gate + reachability gate (BOTH classes); the rung-1 plumbing for crypto opening.
> **Comms:** Discord (this batch). CC-B + Langston iterated autonomously Step-1→Step-4.
> **Commits:** `b41fb3e64` (A core + OBJ-7) · `dc5ee32a3` (B threading) · `4880d2ea2` (B migration + boot + resolver) · `d592c8e29` (A wiring + V4#1) · `aaa0d8a9f` (C foundation) · `4b55d9794` (C folded into normalizer) · `3c7a28f12` (§13) · `1090d83d9` (CI fix). Scope `d6e290862` · pre-audit `194d4dc1a`.

## 🚨 SCAFFOLDING-VS-FUNCTIONAL (mandatory, §9.1)
**THIS BATCH DOES NOT MAKE CRYPTO OPEN A TRADE. It is the rung-1 PLUMBING.** Decision-grade EV finding (CC-B + Langston): at the Tier-1 taker fee wall (~1.8% round-trip) with the pWin ceiling 0.60, the Net-Expectancy kernel is net-negative even at a 4% target / 1.6% stop (`0.6·4 − 0.4·1.6 − 1.8 ≈ −0.04%`), so the 11.8B EV gate HONESTLY refuses to open crypto at taker — matching the Phase-19 audit. The EV gate is the safety (it never opens a net-negative trade). **Actual profitable crypto-opening requires the maker build (reorg-B7, rung-2) + the pWin-ceiling recalibration (Phase-25).** reorg-B2 ships the machinery + honest per-class values; opening is gated on #332 (win-rate validation at B9 turn-on).

## PREVIOUSLY-STATED-VS-NOW
- **PREVIOUSLY STATED: reorg-B2 "gets crypto trades OPENING at taker rates." NOW: it ships the rung-1 PLUMBING; the EV gate (correctly) won't open crypto at taker; the real opener is the maker build (B7) + Phase-25 pWin. REASON: the decision-grade EV kernel math at the Tier-1 fee wall + the pWin 0.60 ceiling (matches the Phase-19 audit).**
- Piece C: PREVIOUSLY a `screener_filters` column wired across 5 scan paths. NOW folded into the central normalizer (one helper, the two existing convergence points). REASON: reachability shares entry+target+ATR there → a separate filter site is pure sprawl; reachability is path-invariant by design (Langston consensus).

## Objectives
| # | Objective | Status | Evidence |
|---|---|---|---|
| A | Per-class target floor (lift), wired both paths | ✅ | `signal-target-normalizer.ts` `normalizeAndGateTarget` (lift→RR→reach); wired at `buildSizedSignalForStrategy` (active) + `vts-runner.ts:1176` (VTS). Single point each (Langston split-brain check). |
| B | Per-class ROI/EV gate (thread assetClass; no silent global) | ✅ | `expectancy.ts` 5 fns threaded; per-class `expectancy_gates`/`roi_gating` migration DELETES the global `'*'` rows; boot assertion throws (fail-closed) for BOTH classes. |
| C | Movement/reachability gate (per-class, by-reason) | ✅ | Folded into the normalizer: `atrsToTarget=(target'−entry)/ATR ≤ reachAtrMax`; path-invariant; drop+by-reason (`unreachable`). |
| — | Universal RR gate (native or lifted), drop-not-co-move | ✅ | `rr<minRR → drop`; applied to ALL signals; never co-moves the structural stop (Langston Step-2). |
| OBJ-7 | Delete deprecated ROI consts | ✅ | `adaptive-thresholds.ts` ROI_MIN/MAX/FLEX + FRICTION_SAFETY_BUFFER + CONFIG removed (kept DEFAULT_SLIPPAGE); DELETED_COMPONENTS_LOG. |
| V4 | Orchestrator fallback literals | ✅/homed | #1 (`?? entry×1.015`) deleted on-spot; #2 (`?? ×0.97/×1.03`) dated-homed (#334 — sizing-requires-stop dependency). |
| Tests | | ✅ | `p19-reorg-b2-target-normalizer.test.ts` 8/8 (lift, dispersion, RR universal, unreachable, geometry); focused suite 70/70; regime_mapping_integrity green. |

## Multi-path consistency (Kyle directive)
The lift+RR+reachability normalizer runs at BOTH convergence points — the active `buildSizedSignalForStrategy` (covers all active sizing emit paths) and the VTS `vts-runner.ts` (which calls `strategyEngine.detect*` directly, NOT via the orchestrator). The per-class ROI gate (`isSignalProfitable`) is VTS/SQE-shared by construction. So VTS and active normalize/gate IDENTICALLY (sim-to-live parity).

## Known properties (Langston Step-4 notes — logged)
- `target_floor_pct=4%` / `min_rr=2.5` / `roi_absolute_max=4%`, both classes identical (same account-wide Tier-1 fee wall) — a CONSERVATIVE starting placeholder; Phase-25 calibrates per-class. The floor lifts WEAK targets to 4%; STRONG native targets ride ABOVE 4% (dispersion preserved — `roi_absolute_max` caps the GATE threshold, NOT the target; locked by a test).
- Reachability is PATH-INVARIANT (feasibility, not a quality bar) → per-class only, never per-filterPath.
- The boot assertion fails CLOSED (server refuses to start without the per-class rows, both classes).

## §13 homes (concrete, §9.4)
- **#332** realized net-of-friction win-rate validation → P19 reorg-B9 turn-on pre-flight gate.
- **#333** xStock target floor must come DOWN → Phase-25 (named calibration item).
- **#334** V4 literal #2 removal → P19 pre-go-live cleanup (sizing-requires-stop dependency).

## Verification
- **Bench:** tsc baseline GREEN; `p19-reorg-b2-target-normalizer` 8/8; focused regression 70/70; `regime_mapping_integrity` green.
- **CI:** GREEN on head `1090d83d9` (all 4 jobs).
- **Step-4:** Langston sign-off — _PENDING (CI-green condition now met)._
- **Deploy + migration apply:** _PENDING._
- **Staging verification (#332 caveat — crypto won't OPEN at taker; the EV gate gates):** _PENDING — confirm boot assertion passes (per-class rows seeded), `[reorg-B2][warmup]` log, no boot failure; confirm the normalizer log path; confirm the EV gate still rejects (expected)._

## Governance files changed
Scope + pre-audit + change list + this report; `RUNNING_ISSUES.md` (#332/#333/#334); `DELETED_COMPONENTS_LOG.md`; migration + rollback. **PENDING (Step-10):** `SYSTEM_MANUAL.md` (target-setting normalizer + per-class gate + reachability math), `SYSTEM_IMPACT_MAP.md` (the normalizer + `_discoveredQuotes`-style per-class gate flow), `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `PHASE_19_PLAN.md` §1 + POST_AUDIT_ROADMAP (#333 Phase-25 item), MEMORY.

## Next
reorg-B3 (EV-input plumbing #233) per the board — though the EV finding re-weights the sequence toward reorg-B7 (maker) as the actual crypto opener; CC-B + Langston to confirm the micro-order.
