/**
 * B79.0n.UNIVERSE-DISCOVERY — S&P 500 backstop ticker list for Kraken WS probe.
 *
 * CoinGecko's xstocks-ecosystem category had only 126 symbols at pre-audit time
 * (vs our 260 registry), so CoinGecko alone misses ~52% of Kraken's actual
 * xStock catalog. The Kraken WS subscription probe is the authoritative
 * "what does Kraken actually accept?" source — and to give it a comprehensive
 * candidate set, we union CoinGecko's output with this S&P 500 backstop.
 *
 * Per Langston Q-PA-2 ACK 2026-05-21: S&P 500 is the right ceiling. Russell 2000
 * adds ~95s of probe time for symbols structurally unlikely to be tokenized
 * (Backed Finance favors liquid mega-caps). If Backed announces small-cap
 * expansion, revisit.
 *
 * Symbols are in canonical 'BASE/USD' form. Approximately 500 entries.
 *
 * Update cadence: manual. S&P 500 membership changes ~1-2 times per quarter
 * via index rebalancing. Not load-bearing for correctness — the WS probe
 * itself decides what Kraken accepts; the backstop just ensures we ASK about
 * the right ~500 mega-caps.
 *
 * Sourced from S&P 500 constituent list as of 2026-Q1 rebalancing.
 */

