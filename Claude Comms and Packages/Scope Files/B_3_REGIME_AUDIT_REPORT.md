# B.3 — Regime-Correctness Audit Report (Group A)

> **Read-only numbers report.** Built the live-parity recompute replay (`scripts/b-xstock-calib-b3-regime-audit.ts`, Langston Step-4 ACK'd), ran it on staging over the recent window (478 live-universe symbols, 54,897 bars full / 35,275 in the 7-day match window). Methodology: `B_3_PRE_AUDIT.md` (60-bar parity, recomputed DBS via production `computeDirectionalBias`, near-miss attribution, pre-registered match rule). **Surprising, decision-relevant result — surfaced to Kyle.** Active trading OFF.

---

## §0 — Headline (plain language)

When we re-run the live sorting logic faithfully over the same data, it says **range-bound should be about 6% of the time** — but the live system records it at **~0.1%**. That gap survives every fairness fix we made. And it is **not** the trend-strength cutoff we suspected: only ~3.6% of pairs miss range-bound on trend-strength alone; the thing actually keeping pairs out of range-bound is the **directional-bias** number. So the regime issue is more subtle than "a mis-set threshold" — it's a difference between what the live system computes for the directional-bias number in real time and what a faithful replay computes on the completed price bars.

---

## §1 — The match verdict: NO MATCH (inverted from expectation)

**Recompute (7-day match window, pair-cycle weighting, 35,275 bars) vs live 7d:**

| Regime | Recompute % | Live row-weighted % | Live PAIR-CYCLE % | Recompute vs pair-cycle Δ |
|---|---|---|---|---|
| TREND_FRIENDLY_STABLE | 22.63 | 37.16 | 26.91 | −4.3 |
| STRUCTURAL_TRANSITION | 34.12 | 35.25 | 37.51 | −3.4 |
| HIGH_VOLATILITY_UNSTABLE | 21.03 | 20.65 | 25.02 | −4.0 |
| IMPULSE_EXPANSION | 15.81 | 6.92 | 10.47 | +5.3 |
| **RANGE_BOUND_STABLE** | **6.41** | **0.022** | **0.099** | **+6.3** |

Pre-registered rule (Langston LOCK 2: every regime within ±2pp AND RANGE_BOUND <0.5% both) → **NO MATCH**. But the residual is the OPPOSITE of the original worry: both replays (B.1's 8.8% and this faithful 6.4%) say range-bound *should* be several percent; only the live archive says ~0%.

## §2 — Weighting confound (resolved; Langston Flag-class)

The original "live 0.02%" was a **raw row count** over `signal_eval_archive`, which holds **one row per strategy×pair×cycle**. Avg strategy-rows per pair-cycle by regime: **TFS 6.27, ST 4.26, HVU 3.75, IE 3.00, RBS 1.00**. So row-weighting inflated TFS (most strategies) and is neutral for RBS (1 strategy). Re-weighting to pair-cycle (distinct symbol+minute) moves live TFS 37→27, ST 35→37.5, HVU 20.7→25, IE 6.9→10.5 — bringing 4 of 5 regimes within ~5pp of the recompute. **This resolves the TFS/ST/HVU/IE discrepancies.** RANGE_BOUND barely moves (0.022→0.099) — its gap is NOT a weighting artifact.

## §3 — G1 primary lane: the trend-strength (DX) hypothesis is REFUTED as the main cause

RANGE_BOUND requires `vol<0.006 AND dx<35 AND |dbs|<0.10` (all three). Near-miss decomposition of non-RBS bars (full window):
- **miss ONLY on dx** (pass vol+dbs, fail dx<35): **3.90%** — small. dx among them clusters 41–60 (p50 50).
- **miss ONLY on vol**: 5.11%.
- **miss ONLY on dbs** (pass vol+dx, fail |dbs|<0.10): **23.20%** — by far the dominant near-miss.
- Overall: **54% of bars already have dx<35.** So raw DX is NOT hot/spiky enough to be the RANGE_BOUND killer — the recompute produces 6.4% RBS *with the current dx<35 in place*. **The decisive gate is the directional-bias gate, not dx.** This weakens the crypto-fence-escalation candidate (raw-DX smoothing) — DX is behaving reasonably.

## §4 — Per-branch input distributions (full window, quartiles)

RANGE_BOUND bars (n=3,743): vol p50 0.0040 (all <0.006 ✓), dx p50 16.6 (p95 32.9, all <35 ✓), **|dbs| p50 0.050, p95 0.096** (right at the 0.10 gate), mom p50 ~0. So recompute RBS bars are **borderline at the |dbs| boundary** — a small upward shift in the effective directional-bias collapses them. STRUCTURAL_TRANSITION (n=18,306): vol p50 0.005, dx p50 20, |dbs| p50 0.21 — the dead-zone (moderate everything). TREND_FRIENDLY: |dbs| p50 0.37, mom p50 +0.022 (directional). IMPULSE: |dbs| p50 0.62 (very directional). HVU: mom all negative (declines). Sentinel-DBS fraction in recompute: **0.000%** (every bar had a clean 60-bar prefix — the G2 FLOOR caveat).

## §5 — The open residual (what's left to pin)

The recompute (faithful completed-bar inputs) and the live pipeline diverge ONLY meaningfully on RANGE_BOUND, and the recompute RBS bars sit right at the |dbs|<0.10 boundary. **Leading hypothesis:** the live pipeline's effective directional-bias is marginally *more directional* than the completed-bar recompute — pushing those borderline calm bars just over |dbs|=0.10 into ST/TFS. Candidate mechanisms (to test next):
1. **Real-time / intra-bar classification.** Live classifies every ~30s using the current (partially-formed) bar + live price; the recompute uses the completed bar's close. Live price movement within the bar adds directionality → higher live |dbs|. (Most likely; would mean live correctly reflects that the bars aren't quite calm in real time → "accept, genuinely borderline-rare.")
2. **OHLC window/ATR difference** in the live DBS compute vs the 60-bar snapshot recompute (e.g. cache returns >60 bars; ATR source).
3. **Live OHLC overlay** (Langston Flag C): live merges a real-time overlay over the snapshot; values differ at the tail.

## §6 — Verdict status + next step

- **A4 per-regime verdict: DEFERRED for RANGE_BOUND** pending the §5 residual. For TFS/ST/HVU/IE the recompute and pair-cycle-live now broadly agree (within ~5pp) — no evidence of a misconfigured classifier funneling everything into one regime (Kyle's "funneling" worry is NOT supported; the spread is reasonable once weighting is fixed).
- **Kyle's question, current answer:** it is NOT a mis-set trend-strength cutoff (§3 refutes it), and it is NOT gross classifier funneling (§2 resolves it). The RANGE_BOUND near-absence is either (a) genuinely-rare borderline conditions that the live real-time view correctly rejects (→ accept), or (b) a live-vs-completed-bar directional-bias divergence (→ understand, possibly a real-time-vs-replay artifact, not necessarily a bug). §5 distinguishes these.
- **Next:** pin the DBS divergence — compare live directional-bias values against the recompute for the same bars (and test the intra-bar hypothesis). Then finalize A4 and the B3.0 decision. Loop Langston on the surprising result.
- **No threshold/gate/config changed.** Read-only. The recompute strengthens confidence that the classifier MATH + thresholds are broadly sound; the residual is about live-pipeline input fidelity, not the cutoffs.

---

*Raw per-bar output: `scripts/b-xstock-calib-b3-regime-audit-output.csv` on staging (54,897 rows). Run captured 2026-06-02. Active trading OFF.*
