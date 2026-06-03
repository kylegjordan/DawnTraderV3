# B.4 — Bar-Frequency FOUNDATION Sub-Batch — SCOPE v2 (Step 1, Langston review absorbed)

> **Langston Step-1 review (2026-06-03): APPROVED to proceed to Step-2.** The 9-objective cut is the right foundation boundary (nothing splits into its own sub-batch); all four W1 binding conditions carried faithfully. Four refinements absorbed into v2: (1) added an IMF VN/DI bar-sensitivity determination (Objective 10) — the recalibration-list Bucket-2 instruction that wasn't in v1's objectives; (2) DBS is recompute-**PLUS**-epoch-stamp-**PLUS**-retain-60m-`_archive`, not recompute-vs-boundary (Objective 5); (3) load gate sizes TWO distinct capacity questions — steady-state 4× cadence AND the one-time off-peak DBS backfill — plus the 1m-retention storage delta (Objective 8); (4) crypto-isolation is now a Step-4 HARD-FAIL gate with three explicit proofs (§3). Plus three build-ordering constraints (§4).

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
- **Epoch-versioning DECISION (Langston Step-1: recompute-PLUS-stamp, NOT recompute-vs-boundary — the either/or was a false binary). Do ALL THREE:** (a) full historical recompute at 15m (kills the split-brain corpus); (b) epoch-stamp the recomputed rows with a substrate/version tag so downstream learning can distinguish native-15m from recomputed-from-1m-archive; (c) retain the existing 60m DBS table read-only as `_archive` so a buggy 15m recompute can be diffed against the old set. NO PATCHES = preserve the audit trail, not destroy-and-replace.
- The recompute is a one-time transient batch job — see Objective 8 for its off-peak scheduling (it must NOT contend with live VTS or count against the steady-state load budget).
- **Verify:** DBS backfill reflects a clean 15m recompute, rows carry the epoch/substrate stamp, the 60m `_archive` table is retained read-only; no split-brain training corpus; crypto DBS untouched.

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

### Objective 8 — Load gate: capacity sized UPFRONT [Langston binding condition 3, with dual-capacity refinement]
- Confirm UPFRONT (in Step-2 pre-audit, before build) with an explicit documented pass/fail. **Size TWO distinct capacity questions (Langston refinement):**
  - **(a) Steady-state 4× snapshot cadence** — 15-min bars run ~4× the 60-min snapshot cadence; check this recurring load against the B79 1.3× budget / CPX22 capacity.
  - **(b) One-time DBS backfill recompute (~30k rows on 15m)** — a transient batch job that must NOT count against the steady-state budget but DOES need a scheduled off-peak window so it doesn't contend with live VTS.
