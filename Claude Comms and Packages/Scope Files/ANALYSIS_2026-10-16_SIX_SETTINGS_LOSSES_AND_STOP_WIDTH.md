# ANALYSIS 2026-10-16 — the six September settings, the losing cells, and a wider stop (asked by Kyle 2026-10-16)

**Author:** CC-B (NEW Claude). **Read on staging 2026-10-16 09:11-10:10Z UTC, paper mode, read-only.** Not a batch; it answers Kyle's questions and points at where each follow-up lives.
**Population for every number below unless stated:** paper **buy** trades with a fill, opened since the `B-REACH-BASELINE-ADJUST` deploy (2026-09-20 21:19:40Z), closed by `stop_hit` or `target_hit` — **288 trades** (310 filled; the 22 others closed by the reset or are still open). Averages are per trade, equal-weight. ⚠️ **3½ weeks of paper trading, 9-105 trades per cell: a direction, not a decision-grade estimate (rule 13).**

## 1. The stops are not 5 % — they are set per strategy from the symbol's volatility
| strategy / class | trades | median stop below entry | median target above entry | reward : risk | target hit | stop hit |
|---|---|---|---|---|---|---|
| vwap_pullback xStock | 106 | **1.38 %** | 3.30 % | 2.05 | 20 | 86 |
| strong_bull_trend crypto | 56 | **7.93 %** | 15.33 % | 1.99 | 16 | 36 (4 reset) |
| morning_star xStock | 40 | 0.67 % | 2.11 % | 2.16 | 3 | 36 |
| morning_star crypto | 37 | 3.94 % | 6.68 % | 1.67 | 14 | 22 |
| pivot_shift xStock | 24 | 0.51 % | 1.59 % | 2.80 | 5 | 18 |
| sma_trend_ride xStock | 22 | 1.70 % | 4.87 % | 2.36 | 7 | 15 |
| reverse_impulse crypto | 9 | 3.56 % | 8.00 % | 1.73 | 5 | 4 |

## 2. The replay — what a wider stop would have done
**Method.** For each of the 288 trades, walk the 1-minute bars (`crypto_spot_ohlc_1m`, `xstock_spot_ohlc_1m`) from the minute after the fill and ask which is touched first: the trade's own target, or a stop placed k × as far below the entry as its original stop. A bar touching both counts as the stop (conservative). Neither touched by the last bar = still open, marked at the last close. Fees: the trade's own recorded round-trip fee.
**CONTROL (k = 1, the real stops):** the replay reproduces how **270 of 288** real trades ended (**94 %**; per cell 86-100 %). The replay is a trustworthy instrument for this question.
| stop distance | target hit | stopped | still open | average per trade (gross) | after fees (est.) |
|---|---|---|---|---|---|
| **as today (×1)** | 81 (28.1 %) | 200 | 7 | +0.13 % | **−0.49 %** |
| ×1.5 | 96 (33.3 %) | 171 | 21 | −0.26 % | −0.87 % |
| **doubled (×2)** | 106 (36.8 %) | 159 | 23 | −0.67 % | **−1.28 %** |
| ×3 | 118 (41.0 %) | 128 | 42 | −1.26 % | −1.88 % |
⇒ **Kyle's intuition is right that a wider stop gives trades more room — 25 more trades (+8.7 points) reach their target at ×2 — and wrong about the net: every trade that still stops loses twice as much, and that outweighs the rescues in every cell with enough trades.** Of the 86 real vwap_pullback xStock stop-outs, a doubled stop turns 16 into winners, 59 into bigger losses, 11 still open; strong_bull_trend crypto: 7 winners, 25 bigger losses, 4 open.
**The arithmetic behind it:** the win rate a cell needs just to break even before fees is stop ÷ (stop + target). Doubling the stop moves it from 29 % → 45 % (vwap_pullback xStock) and 34 % → 51 % (strong_bull_trend crypto); the extra room buys only ~10 points of win rate, not 16-17.
**Limits, stated:** the replay keeps the target fixed and ignores the trailing/breakeven ladder (which the 94 % control says matters little here); xStock fills are at the touched level, so it is generous to wider stops off-session (see §3).

