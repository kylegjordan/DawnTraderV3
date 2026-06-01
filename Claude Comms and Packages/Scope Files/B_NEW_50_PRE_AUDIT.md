# B-NEW-50 PRE-AUDIT — node-cron next-fire readout fix (RUNNING_ISSUES #165)

**Batch ID:** B-NEW-50 · **Author:** Claude Code · 2026-05-31 · **Active trading:** OFF throughout.
Companion to `B_NEW_50_SCOPE.md` (root cause + firing-safety proof + remediation decision live there; not repeated).

---

## 1. SIM consultation (CLAUDE.md Step 2 mandatory)

Read `SYSTEM_IMPACT_MAP.md` §9.10.c (B-NEW-49 node-cron observability layer). Relevant findings:

- §9.10.c documents **Mode-A arming check** as: "schedule registered but `getNextRun()` returns null or past-timestamp … Writes system-alert on PAST_DUE / TOO_FAR_FUTURE / NULL_NEXT_RUN." → This is the exact surface B-NEW-50 corrects: the `getNextRun()`-based readout is unreliable for day-of-week schedules. The §9.10.c entry MUST be updated to record that the Mode-A next-fire computation moved from node-cron's `getNextRun()` to the `cron-parser` shim (`computeNextFire`).
- §9.10.c documents **Mode-B** (fire-evidence verifier) reads DB `MAX(fired_at)`, **not** `getNextRun()` → **unaffected** by B-NEW-50. Confirmed by grep.
- §9.10.c "Coverage: 7 schedules" — only the **2 weekend timers** carry a day-of-week field (`0 20 * * 5`, `0 20 * * 0`); the other 5 are interval/daily → only the 2 weekend timers were mis-classified. The shim fixes the readout for all 7 uniformly (correct for interval schedules too).

No System Manual change required: this batch touches **observability only** — no architecture, strategy logic, regime, filter, signal pipeline, or math. (System Manual scope per CLAUDE.md §9.4 does not include the cron observability layer.)

## 2. Per-component blast radius

| Component | Change | Upstream | Downstream | Risk |
|---|---|---|---|---|
| `server/services/cron-next-fire.ts` (NEW) | `computeNextFire(expr, tz, from?)` via `cron-parser`; failure-safe (null + log) | none | arm-logger, smoke-test | LOW — pure function, no I/O |
| `server/services/cron-arm-logger.ts` | swap `job.task.getNextRun()` → `computeNextFire(...)` | cron-registry | `[CRON-REGISTRATION]` log only | LOW |
| `server/services/cron-arm-smoke-test.ts` | classify on `computeNextFire(...)` | cron-registry | system-alerts | LOW — fixes false alerts |
| `package.json` | promote `cron-parser` 4.9.0 to direct dep | npm | tsc/build/CI | LOW — already installed |

**Confirmed NO other consumers:** grep `getNextRun` across `server/` → only arm-logger + smoke-test (+ tests). Fire-evidence verifier, session-lifecycle-controller (calls `logCronArm` centrally), and the 5 schedule wirings do not independently read `getNextRun()`.

**Cross-asset isolation:** N/A — cron observability is asset-class-agnostic; no per-class code touched; crypto/xstock trading paths untouched.

## 3. cron-parser integration facts (verified)

- Ships bundled types (`types/index.d.ts`); **no `@types/cron-parser` needed**.
- Named export: `import { parseExpression } from 'cron-parser'`. `ParserOptions` has `currentDate?`, `tz?`, `utc?`. `CronExpression.next()` → `CronDate.toDate(): Date`.
- Empirically validated correct + tz-aware for all schedules (`scratch/ri165-cronparser.cjs`): Fri→2026-06-06, Sun→2026-06-01, Tue→2026-06-03, Thu→2026-06-05.

## 4. Test plan (Step 3 chunk)

1. **`cron-next-fire.test.ts` (NEW)** — regression-lock the #165 signature: `computeNextFire('0 20 * * 5','America/New_York', <Wednesday>)` → 2026 Friday, NOT 2027; cover Tue/Thu/UTC; assert null-on-bad-expression.
2. **`cron-arm-smoke-test.test.ts` (existing, update)** — mock `computeNextFire` instead of `task.getNextRun`; assert weekend timer → `OK` (not `TOO_FAR_FUTURE`); keep PAST_DUE/NULL paths.
3. **`cron-arm-logger.test.ts` (existing, update)** — assert log line uses computed next_fire; keep WARNING_NULL / WARNING_PAST tags.
4. Local `npx tsc --noEmit` + `npx vitest run` green before push (mirror).

## 5. Verification (Steps 7–8)

- Staging boot `[CRON-REGISTRATION]` lines show correct Friday/Sunday next_fire.
- Boot + boot+5min smoke runs: both weekend timers `status=OK`; **zero** new TOO_FAR_FUTURE alerts.
- Ack the 4 stale false alerts (`44a7fc65`, `0f366c74`, `bcd99bb0`, `8dae4c1f`).
- Langston Step-8 independent confirm.

## 6. Langston Step-1 ACK — answers + folded refinements (2026-05-31, CLEAN, "proceed to Step 2")

- **Q-1 = YES.** Log node-cron's raw `getNextRun()` tagged `[UNTRUSTED ncv=<node-cron version>]` (version included so a future bump auto-self-documents the drift-watch grep). Log-only, never alert. Classification/alerts key purely on `computeNextFire` (cron-parser).
- **Q-2 = SHIM.** Concur (pin dead, replace disproportionate).
- **Q-3 = deploy-gate.** Concur (hold until Sun resume verified — avoids debugging two cron things at once).

**Folded refinements (all inside objective 5 / §1 helper — non-blocking):**
1. **6-field/seconds case** — regression test must cover at least one 6-field schedule (cron-parser seconds-slot semantics differ from node-cron edge cases). Added to test plan §4.1.
2. **Timezone fallback** — `computeNextFire` must explicitly handle `timezone` undefined/empty (omit `tz` option → cron-parser local/UTC) without silent drift; documented in helper.
3. **Single-entry-point comment** — `cron-next-fire.ts` header states all next-fire introspection MUST route through `computeNextFire`; never call `task.getNextRun()` directly (except the labelled `[UNTRUSTED]` raw-diagnostic in arm-logger).

**Step-2 sequencing note:** batch is a 2-file observability fix; pre-audit folded into scope + this doc. Langston explicitly cleared "proceed to Step 2." Per peer iterate-and-decide, proceeding to implementation; Langston's substantive code-level review happens at Step 4 (the diff) per workflow.
