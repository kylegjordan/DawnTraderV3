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

## 1. ROUND 1 RESULTS against §0, as pre-registered (run 2026-10-06 ~16:40Z; script `scratchpad/est.py`, to be copied into the evidence folder at Step 3)
**Measured 149 of the 163** (14 of the earliest opens fall outside the 720 bars Kraken's 60-minute endpoint returns): **6 spiked, 143 control.** E1 scale factor (from the control): 1.135.

| | criterion 1 — the 6 to ≤ 1.5× clean | criterion 2 — control median ≤ 2 % and p95 ≤ 10 % | criterion 3 — fixtures (a) suppress, (b)/(c) ≥ 80 % of E0's rise |
|---|---|---|---|
| **E1** scaled median | PASS (max 1.09×) | **FAIL** — median 9.54 %, p95 27.07 %, max 50.34 %; 68 controls over 10 % | **FAIL** — (b) 17 %, (c) 19 % |
| **E2** winsorised 3× | PASS (max 1.14×) | **FAIL** — median 0.00 %, p95 13.79 %, max 34.71 %; 15 over 10 % | **FAIL** — (b) 54 %, (c) 20 % |
| **E3** returned-wick clip | **FAIL on 2 of 6** — GNOT 1.65×, LIGHTER 1.62× (others 0.90-1.15×; GBP/USD 1.15×) | **PASS** — p5 0 %, p25 0 %, median 0.00 %, p75 0.00 %, p95 1.93 %, max 21.60 % (AKE/USD, the one control over 10 %) | **PASS** — (a) 1.19× clean, (b) 100 %, (c) 100 % |

**Criterion 5 applies: no candidate passes all three, so nothing is chosen on this table alone.**

**What the two E3 "misses" are (inspected after the run, criteria NOT changed):** both are genuine one-hour moves whose close moved and held — **LIGHTER `reverse_impulse`, opened 09-30 01:54Z: the 09-29 23:00Z bar `o 4.451 h 4.641 l 3.598 c 3.93` (close −12.0 % vs the prior close, next close 3.899)**; **GNOT `strong_bull_trend`, opened 09-23 22:37Z: the 21:00Z bar `o 0.07036 h 0.09899 l 0.06929 c 0.09499` (close +33.1 %)**. The suppressed ones are returned wicks — GBP/USD `h 1.70000` with the close back at 1.32399; LIGHTER (open) `l 0.110` with the close at 3.728. ⇒ **§0's spike definition (one bar's share of the true-range sum) captures genuine single-bar moves as well as off-market prints, so criteria 1 and 3 conflict on exactly these two rows: criterion 3 says a moved-and-held close must pass through; criterion 1 counts them as spikes to suppress.** That conflict is mine, in the pre-registration, and is put to Langston as found — the remedy is a ruling, not a quiet re-definition.

## 1b. ROUND-1 RE-SCORE PREDICATE — Langston ruling (c), 2026-10-06 ~16:00Z. Registered and committed BEFORE re-scoring. §0's criterion text is unchanged; only crit1's MEMBERSHIP predicate is registered here, and no estimator is re-run.
**A labelling instrument for grading this study only.** It reads the NEXT bar's close, so it is never a term in any estimator (E3 stays next-bar-free).
For every one of the **149** measurable opens, take its **largest-true-range bar** among the 14 and compute:
- **Excursion** = the bar's extreme on the side of its largest true-range leg, minus the prior close (`high − prevClose` if `|high − prevClose| ≥ |low − prevClose|`, else `low − prevClose`).
- **Sustain leg** — retention `r1 = (close − prevClose) / excursion` and `r2 = (nextClose − prevClose) / excursion`: **S+** if both ≥ 0.50; **S−** if both ≤ 0.20; otherwise **S?**. (No next bar available ⇒ S?.)
- **Participation leg** — the bar's Kraken trade count over the median trade count of the 14 bars: **P+** if ≥ 3.0×; **P−** if < 2.0×; otherwise **P?**.
- **Material spike** = the bar's true range ≥ 4× the median of the other 13 (the share condition is dropped from membership so the rule is general, not fitted to §0's six).
**Classes:** **OFF-MARKET** = material spike AND S− AND P−. **GENUINE** = material spike AND S+ AND P+. **UNDETERMINED** = material spike with any other leg combination, **including the disagreement cells S−/P+ and S+/P−** (a bad print with a crowd, or a quiet sustained move) — **reported on its own line, never inside a sum.** **NO SPIKE** = not material.
**Populations for the re-score:** criterion 1's population = the **OFF-MARKET** opens; criterion 2's control = **NO SPIKE** ∪ **GENUINE**; **UNDETERMINED** opens graded by neither, listed by name. Reported: the class count over all 149, how many of round 1's 143 controls and 6 spiked move class, and — per Langston — **if OFF-MARKET ∪ GENUINE amounts to exactly GNOT and LIGHTER 09-30 01:54Z moving out and nothing else, the predicate is a carve-out and is rejected.** If E3's two round-1 misses land UNDETERMINED, the result is **INCONCLUSIVE and E3 does not ship.** Every crit2 figure states its denominator; the 14 opens outside Kraken's 720-bar window are instrument-blind, not clean. AKE/USD (E3's 21.60 % control) is checked against this predicate before crit2 is published.
