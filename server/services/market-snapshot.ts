// server/services/market-snapshot.ts
//
// B67.1 (2026-04-28): reconciled per BATCH_67_1_PRE_AUDIT.md §3.5. The previous
// stub body returned hardcoded values (btcDominance=54.2, etc.) and was a
// pre-existing scaffolding never wired to a real feed. Reconciliation rule
// per Langston cc-inbox #844 §6.1: re-use the existing carrier type, replace
// the stub body with a thin wrapper around `external-macro-feed.ts`. Single
// caller (`ai-market-analyzer.ts`) inherits real macro values transparently.
//
// Type extended with `fundingRate` field (B67.1 funding-rate input). Existing
// callers that don't read it are unaffected; new callers can opt in.

import { getLatestMacroSnapshot } from './external-macro-feed.js';

export type MarketSnapshot = {
  utcIso: string;
  btcDominance?: number;          // %
  totalMarketCapUsd?: number;     // number — note: B67.1 feed stores momentum here, not raw mcap
  fundingRate?: number;           // B67.1: aggregated 8h funding rate (BTC + ETH perps weighted)
  avgVolatility30d?: number;      // e.g., realized volatility proxy (not yet wired in B67.1)
  avgVolume24hUsd?: number;
  trendScore?: number;            // 0..1 (derived from SMA/EMA breadth or existing calc; not wired in B67.1)
  riskOnScore?: number;           // -1..+1 heuristic (not wired in B67.1)
  notes?: string[];               // any internal flags
};

/**
 * Returns the latest market snapshot. Backed by `external-macro-feed.ts`'s
 * cached snapshot. When the feed is cold-started, partial, or stale, the
 * returned MarketSnapshot reflects that via empty `notes` (caller-side checks
 * via `notes.includes('partial')` etc. — kept loose to preserve existing
 * `notes?: string[]` API).
 */
export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  const notes: string[] = [];

  try {
    const macro = getLatestMacroSnapshot();

    if (macro.partialFeed) notes.push('partial_feed');
    if (!Number.isFinite(macro.ageSeconds) || macro.ageSeconds > 300) {
      notes.push('stale');
    }

    return {
      utcIso: macro.utcIso,
      btcDominance: macro.btcDominance,
      totalMarketCapUsd: macro.totalMarketCapUsd,
      fundingRate: macro.fundingRate,
      // The remaining fields are not wired in B67.1; left undefined so
      // existing callers see them as missing rather than placeholder values.
      notes,
    };
  } catch (error) {
    notes.push(`Snapshot error: ${error instanceof Error ? error.message : 'unknown'}`);

    return {
      utcIso: new Date().toISOString(),
      notes,
    };
  }
}
