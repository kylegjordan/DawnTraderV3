# B.1a Archive-Replay Distribution Analysis

**Sub-batch:** B-XSTOCK-CALIB B.1a (regime threshold + TFS confidence-formula)
**Date:** 2026-05-28
**Author:** CC (autonomous run)
**Status:** Step 3 chunk A2 — distribution analysis writeup. Feeds A3 (threshold-adjustment decision).

---

## §1. Replay setup

- **Harness:** `scripts/b-xstock-calib-b1a-replay.ts`
- **Window:** 2026-05-06 18:00Z → 2026-05-15 23:00Z (intersection of `xstock_spot_ohlc_60m_snapshot` × `xstock_dbs_backfill`)
- **Symbols:** 260 (those with both DBS backfill rows and OHLC coverage)
- **Classifier:** production `calculatePairRegime()` with xstock_spot-resolved RegimeConfig (`tfsMomentumScale=0.010`, `tfsVolatilityScale=0.0125`, `tfsDbsScale=0.7`, desat bounds [0.50, 0.90], post-comp floor 0.45, `b68_5PathBMomentumMin=0.0005`)
- **Total bars classified:** 2,658
- **Replay corpus constraint:** per-symbol OHLC archive depth varies widely (some symbols only started archiving 2026-05-15). 30-bar minimum lookback applied. Future replays will benefit from accumulated OHLC depth.
- **Concentration check (Langston Step 4 Q4):** maximum per-symbol contribution = 23 bars (0.87% of total). No single symbol exceeds the 5% concentration threshold. Distribution is broadly representative across the 260-symbol universe.

Raw CSV: `Claude Comms and Packages/Cross-Session Briefs/b-xstock-calib-b1a-replay-output.csv` (columns: symbol, bucket_ts, regime, confidence, vol, mom, adx, dbs).

---

## §2. Regime distribution

| Regime | n | Share | Confidence p5 | p25 | p50 | p75 | p95 | mean |
|---|---|---|---|---|---|---|---|---|
| HIGH_VOLATILITY_UNSTABLE | 664 | 25.0% | 0.6851 | 0.7472 | 0.8335 | 0.8500 | 0.8500 | 0.7992 |
| IMPULSE_EXPANSION | 307 | 11.6% | 0.6058 | 0.6599 | 0.7041 | 0.7426 | 0.8053 | 0.7026 |
| RANGE_BOUND_STABLE | 233 | 8.8% | 0.8251 | 0.8386 | 0.8480 | 0.8564 | 0.8652 | 0.8476 |
| STRUCTURAL_TRANSITION | 969 | 36.5% | 0.5319 | 0.5440 | 0.5563 | 0.5701 | 0.5861 | 0.5582 |
| TREND_FRIENDLY_STABLE | 485 | 18.2% | 0.5000 | 0.5202 | 0.5682 | 0.6289 | 0.7003 | 0.5796 |

### §2.1 Per-regime confidence shape observations

**TFS (18.2%, mean conf 0.58):**
- Confidence range [0.50, 0.70] — compressed against the floor; p95 reaches only 0.70 vs the formula ceiling 0.90.
- The B67.3.5 multiplicative formula structure (`momentumFactor × dbsStrength × volInverse`) produces small products when any single factor is moderate. Typical TFS conditions on xStock data: momentum factor ~0.3 (mom around 0.003), DBS strength ~0.43 (|DBS| around 0.30), volInverse ~0.52 (vol around 0.006). Product ~0.067 → confidence ~0.527.
- Peak observed TFS confidence in the replay corpus = 0.7915 (CME/USD on 2026-05-15T12:00Z) — this is the thin right tail. The p95 = 0.70 reported above is where 95% of TFS-classified bars fall below; the additional ~5% of bars extend from p95=0.70 up to the 0.7915 maximum.
- **The compression near floor is a direct consequence of the formula's multiplicative semantics** ("all three inputs must be strong for high confidence"). Per B67.3.5 design (`market-regime.types.ts:38-49`): "Multiplicative — any weak input collapses score (semantic match for 'trend-friendly STABLE' = all three should align)."

