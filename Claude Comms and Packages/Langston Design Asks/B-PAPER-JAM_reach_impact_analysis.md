# Did the reach batch slow our trades, and did it pay for it? — analysis for Kyle and Langston

**Asked by Kyle, 2026-10-05 ~12:15Z:** *"a full proper analysis on what our trading system looks like now ... since we made that change ... how this has changed our trading timelines and how long it takes for our trades to close, as compared to before ... whether this is acceptable, and whether we're seeing improved wins and profitability at the sacrifice of slower closing trades."*
**Author:** NEW Claude (CC-B), owner of `B-REACH-BASELINE-ADJUST` (`3n.v`). Companion: `B-PAPER-JAM_investigation_r1.md`.

## 0. Object, population, windows
- **The change:** `B-REACH-BASELINE-ADJUST`, deployed **2026-09-20 21:19:40Z** (`40f22a1bb`). It unblocked crypto `strong_bull_trend` (reach ceiling 6.5), opened xStock `vwap_pullback` (6.0) and lowered three reward/risk floors to 1.95. **xStock is excluded below** (xStock `strong_bull_trend` is switched off for that class; the xStock paper sample is a handful).
- **Paper:** `closed_trades`, `mode='paper'`, `asset_class='crypto_spot'`, `close_reason <> 'never_filled'`, **opened** in two equal windows either side of the deploy: **before** 2026-09-06 ~06:30Z → 09-20 21:19:40Z, **after** 09-20 21:19:40Z → 10-05 ~12:10Z (14.6 days each). Still-open trades are rows with `closed_at` NULL; their hold is counted to now (so "share over 48 h" includes them). Query: `ba_paper.sql` (inlined in §5).
- **VTS:** `vts_open_trades` (crypto) ⋈ `exit_decision_archive` on `trade_id`, closed trades only, same opening windows. Query in §5.
- **No hold-time expectation was ever registered.** The batch's pre-audit says *"Nothing derived from the holding horizon"* (`B_REACH_BASELINE_ADJUST_PRE_AUDIT.md:90`). The nearest thing it recorded: VTS crypto `strong_bull_trend` **median holds 855-1,022 min (14-17 h)** (`:125`). **This gap is mine and is the first lesson below.**

## 1. Paper, crypto — before vs after
| | before | after |
|---|---|---|
| trades opened | 91 (6.2/day) | 71 (4.9/day), 6 still open |
| median hold (closed) | **5.9 h** | **9.7 h** |
| 90th-percentile hold (closed) | 30.5 h | 54.1 h |
| share held > 24 h (incl. open) | 14.3 % | **38.0 %** |
| share held > 48 h (incl. open) | **0 %** | **19.7 %** |
| median target distance | 6.0 % | 8.7 % |
| targets / stops | 32 / 59 | 26 / 39 |
| win rate (closed) | 35.2 % | 40.0 % |
| net P&L, closed | **−$121.13** | **−$9.83** (+$6.81 unrealised on the 6 open) |
| mean net per trade | −0.91 % | −0.04 % |
| capital-time used ($ × hours) | 65,793 | **255,431 (3.9×)** |
| net per $10k-hour (**closed-only** denominator: 159,775 after) | −18.4 | −0.6 |

**By strategy, after:** `strong_bull_trend` **23 trades** (3 open), median hold **30.5 h** (incl. open), win 40 %, net **−$2.09**, median target **14.7 %**. `morning_star` 33 trades, 4.4 h, win 36 %, −$7.87. `reverse_impulse` 6, +$5.67 · `inside_bar_reversal` 4, +$6.28 · `pivot_shift` 3, −$5.53.
**Before, for comparison:** `morning_star` 47 (−$52.08) · `sma_trend_ride` 20 (**−$66.25**) · `inside_bar_reversal` 8 (+$17.37) · `pivot_shift` 7 · `reverse_impulse` 6.