## 3. The losing cells — what is wrong, and what calibration could fix
**strong_bull_trend crypto (52 trades):** 31 % winners against a 34 % break-even before fees; **before fees it is roughly flat (−0.26 % per trade); fees of ~1.45 % round trip make it −1.71 %.** It opened only because of the September change (0 in the equal window before), and it now opens 35 of 44 crypto trades since the reset (79.5 %, the crowding question `#1095`). ⇒ **Calibration can cut the cost (cheaper maker-style fills roughly halve fees), but that only brings it to about break-even; it does not show an edge to protect.** The evidence so far argues for selection — fewer, better strong_bull_trend entries, or tightening the September reach setting back — not wider stops.
**vwap_pullback xStock (105 trades):** 22 % winners against a 29 % break-even. **With ideal fills it would be −0.42 % per trade; the real result is −1.64 %.** The gap is how stops are filled outside US regular hours:
| xStock stop exits | trades | average fill beyond the stop |
|---|---|---|
| during regular hours | 86 | **0.03 %** |
| outside regular hours | 72 | **1.59 %** (worst: GRMN 13.7 %, DLR 10.3 %, NWL 8.3 % — thin overnight books) |
vwap_pullback xStock stop-outs average −4.09 % off-session vs −2.07 % in session. ⚠️ **This is not a defect:** Kyle ruled 2026-09-20 (`B-FEED-MISMATCH-FIX` criterion 2) that a stop the market gaps through books the nearest real price, because that is what live trading would get. **It is a POLICY question for the sprint: hold xStock positions through the thin off-session book, or not** (options: no new xStock entries late in the session; flatten before the close; or only act on xStock stops on a liquid book). ⇒ **Removing the off-session damage brings vwap_pullback xStock to about break-even, not profit; the remaining gap is selection again.**
**Other cells, for scale:** reverse_impulse crypto +2.87 % (n = 9 — too few to read); sma_trend_ride xStock is +0.87 % with ideal fills but −0.71 % real (the same off-session exits).
**Can it be overcome?** Two of the three drags are fixable by calibration and policy — fees (crypto) and off-session exits (xStock). The third — the signals in these two cells winning less often than their reward : risk needs — is a selection problem, and the sprint's ranking and filter calibration is where that is attacked. **Nothing in this data says a wider stop helps.**

## 4. strong_bull_trend on xStock — why it is off, and why September did not switch it on (provenance)
- **2026-05-07, `260cc8cc5` (B79 Step 3, xStock onboarding, Langston-greenlit):** *"only 6 well-understood, regime-based strategies are enabled for xstock_spot … The other 12 … are scope-disabled per asset class until shadow-mode evidence supports re-enabling … Revisit in B82+ once xstock_spot has 1-2 weeks of shadow-mode data."* strong_bull_trend was not in the six. **A conservative launch, with a revisit that never happened.**
- **2026-05-11, `b79.0m.a`:** the list moved from code into the database (19 rows; strong_bull_trend `enabled=false`). **Live today: exactly these 2026-05-11 rows** (all 19 stamped `b79.0m.a`; `orb` re-stamped 05-18).
- **➕ FOUND TODAY — 2026-05-24, `B79.0n.STRATEGY`:** its seed lists a **different** xStock set — strong_bull_trend and support_bounce **on**, pivot_shift and vwap_bounce **off** — while claiming to match the original list. Written `ON CONFLICT DO NOTHING`, it changed nothing; its report verified the **row count** (19), not the values, and attributed the 9/10 split to ORB alone. **Harmless — the live rows are the original intent — but the record has carried a wrong list for five months.** Recorded on `#1070`.
- **2026-09-20, `B-REACH-BASELINE-ADJUST`:** it set two xStock strong_bull_trend rows without checking the strategy was switched on — **an oversight, found by the first weekly read (2026-09-30).**
- **2026-09-30, Kyle:** switch the five candidates on one or two at a time, **strong_bull_trend first**, each with a pass/fail written before it goes on; the overdue check of the nine already on runs first. **Placed:** sprint row 52 `B-SILENT-STRATEGY-CENSUS` (CC-B) — **queued, not started.** ⚠️ **Given §3, switching strong_bull_trend on for xStocks now would add a strategy that is losing on crypto to a class losing off-session; the row's pass/fail should be written with that in view.**

