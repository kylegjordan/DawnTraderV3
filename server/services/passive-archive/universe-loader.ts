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
  // Both-sides join normalization (Step-4 BLOCKER-A): the futures payload
  // reports plain names today (BTC, LTC), but map through XBASE_TO_PLAIN for
  // symmetry with the spot side so neither side's naming era can break the join.
  if (cryptoSpotBases.has(XBASE_TO_PLAIN[base] ?? base)) return 'crypto_perp_candidate';
  return 'unclassified';
}

/**
 * Step-4 BLOCKER-G (Langston): the PRIMARY classification input gets the SAME
 * refuse-on-degraded posture as the altnames map (BLOCKER-F) — r3 guarded the
 * secondary input and left this one bare. Walk a degraded payload through the
 * unguarded version: instruments=[] → both registries registered COMPLETE on
 * empty sets (the flag is sticky and never inspects the array) → empty
 * classified sets PERSISTED → last_recompute_at STAMPED → every kraken-futures
 * symbol throws UNCLASSIFIED, a restart re-registers the empty sets, and the
 * monthly self-gate refuses a retry for 28 days. One transient futures-API
 * blip → four weeks of a persisted, complete, empty universe. So: resp.ok,
 * the venue's own result field, and an empty instrument list all THROW —
 * before any persistence (this call sits above every write in the recompute).
 * (The RANKING fetch stays catch-and-degrade by design — ranking degrades
 * gracefully; classification does not.) Exported with fetchImpl injection for
 * the negative-leg tests.
 */
export async function fetchKrakenFuturesInstruments(fetchImpl: typeof fetch = fetch): Promise<KrakenFuturesInstrument[]> {
  const resp = await fetchImpl(KF_INSTRUMENTS_URL);
  if (!resp.ok) {
    throw new Error(`[perpfeed][universe] instruments fetch degraded (HTTP ${resp.status}) — REFUSING the recompute; a degraded classification input must never persist (#546)`);
  }
  const json = await resp.json() as { result?: string; error?: unknown; instruments?: KrakenFuturesInstrument[] };
  if (json.result != null && json.result !== 'success') {
    throw new Error(`[perpfeed][universe] instruments fetch degraded (venue result=${JSON.stringify(json.result)}, error=${JSON.stringify(json.error ?? null)}) — REFUSING the recompute`);
  }
  if (!Array.isArray(json.instruments) || json.instruments.length === 0) {
    throw new Error('[perpfeed][universe] instruments fetch degraded (missing/empty instrument list) — REFUSING the recompute');
  }
  return json.instruments;
}

/**
 * Step-4 §13 item (Langston, r4 pass) — the PARTIAL-degradation floor, homed IN
 * THIS BATCH rather than filed: the empty-input guards (F/G/H) catch only the
 * all-or-nothing shape; half the spot ticker batches failing would silently
 * drop those bases and persist the result as complete. This is an OUTPUT
 * plausibility check on the CRYPTO side: it catches any degradation that
 * SHRINKS the crypto candidate count, whichever input caused it. (Known limit,
 * Langston r5: the EQUITY side has no floor — a payload whose fields degrade
 * only the equity classification is uncaught here; homed at governance.)
 * If a previous non-empty classified crypto set
 * exists and this recompute produced fewer than HALF as many candidates, the
 * universe is presumed degraded and the recompute REFUSES. A genuine halving
 * of Kraken's crypto perp listings inside one month is announced venue news —
 * the operator reruns with the monthly script's --force after confirming it.
 */
export function assertClassifiedPlausible(prevCount: number | null, currentCount: number): void {
  if (prevCount != null && prevCount > 0 && currentCount < Math.ceil(prevCount / 2)) {
    throw new Error(
      `[perpfeed][universe] classified crypto set imploded: ${currentCount} candidates vs ${prevCount} at the previous recompute ` +
      `(floor = ${Math.ceil(prevCount / 2)}) — REFUSING the recompute; partial input degradation must never persist as complete (#546). ` +
      `If Kraken genuinely delisted this many perps, confirm at the venue and rerun with --confirm-delisting.`,
    );
  }
}

const PERP_UNIVERSE_MODULE = 'passive_archive';
const PERP_MEMBERS_KEY = 'crypto_perp_universe.members';
const PERP_SUSPENDED_KEY = 'crypto_perp_universe.suspended';
const PERP_CAP_KEY = 'crypto_perp_universe.max_symbols';
const PERP_LAST_RECOMPUTE_KEY = 'crypto_perp_universe.last_recompute_at';
// Step-4 BLOCKER-B: the CLASSIFIED sets are persisted SEPARATELY from the
// capped capture membership — classification authority must not depend on
// process history (recompute registered ~213, a restart registered only the
// capped 20: same symbol, two answers). Both code paths register from these.
const PERP_CLASSIFIED_CRYPTO_KEY = 'crypto_perp_universe.classified';
const PERP_CLASSIFIED_EQUITY_KEY = 'xstock_perp_universe.classified';
const WILDCARD_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as const;

