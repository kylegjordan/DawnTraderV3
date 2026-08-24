# B-OBSERVATION-EPOCH — SCOPE

change-class: non_architecture

> **Batch id:** `B-OBSERVATION-EPOCH` · **Owner:** Claude Analyst (CC-C) · **2026-08-24**
> **Part F piece:** the **F-F** reset, brought forward at Kyle's direction · **Code at `8088b49be`**
> ⛔ **NOT DEPLOYED.** ⚠️ Scope written after the push — same inversion recorded in `B-MBIM-SWITCH-ON`.

---

## 1. KYLE'S REQUEST, AND WHY IT WAS ONE ROW

> *"I want to restart our trading session… now we are in a new observation period because we had to
> change core pricing data… starting from our Kraken portfolio balance of eight hundred and
> twenty-four dollars and eleven cents."*
> And: *"day one of trading is today… the seven day metric should probably match the twenty four hour.
> Same with the thirty day, same with the lifetime."*

**★ THE MECHANISM ALREADY EXISTED AND KYLE'S OWN RULING SHAPED IT** — `getLifetimeScoreboard`'s
comment: *"THE EPOCH IS DELIBERATE AND IS NOT TIED TO THE ANCHOR EVENTS. Kyle ruled the two acts
decoupled: changing the balance and resetting the score are each intentional, and either can happen
without the other."* ⇒ the reset is an **explicit `module_constants` row**, `scoreboard` /
`epoch_started_at`, whose `updated_by` **is** the audit trail. **I was designing an epoch column when
the epoch row already existed** — the second "use what already exists" catch in two days.

**SET:** `2026-08-22T22:01:00Z` — the `#507` book-truncation fix line (`e6f7c70b3`).
**ANCHOR UNTOUCHED:** paper `portfolio_state` = **824.11**, `anchor_version` 4, `last_update`
2026-08-12. **No balance write was needed or wanted.**

⚠️ **Two governance defects surfaced establishing that:** three governed docs (`RUNNING_ISSUES:1682`,
`BATCH_CATALOG:428`, `SIM:131`) still assert paper **2250.00/v3** against a live **v4/824.11**; and
**`portfolio_anchor_events` has no v4 row at all** — a UNIQUE `(mode, anchor_version)` index means it
is genuinely absent. **The anchor audit trail has a hole at its most recent change.** Both are with
Langston; neither is fixed here.

## 2. OBJECTIVES

| # | Objective | Verified when |
|---|---|---|
| **OBJ-1** | The scoreboard scores only the new window | epoch row resolves; lifetime figure covers post-epoch trades only |
| **OBJ-2** | **Every rolling window clamps to the epoch** | 24h/7d/30d cannot reach past it; a pre-epoch $500 trade shows as 0 in 30d |
| **OBJ-3** | **Both-leg keying** — a trade counts only if it OPENED *and* CLOSED after the epoch | a straddler is excluded from every window |
| **OBJ-4** | An unplaceable trade fails closed | missing `openedAt` ⇒ not counted |
| **OBJ-5** | No epoch ⇒ unchanged behaviour | all history counts, matching the scoreboard's documented default |

## 3. ★ THE DEFECT THIS FIXED WAS REAL, NOT COSMETIC

`computeRollingEarnings` was plain `now − N days` with **no epoch term**, while
`getLifetimeScoreboard` **is** epoch-scoped. ⇒ the moment the epoch row was set, the dashboard would
have shown **a clean lifetime figure beside a 30-day figure silently summing the entire pre-fix era** —
two numbers on one card, disagreeing, each looking authoritative.

## 4. ★ THE STRADDLER RULE IS A DECISION, NOT A FALL-OUT (Langston's condition)

A trade **opened before** the epoch and **closed after** it carries an entry price taken through the
contaminated mini-book — so it is **not** *"properly traded with the right pricing data"*, which is the
entire purpose of the reset.

**MEASURED at the reset, and this is why close-time keying could not work:**

| | |
|---|---:|
| closes since the fix line | **11** |
| …with **both** legs after it | **4** |
| …straddlers (entry pre-fix) | **7** |
| still-open positions | 7 — **3 opened pre-fix** |

⇒ close-time keying would have kept admitting contaminated entries **for days** as those 3 closed.
P&L in-window: **$19.14** close-keyed vs **$8.47** both-leg keyed.

**Pinned by four tests**, per Langston's requirement that the key be stated and tested rather than
falling out of whichever date column each of the six P&L readers happens to filter on.

## 5. RISKS AND LIMITS, NAMED

1. ⛔ **THE EPOCH ALSO RESETS THE KILL-SWITCH NUMERATOR** — the drawdown memory starts empty, so the
   daily-loss budget is fresh. **That moves risk and it is Kyle's to ratify explicitly, not to inherit
   as a side effect** (Langston). **Surfaced to him in those words.**
2. **`tsconfig` excludes `**/*.test.ts`** — tests are **not** type-checked. The two production call
   sites were caught by the compiler; a test can drift silently. The pre-existing 2-arg call was made
   explicit rather than left relying on `undefined` behaving like `null`.
3. **Reversible**: delete the `module_constants` row ⇒ the implicit first-trade epoch returns. Nothing
   is deleted or rewritten; the pre-fix history is retained in full and remains available for the
   conditional-outcome analysis Kyle explicitly wants to keep.
