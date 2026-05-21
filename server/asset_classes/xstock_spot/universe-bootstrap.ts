/**
 * B79.0n.UNIVERSE-DISCOVERY — Layer-4 fallback bootstrap set.
 *
 * Hard-coded 20-symbol survival set used when ALL of:
 *   1. Live discovery (CoinGecko + Kraken WS probe + Finnhub) failed
 *   2. DB snapshot read failed (DB unreachable or table empty)
 *   3. File cache at /var/lib/dawntrader/xstock-universe-cache.json missing
 *
 * Hand-picked stable mega-caps + the canonical ETF / index proxies. These are
 * names that will exist on Kraken's xStock product for the foreseeable future
 * — preferred over a CoinGecko point-in-time snapshot that could lock in noisy
 * / leveraged / oddly-named selections (TQQQX, STRCX, etc.).
 *
 * Per Langston Q-PA-2 ACK 2026-05-21: editorial judgment > dynamic snapshot
 * for the survival layer.
 *
 * Covers 6+ internal sectors:
 *   XLK via AAPL/AMZN/GOOGL/MSFT/NVDA/META/ASML
 *   XLF via COIN/HOOD/JPM/BAC
 *   XLY via TSLA
 *   XLV via JNJ
 *   XLP via PG/KO
 *   XLE via XOM
 *   INDEX_PROXY via SPY/QQQ
 *   BROAD_ETF via GLD
 *   cryptoAdjacent via MSTR/COIN/HOOD
 */

import type { XstockSpotEntry } from '../../../shared/asset-classes';

export interface BootstrapEntry {
  symbol: string;
  entry: XstockSpotEntry;
}

export const UNIVERSE_BOOTSTRAP_SET: readonly BootstrapEntry[] = Object.freeze([
  { symbol: 'AAPL/USD',  entry: { name: 'Apple',                 sector: 'XLK' } },
  { symbol: 'AMZN/USD',  entry: { name: 'Amazon',                sector: 'XLY' } },
  { symbol: 'GOOGL/USD', entry: { name: 'Alphabet',              sector: 'XLC' } },
  { symbol: 'MSFT/USD',  entry: { name: 'Microsoft',             sector: 'XLK' } },
  { symbol: 'NVDA/USD',  entry: { name: 'Nvidia',                sector: 'XLK' } },
  { symbol: 'TSLA/USD',  entry: { name: 'Tesla',                 sector: 'XLY' } },
  { symbol: 'META/USD',  entry: { name: 'Meta Platforms',        sector: 'XLC' } },
  { symbol: 'COIN/USD',  entry: { name: 'Coinbase',              sector: 'XLF', cryptoAdjacent: true } },
  { symbol: 'MSTR/USD',  entry: { name: 'MicroStrategy',         sector: 'XLK', cryptoAdjacent: true } },
  { symbol: 'HOOD/USD',  entry: { name: 'Robinhood',             sector: 'XLF' } },
  { symbol: 'ASML/USD',  entry: { name: 'ASML Holding',          sector: 'XLK', adr: true } },
  { symbol: 'SPY/USD',   entry: { name: 'S&P 500 ETF',           sector: 'INDEX_PROXY' } },
  { symbol: 'QQQ/USD',   entry: { name: 'Nasdaq 100 ETF',        sector: 'INDEX_PROXY' } },
  { symbol: 'GLD/USD',   entry: { name: 'Gold ETF',              sector: 'BROAD_ETF' } },
  { symbol: 'JPM/USD',   entry: { name: 'JPMorgan Chase',        sector: 'XLF' } },
  { symbol: 'BAC/USD',   entry: { name: 'Bank of America',       sector: 'XLF' } },
  { symbol: 'JNJ/USD',   entry: { name: 'Johnson & Johnson',     sector: 'XLV' } },
  { symbol: 'PG/USD',    entry: { name: 'Procter & Gamble',      sector: 'XLP' } },
  { symbol: 'KO/USD',    entry: { name: 'Coca-Cola',             sector: 'XLP' } },
  { symbol: 'XOM/USD',   entry: { name: 'ExxonMobil',            sector: 'XLE' } },
]);

export const UNIVERSE_BOOTSTRAP_SYMBOLS: ReadonlySet<string> = Object.freeze(
  new Set(UNIVERSE_BOOTSTRAP_SET.map((e) => e.symbol)),
);
