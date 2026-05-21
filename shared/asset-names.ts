/**
 * BATCH_80 (2026-05-13) / B-NEW-30 (2026-05-13) — Symbol → asset-name lookup
 *
 * Maps the base symbol (the part before the quote currency) to the full
 * asset name for UI display in the Open/Closed Simulated Trades tables
 * per Kyle directive 2026-05-13: render the specific asset name between
 * the trading pair and the asset-class badge.
 *
 *   BTC/USD   → "Bitcoin"      → renders under "BTC/USD" / above "Crypto Spot"
 *   AAPL/USD  → "Apple"        → renders under "AAPL/USD" / above "xStock Spot"
 *   SOL/USD   → "Solana"
 *
 * B-NEW-30 architecture (2026-05-13):
 *   - **xstock**: names now live in `shared/asset-classes.ts::XSTOCK_SPOT_REGISTRY`
 *     alongside the universe definition. Adding a new xStock = edit one entry in
 *     ONE file; `name` is type-required (compile error if forgotten). The
 *     standalone `XSTOCK_NAMES` map that lived here has been REMOVED — its
 *     contents are now in the registry.
 *   - **crypto**: names still live in `CRYPTO_NAMES` below because the crypto
 *     universe is dynamic (Kraken adds tokens regularly without dev review).
 *     Unmapped symbols fall back to the base ticker (e.g. FOO/USD → "FOO")
 *     and emit a one-time console.warn so the gap is observable.
 *
 * Lives in `shared/` so server + client both import from one place.
 */
import { getXstockName } from './asset-classes.js';

/**
 * B79.0n.UD-HOTFIX (2026-05-21): client-side overlay map for xStock names.
 * The XSTOCK_SPOT_REGISTRY in shared/asset-classes.ts is bundled empty into
 * the client (it gets dynamically populated at server boot from the DB).
 * The frontend fetches /api/xstocks/asset-names once on app mount and calls
 * setXstockNameOverlay() to populate this overlay. getAssetName() consults
 * this overlay BEFORE falling through to the (empty client-side) registry.
 *
 * Server-side, this overlay stays empty — server reads directly from the
 * populated registry. No behavior change server-side.
 */
const _xstockNameOverlay = new Map<string, string>();

export function setXstockNameOverlay(entries: Record<string, string>): void {
  _xstockNameOverlay.clear();
  for (const [symbol, name] of Object.entries(entries)) {
    if (symbol && name) _xstockNameOverlay.set(symbol, name);
  }
}

export function _getXstockNameOverlaySize(): number {
  return _xstockNameOverlay.size;
}

/** Crypto top symbols seen across the universe (active trades + benchmarks). */
export const CRYPTO_NAMES: Record<string, string> = {
  // ─── Top 50 by market cap (rough order) ────────────────────────────────
  BTC: 'Bitcoin',
  XBT: 'Bitcoin',          // Kraken legacy alias
  ETH: 'Ethereum',
  USDT: 'Tether',
  USDC: 'USD Coin',
  BNB: 'BNB',
  XRP: 'XRP',
  SOL: 'Solana',
  ADA: 'Cardano',
  DOGE: 'Dogecoin',
  TRX: 'Tron',
  TON: 'Toncoin',
  AVAX: 'Avalanche',
  LINK: 'Chainlink',
  DOT: 'Polkadot',
  MATIC: 'Polygon',
  LTC: 'Litecoin',
  BCH: 'Bitcoin Cash',
  NEAR: 'NEAR Protocol',
  XLM: 'Stellar',
  UNI: 'Uniswap',
  ATOM: 'Cosmos',
  XMR: 'Monero',
  ETC: 'Ethereum Classic',
  ALGO: 'Algorand',
  APT: 'Aptos',
  SUI: 'Sui',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  AAVE: 'Aave',
  GRT: 'The Graph',
  RENDER: 'Render',
  IMX: 'Immutable',
  FIL: 'Filecoin',
  HBAR: 'Hedera',
  INJ: 'Injective',
  TIA: 'Celestia',
  FET: 'Fetch.ai',
  CRV: 'Curve DAO',
  LDO: 'Lido DAO',
  COMP: 'Compound',
  MKR: 'Maker',
  SNX: 'Synthetix',
  RUNE: 'THORChain',
  ENA: 'Ethena',
  PENDLE: 'Pendle',
  EIGEN: 'EigenLayer',
  EUL: 'Euler',
  STX: 'Stacks',
  KAS: 'Kaspa',
  // ─── DeFi / mid-cap ────────────────────────────────────────────────────
  CVX: 'Convex Finance',
  YFI: 'yearn.finance',
  BAL: 'Balancer',
  '1INCH': '1inch',
  GMX: 'GMX',
  DYDX: 'dYdX',
  ZRO: 'LayerZero',
  ARKM: 'Arkham',
  SAFE: 'Safe',
  RPL: 'Rocket Pool',
  ANKR: 'Ankr',
  ETHFI: 'ether.fi',
  ETHX: 'Stader ETHx',
  RETH: 'Rocket Pool ETH',
  STETH: 'Lido Staked ETH',
  CBETH: 'Coinbase Wrapped Staked ETH',
  // ─── Privacy / Layer 1 alts ────────────────────────────────────────────
  ZEC: 'Zcash',
  DASH: 'Dash',
  XTZ: 'Tezos',
  EOS: 'EOS',
  FTM: 'Fantom',
  ROSE: 'Oasis Network',
  KSM: 'Kusama',
  ICP: 'Internet Computer',
  FLOW: 'Flow',
  MINA: 'Mina',
  CKB: 'Nervos Network',
  // ─── Gaming / metaverse / NFT ──────────────────────────────────────────
  AXS: 'Axie Infinity',
  SAND: 'The Sandbox',
  MANA: 'Decentraland',
  GALA: 'Gala',
  ENJ: 'Enjin Coin',
  CHZ: 'Chiliz',
  IMX_OLD: 'Immutable X',
  APE: 'ApeCoin',
  LRC: 'Loopring',
  // ─── Memecoins / community ─────────────────────────────────────────────
  SHIB: 'Shiba Inu',
  PEPE: 'Pepe',
  FLOKI: 'Floki',
  BONK: 'Bonk',
  WIF: 'dogwifhat',
  TURBO: 'Turbo',
  NEIRO: 'Neiro',
  MOG: 'Mog Coin',
  // ─── Active-universe extras (from live scan) ───────────────────────────
  AKT: 'Akash Network',
  AVNT: 'Aventus',
  AZTEC: 'Aztec',
  BANANAS31: 'BananaS31',
  BAT: 'Basic Attention Token',
  BERA: 'Berachain',
  BILL: 'BILL',
  BASED: 'Based',
  CC: 'CC',
  CHIP: 'CHIP',
  COTI: 'COTI',
  CRO: 'Cronos',
  ENA_OLD: 'Ethena',
  FLR: 'Flare',
  ICNT: 'Impossible Cloud Network',
  IP: 'Story Protocol',
  JST: 'JUST',
  KTA: 'Keeta',
  LPT: 'Livepeer',
  MON: 'Monad',
  MOVR: 'Moonriver',
  NIGHT: 'Night',
  PEAQ: 'peaq',
  PLAY: 'PLAY',
  PTB: 'PTB',
  RIVER: 'River',
  ROBO: 'Robonomics',
  ROOT: 'The Root Network',
  SAPIEN: 'Sapien',
  SAGA: 'Saga',
  SNDK: 'SNDK',
  STBL: 'STBL',
  STABLE: 'Stable',
  SUPER: 'SuperVerse',
  SXT: 'Space and Time',
  TEL: 'Telcoin',
  TRIA: 'TRIA',
  USELESS: 'Useless Coin',
  WAL: 'Walrus',
  XAN: 'XAN',
  XDC: 'XDC Network',
  XMN: 'XMN',
  XNY: 'XNY',
  XPL: 'XPL',
  XYZ: 'XYZ',
  ZBT: 'ZBT',
  // ─── Stablecoins / wrapped ─────────────────────────────────────────────
  DAI: 'Dai',
  TUSD: 'TrueUSD',
  WBTC: 'Wrapped Bitcoin',
  WETH: 'Wrapped Ether',
  PYUSD: 'PayPal USD',
  FDUSD: 'First Digital USD',
  GUSD: 'Gemini Dollar',
};


