/**
 * B-UNIVERSE-REFRESH-ACTS (#1018, pre-audit §2.6 / J2) — the crypto spot symbols that must stay subscribed
 * because a position is open in them, in EITHER mode.
 *
 * Read at refresh time and at archiver boot. A pinned symbol is never dropped by the refresh and is unioned into
 * the boot universe; it leaves at the first refresh after its position closes.
 *
 * Its own module so the archiver (boot union) and the refresh (gate) share one read without the refresh importing
 * through the archiver for it. A failed read THROWS: an unknown set of held positions is never treated as "none held"
 * (that would let the refresh drop a coin we hold) — the caller decides what a throw means.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db.js';
import { activeOpenPositions } from '../../../shared/schema.js';

const ASSET_CLASS = 'crypto_spot' as const;

/** Distinct crypto spot symbols with an open position, paper and live together, sorted. */
export async function readCryptoUniversePins(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ symbol: activeOpenPositions.symbol })
    .from(activeOpenPositions)
    .where(eq(activeOpenPositions.assetClass, ASSET_CLASS));
  return [...new Set(rows.map(r => r.symbol))].sort();
}
