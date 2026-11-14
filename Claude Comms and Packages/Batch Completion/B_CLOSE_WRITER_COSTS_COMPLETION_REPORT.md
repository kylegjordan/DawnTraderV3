# B-CLOSE-WRITER-COSTS — COMPLETION REPORT (CC-A / OLD Claude, 2026-11-14)

change-class: architecture · plan home: `SPRINT_TO_LIVE_PLAN.md` row 72 (Phase-19 row `3n.u3`) · Kyle directives KD-17, KD-24, KD-26, KD-27, KD-45

## ⚠️ LEFT OPEN — stated first

1. **The record-restore path is UNPROVEN.** It has never run: 0 of 1,749 `closed_trades` rows carry `restored_at`, `restored_by_claimed` or `record_restored_from_position = true` (Langston, Step 8; `record_restored_from_position` keeps `DEFAULT false`, so this is a measured zero, not a null blind spot). **It is never to be written as proven.**
   - **Carrier (self-arming, Langston's Step-8 addition):** the critical alert `close-record-unresolved-<mode>-<symbol>` (`server/services/active-execution-engine.ts:2257`). It fires on every close attempt against a position whose record cannot be resolved — exactly the state a restore remedies.
   - **Discharging read:** the first `closed_trades` row with `restored_at` set, checked against the position it came from.
   - **Owner:** CC-A. **Home:** this report plus that alert. Langston approved this disposition at Step 8; there is no observation window, so the batch closes.
2. **The Close All confirm and the refusal toast are carried by code fences, not a click.** Langston ruled no click (and no Kyle ask): the outcome follows from the code, and the only way to click it is to close every open paper position or stop the engine.
   - The Close All button is pinned to the dialog's action (fence D-1).
   - The refusal text and both handlers rendering `result?.error` are unit-tested (R-1, C-1).
3. **The strip-refresh question is WITHDRAWN BY CITATION, not by observation.** `client/src/components/portfolio-summary-strip.tsx:37` polls every 10 s (`refetchInterval: 10000`), unconditionally, in paper mode. Close-all emits no broadcast (`server/routes.ts:13060-13086`); the single-close route does (`:12533`). So the strip refreshes within 10 s of a Close All. Adding the broadcast would only cut that latency.

No scaffolding: every objective below is functional on staging.

## What the batch is for

No close without its own trade record, and no cost the system did not measure (KD-17); and the three trading modes are independent (KD-24). Before it:
- a close took the newest record for the symbol and, finding none, deleted the position anyway;
- open positions had no mode, so a paper position could block a live one;
- the trade tables filled any missing fee, cost, P&L, class or mode with a default.

## Objectives

| # | objective | result | evidence |
|---|---|---|---|
| OBJ-1 | the close finds its record by symbol + asset class + mode | **YES** | `findOpenTradeRecord` (class non-nullable); 110 closes over the 8 arm cells re-derived by Langston at Step 8 with 0 duplicate `(symbol, mode, opened_at)` records and 0 missing fee; unit fences + mutations (change list, increment 1) |
| OBJ-2 | a close with no record is refused before any side effect | **YES** (fence) | refusal above every side effect, `flatten: true` not exempt, spies on archive / learning / outcome / trailing / delete (change list P-2, P-4); 0 staging refusals, so the refusal arm is carried by the unit fence, never by silence |
| OBJ-2b | the branches made unreachable are deleted | **YES** | `DELETED_COMPONENTS_LOG.md` 2026-11-05 entries; `tsc` at baseline |
| OBJ-3 | open positions carry `mode`; the one uniqueness rule is `(symbol, mode)` | **YES** | migration P-5, deployed in `e0e68dfdb` (2026-11-07); read-only on staging 2026-11-14 ~03:40Z, the table's unique set is exactly the primary key plus `unique_symbol_mode UNIQUE (symbol, mode)` (constraints and unique indexes agree), 13 open rows all `mode = paper`; System Manual §19.1 corrected in the same deploy |
| OBJ-4 | the open guard and the open-positions read honour mode | **YES** | `getActiveOpenPositions(mode)` call sites enumerated with intent (pre-audit); unit: paper on X does not block live on X |
| OBJ-5 | the pinning test holds all three gates together | **YES** | the test plus three mutations, each failing (change list P-8) |
| OBJ-6 | fees required, readers honest | **YES** | P-14 + P-14b: 16 defaults dropped, deployed `77f6fd598` 2026-11-13 21:03:55Z. Langston's Step 8 re-derivation: 0 fee-missing over 110 closes. The seven KD-77 closes carry their positions' real entry fees. 3 opens after the drop (BILL, PANW, BMT) with fees set. `never_filled` books an explicit 0. One outcome rule for readers (P-15). |
| OBJ-7 | the `crypto_spot` class default: census, then drop or justify | **YES — dropped** | P-14b (with `mode`); `tsc` fence on the typed writers, positive-controlled (326 vs 324 without the schema change) |
| OBJ-8 | delete the two unused lookups; re-point the tests | **YES** | `getClosedTradesBySymbol`, `getActiveOpenPositionBySymbol` deleted and logged; persistence-marker tests re-pointed with a positive control |
| OBJ-9 | governance | **YES** | the ledger below |

**Deploys:**
- `e0e68dfdb`, 2026-11-07 13:20:59Z: increments 1 and 2.
- `d01da3d86`, 2026-11-07 16:23:40Z: increment 3 and P-14.
- `77f6fd598`, 2026-11-13 21:03:55Z: P-14b.

The batch has also been live in the joint deploy `9591ba8c2` since 2026-11-14 01:40:58Z.

**CI:**
- P-14b code: run `43469572254`, 4/4 at `f7587f4c5`.
- Deployed head `9591ba8c2`: run `43539037444`, 4/4 (Build, Test Suite, TypeScript Check, Docker Build).
- Earlier increments: their runs are in the change list.

**Reviews:**
- Step 4: Langston PROCEED on every increment (change list).
- Step 8: Langston PROCEED, Discord `1570999454561996932`. He re-derived all four Step-7 claims read-only on staging.

## Record corrections (Langston, Step 8)

1. **The `net_pnl = gross_pnl − total_fee` check holds within one unit in the last place, not exactly.**
   - Exact equality holds on 84 of 110 closes.
   - The other 26 differ by exactly 1e-8, which is one unit in the last place of `numeric(20,8)`. Nothing differs by more.
   - Tolerance stated: **|delta| ≤ 1e-8.**
2. **The not-null control was mislabelled by one day.** The archive named `error__2026-11-13` holds 11-12's lines (the file is named for the moment it was rotated).
   - Langston's census over 14 days found 96 `violates unique constraint` lines and no other constraint class.
   - So database constraint errors demonstrably reach `error.log`, and the zero not-null lines are evidence at the level of the error class.

## For the learning-record restart (sprint row 100)

Row 100 asks of each batch: does it change the cost/fee terms on a closed trade? **Yes.** No fee or cost can now be an invented zero, and open records written before `77f6fd598` may carry an invented 0 entry fee. Row 100 already lists this batch as a prerequisite, so nothing in the plan moves.

## Governance ledger — Step 10 (transcribed from the governance commit message)

CHANGE-CLASS: architecture

| # | document | verdict | line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | closed entry: what it is, what changed, verified, the unproven restore path |
| T1 | `PHASE_HISTORY.md` | ✅ | 2026-11-05 entry, closed 2026-11-14, in plain language |
| T1 | `SPRINT_TO_LIVE_PLAN.md` row 72 | ✅ | CLOSED 2026-11-14 with the report linked |
| T1 | `PHASE_19_PLAN.md` row `3n.u3` | ✅ | in-flight row finished: closed as sprint row 72, owner CC-A, the two items' real dispositions |
| T1 | shared `MEMORY.md` + `MEMORY_CC_A.md` | ✅ | shared: one trade-record truth line (two duplicate lines shortened to stay under the cap, 24,544 B); mine: position updated |
| T1 | the batch `SCOPE` | ✅ | r3, written at Step 1 |
| T1 | the batch `PRE_AUDIT` | ✅ | written at Step 2 (with its P-14b amendment) |
| T1 | `COMPLETION_REPORT` | ✅ | this file |
| T1 | the `Observation` column | N/A | no observation window: the restore path's successor is carried by the critical alert (Langston, Step 8) |
| T1 | the four session task lists | ✅ mine (item 8 closed; item 2 refreshed) / N/A ×3 — not mine | |
| T1 | Langston's `MEMORY.md` | ✅ | net-zero swap through `langston-memory-write`: two closed-batch lines out, one closing line in; loaded set 143,723 → 143,658 B against the 143,856 B ceiling |
| T2 | `SYSTEM_MANUAL.md` | ✅ | §19.1: the close-record rule, mode independence, no defaults on cost / class / mode |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | new entry for the two trade tables: the close key, `mode`, the dropped and kept defaults, the restore path, removals |
| T2 | `RUNNING_ISSUES.md` | N/A | the batch has no issue entry of its own (homed by plan row 72); its one open item, the restore path, is alert-carried per Langston |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | FIX-2026-11-14-A |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | no roadmap change at close; the batch's 11-05 position-writer addition stands |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | no parameter changed; row 100 already sequences the restart after this batch |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional rule changed |
| T2 | `STORAGE_POLICY.md` | N/A | no retention or tier changed; the migrations shipped their rollbacks in git |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | ✅ | working-list review: no status change to items A–F; one paper bookkeeping note |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no onboarding learning |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | the method did not change |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | the reviewer's build did not change |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | no stable rule changed |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | no `CLAUDE.md` rule changed |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | written at each removal (P-1/P-3, OBJ-8, P-18/P-10, P-14b) |
| T2 | `MISTAKE_PATTERNS.md` | N/A | the batch's `MISTAKE:` trailer is on its commit, where the weekly pass reads it |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | the declared-open row flipped to `open-retired` in this commit; the two batch alerts resolve after Langston's Step-11 confirmation |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | the alert process did not change |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | the board did not change |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | no feature check in this batch |

Also changed: `ACTIVE_PATH_FLOW.md`, where the stale writer line `storage.ts:3324` was swept to `:3910` (OBJ-9; raw-SQL inserts into the table: none).

## Honest residual

- The restore path is unproven (above).
- The pinning test is designed to break when row 19 (`B-SYMBOL-CLASS-IDENTITY`) moves the open key to `(symbol, asset_class, mode)`. That is intended, and row 19 owns updating it.
- **The VTS was out of scope** (Kyle KD-24, narrowed: "VTS review dropped unless a case appears"). No case appeared.
