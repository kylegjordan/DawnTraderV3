# B-PROMOTION-RACE-FIX (#508) — COMPLETION REPORT

**Owner:** Claude Analyst (CC-C) · Kyle-directed 2026-07-28 · change-class: **architecture**
**Head:** `46cba2b9c` · CI 4-green (run `30316335026`) · No migration · Deployed staging restart#535, HTTP 200, engine cycling.
**Scope:** `Scope Files/B_PROMOTION_RACE_FIX_SCOPE.md` · **Pre-audit:** `B_PROMOTION_RACE_FIX_PRE_AUDIT.md`
**Review:** Langston design-review (rulings 1b / 2a-corrected / 3 + M1-M4) → Step-4 **CHANGES-NEEDED** (1 blocker + 2 should-fix) → all landed → **Step-4 APPROVED at `7aaac8073`** → N1/N2 non-blocking (N1 fixed in `46cba2b9c`).

## Objective
Fix the defect behind the three orphaned `closed_trades` records (MET 07-15, ETH + AVAX 07-18): rows with entry data, **no live position, never closeable** (`closed_at` NULL). Already filed as **#508**; this batch owns and resolves it.

## Root cause — TWO independent defects (code + live-data verified)
1. **Cross-pass race.** `checkRtbPromotion` had **no concurrency latch** across three triggers (TCL_ACTIVATED, TRADE_CLOSED, `setInterval`) → two concurrent passes over one queue snapshot promoted+opened the same signal.
2. **Silent swallow.** The open path is non-atomic (dup guard reads positions ~220 lines before the position insert); `active_open_positions` carries `UNIQUE (symbol)`, but `createActiveOpenPosition` **caught the 23505 and returned the winner's row** (I8E-DB-DEDUP) — so the loser continued as if it opened, stranding its already-written record with no failure surfaced.
3. **In-pass duplicate** (#508's own recorded diagnosis, confirmed): the pre-loop `openPositions` snapshot is never refreshed, so two same-symbol signals in ONE pass both promote.

> **Process note (rule 24.a).** Three earlier explanations — engine-shutdown cleanup, a restart landing mid-open, and the #532 dual-refresh — were each proposed and each **killed by data** (Kyle's challenges: "when were they opened?", "why only 3?"). The census that settled it: exactly **3 duplicate trade-records in all history**, each producing exactly one orphan, each pair written in the same second, all exploration-lane maker orders. Announce symptoms freely; a cause is a claim.

## Objectives checklist
| # | Verdict | Evidence |
|---|---|---|
| 1 — serialize promotion (ruled 1b) | **YES** | `promotionInProgress` + `promotionRerunRequested`; entry guard sets-and-returns; `finally` releases + at most ONE trailing re-run. **`isRunning`-guarded** (Langston blocker: the only trigger without inherent stop-safety; un-guarded, a mid-pass trigger + `stop()` fires a pass on a stopped engine that REMOVES ranked signals from RTB then fails — and a failed promotion does not restore them; a deploy restart IS that interleaving). `finally` covers every early return (TCL-warmup / guardrail-fail / at-capacity). N1: both fields cleared in `stop()` + session reset. |
| 2 — compensate the dedup-return (ruled 2a-corrected) | **YES** | `createActiveOpenPosition` → discriminated `{ position, created }`; `created===false` → open path deletes its own record + returns `DUP_POSITION`. Edge preserved: 23505 with no existing row still **re-throws** (no fabricated `created:false`). Zero blast-radius (exactly ONE real caller). New `deleteClosedTrade` is **structurally restricted to `closedAt IS NULL`** (should-fix 1 — balance-neutrality by contract, not convention). Constraint-name string corrected (`unique_symbol_side` was the *paper* table's; §15). |
| 3 — in-pass duplicate guard | **YES** | `promotedSymbolsThisPass` Set, seeded from the snapshot, `.add` on each success, duplicate → `continue` (**deferred, stays queued — not failed**). |
| 4 — #508 reconcile (M1) | **YES** | #508 re-homed from P19-B8.5 → this batch, RESOLVED, with the merge-not-throw mechanism correction and (a)/(b)/(c) answered. |
| 5 — legacy row cleanup | **YES — DONE (Kyle-authorized 2026-07-28)** | Safety re-checked immediately before the delete (0 live positions, 0 already-closed), then `DELETE 3` with the same `closed_at IS NULL` predicate the code contract uses. **AFTER: those ids gone; final census = ZERO true orphans.** Balance inputs verified UNCHANGED post-delete (359 closed trades, realized PnL −341.6252, 10 open positions) — the measured proof of M3. |

## M-item answers (Langston)
- **M3 (balance unwind) — NOT needed.** The paper balance is COMPUTED: `realizedBalance = startingBalance + realizedPnl` over `getClosedTrades(closedOnly:true)` filtered to `t.closedAt`, plus open-position mark-to-market (`routes.ts:12306-12323`). An orphan (`closed_at` NULL, no own position) is in **neither** sum; there is no debit-on-open. Confirmed against live data. Closes #508(a).
- **M4 (exploration budget) — no reconciliation.** `usedBudgetToday` counts opened-TODAY only (orphans are 07-15/07-18); the A4 anneal driver already excludes them (`closed_at IS NOT NULL`). Closes #508(c).

## Verification
- **tsc delta ZERO** — measured, not inferred: clean-origin 17 errors in the two edited files, 17 with the changes (stash/count/pop); zero errors naming any new symbol.
- **18 tests** (`b-promotion-race-fix.test.ts`) + 23 adjacent (b79-0n-execution-audit, b79-0n-rtb-promotion-event, p19-b8-5-exploration-lane) — all green.
- **★ The source fence is MUTATION-PROVED** (Langston should-fix 2: behavioural mirrors stay green if the real code loses its guard). Deliberately removed `&& this.isRunning` from the source → **exactly one test went red** (the isRunning fence), all others green; restored → 18/18. The fence reads the real files and pins: latch fields, entry guard, `finally` release, the isRunning guard, lifecycle clearing, the `!_posCreated` → `deleteClosedTrade` + `DUP_POSITION` branch, the in-pass Set, the discriminated return, and the `isNull(closedAt)` predicate.
- **Post-deploy census: still exactly the 3 legacy orphans, ZERO new** — engine online, pricing + evaluating positions, no errors attributable to the change.
- No UI surface (engine-internal); §9.3 N/A.

## Governance files changed
BATCH_CATALOG · PHASE_HISTORY · PHASE_19_PLAN §5 · **SYSTEM_MANUAL §19.1** (promotion concurrency model: the three triggers now serialized, the two load-bearing invariants, the in-pass half, open-path atomicity + the compensation backstop) · **SYSTEM_IMPACT_MAP S23** (liveness registry: the per-mode single-flight latch, LOAD-BEARING, with the isRunning-guard invariant) · **RUNNING_ISSUES #508 RESOLVED + re-homed** · this report · scope · pre-audit · MEMORY_CC_C (+ mirror).

## Residual
**NONE.** The 3 legacy rows were deleted with Kyle's authorization (2026-07-28) — final census **zero true orphans**, balance inputs verified unchanged. **No new orphans can form.** Langston N2 (name the in-pass guard as a behavior change) is recorded here and in the SysManual/SIM entries.
