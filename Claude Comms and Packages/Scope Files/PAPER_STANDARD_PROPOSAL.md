# PAPER-STANDARD — "comfortable in paper", in numbers (PROPOSAL r1, for Langston, then Kyle)

> **Owner:** CC-C + Langston · **Kyle approves the numbers** · **Plan:** `PUSH_TO_LIVE_PLAN.md` Wave 0 row 8 ("set the numbers for 'comfortable in paper' BEFORE the evidence comes in").
> **Why now:** Kyle's go-live gate (`POST_AUDIT_ROADMAP.md:37`) is *"calibrate in paper until COMFORTABLE with wins/losses/profit — THEN proceed."* A standard written after the evidence arrives can always be made to pass. So it is fixed here first, and not changed once the window opens.

## 1. WHAT THE NUMBERS MUST SERVE
1. **Fidelity to live:** judged only on trades that paper executes the way live would. That means the **organic lane only** (the exploration lane deliberately admits trades expected to lose, and would read as strategy failure: `MEMORY_CC_C` headline finding), at **today's sizing** (Kyle's option (c), 2026-09-28).
2. **One clean window per class:** it opens only after the pricing work and the reachability fit land (*"the reset is last"*). **No calibration-epoch boundary inside it.** A deploy that changes a price, a fee, a level or a gate splits or voids the window, as pre-registered below.
3. **Per class, separately:** crypto and xStock are judged on their own numbers. Neither class's result can carry the other.

## 2. MEASURED STARTING POINT (active paper, `closed_trades`, `closed_at` in the last 14 days, 2026-09-28)
| class | closes (organic) | per day | net total | net per trade (mean ± sd) | win rate |
|---|---|---|---|---|---|
| crypto | 103 (99 filled) | 7.4 | −$5.74 | −$0.06 ± $10.70 | 39.8% |
| xStock | 41 (40 filled) | 2.9 | −$28.43 | −$0.71 ± $4.87 | 36.6% |
*No exploration-lane closes in the window. Average trade size: crypto $93, xStock $143. These are the pre-reset numbers the standard must NOT be judged on.*
⇒ **The spread is wide** (crypto per-trade sd ≈ $10.70). A test that must *prove* profit at 90% confidence needs a large average edge or a large sample: at n = 150 crypto trades, the mean would have to exceed about **+$1.12 a trade (≈ 1.2% of trade size)**; at n = 300, about +$0.79.

## 3. THE PROPOSED STANDARD — ALL MUST HOLD, PER CLASS
| # | test | proposed number | why this number |
|---|---|---|---|
| S1 | **minimum sample** | crypto **≥ 150** filled organic closes AND **≥ 21 days**; xStock **≥ 100** AND **≥ 30 calendar days** | about 3 weeks for crypto and 5 for xStock at today's rates; long enough to span more than one regime |
| S2 | **profitable after all costs** | total net P&L **> 0**, AND the **one-sided 80% lower bound** of mean net per trade (bootstrap, 10,000 resamples) **> −$0.25** | S2 asks "not losing, with reasonable confidence", not "proven profitable at 90%". The 90% version is shown beside it as information: at the measured spread it would need months. ⚠️ **What the proposed bar still demands:** at the measured crypto spread and n = 150, a lower bound above −$0.25 needs a mean of about **+$0.48 a trade** (≈ 0.5% of trade size), so it is not a lenient bar. **This is the main number for Kyle.** |
| S3 | **consistent, not one lucky run** | net positive in **≥ 3 of the last 4 weekly buckets**, and **no single trade > 25%** of the window's total net profit | stops one outlier carrying the verdict (the measured sd shows outliers exist) |
| S4 | **bounded pain** | peak-to-trough drop in cumulative net **≤ 8% of the paper balance**, and **no daily-loss kill-switch trip** in the window | the kill switch is the live safety line, so the window must not have needed it |
| S5 | **executes like live** | the maker fill rate is reported with its never-filled count; booked exit slippage is compared with the modelled cost, and the median gap must be **≤ 0.10% of trade size** | profit that depends on fills live would not get is not profit |
| S6 | **reported honestly** | every number carries n, the window and the class; the exploration lane and never-filled rows are shown separately, never pooled | rule 29 |

**Window mechanics (pre-registered):** the window opens at a stated anchor after the reset. A deploy that changes a price job, a fee, a level, a gate or sizing **voids** the window and re-opens it; it is never split and pooled. Hitting S1 triggers the read, and the read is done once. A FAIL on any test is reported as a FAIL, with the named follow-up, never as "extend until it passes". One extension is allowed only for S1 (not enough trades), stated in advance.

## 4. DECISIONS THAT ARE KYLE'S
1. **S2's bar:** "not losing with 80% confidence (> −$0.25 a trade)" as proposed, or "profitable with 90% confidence" (needs a larger edge or months more data).
2. **S4's drawdown limit:** 8% of balance as proposed, or tighter or looser.
3. **Whether both classes must pass before either goes live** (the plan's D5, *"launch live TOGETHER"*), or whether crypto may go first if xStock is still collecting.

## 5. FOR LANGSTON — the questions I want attacked
- Is a bootstrap lower bound on the mean the right statistic under these fat tails, or should S2 use a trimmed mean or a median-based bound?
- S3's "no single trade > 25% of net": the right guard, or a leave-one-out re-test of S2?
- Does S5's 0.10% median-gap threshold match what the fee and slippage model assumes today?
