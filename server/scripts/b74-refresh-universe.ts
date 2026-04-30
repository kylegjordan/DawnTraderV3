/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — Daily crypto universe refresh
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Run once daily at 03:00 UTC via system cron. Re-queries Kraken AssetPairs,
 * recomputes the crypto universe (USD/USDT/USDC quotes with ≥ floor volume),
 * logs which pairs joined / dropped vs. yesterday's universe.
 *
 * Does NOT modify the running archiver subscriptions (those happen at next
 * full PM2 restart, which is rare). The daily refresh is informational —
 * confirms that the dynamic filter is stable and surfaces churn in the
 * long-tail crypto universe for monitoring.
 *
 * Per Langston cc-inbox #867 Q5 + #869 Q4: system cron invokes this .ts
 * script via tsx; co-located with replay-ablation.ts.
 *
 * Cron line (add to /etc/cron.d/dawntrader on staging server):
 *   0 3 * * * deploy cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b74-refresh-universe.ts >> /var/log/dawntrader/b74-refresh.log 2>&1
 *
 * Reference: BATCH_74_SCOPE.md v1.1 + BATCH_74_PRE_AUDIT.md v1.1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { loadCryptoSpotUniverse } from '../services/passive-archive/universe-loader.js';
import fs from 'fs/promises';
import path from 'path';

const CACHE_PATH = '/tmp/b74-crypto-universe-cache.json';

async function main(): Promise<void> {
  console.log(`[B74][refresh] starting universe refresh at ${new Date().toISOString()}`);

  let prevSymbols: string[] = [];
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf-8');
    prevSymbols = JSON.parse(raw).symbols ?? [];
  } catch {
    console.log('[B74][refresh] no previous cache; treating as initial run');
  }

  const result = await loadCryptoSpotUniverse();
  const currentSet = new Set(result.symbols);
  const prevSet = new Set(prevSymbols);

  const added = result.symbols.filter(s => !prevSet.has(s));
  const dropped = prevSymbols.filter(s => !currentSet.has(s));
  const kept = result.symbols.filter(s => prevSet.has(s));

  console.log(
    `[B74][refresh] universe: ${result.symbols.length} pairs ` +
    `(added=${added.length}, dropped=${dropped.length}, kept=${kept.length})`
  );
  if (added.length > 0) console.log(`[B74][refresh] added: ${added.slice(0, 20).join(', ')}${added.length > 20 ? `, ... (+${added.length - 20})` : ''}`);
  if (dropped.length > 0) console.log(`[B74][refresh] dropped: ${dropped.slice(0, 20).join(', ')}${dropped.length > 20 ? `, ... (+${dropped.length - 20})` : ''}`);

  await fs.writeFile(CACHE_PATH, JSON.stringify({
    refreshedAt: new Date().toISOString(),
    symbolCount: result.symbols.length,
    symbols: result.symbols,
    filterReasons: result.filterReasons,
  }, null, 2));

  console.log(`[B74][refresh] cache written to ${CACHE_PATH}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[B74][refresh] FATAL:', err);
    process.exit(1);
  });
