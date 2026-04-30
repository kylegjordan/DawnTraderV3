/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — Universe Loader
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Three universe selectors for the passive archive pipeline:
 *
 *   1. loadEquitySpotUniverse()  — reads xstocks-universe.json (static config)
 *   2. loadEquityPerpUniverse()  — reads equity-perp-universe.json (static config)
 *   3. loadCryptoSpotUniverse()  — DYNAMIC: queries Kraken AssetPairs REST,
 *                                   filters by quote currency + 24h volume floor,
 *                                   refreshed at startup AND daily via cron.
 *
 * Per Langston cc-inbox #867 Q3 + #869 Q3: equity universes are static; crypto
 * is dynamic because the long tail of pairs comes and goes daily and we want
 * the universe to track that automatically.
 *
 * Reference: BATCH_74_SCOPE.md v1.1 + BATCH_74_PRE_AUDIT.md v1.1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs/promises';
import path from 'path';

// B74: config files live under server/config/ in source. Esbuild bundles to a
// single dist/index.js so import.meta.url-based path resolution doesn't survive
// the build (resolves to dist/ in prod, not server/services/passive-archive/).
// Use process.cwd() instead — the dawntrader app is always launched from the
// project root by PM2, so cwd is stable.
const CONFIG_DIR = path.resolve(process.cwd(), 'server', 'config');

// ───────────────────────────────────────────────────────────────────────────
// Static configs (equity spot + perp)
// ───────────────────────────────────────────────────────────────────────────

interface StaticUniverseConfig {
  symbols: string[];
  _universe: string;
  _endpoint: string;
}

async function loadStaticUniverse(filename: string): Promise<StaticUniverseConfig> {
  const fullPath = path.join(CONFIG_DIR, filename);
  const raw = await fs.readFile(fullPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.symbols)) {
    throw new Error(`[B74][universe-loader] ${filename}: 'symbols' must be an array`);
  }
  return parsed as StaticUniverseConfig;
}

export async function loadEquitySpotUniverse(): Promise<string[]> {
  const cfg = await loadStaticUniverse('xstocks-universe.json');
  console.log(`[B74][universe] equity_spot loaded: ${cfg.symbols.length} symbols from ${cfg._endpoint}`);
  return cfg.symbols;
}

export async function loadEquityPerpUniverse(): Promise<string[]> {
  const cfg = await loadStaticUniverse('equity-perp-universe.json');
  console.log(`[B74][universe] equity_perp loaded: ${cfg.symbols.length} symbols from ${cfg._endpoint}`);
  return cfg.symbols;
}

// ───────────────────────────────────────────────────────────────────────────
// Dynamic crypto universe
// ───────────────────────────────────────────────────────────────────────────
//
// Selects from Kraken AssetPairs by:
//   - Quote currency in `allowedQuotes` set (default: USD/USDT/USDC)
//   - 24h notional volume ≥ floor (default: $10k USD-equivalent;
//     tunable via module_constants.passive_archive.b74_crypto_min_volume_24h_usd)
//
// Returns canonical BASE/QUOTE symbol strings that the Kraken WS v2 protocol
// accepts directly.

interface CryptoFilterConfig {
  filter: {
    allowedQuotes: string[];
    minVolume24hUsd: number;
  };
}

interface KrakenAssetPair {
  altname: string;
  base: string;
  quote: string;
  status?: string;
  ordermin?: string;
}

interface KrakenTickerResp {
  c: string[];   // last trade closed [price, lot volume]
  v: string[];   // volume [today, last 24h]
}

const ZQUOTE_TO_PLAIN: Record<string, string> = {
  ZUSD: 'USD', ZEUR: 'EUR', ZGBP: 'GBP', ZJPY: 'JPY', ZAUD: 'AUD',
  ZCAD: 'CAD', ZCHF: 'CHF',
};

const XBASE_TO_PLAIN: Record<string, string> = {
  XBT: 'BTC', XXBT: 'BTC', XDG: 'DOGE', XXDG: 'DOGE',
  XETH: 'ETH', XXLM: 'XLM', XXMR: 'XMR', XXRP: 'XRP', XZEC: 'ZEC',
};

function normalizeKrakenAsset(asset: string, mapping: Record<string, string>): string {
  return mapping[asset] || asset;
}

