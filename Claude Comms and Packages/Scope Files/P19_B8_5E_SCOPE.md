# P19-B8.5e — RISK-DERIVED PER-SYMBOL MARK STALENESS + LULD PLAUSIBILITY

change-class: architecture

**Phase:** 19 · **Owner:** CC-B · **Ledger:** `#548` (+ addenda 1 & 2) · **Sub-batch of:** the B8.5 switch-on arc
**Supersedes:** `B-XSTOCK-EXIT-PLAUSIBILITY` as a standalone batch, and its Kyle decision paper (`31395764e`) — **Kyle supplies nothing; see §1.**
**Status:** Step-1 draft → Langston. No code written.

> ⚠️ **BATCH-ID NOTE:** originally filed as `P19-B8.5d`. **That id was already taken** by CC-A's sizing tune-3 (`P19_B8_5D_SCOPE.md`, 2026-07-16). Corrected to **`B8.5e`** and recorded in `#548` rather than silently renamed.
> **Why `architecture`:** this changes *when a position is permitted to close* on the active-trading path. Strictest doc-set regardless of diff size.

---

## 1. What this batch is, in one paragraph

The mark-staleness ceiling is **one global 90-second constant** applied to symbols whose **risk-per-second varies ~11×**. It is therefore **simultaneously too loose on the dangerous names and too tight on the safe ones**: we are blind to ~4% of adverse movement on SNDK, while BCC refuses to act **49×/24h** despite being the safest name in the book. Separately, a *fresh* tick carrying an impossible value passes every existing check by construction. This batch replaces the constant with a per-symbol, risk-derived ceiling, and adds a plausibility band **inherited from the exchanges rather than invented by us**.

**★ KYLE SUPPLIES NOTHING.** An earlier draft asked him for a "how much adverse movement will you accept being blind to" budget. He refused it — *"I'm not qualified to answer… look at what trading firms typically do. Is there an industry standard?"* — and he was right: **the industry does not ask anyone to invent that number.** See §3 OBJ-1.

---

## 2. Measured basis (live `xstock_spot_ticker_snap`, not estimated)

| symbol | median gap | p99 move in 90s | trips the 90s ceiling |
|---|---|---|---|
| SNDK | 5.9s | **4.095%** | 0.02% of gaps |
| MU | 5.8s | 2.665% | 0.02% |
| ASTS | 10.1s | 2.614% | 0.10% |
| TER | 15.8s | 1.781% | 1.59% |
| BMNR | 11.8s | 1.645% | 0.37% |
| GOOG | 9.4s | 0.775% | 0.07% |
| **BCC** | **49.3s** | **0.372%** | **3.03% — 49 events/24h** |

**★ CADENCE AND RISK RUN OPPOSITE** (BCC ticks 8× slower than SNDK and is 11× safer). A cadence-derived ceiling would have been **right today by luck** and wrong the moment a thin-*and*-volatile name appears. **The derivation is risk, not cadence.**

⚠️ **Not a price-quality fault:** all 13 open positions priced sub-second at capture. The alarming `max_gap = 8387s` is **identical to the second across all 13 symbols** = the single known `#544` capture outage, not per-symbol noise.

---

## 3. Objectives

### OBJ-1 — Plausibility band: INHERIT LULD, do not invent one

Adopt the **structure** of the SEC-approved Limit Up-Limit Down plan: **Tier 1 (S&P 500 / Russell 1000 / high-volume ETPs) 5% · Tier 2 10% · prior close ≤ $3.00 → 20% · all bands double in the first 15 and last 25 minutes.**

**★ WE INHERIT THE RULEBOOK, NOT A FEED** (Langston). The exchange's minute-by-minute band is computed off a rolling price and **exists only during US RTH**. **Seam, quantified:** xStocks trade **~120h/week**; US RTH is **~32.5h/week** ⇒ **the official band exists for only ~27% of our trading window.** For ~three quarters of the time we hold these positions the publishing venue is shut, so **we run their rulebook ourselves in hours it was never written for.**

**★ NO OFF-HOURS MULTIPLIER — decided against on measurement, after being argued FOR by the owner.** Ship the session dimension as a **tunable defaulted to 1.0**: the mechanism exists, the number is not invented. Rationale §5.

**Verification:** a named test proves a tick outside the symbol's tier band is REFUSED and one inside still closes normally (the band must not become a silent no-close). §9.3 UI verification.

### OBJ-2 — Staleness ceiling: per-symbol, derived from risk

