/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B-NEW-49 — cron-registry (2026-05-31)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Centralized in-memory registry of all node-cron schedules registered at
 * boot. Provides positive boot-time evidence ("here are the N schedules I
 * registered") + getter for downstream consumers (smoke test, fire-evidence
 * verifier, future /api/diagnostics endpoint).
 *
 * Why a registry: prior to B-NEW-49, each schedule was registered in isolation
 * with no shared visibility surface. Silent-failure detection requires
 * enumerating all registered schedules + comparing expected vs actual fires.
 * BUG-2026-05-31-B: 4 of 5 schedules silently failed for ~31h without any
 * boot-time signal that they had even armed correctly. This registry is the
 * foundation for the smoke test + fire-evidence verifier that close that gap.
 *
 * Pattern: each cron registration site calls `cronRegistry.register({...})`
 * IMMEDIATELY after `cron.schedule(...)` returns. The registry is purely
 * in-memory (boot-time registration is the canonical source of truth — no
 * cross-process persistence needed; if process restarts, all schedules
 * re-register from their boot hooks).
 *
 * Mode-A coverage (Langston Step-1 ACK note 1): the smoke test consumes this
 * registry to detect "arming failed" (next_fire is null OR past). Mode-B
 * coverage: fire-evidence verifier consumes the registry to detect "tick loop
 * died mid-lifetime" (last fire is older than expected_by).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { ScheduledTask } from 'node-cron';

export interface RegisteredCronJob {
  /** Unique name for this schedule. Must match the task_name written to
   * scheduled_tasks_audit on fire. Snake_case convention. Examples:
   * 'weekend_shutdown', 'xstock_universe_discovery_cron'. */
  name: string;
  /** node-cron ScheduledTask handle, used by smoke test for getNextRun(). */
  task: ScheduledTask;
  /** The cron expression string used at registration. */
  expression: string;
  /** Timezone string (e.g., 'America/New_York', 'UTC'). */
  timezone: string;
  /** Computed natural interval in seconds (e.g., 300 for the every-5-minutes
   * expression, 3600 for hourly, 86400 for daily). Used by fire-evidence
   * verifier to compute expected_by = lastFire + intervalSeconds × 1.5. */
  intervalSeconds: number;
  /** True if the schedule is actually active. If a registration site is
   * env-gated (e.g., FORMULA_AUDIT_ENABLED=false), it should NOT register
   * — but we leave the optional flag for diagnostic purposes if needed. */
  enabled: boolean;
}

const registry = new Map<string, RegisteredCronJob>();

/**
 * Register a node-cron schedule. Idempotent — calling twice with the same
 * name logs a warning and ignores the second call (preserves first
 * registration). Each schedule MUST have a unique name.
 */
export function register(job: RegisteredCronJob): void {
  if (registry.has(job.name)) {
    console.warn(
      `[CRON-REGISTRY] Duplicate registration for job=${job.name} — ignoring second call. ` +
      `First registration retained.`,
    );
    return;
  }
  registry.set(job.name, job);
  console.log(
    `[CRON-REGISTRY] Registered job=${job.name} expr=${job.expression} ` +
    `tz=${job.timezone} interval_seconds=${job.intervalSeconds}`,
  );
}

/** Return all registered cron jobs. Used by smoke test + verifier. */
export function getAll(): RegisteredCronJob[] {
  return Array.from(registry.values());
}

/** Return a single registered cron job by name. */
export function get(name: string): RegisteredCronJob | undefined {
  return registry.get(name);
}

/** Test-only: clear the registry. */
export function _resetForTest(): void {
  registry.clear();
}

/** Test-only: count of registered jobs. */
export function _countForTest(): number {
  return registry.size;
}

export const cronRegistry = { register, getAll, get, _resetForTest, _countForTest };
