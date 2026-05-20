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
  | 'INTL_ETF';    // EWA-EWZ — country/region ETFs

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

export const XSTOCK_SPOT_REGISTRY: ReadonlyMap<string, XstockSpotEntry> = new Map<string, XstockSpotEntry>([
  ['AAPL/USD', { name: 'Apple', sector: 'XLK' }],
  ['ABBV/USD', { name: 'AbbVie', sector: 'XLV' }],
  ['ABNB/USD', { name: 'Airbnb', sector: 'XLY' }],
  ['ADBE/USD', { name: 'Adobe', sector: 'XLK' }],
  ['AEP/USD', { name: 'American Electric Power', sector: 'XLU' }],
  ['AFL/USD', { name: 'Aflac', sector: 'XLF' }],
  ['AIG/USD', { name: 'AIG', sector: 'XLF' }],
  ['ALL/USD', { name: 'Allstate', sector: 'XLF' }],
  ['ALNY/USD', { name: 'Alnylam Pharmaceuticals', sector: 'XLV' }],
  ['AMAT/USD', { name: 'Applied Materials', sector: 'XLK' }],
  ['AMC/USD', { name: 'AMC Entertainment', sector: 'XLC' }],
  ['AMD/USD', { name: 'AMD', sector: 'XLK' }],
  ['AMGN/USD', { name: 'Amgen', sector: 'XLV' }],
  ['AMT/USD', { name: 'American Tower', sector: 'XLRE' }],
  ['AMZN/USD', { name: 'Amazon', sector: 'XLY' }],
  ['AON/USD', { name: 'Aon', sector: 'XLF' }],
  ['ARCT/USD', { name: 'Arcturus Therapeutics', sector: 'XLV' }],
  ['ARKG/USD', { name: 'ARK Genomic Revolution ETF', sector: 'BROAD_ETF' }],
  ['ARKK/USD', { name: 'ARK Innovation ETF', sector: 'BROAD_ETF' }],
  ['ASML/USD', { name: 'ASML Holding', sector: 'XLK', adr: true }],
  ['AUR/USD', { name: 'Aurora Innovation', sector: 'XLI' }],
  ['AVB/USD', { name: 'AvalonBay Communities', sector: 'XLRE' }],
  ['AXP/USD', { name: 'American Express', sector: 'XLF' }],
  ['BABA/USD', { name: 'Alibaba', sector: 'XLY', adr: true }],
  ['BAC/USD', { name: 'Bank of America', sector: 'XLF' }],
  ['BAX/USD', { name: 'Baxter International', sector: 'XLV' }],
  ['BBBY/USD', { name: 'Bed Bath & Beyond', sector: 'XLY' }],
  ['BCC/USD', { name: 'Boise Cascade', sector: 'XLB' }],
  ['BDX/USD', { name: 'Becton Dickinson', sector: 'XLV' }],
  ['BE/USD', { name: 'Bloom Energy', sector: 'XLI' }],
  ['BHC/USD', { name: 'Bausch Health', sector: 'XLV', adr: true }],
  ['BIDU/USD', { name: 'Baidu', sector: 'XLC', adr: true }],
  ['BIIB/USD', { name: 'Biogen', sector: 'XLV' }],
  ['BILI/USD', { name: 'Bilibili', sector: 'XLC', adr: true }],
  ['BITF/USD', { name: 'Bitfarms', sector: 'XLK', cryptoAdjacent: true }],
  ['BLDP/USD', { name: 'Ballard Power', sector: 'XLI', adr: true }],
  ['BLNK/USD', { name: 'Blink Charging', sector: 'XLI' }],
  ['BMBL/USD', { name: 'Bumble', sector: 'XLC' }],
  ['BMY/USD', { name: 'Bristol Myers Squibb', sector: 'XLV' }],
  ['BNTX/USD', { name: 'BioNTech', sector: 'XLV', adr: true }],
  ['BTBT/USD', { name: 'Bit Digital', sector: 'XLK', cryptoAdjacent: true }],
  ['BTI/USD', { name: 'British American Tobacco', sector: 'XLP', adr: true }],
  ['BUD/USD', { name: 'Anheuser-Busch InBev', sector: 'XLP', adr: true }],
  ['CB/USD', { name: 'Chubb', sector: 'XLF' }],
  ['CBOE/USD', { name: 'Cboe Global Markets', sector: 'XLF' }],
  ['CCI/USD', { name: 'Crown Castle', sector: 'XLRE' }],
  ['CHPT/USD', { name: 'ChargePoint', sector: 'XLI' }],
  ['CI/USD', { name: 'Cigna', sector: 'XLV' }],
  ['CIFR/USD', { name: 'Cipher Mining', sector: 'XLK', cryptoAdjacent: true }],
  ['CL/USD', { name: 'Colgate-Palmolive', sector: 'XLP' }],
  ['CLSK/USD', { name: 'CleanSpark', sector: 'XLK', cryptoAdjacent: true }],
  ['CMCSA/USD', { name: 'Comcast', sector: 'XLC' }],
  ['CME/USD', { name: 'CME Group', sector: 'XLF' }],
  ['CNC/USD', { name: 'Centene', sector: 'XLV' }],
  ['COIN/USD', { name: 'Coinbase', sector: 'XLF', cryptoAdjacent: true }],
  ['COP/USD', { name: 'ConocoPhillips', sector: 'XLE' }],
  ['COST/USD', { name: 'Costco', sector: 'XLP' }],
  ['CRCL/USD', { name: 'Circle', sector: 'XLF', cryptoAdjacent: true }],
  ['CRWD/USD', { name: 'CrowdStrike', sector: 'XLK' }],
  ['CSCO/USD', { name: 'Cisco Systems', sector: 'XLK' }],
  ['CVS/USD', { name: 'CVS Health', sector: 'XLV' }],
  ['CVX/USD', { name: 'Chevron', sector: 'XLE' }],
  ['D/USD', { name: 'Dominion Energy', sector: 'XLU' }],
  ['DASH/USD', { name: 'DoorDash', sector: 'XLY' }],
  ['DE/USD', { name: 'Deere & Company', sector: 'XLI' }],
  ['DEO/USD', { name: 'Diageo', sector: 'XLP', adr: true }],
  ['DFDV/USD', { name: 'DeFi Development Corp', sector: 'XLF', cryptoAdjacent: true }],
  ['DHR/USD', { name: 'Danaher', sector: 'XLV' }],
  ['DIS/USD', { name: 'Disney', sector: 'XLC' }],
  ['DLR/USD', { name: 'Digital Realty', sector: 'XLRE' }],
  ['DTE/USD', { name: 'DTE Energy', sector: 'XLU' }],
  ['DUK/USD', { name: 'Duke Energy', sector: 'XLU' }],
  ['ED/USD', { name: 'Consolidated Edison', sector: 'XLU' }],
  ['EDU/USD', { name: 'New Oriental Education', sector: 'XLY', adr: true }],
  ['EIX/USD', { name: 'Edison International', sector: 'XLU' }],
  ['ELV/USD', { name: 'Elevance Health', sector: 'XLV' }],
  ['EMR/USD', { name: 'Emerson Electric', sector: 'XLI' }],
  ['EQIX/USD', { name: 'Equinix', sector: 'XLRE' }],
  ['EQR/USD', { name: 'Equity Residential', sector: 'XLRE' }],
  ['EQT/USD', { name: 'EQT Corporation', sector: 'XLE' }],
  ['ESS/USD', { name: 'Essex Property Trust', sector: 'XLRE' }],
  ['EVGO/USD', { name: 'EVgo', sector: 'XLU' }],
  ['EWA/USD', { name: 'Australia ETF', sector: 'INTL_ETF' }],
  ['EWC/USD', { name: 'Canada ETF', sector: 'INTL_ETF' }],
  ['EWG/USD', { name: 'Germany ETF', sector: 'INTL_ETF' }],
  ['EWI/USD', { name: 'Italy ETF', sector: 'INTL_ETF' }],
  ['EWL/USD', { name: 'Switzerland ETF', sector: 'INTL_ETF' }],
  ['EWN/USD', { name: 'Netherlands ETF', sector: 'INTL_ETF' }],
  ['EWP/USD', { name: 'Spain ETF', sector: 'INTL_ETF' }],
  ['EWQ/USD', { name: 'France ETF', sector: 'INTL_ETF' }],
  ['EWS/USD', { name: 'Singapore ETF', sector: 'INTL_ETF' }],
  ['EWU/USD', { name: 'United Kingdom ETF', sector: 'INTL_ETF' }],
  ['EWZ/USD', { name: 'Brazil ETF', sector: 'INTL_ETF' }],
  ['EXC/USD', { name: 'Exelon', sector: 'XLU' }],
  ['F/USD', { name: 'Ford', sector: 'XLY' }],
  ['FAST/USD', { name: 'Fastenal', sector: 'XLI' }],
  ['FCEL/USD', { name: 'FuelCell Energy', sector: 'XLI' }],
  ['FOX/USD', { name: 'Fox Corporation (B)', sector: 'XLC' }],
  ['FOXA/USD', { name: 'Fox Corporation (A)', sector: 'XLC' }],
  ['GEV/USD', { name: 'GE Vernova', sector: 'XLI' }],
  ['GILD/USD', { name: 'Gilead Sciences', sector: 'XLV' }],
  ['GLD/USD', { name: 'Gold ETF', sector: 'BROAD_ETF' }],
  ['GLOB/USD', { name: 'Globant', sector: 'XLK', adr: true }],
  ['GLXY/USD', { name: 'Galaxy Digital', sector: 'XLF', cryptoAdjacent: true }],
  ['GM/USD', { name: 'General Motors', sector: 'XLY' }],
  ['GME/USD', { name: 'GameStop', sector: 'XLY' }],
  ['GOOGL/USD', { name: 'Alphabet', sector: 'XLC' }],
  ['GOTU/USD', { name: 'Gaotu Techedu', sector: 'XLY', adr: true }],
  ['GS/USD', { name: 'Goldman Sachs', sector: 'XLF' }],
  ['GWW/USD', { name: 'W.W. Grainger', sector: 'XLI' }],
  ['HCA/USD', { name: 'HCA Healthcare', sector: 'XLV' }],
  ['HD/USD', { name: 'Home Depot', sector: 'XLY' }],
  ['HIG/USD', { name: 'Hartford Financial', sector: 'XLF' }],
  ['HIVE/USD', { name: 'HIVE Digital Technologies', sector: 'XLK', cryptoAdjacent: true }],
  ['HOLX/USD', { name: 'Hologic', sector: 'XLV' }],
  ['HOOD/USD', { name: 'Robinhood', sector: 'XLF' }],
  ['HUM/USD', { name: 'Humana', sector: 'XLV' }],
  ['HUT/USD', { name: 'Hut 8 Mining', sector: 'XLK', cryptoAdjacent: true }],
  ['IBM/USD', { name: 'IBM', sector: 'XLK' }],
  ['ICE/USD', { name: 'Intercontinental Exchange', sector: 'XLF' }],
  ['IEMG/USD', { name: 'Core MSCI Emerging Markets ETF', sector: 'BROAD_ETF' }],
  ['INTC/USD', { name: 'Intel', sector: 'XLK' }],
  ['JD/USD', { name: 'JD.com', sector: 'XLY', adr: true }],
  ['JNJ/USD', { name: 'Johnson & Johnson', sector: 'XLV' }],
  ['JPM/USD', { name: 'JPMorgan Chase', sector: 'XLF' }],
  ['KO/USD', { name: 'Coca-Cola', sector: 'XLP' }],
  ['LCID/USD', { name: 'Lucid Group', sector: 'XLY' }],
  ['LECO/USD', { name: 'Lincoln Electric', sector: 'XLI' }],
  ['LI/USD', { name: 'Li Auto', sector: 'XLY', adr: true }],
  ['LIDR/USD', { name: 'AEye Inc.', sector: 'XLK' }],
  ['LLY/USD', { name: 'Eli Lilly', sector: 'XLV' }],
  ['LMND/USD', { name: 'Lemonade', sector: 'XLF' }],
  ['LMT/USD', { name: 'Lockheed Martin', sector: 'XLI' }],
  ['LNC/USD', { name: 'Lincoln National', sector: 'XLF' }],
  ['LOW/USD', { name: "Lowe's", sector: 'XLY' }],
  ['LRCX/USD', { name: 'Lam Research', sector: 'XLK' }],
  ['LYFT/USD', { name: 'Lyft', sector: 'XLI' }],
  ['MAA/USD', { name: 'Mid-America Apartment', sector: 'XLRE' }],
  ['MCD/USD', { name: "McDonald's", sector: 'XLY' }],
  ['MCK/USD', { name: 'McKesson', sector: 'XLV' }],
  ['MCO/USD', { name: "Moody's", sector: 'XLF' }],
  ['MDB/USD', { name: 'MongoDB', sector: 'XLK' }],
  ['MDLZ/USD', { name: 'Mondelez International', sector: 'XLP' }],
  ['MDT/USD', { name: 'Medtronic', sector: 'XLV' }],
  ['MET/USD', { name: 'MetLife', sector: 'XLF' }],
  ['META/USD', { name: 'Meta Platforms', sector: 'XLC' }],
  ['MMM/USD', { name: '3M', sector: 'XLI' }],
  ['MO/USD', { name: 'Altria Group', sector: 'XLP' }],
  ['MOH/USD', { name: 'Molina Healthcare', sector: 'XLV' }],
  ['MPC/USD', { name: 'Marathon Petroleum', sector: 'XLE' }],
  ['MRK/USD', { name: 'Merck', sector: 'XLV' }],
  ['MRNA/USD', { name: 'Moderna', sector: 'XLV' }],
  ['MRVL/USD', { name: 'Marvell Technology', sector: 'XLK' }],
  ['MS/USD', { name: 'Morgan Stanley', sector: 'XLF' }],
  ['MSCI/USD', { name: 'MSCI Inc.', sector: 'XLF' }],
  ['MSFT/USD', { name: 'Microsoft', sector: 'XLK' }],
  ['MSTR/USD', { name: 'MicroStrategy', sector: 'XLK', cryptoAdjacent: true }],
  ['MTCH/USD', { name: 'Match Group', sector: 'XLC' }],
  ['NBIX/USD', { name: 'Neurocrine Biosciences', sector: 'XLV' }],
  ['NDAQ/USD', { name: 'Nasdaq Inc.', sector: 'XLF' }],
  ['NEE/USD', { name: 'NextEra Energy', sector: 'XLU' }],
  ['NET/USD', { name: 'Cloudflare', sector: 'XLK' }],
  ['NFLX/USD', { name: 'Netflix', sector: 'XLC' }],
  ['NIO/USD', { name: 'NIO', sector: 'XLY', adr: true }],
  ['NKE/USD', { name: 'Nike', sector: 'XLY' }],
  ['NOW/USD', { name: 'ServiceNow', sector: 'XLK' }],
  ['NTES/USD', { name: 'NetEase', sector: 'XLC', adr: true }],
  ['NTNX/USD', { name: 'Nutanix', sector: 'XLK' }],
  ['NVAX/USD', { name: 'Novavax', sector: 'XLV' }],
  ['NVDA/USD', { name: 'Nvidia', sector: 'XLK' }],
  ['NVO/USD', { name: 'Novo Nordisk', sector: 'XLV', adr: true }],
  ['NVT/USD', { name: 'nVent Electric', sector: 'XLI' }],
  ['NWS/USD', { name: 'News Corporation (B)', sector: 'XLC' }],
  ['NWSA/USD', { name: 'News Corporation (A)', sector: 'XLC' }],
  ['O/USD', { name: 'Realty Income', sector: 'XLRE' }],
  ['OPEN/USD', { name: 'Opendoor Technologies', sector: 'XLRE' }],
  ['ORCL/USD', { name: 'Oracle', sector: 'XLK' }],
  ['OXY/USD', { name: 'Occidental Petroleum', sector: 'XLE' }],
  ['PANW/USD', { name: 'Palo Alto Networks', sector: 'XLK' }],
  ['PARA/USD', { name: 'Paramount Global', sector: 'XLC' }],
  ['PATH/USD', { name: 'UiPath', sector: 'XLK' }],
  ['PCG/USD', { name: 'PG&E', sector: 'XLU' }],
  ['PDD/USD', { name: 'PDD Holdings', sector: 'XLY', adr: true }],
  ['PEP/USD', { name: 'PepsiCo', sector: 'XLP' }],
  ['PFE/USD', { name: 'Pfizer', sector: 'XLV' }],
  ['PG/USD', { name: 'Procter & Gamble', sector: 'XLP' }],
  ['PGR/USD', { name: 'Progressive', sector: 'XLF' }],
  ['PH/USD', { name: 'Parker-Hannifin', sector: 'XLI' }],
  ['PLD/USD', { name: 'Prologis', sector: 'XLRE' }],
  ['PLTR/USD', { name: 'Palantir', sector: 'XLK' }],
  ['PLUG/USD', { name: 'Plug Power', sector: 'XLI' }],
  ['PM/USD', { name: 'Philip Morris International', sector: 'XLP' }],
  ['PNR/USD', { name: 'Pentair', sector: 'XLI' }],
  ['PRU/USD', { name: 'Prudential Financial', sector: 'XLF' }],
  ['PSA/USD', { name: 'Public Storage', sector: 'XLRE' }],
  ['PSX/USD', { name: 'Phillips 66', sector: 'XLE' }],
  ['PWR/USD', { name: 'Quanta Services', sector: 'XLI' }],
  ['PYPL/USD', { name: 'PayPal', sector: 'XLF' }],
  ['QCOM/USD', { name: 'Qualcomm', sector: 'XLK' }],
  ['QQQ/USD', { name: 'Nasdaq 100 ETF', sector: 'INDEX_PROXY' }],
  ['RBLX/USD', { name: 'Roblox', sector: 'XLC' }],
  ['REGN/USD', { name: 'Regeneron', sector: 'XLV' }],
  ['RGEN/USD', { name: 'Repligen', sector: 'XLV' }],
  ['RIVN/USD', { name: 'Rivian', sector: 'XLY' }],
  ['RKT/USD', { name: 'Rocket Companies', sector: 'XLF' }],
  ['RMD/USD', { name: 'ResMed', sector: 'XLV' }],
  ['ROK/USD', { name: 'Rockwell Automation', sector: 'XLI' }],
  ['ROOT/USD', { name: 'Root Inc.', sector: 'XLF' }],
  ['ROP/USD', { name: 'Roper Technologies', sector: 'XLK' }],
  ['RTX/USD', { name: 'RTX Corporation', sector: 'XLI' }],
  ['SAGE/USD', { name: 'Sage Therapeutics', sector: 'XLV' }],
  ['SAP/USD', { name: 'SAP', sector: 'XLK', adr: true }],
  ['SHEL/USD', { name: 'Shell', sector: 'XLE', adr: true }],
  ['SHOP/USD', { name: 'Shopify', sector: 'XLK', adr: true }],
  ['SLB/USD', { name: 'Schlumberger', sector: 'XLE' }],
  ['SNDK/USD', { name: 'SanDisk', sector: 'XLK' }],
  ['SNOW/USD', { name: 'Snowflake', sector: 'XLK' }],
  ['SO/USD', { name: 'Southern Company', sector: 'XLU' }],
  ['SOFI/USD', { name: 'SoFi Technologies', sector: 'XLF' }],
  ['SPG/USD', { name: 'Simon Property Group', sector: 'XLRE' }],
  ['SPGI/USD', { name: 'S&P Global', sector: 'XLF' }],
  ['SPY/USD', { name: 'S&P 500 ETF', sector: 'INDEX_PROXY' }],
  ['SRE/USD', { name: 'Sempra Energy', sector: 'XLU' }],
  ['STZ/USD', { name: 'Constellation Brands', sector: 'XLP' }],
  ['SUI/USD', { name: 'Sun Communities', sector: 'XLRE' }],
  ['SUPN/USD', { name: 'Supernus Pharmaceuticals', sector: 'XLV' }],
  ['T/USD', { name: 'AT&T', sector: 'XLC' }],
  ['TAL/USD', { name: 'TAL Education', sector: 'XLY', adr: true }],
  ['TAP/USD', { name: 'Molson Coors', sector: 'XLP' }],
  ['TER/USD', { name: 'Teradyne', sector: 'XLK' }],
  ['TEVA/USD', { name: 'Teva Pharmaceuticals', sector: 'XLV', adr: true }],
  ['TGT/USD', { name: 'Target', sector: 'XLY' }],
  ['THC/USD', { name: 'Tenet Healthcare', sector: 'XLV' }],
  ['TME/USD', { name: 'Tencent Music', sector: 'XLC', adr: true }],
  ['TMO/USD', { name: 'Thermo Fisher Scientific', sector: 'XLV' }],
  ['TMUS/USD', { name: 'T-Mobile', sector: 'XLC' }],
  ['TONX/USD', { name: 'TONX Inc.', sector: 'XLK' }],
  ['TOTL/USD', { name: 'DoubleLine Total Return ETF', sector: 'BROAD_ETF' }],
  ['TRV/USD', { name: 'Travelers', sector: 'XLF' }],
  ['TSLA/USD', { name: 'Tesla', sector: 'XLY' }],
  ['TT/USD', { name: 'Trane Technologies', sector: 'XLI' }],
  ['TXN/USD', { name: 'Texas Instruments', sector: 'XLK' }],
  ['UBER/USD', { name: 'Uber', sector: 'XLI' }],
  ['UHS/USD', { name: 'Universal Health Services', sector: 'XLV' }],
  ['UL/USD', { name: 'Unilever', sector: 'XLP', adr: true }],
  ['UPS/USD', { name: 'UPS', sector: 'XLI' }],
  ['URI/USD', { name: 'United Rentals', sector: 'XLI' }],
  ['UWMC/USD', { name: 'UWM Holdings', sector: 'XLF' }],
  ['VIA/USD', { name: 'Via Renewables', sector: 'XLU' }],
  ['VICI/USD', { name: 'VICI Properties', sector: 'XLRE' }],
  ['VLO/USD', { name: 'Valero Energy', sector: 'XLE' }],
  ['VOYA/USD', { name: 'Voya Financial', sector: 'XLF' }],
  ['VRTX/USD', { name: 'Vertex Pharmaceuticals', sector: 'XLV' }],
  ['VTRS/USD', { name: 'Viatris', sector: 'XLV' }],
  ['VZ/USD', { name: 'Verizon', sector: 'XLC' }],
  ['WBA/USD', { name: 'Walgreens Boots Alliance', sector: 'XLP' }],
  ['WBD/USD', { name: 'Warner Bros. Discovery', sector: 'XLC' }],
  ['WFC/USD', { name: 'Wells Fargo', sector: 'XLF' }],
  ['XBI/USD', { name: 'SPDR S&P Biotech ETF', sector: 'BROAD_ETF' }],
  ['XEL/USD', { name: 'Xcel Energy', sector: 'XLU' }],
  ['XOM/USD', { name: 'ExxonMobil', sector: 'XLE' }],
  ['XPEV/USD', { name: 'XPeng', sector: 'XLY', adr: true }],
  ['XYL/USD', { name: 'Xylem', sector: 'XLI' }],
  ['XYZ/USD', { name: 'Block (XYZ)', sector: 'XLF' }],
  ['ZTS/USD', { name: 'Zoetis', sector: 'XLV' }],
]);

/**
 * Back-compat: derived universe set. DO NOT add entries here — edit
 * `XSTOCK_SPOT_REGISTRY` above. Existing `.has()` callers + iteration
 * sites work unchanged.
 */
export const XSTOCK_SPOT_SYMBOLS: ReadonlySet<string> = new Set(XSTOCK_SPOT_REGISTRY.keys());

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
