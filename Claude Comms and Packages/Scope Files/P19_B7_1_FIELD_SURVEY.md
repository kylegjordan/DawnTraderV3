# P19-B7.1 — Field survey: how the industry ranks trade opportunities (external prior art)

**Purpose:** Kyle directive 2026-06-30 — don't scope the ranker from internal availability alone; ground it in established trading-industry practice, and require **cross-asset opportunity ranking** (rank the best opportunity regardless of asset class). Researched via web (sourced) + quant-finance domain knowledge. **[ESTABLISHED]** = documented practice; **[SYNTHESIS]** = reasoning applied to our one-pick-per-cycle, cross-asset, high-friction problem.

---

## THE BOTTOM-LINE ANSWER (field-standard, and it CONVERGES with Langston + CC-A)
> **Rank by net expected edge PER UNIT OF RISK, in risk-normalized units (R-multiples or volatility units), net of per-candidate round-trip cost — i.e. a fractional-Kelly growth score.**

The per-candidate ranking score:
```
score = p_cal · reward_R − (1 − p_cal) · risk_R − cost_R
```
- **All terms in R-units** (multiples of the per-trade risk budget), NOT price units — *this is what makes a crypto candidate and a tokenized-stock candidate comparable* (the cross-asset requirement).
- `p_cal` = **calibrated, regime-conditioned** win probability.
- `reward_R`, `risk_R` = expected payoff / risk as multiples of per-trade risk (e.g. risk = entry−stop; reward = target−entry, in R).
- `cost_R` = **per-candidate** round-trip friction (maker vs taker, spread, slippage) in R-units.
- Then **pick top-ranked with `score > 0`** (hard net-of-cost gate), and **size by fractional Kelly** keyed to confidence in `p_cal`.

**Why this is the answer for OUR problem (pick the single best each cycle, sequential):** maximizing expected **log-growth (Kelly)** is the provably growth-optimal objective for *sequential single-bet* selection (vs Sharpe/mean-variance for *portfolio* construction). Kelly's growth contribution is monotone in net-edge-per-risk for small bets, so "rank by net-edge-per-R" ≈ "rank by Kelly growth contribution," and the *same* number both ranks and sizes.

## (b) CROSS-ASSET NORMALIZATION — the most important part
Raw expected P&L in **price units is not comparable across assets** (price level, vol, tick size differ) — this is the entire reason the normalization machinery exists. The field-standard fix, three layers:
1. **Return space** (not price) — removes price-level differences; necessary, not sufficient.
2. **Volatility normalization / risk-per-unit (the core standard):** scale every position to a common risk (vol) target (`size ∝ 1/σ`), so a unit of position = the same risk on any asset; then **expected edge per unit of that risk is comparable**. This is the documented backbone of multi-asset trend-following (Moskowitz-Ooi-Pedersen *Time Series Momentum* vol-scales ~55 cross-asset futures; the vol-scaling itself does a large share of the work — ~1.27%/mo vs ~0.41%/mo unscaled). **The retail/discretionary version of this exact idea = Van Tharp R-multiples** (risk-per-trade = 1R; expected payoff in R is cross-asset comparable). **→ This is precisely Langston's "risk-normalize, rank by R-multiple, not raw price-delta netEV" — confirmed as the field standard, not a local fix.**
3. **Cross-sectional standardization (optional layer):** z-score or rank-normalize the candidates' risk-normalized edge *across the current pool* (winsorize extremes first) so "best in this pool now" is well-defined + regime-robust. Standard equity-quant factor practice.

## (c) Win-probability / calibration (our known gap → Phase-25)
The whole apparatus lives or dies on `p(win)`, and **raw model scores are NOT probabilities**. Field-standard: ground in **historical base rates** (per signal×regime), apply **Platt scaling or isotonic regression** to map scores→calibrated probabilities, validate with **reliability diagrams + Brier score**, **regime-condition** the estimate, and **shrink toward base rates / use fractional Kelly** when data is thin (uncalibrated `p` over-ranks AND over-sizes toward ruin). **Meta-labeling** (Lopez de Prado: a secondary model predicting P(primary signal correct)) is the upgrade path. **→ This maps exactly onto our pWin gap + the Phase-25 calibration plan (data-gated on shadow outcomes).**

## (d) Friction (our dominant term)
Ranking on GROSS expected return is a classic mistake under meaningful friction. Subtract **expected round-trip cost** from gross edge **before** ranking, in the **same R-unit**: `net_edge = gross_edge − (fees + spread + slippage)`. **Maker vs taker is first-class in crypto** — at Kraken Tier-1 ~0.80% taker / 0.40% maker, ~1.8% round-trip taker friction is *enormous* vs typical per-trade edge → **friction is the binding constraint, not a footnote**. Two consequences: (1) gross edge must clear round-trip cost to be *eligible* (`score>0` gate, not just down-weight); (2) equal-gross candidates with different fee-tier/spread/liquidity must rank differently → cost is **per-candidate**, not a global constant.

