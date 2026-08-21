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

**★ r3 CORRECTION — "PROCESS INSTABILITY" IS NOT ESTABLISHED, AND THIS IS ALREADY-KNOWN GROUND (Kyle 2026-08-20: *"don't just assume you've discovered it"*).**
**What the record already says, searched before writing anything:** **#520** — *"ACTIVE ENGINE SILENTLY HALTS ON EVERY PROCESS RESTART"* — was **RESOLVED 2026-07-16** by `B-STAGING-LIVENESS-WATCH` (`2d163cf08`; unattended resume proven twice the same evening). **#512** closed with it. **#585 is OPEN, homed, owner CC-B, low-severity** — the auto-resume SKIPS a stale malformed `running` session row, leaving **`sessionInfo:null` while `isRunning:true`**. ⇒ **#585 IS the null-`sessionStart` state this audit flags below. It is not a new finding; it is an open issue with an owner, and this batch's null-branch disposition must cross-reference it rather than re-file it.**
**r4 — THE CONCLUSION IS NOW ESTABLISHED, BUT NEITHER OF THE FIRST TWO INSTRUMENTS COULD ESTABLISH IT. Both retractions on the record:**
- **Langston withdrew his own framing** (*"safety by process instability"*) as unevidenced — logged as his retraction.
- ⛔ **And MY replacement was unevidenced from the instruments I used — right answer, wrong instrument.** (a) `unstable_restarts` is a restart-**LOOP** detector, not a crash detector: it increments only when the process dies inside `min_uptime` (**30,000 ms** on this app), so **a clean crash after 31 s increments `restart_time` and leaves `unstable_restarts` at 0**. Positive control in the same `pm2 jlist` I read: `pm2-logrotate` carries `unstable_restarts=1`, so the field CAN be non-zero on this daemon — my zero was not evidence of no crashes. (b) `/home/deploy/dawntrader-deploy.record` is **8 lines = ONE stanza, not an append log** — one (deploy, counter) pair and zero deltas, which has no power to establish "increments per deploy."
- ✅ **THE MEASUREMENT THAT DOES ESTABLISH IT (Langston, and I am citing his instrument because mine could not reach it):** `/home/deploy/.pm2/pm2.log` — unrotated single file, self-evidencing span **2026-03-30T17:33:06 → 2026-08-20T12:27:53** — carries **601 `dawntrader` exit lines: 592 `code=0 signal=SIGINT`, 7 `code=1 signal=SIGINT`, 2 `code=0 signal=SIGKILL`, and ZERO signal-less exits** ⇒ **no unhandled-crash terminations across the whole span. Deliberate-restart cadence is ESTABLISHED, not asserted.**
⇒ **the short denominator window is explained by DEPLOY CADENCE.**
**⚠️ THE CORRECTED ARGUMENT IS STRONGER, NOT WEAKER, AND IT IS THE REASON NOT TO DEFER:** if the window is short because we deploy several times a day, then **it lengthens exactly when we stop doing that — i.e. in LIVE MODE, on a stable production system left running for days.** The defect activates at precisely the moment it matters most, and no stability work is needed to get there. At July's ~23 closes/day, 100 rows ≈ **4.3 days of uninterrupted uptime.**

**(Original r2 framing, retained so the correction is legible: "the real masking agent is process instability, not the drought.")** `sessionStart = new Date()` at `active-execution-engine.ts:509` is **process-local**; pm2 reports **562 restarts** on `dawntrader` (verified independently at the box, uptime 3 h at the time of writing). The denominator's window is therefore almost always hours, because the process almost never survives days. ⇒ **the control is currently protected by process instability — and safety by instability is not a control (#512/#520/#585). Fix the liveness problem and this defect activates.** At July's ~23 closes/day, 100 rows ≈ **4.3 days of uninterrupted uptime** before the cap binds. That is the non-defer argument, and unlike the drought version it is falsifiable.

