# P19-B8 — Balance Policy Field Research (citation-grade)

**Author:** Langston · **Date:** 2026-07-03 · **For:** CC-B (NEW Claude) + Kyle
**Commissioned by:** Kyle decision #3 (2026-07-03, "A, A, A") — validate/refine the §4 threshold + re-anchor design before B8.2 formally locks.
**Scope guardrail:** Kyle policy choices (1) TRIGGERED/automatic threshold re-anchor and (2) hard re-anchor at live-launch STAND AS DECIDED. This pass sharpens implementation; it does NOT reopen policy.
**Method:** field sweep of retail-broker demo-account guidance, prop-firm sim-to-live mechanics, and quant execution/market-impact literature. Every load-bearing claim is cited at the bottom. Where the field is silent, I say so rather than inventing a number.

---

## 0. Bottom line up front

Our design lands on the right side of the field's consensus on all three big questions:

1. **Start = mirror live capital.** The near-universal broker + educator recommendation is to size the practice book to the money you will actually trade, *because position sizing, slot counts, and loss tolerance are all relative to balance* — the exact "guardrails × balance ⇒ slots" mechanic in our §4. Our Kraken-mirror-at-start is textbook. **[S2, S4, S8]**
2. **Hard re-anchor at go-live = what real prop firms actually do.** When a funded/evaluation trader flips to live, the simulated account is set **dormant/closed** and real capital is freshly allocated — the sim book does not carry its compounded paper equity into the live world. Our "paper snaps to live's Kraken balance at launch, pre-launch growth preserved as warm-up record" is the same mechanic, softened only in that we keep the growth as *history* rather than deleting it. **[S9, S10]**
3. **The physics threshold is real and has a named cost curve.** The friction-divergence worry (bigger paper book ⇒ orders walk more depth; tiny book ⇒ min-order floors) is not a vibe — it is the **square-root law of market impact**: cost scales ≈ √(order size ÷ available liquidity). That gives the per-class threshold a principled shape instead of a round multiple. **[S5, S6]**

The one place the field will NOT hand us a number: **there is no published industry-standard "paper-vs-live divergence ratio."** Nobody runs long-compounding paper books beside a live account the way we do, so the 3–5× figure floated in §4 is *our* engineering heuristic, not a citable standard. §4 of this doc converts it from a round multiple into a friction-anchored trigger so it's defensible. That refinement is the main deliverable.

---

## 1. Sizing the practice book to live capital (validates Kraken-mirror-at-start)

**The consensus is emphatic and one-directional: match the practice balance to the capital you will actually trade.**

- Retail brokers hand out inflated defaults precisely because they look attractive, and the field openly calls them *unrealistic*: "Most Forex and CFD brokers offer demo accounts with up to $100,000 in virtual funds… While this practically unlimited demo balance seems very attractive… it is highly unrealistic. Inflated virtual capital can distort expectations… It can encourage position sizes you'd never risk with real money." **[S4]**
- The platform defaults confirm how far off an unmatched book drifts: **Alpaca** defaults paper to **$100k** (resettable to any amount), **thinkorswim** to **$200k** equities / $10k FX, **Interactive Brokers** to **$1,000,000**. All three explicitly support resetting to your real number, and the guidance is to do so. **[S2, S8]**
- The *why* is exactly our slot mechanic: "Position sizing is relative — if you paper trade with $500,000 but plan to start live with $5,000, every habit you build — the number of shares you trade, the positions you hold simultaneously, the losses you tolerate — is calibrated to an account 100 times larger than your actual one." **[S2]**
- Educator framing: "the goal is to practice your reality, not a fantasy… if you intend to start with $1,000, use a $1,000 demo — not $100,000. This forces you to practice with realistic position sizes and risk parameters." **[S2, S4]**

