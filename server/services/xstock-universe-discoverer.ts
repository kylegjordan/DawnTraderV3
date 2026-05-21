/**
 * B79.0n.UNIVERSE-DISCOVERY — three-source discovery chain orchestrator.
 *
 * Daily 06:00 UTC cron + manual /api/internal/universe-discovery/refresh trigger.
 *
 * Source chain:
 *   1. CoinGecko `xstocks-ecosystem` category — canonical "what Backed Finance
 *      currently issues" catalog. Pro tier auth via COINGECKO_API_KEY +
 *      x-cg-pro-api-key header (already wired in external-macro-feed.ts).
 *   2. Kraken WebSocket subscription probe at wss://ws-equities.kraken.com —
 *      authoritative "what Kraken accepts" gate. Batched 100/chunk + 500ms
 *      inter-batch sleep per Langston Q-PA-3 ACK. Partial-response window
 *      timeout → log + abort + fall through to Layer 2 fallback (Langston
 *      additional concern).
 *   3. Finnhub /stock/profile2 — per-symbol GICS industry → internal sector
 *      enum. FINNHUB_API_KEY required (provisioned 2026-05-21 per Q-PA-1).
 *      Missing key → sector='UNCATEGORIZED' soft-fallback per pre-audit §5.3.
 *
 * Stale → delisted lifecycle (Langston Q9 #3): last_seen_at-driven.
 *   <7 days  = active (no action)
 *   7-30 days = stale (warn log [STALE_SYMBOL]; still in active universe)
 *   >30 days = delisted (is_delisted=true; excluded from XSTOCK_SPOT_SYMBOLS)
 *
 * Override merge (Langston Q3 ACK): xstock_spot_universe_overrides table holds
 * manual curation (cryptoAdjacent / adr / sector_override / name_override).
 * Override columns NULL = use discovered value. Override columns non-NULL = win.
 *
 * Audit: every discovery cycle writes one row to discovery_runs (Langston Q9 #2).
 *
 * Crypto regression: NONE by construction. All DB writes scoped to
 * xstock_spot_universe + xstock_spot_universe_overrides + discovery_runs.
 */

import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import WebSocket from 'ws';
import { getSp500BackstopCandidates } from '../asset_classes/xstock_spot/sp500-backstop.js';
import { xstockUniverseService } from '../asset_classes/xstock_spot/universe-service.js';
import type { XstockSpotEntry, XstockSector } from '../../shared/asset-classes.js';

// ──────────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────────

const COINGECKO_BASE_URL = 'https://pro-api.coingecko.com/api/v3';
const COINGECKO_CATEGORY = 'xstocks-ecosystem';
const KRAKEN_WS_URL = 'wss://ws-equities.kraken.com';
const KRAKEN_PROBE_CHUNK_SIZE = 100;
const KRAKEN_PROBE_INTER_BATCH_SLEEP_MS = 500;
const KRAKEN_PROBE_COLLECTION_WINDOW_MS = 15_000;
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const FINNHUB_RATE_LIMIT_DELAY_MS = 1100;  // 60/min = 1/s; pad to 1.1s

const STALE_THRESHOLD_DAYS = 7;
const DELISTED_THRESHOLD_DAYS = 30;

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
}

interface FinnhubProfile {
  finnhubIndustry?: string;
  name?: string;
  country?: string;
  exchange?: string;
}

interface ProbedSymbol {
  symbol: string;
  acceptedByKraken: boolean;
  inCoingecko: boolean;
}

