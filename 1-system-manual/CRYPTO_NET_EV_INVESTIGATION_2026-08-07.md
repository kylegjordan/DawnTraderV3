# Crypto Net-EV Investigation — why almost every crypto signal scores negative

**CC-C (Claude Analyst), 2026-08-07. Kyle-directed:** *"if they are actually only produce shitty signals that should have a negative EV, then I guess that's just the nature of crypto. But if they are all getting negative EVs because we've got incorrect ranges set or our calculation is designed more for a different type of asset class, then let's identify what we're doing wrong."*

**ANSWER, up front: neither, quite.** The signals are not being scored unfairly, and the calculation is not miscalibrated for the asset class. **The geometry the strategies hand to the calculation cannot clear the fee at ANY win probability the model is permitted to assign.** That is arithmetic, and it is shown below before anything is recommended.

---

## 1. THE PROOF — the ceiling is negative

**The kernel** (`server/core/calculations/net-expectancy-kernel.ts:114-115`):
`rawEV = pWin × distTarget − pLoss × distStop` · `netEV = rawEV − totalFriction`

**pWin is HARD-BOUNDED `[0.40, 0.60]`** (`:72-74`, `DEFAULT_MIN_PWIN`/`DEFAULT_MAX_PWIN`), derived as `minPWin + DI/200`. ⇒ **0.60 is a ceiling no crypto signal can exceed, however good it is.** The code already knows crypto sits there — `maker-taker-decision.ts:15` states it as established: *"friction dominates; pWin already at the 0.60 ceiling."*

**MEASURED geometry** — object `rtb_signals`, population ALL crypto rows (n=2; the queue is nearly empty, which is itself the symptom): **target 2.081%, stop 1.248%, R:R 1.67:1.** Friction: Kraken Tier-1 **maker round-trip 0.80%** (0.40% × 2), and the rejects say *"chosen maker mode"* — the system is already taking the cheaper path.

| pWin | raw EV | net EV after 0.80% | verdict |
|---|---|---|---|
| 0.40 (floor) | +0.084% | **−0.716%** | negative |
| 0.50 | +0.416% | **−0.384%** | negative |
| 0.55 | +0.583% | **−0.217%** | negative |
| **0.60 (CEILING)** | +0.749% | **−0.051%** | **negative** |

⇒ **The entire permitted pWin range is negative. The best case the model can produce is −0.051%.** A crypto signal cannot score positive at this geometry — not "rarely", *cannot*.

