/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-53 — Decision-provenance helpers (constants hash + version store)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Two responsibilities, both hot-path-safe:
 *  1. resolveConstantsProvenance(strategy, assetClass) — re-resolve the exact
 *     module_constants the strategy's detect() used (a cheap pure cache lookup,
 *     the same most-specific-wins set; the cache is static intra-cycle — see
 *     B_NEW_53_PRE_AUDIT.md §2.4) and hash it into a stable fingerprint.
 *  2. recordConstantsVersion(...) — upsert-on-NOVEL-hash into
 *     module_constants_version. Deduped in-process so it fires only a handful of
 *     times per process lifetime (constants change ~6×/month). Fire-and-forget.
 *
 * The provenance ROW itself (forming bar, settled-ref, stop/target levels) is
 * written by the archiver via the batch writer; this module only owns the
 * constants fingerprint + version snapshot.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { createHash } from 'crypto';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import { getCachedNumbersForModule } from '../module-constants-service.js';

/** Mirror of strategy-engine.ts `_SE_KEY` (inline, not exported there). */
function seKey(strategy: string, assetClass: string) {
  return { exchange: '*', assetClass, strategy, regime: '*' } as const;
}

export interface ConstantsProvenance {
  hash: string;
  moduleName: string;
  resolvedSet: Record<string, number>;
}

/** Stable hash of a {name: value} map — sorted keys so it's order-independent. */
export function hashResolvedSet(moduleName: string, set: Record<string, number>): string {
  const sortedKeys = Object.keys(set).sort();
  const canonical = JSON.stringify({ m: moduleName, c: sortedKeys.map((k) => [k, set[k]]) });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

/**
 * Re-resolve + hash the strategy's detect constants. Returns null on any
 * failure (e.g. module not warm) — provenance then captures everything else and
 * leaves constants_hash null (a coverage gap on that field only, never throws).
 */
export function resolveConstantsProvenance(
  strategy: string,
  assetClass: string,
): ConstantsProvenance | null {
  try {
    const moduleName = `strategy.${strategy}`;
    const resolvedSet = getCachedNumbersForModule(moduleName, seKey(strategy, assetClass));
    if (!resolvedSet || Object.keys(resolvedSet).length === 0) return null;
    return { hash: hashResolvedSet(moduleName, resolvedSet), moduleName, resolvedSet };
  } catch (_err) {
    return null;
  }
}

// In-process dedup: a hash we've already attempted to record. Keeps the upsert
// from firing on every decision — only the FIRST sighting of a novel hash hits
// the DB. Size = number of distinct constant versions seen this process (~few).
const seenHashes = new Set<string>();

/**
 * Record a novel resolved-constant set into module_constants_version. Fire-and-
 * forget, deduped in-process, never blocks the hot path. If the table ever grows
 * ~1:1 with decisions, that loudly surfaces a non-static-constants violation.
 */
export function recordConstantsVersion(
  prov: ConstantsProvenance,
  assetClass: string,
  strategy: string,
): void {
  if (seenHashes.has(prov.hash)) return;
  seenHashes.add(prov.hash);
  const payload = JSON.stringify(prov.resolvedSet);
  void db
    .execute(
      sql`INSERT INTO module_constants_version
            (constants_hash, module_name, asset_class, strategy, resolved_set, first_seen_at)
          VALUES (${prov.hash}, ${prov.moduleName}, ${assetClass}, ${strategy}, ${payload}::jsonb, now())
          ON CONFLICT (constants_hash) DO NOTHING`,
    )
    .catch((err) => {
      // Allow a retry on the next sighting if the write failed.
      seenHashes.delete(prov.hash);
      console.warn(
        `[B-NEW-53][CONST] version upsert failed:`,
        err instanceof Error ? err.message : err,
      );
    });
}

/** Test-only: clear the in-process dedup set. */
export function _resetSeenHashesForTests(): void {
  seenHashes.clear();
}