**HVU (25.0%, mean 0.80):**
- Inline formula `confidence = 0.65 + min(|mom|×8, 0.20)`. Saturates at 0.85 when |mom| ≥ 0.025 (2.5%). xStock has plenty of high-momentum bars in HVU branch (negative momentum required by HVU branch conditions).
- p75 = p95 = 0.85 (ceiling). HVU saturates aggressively.

**RBS (8.8%, mean 0.85):**
- Inline formula `confidence = 0.75 + (0.012 - vol) × 12`. With xStock vol typically < 0.006 (passes RBS gate at all), this evaluates ≥ 0.75 + (0.012-0.006)×12 = 0.822, ceiling effectively at 0.87 when vol ~0.0001.
- p95 = 0.87. RBS is also saturated.

**IE (11.6%, mean 0.70):**
- Inline formula `confidence = 0.65 + (vol-0.015)×6 + (dx-45)×0.002 + absDbs×0.1`. Has the widest natural spread (multi-term additive).
- p5-p95 spread = 0.20 — healthiest distribution across the five regimes.

**ST (36.5%, mean 0.56):**
- Catch-all "no clean classification" bucket. Inline formula `confidence = 0.50 + min(vol×5, 0.10) + min(|dbs|×0.15, 0.05)`. Tightly bounded [0.50, 0.65].
- 36.5% is high — suggests many xStock bars fall through the four main regime branches.

### §2.2 Regime share interpretation vs design intent

Crypto's B62 Phase 0 evidence (`BATCH_62_PHASE0_REPLAY_ANALYSIS.md` referenced in code comments): TFS+IE share ~36.5%. xStock observed TFS+IE = 18.2% + 11.6% = 29.8%. Lower than crypto's calibration target, but in the same ballpark.

Crypto historical (post-B62): RBS ~3.4% (drift-contamination eliminated). xStock observed RBS = 8.8%. Higher than crypto's, which makes sense — equity markets have more "low vol, no direction" intervals than crypto's 24/7 high-vol environment.

ST 36.5% is the most distinctive xStock signature. Crypto post-B62 ran ST ~36.6% per design-rev-2 commentary (file comment line 332). Functionally equivalent share.

**Net interpretation: regime DISTRIBUTION is reasonable for xStock under existing thresholds.** No obvious threshold-tuning red flag.

---

## §3. Threshold-adjustment decision (A3)

### Option A — No threshold adjustments
Accept current 14 `_XSTOCK` regime threshold constants in `server/asset_classes/xstock_spot/regime-thresholds.ts`. Reasoning:
- Regime distribution falls within the "expected" envelope based on crypto's calibration target.
- Sample size 2,658 bars is small. Refinement decisions on small samples risk overfitting.
- Future replays (post Phase 19 paper trading) will have an order of magnitude more data + actual trade outcomes for validation.

### Option B — Targeted RBS / TFS adjustments
RBS is currently gated heavily by `RBS_DBS_MAX_XSTOCK = 0.10` (neutral DBS). Could relax to 0.15 or 0.20 to expand RBS share toward ~15-20% (more typical for equity markets). TFS gating on `TFS_MOM_MIN_PATH_A_XSTOCK = 0.0015` is reasonable; no obvious tweak.

### Option C — Defer to Phase 25 with trade outcomes
Same as Option A but with explicit framing that the formal calibration cycle happens in Phase 25 when trade win/loss data is available to correlate against confidence values.

### CC recommendation: Option A + Option C framing

