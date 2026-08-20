# B-BALANCE-TRUTH — PRE-AUDIT (Step 2)

**Batch:** B-BALANCE-TRUTH (#618) · **Owner:** CC-C · **Reviewer:** Langston · **Scope:** `B_BALANCE_TRUTH_SCOPE.md` r3 (`3c3bda57c`)
**Kyle's instruction for this audit (2026-08-20):** *review the code, the runtime logs, and the batches where these items were implemented or changed, so the intent, the history and how it is ACTUALLY wired come out of the audit — then submit the change plan as part of it.*

---

## PART 1 — HISTORY AND INTENT (what each piece was BUILT to do)

| Component | Born | Original intent (from the introducing commit / batch record) | Disposition |
|---|---|---|---|
| `getClosedTrades`'s `limit \|\| 100` | `9944e8013`, 2025-10-10, Replit-era: *"Add paper trading simulation engine to test strategies / Implement database schema and storage methods for paper trading simulation, including trades, open positions, and trade logs."* | **A UI LIST reader for a simulation engine.** A 100-row page is CORRECT for a table view. | **(2) update to today's intent** — the reader is not the defect; pointing AGGREGATE consumers at a LIST reader is. |
| `getPortfolioBalanceV2` | `82693e9f3`, 2025-11-03 | Compute a mode-aware current balance as `startingBalance + realized P&L since session start`. | **(2) update** — sound intent, defective bound: it filters `closedAt >= sessionStart` over a set bounded by `openedAt DESC LIMIT 100`. |
| `compute24hSnapshot` (daily-loss) | Repaired `f906b3f46`, 2026-07-31, **B-KILLSWITCH-WINDOW**: *"bound the daily-loss 24h total by TIME, not by row count."* | The kill-switch NUMERATOR. | **(1) correct — and it is the TEMPLATE.** `getRealizedPnlSince` is the shape this batch copies, including its deliberate predicate-parity comment. |
| `guardrail-settings.ts` | Last substantively touched `3cd197b34`, 2026-07-30, **B-COST-MATH-CONSOLIDATION Step-3 part 2** — whose commit subject literally ends *"and #618 is a risk-path issue."* | — | ⇒ **the risk-path framing is not new to this batch; it was established a month ago and left unbuilt.** |
| `c5-financial-diagnostics.ts` | **B-COST-MATH-CONSOLIDATION** (`3cd197b34`, `e4229728a`, `9f1663ef1`) then **A8/#620** (`84fb20b8f`, *"wire the engine-vs-persisted P&L check — the one invariant never checked"*). | The **observation instrument** for P&L correctness. | **(2) update — highest priority.** Its own comment at `:129-131` already names its cap as "#618 leg 2". **An instrument that is itself truncated cannot audit the thing it measures.** |
| `m5e-validation-service.ts` | `f52c87e17` (B55 purge era), last touched **P19-B8.8** (`7de34c03d`) — the sizing-fallback fail-loud sweep, which explicitly retired m5e's *"alias-guessing + {8,40,12} fabrications"* to null-refuse. | Comparison/validation harness. | **(3→re-point)** — `getOpenPositionsCount()` reads OPEN positions from the CLOSED-trades reader. Wrong object; the canonical reader exists. |

**Governance corpora searched (rule 22 — naming them):** `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `PHASE_19_PLAN.md`, `CHANGES_AND_FIXES.md`, `RUNNING_ISSUES.md`, `ACTIVE_PATH_FLOW.md`, `DELETED_COMPONENTS_LOG.md`, and `B_KILLSWITCH_WINDOW_COMPLETION_REPORT.md`. **Nothing in scope is undocumented; #618 has carried the risk-path framing since 2026-07-29 and Kyle's two decisions since 2026-08-01.**

---

## PART 2 — HOW IT IS ACTUALLY WIRED (code, read at `3c3bda57c`)

**The reader** (`storage.ts:3102-3131`): `limit = filters?.limit || 100`, ordered `desc(openedAt)`, with a `never_filled` exclusion by default (P19-B7.2c typed guard). **The order key is the defect's multiplier:** every consumer that then filters on `closedAt` is bounding its set by OPEN time while asking a question in CLOSE time.

**The three portfolio endpoints** (`routes.ts:4565` / `:4705` / `:4721`):
- `/portfolio/overview` — `realizedPL` = a JS `reduce` over the capped array; **win rate = `closedTrades.slice(-30)`**, and because the array is `desc(openedAt)`, `slice(-30)` takes the **30 OLDEST of the truncated window**, not the most recent 30.
- `/portfolio/earnings` — a `reduce` over the capped array, and it **returns `tradeCount` in the response body**, so the cap is visible in the API's own output.
- `/portfolio/earnings-chart` — capped array → JS filter `closedAt >= cutoff` → group by date. Bound by open time, asked in close time, then charted.

**The risk path** (`guardrail-settings.ts:106` → `daily-loss-budget.ts:135`): capped array → JS filter `closedAt >= sessionStart` → `reduce` on `pnl` ⇒ `portfolioValue`, which is the **denominator** of the daily-loss percentage whose numerator B-KILLSWITCH-WINDOW already repaired. **Both errors push the same direction (numerator too small, denominator too large ⇒ trips LATER), so they compound.**

---

## PART 3 — RUNTIME MEASUREMENTS (staging, 2026-08-20T14:2x-14:3xZ)

**Object:** `closed_trades`, population = `closed_at IS NOT NULL AND close_reason IS DISTINCT FROM 'never_filled'` (the reader's own predicates). **Instrument:** live authenticated endpoint calls vs SQL over the same predicates.

| Surface | DISPLAYED NOW | TRUE (SQL, all rows) | Error |
|---|---|---|---|
| `/portfolio/earnings` total | **−$71.74 over "tradeCount: 100"** | **−$197.29 over 475 trades** | **understates the loss by $125.55**, and the response body publishes the cap as if it were the trade count |
| `/portfolio/overview` realizedPL | **−$71.74** | −$197.29 | same $125.55 |
| `/portfolio/overview` win rate | **43.33%** over 30 | **50.00%** over the true most-recent 30 by close | **−6.67 pp**, and they are the WRONG 30 (oldest of the window) |
| `earnings-chart?days=30` | **−$71.74 across only 17 days** | **−$40.76 across 310 trades** | wrong by **$30.98**, and it silently covers 17 days instead of 30 — the truncated window only reaches back to 2026-08-03 |
| `earnings-chart?days=7` | **+$145.05** | **+$145.05 (23 trades)** | **correct — by luck.** 23 rows fit inside 100. |

⇒ **The 7d/30d signature #618 documented on 2026-07-31 is STILL LIVE and now measured from the API rather than a screenshot: the short window is right, the long window collapses to the truncated total.**

**THE RISK PATH — HEADLINE FINDING, MECHANISM CORRECTED AT LANGSTON'S STEP-2 (r2). The conclusion survives; my mechanism was a WRONG-OBJECT read and his correction makes the argument stronger and falsifiable.**

⛔ **What r1 said:** "24h window = 10 closes, worst rank 20 against a cap of 100 ⇒ the cap does not bind today; the #693 drought is masking it."
⛔ **Why that was wrong (his catch):** it measured the **numerator's** population against the **denominator's** cap. They are different windows. `compute24hSnapshot` clamps to ≤24 h (`daily-loss-budget.ts:119`) **and that leg already went to SQL at B-KILLSWITCH-WINDOW** — so my 24 h rank census was measuring the leg that is already fixed. **`getPortfolioBalanceV2` filters on `sessionStart` UNCLAMPED** (`guardrail-settings.ts:113-121`): its binding is a function of **SESSION AGE**, not of 24-hour close volume.

**THE REAL MASKING AGENT IS PROCESS INSTABILITY, NOT THE DROUGHT.** `sessionStart = new Date()` at `active-execution-engine.ts:509` is **process-local**; pm2 reports **562 restarts** on `dawntrader` (verified independently at the box, uptime 3 h at the time of writing). The denominator's window is therefore almost always hours, because the process almost never survives days. ⇒ **the control is currently protected by process instability — and safety by instability is not a control (#512/#520/#585). Fix the liveness problem and this defect activates.** At July's ~23 closes/day, 100 rows ≈ **4.3 days of uninterrupted uptime** before the cap binds. That is the non-defer argument, and unlike the drought version it is falsifiable.

**MAGNITUDE — measured, and my figures DO NOT REPRODUCE HIS; flagged for reconciliation rather than silently adopting either.** Object `closed_trades`, predicates `closed_at IS NOT NULL AND close_reason IS DISTINCT FROM 'never_filled'`, rank by `opened_at DESC` (the reader's own order), visible set = `rnk <= 100`:

| | CC-C (2026-08-20T15:5xZ) | Langston (2026-08-20T14:4xZ) |
|---|---|---|
| closes since 2026-07-16 | **455** | 435 |
| true realized sum | **−$186.62** | −$129.72 |
| sum visible within the 100-row cap | **−$69.84** | −$71.74 |
| ⇒ P&L hidden from the denominator | **−$116.78** | −$57.98 |

**Both agree on direction, sign and order of magnitude; they disagree on the true-sum leg by ~$57.** Candidate causes, none confirmed: a different session anchor, a different `never_filled`/`closed_at` predicate set, or 70 minutes of intervening closes. **I am NOT reporting a single number until this reconciles** — this is the batch about numbers whose instrument was never stated. **What both measurements license:** the denominator is inflated by a material amount at long session age, i.e. the kill switch trips LATE, compounding with the numerator error that B-KILLSWITCH-WINDOW already repaired on one side.

**★ AND THE BRANCH NEITHER THE SCOPE NOR r1 NAMED (Langston):** `sessionStart === null` applies **NO TIME FILTER AT ALL** — `const sessionTrades = sessionStart ? allTrades.filter(...) : allTrades` (`guardrail-settings.ts:120`, read and confirmed). In that state `portfolioValue` = anchor + **the last-100-opens-ever realized sum**: a truncated ALL-TIME figure wearing a session balance's clothes, while the numerator falls back to a real 24 h — so the two sides of the ratio are then measuring different things entirely. **#585 is the documented state that produces `isRunning:true` / `sessionInfo:null`.** Whether the verdict is consulted in that state is **NOT established** — Step B establishes it and gives the null branch an explicit disposition (refuse, or anchor-only). **Same shape at `routes.ts:12347` and `:12549`.**

**Log evidence:** `[8.8.3-C7][GuardrailSettings] mode=paper startingBalance=824.11 realizedPnl=-6.62 currentBalance=817.49`, emitted every 1-2 s — the balance path runs constantly, so any error here is continuously live, not sampled.

---

## PART 4 — THE CHANGE PLAN

**Ordering principle:** the two legs stay separable (Kyle/#618), the risk leg is verified against the DB and the display leg against the UI (Langston), and each step is independently revertible.

### Step A — the reader contract (OBJ-4). **PURELY MECHANICAL — ZERO behaviour change, ZERO conversions.**
1. Delete `limit || 100`; make `limit: number` **required** on `getClosedTrades`.
2. ⛔ **r1 said "each of the 24 gets an explicit number OR is converted." That broke Step A's own justification** (Langston): the moment a conversion rides along, the step is no longer alone, no longer behaviour-free, and the trivial-revert claim is false. **CORRECTED RULE, no exceptions:** every **bare** call site gets `limit: 100`; every site already passing 1,000 keeps 1,000; every site already passing a number keeps it. **Nothing converts in Step A — including `guardrail-settings.ts:106`, whose defect is deliberately CODIFIED for one deploy** so the mechanical step stays mechanical.
3. **ACCEPTANCE FOR STEP A IS BYTE-IDENTICAL ENDPOINT OUTPUT** — the four portfolio/earnings surfaces must return exactly what they return today. If anything moves, Step A did something it was not allowed to do.
4. **Mutation proof:** dropping an argument is a compile error; `check-tsc-baseline` is message-keyed (#579), so a reverted site hard-fails CI.
5. **The per-site number/convert map is stated IN the Step-3 change list** (Langston's Part-5 addition — not stating it is what let four sites go undispositioned in r1).

### Step B — the risk leg (OBJ-1)
4. `getPortfolioBalanceV2`'s realized sum → a SQL aggregate over the session window, **copying `getRealizedPnlSince`'s predicate set verbatim** so the population is identical and only the row bound changes.
5. **Explicitly NOT done:** moving the ratio from `pnl` to `netPnl` (Langston's standing condition 2 — it must move on BOTH sides in ONE batch; that is a behaviour change, not this bug fix).
6. **Verification:** the denominator computed over a >100-row window matches SQL exactly; measured against a deliberately widened window so the cap would have bound.

### Step C — the display leg (OBJ-2), atomic where the riders require it
7. `/portfolio/earnings` → SQL `SUM` + real `COUNT(*)`. **The `tradeCount: 100` in the response body is the acceptance signal: it must become 475.**
8. `/portfolio/overview` → SQL `SUM`; **and in the SAME change** the win rate moves to the true most-recent 30 by `closed_at DESC` — uncapping without this converts "30 oldest of 100" into "30 oldest ever" (Langston's rider).
9. `/portfolio/earnings-chart` → **SQL `GROUP BY` on CLOSE date**, not a JS filter over a capped array (Langston's rider). Acceptance: `days=30` must span 30 days and equal −$40.76, while `days=7` stays +$145.05.
10. **`routes.ts:12961`** — ⚠ **#618 LEG 2's OWN PROVEN SITE** (`RUNNING_ISSUES:1700`, *"reaches the dashboard earnings card"*), and r1's plan named it nowhere. Feeds win-rate/expectancy across 6h/12h/24h/7d/30d/all — the same 7d-right / 30d-wrong signature. **Its own acceptance:** the long windows must stop collapsing onto the truncated total.
11. **`routes.ts:12347`** — the displayed realized BALANCE (bare + session-filtered): same shape as the `getPortfolioBalanceV2` defect on a different surface, **including the null-sessionStart branch**.
12. **`routes.ts:12549`** — portfolio summary, identical shape.
13. **`routes.ts:12458`** — the equity curve, and **the ONLY site reading `t.netPnl ?? t.pnl`.** ⛔ **Uncapping it while every other site stays on `pnl` WIDENS the basis split Langston's condition 2 exists to prevent. STATE the split; do NOT move the basis in this batch.**
14. `c5-financial-diagnostics.ts:118` / `:190` → SQL aggregates. **Priority within this step**, because it is the instrument the pairing decision is read from.
15. `c13:138/230`, `c14:201/360` → SQL aggregates (all four are bare calls: 100-cap **and** `closedOnly=false`).

### Step D — the wrong-object re-point
12. `m5e-validation-service.ts:146` → `storage.getActiveOpenPositions(mode)`. **Proof obligation: ID-LEVEL SET EQUALITY, not counts** (6 == 6 is not the same set).

### Step E — the 1,000-cap conversions (Langston Q2)
13. `active-portfolio-manager.ts:370/466/505`, `active-engine-service.ts:303`, `validation-session-service.ts:80/130` → aggregates (`COUNT(*)` where only a count is used).

### Step F — the migration (OBJ-3), SEPARATE deploy
14. `closed_trades` gains the paper/live discriminator; backfill; readers filter on it; `getRealizedPnlSince`'s inert `mode` becomes real (retires #618 leg 3).
15. **The backfill constant is RE-VERIFIED on the day, not inherited from the scope** — "every current row is paper" is a claim to measure, not an assumption to ship.

### Acceptance tests (behavioural, per Langston — the acceptance, not the fence)
- 7d ≠ 30d, with 30d carrying the correct sign and spanning 30 days.
- `/portfolio/earnings` `tradeCount` = the true count, not 100.
- Kill-switch denominator equals SQL over a window wider than 100 rows.
- §9.3 UI verification for every changed display surface.

---

## PART 5 — RISKS AND WHAT THIS AUDIT DID NOT ESTABLISH

1. **Making `limit` required touches 24 call sites in one commit.** That is the point (the compiler enumerates), but it is a wide diff; it lands ALONE in Step A, before any behaviour changes, so a revert is trivial.
2. **`c13`/`c14`/`validation-session-service` are LIVE but I have not read every one of their consumers in context** — I established reachability (dynamic `import()`/`require()`), not semantics. Each conversion states what the site computes before it changes.
3. **The 365-day retention exception on `closed_trades` means the population only grows.** Every cap in this census gets closer to binding over time; none self-limits.
4. **NOT established:** whether any historical decision was made on a truncated number. The displayed total has been understated by $125 for an unknown period; **I have not tried to reconstruct when it crossed, and I am not claiming a downstream consequence I have not measured.**
5. **r1 did not state which of the 24 sites Step A NUMBERS versus CONVERTS** (Langston's Part-5 addition) — and that omission is precisely what let four `routes.ts` sites go undispositioned. The per-site map now lands with the Step-3 change list, and Step A converts nothing at all.
6. **The magnitude of the denominator error is NOT SETTLED** — my measurement and Langston's disagree by ~$57 on the true-sum leg (table in Part 3). Reconciling it is a Step-B precondition, not a footnote: this batch does not get to publish a number whose instrument two readers cannot reproduce.
7. **Whether the daily-loss verdict is consulted while `sessionStart === null` is NOT established.** Step B establishes it before choosing the null branch's disposition.
