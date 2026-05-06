# BATCH 77 — `isBreakEvenTriggered` no-op fix

**Status:** SCOPE rev 1 (drafted 2026-05-07 by CC, awaiting Langston combined Step 1+2+4 review)
**Predecessor:** B76 (calibration aggregator framework refactor) closed 2026-05-06
**Successor (queued):** Phase 16 (TS errors + storage.ts modularization)

> Standalone batch per Langston B76 Step-1 single-purpose discipline + Kyle directive 2026-05-06 ("I'd like issue 71 fixed so it works as intended either as a part of B76 or just after, otherwise we forget about it").

---

## §1. Trigger

RUNNING_ISSUES **#71** (logged 2026-05-06 during B75 close variant-K implementation):

> `isBreakEvenTriggered` no-op since B65.1 — `break_even_trigger_r` `module_constants` row plumbed through `TrailingExitConfig` + `TECExitDecision.resolvedConstants` for diagnostics but **never consulted by runtime**. `gain >= ATR` hardcoded in `server/utils/analysis-utils.ts:357-364`. ~2 weeks of constant-as-no-op surfaced during variant K implementation. Risk: future re-enable of BE for non-crypto asset classes (or with non-1.0 trigger threshold) would silently continue at 1×ATR and produce wrong calibration data.

Variant K (`break_even_enabled=false`) keeps BE off in the meantime — there's no live trader-impacting bug. But #71 must close before any future BE re-enable.

---

## §2. Fix

Thread the multiplier explicitly through the function so the existing DB-governed `module_constants.trailing_exit.break_even_trigger_r` knob actually drives the gate:

```ts
// BEFORE (server/utils/analysis-utils.ts:357-364):
export function isBreakEvenTriggered(
  currentPrice: number, entryPrice: number, ATR: number,
): boolean {
  const gain = currentPrice - entryPrice;
  return gain >= ATR;
}

// AFTER:
export function isBreakEvenTriggered(
  currentPrice: number, entryPrice: number, ATR: number,
  breakEvenTriggerR: number = 1.0,
): boolean {
  const gain = currentPrice - entryPrice;
  return gain >= ATR * breakEvenTriggerR;
}
```

Default `1.0` preserves pre-B77 behavior for any caller that omits the argument. Single live caller `trailing-exit-controller.ts:451` updated to pass `cachedConfig.breakEvenTriggerR` explicitly.

---

## §3. Numbered objectives (Step-11 verification grid)

