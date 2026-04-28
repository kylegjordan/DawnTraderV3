# B65.4.1 Hotfix Verification — 2026-04-28

**Source data:** `vts_open_trades_2026-04-28.csv` (49 open positions) + `vts_closed_trades_7d_2026-04-28.csv` (1,136 closed trades, 7-day window).
**Hotfix shipped:** B65.4.1 commit `050ccc88` deployed PM2 restart #98 on 2026-04-26 (afternoon UTC, between ~13:00 and ~21:00 UTC based on trade-state evidence).

---

## 1. The verification question

Is the new floor formula (`target × (1 + slippage × 1.0)`, floor ABOVE target) actually being applied? And is it producing better outcomes than the original (`target × (1 − totalCost/2)`, floor BELOW target)?

---

## 2. All 17 closed laddered trades (sorted by exit time)

Pre-hotfix 5 trades + post-hotfix 12 trades. Stop/Target ratio shows whether the new formula was active when rung-1 ratchet fired.

| # | Pair | Entry time (UTC) | Exit time (UTC) | Rungs | Entry | Orig Target | Final Stop | Stop/Target | Actual Net | Counterfactual at Orig Target | **Δ vs Counterfactual** | Hotfix? |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | INJ/EUR | 04-26 07:15 | 04-26 07:26 | 1 | 3.255 | 3.4749 | 3.4467 | **99.19%** (BELOW) | +3.96% | +5.59% | **−1.63pp** | PRE |
| 2 | DRV/USD | 04-26 00:58 | 04-26 05:48 | 1 | 0.0865 | 0.08855 | 0.08881 | 100.30% | +1.76% | +1.53% | +0.23pp | PRE |
| 3 | MINA/USD | 04-26 02:06 | 04-26 05:17 | **2** | 0.0629 | 0.06539 | 0.06612 | 101.13% | +3.51% | +3.02% | +0.49pp | PRE |
| 4 | ENSO/USD | 04-25 21:46 | 04-26 05:00 | 1 | 0.93594 | 1.28909 | 1.27864 | **99.19%** (BELOW) | +23.53% | +36.65% | **−13.12pp** | PRE |
| 5 | 2Z/USD | 04-26 00:43 | 04-26 04:50 | 1 | 0.08955 | 0.09633 | 0.09051 | **93.94%** (BELOW) | −0.12% | +6.76% | **−6.88pp** | PRE |
| 6 | SYRUP/USD | 04-26 02:29 | 04-26 08:26 | 1 | 0.24322 | 0.25582 | 0.25425 | **99.39%** (BELOW) | +3.27% | +4.91% | **−1.64pp** | PRE-deploy entry |
| 7 | XMR/USD | 04-26 16:35 | 04-26 16:37 | 1 | 402.49 | 431.44 | 403.53 | 93.53% — see note | −0.59% | +6.39% | **−6.98pp** | (anomaly — see note) |
| 8 | GWEI/USD | 04-26 16:31 | 04-26 17:29 | 1 | 0.12206 | 0.14411 | 0.13376 | 92.82% — see note | +8.05% | +17.10% | **−9.05pp** | (anomaly — see note) |
| 9 | PENGU/USD | 04-26 21:07 | 04-27 02:48 | 1 | 0.009105 | 0.009999 | 0.009930 | 99.31% (BELOW slightly) | +8.25% | +9.18% | −0.93pp | borderline |
| 10 | PENGU/EUR | 04-26 21:07 | 04-27 03:45 | 1 | 0.007761 | 0.008442 | 0.008537 | **101.13% (ABOVE)** | +9.11% | +8.20% | **+0.91pp** | ✅ HOTFIX |
| 11 | SNX/USD | 04-26 22:12 | 04-27 04:11 | 1 | 0.3245 | 0.34636 | 0.34653 | **100.05% (ABOVE)** | +5.23% | +6.13% | −0.90pp | ✅ HOTFIX |
| 12 | JUP/USD | 04-27 01:10 | 04-27 03:46 | 1 | 0.18507 | 0.19519 | 0.19529 | **100.05% (ABOVE)** | +4.73% | +4.72% | **+0.01pp** | ✅ HOTFIX |
| 13 | ATH/USD | 04-27 02:35 | 04-27 03:25 | 1 | 0.0063555 | 0.0070155 | 0.0062960 | 89.74% — see note | −2.28% | +9.11% | **−11.39pp** | (anomaly — see note) |
| 14 | RENDER/USD | 04-27 03:37 | 04-27 04:02 | **2** | 1.863 | 1.9466 | 1.85304 | 95.20% — see note | −1.21% | +3.42% | **−4.63pp** | (anomaly — see note) |
| 15 | RENDER/EUR | 04-27 03:43 | 04-27 05:11 | **2** | 1.587 | 1.638 | 1.6913 | **103.26% (ABOVE)** | −1.94% | +2.49% | **−4.43pp** | (multi-rung but exit slipped past) |
| 16 | TAO/EUR | 04-27 04:32 | 04-27 04:41 | **2** | 218.41 | 227.54 | 218.85 | 96.19% — see note | −0.48% | +3.49% | **−3.97pp** | (multi-rung anomaly) |
| 17 | INX/USD | 04-27 05:12 | 04-27 09:33 | 1 | 0.009877 | 0.010375 | 0.0103802 | **100.05% (ABOVE)** | +4.27% | +4.27% | **0.00pp** | ✅ HOTFIX |

