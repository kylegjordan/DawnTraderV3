# B-LOSS-WINDOW-OPERATOR-CLOSES — SCOPE r2 (sprint row 183b, `#1154`; pre-sprint Stage 0)

change-class: non_architecture

**Owner:** CC-C. **Placed:** `SPRINT_TO_LIVE_PLAN.md` §0a Stage 0 (Kyle approved the pre-sprint plan 2026-10-07) and row 183b. **Origin:** Langston, `B-SIZING-DEC-RESTORE` inc3 r5 Step-4 condition 2.
Code read at `origin/migration/aws-supabase` `77904e4d1`; data on staging 2026-10-07 ~12:00Z.

## What this is for (plain)
The kill switch stops trading when a day's realized losses pass 15% of the balance. The paper reset closes every open position before re-starting the balance; those closes are counted as trading losses. Today they are kept out only because the reset starts a new engine session and the loss window begins at that session's start (`daily-loss-budget.ts:118-119`, `compute24hSnapshot`: the later of `now − 24 h` and the engine session start). If the server restarts within 24 h of a reset without a session, the window falls back to `now − 24 h` and the reset's closes count against the new balance — which forced a 24-hour no-restart, no-deploy hold after the 2026-10-06 reset. **The fix keeps a reset's closes out of the kill switch by their label, so the next reset needs no hold.**

## Facts (staging, `closed_trades`, all time)
`close_reason` counts: `stop_hit` 514 · `target_hit` 333 · `never_filled` 97 · `trailing_stop_hit` 14 · **`reset` 9 (2026-10-06)** · `max_holding_period` 4 · `manual_stop` 1. Writers of the operator-style labels at the ref: `reset` — the engine stop with `reason='reset'` (`routes.ts:11317-11326`, the `PAPER-RESET-3000` path); `hard_reset` — the new-simulation hard reset (`storage.ts:4568`, `routes.ts:11114`); `manual_stop` — the stop button's flatten (`routes.ts:11326`); `engine_stop_cleanup` (`active-engine-service.ts:485`); `stranded_clear` (`routes.ts:12795`).

## Provenance (1.b)
- **Tier 1 — `getRealizedPnlSince`** (`storage.ts:3279-3293`), the kill switch's numerator. Its `never_filled` exclusion is the P19-B7.2c typed guard (a dropped pending maker never held a position); B-BALANCE-TRUTH Step C (#618) made predicate parity across the window aggregates deliberate (`:3311-3318`): any change *"moves every site together or diverges with a stated reason."* Disposition (2) — relevant, needs updating.
- **Tier 2 — `daily-loss-budget.ts:118-119`** (the session-start anchor) — read, unchanged. Its paper leg sums through `getRealizedPnlSince`; its LIVE leg filters `getTrades()` in memory and is left untouched — both labels are written only by paper paths (the reset script, the new-simulation hard reset).
- Ledger searched: `RUNNING_ISSUES` `#1154`, `#585`, `#1067`, `#618`; `BATCH_CATALOG` (B-BALANCE-TRUTH, B-SIZING-DEC-RESTORE).

## r2 — Langston's Step-1 send-back (12:07Z) folded
**BLOCKER-1 — the object was wrong.** `getRealizedPnlSince` has FOUR production callers at `10f114a95`: `daily-loss-budget.ts:131` (the kill switch's loss NUMERATOR) · `guardrail-settings.ts:91` → `getPortfolioBalanceV2` (the kill switch's balance DENOMINATOR — B-BALANCE-TRUTH OBJ-1 made both sides read the same aggregate on purpose) · `routes.ts:12183` (active-positions realized balance) · `routes.ts:12442` (portfolio-summary realized P&L and `closedTradesCount`). Excluding losses inside the shared function would raise the denominator and make the switch trip LATE. ⇒ **The function is NOT changed. The exclusion is an explicit option passed ONLY at the numerator's call site** (`compute24hSnapshot`'s paper leg, `daily-loss-budget.ts:131`); the other three callers are untouched by construction.
**Why the ratio stays coherent with the exclusion on the numerator only:** with a session, both sides window from the session start, which a reset re-stamps AFTER its closes (`paper-reset-3000.ts` stop → reset → start), so the reset's closes are outside both sides and the option changes nothing. Without a session (`#585`), the numerator falls back to `now − 24 h` — where the reset's closes WOULD land — while the denominator's null-session branch (`guardrail-settings.ts:96-113`) uses the anchor alone and never calls the aggregate. So the option removes from the numerator exactly what the denominator already does not contain.
**BLOCKER-2 — the two labels move different quantities.** `reset` closes carry booked P&L (9 rows, 2026-10-06). `hard_reset` closes are a bare UPDATE of `closedAt` + `closeReason` (`storage.ts:4570-4578`): no price, no `pnl`, so they add 0 to the sum and +1 to `tradeCount`; the numerator reads only `realizedPnl`. Both stay excluded at the numerator — the test, not the list, is the rule.
**THE TEST (written beside the constant):** *a close is excluded from the kill switch's loss sum when it arrives with a re-anchor of the balance the kill switch divides by.* `reset` and `hard_reset` pass; `manual_stop`, `manual_close` (`routes.ts:12660`), `engine_stop_cleanup`, `stranded_clear` fail — the portfolio continues and the money moved, so they stay counted. (Not the schema's "administrative" grouping, `schema.ts:1838`/`:1893` — a different axis.)

