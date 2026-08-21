# B-BALANCE-TRUTH — SCOPE (Step 1)

**Batch:** B-BALANCE-TRUTH — retire the 100-row cap from every AGGREGATE consumer of `closed_trades`, and give the table a real paper/live discriminator.
**change-class: architecture** — it changes the reader contract for a risk-path input (the daily-loss kill-switch denominator) and adds a schema column with a backfill.
**Owner:** CC-C · **Reviewer:** Langston · **Issue:** #618 (+ leg 3) · **Kyle decisions taken 2026-08-01, placement re-confirmed 2026-08-20.**

---

## 1. WHAT KYLE ALREADY DECIDED — NOT RE-LITIGATED HERE

Both recorded verbatim-in-substance in RUNNING_ISSUES #618, 2026-08-01:

- **DECISION 1 — "compute the totals in the database."** SQL-side aggregates, unbounded by construction — the shape already shipped and Langston-approved for the kill-switch NUMERATOR (`getRealizedPnlSince`, FIX-2026-07-31-B). **Explicitly REJECTED: wiring up `getClosedTradesGlobal` (a 1,000-row limit buys ~a month then re-breaks silently and identically) and pagination.**
- **DECISION 2 — "add the column, backfill it, and make the argument actually do its job."** `closed_trades` gains a real paper/live discriminator; existing rows are backfilled; the readers filter on it. This RETIRES #618 leg 3 rather than papering over it.

**Kyle's own framing of why the two were a choice:** adding the column and REMOVING the argument cancel out — the argument is only a lie *because* nothing exists to filter on. His answer takes the strictly better branch: make it true instead of deleting it.

---

## 2. PROVENANCE READ (§2 1.b — TIER 1 for everything whose behaviour this batch changes)

**`getClosedTrades`'s `limit || 100`** — introduced `9944e8013` (2025-10-10, Replit-era), commit message quoted in full: *"Add paper trading simulation engine to test strategies / Implement database schema and storage methods for paper trading simulation, including trades, open positions, and trade logs."* ⇒ **ORIGINAL INTENT: a UI list reader for a simulation engine.** A 100-row page for a table view is a correct default for that purpose. **Disposition (2): relevant but needing an update to today's intent** — the defect is not the cap, it is that AGGREGATE consumers were later pointed at a LIST reader. Nothing in the introducing commit contemplates a risk gate reading it.

**`getPortfolioBalanceV2`** — first appears `82693e9f3` (2025-11-03). It sums `trade.pnl` over `getClosedTrades(mode, {closedOnly:true})` filtered to `closedAt >= sessionStart`. **Disposition (2): update.** Its shape — bound the set by OPEN time, ask the question in CLOSE time — is the same error the kill-switch NUMERATOR already had and which FIX-2026-07-31-B repaired on one side only.

**`getRealizedPnlSince`** (the numerator, already fixed) — **disposition (1): relevant and correct. It is the TEMPLATE this batch copies**, including its deliberate predicate parity comment.

---

## 3. THE CENSUS — REDONE AT LANGSTON'S STEP-1 BLOCKER (r2)

⛔ **r1's census said 12 call sites. THE REAL NUMBER IS 24, and the cause was mine: I piped the grep through `head -12` and reported the truncation as the population.** That is the same instrument failure as #704 (a bounded read presented as a complete one), committed inside the batch whose whole subject is bounded reads presented as complete ones. Langston caught it and named the sharpest omission himself: `c5-financial-diagnostics.ts:118` **carries a comment at `:129-131` that already annotates it as "#618 leg 2"** — my own issue family had flagged that site and my census dropped it.

**Instrument stated (rule 29) — r3 CORRECTED, because the r2 narration did not reproduce (Langston: "a stated instrument that doesn't reproduce is the thing we're removing").** r2 said "28 lines minus the interface decl and two explanatory comments", which arithmetically gives 25, not 24 — there are THREE comments, not two. **The derivation that reproduces:** `grep -rn "getClosedTrades(" server/ --include="*.ts"` filtered by `grep -v "async getClosedTrades|getClosedTradesGlobal"` and `grep -v "/tests/"`, **NO `head`** ⇒ **28 lines**, minus **1 interface declaration** (`storage.ts:523`) and **3 explanatory comments** (`storage.ts:3137`, `daily-loss-budget.ts:123`, `guardrail-settings.ts:87`) = **24 call sites**. Langston's independent path reaches the same 24 from the unfiltered grep: 33 raw − 4 test − 2 declarations (interface + impl) − 3 comments.

