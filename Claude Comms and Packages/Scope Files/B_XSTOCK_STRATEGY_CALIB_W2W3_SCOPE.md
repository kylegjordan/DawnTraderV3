# xStock Per-Strategy Calibration — W2/W3 Execution SCOPE (v1, for Langston Step-1)

> **Created 2026-06-05 (Kyle GO 2026-06-05).** This is the EXECUTION scope for **W2 + W3** of `B_XSTOCK_STRATEGY_FIT_SCOPE.md` (v2) — i.e. **Step 3 of `XSTOCK_CALIB_RESUME_SCOPE.md`**: the per-strategy 15-minute trade-construction re-fit, plus re-enabling ORB and a small equity-friendly subset. It is the next real work on the **original xStock-calibration spine** (Foundation → Pattern-review → **Strategy calibration**). Foundation (W1, the 15-minute switch) is CLOSED/LIVE. Pattern (W4) is RESOLVED by the HCE study (candlestick shapes are coin-flips → no shape re-tune; pattern path STAYS ON as a negative-control). **Active trading is OFF** → this produces evidence-grounded **CANDIDATE** settings on a forward-return proxy; final profitability proof needs paper-active outcomes (Phase 19 → Phase 25). **Crypto is never read or written. No shorts. CALIBRATION LENS throughout.**
>
> **🚨 SCAFFOLDING/HONESTY (§9.1): THIS BATCH DOES NOT MAKE xSTOCKS PROFITABLY TRADEABLE. It re-fits each strategy's trade-construction settings to how tokenized stocks actually move on 15-minute bars and produces CANDIDATE settings demonstrably better on forward-return evidence; the final win/loss verdict comes from paper-active trading (Phase 19) and evidence calibration (Phase 25).**

---

## §0 — Plain-language headline

The strategies lose on xStocks not because the trading ideas are wrong but because every setting that shapes a trade — the entry trigger, where the stop and target go, how long it holds, and the indicator look-back lengths — is still the crypto value it inherited, never fitted to how tokenized stocks move. The foundation work already switched xStocks to 15-minute bars; this effort now fits each live strategy's own trade-shaping settings to that bar size, brings back the opening-range strategy (which the 15-minute switch makes runnable again) plus a small set of stock-suited strategies, and fixes a real defect the bar switch introduced (hold-time and look-back windows that silently became a quarter of their intended length). Everything stays in simulation; crypto is untouched; the final proof waits for active trading.

---

## §1 — Ground truth (DB + code, verified this session 2026-06-05)

**Enablement (live `module_constants strategy_gates.xstock_spot.*.enabled`):**
- **9 ENABLED:** `breakout`, `inside_bar_reversal`, `mean_reversion`, `morning_star`, `pivot_shift`, `range_trade`, `sma_trend_ride`, `vwap_bounce`, `vwap_pullback`.
- **10 DISABLED:** `abcd_long`, `adaptive_flow`, `defensive_hedge`, `dhma`, `liquidity_trap` (bearish — stays off, long-only), `orb` (parked on bar-size; now un-blockable), `reverse_impulse`, `strong_bull_trend`, `support_bounce`, `volatility_edge`.

**xStock-specific trade-construction today = almost none.** The ONLY `xstock_spot`-scoped strategy rows that exist are:
- W0's `volume_confirmation_enabled=0` on 6 strategies (`breakout`, `inside_bar_reversal`, `morning_star`, `pivot_shift`, `vwap_bounce`, `vwap_pullback`) — **confirms W0 (volume-confirmation removal) landed.**
- ORB's 7 native params (`open_range_minutes`, `breakout_buffer_atr_mult`, `active_window_hours`, `confidence_base`, `range_atr_clamp_max`, `target_range_multiple`, `volume_multiple_min`).
- **Everything else** (stop/target ATR mults, entry triggers, indicator periods, hold horizon) for all 9 enabled non-ORB strategies resolves from the crypto wildcard (`*`). **This is the W2 gap, confirmed in data.**

