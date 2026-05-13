/**
 * BATCH_80 (2026-05-13) — Symbol → asset-name lookup
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
 * Structure:
 *   - `CRYPTO_NAMES`  — base symbol → name for cryptocurrencies
 *   - `XSTOCK_NAMES`  — base symbol → name for Backed Finance tokenized equities
 *
 * Fallback: `getAssetName()` returns null if the symbol isn't in the map
 * (UI renders nothing in that line — safer than guessing). Maintain by
 * adding entries here when new pairs enter the universe.
 *
 * Lives in `shared/` so server + client both import from one place.
 */

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
 * Backed Finance xStock tokenized equities universe.
 * These are Solana-resident tokens that track Nasdaq / NYSE equities.
 * The base symbol is the underlying ticker (AAPL, TSLA, NVDA, ...).
 */
export const XSTOCK_NAMES: Record<string, string> = {
  // ─── Mega-cap tech ─────────────────────────────────────────────────────
  AAPL: 'Apple',
  MSFT: 'Microsoft',
  GOOG: 'Alphabet',
  GOOGL: 'Alphabet',
  AMZN: 'Amazon',
  META: 'Meta Platforms',
  NVDA: 'Nvidia',
  TSLA: 'Tesla',
  NFLX: 'Netflix',
  ADBE: 'Adobe',
  ORCL: 'Oracle',
  CRM: 'Salesforce',
  AVGO: 'Broadcom',
  AMD: 'AMD',
  INTC: 'Intel',
  CSCO: 'Cisco Systems',
  IBM: 'IBM',
  TXN: 'Texas Instruments',
  AMAT: 'Applied Materials',
  MU: 'Micron Technology',
  MRVL: 'Marvell Technology',
  NXPI: 'NXP Semiconductors',
  ANET: 'Arista Networks',
  PANW: 'Palo Alto Networks',
  CRWD: 'CrowdStrike',
  SNOW: 'Snowflake',
  PLTR: 'Palantir',
  // ─── ETFs ──────────────────────────────────────────────────────────────
  SPY: 'S&P 500 ETF',
  QQQ: 'Nasdaq 100 ETF',
  GLD: 'Gold ETF',
  SLV: 'Silver ETF',
  IWM: 'Russell 2000 ETF',
  DIA: 'Dow Jones ETF',
  EEM: 'Emerging Markets ETF',
  EFA: 'EAFE ETF',
  TLT: '20+ Year Treasury ETF',
  VTI: 'Total Stock Market ETF',
  // ─── Crypto-exposure equities ──────────────────────────────────────────
  COIN: 'Coinbase',
  HOOD: 'Robinhood',
  MSTR: 'MicroStrategy',
  RIOT: 'Riot Platforms',
  MARA: 'Marathon Digital',
  HUT: 'Hut 8 Mining',
  CIFR: 'Cipher Mining',
  CLSK: 'CleanSpark',
  BITF: 'Bitfarms',
  CORZ: 'Core Scientific',
  // ─── Finance / banks ───────────────────────────────────────────────────
  JPM: 'JPMorgan Chase',
  BAC: 'Bank of America',
  WFC: 'Wells Fargo',
  C: 'Citigroup',
  GS: 'Goldman Sachs',
  MS: 'Morgan Stanley',
  V: 'Visa',
  MA: 'Mastercard',
  AXP: 'American Express',
  PYPL: 'PayPal',
  SQ: 'Block',
  // ─── Consumer / retail ─────────────────────────────────────────────────
  WMT: 'Walmart',
  COST: 'Costco',
  TGT: 'Target',
  HD: 'Home Depot',
  LOW: "Lowe's",
  MCD: "McDonald's",
  SBUX: 'Starbucks',
  KO: 'Coca-Cola',
  PEP: 'PepsiCo',
  NKE: 'Nike',
  // ─── Healthcare / pharma ───────────────────────────────────────────────
  JNJ: 'Johnson & Johnson',
  PFE: 'Pfizer',
  MRK: 'Merck',
  ABBV: 'AbbVie',
  LLY: 'Eli Lilly',
  UNH: 'UnitedHealth Group',
  CVS: 'CVS Health',
  HUM: 'Humana',
  MRNA: 'Moderna',
  BNTX: 'BioNTech',
  REGN: 'Regeneron',
  // ─── Energy / utilities ────────────────────────────────────────────────
  XOM: 'ExxonMobil',
  CVX: 'Chevron',
  COP: 'ConocoPhillips',
  OXY: 'Occidental Petroleum',
  EQT: 'EQT Corporation',
  NEE: 'NextEra Energy',
  DUK: 'Duke Energy',
  AEP: 'American Electric Power',
  FCEL: 'FuelCell Energy',
  PLUG: 'Plug Power',
  BE: 'Bloom Energy',
  BLDP: 'Ballard Power',
  // ─── Chinese ADRs ──────────────────────────────────────────────────────
  BABA: 'Alibaba',
  BIDU: 'Baidu',
  JD: 'JD.com',
  PDD: 'PDD Holdings',
  NIO: 'NIO',
  XPEV: 'XPeng',
  LI: 'Li Auto',
  TME: 'Tencent Music',
  BILI: 'Bilibili',
  // ─── Industrials / aerospace ───────────────────────────────────────────
  BA: 'Boeing',
  CAT: 'Caterpillar',
  DE: 'Deere & Company',
  GE: 'GE Aerospace',
  GEV: 'GE Vernova',
  HON: 'Honeywell',
  LMT: 'Lockheed Martin',
  RTX: 'RTX Corporation',
  // ─── Communications / media ────────────────────────────────────────────
  DIS: 'Disney',
  CMCSA: 'Comcast',
  T: 'AT&T',
  VZ: 'Verizon',
  PARA: 'Paramount Global',
  // ─── Active xstock universe (Backed Finance issued) ────────────────────
  CRCL: 'Circle',
  SPGI: 'S&P Global',
  ROOT: 'Root Inc.',
  XYZ: 'Block (XYZ)',
  LMND: 'Lemonade',
  SNDK: 'SanDisk',
  VIA: 'Via Renewables',
  ICNT: 'Intercontinental Exchange',
  TX: 'Ternium',
  TRIA: 'Tria',
  // ─── Speculative / SPAC / small cap ────────────────────────────────────
  FREYR: 'FREYR Battery',
  BLNK: 'Blink Charging',
  EVGO: 'EVgo',
  CHPT: 'ChargePoint',
};

/**
 * Look up the human-readable asset name for a trading pair.
 * Splits on '/' to extract the base symbol, then consults the appropriate
 * registry based on assetClass. Returns null if the symbol isn't mapped —
 * UI should render nothing in that case rather than show a partial label.
 *
 * @param pair    e.g. "BTC/USD", "AAPL/USD", "SOL/EUR"
 * @param assetClass  e.g. "crypto_spot", "xstock_spot"
 */
export function getAssetName(
  pair: string | null | undefined,
  assetClass: string | null | undefined,
): string | null {
  if (!pair || !assetClass) return null;
  const baseSymbol = pair.split('/')[0]?.toUpperCase();
  if (!baseSymbol) return null;
  if (assetClass.startsWith('crypto')) {
    return CRYPTO_NAMES[baseSymbol] ?? null;
  }
  if (assetClass.startsWith('xstock')) {
    return XSTOCK_NAMES[baseSymbol] ?? null;
  }
  if (assetClass.startsWith('equity')) {
    return XSTOCK_NAMES[baseSymbol] ?? null; // reuse equity names
  }
  return null;
}
