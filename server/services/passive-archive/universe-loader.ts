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

// B69: renamed for consistency with asset class taxonomy (equity_spot → xstock_spot)
// B79.0n.UNIVERSE-DISCOVERY 2026-05-21: switched from static JSON file read to
// in-memory XSTOCK_SPOT_SYMBOLS read. `xstocks-universe.json` was DELETED in
// this sub-batch — universe is now DB-backed via xstock_spot_universe table
// (populated by xstock-universe-discoverer.ts at daily 06:00 UTC + boot-time
// init via universe-service.ts). The B74 archiver consumer doesn't need to
// know — it just gets the same string[] back as before.
//
// IMPORTANT: this is async only for back-compat with the existing call
// signature. The actual read is synchronous against an in-memory Set
// populated at server boot. If called BEFORE the universe-service has
// completed initializeFromDB(), returns an empty array (universe-service
// boot in server/index.ts runs BEFORE the archiver subscriber starts, so
// the empty-array case shouldn't occur at runtime).
export async function loadXstockSpotUniverse(): Promise<string[]> {
  const { XSTOCK_SPOT_SYMBOLS } = await import('../../../shared/asset-classes.js');
  const symbols = Array.from(XSTOCK_SPOT_SYMBOLS).sort();
  console.log(`[B74][universe] xstock_spot loaded: ${symbols.length} symbols from XSTOCK_SPOT_SYMBOLS (DB-backed via B79.0n.UNIVERSE-DISCOVERY)`);
  return symbols;
}

/** @deprecated Use loadXstockSpotUniverse(). */
export const loadEquitySpotUniverse = loadXstockSpotUniverse;

// B69: renamed for consistency with asset class taxonomy (equity_perp → xstock_perp)
export async function loadXstockPerpUniverse(): Promise<string[]> {
  const cfg = await loadStaticUniverse('equity-perp-universe.json');
  // P19-B-PERPFEED OBJ-4: feed the membership registry that resolveAssetClass's
  // kraken-futures branch now consults (closes the boot window for this leg).
  const { registerXstockPerpVenueSymbols } = await import('../../../shared/asset-classes.js');
  registerXstockPerpVenueSymbols(cfg.symbols);
  console.log(`[B74][universe] xstock_perp loaded: ${cfg.symbols.length} symbols from ${cfg._endpoint}`);
  return cfg.symbols;
}

/** @deprecated Use loadXstockPerpUniverse(). */
export const loadEquityPerpUniverse = loadXstockPerpUniverse;

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

// ───────────────────────────────────────────────────────────────────────────
// P19-B-PERPFEED — Dynamic crypto-perp universe (Kraken Futures)
// ───────────────────────────────────────────────────────────────────────────
//
// Field-driven classification from the instruments payload — NEVER symbol-shape
// parsing (pre-audit 2026-08-17: `PF_SPXUSD` is a MEMECOIN, base SPX; 14 crypto
// bases ending in X are silently truncated by the equity regex; `base`/`category`/
// `lastTradingTime` are all in the payload, so classification is a field read).
//
// THE RULES (scope §3 + OBJ-1/OBJ-4, Langston-approved):
//   1. PERPETUALITY TEST: an instrument carrying `lastTradingTime` is a DATED
//      future (FF_/FI_, 20 live) → refused. Perp candidacy requires its absence.
//   2. PI_ inverse perps (coin-margined, inverted PnL) → refused, explicitly.
//   3. EQUITY marker: `base` ending lowercase 'x' (AAPLx — 16 live, complete;
//      category ∈ {xStocks, Pre-IPO} corroborates) → the xstock_perp side.
//   4. CRYPTO positive test: tradeable PF_ perpetual whose BASE is a base asset
//      of the current crypto_spot dynamic universe (the relevance filter IS the
//      classification filter — Phase-26 basis/funding work wants pairs we trade).
//   5. Anything failing BOTH positive tests → UNCLASSIFIED: refused AND logged
//      loudly (no default-to-crypto else branch — the FX perps EUR/GBP/CHF land
//      here by construction). An unknown must not wear a plausible answer's clothes.
//
// MEMBERSHIP CADENCE (Langston reconciliation ruling 2026-08-17):
//   - ADDS: monthly only, budget-first — membership is PERSISTED in
//     module_constants so a restart cannot add symbols off-cycle.
//   - DROPS: the daily probe may SUSPEND (reversible, logged, slot retained,
//     never adds) — suspensions persisted alongside membership.
//   - The cap (max symbols, N) is a module_constants key derived from the
//     GB/month budget — FAIL-HARD if absent (no hard-coded fallback for a
//     DB-governed setting; the migration seeds it).

