# DawnTrader Adjustment Framework (Directive 11.8B-E)

> **Version:** 1.1 (B72 update — module_constants tuning surface added 2026-05-05)
> **Created:** 2026-04-11 (Batch 58a)
> **Authority:** This document is the decision constitution for all parameter adjustments in DawnTrader. It defines what may be adjusted, by whom, under what evidence, with what bounds, and with what safety guarantees.
> **Companion Documents:** AUTHORITY_BASELINE.md (V1.0 known-good snapshot), authority-baseline-v1.json (machine-readable baseline), CURRENT_SETTINGS_REGISTRY.md (live DB-tunable lever snapshot), LEVER_INVENTORY.md (B72 lever catalog).
> **Langston Consensus:** Messages #723-730 (2026-04-11). Three-tier governance, per-family bounds, evidence-source agnostic design, asset-class extensibility, three-mode evidence hierarchy.

---

## ⭐ STANDING RULE — A GEOMETRY GATE MUST NOT BE TUNED WITHOUT MEASURING ITS BLAST RADIUS FIRST (`B-GEOMETRY-REACH-BASELINE`, `#1052`, 2026-09-13)

⛔⛔ **BEFORE SEEDING ANY PER-STRATEGY GEOMETRY THRESHOLD, MEASURE THE SHARE OF LIVE SIGNALS THE NEW VALUE WOULD NEWLY REFUSE — PER STRATEGY, ON THE REAL CORPUS.** This batch derived four reachability ceilings that passed a pre-registered arbiter and would have refused **95.32 %**, **57.49 %** and **55.43 %** of three strategies' signals. **The derivation was sound; the consequence was not measured until a reviewer asked for it.**

⭐ **AND THE REASON GENERALISES BEYOND REACHABILITY: A THRESHOLD IS ONLY A DIAL IF THE QUANTITY IT GATES IS DISTRIBUTED.** `atrsToTarget` is not — it IS `target_exit_atr_multiplier` × (effectiveATR / rawATR), so for multiplier-derived strategies it is a **SPIKE ON A DB-GOVERNED CONSTANT** (p90−p10 = 0.001 for `morning_star`). Against a spike a threshold is a **knife edge**: above it nothing changes, below it the strategy stops trading. ⇒ ⛔ **CHECK THE SPREAD OF THE GATED QUANTITY BEFORE TREATING ITS THRESHOLD AS A TUNING PARAMETER. If p90−p10 is near zero, the threshold is an ON/OFF SWITCH and the real lever is whatever sets the constant.**
⚠️ **AND DO NOT APPLY THAT CONCLUSION UNIFORMLY — IT IS PER STRATEGY.** `sma_trend_ride` has no ATR term (`strategy-engine.ts:520-533`) and its `atrsToTarget` is genuinely continuous (p90−p10 = 2.991), so there the threshold IS a distributional selector and the levers are `break_target_r_multiple` / `trailing_strength_factor`.

⛔⛔ **THE NO-LOOSENING RULE IS STRUCK — KYLE, 2026-09-15.** It read: *"no per-strategy row may be LOOSER than its class default without realised-excursion evidence."* **His reasons, in his words: *"we are protecting a theoretical placeholder and not using all of the data that we've been gathering… we just have to start adjusting numbers and seeing what we're getting… this is just our new baseline placeholder from which we can still calibrate later."*** The class defaults are self-described placeholders, the evidence already gathered is enough to TRY a change, and no other variable in the system carried a rule this hard.
⚠️ **WHAT IT COST WHILE IT STOOD, MEASURED AT `B-REACH-BASELINE-ADJUST`: `strong_bull_trend` had passed the reachability gate ZERO times in 367,009 crypto evaluations and 0 of 406 on xStock — categorically off, by arithmetic, and nobody decided it.** The rule's own exit clause required evidence the gate itself prevented anyone from collecting.
✅ **WHAT REPLACES IT — THE BASELINE-PLACEHOLDER REGIME:** a per-strategy row MAY be seeded looser than its class default **as a stated placeholder**, provided it ships with **(a)** the measured blast radius below, **(b)** a falsifier — what observation would retire this value — and **(c)** a rollback that is IN GIT and whose ORDER is written down. **Phase 25 still calibrates; a placeholder is not a calibration and may not be cited as one.**
⛔ **AND THE MEASURE-BEFORE-YOU-SEED RULE ABOVE IS UNTOUCHED BY THIS.** Striking the lock removes the evidence PRECONDITION on loosening; it does not remove the obligation to measure what a value does before shipping it.

## ⭐⭐ THREE CLAUSES ADDED WITH THE STRIKE (`B-REACH-BASELINE-ADJUST`, 2026-09-21) — TWO ARE LANGSTON'S, ONE THE BATCH EARNED