`ceiling = clamp(budget / σ_rate_symbol, floor, cap)` — the time in which the symbol can move at most `budget` against us. **Cadence is demoted to an input for "what does DARK mean" (the alert), not the safety derivation.**

**Starting values for Langston's math ruling:** `floor` = **15s**, `cap` = **300s**. **★ The `cap` is a real safety parameter, not cosmetic: the backstop for a regime break the trailing σ has not seen.** At a 1% budget the measured σ gives **SNDK ≈ 22s, BCC ≈ 242s** against today's flat 90s — **4× too loose** on one, **2.7× too tight** on the other.

**★ σ MUST NOT BE DERIVABLE FROM A DARK SYMBOL, AND IT IS UNDER-MEASURED EXACTLY WHEN MOST DANGEROUS.** σ is a trailing realized measure from last-known-good data — but **a young/thin/volatile entrant has little history and reads artificially calm precisely when a stale mark costs most.** ⇒ **Below a minimum-observation threshold a symbol does NOT use its own σ; it inherits a conservative class-wide upper-percentile σ until enough data accrues. Self-σ is EARNED, not assumed.** This is the one place the design could still be right-by-luck, and it is closed explicitly rather than left to the floor.

### OBJ-3 — Tier source: named, scheduled, fail-to-safe

S&P 500 / Russell 1000 membership reconstitutes several times a year, so **a hardcode silently rots.** Named source on a scheduled refresh; **UNKNOWN or UNRESOLVABLE ⇒ TIER 2 (the wider, safer band), never Tier 1 by assumption.** A stale membership file must fail toward caution.

### OBJ-4 — Failure behaviour: the one genuine tension, and it is NOT settled

**On refusal the position stays open and unevaluated ⇒ a stop that should have fired, does not.** We would be trading a phantom exit for a **missed** exit — and the missed one **fails silently**: a phantom exit is a visible strange number in the trade list; a missed exit looks like nothing at all, while the position runs past its stop during exactly the fast move that made the price look implausible.

⇒ **Step-2 must decide this explicitly rather than inherit skip-and-escalate by default**, including whether repeated refusal escalates harder, and to what. **This is the objective's real difficulty and it must not be designed past.** The existing consecutive-skip rail is the starting point, not the answer.

---

## 4. Out of scope

Cross-venue price comparison (**permanently closed** — it produced the XRP/GBP ghost-market class, `#509`). Reviving `max_fallback_deviation_pct` (**Langston ruled BUILD FRESH**: it was a cross-*source* gate — wrong shape, adjacent to the closed cross-venue path, and keeping the name while gutting the meaning is a §16 terminology landmine). Mutating historical closed-trade rows. The crypto path (if the same gap exists there it is a separate named batch, decided the moment it is confirmed).

## 5. Why there is no off-hours multiplier — the owner argued for one and the data killed it

CC-B proposed **widening** off-hours on a thin-liquidity rationale. **Langston falsified it with one fact: the CLOSE is the single most liquid moment of the equity day and the band STILL widens** ⇒ widening protects trustworthy discovery from an accidental halt; it was never about overshoot room. Off-hours thin-book overshoot is the **opposite** phenomenon, so widening there would let aberrant prints through **unhalted**.

Direction was then settled empirically — and **the owner's first measurement was wrong**: `lead(30 ticks)` gave a **3.1×** noise ratio; a **fixed 5-minute wall clock** gives **1.19×** (in-session gives back 12.8% of the move, out-of-session 15.2%; n = 4,600 / 3,112). **The confound was named in the ledger BEFORE the re-run** — 30 ticks is ~3 min on MU and ~25 min on BCC, so the off-hours bucket skewed to slow-cadence symbols and longer real horizons. **That flag is the only reason a 3.1× multiplier did not enter this design wrong by ~2.6×.**

⇒ **Direction survives; the case for a meaningful multiplier does not.** CC-B and Langston agreed: **drop the separate regime, default the tunable to 1.0.** Recorded because a future reader will otherwise re-propose it.

## 6. Governance at Step-10

Tier 1: `BATCH_CATALOG`, `PHASE_HISTORY`, `PHASE_19_PLAN` (§1 + §5), `RUNNING_ISSUES` (`#548`), `MEMORY_CC_B`, completion report.
Tier 2: **`SYSTEM_MANUAL` APPLICABLE** (exit-path behaviour + a new gate on the execution path). **`SYSTEM_IMPACT_MAP` APPLICABLE** (new component + cross-cutting state). `CHANGES_AND_FIXES`. **`ADJUSTMENT_FRAMEWORK` APPLICABLE** — introduces DB-governed per-symbol parameters with a refresh cadence.
