# P19 reorg-B2 — Pre-Implementation Audit

> **Batch:** reorg-B2 · **Phase:** 19 · **Author:** NEW Claude (CC-B) · **Date:** 2026-06-20 · **change-class:** architecture
> **Scope:** `P19_REORG_B2_SCOPE.md` (Langston Step-1 PROCEED, Discord). This pre-audit delivers Langston's 4 Step-2 items + the Kyle-mandated blast-radius reads.
> **Comms:** Discord (this batch). **Autonomy:** CC + Langston iterate Step-2→close.

## §1 — Mandatory blast-radius reads (Kyle directive 2026-06-20)
- **Phase-19 Active-Trading-Pipeline Audit** (`ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md`): the active line is scan → IMF filters (LQ/VN/DI) → signal-orchestrator → SQE → RTB → TCL → open/EV-gate (11.8B Net-Expectancy) → TEC → close. **B2 touches three stations:** the FILTER station (new movement metric), the TARGET-SETTING (pre-SQE), and the EV/ROI gate (per-class). Audit §11 (EV/friction) confirms `requiredROI = max(dynamicROI, frictionFloor)`, `frictionFloor=(fee×2)+(slip×buffer)` — the fee wall is the binding constraint; raising the TARGET is the opener, not the gate.
- **SIM Cross-Cutting Runtime State (§ registry):** the relevant shared state is the `module_constants` cache (warmed at boot, §7.1) + the `screener_filters` rows. No NEW process-global/singleton is introduced (the movement metric rides the existing per-pair survivor object + the filter-diagnostics counters S-family). A SIM update IS required for the new filter-phase metric + the per-class threshold flow (Step-10).
- **System Manual:** Ch3 (FX5 scanner + screener filters), the IMF metric defs (`passesCoreMetricFilters = LQ≥LQ_MIN ∧ VolNoise≤VN_MAX`), and the ROI Gate (`≥ dynamic threshold from regime+PredictiveConfidence`). B2 adds a metric to Ch3's filter set + makes the ROI gate per-class + changes target-setting (strategy logic) → System-Manual content update required (Step-10).

## §2 — Per-path enumeration (Langston deliverable a) — file:line, the filter + the target-setters

### A. IMF / core-metric FILTER paths (where Piece C — the movement filter — wires in)
| Path | Site | Threshold source |
|---|---|---|
| Active main quant | `fx5-scanner.ts` `passesCoreMetricFilters(LQ,VolNoise,dbLqMin,dbVnMax)` | `screener_filters (mode,crypto_spot,active_quant)` cols `lqMin/vnMax` |
| Pattern / pattern-only | `fx5-scanner.ts` pattern path (`PATTERN_IMF`) | `screener_filters … active_pattern` |
| Family-routed (5 families) | `fx5-scanner.ts` per-family `LQ_MIN/VN_MAX/DI_MIN/DI_MAX` | `screener_filters … active_trend/reversal/breakout/oscillator/strong_trend` |
| xStock per-class | `server/asset_classes/xstock_spot/imf-evaluator.ts` (DEPTH-based LQ via `calculateXstockDepthLQ`) | `screener_filters … (xstock_spot, vts_*/active_*)` |
| VTS / passive | reloads `vts_*` filterPath rows (relaxed) — `fx5-scanner.ts` passive branch | `screener_filters … vts_quant/vts_pattern/vts_*` |
The movement filter = a NEW `screener_filters` column (e.g. `reachAtrMax`) per `(mode,assetClass,filterPath)` — every path above resolves its own row, so the multi-path consistency is by-construction; by-reason count joins the existing `failedLQ/failedVN/failedDI` diagnostics.

