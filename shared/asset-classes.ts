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
 *   - `is24_7`           — optional flag for Phase-1 extended-hours names (10 total)
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
 * this registry. `XSTOCK_SPOT_SYMBOLS` + `XSTOCK_SPOT_24_7_SYMBOLS` are now
 * DERIVED from this map — adding a new xStock requires editing exactly one
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
  /** True for Phase-1 extended-hours names (Sun 8PM ET → Fri 8PM ET continuous). */
  is24_7?: boolean;
  /**
   * GICS sector tag OR special bucket (INDEX_PROXY / BROAD_ETF / INTL_ETF).
   *
   * **B-PHASE-A2 staging — currently optional; FLIPS TO REQUIRED at end of B-PHASE-A2-B.**
   *
   * Sub-task A (this commit) lands the type definition + store-side consumption with `sector?` optional.
   * Sub-task B fills all 265 registry entries with concrete sectors AND removes the `?` so TypeScript
   * compile-fails any future entry missing sector. Langston spot-check between A and B.
   *
   * Until B lands, the store's partition filter treats `sector === undefined` the same as
   * `INDEX_PROXY / BROAD_ETF / INTL_ETF` — stored for own-use but excluded from global
   * aggregation + sector-coverage floor counting. Graceful degrade.
   */
  sector?: XstockSector;
  /** Optional: ADR-listed name (non-US underlying). Phase E factor work consumes. */
  adr?: boolean;
  /** Optional: BTC-proxy / exchange / miner / crypto-treasury name. Phase E factor work consumes. */
  cryptoAdjacent?: boolean;
}

