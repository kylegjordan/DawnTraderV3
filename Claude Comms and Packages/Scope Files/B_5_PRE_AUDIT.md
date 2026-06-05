# B.5 xStock Per-Strategy Calibration (W2/W3) — PRE-AUDIT (Step 2)

> **Created 2026-06-05.** Step-2 pre-audit for `B_XSTOCK_STRATEGY_CALIB_W2W3_SCOPE.md` (v2, Langston Step-1 ACK'd). Active trading OFF → CANDIDATE settings on forward-return proxy. Crypto untouched. Per §2 SIM-consult mandate + §9 discipline. Resolves the ORB 24/5 question (Kyle directive 2026-06-05).

---

## §1 — SIM + System Manual consultation (Step-2 mandatory)

- **SIM §12 (module_constants):** resolution is most-specific-wins on (exchange, asset_class, strategy, regime), 60 s cache; `getCachedNumbersForModule('strategy.<name>', _SE_KEY(name, assetClass))` is the single shared resolver both VTS and active paths call. Seeding `xstock_spot` rows is the ONLY change W2.2 needs — no code fork. **Per-class scoping permission** (SIM §4.18 LOCKED-module override pattern): seeding per-class strategy rows is in-scope; orchestrator regime/bucket topology is NOT.
- **System Manual §3/§4 (strategy logic):** documents each strategy's entry/stop/target formula. **GOVERNANCE GAP (record on close):** (a) no entry for where/how each strategy's hold-time param is set + converted to clock-time; (b) no unified trade-construction spec; (c) no per-asset-class trade-construction calibration matrix. B.5 is the first per-class trade-construction re-fit → it must leave that matrix behind.
- **System Manual §5 (exit geometry):** exit eval order target→stop→trailing→max_holding; MAX_HOLD enforced in TEC + paper-execution-engine.

## §2 — W2.1 blast radius (duration-intent fix) — code-verified

**The defect is an inter-path parity split AND an inter-strategy inconsistency:**

| Site | File:line | Units today | Note |
|---|---|---|---|
| vwap_pullback hold WRITE | `strategy-engine.ts:130,218` | **bar-count** (`max_holding_period_bars_default`=24) | into `signal.metadata.maxHoldingPeriod` |
| breakout hold WRITE | `strategy-engine.ts:500` | **hours** (`max_holding_hours`) | DIFFERENT unit than vwap_pullback for the same concept |
| historic backtest exit | `historic-signal-generator.ts:339,344` | **bar-count** (hardcoded 24-bar loop) | = 24h at 60m, **6h at 15m** |
| paper enforcer READ | `paper-execution-engine.ts:1068-1081` | **hours** (`parseFloat(maxHoldingPeriod)`, ÷3.6e6) | reads the bar-count 24 as 24 HOURS |
| TEC exit | `tec-evaluator.ts:227,241` | **ms** | SAFE (duration-based) |
| VTS safety valve | `vts-runner.ts:717,2246` | **ms** (`MAX_HOLD_MS`=7d global) | SAFE; but NO per-strategy hold in VTS |

**Consequences:** (1) at 60m, bar-count-24 ≈ 24h so historic (bars) and paper (hours) coincidentally agreed; at 15m the historic window is 6h while paper holds 24h → **4× sim-to-live divergence**, so a W2.2 forward-return sweep cannot be trusted until this is unified. (2) hold-time is expressed in 3 different units across strategies/paths. (3) VTS has no per-strategy hold (7-day global only) — a separate gap to note.

**W2.1 fix (NARROW, per Langston):** unify all *duration-intent* params on ONE clock-anchored definition (ms or hours) carried unambiguously in metadata; fix `historic-signal-generator` to convert the intended duration via the **actual bar size**, not a hardcoded bar count; leave the VTS 7-day valve. **Duration-intent params to anchor:** `max_holding_period_bars_default` (vwap_pullback), `max_holding_hours` (breakout), and any other per-strategy hold/time-stop/cooldown/active-window. **STAY bar-count → re-tuned in W2.2 (NOT anchored):** all look-back/smoothing windows — `volume_avg_lookback`, `volume_confirm_min_history`, `min_consolidation_bars`, `max_pullback_bars`, `vwap_slope_lookback`, `min_history_bars`, `sma_length`, `obi_lookback_bars`, `recent_vol_lookback`, etc. (These are bar-denominated TA objects; their optimal length is bar-size-dependent.)

## §3 — W2.0 engine design (the central decision) — b31a does NOT invoke detection

**Verified:** `scripts/b-xstock-calib-b31a-gate-audit-2.ts` reads pre-computed `signal_eval_archive` rows (line 242) + walks 1m bars for L2 hit-ordering with *standardized* geometry; it never calls the strategy detect functions. So a parameter sweep needs one of two harnesses, split by what the param affects:

- **W2.0a — GEOMETRY-knob sweep (lighter; do FIRST).** Stop/target ATR mults, R multiples, target offsets, entry premium do NOT change WHICH signals fire — only where stop/target sit. Reuse b31a's hit-ordering walk, but compute each candidate geometry from the strategy's actual formula and re-walk. **Drift guard:** at baseline param values the harness must reproduce the archived signals' geometry (parity check) before any sweep is trusted. Covers the highest-leverage knobs (exit geometry = where the HCE study said edge is captured).
- **W2.0b — ENTRY-TRIGGER-knob sweep (heavier).** Thresholds / proximity / compression / deviation DO change which signals fire → must re-invoke the real detect functions over historical bars with patched `module_constants` (no logic duplication, no drift). `callStrategyDetect(...)` (vts-runner.ts:834-902) is the entry point; inputs (indicators, ohlc, patternInput) are reconstructable from the OHLC archive + indicator service.

**Recommendation:** build W2.0a first (parity-checked), run the geometry sweeps (W2.2 geometry pass), then build W2.0b for the entry-trigger pass. This front-loads the highest-leverage, lowest-drift work and de-risks the heavy detection-replay piece. Both stay read-only against archives; no production code.

## §4 — Per-strategy param surface + grouping (W2.2)

All 9 enabled strategies resolve `getCachedNumbersForModule('strategy.<name>', _SE_KEY(name, assetClass))`. Params cluster into: **entry-quality** (thresholds/proximity/compression), **geometry** (ATR/R mults), **indicator-period** (look-backs), **duration** (hold). **W2.2 groups (Langston's, by shared exit/overnight mechanism):**

- **(a) trend/momentum:** breakout, sma_trend_ride — knobs: `min_consolidation_bars`*, `breakout_buffer_pct`, `sma_length`*, trailing-stop %, stop/target mults. (*indicator-period → W2.2 re-tune.)
- **(b) VWAP:** vwap_bounce, vwap_pullback — `vwap_proximity_pct`, `pullback_threshold_pct`, stop_atr_mult_vwap, target_r_multiple, entry_premium.
- **(c) mean-revert/range:** mean_reversion, range_trade — `deviation_threshold`, `entry_zone_width_pct`, stop/target mults. **`range_trade` ISOLATED** in its own evidence sub-step (848 evals, 100% RANGE_BOUND, #201-starved → expect INCONCLUSIVE under the min-sample gate; do NOT seed a fragile fit).
- **(d) pattern/structure:** inside_bar_reversal, morning_star, pivot_shift — `min_pattern_strength`, `max_compression_ratio`, `target_exit_atr_multiplier`, confidence weights. (Pattern SHAPE tolerances NOT re-tuned — HCE coin-flip finding; path stays ON as negative-control.)

One Langston Step-4/8 + group-by-group `module_constants` seed per group (a bad group reverts alone). Sweep WIDE (inherited `*` values are placeholders, not known-good).

## §5 — ORB 24/5 RESOLUTION (Kyle directive — the opening-range question)

**Code truth:** ORB already anchors its opening range to **14:30 UTC = US cash open** (`orb.ts:69-70` `RTH_OPEN_HOUR_UTC=14/MINUTE=30`), UTC-math based, NOT "first 30 min of the token's 24-h day" — so the anchor is already correct for a tokenized equity (real price discovery happens at the US cash open; off-hours bars track the last cash print + drift). `market-hours.ts` `isXstockMarketOpenUTC()` already gates the weekend (Fri 20:00 ET → Sun 20:00 ET, DST-aware via `Intl`), and the scanner/TEC already respect it. **The ONLY genuine gap is a US equity holiday / half-day calendar** — none exists today (the code comment in `market-hours.ts:25-29` even anticipates a `xstockMarketHoursOverride` (date,status) override list). On a US holiday the equity feed is stale/thin, so a 14:30 UTC "opening range" would be meaningless.

**RESOLUTION (recommended; for Langston confirm + Kyle visibility):**
1. **Keep the 14:30 UTC US-cash-open anchor** — already correct, no change.
2. **Build a small, reusable US-equity holiday/half-day calendar** as the anticipated `module_constants` override (list of (date, status: full_holiday | half_day_early_close)). ~20-line addition in/near `market-hours.ts` (`isUsMarketHolidayUTC(now)` / half-day early-close handling), DST-aware, reusing the existing `Intl` ET logic. This is the structural NO-PATCHES answer and is reusable by scanner/TEC later.
3. **Gate ORB on it:** skip opening-range formation on full holidays; on half-days, stop after the early-close. Add unit tests (holiday → null; half-day post-close → null).
4. **Tie ORB's active-window end to the US cash close (DST-aware)** rather than the hardcoded 17:00 UTC — modest correctness improvement; optional, can be a W3 sub-item.
5. **Re-enable** ORB (`strategy_gates.xstock_spot.orb.enabled=true`) only AFTER the gate lands + a forward-edge check on 15-min data (RUNNING_ISSUES #203 gates activation on strategy-fit validation, not just plumbing). ORB candidate edge proven on VTS evidence is pre-19; final adoption Phase 19/25.

**Scope impact:** folds the holiday-calendar build into W3 (Langston already called it "a small, well-scoped addition"). Surfaced to Kyle as the answer to his ORB question.

## §6 — Blast radius / SIM update obligations

W2.1 touches `strategy-engine.ts`, `paper-execution-engine.ts`, `historic-signal-generator.ts` (+ doc string in `routes.ts`). W3 touches `orb.ts`, `market-hours.ts` (+ new holiday calendar), `module_constants` seed. W2.2 = `module_constants` rows only (+ the sweep scripts under `scripts/`). SIM entries to update on close: strategy-engine trade-construction params, market-hours/holiday calendar (new component), the b31a sweep scripts (new). System Manual: the 3 gaps in §1 + the per-class calibration matrix.

## §7 — Open design questions for Langston (Step-2)

1. **W2.0 split (§3):** agree with geometry-sweep-first (W2.0a, parity-checked) then detection-replay (W2.0b)? Or prefer full detection-replay from the start (heavier, but one harness)?
2. **W2.1 hold-time unification (§2):** unify on **ms-in-metadata** (most explicit) vs **hours**? And confirm fixing `historic-signal-generator` to convert duration via actual bar size is in-scope (it's the sim side of the parity split).
3. **ORB holiday calendar (§5):** confirm folding the holiday/half-day calendar into W3, built as the `module_constants` override the code anticipates; and whether tying the active-window end to DST-aware US cash close is in-scope now or deferred.
4. **VTS per-strategy hold gap:** VTS enforces only the 7-day global valve (no per-strategy hold). Note + defer to Phase 19, or address in W2.1? (Leaning defer — VTS is telemetry-only; the per-strategy hold matters at active-trading.)
5. **range_trade:** confirm INCONCLUSIVE-by-default handling (don't seed) given 848 samples.

---

*Pre-audit Step 2, 2026-06-05. Parent scope `B_XSTOCK_STRATEGY_CALIB_W2W3_SCOPE.md` v2. Active trading OFF — CANDIDATE evidence. Crypto untouched.*