/**
 * Step-4 BLOCKER-A: the classification join key, normalized on BOTH sides.
 * The spot canonicals carry Kraken's legacy X-prefixed names wherever
 * XBASE_TO_PLAIN has no entry (XLTC/USD, XETC/USD — 47 of 260 live crypto
 * perp bases missed the join, Litecoin included), while the futures payload
 * reports plain names (LTC). Normalize via XBASE_TO_PLAIN first, then the
 * venue's OWN /0/public/Assets altname map (field-driven — XLTC's altname is
 * LTC by Kraken's own word, not by prefix-stripping), then identity.
 */
export function normalizeSpotBaseForJoin(base: string, assetAltnames: ReadonlyMap<string, string>): string {
  const viaPlain = XBASE_TO_PLAIN[base];
  if (viaPlain) return viaPlain;
  const alt = assetAltnames.get(base);
  if (alt) return XBASE_TO_PLAIN[alt] ?? alt;
  return base;
}

/**
 * Fetch Kraken spot /0/public/Assets → asset name → altname map.
 *
 * Step-4 BLOCKER-F (Langston): a DEGRADED fetch must FAIL THE RECOMPUTE, never
 * degrade the classification silently. The r2 version caught errors and
 * returned an empty map — one transient Assets outage during a monthly
 * recompute would have dropped the 47 X-named bases from the join, classified
 * 47 live crypto perps UNCLASSIFIED, marked both registries COMPLETE anyway,
 * and PERSISTED the degraded set (surviving restarts until the next monthly
 * recompute): BLOCKER-C's latent-armed-throw through a different door, armed
 * by an event no operator controls. `complete` must mean "the classification
 * INPUTS were complete," not "the recompute ran." So: resp.ok checked, the
 * venue's own error field checked, empty result refused — any failure THROWS,
 * the recompute aborts BEFORE any setConstant/registration (ordering matters:
 * this fetch precedes all persistence in recomputeCryptoPerpUniverse), flags
 * stay false, the resolver stays in fallback. A monthly recompute is
 * retryable; a persisted degraded classified set is not self-healing.
 * Exported with fetchImpl injection for the negative-leg test.
 */
export async function fetchSpotAssetAltnames(fetchImpl: typeof fetch = fetch): Promise<Map<string, string>> {
  const resp = await fetchImpl('https://api.kraken.com/0/public/Assets');
  if (!resp.ok) {
    throw new Error(`[perpfeed][universe] Assets altname fetch degraded (HTTP ${resp.status}) — REFUSING the recompute; a degraded classification input must never persist (#546)`);
  }
  const json = await resp.json() as { error?: unknown[]; result?: Record<string, { altname?: string }> };
  if (Array.isArray(json.error) && json.error.length > 0) {
    throw new Error(`[perpfeed][universe] Assets altname fetch degraded (venue error: ${JSON.stringify(json.error)}) — REFUSING the recompute`);
  }
  const map = new Map<string, string>();
  for (const [name, info] of Object.entries(json.result ?? {})) {
    if (info?.altname) map.set(name, info.altname);
  }
  if (map.size === 0) {
    throw new Error('[perpfeed][universe] Assets altname fetch degraded (empty result) — REFUSING the recompute');
  }
  return map;
}

/**
 * MONTHLY membership recompute (also the first-birth compute). Classifies the
 * full live instrument list, ranks crypto candidates by open interest, caps at
 * the budget-derived N, persists membership, and logs every add/drop.
 * Suspensions are PRESERVED across recomputes (a recompute is not an un-suspend).
 */
