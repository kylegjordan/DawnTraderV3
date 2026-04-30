/**
 * Phase 27.F.12.b - Symbol Canonicalization
 * 
 * Enforces one canonical pair format (BASE/QUOTE) across:
 * - Whitelist/Blacklist
 * - Screener filters
 * - Guardrails
 * - Strategy prechecks
 * - MarketDataCoordinator
 */

/**
 * Converts any exchange ID or pair format to canonical BASE/QUOTE format
 * 
 * Examples:
 * - "XXBTZUSD" -> "BTC/USD"
 * - "XETHZUSD" -> "ETH/USD"
 * - "BTC/USD" -> "BTC/USD" (already canonical)
 * - "ETH" -> "ETH" (base currency only)
 */
export function toCanonical(exchangeIdOrPair: string): string {
  if (!exchangeIdOrPair) return '';

  // Map of Kraken's asset codes to standard symbols
  const krakenToStandard: Record<string, string> = {
    // Base currencies
    'XBT': 'BTC',
    'XDG': 'DOGE',
    'XLM': 'XLM',
    'XRP': 'XRP',
    'XTZ': 'XTZ',
    
    // Quote currencies (Kraken prefixes with Z or X)
    'ZUSD': 'USD',
    'ZEUR': 'EUR',
    'ZGBP': 'GBP',
    'ZJPY': 'JPY',
    'ZAUD': 'AUD',
    'ZCAD': 'CAD',
    'ZCHF': 'CHF',
    'XXBT': 'BTC',
    'XETH': 'ETH'
  };

  // Already in BASE/QUOTE format - normalize both currencies
  if (exchangeIdOrPair.includes('/')) {
    const [base, quote] = exchangeIdOrPair.split('/');
    const normalizedBase = krakenToStandard[base] || base;
    const normalizedQuote = krakenToStandard[quote] || quote;
    return `${normalizedBase}/${normalizedQuote}`;
  }

  // ── B74 (Langston-approved cc-inbox #867 Q1): Kraken Futures equity-token
  // perpetual futures naming convention. Format: PF_<TICKER>X<QUOTE>
  //   - PF_AAPLXUSD  → AAPL/USD:PERP   (Apple, perpetual contract on USD)
  //   - PF_TSLAXUSD  → TSLA/USD:PERP
  //   - PF_GOOGLXUSD → GOOGL/USD:PERP
  // The colon-suffix `:PERP` is the standard cross-provider convention
  // (TradingView, CCXT, CoinGecko derivatives) marking instrument type while
  // keeping the BASE/QUOTE structure readable.
  // Strict ^PF_ anchor + uppercase-only ticker + known-quote suffix means this
  // branch can ONLY match Kraken Futures equity perp symbols. No collision
  // with existing crypto patterns (which start with X, Z, or alpha-without-PF_).
  // Per pre-audit §A.2: blast radius LOW — additive branch, ordered before
  // the looser crypto patterns so PF_AAPLXUSD doesn't get parsed as bare
  // {base: PF_AAPLX, quote: USD} by Pattern 2 below.
  const perpMatch = exchangeIdOrPair.match(/^PF_([A-Z]+)X(USD|EUR|GBP)$/);
  if (perpMatch) {
    return `${perpMatch[1]}/${perpMatch[2]}:PERP`;
  }

  // Kraken's exchange IDs often have X/Z prefixes and no slash
  // Common patterns:
  // - XXBTZUSD = XBT/USD (BTC)
  // - XETHZUSD = ETH/USD
  // - XXDGZUSD = XDG/USD (DOGE)
  // - SOLUSD = SOL/USD
  
  // Try to parse Kraken format
  let base = '';
  let quote = '';

  // Pattern 1: X[base]Z[quote] (e.g., XXBTZUSD)
  if (exchangeIdOrPair.startsWith('X') && exchangeIdOrPair.includes('Z')) {
    const zIndex = exchangeIdOrPair.lastIndexOf('Z');
    base = exchangeIdOrPair.substring(1, zIndex);
    quote = exchangeIdOrPair.substring(zIndex + 1);
  }
  // Pattern 2: [base][quote] where quote is known (USD, USDT, EUR, etc.)
  else {
    const knownQuotes = ['USD', 'USDT', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
    for (const q of knownQuotes) {
      if (exchangeIdOrPair.endsWith(q)) {
        base = exchangeIdOrPair.substring(0, exchangeIdOrPair.length - q.length);
        quote = q;
        break;
      }
    }
  }

  // If we found both base and quote, normalize and return
  if (base && quote) {
    base = krakenToStandard[base] || base;
    quote = krakenToStandard[quote] || quote;
    return `${base}/${quote}`;
  }

  // If it's just a base currency, return as-is
  return exchangeIdOrPair;
}

/**
 * Converts BASE/QUOTE format to Kraken's exchange ID format
 * 
 * Examples:
 * - "BTC/USD" -> "XXBTZUSD"
 * - "ETH/USD" -> "XETHZUSD"
 * - "SOL/USD" -> "SOLUSD"
 */
export function toKrakenId(baseQuote: string): string {
  if (!baseQuote || !baseQuote.includes('/')) {
    return baseQuote;
  }

  const [base, quote] = baseQuote.split('/');
  
  // Map standard symbols to Kraken's asset codes
  const standardToKraken: Record<string, string> = {
    // Base currencies
    'BTC': 'XBT',
    'DOGE': 'XDG',
    
    // Quote currencies (reverse mapping)
    'USD': 'ZUSD',
    'EUR': 'ZEUR',
    'GBP': 'ZGBP',
    'JPY': 'ZJPY',
    'AUD': 'ZAUD',
    'CAD': 'ZCAD',
    'CHF': 'ZCHF'
    // Note: BTC/ETH as quote currencies handled by logic below
  };

  const krakenBase = standardToKraken[base] || base;
  const krakenQuote = standardToKraken[quote] || quote;

  // Kraken uses X prefix for base and Z prefix for quote in many pairs
  // But not all - SOL/USD is just SOLUSD
  // For now, return a best-effort format
  if (['BTC', 'ETH', 'DOGE'].includes(base) && ['USD', 'EUR'].includes(quote)) {
    return `X${krakenBase}Z${krakenQuote}`;
  }

  // Default: just concatenate
  return `${krakenBase}${krakenQuote}`;
}

/**
 * Normalizes an array of symbols to canonical format
 */
export function normalizeSymbolArray(symbols: string[] | null | undefined): string[] {
  if (!symbols || !Array.isArray(symbols)) {
    return [];
  }
  return symbols.map(s => toCanonical(s)).filter(s => s !== '');
}

/**
 * Given a Kraken pair info object, return canonical BASE/QUOTE
 * Normalizes quote currencies (ZUSD→USD, ZEUR→EUR, etc.)
 */
export function canonicalFromPairInfo(pairInfo: { base: string; quote: string }): string {
  // Pass through toCanonical to normalize quote currencies
  return toCanonical(`${pairInfo.base}/${pairInfo.quote}`);
}