## Objectives
| # | objective | verification |
|---|---|---|
| 1 | `getRealizedPnlSince(mode, since, opts?)` gains an explicit `excludeReanchorCloses` option (default off); the label set is one exported constant with the test above as its comment; ONLY `compute24hSnapshot`'s paper leg passes it. | Unit tests: with the option, a `reset` close in the window leaves the sum unchanged and a `hard_reset` close leaves it unchanged; `stop_hit`, `manual_stop`, `manual_close`, `engine_stop_cleanup` closes change it (controls). Without the option (the other three callers), every one of them counts exactly as today. |
| 2 | The three other callers are unchanged — census at Step 2 re-derives the caller list repo-wide (tests excluded). | Census in the pre-audit. |
| 3 | **Folded `§13` item (disposition 1):** the new-simulation hard reset's UPDATE (`storage.ts:4570-4578`) gains the `mode` predicate — `closed_trades.mode` is NOT NULL since `2026-08-21-b-balance-truth-closed-trades-mode.sql`, so the comment *"closedTradesTable is single-tenant, no mode column"* (`:4567`) is stale and the UPDATE is mode-blind. The positions delete's comment (`:4583`) stays — `active_open_positions` has no mode column (checked: its columns at staging). | Unit test: a hard reset for `paper` leaves an open `live` closed_trades row untouched (control: the paper row is closed). |
| 4 | The 24-hour no-restart hold in `server/scripts/paper-reset-3000.ts`'s header and the run plan is retired — both sides of the ratio shown safe above (numerator by the option, denominator by its null-session branch). | Header diff; Step 7 below. |
| 5 | Live reading after deploy: the paper kill-switch loss figure equals the same sum computed by hand with `reset`/`hard_reset` excluded over its window. | Step 7 query against the logged snapshot. |

## Not in scope
`#585` (the stale running session row) and `#1067` (the engine stop crash, CC-B's row 2a0 in today's deploy) — they cause the fallback; this batch makes the fallback harmless.

## Langston's rulings (12:07Z)
(a) `{reset, hard_reset}` confirmed; `engine_stop_cleanup` stays counted. (b) The display family's parity stays as it is; the divergence that needed stating was inside the function's own caller set — now avoided by putting the option at the numerator call site only. Change-class re-checked: `non_architecture` stands (no shared aggregate changes behaviour; one call site and one reset predicate).

## Step 1 APPROVED (Langston 12:17Z, at `ffea9099`) — record conditions, carried to Step 2 and the report
1. **`hard_reset` has never been written** (0 rows all-time; 18 open `paper` rows with `pnl` NULL are its candidates) and **`closed_trades` holds 0 `live` rows** — objective 1's `hard_reset` arm and objective 3's mode predicate are FENCES on unexercised paths (`#661` leg 3), not fixes of an observed defect. The report says so.
2. "`hard_reset` adds 0 to the sum" is a DATA fact today (all candidates `pnl` NULL; `reconstructed_net_pnl` NULL so `HONEST_PNL` = `pnl`), not a code invariant — `pnl` is nullable with nothing tying NULL `pnl` to NULL `closed_at`.
3. **Magnitude:** the 9 `reset` closes of 2026-10-06 net **−$6.63** against a 15% kill line of ≈ $123 on the $820 anchor — 5.4% of the threshold. The batch is justified by the mechanism (a flatten of up to 20 slots), not by the observed instance; the 24 h hold did not avert a trip.
4. The r2 coherence line, made descriptive: in the null-session branch the denominator carries NO realized P&L at all (anchor alone), so the two sides are already not alike there for `#585` reasons this option does not touch.
5. After this ships, the kill switch's loss figure will not reconcile with `routes.ts:12442`'s portfolio realized total — intended, stated once.
6. Objective 4's "both sides shown safe" covers CLOSES only: the inverse case — a re-anchor with no closes — is `#1171`, row 183b1.
