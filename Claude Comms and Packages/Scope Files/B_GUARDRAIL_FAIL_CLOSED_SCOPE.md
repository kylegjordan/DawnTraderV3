# B-GUARDRAIL-FAIL-CLOSED (`#1081`, row `4.a`) — SCOPE

change-class: non_architecture

> **Owner:** CC-C. **Found** 2026-09-29 while tracing `#1079` (a second reader flagged the exposure arm; CC-C re-derived it and found the cooldown arm). **Rule 23, fix-on-find.** **Rule 24 outcome (3):** legacy that no longer fits today's intent.

## THE DEFECT, AT `origin/migration/aws-supabase`
Two pre-trade risk checks in `server/services/trade-safety.ts` return **PASS** when the check itself throws:
| check | function | the catch |
|---|---|---|
| symbol cooldown | `checkSymbolCooldown` (`:206`) | `:319-321`: `console.error('[8.8.3-H4] Error checking cooldown:', error); return { ok: true };` |
| total portfolio exposure | `checkMaxTotalExposure` (`:625`) | `:669-671`: `console.error('[8.8.3-B3][MAX_TOTAL_EXPOSURE_ERROR]', error); return { ok: true };` |

**A risk limit that errors is treated as satisfied.** The §0 mission makes the risk limits hard boundaries; `CLAUDE.md` §11 says fail hard.
**Measured latent:** 0 `MAX_TOTAL_EXPOSURE_ERROR` and 0 `Error checking cooldown` lines across the 14 daily `error.log` files 09-14..28 plus the live file, each with a positive control on the same tag family in the same files (224-7,842 `GUARDRAIL_BLOCK code:MAX_TOTAL_EXPOSURE` a day; `[8.8.3-H4][GUARDRAIL_BLOCK] code:COOLDOWN` present).
**Out of scope, with the reason:** `checkLowPricedCoinProtection`'s catch (`:590-591`) is inside a `/* … */` block; the live function returns PASS at `:504` by design (`Phase 8.8.3-AJ8: LPCP is DORMANT`), and the dormant block is homed at `#518`.

## 1.b PROVENANCE (tier 1: both functions change behaviour)
**Corpora searched:** `RUNNING_ISSUES.md`, `BATCH_CATALOG.md`, the completion reports (by `trade-safety`, `MAX_TOTAL_EXPOSURE_ERROR`, `Error checking cooldown`: no decision recorded that the catch should pass), and `git log -S`.
- `trade-safety.ts` was created by `fced92cec` (2025-12-01, Replit), quoted: *"Migrates risk management logic from a legacy RiskManager class to a new Guardrail-driven system, ensuring all risk rules are transparently defined and managed within the Guardrails tab. This includes creating `guardrail-settings.ts` and `trade-safety.ts` to handle risk calculations, portfolio balance retrieval, and pre-trade safety checks."* The cooldown check and its catch arrived in that consolidation (the message string predates it, `11adb5286`, 2025-10-25, in another file).
- The exposure check and its catch: `321a4fd45` (2025-12-04, Replit), quoted: *"Introduce 'maxTotalExposurePct' guardrail, implement ghost trade filtering in trade history, and correct portfolio balance calculations."*
- **Today's intent:** `P19-B8.8` made the SAME exposure function refuse on an unreadable cap, in its own comment: *"A BLOCKING exposure check may never pass against a substituted cap: refuse loudly (fail-closed)"* (`:633-644`) — and left the catch passing.
**Disposition (2): relevant, needing an update to today's intent.** The checks are live and correct; their error arm contradicts the fail-closed rule the same function already states.

## OBJECTIVES
| # | objective | verification |
|---|---|---|
| OBJ-1 | `checkSymbolCooldown`'s catch returns a refusal and logs it as an error. | A unit test forces a throw inside the check ⇒ `{ ok: false }`; the mutation back to `ok: true` fails it. |
| OBJ-2 | `checkMaxTotalExposure`'s catch does the same. | The same, for the exposure check. |
| OBJ-3 | **Census, written into Step 2:** every `catch` and every early `return { ok: true }` on an error-shaped path in the pre-trade guardrail call graph (`checkGuardrailRisk` and every check it calls, plus the engine's open-seam guardrail reads), each dispositioned: fixed here, already fail-closed (cited), or cross-referenced to its home. The on-close daily-loss kill-switch evaluator (`daily-loss-budget.ts:283+`) is `#618` / row `4.b`'s, not this batch's; the census reads it only to hand any lead there. | The Step-2 table, with a count and a `path:line` per row. |
| OBJ-4 | **No behaviour change today:** both arms measured at zero fires. | After deploy: the new refusal log tag reads 0, with the exposure `GUARDRAIL_BLOCK` lines as the positive control in the same file. Honest limit: the error branch cannot be induced on staging, so OBJ-1/2 are proved by tests. |

## THE CHOICE I WANT RULED AT STEP 1
**Which refusal code.** (a) **Reuse `GUARDRAIL_READ_FAIL`**, whose declared meaning is *"blocking check refused — guardrail input unreadable (fail-closed, no substitution)"* (`trade-safety.ts:79`). A check that throws could not verify its limit, which is the same state; reuse means no change to the code union. Neither downstream list names `GUARDRAIL_READ_FAIL` today: `rtb-metrics-service.ts` maps an unnamed code to `OTHER` (its default at `:519`), and the execution-metrics route (`routes.ts:17253-17261`) fills only its named reasons, so an unnamed code is not shown there at all. A thrown check therefore lands exactly where an unreadable cap already does, including that display gap, which is pre-existing and is read at Step 2. Each arm keeps its own log tag, so the cause stays distinguishable in the logs. (b) A new `GUARDRAIL_CHECK_ERROR` code, which means extending the union, and naming it in both lists would be new display work. **I recommend (a).**
**Consequence, stated:** at promotion a refused signal is removed from the RTB pool and not restored (`ACTIVE_PATH_FLOW.md:249`, working as designed). A transient database fault during a check therefore drops that signal instead of opening it. That is the fail-closed trade.

## GOVERNANCE (Step 10)
`CHANGES_AND_FIXES`, `RUNNING_ISSUES` (`#1081` closed), `BATCH_CATALOG`, `PHASE_HISTORY`, `PHASE_19_PLAN` row `4.a`; SIM entry for the trade-safety checks; System Manual judged at Step 2 (guardrail behaviour on error; likely a one-line addition to the guardrail section).
