# B-GUARDRAIL-FAIL-CLOSED (`#1081`, row `4.a`) — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture

> **Step 1 APPROVED** by Langston 2026-09-28 (UTC) at `2dee0561d`, with three conditions (C1-C3), all carried below. **Code ruled: reuse `GUARDRAIL_READ_FAIL`.**

## 0. PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED:** three fail-open arms. **NOW:** two. **REASON:** the low-priced-coin catch (`:590-591`) is inside a `/* */` block closing at `:594`; the live function returns PASS at `:504` by design (AJ8), homed at `#518`.
- **PREVIOUSLY STATED:** the baseline covered "09-14..28". **NOW:** the daily files on the box are **09-15..09-28** (14 files) plus the live file. **REASON:** Langston's population check; the count 14 was right, the label off by one.
- **PREVIOUSLY STATED:** positive controls as per-day ranges. **NOW:** corpus totals over those 15 files, re-derived by Langston: **49,581** `[8.8.3-B3][GUARDRAIL_BLOCK]`, **82** `[8.8.3-H4][GUARDRAIL_BLOCK] code:COOLDOWN`; the two error tags **0** each. **REASON:** name the convention beside the number.

## 1. AUDIT, AT `origin/migration/aws-supabase`
| # | finding | where |
|---|---|---|
| A1 | **The two live fail-open arms.** Every `catch` in `trade-safety.ts` enumerated (Langston re-derived): `:319` cooldown (LIVE, passes), `:532`/`:558`/`:590` (dormant LPCP block), `:669` exposure (LIVE, passes), `:901`/`:919`/`:933` (trailing-state persistence, outside the guardrail graph). | `trade-safety.ts` |
| A2 | **Call-site census (Langston C2): a throw from the gate is handled one hop up, so each site is read.** The gate `checkGuardrailRisk` (`:690`) has no `try`, and `buildSettingsFromGuardrails` (`:721`) throws on a missing row outside any `try`. | see table below |
| A3 | **Early passes on error-shaped conditions, in the checks the gate calls** (every live `return { ok: true }`, dormant block excluded). Two are error-shaped and sit in the position-size cap: `:352` `[J7][GUARDRAIL_SKIP]` skips the cap when `portfolioValue` is not a positive finite number, and `:390` passes when the recomputed `stopDistance === 0`; the same fallback branch also reads `riskPerTradePct || '4'` (`:385`), a hard-coded fallback for a DB-governed setting. The others are normal outcomes (no prior trade / cooldown elapsed `:225`, `:238`, `:279`; checks passed `:142`, `:166`, `:196`, `:318`, `:475`, `:617`, `:668`, `:833`) or a decided diagnostic mode (`:465` AJ19 dry run). | `trade-safety.ts:340-395` |
| A4 | **The display gap (Langston C1).** Under reuse, the refusal lands in `rtb-metrics-service.ts`'s `normalizeBlockReason` default `OTHER` (`:506-520`), because neither `RtbBlockReason` (`:14-30`) nor its two lists (`:509-513`, `:162-165`) name `GUARDRAIL_READ_FAIL`. | `rtb-metrics-service.ts` |
| A5 | **A stale display list, found while reading A4:** the execution-metrics route's `allBlockReasons` (`routes.ts:17253-17256`) uses names the gate no longer emits (`STOP_LOSS_REQUIRED`, `ASSET_MAX_POSITIONS`) and omits several it does, **including `MAX_TOTAL_EXPOSURE`, the most frequent refusal** (`#1079`). Whether that drops them from the display depends on the keys `storage.getExecutionAttemptMetrics` returns, which is not read here. | `routes.ts:17250-17261` |