export interface DiscoveryResult {
  runId: number;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  symbolsDiscovered: number;
  symbolsMarkedStale: number;
  symbolsMarkedDelisted: number;
  sourceChainStatus: {
    coingecko: { ok: boolean; count: number; error?: string };
    kraken_ws: { ok: boolean; candidates_probed: number; accepted_count: number; rejected_count: number; partial?: boolean; error?: string };
    finnhub: { ok: boolean; enriched_count: number; missing_key?: boolean; error?: string };
  };
  errorLog?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Logging helpers
// ──────────────────────────────────────────────────────────────────────────

function logInfo(...args: unknown[]): void {
  console.log(`[B79.0n.UNIVERSE-DISCOVERY]`, ...args);
}
function logWarn(...args: unknown[]): void {
  console.warn(`[B79.0n.UNIVERSE-DISCOVERY]`, ...args);
}
function logError(...args: unknown[]): void {
  console.error(`[B79.0n.UNIVERSE-DISCOVERY]`, ...args);
}

// ──────────────────────────────────────────────────────────────────────────
// CoinGecko fetcher
// ──────────────────────────────────────────────────────────────────────────

async function fetchCoinGeckoTokenizedStocks(): Promise<{ ok: boolean; symbols: Set<string>; coins: CoinGeckoCoin[]; error?: string }> {
  const apiKey = process.env.COINGECKO_API_KEY;
  if (!apiKey) {
    return { ok: false, symbols: new Set(), coins: [], error: 'COINGECKO_API_KEY not set' };
  }
  try {
    const url = `${COINGECKO_BASE_URL}/coins/markets?vs_currency=usd&category=${COINGECKO_CATEGORY}&per_page=250&page=1`;
    const resp = await fetch(url, { headers: { 'x-cg-pro-api-key': apiKey } });
    if (!resp.ok) {
      return { ok: false, symbols: new Set(), coins: [], error: `CoinGecko HTTP ${resp.status}` };
    }
    const data = (await resp.json()) as CoinGeckoCoin[];
    // CoinGecko symbol form is `<UNDERLYING>x` (lowercase, e.g. aaplx).
    // Canonicalize to `<UNDERLYING>/USD` by uppercase + strip trailing 'X' + append /USD.
    const symbols = new Set<string>();
    for (const coin of data) {
      const raw = coin.symbol.toUpperCase();
      const underlying = raw.endsWith('X') ? raw.slice(0, -1) : raw;
      if (underlying.length === 0) continue;
      symbols.add(`${underlying}/USD`);
    }
    logInfo(`CoinGecko: fetched ${data.length} coins from category=${COINGECKO_CATEGORY}, mapped to ${symbols.size} canonical symbols`);
    return { ok: true, symbols, coins: data };
  } catch (err) {
    const errStr = err instanceof Error ? err.message : String(err);
    return { ok: false, symbols: new Set(), coins: [], error: errStr };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Kraken WS subscription probe
// ──────────────────────────────────────────────────────────────────────────

/**
 * Probe Kraken's xStock WebSocket with a batched-chunked subscribe pattern.
 * Returns accepted + rejected symbol sets, OR returns partial=true if the
 * collection window timed out before all chunks responded (caller MUST treat
 * partial=true as "discard the probe result, fall through to fallback").
 */
async function probeKrakenWs(candidates: Set<string>): Promise<{ ok: boolean; accepted: Set<string>; rejected: Set<string>; partial: boolean; error?: string }> {
  const candidateArr = Array.from(candidates);
  const chunks: string[][] = [];
  for (let i = 0; i < candidateArr.length; i += KRAKEN_PROBE_CHUNK_SIZE) {
    chunks.push(candidateArr.slice(i, i + KRAKEN_PROBE_CHUNK_SIZE));
  }
  logInfo(`Kraken WS probe: ${candidateArr.length} candidates split into ${chunks.length} chunks of <=${KRAKEN_PROBE_CHUNK_SIZE}`);

  return new Promise((resolve) => {
    const accepted = new Set<string>();
    const rejected = new Set<string>();
    let collected = 0;
    const expected = candidateArr.length;

    const ws = new WebSocket(KRAKEN_WS_URL);
    let timeoutHandle: NodeJS.Timeout | null = null;
    let resolved = false;

    const finish = (ok: boolean, partial: boolean, error?: string): void => {
      if (resolved) return;
      resolved = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      try { ws.close(); } catch { /* ignore */ }
      const summary = `accepted=${accepted.size} rejected=${rejected.size} collected=${collected}/${expected}`;
      if (partial) {
        logWarn(`[PROBE_INCOMPLETE] ${summary} timeout_at=${new Date().toISOString()}`);
      } else {
        logInfo(`Kraken WS probe complete: ${summary}`);
      }
      resolve({ ok, accepted, rejected, partial, error });
    };

    ws.on('open', async () => {
      logInfo(`Kraken WS connected; sending ${chunks.length} chunk subscribes (chunk=${KRAKEN_PROBE_CHUNK_SIZE}, sleep=${KRAKEN_PROBE_INTER_BATCH_SLEEP_MS}ms)`);
      for (let i = 0; i < chunks.length; i++) {
        try {
          ws.send(JSON.stringify({
            method: 'subscribe',
            params: { channel: 'ticker', symbol: chunks[i] },
          }));
          logInfo(`[PROBE_CHUNK] chunk=${i + 1}/${chunks.length} size=${chunks[i].length} sent`);
        } catch (e) {
          finish(false, true, `chunk ${i} send failed: ${e}`);
          return;
        }
        if (i < chunks.length - 1) {
          await new Promise<void>((r) => setTimeout(r, KRAKEN_PROBE_INTER_BATCH_SLEEP_MS));
        }
      }
      // Arm the collection-window timeout AFTER all chunks have been sent.
      timeoutHandle = setTimeout(() => {
        const partial = collected < expected;
        finish(partial ? false : true, partial);
      }, KRAKEN_PROBE_COLLECTION_WINDOW_MS);
    });

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data?.method === 'subscribe') {
          if (data.success === true) {
            const sym = data?.result?.symbol;
            if (typeof sym === 'string') {
              accepted.add(sym);
              collected++;
            }
          } else if (data.success === false) {
            // Reject error message contains the symbol name. Parse it.
            const errMsg: string = data?.error ?? '';
            const m = errMsg.match(/(\S+\/\S+)/);
            if (m) {
              rejected.add(m[1]);
              collected++;
            }
          }
          if (collected >= expected) {
            finish(true, false);
          }
        }
      } catch {
        // Non-JSON or unparseable message — ignore (ticker snapshots arrive too)
      }
    });

    ws.on('error', (err) => {
      finish(false, true, `WS error: ${err.message ?? String(err)}`);
    });

    ws.on('close', () => {
      if (!resolved) finish(collected >= expected, collected < expected);
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Finnhub metadata
// ──────────────────────────────────────────────────────────────────────────

/**
 * Finnhub returns generic industry strings. Map to our internal sector enum.
 */
function mapFinnhubIndustryToSector(industry: string | undefined): XstockSector {
  if (!industry) return 'UNCATEGORIZED' as XstockSector;
  const i = industry.toLowerCase();
  if (i.includes('technology')) return 'XLK';
  if (i.includes('health')) return 'XLV';
  if (i.includes('financ') || i.includes('bank') || i.includes('insurance')) return 'XLF';
  if (i.includes('communication') || i.includes('media') || i.includes('telecom')) return 'XLC';
  if (i.includes('consumer cyclical') || i.includes('consumer discretionary') || i.includes('retail') || i.includes('automotive')) return 'XLY';
  if (i.includes('consumer defensive') || i.includes('consumer staples') || i.includes('beverage') || i.includes('tobacco')) return 'XLP';
  if (i.includes('energy') || i.includes('oil') || i.includes('gas')) return 'XLE';
  if (i.includes('industrial')) return 'XLI';
  if (i.includes('real estate') || i.includes('reit')) return 'XLRE';
  if (i.includes('utilit')) return 'XLU';
  if (i.includes('material') || i.includes('chemical') || i.includes('mining')) return 'XLB';
  return 'UNCATEGORIZED' as XstockSector;
}

async function fetchFinnhubMetadata(symbol: string): Promise<FinnhubProfile | null> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;
  // `symbol` is in canonical 'BASE/USD' form; Finnhub expects the bare ticker
  const ticker = symbol.split('/')[0];
  try {
    const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = (await resp.json()) as FinnhubProfile;
    return data ?? null;
  } catch {
    return null;
  }
}

async function enrichWithFinnhub(symbols: Set<string>): Promise<{ ok: boolean; metadata: Map<string, { sector: XstockSector; name?: string }>; enrichedCount: number; missingKey: boolean }> {
  const metadata = new Map<string, { sector: XstockSector; name?: string }>();
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    logWarn(`FINNHUB_API_KEY not set — all symbols will get sector='UNCATEGORIZED'`);
    for (const s of symbols) metadata.set(s, { sector: 'UNCATEGORIZED' as XstockSector });
    return { ok: false, metadata, enrichedCount: 0, missingKey: true };
  }
  let enrichedCount = 0;
  for (const symbol of symbols) {
    const profile = await fetchFinnhubMetadata(symbol);
    if (profile) {
      metadata.set(symbol, {
        sector: mapFinnhubIndustryToSector(profile.finnhubIndustry),
        name: profile.name,
      });
      enrichedCount++;
    } else {
      metadata.set(symbol, { sector: 'UNCATEGORIZED' as XstockSector });
    }
    // Rate limit: 60/min on free tier
    await new Promise<void>((r) => setTimeout(r, FINNHUB_RATE_LIMIT_DELAY_MS));
  }
  logInfo(`Finnhub: enriched ${enrichedCount}/${symbols.size} symbols`);
  return { ok: true, metadata, enrichedCount, missingKey: false };
}

// ──────────────────────────────────────────────────────────────────────────
// DB ops
// ──────────────────────────────────────────────────────────────────────────

interface OverrideRow {
  symbol: string;
  sector_override: string | null;
  crypto_adjacent_override: boolean | null;
  adr_override: boolean | null;
  name_override: string | null;
}

async function loadOverrides(): Promise<Map<string, OverrideRow>> {
  const out = new Map<string, OverrideRow>();
  try {
    const result = await db.execute<OverrideRow>(sql`
      SELECT symbol, sector_override, crypto_adjacent_override, adr_override, name_override
      FROM xstock_spot_universe_overrides
    `);
    const rows = (result as { rows?: OverrideRow[] }).rows ?? (result as unknown as OverrideRow[]);
    for (const r of (Array.isArray(rows) ? rows : [])) out.set(r.symbol, r);
  } catch (err) {
    logWarn(`loadOverrides failed (proceeding with empty overrides):`, err);
  }
  return out;
}

async function upsertUniverseRow(
  symbol: string,
  finalEntry: XstockSpotEntry,
  sourceChain: { coingecko: boolean; kraken_ws_accept: boolean; finnhub: boolean; override_applied: boolean },
): Promise<void> {
  await db.execute(sql`
    INSERT INTO xstock_spot_universe (symbol, name, sector, crypto_adjacent, adr, source_chain, last_seen_at, updated_at)
    VALUES (
      ${symbol},
      ${finalEntry.name},
      ${finalEntry.sector},
      ${finalEntry.cryptoAdjacent ?? false},
      ${finalEntry.adr ?? false},
      ${JSON.stringify(sourceChain)}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (symbol) DO UPDATE SET
      name = EXCLUDED.name,
      sector = EXCLUDED.sector,
      crypto_adjacent = EXCLUDED.crypto_adjacent,
      adr = EXCLUDED.adr,
      source_chain = EXCLUDED.source_chain,
      last_seen_at = now(),
      updated_at = now(),
      is_delisted = false
  `);
}

async function applyStaleAndDelistedLifecycle(): Promise<{ stale: number; delisted: number }> {
  // Stale: last_seen_at in [7d ago, 30d ago] → log warn line per row, no DB change
  const staleResult = await db.execute<{ symbol: string; days_stale: number }>(sql`
    SELECT symbol, EXTRACT(EPOCH FROM (now() - last_seen_at)) / 86400 AS days_stale
    FROM xstock_spot_universe
    WHERE is_delisted = false
      AND last_seen_at < now() - INTERVAL '${sql.raw(String(STALE_THRESHOLD_DAYS))} days'
      AND last_seen_at >= now() - INTERVAL '${sql.raw(String(DELISTED_THRESHOLD_DAYS))} days'
  `);
  const staleRows = (staleResult as { rows?: Array<{ symbol: string; days_stale: number }> }).rows
    ?? (staleResult as unknown as Array<{ symbol: string; days_stale: number }>);
  const staleArr = Array.isArray(staleRows) ? staleRows : [];
  for (const r of staleArr) {
    logWarn(`[STALE_SYMBOL] symbol=${r.symbol} days_stale=${Number(r.days_stale).toFixed(1)} last_seen_at=<>${DELISTED_THRESHOLD_DAYS}d`);
  }

  // Delisted: last_seen_at > 30d ago → set is_delisted=true
  const delistedResult = await db.execute<{ symbol: string }>(sql`
    UPDATE xstock_spot_universe
    SET is_delisted = true, updated_at = now()
    WHERE is_delisted = false
      AND last_seen_at < now() - INTERVAL '${sql.raw(String(DELISTED_THRESHOLD_DAYS))} days'
    RETURNING symbol
  `);
  const delistedRows = (delistedResult as { rows?: Array<{ symbol: string }> }).rows
    ?? (delistedResult as unknown as Array<{ symbol: string }>);
  const delistedArr = Array.isArray(delistedRows) ? delistedRows : [];
  for (const r of delistedArr) {
    logWarn(`[DELISTED_AUTO] symbol=${r.symbol} reason="no_data_>${DELISTED_THRESHOLD_DAYS}_days"`);
  }
  return { stale: staleArr.length, delisted: delistedArr.length };
}

async function writeDiscoveryRun(
  status: DiscoveryResult['sourceChainStatus'],
  symbolsDiscovered: number,
  symbolsMarkedStale: number,
  symbolsMarkedDelisted: number,
  startedAt: Date,
  completedAt: Date,
  triggeredBy: 'cron_daily' | 'manual_endpoint' | 'boot_smoke',
  errorLog?: string,
): Promise<number> {
  const result = await db.execute<{ run_id: number }>(sql`
    INSERT INTO discovery_runs (
      started_at, completed_at, duration_ms, source_chain_status,
      symbols_discovered, symbols_marked_stale, symbols_marked_delisted,
      error_log, triggered_by
    ) VALUES (
      ${startedAt}, ${completedAt}, ${completedAt.getTime() - startedAt.getTime()},
      ${JSON.stringify(status)}::jsonb,
      ${symbolsDiscovered}, ${symbolsMarkedStale}, ${symbolsMarkedDelisted},
      ${errorLog ?? null}, ${triggeredBy}
    )
    RETURNING run_id
  `);
  const rows = (result as { rows?: Array<{ run_id: number }> }).rows
    ?? (result as unknown as Array<{ run_id: number }>);
  return Array.isArray(rows) && rows[0] ? rows[0].run_id : 0;
}

// ──────────────────────────────────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────────────────────────────────

export async function runDiscovery(triggeredBy: 'cron_daily' | 'manual_endpoint' | 'boot_smoke' = 'cron_daily'): Promise<DiscoveryResult> {
  const startedAt = new Date();
  logInfo(`[CRON][B79.0n.UNIVERSE-DISCOVERY] daily refresh started at ${startedAt.toISOString()} (triggered_by=${triggeredBy})`);

  let errorLog: string | undefined;
  const sourceChainStatus: DiscoveryResult['sourceChainStatus'] = {
    coingecko: { ok: false, count: 0 },
    kraken_ws: { ok: false, candidates_probed: 0, accepted_count: 0, rejected_count: 0 },
    finnhub: { ok: false, enriched_count: 0 },
  };

  // ── Stage 1: CoinGecko ─────────────────────────────────────────────────
  const cgResult = await fetchCoinGeckoTokenizedStocks();
  sourceChainStatus.coingecko = { ok: cgResult.ok, count: cgResult.symbols.size, error: cgResult.error };
  if (!cgResult.ok) {
    logWarn(`CoinGecko stage failed: ${cgResult.error} — proceeding with S&P 500 backstop only`);
  }

  // ── Stage 2: candidate set = CoinGecko ∪ S&P 500 backstop ──────────────
  const sp500Backstop = getSp500BackstopCandidates();
  const candidates = new Set<string>([...cgResult.symbols, ...sp500Backstop]);

  const cgOverlap = Array.from(cgResult.symbols).filter((s) => sp500Backstop.has(s)).length;
  const cgVsRegistryOverlapPct = cgResult.symbols.size > 0
    ? (cgOverlap / cgResult.symbols.size * 100).toFixed(1)
    : 'N/A';
  if (cgResult.symbols.size > 0 && cgResult.symbols.size < 50) {
    logWarn(`[LOW_COINGECKO_COVERAGE] coingecko_count=${cgResult.symbols.size} sp500_overlap=${cgOverlap} (=${cgVsRegistryOverlapPct}%) — S&P 500 backstop carrying load`);
  }

  // ── Stage 3: Kraken WS probe ───────────────────────────────────────────
  const probeResult = await probeKrakenWs(candidates);
  sourceChainStatus.kraken_ws = {
    ok: probeResult.ok && !probeResult.partial,
    candidates_probed: candidates.size,
    accepted_count: probeResult.accepted.size,
    rejected_count: probeResult.rejected.size,
    partial: probeResult.partial,
    error: probeResult.error,
  };

  if (probeResult.partial) {
    // Partial-response failure — Langston additional concern: DO NOT update
    // xstock_spot_universe with the partial result (would corrupt with false-
    // rejects). Log + abort. Caller falls through to Layer 2 fallback.
    errorLog = `Kraken WS probe partial-response (collected ${probeResult.accepted.size + probeResult.rejected.size}/${candidates.size}); aborting discovery cycle`;
    logError(errorLog);
    const completedAt = new Date();
    const runId = await writeDiscoveryRun(sourceChainStatus, 0, 0, 0, startedAt, completedAt, triggeredBy, errorLog);
    return {
      runId, startedAt, completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      symbolsDiscovered: 0, symbolsMarkedStale: 0, symbolsMarkedDelisted: 0,
      sourceChainStatus, errorLog,
    };
  }

  // ── Stage 4: Finnhub metadata enrichment ───────────────────────────────
  const finnhubResult = await enrichWithFinnhub(probeResult.accepted);
  sourceChainStatus.finnhub = {
    ok: finnhubResult.ok,
    enriched_count: finnhubResult.enrichedCount,
    missing_key: finnhubResult.missingKey,
  };

  // ── Stage 5: load overrides + merge + upsert ───────────────────────────
  const overrides = await loadOverrides();
  let upsertCount = 0;
  for (const symbol of probeResult.accepted) {
    const finnhubMeta = finnhubResult.metadata.get(symbol) ?? { sector: 'UNCATEGORIZED' as XstockSector };
    const override = overrides.get(symbol);
    const finalEntry: XstockSpotEntry = {
      name: override?.name_override ?? finnhubMeta.name ?? symbol.split('/')[0],
      sector: (override?.sector_override as XstockSector | undefined) ?? finnhubMeta.sector,
      cryptoAdjacent: override?.crypto_adjacent_override ?? false,
      adr: override?.adr_override ?? false,
    };
    try {
      await upsertUniverseRow(symbol, finalEntry, {
        coingecko: cgResult.symbols.has(symbol),
        kraken_ws_accept: true,
        finnhub: finnhubResult.metadata.get(symbol) !== undefined && !finnhubResult.missingKey,
        override_applied: override !== undefined,
      });
      upsertCount++;
    } catch (err) {
      logWarn(`upsert failed for ${symbol}:`, err);
    }
  }
  logInfo(`upsert: wrote/updated ${upsertCount} rows in xstock_spot_universe`);

  // ── Stage 6: stale → delisted lifecycle ────────────────────────────────
  const { stale, delisted } = await applyStaleAndDelistedLifecycle();

  // ── Stage 7: refresh in-memory universe from new DB state ──────────────
  const initResult = await xstockUniverseService.refreshFromDB();
  if (!initResult.ok) {
    logWarn(`post-discovery universe-service.refreshFromDB failed:`, initResult.error);
  }

  // ── Stage 8: write file cache (layer-3 fallback durability) ────────────
  try {
    const fcEntries = Array.from(probeResult.accepted)
      .map((sym) => {
        const meta = finnhubResult.metadata.get(sym);
        const override = overrides.get(sym);
        const entry: XstockSpotEntry = {
          name: override?.name_override ?? meta?.name ?? sym.split('/')[0],
          sector: (override?.sector_override as XstockSector | undefined) ?? (meta?.sector ?? 'UNCATEGORIZED' as XstockSector),
          cryptoAdjacent: override?.crypto_adjacent_override ?? false,
          adr: override?.adr_override ?? false,
        };
        return [sym, entry] as [string, XstockSpotEntry];
      });
    await xstockUniverseService.writeFileCache(fcEntries);
  } catch (err) {
    logWarn(`writeFileCache stage failed (non-fatal):`, err);
  }

  // ── Stage 9: audit row + completion log ────────────────────────────────
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const runId = await writeDiscoveryRun(
    sourceChainStatus,
    upsertCount, stale, delisted,
    startedAt, completedAt, triggeredBy, errorLog,
  );
  logInfo(`[CRON][B79.0n.UNIVERSE-DISCOVERY] daily refresh completed in ${durationMs}ms; symbols=${upsertCount}; new=${upsertCount}; stale=${stale}; delisted=${delisted}`);

  return {
    runId, startedAt, completedAt, durationMs,
    symbolsDiscovered: upsertCount, symbolsMarkedStale: stale, symbolsMarkedDelisted: delisted,
    sourceChainStatus, errorLog,
  };
}