## 5. Follow-up asked by Kyle 2026-10-16 — a closer target, and maker entries (same 288 trades; replay run 10:25-10:50Z UTC)
**Fees used (per side), matched to the recorded round trips:** crypto taker 0.80 % / maker 0.40 %; xStock taker 0.10 % / maker −0.02 % (a rebate). A target exit is a maker fill; a stop is always a taker fill.
### 5a. A closer target — trades reach it more often, and the result still gets worse
| target placed at … of today's distance | trades reaching it | average per trade after fees |
|---|---|---|
| ½ | 38.5 % | −1.10 % |
| ⅔ | 32.6 % | −1.01 % |
| ⅘ | 29.9 % | −0.88 % |
| **today's (×1)** | **28.1 %** | **−0.52 %** |
Halving the target lifts the hit rate by 10 points but halves what each winner pays, while the losers stay the same size. **No target distance makes any cell with enough trades profitable** (pivot_shift xStock at ½ reaches −0.03 %, n = 21). strong_bull_trend crypto: 38.5 % hits at ½ but −3.69 % per trade.
### 5b. Maker entries at the planned price — would they have filled, and what would they have earned?
**Fill test:** a resting buy at the planned entry price fills only if the market **trades through** it (a 1-minute low strictly below the price) within 60 minutes of the signal — touching it is not enough, because a resting order queues behind others at that price. **233 of 288 would have filled within 60 min (81 %); 204 within 15 min.**
| | trades | reach target | profitable | average per trade after fees |
|---|---|---|---|---|
| **maker entry, maker target exit, taker stop** (filled ones) | 233 | 59 | **62 (26.6 %)** | **−0.59 %** |
| the same 233 trades, taker entry (replay) | 233 | | | −0.57 % |
| the same 233 trades, **as they really happened** | 233 | | | −1.00 % |
| the 55 a maker order would have MISSED, as they really happened | 55 | | | −1.51 % |
~~⇒ Maker entries … the fee saving … is cancelled by adverse selection~~ ⛔ **WITHDRAWN 2026-10-16 (CC-B, after Kyle questioned it): the explanation was wrong.** Decomposed on the same 233 trades, **not one trade changed outcome** between the taker and maker replays (59 target / 171 stop / 3 open in both). The real cause was the MODEL: the maker order was placed at the trade's *planned* price, which sat **0.32 % (crypto) / 0.23 % (xStock) ABOVE the price the market actually gave the taker** — so the "maker" bought worse than the taker. **Corrected in §5d.** **What does help:** the trades a maker order would never have filled were worse than average (−1.51 %), so skipping them improves the total; and the large gap between the replay (−0.57 %) and reality (−1.00 %) is the off-session xStock exit damage of §3, which maker entries do not touch.
**Per cell (maker, filled trades):** reverse_impulse crypto +3.77 % (n = 8); sma_trend_ride xStock +0.80 % (n = 19); morning_star crypto −0.20 %; vwap_pullback xStock −0.78 % (71 of 105 would fill); strong_bull_trend crypto −1.93 % (47 of 52 would fill); morning_star xStock −0.64 %; pivot_shift xStock −0.52 % (12 of 21 would fill).
**Limits:** the planned price is close to the ask at the signal, so this is roughly a bid-side order; a resting order placed lower would fill less often at a better price. Same 3½-week sample as above.
### 5c. Conclusion across §2, §5a and §5b
**Neither the stop distance, the target distance, nor maker entries fix the result — the signals in the two big cells (strong_bull_trend crypto, vwap_pullback xStock) do not win often enough for their reward : risk, with any of these levers.** The two levers that do move money are (1) **not letting xStock stops fire into thin off-session books** (≈ 0.5-1 % per trade on vwap_pullback / sma_trend_ride xStock) and (2) **selection** — fewer, better entries. Both belong to the sprint's calibration work.

