/**
 * Batch 22: Seed family-specific filter profiles
 * Run once after schema migration to add the 8 new filter_path rows.
 *
 * Usage: Called from the existing seed/migration flow, or run manually:
 *   npx tsx server/db/seed-family-filters.ts
 */

import { db } from '../db.js';
import { screenerFilters } from '../../shared/schema.js';

const FAMILY_FILTER_SEEDS = [
  // Active trading family paths
  { mode: 'paper', filterPath: 'active_trend',      lqMin: '40.00', vnMax: '0.6000', diMin: '55.00', diMax: '100.00', corrMax: '0.9200', minVolume: '500000.00', minHistoryDays: 30 },
  { mode: 'paper', filterPath: 'active_reversal',   lqMin: '25.00', vnMax: '0.8500', diMin: '0.00',  diMax: '35.00',  corrMax: '0.9500', minVolume: '250000.00', minHistoryDays: 21 },
  { mode: 'paper', filterPath: 'active_breakout',   lqMin: '35.00', vnMax: '0.6800', diMin: '45.00', diMax: '100.00', corrMax: '0.9200', minVolume: '400000.00', minHistoryDays: 21 },
  { mode: 'paper', filterPath: 'active_oscillator', lqMin: '25.00', vnMax: '0.8500', diMin: '0.00',  diMax: '30.00',  corrMax: '0.9500', minVolume: '250000.00', minHistoryDays: 14 },
  // VTS (passive learning) family paths — relaxed thresholds
  { mode: 'paper', filterPath: 'vts_trend',          lqMin: '30.00', vnMax: '0.7000', diMin: '45.00', diMax: '100.00', corrMax: '0.9500', minVolume: '250000.00', minHistoryDays: 21 },
  { mode: 'paper', filterPath: 'vts_reversal',       lqMin: '20.00', vnMax: '0.9000', diMin: '0.00',  diMax: '40.00',  corrMax: '0.9800', minVolume: '150000.00', minHistoryDays: 14 },
  { mode: 'paper', filterPath: 'vts_breakout',       lqMin: '28.00', vnMax: '0.7500', diMin: '35.00', diMax: '100.00', corrMax: '0.9500', minVolume: '200000.00', minHistoryDays: 14 },
  { mode: 'paper', filterPath: 'vts_oscillator',     lqMin: '20.00', vnMax: '0.9000', diMin: '0.00',  diMax: '35.00',  corrMax: '0.9800', minVolume: '150000.00', minHistoryDays: 14 },
];

export async function seedFamilyFilters() {
  console.log('[22][SEED] Seeding family filter profiles...');
  for (const seed of FAMILY_FILTER_SEEDS) {
    try {
      await db.insert(screenerFilters).values({
        mode: seed.mode as any,
        filterPath: seed.filterPath,
        lqMin: seed.lqMin,
        vnMax: seed.vnMax,
        diMin: seed.diMin,
        diMax: seed.diMax,
        corrMax: seed.corrMax,
        minVolume: seed.minVolume,
        minHistoryDays: seed.minHistoryDays,
      }).onConflictDoNothing();
      console.log(`[22][SEED] ${seed.filterPath} (${seed.mode}): OK`);
    } catch (err) {
      console.warn(`[22][SEED] ${seed.filterPath} already exists or error:`, err);
    }
  }
  console.log('[22][SEED] Family filter seeding complete.');
}