export const SP500_BACKSTOP_TICKERS: readonly string[] = Object.freeze([
  // Technology
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'META', 'AVGO', 'ORCL', 'AMD', 'CRM',
  'CSCO', 'ACN', 'ADBE', 'NOW', 'INTC', 'INTU', 'QCOM', 'TXN', 'IBM', 'AMAT',
  'PANW', 'ANET', 'MU', 'LRCX', 'KLAC', 'ADI', 'CDNS', 'SNPS', 'WDAY', 'CRWD',
  'MRVL', 'FTNT', 'PLTR', 'DELL', 'ROP', 'NXPI', 'MSI', 'NET', 'SNOW', 'MDB',
  'TEAM', 'DDOG', 'ZS', 'OKTA', 'SMCI', 'ARM', 'GLW', 'IT', 'TYL', 'ANSS',
  'CDW', 'GEN', 'KEYS', 'JBL', 'FFIV', 'EPAM', 'TER', 'NTAP', 'HPE', 'STX',
  'HPQ', 'WDC', 'TONX', 'LIDR', 'PATH', 'NTNX', 'SHOP',
  // Communication Services
  'NFLX', 'DIS', 'TMUS', 'CMCSA', 'VZ', 'T', 'CHTR', 'WBD', 'PARA', 'NWS',
  'NWSA', 'FOX', 'FOXA', 'EA', 'TTWO', 'OMC', 'IPG', 'LYV', 'MTCH', 'PINS',
  'SNAP', 'RBLX', 'BIDU', 'BABA', 'JD', 'NTES', 'BILI', 'AMC',
  // Consumer Discretionary
  'AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'LOW', 'TJX', 'BKNG', 'MAR',
  'CMG', 'O', 'F', 'GM', 'ABNB', 'ORLY', 'YUM', 'AZO', 'LULU', 'EBAY',
  'HLT', 'MGM', 'ROST', 'BBY', 'EXPE', 'TPR', 'POOL', 'WHR', 'NCLH', 'CCL',
  'RCL', 'DRI', 'GRMN', 'DASH', 'RIVN', 'LCID', 'AMC', 'GME', 'BBBY', 'PDD',
  'BCC', 'GOTU', 'LI', 'NIO', 'TAL', 'XPEV', 'BMBL', 'AUR',
  // Financials
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BRK.B', 'V', 'MA', 'AXP',
  'SCHW', 'BLK', 'CB', 'PNC', 'USB', 'COF', 'TFC', 'PGR', 'AFL', 'ALL',
  'TRV', 'MET', 'PRU', 'AIG', 'HIG', 'L', 'WTW', 'AON', 'MMC', 'MCO',
  'SPGI', 'ICE', 'NDAQ', 'CME', 'CBOE', 'MSCI', 'KKR', 'BX', 'APO', 'COIN',
  'HOOD', 'CRCL', 'GLXY', 'DFDV', 'PYPL', 'RKT', 'UWMC', 'SOFI', 'LMND', 'ROOT',
  'VOYA', 'LNC', 'XYZ',
  // Healthcare
  'JNJ', 'UNH', 'LLY', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'AMGN',
  'CVS', 'BMY', 'GILD', 'MDT', 'CI', 'ELV', 'HUM', 'REGN', 'VRTX', 'ISRG',
  'SYK', 'ZTS', 'BSX', 'BDX', 'BIIB', 'MRNA', 'IDXX', 'EW', 'A', 'IQV',
  'MCK', 'CNC', 'DXCM', 'WST', 'COR', 'WAT', 'STE', 'RMD', 'PODD', 'BAX',
  'INCY', 'ALGN', 'CAH', 'HSIC', 'NBIX', 'TEVA', 'NVO', 'ARCT', 'BNTX', 'ALNY',
  'BHC', 'RGEN', 'SUPN', 'THC', 'UHS', 'MOH', 'XBI', 'NVAX',
  // Industrials
  'CAT', 'RTX', 'HON', 'GE', 'UNP', 'BA', 'DE', 'LMT', 'UPS', 'ETN',
  'WM', 'CSX', 'FDX', 'NSC', 'EMR', 'NOC', 'GD', 'PCAR', 'ITW', 'CMI',
  'JCI', 'TT', 'CTAS', 'ROK', 'AME', 'PH', 'XYL', 'IR', 'OTIS', 'CARR',
  'PNR', 'RSG', 'WAB', 'GEV', 'FAST', 'LECO', 'BLDP', 'BE', 'CHPT', 'NVT',
  'PWR', 'URI', 'EVGO', 'FCEL', 'PLUG', 'GWW',
  // Consumer Staples
  'PG', 'KO', 'COST', 'WMT', 'PEP', 'PM', 'MDLZ', 'MO', 'CL', 'TGT',
  'KMB', 'STZ', 'KR', 'SYY', 'GIS', 'DEO', 'BTI', 'KDP', 'KHC', 'HSY',
  'CHD', 'CPB', 'MKC', 'CLX', 'CAG', 'TAP', 'LW', 'BUD', 'UL', 'NWL',
  // Energy
  'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'PSX', 'VLO', 'OXY', 'WMB',
  'PXD', 'KMI', 'OKE', 'BKR', 'HAL', 'DVN', 'FANG', 'CTRA', 'EQT', 'TRGP',
  'SHEL',
  // Utilities
  'NEE', 'SO', 'DUK', 'CEG', 'AEP', 'SRE', 'D', 'EXC', 'XEL', 'PCG',
  'ED', 'PEG', 'EIX', 'AWK', 'WEC', 'DTE', 'ETR', 'PPL', 'AEE', 'CMS',
  'ES', 'FE', 'CNP', 'NRG', 'VIA',
  // Real Estate
  'PLD', 'AMT', 'EQIX', 'CCI', 'PSA', 'SPG', 'O', 'DLR', 'WELL', 'AVB',
  'EQR', 'EXR', 'ESS', 'MAA', 'VICI', 'INVH', 'SBAC', 'ARE', 'WY', 'IRM',
  // Materials
  'LIN', 'APD', 'SHW', 'ECL', 'FCX', 'NEM', 'DOW', 'DD', 'CTVA', 'NUE',
  'STLD', 'MOS', 'CF', 'PPG', 'IFF', 'BALL', 'ALB',
  // ETFs / Index Proxies (Backed tokenizes some of these)
  'SPY', 'QQQ', 'GLD', 'TOTL', 'IEMG', 'ARKK', 'ARKG', 'XBI',
  // International ETFs
  'EWA', 'EWC', 'EWG', 'EWI', 'EWL', 'EWN', 'EWP', 'EWQ', 'EWS', 'EWU', 'EWZ',
  // Crypto-adjacent miners + treasury (not S&P 500 but stable Backed candidates)
  'BTBT', 'CIFR', 'CLSK', 'HIVE', 'HUT',
]);

/**
 * Canonicalize: 'AAPL' → 'AAPL/USD'. Dedupes against the candidate set.
 */
export function getSp500BackstopCandidates(): Set<string> {
  const out = new Set<string>();
  for (const t of SP500_BACKSTOP_TICKERS) {
    out.add(`${t.toUpperCase()}/USD`);
  }
  return out;
}