const KF_INSTRUMENTS_URL = 'https://futures.kraken.com/derivatives/api/v3/instruments';
const KF_TICKERS_URL = 'https://futures.kraken.com/derivatives/api/v3/tickers';

export interface KrakenFuturesInstrument {
  symbol: string;
  base?: string;
  quote?: string;
  category?: string;
  tradeable?: boolean;
  tradfi?: boolean;
  lastTradingTime?: string;
  type?: string;
}

export type PerpClassification =
  | 'equity_perp'           // lowercase-x base — the xstock_perp side
  | 'crypto_perp_candidate' // passes perpetuality + crypto positive test
  | 'dated'                 // carries lastTradingTime (FF_/FI_) — refused
  | 'inverse'               // PI_ — refused
  | 'not_tradeable'
  | 'unclassified';         // fails both positive tests — REFUSED + LOGGED

/**
 * Classify ONE Kraken Futures instrument. Pure + exported so the canonicalizer
 * membership and the pinned tests (14 collision names, 16 equity, 20 dated,
 * 4 inverse, 3 FX) exercise exactly the shipping logic.
 */
export function classifyKrakenFuturesInstrument(
  inst: KrakenFuturesInstrument,
  cryptoSpotBases: ReadonlySet<string>,
): PerpClassification {
  if (!inst.tradeable) return 'not_tradeable';
  if (inst.symbol.startsWith('PI_')) return 'inverse';
  // Perpetuality test FIRST: presence of a last-trading date marks a dated
  // future regardless of prefix (verified 2026-08-17: 20/20 FF_/FI_ carry it,
  // 0/276 PF_ do).
  if (inst.lastTradingTime) return 'dated';
  if (!inst.symbol.startsWith('PF_')) return 'unclassified';
  const base = inst.base ?? '';
  if (base.endsWith('x')) return 'equity_perp';
  if (cryptoSpotBases.has(base)) return 'crypto_perp_candidate';
  return 'unclassified';
}

const PERP_UNIVERSE_MODULE = 'passive_archive';
const PERP_MEMBERS_KEY = 'crypto_perp_universe.members';
const PERP_SUSPENDED_KEY = 'crypto_perp_universe.suspended';
const PERP_CAP_KEY = 'crypto_perp_universe.max_symbols';
const PERP_LAST_RECOMPUTE_KEY = 'crypto_perp_universe.last_recompute_at';
const WILDCARD_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as const;

/**
 * MONTHLY membership recompute (also the first-birth compute). Classifies the
 * full live instrument list, ranks crypto candidates by open interest, caps at
 * the budget-derived N, persists membership, and logs every add/drop.
 * Suspensions are PRESERVED across recomputes (a recompute is not an un-suspend).
 */
