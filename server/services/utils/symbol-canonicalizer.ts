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
    exchange: 'Kraken (Spot)',
    type: 'Paper-trading / demo / sandbox fill system',
    badName: 'Kraken spot paper-trading account (hosted demo that fills orders + tracks a virtual balance)',
    badContext: 'Assumed (incl. old CLAUDE.md rule-20 wording "paper mode routes through Kraken paper order system" + a Kyle Sept/Oct-2025 recollection of advertised spot paper trading) that Kraken hosts a spot paper-trading system to route active paper-mode orders through.',
    correctAlternative: 'Kraken has NO hosted spot paper-fill system for ordinary users. For SPOT only: (1) AddOrder/addOrder validate=true — validates an order for errors but NEVER fills + returns no order id; (2) a by-request qualified-client test env gated behind API-team onboarding (unconfirmed to simulate fills). Kraken hosted demo with simulated fills is FUTURES-ONLY (demo-futures.kraken.com, $50k virtual). Even Kraken own March-2026 CLI does spot paper LOCALLY (offline sim off live ticker). => Spot paper MUST use an INTERNAL high-fidelity fill model, made Kraken-vetted by sending each order with validate=true + pricing off real Kraken WS + real fee/slippage/partial-fill modeling.',
    dateDiscovered: '2026-06-13',
    reason: 'P19-B2 exhaustive verification — Kraken Account-Management FAQ verbatim: "We do not offer test accounts with virtual balances for clients to practice on Kraken. You can, however, create a demo account for Kraken Derivatives." + API-test-env support article + Reddit/GitHub cross-check (community Kraken bots all build their own spot paper/dry-run because no native endpoint exists). The Sept/Oct-2025 memory maps to the FUTURES demo amid heavy 2025 Kraken derivatives marketing, not a spot product.',
    ref: 'P19_B2_COMPLETION_REPORT.md + PHASE_19_PLAN §5 (2026-06-13 paper-execution-target decision); CLAUDE.md rule 20 corrected',
  },
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
  {
    exchange: 'Kraken (xStock product / ws-equities feed)',
    type: 'xStock symbol with zero data in 2-month archive window',
    badName: 'BITF/USD, HOLX/USD, PARA/USD, SAGE/USD, WBA/USD',
    badContext: 'Five xStock symbols in shared/asset-classes.ts:XSTOCK_SPOT_REGISTRY had zero OHLC rows in both xstock_spot_ohlc_1m (April + May 2026) and xstock_spot_ohlc_60m_snapshot (260 of 265 symbols populated). Tickers are valid US equities (Bitfarms / Hologic / Paramount Global / Sage Therapeutics / Walgreens Boots Alliance) but our Kraken xStock product subscription returns no candle data for them.',
    correctAlternative: 'No positive confirmation available. Kraken public AssetPairs API does not index xStocks at all (their xStock instruments route exclusively through wss://ws-equities.kraken.com with no public introspection endpoint). B-NEW-36 sub-batch (c) confirmed AssetPairs returns EQuery:Unknown asset pair for ALL xStock symbols including known-good AAPL/TSLA/AMZN. Operationally: do NOT re-add these five to XSTOCK_SPOT_REGISTRY without first verifying Kraken-side support via a method that surfaces in a future "Kraken xStock universe audit" mini-batch.',
    dateDiscovered: '2026-05-20',
    reason: 'Zero rows across 2 months in our archive despite registry inclusion. xStock product carries only a subset of US-listed equities and the subset has shifted at least once during this archive window (possible delisting, never-tokenized, or different symbol form on Kraken side — unverifiable via public API).',
    ref: 'RUNNING_ISSUES #120 (DEFERRED — Kraken-side investigation gated). B-NEW-36 sub-batch (c) trace report 2026-05-20. B79.0n.HYGIENE registry trim 2026-05-20.',
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
