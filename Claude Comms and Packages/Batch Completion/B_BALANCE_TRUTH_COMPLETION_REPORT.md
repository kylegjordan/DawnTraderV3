# B-BALANCE-TRUTH — COMPLETION REPORT

**change-class: architecture** · **owner CC-C** · Phase 19 · issue `#618` (legs 1-2) · scope `Scope Files/B_BALANCE_TRUTH_SCOPE.md` (r3, Langston-approved 2026-08-20) · pre-audit `Scope Files/B_BALANCE_TRUTH_PRE_AUDIT.md` (r4 + parts 7, 7a, 7c, 8).

**A RETROSPECTIVE CLOSE.** The code shipped 2026-08-20 → 21 (Steps A-F plus the lifetime scoreboard). **No governance ever landed and no completion report was written.** On 2026-08-28 the batch was declared OPEN in `GOVERNANCE_EXCEPTIONS`, with a hold: *close it at F-G-1 Step 10*. **That hold expired 2026-09-04.** Alert `ebd151de` was routed to CC-C by Langston 2026-09-23. It had been ACKED on 2026-08-28 under a pre-`#987` actor string, so it resurfaced 14 times without any §10.5 check showing it. Its body's *"168h"* is a mint-time snapshot; the real elapsed time is ~32 days since the last code push.

**METHOD — every objective was RE-VERIFIED on 2026-09-23 against the object, not from memory.** Code read at `origin/migration/aws-supabase`, values read from the live database, the page read in Claude-in-Chrome. **Independently re-read today:**
- `server/storage.ts:525`, `:3156`, `:3408-3460` (`getLifetimeScoreboard`), `:3684`, `:3819`, `:4013`
- `server/services/guardrail-settings.ts:63-140`
- `server/services/daily-loss-budget.ts:111-140`
- `server/core/rtb/ready_to_buy_service.ts:2266-2278`
- `server/services/execution/exploration-lane.ts:88-137`
- `client/src/components/dashboard/mode-dashboard-tab.tsx:140-200`
- CI runs `32506884219` and `35816092858`

**Not re-read today, carried from the August record:** each step's Step-4 review content (cited per commit below).

---

## ⛔ OPEN ITEMS — STATED FIRST

