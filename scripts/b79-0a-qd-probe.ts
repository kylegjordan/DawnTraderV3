/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0a — Q-D Probe (one-shot AAPLx-vs-AAPL price-discrepancy diagnostic)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Per Langston Q1 lock (BATCH_79_0a_SCOPE.md §11): probe set MUST include
 *   - mega-caps (AAPL, MSFT, GOOGL) — baseline liquid names
 *   - ≥1 high-vol name (NVDA or TSLA)
 *   - ≥1 lower-tier liquidity name (e.g. ARCT, BHC)
 * If all mega-caps the friction estimate biases low; this set surfaces the
 * spread distribution we'll model friction against in B79.x.
 *
 * For each ticker:
 *   - Read latest xstock spot price from `equity_spot_ticker_snap` (kraken-equities)
 *   - Fetch underlying equity price via Yahoo Finance HTTP
 *   - Compute (xstock - underlying) / underlying → percentage delta
 *
 * Output: JSON to `Claude Comms and Packages/Reports/B79_0a_qd_probe_<ts>.json`.
 *
 * One-shot diagnostic. NOT a feedback loop into the trading system this batch.
 * Continuous Q-D probe → DB table is RUNNING_ISSUES #86 (B79.x follow-up).
 *
 * Run via: `npx tsx scripts/b79-0a-qd-probe.ts`
 * ════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

// Per Langston Q1 lock: mega-caps + high-vol + lower-tier liquidity.
const PROBE_TICKERS = [
  'AAPL/USD',  // mega-cap
  'MSFT/USD',  // mega-cap
  'GOOGL/USD', // mega-cap
  'NVDA/USD',  // high-vol
  'TSLA/USD',  // high-vol
  'BHC/USD',   // lower-tier liquidity
  'ARCT/USD',  // lower-tier liquidity
];

interface TickerSnapRow extends Record<string, unknown> {
  symbol: string;
  price: string;
  capturedAt: Date;
}

interface ProbeResult {
  ticker: string;
  underlyingTicker: string;
  xstockPrice: number | null;
  xstockPriceCapturedAt: string | null;
  xstockPriceAgeSec: number | null;
  underlyingPrice: number | null;
  underlyingError: string | null;
  deltaPct: number | null;
  timestamp: string;
}

async function fetchUnderlyingFromYahoo(ticker: string): Promise<{ price: number | null; error: string | null }> {
  // Yahoo Finance JSON endpoint (no API key required for current quotes).
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`;
  try {
    const res = await fetch(url, {
      headers: {
        // Yahoo blocks empty UA; mimic a browser to avoid 429 / WAF.
        'User-Agent': 'Mozilla/5.0 (compatible; DawnTraderQDProbe/1.0)',
      },
    });
    if (!res.ok) {
      return { price: null, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as { quoteResponse?: { result?: Array<{ regularMarketPrice?: number }> } };
    const result = json.quoteResponse?.result?.[0];
    const price = typeof result?.regularMarketPrice === 'number' ? result.regularMarketPrice : null;
    if (price === null) return { price: null, error: 'no regularMarketPrice in response' };
    return { price, error: null };
  } catch (err) {
    return { price: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function runProbe(): Promise<void> {
  const now = new Date();
  const timestamp = now.toISOString();
  console.log(`[B79.0a][QD_PROBE] starting one-shot probe for ${PROBE_TICKERS.length} tickers at ${timestamp}`);

  const results: ProbeResult[] = [];

  for (const ticker of PROBE_TICKERS) {
    const underlyingTicker = ticker.replace('/USD', '');
    console.log(`[B79.0a][QD_PROBE] processing ${ticker} → ${underlyingTicker}`);

    // 1. xstock spot price from DB.
    let xstockPrice: number | null = null;
    let xstockCapturedAt: Date | null = null;
    try {
      const result = await db.execute<TickerSnapRow>(sql`
        SELECT symbol::text AS symbol, price::text AS price, captured_at AS "capturedAt"
        FROM equity_spot_ticker_snap
        WHERE symbol = ${ticker}
        ORDER BY captured_at DESC
        LIMIT 1
      `);
      const rows = (result as any).rows ?? (result as unknown as TickerSnapRow[]);
      if (Array.isArray(rows) && rows.length > 0) {
        xstockPrice = parseFloat(rows[0].price);
        xstockCapturedAt = new Date(rows[0].capturedAt);
      }
    } catch (err) {
      console.warn(`[B79.0a][QD_PROBE] xstock DB read failed for ${ticker}:`, err);
    }

    // 2. Underlying price from Yahoo.
    const { price: underlyingPrice, error: underlyingError } = await fetchUnderlyingFromYahoo(underlyingTicker);

    // 3. Delta.
    let deltaPct: number | null = null;
    if (xstockPrice !== null && underlyingPrice !== null && underlyingPrice > 0) {
      deltaPct = ((xstockPrice - underlyingPrice) / underlyingPrice) * 100;
    }

    const ageSec = xstockCapturedAt ? (now.getTime() - xstockCapturedAt.getTime()) / 1000 : null;

    const probe: ProbeResult = {
      ticker,
      underlyingTicker,
      xstockPrice,
      xstockPriceCapturedAt: xstockCapturedAt?.toISOString() ?? null,
      xstockPriceAgeSec: ageSec !== null ? Math.round(ageSec) : null,
      underlyingPrice,
      underlyingError,
      deltaPct: deltaPct !== null ? parseFloat(deltaPct.toFixed(4)) : null,
      timestamp,
    };
    results.push(probe);

    console.log(
      `[B79.0a][QD_PROBE] ${ticker}: xstock=${xstockPrice} underlying=${underlyingPrice} delta=${deltaPct?.toFixed(4) ?? 'n/a'}%`,
    );

    // Rate-limit Yahoo
    await new Promise((r) => setTimeout(r, 500));
  }

  // Output JSON to repo Reports/.
  const reportDir = path.resolve(process.cwd(), 'Claude Comms and Packages/Reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const tsForFile = timestamp.replace(/[:.]/g, '-');
  const reportPath = path.join(reportDir, `B79_0a_qd_probe_${tsForFile}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ runAt: timestamp, probeSet: PROBE_TICKERS, results }, null, 2));
  console.log(`[B79.0a][QD_PROBE] report written to ${reportPath}`);

  // Summary diagnostic
  const validDeltas = results.filter((r) => r.deltaPct !== null).map((r) => r.deltaPct as number);
  if (validDeltas.length > 0) {
    const min = Math.min(...validDeltas);
    const max = Math.max(...validDeltas);
    const mean = validDeltas.reduce((a, b) => a + b, 0) / validDeltas.length;
    console.log(`[B79.0a][QD_PROBE] summary: n=${validDeltas.length}/${results.length} valid; delta_pct min=${min.toFixed(4)} max=${max.toFixed(4)} mean=${mean.toFixed(4)}`);
  } else {
    console.warn('[B79.0a][QD_PROBE] zero valid delta computations — diagnostic surface, NOT a deploy blocker');
  }

  console.log('[B79.0a][QD_PROBE] done');
}

runProbe().then(() => process.exit(0)).catch((err) => {
  console.error('[B79.0a][QD_PROBE_FAIL]', err);
  process.exit(0); // exit 0 — probe is diagnostic, not a deploy gate
});
