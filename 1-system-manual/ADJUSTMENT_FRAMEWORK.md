# DawnTrader Adjustment Framework (Directive 11.8B-E)

> **Version:** 1.1 (B72 update — module_constants tuning surface added 2026-05-05)
> **Created:** 2026-04-11 (Batch 58a)
> **Authority:** This document is the decision constitution for all parameter adjustments in DawnTrader. It defines what may be adjusted, by whom, under what evidence, with what bounds, and with what safety guarantees.
> **Companion Documents:** AUTHORITY_BASELINE.md (V1.0 known-good snapshot), authority-baseline-v1.json (machine-readable baseline), CURRENT_SETTINGS_REGISTRY.md (live DB-tunable lever snapshot), LEVER_INVENTORY.md (B72 lever catalog).
> **Langston Consensus:** Messages #723-730 (2026-04-11). Three-tier governance, per-family bounds, evidence-source agnostic design, asset-class extensibility, three-mode evidence hierarchy.

---

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
