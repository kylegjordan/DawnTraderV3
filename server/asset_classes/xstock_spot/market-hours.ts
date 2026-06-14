/**
 * Xstock-spot market hours utility.
 *
 * Schedule per empirical Kraken WS-equities feed reality (verified B-NEW-36
 * sub-batch (c) Q9, 2026-05-20 — all 10 previously-designated "extended-hours"
 * names confirmed ZERO weekend bucket activity):
 *
 *   - **All xStocks closed Friday 8PM ET → Sunday 8PM ET** (48-hour weekend
 *     window).
 *   - **All xStocks open Sunday 8PM ET → Friday 8PM ET** (120-hour open
 *     window).
 *
 * The previously-marked "24/7" Phase-1 names (AAPL, CRCL, GLD, GOOGL, HOOD,
 * MSTR, NVDA, QQQ, SPY, TSLA) had been treated as bypassing an "ARCA-aligned"
 * schedule for the other ~255 symbols. The bypass was empirically meaningless:
 * Kraken's WS-equities feed carries no weekend price activity for ANY xStock
 * regardless of designation, AND the off-ARCA-hours scanner universe was
 * silently shrinking to those 10 names while the other ~255 still had live
 * pre-market and after-hours data (verified B-NEW-36 §0.5 Findings 1+2). The
 * fix here lets the scanner consume off-ARCA-hours data for the full universe.
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
 *   B79: initial implementation (UTC math, ARCA-only).
 *   B79.0c: added per-symbol predicate + XSTOCK_SPOT_24_7_SYMBOLS bypass.
 *   B79.0L (2026-05-10): added unified Fri 8PM ET → Sun 8PM ET closed window
 *     applied to ALL names including the Phase-1 set. Resolves #89.
 *   B-NEW-36 sub-batch (c) (2026-05-20): retired the XSTOCK_SPOT_24_7_SYMBOLS
 *     designation. Predicate now returns identical results for all symbols;
 *     symbol parameter kept in the signature for backward compat with all
 *     call sites but no longer consulted internally.
 */

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
 * Returns true iff `now` falls within the unified xStock weekend close window
 * (Friday 20:00 ET → Sunday 20:00 ET).
 *
 * P19-B4a (C3): exported — the equity-feed silent-stall watchdog gates on this
 * (the 24/5 feed-live window) so it watches for stalls whenever the feed SHOULD
 * be live and only sleeps across the weekend close.
 */
export function isInXstockWeekendClose(now: Date): boolean {
  const { weekday, hour } = getETParts(now);
  if (weekday === 'Fri' && hour >= 20) return true;
  if (weekday === 'Sat') return true;
  if (weekday === 'Sun' && hour < 20) return true;
  return false;
}

/**
 * Returns true iff the xstock_spot market is open at `now` (UTC).
 *
 * Empirical reality (B-NEW-36 sub-batch (c), 2026-05-20):
 *   - All xStocks open Sun 8PM ET → Fri 8PM ET.
 *   - All xStocks closed Fri 8PM ET → Sun 8PM ET.
 *   - Symbol-specific behavior eliminated; predicate returns identical result
 *     for all xStock symbols.
 *
 * @param symbol - xstock_spot symbol. Kept in the signature for backward
 *                 compatibility with all call sites; no longer consulted
 *                 internally because empirical evidence showed all xStocks
 *                 share identical hours.
 * @param now - reference time. Defaults to `new Date()` for production calls.
 *              Tests inject a controlled clock for boundary verification.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isXstockMarketOpenUTC(symbol: string, now: Date = new Date()): boolean {
  return !isInXstockWeekendClose(now);
}

/**
 * P19-B4a (C3) — is `now` inside the xStock ACTIVE-FILL LIQUID WINDOW (ET)?
 *
 * ⚠️ This is a FILL-QUALITY LIQUIDITY GATE, **not** a market-hours claim. xStocks
 * trade 24/5 (CLAUDE.md rule 17) and the scanner + VTS ingest/learn around the
 * clock — this predicate ONLY gates the moment of placing an *active fill*, to the
 * window where the underlying equity reference shows real price discovery
 * (measured P19-B4a from the Fri 2026-06-12 session: `last` moved on 12–22% of
 * snapshots during US regular hours vs only 2–7% pre-/after-hours — a fresh
 * snapshot outside that window is a stale, untradeable price). Deliberately NOT
 * named `…MarketOpen…` / `…Session…` so a future reader does not re-litigate
 * rule 17 (Langston C3 review framing nit).
 *
 * Pure + testable: the open/close ET-minute bounds are DB-resolved by the caller
 * (module_constants `xstock_fill_safety`) and passed in; this function does no I/O.
 *
 * @param openMinEt  - inclusive window open, minutes since ET-midnight (570 = 09:30)
 * @param closeMinEt - exclusive window close, minutes since ET-midnight (960 = 16:00)
 * @param now        - reference time (defaults to `new Date()`); tests inject a clock.
 */
export function isXstockLiquidFillWindowET(
  openMinEt: number,
  closeMinEt: number,
  now: Date = new Date(),
): boolean {
  if (isInXstockWeekendClose(now)) return false;
  const { hour, minute } = getETParts(now);
  const minutesEt = hour * 60 + minute;
  return minutesEt >= openMinEt && minutesEt < closeMinEt;
}