/**
 * Compute the 24h notional USD-equivalent volume for a given pair.
 * Uses last price × 24h volume from the Ticker endpoint. For non-USD-quoted
 * pairs (USDT, USDC) we treat 1:1 with USD (small basis but not material for
 * the 10k floor).
 */
function computeNotionalUsd(ticker: KrakenTickerResp): number {
  if (!ticker?.c?.[0] || !ticker?.v?.[1]) return 0;
  const price = parseFloat(ticker.c[0]);
  const volume = parseFloat(ticker.v[1]);
  if (!isFinite(price) || !isFinite(volume)) return 0;
  return price * volume;
}

interface CryptoUniverseResult {
  symbols: string[];
  totalCandidates: number;
  filterReasons: { dead: number; wrongQuote: number; offline: number; noTicker: number };
}

export async function loadCryptoSpotUniverse(opts?: {
  minVolumeFloorUsd?: number;
  fetchImpl?: typeof fetch;
}): Promise<CryptoUniverseResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const cfgPath = path.join(CONFIG_DIR, 'crypto-universe-filter.json');
  const cfg = JSON.parse(await fs.readFile(cfgPath, 'utf-8')) as CryptoFilterConfig;
  const allowedQuotes = new Set(cfg.filter.allowedQuotes);
  const floorUsd = opts?.minVolumeFloorUsd ?? cfg.filter.minVolume24hUsd;

  // Fetch full pair list
  const pairsResp = await fetchImpl('https://api.kraken.com/0/public/AssetPairs');
  const pairsJson = (await pairsResp.json()) as { result?: Record<string, KrakenAssetPair> };
  const allPairs = pairsJson.result ?? {};

  // First pass: filter by quote + status only (pre-volume)
  const preVolumeCandidates: Array<{ krakenId: string; canonical: string }> = [];
  const reasons = { dead: 0, wrongQuote: 0, offline: 0, noTicker: 0 };

  for (const [krakenId, info] of Object.entries(allPairs)) {
    if (info.status && info.status !== 'online') {
      reasons.offline++;
      continue;
    }
    const plainQuote = normalizeKrakenAsset(info.quote, ZQUOTE_TO_PLAIN);
    if (!allowedQuotes.has(plainQuote)) {
      reasons.wrongQuote++;
      continue;
    }
    const plainBase = normalizeKrakenAsset(info.base, XBASE_TO_PLAIN);
    preVolumeCandidates.push({ krakenId, canonical: `${plainBase}/${plainQuote}` });
  }

  // Second pass: fetch ticker for all candidates in batches (Kraken accepts
  // comma-separated pair list of up to ~150 pairs per call).
  const tickerMap = new Map<string, KrakenTickerResp>();
  const BATCH = 100;
  for (let i = 0; i < preVolumeCandidates.length; i += BATCH) {
    const batch = preVolumeCandidates.slice(i, i + BATCH);
    const pairList = batch.map(c => c.krakenId).join(',');
    try {
      const resp = await fetchImpl(`https://api.kraken.com/0/public/Ticker?pair=${pairList}`);
      const tickerJson = (await resp.json()) as { result?: Record<string, KrakenTickerResp> };
      for (const [k, v] of Object.entries(tickerJson.result ?? {})) {
        tickerMap.set(k, v);
      }
    } catch (err) {
      console.warn(`[B74][universe] crypto ticker batch ${i}-${i + batch.length} failed:`, err);
    }
  }

  // Final filter: notional volume above floor
  const symbols: string[] = [];
  for (const cand of preVolumeCandidates) {
    const ticker = tickerMap.get(cand.krakenId);
    if (!ticker) {
      reasons.noTicker++;
      continue;
    }
    const notional = computeNotionalUsd(ticker);
    if (notional < floorUsd) {
      reasons.dead++;
      continue;
    }
    symbols.push(cand.canonical);
  }

  // Stable sort for deterministic output
  symbols.sort();

  console.log(
    `[B74][universe] crypto_spot loaded: ${symbols.length} pairs ` +
    `(candidates=${preVolumeCandidates.length}, ` +
    `dead=${reasons.dead}, wrongQuote=${reasons.wrongQuote}, ` +
    `offline=${reasons.offline}, noTicker=${reasons.noTicker}, floor=$${floorUsd})`
  );

  return {
    symbols,
    totalCandidates: Object.keys(allPairs).length,
    filterReasons: reasons,
  };
}
