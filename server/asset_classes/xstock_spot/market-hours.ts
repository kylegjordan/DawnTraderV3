/**
 * Xstock-spot market hours utility (B79).
 *
 * Kraken XStocks are tokenized 1:1 backed equities tracking ARCA-listed
 * underlyings. ARCA opens Sunday 22:00 UTC and closes Friday 22:00 UTC,
 * giving a ~24/5 schedule with a weekend gap.
 *
 * The VTS evaluation gate calls this on every xstock_spot signal — when
 * closed, the signal is skipped (early-return + counter increment) so VTS
 * does not write spurious shadow-mode rows for closed-market periods.
 *
 * NOT included in B79: US equity holidays (Thanksgiving, etc.) and
 * partially-shortened sessions. Both produce false-open results for a
 * handful of days/year. A future enhancement can override via a
 * module_constant `xstockMarketHoursOverride` (Langston Q5 answer); the
 * shape would be a list of (date, status) overrides consulted before this
 * default. Out of scope for B79.
 *
 * NO IMPORTS — leaf module by design (avoids cycles).
 */

/**
 * Returns true iff the xstock_spot market is open for trading at `now` (UTC).
 *
 * Schedule (ARCA-aligned, UTC):
 *   - CLOSED all day Saturday (UTC day 6)
 *   - CLOSED Friday from 22:00 UTC onward
 *   - CLOSED Sunday before 22:00 UTC
 *   - OPEN otherwise
 *
 * @param now - reference time. Defaults to `new Date()` for production calls.
 *              Tests inject a controlled clock for boundary verification.
 */
export function isXstockMarketOpenUTC(now: Date = new Date()): boolean {
  const day = now.getUTCDay();   // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const hour = now.getUTCHours();

  if (day === 6) return false;              // Saturday — fully closed
  if (day === 5 && hour >= 22) return false; // Friday after 22:00 UTC
  if (day === 0 && hour < 22) return false;  // Sunday before 22:00 UTC
  return true;
}
