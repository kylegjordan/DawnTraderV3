# B-NEW-50 CHANGE LIST — node-cron next-fire readout fix (RI #165) — Step-4 code review

**For Langston.** Working-tree diff vs HEAD `9c026aa` (NOT yet pushed). Embedded snippets per §6.5.0.a — do NOT cd to /mnt/gdrive or run git on the mount; use `ssh staging` only if needed. Local verification: `tsc --noEmit` = 493 baseline (zero new; zero errors in any touched file); `vitest` = 31/31 cron tests + 19/19 B-NEW-36 lifecycle tests green.

Diff stat: `package.json |5`, `cron-arm-logger.ts |40`, `cron-arm-smoke-test.ts |16`, `cron-arm-logger.test.ts |67`, `cron-arm-smoke-test.test.ts |66`; NEW `cron-next-fire.ts`, NEW `cron-next-fire.test.ts`.

---

## NEW — `server/services/cron-next-fire.ts` (single entry point; Langston gap #3 comment in header)

```ts
import { parseExpression } from 'cron-parser';

/**
 * SINGLE ENTRY POINT for all cron next-fire introspection. Never call
 * node-cron's task.getNextRun() directly (broken for day-of-week schedules,
 * RI #165). Only sanctioned direct getNextRun = the [UNTRUSTED] diagnostic in
 * cron-arm-logger.ts.
 */
export function computeNextFire(
  expression: string,
  timezone?: string,
  from: Date = new Date(),
): Date | null {
  try {
    // Langston gap #2: only pass tz when present — empty/undefined falls through
    // to cron-parser default rather than coercing to UTC (no silent drift).
    const options = timezone
      ? { tz: timezone, currentDate: from }
      : { currentDate: from };
    const interval = parseExpression(expression, options);
    return interval.next().toDate();
  } catch (err) {
    console.error(`[CRON-NEXT-FIRE][PARSE_FAIL] expr=${expression} tz=${timezone ?? '(default)'}: ` +
      (err instanceof Error ? err.message : err));
    return null;  // failure-safe
  }
}
```

## MODIFIED — `server/services/cron-arm-logger.ts` (authoritative = shim; raw = [UNTRUSTED])

```ts
import { computeNextFire } from './cron-next-fire.js';
const NODE_CRON_VERSION = '4.2.1'; // UPDATE on node-cron bump — feeds [UNTRUSTED ncv=…] drift-watch grep

export function logCronArm(job: RegisteredCronJob): void {
  const nextFire: Date | null = computeNextFire(job.expression, job.timezone);   // authoritative

  let rawNextIso: string;                                                        // diagnostic only
  try { const raw = job.task.getNextRun(); rawNextIso = raw ? raw.toISOString() : 'null'; }
  catch (err) { console.error(`[CRON-REGISTRATION] job=${job.name} raw getNextRun() threw: ` +
    (err instanceof Error ? err.message : err)); rawNextIso = 'threw'; }

  let nextFireIso: string; let warningTag = '';
  if (nextFire === null) { nextFireIso = 'null'; warningTag = ' [WARNING_NULL_NEXT_RUN]'; }
  else if (nextFire.getTime() < Date.now()) { nextFireIso = nextFire.toISOString(); warningTag = ' [WARNING_PAST_NEXT_RUN]'; }
  else { nextFireIso = nextFire.toISOString(); }

  console.log(`[CRON-REGISTRATION] job=${job.name} expr=${job.expression} ` +
    `tz=${job.timezone} interval_seconds=${job.intervalSeconds} ` +
    `next_fire=${nextFireIso} enabled=${job.enabled} ` +
    `raw_nodecron_next=${rawNextIso} [UNTRUSTED ncv=${NODE_CRON_VERSION}]${warningTag}`);
}
```

## MODIFIED — `server/services/cron-arm-smoke-test.ts` (classify/alert on shim only)

```ts
import { computeNextFire } from './cron-next-fire.js';
// ... inside runSmokeTest per-job loop, REPLACED `try { nextFire = job.task.getNextRun(); } catch …`:
    const nextFire: Date | null = computeNextFire(job.expression, job.timezone);
// classification (PAST_DUE / TOO_FAR_FUTURE / NULL_NEXT_RUN / OK) + alert logic UNCHANGED below.
```

## MODIFIED — `package.json` (promote transitive → direct; npm install reconciled lock)

```
   "cors": "^2.8.5",
+  "cron-parser": "^4.9.0",
   "date-fns": "^3.6.0",
```

## TESTS

- NEW `cron-next-fire.test.ts` (8) — regression-lock: `computeNextFire('0 20 * * 5','America/New_York', <Wed>)` → `2026-06-06` + `getUTCFullYear()===2026` (would be 2027 under node-cron). Covers Sun/Tue/Thu, UTC, **6-field `30 0 20 * * 5` (Langston gap #1)**, undefined-tz (gap #2), bad-expr→null, interval `*/5`.
- UPDATED `cron-arm-logger.test.ts` (5) — mock `computeNextFire`; new test asserts raw `[UNTRUSTED ncv=4.2.1]` emitted + broken raw value does NOT trigger a warning tag.
- UPDATED `cron-arm-smoke-test.test.ts` (7) — drive classification via mocked `computeNextFire` (keyed by expr); new test: real weekly `0 20 * * 5` → `OK` (the RI #165 false-positive is gone).

## REVIEW ASKS
- R1: confirm the authoritative/diagnostic split in arm-logger reads correctly (warning tags key off `computeNextFire`, never the raw value).
- R2: any objection to `NODE_CRON_VERSION` as a hand-maintained const vs runtime-read (exports block blocks `require('node-cron/package.json')`).
- R3: OK to proceed to push + CI once you ACK? Deploy still gated on Sun 00:00 UTC resume.
