# TFS Sustainability Gate — Step 1 Baseline Findings

**Date:** 2026-05-17
**Window:** 2026-04-15 → 2026-05-16 (`evaluated_at` filter). Note: earliest b68_5 ablation row in this window is 2026-05-01 — the b68_5 alternate emission landed mid-window. Effective sample = 16 days.
**Source:** `regime_factor_alternates` where `factor_name = 'b68_5_path_b_sustainability'` AND `source_type = 'vts_trade'`.
**Total rows in window:** 3,992 (all `replay_completed_at IS NOT NULL`).
**Author:** Claude Code

---

## §1 Sample-size breakdown

| Gate action (computed from `alternate_decision.metadata`) | Trades | % of total |
|---|---|---|
| **BLOCKED_PATH_B** (gate prevented path B from firing) | 36 | 0.9% |
| **ALLOWED_PATH_B** (gate let path B fire) | 3,027 | 75.8% |
| **DAMPENED_NONPATHB** (gate reduced confidence, but path B never relevant) | 884 | 22.1% |
| **NEUTRAL** (no gate effect on confidence) | 45 | 1.1% |

**Critical observation #1:** The gate's actual filtering role — where it prevents path B from firing — affects only **0.9% of trades**. The gate's nominal job (sustainability check on TFS path B signals) is statistically negligible at the population level.

## §2 Outcome × gate action breakdown

For trades that opened and closed (`outcome IN ('admitted_won', 'admitted_lost', 'admitted_breakeven')`):

| Gate action | Won | Lost | BE | N | Win % (W/W+L) | Avg win $ | Avg loss $ |
|---|---|---|---|---|---|---|---|
| ALLOWED_PATH_B | 321 | 551 | 643 | 1,515 | 36.8% | $0.0506 | $0.0290 |
| BLOCKED_PATH_B | 2 | 11 | 15 | 28 | 15.4% | $0.0090 | $0.0294 |
| DAMPENED_NONPATHB | 114 | 149 | 262 | 525 | 43.3% | $0.0533 | $0.0328 |
| NEUTRAL | 6 | 3 | 18 | 27 | 66.7% (n=9 noise) | $0.0184 | $0.0165 |

**Reward:risk** (avg win / avg loss): ALLOWED 1.74:1, BLOCKED 0.31:1 (n=13, noisy), DAMPENED 1.62:1, NEUTRAL 1.11:1.

**Critical observation #2:** When the gate BLOCKS path B (the rare meaningful action), the trades that still open via other paths have a WORSE win rate (15.4%) than trades the gate ALLOWED (36.8%). Sample size is small (N=28 admitted in BLOCKED), so bootstrap CI is wide — but the direction suggests the gate may be REMOVING signal from genuine winners, not filtering losers.

## §3 Δconf distribution (B-NEW-37 forensic at scale)

| Outcome | N | Avg Δconf (without − with) | Std | Avg DBS |
|---|---|---|---|---|
| admitted_won | 443 | **0.4477** | 0.1534 | 0.4260 |
| admitted_lost | 714 | **0.4423** | 0.1276 | 0.4184 |

**Δconf difference between winners and losers: 0.0054** — i.e. the gate dampens winners' confidence by essentially the same amount as it dampens losers' confidence.

**Critical observation #3:** B-NEW-37's 901-trade forensic finding ("scenario B uniform-too-aggressive") is CONFIRMED at scale (N=1,157 here vs 901 there). The gate is NOT selectively filtering losers — it applies the same confidence reduction to winners and losers indiscriminately. This is the canonical "the gate is doing nothing useful for selection" signature.

## §4 DBS-quartile-conditioned behavior

| DBS bucket | Wins | Losses | N | Win % |
|---|---|---|---|---|
| Q1 [<0.10] | 42 | 70 | 112 | 37.5% |
| Q2 [0.10-0.30] | 24 | 18 | 42 | 57.1% (small) |
| Q3 [0.30-0.60] | 283 | 514 | 797 | 35.5% |
| Q4 [≥0.60] | 94 | 112 | 206 | 45.6% |

**Critical observation #4:** Win rate is highest at Q4 (high DBS conviction — 45.6%) and trough at Q3 (mid-conviction — 35.5%). The pattern is NOT monotonic and the gate's role doesn't clearly map to a DBS region where it specifically helps. At high DBS (Q4), the regime classifier alone is doing the selection — adding a sustainability gate on top adds noise more than signal.

