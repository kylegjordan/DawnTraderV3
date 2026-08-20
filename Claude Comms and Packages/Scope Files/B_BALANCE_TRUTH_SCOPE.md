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

**Instrument stated (rule 29):** `grep -rn "getClosedTrades(" server/ --include="*.ts"`, excluding the interface declaration, two explanatory comments and `getClosedTradesGlobal`, tests excluded, **NO `head`** ⇒ 28 lines, **24 call sites**.

**REACHABILITY (Langston's explicit condition — a call site's existence is not its liveness).** ⚠️ My first reachability pass grepped only `from '…'` and reported c13/c14/validation-session as ZERO-importer. **That was wrong and is retracted: they are reached by dynamic `import()` and `require()`.** Corrected instrument = all three syntaxes. Result: **all five services are LIVE — none is dead code, so "unwired" is not available as a disposition for any of them.**

| # | Site | Filter passed | Cap in force | Population | Disposition |
|---|---|---|---|---|---|
| 1 | `guardrail-settings.ts:106` | `{closedOnly}` | **100** | **A — RISK** | SQL aggregate (OBJ-1). The kill-switch DENOMINATOR. |
| 2 | `routes.ts:12961` | `{}` | **100** | **A — display** | SQL aggregate (OBJ-2). Displayed BALANCE; not even `closedOnly`. |
| 3-5 | `routes.ts:12347` · `:12458` · `:12549` | `{closedOnly}` | **100** | **A — display** | SQL aggregate (OBJ-2). The earnings/P&L windows; the 7d==30d identity is the acceptance test. |
| 6-8 | `routes.ts:4659` · `:4709` · `:4727` | `{closedOnly}` | **100** | **A — display** | SQL aggregate (OBJ-2) per §7 Q1. |
| 9-10 | **`c5-financial-diagnostics.ts:118` · `:190`** | **bare `(mode)`** | **100 AND `closedOnly=false`** | **A — INSTRUMENT** | **SQL aggregate (OBJ-2), and it is the highest-priority display site**: `:118` reduces `realizedNetPnlTotal` over whole history, and this is the OBSERVATION INSTRUMENT the #618 pairing decision is read from. **Fixing the balance while leaving the gauge truncated fixes the thing and not the measurement.** LIVE: reached from `routes.ts`, `active-engine-service.ts`, `active-execution-engine.ts`, `signal-orchestrator.ts`. |
| 11-12 | `c13-validation-service.ts:138` · `:230` | bare `(mode)` | **100 + `closedOnly=false`** | **A** | Aggregate or annotate — `:138` reduces to `avgPnl`. LIVE via `routes.ts` (3 refs, dynamic). **Binds today.** |
| 13-14 | `c14-validation-service.ts:201` · `:360` | bare `(mode)` | **100 + `closedOnly=false`** | **A** | Same. LIVE via `routes.ts` + `kraken.ts:795` (`require`). **Binds today.** |
| 15 | `m5e-validation-service.ts:146` | `{closedOnly:false}` | **100** | **A — miscounts** | ⚠️ Counts OPEN positions by JS-filtering `!closedAt` **through the closed-trades reader** — a wrong-object read on top of a capped one. Needs its own disposition, not a shared aggregate. LIVE via `routes/vts.ts`. |
| 16-17 | `active-portfolio-manager.ts:466` · `:505` | `{limit:1000, closedOnly}` | 1,000 | A (non-binding) | §7 Q2 — annotate + fence. |
| 18 | `active-portfolio-manager.ts:370` | `{limit:1000}` | 1,000 | A (non-binding) | §7 Q2 — count only. |
| 19 | `active-engine-service.ts:303` | `{limit:1000}` | 1,000 | A (non-binding) | §7 Q2. |
| 20-21 | `validation-session-service.ts:80` · `:130` | `{limit:1000, closedOnly}` | 1,000 | A (non-binding) | §7 Q2. LIVE via `routes.ts` + `startup/lazy-loader.ts`. |
| 22 | `routes.ts:12042` | caller-supplied | caller's | **B — LIST** | Out of scope: the paginated UI list, the reader's ORIGINAL purpose. |
| 23 | `routes.ts:13449` | `{limit:500}` | 500 | **B — LIST** | Out of scope: an explicit "recent N". |
| 24 | `active-execution-engine.ts:3775` | `{limit, closedOnly}` | caller's | **B — LIST** | Out of scope: explicit bounded read. |

**⇒ 10 sites BIND TODAY at 100 rows (1-15 minus the four already listed at 1,000), 6 are non-binding at 1,000, 3 are legitimate list readers.** Every site now has a disposition; none is left implicitly capped.

## 4. OBJECTIVES

**OBJ-1 — SQL-side aggregates for the risk path (BLOCKING, lands first, separable).**
`getPortfolioBalanceV2`'s realized-P&L sum becomes a SQL aggregate over ALL qualifying rows in the session window, copying `getRealizedPnlSince`'s predicate set VERBATIM so the population is identical and only the row bound is removed. ⚠️ **Langston's standing condition 2 carried:** the numerator sums `pnl`; this denominator also sums `pnl`; `B-COST-MATH-CONSOLIDATION` made `netPnl` canonical. **If the ratio ever moves to `netPnl` it MUST move on BOTH sides in ONE batch** — this batch does NOT move it (that is a behaviour change, not a bug fix), and says so.

**OBJ-2 — SQL-side aggregates for the display path.** Balance, earnings windows and the analytics totals get real aggregates. **The 7d/30d identity is the acceptance test:** the live defect signature is that both windows print the SAME number; post-fix they must differ, and the 30-day figure must carry the correct SIGN (measured 2026-07-31: dashboard showed +$138.65 for both while true 7d was +$176.34 and true 30d was **−$139.17** — a ~$278 swing and the wrong sign on the headline number).

**OBJ-3 — the paper/live discriminator column + backfill (Kyle DECISION 2).** `closed_trades` gains the column; existing rows are backfilled; `getClosedTrades` / `getRealizedPnlSince` / siblings FILTER on it. ⚠️ **The backfill rule must be RE-VERIFIED at implementation, not inherited from this line:** every current row is believed paper (no live trading has run; `trade_mode` holds `'TARGET'`, not paper/live), so the backfill is a constant — **but that is a claim to measure on the day, not an assumption to ship.**

**OBJ-4 — a fence that cannot go stale by omission.** Following #704's lesson (a name list would have passed while the defect was live): the fence asserts that **no AGGREGATE consumer reads through a row-bounded reader**, derived rather than enumerated where the code allows it. Mutation-proved: a reverted call site must FAIL it.

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

## 7. OPEN QUESTIONS FOR LANGSTON

1. **Population (A) sites 4659/4709/4727 (AI-briefing/analytics):** aggregate them too, or rule their caps intended and annotate? My read: aggregate — a briefing that quotes a truncated total is the same lie in a quieter place.
2. **`active-engine-service.ts:303` and `active-portfolio-manager.ts:370` (1,000-row caps):** these do not bind today. Do they get aggregates now, or an explicit annotated ruling plus a fence entry so they cannot silently start binding? My read: annotate + fence — the 1,000 cap is ~10× today's volume, and converting them is scope the defect does not require.
3. **OBJ-4's fence shape:** the derivation that worked for #704 (a runtime map) has no equivalent here — the honest options are a source-level assertion over the call sites or a per-consumer behavioural test. I lean behavioural; I would rather have your ruling before building it than defend a static-analysis fence afterwards.
