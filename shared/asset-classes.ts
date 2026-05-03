/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B69 — Asset Class as First-Class Schema Dimension
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Single source of truth for the asset-class taxonomy that flows through
 * scan → signal → trade → exit → archive uniformly. Replaces hardcoded
 * 'crypto_spot' literals scattered through the codebase. Adding a new asset
 * class going forward is a one-page runbook (`B69_NEW_ASSET_CLASS_RUNBOOK.md`),
 * not a cross-cutting code change.
 *
 * Per Kyle directive 2026-05-03 + Langston-approved scope cc-inbox #890 +
 * pre-audit cc-inbox #891.
 *
 * Three orthogonal dimensions encoded in the IDs:
 *   - Underlying:    crypto / equity / commodity / fx
 *   - Wrapper:       native / tokenized (Backed Finance / xWrapped)
 *   - Instrument:    spot / perpetual swap / dated futures
 *
 * The xstock_* prefix preserves the equity_spot / equity_futures names for
 * whenever real (non-tokenized) equities arrive — no naming collision later.
 *
 * 4 currently-active classes (scanned or trading) + 4 reserved-future entries
 * (registered now so the IDs are immutable; rows materialize when each class
 * goes live).
 *
 * Lives in `shared/` so server + client both import from one place.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

/** Const-as-enum pattern: object literal preserves the union-of-string-literals
 *  type, enabling typed lookups + exhaustiveness checks at the call site. */
export const ASSET_CLASSES = {
  // ─── Currently scanned / traded ─────────────────────────────────────────
  CRYPTO_SPOT:       'crypto_spot',
  CRYPTO_PERP:       'crypto_perp',
  XSTOCK_SPOT:       'xstock_spot',        // tokenized equity on Kraken spot
  XSTOCK_PERP:       'xstock_perp',        // tokenized equity perp on Kraken Futures
  // ─── Reserved for future (registered now, no rows yet) ──────────────────
  EQUITY_SPOT:       'equity_spot',        // real equities on a real exchange
  EQUITY_FUTURES:    'equity_futures',     // real dated equity-index futures
  COMMODITY_FUTURES: 'commodity_futures',  // real commodity futures
  FX_SPOT:           'fx_spot',            // foreign exchange spot
} as const;

export type AssetClass = typeof ASSET_CLASSES[keyof typeof ASSET_CLASSES];

/** Per-class metadata. Future fields (frictionTier, defaultFeeModel,
 *  defaultSlippageModel, sessionHours) documented but not wired in B69. */
export interface AssetClassMeta {
  id: AssetClass;
  displayName: string;
  defaultExchange: string;
  /** True if this class is scanned or trading today; false for reserved-future. */
  active: boolean;
  /** Archive table name from B74 pipeline; null when no archiver yet. */
  archiveOhlcTable: string | null;
  archiveTickerTable: string | null;
  /** UI badge color (Tailwind class fragment). Optional cosmetic hint. */
  badgeColor?: string;
  /** One-liner describing what this class is. */
  description: string;
}

