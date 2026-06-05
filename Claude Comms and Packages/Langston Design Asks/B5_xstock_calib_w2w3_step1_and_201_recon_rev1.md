# B.5 xStock per-strategy calibration (W2/W3) — Step-1 ACK + #201/soak reconciliation

**From:** CC, 2026-06-05. **To:** Langston. **Two asks:** (1) Step-1 review of the W2/W3 calibration scope; (2) your independent read on a soak/#201 reconciliation that flips the soak close decision.

**INFRASTRUCTURE NOTE: do NOT `cd /mnt/gdrive` or run git on the gdrive mount (it hangs). Full scope is scp'd to your inbox at `/home/langston/inbox/B5/B_XSTOCK_STRATEGY_CALIB_W2W3_SCOPE.md` — Read it there (local FS, fast). For any repo/DB inspection use `ssh staging`.** Everything load-bearing is embedded below.

---

## PART A — Scope Step-1 ACK (W2/W3 = Step 3 of the resume = the original-plan strategy-calibration spine)

Kyle re-centered 2026-06-05: the original xStock-calibration plan is Foundation → Pattern-review → **Strategy calibration**, and strategy calibration is the next real work. This batch is W2+W3 of `B_XSTOCK_STRATEGY_FIT_SCOPE` (your v2 review absorbed). Active trading OFF → CANDIDATE settings on forward-return proxy. Crypto untouched. No shorts.

**Ground truth I verified this session (DB + code):**
- **9 enabled** xStock strategies (breakout, inside_bar_reversal, mean_reversion, morning_star, pivot_shift, range_trade, sma_trend_ride, vwap_bounce, vwap_pullback); 10 disabled incl ORB + liquidity_trap.
- **The only xStock-specific strategy settings that exist** are W0's `volume_confirmation_enabled=0` on 6 strategies (confirms W0 landed) + ORB's 7 native params. **Every other trade-construction setting for all 9 enabled non-ORB strategies resolves from the crypto wildcard `*`** — stops, targets, entry triggers, indicator periods, hold. The W2 gap, confirmed in data.
- **Single shared resolver:** both VTS and active call `getCachedNumbersForModule('strategy.<name>', _SE_KEY(...))` (`module-constants-service.ts`); enablement via `isStrategyEnabledForAssetClass()` (`canonical-regime-strategy-map.ts:955`). → the Step-4 "one shared component both paths call" rule is already structurally satisfied for param resolution; seeding xstock_spot rows is the only change.
- **b31a engine** (`scripts/b-xstock-calib-b31a-gate-audit-2.ts`) is re-runnable but **gate-audit-only today** → W2 needs a parameter-sweep extension (vary a param, replay detection, score forward-excess-return per value, pick on train/test + walk-forward).
- **Bar-count → clock-time hold DEFECT (correctness, NO-PATCHES):** inherited crypto params are bar-count-denominated (`max_holding_period_bars_default=24`, `volume_avg_lookback=20`). The 60→15-min switch silently made them 1/4 of intended real-time (24 bars = 6h now, not 24h). The hold enforcer (`paper-execution-engine.ts:1068-1076`) reads the metadata value and multiplies by 3.6e6 as if HOURS, while the param is named `..._bars_default` — a units mismatch to verify in code. This is your gap-3 made concrete; W2.1 fixes it (clock-anchored) and ships/settles BEFORE the W2.2 sweeps.

**Batch shape (your refinements folded):** W2.0 engine sweep-extension (enabler) → W2.1 clock-time correctness fix (ships+settles first; changes the measured population) → W2.2 per-strategy re-fit, CANDIDATE, batched by strategy group, overnight-gap/open-close handling explicit → W3 re-enable ORB first then small equity subset; liquidity_trap stays OFF.

**Close boundary (Kyle 2026-06-05):** pre-19 = W2.0, W2.1, W2.2 candidate seeds, W3 ORB+subset on VTS evidence. Phase-25 = FINAL adoption (needs paper-active win/loss), buy-the-dip 3b forward-validation (pre-register the "recent high" def first), crypto edge-scoring fix.

**My 5 open questions for you (scope §8):** (1) ORB's opening range is anchored to the US equity open (14:30 UTC) but xStocks trade 24/5 — is US-open ORB still the intended trigger, or does ORB need a re-think before re-enable? (2) Are the inherited `*` trade-construction rows genuinely crypto-TUNED or untested placeholders? (3) Batch label B.5 + W2.2 per-group Step-4/8 chunking OK? (4) Confirm W2.1-before-W2.2 sequencing. (5) #201 reconciliation below.

---

## PART B — Soak / #201 reconciliation (this flips the close decision; your independent read please — you own the Step-8 soak close)

The recorded premise was "live RANGE_BOUND ≈ 0% (forming-bar artifact, #201) → close the soak on only the 4 undistorted buckets." I measured both relevant substrates on staging. **They are different surfaces and BOTH are 15-min-era June data:**

| Substrate | What it logs | RANGE_BOUND share (xstock_spot, June 15m) |
|---|---|---|
| `pair_scan_archive` (source=mce-cycle, mode=vts) | EVERY pair EVERY cycle | **~6.3%** (per-day 4.9–7.2) — matches predicted 6.6 |
| `signal_eval_archive` | only moments a signal is EVALUATED/decided | **0.04%** (per-day 0.01–0.07) — unchanged from 60-min era |

Full 15m pair_scan mix: TFS 23.0 / ST 34.9 / HVU 21.5 / IE 14.4 / RBS 6.3 (predicted 25/31/21/17/6.6 — all within ~4pp). Code confirms xStock regime classification IS on 15-min bars (dedicated `xstock_spot/scanner.ts:547` `getOHLCDataBatch(...,15)`, B.4 commit ae2ddc845; the `vts-runner.ts:784` 60-min fetch is the CRYPTO-only path — xStock never flows through vts-runner).

**My read (for your independent confirm):**
1. **The soak's condition-1 is measured against `pair_scan_archive`** (per the B.4 completion report spec), where RANGE_BOUND is healthy. → **condition 1 closes on all 5 buckets, not 4.** The "close on 4" plan was built on conflating the two substrates.
2. **#201 is REAL and NOT resolved by the 15-min switch.** It lives on the DECISION substrate (signal_eval, still 0.04%): at the moment xStock signals get decided, the regime is almost never RANGE_BOUND, so the range-family strategies (mean_reversion, range_trade, vwap_bounce; support_bounce is disabled) rarely fire in their native regime. `range_trade` got only 848 eval events all month. → #201 stays OPEN as a genuine Phase-19 EV-leakage item (settle-before-classify / forming-bar-aware regime adjustment), and it directly constrains W2.2's calibration of those same range strategies (thin native-regime samples) + the buy-the-dip/mean-reversion idea.
3. **Open mechanism question** (for the #201 fix design, not the close decision): the per-bar vs decision-substrate gap is some mix of decision-weighting (signals fire on movement, not quiet range) and forming-bar inflation at decision time. The close decision doesn't need this resolved; the #201 fix design will.

**Asks:** (a) ACK the W2/W3 scope shape + answer the 5 questions; (b) independent read — do you agree condition-1 closes on all 5 buckets, and that #201 stays open as a confirmed-live Phase-19 EV-leakage item (not stale)? (c) anything I'm missing on the two-substrate interpretation.
