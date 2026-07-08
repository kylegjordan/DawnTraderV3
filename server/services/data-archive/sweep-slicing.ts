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

// ─────────────────────────────────────────────────────────────────────────────
// B-STORAGE-HARDEN Wave D (OBJ-3) — daily-vs-monthly partition classification
// ─────────────────────────────────────────────────────────────────────────────
// `xstock_spot_ticker_snap` transitions from MONTHLY (`…_YYYY_MM`) to DAILY
// (`…_YYYY_MM_DD`) RANGE partitions at a month-boundary cutover so a true
// rolling-30-day hot window is reclaimable one day at a time. The retention
// sweep therefore has to recognize BOTH child-name shapes and tier each on the
// right granularity. This classification is the load-bearing parse — extracted
// here (pure, no DB) so both shapes are golden-tested.

export interface ClassifiedPartition {
  kind: 'daily' | 'monthly';
  partitionLabel: string; // 'YYYY-MM-DD' (daily) or 'YYYY-MM' (monthly)
  rangeStart: Date;       // inclusive lower bound (UTC midnight)
  rangeEnd: Date;         // exclusive upper bound (UTC midnight)
}

/**
 * Classify a partition child relname into its date range + label.
 *
 * DAILY (`…_YYYY_MM_DD`) is tested FIRST, before MONTHLY (`…_YYYY_MM`), so a
 * daily name's trailing `_DD` can never be mis-read as a month (Langston Wave-D
 * req #4 — a daily-as-monthly mis-parse would tier a single day as if it were a
 * whole month = silent mis-tier / data-loss risk). Both patterns are anchored:
 * a leading `_` (so digits inside the table name aren't captured) and a trailing
 * `$`. Returns null for a name that is neither shape OR encodes an impossible
 * calendar date (e.g. `_02_30`, `_13_01`).
 */
export function classifyPartition(childName: string): ClassifiedPartition | null {
  const daily = /_(\d{4})_(\d{2})_(\d{2})$/.exec(childName);
  if (daily) {
    const year = Number(daily[1]);
    const month = Number(daily[2]);
    const day = Number(daily[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const rangeStart = new Date(Date.UTC(year, month - 1, day));
    const rangeEnd = new Date(Date.UTC(year, month - 1, day + 1));
    // Reject an impossible date that JS silently rolled over (e.g. `_02_30` →
    // Mar 2): the round-tripped fields must match the parsed ones exactly.
    if (
      rangeStart.getUTCFullYear() !== year ||
      rangeStart.getUTCMonth() !== month - 1 ||
      rangeStart.getUTCDate() !== day
    ) {
      return null;
    }
    return { kind: 'daily', partitionLabel: `${daily[1]}-${daily[2]}-${daily[3]}`, rangeStart, rangeEnd };
  }

  const monthly = /_(\d{4})_(\d{2})$/.exec(childName);
  if (monthly) {
    const year = Number(monthly[1]);
    const month = Number(monthly[2]);
    if (month < 1 || month > 12) return null;
    return {
      kind: 'monthly',
      partitionLabel: `${monthly[1]}-${monthly[2]}`,
      rangeStart: new Date(Date.UTC(year, month - 1, 1)),
      rangeEnd: new Date(Date.UTC(year, month, 1)),
    };
  }

  return null;
}

/**
 * Is a classified partition eligible to tier (write-sealed AND older than
 * retention)?
 *  - monthly: its whole month is strictly before the cutoff month
 *    (`rangeStart < cutoffMonthStart`) — unchanged legacy semantics; a monthly
 *    partition tiers only once its entire month is in the past.
 *  - daily: the ENTIRE day is at/older than the day-granular retention cutoff
 *    (`rangeEnd <= cutoff`), so every row the partition can hold is ≥ retention
 *    old — a true rolling-N-day window. Keying on rangeEnd (the next-day
 *    boundary), NOT rangeStart, guarantees the newest possible row in the day is
 *    past retention before we tier + drop.
 */
export function isPartitionEligible(
  p: ClassifiedPartition,
  cutoff: Date,
  cutoffMonthStart: Date,
): boolean {
  if (p.kind === 'daily') return p.rangeEnd.getTime() <= cutoff.getTime();
  return p.rangeStart.getTime() < cutoffMonthStart.getTime();
}
