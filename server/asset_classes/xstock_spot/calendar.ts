/**
 * xstock_spot — Rebalance-day calendar
 *
 * Returns whether a given UTC timestamp falls on a known equity-index
 * rebalance day. Observation-grade sibling feature for B.1a archive replay
 * + future post-hoc analysis. NOT used for live gating — passes through to
 * telemetry only.
 *
 * Calendar sources (TS-resident for B.1; future batch may promote to
 * `module_constants.equity_calendar.rebalance_dates` jsonb for runtime
 * tunability + S&P add/delete intra-quarter updates):
 *   - Russell quarterly rebalance: last Friday of June / September /
 *     December / March (computed deterministically, no upstream calendar
 *     needed — pure math from the quarter boundary).
 *   - S&P 500 add/delete events: NOT seeded in this leaf (~5-day advance
 *     notice; would require an upstream feed adapter beyond B.1's scope).
 *
 * NO IMPORTS ALLOWED (leaf module by design — same pattern as
 * regime-thresholds.ts + time-of-day.ts).
 *
 * B-XSTOCK-CALIB B.1 sub-batch §6.3 (sibling feature S2).
 */

/**
 * Return true if the given UTC timestamp falls on the last Friday of
 * March / June / September / December in America/New_York timezone.
 *
 * **HEURISTIC PROXY, not the exact Russell or S&P rebalance schedule.**
 * The actual schedules are:
 *   - Russell annual reconstitution: last Friday of June only.
 *   - FTSE Russell quarterly reviews: separate cadence (Mar/Sep/Dec).
 *   - S&P 500 quarterly rebalance: third Friday of Mar/Jun/Sep/Dec
 *     (futures-expiry pattern), NOT last Friday.
 *
 * This proxy is acceptable for B.1 observation-grade sibling-feature
 * tagging: it captures the "end of quarter, weekly options expiry-like
 * structural noise" pattern that drives most of the equity-microstructure
 * effects we want to observe for. If Phase 19 paper trading shows the
 * feature has predictive value, a follow-on batch can wire a proper
 * FTSE/S&P calendar feed adapter and replace this proxy.
 *
 * @param utcTs - JavaScript Date or millisecond epoch
 * @returns true if last Friday of Mar/Jun/Sep/Dec in NY-tz, false otherwise
 */
export function isRebalanceDay(utcTs: Date | number): boolean {
  const d = utcTs instanceof Date ? utcTs : new Date(utcTs);

  // Get NY-local date components (DST-aware via Intl)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(d);
  let year = 0;
  let month = 0;
  let day = 0;
  let weekday = '';
  for (const p of parts) {
    if (p.type === 'year') year = Number(p.value);
    else if (p.type === 'month') month = Number(p.value);
    else if (p.type === 'day') day = Number(p.value);
    else if (p.type === 'weekday') weekday = p.value;
  }

  // Russell quarterly months: Jun (6), Sep (9), Dec (12), Mar (3)
  const russellMonths = new Set([3, 6, 9, 12]);
  if (!russellMonths.has(month)) return false;
  if (weekday !== 'Fri') return false;

  // Last Friday = no other Friday in the same month after this day.
  // Compute the last day of the month and walk back to the last Friday.
  // Use 12:00 UTC for the last-day Date so the NY-tz formatter doesn't shift
  // to the previous calendar day (which would happen with 00:00 UTC due to
  // the ET offset of -4h or -5h).
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDayDate = new Date(Date.UTC(year, month - 1, daysInMonth, 12));
  const lastDayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    weekday: 'short',
  });
  const lastWeekday = lastDayFmt.format(lastDayDate);
  // Map "Sun"=0..."Sat"=6
  const weekdayIdx: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const lastIdx = weekdayIdx[lastWeekday];
  // Days to subtract from last day of month to reach the last Friday
  let lastFridayDay: number;
  if (lastIdx >= 5) {
    // Last day is Fri (5) or Sat (6); back up to Friday.
    lastFridayDay = daysInMonth - (lastIdx - 5);
  } else {
    // Last day is Sun-Thu; back up further (skipping Sat).
    // Sun(0)→back 2 to Fri, Mon(1)→3, Tue(2)→4, Wed(3)→5, Thu(4)→6.
    lastFridayDay = daysInMonth - (lastIdx + 2);
  }

  return day === lastFridayDay;
}