export async function recomputeCryptoPerpUniverse(updatedBy: string): Promise<string[]> {
  const { getConstant, setConstant } = await import('../module-constants-service.js');

  const cap = await getConstant<number>(PERP_UNIVERSE_MODULE, PERP_CAP_KEY, WILDCARD_KEY);
  if (cap == null || cap <= 0) {
    // Fail-hard: the cap is a DB-governed budget derivation — no code default.
    throw new Error(`[perpfeed][universe] ${PERP_CAP_KEY} missing/invalid in module_constants — the migration seeds it; refusing to compute a universe without a budget cap`);
  }

  // The crypto positive set: base assets of the current crypto_spot universe.
  const spot = await loadCryptoSpotUniverse();
  const cryptoSpotBases = new Set(spot.symbols.map(s => s.split('/')[0]));

  const resp = await fetch(KF_INSTRUMENTS_URL);
  const json = await resp.json() as { instruments?: KrakenFuturesInstrument[] };
  const instruments = json.instruments ?? [];

  const counts: Record<PerpClassification, number> = {
    equity_perp: 0, crypto_perp_candidate: 0, dated: 0, inverse: 0, not_tradeable: 0, unclassified: 0,
  };
  const candidates: string[] = [];
  const equityNames: string[] = [];
  for (const inst of instruments) {
    const cls = classifyKrakenFuturesInstrument(inst, cryptoSpotBases);
    counts[cls]++;
    if (cls === 'crypto_perp_candidate') candidates.push(inst.symbol);
    if (cls === 'equity_perp') equityNames.push(inst.symbol);
    if (cls === 'unclassified' && inst.tradeable) {
      // Rule 5: loud, named, never silently binned as crypto.
      console.warn(`[perpfeed][universe][UNCLASSIFIED] ${inst.symbol} (base=${inst.base ?? '?'}, category=${inst.category ?? '?'}, tradfi=${inst.tradfi ?? false}) — fails both positive tests; refused`);
    }
  }

  // OBJ-4: refresh BOTH membership registries from the live payload — the
  // equity side gets the COMPLETE live set (16 today, vs the static capture
  // JSON's 10 — #687), so resolveAssetClass classifies correctly even for
  // equity perps we don't capture.
  {
    const { registerXstockPerpVenueSymbols, registerCryptoPerpVenueSymbols } = await import('../../../shared/asset-classes.js');
    registerXstockPerpVenueSymbols(equityNames);
    registerCryptoPerpVenueSymbols(candidates);
  }

  // Rank by open interest (tickers endpoint), descending; cap at N.
  const oiBySymbol = new Map<string, number>();
  try {
    const tResp = await fetch(KF_TICKERS_URL);
    const tJson = await tResp.json() as { tickers?: Array<{ symbol?: string; openInterest?: number }> };
    for (const t of tJson.tickers ?? []) {
      if (t.symbol) oiBySymbol.set(t.symbol, t.openInterest ?? 0);
    }
  } catch (err) {
    console.warn('[perpfeed][universe] tickers fetch failed — ranking by symbol name as a stable fallback:', err instanceof Error ? err.message : err);
  }
  candidates.sort((a, b) => (oiBySymbol.get(b) ?? 0) - (oiBySymbol.get(a) ?? 0) || a.localeCompare(b));
  const members = candidates.slice(0, cap).sort();

  // Diff vs the persisted set; log every add/drop (Langston condition (d)).
  const prev = (await getConstant<string[]>(PERP_UNIVERSE_MODULE, PERP_MEMBERS_KEY, WILDCARD_KEY)) ?? [];
  const prevSet = new Set(prev);
  const nextSet = new Set(members);
  for (const s of members) if (!prevSet.has(s)) console.log(`[perpfeed][universe][ADD] ${s} (oi=${oiBySymbol.get(s) ?? 'n/a'})`);
  for (const s of prev) if (!nextSet.has(s)) console.log(`[perpfeed][universe][DROP] ${s} — rows already captured RETAIN and age out under the retention window (scope OBJ-1c)`);

  await setConstant(PERP_UNIVERSE_MODULE, PERP_MEMBERS_KEY, WILDCARD_KEY, members, updatedBy);
  await setConstant(PERP_UNIVERSE_MODULE, PERP_LAST_RECOMPUTE_KEY, WILDCARD_KEY, new Date().toISOString(), updatedBy);

  console.log(
    `[perpfeed][universe] recomputed: members=${members.length}/cap=${cap} ` +
    `(candidates=${candidates.length}, equity=${counts.equity_perp}, dated=${counts.dated}, ` +
    `inverse=${counts.inverse}, unclassified=${counts.unclassified})`
  );
  return members;
}

/**
 * The crypto-perp ARCHIVER universe: persisted members minus suspensions.
 * Membership changes ONLY at the monthly recompute (adds) or via suspension
 * (drops) — a restart re-reads the persisted set, it never recomputes
 * (adds-monthly survives restarts by construction). First-ever start (no
 * persisted set) performs the birth recompute.
 */
export async function loadCryptoPerpUniverse(): Promise<string[]> {
  const { getConstant } = await import('../module-constants-service.js');
  let members = await getConstant<string[]>(PERP_UNIVERSE_MODULE, PERP_MEMBERS_KEY, WILDCARD_KEY);
  if (!Array.isArray(members)) {
    console.log('[perpfeed][universe] no persisted membership — performing birth recompute');
    members = await recomputeCryptoPerpUniverse('perpfeed-birth-recompute');
  }
  const suspended = new Set((await getConstant<string[]>(PERP_UNIVERSE_MODULE, PERP_SUSPENDED_KEY, WILDCARD_KEY)) ?? []);
  const active = members.filter(s => !suspended.has(s));
  // OBJ-4: persisted-path registration (the recompute path registers inside
  // recomputeCryptoPerpUniverse; this covers the restart-reads-persisted path).
  const { registerCryptoPerpVenueSymbols } = await import('../../../shared/asset-classes.js');
  registerCryptoPerpVenueSymbols(members);
  console.log(`[perpfeed][universe] crypto_perp loaded: ${active.length} active (${members.length} members, ${suspended.size} suspended)`);
  return active;
}