### 5d. Maker entries, CORRECTED — the resting order at the price the market actually offered (2026-10-16)
**Model:** a resting buy at the trade's actual fill price (the price the market offered when the taker bought); filled only if the market trades **below** it within 60 minutes; target exit maker, stop taker; the same stop and target levels.
| | trades | fill | average per trade after fees | profitable |
|---|---|---|---|---|
| **all** | 288 | 253 | **taker −0.52 % → maker −0.28 %** | 74 of 253 (29 %) |
| crypto | 107 | 107 | taker −0.84 % → **maker −0.44 %** | 39 of 107 (36 %) |
| xStock | 181 | 146 | taker −0.33 % → **maker −0.16 %** | 35 of 146 (24 %) |
Per cell (maker): strong_bull_trend crypto −1.74 → −1.34 %; vwap_pullback xStock −0.59 → −0.35 % (86 of 105 fill); morning_star crypto −0.42 → −0.02 %; sma_trend_ride xStock +0.88 → +1.17 %; reverse_impulse crypto +2.91 → +3.31 %.
⇒ **Maker entries help — about +0.24 % per trade overall, +0.40 % on crypto, which is the fee saving — but they do not make the losing cells profitable on their own.** A real resting bid sits at the BID, below this price: it would fill a little less often at a slightly better price.

### 5e. Why every trade passed the Net Expectancy gate and the average still lost (asked by Kyle 2026-10-16)
⛔ **TERM CORRECTED 2026-10-16 (Kyle asked):** "forecast" below is NOT a separate component — it is the **Net Expectancy** number the **EV gate** admits on (`net-expectancy-kernel.ts`, Directive 11.8B-A, built 2026-02-03 `2e7154764`; `bridge/canonical/DawnTrader_Complete_Project_History.md:543`): NetEV = Pwin × distance-to-target − (1 − Pwin) × distance-to-stop − fees/spread/slippage, with **Pwin = 0.40 + DI/200 clamped to 0.40-0.60** (|DBS| for the strong-trend pool). Read "forecast" as "Net Expectancy".
The gate admits a trade when the system's **forecast** of its expected value is positive; it does not know the outcome. **Every one of the 310 filled trades since 09-20 had a positive forecast at admission** (`closed_trades.metadata.netEvAtAdmit`; 0 at or below zero), and the realized averages are crypto −0.85 %, xStock −1.24 %. **Is the forecast predictive at all?** Trades split into quarters by their own forecast, within each class (ranks, so the field's differing scale between classes does not matter):
| class | lowest-forecast quarter | 2nd | 3rd | highest-forecast quarter |
|---|---|---|---|---|
| crypto (29/29/28/28) | −2.36 % | +0.23 % | −1.62 % | +0.38 % |
| xStock (49 each) | −1.10 % | −1.12 % | −1.06 % | **−1.66 %** |
⇒ **On xStock the forecast does not separate better trades from worse — the highest-rated quarter did worst; on crypto it is noisy at best.** So raising the gate's bar today would not pick better trades. **Making the forecast predictive is the calibration work** — once its win-rate estimates match reality, the same gate automatically turns away the marginal trades.
⚠️ `netEvAtAdmit` runs on different scales by class (crypto median 0.0023, xStock 0.88, max 75.6); the quartile comparison is within class and unaffected, but the field's unit is not established here.