### B. TARGET-SETTERS (where Piece A — the normalizer — must NOT be, and the 21 sites it replaces)
- **12 file-based** (`server/strategies/*.ts`): `targetPrice = entry + target_exit_atr_multiplier × effectiveATR`; each calls `applyGlobalGuards(entry, stop, target, ATR)` (e.g. `reverse-impulse.ts:172/175`).
- **9 in-class `detect*`** (`server/services/strategy-engine.ts`, confirmed = the B72.2 set: vwap_pullback, abcd_long, sma_trend_ride, breakout, mean_reversion, range_trade, vwap_bounce, liquidity_trap, dhma). **HETEROGENEOUS target formulas** — NOT uniform `mult×ATR`: VWAP `max(high24h−atr×offset, 2R)` (`:251-255`), ABCD `min(measuredMove, 2R)` or `entry×(1+pct)` (`:365-380`), SMA `entry×(1+trendStrength×factor)` or R-based (`:492-503`), etc. **These do NOT call `applyGlobalGuards`** (grep: no match in strategy-engine.ts).
- **CONSEQUENCE:** `applyGlobalGuards` is NOT universal → it is NOT the central point. A per-strategy floor = 21 heterogeneous edits = drift. → the normalizer must live at the **post-strategy convergence point** (§3).

### C. Backtest/SIM + downstream re-derivation (Langston Q5 confirms)
- **VTS** uses the REAL `StrategyEngine.detect*` (System Manual BUG-001 RESOLVED — VTS no longer simulates scores) → VTS targets come from the SAME 21 setters, NOT an independent path. **OPEN (§4-V1):** confirm whether vts-runner routes through `signal-orchestrator` or calls `strategyEngine` directly — that决定s where the normalizer must sit to cover BOTH active + VTS.
- **RTB-refresh / ready_to_buy_service:** NO targetPrice re-derivation (grep: no recompute) — **CONFIRMED does not re-derive.**
- **TEC** (`trailing-exit-controller.ts:618`): `targetPrice // ORIGINAL target at trade open. Reference only.` — **CONFIRMED does not re-derive** (reference-only for trailing).