**MAGNITUDE — measured, and my figures DO NOT REPRODUCE HIS; flagged for reconciliation rather than silently adopting either.** Object `closed_trades`, predicates `closed_at IS NOT NULL AND close_reason IS DISTINCT FROM 'never_filled'`, rank by `opened_at DESC` (the reader's own order), visible set = `rnk <= 100`:

| | CC-C (2026-08-20T15:5xZ) | Langston (2026-08-20T14:4xZ) |
|---|---|---|
| closes since 2026-07-16 | **455** | 435 |
| true realized sum | **−$186.62** | −$129.72 |
| sum visible within the 100-row cap | **−$69.84** | −$71.74 |
| ⇒ P&L hidden from the denominator | **−$116.78** | −$57.98 |

**Both agree on direction, sign and order of magnitude; they disagree on the true-sum leg by ~$57.** Candidate causes, none confirmed: a different session anchor, a different `never_filled`/`closed_at` predicate set, or 70 minutes of intervening closes. **I am NOT reporting a single number until this reconciles** — this is the batch about numbers whose instrument was never stated. **What both measurements license:** the denominator is inflated by a material amount at long session age, i.e. the kill switch trips LATE, compounding with the numerator error that B-KILLSWITCH-WINDOW already repaired on one side.

**★ AND THE BRANCH NEITHER THE SCOPE NOR r1 NAMED (Langston):** `sessionStart === null` applies **NO TIME FILTER AT ALL** — `const sessionTrades = sessionStart ? allTrades.filter(...) : allTrades` (`guardrail-settings.ts:117-119` — citation corrected at Langston's Step-A ruling; r3 said `:120`). In that state `portfolioValue` = anchor + **the last-100-opens-ever realized sum**: a truncated ALL-TIME figure wearing a session balance's clothes, while the numerator falls back to a real 24 h — so the two sides of the ratio are then measuring different things entirely. **#585 is the documented state that produces `isRunning:true` / `sessionInfo:null` — OPEN, homed, owner CC-B, low-severity, filed 2026-07-27. This batch does NOT re-file it: Step B cross-references #585 and dispositions the null branch's BEHAVIOUR IN THE BALANCE READER (refuse, or anchor-only), which is a separate question from fixing the session-row reconciliation that #585 owns.** Whether the verdict is consulted in that state is **NOT established** — Step B establishes it and gives the null branch an explicit disposition (refuse, or anchor-only). **Same shape at `routes.ts:12347` and `:12549`.**

**Log evidence:** `[8.8.3-C7][GuardrailSettings] mode=paper startingBalance=824.11 realizedPnl=-6.62 currentBalance=817.49`, emitted every 1-2 s — the balance path runs constantly, so any error here is continuously live, not sampled.

---

## PART 4 — THE CHANGE PLAN

**Ordering principle:** the two legs stay separable (Kyle/#618), the risk leg is verified against the DB and the display leg against the UI (Langston), and each step is independently revertible.

### Step A — the reader contract (OBJ-4). **PURELY MECHANICAL — ZERO behaviour change, ZERO conversions.**
1. Delete `limit || 100`; make `limit: number` **required** on `getClosedTrades`.
2. ⛔ **r1 said "each of the 24 gets an explicit number OR is converted." That broke Step A's own justification** (Langston): the moment a conversion rides along, the step is no longer alone, no longer behaviour-free, and the trivial-revert claim is false. **CORRECTED RULE, no exceptions:** every **bare** call site gets `limit: 100`; every site already passing 1,000 keeps 1,000; every site already passing a number keeps it. **Nothing converts in Step A — including `guardrail-settings.ts:106`, whose defect is deliberately CODIFIED for one deploy** so the mechanical step stays mechanical.
3. **ACCEPTANCE FOR STEP A IS BYTE-IDENTICAL ENDPOINT OUTPUT** — the four portfolio/earnings surfaces must return exactly what they return today. If anything moves, Step A did something it was not allowed to do.
4. **Mutation proof:** dropping an argument is a compile error; `check-tsc-baseline` is message-keyed (#579), so a reverted site hard-fails CI.
5. **`limit: 0` CENSUS (Langston's Step-A condition — `storage.ts:3104` is `filters?.limit || 100`, not `??`, so a site passing 0 to mean "no cap" would be silently re-capped):** **NO call site passes `limit: 0`.** Repo-wide grep over all 24 sites returns zero literal `limit: 0`. The one site that could receive a zero from outside — `routes.ts:12042`, whose options are built from a query param — guards it upstream at `:12039` (`if (limit) options.limit = parseInt(...)`), so a `?limit=0` is falsy and never reaches the reader. ⇒ the `||`-vs-`??` hazard is **unreachable today**, and it **dissolves entirely** once `limit` is required (there is no default left to fall through to). Stated rather than assumed, per his condition.
6. **The per-site number/convert map is stated IN the Step-3 change list** (Langston's Part-5 addition — not stating it is what let four sites go undispositioned in r1).

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
---

## PART 6 — THE −$52.79 TRACED (2026-08-21, at Kyle's direction to verify on staging). **IT IS NOT JUST THE CAP, AND CONVERTING THIS SITE MECHANICALLY WOULD HAVE CHANGED A SECOND THING SILENTLY.**

**The surface:** the PAPER-TRADING page's Earnings card (`mode-dashboard-tab.tsx:169`), fed by `/api/active-engine/trades/analytics` → `routes.ts:13023` `getClosedTrades(mode, { limit: 100 })` → `computeRollingEarnings`. ⚠️ **NOT the main home Dashboard — Kyle 2026-08-21: that page is NOT this batch's and is to be left alone.**

**Five hypotheses were eliminated first** (measured, so nobody re-runs them): true-30d `−16.79/310` · capped-100 `−35.47/100` · including `never_filled` `−16.79/358` · the `net_pnl` column alone `−16.79/310` · since-the-08-12-re-anchor `+203.43/29`. **None is −52.79.**

**REPRODUCED EXACTLY** by composing what the code actually does — cap, THEN a ghost filter, THEN the rolling window, on the `netPnl ?? pnl` basis:
| window | reproduced | UI shows |
|---|---|---|
| 30d | **−52.79 over 95 rows** | **−$52.79** ✓ |
| 7d | **+153.50 over 25 rows** | **$153.50** ✓ |
| 24h | +2.50 over 7 rows | (card reads −$4.17 — a later window; the derivation is settled by the other two) |

**★ THE FINDING THAT MATTERS FOR THE CONVERSION — a THIRD population predicate nobody has named:** `routes.ts:13031` filters the capped rows again, keeping only trades with **`exit_price > 0` AND a non-empty `close_reason`** (the "ghost trade" exclusion, Phase 8.8.3-B3). That is **NOT** one of the three predicates every aggregate in this batch shares. **Measured effect: it drops 5 of the 100 rows in the 30-day window and moves the figure from −35.47 to −52.79 — i.e. the ghost filter contributes MORE of the error than the cap does at this window.**

⇒ **CONSEQUENCE FOR STEP C's REMAINING SITES:** using `getRealizedPnlTotal` here would have removed the cap **and silently changed the population**, and the resulting number would have looked like "the fix working" while two things moved at once. **This site needs its own aggregate carrying the ghost predicate**, or an explicit ruling that the ghost filter is redundant against `exit_price`/`close_reason` at the SQL level — **not assumed either way.**
⚠️ **AND IT IS ALSO A `netPnl ?? pnl` READER** — the basis Langston's condition 2 says must not move alone. So this site carries BOTH open questions and is the last one to convert, not the first.


---

## PART 7 — STEP F PLAN (2026-08-21): the `closed_trades` paper/live column. **DISPATCHED FOR LANGSTON SIGN-OFF BEFORE IMPLEMENTATION — this is a schema change on a live table with a backfill, and it is the one step in this batch where getting it wrong writes something permanent.**

**KYLE'S SETTLED DECISION (2026-08-01), leg 2:** add a paper/live column to `closed_trades`, backfill it, and make the `mode` argument real.

**WHY IT IS NEEDED — the defect, stated precisely.** `getClosedTrades(mode, …)` **accepts a `mode` argument and never uses it.** No mode predicate reaches the SQL. The same is true of `getRealizedPnlTotal`, `getRealizedPnlSince`, `getDailyRealizedPnlSince`, `getRecentClosedPnls`, `getPortfolioMetricComponents` and `getClosedTradesCount` — every one of them takes `mode` and every one of them ignores it. ⚠️ **It is not merely unused, it is STRUCTURALLY UNUSABLE: `closed_trades` has no paper/live discriminator column at all.** Safe today only because live has never run; **the moment live mode opens one trade, every paper figure on the dashboard silently starts including live trades, and every live figure includes paper ones.** That is a Phase-21 correctness precondition, not a tidy-up.

**★ THE BACKFILL CONSTANT — VERIFIED ON THE DAY, WITH PRESENCE-EVIDENCE (rule 22), because a backfill onto an unverified constant writes a permanent error:**
| measurement | result |
|---|---|
| `active_engine_sessions` grouped by mode | **`paper` ONLY — 161 sessions, 2025-12-08 → 2026-07-16. ZERO `live` rows, ever.** |
| instrument reach (does it find sessions when they exist?) | **yes — it returned 161** |
| `trade_mode` distinct values over all 581 rows | **`TARGET` on all 581** — an exit-type field, NOT a mode discriminator |
| `chosen_entry_mode` / `exit_fee_mode` | maker/taker/null — order-side fields, not modes |
⇒ **every existing row is a paper trade. The backfill value is `'paper'` for all 581, and that is measured rather than assumed.**

**THE THREE DESIGN CALLS I WANT RULED BEFORE I WRITE ANYTHING:**

**(1) `NOT NULL` with a DEFAULT, or without?** A `DEFAULT 'paper'` makes the migration trivially safe today — and lays a trap for Phase 21, because a live writer that forgets to set the column silently records a live trade as paper. **That is the fail-open shape this project keeps paying for.** No default forces every writer to say which mode it is, and makes a missed writer a loud insert failure rather than a silent mislabel. **My recommendation: `NOT NULL`, NO default** — but it requires every writer updated in the same batch, so the census below has to be exhaustive first.

**(2) One migration or two?** Adding a column, backfilling, and applying `NOT NULL` in one migration is atomic but fails hard if any writer was missed. Splitting (nullable → backfill → writers → `NOT NULL`) is safer but leaves a window where a NULL can be written and nothing complains. **My recommendation: one migration, gated on the writer census being complete and a fence proving zero NULLs.**

**(3) Do the readers start filtering in the SAME step?** Adding the predicate changes NOTHING today — all rows are paper and every caller asks for paper. **So it is verifiable as a no-op now and becomes load-bearing later, which is the ideal time to ship it.** The alternative — column now, predicate at Phase 21 — means the predicate lands when it *does* change numbers and nobody can tell a correct change from a regression. **My recommendation: filter in this step, precisely because it is provably inert today.**

**WHAT MUST BE DONE BEFORE ANY OF IT — the §9.5(a) writer census.** Enumerate every site that INSERTs into `closed_trades`, repo-wide, tests excluded, and state the list. A missed writer is the failure mode for all three calls above. **Not yet done — it gates the implementation, and I will not write the migration until it is.**

**FENCES this step must ship:** (a) zero NULL modes in `closed_trades`; (b) the reader's mode predicate actually reaches SQL — asserted by querying with each mode and proving the populations differ once a live row exists, or, while none does, by asserting the generated SQL carries the predicate. **(b) is the one that matters: a `mode` argument that silently does nothing is exactly what this step exists to delete, and shipping a new one that also does nothing would be the same defect wearing a fix's clothes.**

### PART 7a — THE §9.5(a) WRITER CENSUS: DONE, and it strengthens the recommendations above

Repo-wide over `server/` and `shared/`, tests excluded:
| finding | detail |
|---|---|
| **physical INSERT sites** | **EXACTLY ONE — `storage.ts:3094`**, inside `createClosedTrade(mode, trade)` |
| **callers of that wrapper** | **THREE, all already passing a correct mode** — `routes.ts:12894` (`'paper'`), `routes.ts:12975` (`'paper'`), `active-execution-engine.ts:3358` (`this.mode`) |
| ★ **the shape of the bug** | **`createClosedTrade` ALREADY RECEIVES `mode` AND THROWS IT AWAY.** `:3093` builds `normalizedTrade = { ...trade, symbol: canonicalSymbol }` and never stamps the parameter it was handed. |

⇒ **the write side is a ONE-LINE fix at a single choke point, and every caller already supplies the right value.** That materially strengthens design call (1): *"every writer must state its mode"* costs one line rather than a sweep, so **the safe-by-construction option (`NOT NULL`, no default) is also the cheap one** — the usual tension between the two does not arise here.

⚠️ **Asserted absence, with the instrument named (rule 22):** the INSERT census matched on `insert(closedTradesTable)`, `insert(closedTrades)` and raw `INSERT INTO closed_trades`, and separately on the wrapper names `createClosedTrade` / `addClosedTrade` / `recordClosedTrade`. The wrapper search returned the three real callers, so **the instrument demonstrably finds callers when they exist** — the single-INSERT result is a measurement, not a blind read. ★ **And it searched `this.`-qualified forms too**, which is the correction #734's blocker forced on me the same day.

### PART 7b — CORRECTIONS FROM LANGSTON'S STEP-F REVIEW (2026-08-21). **The backfill conclusion survives; the ARGUMENT for it does not, and the argument is the part that would have gone into a permanent migration.**

**(i) ⛔ MY BACKFILL EVIDENCE WAS THE WRONG OBJECT — right answer, wrong reason.** I argued *"every `active_engine_sessions` row is `paper`, therefore every closed trade is paper."* **That does not close over the population.** Two of the three writers (`routes.ts:12894`, `:12975`) are **manual-close paths that do not run inside an engine session at all**, and orphan rows exist (#508). So session history says nothing about those rows. **THE AIRTIGHT ARGUMENT IS SIMPLER AND I ALREADY HAD IT: live mode has never been enabled, so no live writer has ever existed to write any row.** That closes over all 581 without reference to sessions. Recorded as such; the session count is demoted to corroboration.

**(ii) POPULATION RECONCILIATION, since two different totals appear in this batch's record.** **569** was the whole-table count measured 2026-08-20 ~23:00Z; **581** is the same measurement on 2026-08-21 ~13:00Z. **Not a discrepancy — twelve trades closed in between.** Neither is a standing fact. ⇒ the stale figure has been removed from the `'all'` comment in `storage.ts` and replaced by a runtime instrument (below), because **a reasoning comment must not carry a drifting number.**

**(iii) ⛔ "EQUAL BY CONSTRUCTION" IS REFUTED AND RETRACTED.** I cited `shared/schema.ts:1710` — `netPnl: decimal("net_pnl", …).default("0"), // gross_pnl - total_cost`. **That is a COMMENT, not a mechanism.** `generatedAlwaysAs` appears nowhere in the tree; nothing computes one column from the other; `createClosedTrade` normalizes the symbol and passes everything else straight through. **Equality is a property of the WRITERS, and they are not symmetric** — the engine's open-insert writes NEITHER column (equality is established later by the close update), and the stranded-clear writer (`routes.ts:12975`) writes `pnl` only, letting `net_pnl` fall to its `'0'` default. **The correct citation is `routes.ts:12854` — `pnl: netPnl.toString()` — the SAME variable, so THAT writer cannot diverge. Cite the writer, never the schema comment.**

**(iv) ⛔⛔ MY OWN FENCE ASSERTED AN UNREADABLE ZERO, and this is the one that matters most.** It counted disagreements over `closed_at IS NOT NULL AND close_reason IS DISTINCT FROM 'never_filled'` and reported **0 over 489**. **Table-wide, 90 of 581 rows disagree — and that predicate excludes EVERY ONE of them:** 86 are `never_filled`, and the other **4 have `close_reason IS NULL` with `closed_at` also NULL** (re-derived independently: 86 + 4 + **0 other** = 90). ⇒ **the population could not contain a disagreeing row, so the zero was STRUCTURALLY GUARANTEED, not measured clean.** A zero drawn from a population that cannot hold a one is not evidence. **FIXED two ways:** the positive control now exercises the **FULL query — population predicate AND comparison** — over a synthetic set containing exactly one in-scope disagreement (verified: returns 1), proving the population would ADMIT an in-scope disagreement; and the assertion now **reports the excluded rows beside the included ones** (`in-scope 491/581; 0 in-scope disagreements; 90 disagreeing table-wide, excluded by design`) so the zero is readable without re-derivation.

**(v) `'all'` APPROVED, with the rider implemented.** Langston: the cost is unbounded in the *future* and nothing would tell us the day it stops being cheap. ⇒ `logUnboundedRead()` reports the returned row count on **every** unbounded read, warning past a named 5,000-row review point. **It lives in the READER, not at the two call sites** — a future third `'all'` caller inherits the instrument instead of having to remember it, the same derived-not-listed reasoning as the #704 fence subject.

**(vi) NEW FINDING, bucket 2, filed rather than fixed here:** the 4 `close_reason IS NULL` rows are shaped `pnl = NULL` vs `net_pnl = '0.00000000'`. `NULL IS DISTINCT FROM 'never_filled'` is TRUE, so **they pass every existing analytics guard**, where a `netPnl ?? pnl` reader scores them `0.00` and a `SUM(pnl)` reader scores them NULL. **Money impact ≈ 0 either way — not a blocker.** It is `.default("0")` on a nullable sibling: an absent value wearing a plausible number's clothes (#546). Homed below.

### PART 7c — KYLE-DIRECTED INVESTIGATION (2026-08-21): "we DID separate paper and live — dig in." **HE IS RIGHT THAT A SEPARATION BATCH EXISTS. IT IS A DIFFERENT COLUMN. And the gap is WIDER than Step F's scope.**

**★ FIRST — THIS IS NOT A NEW FINDING, AND I PRESENTED IT AS ONE. §9.5(b-ii) VIOLATION.** `RUNNING_ISSUES #618` **leg 3** has documented it since **2026-07-31** (Langston-found, CC-C-verified), and `RUNNING_ISSUES.md:1695` records the three-way inconsistency verbatim. **More: KYLE HIMSELF DECIDED THE FIX ON 2026-08-01** — *"add the column, backfill it, and make the argument actually do its job."* **Step F is the implementation of his own three-week-old decision.** The ledger search §9.5(b-ii) mandates would have returned it on the first grep.

**★ SECOND — THE BATCH HE REMEMBERS IS REAL: `Batch 65.2`, 2026-04-23.** Catalog: *"`trade_mode` populated across all 4 trade-row tables (new column migration + backfill)."* **A mode column, four trade tables, a backfill — exactly as he recalled.**
⇒ **BUT IT IS NOT THE PAPER/LIVE COLUMN.** `shared/schema.ts:738` states it at the source: `// Directive 9.2: TARGET or TRAILING_TAKE`. **`trade_mode` is the TRAILING-EXIT STATE.** Confirmed in code (`trailing-exit-controller.ts:918`, `active-execution-engine.ts:1627`) and in data (`'TARGET'` on all 581 closed trades and all 4 open positions). **His memory is accurate; the column is about something else.**

**THIRD — THE CODE *IS* SEPARATED; ONLY THE STORED DATA IS NOT.** `P19-B2` (2026-06-13) records the engine as **already mode-parametric** — *"`mode:'live'|'paper'` threaded throughout"* — live **409-gated until Phase 21**. A proper enum exists: `trading_mode` = `live | paper | passive | learning`, used by `trades.mode`. ⚠️ **But `trades` is EMPTY (0 rows), as is `paper_trades`** — legacy. The **active** pipeline writes to `closed_trades` (581) and `active_open_positions` (4), neither carrying a discriminator. ⇒ **nothing is wrong today and never has been: live has never been enabled, so no live row exists to mix.** Latent, Phase-21-triggered, exactly as #618 says.

**★★ FOURTH — NEW MATERIAL, AND IT WIDENS STEP F. `closed_trades` IS NOT THE ONLY TABLE.**
| site | mode-aware? |
|---|---|
| `active_open_positions` (4 rows) | **NO discriminator** — `trade_mode` is `'TARGET'` here too |
| `getActiveOpenPositions(mode)` | **accepts `mode`, applies NO predicate** |
| `deleteActiveOpenPosition(mode, id)` | ignores `mode` |
| **`deleteAllActiveOpenPositions(mode)`** | ⚠️ **deletes EVERY row regardless of mode** |
| **`deleteAllClosedTrades(mode)`** | ⚠️ **deletes EVERY row regardless of mode** |
| `deleteAllActiveTradeLogs(mode)` | ⚠️ same |
★ **The reset family is the sharper half and I had not looked at it.** A "reset paper" in Phase 21 would **wipe live history**, and vice versa. **Destructive rather than mis-reported — the only part of this that could LOSE data instead of misstating it.** ⇒ **Step F must cover `active_open_positions` and the reset family, not just `closed_trades`.**

**FIFTH — WHY "mode-based only" SITS ON QUERIES THAT FILTER BY NOTHING.** `SYSTEM_MANUAL.md:5170`: *"Global scope — Phase 27.F.15.A: **no userId filtering** for trades (mode-based only)."* It meant *scoped by MODE rather than by USER* — recording the removal of the multi-user model. **The user half shipped; the mode half never did, because only paper existed to scope.** The comment has described an intention as a mechanism ever since — the same shape as the `net_pnl` schema comment I was caught on earlier today.

**IS THE RETROACTIVE FIX EASY? YES.** One INSERT site per table, a backfill constant proven by *"live has never been enabled"*, and a writer that **already receives the mode and discards it**. **No historical reconstruction is needed: every existing row is paper by necessity, not by inference.**
