# B.4 — Bar-Frequency FOUNDATION Sub-Batch — SCOPE v1 (Step 1)

> **First build of the B.4 umbrella (xStock Strategy-Fit effort).** Switches the xStock evaluation bar size from 60-minute to **15-minute** and performs the PAIRED recalibration that switch forces, so the regime/indicator/DBS semantics keep their intended real-world meaning. This is the FOUNDATION step — it precedes all per-strategy re-tuning (W2), pattern-detection review (Bucket 3), and per-strategy trade construction (W2).
>
> **Decision basis (Step 1.a architectural read):** `B_4_BAR_FREQUENCY_RESULTS_REPORT.md` (W1 study + §3 architecture pre-audit blast-radius table, file:line level) + `B_4_15MIN_RECALIBRATION_LIST.md` (plain-language master list) + the working tracker at the bottom of `MULTI_ASSET_VTS_EXPANSION_PLAN.md`. 15-minute bars are APPROVED (Kyle 2026-06-03) on a 2-round CC↔Langston consensus.
>
> **🚨 SCAFFOLDING/HONESTY (§9.1): THIS SUB-BATCH DOES NOT MAKE xStock STRATEGIES PROFITABLE OR EVEN RE-TUNED. It changes the SUBSTRATE (bar size) and re-establishes correct regime/indicator/DBS semantics on that substrate. Per-strategy edge is built later in W2. xStock signals will remain un-re-tuned (running inherited values on the new bar size) until W2.**
>
> **Active trading OFF.** Everything here is VTS/simulation + read-only evidence. No live trading behavior changes. CALIBRATION LENS axiom 6 applies. NO PATCHES — structural, per-class, DB-resolved.

---

## §0 — PREVIOUSLY-STATED-VS-NOW (§9.2)

- **xStock evaluation bar size — PREVIOUSLY STATED: 60 minutes. NOW: 15 minutes. REASON:** W1 bar-frequency study + 2-round Langston consensus (`B_4_BAR_FREQUENCY_RESULTS_REPORT.md`) — structure (8 bars per 2h hold vs 2), stability-artifact correctable by time-anchoring, and ORB revival; edge weak at every size so structure/stability/ORB decide it.
- No other prior number changes in this sub-batch's surface. All threshold re-derivations below produce NEW values (the 60m values are being replaced, not "corrected from a prior stated figure").

---

## §1 — Plain-language headline

Almost everything in the system that remembers or measures recent price was set up counting **bars**, and quietly assumed each bar is 60 minutes. Cutting the bar to 15 minutes means every one of those counts now spans a quarter of the time it used to, so the same numbers mean something different. This sub-batch re-expresses those counts in real time (per market type), re-measures the volatility/momentum cutoffs that decide the regime against the 15-minute world, rebuilds the directional-bias history on the new bars, and turns the opening-range strategy back on now that there's intra-hour data for it. Nothing is "tuned for profit" here — that's later. The single exit gate is a side-by-side report proving the regime labels shifted in a way we understand and intend.

---

## §2 — Numbered objectives + verification criteria

### Objective 1 — Bar plumbing (15-minute interval + storage)
- Add `15` to the xStock aggregation interval typing (`XstockAggregationInterval` union `60|240` → include `15`); update the call-site interval literal (`scanner.ts:533`) and any other hardcoded interval references surfaced in Step-2 pre-audit.
- Create a new `xstock_spot_ohlc_15m_snapshot` storage table (migration), parallel to the existing snapshot path.
- **xStock-only. Crypto's aggregation/bars are untouched (separate code path).**
- **Verify:** psql shows the new 15m snapshot table populating on staging; scanner builds 15-min bars; crypto bar cadence unchanged (isolation proof in logs).

### Objective 2 — Regime + indicator lookbacks → per-class, TIME-ANCHORED
- Re-express the hardcoded bar-count lookbacks so they span the intended wall-clock time per asset class, with NO shared literal leaking a 15-min value into the crypto path: `computeMomentum` 30-bar (`market-regime.ts:120`), `computeADX` 14-bar (`:132`), SMA-20, ATR-14, the `slice(-24)` "24h" windows, and the bar-cap (`MAX_BARS_60M=60` and equivalents).
- Per-class config (crypto vs xStock independent, no wildcard) — resolves the explicit invariant warning at `market-regime.ts:108-119`.
- **This is also the fix for the "jumpier regime read at finer bars" the study saw — that flip-rate rise is the bar-count-shrinkage artifact, not intrinsic noise.**
- **Verify:** crypto regime lookbacks demonstrably unchanged; xStock lookbacks span the intended real-time window at 15m; regime-flip rate on 15m drops toward the 60m baseline after time-anchoring (measured, in the parity report).

