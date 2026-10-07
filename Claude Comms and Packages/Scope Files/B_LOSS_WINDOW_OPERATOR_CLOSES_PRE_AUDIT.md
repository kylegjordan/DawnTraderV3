# B-LOSS-WINDOW-OPERATOR-CLOSES — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r1)

change-class: non_architecture · row 183b · `#1154` · owner CC-C · scope r2 APPROVED by Langston 2026-10-07 12:17Z (six record conditions carried in the scope).
Code at `origin/migration/aws-supabase` (head after `ffea9099`); staging 2026-10-07.

## Previously stated vs now
**PREVIOUSLY STATED (scope r1): `getRealizedPnlSince` is "the kill switch's paper numerator" and the exclusion goes inside it. NOW: it has four production callers including the kill switch's DENOMINATOR (`guardrail-settings.ts:91`); the function is unchanged and the exclusion is an option passed only at the numerator call site (`daily-loss-budget.ts:131`). REASON: Langston's Step-1 BLOCKER-1; caller census re-derived by him at `ffea9099`.**

## The audit — the six sources
| # | source | finding |
|---|---|---|
| 1 | Code | **A1** `compute24hSnapshot` (`daily-loss-budget.ts:112-142`): window = the later of `now − 24 h` and the engine session start (`:118-119`); paper leg `getRealizedPnlSince(mode, windowStart)` (`:131`); denominator `getPortfolioBalanceV2(mode)` (`:140`). **A2** `getRealizedPnlSince` (`storage.ts:3278-3293`): predicates `closed_at IS NOT NULL`, the window, `close_reason IS DISTINCT FROM 'never_filled'`, `mode`. Callers (whole tree, tests excluded): `daily-loss-budget.ts:131`, `guardrail-settings.ts:91`, `routes.ts:12183`, `routes.ts:12442`; interface `storage.ts:543`. **A3** the hard reset (`storage.ts:4559-4595`): `UPDATE closed_trades SET closedAt, closeReason='hard_reset' WHERE closedAt IS NULL` — no `mode` predicate; the comment at `:4567` ("single-tenant, no mode column") is stale (`closed_trades.mode` NOT NULL since `2026-08-21-b-balance-truth-closed-trades-mode.sql`); the positions delete's comment (`:4583`) is true (`active_open_positions` has no mode column). **A4** the reset script's hold text (`paper-reset-3000.ts:56-58`). |
| 2 | Runtime + DB | **A5** `close_reason` all-time: `reset` 9 (2026-10-06, net −$6.63), `manual_stop` 1, `hard_reset` 0 (18 open paper candidates, `pnl` NULL), `closed_trades` `live` rows 0. The 9 `reset` closes stamp 15:45:45–48Z against the new session's `started_at` 15:52:57Z (Langston) — outside both windows. |
| 3 | `SYSTEM_IMPACT_MAP.md` | **A6** `:135` (B-BALANCE-TRUTH: one aggregate, mode on closed trades) and `:3664` (realized P/L is a SQL aggregate shared by both sides) — the shared-aggregate design this batch preserves by not touching the function's default. No SIM entry names the re-anchor case (`#1171`). |
| 4 | `SYSTEM_MANUAL.md` | **A7** `:3843` the automatic daily-loss budget (P19-B6) — states the window as session-anchored; silent on operator closes → a content update at Step 10 (the exclusion and its test). |
| 5 | Ledger | `#1154`, `#585`, `#618`, `#1067`, `#1171` (new, the inverse case); `B_BALANCE_TRUTH_COMPLETION_REPORT.md`. Nothing records a decision to count operator closes. |
| 6 | Provenance | `never_filled` exclusion — P19-B7.2c's typed guard; the shared aggregate — B-BALANCE-TRUTH OBJ-1 (deliberate parity of numerator and denominator). `bridge/canonical/`: no coverage of operator closes (postdates the corpus). |

**Census (§9.5(a)) of the new option:** writer — none (a read-side predicate); readers — the one numerator call site only; every other caller keeps the default and its exact current population (fenced by test, below). **Entry points:** `evaluateDailyLossBudgetOnClose` (on every close) and `computeDailyLossVerdict` both reach `compute24hSnapshot`; one call site covers both.

## The plan
| # | item | from |
|---|---|---|
| P1 | `storage.ts`: export `REANCHOR_CLOSE_REASONS = ['reset', 'hard_reset'] as const`, with Langston's test as its comment (*excluded iff the close arrives with a re-anchor of the balance the kill switch divides by*; `manual_stop`, `manual_close`, `engine_stop_cleanup`, `stranded_clear` fail it). `getRealizedPnlSince(mode, since, opts?: { excludeReanchorCloses?: boolean })` adds `close_reason NOT IN (...)` only when the option is true (NULL-safe: `close_reason IS NULL OR NOT IN`). Interface `:543` updated. | A2, A6 |
| P2 | `daily-loss-budget.ts:131` passes `{ excludeReanchorCloses: true }`, with a comment naming the null-session asymmetry descriptively (record condition 4) and `#1171`. | A1 |
| P3 | `storage.ts` hard reset: `.where(and(isNull(closedAt), eq(mode, mode)))`; the `:4567` comment corrected; `:4583` kept. Labelled a FENCE (record condition 1). | A3, A5 |
| P4 | `paper-reset-3000.ts:56-58`: the hold sentence replaced by "the reset's own closes are excluded from the kill switch by label (`B-LOSS-WINDOW-OPERATOR-CLOSES`); no 24-hour hold" with the `#1171` caveat. | A4 |
| P5 | Tests (real Postgres, `server/tests/integration/`, the `b-sizing-inc3-db` pattern; prints MEASURED / SKIPPED): with the option, `reset` and `hard_reset` closes in the window leave the sum unchanged; `stop_hit`, `manual_stop`, `manual_close`, `engine_stop_cleanup` change it (controls); without the option every one counts (the other three callers' population unchanged); the hard reset for `paper` leaves a `live` open row untouched (control: the paper row closes). Mutation: drop the option's predicate → the `reset` case fails. | P1-P3 |
| P6 | Step 10: SYSTEM_MANUAL `:3843` (the exclusion and the test), SIM (the option on the shared aggregate; `#1171` named), `#1154` closed, row 183b. | A6, A7 |

**Step 7 reading:** the paper kill-switch snapshot's `realizedPnl24h` equals the hand-computed window sum with the two labels excluded; with a session present the option changes nothing (a control); the reset script header carries no hold. *(Record condition 5: the figure no longer reconciles with `routes.ts:12442`'s portfolio realized total — intended.)*

`REVIEWER: none spawned — the load-bearing census (four callers) and the ordering fact (reset closes 7 minutes before the session) were re-derived by Langston at Step 1.`