**REACHABILITY (Langston's explicit condition — a call site's existence is not its liveness).** ⚠️ My first reachability pass grepped only `from '…'` and reported c13/c14/validation-session as ZERO-importer. **That was wrong and is retracted: they are reached by dynamic `import()` and `require()`.** Corrected instrument = all three syntaxes. Result: **all five services are LIVE — none is dead code, so "unwired" is not available as a disposition for any of them.**

| # | Site | Filter passed | Cap in force | Population | Disposition |
|---|---|---|---|---|---|
| 1 | `guardrail-settings.ts:106` | `{closedOnly}` | **100** | **A — RISK** | SQL aggregate (OBJ-1). The kill-switch DENOMINATOR. |
| 2 | `routes.ts:12961` | `{}` | **100** | **A — display** | SQL aggregate (OBJ-2). Displayed BALANCE; not even `closedOnly`. |
| 3-5 | `routes.ts:12347` · `:12458` · `:12549` | `{closedOnly}` | **100** | **A — display** | SQL aggregate (OBJ-2). The earnings/P&L windows; the 7d==30d identity is the acceptance test. |
| 6-8 | `routes.ts:4659` · `:4709` · `:4727` | `{closedOnly}` | **100** | **A — THE PRIMARY PORTFOLIO SURFACE** | **AGGREGATE (Langston Q1 ruling).** ⚠ **r2 mislabelled these as "AI-briefing/analytics" — the wrong object. They are `/portfolio/overview`, `/portfolio/earnings`, `/portfolio/earnings-chart` (`routes.ts:4565/4705/4721`)**, the main portfolio surface, not a quieter place. **TWO RIDERS THAT MUST SHIP IN THE SAME CHANGE:** (i) **`:4670` `closedTrades.slice(-30)`** — the array is `desc(openedAt)`, so "recent 30" is really the **30 OLDEST of the truncated window**; uncapping ALONE makes it worse (last-30-of-481 becomes the 30 oldest trades ever), so the slice fix and the uncap are ONE atomic change; (ii) **`:4727` earnings-chart** bounds by `openedAt` in SQL then filters `closedAt >= cutoff` in JS — the identical open-time/close-time error `getRealizedPnlSince` already fixed — so its aggregate must be a **SQL `GROUP BY` on CLOSE date**, not a re-plumbed filter. |
| 9-10 | **`c5-financial-diagnostics.ts:118` · `:190`** | **bare `(mode)`** | **100 AND `closedOnly=false`** | **A — INSTRUMENT** | **SQL aggregate (OBJ-2), and it is the highest-priority display site**: `:118` reduces `realizedNetPnlTotal` over whole history, and this is the OBSERVATION INSTRUMENT the #618 pairing decision is read from. **Fixing the balance while leaving the gauge truncated fixes the thing and not the measurement.** LIVE: reached from `routes.ts`, `active-engine-service.ts`, `active-execution-engine.ts`, `signal-orchestrator.ts`. |
| 11-12 | `c13-validation-service.ts:138` · `:230` | bare `(mode)` | **100 + `closedOnly=false`** | **A** | Aggregate or annotate — `:138` reduces to `avgPnl`. LIVE via `routes.ts` (3 refs, dynamic). **Binds today.** |
| 13-14 | `c14-validation-service.ts:201` · `:360` | bare `(mode)` | **100 + `closedOnly=false`** | **A** | Same. LIVE via `routes.ts` + `kraken.ts:795` (`require`). **Binds today.** |
| 15 | `m5e-validation-service.ts:146` | `{closedOnly:false}` | **100** | **RE-POINT (not aggregate)** | **Langston's call, and the reasoning is the point: a SQL aggregate would enshrine the WRONG OBJECT with better plumbing.** `getOpenPositionsCount()` counts OPEN positions through the CLOSED-trades reader; the canonical reader is `storage.getActiveOpenPositions(mode)`, already used at `routes.ts:4655`. **Measured: `active_open_positions` = 6, `closed_trades WHERE closed_at IS NULL` = 6, and the oldest of those six ranks 13th in the desc-`openedAt` order — so it is CORRECT TODAY by a margin of 13 against a cap of 100.** A wrong object returning a plausible number (#546 shape), which is worse than a visible miscount. **CONDITION: prove the re-point is population-preserving by ID-LEVEL SET EQUALITY, not by count — 6 == 6 is not the same set.** |
| 16-17 | `active-portfolio-manager.ts:466` · `:505` | `{limit:1000, closedOnly}` | 1,000 | **A — CONVERT** | **Langston Q2 ruling: CONVERT, not annotate.** My "~10× headroom" was wrong — measured on staging: `closed_trades` 567 rows, **481 readable**, 352 opened in the last 30 days ⇒ the 1,000 cap is **2.08× the live population and 48% consumed today**, and it does NOT self-limit (this table carries the 365-day retention exception, so nothing sweeps it back down). Annotating re-decides the branch Kyle already rejected in DECISION 1. |
| 18 | `active-portfolio-manager.ts:370` | `{limit:1000}` | 1,000 | **A — CONVERT** | Count only, but the same cap arithmetic as 16-17. A count is a `COUNT(*)`. |
| 19 | `active-engine-service.ts:303` | `{limit:1000}` | 1,000 | **A — CONVERT** | Session metrics; same ruling. |
| 20-21 | `validation-session-service.ts:80` · `:130` | `{limit:1000, closedOnly}` | 1,000 | **A — CONVERT** | Same ruling. LIVE via `routes.ts` + `startup/lazy-loader.ts`. |
| 22 | `routes.ts:12042` | caller-supplied | caller's | **B — LIST** | Out of scope: the paginated UI list, the reader's ORIGINAL purpose. |
| 23 | `routes.ts:13449` | `{limit:500}` | 500 | **B — LIST** | Out of scope: an explicit "recent N". |
| 24 | `active-execution-engine.ts:3775` | `{limit, closedOnly}` | caller's | **B — LIST** | Out of scope: explicit bounded read. |

