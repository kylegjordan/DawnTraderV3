/**
 * B79 — Symbol normalization utility (Langston rev 3 §G).
 *
 * Cross-exchange / cross-asset-class symbol forms drift over time. The
 * scanner, archiver, telemetry, and SQE all need a single canonical form
 * per (symbol, exchange, assetClass) tuple — otherwise downstream lookups
 * miss-match and produce silent gaps.
 *
 * This module is the SINGLE LOOKUP boundary for symbol-form translation.
 *
 * Examples handled today:
 *   - Kraken Spot Crypto: `XXBTZUSD` (REST raw) vs `BTC/USD` (canonical) vs
 *     `XBT/USD` (display alt).
 *   - Kraken xStocks (B79): `AAPLx/USD` (Kraken Pro display) vs `AAPL/USD`
 *     (WS feed = canonical) vs `AAPL.X` (alternative form some sources use).
 *   - Kraken Futures (B74): `PI_XBTUSD` (REST) vs `PF_BTCUSD` (display).
 *
 * The canonical form is `<BASE>/<QUOTE>` uppercase, where BASE is the
 * common ticker (no x-suffix, no curly Z/X prefix, no PI_/PF_ prefix).
 *
 * Adding a new asset class:
 *   - Extend the dispatch in `normalize()` with a case for the asset_class.
 *   - Document the canonical form for that asset class in this header.
 *
 * Design notes:
 *   - Pure function — no module state, no I/O. Safe to call from anywhere.
 *   - Idempotent — `normalize(normalize(x))` === `normalize(x)`.
 *   - Fail-soft: unknown forms return the input symbol unchanged with a
 *     debug log so audits surface the gap. Strict-throw mode (`{ strict: true }`)
 *     for callers that want a hard error on unrecognized input.
 */

import { ASSET_CLASSES, CRYPTO_SPOT_CANONICAL, QUOTE_LEN_MIN, QUOTE_LEN_MAX, type AssetClass } from '../../shared/asset-classes.js';

// P19-B6.5f (reorg-B1): the xStock quote-length bounds below are built from the shared
// QUOTE_LEN SSOT (not a hardcoded {3,4}) so they widen in lockstep with the crypto canonical
// — no class-to-class drift if a 5-char-quote xStock ever appears.
const _XSTOCK_CANON_RE = new RegExp(`^[A-Z]{1,5}\\/[A-Z]{${QUOTE_LEN_MIN},${QUOTE_LEN_MAX}}$`);
const _XSTOCK_DISP_RE = new RegExp(`^([A-Z]{1,5})X\\/([A-Z]{${QUOTE_LEN_MIN},${QUOTE_LEN_MAX}})$`);

export interface NormalizeOptions {
  /** When true, throw on unrecognized symbols. Default false (fail-soft). */
  strict?: boolean;
}

let _unknownFormWarnCount = 0;

/**
 * Normalize a symbol to canonical form `<BASE>/<QUOTE>` (uppercase) given
 * its asset class. Returns the canonical form, or the input unchanged for
 * unrecognized inputs (unless `strict: true`).
 */
export function normalize(
  symbol: string,
  assetClass: AssetClass,
  options: NormalizeOptions = {},
): string {
  if (!symbol) return symbol;
  const trimmed = symbol.trim();

  switch (assetClass) {
    case ASSET_CLASSES.CRYPTO_SPOT:
      return normalizeCryptoSpot(trimmed, options);
    case ASSET_CLASSES.XSTOCK_SPOT:
      return normalizeXstockSpot(trimmed, options);
    default:
      // Unknown asset_class — defensively return the input unchanged.
      // Adding a new asset class here is the documented extension point.
      return trimmed;
  }
}

/**
 * Crypto_spot canonicalization. Conservative — defers to existing
 * canonical forms used by `shared/asset-classes.ts`. Returning the input
 * if it already looks canonical (BASE/QUOTE) is the common case.
 */
function normalizeCryptoSpot(symbol: string, options: NormalizeOptions): string {
  // Already canonical? `BASE/QUOTE` — uppercase letters/digits, slash.
  // P19-B3a (#139): SSOT — the SAME regex object the classifier uses, built from
  // CRYPTO_SPOT_BASE_MAX_LEN in shared/asset-classes.ts. Langston C1: one constant,
  // not two synced literals → no drift possible between this gate and the classifier.
  if (CRYPTO_SPOT_CANONICAL.test(symbol)) {
    return symbol.toUpperCase();
  }

  // Kraken raw forms — `XXBTZUSD`, `SOLUSD`, etc. Heuristic mapping for
  // the most common cases. Full normalization is in
  // `server/services/utils/symbol-canonicalizer.ts` (legacy module);
  // this module wraps that consumer-facing intent. For B79 we don't
  // duplicate the legacy logic — we recommend callers continue to use
  // the legacy canonicalizer for crypto raw forms while this utility
  // covers display-form -> canonical for xstocks.
  return _maybeFailSoft(symbol, options, 'crypto_spot raw form not handled — use server/services/utils/symbol-canonicalizer.ts');
}

/**
 * Xstock_spot canonicalization. Canonical = `<TICKER>/USD` (no x-suffix).
 * Display form = `<TICKER>x/USD` (with x-suffix). WS feed emits canonical.
 */
function normalizeXstockSpot(symbol: string, options: NormalizeOptions): string {
  const upper = symbol.toUpperCase();

  // Already canonical? `BASE/QUOTE`, no x-suffix. (quote bound from the shared QUOTE_LEN SSOT)
  if (_XSTOCK_CANON_RE.test(upper)) {
    return upper;
  }

  // Display form `BASEx/QUOTE` -> strip x-suffix.
  // Match: BASEx/QUOTE OR BASEX/QUOTE (case-insensitive after upper).
  // E.g. `AAPLX/USD` -> `AAPL/USD`.
  const dispMatch = upper.match(_XSTOCK_DISP_RE);
  if (dispMatch) {
    return `${dispMatch[1]}/${dispMatch[2]}`;
  }

  // Alternative form `BASE.X` -> `BASE/USD` (default quote).
  const altMatch = upper.match(/^([A-Z]{1,5})\.X$/);
  if (altMatch) {
    return `${altMatch[1]}/USD`;
  }

  return _maybeFailSoft(symbol, options, 'xstock_spot form not recognized');
}

function _maybeFailSoft(symbol: string, options: NormalizeOptions, reason: string): string {
  if (options.strict) {
    throw new Error(`[symbol-normalize] strict-mode failure: ${reason} (input='${symbol}')`);
  }
  _unknownFormWarnCount++;
  if (_unknownFormWarnCount <= 5) {
    console.log(`[B79][SYMBOL_NORMALIZE_UNKNOWN] ${reason} input='${symbol}' (warn-count=${_unknownFormWarnCount})`);
  } else if (_unknownFormWarnCount === 6) {
    console.log('[B79][SYMBOL_NORMALIZE_UNKNOWN] further unknown-form warnings suppressed');
  }
  return symbol;
}
