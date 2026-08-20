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

**THE RISK PATH — and this is the audit's most important finding, because it inverts the intuition:**
- 24h window right now: **10 closes, worst rank-at-close 20 against a cap of 100** ⇒ **the cap does NOT bind on the risk path today. The kill-switch denominator is correct at this moment, by a margin of 80.**
- #618's own 2026-07-31 measurement, at ~23 closes/day: **worst-case rank-at-close 215**, 3 rows invisible at their close, all three losses.
- ⇒ **THE DEFECT'S VISIBILITY IS INVERSELY PROPORTIONAL TO HOW WELL THE SYSTEM IS TRADING.** The #693 drought is currently masking it. When volume recovers to July levels the risk path silently breaks again — **and "it is fine today" is exactly the reading that would justify deferring it.** Same shape as `m5e:146` (correct today by a margin of 13) and as #704 (a plausible number from a broken instrument).

**Log evidence:** `[8.8.3-C7][GuardrailSettings] mode=paper startingBalance=824.11 realizedPnl=-6.62 currentBalance=817.49`, emitted every 1-2 s — the balance path runs constantly, so any error here is continuously live, not sampled.

---

## PART 4 — THE CHANGE PLAN

**Ordering principle:** the two legs stay separable (Kyle/#618), the risk leg is verified against the DB and the display leg against the UI (Langston), and each step is independently revertible.

### Step A — the reader contract (OBJ-4, lands FIRST because it enumerates the work)
1. Delete `limit || 100`; make `limit: number` **required** on `getClosedTrades`.
2. `tsc` then names every caller. **Each of the 24 gets an explicit number or is converted** — no site inherits a default. The three LIST readers state their page size at the call site.
3. **Mutation proof:** removing an argument is a compile error; `check-tsc-baseline` is message-keyed (#579) so a reverted site hard-fails CI.

### Step B — the risk leg (OBJ-1)
4. `getPortfolioBalanceV2`'s realized sum → a SQL aggregate over the session window, **copying `getRealizedPnlSince`'s predicate set verbatim** so the population is identical and only the row bound changes.
5. **Explicitly NOT done:** moving the ratio from `pnl` to `netPnl` (Langston's standing condition 2 — it must move on BOTH sides in ONE batch; that is a behaviour change, not this bug fix).
6. **Verification:** the denominator computed over a >100-row window matches SQL exactly; measured against a deliberately widened window so the cap would have bound.

### Step C — the display leg (OBJ-2), atomic where the riders require it
7. `/portfolio/earnings` → SQL `SUM` + real `COUNT(*)`. **The `tradeCount: 100` in the response body is the acceptance signal: it must become 475.**
8. `/portfolio/overview` → SQL `SUM`; **and in the SAME change** the win rate moves to the true most-recent 30 by `closed_at DESC` — uncapping without this converts "30 oldest of 100" into "30 oldest ever" (Langston's rider).
9. `/portfolio/earnings-chart` → **SQL `GROUP BY` on CLOSE date**, not a JS filter over a capped array (Langston's rider). Acceptance: `days=30` must span 30 days and equal −$40.76, while `days=7` stays +$145.05.
10. `c5-financial-diagnostics.ts:118` / `:190` → SQL aggregates. **Priority within this step**, because it is the instrument the pairing decision is read from.
11. `c13:138/230`, `c14:201/360` → SQL aggregates (all four are bare calls: 100-cap **and** `closedOnly=false`).

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
