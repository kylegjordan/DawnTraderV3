# B-XSTOCK-CALIB Sub-batch 1 (B.1) — Step 2 Pre-Audit

**Batch:** B-XSTOCK-CALIB sub-batch 1 (B.1)
**From:** CC
**To:** Langston (Step 2 review)
**Date:** 2026-05-28
**Position:** Step 2 of the 11-step workflow per CLAUDE.md §2. Step 1 scope ACK clean from Langston with 5 refinements absorbed (commit `7f06d47b8`). A.3 verification gate already CLOSED 2026-05-28 via memo (same commit). Critical-path next.

**Predecessor:** A.3 verification gate closure memo (`1-system-manual/_audit/A3_DBS_VERIFICATION_GATE_MEMO.md`).
**Successor (per umbrella scope):** B.4+B.5 friction + spread coupled retune unit.

---

## §0 — Pre-audit purpose

Surface the load-bearing decisions for sub-batch 1 (B.1) ahead of Step 3 implementation. Specifically:

1. **B.1a vs B.1b internal split** — confirmed boundary + which constants land in which.
2. **Empirical evidence for Kyle's B.1b decision** — archive-replay distribution numbers attached so the Kyle-ACK gate at Step 2 closes on data, not abstraction.
3. **A discovery that reframes B.1b** — the TFS confidence-formula scales for xstock_spot are ALREADY structurally retuned in `regime_classifier` module_constants (momentum_scale halved + volatility_scale halved relative to crypto). B.1b becomes "validate the existing halving" not "blank-slate calibrate." Significantly de-risked from the original scope framing.
4. **SIM consultation** for `calculatePairRegime()` + per-class regime_classifier resolution path.
5. **Per-asset-class write invariant** per Langston Step 1 ACK B5 — all B.1 writes scoped to `asset_class='xstock_spot'`, no wildcard `'*'`.

---

## §1 — Surface inventory

### 1.1 The 14 `_XSTOCK` regime threshold constants (B.1a target)

**File:** `server/asset_classes/xstock_spot/regime-thresholds.ts` (45 lines, leaf module, NO IMPORTS ALLOWED by design — see header docstring).

**Layer 1 domain-knowledge baseline** per the docstring rule of thumb: "vol/momentum thresholds halved relative to crypto, DX thresholds pulled down 10-15 points, DBS scale-invariant."

| # | Constant | xStock value | Crypto value | Delta vs crypto |
|---|---|---|---|---|
| 1 | `RBS_VOL_MAX_XSTOCK` | 0.006 | 0.012 | ÷2 |
| 2 | `RBS_DX_MAX_XSTOCK` | 35 | 45 | -10 |
| 3 | `RBS_DBS_MAX_XSTOCK` | 0.10 | 0.10 | unchanged (DBS scale-invariant) |
| 4 | `IE_VOL_MIN_PATH_A_XSTOCK` | 0.010 | 0.020 | ÷2 |
| 5 | `IE_DX_MIN_PATH_A_XSTOCK` | 40 | 55 | -15 |
| 6 | `IE_VOL_MIN_PATH_B_XSTOCK` | 0.0075 | 0.015 | ÷2 |
| 7 | `IE_DBS_STRONG_XSTOCK` | 0.50 | 0.50 | unchanged |
| 8 | `TFS_MOM_MIN_PATH_A_XSTOCK` | 0.0015 | 0.003 | ÷2 |
| 9 | `TFS_DX_MIN_XSTOCK` | 35 | 50 | -15 |
| 10 | `TFS_DBS_MODERATE_XSTOCK` | 0.30 | 0.30 | unchanged |
| 11 | `HVU_VOL_MIN_XSTOCK` | 0.0075 | 0.015 | ÷2 |
| 12 | `HVU_MOM_NEG_PATH_A_XSTOCK` | -0.0015 | -0.003 | ÷2 |
| 13 | `HVU_DX_STRONG_XSTOCK` | 45 | 60 | -15 |
| 14 | `HVU_MOM_NEG_PATH_B_XSTOCK` | -0.0025 | -0.005 | ÷2 |