## (e) Reference framework patterns
- **QuantConnect/LEAN** (closest to our architecture): Universe → **Alpha model emits Insights** (Direction/Magnitude/Confidence/Weight/Period) → **Portfolio Construction** (rank→weights) → Risk → Execution (maker/taker lives here). Our `net_edge` + calibrated `p` = the Insight Magnitude/Confidence; "pick one + size" = a degenerate top-1 Portfolio Construction model + fractional-Kelly sizing.
- **Zipline/Pipeline:** factors → rank()/z-score/screen() → trade top of ranking (the cross-sectional standardize→rank→select pattern).
- **Grinold-Kahn:** `alpha ≈ volatility × IC × score` (note the vol term = cross-asset normalization again); Fundamental Law `IR ≈ IC·√breadth` — picking ONE per cycle is *low breadth*, so our **per-pick selection IC (selection quality) must be genuinely positive** or we just pay friction. Measure it.

## (f) What this means for B7.1 — the convergence + the build-list
**CONVERGENCE (high confidence):** internal analysis (netEV) + Langston (risk-normalize → R-multiple) + CC-A (unify with the gate) + **the field (rank by net-edge-per-R = fractional-Kelly growth score, the cross-asset standard)** ALL point to the same objective. Our `evaluateTradeExpectancy` netEV is already `p·(target−entry) − (1−p)·(entry−stop) − cost` — the field says: **divide it by risk-per-trade (entry−stop) to get the expected R-multiple** (cross-asset comparable), keep it net-of-cost, gate at `>0`, and the pWin is the calibration work.

**What to BUILD (Kyle's "build the plumbing if the better method needs it"):**
1. **Per-candidate risk unit** (entry−stop / ATR-based) so reward_R/risk_R exist + are cross-asset comparable — *we have entry/stop/target, so this exists.*
2. **The risk-normalized ranking score** (expected R-multiple, net-of-cost) as the active ranker, pluggable, RANK distinct from the GATE.
3. **Calibrated, regime-conditioned pWin pipeline** (base rates → Platt/isotonic → reliability/Brier → shrink-to-base-rate; meta-label upgrade) — **Phase-25, data-gated on shadow outcomes.** Pre-calibration: use the current DI-derived pWin (crude-but-real); be conservative.
4. **Per-candidate net-cost** (maker vs taker) — taker now, maker-aware when **B7.2** lands.
5. **Selection-IC measurement via the shadow A/B** (does the rank predict realized R?) — the reorg-B4 shadow extended to capture the score + outcome; the empirical proof.
6. **(Future) fractional-Kelly sizing** keyed to pWin confidence — related but a separate concern from ranking (our guardrails do fixed-fractional risk sizing today).

---

### Sources
- [Kelly criterion (Wikipedia)](https://en.wikipedia.org/wiki/Kelly_criterion) · [Practical Kelly (Frontiers)](https://www.frontiersin.org/journals/applied-mathematics-and-statistics/articles/10.3389/fams.2020.577050/pdf) · [Kelly vs max-Sharpe, growth≈Sharpe²/2 (arXiv 1906.02216)](https://arxiv.org/pdf/1906.02216)
- [Time Series Momentum & Volatility Scaling (SSRN 2786955)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2786955) · [Alpha Architect summary](https://alphaarchitect.com/time-series-momentum-volatility-scaling-and-crisis-alpha/) · [QuantPedia](https://quantpedia.com/deconstructing-the-time-series-momentum-strategy/) · Moskowitz-Ooi-Pedersen *Time Series Momentum* (2012)
- Grinold & Kahn *Active Portfolio Management* (alpha=vol×IC×score; Fundamental Law) · Van Tharp *Trade Your Way to Financial Freedom* (expectancy, R-multiples, SQN) · Carver *Systematic Trading* · Lopez de Prado *Advances in Financial ML* (meta-labeling)
- scikit-learn calibration docs (Platt vs isotonic, reliability, Brier) · QuantConnect/LEAN docs (Alpha→Insight→Portfolio Construction→Risk→Execution) · Zipline/Pipeline docs
- [Relative-value cross-asset volatility (Amberdata)](https://blog.amberdata.io/relative-value-trading-how-to-compare-cross-asset-volatility) · [Risk-adjusted returns (WallStreetMojo)](https://www.wallstreetmojo.com/risk-adjusted-returns/)

**Established vs synthesis:** the components (vol-scaling/risk-parity, R-multiples, Kelly=growth-optimal-for-sequential-bets, calibration methods, net-of-cost ranking, the framework pipelines) are all established + cited. The assembly into "rank by calibrated net-edge-per-R, gate at >0, size by fractional Kelly" for our one-pick-per-cycle cross-asset loop is the synthesis — a composition of established parts.