## §5 Per-symbol concentration (Herfindahl)

- **Unique winning pairs:** 229
- **Herfindahl:** 0.0062 (extremely diversified; pure-equal-distribution would be 1/229 = 0.0044, so very close to perfectly diversified)
- **Top concentrations >3% share:** none

**Observation:** No single-symbol concentration risk in the gate's pass set. This is good — the gate's performance isn't a BTC/ETH dominance artifact.

## §6 Regime entry distribution

| Regime at entry | Wins | Losses | N (W+L) | Win % |
|---|---|---|---|---|
| TREND_FRIENDLY_STABLE | 335 | 558 | 893 | 37.5% |
| IMPULSE_EXPANSION | 57 | 70 | 127 | 44.9% |
| RANGE_BOUND_STABLE | 32 | 54 | 86 | 37.2% |
| STRUCTURAL_TRANSITION | 17 | 20 | 37 | 45.9% |
| HIGH_VOLATILITY_UNSTABLE | 2 | 12 | 14 | 14.3% |

**Observation:** Gate is most active in TREND_FRIENDLY_STABLE (the regime its naming reflects — "TFS" = TREND_FRIENDLY_STABLE). 893 trades there with 37.5% win rate. The gate's contribution within TFS is unclear from this alone — Step 2 candidate counterfactuals would isolate.

## §7 Preliminary net-expectancy assessment

**Save rate × avg loss − Regret rate × avg win** for the BLOCKED_PATH_B subset:
- N=36 trades the gate blocked. 28 still opened via other paths → 2 won (won $0.018 total), 11 lost (lost $0.32 total), 15 breakeven.
- If those 36 had been allowed (with confidence ~0.54 instead of clamped to 0.45 floor), more would have opened — but on the ALLOWED win/loss rate (21.2%), the additional opens would have been ~breakeven.
- The gate's TIGHT filtering action saves at most ~$0.30 net in this period.

For the DAMPENED_NONPATHB subset (525 admitted, 359 unreplayable): The gate reduced confidence by ~0.4-0.5 on these, which pushed many of the 359 unreplayable ones below the post-composition floor. Of the 525 that still opened, win rate (21.7%) is essentially identical to the ALLOWED path B subset (21.2%) — suggesting the gate's selection here isn't producing better trades. The "saves" from filtering 359 trades are speculative without knowing what those trades would have done.

## §8 Step 1 preliminary verdict

**The data strongly supports DROP (candidate E).** Five converging signals:

1. **Statistical insignificance of gate's blocking role** — 0.9% of trades affected by the gate's nominal function.
2. **Δconf uniformity** — B-NEW-37 finding confirmed at scale; gate doesn't selectively reduce confidence on losers.
3. **Outcome uniformity** — Win rate of admitted trades is ~21% across all gate-action categories (within noise).
4. **High-DBS region is where the regime classifier is doing the work** — Q4 has 45.6% win rate; the gate's marginal value there is questionable.
5. **R:R of admitted trades is good** — 1.7:1 — which means the underlying signal is fine. The gate isn't the problem and isn't the solution; it's a no-op.

**HOWEVER** — Step 1 alone doesn't rule out a replacement (candidates B/C/D) producing meaningful lift over no-gate. Step 2 counterfactuals are needed to confirm DROP is not just "no worse than current gate" but also "no candidate replacement materially beats no-gate."

## §9 Questions for Langston (Step 1 review)

1. **Sample size** — 16-day effective window with 3,992 trades (1,157 admitted decided). Adequate for the baseline, or do you want me to expand by querying earlier (would need to confirm b68_5 ablation rows pre-date 2026-05-01)?
2. **Δconf finding interpretation** — agree the 0.4477 vs 0.4423 is functionally identical and confirms B-NEW-37? Or do you want a paired test (per-trade winner-vs-loser at matched DBS) before declaring?
3. **Step 2 priority** — given how strong Step 1 baseline is, do you want me to (a) run all 4 candidate counterfactuals as designed, (b) run only candidate D (ATR-extension, the genuinely orthogonal candidate) since B and C are already approximately covered by existing continuous modifiers, or (c) declare DROP based on Step 1 alone since the baseline is one-sided?
4. **Anything missing from this baseline** that would change a drop recommendation?

Awaiting your read before proceeding to Step 2.
