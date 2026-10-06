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

## 1c. RE-SCORE RESULTS under §1b (run 2026-10-06 ~16:20Z, `scratchpad/rescore.py`; round 1's estimator values unchanged, only the grouping)
**All 149:** NO SPIKE 110 · GENUINE 18 · UNDETERMINED 20 · OFF-MARKET 1. **Round-1 spiked (6):** UNDETERMINED 3 · GENUINE 2 (GNOT 09-23, LIGHTER 09-30 01:54Z) · OFF-MARKET 1 (GBP/USD). **Round-1 controls (143):** NO SPIKE 110 · GENUINE 16 · UNDETERMINED 17.
**Carve-out test (Langston condition 2): NOT a carve-out** — GENUINE holds 18 opens (VVV, SPX, UNI, AERO, ENA, SUI, DRV, GNOT, NEAR, ONDO, WLD ×2, FIL, FOLD, SHX, LIGHTER 09-30 01:54Z, KNTQ, ZEC 10-02), 16 of them round-1 controls; E3 leaves every GENUINE row at 1.16-1.65× clean (unchanged from E0).
**Criterion 1 (OFF-MARKET, E3 ≤ 1.5× clean): PASS — but on n = 1:** GBP/USD 09-23 20:00Z (S−/P−, retention −0.00/−0.00, participation 1.0×) 13.36× → **1.15×**.
**Criterion 2 (control = NO SPIKE ∪ GENUINE, n = 128 of 149): PASS** — min 0.00 %, p5 0.00 %, p25 0.00 %, median 0.00 %, p75 0.00 %, p95 0.00 %, **max 1.34 %**; none over 10 %. (The 14 opens outside Kraken's 720-bar window are instrument-blind and excluded; the 20 UNDETERMINED are graded by neither, below.)
**UNDETERMINED (20, own line):** UAI 09-14, INJ 09-16, ZEC 09-17, APT 09-18, XMR/USDT 09-18, XMR/USDC 09-18, ZIG 09-19, VELVET 09-19, FARTCOIN/USDC 09-19, **AKE 09-20 (S−/P+, the round-1 21.60 % control: a crowd-print, E3 1.26 → 0.99)**, ZIG 09-20, NEAR 09-20, SEI 09-20, TAO 09-22, ACU 09-23, UAI 09-23, LIGHTER 09-24, US 09-29, **LIGHTER opened 09-30 06:14Z (its spike BAR is 09-30 04:00Z — the 0.110 print: S−, participation 2.5× — in the P? band — E3 2.28 → 1.12)**, PHA 09-30. E3 leaves none of the 20 above 1.36×.
**Honest limit:** criterion 1 is met on ONE row under the strict two-leg rule; the most obvious off-market print in the population (LIGHTER 0.110) is UNDETERMINED because its trade count sits between the registered 2× and 3× bounds. The two round-1 misses landed GENUINE, not UNDETERMINED, so §1b's INCONCLUSIVE clause does not trigger — **whether n = 1 is enough is put to Langston as found.**

**Timestamp convention (Langston r-c item 6, folded in):** in §1-§1c an open is named by its **OPEN time** (e.g. LIGHTER `reverse_impulse` opened 09-30 01:54Z) and a candle by its **BAR time**, always labelled "bar" (e.g. GBP/USD's spike bar 09-23 20:00Z; the trade opened 21:12Z).

## 1d. ESTIMATOR RULING — Langston, 2026-10-06 ~16:00Z: **E3 SHIPS; not INCONCLUSIVE.**
- Re-derived by him: §0-§1b byte-identical at `0c4c9adf1` and `206fa26a5` (the predicate was registered before the re-score).
- **Why n = 1 does not decide it:** criterion 1 discriminates nothing — E1 and E2 fail criteria 2 and 3 at n = 143 and on fixtures, independent of criterion 1; the only surviving alternative to E3 is E0, the defect itself.
- **What carries E3 is the harm arm, and it is powered:** criterion 2 n = 128, max 1.34 %; 18 GENUINE rows unchanged from E0 at 1.16-1.65×; fixtures (b)/(c) 100 %. By construction a clip that never touches the close cannot attenuate a close that moved and held.
- **Failure direction:** an off-market print E3 misses leaves the ATR where E0 leaves it today (no new harm); a real move wrongly attenuated would shrink every stop and target silently — and that arm is the measured one.
- ⛔ **Recording rule:** criterion 1 is **a floor met on the complete determinate set (1 / 1)** — the labeller's reach, not the phenomenon's rate. **"1 of 149" is never to be quoted as an off-market frequency** — not in the completion report, not in row 2a1's before/after, not in CC-C's F.3.

**A12 result (degenerate arms):** Kraken's 632 online USD pairs, 60-minute history (2026-10-06): **629 have ≥ 100 bars, 3 have 20-99, 0 have fewer than 20** ⇒ the MCE's short-window averaging and `market-scanner.ts:20`'s return-0-under-15 never diverge on any listed pair today; collapsing them changes no live DBS routing. The shared function keeps the stricter behaviour (no ATR under 15 bars ⇒ no signal, the existing `invalid_atr` drop), stated in its docblock.

## 3. PLAN — each item ← its finding
1. **New shared module `server/core/calculations/true-range-atr.ts`** exporting the per-bar true range and `computeAtr(ohlc, period)` = **E3** (each bar's high/low clipped to its body ± 3 × the window's median true range, then the plain mean of the last `period` true ranges; fewer than `period + 1` bars ⇒ `NaN`, and callers fail closed). The 3× and the window are documented constants with this audit as their provenance. ← A1, A8, §1d, A12.
2. **Repoint all six ATR implementations to it in ONE commit** (A5: a mixed state can break `#371`'s `clamped ≤ raw`): MCE `market-context-engine.ts:1780`, `strategy-engine.ts:99`, `strategy-helpers.ts:57`, `fx5-scanner.ts:72`, `market-scanner.ts:19`, `xstock_spot/scanner.ts:64` (its 56-bar period kept). **Carve-outs, named in the fence:** `computeBarDerivedAtr` (`#866`, disposition 1) and ADX (row 2a1). ← A1, A2, A5, scope C2.
3. **The 10 % clamp is KEPT and RELABELLED as a data-integrity bound** (its GUARD-2 *"caps flash-crash ATR"* intent), not as the measure; its docblock says so. **Re-assert `#371`'s identity with a test** (guard and normalizer ATR both come from the shared function; `clamped ≤ raw`); record the effect on `#371`/`#373` on both issues. ← A4, A5, Langston C1.
4. **Fallbacks:** delete `signal-orchestrator.ts:2279`'s `?? currentPrice * 0.02` and the sibling `stopPrice ?? currentPrice * 0.97` / `targetPrice ?? currentPrice * 1.03` (`:2304-2305`); `pattern-recognizer.ts:585-586`'s `currentPrice * 0.01 / 0.02` → fail closed (return no geometry when ATR is not a positive finite number); `orb.ts:239` / `strong-bull-trend.ts:79` unchanged (already fail closed). **`strategy-engine.ts:236/:1243` `atr_fallback_daily_range_frac` → fail closed IF Langston rules (e) that way**; then retire the `0.10` row under rule 18 (DELETED_COMPONENTS_LOG) and note the five diagnostic surfaces that return null. ← A6, A7, scope C3.
5. **Tests:** E3 unit tests on the three fixtures and on real bars (GBP/USD 09-23 20:00Z bar → ~1.15× clean; LIGHTER 09-29 23:00Z bar unchanged); a census fence over every ATR call site (two carve-outs named); the `#371` identity test; the pattern branch produces no signal on a missing ATR. ← §0, §1, §1c, A5, A6.
6. **Labels and docs:** correct `market-scanner.ts:18` and `LEVER_INVENTORY.md:168` (not Wilder); SIM — §5.2.5 MCE (formula, consumers, the shared function), `:3119` (the pattern recognizer HAS a production caller), `:579` (DBS ATR source), §2.6 (forming bar; no candle sanity check besides E3), §1.2a (pattern branch bypasses the clamp); System Manual — a new ATR section (estimator, window, bar source, what E3 suppresses and deliberately does not, the clamp's integrity role). ← A9, scope OBJ-4/5.
7. **Verification after deploy:** recompute E3 vs E0 on the live MCE value for a sample of pairs (expect equality except on pairs with a returned wick in the last 14 hours); watch the next off-market print — the trade's stop/target must come from the clean range. ← §0 criteria.
**UNAUDITED:** none. **Open for Langston:** item 4's ruling (e); this whole document for Step-2 sign-off.