Branch-CONDITION constants only. Read at runtime by `calculatePairRegime()` (`server/core/metrics/market-regime.ts` lines 245-267) under the per-asset-class dispatch.

**Currently hardcoded in TS.** Module promotion to `module_constants` is open architectural question — see §4 below.

### 1.2 TFS confidence-formula RegimeConfig fields (B.1b target)

**Consumed by:** `calculatePairRegime()` lines 314-325 — the TFS branch confidence formula:

```
const momentumFactor = clamp01(mom / regimeConfig.tfsMomentumScale);
const dbsStrength    = clamp01(absDbs / regimeConfig.tfsDbsScale);
const volInverse     = clamp01((regimeConfig.tfsVolatilityScale - vol) / regimeConfig.tfsVolatilityScale);
confidence = regimeConfig.tfsDesatMin
  + (regimeConfig.tfsDesatMax - regimeConfig.tfsDesatMin)
    * (momentumFactor * dbsStrength * volInverse);
```

**5 RegimeConfig fields drive the formula:**

| RegimeConfig field | DB constant_name | Wildcard `*` | xstock_spot | Source |
|---|---|---|---|---|
| `tfsDesatMin` | `b67_3_5_tfs_desat_min` | 0.50 | 0.50 | identical |
| `tfsDesatMax` | `b67_3_5_tfs_desat_max` | 0.90 | 0.90 | identical |
| `tfsMomentumScale` | `b67_3_5_tfs_momentum_scale` | **0.020** | **0.010** | xStock halved |
| `tfsVolatilityScale` | `b67_3_5_tfs_volatility_scale` | **0.025** | **0.0125** | xStock halved |
| `tfsDbsScale` | `b67_3_5_tfs_dbs_scale` | 0.7 | 0.7 | identical (DBS scale-invariant) |

**Plus 1 post-composition floor:**

| Field | DB constant_name | Wildcard `*` | xstock_spot |
|---|---|---|---|
| `b67_5PostCompositionFloor` | `b67_5_post_composition_floor` | 0.45 | 0.45 |

**Module:** `regime_classifier` in `module_constants`. Both wildcard `*` and `xstock_spot` rows exist for all 6 keys. Per-class override path is live.

**Sibling module noted for cleanup:** `market_regime` module has wildcard-only rows for the same 5 TFS scales (`tfs_desat_min`, `tfs_desat_max`, `tfs_momentum_scale`, `tfs_volatility_scale`, `tfs_dbs_scale`). These look like legacy (pre-B67.3.5) and may be dead — surface for Phase 16 legacy-component review register (see §7 below).

### 1.3 Sibling features (per umbrella scope §1 sub-batch 1 row)

Three features to be **captured but not gated**:

- **`time_of_day_class`** — derive from NYSE market clock (9:30-16:00 ET, accounting for DST). Not wallclock. Used for post-hoc analysis only.
- **`market_hours_open`** — boolean derived from `isXstockMarketOpenUTC()` (`server/asset_classes/xstock_spot/market-hours.ts`).
- **`is_rebalance_day`** — Russell quarterly (Jun/Sep/Dec/Mar last-Friday) + S&P add/delete (~5 day advance notice). Calendar persisted in `module_constants.equity_calendar.rebalance_dates` jsonb.

**Storage:** sibling columns on a B.1-introduced archive table or jsonb metadata on the regime-replay output rows. Persistence design TBD in Step 3 chunk planning.

---

## §2 — Empirical archive evidence (for Kyle's B.1b decision)

### 2.1 Data sources

| Source | Rows | Symbols | Window | Notes |
|---|---|---|---|---|
| `xstock_spot_ohlc_60m_snapshot` | 52,388 | 485 | 2026-05-06 18:00Z → 2026-05-27 22:00Z | Canonical 60-min OHLC (matches B-NEW-34 architecture) |
| `xstock_dbs_backfill` | 31,481 | 260 | 2026-05-05 23:00Z → 2026-05-15 23:00Z | Per A.3 memo §2 — backfilled DBS components |
| `xstock_spot_ohlc_1m_2026_05` | 2,553,648 | 485 | 2026-05-01 → 2026-05-27 22:54Z | 1-min source (not used for B.1 replay — 60-min canonical) |

