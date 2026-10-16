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
