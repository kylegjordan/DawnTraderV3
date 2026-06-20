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

**OBJ-7 — DELETE the deprecated hardcoded ROI bounds (Kyle directive 2026-06-20; never-leave-legacy rule 18).** Remove `ROI_MIN` / `ROI_MAX` / `ROI_FLEX_MULTIPLIER` + the `ADAPTIVE_THRESHOLDS_CONFIG` ROI fields + the stale `[11.7C][Config]` log line from `server/config/adaptive-thresholds.ts`. They are DEAD — the live gate reads `module_constants` (`expectancy_gates`); **verified ZERO importers of these symbols anywhere** (only `DEFAULT_SLIPPAGE` from that file is still imported, by `expectancy.ts:51-53` — KEEP it). Full workflow + blast-radius proof (tsc), `DELETED_COMPONENTS_LOG.md` entry + `_archive/deleted-code/*.removed` archive. Folded here because Piece B replaces these per-class — deleting them now prevents the deprecated bounds from ever being accidentally re-wired.

**★PER-CLASS/VTS STATUS (Kyle question 2026-06-20, verified):** the ROI bounds ARE in the DB (`module_constants`), and that applies UNIFORMLY to crypto, xStock, AND VTS — but as ONE GLOBAL value (resolved at `_GLOBAL_KEY`/`assetClass:'*'`; the gate `isSignalProfitable` is VTS/SQE-shared). They are NOT yet SEPARATE per class. Making them genuinely per-class (crypto ≠ xStock) is Piece B; VTS inherits per-class automatically via the shared gate once `assetClass` is threaded.

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

## 5. Langston Step-1 — PROCEED (Discord, 2026-06-20); resolutions LOCKED
**PROCEED; change-class architecture CONCURRED.** Resolutions (all accepted):
- **Q1 (Piece A):** `target = max(entry + mult×ATR, entry×(1+floor))` via a **CENTRAL post-strategy normalizer** — NOT per-strategy, NOT a mult-bump (a mult-bump fails the floor guarantee on a low-ATR pair). The normalizer MUST sit **AFTER both `targetPrice` AND `stopPrice` are set**; it preserves RR (or co-moves the stop) and proves RR ≥ per-class min post-lift. If the stop isn't set at that point, the normalizer location is wrong.
- **Q2 (Piece C):** ATRs-to-floor, but reachability is **√H-scaled** (favorable excursion ≈ ATR·√H driftless, NOT linear "K ATRs in K bars") — bake the assumed hold-window H into the bound's derivation, document it, seed conservatively per-class, let the by-reason counts calibrate. No naive linear reachability.
- **Q3 (homes):** SPLIT by consumption — Piece C → **`screener_filters` column** (per `(mode,assetClass,filterPath)`, exactly what multi-path + VTS relaxed need); Piece A floor + Piece B gate rows → **`module_constants` per-class**. Do NOT put A/B in `screener_filters`.
- **Q4 (Piece B):** thread per-class; fail-closed on a missing row, BUT the seed-vs-read window must be **cold-start warmup, NOT a silent global fallback** (§11 / #10) — Step-2 states the seed-before-read guarantee (gate is VTS/SQE-shared).
- **Q5 (paths):** ADD the **9 in-class `detect*` target-setters in `strategy-engine.ts`** (only the 12 file-based strategies were in §0.2) + any deterministic **backtest/SIM** target path (or state none — sim-to-live parity); CONFIRM **RTB-refresh** + **TEC execution-time re-check** don't re-derive `targetPrice` outside the normalizer or re-run the filter.

## 6. Step-2 pre-audit deliverables + MANDATORY reads
**Langston-required:** (a) authoritative per-path `file:line` list incl. the 2 path additions; (b) the √H reachability derivation with its H; (c) the RR-preservation proof at the normalizer; (d) the per-class-gate seed-ordering guarantee.
**★MANDATORY blast-radius reads (Kyle directive 2026-06-20):** `1-system-manual/SYSTEM_IMPACT_MAP.md` + the Phase-19 `1-system-manual/ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md` + `1-system-manual/SYSTEM_MANUAL.md` — thorough up/downstream impact mapping AND a thorough code review (not a gloss).
**Autonomy:** CC + Langston iterate autonomously Step-2 → close (Kyle released per-round approval 2026-06-20); escalate to Kyle only on true deadlock / scope/authority changes.

---
*Step-2 pre-audit (the mandatory reads + per-path enumeration + the math/proofs above) → Step-3 implement (central normalizer + per-class screener_filters column + per-class module_constants seeds + OBJ-7 deletion) → bench → Step-4 Langston diff review (Discord, thorough code-level) → CI → deploy → verify (crypto signals now reach OPEN through the gate; by-reason diagnostics populate; per-class both classes) → governance (System Manual: target-setting + new filter + per-class gate; SIM: new filter-phase metric + per-class flow; DELETED_COMPONENTS_LOG; Tier-1) → close.*