**Architecture (Step-1.a read):**
- **Single shared parameter resolver.** Both the VTS/passive path and the active path call `getCachedNumbersForModule('strategy.<name>', _SE_KEY(<name>, assetClass))` from `server/services/module-constants-service.ts` (resolver: most-specific-wins on exchange/asset_class/strategy/regime; 60 s cache). Enablement gate `isStrategyEnabledForAssetClass()` (`server/config/canonical-regime-strategy-map.ts:955-971`) is likewise shared. **→ the Step-4 "one shared component both paths call" rule is already structurally satisfied for parameter resolution** — seeding `xstock_spot` rows is the only change needed; no code fork.
- **Calibration engine** `scripts/b-xstock-calib-b31a-gate-audit-2.ts` is fully re-runnable (reads `xstock_spot_ohlc_1m` archive; forward EXCESS return de-meaned vs universe, entry at bar+1, L2 hit-ordering, AUC/Mann-Whitney, rolling-day consistency; `WINDOW_DAYS`, `HORIZONS_MIN=[60,240]`, `MIN_BUCKET_N=30`). **But today it AUDITS gates only** (passed-vs-rejected). W2 needs a **parameter-sweep extension** (vary a trade-construction param, replay detection, score each value, pick on a train/test split).
- **ORB** (`server/strategies/orb.ts`) resolves all 7 params per-class and is DB-gated (`strategy_gates...orb.enabled=false`). At 60-minute bars its 30-minute opening range had 0–1 complete bars → unusable. At 15-minute bars the 30-minute open range = 2 complete bars by window end → **runnable**. Re-enable = flip the DB gate + verify it computes a valid range on 15-minute bars. (Open design question in §8: ORB's window is anchored to the US equity open (14:30 UTC); xStocks trade 24/5 — confirm the US-open opening-range concept is still the intended trigger for a 24-hour instrument.)

**A real defect the bar switch introduced (correctness, not optimization).** Inherited crypto params are **bar-count-denominated**: `max_holding_period_bars_default=24`, `volume_avg_lookback=20`, etc. When the foundation switched 60-min → 15-min bars, each silently became 1/4 of its intended real-time duration (24 bars = 6 hours now, not 24). Worse, the architectural read flags that the hold enforcer (`server/services/paper-execution-engine.ts:1068-1076`) reads the metadata value and treats it as **hours** (`maxHours * 3.6e6`), while the strategy sets it from a param named `..._bars_default` — a **units mismatch to verify in code** before W2. This is Langston gap-3 (clock-anchored holds) made concrete and is a NO-PATCHES correctness fix W2 owns.

---

## §2 — Workstreams (this batch)

**W2.0 — Extend the calibration engine for parameter sweeps (enabler, ships first).** Add a sweep harness around the existing b31a engine: for a given strategy + a candidate range of one trade-construction param, replay detection, collect passed/rejected forward-excess-return buckets per value, emit AUC + rolling-day consistency per value, and select on a **train/test split + walk-forward** (reject values that don't generalize; prefer a broad plateau over the razor's-edge peak). Read-only against the archive; no production code touched. Own Langston review.

**W2.1 — Clock-time hold + look-back correctness fix (FIRST production change).** Verify the bar-count↔clock-time semantics end-to-end (strategy → metadata → enforcer). Convert every bar-count-denominated trade-construction param (hold horizon, volume/indicator look-backs) to a **clock-anchored definition** converted to the 15-minute bar count, so the intended real-world duration is preserved and survives any future bar-size change. Per-class, DB-resolved, both paths. **This is a defect fix and is independent of the optimization sweeps — it ships and settles before W2.2 tuning, because it changes the population the sweeps measure.**

**W2.2 — Per-strategy trade-construction re-fit (the core; CANDIDATE settings).** For each of the 9 enabled strategies, at 15-minute bars, sweep its internal signal params — entry trigger, stop/target geometry (ATR / R-multiples), indicator periods + thresholds — with the W2.0 harness; keep values with a real, out-of-sample forward-return edge; seed `xstock_spot` rows in `module_constants`. Batched by strategy group (own Langston Step-4 per group). Explicit **overnight-gap + open/close-bar handling** (Langston gap-4 — stocks gap over the weekend close; crypto never did). **Output is CANDIDATE, not final** — final adoption is gated on Phase-19 paper-active outcomes.

**W3 — Re-enable + re-fit a small equity-friendly subset (ORB first).** Re-enable **ORB first** (now un-blocked by 15-minute bars), prove the fitting method earns a real edge on it, then widen to a small obviously-stock-suited subset via the W2.2 method — NOT all 10 disabled at once. **`liquidity_trap` stays OFF** (bearish; long-only stands).

---

## §3 — Method & overfitting discipline (binding)

Reuse the b31a engine (forward excess return, bar+1 entry, L2 hit-ordering, AUC, rolling-day consistency). For TUNING (vs auditing): **train/test split + walk-forward**; **minimum-sample gates** (no setting adopted on thin N; rolling-day consistency per rule #13); **prefer robustness over peak** (broad plateau, not fragile optimum); **accumulate more days** as the live archive grows; **realized-exit cross-check** against `exit_decision_archive` where available.

---

## §4 — Asset-class scoping (NON-NEGOTIABLE)

Every change is `xstock_spot`-scoped, DB-resolved per asset class. **Crypto values are never read or written.** No global/wildcard edits. The crypto trade-construction re-validation is a SEPARATE, later roadmap item reusing this methodology.

---

## §5 — Close boundary (pre-19 vs Phase-25) — per Kyle 2026-06-05

- **Pre-19 closeable (this batch):** W2.0 engine extension; W2.1 clock-time/look-back correctness fix; W2.2 CANDIDATE seeds on existing VTS/forward-return evidence; W3 ORB re-enable + small subset proven on VTS evidence.
- **Phase 25 (needs paper-active outcomes):** FINAL adoption of the candidate settings (confirmed by real win/loss); the buy-the-dip / distance-below-high entry idea forward-validation (HCE Step 3b — pre-register the "recent high" definition + band + threshold first); crypto edge-scoring fix (B3.2/#181).
- **Selectivity / EV-gate (HCE Step 3a)** is the ADMISSION layer (`sqe_config`, 6 `xstock_spot` rows already), a RELATED lever this batch is INFORMED by but does not re-fit here — its real calibration needs outcomes (Phase 25). Buy-the-dip and selectivity are INPUTS to this work, not inserted steps.

---

## §6 — HCE inputs (informing, not expanding, the spine)

The HCE study contributes two inputs to the per-strategy work and **adds no steps**: (1) **selectivity is the profit lever** — tune toward fewer, higher-quality trades (the EV-gate, Phase 25), not toward adding regime/context filters the study showed don't separate survivors; (2) **buy-the-dip** (entry 2–5% below recent high beat entry-at-high on xStock) is one construction idea to **pre-register and forward-validate in Phase 25**. The pattern path **stays ON with no shape re-tune** (negative-control). AMR body / standalone VTS / alt-data / delta-neutral / cross-sectional are **separate roadmap lanes — NOT part of this spine.**

---

## §7 — Governance gaps surfaced (record on close) + soak/#201 note

Architectural read flagged three documentation gaps to fix in governance on close: (1) SYSTEM_MANUAL has **no entry for where/how each strategy's hold-time param is set and converted** to clock-time; (2) no unified **trade-construction spec** (how every strategy populates the entry/stop/target/confidence/hold tuple); (3) SIM has **no per-asset-class trade-construction calibration matrix** (which params are class-variant vs class-invariant). This batch is the first per-class trade-construction re-fit — it should leave that matrix behind.

**SOAK + #201 — surfaced for reconciliation (NOT closing it here).** The live regime archive (`pair_scan_archive`, xstock_spot) shows RANGE_BOUND_STABLE at ~5–7% across June 1–5 (15-min era) and ~8–15% in late May (60-min era) — i.e. **healthy in both eras, never ≈0%.** This contradicts the recorded #201 premise ("RANGE_BOUND ≈ 0% live, forming-bar artifact"). A focused reconciliation is in flight (forming-vs-settled surface, and where the original ≈0% number came from). If confirmed, the soak's condition 1 closes on **all 5 buckets**, not 4, and #201 is re-scoped. **Routed to Langston for his independent read (he owns the soak Step-8 close).**

---

## §8 — Open questions for Langston (Step-1)

1. **ORB trigger for a 24/5 instrument:** ORB's opening range is anchored to the US equity open (14:30 UTC). xStocks trade 24 hours Sun–Fri. Is the US-open opening-range still the intended trigger, or does ORB need a re-think for a continuously-trading instrument before re-enable? (W3 design.)
2. **Crypto-wildcard provenance:** are the inherited `*` trade-construction rows genuinely crypto-TUNED, or untested placeholders? Changes whether W2.2 is "parallel xStock tuning of known-good values" or "first real fit of never-tuned defaults."
3. **Batch label + chunking:** confirm label (candidate **B.5**) and the W2.2 strategy-group batching (one Langston Step-4/8 per group).
4. **W2.1 sequencing:** confirm the clock-time correctness fix ships and settles BEFORE the W2.2 sweeps (it changes the measured population — same logic as W0→W1).
5. **#201 reconciliation:** your independent read on the RANGE_BOUND archive finding + soak-close-on-5-vs-4.

---

*Scope v1, 2026-06-05. Parent: `B_XSTOCK_STRATEGY_FIT_SCOPE.md` (W2/W3) = `XSTOCK_CALIB_RESUME_SCOPE.md` Step 3. Foundation: `B_3_1_GATE_CORRECTNESS_REPORT.md`. Engine: `scripts/b-xstock-calib-b31a-gate-audit-2.ts`. Active trading OFF — forward-return-proxy CANDIDATE evidence; paper-active proof is Phase 19/25. Crypto untouched. CALIBRATION LENS.*
