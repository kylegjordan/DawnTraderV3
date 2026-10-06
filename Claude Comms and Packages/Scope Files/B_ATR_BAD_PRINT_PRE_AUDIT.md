# B-ATR-BAD-PRINT — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: architecture · Step 2 of 11 · owner CC-B · scope `B_ATR_BAD_PRINT_SCOPE.md` (r2, Langston APPROVED; four Step-2 conditions in its §6)

## 0. PRE-REGISTRATION — written and committed BEFORE any candidate estimator is run on the 163 opens (Langston Step-1 condition 4)

**Population:** the 163 crypto paper opens 2026-09-06 → 10-05 (`closed_trades` ∪ open rows, `mode='paper'`, `asset_class='crypto_spot'`, the list frozen at `scratchpad/opens_1005.txt`, re-exported into the evidence folder at Step 3), each with Kraken's public 60-minute OHLC for the 15 closed bars before its open. **The 6 "spiked" opens** are defined as before: one bar carries ≥ 40 % of the 14-bar true-range sum AND ≥ 4× the median of the other 13. **The 157 others are the control.**

**Candidates (the estimator is chosen from these, by the criteria below — not by eye):**
- **E0** — today's plain mean of 14 true ranges (the baseline).
- **E1** — median of the 14 true ranges × a scale factor fixed from the control so that E1's median equals E0's median on the 157.
- **E2** — winsorised mean: each bar's true range capped at 3× the median of the 14, then averaged.
- **E3** — *returned-wick clip*: each bar's high and low clipped to within 3× the 14-bar median true range of that bar's own body (`max(open, close)` / `min(open, close)`), then the plain mean. **Rationale: an off-market print is a wick the price does not stay at; a real move moves the close, which the clip never touches.**

**Criteria, fixed now:**
1. **Suppression (the 6):** the chosen estimator brings each spiked open's ATR to **≤ 1.5×** the plain mean of its 13 non-spike bars. *Fail if any of the 6 stays above.*
2. **Control (the 157):** relative change `|E − E0| / E0` per open — **median ≤ 2 % AND 95th percentile ≤ 10 %.** The full distribution (min, p5, p25, median, p75, p95, max, and every open over 10 %) is published, not only the pass/fail.
3. **Positive control (real volatility passes), synthetic fixtures:** (a) one isolated returned wick → suppressed to within 1.5× the clean value; (b) three consecutive wide bars whose closes move with them → ATR rises ≥ 80 % of E0's rise; (c) a gap-and-hold (the close moves and stays) → ≥ 80 % of E0's rise.
4. **Tie-break:** among candidates passing 1-3, the one with the smallest control median change; then the simplest.
5. **If no candidate passes all three, nothing ships on estimator choice alone** — the result goes back to Langston with the full table.

*(Audit and plan follow below; this section is not edited after the first run.)*
