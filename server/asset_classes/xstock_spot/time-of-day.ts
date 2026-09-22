/**
 * xstock_spot — Time-of-day classifier
 *
 * Derives a `TimeOfDayClass` label from any UTC timestamp using NYSE clock
 * (America/New_York, DST-aware via Intl.DateTimeFormat). Observation-grade
 * sibling feature for B.1a archive replay + future post-hoc analysis. NOT
 * used for live gating — passes through to telemetry only.
 *
 * NO IMPORTS ALLOWED (leaf module by design — same pattern as
 * regime-thresholds.ts). Adding imports here would risk introducing an
 * import cycle.
 *
 * B-XSTOCK-CALIB B.1 sub-batch §6.1 (sibling feature S1).
 */

export type TimeOfDayClass =
  | 'pre_open'
  | 'open_hour'
  | 'mid_morning'
  | 'lunch'
  | 'mid_afternoon'
  | 'close_hour'
  | 'after_close';

const NY_TZ_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Classify a UTC timestamp into one of seven NYSE-clock buckets.
 *
 * Bucket boundaries (Eastern Time, DST-adjusted by Intl.DateTimeFormat):
 *   pre_open       — before 09:30 ET
 *   open_hour      — 09:30 to 10:30 ET
 *   mid_morning    — 10:30 to 12:00 ET
 *   lunch          — 12:00 to 13:30 ET
 *   mid_afternoon  — 13:30 to 15:00 ET
 *   close_hour     — 15:00 to 16:00 ET
 *   after_close    — after 16:00 ET (xStock 24/5 — non-zero traffic continues)
 *
 * @param utcTs - JavaScript Date or millisecond epoch
 * @returns TimeOfDayClass label
 */
export function getTimeOfDayClass(utcTs: Date | number): TimeOfDayClass {
  const d = utcTs instanceof Date ? utcTs : new Date(utcTs);
  const parts = NY_TZ_FORMATTER.formatToParts(d);
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === 'hour') hour = Number(p.value);
    else if (p.type === 'minute') minute = Number(p.value);
  }
  // Intl can emit "24" for midnight; normalize to 0.
  if (hour === 24) hour = 0;
  const minutesAfterMidnight = hour * 60 + minute;

  // ET bucket boundaries (in minutes after midnight)
  if (minutesAfterMidnight < 9 * 60 + 30) return 'pre_open';
  if (minutesAfterMidnight < 10 * 60 + 30) return 'open_hour';
  if (minutesAfterMidnight < 12 * 60) return 'mid_morning';
  if (minutesAfterMidnight < 13 * 60 + 30) return 'lunch';
  if (minutesAfterMidnight < 15 * 60) return 'mid_afternoon';
  if (minutesAfterMidnight < 16 * 60) return 'close_hour';
  return 'after_close';
}

/**
 * `8a-P4c` — the four NEW YORK TRADING SESSIONS the VTS xStock instrument buckets by (pre-registered in
 * `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4C_AUDIT_AND_PLAN.md` §B1). Distinct from the seven observation buckets
 * above: those split the regular day, these split the 24/5 week into the regimes a quote's age and spread differ by.
 *   regular   — 09:30 to 16:00 ET
 *   pre       — 04:00 to 09:30 ET
 *   after     — 16:00 to 20:00 ET
 *   overnight — 20:00 to 04:00 ET
 * No pooled rate across these is ever published (Langston, 2026-09-22): xStock quote quality is a mixture over them.
 */
export type XstockSession = 'regular' | 'pre' | 'after' | 'overnight';

export function getXstockSession(utcTs: Date | number): XstockSession {
  const d = utcTs instanceof Date ? utcTs : new Date(utcTs);
  const parts = NY_TZ_FORMATTER.formatToParts(d);
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === 'hour') hour = Number(p.value);
    else if (p.type === 'minute') minute = Number(p.value);
  }
  if (hour === 24) hour = 0;
  const m = hour * 60 + minute;
  if (m >= 9 * 60 + 30 && m < 16 * 60) return 'regular';
  if (m >= 4 * 60 && m < 9 * 60 + 30) return 'pre';
  if (m >= 16 * 60 && m < 20 * 60) return 'after';
  return 'overnight';
}
