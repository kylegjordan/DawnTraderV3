# BATCH 67.3.5 — Pre-Window Hardening: Phase Backfill + TFS Desaturation

**Owner:** Kyle (decisions), Claude Code (implementation), Langston (review)
**Date opened:** 2026-04-29
**Status:** Step 1 — scope drafted, awaiting Langston review
**Parent batch:** B67 coordinated regime-confidence core
**Predecessor:** B67.2.1 trade record persistence (commits `141ec3c3`+`41abd541`+`575dbca4`) + foundation work §0.12.A (commits `ed9a1a08` → `8f417ca5`)
**Successor:** B67.4 cheap-tier bundle (B67.4 outcome feedback + B68.4 regime-age first-class + B68.5 Path B sustainability tightening)
**Window dependency:** This batch BLOCKS calibration window start. B67.4 cheap-tier ships only after B67.3.5 is verified live.

---

## Context

Two issues surfaced during 2026-04-29 investigation, queued in master plan §0.12.B for design discussion. Langston (cc-inbox #850) and Kyle aligned on **Modified B sequencing**: fix both before B67.4 cheap-tier ships, because:

1. **B67.4 outcome feedback** computes alpha-weighted adjustments per (regime, strategy) on confidence. If confidence input is saturated (clustered at 1.0) or phase is wrong (everything EARLY), the feedback loop has nothing to differentiate — adjusts a constant, no-op.
2. **Calibration check** (tertile-monotonic WR-by-confidence, ≥7pp HIGH-LOW gap) is a HARD GATE for B67.5. Starting the 14-day window on saturated confidence either passes trivially or fails — wasted 2 weeks either way.
3. The cost of fixing both before window: 1–2 days each. The cost of NOT fixing: 14 days of meaningless data + B67.4 feedback loop misfires.

Both fixes are **targeted** — no full classifier rewrite, no taxonomy change. Phase backfill: cold-pair age inference. Desaturation: ONE branch (TFS, ~55-60% of pairs) gets a continuous formula. Other 4 branches (HVU/RBS/IE/ST) remain on existing formula and are queued for a follow-up batch post-window.

---

## Numbered Objectives

### A. Phase Backfill from OHLC History

**A.1** On first observation of a pair, before stamping `enteredAt = now` in `regimePhaseStore.tick()`, walk backward through the pair's most recent 12 hours of 60-minute OHLC windows. Re-run `calculatePairRegime` on each historical window. The most recent window where the classifier output regime label DIFFERS from the current regime is the regime entry boundary — set `enteredAt` = that window's timestamp + 60min (i.e. the first window where the pair was in the current regime).

**A.2** If no historical window in the last 12h shows a different regime label (i.e. the pair has been in the current regime for at least 12 hours), set `enteredAt` = now − 12h (i.e. cap LATE-side at 12h+, which is correct per phase boundaries).

**A.3** If insufficient historical OHLC available (< minimum required for `calculatePairRegime`, currently ~50 candles per the indicator engines), fall back to `enteredAt = now` AND emit a structured warning log `[regime-phase][backfill] insufficient_history pair=<x> candles=<n>`. This is a legitimate runtime state, not a silent fallback — pair is treated as EARLY by default until enough data accrues.

**A.4** Backfilled `enteredAt` value persists to `/tmp/regime-phase-store.json` via the same persistence layer shipped in §0.12.A item 6. Backfill is performed ONCE per pair (first observation only) — `regimePhaseStore.tick()` checks for an existing record and skips backfill on subsequent ticks.

**A.5** DBS at the historical window time uses **current DBS** (we don't have backfilled DBS). This is approximate but acceptable per Langston (the regime LABEL is fairly robust — vol/momentum/ADX carry most of the classification signal — and we only need the label to find when it changed, not historical confidence precision). Document this approximation in `SYSTEM_MANUAL.md` regime classifier section.

**A.6** Backfill runs serially during the first MCE refresh cycle for each pair. Total work on full cold-start: ~177 pairs × up to 12 windows = ~2,124 classifier calls. Expected wall time < 1s. Not parallelized, no perf-tuning needed.

**A.7** Edge case: if backfilled age > 12h, pair lands in LATE phase immediately. `computePhase()` already handles this correctly (LATE is a fully valid phase per existing strategy_phase_weights JSONB). Verified — no special handling needed.

### B. TFS Branch Desaturation

**B.1** Replace the existing TFS branch step-function in `server/core/metrics/market-regime.ts:177-184` with a continuous mapping on the same three inputs (momentum, DBS, volatility). Output range: **[0.50, 0.90]**. Per-input contribution:
- `momentum_factor` = clamp(0, 1, normalized_momentum) — where normalized_momentum maps the existing momentum metric to [-1, +1] via tanh or division by a configured scale
- `dbs_strength` = clamp(0, 1, |DBS| / 1.0) — assumes DBS is already in [-1, +1]
- `vol_inverse` = clamp(0, 1, 1 - normalized_volatility) — where high vol reduces confidence

`raw_confidence = 0.50 + 0.40 × (momentum_factor × dbs_strength × vol_inverse)`

A pair only reaches 0.90 when ALL three inputs are strong. Moderate values across the board land at ~0.60-0.70. Borderline TFS lands at ~0.50-0.55.

**B.2** All scaling parameters introduced (the normalization scales for momentum and volatility, plus the output range bounds) seed into `module_constants` per the §0.9 governance rule. No new hardcoded constants. Specific keys to add:
- `b67_3_5_tfs_desat_min` (0.50)
- `b67_3_5_tfs_desat_max` (0.90)
- `b67_3_5_tfs_momentum_scale` (calibrated against current momentum distribution — Step 2 to determine value)
- `b67_3_5_tfs_volatility_scale` (calibrated against current volatility distribution — Step 2 to determine value)

**B.3** The other 4 regime branches (HVU, RBS, IE, ST) are NOT touched in this batch. Their existing formulas remain. Documented as known follow-up: "post-window classifier-formula tuning batch will desaturate remaining branches if calibration evidence shows similar saturation." Logged in `RUNNING_ISSUES.md`.

**B.4** B67.1 macro modifier and B67.2 phase weight chain remains unchanged. They multiply the new desaturated raw confidence. Post-modulation max is now `0.90 × 1.05 × 1.10 = 1.040` → clamps to 1.0 at the upper end ONLY for pairs with ALL inputs strong + favorable macro + PRIME phase. Genuine ceiling cases, not saturation.

**B.5** Regime LABEL (TFS) is unchanged — the branch's classification logic (when does a pair get labeled TFS?) is untouched. Only the within-branch confidence number changes.

**B.6** Add unit test coverage for the new continuous formula:
- Strong-all-three pair → confidence ≈ 0.90
- Moderate pair → confidence in [0.60, 0.75]
- Borderline pair → confidence in [0.50, 0.55]
- Edge cases: zero momentum, zero DBS, zero volatility components
- Boundary clamps work (no output < 0.50 or > 0.90 from raw formula)

### C. Observability + Verification

**C.1** Both fixes go LIVE on staging — no shadow mode, no flag-gating. Per Kyle's "no shadow theater" directive + B67.1/B67.2 precedent.

**C.2** Confidence raw distribution is captured by the existing B67.2.1 `regime_confidence_raw` column on `paper_sim_trades`. Post-deploy, query distribution after ~24h of new closed trades and verify spread is healthy (target: P10 ≤ 0.55, P50 ≈ 0.65-0.75, P90 ≥ 0.85, with non-trivial mass below 0.95).

**C.3** Phase distribution captured by existing B67.2.1 `phase` + `phase_age_seconds` columns. Post-deploy, verify mix of EARLY/PRIME/LATE classifications instead of universal EARLY. Cold-start scan log should show how many pairs got backfilled to PRIME or LATE.

**C.4** New structured log lines:
- `[regime-phase][backfill] applied pair=<x> regime=<r> age_minutes=<n>` — emitted on successful backfill
- `[regime-phase][backfill] insufficient_history pair=<x> candles=<n>` — emitted when fallback kicks in
- `[market-regime][tfs] desat_distribution_sample raw=<n>` — first 50 TFS classifications post-deploy log raw confidence for spot-check

**C.5** Dashboard ablation rows: B67.3.5 does NOT add new ablation factors. Existing 4 active rows remain (b67_1_btc_dominance, b67_1_funding_rates, b67_1_mcap_momentum, b67_2_phase_preference). The desaturation fix shows up indirectly in those rows (the confidence values they reference are now meaningful).

### D. Governance

**D.1** Update on completion: `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `MEMORY.md`, `SYSTEM_IMPACT_MAP.md` (regime classifier + regime-phase-store entries), `SYSTEM_MANUAL.md` (TFS branch formula change + phase backfill mechanism + DBS approximation note), `CHANGES_AND_FIXES.md` (entry for both fixes), `POST_AUDIT_ROADMAP.md` (B67.3.5 added to Phase 15c sequencing), master plan §0.12 (move Items 1+2 from open-discussion to shipped), `RUNNING_ISSUES.md` (other-regime-branches desaturation queued as known follow-up).

**D.2** Migration files: SQL adding `module_constants` keys for the 4 new desaturation scales (B.2). Pattern matches prior B67 migrations.

---

## Verification Criteria (Step 11 closure)

- [ ] Phase backfill emits backfill-applied log lines on cold start with non-zero count
- [ ] `regime-phase-store.json` on disk contains backfilled `enteredAt` values older than process start time
- [ ] Phase distribution after 24h of new trades shows non-trivial PRIME and LATE mass (not universal EARLY)
- [ ] TFS confidence raw distribution after 24h shows P10 ≤ 0.55, P50 in [0.60, 0.80], P90 ≥ 0.80, non-trivial mass below 0.95
- [ ] No regression in existing B67.1 / B67.2 / B67.2.1 / B67.3 verification (modifier values, phase weights, ablation rows, trade record persistence)
- [ ] Unit tests pass for B.6
- [ ] All 4 CI checks GREEN
- [ ] PM2 dawntrader running clean for ≥ 24h post-deploy
- [ ] All §D governance docs updated, completion report lists every file touched

---

## Risks + Mitigations

**R1: Approximate DBS in historical backfill labels pairs incorrectly near regime boundaries.** Mitigation: backfill only walks 12h back. Errors near boundary produce ±60 minutes of age imprecision — phase weight is continuous, so impact is negligible. Worst case: a pair in PRIME-near-LATE gets labeled PRIME when it should be LATE (or vice versa) — still produces valid weights.

**R2: TFS desaturation changes cluster behavior of trade routing.** TFS is the dominant regime so any change ripples broadly. Mitigation: regime LABEL is unchanged (only confidence number changes), and confidence is still decorative pre-B67.5 (no consumers wired in yet). Behavior change is limited to ablation framework + future B67.5 wiring. We can roll back the formula via DB constants if distribution looks pathological.

**R3: Backfill on cold start delays first MCE cycle.** Mitigation: <1s wall time per Langston's analysis. Run during init, before first cycle's emission. If actual measurement shows >5s, parallelize.

**R4: TFS desaturation interacts unexpectedly with B67.1 modifier and B67.2 phase weight.** Mitigation: post-modulation max math `0.90 × 1.05 × 1.10 = 1.040` is intentionally near-1.0 ceiling — the clamp now bites only on extreme cases. No code changes to B67.1 or B67.2.

**R5: Other 4 regime branches still saturate, calibration check still partial-broken.** Acknowledged. TFS is ~55-60% of pairs so fixing it alone gives ≥half the calibration window meaningful data. Other branches queued for post-window classifier-tuning batch.

---

## Out of Scope

- HVU / RBS / IE / ST branch desaturation — deferred
- DBS historical backfill — using current DBS for the regime classification step is acceptable
- Re-running backfill periodically — first observation only
- Changing regime LABEL boundaries or adding new regimes — separate future batch
- B67.4 cheap-tier bundle work — follows B67.3.5 closure
- B67.5 consumer wiring — follows calibration window

---

## Open questions for Langston (Step 1 review)

1. **Window granularity:** 60-min OHLC windows for the backward walk — agree, OR prefer 15-min for finer entry-time precision (would 4× the classifier calls but still well under 1s)?
2. **Output range [0.50, 0.90]:** comfortable with these bounds, or different? (Could be [0.45, 0.95] for slightly wider spread, or [0.50, 0.85] for more conservative.)
3. **Multiplicative vs weighted-sum** for the three inputs in B.1: I proposed `momentum × DBS × vol_inverse` (multiplicative). Alternative: `0.4 × momentum + 0.3 × DBS + 0.3 × vol_inverse`. Multiplicative is stricter (any one weak input pulls the whole score down) — which matches "TFS is a strong-trend regime, all three should align." Sum is more lenient. Lean?
4. **Backfill on PM2 restart with persisted store:** existing record from disk wins. We don't re-backfill on every restart. Agree?
5. **Anything missing or wrongly scoped?**
