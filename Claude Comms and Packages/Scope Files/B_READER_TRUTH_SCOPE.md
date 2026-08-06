# B-READER-TRUTH — Scope (Step 1)

change-class: architecture

**Batch:** B-READER-TRUTH — make every dashboard money figure TRUE by computing totals in the database, add the real paper/live column with backfill, and repair the kill-switch DENOMINATOR (closing #618's open leg). **Owner CC-C. First in Kyle's build order (ahead of the geometry reset and B-SIZING-DEC-RESTORE). Board card: "Fix the earnings display and trade-history reader."** Deploys via `dt-deploy` (consensus with CC-B recorded on their pre-audit).

## 0. Kyle's decisions (recorded verbatim on #618 — this scope implements, does not re-litigate)

1. **"Compute the totals in the database"** — SQL-side aggregates, unbounded by construction. REJECTED alternatives (recorded): wiring `getClosedTradesGlobal` (1000-cap re-breaks in ~a month, silently and identically) and pagination.
2. **"Add the column, backfill it, and make the argument actually do its job. Do this now, rather than at live launch."** — `closed_trades` gains a real paper/live discriminator; existing rows backfilled; the `mode` parameter on the readers finally filters (retires #618 leg 3).
3. **"Net P/L (window)" is REPLACED by NET P/L SINCE INCEPTION** — since the $2,250 anchor became active — **and it must be made TRUE, not relabeled** (the current figure inherits the capped session-scoped realized sum; measured error ~$130-150 on 08-05).

## 1. The defect being closed (established across #618's legs; measured, not asserted)

`storage.getClosedTrades` carries `limit = filters?.limit || 100` ordered `desc(openedAt)` — a 2025-10 Replit-era LISTING default (`9944e8013`) inherited by aggregation consumers. Consequences measured on live data: 30-day earnings shown **+$222.52** vs true **−$131.54** (sign-inverted); Realized Balance overstated ~$144; 7d≈30d collapse when trade count exceeds ~100/6d; and — the risk-relevant leg — **`getPortfolioBalanceV2` (`guardrail-settings.ts:105`) reaches the kill-switch DENOMINATOR through the same cap** (numerator repaired by `B-KILLSWITCH-WINDOW`; **the ratio is still not sound; Langston's P19-B6 approval void stands on this leg**).

## 2. Numbered objectives

1. **SQL-side aggregate readers in `storage`** (siblings of the shipped `getRealizedPnlSince`, same predicate discipline: `closed_at IS NOT NULL`, `never_filled` excluded, population identical to the listing reader minus the row bound): realized P&L + trade count over (a) a since-timestamp window, (b) rolling 24h/7d/30d, (c) since-inception (anchor). No consumer of a money TOTAL materialises rows.
2. **The paper/live column:** `closed_trades` gains an explicit trading-mode discriminator column (enum `paper|live`, notNull). **Backfill: all existing rows = `paper` — TRUE today by construction (live has never traded) but RE-VERIFIED at implementation time by query, not assumed** (the standing pre-audit caveat). Migration via `db:migrate` under `dt-deploy`.
3. **The readers FILTER on it:** `getClosedTrades`, `getRealizedPnlSince`, `getClosedTradesPaginated`, and the new aggregates take the mode predicate — a live caller can never sum paper rows again (retires #618 leg 3 and the sizing batch's inert-`mode` JSDoc caveat).
4. **⚠️ DISPOSITION THE CONFUSING TWIN:** the existing `trade_mode` column holds `'TARGET'` values (CC-C-verified 07-30) — a three-way inconsistency with its own comment. Five-dispositions ruling at pre-audit: rename/retire/document — **not left to confuse the next reader** (rule 18 posture; likely (4) remove or explicit rename, Langston rules).
5. **Dashboard surfaces re-pointed and made TRUE:** Earnings 24h/7d/30d; **Realized Balance = anchor + true since-anchor sum**; Portfolio Value accordingly; **"Net P/L (window)" → "Net P/L since inception" (true figure)**; the top thin bar keeps its semantics (portfolio incl. open − starting) now built on the true realized figure; the `routes.ts:13142` false "all-time" comment corrected.
6. **★ THE DENOMINATOR LEG:** `getPortfolioBalanceV2`'s realized sum re-pointed at the SQL aggregate ⇒ **the kill-switch ratio becomes sound end-to-end.** Whether this restores Langston's voided P19-B6 approval is HIS call, made explicitly at Step-4 — the batch presents the evidence, never claims the un-void.
7. **Fences (mutation-proved where feasible):** population-parity (`never_filled` + open-row exclusion on every new aggregate); mode-filter (a seeded live row is invisible to paper reads and vice versa); a display-truth fence asserting 7d ≠ 30d when the seeded data differs; the killswitch fence extended to the denominator. Integration tests follow the `b-killswitch-window.test.ts` conventions incl. the write-safety guard and reachability probe.
8. **§9.3 verification:** the Paper Trading dashboard visually re-verified against direct SQL (Kyle's two screenshots are the BEFORE evidence); staging deploy via `dt-deploy`; engine-restart cost noted (regime-stamp gap #624 + loss-window re-anchor #632 — known, accepted per deploy).

## 3. Provenance (§2 1.b — the archaeology is already on the record; cited, not re-derived)

Cap origin `9944e8013` (2025-10-10, listing default) · consumer enumeration and measurements: #618 legs 1-3 + severity upgrades (07-31, 08-05) · `getClosedTradesGlobal` (zero callers, 1000-cap) REMAINS unwired by decision · kill-switch numerator precedent: `FIX-2026-07-31-B`. Dispositions: capped default (2) — becomes an explicit parameter for true LISTING consumers only; aggregation-through-listing pattern (4) — removed; `trade_mode` twin — ruled at pre-audit; `getClosedTradesGlobal` — (5) stays disconnected, delete in this batch (rule 18) unless pre-audit finds a reason to keep.

## 4. OUT

The sizing batch (queued after, fully gated) · the geometry reset (second in order) · #632/#644/#645 items · live-mode VALUES (Kyle-deferred) · any VTS surface.
