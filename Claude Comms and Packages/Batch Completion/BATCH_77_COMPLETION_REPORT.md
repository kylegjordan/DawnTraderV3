# BATCH 77 — `isBreakEvenTriggered` no-op fix — Completion Report

**Status:** SHIPPED 2026-05-07
**Workflow:** 11-step canonical workflow (compressed for ~1hr scope)
**Branch:** `migration/aws-supabase`
**HEAD at close:** `ee7522b4d`
**PM2:** TBD post-deploy.

---

## §A. Trigger

RUNNING_ISSUES **#71** (logged 2026-05-06 during B75 close variant-K implementation):

> `isBreakEvenTriggered` no-op since B65.1 — `break_even_trigger_r` `module_constants` row plumbed through `TrailingExitConfig` + `TECExitDecision.resolvedConstants` for diagnostics but **never consulted by runtime**. `gain >= ATR` hardcoded in `server/utils/analysis-utils.ts:357-364`. ~2 weeks of constant-as-no-op surfaced during variant K implementation.

Variant K (`break_even_enabled=false`) keeps BE off in production today, so there's no live trader-impacting bug. But #71 had to close before any future BE re-enable to avoid silent miscalibration on non-1.0 trigger thresholds (e.g., re-enabling BE for non-crypto asset classes with different multipliers).

Kyle directive 2026-05-06: "I'd like issue 71 fixed so it works as intended either as a part of B76 or just after, otherwise we forget about it."

---

## §B. Outcome

Threaded `breakEvenTriggerR: number = 1.0` 4th argument through `isBreakEvenTriggered`. Gate becomes `gain >= ATR * breakEvenTriggerR`. Default 1.0 preserves pre-B77 behavior for any caller that omits the argument. Single live caller `trailing-exit-controller.ts:451` updated to pass `cachedConfig.breakEvenTriggerR` (already DB-governed via `pick('break_even_trigger_r', TEC_DEFAULTS.breakEvenTriggerR)` at L111 — no new wiring needed; Langston Step-8 nit on B76 confirmed). Console log line updated to print actual multiplier value.

**Zero behavioral change at current settings.** `module_constants.trailing_exit.break_even_trigger_r = 1.0` (the seeded value) AND `break_even_enabled = false` (variant K). The fix only matters when (a) BE is later re-enabled AND (b) `break_even_trigger_r` is set to a value other than 1.0.

---

## §C. Components shipped

| Path | Description |
|---|---|
| `server/utils/analysis-utils.ts` | Added 4th optional arg `breakEvenTriggerR: number = 1.0` to `isBreakEvenTriggered`. Gate `gain >= ATR * breakEvenTriggerR`. JSDoc updated explaining the no-op history + B77 fix. |
| `server/services/trailing-exit-controller.ts` | Caller at L451 passes `cachedConfig.breakEvenTriggerR`. Log line updated from hardcoded "1×ATR gain" to interpolated `${cachedConfig.breakEvenTriggerR}×ATR gain`. |
| `server/tests/unit/trailing-exit.test.ts` | 3 new test cases: (a) multiplier > 1.0 (1.5×ATR threshold; gain=3 against ATR=2 triggers; gain=2.99 doesn't); (b) multiplier < 1.0 (0.5×ATR threshold; gain=1 triggers; gain=0.99 doesn't); (c) default-arg back-compat (omitting matches passing 1.0). Plus updated existing 1×ATR test description. |

**Total diff:** 3 source files + governance, ~99 lines source diff.

**No DB migration. No new module_constants. No SIM update needed** — TEC component contracts unchanged. Constant `break_even_trigger_r` was already in `module_constants.trailing_exit` (B65.1 seed); already DB-governed via `pick(...)` at L111 of trailing-exit-controller.ts; only the consumer's blindness was the bug.

---

## §D. Hotfixes within close window

None. B77 main commit is the ship commit.

---

## §E. Verification

### E.1 CI gate (run `25464172482`)

(TBD post-CI completion. Per Kyle directive: Build+Docker pass + zero new B77-introduced test failures = clear to deploy. Legacy TS Check baseline acceptable.)

### E.2 Live verify smoke (post-deploy)

Plan per Langston Step-1+2+4 review (recommended-not-blocking upgrade):