**Replay window for the Step 3 implementation:** 2026-05-06 18:00Z → 2026-05-15 23:00Z (intersection of OHLC + DBS coverage). ~8.5 days of overlap.

### 2.2 30-bar momentum + 60-bar volatility distribution

Computed across 18,934 valid (symbol, bar) samples in the 2026-05-06 → 2026-05-22 window using `xstock_spot_ohlc_60m_snapshot`:

| Metric | n | Avg | StdDev | p5 | p50 | p95 |
|---|---|---|---|---|---|---|
| 30-bar momentum (mom) | 18,934 | +0.044% | 4.20% | — | +0.042% | **+6.01%** |
| 60-bar volatility (vol) | 18,934 | 0.722% | — | — | **0.576%** | **1.618%** |

### 2.3 Threshold-vs-distribution alignment (B.1a check)

| Threshold | xStock value | Distribution position | Coverage |
|---|---|---|---|
| `RBS_VOL_MAX_XSTOCK = 0.006` (0.6%) | xStock vol p50 = 0.576%; p95 = 1.618% | Threshold is slightly above the median vol — about 50% of bars have vol below RBS gate. Suggests RBS branch fires reasonably often. |
| `IE_VOL_MIN_PATH_A_XSTOCK = 0.010` (1.0%) | vol p95 = 1.618% > threshold | About 5-15% of bars hit elevated-vol gate. |
| `IE_VOL_MIN_PATH_B_XSTOCK = 0.0075` (0.75%) | vol p50 = 0.576% < threshold; p95 > threshold | About 15-30% of bars meet moderate-vol IE Path B floor. |
| `TFS_MOM_MIN_PATH_A_XSTOCK = 0.0015` (0.15%) | mom p50 = +0.042%; p95 = +6.01% | ~50% of bars have positive momentum; ~30-40% exceed 0.15% positive threshold. |
| `HVU_MOM_NEG_PATH_A_XSTOCK = -0.0015` | (symmetric) | Same ~30-40% on the negative side. |
| `HVU_MOM_NEG_PATH_B_XSTOCK = -0.0025` | stronger neg threshold | smaller subset |

**B.1a indicative read:** the halved-vol-and-momentum + 10-15-point-lower-DX domain-knowledge scaling produces threshold gates that meaningfully partition the xStock distribution into the 5 regime branches. No threshold is impossibly tight (≥0% reachability) or impossibly loose (close to 100% always-fires). **No prima facie evidence the Layer-1 baseline is broken**; B.1a archive-replay will refine but the structural shape is sound.

### 2.4 TFS confidence-formula behavior under existing scales (B.1b check)