export async function recomputeCryptoPerpUniverse(updatedBy: string, opts?: { acceptImplosion?: boolean }): Promise<string[]> {
  const { getConstant, setConstant } = await import('../module-constants-service.js');

  const cap = await getConstant<number>(PERP_UNIVERSE_MODULE, PERP_CAP_KEY, WILDCARD_KEY);
  if (cap == null || cap <= 0) {
    // Fail-hard: the cap is a DB-governed budget derivation — no code default.
    throw new Error(`[perpfeed][universe] ${PERP_CAP_KEY} missing/invalid in module_constants — the migration seeds it; refusing to compute a universe without a budget cap`);
  }

  // The crypto positive set: base assets of the current crypto_spot universe,
  // JOIN-NORMALIZED on both sides (Step-4 BLOCKER-A — 47 of 260 live crypto
  // perp bases, Litecoin included, missed the un-normalized join because the
  // spot canonicals keep legacy X-prefixed names outside XBASE_TO_PLAIN).
  const spot = await loadCryptoSpotUniverse();
  const assetAltnames = await fetchSpotAssetAltnames();
  const cryptoSpotBases = new Set(spot.symbols.map(s => normalizeSpotBaseForJoin(s.split('/')[0], assetAltnames)));
  // Step-4 BLOCKER-H (Langston): the THIRD classification input, guarded AT THE
  // CALL SITE — loadCryptoSpotUniverse is B74-era shared machinery whose posture
  // this batch does not change (a rate-limited 200 returns {error:[...]} with an
  // empty result, which it converts to symbols:[] cleanly, no throw). An empty
  // spot base set fails rule 4 for EVERY instrument → an authoritatively empty
  // crypto side persisted complete for 28 days — the same walk as F/G through
  // the spot venue's rate limiter. Same posture, same wording, zero blast radius.
  if (cryptoSpotBases.size === 0) {
    throw new Error('[perpfeed][universe] crypto_spot universe came back EMPTY — REFUSING the recompute; a degraded classification input must never persist (#546)');
  }

  const instruments = await fetchKrakenFuturesInstruments();

  const counts: Record<PerpClassification, number> = {
    equity_perp: 0, crypto_perp_candidate: 0, dated: 0, inverse: 0, not_tradeable: 0, unclassified: 0,
  };
  const candidates: Array<{ symbol: string; base: string; quote: string }> = [];
  const equityNames: string[] = [];
  for (const inst of instruments) {
    const cls = classifyKrakenFuturesInstrument(inst, cryptoSpotBases);
    counts[cls]++;
    if (cls === 'crypto_perp_candidate') candidates.push({ symbol: inst.symbol, base: inst.base ?? '', quote: inst.quote ?? 'USD' });
    if (cls === 'equity_perp') equityNames.push(inst.symbol);
    if (cls === 'unclassified' && inst.tradeable) {
      // Rule 5: loud, named, never silently binned as crypto.
      console.warn(`[perpfeed][universe][UNCLASSIFIED] ${inst.symbol} (base=${inst.base ?? '?'}, category=${inst.category ?? '?'}, tradfi=${inst.tradfi ?? false}) — fails both positive tests; refused`);
    }
  }

  // Step-4 §13 partial-degradation floor — checked against the PREVIOUS
  // classified set BEFORE any registration/persistence (inherits the ordering
  // pin). `acceptImplosion` is the deliberate operator override threaded from
  // the monthly script's --force, for a confirmed genuine venue delisting.
  const prevClassified = await getConstant<Array<{ symbol: string }>>(PERP_UNIVERSE_MODULE, PERP_CLASSIFIED_CRYPTO_KEY, WILDCARD_KEY);
  if (opts?.acceptImplosion) {
    console.warn('[perpfeed][universe] --confirm-delisting: plausibility floor BYPASSED — operator asserts a venue-confirmed delisting');
  } else {
    assertClassifiedPlausible(Array.isArray(prevClassified) ? prevClassified.length : null, candidates.length);
  }

  // OBJ-4 + Step-4 BLOCKER-B: refresh BOTH membership registries from the FULL
  // classified payload (never the capped capture set), persist the classified
  // sets so the restart path registers the same authority, and mark both sides
  // COMPLETE (arming the refuse path — BLOCKER-C). The equity side gets the
  // complete live set (16 today, vs the static capture JSON's 10 — #687).
  {
    const { registerXstockPerpVenueSymbols, registerCryptoPerpVenueSymbols } = await import('../../../shared/asset-classes.js');
    registerXstockPerpVenueSymbols(equityNames, { complete: true });
    registerCryptoPerpVenueSymbols(candidates, { complete: true });
  }
  await setConstant(PERP_UNIVERSE_MODULE, PERP_CLASSIFIED_CRYPTO_KEY, WILDCARD_KEY, candidates, updatedBy);
  await setConstant(PERP_UNIVERSE_MODULE, PERP_CLASSIFIED_EQUITY_KEY, WILDCARD_KEY, equityNames, updatedBy);

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
  candidates.sort((a, b) => (oiBySymbol.get(b.symbol) ?? 0) - (oiBySymbol.get(a.symbol) ?? 0) || a.symbol.localeCompare(b.symbol));
  const members = candidates.slice(0, cap).map(c => c.symbol).sort();

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
  // Step-4 BLOCKER-B: the restart path registers from the persisted CLASSIFIED
  // sets — the SAME authority the recompute registered — never the capped
  // capture membership (recompute registered ~213 while a restart registered
  // 20: same symbol, two answers, decided by process history). Completeness is
  // marked only when the persisted classified sets actually exist.
  const { registerCryptoPerpVenueSymbols, registerXstockPerpVenueSymbols } = await import('../../../shared/asset-classes.js');
  const classifiedCrypto = await getConstant<Array<{ symbol: string; base: string; quote: string }>>(PERP_UNIVERSE_MODULE, PERP_CLASSIFIED_CRYPTO_KEY, WILDCARD_KEY);
  const classifiedEquity = await getConstant<string[]>(PERP_UNIVERSE_MODULE, PERP_CLASSIFIED_EQUITY_KEY, WILDCARD_KEY);
  if (Array.isArray(classifiedCrypto) && Array.isArray(classifiedEquity)) {
    registerCryptoPerpVenueSymbols(classifiedCrypto, { complete: true });
    registerXstockPerpVenueSymbols(classifiedEquity, { complete: true });
  } else {
    console.warn('[perpfeed][universe] persisted classified sets absent — registries stay INCOMPLETE (refuse path unarmed) until the next recompute persists them');
  }
  console.log(`[perpfeed][universe] crypto_perp loaded: ${active.length} active (${members.length} members, ${suspended.size} suspended)`);
  return active;
}
