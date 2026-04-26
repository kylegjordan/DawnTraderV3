# B65.4 Ladder Counterfactual Analysis — 2026-04-26

**Question:** is the ladder actually adding profit beyond what we'd have made just exiting at the original target, or is it primarily protecting some of an already-realized gain at the cost of giving back more than we save?

**Method:** for each laddered trade in VTS since deploy, compare actual net PnL against the counterfactual net PnL we'd have made by simply exiting at the original target price (the standard non-ladder behavior). Costs computed from the same per-trade actual cost figures.

---

## The 5 closed laddered trades

All values from `vts_closed_trades_7d_2026-04-26.csv` cross-referenced against PM2 `[9.2][LADDER]` log events on staging.

| Pair | Entry | Orig Stop | Orig Target | Final Stop (exit) | Final Rung Target | Rungs | Actual Net | Counterfactual @ Orig Target | **Ladder Δ** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| INJ/EUR | 3.2550 | 3.1451 | 3.4749 | 3.4467 | 3.6947 | 1 | **+3.96%** | +5.59% | **−1.63%** |
| DRV/USD | 0.08650 | 0.08548 | 0.08855 | 0.08881 | 0.09060 | 1 | **+1.76%** | +1.53% | **+0.23%** |
| MINA/USD | 0.06290 | 0.06166 | 0.06539 | 0.06612 | 0.06830 | **2** | **+3.51%** | +3.02% | **+0.49%** |
| ENSO/USD | 0.93594 | 0.81823 | 1.28909 | 1.27864 | 1.64220 | 1 | **+23.53%** | +36.65% | **−13.12%** |
| 2Z/USD | 0.08955 | 0.08616 | 0.09633 | 0.09051 | 0.09440 | 1 | **−0.12%** | +6.76% | **−6.88%** |

### Same data in dollar terms (each trade sized ~$47-$62)

| Pair | $ size | Actual $ | Counterfactual $ at orig target | **$ Δ** |
|---|---:|---:|---:|---:|
| INJ/EUR | $62.5 | +$2.47 | +$3.49 | **−$1.02** |
| DRV/USD | $62.5 | +$1.10 | +$0.96 | **+$0.14** |
| MINA/USD | $62.5 | +$2.20 | +$1.89 | **+$0.31** |
| ENSO/USD | $47.7 | +$11.23 | +$17.49 | **−$6.26** |
| 2Z/USD | $62.5 | −$0.07 | +$4.23 | **−$4.30** |
| **TOTAL** | | **+$16.93** | **+$28.06** | **−$11.13** |

---

## Honest read

**The ladder lost us ~$11 across these 5 trades** versus the counterfactual of just exiting at original target. Win rate on the ladder vs target is 2 of 5:

- **2 trades where ladder added profit** (DRV +$0.14, MINA +$0.31). Both gains are small. MINA is the only one that actually ratcheted twice (multi-rung), and it gained ~$0.31 net for the extra ratchet.
- **3 trades where ladder destroyed profit** (INJ −$1.02, ENSO −$6.26, 2Z −$4.30). The ENSO loss is huge: original target was +37% gross, ladder ratcheted past it, price reversed, final exit at +24%. We "protected" $11 but the original target would have given us $17 — net cost $6 to "protect" a position that was already at full target.

The 2Z/USD case is the cleanest illustration of the failure mode: target was hit at +7% gross; ladder fired with floor at the cost-aware breakeven; price reversed below the floor; final exit at slight loss after fees. **A trade that hit its target became a small loser because the ladder kept us in past the target, and the cost-aware floor was below the target by enough that the eventual reversal stop was below the original target take-profit.**

---

## Why this is happening

The ladder's design assumption was: "after target is hit, the trend often continues — let's ratchet up to capture more profit, with the cost-aware floor protecting the gain." In this sample the assumption isn't holding:

1. **Target is often the local top.** When price reaches target, that's frequently the exhaustion point. Ratcheting up means waiting for one more push that often doesn't come.
2. **Cost-aware floor is below target.** The rung-1 floor is set to a cost-aware level (essentially the breakeven-after-fees price for the just-hit rung). That floor is BELOW the target it was set for. So if price reverses immediately after target, the floor is hit at a price below what we would have exited at.
3. **Multi-rung ratchet is rare.** Only 1 of 5 trades (MINA) actually went past rung 1 to rung 2. So the design's payoff scenario (multiple ratchets locking in escalating gains) is the exception, not the rule.

In effect: the ladder is paying small wins (DRV, MINA) and large losses (ENSO, 2Z) on a small-sample frequency basis. Net is negative.

---

## Caveats

1. **Sample is tiny — 5 trades.** Statistical confidence is low. The −$11 total is the sample observation but variance is wide. Need 30+ laddered trades to draw firm conclusions.
2. **Counterfactual assumes target would have been hit cleanly.** It was hit in all 5 cases (that's what triggered the ladder). So this counterfactual is well-anchored.
3. **VTS-only data.** Active paper trading hasn't run with B65.4 ladder yet. Active trading has stricter filters; may produce a different sample of laddered trades.
4. **Cost-aware floor calibration.** The current floor formula sets the floor at break-even-after-fees of the just-hit rung. If we bumped the floor higher (e.g., 50% of the way between cost-aware and the next rung target), we'd protect more profit at the cost of being stopped out more easily. That's a tunable variable, not a structural problem with the ladder.

---

## What this evidence supports

- **Don't celebrate the ladder yet.** The +$32% sum across 5 trades sounded impressive but the real comparison is against +$54% counterfactual — we left ~$11 on the table by ratcheting past target.
- **The ladder design isn't broken — but the floor calibration may be too low.** If the floor were tighter (closer to the just-hit target), the cost of "fired-then-reversed" cases would be smaller. Tightening the floor is a `module_constants` adjustment, not a code rewrite.
- **The multi-rung case is the design's whole point.** MINA showed it works: ratcheted twice, locked in profit beyond original target. But multi-rung happens infrequently — 1 of 5 in this sample. If the actual multi-rung rate is ~20% and each multi-rung gains ~$0.50, but each single-rung-then-reverse loses ~$3-6, the net is negative.

## Implications for B65.6 / Phase 19.4.5

This finding adds another item to the Phase 19.4.5 Observational Decision Gate:

7. **Ladder net contribution at active-trading scale.** Track laddered-trade actual vs counterfactual-at-original-target across at least 30 laddered trades. If the net contribution is negative or near-zero, either tighten the cost-aware floor (smaller code change) or revisit whether the ladder design itself should be retired in favor of just-take-target-and-exit (larger decision).

This goes in the same observational-decision document as the other items already there (hostile-window recurrence, signal volume, classifier misclassification, etc.).

---

*Counterfactual analysis filed 2026-04-26. Sample n=5, preliminary. Active paper trading needed for decisive evidence.*
