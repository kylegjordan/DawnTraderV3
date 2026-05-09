/**
 * Xstock-spot market hours utility (B79 + B79.0c per-symbol 24/7).
 *
 * Kraken XStocks are tokenized 1:1 backed equities tracking ARCA-listed
 * underlyings. ARCA opens Sunday 22:00 UTC and closes Friday 22:00 UTC,
 * giving a ~24/5 schedule with a weekend gap.
 *
 * B79.0c (2026-05-09) — per-symbol predicate: a subset of xStocks announced
 * by Kraken on 2025-12-03 trade 24/7 (Phase 1: AAPL, CRCL, GLD, GOOGL, HOOD,
 * MSTR, NVDA, QQQ, SPY, TSLA — see XSTOCK_SPOT_24_7_SYMBOLS). For those
 * names this predicate returns true regardless of weekday/hour. For all
 * other xStocks it applies the ARCA 24/5 schedule.
 *
 * The VTS evaluation gate calls this on every xstock_spot signal — when
 * closed, the signal is skipped (early-return + counter increment) so VTS
 * does not write spurious shadow-mode rows for closed-market periods.
 *
 * NOT included: US equity holidays (Thanksgiving, etc.) and partially-
 * shortened sessions. Both produce false-open results for a handful of
 * days/year. A future enhancement can override via a module_constant
 * `xstockMarketHoursOverride` (Langston Q5 from B79); the shape would be
 * a list of (date, status) overrides consulted before this default.
 *
 * Imports: XSTOCK_SPOT_24_7_SYMBOLS from shared/asset-classes (single
 * dependency on a constant, no transitive cycles — shared/* is leaf).
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
 * Returns true iff the xstock_spot market is open for `symbol` at `now` (UTC).
 *
 * Schedule (ARCA-aligned, UTC):
 *   - 24/7 names (XSTOCK_SPOT_24_7_SYMBOLS): always OPEN.
 *   - All other xstocks:
 *     - CLOSED all day Saturday (UTC day 6)
 *     - CLOSED Friday from 22:00 UTC onward
 *     - CLOSED Sunday before 22:00 UTC
 *     - OPEN otherwise
 *
 * @param symbol - xstock_spot symbol. REQUIRED (B79.0c rev 2 / Langston Q4):
 *                 fail-loud rather than silent ARCA-only fallback. Accepts
 *                 canonical `BASE/USD` form preferred; Kraken-pair forms
 *                 like `TSLAxUSD` and bare `TSLAx` are also handled.
 * @param now - reference time. Defaults to `new Date()` for production calls.
 *              Tests inject a controlled clock for boundary verification.
 */
export function isXstockMarketOpenUTC(symbol: string, now: Date = new Date()): boolean {
  const normalized = normalizeXstockSymbol(symbol);
  if (XSTOCK_SPOT_24_7_SYMBOLS.has(normalized)) return true;

  const day = now.getUTCDay();   // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const hour = now.getUTCHours();

  if (day === 6) return false;              // Saturday — fully closed
  if (day === 5 && hour >= 22) return false; // Friday after 22:00 UTC
  if (day === 0 && hour < 22) return false;  // Sunday before 22:00 UTC
  return true;
}