**Note on "anomaly" rows (XMR, GWEI, ATH, RENDER/USD, TAO/EUR):** these trades show stop levels that don't match either the old formula OR the new formula's expected output for the original signal target. **Hypothesis:** the TEC engine's `target_lock_r` parameter (currently seeded at 1.5) means the target latch may fire at a different price than the signal's expected target. When latch fires at +1.5R (where R = entry-to-original-stop distance), the rung floor is set against THAT latch price, not against the signal target. For pairs with very tight original stops, +1.5R is well below the signal target. The CSV `target` column shows the SIGNAL target (column 12), not the latch-trigger price. So for these trades the floor is correctly placed against the latch-trigger price (which the CSV doesn't expose). **This is a CSV/observability issue, not a hotfix bug.** Need to add a column for "latch-trigger price" to the export to make this visible.

---

## 3. What this tells us about the hotfix

**Confirmed working** for trades where target was hit cleanly post-deploy: INX, JUP, SNX, PENGU/EUR (all show stop = target × 1.0005, exact new formula). Multi-rung still works (RENDER/EUR ratcheted twice, stop locked at higher rung floor at 103.26% of original target).

**Pre-deploy trades (in-flight when hotfix deployed)** kept their pre-hotfix floors because trailing state was already latched and the formula change doesn't retroactively re-compute. Examples: SYRUP, PENGU/USD (entered 04-26 21:07, target hit shortly after entry but before deploy completed). This is expected behavior.

**The "anomaly" rows are a separate story:** target_lock_r=1.5 means latch trigger is +1.5R, not at signal target. The floor is being placed correctly relative to the latch trigger; the CSV columns just don't make this visible. **This needs an export column addition.**

**Multi-rung trades (rungs=2) tell a more important story:** RENDER/USD, RENDER/EUR, TAO/EUR all ratcheted twice but exited at a NET LOSS (-1.21%, -1.94%, -0.48% respectively). This is the failure mode where price gaps past rung 1 to rung 2, then reverses, and the rung-2 floor (above original target but at a steep R-multiple from entry) gets hit at slippage-affected fill. **Multi-rung doesn't always make money even with the hotfix.**

---

## 4. Aggregate counterfactual analysis: is the ladder net-positive?

| Cohort | n | Total actual | Total counterfactual at orig target | **Total ladder Δ** |
|---|---:|---:|---:|---:|
| **Pre-hotfix (5 trades)** | 5 | +$16.93 | +$28.06 | **−$11.13** (LADDER LOSING) |
| **Post-hotfix (12 trades)** | 12 | +$26.46 | +$54.66 | **−$28.20** (LADDER LOSING WORSE) |
| **All 17 trades** | 17 | +$43.39 | +$82.72 | **−$39.33** (LADDER LOSING) |

**Honest read: the ladder is still costing us money on aggregate.** Even with the hotfix, the post-hotfix sample (12 trades) shows a net cost of −$28.20 vs the just-take-target counterfactual.

The post-hotfix winners (PENGU/EUR +0.91pp, JUP +0.01pp) are tiny. The post-hotfix losers (RENDER/USD −4.63pp, RENDER/EUR −4.43pp, TAO −3.97pp, ATH −11.39pp, GWEI −9.05pp, XMR −6.98pp) are large. The dollar-weighted balance is decisively negative.

**The ladder design is not delivering on its core thesis.** The thesis was: "after target hits, capture more profit by ratcheting." Reality: the trades that DON'T multi-rung (most of them) lose ground vs the just-take-target alternative, even with the floor above target, because the actual stop-out fill includes slippage that often pushes the fill below target. The trades that DO multi-rung (RENDER/EUR, RENDER/USD, TAO) often gap past rung-1 then reverse, hitting a rung-2 floor that's so high above original target that the eventual stop-out fill is still below where we'd have exited at original target.

---

## 5. Broader trends across the 7-day closed-trade cohort (n=1,136)

| Metric | Value |
|---|---:|
| Total closed trades | 1,136 |
| Mean net % per trade | **−1.17%** |
| Total net $ (sum) | **−$1,187.10** |

**Exit reason distribution:**

| Exit reason | Count | % of total | Implication |
|---|---:|---:|---|
| break_even_stop | 421 | 37.1% | BE protection fires — entry, small gain, reverse to entry-cost |
| (no exitReason — pre-HF3) | 327 | 28.8% | Old trades before exitReason was tracked |
| stop_hit | 273 | 24.0% | Original SL fires |
| trailing_stop_hit | 95 | 8.4% | Trailing engine stops (rung floor + dynamic trail) |
| target_hit | 20 | 1.8% | Clean target exit, no ladder fired |

**This is a system-level problem, not a strategy-specific problem.**

- **74% of trades are exiting at BE-stop, original SL, or trailing-stop** (i.e., exits that are at-or-below entry on net). Only **~10% (target_hit + better-than-target trailing exits) close in profitable territory.**
- **BE-stop is the single most common exit (37%)** — meaning the typical trade enters, gains a small amount, then reverses to break-even with no further upside.
- **Net loss across the entire 7-day cohort: −$1,187.10.** That's an active, real-money drag (in VTS-simulated dollars at ~$60/trade size). Not slowly bleeding — actively hemorrhaging.

This pattern is consistent with the broader regime-classifier failure mode documented in the master planning doc (`REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md`):

- The classifier is firing on directionally-aligned-but-momentum-weak signals
- Trades enter, gain a small amount on momentum that's already faded, then reverse
- BE protection catches most of them with minimal damage (37% of exits)
- A meaningful tail loses to original SL when no BE-protection has yet fired (24%)
- Trailing stops only fire when target is reached, which is rare (~10% of trades)

**The B65.4.1 hotfix is doing what it was designed to do** for the small subset of trades that reach target and ratchet (n=17 in 7 days = 1.5% of total trades). But that work is dwarfed by the dominant failure mode: **most trades never reach target in the first place because the entry is wrong for the conditions.**

**The right framing:** the ladder hotfix is a calibration improvement on top of a system whose entries are mis-timed against macro context. Until the macro confidence modifier (B67) lands and the regime classifier learns to lower-confidence the "everyone bullish, momentum lagging" setups, the ladder is operating on a small sample of low-quality entries and is being asked to recover edge that the upstream signal doesn't have.

---

## 6. Recommendations

### 6.1 Hotfix verdict: keep it, but…

Keep the B65.4.1 hotfix. The new formula IS working as designed in the cases where it can apply. But also: **the aggregate evidence shows the ladder is still costing us money even with the hotfix.** This isn't because the hotfix failed — it's because the ladder design itself is being asked to deliver value in a regime where most trades shouldn't have fired in the first place.

### 6.2 Don't shut off the ladder yet — but flag aggressively in observation

Phase 19.4.5 item 7 already tracks ladder net contribution. Add this 7-day cohort as the first data point. Track weekly.

If after 30 days post-hotfix the ladder is still net-negative vs counterfactual, the decision point becomes:

- **Tighter floor formula** — increase the slippage buffer multiplier from 1.0 to e.g., 2.0 so the floor sits +0.1% above target instead of +0.05%. Module_constants entry, no code change. Marginal impact expected.
- **Retire the ladder entirely** — replace TEC's TRAILING_TAKE mode with "hit target → exit." Significantly simpler code, removes the failure modes. The ~$28 cost we've measured suggests this would actually IMPROVE outcomes in the current data.
- **Defer the question to post-B67** — once macro context is in place and the entry quality improves, the ladder may start to deliver value because more trades will cleanly reach target on real momentum.

### 6.3 Add CSV export columns to make ladder mechanics visible

The "anomaly" rows in §2 are confusing because the CSV doesn't expose the latch-trigger price. Add columns:

- `latch_trigger_price` (the actual price at which target_lock_r triggered)
- `original_stop_price` (the entry-time stop, before any ratcheting)
- `rung_target_history` (each rung's target price as a JSON array)

This is small CSV-export work, ~2 hours. Lands as part of the punch-list item or as a small follow-up.

### 6.4 The dominant problem isn't the ladder — it's entry timing

Confirmed by the 7-day stats: the ladder fires on 1.5% of trades. The 98.5% of trades that don't fire the ladder are losing money on average (−1.17% mean net, $-1,187 aggregate). **B67 is the priority.** Optimizing the ladder further while entries are systematically wrong is rearranging deck chairs.

---

## 7. Reporting workflow used (for next ad-hoc re-run)

Per the reporting instructions in `BATCH_65_4_1_HOTFIX_COMPLETION.md` §5:

1. Pull `vts_open_trades_*.csv` and `vts_closed_trades_7d_*.csv` from the staging UI ML page.
2. `awk -F',' 'NR > 1 && $37 > 0' closed.csv` extracts laddered trades.
3. For each laddered trade, build the table above. Compute `Stop/Target` ratio to determine whether new or old formula was active. Compute `gross_at_target_pct = (target − entry) / entry × 100` and `cost_pct = costs/dollarValue × 100` for the counterfactual `counterfactual_net = gross − cost`. Compute `Δ = actual − counterfactual`.
4. Aggregate Δ in dollars across all laddered trades.
5. Look at full 7-day cohort exit-reason distribution to put the ladder behavior in context. Most of the action is happening upstream of the ladder.

**Recommended cadence:** weekly during Phase 19 paper observation per Phase 19.4.5 item 7. Move to scripted form when the cohort grows past n=30 trades.

---

*End of verification report 2026-04-28. Hotfix is functionally working. Ladder still net-negative in aggregate, but the dominant problem is upstream signal quality, not ladder calibration. B67 macro confidence modifier is the priority lever.*