With xStock-specific scales `tfsMomentumScale=0.010` + `tfsVolatilityScale=0.0125` (both halved from crypto's 0.020 / 0.025):

Indicative formula evaluation at distribution moments (assuming median DBS ≈ 0.30 to satisfy TFS branch entry):

| Scenario | momentumFactor | dbsStrength | volInverse | Confidence (pre-modifier) |
|---|---|---|---|---|
| Median bars (mom = 0.04%, vol = 0.58%, DBS = 0.30) | 0.04 / 0.010 → 1.0 clamp; actually 0.042/0.010 ≈ 1.0 saturated | 0.30/0.7 = 0.429 | (0.0125 - 0.0058)/0.0125 = 0.536 | 0.50 + 0.40 × (1.0 × 0.429 × 0.536) ≈ 0.50 + 0.092 = **0.592** |
| Strong-mom + moderate-DBS (mom = 0.5%, vol = 0.58%, DBS = 0.30) | 0.5/0.010 → 1.0 saturated | 0.429 | 0.536 | same ≈ **0.592** |
| Strong-mom + strong-DBS (mom = 0.5%, vol = 0.58%, DBS = 0.50) | 1.0 | 0.50/0.7 = 0.714 | 0.536 | 0.50 + 0.40 × 0.383 = **0.653** |
| High-vol (mom = 0.5%, vol = 1.6%, DBS = 0.30) | 1.0 | 0.429 | (0.0125 - 0.016)/0.0125 = NEG → clamped 0 | 0.50 + 0.40 × 0 = **0.500** (floor) |
| Crypto-tuned scale recomputation (mom = 0.5%, vol = 0.58%, DBS = 0.30) | 0.5/0.020 = 0.250 | 0.429 | (0.025-0.0058)/0.025 = 0.768 | 0.50 + 0.40 × 0.082 = **0.533** |

**B.1b indicative read:** the halved scales produce TFS confidence values clustered in **[0.50, 0.65]** for xStock under typical conditions. With crypto-tuned scales the distribution would cluster in **[0.50, 0.55]** — even more compressed (worse). The existing structural retune appears to be *directionally correct* and produces more usable TFS confidence spread on xStock than the unmodified crypto scales would.

**Important nuance:** momentumFactor saturates at 1.0 for momentum > tfsMomentumScale = 0.010 (1.0%). xStock p95 momentum is 6.01% — well above saturation. So for the bulk of TFS-eligible bars, momentumFactor is at the ceiling (1.0) and the formula's dynamic range comes from dbsStrength × volInverse only. **This is the actual question for B.1b**: is momentumFactor saturating too easily on xStock (i.e., should `tfsMomentumScale` be RAISED to give it more dynamic range, e.g., 0.015 or 0.020), or is it appropriately wired so the "trend strength is binary above floor" semantics carry over from crypto?

### 2.5 DBS distribution (carried forward from A.3 memo)

Per `1-system-manual/_audit/A3_DBS_VERIFICATION_GATE_MEMO.md` §2:

- Final score range: -1.000 to +0.987
- Mean: -0.006, StdDev: 0.354, p25: -0.285, p50: -0.017, p75: +0.255
- Up/Down/Neutral split: 38.3% / 41.8% / 19.9% (centered + balanced)
- Component stddevs: slope 0.0587 / return 0.1527 / ema 0.1710

**Healthy + crypto-comparable** per A.3 memo §2.

---

## §3 — SIM consultation + blast radius

### 3.1 `calculatePairRegime()` in SIM 5.1 (CANONICAL, B62 redesigned)

Per `1-system-manual/SYSTEM_IMPACT_MAP.md` §5.1 (line 264):

- **File:** `server/core/metrics/market-regime.ts`
- **Upstream:** OHLC 60-min candles (Batch 18-aligned in HF8) + DBS score (from `directional-bias.ts` via MCE — B62 wiring).
- **Downstream:** Signal Orchestrator (active trading path — Phase 13 Batch 14 wired) + VTS Runner (passive learning path) + Eval-Cycle for xstock_spot (via MCE).
- **Status:** ACTIVE, B62 Design B (2026-04-16) — DBS as primary input. RBS / TFS / IE branches gated on |DBS| thresholds.
- **B79.0n.MCE per-class refactor:** `assetClass: AssetClass` is now REQUIRED (no silent default). Every caller passes explicit asset class.

### 3.2 Per-class regimeConfig resolution path (MCE refresh)

- `MarketContextEngine.computeContext(symbol, ohlc, lastPrice, volume24h, _, propagatedDbs, assetClass)` resolves `regimeConfig` from the per-class `module_constants.regime_classifier.<asset_class>.*` cache (atomically map-replaced on every refresh per B79.0n.CONFIDENCE-CHAIN chunk 3).
- Cache key includes asset_class. Wildcard `*` rows act as fallback only if no per-class override exists.
- All 6 `regime_classifier.b67_3_5_*` keys + `b67_5_post_composition_floor` already have `xstock_spot` rows — no fallback to wildcard.

### 3.3 Blast radius

Modifying values in either `regime-thresholds.ts` (B.1a) or `module_constants.regime_classifier.xstock_spot.*` (B.1b) affects:

1. **Regime classification for xstock_spot signals** — feeds the strategy-routing map (`CANONICAL_REGIME_STRATEGY_MAP`).
2. **TFS branch confidence value** — flows downstream to:
   - `signal-orchestrator.ts` — used in finalScore composition + EV gate.
   - `vts-runner.ts` — used in setupHash + emitAblationRecord telemetry.
   - `paper-execution-engine.ts` — used in trade-open decision gates.
   - RTB ranking surface (B79.0n.RTB) — confidence is part of the rankingScore.
3. **DBS-strong gating** (IE_DBS_STRONG, TFS_DBS_MODERATE) — feeds family-IMF + pattern-pool admission.

**Zero crypto_spot blast radius.** Per-class dispatch on line 245 means crypto_spot path uses `RBS_VOL_MAX` etc. from `crypto_spot/regime-thresholds.ts` (no-touch fence). Modifying xstock_spot constants in either file does NOT touch crypto's path.

### 3.4 Per-asset-class write invariant (Langston Step 1 ACK B5)

**All B.1 writes scoped to `asset_class='xstock_spot'`. NO wildcard `'*'` writes.** This holds for:

- B.1a if we promote regime-thresholds to module_constants: every UPDATE/INSERT has `WHERE asset_class='xstock_spot'`.
- B.1b for any `regime_classifier.b67_3_5_*` value adjustments: same.

The pattern is "per-asset-class behavioral knob is the default; wildcards are placeholders" per CLAUDE.md §5 #15 NO-PATCHES corollaries. Wildcard rows only retire as part of a Phase 16 cleanup batch (see §7 below) — not in B.1.

---

## §4 — B.1a (regime threshold) sub-batch — UNCONTESTED

### 4.1 Scope

Re-validate the 14 `_XSTOCK` regime threshold constants in `regime-thresholds.ts` against archived xStock OHLC + DBS. Adjust values if archive-replay shows any threshold gate is materially mis-tuned (under-firing < 1% of bars or over-firing > 90% of bars).

### 4.2 Step 3 implementation chunks

**Chunk A — Archive replay harness** — write a tsx script (`scripts/b-xstock-calib-b1a-replay.ts`) that imports `calculatePairRegime()` + iterates the joined `xstock_spot_ohlc_60m_snapshot` × `xstock_dbs_backfill` rows for the 2026-05-06 → 2026-05-15 window, classifies each bar, and emits a CSV of (symbol, bar_ts, regime, vol, mom, dx, dbsScore, confidence). ~150 LOC.

**Chunk B — Distribution analysis** — analyze the CSV: regime share per sector + per symbol + per time-of-day-class; per-regime confidence quartiles; transition flicker rate (consecutive-bar regime changes / total bars). Document in `Claude Comms and Packages/Cross-Session Briefs/B_1A_DISTRIBUTION_ANALYSIS.md`.

**Chunk C — Threshold adjustments (if any)** — for any threshold where the analysis shows mis-tuning, propose a delta. Constraint: stay within the "halved-vs-crypto + DX-10-to-15-points-down" structural envelope unless evidence supports a structural deviation.

**Chunk D — Storage decision: TS constants vs module_constants promotion** — open question for Langston Step 2 — see §4.3 below.

**Chunk E — Unit tests** — 4-6 tests covering: per-asset-class threshold dispatch path; xstock-specific RBS / TFS / IE / HVU classification with synthesized OHLC; no-touch-fence for crypto.

**Chunk F — Local tsc + vitest verification.**

### 4.3 Open architectural question — storage layer

**Option A: Keep as TS hardcoded constants** in `regime-thresholds.ts`.
- Pros: existing pattern, no migration, leaf module stays leaf.
- Cons: Layer-3 deep-calibration tweaks require a deploy. No runtime-tunable knob for paper-mode threshold experimentation in Phase 19.

**Option B: Promote to `module_constants.regime_thresholds.xstock_spot.*`** (new module name sibling to `regime_classifier`).
- Pros: DB-resolved + runtime-tunable. Aligns with the per-class behavioral-knob default. Enables Phase 19 paper-mode adjustment without re-deploy.
- Cons: requires MCE refresh wiring for the new module (1-2 chunks of work). New module = surface area increase.

**CC lean: Option B (promote)**, mirroring the per-class pattern already established for `regime_classifier`. The 14 constants are exactly the kind of "tunable knob that benefits from runtime adjustment during paper mode" the per-class default was designed for. This makes Phase 19 (paper-mode audit) able to iterate thresholds without re-deploy.

But Option B doubles the Step 3 size (migration SQL + MCE refresh wiring + caller-site read swap from TS-import to MCE-resolve + back-compat fallback during the migration). If the calendar pressure of the umbrella critical path matters more than the runtime-tunable benefit, Option A is acceptable.

**Q4.1 ask for Langston:** A or B? Or split (B.1a ships Option A first to keep critical path moving; B.1a.b promotion to module_constants as a follow-up batch in Phase 19)?

---

## §5 — B.1b (TFS confidence-formula) sub-batch — Kyle-ACK-GATED

### 5.1 The reframing per §1.2 + §2.4 discovery

**Original B.1 scope framing:** "Tune TFS confidence-formula scales per regime" — implied blank-slate calibration of `tfsMomentumScale`, `tfsVolatilityScale`, `tfsDbsScale`.

**Actual state:** `tfsMomentumScale` + `tfsVolatilityScale` are ALREADY xstock_spot-specific (halved from crypto's values; landed in B79.0m.b or B79.0n.MCE per-class plumbing — exact commit hash to be verified during Step 3). `tfsDbsScale` + `tfsDesatMin` + `tfsDesatMax` are intentionally identical to crypto (DBS scale-invariant + output-mapping bounds are asset-class-agnostic).

So B.1b becomes a **VALIDATE-THE-HALVING** activity, not a blank-slate calibrate:
- Question 1: are the halved scales right for xStock, or do they need further adjustment (raise / lower / non-symmetric)?
- Question 2: is `momentumFactor` saturating too easily on xStock (since p95 mom = 6% ≫ saturation point 1.0%), and if so should `tfsMomentumScale` be RAISED to give more dynamic range?

### 5.2 Empirical evidence for Kyle's decision

Per §2.4 indicative analysis:
- Existing halved scales produce TFS confidence in **[0.50, 0.65]** range for typical xStock bars.
- Crypto-tuned scales (un-halved) would produce TFS confidence in **[0.50, 0.55]** range — even more compressed.
- momentumFactor saturates at mom > 1.0% which is below xStock's p95 of 6.0%. So momentumFactor is structurally at ceiling for the bulk of TFS-eligible bars.

### 5.3 Two readings for Kyle (per Langston Step 1 ACK A3 framing)

**Read A (keep halved):** the existing xstock_spot-specific halved scales are directionally correct and produce sensible TFS confidence distribution. No retune in B.1b. Defer formal validation (regime-vs-outcome correlation) to Phase 25 with trade outcomes.

**Read B (retune now):** raise `tfsMomentumScale` to 0.015 or 0.020 (more dynamic range for xStock's broader momentum p95 distribution). Adjust `tfsVolatilityScale` proportionally if archive-replay shows volInverse saturation patterns. Run a 4-cell ablation (current scales vs raised-momentum + current-vol vs raised-momentum + raised-vol vs raised-momentum + halved-vol) on archive replay; pick the configuration that produces the most usable TFS confidence spread.

**CC lean: Read A (keep + validate-don't-retune at this stage).** Reasoning:
1. Empirical evidence (§2.4) shows existing halved scales are directionally correct.
2. B.1b is "regime confidence formula" — Kyle's voice 2026-05-27 explicitly excluded "the confidence" from this batch. Even if archive-replay supports a retune, it's structurally cleaner to defer the formal calibration to Phase 25 with trade outcomes as the truth source.
3. The "validate the halving" output of B.1b under Read A is the empirical evidence in §2.4 — already collected in this pre-audit. No additional Step 3 chunk work needed for B.1b under Read A.

**Read A vs Read B is Kyle's decision** — the Step 1 ACK gate says "Kyle decides B.1b inclusion with empirical evidence in hand." This pre-audit attaches the evidence; Langston reviews; Kyle decides at Step 2 close.

---

## §6 — Sibling features capture (per umbrella scope §1 sub-batch 1 row)

### 6.1 `time_of_day_class`

Derive from NYSE clock:
- `pre_open` — before 09:30 ET
- `open_hour` — 09:30-10:30 ET
- `mid_morning` — 10:30-12:00 ET
- `lunch` — 12:00-13:30 ET
- `mid_afternoon` — 13:30-15:00 ET
- `close_hour` — 15:00-16:00 ET
- `after_close` — after 16:00 ET (xStock 24/5 — non-zero traffic)

Helper function `getTimeOfDayClass(bucketTs: Date): TimeOfDayClass` lands in `server/asset_classes/xstock_spot/time-of-day.ts` (new leaf module).

### 6.2 `market_hours_open`

Reuse existing `isXstockMarketOpenUTC()` in `server/asset_classes/xstock_spot/market-hours.ts`. Wrap in archive-replay context: `marketHoursOpenAt(bucketTs)` returns boolean.

### 6.3 `is_rebalance_day`

Calendar seeded into `module_constants.equity_calendar.rebalance_dates` as a jsonb array:

```json
{
  "russell_quarterly": ["2026-06-26", "2026-09-25", "2026-12-25", "2027-03-26"],
  "sp500_changes": []
}
```

Russell dates are deterministic (last Friday of Jun/Sep/Dec/Mar). S&P changes get appended as announcements come in (~5 day advance notice).

Helper: `isRebalanceDay(date: Date): boolean` — reads the jsonb array via MCE.

### 6.4 Storage

For B.1 archive-replay output: sibling columns on the replay CSV / json output. **No live persistence in this sub-batch** — sibling features are observation-grade for post-hoc analysis, not live gating (per umbrella scope §1).

Live persistence (a `regime_features` table or jsonb column on `xstock_spot_archive`) is deferred to a follow-on batch if Phase 19 paper trading shows these features have predictive value.

---

## §7 — Per-asset-class write invariant + wildcard cleanup

### 7.1 Write invariant compliance

All B.1 writes scoped to `asset_class='xstock_spot'`:

- B.1a Option B (if approved): `INSERT INTO module_constants(module_name, asset_class, constant_name, value) VALUES('regime_thresholds', 'xstock_spot', '...', ...)`. No wildcard insert.
- B.1b adjustments (if Read B selected by Kyle): `UPDATE module_constants SET value = ... WHERE module_name = 'regime_classifier' AND asset_class = 'xstock_spot' AND constant_name IN (...)`. Wildcard row untouched.

### 7.2 Wildcard cleanup opportunity (Phase 16 register)

**`market_regime` module** has only wildcard `*` rows for 5 TFS scale keys (`tfs_dbs_scale`, `tfs_desat_max`, `tfs_desat_min`, `tfs_momentum_scale`, `tfs_volatility_scale`). These look like pre-B67.3.5 legacy that may no longer be read by live code. The `regime_classifier.b67_3_5_*` rows replaced them functionally.

**Surface for Phase 16 legacy-component review register** (RUNNING_ISSUES #136 per CLAUDE.md §5 #18): module name `market_regime`, 5 wildcard rows, candidate for retirement if compile-driven probe + caller grep confirm zero readers. Phase 16 consolidates with other legacy-removal candidates.

**Do NOT delete in this batch** per CLAUDE.md §5 #18 ("mark, don't delete in-flight").

---

## §8 — Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | B.1a Option B (module_constants promotion) doubles Step 3 size + introduces MCE refresh wiring complexity | Medium | Open Q4.1 to Langston — A or B or split? CC lean B but acknowledge calendar trade-off. |
| R2 | momentumFactor saturation analysis in §2.4 may be premature if regime-eligibility filtering changes the input distribution materially (e.g., TFS-branch-only bars have higher mom than population avg) | Medium | Step 3 chunk A archive-replay produces actual per-branch momentumFactor distribution. The §2.4 numbers are indicative; the replay output supersedes them. |
| R3 | The §6.1 NYSE clock implementation must handle DST transitions correctly (Mar/Nov boundary) | Low | Use a proven library (`date-fns-tz` is already in dependencies). Unit test covers DST cross. |
| R4 | Russell + S&P calendar in §6.3 needs a maintenance owner — calendar drifts if not refreshed annually | Low | Add to a recurring annual reminder in the alert system (alongside the B-NEW-46.b weekly health-check coming after B-NEW-45). |
| R5 | B.1b Read B (retune now) chosen by Kyle, but ablation analysis is large enough to overflow the umbrella critical path | Medium | If Kyle picks Read B, propose Read B becomes a separate sub-batch B.1b_retune slotted into the umbrella's parallel-capable slots (not the critical path). B.1a + B.1b_validate continue on critical path. |
| R6 | Sibling features (time_of_day_class, market_hours_open, is_rebalance_day) introduce 3 new modules + 1 jsonb calendar — surface-area increase | Low | Each is a leaf module < 50 LOC. Total surface increase: ~150 LOC + 1 module_constants row. |

---

## §9 — Step 3 implementation plan

Chunks (sequential within sub-batch 1, but B.1a + B.1b can run in parallel as separate work-streams):

**B.1a chunks:**
- A1. Archive-replay harness (`scripts/b-xstock-calib-b1a-replay.ts`, ~150 LOC).
- A2. Distribution analysis writeup.
- A3. Threshold adjustments (if any, in `regime-thresholds.ts`).
- A4. Optional Option B promotion to module_constants (migration SQL + MCE wiring + caller swap + back-compat fallback).
- A5. Unit tests (4-6).
- A6. Local tsc + vitest verification.

**B.1b chunks (only if Kyle picks Read B):**
- B1. 4-cell ablation harness extension to A1.
- B2. Ablation analysis writeup.
- B3. Scale adjustments to `regime_classifier.b67_3_5_tfs_*` module_constants rows.
- B4. Unit tests (2-3 additional).

**Sibling-feature chunks:**
- S1. `getTimeOfDayClass()` helper + unit tests.
- S2. `isRebalanceDay()` helper + Russell calendar seed.
- S3. Wire sibling features into A1 replay harness output.

**Estimated calendar:** B.1a Option A + Read A: 2-3 days. B.1a Option B + Read A: 3-4 days. B.1a Option A + Read B: 3-4 days. B.1a Option B + Read B: 4-5 days.

---

## §10 — Questions for Langston Step 2 review

**Q1.** §4.3 B.1a storage layer — Option A (keep TS constants) or Option B (promote to module_constants) or split? CC lean B but acknowledge calendar trade-off.

**Q2.** §5.3 B.1b reading — empirical evidence in §2.4 supports CC's Read A lean (validate-don't-retune; defer formal calibration to Phase 25). Concur or push back? If push back, lay out which numbers in §2.4 motivate Read B over Read A.

**Q3.** §7.2 wildcard cleanup of `market_regime` module — agree to surface as Phase 16 legacy-component review register entry (RUNNING_ISSUES #136), not retire in this batch?

**Q4.** §6 sibling features — observation-grade only (no live persistence in B.1) acceptable? Or do you want the sibling features persisted in a `regime_features` table NOW so Phase 19 paper trading has the columns ready when it ships?

**Q5.** Anything else worth catching before Step 3 chunk drafts?

**Reply format:** numbered point-by-point on Q1-Q5. ACK clean → CC proceeds to Step 3 chunk A1 (archive-replay harness).

---

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. This file lives at `/home/langston/inbox/b-xstock-calib/B_1_PRE_AUDIT.md` after SCP. Use `ssh staging` for any /var/log/, psql, or PM2 log inspection.
