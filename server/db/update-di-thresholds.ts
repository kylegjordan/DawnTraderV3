/**
 * Batch 23: Update DI thresholds for trend and breakout families
 * Run after seed to update existing rows that were seeded with old thresholds.
 *
 * Usage: npx tsx server/db/update-di-thresholds.ts
 */

import { db } from '../db.js';
import { screenerFilters } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';

async function updateDiThresholds() {
  console.log('[23][DI_CAL] Updating DI thresholds for trend and breakout families...');
  
  const updates = [
    { filterPath: 'active_trend', diMin: '25.00' },
    { filterPath: 'active_breakout', diMin: '20.00' },
    { filterPath: 'vts_trend', diMin: '20.00' },
    { filterPath: 'vts_breakout', diMin: '15.00' },
  ];

  for (const u of updates) {
    try {
      await db.update(screenerFilters)
        .set({ diMin: u.diMin })
        .where(eq(screenerFilters.filterPath, u.filterPath));
      console.log(`[23][DI_CAL] ${u.filterPath}: diMin updated to ${u.diMin}`);
    } catch (err) {
      console.warn(`[23][DI_CAL] Failed to update ${u.filterPath}:`, err);
    }
  }

  console.log('[23][DI_CAL] DI threshold calibration complete.');
  process.exit(0);
}

updateDiThresholds();
