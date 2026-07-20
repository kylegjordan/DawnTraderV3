# PAPER-ACTIVE SOAK ANALYSIS — findings, corrections, and change requests
**Author:** CC-C ("Claude Analyst") · **Date:** 2026-07-20 · **Lane:** READ-ONLY analyst (Kyle directive 2026-07-19)
**Status:** DRAFT — awaiting Langston review (Kyle directive 2026-07-20: "document all findings … Langston should be notified to review")
**Population:** active-path `closed_trades`, 2026-07-15 → 07-19 (crypto flipped ~07-14). **VTS never blended** (separate population).

---

## 0. HOW TO READ THIS — the one thing that must not be missed

> ### ★★ THE ADMISSION-LANE SPLIT IS MANDATORY BEFORE ANY RESULTS CLAIM
> Every active-path trade carries `closed_trades.metadata->>'admissionBasis'` ∈ {`organic`, `exploration`}.
> **`exploration` trades are admitted on KNOWN-NEGATIVE net expectancy, deliberately, by the governed exploration lane** (`server/services/execution/exploration-lane.ts`; budget + anneal; the `[11.8B]` open-gate carries an explicit by-design carve-out — see #523, #514, #508, #505).
> **Pooling the two lanes reads a deliberate learning spend as strategy failure.** I did exactly that on 2026-07-19 and gave Kyle a false headline before catching it. Any future analysis MUST split first.

---

## 1. TASK 1 — Kyle's three questions (2026-07-19)

### 1.1 WHAT IS THE DATA
169 closed / 122 with outcomes at first pass; 175 with an admission stamp; 126–128 with complete geometry depending on the field set. Span **4.6 days**. Crypto 145 / xStock 24. Maker 140 / taker 29 — **entry-mode and asset-class are confounded**, so no independent maker-vs-taker read is supportable.
**Verdict: the sample does NOT support per-strategy or per-regime conclusions.** The regime cut is impossible outright — the regime input was a frozen constant for the entire soak (§3.4).

### 1.2 WHAT IS THE FEE PICTURE — split by lane (the corrected view)

> ⚠️ **READ THE LANE COLUMN BEFORE THE P&L COLUMN.** These two rows are not a comparison of good trades against bad trades. They are **the cost of data** next to **the return on selection** — two different activities that happen to share a P&L column. The exploration row is *supposed* to be negative; a positive number there would mean the lane was not doing its job.

| lane | what it is FOR | n | winners | win-rate | net P&L | fees | avg/trade |
|---|---|---|---|---|---|---|---|
| **exploration** | **buying learning data** — deliberately admits known-negative-EV trades to measure fill rates and per-strategy outcomes. **Losing money is the mechanism, not the failure.** | 142 | 25 | 17.6% | **−$133.41 (the price paid for the data)** | $112.29 | −$0.939 |
| **organic** | **the actual strategy** — admits only on positive expected value | 33 | 11 | 33.3% | **+$1.37 net, after paying $32.71 in fees** | $32.71 | +$0.042 |

Organic by class: **crypto 9 trades / 7 winners / +$40.75** (fees $9.99) · **xStock 24 trades / 4 winners / −$39.37** (fees $22.72) — ⚠️ **xStock cell is PROVISIONAL-pending-#544** (§3.5: no weekend mechanism + the 07-19 capture outage bind every xStock number).

⇒ **The trades the system selected on their own merits paid their fees and finished marginally positive.** The losses are concentrated in the lane designed to lose.

> ### ⚠️ MANDATORY FRAMING GUARD (Langston review condition 2) — attach this EVERY time the organic result is stated
> **+$1.37 on n=33, and crypto-organic +$40.75 on 9 trades / 7 winners, DEFEATS "lost cause". It does NOT establish profitability.** At those sample sizes this is noise. The finish line for a real verdict is **~350–370 pooled trades (≈2 weeks)**, and the clock starts only after the regime gate reads live inputs and the refresh consolidation lands. Quoting the positive number without this guard lets a coin-flip read as an edge.

### 1.3 WHAT CLEARS THE FEE BAR — **size**, not shape
Sorting all 126 complete-geometry trades by target distance:

| target band | n | avg target % | avg stop % | implied RR | net P&L |
|---|---|---|---|---|---|
| < 2% | 72 | 1.01 | 0.89 | ~1.13 | **−$87.14** |
| 2–4% | 26 | 2.77 | 2.32 | ~1.19 | **−$45.51** |
| ≥ 4% | 28 | 7.22 | 5.60 | ~1.29 | **−$0.81** |

Monotonic in size; **reward-to-risk is flat (1.13 / 1.19 / 1.29) across all three bands.** The population is correctly *shaped* and too *small* to clear friction.
⇒ **This kills any "raise min_rr" response** (Langston concurs). Independently corroborated by the #501 baseline over 12,078 VTS trades: for crypto, tightening the geometry floor makes outcomes **worse**.

### 1.4 IS IT A LOST CAUSE — **No**, and the framing itself was wrong
**★ The switch-on was RATIFIED AS DATA-COLLECTION, NOT PROFIT.** #501 seed, 3-way sealed 2026-07-13 (`P25_SCORING_STACK_PRESTUDY.md` §159): *"the harness CONFIRMS the ratified EXPLORATORY posture (clean-data-collection, NOT expected-profit at the flip)"* — both classes on bare `netEV>0` + a tight Kelly cap, **no floor seeded for either class, deliberately.**
⇒ Measuring this soak for profitability and concluding the fee is insurmountable **judges it against a bar the crew explicitly declined to set.** Same error class as §0, one level up.
**Finish line for a real verdict:** ~350–370 pooled trades ≈ 2 weeks, or ~100/strategy ≈ 6+ weeks — with the clock starting only after the regime gate reads live inputs and the refresh consolidation lands. Today's data is PROVISIONAL.

---

## 2. TASK 2 — the steps 1–4 analysis (Kyle directive 2026-07-20)

### 2.1 Step 1 — is the gate's arithmetic sound? **YES. My defect hypothesis is REFUTED.**
Hypothesised a repeat of the B8.5c/#503 friction-units bug (kernel works in price units; `computeTotalRoundTripCost` returns a RATE). **All three kernel call sites convert correctly:** `expectancy.ts:636` (`frictionPct * tradeMeta.entryPrice`), `signal-orchestrator.ts:2502` (`frictionPct * entry`), `maker-taker-decision.ts:222/241` (`× entryPrice`).
**Decisive check:** independent recomputation of the kernel from stored `rtb_signals` inputs — incl. the `quant-strong_trend` `|DBS|/2` branch — reproduces the stored `chosen_net_ev` **to 3 decimals** (−0.7373% computed vs −0.737% recorded). Gate math verified correct.

### 2.2 Step 2 — is the win-probability input effectively constant? **NO. My claim is REFUTED.**
I generalised from the kernel's `DI = 50` default (which does saturate the 0.60 ceiling). **Live data disagrees:** real `di_at_queue` runs low, giving **avg pWin ≈ 0.4621** — near the floor, and it varies. The assumed-vs-realized gap is **~46-vs-26, not 60-vs-26**.
⚠️ **CC-A's correction, accepted:** that sample is queue-only = NON-promoted signals = selection-biased. It is adequate for a constant/not-constant question (a constant cannot hide in a subsample) but NOT for distribution shape.

### 2.3 Step 3 — check against ratified Phase-25 work. **Done; it changed the answer (§1.4).**
⚠️ **Path correction:** the prestudy lives at `Claude Comms and Packages/Scope Files/P25_SCORING_STACK_PRESTUDY.md`, **not** `1-system-manual/`.
Also confirmed: the pWin placeholder is **empirically INVERTED** (§4 probe — predicted 0.421→0.600 while realized WR stays flat 0.285–0.323; the bucket predicting 0.600 realized 0.316; n 883–5,342 = powered nulls). Its recalibration is already homed at **25-4 / #399a**; fee ladder at **25-10**; NetEV judgment-quality at **25-19**.

### 2.4 Step 4 — the replay (Langston-cleared; REALIZED friction `total_fee/quantity`)

| assumed win rate | exploration: admitted / 101 | organic: admitted / 27 | organic realized P&L |
|---|---|---|---|
| 0.60 | 4 | 19 | +$6.48 |
| 0.50 | **0** | 9 | +$9.43 |
| **0.46** | **0** | **5** | **+$16.02** |
| 0.40 | **0** | 2 | −$3.12 |
| 0.35 | **0** | 1 | −$1.50 |
| 0.26 | **0** | 0 | $0 |

**Two conclusions:**
1. **The dial is POWERLESS against the actual losses.** At 0.50 and below, **0 of 101** exploration trades would be admitted — i.e. the assumed win rate never governed them; the exploration carve-out did. Lowering it would not have prevented the bleed.
2. **Where it does bite, the current setting is already near-best, and tightening reverses it** — non-monotonic, peaking near where we sit.

**RECOMMENDATION: do NOT lower the assumed win rate.** ⚠️ Best cell = **5 trades**; shape suggestive, magnitudes noise.
**STANDING LIMIT (Langston condition, restated):** this **PRUNES the observed set; it cannot GENERATE the alternative set.** The rejected-candidate records are deleted (§3.1), so it bounds downside removed and says **nothing** about upside forgone.

---

## 3. STANDING FINDINGS

### 3.1 Decision-record RETENTION is asymmetric — and backwards for auditing
**PROMOTED signals PRESERVE their verdict:** `closed_trades.metadata` carries `netEvAtAdmit` / `admissionBasis` / `floorInEffect` / `policyVersion` / `rtbQueueId` / `queuedAt` on **175/175** rows (+ `regimeWeight` on 153, `rankAtPromote` on 35).
**DECLINED signals LOSE theirs entirely** when the transient `rtb_signals` row is deleted — no trade row is created to carry it. `rtb_signals` held 12→18→21 rows, all `queued_at` ≥ 07-18, while the trades in question opened 07-15→07-19.
⇒ We retain the reasoning for what we DID and discard the reasoning for what we REFUSED. **This is the counterfactual Phase-25 calibration will want, and it is being thrown away continuously.**
*(I initially stated this backwards and both CC sessions began scoping on it; corrected in-channel before any work landed.)*

### 3.2 The 4% target floor is NOT a live rule — it is orphaned config
`expectancy_gates.target_floor_pct = 0.040` still sits in the DB, but **reorg-B2.1 (2026-06-21) deliberately DROPPED the floor-LIFT** as a target mutation redundant with `[11.8B]` (`SYSTEM_MANUAL.md:427-430`, `SYSTEM_IMPACT_MAP.md:211`). The consumer is gone; the row reads like a live 4% rule. **It misled me into filing a suspected defect.** Rule 18 applies.

### 3.3 The fee-drag dashboard metric is computed on inconsistent bases
Gross is derived from the **intended** entry price while net uses the **actual** fill price (83 of 169 rows disagree) — which is how it prints an impossible 154%.
**One-line fix:** *divide total fees by gross profit on winning trades only, with gross derived from the same actual fill prices the net figure uses.* True figure on this soak: fees = **31% of gross profit** on the 44 target-hits.

### 3.4 Regime input frozen; the "variety collapse" was a measurement artifact
VTS `regimeWeight` is **~98% EXACT ZERO since ~07-14** (0% on 07-12/13 → 48.7% 07-14 → 97.8% 07-16 → 98.8% 07-19). Exact 0 is **structurally unreachable** from `0.7×trendScore + 0.3×(1−volatility)` — and CC-B confirmed a `Math.max(0.1, …)` floor in `score-calculator.ts:71-81`, so 0 is not a computed value at all.
**Consequence delivered to CC-A:** the daily distinct-value "collapse" he flagged as a possible regression from his own deploy tracks **non-zero row count**, not variety (distinct ≈ non-zero rows in every daily bucket), and hourly bucketing shows **no transition edge**. His deploy is not implicated. It also invalidated a **41.11%-below-floor** figure that had reached #543, the batch scope, and Kyle — **retracted by CC-A, wrong by ~600×.**

### 3.5 xStock has no weekend mechanism (#531) — plus a live capture outage
xStock trades 24/5 (Sun 8pm ET → Fri 8pm ET). There is no rule suspending admission before the close, no flatten-or-hold decision, and no protection during the ~48h window; 4 positions were carried through 07-17→07-19 with exits unable to act. Kyle ruling pending. Separately, on 07-19 all 478 xStock symbols stopped recording at **21:55:13Z**, 9 seconds after a restart, and stayed dead through the reopen (CC-A/CC-B own this; #544). **Both bound every xStock number in this document.**

---

### 3.6 ★ The exploration spend stayed INSIDE its governed envelope — and the anneal is self-reducing
*(Added to discharge Langston review condition 1: "show the −$133.41 stayed inside the budget/anneal envelope — otherwise it could be an overrun wearing a by-design costume." **Measured, not assumed.**)*

| date | admits | `floorInEffect` | daily net |
|---|---|---|---|
| 07-15 | 39 | −2.000% | −$46.04 |
| 07-16 | 20 | −2.000% | −$39.16 |
| 07-17 | 29 | −2.000 → −1.500% | −$34.61 |
| 07-18 | 22 | −1.500% | **+$1.91** |
| 07-19 | 30 | −1.500% | −$16.74 |
| 07-20 | 3 | −1.500% | −$2.40 |

1. **Budget never exhausted** — max 39 admits against a configured `exploration_lane.daily_budget` of 50. **Not an overrun; the hypothesis is falsified.**
2. **The anneal functions exactly as specified** — `base_floor_pct` −0.02 + `anneal_step_pct` 0.005 × 1 step = −0.015, and the per-trade stamped `floorInEffect` moved −2.000% → −1.500% on 07-17/18 after `anneal_step_trades`=60 informative closes accrued. Visible in persisted data, not inferred.
3. **The subsidy is SELF-REDUCING** — daily net improves monotonically-ish as the floor tightens (−$46 → −$39 → −$35 → **+$1.91** → −$17). This strengthens the framing from "designed to lose" to **"designed to lose, and designed to stop losing."**

⚠️ **SURFACED, NOT FILED (§9.5 b-ii):** the live `daily_budget` is **50**/class, but `exploration-lane.ts`'s own header documents *"3-way consensus (CC-A + CC-B + Langston, 2026-07-15) + Kyle GO (budget 25-30/day)"* — ~2× the documented approval, and 07-15's 39 admits sit above the documented 25–30 while below the configured 50. **I have NOT searched for a later approved change to 50 and do not assert one is absent.** → **CR-8**.

---

## 4. CHANGE REQUESTS (I hold no write access — each needs an owner + a named home)

| # | Request | Type | Suggested home / owner |
|---|---|---|---|
| **CR-1** | **Persist the decision record for DECLINED signals** (§3.1). Langston already ruled this "real and needs a home now, not a flag" (§9.4). | Capture/observability | Rides the placeholder/observability family (#545/#546) **or** its own item — CC-A/CC-B to place |
| **CR-2** | **Fix the fee-drag metric** per §3.3 one-liner. Currently overstates ~5× and is on a dashboard Kyle reads. | Dashboard/data-quality | Small batch, owner TBD |
| **CR-3** | **Dispose of `target_floor_pct`** (§3.2) — delete the row or document it as deliberately retained. Rule 18: no lingering legacy. | Config hygiene | Rule-18 disposition, owner TBD |
| **CR-4** | **Rule on the xStock weekend posture** (#531) — suspend / flatten / deliberate hold + a calendar admission gate. | **Kyle decision** | Pending Kyle |
| **CR-5** | **Write the admission-lane split rule (§0) where the next analyst hits it before drawing conclusions** — this is a METHOD rule, not an issue. | Governance/method | Prestudy or an analysis-discipline note |
| **CR-6** | **Answer: did prestudy §4b item (E) scope pWin neutralization to `signalStrength` only (landed 07-13 as `scoring_base.flat_pwin_base`), or ALSO the kernel pWin** (`expectancy_kernel` 0.40/0.60, untouched since 05-05)? | Question, NOT a finding | Asked of CC-B (P19-B8.5a owner) |
| **CR-7** | **Do NOT lower the assumed win rate** (§2.4). Recorded so it is not re-litigated. ⚠️ See §7 — the evidentiary weight sits on #501, NOT on my replay. | Decision record | This document |
| **CR-8** | **Reconcile `exploration_lane.daily_budget` (live = 50) against the documented Kyle GO of 25–30/day** (§3.6). Deliberate raise → the file header is stale and must say so. Drift → 07-15's 39 admits were outside the approved envelope. | Governance reconciliation | Langston to rule; owner TBD |

---

## 4b. LANGSTON REVIEW — RECEIVED 2026-07-20 (Kyle-directed)

**Verdict: "Nothing blocks."** Both load-bearing claims hold.
- **§1.4 reframe — CONFIRMED verbatim-accurate.** Langston independently re-read `P25_SCORING_STACK_PRESTUDY.md` §159 at `origin/migration/aws-supabase` (not from memory, not from my gloss) and confirmed the quote exact. *"Kyle's lost-cause answer can rest on this — it's sealed 3-way, not reported."*
- **§0 admission-lane split — "does NOT overstate. It's the correct lens, and pooling was the error (I made it too, in the EV-gate read)."**
- **CRs endorsed:** CR-1 (re-confirmed his own earlier ruling), CR-2, CR-3 (Rule 18 §15 — document-then-delete), CR-5, CR-7 (concurs; dial powerless against the bleed, n=5 caveat intact).
- **Three conditions — ALL DISCHARGED OR ACCEPTED:** (1) budget-envelope check → §3.6, hypothesis falsified; (2) organic-positive framing guard → §1.2 blockquote; (3) xStock PROVISIONAL-pending-#544 → §1.2 + §3.5.
- **Scope of his ruling, stated honestly:** he independently re-verified ONLY the §1.4 citation. The lane counts (142/33/175) and P&L figures are ruled on **as my reported measurement, not re-queried.** I have asked him to re-query the split directly before it reaches Kyle as load-bearing, since everything now rests on it. **Until he does, treat the split as single-sourced.**

---

## 5. PROCESS NOTE — where I was wrong, and what it implies

I was **wrong four times** in this analysis: (1) the friction-units defect; (2) "pWin is pinned at the ceiling"; (3) the retention gap stated backwards; (4) "a ratified pin was never implemented" — the pin **had** landed (`scoring_base.flat_pwin_base`, 2026-07-13 15:08Z, `p19-b8-5a`); I checked the wrong knob and nearly filed a false defect against reviewed work.
**Every error came from reasoning about code structure. Every conclusion that survived came from querying data.** §9.5(b-ii) ledger-search caught #4 and would have caught #2 sooner.
⇒ **Weight my code-reasoning claims lightly; weight my measured claims normally.** Recorded as a standing rule in `MEMORY_CC_C.md`.

---

## 6. ON WRITE ACCESS + COLLISION MANAGEMENT (Kyle raised 2026-07-20)

Kyle: *"over time it may make sense to change your read-only access to write access … we just need a way to manage things so we don't have three of you colliding."*
**Evidence from last night that the concern is real and current:** CC-A and CC-B independently called the wrench on `RUNNING_ISSUES.md` within moments of each other and both began minting **#544 and #545 with different content**. Neither had seen the other's claim. I saw both and flagged it before either write landed; CC-B held uncommitted, CC-A renumbered. **That is two sessions, not three, and it still collided.**
**Concrete proposal, for Langston + the crew to accept, amend, or reject:**
1. **Keep me read-only on `server/` permanently.** Nothing in the analyst role needs it, and the separation is what makes my findings independent.
2. **Grant write ONLY to analysis artifacts** — this document's family plus `MEMORY_CC_C.md`. Narrow, and it removes the current hand-off latency (four findings sat un-homed last night purely because I could not file them).
3. **Make the wrench call BLOCKING, not advisory:** announce → **wait for an explicit ack or 60s of silence** → then write. CC-A's own post-mortem was that he "announced the wrench and then wrote both entries before checking whether the other had answered." Announcing is only half a lock.
4. **Reserve issue-number blocks per session** rather than grep-max-then-take (the exhausted-blocks note in shared MEMORY). Grep-max is a read-modify-write race by construction — exactly what produced the duplicate #544/#545.
5. **A third party watching the channel has value.** I caught the collision *because* I was not writing. Whatever access model lands, keep someone in a position to notice.

---

*End. Prepared for Langston review per Kyle directive 2026-07-20.*
