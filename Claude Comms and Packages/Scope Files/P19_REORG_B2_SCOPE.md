# P19 reorg-B2 — Rung-1: target-floor + movement/reachability filter (BOTH classes)

> **Batch:** reorg-B2 · **Phase:** 19 · **Author:** NEW Claude (CC-B) · **Date:** 2026-06-20
> **change-class: architecture** — changes strategy target-SETTING + adds a new filter-phase metric to the signal pipeline + makes the ROI/EV gate per-class. Strategy logic + filter design + signal pipeline + quantitative math = System-Manual scope. (Declaring the strict set deliberately.)
> **Reviewer:** Langston — Step-1 PENDING. **★COMMS: this batch runs on DISCORD, not Telegram** (Kyle directive 2026-06-20) — this scope is dispatched to Langston via the Discord channel; his Step-1 review comes back through Discord.
> **Origin:** reorg build board B2 (`P19_REORG_BOTH_CLASSES_PLAN_2026-06-19.md`). With reorg-B1 (recognition, closed), B1+B2 are the minimum to get crypto trades OPENING at taker rates (gate-10). The July-9 Kraken Tier-1 fee wall (~1.8% round-trip taker) currently rejects every crypto signal at the EV/ROI gate.

---

## 0. The architecture finding that shapes this batch (verified in code)

**Raising the rejection threshold alone does NOT open trades — the TARGET the strategy aims for must go up.** Verified:
1. **The ROI gate checks an ALREADY-SET target.** `isSignalProfitable` (`expectancy.ts:251-270`): `roi = (targetPrice − entryPrice)/entryPrice; requiredROI = max(dynamicROI, frictionFloor); return roi >= requiredROI`. It is pass/fail on the signal's existing `targetPrice`. Lifting `requiredROI`/the floor just rejects MORE — it cannot make a trade open.
2. **The target is ATR-scaled, per-strategy, DB-governed.** Every strategy sets `targetPrice = entryPrice + (target_exit_atr_multiplier × effectiveATR)` (e.g. `reverse-impulse.ts:172`, `strong-bull-trend.ts:149`, `adaptive-flow.ts:173`, +9 more), where `target_exit_atr_multiplier` is a per-strategy `module_constants` value and ATR is the pair's real volatility. So **target-as-a-percent = `mult × ATR / price`.**
3. **Therefore the two B2 halves are the SAME physics.** A pair can only produce a ≥3.5–4% target that is *reachable in the hold window* if its volatility (ATR/price) is high enough. Raising the target floor and adding the movement/reachability filter are two views of one constraint: `mult × ATR / price ≥ floor`, with `floor / (ATR/price)` = the number of ATRs to the target, which must be within a reachable bound.
4. **The ROI bounds moved to the DB (B72) and are GLOBAL today.** `ROI_MIN`/`ROI_MAX`/`ROI_FLEX` in `adaptive-thresholds.ts` are DEPRECATED (still logged, not the authority). The live gate reads `module_constants`: `expectancy_gates.roi_absolute_min/max/roi_flex_multiplier/friction_safety_buffer` + per-regime `roi_gating.min_roi` — all resolved at a **GLOBAL key** (`_GLOBAL_KEY` / `assetClass:'*'`, `expectancy.ts:203-208, 225-227`). To make the floor per-class we thread `assetClass` into those resolver calls + seed per-class rows.
5. **The gate is already VTS/SQE-shared** (`isSignalProfitable` "used by both VTS and SQE for parity", `expectancy.ts:241`). So the per-class-gate change inherits to both by construction; the multi-path work is concentrated in the new FILTER + the target-setting.

---

## 1. The three coupled pieces

### Piece A — Target floor (the actual opener)
Raise the effective per-pair target to a per-class floor (~3.5–4% ROI; RR ≥ 2.5–3 vs the stop) so signals can clear the fee wall. Because target = `mult × ATR / price`, the floor is realized by **a per-class target-ROI floor applied to the strategy's ATR-target** (lift the target to `floor%` when the ATR-target falls below it) — PAIRED with Piece C so we only ever lift on pairs that can actually reach it. (Design decision in §3 Q1: lift-to-floor vs raise `target_exit_atr_multiplier` vs both.) Per-class DB-governed (crypto + xStock).

### Piece B — Per-class ROI/EV gate
Thread `assetClass` into `getDynamicROIThreshold` / `getMinROIForRegime` / `isSignalProfitable` (today global) and seed per-class `expectancy_gates` + `roi_gating` rows for crypto AND xStock. The friction-aware `requiredROI = max(dynamicROI, frictionFloor)` then bounds per class. Backstop, not the opener.

### Piece C — Movement/reachability filter (the new filter)
A NEW per-pair filter in the FILTER phase (alongside LQ/VN/DI): a pair passes only if its volatility supports a ≥floor% target reachable in the hold window — i.e. **ATRs-to-floor = `floor / (ATR/price)` ≤ a per-class reachable bound.** ATR and Sigma are already computed and on the survivor object (`fx5-scanner.ts` `atr`/`Sigma` fields) — no new metric feed. The "liquid" dimension stays the EXISTING LQ filter (no duplicate, Kyle directive). DB-governed per-class threshold; surfaced by-reason.

---

## 2. Objectives

