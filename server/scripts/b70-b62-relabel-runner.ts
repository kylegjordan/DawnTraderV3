/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B70.1 — B62 Retroactive Labels Runner
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Re-classifies historical VTS closed trades under the current B62-post-audit
 * regime classifier and populates `b62_retroactive_labels` with the original
 * vs retroactive comparison.
 *
 * Source: `logs/virtual_trades/<YYYY-MM-DD>.json` (closed-trade JSON logs)
 *
 * Two paths per trade:
 *   1. Trade entryTime ≥ B74 archive start (2026-04-30) AND OHLC available
 *      in `crypto_spot_ohlc_1m` for the symbol at entry-time → REAL re-classify
 *      via calculatePairRegime() with the trade's persisted dbsScore + fresh
 *      OHLC-derived volatility/momentum/ADX inputs.
 *   2. Older trades or symbols missing from B74 archive → record original_label
 *      with `retroactive_label=NULL` and `requires_ohlc_backfill=true` in
 *      retroactive_inputs JSONB. Future OHLC backfill batch can re-run this
 *      runner to populate the missing labels.
 *
 * Idempotent: ON CONFLICT (trade_id) DO NOTHING. Safe to re-run.
 *
 * Usage:
 *   npx tsx server/scripts/b70-b62-relabel-runner.ts                      # all available
 *   npx tsx server/scripts/b70-b62-relabel-runner.ts 2026-04-30 2026-05-04 # date range
 *
 * Reference: BATCH_70_SCOPE.md §A.4 + RUNNING_ISSUES #57
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
const { Client } = pg;

const VIRTUAL_TRADES_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
  'logs',
  'virtual_trades',
);

const B74_ARCHIVE_START = new Date('2026-04-30T00:00:00Z').getTime();

interface VirtualTradeRecord {
  id: string;
  entryTime: number;
  regime?: string;
  pairDirectionalBiasScore?: number;
  globalDirectionalBiasScore?: number;
  signal?: { symbol?: string };
  signalType?: string;
  schemaVersion?: string;
}

function loadDateFile(date: string): VirtualTradeRecord[] {
  const fp = path.join(VIRTUAL_TRADES_DIR, `${date}.json`);
  if (!fs.existsSync(fp)) return [];
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(`[B70.1][b62-relabel] failed to read ${date}.json:`, err);
    return [];
  }
}