### Objective 3 — xStock regime threshold RECALIBRATION
- Re-derive the xStock volatility/momentum regime cutoffs against the 15-minute per-bar return distribution (`regime-thresholds.ts`: `RBS_VOL_MAX_XSTOCK=0.006`, `IE_VOL_MIN=0.010`, `TFS_MOM_MIN=0.0015`, and the rest of the xStock regime threshold set). A 15-min bar moves ~half as much as a 60-min bar; left unchanged, the regime mix silently collapses (mislabels almost everything quiet/range-bound) with NO error.
- This supersedes the B.1 xStock regime-threshold calibration (which was done on 60-min volatility).
- **Verify:** the recalibrated thresholds produce a regime mix on 15m bars that is characterized and intended in the parity report (Objective 9); crypto thresholds untouched.

### Objective 4 — MCE indicator-period re-derivation (per-class)
- Re-derive the MCE/indicator-chain periods that are bar-count (the modulator and indicator periods feeding the confidence chain) so they span the intended real time at 15m, per asset class.
- **Verify:** MCE per-class indicator periods resolve to the intended wall-clock windows at 15m; crypto periods unchanged.

### Objective 5 — DBS adjustment + backfill recompute + EPOCH-VERSIONING decision [Langston binding condition 2]
- Re-derive DBS lookback (`computeDirectionalBias` lookbackPeriod=48 bars → re-express to the intended real time per class) and the EMA periods; DBS is ATR-normalized, and ATR shrinks at 15m, so the normalization is re-checked.
- Recompute the `xstock_dbs_backfill` history (~30k rows, from B-PHASE-A2) on 15-min bars.
- **Make the epoch-versioning DECISION explicit IN THIS SCOPE (not discovered mid-build):** either (a) full historical recompute at 15m, OR (b) flag a regime-epoch boundary so downstream learning knows the substrate changed — a part-60m / part-15m corpus is split-brain. **CC recommendation: full recompute** (the 1m archive supports it; cleanest for downstream ML; avoids a mixed-substrate training set). Langston to confirm or override.
- **Verify:** DBS backfill row count reflects a clean 15m recompute (or a documented epoch boundary); no split-brain training corpus; crypto DBS untouched.

### Objective 6 — ORB candle-source + WINDOW + enable [Langston binding condition 4]
- Fix the candle-source defect: ORB is currently fed 60-min bars (`vts-runner.ts:897`) instead of fine-grained bars — point it at the correct (fine) bar granularity so it can see an opening range at all.
- **Re-derive the opening-range WINDOW in 15-min terms** (the "first N bars of session" definition is bar-count-coupled; time-anchor the window itself — not just repoint the candle source).
- Flip the ORB enable flag to true for `xstock_spot` (DB value).
- **Note:** this turns ORB ON and makes it structurally able to run; the full per-strategy ORB re-tune is W3. This objective is plumbing + window + enable, validated for correctness, not edge-optimized here.
- **Verify:** ORB receives fine bars; the opening-range window spans the intended real time at 15m; the enable flag is true in DB; ORB fires in VTS without the bar-source defect.