**Implication for B8.2:** the Kraken-mirror-at-start default with **no free-text override** is not just simplest, it's the field-endorsed behavior. The override we're deleting is the thing the field warns against (it's how you end up calibrated to a fantasy book). Keep the fail-hard-on-unreachable-Kraken posture — an invented starting balance *is* the unrealistic-default failure mode, just arrived at differently.

---

## 2. Re-anchor / reset cadence — what long-running practice environments actually do

Two distinct patterns in the field, and they map cleanly onto our two re-anchor events:

**(a) Go-live transition = sim goes dormant, real capital freshly allocated (validates decision #2, the hard re-anchor).**
Prop firms run the closest real-world analog to our paper→live handoff. What they do at the switch:
- "Upon transition to live trading, capital is allocated… and the simulated funded account is set to **dormant** status." **[S9]**
- "When a trader is moved to live trading, all simulated prop accounts are **closed**." **[S10]**

They do **not** port the sim account's compounded paper P&L into the live account as starting equity — live starts at the real allocated number. That is exactly a hard re-anchor. Our design is marginally *more* preserving than the field (we keep pre-launch growth as a warm-up scoreboard record instead of discarding it), which is a strictly-better choice for Kyle's "watch the growth" confidence signal — it costs nothing because it's history, not live balance.

**(b) Long-running practice books — the field mostly resets rather than compounds indefinitely.**
Every major platform ships a **reset-to-chosen-balance** control (IBKR "Paper Trading Account Reset," thinkorswim reset, Alpaca reset, TradingView reset) **[S8]**, and the standing advice for a practice book that has drifted is to reset it back to your real number rather than let a runaway balance keep teaching bad sizing. **Nobody in the retail field runs a multi-month compounding practice book as a deliberate design** — which is why there's no published cadence for it. Our compound-freely-between-anchors choice is therefore *novel relative to the field*, and that's fine given Kyle's explicit reason (growth as confidence signal) — but it's precisely why we need the physics backstop in §4: we're operating past where the field's own guardrails stop.

**Implication for B8.2:** decisions #1 and #2 together give us two anchor events (triggered-on-threshold + hard-at-launch). That is *more* disciplined than the field's "reset when you notice it's drifted," because ours is governed and automatic rather than manual and discretionary. Good. The `mode='continue'` rule (resume persisted balance, never re-fetch, so a Kraken outage never blocks a resume) has no field counterpart to contradict it and is sound.

---

## 3. Realism problems when the practice book diverges (validates the friction worry, and separates the two skews correctly)

The field independently confirms CC-B's two-component split of the skew:

**DECISION-realism gap (the soft, fence-able one).** The field's demo-vs-live literature is really about *psychology* — no emotional weight, false confidence, overtrading on a fat balance. **[S1, S3]** This is the "learns to trade big" worry. Crucially, this maps to our claim that decision skew only bites if the learning layer reads *dollar-absolute* features. Our sizing is %-of-portfolio and ranking is R-multiple / netEV, so the decision layer *should* be scale-free — which is exactly why the dollar-agnostic fence test (B8.2) is the right instrument. The field can't validate the fence directly (retail demos don't have a calibration layer), but it confirms the *direction* of the risk: a fat practice book teaches oversized behavior unless something holds sizing to reality.

**FRICTION-realism gap (the hard, physical one that can't be fenced).** This is the real constraint and the field is unambiguous that it exists:
- Backtest/sim realism literature: "A backtest might assume the ability to buy large quantities without affecting price. In live markets, order size relative to average daily volume matters enormously." Serious quant practice "subtract[s] estimated costs on every trade, appl[ies] realistic bid-ask spreads, and stress test[s] performance under worse-than-expected slippage." **[S3]**
- Market impact "is the most difficult to model" and decomposes into delay slippage + the adverse move your own order causes as it "consumes liquidity." **[S3]**
- The min-order-floor half of the worry is the mirror image: too *small* a book can't place a compliant order at all. Both ends are physical, neither is fence-able — which is why §4's backstop keeps paper's balance *in the neighborhood of live's reality* rather than trying to normalize it away.
- Notably, **IBKR's simulator deliberately injects slippage** to stay realistic **[S2]** — i.e. the most-respected retail sim treats friction realism as a first-class feature, not an afterthought. Supports us modeling it rather than assuming frictionless fills.

**Implication for B8.2:** the consensus-locked distinction in the design ADDENDUM — *don't fence the drift itself, never normalize actual position sizing, only balance-ratio-normalize what the calibration layer READS* — is the correct resolution and the field backs it: friction is physical (keep it honest in the ledger), decisions should be scale-free (prove it with the fence). Nothing here reopens that; it's validated.

---

## 4. The threshold number — refining the round multiple into a friction-anchored trigger (the main refinement)

This is where the pass earns its keep. **The field does not publish a "paper-vs-live divergence ratio."** The 3–5× multiple in §4 is a reasonable gut number but it's arbitrary, and Kyle's decision #1 makes it *automatic* — an automatic trigger firing on an arbitrary number is exactly the kind of thing that later gets asked "why 3×?" with no answer. Here's the citable basis to replace the round number with a physics-anchored one.

**The square-root law of market impact.** The established model across the quant literature: the cost of executing an order scales ≈ **√(order size ÷ available liquidity)** — impact is a *concave* function of size relative to ADV / top-of-book depth. **[S5, S6]** (Refinements argue log-concave fits even better, and there's a participation-rate term, but square-root is the accepted first-order law. **[S5]**) A common practitioner form is the **square-root model: price impact ∝ √(order size ÷ ADV)**. **[S3, S6]**

**Why this matters for our threshold:** because sizing is %-of-equity, a paper book that is *k×* the live balance places orders *k×* larger in notional. Under the square-root law, the *extra friction* those orders incur relative to live-size orders grows like **√k**. So:

- The friction penalty is **concave**, not linear — doubling the balance ratio does NOT double the friction error; it multiplies it by ≈ √2 ≈ 1.41. This means small divergences (1.5–2×) are genuinely cheap to tolerate, which supports Kyle's compound-freely lean. The field-endorsed "let it grow, watch the confidence signal" is defensible *precisely because the early divergence is low-cost.*
- The penalty only becomes *material* when the order starts consuming a non-trivial share of available depth — i.e. when `order_notional / top-of-book-depth (or ADV proxy)` crosses the point where modeled slippage meaningfully exceeds live-size slippage. **That crossing, not a balance multiple, is the honest trigger.**

**Concrete recommendation to replace "3–5×":**
Define the per-class threshold as a **friction-divergence bound**, computed from live market microstructure, not a balance ratio:

> Re-anchor when the *modeled* per-trade friction of a typical paper-size order exceeds the modeled friction of a live-size order by more than **X basis points** (per asset class), where friction is estimated via the square-root impact model against that class's current depth/ADV — OR when the paper-size order would breach the exchange **min-notional / min-order floor** (the small-book failure).

- This makes the trigger **self-scaling to liquidity**: in a thin xStock book the threshold fires at a *smaller* balance ratio than in deep BTC — which is the whole point of "per-asset-class, never a global round multiple" (already locked in the ADDENDUM). The square-root law is what makes per-class correct rather than decorative.
- Keep the **balance ratio as the human-readable telemetry** ("paper is 3.2× live") on the B8.3 scoreboard, but let the **friction bps + min-order breach** be the *actual firing condition* in ADJUSTMENT_FRAMEWORK. Ratio for the dashboard; physics for the trigger.
- The `X bps` per class is the governed knob. I'd seed it conservatively (a bound where modeled excess slippage is still a small fraction of average edge — netEV must survive it, per the Net Expectancy standard) and let it be tuned. This keeps it inside the "governed knob → ADJUSTMENT_FRAMEWORK entry" home already agreed.

**Honesty note (per §7 / no-confabulation):** I could not find any firm that publishes a numeric divergence trigger for a compounding shadow book, because — as §2 establishes — essentially no one runs one. So I am NOT citing "3×" or any X bps as an industry standard; I'm giving you a *derivable* basis (square-root impact) to set the number defensibly and per-class. That's the strongest form available; anything claiming a canonical number would be fabricated.

---

## 4b. Two net-new findings (second sweep)

**(i) The minimum-order floor skews the OPPOSITE direction from impact — and it makes decision #2 the more load-bearing guard.**
Kraken enforces a per-pair **cost minimum** (notional floor) and a base-currency volume minimum (≈ 1 USD-equivalent) — "if your order doesn't meet the cost minimum, the order will be canceled." **[S11]** The asymmetry the earlier pass under-stated: the min-floor constrains the *small* account, not the big one. If live starts at ~$800 and a %-sized order on a thin pair falls below the floor, **live physically cannot place that trade** — but a paper book compounded to $4,000 places it every time. So an over-grown paper book doesn't only over-fill (impact skew); it **never learns the "too small to exist" constraint** that binds the live account.
- The **triggered** re-anchor (decision #1) catches only the *impact* skew (paper too big → walks too much book). It does **not** catch the min-floor skew.
- The **launch-time hard re-anchor** (decision #2) fixes *both* — at launch paper = live, so paper hits the same floor live does.
- **Therefore decision #2 is the more load-bearing of the two guards**, and B8.2 gets a concrete acceptance item: *after any re-anchor, the min-notional/min-order check must read the CURRENT (re-anchored) paper balance*, so paper honors the same floor live faces. This is testable and silently rots if unasserted.

**(ii) Scale-invariant learning is a published, solved problem — the dollar-agnostic fence is on a paved road.**
Our fence + balance-ratio-at-open tag is, in ML terms, reward/feature scale-normalization, and there's published precedent it works: reward-range normalization yields RL agents whose performance is invariant to reward magnitude, where the un-normalized model's accuracy is "limited to certain reward magnitudes." **[S12]** Trading-specific RL confirms the practice — actions scaled to max-allowed-position, risk-adjusted (per-unit-risk) returns rather than raw dollar P&L, inputs normalized to "generalize across portfolio sizes." **[S13]**
- **Validates** the decision-skew fence (all thresholds/comparisons in %/R/bps; enumerated dollar-boundary set only for sizing-notional, min-notional, fee computation) as standard technique, not paranoia.
- **Refinement with a citable why:** the literature warns running/global normalization "introduces non-stationarity into the learning objective." **[S13]** Translation: normalize each trade at **write-time against its fixed balance-ratio-at-open tag**, never via a live-updating global normalizer that shifts as the book compounds. Our design already tags at open — that's the stationary-reference approach, which is correct. State the *why* in B8.2 scope so a later "simplification" into a live normalizer doesn't reintroduce the trap.

---

## 5. What this pass changes vs. leaves alone

**Leaves alone (validated as-is):**
- Kraken-mirror-at-start, no override, fail-hard on unreachable Kraken (§1 — field-endorsed).
- Hard re-anchor at live-launch, growth preserved as history (§2 — matches prop-firm dormant/close mechanic, strictly better).
- The two-skew split + "don't fence drift, don't normalize sizing, only normalize what calibration READS" (§3 — field backs the friction-is-physical / decisions-are-scale-free distinction).
- `mode='continue'` never re-anchors (§2 — nothing contradicts it; sound).
- Re-anchor ≠ learning reset; history never deleted (consistent with reset-to-balance being a *balance* op, not a data op).

**Refines (the actionable output):**
- **Replace the "3–5× balance multiple" trigger with a per-class friction-divergence bound derived from the square-root impact law + min-notional floor** (§4). Balance ratio stays as dashboard telemetry; friction bps + min-order breach become the firing condition. This is what makes decision #1's *automatic* trigger defensible instead of arbitrary, and it operationalizes "per-asset-class, never a global round multiple."

**Flags for B8.2 scope (no new open loops — all have homes):**
- The `X bps` per-class threshold value → ADJUSTMENT_FRAMEWORK entry (home already agreed).
- The friction estimator (square-root model against per-class depth/ADV) is a small piece of engine work B8.2 needs; name it in the B8.2 scope so it's not discovered late. If it's heavier than expected, that's a scope conversation with CC-B, not a silent carry.
- **Min-notional-floor honoring after re-anchor** (§4b-i) → B8.2 acceptance item; the floor check reads the current re-anchored balance. This is the guard against the small-account skew that decision #1 alone can't catch.
- **A triggered re-anchor must re-base the balance figure for FUTURE sizing only — it must NOT force-close open paper positions** (contrast: IBKR requires flatten-before-reset; we deliberately choose not to, so a mid-run trigger can't act as a stealth kill-switch). State explicitly in B8.2.
- **Every triggered re-anchor is a logged governance event** (which class's friction budget was crossed, old→new balance) — not a silent snap. Preserves Kyle's "watch it grow" confidence signal by making the one discontinuity legible; pre-anchor growth stays on the lifetime scoreboard (already locked).
- **Normalize learning at write-time against the fixed balance-ratio-at-open tag, never a live-updating global normalizer** (§4b-ii) → one-line note in B8.2 scope to prevent a future non-stationarity regression.
- **Add a paper-vs-live divergence readout to B8.3** once live is on — the reconciliation artifact that makes the shadow book earn its keep AND empirically measures the friction skew the threshold bounds. Name it as a B8.3 dashboard item now (§13 discipline) rather than a "later."
- Nothing here touches decisions #1/#2 as *policy* — it's purely how the trigger computes and how the run is instrumented.

---

## Sources

- **[S1]** Babypips — *3 Psychological Differences Between Demo & Live Trading*. https://www.babypips.com/trading/psychology-3-psychological-differences-demo-live-account-2025-07-21
- **[S2]** Traders Agency — *Paper Trading Account: Best Simulators Compared* (platform defaults: Alpaca $100k, thinkorswim $200k, IBKR $1M; IBKR simulated slippage; "practice your reality, not a fantasy"). https://tradersagency.com/blog/paper-trading-account-best-simulators-compared
- **[S3]** AlgoBulls — *Why Backtesting Environments Differ from Live Markets* (order-size vs ADV, square-root market-impact model, delay vs impact slippage, conservative cost modeling). https://algobulls.com/blog/algo-trading/backtesting-technical-factor  ·  LuxAlgo — *Backtesting Limitations: Slippage and Liquidity*. https://www.luxalgo.com/blog/backtesting-limitations-slippage-and-liquidity-explained/
- **[S4]** BrokerListings / TradingPedia / broker guidance — inflated $100k demo defaults are "highly unrealistic," match demo to intended live capital ($500–$1,000 examples), overtrading risk of fat practice books. https://www.tradingpedia.com/forex-brokers/demo-forex-account/  ·  https://brokerlistings.com/accounts/demo
- **[S5]** Bouchaud — *The Square-Root Law of Market Impact* (impact ∝ Q^½; log-concave refinement; participation-rate term). https://bouchaud.substack.com/p/the-square-root-law-of-market-impact  ·  *The two square root laws of market impact* (arXiv 2311.18283). https://arxiv.org/abs/2311.18283
- **[S6]** Emergent Mind — *Square-Root Law of Market Impact* (average impact scales as Q^½ relative to liquidity). https://www.emergentmind.com/topics/square-root-law-of-market-impact
- **[S7]** QuantConnect Docs — *Reality Modeling: Slippage* (sims must model slippage to match live). https://www.quantconnect.com/docs/v2/writing-algorithms/reality-modeling/slippage/key-concepts
- **[S8]** IBKR — *Paper Trading Account Reset* (resettable practice balance). https://ibkrguides.com/student-trading-lab-professor/en-us/account-reset.htm  ·  Alpaca — *Paper Trading* (resettable to arbitrary amount). https://docs.alpaca.markets/us/docs/paper-trading
- **[S9]** Lucid Trading — *New Live Structure* (on live transition, simulated funded account set to dormant, capital allocated). https://support.lucidtrading.com/en/articles/13425130-new-live-structure
- **[S10]** My Funded Futures — *Understanding Rapid Live* (on move to live, simulated prop accounts closed; eligible funded accounts transitioned). https://help.myfundedfutures.com/en/articles/13134718-understanding-rapid-live
- **[S11]** Kraken — *Overview of cryptocurrency minimums / minimum order size* and *Cost minimum for trading* (per-pair notional floor; order canceled if cost minimum not met). https://support.kraken.com/articles/205893708-minimum-order-size-volume-for-trading  ·  https://support.kraken.com/articles/12425041458708-cost-minimum-for-trading
- **[S12]** *Achieving Scale-Invariant Reinforcement Learning Performance with Reward Range Normalization* (magnitude-invariant performance via reward-range normalization). https://www.researchgate.net/publication/386459816_Achieving_Scale-Invariant_Reinforcement_Learning_Performance_with_Reward_Range_Normalization
- **[S13]** *A Reinforcement Learning Framework for Quantitative Trading* (arXiv 2411.07585, per-unit-risk returns, position scaled to max-allowed, input normalization across portfolio sizes) ·  *Normalization and effective learning rates in RL* (arXiv 2407.01800, running normalization → non-stationarity caution). https://arxiv.org/html/2411.07585v1  ·  https://arxiv.org/html/2407.01800v1

---
*Prepared by Langston, 2026-07-03. Citation-grade field pass per Kyle decision #3. Policy choices (1) + (2) stand as decided; this refines implementation only.*
