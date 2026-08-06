# B-READER-TRUTH — Pre-Implementation Audit (Step 2)

**Audits against scope + Langston's Step-1 §5 obligations (`b490fb6d0`). Every claim names its instrument. Owner CC-C.**

## 1. OBLIGATION 1 — the FOUR cap sites, each named and ruled

| site | function | cap | callers (grep, tests excluded) | RULING proposed |
|---|---|---|---|---|
| `storage.ts:3147` | `getClosedTrades` | `\|\| 100` | dashboard/aggregation consumers (#618 legs) + listing | **(2)** — becomes LISTING-only; every aggregation consumer re-pointed at SQL aggregates; the default cap becomes an EXPLICIT required param (no silent `\|\| 100`), loud-refuse absent |
| `storage.ts:3335` | `getClosedTradesGlobal` | `\|\| 1000` | **ZERO callers** (re-verified) | **(5)** — delete in-batch, rule 18 (log, `.removed`, tombstone; decision-rejected as a fix) |
| `storage.ts:3470` | `getActiveTradeLogs` | `\|\| 100` | `routes.ts:13306` (log listing endpoint) + `engine:3749` (recent-log read) | **(1)** — legitimately a LISTING reader; cap made explicit-required, never summed over |
| `storage.ts:3655` | `getExecutionAttemptAudits` | `\|\| 100` | `routes.ts:16769` (listing) — ⚠️ **but `:16882`/`:16939` pass `limit: 10000` and then AGGREGATE over the rows** (blocked/opened counts) | **(2)** — the two aggregate consumers are #618-pattern-in-waiting exactly as Langston predicted; re-point them at SQL counts in this batch; the listing use keeps an explicit cap |

**Langston's prediction confirmed by the census: a fixed reader had a capped sibling being aggregated over at `routes.ts:16882/16939` — the recurrence was already in the tree.**

## 2. OBLIGATION 2 — writer census + migration ordering

**INSERTS all flow through ONE chokepoint: `storage.createClosedTrade` (`storage.ts:3119-3128`) — verified: the callers (`routes.ts:12779`, `routes.ts:12860`, `active-execution-engine.ts:3330`; engine `:3480`/`:3514` are comments) all call it, and it ALREADY RECEIVES `mode: TradingMode`.** ⇒ the stamp is applied at exactly one point: `createClosedTrade` writes the new column from its own `mode` param. `updateClosedTrade` (`:3131`) and the `:4151` update never create rows — no stamp needed. **Fence: a source-level assertion that `createClosedTrade` stamps the column + an integration insert-and-read-back.**
**Migration ordering (stated per obligation): add NULLABLE → backfill → VERIFY (count of NULLs = 0 AND the §4 source-split check) → set NOT NULL.** Rollback file kept out of the manifest per policy.
**⚠️ BACKFILL PREMISE — A VERIFY QUERY IS MANDATORY, and one stray observation makes it non-optional:** an earlier ad-hoc staging query (a pre-existing `/home/deploy/split.sql`, not mine) printed source/mode rows suggesting `vts-runner`-sourced rows may exist in some trade table (6,801 under `mode='vts'`). My aggregates over `closed_trades` (351 rows under the standard predicates) show no such population — **but the backfill runs over ALL rows, predicates or none.** The verify step must split `closed_trades` by writer-source metadata and confirm every row is genuinely paper-mode before `paper` is stamped wholesale. If a non-paper population exists, the backfill maps it explicitly, not by default.

## 3. OBLIGATION 3 — the denominator's WINDOW change, stated as deliberate

**Current semantics** (`guardrail-settings.ts:105-125`, ref-verified by Langston): realized sum = capped reader → filtered to `closedAt >= engineSessionStart` — i.e. **SESSION-scoped** (re-anchors every restart, #632's mechanism, Kyle's June circuit-breaker decision).
**Intended semantics after obj-6: SINCE-ANCHOR** (the `portfolio_state.balance` anchor, v3 = 2026-07-16) — the same window the Realized Balance display gets. **This is a DELIBERATE semantic change to a risk gate and this section is its named statement:** the guardrail balance stops shrinking its history to the current engine session and becomes the true anchor-based balance. **Interaction with #632 stated honestly: the daily-loss RATIO's numerator stays session/24h-scoped (Kyle's circuit-breaker, untouched); only the DENOMINATOR (portfolio value) changes window — it becomes MORE stable across restarts, which is risk-conservative in direction (a restart can no longer inflate the denominator's base via a fresh session).** Langston rules the P19-B6 un-void against this statement at Step-4.

## 4. OBLIGATION 4 — the live `getTrades` twin

`guardrail-settings.ts` live branch reads `getTrades(mode,{status:'closed'})` (unbounded, own table). **Disposition: (2)-DEFERRED-WITH-HOME** — live money figures route through the same SQL-aggregate surface **when live values are set** (Kyle deferred live values 2026-08-06); the home is the Phase-21 pre-flight checklist item this batch adds to `POST_AUDIT_ROADMAP` at Step-10. Not wired now: the live table's schema differs (`trades`, `realizedPL`, `exitTime`) and Kyle explicitly deprioritized live settings.

## 5. Consumers re-pointed (the change list's spine)

Dashboard earnings 24h/7d/30d + `validTrades` uses (`routes.ts:12958`, `:13142` false comment) · Realized Balance + Portfolio Value + top bar · "Net P/L (window)" → since-inception (true) · `getPortfolioBalanceV2` (§3) · `routes.ts:16882/16939` audit aggregations (§1). Each consumer's before/after lands in the Step-4 change list with the §7-fence covering it.

## 6. Staging verification plan (§9.3)

BEFORE evidence = Kyle's 08-05 screenshots + my measured deltas (30d sign-flip; realized +$144). AFTER = the same panels re-read against direct SQL, via Claude-in-Chrome, plus `dt-deploy` post-conditions. Engine-restart costs (#624 stamp gap, #632 re-anchor) accepted per deploy as known.

## 7. Verdict requested

Buildable; obligations 1-4 discharged above with two findings for your ruling: the `:16882/:16939` aggregate-over-capped-listing recurrence (folded into obj-1's re-point) and the backfill source-split verify (folded into obj-2's migration gate). CI note: GitHub Actions major outage tonight — Step-5's green gate may lag independent of the work.


---

## 8. LANGSTON STEP-2 VERDICT — PROCEED (2026-08-07, at `805312590`), obligations 1-4 discharged to the bar. FOUR RIDERS FOR THE STEP-3 CHANGE LIST (none blocking):

1. **The `:16882/:16939` re-point pushes the `sessionStart` filter INTO SQL** — today the session scoping is a JS filter after the fetch; a SQL COUNT without that predicate is a different number. The window rides in the query, not the post-aggregation.
2. **The false "AJ8: No limit cap" comments above those two `limit: 10000` calls are corrected in the same diff.**
3. **★ `b-killswitch-window.test.ts:141-170` inserts DIRECTLY into `closedTradesTable` — outside the `createClosedTrade` chokepoint** ⇒ the chokepoint fence doesn't reach test fixtures, and they BREAK at NOT NULL unless stamped in-batch. Updated in-batch and noted so the red isn't misread at CI. *(My own fence, caught by his read — the chokepoint claim was true of production and silently false of fixtures.)*
4. Line nit accepted: `getClosedTradesGlobal` impl at `:3334`.
**RULED ON REPORTED FACT (his marking): the stray 6,801-row observation — settled on-box by the hard-gating source-split VERIFY, kept mandatory.** Backfill ordering, fence design, Phase-21 live-twin home approved as written. **Step-3 is UNBLOCKED.**
