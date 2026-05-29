/**
 * ════════════════════════════════════════════════════════════════════════════
 * B.1.5 — xStock tradeable-universe audit (O6)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Queries the rolling-median two-sided top-of-book depth per xStock symbol
 * over the last 20 minutes, then reports the tradeable-universe count at each
 * of several depth thresholds. Reusable: re-run any time to re-assess (e.g.,
 * during US-hours vs overnight; before/after threshold recalibration).
 *
 * Mirrors the depth aggregate that runs every cycle in
 * server/asset_classes/xstock_spot/scanner.ts — same SQL shape, so the counts
 * here reflect what the live filter would admit at each threshold.
 *
 * Usage (staging):
 *   ssh root@188.245.193.8 \
 *     "su - deploy -c 'cd /home/deploy/dawntrader && npx tsx scripts/b-1-5-universe-audit.ts'"
 *
 * Output: JSON object with universe counts at each threshold + percentile
 * distribution + a per-symbol list of the thinnest 10 names (for spot-checking).
 * ════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
// `pg` is a CommonJS module; ES-modules-mode tsx needs default-import + destructure.
import pg from 'pg';
const { Pool } = pg;

interface SummaryRow {
  total_symbols: string;
  above_500: string;
  above_1k: string;
  above_2k: string;
  above_5k: string;
  above_10k: string;
  above_25k: string;
  above_50k: string;
  p10_usd: string | null;
  p50_usd: string | null;
  p90_usd: string | null;
}

interface ThinSymbolRow {
  symbol: string;
  min_depth_usd: string;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const summary = await pool.query<SummaryRow>(`
      WITH depth_rolling AS (
        SELECT symbol::text AS symbol,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY ask * ask_qty) AS ask_depth_usd,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY bid * bid_qty) AS bid_depth_usd
        FROM xstock_spot_ticker_snap
        WHERE captured_at > NOW() - INTERVAL '20 minutes'
          AND bid > 0 AND ask > 0 AND bid_qty > 0 AND ask_qty > 0
        GROUP BY symbol
      ),
      two_way AS (
        SELECT symbol, LEAST(ask_depth_usd, bid_depth_usd) AS min_depth_usd
        FROM depth_rolling
      )
      SELECT count(*)::text AS total_symbols,
        (count(*) FILTER (WHERE min_depth_usd >= 500))::text   AS above_500,
        (count(*) FILTER (WHERE min_depth_usd >= 1000))::text  AS above_1k,
        (count(*) FILTER (WHERE min_depth_usd >= 2000))::text  AS above_2k,
        (count(*) FILTER (WHERE min_depth_usd >= 5000))::text  AS above_5k,
        (count(*) FILTER (WHERE min_depth_usd >= 10000))::text AS above_10k,
        (count(*) FILTER (WHERE min_depth_usd >= 25000))::text AS above_25k,
        (count(*) FILTER (WHERE min_depth_usd >= 50000))::text AS above_50k,
        round(percentile_cont(0.10) WITHIN GROUP (ORDER BY min_depth_usd)::numeric, 0)::text AS p10_usd,
        round(percentile_cont(0.50) WITHIN GROUP (ORDER BY min_depth_usd)::numeric, 0)::text AS p50_usd,
        round(percentile_cont(0.90) WITHIN GROUP (ORDER BY min_depth_usd)::numeric, 0)::text AS p90_usd
      FROM two_way
    `);

    const thinnest = await pool.query<ThinSymbolRow>(`
      WITH depth_rolling AS (
        SELECT symbol::text AS symbol,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY ask * ask_qty) AS ask_depth_usd,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY bid * bid_qty) AS bid_depth_usd
        FROM xstock_spot_ticker_snap
        WHERE captured_at > NOW() - INTERVAL '20 minutes'
          AND bid > 0 AND ask > 0 AND bid_qty > 0 AND ask_qty > 0
        GROUP BY symbol
      )
      SELECT symbol, round(LEAST(ask_depth_usd, bid_depth_usd)::numeric, 0)::text AS min_depth_usd
      FROM depth_rolling
      ORDER BY LEAST(ask_depth_usd, bid_depth_usd) ASC
      LIMIT 10
    `);

    const out = {
      window: 'rolling 20 minutes',
      generated_at: new Date().toISOString(),
      summary: summary.rows[0],
      thinnest_10_symbols: thinnest.rows,
      threshold_seeds_in_screener_filters: {
        vts_quant: 2000,
        vts_pattern: 2000,
        active_quant: 5000,
        active_pattern: 5000,
      },
    };
    console.log('B.1.5 — xStock tradeable-universe audit');
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[b-1-5-universe-audit] ERR:', err);
  process.exit(1);
});