function listAvailableDates(): string[] {
  if (!fs.existsSync(VIRTUAL_TRADES_DIR)) return [];
  return fs
    .readdirSync(VIRTUAL_TRADES_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

interface OhlcRow {
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  interval_begin: Date;
}

async function fetchOhlcForRelabel(
  client: pg.Client,
  symbol: string,
  entryTimeMs: number,
  lookbackBars: number = 100,
): Promise<OhlcRow[]> {
  // Lookup OHLC for the lookback window ending at entryTime.
  // crypto_spot_ohlc_1m uses canonical pair symbol (e.g., 'BTC/USD').
  const startMs = entryTimeMs - lookbackBars * 60_000;
  const r = await client.query(
    `SELECT open, high, low, close, volume, interval_begin
     FROM crypto_spot_ohlc_1m
     WHERE symbol = $1
       AND interval_begin >= $2
       AND interval_begin <= $3
     ORDER BY interval_begin ASC`,
    [symbol, new Date(startMs), new Date(entryTimeMs)],
  );
  return r.rows as OhlcRow[];
}

async function relabelOne(
  client: pg.Client,
  trade: VirtualTradeRecord,
): Promise<'real' | 'placeholder' | 'skip'> {
  const symbol = trade.signal?.symbol;
  if (!symbol || !trade.entryTime || !trade.id) return 'skip';

  const originalLabel = trade.regime ?? null;

  // Try real re-classification only if trade is post-B74 archive start
  if (trade.entryTime >= B74_ARCHIVE_START) {
    try {
      const ohlc = await fetchOhlcForRelabel(client, symbol, trade.entryTime);
      if (ohlc.length >= 30 && trade.pairDirectionalBiasScore !== undefined) {
        // Lazy-load classifier so this script can run standalone
        const { calculatePairRegime } = await import(
          '../core/metrics/market-regime.js'
        );
        const ohlcShape = ohlc.map((r) => ({
          time: r.interval_begin.getTime(),
          open: parseFloat(r.open),
          high: parseFloat(r.high),
          low: parseFloat(r.low),
          close: parseFloat(r.close),
          volume: parseFloat(r.volume),
        }));
        // Use defaults — same as regime config DEFAULT (B62-post-audit baseline)
        const { DEFAULT_REGIME_CONFIG } = await import('../core/metrics/market-regime.js');
        const result = calculatePairRegime(
          ohlcShape as any,
          trade.pairDirectionalBiasScore,
          0, // dbsSlope — unavailable historically; 0 is the safe default
          1.0, // macroModifier — unavailable historically; neutral
          DEFAULT_REGIME_CONFIG,
        );
        const retroactiveLabel = result.regime;
        const labelDiff = originalLabel !== retroactiveLabel;
        await client.query(
          `INSERT INTO b62_retroactive_labels (
             trade_id, symbol, asset_class, trade_opened_at,
             original_label, retroactive_label, label_diff_flag,
             classifier_version_original, classifier_version_retroactive,
             retroactive_inputs
           ) VALUES ($1, $2, 'crypto_spot', $3, $4, $5, $6, 'unknown_pre_b62_or_b62', 'b62_post_audit', $7::jsonb)
           ON CONFLICT (trade_id) DO NOTHING`,
          [
            trade.id,
            symbol,
            new Date(trade.entryTime),
            originalLabel,
            retroactiveLabel,
            labelDiff,
            JSON.stringify({
              schema_version: 1,
              dbs_score: trade.pairDirectionalBiasScore,
              ohlc_bars: ohlc.length,
              source: 'crypto_spot_ohlc_1m',
              requires_ohlc_backfill: false,
            }),
          ],
        );
        return 'real';
      }
    } catch (err) {
      console.warn(
        `[B70.1][b62-relabel] real re-classify failed for ${trade.id} (${symbol}): ${
          err instanceof Error ? err.message : err
        } — falling back to placeholder`,
      );
    }
  }

  // Placeholder path — record original, retroactive=NULL, flag for future backfill
  await client.query(
    `INSERT INTO b62_retroactive_labels (
       trade_id, symbol, asset_class, trade_opened_at,
       original_label, retroactive_label, label_diff_flag,
       classifier_version_original, classifier_version_retroactive,
       retroactive_inputs
     ) VALUES ($1, $2, 'crypto_spot', $3, $4, NULL, FALSE, 'unknown_pre_b62_or_b62', NULL, $5::jsonb)
     ON CONFLICT (trade_id) DO NOTHING`,
    [
      trade.id,
      symbol,
      new Date(trade.entryTime),
      originalLabel,
      JSON.stringify({
        schema_version: 1,
        dbs_score: trade.pairDirectionalBiasScore ?? null,
        requires_ohlc_backfill: true,
        reason:
          trade.entryTime < B74_ARCHIVE_START
            ? 'pre_b74_archive_start'
            : 'ohlc_missing_or_dbs_score_missing',
      }),
    ],
  );
  return 'placeholder';
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[B70.1][b62-relabel] DATABASE_URL not set');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  let dateFilter: { from?: string; to?: string } = {};
  if (args[0]) dateFilter.from = args[0];
  if (args[1]) dateFilter.to = args[1];

  const allDates = listAvailableDates();
  const dates = allDates.filter((d) => {
    if (dateFilter.from && d < dateFilter.from) return false;
    if (dateFilter.to && d > dateFilter.to) return false;
    return true;
  });
  console.log(
    `[B70.1][b62-relabel] processing ${dates.length} date file(s) (range: ${
      dateFilter.from ?? allDates[0]
    } → ${dateFilter.to ?? allDates[allDates.length - 1]})`,
  );

  const client = new Client({ connectionString: url });
  await client.connect();
  let totalReal = 0;
  let totalPlaceholder = 0;
  let totalSkip = 0;
  try {
    for (const date of dates) {
      const trades = loadDateFile(date);
      let dayReal = 0;
      let dayPlaceholder = 0;
      for (const trade of trades) {
        const result = await relabelOne(client, trade);
        if (result === 'real') {
          dayReal++;
          totalReal++;
        } else if (result === 'placeholder') {
          dayPlaceholder++;
          totalPlaceholder++;
        } else {
          totalSkip++;
        }
      }
      console.log(
        `[B70.1][b62-relabel] ${date}: real=${dayReal} placeholder=${dayPlaceholder} (n=${trades.length})`,
      );
    }

    // Diff matrix summary
    const diff = await client.query(
      `SELECT original_label, retroactive_label, count(*)::int AS n
       FROM b62_retroactive_labels
       WHERE retroactive_label IS NOT NULL
       GROUP BY original_label, retroactive_label
       ORDER BY n DESC`,
    );
    console.log(`\n[B70.1][b62-relabel] DIFF MATRIX (real re-classify only):`);
    diff.rows.forEach((r: any) => {
      const flag = r.original_label !== r.retroactive_label ? '🔄' : '✓';
      console.log(`  ${flag} ${r.original_label ?? 'NULL'} → ${r.retroactive_label}: ${r.n}`);
    });
  } finally {
    await client.end();
  }
  console.log(
    `\n[B70.1][b62-relabel] DONE — real=${totalReal} placeholder=${totalPlaceholder} skip=${totalSkip}`,
  );
}

main().catch((err) => {
  console.error('[B70.1][b62-relabel] failed:', err);
  process.exit(1);
});