**A2 table:**
| call site | what a throw from the gate does there | verdict |
|---|---|---|
| `active-execution-engine.ts:4784` (`executeSimulatedTrade`, no `try` of its own) | propagates to `processSignal`, whose `catch` (`:6254-6258`) returns `{ opened: false, stage: 'OTHER' }` | **fail-closed**; counted `OTHER` |
| `pre-execution-validator.ts:131` | the enclosing `catch` converts it to a blocked `ValidationResponse` (its own comment above the call) | **fail-closed** |
| `trading-engine.ts:257` | the enclosing `try` (`:231`) `catch` (`:290`) logs, records a `trade_error` event, returns `null` (`:300`) | **fail-closed** |
| `routes.ts:15239`, `:15488` | `/test/` diagnostic routes that call the gate with the wrong argument order and branch on `riskCheck.approved`, a field `TradeSafetyResult` does not have ⇒ the trade branch never runs | **not a trading path**; Langston's §13 item, homed below |
**Exactly five live call sites** (`git grep "checkGuardrailRisk("` over `server/`, tests excluded; `safety-guardrails.ts` names it only in comments). **No site swallows a throw and continues to a trade.**

**SIM / System Manual:** SIM entry for the trade-safety checks (read): the gate's consumers are the three engine paths above. System Manual guardrail section: silent on error behaviour; that silence is the gap this batch closes (a one-line statement at Step 10).
**Ledger / provenance:** Step 1 quotes `fced92cec` and `321a4fd45`; `P19-B8.8` already states fail-closed in the exposure function (`:633-644`).

## 2. PLAN (each item points at its finding)
- **P1 ← A1.** `checkSymbolCooldown`'s catch: `console.error('[B-GUARDRAIL-FAIL-CLOSED][CHECK_THREW check=COOLDOWN mode=…] <message> — refusing, the cooldown cannot be verified')` and `return { ok: false, code: 'GUARDRAIL_READ_FAIL', reason: 'cooldown check failed — cannot verify, refusing' }`.
- **P2 ← A1.** `checkMaxTotalExposure`'s catch: the same, `check=MAX_TOTAL_EXPOSURE`, keeping the existing `[8.8.3-B3][MAX_TOTAL_EXPOSURE_ERROR]` tag so old greps still find it.
- **P3 ← A4 (C1), disposition 1: FOLDED.** Add `GUARDRAIL_READ_FAIL` to `RtbBlockReason`, to `normalizeBlockReason`'s known list and to `initializeBlockReasons`, so the refusal is counted under its own name instead of `OTHER`. Three list entries in one file.
- **P4 ← C3, tests.** Force the throw at the STORAGE boundary (the storage read each check makes), not by stubbing the check. Assert `ok === false`, **`code === 'GUARDRAIL_READ_FAIL'`**, and the log tag; a CONTROL where storage returns normally and the check passes. Plus: a `GUARDRAIL_READ_FAIL` block is counted under its own name by `rtb-metrics-service`. **Mutations:** each catch back to `ok: true`; the code dropped (bare `ok: false`); the metrics entry removed. Each must fail a test.
- **Dispositions for what the census found outside the two arms:**
  - **A3 (the position-size cap's `:352` skip, `:390` pass, `:385` `|| '4'`) — disposition 2: added to `B-SIZING-DEC-RESTORE` (`#698`).** Kyle's `PAPER-RESET-3000` makes every trade ~$150 fixed notional, which rewrites exactly this check, and `#618` already requires the guardrail-set adjudication before that change. Recorded on `#698`.
  - **Langston's §13 find (`routes.ts:15239`, `:15488`) and A5 (the stale `allBlockReasons` list) — disposition 3: own batch `B-GUARDRAIL-ROUTE-LEGACY` (`#1084`), owner CC-C, placed at `PHASE_19_PLAN` row `4.b1`, after `4.b`.** Rule 24 outcome (3). No live trading exposure (diagnostic and display routes).
- **Governance (Step 10):** `CHANGES_AND_FIXES`, `RUNNING_ISSUES` (`#1081` closed), `BATCH_CATALOG`, `PHASE_HISTORY`, `PHASE_19_PLAN` row `4.a`, **`MEMORY` (Langston's nit: a required row in every class)**, SIM (trade-safety checks + the RTB metrics reason list), System Manual (one line: a guardrail check that cannot verify refuses).
- **Deploy:** rides the next deploy after Step 4 clears (D1 if in time, else D2). No migration.