- **Fold in the Objective-7 1m-retention-extension storage delta** — same upfront capacity question (disk/storage headroom for deeper 1m retention + the new 15m snapshot table).
- **HARD GATE: build does not proceed on a fail.** A fail means vertical-scale or computational redistribution — NEVER asset-class shedding (§5 #15).
- **Verify:** documented headroom calc with explicit pass/fail for (a), (b), and the storage delta in the pre-audit; post-deploy CPX22 steady-state load stays within budget (PM2/host metrics); the backfill ran in its off-peak window without VTS contention.

### Objective 9 — EXIT GATE: regime-label PARITY REPORT [Langston binding condition 1 — THE #1 gate]
- Produce a side-by-side report diffing the OLD 60-minute regime labels vs the NEW 15-minute regime labels over the same historical window; characterize the distribution shift (per-regime counts WITH raw numbers, per rule #13 rolling windows).
- **Acceptance test = "the shift is understood AND intended."** This is the sub-batch's exit criterion — not "it builds."
- **All per-strategy re-tuning (W2) is HELD until this parity report is signed off by Langston.**
- **Verify:** parity report written, reviewed, and signed off; the shift is explained and intentional, not a silent collapse.

### Objective 10 — IMF VN/DI bar-sensitivity determination [Langston Step-1 gap — recalibration-list Bucket 2]
- The recalibration list (Bucket 2) explicitly assigns to THIS foundation pre-audit: confirm which IMF pieces are bar-sensitive — specifically the B.2 volatility-normalization (VN) and directional (DI) screens, which are bar-based and currently feed signal selection on 60m-calibrated values.
- **Step-2 pre-audit determines bar-sensitivity, with one of two outcomes:** (a) **recalibrate in this foundation sub-batch** if a VN/DI screen is bar-sensitive enough to mislabel on 15m bars during the foundation window; OR (b) **documented HOLD to W2** with stated rationale (e.g. VTS-only / active-trading-OFF makes the stale screen tolerable until the per-strategy re-tune). Either way it is decided and written, not left to fall through the gap between the recalibration list and the scope.
- **Verify:** Step-2 pre-audit contains the VN/DI bar-sensitivity finding + the recalibrate-now-or-hold-to-W2 decision with rationale; if recalibrated, the new values are xStock-scoped and crypto VN/DI is untouched.

---

## §3 — Asset-class scoping (NON-NEGOTIABLE) + crypto-isolation HARD-FAIL gate

Every change is `xstock_spot`-scoped and DB-resolved per asset class. **Crypto lookbacks, thresholds, DBS, MCE periods, VN/DI screens, and bars are never read or written by this sub-batch.** No global/wildcard edits to bar-sensitive constants. Time-anchoring is per-class DB-resolved config, NOT a shared-literal rewrite. Crypto bar-frequency is a SEPARATE exploratory study (running in parallel) and a later roadmap re-validation item — not this sub-batch.

**Crypto-isolation is a Step-4 HARD-FAIL gate (Langston Step-1).** The code-review diff must prove all three; any one failing BLOCKS push:
1. No shared bar-sensitive literal is touched without per-class branching.
2. Crypto regime lookbacks / thresholds / DBS / MCE periods / VN-DI are bit-identical before vs after.
3. Crypto bar-cadence-unchanged isolation proof appears in the logs.

---

## §4 — Sequencing

1. **This foundation sub-batch (B.4 first build):** Objectives 1–8 + 10 → **Objective 9 parity-report sign-off gate.**
2. Pattern-detection review (Bucket 3 / W4).
3. Per-strategy gates + trade construction (Bucket 4 / W2), then re-enable + re-fit the deferred equity-suitable strategies + the full ORB re-tune (W3).
- Throughout: asset-class-scoped, measured by the B3.1a evidence engine, candidate-settings-confirmed-at-Phase-19. Active trading OFF.

**Build-ordering constraints WITHIN the foundation sub-batch (Langston Step-1 — sequence, not splits):**
- **Obj 2 lands before Obj 3's *measurement*.** The threshold recalibration must be measured against the time-anchored regime read, not the shrunk-lookback artifact — otherwise we recalibrate against the very artifact Obj 2 exists to kill.
- **Obj 9 NEW-side labels are generated on the FULLY recalibrated config (post Obj 2+3+4).** The parity report's "intended" 15m label set is only meaningful after time-anchored lookbacks + recalibrated thresholds + re-derived MCE periods all land — not an intermediate state.
- **Obj 6 ORB enable-flip is LAST within that objective** — only after the candle-source repoint and the window re-derivation are verified. Flipping enable before the window is re-derived feeds ORB garbage even in VTS.

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

## §7 — Step-1 review: RESOLVED (Langston 2026-06-03)

1. **Objective cut + parity exit gate** → APPROVED as the correct foundation boundary; nothing splits out. Added Objective 10 (IMF VN/DI bar-sensitivity) — the one gap. ✅
2. **DBS epoch-versioning** → recompute-PLUS-stamp-PLUS-retain-60m-`_archive` (not recompute-vs-boundary). Objective 5 updated. ✅
3. **Load gate** → confirmed hard upfront Step-2 gate; size BOTH steady-state cadence AND the one-time off-peak backfill + retention storage delta. Objective 8 updated. ✅
4. **Per-class time-anchoring** → confirmed non-negotiable; crypto-isolation is now a Step-4 hard-fail gate with three proofs. §3 updated. ✅
- Plus three within-foundation build-ordering constraints (§4). Langston: "run Step-2 with the IMF sweep + the dual-capacity sizing added… send me the pre-audit when it's ready."

**Next:** proceed to Step-2 pre-audit (deep SIM + System Manual read; code-surface map; the IMF VN/DI sweep; the dual-capacity sizing; the DBS off-peak window).

---

*Scope v2 (Step 1, Langston review absorbed 2026-06-03). Decision basis: `B_4_BAR_FREQUENCY_RESULTS_REPORT.md` + `B_4_15MIN_RECALIBRATION_LIST.md` + the working tracker in `MULTI_ASSET_VTS_EXPANSION_PLAN.md`. Active trading OFF. CALIBRATION LENS axiom 6. NO PATCHES — per-class, DB-resolved, structural.*