export const ASSET_CLASS_REGISTRY: Record<AssetClass, AssetClassMeta> = {
  crypto_spot: {
    id: 'crypto_spot',
    displayName: 'Crypto Spot',
    defaultExchange: 'kraken',
    active: true,
    archiveOhlcTable: 'crypto_spot_ohlc_1m',
    archiveTickerTable: 'crypto_spot_ticker_snap',
    badgeColor: 'bg-orange-100 text-orange-800',
    description: 'Native cryptocurrency on a spot venue (BTC/USD, ETH/USD, etc.)',
  },
  crypto_perp: {
    id: 'crypto_perp',
    displayName: 'Crypto Perp',
    defaultExchange: 'kraken-futures',
    active: true,
    archiveOhlcTable: null, // not currently archived; B74 covers xstock_perp via PF_*X
    archiveTickerTable: null,
    badgeColor: 'bg-amber-100 text-amber-800',
    description: 'Native cryptocurrency perpetual swap contract',
  },
  xstock_spot: {
    id: 'xstock_spot',
    displayName: 'xStock Spot',
    defaultExchange: 'kraken-equities',
    active: true,
    archiveOhlcTable: 'equity_spot_ohlc_1m',     // legacy table name retained from B74
    archiveTickerTable: 'equity_spot_ticker_snap',
    badgeColor: 'bg-blue-100 text-blue-800',
    description: 'Tokenized equity (Backed Finance xStock) on Kraken spot (ws-equities.kraken.com)',
  },
  xstock_perp: {
    id: 'xstock_perp',
    displayName: 'xStock Perp',
    defaultExchange: 'kraken-futures',
    active: true,
    archiveOhlcTable: 'equity_perp_ohlc_1m',     // legacy table name retained from B74
    archiveTickerTable: 'equity_perp_ticker_snap',
    badgeColor: 'bg-indigo-100 text-indigo-800',
    description: 'Tokenized equity perpetual swap (PF_*XUSD on Kraken Futures)',
  },
  equity_spot: {
    id: 'equity_spot',
    displayName: 'Equity Spot',
    defaultExchange: 'unknown',
    active: false,
    archiveOhlcTable: null,
    archiveTickerTable: null,
    badgeColor: 'bg-emerald-100 text-emerald-800',
    description: 'Real (non-tokenized) equities on a real exchange (future)',
  },
  equity_futures: {
    id: 'equity_futures',
    displayName: 'Equity Futures',
    defaultExchange: 'unknown',
    active: false,
    archiveOhlcTable: null,
    archiveTickerTable: null,
    badgeColor: 'bg-teal-100 text-teal-800',
    description: 'Real dated equity-index futures (future)',
  },
  commodity_futures: {
    id: 'commodity_futures',
    displayName: 'Commodity Futures',
    defaultExchange: 'unknown',
    active: false,
    archiveOhlcTable: null,
    archiveTickerTable: null,
    badgeColor: 'bg-yellow-100 text-yellow-800',
    description: 'Real commodity futures contracts (future)',
  },
  fx_spot: {
    id: 'fx_spot',
    displayName: 'FX Spot',
    defaultExchange: 'unknown',
    active: false,
    archiveOhlcTable: null,
    archiveTickerTable: null,
    badgeColor: 'bg-slate-100 text-slate-800',
    description: 'Foreign exchange spot pairs (future)',
  },
};

/** Returns only asset classes that are currently scanned or trading.
 *  Used by UI filter dropdowns + dashboard rendering to hide reserved-future
 *  entries until they actually have data. */
export function getActiveAssetClasses(): AssetClass[] {
  return Object.values(ASSET_CLASSES).filter(
    (id) => ASSET_CLASS_REGISTRY[id].active,
  );
}

/** True iff `value` is a registered asset-class ID. */
export function isValidAssetClass(value: string): value is AssetClass {
  return value in ASSET_CLASS_REGISTRY;
}

// ─── Symbol-pattern matchers ────────────────────────────────────────────────
//
// Per Langston cc-inbox #890 O.1 + #891 D.5: tighter regex anchors so xstock
// patterns can't false-positive on crypto edge cases. Patterns operate on
// EITHER raw Kraken symbol form OR canonical (BASE/QUOTE) form — caller
// decides which to pass in. Best practice: pass RAW symbol at INSERT sites
// (where it's still raw from the data source) so the PF_*XUSD marker is
// preserved for xstock_perp detection. Once stored on a row, downstream
// consumers read assetClass from the row, never re-resolve.

/** xStock perp on Kraken Futures: `PF_<TICKER>XUSD` raw form.
 *  Tighter anchor: ticker is 2-6 capital letters; quote is USD/EUR/GBP. */
const XSTOCK_PERP_RAW = /^PF_[A-Z]{2,6}X(USD|EUR|GBP)$/;

/** xStock spot display form (Kraken Pro): `<TICKER>x/<QUOTE>`. This form
 *  appears in Kraken Pro UI only — the WS feed at ws-equities.kraken.com uses
 *  plain `<TICKER>/<QUOTE>` (e.g., AAPL/USD, not AAPLx/USD). Therefore xstock
 *  spot detection CANNOT rely on the symbol alone — it requires the exchange
 *  context. This pattern is kept for documentation + optional explicit tagging. */
const XSTOCK_SPOT_DISPLAY = /^[A-Z]{2,5}x\/[A-Z]{3,4}$/;

/** Crypto spot canonical form: `<BASE>/<QUOTE>`, all uppercase. */
const CRYPTO_SPOT_CANONICAL = /^[A-Z0-9]{2,10}\/[A-Z0-9]{3,4}$/;