**⇒ 10 sites BIND TODAY at 100 rows (1-15 minus the four already listed at 1,000), 6 are non-binding at 1,000, 3 are legitimate list readers.** Every site now has a disposition; none is left implicitly capped.

## 4. OBJECTIVES

**OBJ-1 — SQL-side aggregates for the risk path (BLOCKING, lands first, separable).**
`getPortfolioBalanceV2`'s realized-P&L sum becomes a SQL aggregate over ALL qualifying rows in the session window, copying `getRealizedPnlSince`'s predicate set VERBATIM so the population is identical and only the row bound is removed. ⚠️ **Langston's standing condition 2 carried:** the numerator sums `pnl`; this denominator also sums `pnl`; `B-COST-MATH-CONSOLIDATION` made `netPnl` canonical. **If the ratio ever moves to `netPnl` it MUST move on BOTH sides in ONE batch** — this batch does NOT move it (that is a behaviour change, not a bug fix), and says so.

**OBJ-2 — SQL-side aggregates for the display path.** Balance, earnings windows and the analytics totals get real aggregates. **The 7d/30d identity is the acceptance test:** the live defect signature is that both windows print the SAME number; post-fix they must differ, and the 30-day figure must carry the correct SIGN (measured 2026-07-31: dashboard showed +$138.65 for both while true 7d was +$176.34 and true 30d was **−$139.17** — a ~$278 swing and the wrong sign on the headline number).

**OBJ-3 — the paper/live discriminator column + backfill (Kyle DECISION 2).** `closed_trades` gains the column; existing rows are backfilled; `getClosedTrades` / `getRealizedPnlSince` / siblings FILTER on it. ⚠️ **The backfill rule must be RE-VERIFIED at implementation, not inherited from this line:** every current row is believed paper (no live trading has run; `trade_mode` holds `'TARGET'`, not paper/live), so the backfill is a constant — **but that is a claim to measure on the day, not an assumption to ship.**

**OBJ-4 — MAKE THE BOUND REQUIRED AT THE READER (Langston Q3 ruling — neither option I offered).**
Delete `limit || 100` and make `limit` a **REQUIRED parameter** of `getClosedTrades`. **Why this beats both of my proposals:** a per-consumer behavioural test is *a name list wearing a test's clothes* — it must enumerate consumers, so the next aggregate consumer is invisible to it and it goes stale by omission, the exact failure OBJ-4 exists to prevent. A required parameter makes **tsc enumerate every caller for free** (derived, not listed); no new consumer can silently inherit 100 — it must type a number, **and typing a number is the moment someone thinks**; and `check-tsc-baseline` is message-keyed since #579, so a reverted site hard-fails CI. Mutation-proof is trivial (drop one argument ⇒ compile error).
**A behavioural test is still built — but as the ACCEPTANCE test, not the fence:** 7d ≠ 30d with the correct sign, and the kill-switch denominator computed over >100 rows.

**OBJ-5 — governance.** SIM (the reader contract + the new column), System Manual if the kill-switch ratio's inputs change shape, `RUNNING_ISSUES` #618 closure with leg-3 retirement, completion report, Langston MEMORY sync.

---

## 5. SEQUENCING — THE TWO LEGS ARE SEPARABLE AND SHOULD NOT SHIP AS ONE

Recorded in #618 and re-affirmed here: **the SQL-aggregate work does NOT depend on the column**, so OBJ-1/OBJ-2 land FIRST and reduce the blast radius of a single deploy; OBJ-3's migration + backfill follows. **Langston's own condition, carried:** display and risk-sizing must NOT share one verification — the kill-switch leg is verified against the DB, the display leg against the rendered UI (§9.3).

