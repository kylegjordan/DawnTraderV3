/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.RTB Phase 2 — backfill asset_class column on rtb_signals
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Scope: scope v2.2 commit 239723058, OBJ-1 Phase 2 + Langston Step 2 ACK
 * commit 97572094e + C-3 dual-path backfill decision (jsonb extraction
 * first, resolveAssetClass fallback).
 *
 * Strategy:
 *   - Read all rtb_signals rows where asset_class IS NULL (idempotent — safe
 *     to re-run; only updates remaining nulls).
 *   - For each row:
 *     1. Try `metadata->>'assetClass'` jsonb extraction. If non-null + valid
 *        AssetClass enum value, use that.
 *     2. Else fall back to `resolveAssetClass(symbol, 'kraken')` per row.
 *     3. If both fail (extremely unlikely), log + leave row as null (Phase 3
 *        CHECK constraint will catch any remaining nulls at deploy time;
 *        Phase 4 SET NOT NULL is contingent on §6.4 zero-null gate).
 *
 * Per Langston C-3: "Phase 2 backfill MUST complete before Phase 1 dual-write
 * code deploys to production." This script is intended to run IMMEDIATELY
 * after the Phase 1 migration applies but BEFORE PM2 restart with Chunk E
 * dual-write code. Bounds the null-window to in-flight deploy rows only.
 *
 * Idempotent: filter `WHERE asset_class IS NULL` means re-running picks up
 * only un-backfilled rows. Safe to run multiple times.
 *
 * Run pattern: `npm run b79-0n-rtb-backfill` (added to package.json scripts).
 * ════════════════════════════════════════════════════════════════════════════
 */

// Load DATABASE_URL from .env — `npm run` does not auto-load .env, so the
// script does it itself (matches the pattern in scripts/db-migrate.ts).
// Without this the server/db.ts import throws "DATABASE_URL must be set".
import 'dotenv/config';

import { db } from '../server/db.js';
import { rtbSignals } from '@shared/schema';
import { sql, eq, and, isNull } from 'drizzle-orm';
import { resolveAssetClass, type AssetClass, ASSET_CLASSES } from '../shared/asset-classes.js';

const VALID_CLASSES = new Set<string>(Object.values(ASSET_CLASSES));

interface BackfillStats {
  total_null_rows: number;
  filled_from_jsonb: number;
  filled_from_symbol_resolver: number;
  failed_unresolvable: number;
}

async function runBackfill(): Promise<BackfillStats> {
  console.log('[B79.0n.RTB][BACKFILL][START] Starting Phase 2 backfill of rtb_signals.asset_class column');

  // §1. Probe initial state — how many nulls do we have?
  const nullRowsBefore = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM rtb_signals WHERE asset_class IS NULL
  `);
  const totalNullRows = Number(nullRowsBefore.rows[0]?.count ?? 0);
  console.log(`[B79.0n.RTB][BACKFILL][INVENTORY] ${totalNullRows} rows with asset_class IS NULL`);

  if (totalNullRows === 0) {
    console.log('[B79.0n.RTB][BACKFILL][NO-OP] No null rows to backfill — exiting clean.');
    return {
      total_null_rows: 0,
      filled_from_jsonb: 0,
      filled_from_symbol_resolver: 0,
      failed_unresolvable: 0,
    };
  }

  const stats: BackfillStats = {
    total_null_rows: totalNullRows,
    filled_from_jsonb: 0,
    filled_from_symbol_resolver: 0,
    failed_unresolvable: 0,
  };

  // §2. Read all null rows in batch (bounded by null count which should be
  // small post-Phase-1; if it's large the deploy ran too long and we should
  // page through. For typical post-deploy windows expect <10000 nulls.)
  const nullRows = await db.execute<{
    id: string;
    symbol: string;
    metadata_class: string | null;
  }>(sql`
    SELECT
      id::text AS id,
      symbol,
      metadata->>'assetClass' AS metadata_class
    FROM rtb_signals
    WHERE asset_class IS NULL
    ORDER BY queued_at ASC
  `);

  console.log(`[B79.0n.RTB][BACKFILL][BATCH_LOADED] ${nullRows.rows.length} rows to process`);

  // §3. Process each row: jsonb-first, symbol-resolver-fallback
  let processedCount = 0;
  for (const row of nullRows.rows) {
    let resolved: AssetClass | null = null;
    let source: 'jsonb' | 'symbol_resolver' | 'failed' = 'failed';

    // §3.1 — try jsonb extraction
    if (row.metadata_class && VALID_CLASSES.has(row.metadata_class)) {
      resolved = row.metadata_class as AssetClass;
      source = 'jsonb';
    } else {
      // §3.2 — fallback to symbol resolver
      try {
        const symbolResolved = resolveAssetClass(row.symbol, 'kraken');
        if (symbolResolved && VALID_CLASSES.has(symbolResolved)) {
          resolved = symbolResolved as AssetClass;
          source = 'symbol_resolver';
        }
      } catch (err) {
        console.error(`[B79.0n.RTB][BACKFILL][RESOLVE_ERR] symbol=${row.symbol} err=${(err as Error).message}`);
      }
    }

    if (!resolved) {
      stats.failed_unresolvable++;
      console.warn(`[B79.0n.RTB][BACKFILL][UNRESOLVABLE] id=${row.id} symbol=${row.symbol} metadata_class=${row.metadata_class ?? 'null'} — leaving row as asset_class=null`);
      continue;
    }

    // §3.3 — update the row with the resolved class
    await db.execute(sql`
      UPDATE rtb_signals
      SET asset_class = ${resolved}
      WHERE id = ${row.id}
        AND asset_class IS NULL
    `);

    if (source === 'jsonb') stats.filled_from_jsonb++;
    else if (source === 'symbol_resolver') stats.filled_from_symbol_resolver++;

    processedCount++;
    if (processedCount % 100 === 0) {
      console.log(`[B79.0n.RTB][BACKFILL][PROGRESS] processed ${processedCount}/${nullRows.rows.length}`);
    }
  }

  // §4. Final verification — how many nulls remain?
  const nullRowsAfter = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM rtb_signals WHERE asset_class IS NULL
  `);
  const residualNulls = Number(nullRowsAfter.rows[0]?.count ?? 0);

  console.log('[B79.0n.RTB][BACKFILL][COMPLETE]', {
    total_processed: processedCount,
    filled_from_jsonb: stats.filled_from_jsonb,
    filled_from_symbol_resolver: stats.filled_from_symbol_resolver,
    failed_unresolvable: stats.failed_unresolvable,
    residual_nulls_remaining: residualNulls,
  });

  return stats;
}

// CLI entry point — direct invocation only
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('b79-0n-rtb-backfill-asset-class.ts')) {
  runBackfill()
    .then(stats => {
      const exitCode = stats.failed_unresolvable > 0 ? 1 : 0;
      if (exitCode !== 0) {
        console.error(`[B79.0n.RTB][BACKFILL][EXIT_NONZERO] ${stats.failed_unresolvable} unresolvable rows — investigate before Phase 3 CHECK constraint applies`);
      }
      process.exit(exitCode);
    })
    .catch(err => {
      console.error('[B79.0n.RTB][BACKFILL][FATAL]', err);
      process.exit(2);
    });
}

export { runBackfill, type BackfillStats };
