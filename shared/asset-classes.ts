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
    archiveOhlcTable: 'xstock_spot_ohlc_1m',     // B79.0e renamed from equity_spot_*
    archiveTickerTable: 'xstock_spot_ticker_snap',
    badgeColor: 'bg-blue-100 text-blue-800',
    description: 'Tokenized equity (Backed Finance xStock) on Kraken spot (ws-equities.kraken.com)',
  },
  xstock_perp: {
    id: 'xstock_perp',
    displayName: 'xStock Perp',
    defaultExchange: 'kraken-futures',
    active: true,
    archiveOhlcTable: 'xstock_perp_ohlc_1m',     // B79.0e renamed from equity_perp_*
    archiveTickerTable: 'xstock_perp_ticker_snap',
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

/**
 * B-NEW-30 (2026-05-13): xstock_spot universe — SSOT registry pattern.
 * B-PHASE-A2 (2026-05-17): `sector` + optional `adr`/`cryptoAdjacent` flags added.
 *
 * Single source of truth for the xstock_spot universe. Each entry carries:
 *   - `name`             — human-readable display name (REQUIRED)
 *   - `sector`           — GICS sector tag OR INDEX_PROXY / BROAD_ETF / INTL_ETF (REQUIRED, B-PHASE-A2)
 *   - `adr`              — optional flag for ADR-listed names (Phase E factor work)
 *   - `cryptoAdjacent`   — optional flag for BTC-proxy / exchange / miner names (Phase E factor work)
 *
 * The sector tag is consumed by `xstockDirectionalBiasStore` for partition
 * filtering at aggregation time (GICS-only entries count toward global floor;
 * INDEX_PROXY/BROAD_ETF/INTL_ETF stored for own-use but excluded from
 * weighted-median aggregation). See B_PHASE_A1_DBS_design_ask_rev2.md §3 for
 * the locked design.
 *
 * Previously the universe (`XSTOCK_SPOT_SYMBOLS`) and the display names
 * (`XSTOCK_NAMES` in `shared/asset-names.ts`) were two parallel structures
 * that could drift. B-NEW-29 (2026-05-13) patched the gap by data-filling
 * XSTOCK_NAMES; B-NEW-30 fixed the structural issue by consolidating to
 * this registry. `XSTOCK_SPOT_SYMBOLS` is now DERIVED from this map —
 * adding a new xStock requires editing exactly one
 * entry here, and the type system makes `name` + `sector` non-optional so
 * forgetting either becomes a compile error (not a runtime blank cell).
 *
 * The WS feed and the canonical pair-universe form (used by the scanner) is
 * `<TICKER>/<QUOTE>` without an x-suffix — indistinguishable by regex from
 * crypto_spot canonical (`BASE/QUOTE`). Membership check via the derived
 * `XSTOCK_SPOT_SYMBOLS` Set is O(1). Resolution dispatches to XSTOCK_SPOT
 * before the crypto_spot regex paths in `resolveAssetClass` for
 * `exchange='kraken'`.
 */

/**
 * B-PHASE-A2 — Sector taxonomy for xStock spot universe.
 *
 * 11 GICS sectors (SPDR-aligned) + 3 special buckets:
 *   - `XLK`-`XLC`: standard GICS sectors (Technology, Energy, Healthcare, Financials,
 *     Industrials, Consumer Staples, Consumer Discretionary, Utilities, Materials,
 *     Real Estate, Communication Services).
 *   - `INDEX_PROXY`: SPY, QQQ. Included in per-pair DBS compute (own eval-cycle reads
 *     own score), EXCLUDED from global aggregation (would degenerate weighted-median
 *     to "SPY's own DBS"). Also EXCLUDED from sector-coverage floor counting.
 *   - `BROAD_ETF`: ARKK, ARKG, XBI, GLD, TOTL, IEMG, etc. Thematic/broad ETFs that
 *     don't fit a single GICS sector. SPY-fallback target for sector-correlation
 *     factor work in Phase E.
 *   - `INTL_ETF`: country/region ETFs (EWA-EWZ). No domestic-sector benchmark; SPY
 *     fallback for Phase E factor work.
 *
 * Reference: B_PHASE_A1_DBS_design_ask_rev2.md §3.2.
 */
export type XstockSector =
  | 'XLK'           // Technology
  | 'XLE'           // Energy
  | 'XLV'           // Healthcare
  | 'XLF'           // Financials
  | 'XLI'           // Industrials
  | 'XLP'           // Consumer Staples
  | 'XLY'           // Consumer Discretionary
  | 'XLU'           // Utilities
  | 'XLB'           // Materials
  | 'XLRE'          // Real Estate
  | 'XLC'           // Communication Services
  | 'INDEX_PROXY'   // SPY / QQQ — excluded from global aggregation
  | 'BROAD_ETF'    // ARKK, ARKG, XBI, GLD, TOTL, IEMG — SPY-fallback target
  | 'INTL_ETF'     // EWA-EWZ — country/region ETFs
  | 'UNCATEGORIZED'; // B79.0n.UNIVERSE-DISCOVERY: symbols where Finnhub metadata is unavailable. Excluded from B-PHASE-A2 sector-coverage floor counting until manual curation lands.

/**
 * B79.0n.UNIVERSE-DISCOVERY 2026-05-21: runtime allow-list of valid sector
 * values. Mirrors the XstockSector union as a Set for O(1) membership checks
 * at DB-load time when coercing raw `sector` strings from `xstock_spot_universe`.
 * Also referenced by the DB CHECK constraint (must stay in sync — see
 * 2026-05-21-b79-0n-universe-discovery.sql).
 */
export const _XSTOCK_SECTOR_VALUES_FOR_CHECK: ReadonlySet<string> = new Set<string>([
  'XLK', 'XLV', 'XLF', 'XLC', 'XLY', 'XLP', 'XLE', 'XLI',
  'XLRE', 'XLU', 'XLB',
  'BROAD_ETF', 'INDEX_PROXY', 'INTL_ETF',
  'UNCATEGORIZED',
]);

export interface XstockSpotEntry {
  /** Human-readable display name (e.g., 'Apple', 'nVent Electric'). REQUIRED. */
  name: string;
  /**
   * GICS sector tag OR special bucket (INDEX_PROXY / BROAD_ETF / INTL_ETF). **REQUIRED.**
   *
   * Sub-task B (B-PHASE-A2) flipped this to required after the 265-entry mapping was filled in
   * and Langston spot-checked the reference doc. TypeScript compile-fails any future entry
   * missing sector — that's the structural safeguard against drift.
   *
   * Sector taxonomy + GICS reclassification rationale documented in
   * `Claude Comms and Packages/Langston Design Asks/xstock_sector_mappings_reference.md`.
   */
  sector: XstockSector;
  /** Optional: ADR-listed name (non-US underlying). Phase E factor work consumes. */
  adr?: boolean;
  /** Optional: BTC-proxy / exchange / miner / crypto-treasury name. Phase E factor work consumes. */
  cryptoAdjacent?: boolean;
}

// B79.0n.UNIVERSE-DISCOVERY 2026-05-21: the 260-row Map literal that
// previously occupied lines 286-552 was replaced with a dynamically-
// populated Map. The seed for the new shape lives in the DB table
// `xstock_spot_universe` (seeded by 2026-05-21-b79-0n-universe-discovery.sql
// from this exact registry shape at the cutover commit). The runtime
// population path runs at server boot in server/index.ts via
// xstockUniverseService.initializeFromDB() (5-layer fallback chain).
//
// Callers consume XSTOCK_SPOT_REGISTRY + XSTOCK_SPOT_SYMBOLS unchanged
// — interface preserved. Iterators + .get/.has lookups + .size reads
// at any post-boot time return the dynamically-loaded contents.
//
// Manual edits to add/remove xStock symbols are NO LONGER the right
// pattern. Add/remove via the DB tables xstock_spot_universe (auto-
// discovered) + xstock_spot_universe_overrides (manual curation flags).

const _xstockRegistryInternal = new Map<string, XstockSpotEntry>();
const _xstockSymbolsInternal = new Set<string>();

export const XSTOCK_SPOT_REGISTRY: ReadonlyMap<string, XstockSpotEntry> = _xstockRegistryInternal;
export const XSTOCK_SPOT_SYMBOLS: ReadonlySet<string> = _xstockSymbolsInternal;

/**
 * B79.0n.UNIVERSE-DISCOVERY 2026-05-21: bulk-replace the in-memory universe.
 * Called by xstockUniverseService at boot (DB / file-cache / bootstrap fallback)
 * and after every successful discovery refresh. NOT a public API — the leading
 * underscore is a deliberate signal that only the universe-service should call this.
 */
export function _replaceXstockUniverse(entries: ReadonlyMap<string, XstockSpotEntry>): void {
  _xstockRegistryInternal.clear();
  _xstockSymbolsInternal.clear();
  for (const [symbol, entry] of entries) {
    _xstockRegistryInternal.set(symbol, entry);
    _xstockSymbolsInternal.add(symbol);
  }
}

// B79.0n.UNIVERSE-DISCOVERY 2026-05-21: duplicate XSTOCK_SPOT_SYMBOLS export
// REMOVED here. The canonical declaration now lives above (line ~306) as a
// ReadonlySet view of the mutable internal _xstockSymbolsInternal set,
// kept in sync with XSTOCK_SPOT_REGISTRY by _replaceXstockUniverse.

/** Look up the human-readable display name for an xstock pair. Returns null if unknown. */
export function getXstockName(pair: string): string | null {
  return XSTOCK_SPOT_REGISTRY.get(pair)?.name ?? null;
}

/**
 * B79.0f — Ticker COLLISIONS between xStocks (XSTOCK_SPOT_SYMBOLS) and
 * Kraken's crypto-spot universe (`/0/public/AssetPairs` wsname BASE/USD).
 *
 * Provenance: enumerated 2026-05-10 via live Kraken `/0/public/AssetPairs`
 * intersection with XSTOCK_SPOT_SYMBOLS bases. 9 USD-quote tickers exist
 * BOTH as xStock equities (e.g. Sun Communities SUI on Kraken xStocks at
 * `SUIxUSD` raw form) AND as Kraken-spot cryptos (e.g. Sui Network at
 * `SUIUSD` raw form). Both canonicalize to `BASE/USD` and become
 * indistinguishable post-canonicalization.
 *
 * Resolver semantics for collision tickers (Langston Q1 lock 2026-05-10):
 * when the regular `kraken` exchange path receives a collision ticker
 * WITHOUT the `x` suffix that disambiguates xStock display form, prefer
 * crypto_spot. xStock data ingestion always uses `exchange='kraken-equities'`
 * per B74 archiver — so an xStock symbol losing its `x` suffix in transit
 * is by-construction crypto. WARN log fires on this path so future drift
 * in the invariant is detectable.
 *
 * STANDING RULE: re-audit this set quarterly via `/0/public/AssetPairs`
 * (calendar trigger in MULTI_ASSET_VTS_EXPANSION_PLAN.md §10c.X). Kraken
 * adds tokens regularly; new collisions can emerge.
 */
export const XSTOCK_SPOT_KRAKEN_COLLISIONS: ReadonlySet<string> = new Set([
  'BDX/USD',  // xStock: Becton Dickinson | Crypto: BDX
  'CVX/USD',  // xStock: Chevron          | Crypto: Convex Finance
  'DASH/USD', // xStock: DoorDash         | Crypto: Dash
  'EDU/USD',  // xStock: New Oriental     | Crypto: Open Campus
  'MET/USD',  // xStock: MetLife          | Crypto: MET
  'OPEN/USD', // xStock: OpenLending      | Crypto: OPEN
  'PEP/USD',  // xStock: PepsiCo          | Crypto: Pepe-related
  'SUI/USD',  // xStock: Sun Communities  | Crypto: Sui Network
  'T/USD',    // xStock: AT&T             | Crypto: T
  // EUR-quote regression-locks: XSTOCK_SPOT_SYMBOLS is /USD-only today, but
  // these 8 tickers ALSO exist as Kraken crypto /EUR pairs. If a future
  // commit extends XSTOCK_SPOT_SYMBOLS to /EUR, the same collision arises.
  // Pre-emptive entries here so the resolver gates correctly without
  // requiring a coordinated double-edit.
  'CVX/EUR',
  'DASH/EUR',
  'EDU/EUR',
  'MET/EUR',
  'OPEN/EUR',
  'PEP/EUR',
  'SUI/EUR',
  'T/EUR',
]);

/*
 * B79.0c introduced `XSTOCK_SPOT_24_7_SYMBOLS` as a 10-name set derived from
 * `XSTOCK_SPOT_REGISTRY` via an `is24_7` flag. B-NEW-36 sub-batch (c)
 * (2026-05-20) RETIRED that designation:
 *
 *   - Empirical reality (Q9 verified at sub-batch (c) Step 2 pre-audit): all
 *     10 of the designated names (AAPL/CRCL/GLD/GOOGL/HOOD/MSTR/NVDA/QQQ/SPY/
 *     TSLA) showed ZERO bucket activity in the Sat 00:00 UTC → Mon 00:00 UTC
 *     weekend window in `xstock_spot_ohlc_60m_snapshot`. Kraken's WS-equities
 *     feed does not carry weekend price activity for ANY xStock including these
 *     ten — contradicting Kraken's 2025-12-03 Phase 1 marketing blog post.
 *   - Behavioral consequence: all xStocks share IDENTICAL trading hours: open
 *     Sun 8PM ET → Fri 8PM ET (120 hours), closed Fri 8PM ET → Sun 8PM ET
 *     (48 hours). The 24/5 / 24/7 distinction was empirically meaningless.
 *   - Code consequence: the `is24_7` field is removed from the registry
 *     interface; `XSTOCK_SPOT_24_7_SYMBOLS` is removed entirely;
 *     `isXstockMarketOpenUTC(symbol, now)` returns the same value regardless
 *     of `symbol` (the parameter stays in the signature for backward compat).
 *
 * Cross-references: B_NEW_36_SCOPE.md §0.5 + §2.5; B_NEW_36_PRE_AUDIT.md §3.3
 * + §3.4 + §5.1; RUNNING_ISSUES #120 (5-symbol gap traced separately).
 */

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
    // Check for explicit xstock_spot display form (AAPLx/USD) — strongest
    // signal: caller passed the Kraken Pro display format with x-suffix
    // intact. This branch is ALWAYS xstock_spot regardless of collision set.
    if (XSTOCK_SPOT_DISPLAY.test(symbol)) return ASSET_CLASSES.XSTOCK_SPOT;

    // B79.0f — collision gate. The 9 USD-quote (+ 8 EUR pre-emptive) tickers
    // in XSTOCK_SPOT_KRAKEN_COLLISIONS exist BOTH as xStock equities AND as
    // Kraken-spot cryptos with identical canonical form. When such a ticker
    // arrives via the regular `kraken` exchange WITHOUT the disambiguating
    // `x` suffix (which would have hit XSTOCK_SPOT_DISPLAY above), prefer
    // crypto_spot. Reasoning: xStock ingestion uses `exchange='kraken-equities'`
    // per B74 archiver invariant. A collision ticker on `kraken` without `x`
    // suffix is by-construction crypto — the alternative would mean an
    // xStock symbol lost its disambiguating marker in transit, which is
    // itself a bug worth surfacing. Emit WARN log so any future drift in
    // the B74 invariant is detectable, then return crypto_spot.
    if (XSTOCK_SPOT_KRAKEN_COLLISIONS.has(symbol)) {
      console.warn(
        `[B79.0f][COLLISION_RESOLVE] symbol=${symbol} on exchange=kraken without x-suffix → resolving as crypto_spot. ` +
        `If you expected xstock_spot, the caller should pass exchange='kraken-equities' or the display form (e.g. SUIx/USD). ` +
        `Drift watch — see XSTOCK_SPOT_KRAKEN_COLLISIONS provenance comment.`,
      );
      return ASSET_CLASSES.CRYPTO_SPOT;
    }

    // B79: non-collision xstock_spot allow-list lookup. The canonical
    // pair-universe form for xStocks is `<TICKER>/<QUOTE>` (no x-suffix),
    // which would otherwise match CRYPTO_SPOT_KRAKEN_RAW_2 below. For
    // tickers OUTSIDE the collision set, membership-set lookup is the
    // conservative path — the ticker has no crypto counterpart on Kraken
    // so no ambiguity exists.
    if (XSTOCK_SPOT_SYMBOLS.has(symbol)) return ASSET_CLASSES.XSTOCK_SPOT;
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
