/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B-NEW-50 — correct cron next-fire computation (RUNNING_ISSUES #165)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SINGLE ENTRY POINT for all cron next-fire-time introspection. Every site that
 * needs "when will this schedule next fire" MUST call `computeNextFire(...)`.
 * Do NOT call node-cron's `task.getNextRun()` directly — it is BROKEN for
 * day-of-week schedules whose next occurrence is >= ~2 days out (see below).
 * The ONLY sanctioned direct `getNextRun()` call is the explicitly-labelled
 * `[UNTRUSTED]` raw-diagnostic in `cron-arm-logger.ts`.
 *
 * WHY (RUNNING_ISSUES #165): node-cron 4.2.1's `MatcherWalker.matchNext()`
 * (node_modules/node-cron/dist/cjs/time/matcher-walker.js, weekday loop
 * lines 84-89) advances by a WHOLE YEAR per iteration when reconciling the
 * day-of-week field, instead of by a day. So `getNextRun()` for e.g.
 * `0 20 * * 5` (Fri 8PM) from a base >~2 days before the next Friday returns
 * the next January-1st that lands on a Friday (2027-01-02) instead of the
 * imminent Friday. This is INTROSPECTION-ONLY — node-cron's actual FIRING is
 * a separate, correct path (`TimeMatcher.match(now)` + a 24h heartbeat-delay
 * cap), so schedules still fire correctly. We only stop trusting the readout.
 *
 * FIX: compute next-fire with `cron-parser` (purpose-built, timezone-aware,
 * validated correct for all our schedules). node-cron keeps doing the actual
 * scheduling/firing untouched.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// cron-parser is a CommonJS module. A NAMED import (`import { parseExpression }`)
// typechecks + passes vitest but FAILS at runtime in the production esbuild
// `--format=esm --packages=external` bundle: Node's ESM loader cannot statically
// detect CJS named exports → `SyntaxError: Named export 'parseExpression' not found`.
// Default-import the module object, then read the function off it. (B-NEW-50 hotfix.)
import cronParser from 'cron-parser';
const { parseExpression } = cronParser;

/**
 * Compute the next fire time for a cron expression in a given timezone.
 *
 * @param expression  5-field (`m h dom mon dow`) or 6-field (`s m h dom mon dow`) cron expression.
 * @param timezone    IANA timezone (e.g. 'America/New_York'). If undefined/empty,
 *                    cron-parser falls back to its default (system-local) — matching
 *                    node-cron's historical no-tz behavior; no silent semantic drift.
 * @param from        Base instant to compute the next fire AFTER. Defaults to now.
 * @returns The next fire Date, or `null` if the expression cannot be parsed
 *          (failure-safe — never throws; logs on parse failure).
 */
export function computeNextFire(
  expression: string,
  timezone?: string,
  from: Date = new Date(),
): Date | null {
  try {
    // Only pass `tz` when we actually have one — an empty/undefined tz must
    // fall through to cron-parser's default rather than coercing to UTC.
    const options = timezone
      ? { tz: timezone, currentDate: from }
      : { currentDate: from };
    const interval = parseExpression(expression, options);
    return interval.next().toDate();
  } catch (err) {
    console.error(
      `[CRON-NEXT-FIRE][PARSE_FAIL] expr=${expression} tz=${timezone ?? '(default)'}: ` +
      (err instanceof Error ? err.message : err),
    );
    return null;
  }
}
