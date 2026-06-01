/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-47 — Retention-sweep slicing helpers (pure, side-effect-free)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Extracted from b75-retention-sweep.ts so the whole-vs-sliced decision, UTC day
 * enumeration, day labelling, and the resume invariant guard are unit-testable
 * without importing the sweep script (which runs main() on import).
 *
 * Reference: B_NEW_47_SCOPE.md §8 + B_NEW_47_PRE_AUDIT.md
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Decide whole-vs-sliced by HOT (pg_total_relation_size) bytes vs the
 *  DB-governed threshold. At/above → per-day sliced; below → one object/month. */
export function decideSliceMode(
  hotBytes: number,
  sliceThresholdHotBytes: number,
): 'whole' | 'sliced' {
  return hotBytes >= sliceThresholdHotBytes ? 'sliced' : 'whole';
}

/** Enumerate UTC day-start Dates in [rangeStart, rangeEnd). Exact: 86,400,000 ms
 *  per UTC day (no DST in UTC). A start that is not a day boundary is floored to
 *  its UTC day. */
export function enumerateUtcDays(rangeStart: Date, rangeEnd: Date): Date[] {
  const days: Date[] = [];
  let cur = new Date(
    Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), rangeStart.getUTCDate()),
  );
  while (cur < rangeEnd) {
    days.push(new Date(cur));
    cur = new Date(cur.getTime() + 86_400_000);
  }
  return days;
}

/** 'YYYY-MM-DD' UTC label for a day-start Date. */
export function dayLabel(day: Date): string {
  return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(
    day.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Given the manifest labels already present for a (parent, month), classify the
 *  in-flight mode so a resume NEVER mixes a `YYYY-MM` object with `YYYY-MM-DD`
 *  slices (the invariant guard OVERRIDES the live DB threshold on resume).
 *  Throws if both exist (corrupt half-state). Returns null when nothing yet. */
export function deriveModeFromLabels(
  monthLabel: string,
  existingLabels: string[],
): 'whole' | 'sliced' | null {
  let hasMonth = false;
  let hasDay = false;
  for (const label of existingLabels) {
    if (label === monthLabel) hasMonth = true;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(label) && label.startsWith(`${monthLabel}-`)) hasDay = true;
  }
  if (hasMonth && hasDay) {
    throw new Error(
      `[B75 sweep] INVARIANT VIOLATION: both month '${monthLabel}' and day-slice labels exist — cannot resume safely`,
    );
  }
  if (hasMonth) return 'whole';
  if (hasDay) return 'sliced';
  return null;
}