/**
 * Look up the human-readable asset name for a trading pair.
 * Splits on '/' to extract the base symbol (crypto path) or uses the full
 * pair (xstock path), then consults the appropriate source:
 *   - crypto: `CRYPTO_NAMES` map above
 *   - xstock: `XSTOCK_SPOT_REGISTRY` in asset-classes.ts (via getXstockName)
 *
 * B-NEW-30: fail-loud fallback for unmapped symbols. Returns the base ticker
 * (e.g. "FOO" for FOO/USD) and emits a one-time console.warn so the gap is
 * observable. Never returns null for live trading pairs — only returns null
 * if pair/assetClass is itself null/undefined.
 *
 * @param pair    e.g. "BTC/USD", "AAPL/USD", "SOL/EUR"
 * @param assetClass  e.g. "crypto_spot", "xstock_spot"
 */
const _warnedSymbols = new Set<string>();
function _warnUnmappedOnce(pair: string, assetClass: string): void {
  const key = assetClass + ':' + pair;
  if (_warnedSymbols.has(key)) return;
  _warnedSymbols.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    '[B-NEW-30][asset-names] unmapped symbol falling back to base ticker. ' +
    'pair=' + pair + ' assetClass=' + assetClass + '. ' +
    'Add an entry to shared/asset-classes.ts::XSTOCK_SPOT_REGISTRY (xstock) ' +
    'or shared/asset-names.ts::CRYPTO_NAMES (crypto).'
  );
}

export function getAssetName(
  pair: string | null | undefined,
  assetClass: string | null | undefined,
): string | null {
  if (!pair || !assetClass) return null;
  const baseSymbol = pair.split('/')[0]?.toUpperCase();
  if (!baseSymbol) return null;

  if (assetClass.startsWith('crypto')) {
    const name = CRYPTO_NAMES[baseSymbol];
    if (name) return name;
    _warnUnmappedOnce(pair, assetClass);
    return baseSymbol; // fail-loud fallback: show ticker, not blank
  }

  if (assetClass.startsWith('xstock') || assetClass.startsWith('equity')) {
    // B79.0n.UD-HOTFIX: check client-side overlay first. The XSTOCK_SPOT_REGISTRY
    // bundled into the client is empty post-B79.0n.UNIVERSE-DISCOVERY (registry
    // is server-side dynamic). Frontend fetches /api/xstocks/asset-names once
    // and calls setXstockNameOverlay() to populate the overlay.
    const overlay = _xstockNameOverlay.get(pair);
    if (overlay) return overlay;
    // B-NEW-30 server-side path: read from SSOT registry in asset-classes.ts.
    // getXstockName takes the FULL pair (e.g. 'AAPL/USD'), not just the base symbol.
    const name = getXstockName(pair);
    if (name) return name;
    _warnUnmappedOnce(pair, assetClass);
    return baseSymbol;
  }

  return null;
}
