# VTS 4%-Minimum-Target Study (Kyle-requested, 2026-06-21)

> Run by CC-B against the production DB (read-only). Feeds the reorg-B2.1 Step-2 pre-audit + the new Phase-25 NetEV-judgment-validation item. Outcome ledger = `exit_decision_archive` (mode='vts', 7,974 closed trades, 2026-05-05 → 06-20). Returns are GROSS (pre-fee); the ~1.8% Tier-1 round-trip fee shifts everything more negative.

## Headline
1. **% of generated signals already ≥4% target** — opposite by class: crypto **78.7%** firehose / **58.2%** opened (median ≈5.1%); xStock **22.7%** firehose / **41.0%** opened (median ≈3.5%, just under the line). A flat 4% floor barely touches crypto, cuts ~60% of xStock.
2. **Does ≥4% select profitable trades?** xStock YES (win 40.2% vs 26.4% for <4%, +14pts); crypto NO (31.3% vs 32.7%, no edge — wider stops let losers run). Both net-negative on average regardless of cutoff (gross).
3. **Where do they end up?** Most never reach target — stopped out first (SL_hit 61% crypto / 46% xStock among ≥4%-target). Only ~24% crypto / ~19% xStock ≥4%-target trades realize ≥4%. Over half of xStock winners (53%) exit below 4% (BE/trail/time stops); crypto winners cluster higher (median 6.7%).

## Tables

### Target% distribution — opened trades (vts_open_trades, N=7,273)
| Bucket | crypto % | xstock % |
|---|---|---|
| <2% | 21.8 | 22.9 |
| 2–3% | 11.1 | 19.5 |
| 3–4% | 8.9 | 16.7 |
| 4–5% | 7.5 | 16.1 |
| 5–8% | 15.4 | 17.6 |
| >8% | 35.3 | 7.3 |
| **≥4%** | **58.2** (2,016/3,465) | **41.0** (1,560/3,808) |

### Outcomes by cutoff (closed VTS, exit_decision_archive, N=7,974)
| Asset | Group | N | Win rate | Avg realized % | Median % |
|---|---|---|---|---|---|
| crypto | ≥4% | 2,522 | 31.3% | −1.52 | −3.84 |
| crypto | <4% | 1,776 | 32.7% | −1.07 | −1.72 |
| xstock | ≥4% | 1,494 | **40.2%** | −0.15 | −0.89 |
| xstock | <4% | 2,182 | 26.4% | −0.90 | −1.53 |

### Did ≥4%-target trades realize ≥4%?
| Asset | N | Winners | Realized ≥4% | % of winners below 4% | Median winner % |
|---|---|---|---|---|---|
| crypto | 2,522 | 788 | 24.4% | 22.0% | 6.68% |
| xstock | 1,494 | 600 | 18.7% | 53.3% | 3.83% |

## Caveats
- Returns GROSS (pre-fee, `fees:null`); win-rate comparisons stable (gross≈net winner counts), absolute returns overstated.
- Crypto firehose ≥4% (78.7%) rests on only 929 resolved-target rows (~99% of firehose evals have NULL target) — indicative, not decision-grade; xStock firehose (63K) solid.
- Three target sources across Q1a/Q1b/Q2 (forming_close proxy / opened entry / snapshot) — consistent story, exact %s differ by source.
- No per-strategy breakout → strategy-mix confound possible. VTS target-setting may shift post-reorg.

## Implications for reorg-B2.1 (CC-B read)
- **Supports dropping the crude 4% floor:** no-op for crypto (already ≥4%, no win-rate edge) and wrong bar for xStock (too high — cuts 60%, and xStock winners mostly realize <4%).
- **Reinforces:** rely on the NetEV gate (weighs win-rate + fees, not just target size) + per-class calibration (the xStock floor DOWN — already #336/25-17).
- **Baseline for the NetEV-judgment validation (Phase-25):** a flat 4% does NOT predict crypto profitability, so the EV gate must do better; this study is the measurement baseline. xStock's 40-vs-26 win-rate split on target quality is a real (if gross/confounded) signal the EV gate + calibration should capture.
