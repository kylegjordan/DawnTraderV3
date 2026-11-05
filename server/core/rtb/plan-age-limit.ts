/**
 * `B-ENTRY-GATE` (`#1224`) increment B, P11 (scope OBJ-11; pre-audit r10, r13) — THE STALE-PLAN LIMIT AT PROMOTION.
 *
 * What it bounds: the age of the plan since it was last RESTATED (`now − queuedAt`; `queuedAt` resets on every re-issue,
 * `ready_to_buy_service.ts`, newest-wins `#1190`). Age since FIRST issue is not recoverable — `firstQueuedAt` is on 0 of
 * 1,600 `closed_trades` rows (Langston, all-time) — so this is the only age there is.
 *
 * ⛔ SHIPPED WITH NO VALUE. The setting `entry_gate.rtb_plan_max_age_ms` is read per class and NO ROW IS SEEDED, so the
 * limit is OFF and says so. Reason of record (Langston r13): age does not separate outcome anywhere in the data — every
 * xStock band sits between −$17 and +$0.5 on n=15-57 at a flat ~15 % win rate, and crypto's net-positive bands are in the
 * middle, not at an end. The value is withdrawn rather than guessed (§9.4 disposition 5); seeding one is a later decision
 * on new evidence, and its likely yield is fewer dead rests, not win rate.
 * A row that exists but is not a positive finite number is NOT treated as off: it refuses the promotion loudly (no
 * fallback for a DB-governed setting).
 */
export type PlanAgeDecision = 'off' | 'fresh' | 'stale' | 'invalid_limit' | 'age_unknown';

export function decidePlanAge(i: { ageMs: number; limitMs: unknown }): PlanAgeDecision {
  if (i.limitMs === undefined) return 'off';
  const lim = typeof i.limitMs === 'number' ? i.limitMs : Number(i.limitMs);
  if (!(Number.isFinite(lim) && lim > 0)) return 'invalid_limit';
  if (!Number.isFinite(i.ageMs)) return 'age_unknown';
  return i.ageMs > lim ? 'stale' : 'fresh';
}
