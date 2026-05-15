/**
 * B70 Step 3.3 — Macro Feed Archiver
 *
 * Captures B67.1 macro snapshots (btc_dom, mcap_mom, funding, modifier_value,
 * fallback_active) per cycle. Lowest cadence of all archivers (60s, single
 * row per cycle). Hooks into external-macro-feed.ts:pollCycle() post-snapshot.
 */

import { enqueueArchiveRow, registerArchiveTable } from './archive-batch-writer.js';
import { getArchiveConfig } from './archive-config.js';

const TABLE = 'macro_feed_archive';
const COLUMNS = [
  'captured_at',
  'source',
  'btc_dominance_pct',
  'mcap_momentum',
  'funding_rate',
  'modifier_value',
  'fallback_active',
  'snapshot',
];

let registered = false;

export function ensureMacroArchiverRegistered(): void {
  if (registered) return;
  registerArchiveTable(TABLE, COLUMNS);
  registered = true;
}

export interface MacroArchiveInput {
  capturedAt: Date | number;
  // B-NEW-32 (2026-05-15): caller-supplied source tag. Lets the feed identify
  // its own tier (e.g. 'coingecko-global' for Demo, 'coingecko-pro-global' for
  // Pro). Optional with backward-compat default for callers that pre-date the
  // tier-configurable migration.
  source?: string;
  btcDominance?: number;
  mcapMomentum?: number;
  fundingRate?: number;
  modifierValue?: number;
  fallbackActive: boolean;
  snapshot: Record<string, unknown>;
}

export function archiveMacroSnapshot(input: MacroArchiveInput): void {
  const cfg = getArchiveConfig();
  if (!cfg.macroFeedEnabled) return;

  ensureMacroArchiverRegistered();

  const capturedAt =
    input.capturedAt instanceof Date ? input.capturedAt : new Date(input.capturedAt);

  const snapshotWithVersion = {
    schema_version: 1,
    ...input.snapshot,
  };

  enqueueArchiveRow(TABLE, {
    captured_at: capturedAt,
    source: input.source ?? 'coingecko-global',
    btc_dominance_pct: input.btcDominance ?? null,
    mcap_momentum: input.mcapMomentum ?? null,
    funding_rate: input.fundingRate ?? null,
    modifier_value: input.modifierValue ?? null,
    fallback_active: input.fallbackActive,
    snapshot: snapshotWithVersion,
  });
}
