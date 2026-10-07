# B-LOSS-WINDOW-OPERATOR-CLOSES — SCOPE r1 (sprint row 183b, `#1154`; pre-sprint Stage 0)

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

## Objectives
| # | objective | verification |
|---|---|---|
| 1 | The kill switch's realized-loss sum excludes closes whose label marks a portfolio re-start — **`reset` and `hard_reset`** — through one named, exported constant (no string scattered at call sites). | Unit test: a `reset` close and a `hard_reset` close inside the window change neither the sum nor the count; a `stop_hit`, a `manual_stop` and an `engine_stop_cleanup` close do (control). |
| 2 | **`manual_stop`, `engine_stop_cleanup` and `stranded_clear` STAY counted** — they are real losses on the current portfolio, not a re-start. | Same test. |
| 3 | **Parity, stated:** the display-side window aggregates (`:3311-3318` onward) keep their current predicate. Reason: they are bounded by the dashboard epoch, which a reset re-stamps after its closes, while the kill switch's window is bounded by the session and can fall back to 24 h. The divergence is written beside the constant. | Code comment + Step-2 census of every reader of the exclusion. |
| 4 | The reset script's "no restart or deploy within 24 h" header and the run plan's hold are retired, citing this batch. | Diff of `server/scripts/paper-reset-3000.ts` header + the Step-7 reading below. |
| 5 | Live reading after deploy: the kill switch's reported realized loss for paper equals the same sum computed by hand with the two labels excluded. | Step 7 query vs `/api` read. |

## Not in scope
`#585` (the stale running session row) and `#1067` (the engine stop crash, CC-B's row 2a0 in today's deploy) — they cause the fallback; this batch makes the fallback harmless.

## Ask for Langston
(a) Is `{reset, hard_reset}` the right set — in particular, should `engine_stop_cleanup` be in it? (b) Is the stated parity divergence acceptable, or should the display aggregates move too?