**Don't adjust thresholds at this stage.** Reasons:
1. The empirical xStock distribution is in the design envelope (no extreme over/under-firing of any branch).
2. The "compression" observed in TFS confidence is a direct consequence of the formula's multiplicative design intent — not a bug, and not unique to xStock.
3. Sample size (2,658 bars / 260 symbols) is too small to drive structural threshold changes.
4. Phase 25 with paper-trade outcomes is the proper calibration cycle for the confidence formula tuning + threshold refinement.
5. The Layer-1 baseline (halved-vs-crypto + DX-10-to-15-points-down) per the `regime-thresholds.ts` docstring is operating within its intended envelope.

### Surface for Phase 25 follow-up (Kyle / Langston handoff)

The momentumFactor saturation observation (p95 mom = 6%, but formula caps factor at mom = 1.0%) means the TFS formula's dynamic range comes from `dbsStrength × volInverse` only for the majority of TFS-eligible xStock bars. This is a STRUCTURAL OBSERVATION worth weighing against Phase 25 P&L data — if high-confidence TFS labels predict winning trades only weakly because momentum is already saturated, the formula may genuinely need rescaling for xStock. Capture as Phase 25 calibration input.

---

## §4. Sibling features (S1, S2, S3 chunks)

Per scope §6, B.1 captures three sibling features for post-hoc analysis (observation-grade only, not live-gating):

- **`time_of_day_class`** — derive from NYSE clock buckets. Helper: `server/asset_classes/xstock_spot/time-of-day.ts` (new leaf module).
- **`market_hours_open`** — already exists at `server/asset_classes/xstock_spot/market-hours.ts::isXstockMarketOpenUTC()`. Reuse.
- **`is_rebalance_day`** — Russell quarterly calendar (last Friday of Jun/Sep/Dec/Mar). Helper: `server/asset_classes/xstock_spot/calendar.ts` (new leaf module). Calendar persisted in `module_constants.equity_calendar.rebalance_dates` jsonb.

Storage: CSV row metadata only (no live persistence per scope §6.4). Live `regime_features` table deferred to a follow-on batch IF Phase 19 paper trading shows predictive value.

---

## §5. Outcomes of this analysis

1. ✅ Regime classifier empirically validates against archived xStock data.
2. ✅ Confidence formula behavior matches design semantics (multiplicative-product compression for TFS by intent).
3. ✅ No threshold adjustments recommended at this stage (Option A + Option C).
4. ✅ Sibling-feature helpers (time-of-day, calendar) implemented as observation-grade leaf modules.
5. ➡️ momentumFactor saturation observation handed off to Phase 25 calibration cycle.

### §5.1 Per-batch governance follow-ups

- **`regime-thresholds.ts`** — unchanged; docstring augmented with B.1a-replay-validated note pointing to this analysis doc.
- **SIM §5.1** — augment `calculatePairRegime` entry with "B.1a archive-replay 2026-05-28 validated distribution; no threshold adjustments." Add cross-link to this analysis.
- **ADJUSTMENT_FRAMEWORK** — add Appendix entry for the xStock regime thresholds (current values + validation status + Phase 25 follow-up note).
- **B.7 design-doc carry-forward (per A.3 memo §4.b):** the per-sector top-N volume concentration measurement remains a B.7 carry-forward; this analysis doesn't displace that.
- **`RUNNING_ISSUES`** — open Tier-3 entry "TFS confidence-formula momentumFactor saturates above 1% xStock momentum; Phase 25 calibration input."

---

## §6. CSV preview (first 5 + last 5 rows)

```
symbol,bucket_ts,regime,confidence,vol,mom,adx,dbs
AAPL/USD,2026-05-15T15:00:00.000Z,RANGE_BOUND_STABLE,0.8490,0.003753,0.002364,27.61,0.0140
AAPL/USD,2026-05-15T16:00:00.000Z,RANGE_BOUND_STABLE,0.8493,0.003723,0.005293,22.33,0.0601
...
```

Full CSV: `Claude Comms and Packages/Cross-Session Briefs/b-xstock-calib-b1a-replay-output.csv` (2,658 data rows + header).

---

*End B.1a distribution analysis. Feeds Step 4 code review (Langston) with empirical evidence + recommendation.*
