# HCE — S2–S5 results + geometry correction + next-phase ask (for Langston)

> Full results: `HCE_FINDINGS_ADMITTED_ARM_S2-S5.md` (same inbox dir). Engine `scripts/hce/hce_study.py` committed. INFRA: do NOT cd /mnt/gdrive or git-grep the mount; use `ssh staging`. Numbers below are from live staging probes.

## 1. Your D2 ratio test cracked the geometry question — and overturned my S1 read

I ran the magnitude/ratio test you asked for. Result: of the 3,129 `signal.stopLoss ≥ entry` trades, **only 25 are true units-bugs** (ratio (stop−entry)/entry > 0.5; e.g. STX 818 on a $0.25 entry). The other **3,104 have the stop within ~3% of entry (p99 = 0.34)** — normal magnitude. Then I verified what they actually are:

- `originalStopPrice` (top-level) is sane (**below entry**) for 2,413/2,463 of them — the **entry** stop is normal.
- 94% (2,920/3,104) exit **above** entry; exitReasons are **break_even_stop (1,604), target_hit (1,154), trailing_stop_hit (147)**.
- Cross-tab: `finalStop≥entry` tracks winning (winners trail their stop up) but not perfectly (1,271 are break-even exits eaten by friction → tiny net loss).

**Conclusion:** `signal.stopLoss` is the **FINAL trailed/break-even stop** (post-outcome), `originalStopPrice` is the **entry** stop. So `stopLoss≥entry` is an OUTCOME proxy, not corruption — my S1 "13.7% corrupt" was wrong. Net effect: exclude only the **25 units-bugs**, KEEP the 3,104 trailed winners (excluding them would have biased toward losers), and **use `originalStopPrice` for entry geometry in Gate (c)**. Engine updated accordingly. Your instinct saved the analysis from a real bias.

## 2. S2–S5 admitted-arm result: a within-admitted NULL

After excluding the 25 units-bugs (crypto 20,511 / xStock 2,274, never pooled, outcome = net `netProfit`):

- **No strategy is net-positive in any of its best logged contexts.** Every strategy stays net-negative sliced by regime / global regime / DBS band / continuation / confidence / phase. Winner-vs-loser context profiles are near-identical. **AUC(DBS→win) = 0.50** (crypto), 0.51 (xStock) — directional bias has no standalone predictive power *within admitted*.
- The only FDR-significant net-positive gates are both artifacts: **`volatility_edge`** (+3.5%) lived in Mar–Apr and **collapsed to −1.1%/36% in May**; **`liquidity_trap`+RANGE_BOUND** (+0.78%, 97.5% win) is **52% PAXG (gold token)**, Mar–Apr only. Both documented as negatives.
- **Interpretation (your D3 thesis, confirmed):** the SQE gate already homogenized the survivor population, so context can't separate within admitted. The pattern-study edge (continuation+high-vol) was measured on **raw detections**, not survivors — so the within-admitted null does NOT contradict a pre-gate edge; it points to it living in the admitted-vs-rejected difference.

## 3. The load-bearing caveat → next build

This tested **logged** context features only. It did NOT test **raw OHLC-derived** features (realized vol/ATR%, trend-strength, distance-from-high, momentum) — exactly the features that carried the pattern-study edge. Computing them needs market state recomputed from 1-min OHLC as-of each entry (OHLC is Apr+ only → ~9.2k trades). That same recompute IS the Gate (c) reconstruction infrastructure.

**Proposed sequence:** P1 OHLC raw-feature engine → re-run S3/S4 on absolute-binned raw features (tests §1a hypothesis on admitted). P2 Gate (c) validation (blind-reconstruct admitted from `originalStopPrice`+OHLC vs known `netProfit`). P3 rejected arm (`net_ev_rejected` 5,068, May–Jun) if (c) validates. P4 S6 + governance.

## Questions

1. The geometry correction — agree `signal.stopLoss` = trailed stop, exclude only the 25 units-bugs, use `originalStopPrice` for entry geometry? (Simplifies your D2 — no 13.7% exclusion, no dual-report needed beyond the 25.)
2. Given the within-admitted null, do you agree **P1 (raw-OHLC features on the admitted arm) comes BEFORE the rejected arm** — i.e. first confirm whether the §1a raw features separate winners where the logged features don't — or would you go straight to the rejected arm (P3)?
3. Any change to the rejected-arm scope (`net_ev_rejected`, May–Jun, OHLC-reconstructed) now that the admitted arm is null?

Proceeding on P1 unless you redirect.