## §3 — Normalizer insertion point + RR-preservation proof (Langston deliverables a, c)
**All signals converge in `signal-orchestrator.ts` carrying `rawSignal.stopPrice` + `rawSignal.targetPrice`** (481-482, 503, 554-555, 740-741, …) with a validation chokepoint at **`:2244-2248`** (`invalid stopPrice/targetPrice`, `stopPrice >= entryPrice` reject). **Candidate central normalizer location: in the orchestrator, immediately after that validation, BEFORE the EV/ROI gate (`isSignalProfitable`) and RTB.** It is formula-AGNOSTIC (sees final entry/stop/target only) → covers all 21 heterogeneous setters with one site.
**Normalizer logic:** `target' = max(target_native, entry × (1 + floor_class))`; then `RR = (target' − entry) / (entry − stop)`.
**RR-preservation PROOF (Langston's flag):** lifting the target UP with the stop fixed raises RR (`RR' ≥ RR_native`), so RR never DROPS. BUT the per-class min-RR (2.5–3) is NOT guaranteed by the lift alone: `RR' = floor / stopDist%`, which is ≥ minRR only if `stopDist% ≤ floor/minRR`. **So the normalizer MUST, after the lift, check `RR' ≥ minRR_class` and either (i) tighten/co-move the stop to hit minRR, or (ii) drop the signal** (Step-3 design choice — CC lean: co-move the stop inward to minRR when the pair's structure allows, else drop + count by-reason; never silently ship sub-RR). The movement filter (Piece C) makes the lift reachable; this RR check makes it geometrically sound.
**Fallback-literal cleanup (surfaced):** the orchestrator has hardcoded fallback targets/stops (`:1200` `?? entry×1.015`, `:1558-1559` `?? ×0.97 / ×1.03`) — sub-fee-wall literals that the per-class floor should supersede; fold into the normalizer or flag for removal (rule-18) at Step-3.

## §4 — √H reachability derivation (Langston deliverable b)
ATR is per-bar volatility (14-period on 60-min candles → ATR ≈ one 1h-bar's true range). For a driftless walk, expected favorable excursion over H bars scales with **√H**, not linearly: `E[maxFavExcursion] ≈ ATR · √H` (more with regime drift). So a target K ATRs away is reachable in H bars when **`K ≲ c·√H`** (c≈1, conservative). With **K = ATRs-to-floor = floor / (ATR/price)** and Kyle's hold window "half a day to a full day" ≈ **H = 12–24 1h-bars** (√H ≈ 3.5–4.9):
> **Filter rule: pass iff `floor / (ATR/price) ≤ c·√H` ⇒ `ATR/price ≥ floor / (c·√H)`.**
For a 3.5% floor, H≈16 (√H=4), c≈1 → require `ATR/price ≥ ~0.9%`. Seed the per-class bound CONSERVATIVELY (higher ATR/price requirement) and let the by-reason counts calibrate in Phase 25. H is per-class (crypto 24/7 vs xStock 24/5) and DB-governed alongside the floor. **Do NOT ship linear "K ATRs in K bars."**

## §5 — Per-class gate seed-ordering guarantee (Langston deliverable d)
`server/startup/b72-warmup.ts` already prefetches `expectancy_gates` + `roi_gating` at boot and **HARD-FAILS (throws) on any zero-row module** — "no silent fallback" (Kyle directive, `:122-130`). It has a PROVEN per-class-assertion precedent: the **B-4.5 `fee_model` block (`:161-191`)** asserts BOTH `crypto_spot` AND `xstock_spot` taker/maker rows exist at boot and throws on a partial seed; the **B-5 AMR block (`:198-228`)** does the same per-class. **→ Piece B adds the new per-class `expectancy_gates`/`roi_gating` rows to that same boot assertion (mirror the fee_model block) so a missing per-class ROI row is a deterministic DEPLOY-time failure — cold-start warmup that throws, NEVER a silent global fallback.** This satisfies §11/#10 exactly with an in-codebase pattern.

## §6 — Per-class/VTS status (Kyle question, verified)
ROI bounds ARE DB (`module_constants expectancy_gates`/`roi_gating`); the `adaptive-thresholds.ts` consts are DEAD (OBJ-7 deletes them, ZERO importers). Resolved GLOBAL today (`_GLOBAL_KEY`/`assetClass:'*'`), shared by crypto + xStock + VTS via the VTS/SQE-shared `isSignalProfitable`. Per-class = Piece B (thread `assetClass`); VTS inherits via the shared gate.

## §7 — Open items to resolve before/at Step-3
- **V1 — RESOLVED:** VTS does NOT route through the orchestrator — it calls `strategyEngine.detect*` **directly** via `callStrategyDetect`/`callStrategyDetectRaw` (`vts-runner.ts:885-960`, its own `new StrategyEngine()` at `:419`), the VTS convergence point for all 21 strategies ("EXACT same parameters as the signal orchestrator for parity", `:874`). The active path converges in `signal-orchestrator`. **→ The normalizer is ONE SHARED helper `normalizeSignalTarget(signal, floor_class, minRR_class, assetClass)` applied at BOTH convergence points: (a) the orchestrator post-validation point (§3), and (b) `callStrategyDetect` post-detect (`vts-runner.ts:885`).** One helper, two call sites — formula-agnostic, covers all 21 setters on BOTH active + VTS, satisfying the multi-path-consistency directive for Piece A. (This is the Piece-A analogue of how Piece C rides the per-`filterPath` `screener_filters` rows.)
- **V2:** the new `screener_filters` column add (migration) + per-class seed values for crypto + xStock across all `filterPath` rows.
- **V3:** RR co-move-vs-drop decision when `RR' < minRR` after the lift.
- **V4:** the orchestrator fallback-literal targets/stops (§3) — supersede/remove.

---
*On Step-2 Langston ACK (Discord) → Step-3 implement (resolve V1 first; central normalizer + per-class screener_filters movement column + per-class module_constants ROI seeds + boot-assertion + OBJ-7 deletion) → bench → Step-4 Langston diff review (Discord, thorough) → CI → deploy → verify → governance → close.*
