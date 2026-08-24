# B-OBSERVATION-EPOCH — COMPLETION REPORT

> **Owner:** Claude Analyst (CC-C) · **Closed 2026-08-24** · **change-class: non_architecture**
> **Code `8088b49be`**, live on staging inside `afb7d326c`. **Part F: the F-F reset, brought forward at Kyle's direction.**
> ⛔ **CLOSED LATE.** The checker raised `Governance overdue: code pushed 4h ago, no governance push` — **correct.**

---

## 1. WHAT KYLE ASKED FOR

> *"I want to restart our trading session… now we are in a new observation period because we had to change
> core pricing data… starting from our Kraken portfolio balance of eight hundred and twenty-four dollars
> and eleven cents."* And: *"day one of trading is today… the seven day metric should probably match the
> twenty four hour. Same with the thirty day, same with the lifetime. It all starts today."*

## 2. ★ THE MECHANISM ALREADY EXISTED, AND KYLE'S OWN EARLIER RULING HAD SHAPED IT

I began designing an epoch **column**. `getLifetimeScoreboard`'s own comment stopped me:

> *"THE EPOCH IS DELIBERATE AND IS NOT TIED TO THE ANCHOR EVENTS. Kyle ruled the two acts decoupled:
> changing the balance and resetting the score are each intentional, and either can happen without the other."*

⇒ the reset is a single explicit `module_constants` row — `scoreboard` / `epoch_started_at` — whose
`updated_by` **is** the audit trail. **Second "use what already exists" catch in two days.**

**SET:** `2026-08-22T22:01:00Z` — the `#507` book-truncation fix line (`e6f7c70b3`).
**ANCHOR UNTOUCHED:** paper `portfolio_state` = **824.11**, `anchor_version` 4. **No balance write was
needed or wanted** — and that is Kyle's decoupling ruling doing its job.

## 3. OBJECTIVES

| # | Objective | Result |
|---|---|---|
| **OBJ-1** | Scoreboard scores only the new window | ✅ epoch row resolves; `epochIsExplicit: true` |
| **OBJ-2** | Every rolling window clamps to the epoch | ✅ 24h/7d/30d cannot reach past it |
| **OBJ-3** | **Both-leg keying** | ✅ in `computeRollingEarnings` — ⚠️ **and ONLY there; see §5** |
| **OBJ-4** | An unplaceable trade fails closed | ✅ missing `openedAt` ⇒ not counted |
| **OBJ-5** | No epoch ⇒ unchanged behaviour | ✅ (reworded later under `B-EPOCH-KEYING-PARITY` — it was overclaimed) |

**Verified live:** Today = Past 7 Days = Past 30 Days = Lifetime = **−$4.91 over 6 trades**, on the Paper
Trading page. *(Full parity across all four figures required the follow-on batch — see §5.)*

## 4. THE STRADDLER RULE WAS A DECISION, NOT A FALL-OUT (Langston's condition)

A trade **opened before** the epoch and **closed after** it carries an entry price taken through the
contaminated mini-book, so it is not *"properly traded with the right pricing data"* — the entire purpose
of the reset. **MEASURED at the reset:** 11 closes since the fix line, only **4** with both legs after it,
**7 straddlers**; and **3 of 7 still-open positions opened pre-fix**, so close-time keying would have kept
admitting contaminated entries for days. In-window P&L: **$19.14 close-keyed vs $8.47 both-leg.**

## 5. ⛔ WHAT THIS BATCH GOT WRONG, AND IT COST A SECOND BATCH

**The both-leg decision shipped into ONE reader of FOUR.** The predicate lived **inline** inside
`computeRollingEarnings`, so `getLifetimeScoreboard`, the analytics window filter and that route's
empty-window branch never had access to it. The four tests written to pin the decision **tested the
FUNCTION, not the PARITY**, and all four passed while the Paper Trading card displayed **three different
answers to one question, disagreeing in sign.**

⇒ **`B-EPOCH-KEYING-PARITY` (deployed `30808c6c0`) is the remediation**, and the root cause is recorded in
this batch's pre-audit: **no consumer census was run.** A grep for the epoch constant would have taken a
minute and returned all four. **A batch introducing a NEW SHARED VALUE must census its consumers before
writing the first one.**

## 6. RISKS AND LIMITS, NAMED

1. ⛔ **THE EPOCH ALSO RESETS THE KILL-SWITCH NUMERATOR** — the drawdown memory starts empty, so the
   daily-loss budget is fresh. **That moves risk and is Kyle's to ratify explicitly, not to inherit as a
   side effect** (Langston). Surfaced to him in those words.
2. **`tsconfig` excludes `**/*.test.ts`** — tests are not type-checked, so a test can drift silently.
3. **Reversible**: delete the row ⇒ the implicit first-trade epoch returns. **Nothing is deleted or
   rewritten**; the pre-fix history is retained in full for the conditional-outcome analysis Kyle wants kept.
4. ⚠️ **TWO ANCHOR-RECORD DEFECTS SURFACED AND NOT FIXED HERE:** three governed docs still assert paper
   **2250.00/v3** against a live **v4/824.11**, and **`portfolio_anchor_events` has NO v4 row** — the
   anchor audit trail has a hole at its most recent change.

## 7. GOVERNANCE FILES CHANGED

`BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `PHASE_19_PLAN.md` · `RUNNING_ISSUES.md` ·
scope · pre-audit · this report.
**SYSTEM_MANUAL and SIM judged NOT applicable and the judgement is stated** (§9 anti-pattern): a
`module_constants` row read by existing services adds no component and changes no architecture or math.