### Objective 7 — Weekend-resume warmup depth [Kyle 2026-06-03]
- The Sunday-reopen prewarm (B-NEW-36 weekend timers + the xStock OHLC cache prewarm + `xstock_spot_ohlc_1m` retention) must pull enough 15-minute bars at reopen to FULLY populate the longest lookback the system needs before it can trade — regime (Objective 2's time-anchored window), DBS (~12h of history), the MCE periods, and the 24h windows. At 15m the warmup needs MORE bars to cover the same real-time depth.
- Confirm the 1-minute archive retention reaches far enough back to rebuild that warmup depth at reopen; extend retention if it doesn't.
- **Verify:** at a simulated/next Sunday reopen, the longest-lookback windows are fully populated from bar one — no degraded cold-start window where xStocks resume with thin history.

### Objective 8 — Load gate: 4× snapshot cadence vs CPX22 budget [Langston binding condition 3, confirm UPFRONT]
- 15-min bars are ~4× the snapshot cadence of 60-min. Confirm UPFRONT (in Step-2 pre-audit, before build) that this fits within the B79 1.3× load budget / CPX22 capacity.
- **If it does not fit, the answer is vertical-scale or computational redistribution — NEVER asset-class shedding (§5 #15).**
- **Verify:** documented headroom calculation in the pre-audit; post-deploy CPX22 load stays within budget (PM2/host metrics).

### Objective 9 — EXIT GATE: regime-label PARITY REPORT [Langston binding condition 1 — THE #1 gate]
- Produce a side-by-side report diffing the OLD 60-minute regime labels vs the NEW 15-minute regime labels over the same historical window; characterize the distribution shift (per-regime counts WITH raw numbers, per rule #13 rolling windows).
- **Acceptance test = "the shift is understood AND intended."** This is the sub-batch's exit criterion — not "it builds."
- **All per-strategy re-tuning (W2) is HELD until this parity report is signed off by Langston.**
- **Verify:** parity report written, reviewed, and signed off; the shift is explained and intentional, not a silent collapse.

---

## §3 — Asset-class scoping (NON-NEGOTIABLE)

Every change is `xstock_spot`-scoped and DB-resolved per asset class. **Crypto lookbacks, thresholds, DBS, MCE periods, and bars are never read or written by this sub-batch.** No global/wildcard edits to bar-sensitive constants. Crypto bar-frequency is a SEPARATE exploratory study (running in parallel) and a later roadmap re-validation item — not this sub-batch.

---

## §4 — Sequencing

1. **This foundation sub-batch (B.4 first build):** Objectives 1–8 → **Objective 9 parity-report sign-off gate.**
2. Pattern-detection review (Bucket 3 / W4).
3. Per-strategy gates + trade construction (Bucket 4 / W2), then re-enable + re-fit the deferred equity-suitable strategies + the full ORB re-tune (W3).
- Throughout: asset-class-scoped, measured by the B3.1a evidence engine, candidate-settings-confirmed-at-Phase-19. Active trading OFF.

---

## §5 — Langston's 4 binding conditions (carried from W1 §5, embedded above)

1. **Exit gate = regime-label parity report** (Objective 9) — re-tuning held until signed off.
2. **DBS epoch-versioning decision explicit in scope** (Objective 5) — recompute vs epoch boundary; no split-brain ML data. CC recommends full recompute.
3. **4× snapshot cadence vs CPX22 load gate confirmed UPFRONT** (Objective 8) — vertical-scale, never shed a class.
4. **ORB fix = WINDOW re-derivation, not just candle repoint** (Objective 6).

---

## §6 — What this is NOT

- NOT per-strategy re-tuning (W2) — signals run inherited values on the new bar size until then.
- NOT a profitability claim — substrate + semantics only; edge is built later; paper-active proof is Phase 19/25.
- NOT touching crypto (separate study + later roadmap item).
- NOT a flag flip — it is a paired bar-size + regime/indicator/DBS recalibration (W1 §3 established this).

---

## §7 — Open items for Langston Step-1 review

1. Confirm the 9 objectives + the parity-report exit gate as the correct foundation cut (anything that must move earlier/later, or any objective that should be its own sub-batch).
2. Confirm the DBS epoch-versioning recommendation (full recompute) or specify the epoch-boundary alternative (Objective 5).
3. Confirm the load-gate headroom check belongs in Step-2 pre-audit and is a true upfront gate (Objective 8).
4. Confirm time-anchoring is per-class config (not a shared constant rewrite) so crypto cannot be touched (Objective 2).

---

*Scope v1 (Step 1). Decision basis: `B_4_BAR_FREQUENCY_RESULTS_REPORT.md` + `B_4_15MIN_RECALIBRATION_LIST.md` + the working tracker in `MULTI_ASSET_VTS_EXPANSION_PLAN.md`. Active trading OFF. CALIBRATION LENS axiom 6. NO PATCHES — per-class, DB-resolved, structural.*