**(1) THE SPREAD RULE IS NOT ABOUT REACHABILITY — IT IS ABOUT ANY GEOMETRY THRESHOLD.** `#1052` stated it for `reach_atr_max`. It generalises, and the second instance was found immediately: **`min_rr` is a knife edge on five (strategy × class) cells whose reward-to-risk is a CONSTANT by construction** — either the ratio of two ATR multipliers (`strong_bull_trend`: 6.0/3.0 ≡ 2.0) or an R-multiple target (`target = entry + risk × target_r_multiple`, so RR ≡ that multiple whatever the stop is: `vwap_bounce`, `sma_trend_ride`'s break arm). ⇒ **for those cells `min_rr` and `target_r_multiple` ARE THE SAME KNOB**, exactly as the ceiling and `target_exit_atr_multiplier` are.

**(2) ⛔ NO GEOMETRY THRESHOLD MAY BE SET EQUAL TO, OR WITHIN FLOAT-NOISE OF, A VALUE THE STRATEGY'S GEOMETRY PRODUCES IDENTICALLY.** *(Langston, 2026-09-20.)* **MEASURED: two live cells had a floor EXACTLY at their own constant RR** — xStock `strong_bull_trend` and crypto `vwap_bounce`, both at the class default 2.00 against an RR measured as `1.9999999999999463 … 2.0000000000000484`. **Whether a signal passed was decided at the fourteenth decimal place**, and the two cells fired at wildly different rates (≈0.75 % and ≈11.9–15.1 %) for arithmetic that is nominally identical. ⇒ **That is not a gate, it is a coin flip.** For a cell whose gated quantity is constant by construction, **every threshold strictly inside `(0, spike)` is equivalent — so choose one with unambiguous margin, and never the spike itself.**

**(3) ⭐ A REFUSED COHORT IS JUDGED AGAINST WHAT THE GATES ADMIT — NEVER AGAINST ZERO, AND NEVER AGAINST A POOLED MIXTURE WHERE A PER-CELL CONTROL EXISTS.** The VTS lane TAGS a signal the geometry gates refuse and simulates it to close, so **realised outcomes exist for trades that were never taken** — join `vts_open_trades` to `exit_decision_archive` on `trade_id`. ⚠️ **"The refused cohort lost money" is NOT a justification for a gate: at `B-REACH-BASELINE-ADJUST` the ADMITTED cohort was losing money too (−1.606 % crypto, −0.700 % xStock).** ⛔ **AND THE POOLED CONTROL IS A MIXTURE — using it REVERSED one cell's verdict: the pooled xStock control was 63 % one strategy, and against its OWN admitted cohort `vwap_pullback` was better on both axes.** ⇒ **per-cell is the default; pooled only where a cell's admitted set is EMPTY, and say so when it is.**
⛔ **RATCHET WARNING, live at `PHASE_19_PLAN` 2.4g-3:** where a gate's own threshold shapes the corpus a later re-derivation would read (`H` is endogenous to the reachability gate, and the gate applies to the VTS learning lane too), **the values may not be re-derived from post-gate data.** Such a gate can be tightened and then cannot be honestly loosened until an independent measurement exists.

## 0. module_constants Operator Tuning Surface (B72 — 2026-05-05)

**As of B72, ~163 active levers across 34 modules are DB-tunable without code redeploy.** The operator workflow is: SQL UPDATE → wait 60s background refresh → behavior change.

### Workflow

1. **Find the lever:** consult `1-system-manual/CURRENT_SETTINGS_REGISTRY.md` (auto-generated live snapshot, regenerated on demand via `tsx server/scripts/dump-settings-registry.ts`). The registry lists every DB-tunable setting with current value, scope, last-updated-at, last-updated-by.
2. **Identify resolution scope** of the row to tune:
   - `(*, *, *, *)` — global (most common)
   - `(*, *, *, <REGIME>)` — per-regime (e.g. `roi_gating.min_roi`)
   - `(*, *, <STRATEGY>, *)` — per-strategy (e.g. `strategy_dbs_routing_guards.dbs_min_threshold`, all `strategy.<key>` modules)
   - `(<EXCHANGE>, *, *, *)` / `(*, <ASSET_CLASS>, *, *)` — exchange/asset-class scoped (e.g. `cost_model` kraken-only fees, `pattern_pool_gates` crypto_spot-scoped)
3. **Apply the SQL UPDATE:**
   ```sql
   UPDATE module_constants
      SET value = '<NEW_VALUE>'::jsonb,
          updated_at = now(),
          updated_by = '<your-handle> 2026-MM-DD'
    WHERE module_name = '<module>'
      AND constant_name = '<name>'
      AND exchange = '<scope>' AND asset_class = '<scope>'
      AND strategy = '<scope>' AND regime = '<scope>';
   ```
4. **Wait up to 60 seconds** for the background refresher in `module-constants-service.ts` to re-prefetch.
5. **Verify** by re-running the registry script or checking PM2 logs for behavioral evidence next signal cycle.

### Safety guarantees (B72)

- **No silent fallback** — `getCachedNumberRequired()` throws on missing/non-numeric value. Deleting a required row → next sync read fails loudly → restart hard-fails on the prefetch.
- **Boot hard-fail discipline** — every PROMOTE module read from sync code is in `PREFETCH_MODULES` list (`server/startup/b72-warmup.ts`); server refuses to start if any prefetch returns zero rows.
- **Reversible** — every UPDATE captured in `updated_at` / `updated_by`. Roll back via inverse UPDATE.
- **Auditable** — `dump-settings-registry.ts` regeneration captures the live snapshot at any point.

### Three-layer precedence chains (where applicable)

| Lever family | Precedence (high → low) |
|---|---|
| SQE admission gates (`sqe_config.min_final_score`, `min_regime_weight`) | `screener_filters` row → `module_constants` `sqe_config` → `SQE_DEFAULT_THRESHOLDS` static mirror |
| RTB freshness decay (`rtb_ranking.finalscore_decay_lambda`) | `process.env.FINALSCORE_DECAY_RATE` → `module_constants` `rtb_ranking` |
| RTB live-picker ranker (P19-B7.1: `rtb_ranking.active_ranker` = `r_multiple`(default)\|`confidence`\|`ranking_score`) | `module_constants` `rtb_ranking` → **fail-hard, NO static default** (`getCachedStringRequired`; a missing row THROWS — §5 r15, no silent fallback) |
| RTB degenerate-geometry floor (P19-B7.1: `rtb_ranking.min_atr_fraction_floor`=0.10, `rtb_ranking.min_abs_risk_fraction`=0.0005) | `module_constants` `rtb_ranking` → fail-hard (`getCachedNumberRequired`). Conservative degenerate-only placeholders, Phase-25-tunable. The ranking-domain executability floor (capital-independent), distinct from the emit-stage GUARD-1 `MIN_STOP_DISTANCE_BPS` |
| **Maker/taker entry-decision haircut (P19-B7.2 — the crypto opener's conservatism dial; PER-ASSET-CLASS, START TIGHT)** — `maker_taker.maker_fill_probability`, `adverse_selection_base` + `adverse_selection_strength_mult`, `non_fill_cost_base` + `non_fill_continuation_penalty` + `non_fill_reversal_discount`, `hard_floor_continuation_strength`, `maker_time_budget_ms` | `module_constants` `maker_taker` (per `asset_class`; wildcards exchange/regime/strategy BY DESIGN — urgency is endogenous in the kernel, so regime-keying is redundant) → **fail-hard, NO static default** (`getCachedNumberRequired`; warmed by b72-warmup; missing row THROWS — §5 r15). **Rationale + how to tune (Langston Step-8 rider — the knob we second-guess at Phase-21):** the haircut is a deliberately pessimistic UNCALIBRATED guess until live passive-fill data exists (paper maker-fills are model-vs-model → DATA-FENCED, non-calibration). It STARTS TIGHT (Kyle 2026-07-01): maker wins the best-of-both compare ONLY when its ~0.55%-of-entry fee+spread advantage survives a worst-case adverse-selection estimate; errors bias toward UNDER-firing maker (miss some opens rather than float phantom maker-only opportunities into the B7.1 ranker/IC). The `getMakerPickProof()` maker-PICK-RATE is the too-loose early warning. Calibration (signal-conditioned markout curves = TOP, fill-prob `p(δ,T)`, alpha-decay half-life, non-fill C, maker/taker A/B) is Phase-25, gated on Phase-21 live fills — RUNNING_ISSUES #410. Seeds (crypto/xstock): pFill 0.50/0.50, A-base 0.0015/0.0010, A-slope 0.0035/0.0025, C-base 0.0010/0.0008, C-cont +0.0030/+0.0025, C-rev −0.0008/−0.0006, hard-floor 0.70/0.70, budget 60000ms. |
| **Pending-maker lifecycle + VTS twins (P19-B7.2c — post-promotion resting-maker knobs; PER-ASSET-CLASS)** — `maker_taker.maker_max_pending_ms` (seed 3,600,000 = 1h both classes), `maker_taker.maker_late_fill_haircut_pct` (seed 0 — INERT), `maker_taker.twin_enabled` (seed 1; numeric 1/0) | `module_constants` `maker_taker` (per `asset_class`) → fail-hard (`getCachedNumberRequired`). **⚠️ `maker_time_budget_ms` RE-PURPOSED by B7.2c (Kyle simplification 2026-07-02):** it NO LONGER drives any order lifecycle (the B7.2 make-then-take/convert design that used it as the ladder budget was CUT before it ever ran; that lifecycle code is deleted, not stubbed); it is now ONLY the SOFT expected-fill telemetry boundary (fill inside it = "filled fast") for the Phase-25 fill-rate report card — accessor `resolveMakerTimeBudgetMs`, intentionally uncalled today. The HARD lifecycle timeout is `maker_max_pending_ms`: a pending maker unfilled past it is DROPPED, period — no convert re-evaluation (Kyle). Coherence invariant enforced fail-hard at resolve: `maker_max_pending_ms >= maker_time_budget_ms` else THROW (Langston Q5). `maker_late_fill_haircut_pct` is an INERT Phase-25 placeholder read by NOTHING — a maker fill is ALWAYS at the limit exactly (`makerFillPrice(limit)=limit`, arity-pinned by unit test so wiring the knob requires a reviewed signature change). `twin_enabled` switches VTS maker/taker twin creation off without a deploy if the doubled VTS open volume misbehaves. Tuning `maker_max_pending_ms`: it IS the fill-window realism dial — shorter = stricter fill-rate truth, longer = more fills at staler entries; recalibrate at Phase-25 from the observed never-filled rate. |
| **Friction-divergence auto re-anchor + ratio band (P19-B8.2 — the paper-vs-live execution-quality trigger; PER-ASSET-CLASS, CONSERVATIVE PLACEHOLDERS)** — `friction_divergence.max_divergence_bps` (seed 25 both classes), `min_notional_delta_max` (seed 3), `min_reanchor_interval_ms` (seed 86,400,000 = 24h cooldown), `impact_k` (seed 1 — DIMENSIONLESS sqrt-law coefficient; sigma enters in bps so k·σ·√(Q/L) resolves to bps), `ratio_band_low`/`ratio_band_high` (seeds 0.5/2 — the OBJ-4 calibration-fit in-band window) | `module_constants` `friction_divergence` (per `asset_class`; wildcards elsewhere) → **fail-hard, NO static default** (`getCachedNumberRequired`; warmed by b72-warmup; rows shipped in the B8.2 migration — §5 r15). **What it does:** at every paper trade-open, `friction-divergence-evaluator` compares THIS open's real order cost against the risk-equivalent order at the LIVE Kraken balance (sqrt-impact law; the spread term cancels in the subtraction); |divergence| > `max_divergence_bps` OR the rolling-24h count of min-notional-binding splits > `min_notional_delta_max` → AUTO re-anchor (Kyle decision #1: triggered, not advisory) — balance := the live mirror figure, anchor_version++, ledger row + info alert. `min_reanchor_interval_ms` is the hysteresis (Langston Step-1 condition): no auto re-anchor inside the window regardless of divergence (strict-inequality bounds — boundary hover cannot storm). A re-anchor NEVER touches learning (proven byte-identical learning counts at the Step-7 synthetic proof). **Seeds are §9.2-declared PLACEHOLDERS pending Phase-25 calibration** — 25 bps is deliberately tight so the FIRST live trigger is reviewed early. Tuning: `max_divergence_bps` = "how far may paper compound past live before re-basing"; the band knobs gate which rows the calibration FIT reads (out-of-band rows stay queryable — segment, don't drop). |
| TCL warmup threshold (`rtb_config.tcl_warmup_threshold_signals`) | `process.env.TCL_SIGNAL_THRESHOLD` → `module_constants` `rtb_config` |
| net-EV pWin parameters (`expectancy_kernel.pwin_floor`/`ceiling`, `directional_integrity.di_pwin_factor`) | Caller-injected from `module_constants` → kernel default seed (kernel pure-math, no DB read) |

### Adding a new lever post-B72

1. Drizzle migration row in `module_constants` (use your batch's `updated_by` tag).
2. Source-file replacement using `getCachedNumberRequired()` or `getCachedNumbersForModule()`.
3. Add module name to `PREFETCH_MODULES` in `server/startup/b72-warmup.ts` if read from sync code.
4. Update `LEVER_INVENTORY.md`.
5. Re-run `dump-settings-registry.ts` to refresh `CURRENT_SETTINGS_REGISTRY.md`.
6. **Defensive:** post-migration `grep -rn "<OLD_CONST_NAME>" server/ --include="*.ts"` to catch missed callsites (lesson from BUG-2026-05-05-E/F/G).

---

## 1. Governance Principles

### 1.1 Constitutional Axioms

These principles are non-negotiable and govern everything below:

1. **DB is the threshold authority.** All filter thresholds are DB-driven via `screener_filters`. No hardcoded fallbacks. Code provides validation and guardrails only.
2. **One framework, mode-specific application.** There is one adjustment constitution, not separate ones per operating mode. Evidence requirements and adjustment aggressiveness vary by mode.
3. **Evidence before action.** No parameter may be adjusted without meeting its defined evidence threshold. Investigation is always permitted; execution-facing changes require realized-outcome evidence.
4. **Bounded and reversible.** Every adjustment must be bounded (cannot exceed defined min/max), reversible (can roll back to baseline), and auditable (logged with timestamp, old value, new value, evidence reference).
5. **No autonomous feedback loops.** The system may not over-trust its own outputs. Directional bias, learning recommendations, and drift corrections are context inputs, not autonomous drivers.
6. **Vetted-opportunity maximization, NOT pair-count maximization (Kyle directive 2026-06-02 — the lens for every threshold/gate/filter/regime/strategy-selection/signal tweak).** The objective of any calibration is to admit the **maximum number of vetted, solid, legitimate trade opportunities** — pairs we believe have a good chance of a profitable, risk-tolerance-fitting win — NOT the maximum number of pairs. Loosening a gate is correct **only** when it is *false-rejecting* genuinely-tradeable names (e.g. a mis-scaled carryover threshold), never to raise the count for its own sake; and a gate must never admit a name that isn't a solid opportunity (e.g. a book too thin for a clean fill is a bad trade, not a "good pair"). **Reject rate is an OUTPUT of "is this a solid opportunity," never a target to chase.** Every adjustment in the Phase-24 calibration arc (and beyond) is judged through this lens.

### 1.2 Authority Hierarchy

```
Kyle (human) — ultimate override authority, can declare explicit exceptions
  |
  v
Constitutional Framework (this document) — defines the rules
  |
  v
Authority Baseline (AUTHORITY_BASELINE.md) — the known-good V1.0 snapshot
  |
  v
Adjustment Registry (code) — enforces bounds and logs changes
  |
  v
Evidence Sources (VTS / Paper / Live) — justify changes
```

---

## 2. Governance Tiers

### Tier 1 — Evidence-Adjustable

Parameters that may be adjusted autonomously or semi-autonomously when evidence thresholds are met. These are the system's "tuning knobs."

| Parameter Category | Source | Current Authority | Adjustable By |
|---|---|---|---|
| Per-family IMF thresholds (LQ, VolNoise, DI, Correlation) | `screener_filters` DB (24 rows) | DB | Evidence-gated adjustment |
| Pattern path filter thresholds | `screener_filters` DB (pattern rows) | DB | Evidence-gated adjustment |
| Volume gate soft-factor weights | Strategy files (support_bounce, reverse_impulse, morning_star, volatility_edge A-point) | Hardcoded | Evidence-gated with code change |
| Selected strategy-specific parameters | Strategy files (ATR multipliers, pattern tolerances, RSI gates) | Hardcoded | Evidence-gated with code change |
| MIN_FINAL_SCORE quality floor | `screener_filters` DB (`final_score_min` column) | DB | Evidence-gated adjustment |
| VTS_NET_EV_FLOOR | `vts-runner.ts` (line 351) | Hardcoded (-0.01) | Evidence-gated with code change |

**Note on hardcoded parameters:** Tier 1 strategy constants currently live in code files, not DB. Adjusting them requires a code change + deploy. The framework governs whether the change is permitted, not the mechanism. Future migration to DB is a separate enhancement.

### Tier 2 — Supervised-Only

Parameters that may change but require explicit human review or cross-agent consensus. These affect capital allocation or system-level behavior.

| Parameter Category | Source | Current Authority | Adjustable By |
|---|---|---|---|
| rankingScore formula weights | `ranking-weights.ts` | Hardcoded | Kyle or Claude Code + Langston consensus |
| Regime-strategy weighting nuances | `canonical-regime-strategy-map.ts` | Hardcoded | Kyle or Claude Code + Langston consensus |
| VTS simulation knobs (cycle timing, batch composition) | `vts-runner.ts`, system-guards | Hardcoded | Kyle or Claude Code + Langston consensus |
| Directional bias weighting influence | Signal orchestrator | Hardcoded | Kyle or Claude Code + Langston consensus |
| HYBRID_PARAMS weights (quant/pattern/predictive) | `system-guards.ts` | Hardcoded | Kyle or Claude Code + Langston consensus |

### Tier 3 — Constitutional / Locked

Parameters that define the system's identity. These may only change through an explicit constitutional amendment (Kyle directive + full governance review).

| Parameter Category | Source | Rationale for Lock |
|---|---|---|
| 5-regime model definition | `market-regime.ts` | Regime detection logic is foundational |
| Canonical regime-strategy map structure | `canonical-regime-strategy-map.ts` | Which strategies map to which regimes defines the system's trading personality |
| rankingScore formula architecture | `ranking-weights.ts` | Formula shape controls cross-family capital allocation |
| FinalScore formula architecture and role | `score-weights.config.ts` | Quality gate, not ranking lever. The formula shape (4 components: Hybrid, Confidence, Regime, Decay) is Tier 3 locked. The specific coefficients (currently 0.4/0.3/0.2/0.1) are Tier 2 supervised — they may be recalibrated with evidence and consensus, but the formula shape may not change without a constitutional amendment. |
| DB-as-authority principle | Governance axiom | No hardcoded threshold fallbacks, ever |
| Net Expectancy Kernel formula | `net-expectancy-kernel.ts` | EV calculation is mathematical, not tunable |
| EXECUTION_CONFIG (frozen) | `execution-config.ts` | Object.freeze'd — adaptive sizing, trailing stops, position risk caps |
| Asset-class profile architecture | Framework design | Extensibility layer for future XStocks/Futures |

**EXECUTION_CONFIG Frozen Values (Tier 3):**

| Parameter | Value |
|-----------|-------|
| ADAPTIVE_EXPAND_FACTOR | 1.10 |
| ADAPTIVE_CONTRACT_FACTOR | 0.90 |
| TRAILING_STOP_BASE | 0.015 (1.5%) |
| TRAILING_STOP_ACCELERATION | 0.002 |
| MAX_POSITION_RISK | 0.02 (2%) |
| TRAILING_STOP_ACTIVATION_PCT | 1.0 |
| TRAILING_STOP_DISTANCE_PCT | 0.5 |
| MAX_HOLDING_PERIOD_MS | 86,400,000 (24h) |
| VERSION | v1.0.0 |

---

## 3. Parameter Hierarchy

```
Global Constitutional Guardrails (Tier 3)
  |
  --> Asset-Class Profile (crypto = first instance; extensible for XStocks, Futures)
        |
        --> Path-Level Thresholds (quant path / pattern path)
              |
              --> Family-Level Thresholds (trend / reversal / breakout / oscillation)
                    |
                    --> Strategy-Specific Overrides (per-strategy parameters)
```

**Inheritance rule:** Each level may only operate **within the envelope delegated by its parent authority**. This avoids making crypto's current numerical assumptions the default ceiling for future asset classes — a new asset-class profile receives its own delegated envelope from the global constitutional level.

### 3.1 Asset-Class Profile (Extensibility Layer)

An asset-class profile defines the operating context for a class of tradeable assets. Each profile contains:

- Path definitions (which filter paths exist)
- Family definitions (which families exist within each path)
- Threshold ranges (delegated envelopes for all adjustable parameters)
- Volume semantics (what "volume confirmation" means for this asset class)
- Correlation norms (expected correlation behavior)
- Directional-bias semantics (how directional bias applies)
- Volatility expectations (baseline volatility characteristics)

**Current profiles:** Crypto (active). All current parameters are within the crypto profile.
**Future profiles:** XStocks (tokenized equities), Perpetual Futures (Phase 21.5, post-live).

### 3.2 Path and Family Differentiation

Parameters are NOT global. Each path and family may have different:
- Threshold values (already differentiated in `screener_filters`)
- Adjustment bounds (different families have different valid ranges)
- Evidence requirements (pattern path may need different evidence than quant)

**Current differentiation (from screener_filters):**

Only 4 columns actually vary between filter paths:
- `vn_max` — 0.85 (active quant families) / 0.95 (VTS quant) / 0.98 (pattern)
- `di_min` — 0 (oscillator/reversal) to 25 (active_quant)
- `di_max` — 30-40 (oscillator/reversal upper bound) to 100 (all others)
- `min_volume` — 150,000 (VTS pattern) to 500,000 (active quant/trend)

All other screener_filters columns are uniform across paths within an asset class (corr_max=0.92, final_score_min=0.35, etc.). lq_min is per-ASSET-CLASS since B.2-apply 2026-06-10: crypto_spot 43; xstock_spot 38 main paths with strong_trend lanes bound by the relational contract below (§5.2 lq_min spec).

---

## 4. Evidence-Gating Framework

### 4.1 Three Evidence Modes

The framework is **evidence-source agnostic**. Evidence quality depends on the operating mode, not the source name.

| Mode | Trust Level | Valid For | Adjustment Aggressiveness |
|------|------------|-----------|--------------------------|
| **VTS / Passive Learning** | Lowest | Diagnostics, simulation tuning, filter-behavior analysis, provisional recommendations | Broadest exploratory adjustment within bounded rails |
| **Active Paper Trading** | Medium | End-to-end behavior validation, supervised operational tuning | Moderate — supervised, evidence-gated |
| **Live Trading** | Highest | Execution-facing parameter decisions, profitability validation | Strictest — narrowest bounds, staged rollout, review required |

**Evidence precedence: Live > Paper > VTS**

The currently dominant operating mode determines which evidence source satisfies requirements. Today that is VTS. When active paper trading goes live, paper evidence takes precedence for execution-facing decisions. VTS remains valid for diagnostic and calibration purposes in all modes.

### 4.2 Evidence Thresholds

For any Tier 1 adjustment, **ALL THREE** must be satisfied:

1. **Minimum time window** — rolling window of sufficient duration from the currently authoritative mode
2. **Minimum evaluation volume** — enough evaluations per family/path to avoid small-sample tuning
3. **Minimum realized-outcome evidence** — for execution-facing parameters, enough closed-trade evidence demonstrating quality impact

**Critical distinction:**
- **Diagnostic/filter parameters** (e.g., IMF thresholds, volume gate weights) can move on evaluation evidence alone
- **Execution-facing parameters** (e.g., MIN_FINAL_SCORE, strategy entry thresholds) require stronger realized-outcome evidence from the highest-trust available mode

### 4.3 Evidence Thresholds by Parameter Class

| Parameter Class | Time Window | Evaluation Volume | Realized Outcome | Mode Requirement |
|---|---|---|---|---|
| **Filter thresholds (Tier 1)** | 7-day rolling minimum | 1,000+ evaluations per family/path | Not required for filter-only changes | VTS sufficient |
| **Strategy parameters (Tier 1)** | 7-day rolling minimum | 500+ strategy evaluations | 50+ closed trades showing quality impact | Paper minimum; VTS for provisional |
| **Volume gate weights (Tier 1)** | 7-day rolling minimum | 1,000+ evaluations | 20+ trades with/without volume factor | VTS sufficient for soft factors |
| **MIN_FINAL_SCORE (Tier 1)** | 14-day rolling minimum | 5,000+ evaluations | 100+ closed trades | Paper minimum |
| **VTS_NET_EV_FLOOR (Tier 1)** | 7-day rolling minimum | 2,000+ VTS evaluations | Not required (VTS-only parameter) | VTS sufficient |
| **rankingScore weights (Tier 2)** | 30-day rolling minimum | 10,000+ evaluations | 200+ closed trades across families | Paper minimum + Langston consensus |
| **Regime-strategy map (Tier 2)** | 30-day rolling minimum | Full regime cycle observed | Strategy performance data per regime | Paper minimum + Langston consensus |

### 4.4 Directional Bias as Bounded Context

Directional bias (pair-level + global) is recognized as a context dimension that informs filter/strategy evaluation. It is classified as a **Tier 2 supervised adjustment input** with:

- Narrow bounds on weighting influence
- Evidence-gating before weight changes
- No autonomous feedback loops (system cannot over-trust its own market stance)
- Changes require Langston consensus

---

## 5. Per-Parameter Specification

For every Tier 1 and Tier 2 parameter, the framework defines 7 fields:

### 5.1 Specification Template

| Field | Description |
|-------|-------------|
| **Current value** | From DB or config (captured in authority-baseline-v1.json) |
| **Adjustment bounds** | Min/max range the parameter may move within |
| **Step size** | Maximum single-change magnitude |
| **Cadence limit** | Minimum time between adjustments (shorter for diagnostic params, longer for execution-facing) |
| **Evidence requirements** | What data must exist before adjustment is permitted (per Section 4.3) |
| **Reversion trigger** | Conditions under which adjustment auto-reverts to baseline |
| **Audit trail** | How the change is logged (timestamp, old value, new value, evidence reference, mode) |

### 5.2 Filter Threshold Specifications (screener_filters — Tier 1)

#### vn_max (Volume Noise Maximum)

| Field | Active Quant | VTS Quant | Pattern |
|-------|-------------|-----------|---------|
| Current | 0.85 | 0.95 | 0.98 |
| Bounds | [0.70, 0.95] | [0.80, 0.98] | [0.90, 0.99] |
| Step size | 0.02 max per adjustment | 0.02 | 0.01 |
| Cadence | 7 days minimum | 7 days | 7 days |
| Evidence | 1,000+ evals, 7-day window | 1,000+ evals | 1,000+ evals |
| Reversion | If null rate increases >20% relative to baseline period | Same | Same |
| Audit | DB change log with evidence reference | Same | Same |

#### di_min (Directional Integrity Minimum)

| Field | Active Quant | Active Trend | Active Breakout | Oscillator | Reversal | Pattern |
|-------|-------------|-------------|----------------|-----------|----------|---------|
| Current | 25 | 10 | 10 | 0 | 0 | 5 (active) / 3 (VTS) |
| Bounds | [5, 40] | [5, 25] | [5, 20] | [0, 10] | [0, 15] | [0, 10] |
| Step size | 3 max per adjustment | 3 | 3 | 2 | 3 | 2 |
| Cadence | 7 days minimum | 7 days | 7 days | 7 days | 7 days | 7 days |
| Evidence | 1,000+ evals per family | Same | Same | Same | Same | Same |
| Reversion | If signal quality degrades >15% | Same | Same | Same | Same | Same |
| Audit | DB change log | Same | Same | Same | Same | Same |

#### lq_min (Log-Liquidity Minimum) — Per-Asset-Class (B.2-apply 2026-06-10)

| Field | crypto_spot (all paths) | xstock_spot main (22 paths) | xstock_spot strong_trend (2 lanes) |
|-------|------------------------|-----------------------------|-------------------------------------|
| Current | 43 | 38 (B.2 apply, 2026-06-10) | 33 = relational contract (below) |
| Bounds | [30, 55] | [38, 55] until Phase-25 position-size anchor (Langston guardrail) | follows main |
| Step size | 3 max per adjustment (autonomous rail) | calibration-batch changes are supervised (Kyle GO), not step-bounded | n/a — derived |
| Cadence | 14 days minimum | per calibration batch | moves WITH main |
| Evidence | 2,000+ evals, 14-day window | ≥5 true-RTH sessions of depth replay (B.2 recheck standard) | inherits main's evidence |
| Reversion | If pair pool drops below sustainable scanning volume | same | same |
| Audit | DB change log | calibration_ledger + migration | calibration_ledger + migration |

**★ STRONG_TREND RELATIONAL CONTRACT (B.2-apply, Langston Step-4 governance ask, 2026-06-10):** the two xstock_spot strong_trend lanes (`vts_strong_trend`, `active_strong_trend`) carry `lq_min = max(30, main − 5)` — deliberately LOOSER than the main floor (strong_trend's tighter DI/regime gating earns a thinner-book allowance), floor 30, ordering strong_trend < main always preserved. **Any future move of the xstock main lq_min MUST re-derive the strong_trend lanes from this formula in the same migration** — they are no longer independently tunable values (the pre-B.2 30/35 were crypto-clone artifacts that drifted). Evidence basis for 38: five-true-RTH-session depth replay 2026-06-03→10 (485 names; 38 admits 433/485 majority-of-buckets vs 43's 128/485; implied $6,309 floor = RTH p10 = the thin-book lens boundary, ADJUSTMENT_FRAMEWORK §1.1 axiom 6 — reject rate is an output, not a target).

#### min_volume — Differentiating

| Field | Active Quant/Trend | Active Breakout | Active Pattern/Osc/Rev | VTS Quant/Trend | VTS Breakout | VTS Pattern/Osc/Rev |
|-------|-------------------|----------------|----------------------|----------------|-------------|-------------------|
| Current | 500,000 | 400,000 | 250,000 | 250,000 | 200,000 | 150,000 |
| Bounds | [200K, 1M] | [150K, 800K] | [100K, 500K] | [100K, 500K] | [80K, 400K] | [50K, 300K] |
| Step size | 50,000 max | 50,000 | 25,000 | 25,000 | 25,000 | 25,000 |
| Cadence | 7 days | 7 days | 7 days | 7 days | 7 days | 7 days |

#### Remaining Uniform DB Columns — Classification

These screener_filters columns are currently uniform across all paths. They are classified as follows:

| Column | Current | Classification | Rationale |
|--------|---------|---------------|-----------|
| corr_max | 0.92 | Tier 1 — deferred specs | Adjustable but low-priority; uniform value works well |
| min_price | 0.01 | Tier 3 — locked | Safety floor; sub-penny tokens correctly excluded |
| min_liquidity | 500,000 | Tier 1 — deferred specs | Adjustable; correlated with min_volume |
| min_market_cap | 100,000,000 | Tier 1 — deferred specs | Adjustable; may need per-asset-class profile |
| rsi_min / rsi_max | 30 / 70 | Tier 3 — locked | Standard RSI bounds; no reason to change |
| volatility_min / max | 0.50 / 5.00 | Tier 1 — deferred specs | Adjustable for crypto vol characteristics |
| max_bid_ask_spread | 1.00 | Tier 1 — deferred specs | Adjustable; may need asset-class awareness |
| regime_weight_min | 0.30 | Tier 2 — supervised | Affects signal quality gating (SQE) |
| min_history_days | 30 | Tier 3 — locked | Data quality requirement |

"Deferred specs" means the parameter is adjustable in principle but per-parameter specification (bounds, step, cadence) is deferred until evidence suggests the current value needs changing. The framework permits future specification without a constitutional amendment.

#### EV Gate Parameters — Tier Classification

| Parameter | Current | Tier | Rationale |
|-----------|---------|------|-----------|
| MIN_PWIN | 0.40 | Tier 3 | Mathematical — defines minimum win probability for trade admission |
| MAX_PWIN | 0.60 | Tier 3 | Mathematical — caps win probability estimate |
| DI_PWIN_FACTOR | 200 | Tier 3 | Mathematical — DI to probability conversion |
| BASE_FEE_SLIPPAGE | 0.006 | Tier 2 | May need adjustment for different exchanges/asset classes |

#### Scanner Parameters — Tier Classification

| Parameter | Current | Tier | Rationale |
|-----------|---------|------|-----------|
| BATCH_SIZE | 300 | Tier 2 | Affects API budget and scanning coverage |
| IDEAL_RATIO | 0.6 | Tier 2 | Telemetry-driven pool composition |
| ROTATIONAL_RATIO | 0.4 | Tier 2 | Complementary to IDEAL_RATIO |

#### HYBRID_PARAMS — Tier Classification

| Parameter | Current | Tier | Rationale |
|-----------|---------|------|-----------|
| WEIGHTS.QUANT | 0.4 | Tier 2 | Affects hybrid signal composition |
| WEIGHTS.PATTERN | 0.4 | Tier 2 | Affects hybrid signal composition |
| WEIGHTS.PREDICTIVE | 0.2 | Tier 2 | Affects hybrid signal composition |
| DECAY.LAMBDA | 0.15 | Tier 2 | Pattern decay rate |
| DECAY.FLOOR | 0.3 | Tier 2 | Minimum retained influence |
| MIN_SCORE | 0.65 | Tier 2 | Hybrid execution threshold |
| MAX_CONFLUENCE_WINDOW | 5 | Tier 2 | Candle gap tolerance |

### 5.3 Scoring Parameter Specifications

#### MIN_FINAL_SCORE (Tier 1)

| Field | Value |
|-------|-------|
| Current | 0.35 (quant), 0.45 (pattern — via SQE elevated floor) |
| Bounds | [0.25, 0.55] (quant), [0.35, 0.60] (pattern) |
| Step size | 0.03 max per adjustment |
| Cadence | 14 days minimum |
| Evidence | 5,000+ evaluations, 100+ closed trades |
| Reversion | If win rate drops >10% relative to baseline |
| Audit | DB change log + evidence reference |

#### VTS_NET_EV_FLOOR (Tier 1)

| Field | Value |
|-------|-------|
| Current | -0.01 (-1%) |
| Bounds | [-0.03, 0.00] |
| Step size | 0.005 max per adjustment |
| Cadence | 7 days minimum |
| Evidence | 2,000+ VTS evaluations |
| Reversion | If VTS trade quality degrades |
| Audit | Code change with commit message referencing evidence |

### 5.4 Strategy Parameter Specifications (Representative Examples)

Strategy constants are hardcoded. Full catalog is in `authority-baseline-v1.json`. Bounds below are examples — each strategy's constants have their own valid ranges documented in the baseline.

#### Volume Gate Multipliers (Tier 1 — Soft Gate Strategies)

| Strategy | Parameter | Current | Bounds | Step | Cadence |
|----------|-----------|---------|--------|------|---------|
| support_bounce | SB_VOL_MULT | 1.2x | [0.8, 1.8] | 0.1 | 7 days |
| reverse_impulse | RI_VOL_MULT | 1.2x | [0.8, 1.8] | 0.1 | 7 days |
| morning_star | MS_VOL_MULT | 1.2x | [0.8, 1.8] | 0.1 | 7 days |
| volatility_edge (A-point) | VE_A_VOL_MULT | 1.3x | [0.8, 1.8] | 0.1 | 7 days |

#### ATR Target Multipliers (Tier 1)

| Strategy | Parameter | Current | Bounds | Step | Cadence |
|----------|-----------|---------|--------|------|---------|
| morning_star | MS_TARGET_ATR_MULT | 2.5x | [1.5, 4.0] | 0.25 | 7 days |
| support_bounce | SB_TARGET_ATR_MULT | 2.0x | [1.5, 3.5] | 0.25 | 7 days |
| reverse_impulse | RI_TARGET_ATR_MULT | 2.0x | [1.5, 3.5] | 0.25 | 7 days |
| adaptive_flow | AF_TARGET_ATR_MULT | 3.0x | [2.0, 5.0] | 0.25 | 7 days |

### 5.5 Tier 2 Parameter Specifications

#### rankingScore Weights (Tier 2 — Supervised)

| Field | Value |
|-------|-------|
| Current profiles | QUANT (quality-heavy), PATTERN (context-heavy, friction penalty), HYBRID (balanced) |
| Bounds | Weight components must sum to 1.0 within each profile |
| Step size | 0.05 max per weight component per adjustment |
| Cadence | 30 days minimum |
| Evidence | 10,000+ evaluations, 200+ closed trades across families |
| Approval | Kyle or Claude Code + Langston consensus required |
| Reversion | If cross-family capital allocation shifts >15% from baseline |
| Audit | Code change with full consensus documentation |

#### FinalScore Gap Safety Rule (Tier 2)

| Field | Value |
|-------|-------|
| Current | FinalScore gap > 0.10 => FinalScore wins over rankingScore |
| Bounds | Gap threshold: [0.05, 0.20] |
| Step size | 0.02 max |
| Cadence | 30 days minimum |
| Approval | Langston consensus required |

---

## 6. Safety Guarantees

### 6.1 Reversion Protocol

If any adjustment degrades system performance:

1. Compare current parameter state against Authority Baseline (V1.0)
2. Identify divergent parameters
3. Revert to baseline values
4. Log the reversion with: timestamp, parameters reverted, evidence of degradation, mode
5. Notify Kyle via Telegram

### 6.2 Maximum Adjustment Magnitude

No single adjustment session may change more than:
- **3 filter threshold parameters** simultaneously
- **2 strategy parameters** for the same strategy
- **1 scoring parameter** (MIN_FINAL_SCORE, VTS_NET_EV_FLOOR)

This prevents compound effects from masking individual parameter impacts.

### 6.3 Mandatory Reversion Triggers

An adjustment **must** be reverted if ANY of the following occur within the cadence window:

- Signal rate drops >30% relative to pre-adjustment baseline
- Win rate drops >15% relative to pre-adjustment baseline
- Net EV turns negative for the affected family/path
- Null rate for the adjusted parameter's domain increases >25%

### 6.4 Audit Trail Requirements

Every adjustment must produce an audit record containing:
- Timestamp (UTC)
- Parameter name and path/family scope
- Old value and new value
- Evidence reference (time window, evaluation count, trade count)
- Operating mode (VTS / Paper / Live)
- Approver (autonomous / Langston / Kyle)
- Baseline version compared against

---

## 7. Retroactive Baseline Acknowledgment

Batches 55-57 made threshold and architectural changes using an informal but sound process: investigate diagnostics, Langston consensus, implement, monitor. These changes include:

- Volume soft gates (support_bounce, reverse_impulse, morning_star, volatility_edge A-point)
- Support_bounce cluster tolerance 0.5% to 0.7%
- Pattern-strategy canonical routing (STRATEGY_PATTERN_MAP)
- Adaptive-flow THREE_SOLDIERS/MORNING_STAR canonicalization

All B55-B57 changes become part of the **V1.0 Authority Baseline** as-is. The framework retroactively validates the approach used (evidence-driven, consensus-gated, monitored) and formalizes it going forward.

---

## 8. Phase 11 Status

This document, together with AUTHORITY_BASELINE.md and authority-baseline-v1.json, completes the **governance portion** of:
- **Directive 11.8B-E** — Adjustment Framework (this document)
- **Directive 11.8C** — Authority Baseline (companion documents)

**Phase 11 closes only after Batch 58b** — the code implementation sub-batch that creates the parameter registry, authority baseline loader, audit logging, and `/api/filters-v2` validation integration. Phase 11 closure requires all items on the Phase 11 Closure Checklist in BATCH_58_SCOPE.md to be verified with evidence.

Once Phase 11 is closed, it unlocks **Phase 15: Rules-Based Predictive Execution** — the "Smart Thermostat" where the system can make bounded, deterministic filter adjustments within this framework, without ML.

---

## Appendix A — B-NEW-42b price-discontinuity detector knobs (2026-05-17)

Per Langston pre-audit rev1 #4: cataloguing the new per-asset-class behavioral knobs landed by B-NEW-42b. These knobs control the `server/services/price-discontinuity-detector.ts` sentinel — the module TEC consults to short-circuit stop-check + target-lock during halt-resume gaps, corp-action discontinuities, and known ex-dividend windows.

**Module name:** `price_discontinuity_detector`
**DB rows seeded by:** `drizzle/migrations/2026-05-17-b-new-42b-price-discontinuity-detector-constants.sql` (idempotent via `ON CONFLICT DO NOTHING`)
**Code reference:** detector currently uses hardcoded defaults matching the seeded values; DB-resolution is deferred to a future Phase E calibration batch using the standard `getModuleConstants` API with B79.0a-style wildcard-default sentinel fallback.

| Constant | Wildcard default | xstock_spot value | crypto_spot value | Purpose | Tunability tier |
|---|---|---|---|---|---|
| `halt_gap_seconds_threshold` | 300 | 300 | 300 | Minimum tick-stream gap (seconds) that triggers halt_resume_gap kind. <300s = normal market drift. | Tier 1 (Phase E calibration) |
| `halt_pct_threshold` | 0.5 | 0.5 | 0.5 | Minimum \|Δ%\| at resume tick to confirm a real price-discovery discontinuity. | Tier 1 (Phase E calibration) |
| `halt_clearing_window_seconds` | 30 | 30 | 30 | Preferred confirming-tick window. Tick within this window AND \|Δ%\| < halt_pct_threshold from resume price → transition to CLEARING. | Tier 2 (operator polish) |
| `halt_hard_ceiling_seconds` | 300 | 300 | 300 | Hard auto-clear ceiling. If active state persists past this with no confirming tick (WS drop scenario), force-transition to IDLE. | Tier 2 (operator polish) |
| `corp_action_pct_threshold` | 40 | 40 | 40 | \|Δ%\| ≥ this in a single bar = corp_action kind (split / reverse split / large special dividend). | Tier 1 (Phase E calibration) |
| `corp_action_ttl_seconds` | 86400 | 86400 | 86400 | Persistence duration for active corp_action state. 24h aligns with typical overnight-effective corp actions. | Tier 2 (operator polish) |
| `ex_div_pre_open_window_hours` | 2 | 2 | 0 | Hours before US market open during which a known ex-dividend date triggers ex_dividend kind. crypto_spot=0 (no equity ex-div). | Tier 1 (per-class) |
| `symbol_cache_stale_seconds` | 86400 | 86400 | 86400 | Lazy-eviction threshold. Detector cache entry idle for longer than this (and in IDLE state) is dropped → next call is cold-start. | Tier 3 (memory hygiene) |

**Tier 1** knobs are calibrated empirically against archived discontinuity events in Phase E. Until then, the hardcoded values are Layer-1 starters derived from B-NEW-42 audit empirics (462 candidate halt-resume-gap events in 7-day archive, max 4.6% magnitude on EDU/USD).

**Tier 2** knobs are operator-tunable polish — adjust if production behavior shows pathological patterns (e.g. WS drops more frequent than 5min causing too many hard-ceiling auto-clears).

**Tier 3** memory-hygiene knob; should not need adjustment short of an unusual xStock universe expansion.

**Adjustment audit trail:** any future tune must go through the standard `module_constants` UPDATE pattern with `updated_by` set to a recognizable batch ID; the audit trail is the row-version history in module_constants.

— Added 2026-05-17 with B-NEW-42b close.

---

## CALIBRATION EPOCHS — per-source learning-lineage governance (ITEM-4 Phase B step 2, 2026-06-10; Langston-amended v0)

Every learning SOURCE (`vts` / `paper_sim` / `live`) carries an integer **calibration epoch** (`module_constants`, module `calibration_epoch`, one constant per source; seeded at 1 by `2026-06-10-item4-step2-calibration-epoch.sql`). Learning aggregates stamp the writer's current epoch; on mismatch the Welford stream RESETS so pre- and post-calibration outcomes never silently blend (the trap that data-blocked the W2.x studies).

**RULES (mandatory):**
1. **BUMP-SCOPE:** a calibration-affecting change scoped to ONE source bumps THAT source's epoch only. A SHARED-substrate change (MCE indicator math, SQE thresholds, regime-map edits, strategy detect/scoring constants used by all producers) bumps ALL sources.
2. **ENFORCEMENT:** every calibration-batch completion report MUST contain either the epoch bump (old → new, which sources, why) or an explicit **"no calibration impact"** line. Checked at Step 4 + Step 8 — omission is a review failure, not an oversight.
3. **MECHANICS:** bumps go through the canonical module_constants write path (the B72 family) — never a direct DB poke. Boot asserts all 3 rows exist (b72-warmup hard-fail).
4. **KNOWN LIMITATION (accepted, documented):** on a bump, the Welford stream resets honestly but the legacy EMA continues carrying cross-epoch signal until a future estimator swap (Gate-2 B.7 #2 deliberately retained the EMA as the live factor input — do NOT "fix" this as a bug; it is a recorded design trade).
5. Auto-bump detection = future enhancement; v0 is manual-but-mandatory.
6. ⭐ **CLASS-SCOPED ROWS SUPERSEDE THE WILDCARD, AND A BUMP MAY HAVE TO *CREATE* ONE (precedent: `B-XSTOCK-FEE-CONTRACT`, `#1010`, 2026-09-11).** The epoch key carries `asset_class`, so a per-class change must move the CLASS's rows — not the wildcard, which would also move every other class.
   - **The case that forced the ruling:** `fee_model` is shared substrate for `vts`, `paper_sim` and `live` (rule 1), but the change was xStock-only. Live rows measured `xstock_spot/vts = 6` and `xstock_spot/paper_sim = 3` — **and NO `xstock_spot/live` row at all**; `live` was resolving the wildcard `*/live = 2`.
   - ⇒ **The bump moved `vts 6→7` and `paper_sim 3→4`, and CREATED `xstock_spot/live` at `3` — the wildcard's value PLUS ONE**, so the new class row starts at a boundary rather than silently re-using the wildcard's lineage. **Bumping the wildcard instead would have moved crypto, which this change did not touch.**
   - ⛔ **The bump must be CONDITIONAL ON THE UNDERLYING VALUE ACTUALLY CHANGING.** This migration gated its epoch update on a pre-image comparison of the fee pair: a run that changes no fee moves no epoch. **A reset with nothing behind it throws samples away**, and a re-run that bumps again over-splits the history.
   - ⚠️ **State the consequence in the completion report, not only the numbers (rule 2):** every learning aggregate for that class is now two populations, and **anything that pools across the boundary is mixing pre- and post-change outcomes.**
   - ➕ **Second precedent, `B-PRICE-SIDE-BY-JOB` `8a-P3` (2026-09-15):** a crypto-only change CREATED `crypto_spot/paper_sim` at the wildcard `*/paper_sim` 2 + 1 = **3**, exactly as above, and moved `crypto_spot/vts` 5 → 6. `8a-P4b` then moved `xstock_spot/paper_sim` 4 → 5 and `vts` 7 → 8; its C1 moved `paper_sim` 5 → 6.
7. ⛔ **A BUMP SETS `updated_at = now()` AS WELL AS `updated_by` — THE ROW'S STAMP IS HOW A READER DATES THE BOUNDARY.** **MEASURED 2026-09-22:** the `8a-P3` and `8a-P4b` epoch migrations' UPDATEs set `updated_by` and left `updated_at` untouched (the `crypto_spot/paper_sim` row `8a-P3` INSERTED got a fresh default stamp), so `crypto_spot/vts` still reads **2026-06-11** (a bump made 2026-09-15) and `xstock_spot/vts` reads **2026-09-11** (a bump made 2026-09-19). A reader splitting a window at the row's stamp would pool across the very boundary the bump exists to create. The C1 migration set it and reads correctly. **Until corrected, date those two boundaries by their deploys** (`SYSTEM_MANUAL` §18.0.1). **HOME for the correction: the `8a-P4c` epoch migration, which writes each row's REAL boundary instant — `crypto_spot/vts` the `8a-P3` epoch migration's own time (2026-09-15T11:59:22Z; restart 11:59:22.448Z), `xstock_spot/vts` the `8a-P4b` one (2026-09-19T00:02:32.734Z; restart 00:02:33.231Z) — **never `now()`, which would only swap one wrong stamp for another** (Langston, 2026-09-22). ⚠️ **A row carries its LATEST boundary only:** `8a-P4c` bumps `xstock_spot/vts` again, so its 09-19 boundary becomes undatable from the row and lives here, not in the column** (§9.4 disposition 2, owner CC-C, plan row `3n.q2`).
8. ⛔ **ROWS BOOKED WRONG BY A NAMED MECHANISM ARE EXCLUDED BY ID — AND THIS IS THE REGISTER FOR THE VTS LANE (Langston, 2026-09-22, `B-PRICE-SIDE-BY-JOB` plan row `3n.q3`).** An epoch splits a corpus at a boundary; some rows INSIDE an epoch are wrong for a code-cited reason. They are never edited or deleted (`#596`). **Every outcome-sourced read — a ranking, a calibration, a study — excludes them by id AND publishes the excluded n and its direction beside the filtered number**; a reader shown only the filtered number must be told which way the exclusion leans.
   - **CLASS A — a crypto VTS max-hold timeout while the exit is refused.** The 7-day valve (`tec-evaluator.ts`, step 2) returns BEFORE the no-transactable-side refusal (step 2b), with `exitPrice` = the mark; the VTS booking resolver (`vts-exit-booking.ts:46`) then has no bid and books the clamp, which on a timeout IS that mark (arm `clamp_no_bid`). Pinned: `b65-tec-parity.test.ts` D7 (the valve ordering and the resolver arm) **plus the seam D7 hardcodes: the refusal and the no-bid arm are the SAME `null` by construction** — `vts-runner.ts:3346-3347` sets the bid once and uses it as the trigger, and `:3533` hands that same value to the resolver (Langston, re-derived 2026-09-22). **Direction: OVERSTATED, never understated** — the mark sits at or above the bid a seller would get, so the filtered corpus is one-signed.
   - **MEMBERS: none booked yet.** Predicted: `vts_EGLD_USD_strong_bull_trend_1789808590766` at 2026-09-26T09:03:10Z (venue spread 14.3%, mark above its target, bid below its entry — alert `70511ef0`); instant capture on staging (unit `cc-c-cap-egld`, file `/root/cc-c-capture/egld-2026-09-26.log`), reminder alert `3a4c3235`. **A candidate becomes a member only on evidence that its close was a timeout at the mark while refused.**
   - ⭐ **CANDIDATE WITH A KNOWN DATE — FET/EUR (alert `cd768cb9`, 2026-09-22T21:30Z, refused `no_transactable_side`; venue spread 4.19% against the 2% exit ceiling, bid 0.1871 / ask 0.1951).** Trade `vts_FET_EUR_strong_bull_trend_1789989155073`, opened 2026-09-21T11:12:35Z ⇒ **max-hold 2026-09-28T11:12:35Z.** ⛔ **It is EUR-quoted, so the retrospective discriminator can NEVER decide it** — an instant capture is the only evidence that can: staging unit `cc-c-cap-fet` (11:10-11:18Z), reminder alert `67253a95`. ➕ **A new refusal streak re-minted its alert (`10046e47`, 2026-09-23T03:45Z, same trade, the only open FET/EUR VTS trade) — LEFT ACTIVE on purpose until the 2026-09-28 close, then resolved with the capture** (same reasoning as FOLD below). ⚠️ **Population of that blind spot, measured 2026-09-22: 77 open EUR-quoted VTS trades** — captures scale to named candidates, not to all of them; the general fix is the booking arm on the row (`3n.q3`).
   - ⭐ **CANDIDATE WITH A KNOWN DATE — FOLD/USD (alert `208c257b`, 2026-09-23T02:15Z, refused `no_transactable_side`; venue spread 4.02%, bid 0.06045 / ask 0.06293).** Trade `vts_FOLD_USD_strong_bull_trend_1789598409624` (entry 0.0545, stop 0.04441, target 0.07468), opened 2026-09-16T22:40:09Z ⇒ **max-hold 2026-09-23T22:40:09Z.** At those sides a mark booking overstates the bid by ~2.3 points of return. USD-quoted, so the frame table can reach it — **but at ~one frame per 7.5 min (192 in 24 h) it may not bracket the instant**, so it is captured too: staging unit `cc-c-cap-fold` (22:38-22:46Z), reminder alert `4bb5f0fc`. ⚠️ **Its bid flickers across the ceiling, so each new refusal streak re-mints the alert (escalations 02:02, 02:32, 02:44Z).** The second, `721a416c`, is **deliberately LEFT ACTIVE until the 22:40Z close** — an unresolved row blocks re-mints on that key, and the instance is already handled by name; it is resolved with the capture as evidence. *(Only one open FOLD/USD VTS trade, so the suppression hides nothing else.)*
   - **Candidates on record:** the refusal alerts (`no-trigger-vts-<symbol>`) name AKE, AVL, EGLD, FET, FOLD, KII, PONKE, SN8. ✅ **KII — NON-MEMBER on evidence (instant capture `cc-c-cap-kii`):** closed as a timeout at 2026-09-22T16:49:53Z at **0.08093 — a BID price, not the mid (≈ 0.08115) or the ask (0.08137); THE PRICE IS THE DISCRIMINATOR**, and the pass line's `bookedNoBidClamp=0` only corroborates it. ⚠️ **UNMEASURED: the one-tick gap.** The venue bid was 0.08093 until 16:49:22Z and 0.08092 from 16:49:32Z; the capture samples every ~10 s, so the bid AT the close instant was not observed — the gap is the size of a re-served stamp (`#951`), and settling it needs the booking-side stamp age, not the venue capture. It was evaluated normally in the hours before (spread 0.63%), so it is NOT a control for this class — it shows the bid arm booking a timeout.
   - ⛔ **THREE BUCKETS, NEVER TWO — MEMBER / NON-MEMBER / UNDETERMINED (Langston, 2026-09-22).** A row the evidence cannot decide is UNDETERMINED, never a non-member: filed as a non-member it would sit inside the filtered corpus overstated and unflagged. **An undetermined row is published with its n and the same one-signed direction as a member.** Silence from the refusal alert is not evidence of non-membership — it fires only after 10 minutes of refusal, the arm is not on the row, and the `out.log` counter reaches ~4.5 h.
   - ⭐ **THE RETROSPECTIVE DISCRIMINATOR, until the arm is on the row:** match the booked exit price against the contemporaneous `crypto_spot_ticker_snap` frame — equal to the BID and to neither other side ⇒ arm `bid`, a NON-MEMBER; equal to the mid or last with the bid refused ⇒ a MEMBER; no frame close enough to decide ⇒ UNDETERMINED.
   - **Epoch 6 so far (from 2026-09-15T11:59:22Z to 2026-09-22 15:20Z): three crypto VTS timeouts (by `trade_id`; 25 `time_stop` rows in all).** **VVV/USD — NON-MEMBER on evidence:** booked 21.3150 at 23:40:07.97Z; the frame at 23:39:43.441Z reads bid 21.3150, ask 21.3320, last 21.3320 (mid 21.3235) — the bid to the digit and neither other side. **VVV/EUR — UNDETERMINED, and not because of VVV/EUR:** `crypto_spot_ticker_snap` holds NO `/EUR` pair at all (0 rows table-wide; the `/USD` control returns rows — Langston, re-derived by CC-C 2026-09-22), so the discriminator cannot decide ANY EUR-quoted timeout. A reach limit of the instrument, not a missing row. **MET/USD (09-19 02:50Z) — UNDETERMINED:** the nearest frames are 26 min before and 28 min after (02:24:13Z bid 0.2680, 03:18:01Z bid 0.2667), both above the booked 0.2642. Their levels read as ordinary timeouts (VVV/EUR exit 18.482 above its 17.274 stop; MET 0.2642 inside 0.1828 / 0.3564), which is why neither is called a member. **Tally: members 0 · non-members 1 · undetermined 2 (direction, if members: overstated).** ➕ **KII (above) closed later the same day ⇒ running tally 0 · 2 · 2.** ⚠️ **These counts are an ACCOUNTING, never a trend** — two per cell is below any n-floor; do not read direction from them (Langston).
   - **ENUMERATION OBLIGATION — at the `8a-P4c` window close (2026-09-30T00:00Z) and again when `B-VTS-NO-DECISION-VALVE` lands:** list every crypto VTS timeout since the epoch-6 boundary, bucket each by the discriminator above — **EUR-quoted rows stay UNDETERMINED until the arm is on the row**, because the frame table carries no EUR pair — (`exit_decision_archive`, `mode = 'vts'`, `exit_reason = 'time_stop'`, keyed by `trade_id` — ⚠️ NOT by `asset_class`: measured 2026-09-22, 20 xStock VTS closes since 09-01 (ids `vts_xstock_spot_…`) carry `crypto_spot` in that column, all on tickers that are also Kraken crypto pairs), cross it against the refusal alerts and the instant captures, and publish the member n. Owner CC-C.
   - *The xStock paper false stops (MDB `#1065`, ANET `#1066`) are the same shape in another lane; their ids are recorded at those issues.*
