/**
 * Xstock-spot market hours utility.
 *
 * Schedule per Kyle directive 2026-05-10 (B79.0L correction):
 *   - **All xStocks closed Friday 8PM ET → Sunday 8PM ET** (48-hour weekend
 *     window — applies to ALL xStocks including the previously-marked
 *     "24/7" Phase-1 names).
 *
 * Within the 120-hour open window (Sun 8PM ET → Fri 8PM ET):
 *   - **Phase-1 extended-hours names** (`XSTOCK_SPOT_24_7_SYMBOLS` —
 *     AAPL, CRCL, GLD, GOOGL, HOOD, MSTR, NVDA, QQQ, SPY, TSLA): trade
 *     CONTINUOUSLY. NOT actually 24/7 despite the constant name; closed
 *     during the weekend window above. Constant name retained for stability
 *     across many call sites; future cosmetic rename is queued.
 *   - **All other xStocks (ARCA-aligned):** follow ARCA schedule —
 *     extended-hours close at 8PM ET daily, reopen at 4AM ET next weekday
 *     (premarket). Approximated here as: closed Sat all day, closed Fri
 *     after 8PM ET, closed Sun before 8PM ET, otherwise open.
 *
 * DST handling: uses `Intl.DateTimeFormat` with `timeZone: 'America/New_York'`
 * which automatically tracks the EST/EDT transition (March/November).
 *
 * NOT included: US equity holidays (Thanksgiving, etc.) and partially-
 * shortened sessions. Both produce false-open results for a handful of
 * days/year. A future enhancement can override via a module_constant
 * `xstockMarketHoursOverride`; the shape would be a list of (date, status)
 * overrides consulted before this default.
 *
 * History:
 *   B79: initial implementation (UTC math, ARCA-only)
 *   B79.0c: added per-symbol predicate + XSTOCK_SPOT_24_7_SYMBOLS bypass
 *   B79.0L (2026-05-10): corrected to Fri 8PM ET → Sun 8PM ET closed window
 *     applied to ALL names including the Phase-1 set. Resolves #89
 *     (silence-on-weekends was correctly intentional market closure, not
 *     a Kraken feed bug — B79.0k investigation was based on a misframing).
 */

import { XSTOCK_SPOT_24_7_SYMBOLS } from '../../../shared/asset-classes.js';

/**
 * Normalize a symbol to the canonical `BASE/USD` form used by
 * XSTOCK_SPOT_SYMBOLS / XSTOCK_SPOT_24_7_SYMBOLS. Belt-and-suspenders for
 * any caller that might pass Kraken-pair-form `TSLAxUSD` or bare `TSLAx`
 * (Langston Q2 review). Idempotent on already-canonical input.
 */
function normalizeXstockSymbol(symbol: string): string {
  if (!symbol) return symbol;
  // Already canonical?
  if (symbol.includes('/')) {
    // Strip "x" suffix on base if present (TSLAx/USD → TSLA/USD).
    return symbol.replace(/^([A-Z]+)x\/(USD[A-Z]?)$/i, '$1/$2');
  }
  // Kraken-pair form: TSLAxUSD or AAPLxUSDC. Mandatory lowercase `x` —
  // do NOT make it optional. With case-insensitive `i` flag and `x?`, the
  // greedy `[A-Z]+` would consume the `x` itself (Langston Step 4 F1) and
  // produce wrong group: `TSLAxUSD` → group1=`TSLAx` instead of `TSLA`.
  // The `x` is REQUIRED here (we're in the Kraken-pair branch precisely
  // because canonical `BASE/USD` was already handled above).
  const krakenMatch = symbol.match(/^([A-Z]+)x(USD[A-Z]?)$/i);
  if (krakenMatch) {
    return `${krakenMatch[1].toUpperCase()}/${krakenMatch[2].toUpperCase()}`;
  }
  return symbol;
}

/**
 * B79.0L: extract ET weekday + 24h-hour from a UTC `now` via
 * `Intl.DateTimeFormat`. DST-aware (handles EST ↔ EDT automatically).
 *
 * Returns:
 *   - weekday: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
 *   - hour: 0-23 (24-hour clock in ET)
 *   - minute: 0-59
 */
function getETParts(now: Date): { weekday: string; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '0';
  // `Intl.DateTimeFormat` with hour12=false sometimes emits "24" instead of
  // "00" at midnight (Node version-dependent). Normalize.
  let hour = parseInt(hourStr, 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(minuteStr, 10);
  return { weekday, hour, minute };
}

/**
 * B79.0L: returns true iff `now` falls within the global xStock weekend
 * close window (Friday 20:00 ET → Sunday 20:00 ET).
 */
function isInXstockWeekendClose(now: Date): boolean {
  const { weekday, hour } = getETParts(now);
  if (weekday === 'Fri' && hour >= 20) return true;
  if (weekday === 'Sat') return true;
  if (weekday === 'Sun' && hour < 20) return true;
  return false;
}

/**
 * Returns true iff the xstock_spot market is open for `symbol` at `now` (UTC).
 *
 * Schedule (B79.0L):
 *   - Global weekend close (ALL xStocks): Friday 20:00 ET → Sunday 20:00 ET
 *   - Outside the weekend close:
 *     - Extended-hours names (XSTOCK_SPOT_24_7_SYMBOLS): always OPEN
 *     - All other xStocks (ARCA-aligned): closed Fri after 20:00 ET,
 *       Sat all day, Sun before 20:00 ET (subsumed by the global close)
 *       — open the rest of the work week
 *
 * @param symbol - xstock_spot symbol. REQUIRED (B79.0c rev 2 / Langston Q4):
 *                 fail-loud rather than silent ARCA-only fallback. Accepts
 *                 canonical `BASE/USD` form preferred; Kraken-pair forms
 *                 like `TSLAxUSD` and bare `TSLAx` are also handled.
 * @param now - reference time. Defaults to `new Date()` for production calls.
 *              Tests inject a controlled clock for boundary verification.
 */
export function isXstockMarketOpenUTC(symbol: string, now: Date = new Date()): boolean {
  // B79.0L: global weekend close applies to ALL xStocks first.
  if (isInXstockWeekendClose(now)) return false;

  const normalized = normalizeXstockSymbol(symbol);
  // Outside weekend close: extended-hours names are open continuously.
  if (XSTOCK_SPOT_24_7_SYMBOLS.has(normalized)) return true;

  // Non-extended-hours (ARCA-aligned) names: existing B79/B79.0c UTC math
  // (Fri 22:00 UTC close) is MORE restrictive on Friday than the unified
  // weekend window's Fri 20:00 ET (= 22:00 EDT / 23:00 EST UTC) — keep it.
  // Sunday reopen previously used Sun 22:00 UTC (= 18:00 EDT = 6 PM EDT)
  // which was wrong by ~2 hours per Kyle directive 2026-05-10. The unified
  // weekend window already returned false above for any Sunday before
  // 20:00 ET, so by the time control reaches this point on a Sunday, it's
  // already after 20:00 ET = market is open per the unified rule.
  // Saturday all-day-closed is also fully covered by the unified weekend
  // window above (Sat ET = always inside the weekend window).
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 5 && hour >= 22) return false; // Friday 22:00 UTC onward (B79/B79.0c, more restrictive than unified Fri 20:00 ET)
  return true;
}