export const XSTOCK_SPOT_REGISTRY: ReadonlyMap<string, XstockSpotEntry> = new Map<string, XstockSpotEntry>([
  ['AAPL/USD', { name: 'Apple', is24_7: true }],
  ['ABBV/USD', { name: 'AbbVie' }],
  ['ABNB/USD', { name: 'Airbnb' }],
  ['ADBE/USD', { name: 'Adobe' }],
  ['AEP/USD', { name: 'American Electric Power' }],
  ['AFL/USD', { name: 'Aflac' }],
  ['AIG/USD', { name: 'AIG' }],
  ['ALL/USD', { name: 'Allstate' }],
  ['ALNY/USD', { name: 'Alnylam Pharmaceuticals' }],
  ['AMAT/USD', { name: 'Applied Materials' }],
  ['AMC/USD', { name: 'AMC Entertainment' }],
  ['AMD/USD', { name: 'AMD' }],
  ['AMGN/USD', { name: 'Amgen' }],
  ['AMT/USD', { name: 'American Tower' }],
  ['AMZN/USD', { name: 'Amazon' }],
  ['AON/USD', { name: 'Aon' }],
  ['ARCT/USD', { name: 'Arcturus Therapeutics' }],
  ['ARKG/USD', { name: 'ARK Genomic Revolution ETF' }],
  ['ARKK/USD', { name: 'ARK Innovation ETF' }],
  ['ASML/USD', { name: 'ASML Holding' }],
  ['AUR/USD', { name: 'Aurora Innovation' }],
  ['AVB/USD', { name: 'AvalonBay Communities' }],
  ['AXP/USD', { name: 'American Express' }],
  ['BABA/USD', { name: 'Alibaba' }],
  ['BAC/USD', { name: 'Bank of America' }],
  ['BAX/USD', { name: 'Baxter International' }],
  ['BBBY/USD', { name: 'Bed Bath & Beyond' }],
  ['BCC/USD', { name: 'Boise Cascade' }],
  ['BDX/USD', { name: 'Becton Dickinson' }],
  ['BE/USD', { name: 'Bloom Energy' }],
  ['BHC/USD', { name: 'Bausch Health' }],
  ['BIDU/USD', { name: 'Baidu' }],
  ['BIIB/USD', { name: 'Biogen' }],
  ['BILI/USD', { name: 'Bilibili' }],
  ['BITF/USD', { name: 'Bitfarms' }],
  ['BLDP/USD', { name: 'Ballard Power' }],
  ['BLNK/USD', { name: 'Blink Charging' }],
  ['BMBL/USD', { name: 'Bumble' }],
  ['BMY/USD', { name: 'Bristol Myers Squibb' }],
  ['BNTX/USD', { name: 'BioNTech' }],
  ['BTBT/USD', { name: 'Bit Digital' }],
  ['BTI/USD', { name: 'British American Tobacco' }],
  ['BUD/USD', { name: 'Anheuser-Busch InBev' }],
  ['CB/USD', { name: 'Chubb' }],
  ['CBOE/USD', { name: 'Cboe Global Markets' }],
  ['CCI/USD', { name: 'Crown Castle' }],
  ['CHPT/USD', { name: 'ChargePoint' }],
  ['CI/USD', { name: 'Cigna' }],
  ['CIFR/USD', { name: 'Cipher Mining' }],
  ['CL/USD', { name: 'Colgate-Palmolive' }],
  ['CLSK/USD', { name: 'CleanSpark' }],
  ['CMCSA/USD', { name: 'Comcast' }],
  ['CME/USD', { name: 'CME Group' }],
  ['CNC/USD', { name: 'Centene' }],
  ['COIN/USD', { name: 'Coinbase' }],
  ['COP/USD', { name: 'ConocoPhillips' }],
  ['COST/USD', { name: 'Costco' }],
  ['CRCL/USD', { name: 'Circle', is24_7: true }],
  ['CRWD/USD', { name: 'CrowdStrike' }],
  ['CSCO/USD', { name: 'Cisco Systems' }],
  ['CVS/USD', { name: 'CVS Health' }],
  ['CVX/USD', { name: 'Chevron' }],
  ['D/USD', { name: 'Dominion Energy' }],
  ['DASH/USD', { name: 'DoorDash' }],
  ['DE/USD', { name: 'Deere & Company' }],
  ['DEO/USD', { name: 'Diageo' }],
  ['DFDV/USD', { name: 'DeFi Development Corp' }],
  ['DHR/USD', { name: 'Danaher' }],
  ['DIS/USD', { name: 'Disney' }],
  ['DLR/USD', { name: 'Digital Realty' }],
  ['DTE/USD', { name: 'DTE Energy' }],
  ['DUK/USD', { name: 'Duke Energy' }],
  ['ED/USD', { name: 'Consolidated Edison' }],
  ['EDU/USD', { name: 'New Oriental Education' }],
  ['EIX/USD', { name: 'Edison International' }],
  ['ELV/USD', { name: 'Elevance Health' }],
  ['EMR/USD', { name: 'Emerson Electric' }],
  ['EQIX/USD', { name: 'Equinix' }],
  ['EQR/USD', { name: 'Equity Residential' }],
  ['EQT/USD', { name: 'EQT Corporation' }],
  ['ESS/USD', { name: 'Essex Property Trust' }],
  ['EVGO/USD', { name: 'EVgo' }],
  ['EWA/USD', { name: 'Australia ETF' }],
  ['EWC/USD', { name: 'Canada ETF' }],
  ['EWG/USD', { name: 'Germany ETF' }],
  ['EWI/USD', { name: 'Italy ETF' }],
  ['EWL/USD', { name: 'Switzerland ETF' }],
  ['EWN/USD', { name: 'Netherlands ETF' }],
  ['EWP/USD', { name: 'Spain ETF' }],
  ['EWQ/USD', { name: 'France ETF' }],
  ['EWS/USD', { name: 'Singapore ETF' }],
  ['EWU/USD', { name: 'United Kingdom ETF' }],
  ['EWZ/USD', { name: 'Brazil ETF' }],
  ['EXC/USD', { name: 'Exelon' }],
  ['F/USD', { name: 'Ford' }],
  ['FAST/USD', { name: 'Fastenal' }],
  ['FCEL/USD', { name: 'FuelCell Energy' }],
  ['FOX/USD', { name: 'Fox Corporation (B)' }],
  ['FOXA/USD', { name: 'Fox Corporation (A)' }],
  ['GEV/USD', { name: 'GE Vernova' }],
  ['GILD/USD', { name: 'Gilead Sciences' }],
  ['GLD/USD', { name: 'Gold ETF', is24_7: true }],
  ['GLOB/USD', { name: 'Globant' }],
  ['GLXY/USD', { name: 'Galaxy Digital' }],
  ['GM/USD', { name: 'General Motors' }],
  ['GME/USD', { name: 'GameStop' }],
  ['GOOGL/USD', { name: 'Alphabet', is24_7: true }],
  ['GOTU/USD', { name: 'Gaotu Techedu' }],
  ['GS/USD', { name: 'Goldman Sachs' }],
  ['GWW/USD', { name: 'W.W. Grainger' }],
  ['HCA/USD', { name: 'HCA Healthcare' }],
  ['HD/USD', { name: 'Home Depot' }],
  ['HIG/USD', { name: 'Hartford Financial' }],
  ['HIVE/USD', { name: 'HIVE Digital Technologies' }],
  ['HOLX/USD', { name: 'Hologic' }],
  ['HOOD/USD', { name: 'Robinhood', is24_7: true }],
  ['HUM/USD', { name: 'Humana' }],
  ['HUT/USD', { name: 'Hut 8 Mining' }],
  ['IBM/USD', { name: 'IBM' }],
  ['ICE/USD', { name: 'Intercontinental Exchange' }],
  ['IEMG/USD', { name: 'Core MSCI Emerging Markets ETF' }],
  ['INTC/USD', { name: 'Intel' }],
  ['JD/USD', { name: 'JD.com' }],
  ['JNJ/USD', { name: 'Johnson & Johnson' }],
  ['JPM/USD', { name: 'JPMorgan Chase' }],
  ['KO/USD', { name: 'Coca-Cola' }],
  ['LCID/USD', { name: 'Lucid Group' }],
  ['LECO/USD', { name: 'Lincoln Electric' }],
  ['LI/USD', { name: 'Li Auto' }],
  ['LIDR/USD', { name: 'AEye Inc.' }],
  ['LLY/USD', { name: 'Eli Lilly' }],
  ['LMND/USD', { name: 'Lemonade' }],
  ['LMT/USD', { name: 'Lockheed Martin' }],
  ['LNC/USD', { name: 'Lincoln National' }],
  ['LOW/USD', { name: "Lowe's" }],
  ['LRCX/USD', { name: 'Lam Research' }],
  ['LYFT/USD', { name: 'Lyft' }],
  ['MAA/USD', { name: 'Mid-America Apartment' }],
  ['MCD/USD', { name: "McDonald's" }],
  ['MCK/USD', { name: 'McKesson' }],
  ['MCO/USD', { name: "Moody's" }],
  ['MDB/USD', { name: 'MongoDB' }],
  ['MDLZ/USD', { name: 'Mondelez International' }],
  ['MDT/USD', { name: 'Medtronic' }],
  ['MET/USD', { name: 'MetLife' }],
  ['META/USD', { name: 'Meta Platforms' }],
  ['MMM/USD', { name: '3M' }],
  ['MO/USD', { name: 'Altria Group' }],
  ['MOH/USD', { name: 'Molina Healthcare' }],
  ['MPC/USD', { name: 'Marathon Petroleum' }],
  ['MRK/USD', { name: 'Merck' }],
  ['MRNA/USD', { name: 'Moderna' }],
  ['MRVL/USD', { name: 'Marvell Technology' }],
  ['MS/USD', { name: 'Morgan Stanley' }],
  ['MSCI/USD', { name: 'MSCI Inc.' }],
  ['MSFT/USD', { name: 'Microsoft' }],
  ['MSTR/USD', { name: 'MicroStrategy', is24_7: true }],
  ['MTCH/USD', { name: 'Match Group' }],
  ['NBIX/USD', { name: 'Neurocrine Biosciences' }],
  ['NDAQ/USD', { name: 'Nasdaq Inc.' }],
  ['NEE/USD', { name: 'NextEra Energy' }],
  ['NET/USD', { name: 'Cloudflare' }],
  ['NFLX/USD', { name: 'Netflix' }],
  ['NIO/USD', { name: 'NIO' }],
  ['NKE/USD', { name: 'Nike' }],
  ['NOW/USD', { name: 'ServiceNow' }],
  ['NTES/USD', { name: 'NetEase' }],
  ['NTNX/USD', { name: 'Nutanix' }],
  ['NVAX/USD', { name: 'Novavax' }],
  ['NVDA/USD', { name: 'Nvidia', is24_7: true }],
  ['NVO/USD', { name: 'Novo Nordisk' }],
  ['NVT/USD', { name: 'nVent Electric' }],
  ['NWS/USD', { name: 'News Corporation (B)' }],
  ['NWSA/USD', { name: 'News Corporation (A)' }],
  ['O/USD', { name: 'Realty Income' }],
  ['OPEN/USD', { name: 'Opendoor Technologies' }],
  ['ORCL/USD', { name: 'Oracle' }],
  ['OXY/USD', { name: 'Occidental Petroleum' }],
  ['PANW/USD', { name: 'Palo Alto Networks' }],
  ['PARA/USD', { name: 'Paramount Global' }],
  ['PATH/USD', { name: 'UiPath' }],
  ['PCG/USD', { name: 'PG&E' }],
  ['PDD/USD', { name: 'PDD Holdings' }],
  ['PEP/USD', { name: 'PepsiCo' }],
  ['PFE/USD', { name: 'Pfizer' }],
  ['PG/USD', { name: 'Procter & Gamble' }],
  ['PGR/USD', { name: 'Progressive' }],
  ['PH/USD', { name: 'Parker-Hannifin' }],
  ['PLD/USD', { name: 'Prologis' }],
  ['PLTR/USD', { name: 'Palantir' }],
  ['PLUG/USD', { name: 'Plug Power' }],
  ['PM/USD', { name: 'Philip Morris International' }],
  ['PNR/USD', { name: 'Pentair' }],
  ['PRU/USD', { name: 'Prudential Financial' }],
  ['PSA/USD', { name: 'Public Storage' }],
  ['PSX/USD', { name: 'Phillips 66' }],
  ['PWR/USD', { name: 'Quanta Services' }],
  ['PYPL/USD', { name: 'PayPal' }],
  ['QCOM/USD', { name: 'Qualcomm' }],
  ['QQQ/USD', { name: 'Nasdaq 100 ETF', is24_7: true }],
  ['RBLX/USD', { name: 'Roblox' }],
  ['REGN/USD', { name: 'Regeneron' }],
  ['RGEN/USD', { name: 'Repligen' }],
  ['RIVN/USD', { name: 'Rivian' }],
  ['RKT/USD', { name: 'Rocket Companies' }],
  ['RMD/USD', { name: 'ResMed' }],
  ['ROK/USD', { name: 'Rockwell Automation' }],
  ['ROOT/USD', { name: 'Root Inc.' }],
  ['ROP/USD', { name: 'Roper Technologies' }],
  ['RTX/USD', { name: 'RTX Corporation' }],
  ['SAGE/USD', { name: 'Sage Therapeutics' }],
  ['SAP/USD', { name: 'SAP' }],
  ['SHEL/USD', { name: 'Shell' }],
  ['SHOP/USD', { name: 'Shopify' }],
  ['SLB/USD', { name: 'Schlumberger' }],
  ['SNDK/USD', { name: 'SanDisk' }],
  ['SNOW/USD', { name: 'Snowflake' }],
  ['SO/USD', { name: 'Southern Company' }],
  ['SOFI/USD', { name: 'SoFi Technologies' }],
  ['SPG/USD', { name: 'Simon Property Group' }],
  ['SPGI/USD', { name: 'S&P Global' }],
  ['SPY/USD', { name: 'S&P 500 ETF', is24_7: true }],
  ['SRE/USD', { name: 'Sempra Energy' }],
  ['STZ/USD', { name: 'Constellation Brands' }],
  ['SUI/USD', { name: 'Sun Communities' }],
  ['SUPN/USD', { name: 'Supernus Pharmaceuticals' }],
  ['T/USD', { name: 'AT&T' }],
  ['TAL/USD', { name: 'TAL Education' }],
  ['TAP/USD', { name: 'Molson Coors' }],
  ['TER/USD', { name: 'Teradyne' }],
  ['TEVA/USD', { name: 'Teva Pharmaceuticals' }],
  ['TGT/USD', { name: 'Target' }],
  ['THC/USD', { name: 'Tenet Healthcare' }],
  ['TME/USD', { name: 'Tencent Music' }],
  ['TMO/USD', { name: 'Thermo Fisher Scientific' }],
  ['TMUS/USD', { name: 'T-Mobile' }],
  ['TONX/USD', { name: 'TONX Inc.' }],
  ['TOTL/USD', { name: 'DoubleLine Total Return ETF' }],
  ['TRV/USD', { name: 'Travelers' }],
  ['TSLA/USD', { name: 'Tesla', is24_7: true }],
  ['TT/USD', { name: 'Trane Technologies' }],
  ['TXN/USD', { name: 'Texas Instruments' }],
  ['UBER/USD', { name: 'Uber' }],
  ['UHS/USD', { name: 'Universal Health Services' }],
  ['UL/USD', { name: 'Unilever' }],
  ['UPS/USD', { name: 'UPS' }],
  ['URI/USD', { name: 'United Rentals' }],
  ['UWMC/USD', { name: 'UWM Holdings' }],
  ['VIA/USD', { name: 'Via Renewables' }],
  ['VICI/USD', { name: 'VICI Properties' }],
  ['VLO/USD', { name: 'Valero Energy' }],
  ['VOYA/USD', { name: 'Voya Financial' }],
  ['VRTX/USD', { name: 'Vertex Pharmaceuticals' }],
  ['VTRS/USD', { name: 'Viatris' }],
  ['VZ/USD', { name: 'Verizon' }],
  ['WBA/USD', { name: 'Walgreens Boots Alliance' }],
  ['WBD/USD', { name: 'Warner Bros. Discovery' }],
  ['WFC/USD', { name: 'Wells Fargo' }],
  ['XBI/USD', { name: 'SPDR S&P Biotech ETF' }],
  ['XEL/USD', { name: 'Xcel Energy' }],
  ['XOM/USD', { name: 'ExxonMobil' }],
  ['XPEV/USD', { name: 'XPeng' }],
  ['XYL/USD', { name: 'Xylem' }],
  ['XYZ/USD', { name: 'Block (XYZ)' }],
  ['ZTS/USD', { name: 'Zoetis' }],
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

/**
 * B79.0c (named) / B79.0L (semantics corrected 2026-05-10) / B-NEW-30
 * (2026-05-13: derived from XSTOCK_SPOT_REGISTRY) — xstock_spot Phase-1
 * EXTENDED-HOURS symbols.
 *
 * **NAMING NOTE: NOT actually 24/7.** Per Kyle directive 2026-05-10:
 * xStocks (including these Phase-1 names) are closed Friday 8PM ET → Sunday
 * 8PM ET (48-hour weekend window). The Phase-1 names trade CONTINUOUSLY
 * during the 120-hour open window (Sun 8PM ET → Fri 8PM ET) — that's the
 * extended-hours benefit vs other xStocks. They are NOT 24/7.
 *
 * The constant name `XSTOCK_SPOT_24_7_SYMBOLS` is preserved from B79.0c for
 * stability across many call sites; cosmetic rename to
 * `XSTOCK_SPOT_EXTENDED_HOURS_SYMBOLS` is queued for a future batch.
 *
 * Per Kraken Phase 1 announcement (2025-12-03) at
 * https://blog.kraken.com/news/xstocks-247-trading — ten xStock tokens trade
 * extended hours, not the ARCA-aligned schedule the rest follow.
 *
 * B-NEW-30: DERIVED from `XSTOCK_SPOT_REGISTRY` via the `is24_7` flag.
 * To add or remove a Phase-1 name, edit the corresponding entry in the
 * registry. This set is recomputed at module-load time.
 *
 * Consumed by `isXstockMarketOpenUTC(symbol, now?)` which applies the global
 * Fri-Sun weekend close to ALL xStocks first, then bypasses the daily ARCA
 * gate for these names within the open window. All 10 must already exist in
 * XSTOCK_SPOT_SYMBOLS — invariant now enforced by construction (subset of
 * registry keys).
 */
export const XSTOCK_SPOT_24_7_SYMBOLS: ReadonlySet<string> = new Set(
  Array.from(XSTOCK_SPOT_REGISTRY.entries())
    .filter(([, meta]) => meta.is24_7 === true)
    .map(([pair]) => pair),
);

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
