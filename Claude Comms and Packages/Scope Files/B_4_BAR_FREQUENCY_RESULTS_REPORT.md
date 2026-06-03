# B.4-bar-frequency — STUDY RESULTS REPORT (W1 of the xStock Strategy-Fit effort)

> **Read-only study + architecture pre-audit. Changes nothing live.** Decides the evaluation bar size for xStocks — the first, foundational step of the strategy-fit effort (everything else is tuned in bar units). Window: 7 live days, 1,134,861 1-min bars, 485 symbols, forward horizon 2h (clock-anchored). Engine: `scripts/b4-bar-frequency-study.ts`. Active trading OFF.

## §0 — Headline / recommendation

**Recommendation: 15-minute bars.** And a bigger finding: **changing the xStock bar interval is a FOUNDATION change, not a config flag** — it requires a paired recalibration of the regime thresholds, the regime/indicator lookbacks, and a DBS backfill recompute. So the bar-frequency change should be its OWN foundation sub-batch (B.4 first sub-batch), preceding the per-strategy signal re-tuning (W2).

Why 15m (the data doesn't make the choice on edge — it's weak everywhere — so structure + stability + ORB decide it):
- **Edge is weak and roughly flat at every bar size** (best AUC 0.537, most ~0.50), so no frequency "unlocks" an edge. A modest gradient actually favors *coarser*, but it's small and within 7-day noise (see §2).
- **Structure favors finer:** a 2h hold spans 2 bars at 60m / 4 at 30m / **8 at 15m** / 24 at 5m. The trend/pullback/breakout strategies need bars to detect a setup AND time an entry AND manage an exit; 60m's 2 bars (the current problem) and 30m's 4 are thin. 15m's 8 clears the ≥8 threshold.
- **15m's only disadvantage — a jumpier regime read — is a CONFIRMED ARTIFACT, not intrinsic.** The pre-audit found the regime lookbacks are hardcoded BAR-counts; going 60m→15m quarters their wall-clock memory, mechanically raising flips. Time-anchoring the lookback (which the implementation must do anyway) largely erases it.
- **ORB revival:** both 15m and 30m revive the opening-range strategy that B-NEW-34 parked precisely on the 60m-bar problem; 15m gives a finer opening range.
- **5m is out** (41% regime flips — too jumpy, no edge gain). **60m is out** (2 bars/hold, can't time, can't run ORB — it's the current problem).

## §1 — Pattern availability + edge per frequency

| F(min) | F-bars | MORNING_STAR rate | MS-AUC(2h) | INSIDE_BAR rate | IB-AUC(2h) | regime-flip% | bars/2h-hold |
|--------|--------|-------------------|-----------|-----------------|-----------|--------------|--------------|
| 5  | 317,502 | 2.55% | 0.505 | 60.0% | 0.494 | 40.7% | 24 |
| 15 | 127,216 | 2.68% | 0.497 | 49.0% | 0.497 | 37.5% | 8  |
| 30 | 71,041  | 2.59% | 0.515 | 43.6% | 0.495 | 35.5% | 4  |
| 60 | 40,006  | 2.73% | **0.523** | 40.0% | 0.500 | 34.4% | 2  |

- MORNING_STAR rate is **FLAT (~2.5-2.7%) at every bar size** — finer bars do NOT surface more morning-stars. INSIDE_BAR is common and rises finer (40%→60%) but its AUC is ~0.50 and INVERTED (present underperforms) at every size — no usable edge.
- Pattern edge is weak-to-none everywhere (max 0.523, marginally best at 60m). Echoes B3.1a: the patterns don't discriminate for xStocks; bar size doesn't fix that.

## §2 — Generic non-pattern setup edge per frequency (the tiebreaker)

The patterns are only 2 of the strategies; the trend/pullback/breakout strategies (which finer bars are meant to serve) were untested in §1. So I added generic-setup forward-excess-AUC per F:

| F(min) | momentum-up AUC | uptrend>SMA20 AUC | pullback-in-uptrend AUC |
|--------|------------------|--------------------|--------------------------|
| 5  | 0.504 | 0.508 | 0.502 |
| 15 | 0.504 | 0.509 | 0.497 |
| 30 | 0.506 | 0.520 | 0.515 |
| 60 | 0.506 | **0.537** | **0.528** |

- **Momentum-up: flat** (0.504-0.506) at all F.
- **Uptrend + pullback-in-uptrend: a modest gradient favoring COARSER** (uptrend 0.509→0.520→0.537 as 15m→30m→60m). So the trend setups, like the patterns, do NOT sharpen at finer bars — they get marginally more predictive coarser.
- **But all edges are weak (<0.55)** and the 15m→30m gap is small (+0.011 AUC) — within 7-day noise, not decision-grade. It does not outweigh 15m's intrinsic structural advantage, especially once the stability artifact (§3) is fixed.

## §3 — Architecture pre-audit: the interval change is a FOUNDATION change

(Read-only code audit per Langston's checklist.) **Single biggest risk: silent regime-classifier meaning-shift.** The regime lookbacks (`computeMomentum` 30 bars `market-regime.ts:120`; `computeADX` 14 bars `:132`) are hardcoded bar-counts, and the xStock vol/mom regime thresholds (`regime-thresholds.ts`: `RBS_VOL_MAX_XSTOCK=0.006`, `IE_VOL_MIN=0.010`, `TFS_MOM_MIN=0.0015`) were hand-calibrated to the 60-min per-bar return distribution. At 15m, per-bar vol/mom roughly halve while the thresholds stay put → the regime mix silently collapses, the wrong strategy families get selected, and **nothing errors**. There is even an explicit code comment (`market-regime.ts:108-119`) stating this invariant breaks at a non-60m interval and the constants must migrate per-class. (This also confirms the §0 point: 15m's higher flip-rate is the bar-count-lookback artifact.)

**Blast radius (by effort):**
| # | Component | Verdict | Effort |
|---|---|---|---|
| 1 | xStock regime threshold re-derivation (calibrated to 60m per-bar scale) | needs change | HIGH (recalib study) |
| 2 | Shared indicator/regime lookbacks → per-class (30-bar mom, 14-bar ADX, SMA-20, ATR-14, slice(-24) "24h" windows) | needs per-class config | HIGH (shared hardcoded literals; touching risks crypto without branching) |
| 3 | DBS lookback (48 bars) + full backfill recompute | needs change | MED-HIGH |
| 4 | Aggregator interval typing (union `60\|240`→add 15) + new `xstock_spot_ohlc_15m_snapshot` table | needs change | MED |
| 5 | Bar-cap / overlay-window re-derivation (MAX_BARS_60M=60 etc.) | needs change | LOW-MED |
| 6 | ORB candle-source defect (`vts-runner.ts:897` feeds 60m bars, not 1m) + 15m opening-range | needs change (pre-existing defect surfaced) | MED |
| 7 | Call-site interval literal (`scanner.ts:533`) | needs change | LOW |
| 8 | Forming-bar emission / scanner cadence / dedupe / crypto isolation | OK as-is | none |

**Same recalibration burden applies at 15m or 30m**, so the pre-audit does not change the frequency choice — but it scopes the implementation: this is a paired bar-size + regime/indicator/DBS recalibration, not a flag flip.

## §4 — Method caveats
- Edge = forward EXCESS return (de-meaned vs the cross-sectional universe), 2h clock-anchored, AUC primary. 7 live days. The generic setups (momentum/uptrend/pullback) are proxies for the trend strategies, not the strategies themselves.
- Regime-flip% uses a lightweight ATR-normalized 3-bar directional proxy (labelled) — directionally valid for comparing flip-rate across F, not the production classifier.
- Single shared bar size decided (Langston #1); per-strategy / multi-timeframe deferred to its own later effort if data ever demands it.

## §5 — Disposition / sequencing
- **Lock 15m** (pending Langston round-2 confirm — see below).
- **B.4 first sub-batch = the bar-frequency foundation change** (interval typing + new 15m snapshot table + per-class time-anchored lookbacks + regime-threshold recalibration + MCE-period re-derivation + DBS backfill recompute + ORB candle-source fix). This PRECEDES W2 (per-strategy signal re-tuning), because every W2 setting is in bar units and the regime/indicator semantics must be correct first.
  - **Langston's 4 binding scope additions (round 2):**
    1. **EXIT CRITERION = a regime-label PARITY REPORT (the #1 gate, not just "it builds").** Diff old-60m vs new-15m regime labels over the same historical window, characterize the distribution shift, and make "shift understood AND intended" the sub-batch's acceptance test — otherwise we ship the silent meaning-shift blind. Per-strategy re-tuning is HELD until this parity is signed off.
    2. **DBS backfill = an explicit epoch-versioning DECISION** (documented in scope, not discovered mid-build): full historical recompute at 15m, OR flag a regime-epoch boundary so downstream ML knows the substrate changed — a part-60m / part-15m training corpus is split-brain.
    3. **4× snapshot cadence vs the B79 1.3× load gate / CPX22 budget — confirm UPFRONT.** If it doesn't fit, the answer is vertical-scale, NEVER asset-class shedding (§5 #15).
    4. **ORB fix = WINDOW re-derivation, not just candle-source repoint** — the opening-range definition ("first N bars of session") is bar-count too; time-anchor the ORB window itself.
  - Per-class lookbacks (crypto vs xStock independent, no wildcard) confirmed correct (§5 #15).
- Then W2 (re-tune the 10 strategies' signal params at 15m), W3 (re-enable equity-suitable strategies + ORB), W4 (pattern-detection per-class). All asset-class-scoped (crypto untouched).

## §6 — Langston review
- **Round 1:** agreed 15m PENDING the generic-setup edge test (tiebreaker for 15m-vs-30m); 5m/60m out; "30m fallback only if the test surprises." Detailed pre-audit checklist (run).
- **Round 2 (the test surprised; pre-audit confirmed the artifact + foundation scope): CONFIRMS — lock 15m + foundation sub-batch gating per-strategy re-tuning.** Key strengthening (Langston): the measured 15m trend edge (0.509) was sampled WITH the bar-count artifact LIVE — at 15m the "30-bar momentum" / "14-bar ADX" lookbacks spanned 7.5h/3.5h instead of the calibrated 30h/14h, so the regime labels feeding that edge measurement were systematically noisier/mislabeled. So **0.509 is an artifact-contaminated FLOOR, not the true post-fix edge** — time-anchoring the lookback should pull the 15m edge UP toward the 30m/60m figures, narrowing the gradient I was already discounting as sub-0.55 noise. The coarser-gradient is therefore not a real cost of 15m — it's mostly the same artifact double-counted. 15m is the right substrate to BUILD edge on (no frequency has decision-grade edge yet — that's the re-tuning sub-batch's job). **CONSENSUS: lock 15m; foundation sub-batch first (+ the parity-report exit gate, §5); re-tuning held until parity signed off.**

---

*W1 results. Foundation: `B_3_1_GATE_CORRECTNESS_REPORT.md` (strategies have no edge → strategy-fit), `B_XSTOCK_STRATEGY_FIT_SCOPE.md` v2. Engine: `scripts/b4-bar-frequency-study.ts`. Active trading OFF — forward-return-proxy evidence; Phase-19 paper-active is the final arbiter.*