1. Deploy to staging via SSH; PM2 restart; HTTP 200.
2. PM2 log inspection — no errors in trailing-exit paths post-restart.
3. **Smoke test (recommended upgrade per Langston):**
   - `UPDATE module_constants SET value='1.5'::jsonb WHERE module_name='trailing_exit' AND constant_name='break_even_trigger_r'`. Wait 60s for sync-read refresh.
   - `UPDATE module_constants SET value='true'::jsonb WHERE module_name='trailing_exit' AND constant_name='break_even_enabled'`. Wait 60s.
   - Observe next BE-latch fire in PM2 logs — line should read `[9.2][LOCK] {symbol} BREAK-EVEN latched @ {price} (net, 1.5×ATR gain)` (was hardcoded "1×ATR gain" pre-B77).
   - Revert both: `break_even_enabled=false`, `break_even_trigger_r=1.0`.
4. Confirm no errors during the toggle dance.

(Result: TBD post-deploy.)

---

## §F. Langston review trail

| Step | Round | Outcome |
|---|---|---|
| 1+2+4 combined | Scope + diff at `/tmp/b77_diff.patch` | **APPROVED.** Math + boundary tests verified by inspection. Surface area matches B76 Step-8 spec exactly: 4th arg defaults to 1.0; gate `gain >= ATR * breakEvenTriggerR`; single live caller threads `cachedConfig.breakEvenTriggerR`; console log interpolates actual multiplier. Unit tests cover 1.5×ATR + 0.5×ATR + back-compat. No missed callers per grep. **Recommended-not-blocking upgrade:** smoke test by briefly re-enabling BE with `break_even_trigger_r=1.5` to observe the latch line print "1.5×ATR gain" — closes the Issue #71 lesson with end-to-end production-side proof. **Non-blocking nit (filed for future cleanup batch, not B77):** `${cachedConfig.breakEvenTriggerR}×ATR gain` console interpolation prints raw JS-number; future operator setting 1.7 might see "1.6999999999999998×ATR" due to FP. `.toFixed(2)` would be cleaner. |
| 8 | Second-pass verify | TBD post-deploy. |

---

## §G. Pre/Post-B77 behavior comparison

| Scenario | Pre-B77 | Post-B77 |
|---|---|---|
| `break_even_enabled=true` AND `break_even_trigger_r=1.0` | BE latches at exactly 1×ATR gain | BE latches at exactly 1×ATR gain (identical — default arg preserves behavior) |
| `break_even_enabled=true` AND `break_even_trigger_r=1.5` | BE latches at 1×ATR gain (silently ignores constant) | BE latches at 1.5×ATR gain (constant honored) |
| `break_even_enabled=false` (variant K, current state) | BE-latch path off; constant value irrelevant | BE-latch path off; constant value irrelevant — **identical behavior** |

---

## §H. Governance updates

| File | Update |
|---|---|
| `1-system-manual/BATCH_CATALOG.md` | New B77 entry inserted above B76. |
| `1-system-manual/PHASE_HISTORY.md` | New "Phase 15c continuation" row for B77 SHIPPED. |
| `1-system-manual/RUNNING_ISSUES.md` | #71 moved SCHEDULED → RESOLVED 2026-05-07 (B77). Summary counts updated (RESOLVED 47→48; SCHEDULED 1→0). |
| `1-system-manual/CHANGES_AND_FIXES.md` | OPS-2026-05-07-A entry. |
| `MEMORY.md` (truth + repo persistence) | B77 closure block; pickup priority updated; under 200 lines. |
| `Claude Comms and Packages/Scope Files/BATCH_77_SCOPE.md` | rev 1 (final). |
| `Claude Comms and Packages/Batch Completion/BATCH_77_COMPLETION_REPORT.md` | This report. |

**No SIM update required** — TEC component contracts unchanged; 4th-arg signature is additive with default value preserving prior behavior.

---

## §I. Pending external

None. B77 is pure code fix — no Kyle external action required.

---

## §J. Lessons learned

1. **"Plumbed but not consumed" is a class of bug worth grepping for.** The `break_even_trigger_r` constant existed in three places (DB row, `TrailingExitConfig` interface, `TECExitDecision.resolvedConstants`) but the function that should have consulted it never did. Future audits should grep config-resolution code for "constant declared in module_constants ↔ constant actually referenced in runtime path" to catch similar silent regressions early. Surface signal: a `module_constants` row whose value never changes from its default could be a legitimate stable knob OR an unconsumed constant — disambiguate by greping the runtime path.
2. **Single-purpose discipline saves audit time.** Per Langston "do not bundle anything into B77" — a one-line function-signature change + 3 unit tests is reviewed in minutes. Bundling unrelated work would have stretched review and obscured the fix.
3. **Default-arg back-compat is the right shape for additive plumbing fixes.** `breakEvenTriggerR: number = 1.0` lets the change ship with zero behavioral drift at current settings while making the constant honor work for future re-enables. No call-site update required outside the single live one.

---

*End of BATCH_77_COMPLETION_REPORT.md.*