**Break-even target required, at the measured 1.248% stop:** pWin 0.60 → **2.165%** (short by 0.084 pts) · pWin 0.55 → **2.476%** · pWin 0.50 → **2.848%** (a **37% larger target** than today's 2.081%).

**Corroborating live rejects** (`signal_eval_archive`, 24h, `reject_stage='sqe'`): the crypto NetEV rejects cluster at **−0.006 to −0.011**, exactly the small-negative band this table predicts. Crypto: 11,479 SQE rejects / 583 admitted. *(Note: crypto admits MORE than xStock's 95 — the scarcity is downstream of admission, which is a separate thread.)*

## 2. ROOT CAUSE — and the design decision that is CORRECT

**`signal-target-normalizer.ts:88-94` — the floor-LIFT was REMOVED, deliberately, at reorg-B2.1 OBJ-1 (2026-06-21):**
> *"the floor-LIFT is REMOVED — never mutate a strategy's target… Lifting a sub-floor target to clear the RR gate was fabricating reward on the reward leg (the Net-Expectancy anti-pattern) and produced a target the strategy never chose. cost-coverage is enforced by the Net-Expectancy gate."*

**That reasoning is right and should not be undone.** Manufacturing a target the strategy never chose, purely to pass a gate, is fabricating the reward leg. The architecture is honest: **strategies choose targets; the Net-EV gate refuses the ones that cannot pay.** It is doing exactly that.

**⇒ RULE-24 DISPOSITION: (2) WORKING AS DESIGNED, UNADDRESSED. Emphatically NOT (1) a defect.** No code is misbehaving. **What is missing is a DECISION: what should crypto strategies TARGET, given a fee floor nobody sized them against?**

**★ TWO ARTEFACTS OF THAT MISSING DECISION, both measured in `module_constants` / `expectancy_gates`:**
1. **`crypto_spot.target_floor_pct = 0.040` (4%) IS STILL CONFIGURED AND IS DEAD** — its only consumer was the removed lift. Someone judged 4% the right crypto floor; the mechanism that applied it was deleted for unrelated (and good) reasons, and **the number was never re-homed.** ⚠️ At a 4% target the arithmetic inverts: pWin 0.50 → **+0.576% net EV, positive.** *The value that would make crypto viable is sitting in the database, unused.*
2. **`crypto_spot.roi_absolute_min = 0.015` (1.5%) is the live floor** — and **at a 1.5% target, the 0.80% round-trip fee is 53% of the entire target.** That ratio is the finding in one number.

## 3. INDUSTRY COMPARISON — what the fee environment actually is

- **Institutional systematic backtests assume 3–5 basis points** of round-trip transaction cost ([QuantPedia](https://quantpedia.com/the-price-of-transaction-costs/?a=6080)). **Kraken Tier-1 maker round-trip is 80 bps — 16× to 27× the standard assumption.** We are not trading in the cost environment the textbook methods assume.
- *"even 1 percent of total transaction cost can consume a very large part of net edge"* and realistically obtainable edges are *"rarely much higher than a few percent"* before costs ([QuantPedia](https://quantpedia.com/the-price-of-transaction-costs/?a=6080)) — our 0.80% sits squarely in the band the literature calls edge-consuming.
- **The canonical practitioner response is the one we have not taken:** *"Algorithms respond to rising costs by holding positions longer to amortize the fixed per-trade cost over a larger profit target"* ([LedgerMind](https://theledgermind.com/algorithmic-trading-strategies-crypto/)). Empirically, [Bitcoin algo研究 (PeerJ)](https://peerj.com/articles/cs-337/) found returns went negative at a 2% fee but positive again at 4% **on a 30-day horizon** — the horizon, not the fee, is what rescued them.
- Maker-over-taker is worth 30–50% of fee cost ([BTCC](https://www.btcc.com/en-US/academy/crypto-trading/trading-guide/maker-vs-taker-fees-in-crypto-trading-how-exchange-fee-structures-impact-your-net-profits)) — **we already do this**, and it is why the numbers are −0.05% rather than −1.0%.

## 4. WHAT THIS IS NOT

- **Not a bad-signal problem.** The gate never reaches signal quality; the geometry fails first.
- **Not a mis-set EV formula.** The kernel is asset-class-agnostic and correct.
- **Not fixable by lowering the EV bar.** A negative-EV trade admitted by a looser gate is still a losing trade — that is the exact flattery Kyle ruled out (*"doesn't make shitty signals look like they are potential opportunities"*).

## 5. THE OPTIONS (Kyle's decision — NOT taken unilaterally)

| # | Lever | Effect | Cost |
|---|---|---|---|
| **A** | **Raise `roi_absolute_min` toward the dead 4% floor** (fee ≤ ~20% of target) | crypto becomes positive-EV at pWin 0.50 | fewer signals qualify; strategies must be able to *find* 3-4% moves |
| **B** | **Lengthen the crypto horizon** (bigger bars ⇒ bigger ATR ⇒ bigger native targets) — *the industry's own answer* | amortises a fixed fee over a larger move | slower cadence, less data per day |
| **C** | **Attack the fee** — volume tier, or maker-only enforcement | shifts the whole table up | tier needs volume we don't have; maker-only costs fill rate |
| **D** | **Raise the pWin ceiling above 0.60** | mechanically lifts EV | ⚠️ **fabricates edge unless justified by realised win rates** — the same anti-pattern as the removed lift. Would need evidence, not a dial-turn |
| **E** | **Accept crypto is marginal at this fee tier** and let xStock carry | honest | forgoes the asset class for now |

**CC-C's recommendation: B first, then A.** B is what the industry actually does and does not touch any threshold; A re-homes a number the project already chose. **D is the one to refuse** — it is the "make bad signals look good" failure by another route.

## 6. OPEN THREADS (for the pre-audit, not asserted here)

- **Where do the native 2.08% targets come from?** The normalizer is formula-agnostic; 10 strategies use `mult × ATR`, 9 are heterogeneous. **Whether 2.08% is an ATR-horizon artefact (⇒ option B is decisive) or a hard-coded multiple (⇒ option A) is NOT yet established, and it determines which lever is right.**
- Crypto admits 583/24h vs xStock's 95, yet crypto trades are scarce — **the admission-to-open gap is a separate mechanism** and is not explained by anything above.
- `min_rr` for `volatility_edge` and `support_bounce` is **1.0** — at R:R 1.0 the EV ceiling is `0.2 × target − friction`, needing a **4.0% target** just to break even at the pWin cap. Those two strategies are structurally the worst-placed and may warrant their own ruling.
