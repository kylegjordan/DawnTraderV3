/**
 * Directive 11.4H.6 Task 1A — Benchmark Symbol Regex
 * 
 * Strict regex to prevent non-blue-chip coins (e.g., FARTCOIN/USDT) from being 
 * misclassified as benchmarks.
 * 
 * Valid benchmarks: BTC, XBT, ETH, SOL, USDT, USDC, DAI, BUSD, TUSD
 * Valid quote currencies: USD, USDT, USDC, DAI, BUSD, EUR
 */

export const BENCHMARK_REGEX = /^(?:BTC|XBT|ETH|SOL|USDT|USDC|DAI|BUSD|TUSD)(?:[-_/]?(?:USD|USDT|USDC|DAI|BUSD|EUR))?$/i;

export const BENCHMARK_BASE_COINS = ['BTC', 'XBT', 'ETH', 'SOL'] as const;
export const BENCHMARK_STABLECOINS = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD'] as const;
export const VALID_QUOTE_CURRENCIES = ['USD', 'USDT', 'USDC', 'DAI', 'BUSD', 'EUR'] as const;

export const CANONICAL_BENCHMARK_SYMBOLS = [
  'BTC/USD', 'BTC/USDT',
  'ETH/USD', 'ETH/USDT',
  'SOL/USD', 'SOL/USDT',
  'USDT/USD', 'USDC/USD',
  'DAI/USD', 'BUSD/USD', 'TUSD/USD'
] as const;

export function isBenchmarkSymbolStrict(symbol: string): boolean {
  if (!symbol) return false;
  
  const upperSymbol = symbol.toUpperCase().trim();
  
  if (BENCHMARK_REGEX.test(upperSymbol)) {
    return true;
  }
  
  const parts = upperSymbol.split(/[-_/]/);
  if (parts.length < 2) {
    return [...BENCHMARK_BASE_COINS, ...BENCHMARK_STABLECOINS].some(base => 
      upperSymbol === base || upperSymbol.startsWith(base + '/')
    );
  }
  
  const [base, quote] = parts;
  
  const isValidBase = [...BENCHMARK_BASE_COINS, ...BENCHMARK_STABLECOINS].includes(base as any);
  const isValidQuote = VALID_QUOTE_CURRENCIES.includes(quote as any);
  
  return isValidBase && isValidQuote;
}