/** Crypto spot Kraken raw form 1: `X<BASE>Z<QUOTE>` (e.g., XXBTZUSD). */
const CRYPTO_SPOT_KRAKEN_RAW_1 = /^X[A-Z0-9]+Z(USD|USDT|EUR|GBP|JPY|CAD|AUD|CHF)$/;

/** Crypto spot Kraken raw form 2: `<BASE><QUOTE>` for newer pairs (e.g., SOLUSD). */
const CRYPTO_SPOT_KRAKEN_RAW_2 = /^[A-Z]{3,5}(USD|USDT|EUR|GBP|JPY|CAD|AUD|CHF)$/;

/**
 * Resolve the asset class for a (symbol, exchange) pair.
 *
 * Best practice: call at INSERT sites with the RAW symbol from the data
 * source. The raw form preserves disambiguating markers (PF_ prefix for
 * xstock_perp, lowercase x suffix for xstock_spot) that the canonicalizer
 * may strip. Once stored on a row, downstream consumers should read
 * `assetClass` from the row, not re-resolve.
 *
 * THROWS on unknown symbol pattern (Langston B.2 + Kyle §11 no-silent-defaults
 * preference). Use `safeResolveAssetClass` for caller-protected variant that
 * returns null on failure so PM2 stays up on a single bad symbol.
 *
 * @param symbol - Symbol in raw Kraken or canonical BASE/QUOTE form.
 * @param exchange - 'kraken' (spot) or 'kraken-futures' (perp).
 * @returns Resolved AssetClass.
 * @throws if no pattern matches.
 */
export function resolveAssetClass(symbol: string, exchange: string): AssetClass {
  if (!symbol) {
    throw new Error(`[B69][resolver] empty symbol; exchange=${exchange}`);
  }

  // Branch on exchange first — spot vs futures is the strongest signal.
  if (exchange === 'kraken-futures') {
    // xstock_perp: PF_<TICKER>XUSD raw form (X-marker before quote = tokenized).
    if (XSTOCK_PERP_RAW.test(symbol)) return ASSET_CLASSES.XSTOCK_PERP;
    // crypto_perp: any other futures symbol (PF_XBTUSD, PF_ETHUSD, FI_*, PI_*, etc.)
    return ASSET_CLASSES.CRYPTO_PERP;
  }

  // xStock spot: determined entirely by exchange context. Symbols on
  // ws-equities.kraken.com use plain BASE/QUOTE format (AAPL/USD) —
  // indistinguishable from crypto by symbol alone.
  if (exchange === 'kraken-equities') {
    return ASSET_CLASSES.XSTOCK_SPOT;
  }

  if (exchange === 'kraken') {
    // Check for explicit xstock_spot display form (AAPLx/USD) — optional
    // path if caller passes the Kraken Pro display format.
    if (XSTOCK_SPOT_DISPLAY.test(symbol)) return ASSET_CLASSES.XSTOCK_SPOT;
    // crypto_spot: canonical BASE/QUOTE (uppercase).
    if (CRYPTO_SPOT_CANONICAL.test(symbol)) return ASSET_CLASSES.CRYPTO_SPOT;
    // crypto_spot: Kraken raw forms (XXBTZUSD or SOLUSD).
    if (CRYPTO_SPOT_KRAKEN_RAW_1.test(symbol)) return ASSET_CLASSES.CRYPTO_SPOT;
    if (CRYPTO_SPOT_KRAKEN_RAW_2.test(symbol)) return ASSET_CLASSES.CRYPTO_SPOT;
    throw new Error(
      `[B69][resolver] kraken spot symbol=${symbol} did not match any registered pattern`,
    );
  }

  throw new Error(
    `[B69][resolver] unknown exchange=${exchange} for symbol=${symbol}; ` +
    `register exchange + pattern in shared/asset-classes.ts`,
  );
}

/**
 * Caller-protected variant of `resolveAssetClass`. Per Langston cc-inbox #890
 * B.2: a single bad symbol must not crash PM2. This helper logs a WARN +
 * returns null; caller decides whether null = skip pair / null = use default /
 * null = fail batch.
 *
 * @returns AssetClass on success; null on unknown pattern (logged as WARN).
 */
export function safeResolveAssetClass(
  symbol: string,
  exchange: string,
): AssetClass | null {
  try {
    return resolveAssetClass(symbol, exchange);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`[B69] unknown symbol pattern; pair=${symbol}@${exchange}: ${msg}`);
    return null;
  }
}