---

## 6. WHAT THIS BATCH DOES NOT DO

- It does **not** move the ratio to `netPnl` (see OBJ-1).
- It does **not** touch the LIST consumers in population (B).
- It does **not** address `#705` (flush-loss) or the `guardrails_v2` snapshot-store audit gap (#647) — both have their own homes.
- It does **not** change any guardrail VALUE. The sizing/slots questions are `B-SIZING-DEC-RESTORE`'s resumption, deliberately after this.

---

## 7. LANGSTON'S STEP-1 RULINGS (r2 → r3; APPROVED subject to these four, all folded in above)

1. **Q1 — AGGREGATE**, and my label was the wrong object: these are the primary portfolio surface, not analytics. Two riders now in the table.
2. **Q2 — CONVERT, not annotate.** My headroom figure was wrong by ~5×: the cap is 2.08× the live population and 48% consumed, and the table's 365-day retention exception means it never self-limits.
3. **Q3 — neither of my options.** Make `limit` required at the reader; tsc becomes the fence.
4. **`m5e:146` — RE-POINT, not aggregate**, with id-level set-equality as the proof obligation.

**His evidence standard on this review, recorded:** he independently re-read `storage.ts:3102-3131`, `routes.ts:4565-4750` and `m5e-validation-service.ts:144-152`, and ran the four staging counts himself; the two provenance commits he marks **RULED ON REPORTED FACT**. Board `Review` stays unset until r3 lands these.

---

## OBJ-4 — **THE LIFETIME SCOREBOARD (KYLE-DIRECTED 2026-08-21, scope ADDITION recorded rather than slipped in)**

**Kyle's ask, in his words:** the Earnings card's bottom line should stop reflecting the window selector and become *"a running scoreboard for since we started trading — here's what you've done."* Labelled **Lifetime** with the date score-keeping began. And: *"anytime we're going to reset the score, it has to be intentional."*

**★ HE RULED BOTH DIRECTIONS INTENTIONAL, and the two are DECOUPLED (2026-08-21):** changing the balance by non-trading means is one deliberate act; resetting the score is a separate deliberate act. Either can happen without the other. **A server restart must never do either** — measured: 4 anchor events in 5 weeks against ~600 process restarts, so anchor changes are already restart-immune.

**⛔ THE DENOMINATOR QUESTION KYLE COULD NOT RESOLVE — ANSWERED FROM THE DATA, NOT BY PICKING A SIDE.** He asked whether the percentage should be against the original $2,250 or the current $824.11. **Neither: every one of the 492 qualifying trades records `anchor_balance_at_open`, with ZERO nulls**, so the capital actually behind each trade is known per-trade and no arbitrary denominator is needed.
| method | result | verdict |
|---|---|---|
| ÷ current $824.11 | **−19.49%** | ⛔ wrong by ~3× — most trades were taken with $2,250/$2,400 behind them |
| ÷ original $2,250 | −7.14% | ⚠️ close TODAY, but only because most history sits in that era; drifts as trading continues under the new balance |
| **COMPOUNDED TIME-WEIGHTED RETURN** | **−7.08%** | ✅ **CHOSEN** |
| (simple sum of per-trade returns) | −6.67% | not chosen — ignores compounding |

**WHY TIME-WEIGHTED IS THE RIGHT INSTRUMENT AND NOT A PREFERENCE:** TWR is the standard measure for a capital base that changed for **non-trading** reasons — which is exactly what a re-anchor is (a deposit/withdrawal in performance-measurement terms). It answers *"how did the TRADING perform"* independent of money moving in or out. Computed as `∏(1 + pnlᵢ / anchor_balance_at_openᵢ) − 1` over the epoch. **Three distinct capital bases are in the history — 2250.00, 2400.00, 824.11 — so this is not academic: any single-denominator answer is wrong for two of the three eras.**

**THE SCOREBOARD EPOCH.** An explicit, deliberately-set marker. **NOT the anchor events** — those change for balance-mirroring reasons (the 08-12 change was Kyle matching the paper balance to his real Kraken balance), and binding the scoreboard to them would have silently erased the July record he is asking to see. **Absent an explicit marker the epoch is the FIRST TRADE (2026-07-15)** — which is not a fallback default but the correct semantic: score-keeping began when trading began. Both are honest and both are stated on the card.

**DELIVERABLE:** `Net P/L (window)` → `Lifetime (since <date>)` in dollars; `Net P/L % (vs starting balance)` → the time-weighted return. Both move ONLY when trades close, and neither moves when the balance is re-anchored.

**CHANGE-CLASS: non_architecture** (a display figure and one new read aggregate; no pipeline, no risk path).