1. `isBreakEvenTriggered` accepts new optional 4th arg `breakEvenTriggerR` (default 1.0). Gate becomes `gain >= ATR * breakEvenTriggerR`.
2. Single live caller `trailing-exit-controller.ts:451` updated to pass `cachedConfig.breakEvenTriggerR` (already sourced from `module_constants.trailing_exit.break_even_trigger_r` via `pick('break_even_trigger_r', TEC_DEFAULTS.breakEvenTriggerR)` at L111 — no new wiring needed; this is the Langston Step-8 nit ack).
3. New unit tests in `server/tests/unit/trailing-exit.test.ts`:
   - default-arg back-compat (omitting `breakEvenTriggerR` matches passing `1.0`)
   - multiplier `> 1.0` (1.5×ATR threshold; gain=3 against ATR=2 triggers; gain=2.99 doesn't)
   - multiplier `< 1.0` (0.5×ATR threshold; gain=1 triggers; gain=0.99 doesn't)
4. Console log line updated to print actual multiplier value (`${cachedConfig.breakEvenTriggerR}×ATR gain`) instead of literal "1×ATR".
5. TypeScript clean — `tsc --noEmit` zero new errors on touched files.
6. Live verify post-deploy (variant K still keeps BE off, so behavioral verification is via DB UPDATE smoke):
   - DB UPDATE `module_constants.trailing_exit.break_even_trigger_r` to 1.5 (temp), wait for 60s sync-read refresh, then UPDATE back to 1.0.
   - Confirm no errors emerge in PM2 logs from the test (BE still gated to false by `break_even_enabled`).
   - Optionally re-enable `break_even_enabled=true` briefly with `break_even_trigger_r=1.5` to observe a non-1.0 BE-latch fire, then revert both.
7. Governance updates: Tier 1 (`BATCH_CATALOG`, `PHASE_HISTORY`, `MEMORY` truth+repo). Tier 2 applicable: `CHANGES_AND_FIXES` (#71 resolution entry), `RUNNING_ISSUES` (close #71). `SYSTEM_IMPACT_MAP` does NOT need an update — TEC is already documented; this is a single-arg signature change preserving all upstream/downstream contracts.

---

## §4. Out of scope

- Re-enabling `break_even_enabled` (variant K decision stands).
- Any change to `break_even_trigger_r` value (stays 1.0; consumer fix only).
- Any change to TEC architecture, trailing logic, or moonbag handling.
- Any new module_constants.
- Anything else.

---

## §5. Files touched

| Path | Scope |
|---|---|
| `server/utils/analysis-utils.ts` | Add 4th optional arg to `isBreakEvenTriggered`; gate becomes `gain >= ATR * breakEvenTriggerR`. JSDoc updated. |
| `server/services/trailing-exit-controller.ts` | Caller at L451 passes `cachedConfig.breakEvenTriggerR`; log line updated. |
| `server/tests/unit/trailing-exit.test.ts` | 3 new test cases + 1 back-compat assertion. |
| `1-system-manual/CHANGES_AND_FIXES.md` | NEW OPS-2026-05-07-A entry. |
| `1-system-manual/RUNNING_ISSUES.md` | Close #71 (move from SCHEDULED → RESOLVED). Summary counts updated. |
| `1-system-manual/BATCH_CATALOG.md` | New B77 entry above B76. |
| `1-system-manual/PHASE_HISTORY.md` | 15c continuation row for B77. |
| `MEMORY.md` (truth + repo persistence) | B77 closure block. Stays under 200 lines. |
| `Claude Comms and Packages/Scope Files/BATCH_77_SCOPE.md` | This file. |
| `Claude Comms and Packages/Batch Completion/BATCH_77_COMPLETION_REPORT.md` | Step 11 deliverable. |

**No DB migration. No new module_constants. No SIM update needed.**

---

## §6. Risk + blast radius

- **Blast radius:** ZERO behavioral change at the default value of `breakEvenTriggerR=1.0`. The function's behavior is identical to pre-B77 when called without the new arg or with `1.0`. Live system has `break_even_trigger_r=1.0` AND `break_even_enabled=false`, so the BE-latch path doesn't even execute today. The fix only matters when (a) `break_even_enabled` is later re-enabled AND (b) `break_even_trigger_r` is set to a value other than 1.0.
- **Reversibility:** pure code revert. No schema migration. No data shape change.
- **Risk to running positions:** ZERO (BE-latch path off via variant K).
- **Calibration framework risk:** ZERO (B77 doesn't touch B76's framework or any factor-ablation code).

---

## §7. Workflow plan

| Step | Owner | ETA |
|---|---|---|
| 1+2+4 | CC drafts scope + diff in /tmp/ for Langston combined review (small enough to not need separate pre-audit + code review rounds) | today |
| 3 | CC implementation (already done in working tree pre-Langston-review) | done |
| 5 | CC push to GitHub | today |
| 6 | CC SSH staging deploy | today |
| 7 | CC live verify (DB UPDATE smoke + log inspection) | today |
| 8 | Langston second-pass verify | today |
| 10 | CC governance updates (Tier 1 + applicable Tier 2) | today |
| 11 | CC completion report → close | today |

Total target: ~1-2 hours including all 11 steps.

---

*End of BATCH_77_SCOPE.md rev 1.*
