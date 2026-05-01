/**
 * Phase 27.F.12.b - Symbol Canonicalization
 *
 * Enforces one canonical pair format (BASE/QUOTE) across:
 * - Whitelist/Blacklist
 * - Screener filters
 * - Guardrails
 * - Strategy prechecks
 * - MarketDataCoordinator
 *
 * ─── ALSO HOSTS: KNOWN_NONEXISTENT_NAMES registry (Kyle directive 2026-04-30) ───
 *
 * Every time a developer discovers an exchange feed name, channel name,
 * endpoint path, or symbol form that turns out NOT to exist (after probing
 * + verification), add the failing name + the correct alternative + the
 * date + a one-line reason to KNOWN_NONEXISTENT_NAMES below. This builds
 * institutional memory so future devs (and AI agents resuming work) don't
 * waste time re-discovering the same dead ends.
 *
 * Standard practice when you discover a non-existent name:
 *   1. Verify by probing the exchange (curl / WS subscription test)
 *   2. Find the correct alternative (REST endpoint, different feed name, etc.)
 *   3. Add an entry to KNOWN_NONEXISTENT_NAMES in this file
 *   4. Reference the entry in any code comment that uses the WORKING alternative
 *
 * This file is a sensible home because symbol/exchange-name handling is its
 * domain. If the registry grows large enough to deserve its own file, split it.
 */

/**
 * Registry of exchange API names we've verified DO NOT EXIST. Each entry
 * documents a failed discovery so it's not re-attempted.
 *
 * Pattern: { exchange, type, badName, correctAlternative, dateDiscovered, reason }
 *
 * Used as documentation only; not consumed by runtime code (the working
 * alternatives are baked into the relevant archivers/services directly).
 */
export const KNOWN_NONEXISTENT_NAMES = [
  {
    exchange: 'Kraken Futures',
    type: 'WebSocket subscription feed',
    badName: 'candles_trade_1m',
    badContext: 'Subscribed via { event: "subscribe", feed: "candles_trade_1m", product_ids: [...] } on wss://futures.kraken.com/ws/v1',
    correctAlternative: 'Kraken Futures WS has NO candle/kline subscription feed. Use REST endpoint GET https://futures.kraken.com/api/charts/v1/trade/<symbol>/<tick> where tick ∈ {1m, 5m, 15m, 1h, 4h, 12h, 1d, 1w}. Returns {candles: [{time, open, high, low, close, volume}, ...]}.',
    dateDiscovered: '2026-04-30',
    reason: 'Subscribe accepted silently but no candle messages ever flowed. Ticker feed for the same symbols worked normally, proving WS connection healthy. B74 v1 implemented WS-candles based on initial doc-reading assumption; B74.1 verified by live probe that the feed name does not exist. Implementation switched to REST polling at 60s interval.',
    ref: 'BUG-2026-04-30-I in CHANGES_AND_FIXES.md, RUNNING_ISSUES #41 (RESOLVED)',
  },
] as const;

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