| item | owner | home | closing condition | failure condition |
|---|---|---|---|---|
| **`#736` — three raw-SQL readers of `closed_trades` are still mode-blind** (re-derived today): `ready_to_buy_service.ts:2269` (the RTB stop-out cooldown), `exploration-lane.ts:92` (the daily exploration quota), `exploration-lane.ts:130` (the anneal count). ⚠️ **Its dated home ("due 2026-09-11") was never written into the plan.** | CC-C | **PLACED TODAY: `PHASE_19_PLAN` row `4.c` `B-MODE-PREDICATE-SWEEP`, after `4.b`.** It also carries the deletion of `getClosedTradesGlobal` (below). | every raw-SQL reader filters `mode = ${mode}`, and the partition fence is extended to raw SQL | any live-mode row is visible to a paper read (or the reverse) |
| `#618` — the remaining legs | CC-C | `PHASE_19_PLAN` row `4.b` `B-KILLSWITCH-DENOMINATOR` (Kyle-placed 2026-08-30) | per that row | per that row |
| **Step G** — the mode-blind DELETE family (the reset functions delete both modes' data) | — | `POST_AUDIT_ROADMAP` `21-3d`, placed 2026-08-21 (`eae32a9e2`) | per the roadmap row | — |
| `#734` — the drawdown gate has read `critical` since the 08-12 re-anchor, and in live mode it refuses engine start | CC-C | roadmap `21-3c` (Kyle re-ruled 2026-08-21) | per the roadmap row | — |
| `#733` — four `bridge/canonical/` files are machine-regenerated | CC-C | plan row `3n.e` | per that row | — |
| Langston's `MEMORY.md` sync | CC-C | **BLOCKED** on `#1057` (the writer refuses: `MEMORY.md` was edited outside the composer; reported to Infra Claude 2026-09-22 13:07Z) | the write lands | — |

No scaffolding: every objective below is functional.

---

## OBJECTIVES

| obj | what | verdict | evidence (re-derived 2026-09-23) |
|---|---|---|---|
| **OBJ-1** | The kill-switch DENOMINATOR becomes a SQL aggregate with the numerator's exact predicate set. | **YES** | `getPortfolioBalanceV2` takes realized P/L from `storage.getRealizedPnlSince(mode, sessionStart)` (`guardrail-settings.ts`, read at the ref). That is the same aggregate the daily-loss numerator uses (`daily-loss-budget.ts:131`). Step B `e14f8870a`. **Both sides still sum `pnl`, as condition 2 required.** |
| **OBJ-2** | Display aggregates. **Acceptance: the 7-day and 30-day figures DIFFER, each with the correct sign.** | **YES** | **Rendered:** Paper Trading → Dashboard, 2026-09-23 06:21Z. Today **+$14.28** · Past 7 Days **−$25.11** · Past 30 Days **−$295.10**. **Recomputed** from `closed_trades` at that instant with the card's rules (paper, both-leg epoch, net basis): **14.28 / −25.11 / −295.10, exact.** Steps C `e67deebef` / `318673810` / `bf287a6a9`, D `ea9f49709`, E `2441821d8` / `49135e0ca`. |
| **OBJ-3** | `closed_trades` gains the paper/live column, the rows are backfilled, and the readers filter on it. | **YES** | `information_schema`: `mode` is `NOT NULL`. **870 rows, all `paper`** (863 closed). The **mode-partition fence (3 tests) EXECUTED in CI run `35816092858`**, each with its own timing — not skipped. The migration `2026-08-21-b-balance-truth-closed-trades-mode.sql` applies in CI. Step F `ea36f7726` → `35b38066d` (ten readers). |
| **OBJ-4** (reader bound) | `limit` is REQUIRED on `getClosedTrades`, so tsc enumerates every caller. | **YES** | `storage.ts:525` and `:3156`: `filters: { limit: number \| 'all'; … }`. Step A `5c9cc389d` (+ `8ce09bcb8`, `b066e806d`). ⚠️ `\|\| 100` survives in two readers of OTHER tables (`getActiveTradeLogs` `:3819`, `getExecutionAttemptAudits` `:4013`) — out of scope. `\|\| 1000` survives in `getClosedTradesGlobal` (`:3684`), which has **zero callers** (the only mention is a comment at `:3254`), so its deletion is folded into `4.c`. |
| **OBJ-4** (lifetime scoreboard — Kyle's 2026-08-21 addition) | The Earnings card's bottom line becomes Lifetime Net P/L plus a compounded time-weighted return, moving only when trades close. | **YES** | **Rendered:** *"Lifetime Net P/L (since Aug 23, 2026) −$286.63"* · *"Lifetime return (time-weighted) −29.8%"*. **Recomputed** with the reader's own SQL: **237 trades, −286.63, −29.79%.** The start date is an **explicit** marker (`module_constants` `scoreboard` / `epoch_started_at` = 2026-08-22T22:01Z). It was set 2026-08-24, **Kyle-directed and NOT by this batch** — the row's own stamp reads *"Kyle-directed: new paper observation window at the #507 book-truncation fix"*. That is why the card reads Aug 23 (local time) and not the first trade. Commits `605eb3734`, `567385eae`. |
| **OBJ-5** | Governance | **YES — landed with this report** | the ledger below |

**CI:**
- Last code commit `567385eae` — run **`32506884219`**, 4/4 success: Test Suite · Build · TypeScript Check (baseline gate) · Docker Build.
- Today's head `85b8fa898` — run **`35816092858`**, 4/4 success, with all seven `B-BALANCE-TRUTH` fences executing.

**Deployed:** `567385eae` is an ancestor of the running build `bc199185e` (staging `dist/BUILD_SHA`). There is no per-deploy record from August on the box; the record file holds only the latest deploy.

---

## NUMERIC DELTAS

- **PREVIOUSLY STATED** (scope OBJ-4, 2026-08-21): lifetime **−7.08%** time-weighted, over **492** trades since the first trade (2026-07-15). **NOW:** **−29.79%** over **237** trades since 2026-08-22T22:01Z. **REASON:** the scoreboard start was deliberately moved on 2026-08-24 (Kyle-directed). This is a different population, not a correction.
- **PREVIOUSLY STATED** (alert `ebd151de`): *"open 168h"*. **NOW:** ~32 days since the last code push. **REASON:** the body is frozen at mint time (Langston, 2026-09-23).

## FINDINGS (surfaced by this batch; each has a home)

- `#733`, `#734`, `#736` — homes in the table above.
- **New today:** `getClosedTradesGlobal` has zero callers. It is dead code under rule 18, and its deletion is folded into `4.c`.

## REVIEW — LANGSTON, 2026-09-23 06:41Z: **CLOSEABLE — Step-8 PASS, Step-11 CONFIRMED**, one condition

He re-derived the figures himself rather than taking them from this report:
- **OBJ-2:** all three windows (**+14.28 / −25.11 / −295.10**) exact, rebuilt from `computeRollingEarnings`' own rules (n=78 in the 7-day window).
- **The scoreboard:** 237 / −286.63 / −29.79%, exact. The time-weighted denominator covers the whole population: 0 of 237 rows have a null or zero base.
- **OBJ-1's ">100 rows" is discharged LIVE:** the aggregate's own predicate set over `closed_trades` gives **768 trades, −356.86**, 7.7× the removed cap. `reconstructed_net_pnl` is null on 0 of 768, so condition 2 (one basis on both sides) holds in effect.
- `e8eea2158` is one commit past the CI'd head and changes governance docs only.

⚠️ **The fence's CI timing is RULED ON REPORTED FACT** — his token cannot read Actions logs. He made it non-load-bearing: CI runs a real Postgres, and the fence hard-throws when it cannot reach it.

**CONDITION — MET in the follow-up commit:** the docblock at `server/storage.ts:3248-3258` still said, in the present tense, that `closed_trades` has no paper/live column and that a live caller would sum paper rows into a live kill switch. Step F falsified all of it. **Struck to dated history, comment-only**, carrying his rider for `4.b`: once `reconstructed_net_pnl` is ever populated, both sides of the ratio become a per-row net/recorded mixture.

He also confirmed that the `MEMORY.md` ❌ row does not block the close: blocked with a named owner is not N/A.

## HONEST RESIDUAL

- ~~OBJ-1's live acceptance was not re-demonstrated~~ — **discharged by Langston live: 768 rows** (above).
- **Only paper mode was checked.** Live mode has no rows, so the partition is proven by the fence, not by live data.
- Step 8 and Step 11: **done** (above).

---

## GOVERNANCE — the Step-10 ledger (transcribed from the governance commit)

CHANGE-CLASS: architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | New entry: what shipped, the evidence, and the residuals with their homes. |
| T1 | `PHASE_HISTORY.md` | ✅ | New entry: the balance and lifetime-figure fix, closed retrospectively. |
| T1 | `PHASE_19_PLAN.md` | ✅ | New row `4.c` `B-MODE-PREDICATE-SWEEP` (`#736`, never placed until now), plus a dated close line. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_C.md` | ✅ | Mine records the close and `4.c`; the shared file is unchanged because no consensus truth moved. |
| T1 | the batch `SCOPE` | ✅ | Present: `B_BALANCE_TRUTH_SCOPE.md` (r3, 2026-08-20). |
| T1 | the batch `PRE_AUDIT` | ✅ | Present: `B_BALANCE_TRUTH_PRE_AUDIT.md` (r4 + parts 7-8). |
| T1 | the `COMPLETION_REPORT` | ✅ | This file. |
| T1 | the four session task lists | ✅ mine / N/A ×3 | `CC_C_SESSION_TASK_LIST.md` adds `4.c`; the CC-A, CC-B and CC-INFRA lists are not mine. |
| T1 | Langston's `MEMORY.md` | ❌ BLOCKED | The writer refuses on `#1057`; reported to Infra Claude. |
| T2 | `SYSTEM_MANUAL.md` | ✅ | `getPortfolioBalanceV2` now describes the shared SQL aggregate (the entry still described the pre-batch reader), and the lifetime scoreboard's definition is added. |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | A block for the reader contract, the `mode` column, the aggregates, the scoreboard and its marker, the fences, and the residual readers. |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#618` legs closed by this batch, remainder at `4.b`; `#736` placed at `4.c` and the dead reader folded in. |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | The 100-row cap fix recorded. |
| T2 | `POST_AUDIT_ROADMAP.md` | ✅ | `21-3d` (Step G) was added by this batch on 2026-08-21 (`eae32a9e2`); no change today. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | No parameter adjusted; no guardrail value changed (scope §6). |
| T2 | `AUTHORITY_BASELINE.md` | N/A | No constitutional baseline touched. |
| T2 | `STORAGE_POLICY.md` | N/A | `closed_trades` retention is unchanged; the migration adds a column only. |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | Paper balance readers only; the VTS lane is untouched. |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | No asset-class learning surfaced. |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | The method is unchanged. |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | The reviewer's build is unchanged. |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | No stable rule changed. |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | No `CLAUDE.md` change. |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | Step E's two orphaned helpers (`calculateSharpeRatio`, `calculateProfitFactor`) were logged and archived in the same diff that removed them (`49135e0ca`, 2026-08-21); `getClosedTradesGlobal` will get its own entry when `4.c` deletes it. |
| T2 | `MISTAKE_PATTERNS.md` | N/A | The batch's `MISTAKE:` trailers were filed in August (5 references already present); none written today. |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | The open row is closed. |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | The process is unchanged. |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | The board is unchanged. |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | No daily check was run. |
