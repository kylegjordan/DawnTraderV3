/**
 * Phase 8.8.3-I7: Kraken Canonical Symbol Mapping
 * 
 * Single source of truth for symbol translation between:
 * - Internal format (BASE/QUOTE): "AVAX/USD", "TON/USDC"
 * - Kraken REST API format: "XAVAXZUSD", "TONUSDC"
 * - Kraken WebSocket format: "AVAX/USD", "TON/USDC"
 * 
 * Key rules:
 * - AVAX/USD, AVAX/USDT, AVAX/USDC are DIFFERENT internal symbols
 * - No USDT→USD collapsing
 * - All components use internalSymbol for consistency
 */

export type KrakenPairMapping = {
  internalSymbol: string;    // Canonical format: "AVAX/USD"
  krakenRestPair: string;    // Kraken REST API: "XAVAXZUSD" or "AVAXUSD"
  krakenWsPair: string;      // Kraken WebSocket: "AVAX/USD"
  baseAsset: string;         // "AVAX"
  quoteAsset: string;        // "USD"
};

/**
 * Comprehensive Kraken symbol mappings
 * Based on Kraken asset legend and API documentation
 */
export const KRAKEN_SYMBOL_MAP: KrakenPairMapping[] = [
  // === USD Pairs ===
  { internalSymbol: "ADA/USD", krakenRestPair: "ADAUSD", krakenWsPair: "ADA/USD", baseAsset: "ADA", quoteAsset: "USD" },
  { internalSymbol: "ALGO/USD", krakenRestPair: "ALGOUSD", krakenWsPair: "ALGO/USD", baseAsset: "ALGO", quoteAsset: "USD" },
  { internalSymbol: "ATOM/USD", krakenRestPair: "ATOMUSD", krakenWsPair: "ATOM/USD", baseAsset: "ATOM", quoteAsset: "USD" },
  { internalSymbol: "AVAX/USD", krakenRestPair: "AVAXUSD", krakenWsPair: "AVAX/USD", baseAsset: "AVAX", quoteAsset: "USD" },
  { internalSymbol: "AUD/USD", krakenRestPair: "AUDUSD", krakenWsPair: "AUD/USD", baseAsset: "AUD", quoteAsset: "USD" },
  { internalSymbol: "BAND/USD", krakenRestPair: "BANDUSD", krakenWsPair: "BAND/USD", baseAsset: "BAND", quoteAsset: "USD" },
  { internalSymbol: "BAT/USD", krakenRestPair: "BATUSD", krakenWsPair: "BAT/USD", baseAsset: "BAT", quoteAsset: "USD" },
  { internalSymbol: "BCH/USD", krakenRestPair: "BCHUSD", krakenWsPair: "BCH/USD", baseAsset: "BCH", quoteAsset: "USD" },
  { internalSymbol: "BTC/USD", krakenRestPair: "XXBTZUSD", krakenWsPair: "XBT/USD", baseAsset: "BTC", quoteAsset: "USD" },
  { internalSymbol: "COMP/USD", krakenRestPair: "COMPUSD", krakenWsPair: "COMP/USD", baseAsset: "COMP", quoteAsset: "USD" },
  { internalSymbol: "CRV/USD", krakenRestPair: "CRVUSD", krakenWsPair: "CRV/USD", baseAsset: "CRV", quoteAsset: "USD" },
  { internalSymbol: "DASH/USD", krakenRestPair: "DASHUSD", krakenWsPair: "DASH/USD", baseAsset: "DASH", quoteAsset: "USD" },
  { internalSymbol: "DOT/USD", krakenRestPair: "DOTUSD", krakenWsPair: "DOT/USD", baseAsset: "DOT", quoteAsset: "USD" },
  { internalSymbol: "ENJ/USD", krakenRestPair: "ENJUSD", krakenWsPair: "ENJ/USD", baseAsset: "ENJ", quoteAsset: "USD" },
  { internalSymbol: "EOS/USD", krakenRestPair: "EOSUSD", krakenWsPair: "EOS/USD", baseAsset: "EOS", quoteAsset: "USD" },
  { internalSymbol: "ETH/USD", krakenRestPair: "XETHZUSD", krakenWsPair: "ETH/USD", baseAsset: "ETH", quoteAsset: "USD" },
  { internalSymbol: "ETC/USD", krakenRestPair: "ETCUSD", krakenWsPair: "ETC/USD", baseAsset: "ETC", quoteAsset: "USD" },
  { internalSymbol: "FIL/USD", krakenRestPair: "FILUSD", krakenWsPair: "FIL/USD", baseAsset: "FIL", quoteAsset: "USD" },
  { internalSymbol: "FLOW/USD", krakenRestPair: "FLOWUSD", krakenWsPair: "FLOW/USD", baseAsset: "FLOW", quoteAsset: "USD" },
  { internalSymbol: "FORTH/USD", krakenRestPair: "FORTHUSD", krakenWsPair: "FORTH/USD", baseAsset: "FORTH", quoteAsset: "USD" },
  { internalSymbol: "FXS/USD", krakenRestPair: "FXSUSD", krakenWsPair: "FXS/USD", baseAsset: "FXS", quoteAsset: "USD" },
  { internalSymbol: "GRT/USD", krakenRestPair: "GRTUSD", krakenWsPair: "GRT/USD", baseAsset: "GRT", quoteAsset: "USD" },
  { internalSymbol: "HNT/USD", krakenRestPair: "HNTUSD", krakenWsPair: "HNT/USD", baseAsset: "HNT", quoteAsset: "USD" },
  { internalSymbol: "ICX/USD", krakenRestPair: "ICXUSD", krakenWsPair: "ICX/USD", baseAsset: "ICX", quoteAsset: "USD" },
  { internalSymbol: "INJ/USD", krakenRestPair: "INJUSD", krakenWsPair: "INJ/USD", baseAsset: "INJ", quoteAsset: "USD" },
  { internalSymbol: "KAVA/USD", krakenRestPair: "KAVAUSD", krakenWsPair: "KAVA/USD", baseAsset: "KAVA", quoteAsset: "USD" },
  { internalSymbol: "KNC/USD", krakenRestPair: "KNCUSD", krakenWsPair: "KNC/USD", baseAsset: "KNC", quoteAsset: "USD" },
  { internalSymbol: "KSM/USD", krakenRestPair: "KSMUSD", krakenWsPair: "KSM/USD", baseAsset: "KSM", quoteAsset: "USD" },
  { internalSymbol: "LINK/USD", krakenRestPair: "LINKUSD", krakenWsPair: "LINK/USD", baseAsset: "LINK", quoteAsset: "USD" },
  { internalSymbol: "LRC/USD", krakenRestPair: "LRCUSD", krakenWsPair: "LRC/USD", baseAsset: "LRC", quoteAsset: "USD" },
  { internalSymbol: "LTC/USD", krakenRestPair: "XLTCZUSD", krakenWsPair: "LTC/USD", baseAsset: "LTC", quoteAsset: "USD" },
  { internalSymbol: "MANA/USD", krakenRestPair: "MANAUSD", krakenWsPair: "MANA/USD", baseAsset: "MANA", quoteAsset: "USD" },
  { internalSymbol: "MATIC/USD", krakenRestPair: "MATICUSD", krakenWsPair: "MATIC/USD", baseAsset: "MATIC", quoteAsset: "USD" },
  { internalSymbol: "MKR/USD", krakenRestPair: "MKRUSD", krakenWsPair: "MKR/USD", baseAsset: "MKR", quoteAsset: "USD" },
  { internalSymbol: "NANO/USD", krakenRestPair: "NANOUSD", krakenWsPair: "NANO/USD", baseAsset: "NANO", quoteAsset: "USD" },
  { internalSymbol: "NEAR/USD", krakenRestPair: "NEARUSD", krakenWsPair: "NEAR/USD", baseAsset: "NEAR", quoteAsset: "USD" },
  { internalSymbol: "NOS/USD", krakenRestPair: "NOSUSD", krakenWsPair: "NOS/USD", baseAsset: "NOS", quoteAsset: "USD" },
  { internalSymbol: "OMG/USD", krakenRestPair: "OMGUSD", krakenWsPair: "OMG/USD", baseAsset: "OMG", quoteAsset: "USD" },
  { internalSymbol: "ORCA/USD", krakenRestPair: "ORCAUSD", krakenWsPair: "ORCA/USD", baseAsset: "ORCA", quoteAsset: "USD" },
  { internalSymbol: "OXT/USD", krakenRestPair: "OXTUSD", krakenWsPair: "OXT/USD", baseAsset: "OXT", quoteAsset: "USD" },
  { internalSymbol: "PAXG/USD", krakenRestPair: "PAXGUSD", krakenWsPair: "PAXG/USD", baseAsset: "PAXG", quoteAsset: "USD" },
  { internalSymbol: "QTUM/USD", krakenRestPair: "QTUMUSD", krakenWsPair: "QTUM/USD", baseAsset: "QTUM", quoteAsset: "USD" },
  { internalSymbol: "RARI/USD", krakenRestPair: "RARIUSD", krakenWsPair: "RARI/USD", baseAsset: "RARI", quoteAsset: "USD" },
  { internalSymbol: "REN/USD", krakenRestPair: "RENUSD", krakenWsPair: "REN/USD", baseAsset: "REN", quoteAsset: "USD" },
  { internalSymbol: "REP/USD", krakenRestPair: "REPUSD", krakenWsPair: "REP/USD", baseAsset: "REP", quoteAsset: "USD" },
  { internalSymbol: "SAND/USD", krakenRestPair: "SANDUSD", krakenWsPair: "SAND/USD", baseAsset: "SAND", quoteAsset: "USD" },
  { internalSymbol: "SC/USD", krakenRestPair: "SCUSD", krakenWsPair: "SC/USD", baseAsset: "SC", quoteAsset: "USD" },
  { internalSymbol: "SNX/USD", krakenRestPair: "SNXUSD", krakenWsPair: "SNX/USD", baseAsset: "SNX", quoteAsset: "USD" },
  { internalSymbol: "SOL/USD", krakenRestPair: "SOLUSD", krakenWsPair: "SOL/USD", baseAsset: "SOL", quoteAsset: "USD" },
  { internalSymbol: "STORJ/USD", krakenRestPair: "STORJUSD", krakenWsPair: "STORJ/USD", baseAsset: "STORJ", quoteAsset: "USD" },
  { internalSymbol: "SUSHI/USD", krakenRestPair: "SUSHIUSD", krakenWsPair: "SUSHI/USD", baseAsset: "SUSHI", quoteAsset: "USD" },
  { internalSymbol: "TRX/USD", krakenRestPair: "TRXUSD", krakenWsPair: "TRX/USD", baseAsset: "TRX", quoteAsset: "USD" },
  { internalSymbol: "TRUMP/USD", krakenRestPair: "TRUMPUSD", krakenWsPair: "TRUMP/USD", baseAsset: "TRUMP", quoteAsset: "USD" },
  { internalSymbol: "UNI/USD", krakenRestPair: "UNIUSD", krakenWsPair: "UNI/USD", baseAsset: "UNI", quoteAsset: "USD" },
  { internalSymbol: "WAVES/USD", krakenRestPair: "WAVESUSD", krakenWsPair: "WAVES/USD", baseAsset: "WAVES", quoteAsset: "USD" },
  { internalSymbol: "XLM/USD", krakenRestPair: "XXLMZUSD", krakenWsPair: "XLM/USD", baseAsset: "XLM", quoteAsset: "USD" },
  { internalSymbol: "XMR/USD", krakenRestPair: "XXMRZUSD", krakenWsPair: "XMR/USD", baseAsset: "XMR", quoteAsset: "USD" },
  { internalSymbol: "XRP/USD", krakenRestPair: "XXRPZUSD", krakenWsPair: "XRP/USD", baseAsset: "XRP", quoteAsset: "USD" },
  { internalSymbol: "XTZ/USD", krakenRestPair: "XTZUSD", krakenWsPair: "XTZ/USD", baseAsset: "XTZ", quoteAsset: "USD" },
  { internalSymbol: "YFI/USD", krakenRestPair: "YFIUSD", krakenWsPair: "YFI/USD", baseAsset: "YFI", quoteAsset: "USD" },
  { internalSymbol: "ZEC/USD", krakenRestPair: "XZECZUSD", krakenWsPair: "ZEC/USD", baseAsset: "ZEC", quoteAsset: "USD" },
  { internalSymbol: "ZRX/USD", krakenRestPair: "ZRXUSD", krakenWsPair: "ZRX/USD", baseAsset: "ZRX", quoteAsset: "USD" },

  // === EUR Pairs ===
  { internalSymbol: "ADA/EUR", krakenRestPair: "ADAEUR", krakenWsPair: "ADA/EUR", baseAsset: "ADA", quoteAsset: "EUR" },
  { internalSymbol: "ATOM/EUR", krakenRestPair: "ATOMEUR", krakenWsPair: "ATOM/EUR", baseAsset: "ATOM", quoteAsset: "EUR" },
  { internalSymbol: "AVAX/EUR", krakenRestPair: "AVAXEUR", krakenWsPair: "AVAX/EUR", baseAsset: "AVAX", quoteAsset: "EUR" },
  { internalSymbol: "BTC/EUR", krakenRestPair: "XXBTZEUR", krakenWsPair: "XBT/EUR", baseAsset: "BTC", quoteAsset: "EUR" },
  { internalSymbol: "DOT/EUR", krakenRestPair: "DOTEUR", krakenWsPair: "DOT/EUR", baseAsset: "DOT", quoteAsset: "EUR" },
  { internalSymbol: "ETH/EUR", krakenRestPair: "XETHZEUR", krakenWsPair: "ETH/EUR", baseAsset: "ETH", quoteAsset: "EUR" },
  { internalSymbol: "EUR/USD", krakenRestPair: "ZEURZUSD", krakenWsPair: "EUR/USD", baseAsset: "EUR", quoteAsset: "USD" },
  { internalSymbol: "INJ/EUR", krakenRestPair: "INJEUR", krakenWsPair: "INJ/EUR", baseAsset: "INJ", quoteAsset: "EUR" },
  { internalSymbol: "LINK/EUR", krakenRestPair: "LINKEUR", krakenWsPair: "LINK/EUR", baseAsset: "LINK", quoteAsset: "EUR" },
  { internalSymbol: "LTC/EUR", krakenRestPair: "XLTCZEUR", krakenWsPair: "LTC/EUR", baseAsset: "LTC", quoteAsset: "EUR" },
  { internalSymbol: "SOL/EUR", krakenRestPair: "SOLEUR", krakenWsPair: "SOL/EUR", baseAsset: "SOL", quoteAsset: "EUR" },
  { internalSymbol: "XRP/EUR", krakenRestPair: "XXRPZEUR", krakenWsPair: "XRP/EUR", baseAsset: "XRP", quoteAsset: "EUR" },
  { internalSymbol: "XTZ/EUR", krakenRestPair: "XTZEUR", krakenWsPair: "XTZ/EUR", baseAsset: "XTZ", quoteAsset: "EUR" },
  
  // === GBP Pairs ===
  { internalSymbol: "BTC/GBP", krakenRestPair: "XXBTZGBP", krakenWsPair: "XBT/GBP", baseAsset: "BTC", quoteAsset: "GBP" },
  { internalSymbol: "DOT/GBP", krakenRestPair: "DOTGBP", krakenWsPair: "DOT/GBP", baseAsset: "DOT", quoteAsset: "GBP" },
  { internalSymbol: "ETH/GBP", krakenRestPair: "XETHZGBP", krakenWsPair: "ETH/GBP", baseAsset: "ETH", quoteAsset: "GBP" },
  { internalSymbol: "GBP/USD", krakenRestPair: "GBPUSD", krakenWsPair: "GBP/USD", baseAsset: "GBP", quoteAsset: "USD" },

  // === CHF Pairs ===
  { internalSymbol: "USD/CHF", krakenRestPair: "USDCHF", krakenWsPair: "USD/CHF", baseAsset: "USD", quoteAsset: "CHF" },
  { internalSymbol: "BTC/CHF", krakenRestPair: "XBTCHF", krakenWsPair: "XBT/CHF", baseAsset: "BTC", quoteAsset: "CHF" },
  { internalSymbol: "ETH/CHF", krakenRestPair: "ETHCHF", krakenWsPair: "ETH/CHF", baseAsset: "ETH", quoteAsset: "CHF" },

  // === JPY Pairs ===
  { internalSymbol: "USD/JPY", krakenRestPair: "ZUSDZJPY", krakenWsPair: "USD/JPY", baseAsset: "USD", quoteAsset: "JPY" },
  { internalSymbol: "BTC/JPY", krakenRestPair: "XXBTZJPY", krakenWsPair: "XBT/JPY", baseAsset: "BTC", quoteAsset: "JPY" },
  { internalSymbol: "ETH/JPY", krakenRestPair: "XETHZJPY", krakenWsPair: "ETH/JPY", baseAsset: "ETH", quoteAsset: "JPY" },

  // === USDT Pairs (kept separate from USD) ===
  { internalSymbol: "ADA/USDT", krakenRestPair: "ADAUSDT", krakenWsPair: "ADA/USDT", baseAsset: "ADA", quoteAsset: "USDT" },
  { internalSymbol: "AVAX/USDT", krakenRestPair: "AVAXUSDT", krakenWsPair: "AVAX/USDT", baseAsset: "AVAX", quoteAsset: "USDT" },
  { internalSymbol: "BTC/USDT", krakenRestPair: "XBTUSDT", krakenWsPair: "XBT/USDT", baseAsset: "BTC", quoteAsset: "USDT" },
  { internalSymbol: "DOT/USDT", krakenRestPair: "DOTUSDT", krakenWsPair: "DOT/USDT", baseAsset: "DOT", quoteAsset: "USDT" },
  { internalSymbol: "ETH/USDT", krakenRestPair: "ETHUSDT", krakenWsPair: "ETH/USDT", baseAsset: "ETH", quoteAsset: "USDT" },
  { internalSymbol: "LINK/USDT", krakenRestPair: "LINKUSDT", krakenWsPair: "LINK/USDT", baseAsset: "LINK", quoteAsset: "USDT" },
  { internalSymbol: "LTC/USDT", krakenRestPair: "LTCUSDT", krakenWsPair: "LTC/USDT", baseAsset: "LTC", quoteAsset: "USDT" },
  { internalSymbol: "SOL/USDT", krakenRestPair: "SOLUSDT", krakenWsPair: "SOL/USDT", baseAsset: "SOL", quoteAsset: "USDT" },
  { internalSymbol: "XRP/USDT", krakenRestPair: "XRPUSDT", krakenWsPair: "XRP/USDT", baseAsset: "XRP", quoteAsset: "USDT" },

  // === USDC Pairs ===
  { internalSymbol: "ATOM/USDC", krakenRestPair: "ATOMUSDC", krakenWsPair: "ATOM/USDC", baseAsset: "ATOM", quoteAsset: "USDC" },
  { internalSymbol: "BTC/USDC", krakenRestPair: "XBTUSDC", krakenWsPair: "XBT/USDC", baseAsset: "BTC", quoteAsset: "USDC" },
  { internalSymbol: "ETH/USDC", krakenRestPair: "ETHUSDC", krakenWsPair: "ETH/USDC", baseAsset: "ETH", quoteAsset: "USDC" },
  { internalSymbol: "EURC/USDC", krakenRestPair: "EURCUSDC", krakenWsPair: "EURC/USDC", baseAsset: "EURC", quoteAsset: "USDC" },
  { internalSymbol: "SOL/USDC", krakenRestPair: "SOLUSDC", krakenWsPair: "SOL/USDC", baseAsset: "SOL", quoteAsset: "USDC" },
  { internalSymbol: "TON/USDC", krakenRestPair: "TONUSDC", krakenWsPair: "TON/USDC", baseAsset: "TON", quoteAsset: "USDC" },
  { internalSymbol: "USDC/USD", krakenRestPair: "USDCUSD", krakenWsPair: "USDC/USD", baseAsset: "USDC", quoteAsset: "USD" },
  { internalSymbol: "XTZ/USDC", krakenRestPair: "XTZUSDC", krakenWsPair: "XTZ/USDC", baseAsset: "XTZ", quoteAsset: "USDC" },

  // === Special Kraken formats (legacy symbols with X/Z prefixes) ===
  { internalSymbol: "M/USD", krakenRestPair: "MUSD", krakenWsPair: "M/USD", baseAsset: "M", quoteAsset: "USD" },
];

export { KRAKEN_SYMBOL_MAP as default };