**OBJ-1 — Per-class target floor (Piece A).** Implement a per-class target-ROI floor on the ATR-based target so every emitted signal aims for ≥ the per-class floor (seed ~3.5–4% crypto; xStock its own value). DB-governed (`module_constants`, per-class). Verify RR ≥ the per-class minimum vs the stop after the lift (a bigger target must not break the stop geometry — coordinate with the strategy's stop).

**OBJ-2 — Per-class ROI/EV gate (Piece B).** Thread `assetClass` through `getDynamicROIThreshold`/`getMinROIForRegime`/`isSignalProfitable`/`getROIDetails`; seed per-class `expectancy_gates.roi_absolute_min/max` + `roi_gating.min_roi` for crypto AND xStock; no silent global fallback (fail per the no-hardcoded-DB-default rule). Keep the friction floor intact.

**OBJ-3 — Movement/reachability filter (Piece C).** Add the new per-pair filter in the filter phase using on-survivor ATR/Sigma; per-class DB threshold; **excluded pairs counted by-reason in the existing IMF filter diagnostics** (the `failedLQ/failedVN/failedDI` surface gains a `failedReachability`-style count). NOT a hidden SQE/RTB gate; NOT a top-N ranker (ranking-among-survivors is reorg-B5).

**OBJ-4 — MULTI-PATH CONSISTENCY (Kyle directive 2026-06-20).** Wire Pieces A + C into EVERY path that runs the filter/target — enumerate explicitly and verify none missed:
- active paper **main quant scan** (fx5-scanner `active_quant`),
- **pattern-pool / pattern-only** path (fx5-scanner `active_pattern`),
- the **family-routed** filters (`active_trend/reversal/breakout/oscillator/strong_trend`),
- the **per-class xStock** path (`server/asset_classes/xstock_spot/imf-evaluator.ts` + `eval-cycle.ts` — note xStock uses DEPTH-based LQ, so the movement filter must read xStock's volatility correctly there),
- the **VTS/passive** path (`vts-runner.ts` + the `vts_*` filterPath rows) — VTS adopts the same filter + the raised targets (looser threshold allowed, SAME filter, SAME DB governance).
The Step-2 pre-audit produces the authoritative file:line list per path; Langston Step-1 confirms the enumeration is complete.

**OBJ-5 — Surfacing + Filter Diagnostics home.** All new thresholds + the new filter's rejections are visible (never hidden): by-reason counts in the IMF diagnostics now; the full paper-mode Filter Diagnostics build (both classes) is owned by **reorg-B6** and is noted there.

**OBJ-6 — Tests.** A low-ATR/price pair fails the movement filter (by-reason) and a high-ATR pair passes; a strategy target below the floor is lifted to the per-class floor with RR preserved; the per-class ROI gate resolves crypto vs xStock rows (not the global); VTS path applies the same filter at its relaxed threshold; no global silent fallback when a per-class row is absent (fail-closed).

## 3. Scope guards
- **Do NOT** duplicate the liquidity (LQ) filter — Piece C is the movement/reachability dimension only.
- **Do NOT** edit the deprecated `adaptive-thresholds.ts` ROI consts as if they gate — they don't; the authority is `module_constants`.
- **Do NOT** build a top-N universe ranker — selection-among-survivors is reorg-B5; B2 is pass/fail filtering + target floor.
- **Do NOT** weaken the EV/Net-Expectancy friction backstop — it stays the final gate.
- Per-class for BOTH crypto and xStock everywhere (D1/D2); no crypto-only knob.

## 4. Langston Step-1 questions
1. **Piece A mechanism:** per-class **target-ROI floor that lifts the ATR-target to floor%** (CC lean — keeps strategy ATR-geometry, guarantees the fee-clearing target, safe because Piece C gates reachability), vs **raising `target_exit_atr_multiplier`** per-class/strategy, vs both? And where to apply the lift (a central post-strategy target-normalizer vs per-strategy)?
2. **Piece C formulation:** **ATRs-to-floor ≤ per-class reachable bound** (CC lean) vs a raw ATR/price volatility-floor? And the hold-window assumption baked into "reachable."
3. **Threshold home for Piece C:** a new **`screener_filters` column** (mirrors `lqMin`/`vnMax`, per `(mode,assetClass,filterPath)` — CC lean, it's a filter-phase metric) vs a `module_constants` entry?
4. **Piece B:** confirm threading `assetClass` into the ROI-gate resolver calls + seeding per-class `expectancy_gates`/`roi_gating` rows (vs leaving the gate global and relying only on Piece A). CC lean: per-class gate (consistency + the no-global-default rule).
5. **Path enumeration (OBJ-4):** is the 5-path + xStock-evaluator + VTS list complete, or is there another consumer of the target/filter I should add?

---
*On Step-1 PROCEED → Step-2 pre-audit (authoritative per-path file:line enumeration + the ATR/price reachability math + the per-class DB-seed plan + RR-preservation check) → Step-3 implement → bench → Step-4 Langston diff review (Discord) → CI → deploy → verify (crypto signals now reach OPEN through the gate; by-reason diagnostics populate; per-class both classes) → governance (System Manual: strategy target-setting + the new filter + per-class gate; SIM: the new filter-phase metric + per-class threshold flow; Tier-1) → close.*