## 2. VTS, crypto — the same windows, thousands of simulated trades
| | closed | median hold | 90th pct | win | mean P&L | target exits |
|---|---|---|---|---|---|---|
| before · `strong_bull_trend` | 705 | 18.4 h | 73.8 h | 49.8 % | −0.04 % | 48.9 % |
| before · all other | 308 | 11.5 h | 76.3 h | 36.7 % | +0.34 % | 33.4 % |
| after · `strong_bull_trend` | 716 | 19.6 h | 75.9 h | 34.4 % | −1.77 % | 33.4 % |
| after · all other | 386 | 5.7 h | 39.1 h | 27.5 % | −1.55 % | 27.5 % |
⚠️ **VTS P&L is not comparable across these windows** — `#1118`: crypto VTS P&L charges the exit half-spread twice since 2026-09-15 (inside the before window and all of the after window), and both groups fell together, which is what a measurement change or a market change looks like, not a strategy change. **VTS hold times are not affected by that accounting and are usable.** ⚠️ Closed-only medians under-count trades still open at the window's end (both windows, worse for the after window).

## 3. What this says — plainly
1. **Yes, the batch slowed paper trading, and by roughly what its own evidence predicted for the strategy it unblocked.** `strong_bull_trend` holds ~18-20 h at the median in the VTS both before and after the batch (it was already being simulated there); in paper it is ~19 h for the trades that closed (Langston's figure) and ~30 h counting the three still open. Paper's overall median went 5.9 h → 9.7 h and the share of trades held over two days went 0 % → 20 %.
2. **What was NOT anticipated is the effect on how many trades the book can run.** Paper has a fixed amount of money; `strong_bull_trend` trades are full-size (~$160) and stay ~3× longer, so they used **3.9× the capital-time**. Opens fell from 6.2 to 4.9 a day, and to zero once every place was held by a slow trade.
3. **Outcomes improved overall, but not because of `strong_bull_trend`.** Paper went from losing $121 to roughly break-even over the same length of time, and the win rate rose 35 % → 40 %. But `strong_bull_trend` itself is **break-even (−$2.09 over 23 trades)**; most of the improvement is `morning_star` losing less (−$52 → −$8) and `sma_trend_ride` trading far less (20 trades, −$66.25 before; **1 trade, −$6.28 after** — ~~"no longer trading"~~ corrected r2). **With 23 trades the strategy's own result is too small to call either way.**
4. **So, today: the batch bought a lot of slower capital-time for no measured gain from the strategy it added — yet.** Not a loss, not a win.

## 4. Recommendation — ⛔ r1's test REJECTED by Langston; §7 replaces it
- **Keep it through Monday's reset, and judge it on results, not speed** (Kyle: no limits based on how fast a strategy trades). The reset gives ~20 places instead of 5, so one slow strategy can no longer stop the book.
- ~~Pre-register the test now … net profit per $10k-hour … below the rest ⇒ reach ceiling back~~ **STRUCK r3 (Langston): withdrawn, wrong-signed for a losing strategy. The test is §7d.** Error record: `RUNNING_ISSUES` `#1095`, 2026-10-05.
- **The bad-print fix (`#1153`) still comes first**: two of the seven stuck trades have targets set off a single bad price, which no strategy setting explains.
- **The lesson (mine):** a geometry change that moves targets must state the hold time it expects and what that does to the number of trades the book can carry. This one stated neither.

## 5. Queries (read-only, run on staging 2026-10-05 ~12:10Z)
Paper: `closed_trades` with `extract(epoch from coalesce(closed_at, now()) - opened_at)/3600` as hold, windows split at `'2026-09-20 21:19:40+00'`, length `now() - d` either side, grouped by window (and by `strategy_name`). Capital-time = Σ `quantity × entry_price × hold_h`. VTS: `vts_open_trades o JOIN exit_decision_archive e ON e.trade_id = o.id::text`, `o.asset_class = 'crypto_spot'`, `e.duration_min/60` as hold, `e.pnl_pct`, `e.exit_reason`.

## 6. For Langston
Re-derive §1 (paper) and §2's hold columns; rule on §4's pre-registered test (object, population, threshold, consequence). Two things I did not do: an xStock read (too few trades), and a per-trade view of whether the six `min_rr`/reach rows *other than* `strong_bull_trend` changed anything in paper (the weekly read of 09-30 found two of them never opened a trade).

## 7. r2 — Langston's re-derivation (2026-10-05), corrections and the replacement test
`REVIEWER: Langston · object (staging, his own queries rederive_reach.sql, rd2-rd6) · §1 and §2 holds reproduce to the decimal · corrections below adopted`

**7a — The batch slowed the strategies it did NOT unblock, too (answers §6's open item).** Non-SBT paper: median closed hold **5.94 → 7.21 h (+21 %)**; median target distance up in every one (morning_star 5.98 → 6.72 %, inside_bar_reversal 6.52 → 12.11 %, reverse_impulse 6.84 → 9.67 %, pivot_shift 6.40 → 8.71 %); net **−$121.13 → −$7.74** on 48 trades; average notional $92.84 → $63.27. ⇒ §3 bullet 1 overstated SBT's share: **SBT is 72.7 % of the after window's capital-time, but only 6 of the 14 trades held over 48 h (43 %).** ⚠️ **HYPOTHESIS, UNMEASURED:** why non-SBT targets widened, and whether the wider targets are what improved non-SBT P&L.
**7b — Full enumeration (r1 listed only the big ones).** After (71): strong_bull_trend 23, morning_star 33, reverse_impulse 6, inside_bar_reversal 4, pivot_shift 3, plus sma_trend_ride 1 and defensive_hedge (GBP/USD, still open). Before (91): morning_star 47, sma_trend_ride 20, inside_bar_reversal 8, pivot_shift 7, reverse_impulse 6, plus vwap_pullback, mean_reversion, defensive_hedge.
**7c — The after window is two populations:** deploy A (`ea456ad40`, 2026-10-02 20:37:49Z) sits inside it and carries the `3n.l` REST-key fix that changes GBP/USD and ETC/USD mark resolution. Discharge or split before any verdict.
  ✅ **DISCHARGED r3 (CC-B, measured 2026-10-05):** of the 71 after-window trades, **1 opened after deploy A** (ZEC/USD, `reverse_impulse`, still open) and **0 closed after it** (0 `strong_bull_trend`). ⇒ **every closed-trade figure in §1 and the n=20 SBT baseline in §7d are one population, all pre-A.** Only the incl.-open shares (>24 h, >48 h) span A, through the six positions still open across it.
**7d — §4's test is wrong-signed and is withdrawn.** For a losing strategy, holding longer moves net-per-capital-time toward zero, i.e. "better": today SBT scores −0.18 per $10k-hour against the rest's −1.70 and would PASS on 20 closed trades. **Replacement (Langston), to pre-register:**
- **LEG 1 — the gate (Kyle's "results"):** mean net per trade after friction, **closed SBT rows only**: FAIL if the 95 % upper bound < 0, PASS if the lower bound > 0, otherwise INCONCLUSIVE-EXTEND. (n=20 today: sd 15.92 pp; at n=50 the 95 % interval on a zero mean is ±4.4 pp.)
- **LEG 2 — net per $10k-hour: reported, gating only where both sides are ≥ 0.** Comparator enumerated by strategy and published, n ≥ 5 or excluded.
- **Open rows:** verdict on closed rows only; open set reported as count + capital-time + mark; > 20 % open ⇒ INCONCLUSIVE.
- **Clock:** 50 closed SBT trades or 21 days after the reset; at 21 days with n < 50 extend once, then to Kyle as a judgment, never a mechanical revert.
- **VOID/SPLIT on:** `#1153` landing, a `#1095` un-hold, an 8 % kill-switch trip, any exit-mark cadence change (`3n.l` / `8a`), a slot change beyond Monday's reset.
- **A PASS does not discharge the missing hold-time expectation** (pre-audit `:90`) — that stays owed.
- ⚠️ §4's "~20 places" is from `B_SIZING_DEC_RESTORE_SCOPE.md` obj-2 (`slots = min(floor(e / effectiveP), postureSlotCap)` ⇒ 20 at e = 100, p = 5, normal posture), not yet measured live.
**7e — Found outside scope (Langston, §9.4 disposition 2 → CC-C's fiat line `#937`/`#966`, `PHASE_19_PLAN` 5.a):** the `defensive_hedge` **GBP/USD** paper position, open since 09-23 (278 h, $14,737 of capital-time = 5.8 % of the book on $52.98), has target +5.42 % / stop −3.25 % on a fiat pair: crypto-calibrated ATR geometry on a fiat base. Not a reach-batch effect. It inflates the "19.7 % held over 48 h" figure the batch is charged with.

**7f — CLOCK ANCHOR for §7d (Langston: he is stateless, so it must be written here):** `PAPER-RESET-3000` completed at **UTC: ____ (to be filled by the deploy owner when the reset lands)**; 21 days ⇒ **____**.
