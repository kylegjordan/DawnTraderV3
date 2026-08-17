/**
 * ═════════════════════════════════════════════════════════════════════════════
 * P19-B-PERPFEED OBJ-1(b) — the DAILY probe: reversible SUSPENSION only
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Langston's reconciliation ruling (2026-08-17): adds and drops are not
 * symmetric costs. This probe CANNOT change membership and CANNOT add — its
 * single power is reversible SUSPENSION: a member that has gone silent (zero
 * OHLC rows in the trailing 24h against a 1,440/day clock expectation) gets
 * recording paused — logged, slot retained, reversible at the monthly
 * recompute or by operator action. A dead symbol must not eat a budget slot
 * for up to 30 days; equally, a probe must never quietly grow the universe.
 *
 * Byte-rate blowout detection (the other suspension trigger) rides the same
 * probe once per-symbol byte accounting exists; v1 suspends on SILENCE only —
 * the throttle ceiling already bounds per-symbol byte rate structurally.
 *
 * Cron line (add to /etc/cron.d or deploy crontab; offset from the 02:15 sweep):
 *   45 3 * * * deploy cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/perpfeed-daily-probe.ts >> /var/log/dawntrader/perpfeed-probe.log 2>&1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

const MODULE = 'passive_archive';
const MEMBERS_KEY = 'crypto_perp_universe.members';
const SUSPENDED_KEY = 'crypto_perp_universe.suspended';
const ENABLED_KEY = 'crypto_perp_capture_enabled';

async function readConstant(client: pg.Client, name: string): Promise<unknown> {
  const r = await client.query(
    `SELECT value FROM module_constants
      WHERE module_name = $1 AND constant_name = $2
        AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
      LIMIT 1`,
    [MODULE, name],
  );
  return r.rows[0]?.value ?? null;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('[perpfeed-probe] DATABASE_URL not set'); process.exit(1); }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const enabled = await readConstant(client, ENABLED_KEY);
    if (enabled !== true) {
      console.log('[perpfeed-probe] capture leg is OFF (gate) — probe is a no-op until switch-on');
      return;
    }
    const members = (await readConstant(client, MEMBERS_KEY)) as string[] | null;
    if (!Array.isArray(members) || members.length === 0) {
      console.log('[perpfeed-probe] no persisted membership — nothing to probe');
      return;
    }
    const suspended = new Set(((await readConstant(client, SUSPENDED_KEY)) as string[] | null) ?? []);

    // One query, whole population: rows per member symbol in the trailing 24h.
    const counts = await client.query(
      `SELECT symbol, count(*) AS n FROM crypto_perp_ohlc_1m
        WHERE interval_begin > now() - interval '24 hours'
        GROUP BY symbol`,
    );
    const rowsBySymbol = new Map<string, number>(counts.rows.map((r: any) => [r.symbol, Number(r.n)]));

    const newlySuspended: string[] = [];
    for (const sym of members) {
      if (suspended.has(sym)) continue; // already paused — resumption is monthly/operator
      const n = rowsBySymbol.get(sym) ?? 0;
      if (n === 0) {
        newlySuspended.push(sym);
        console.warn(`[perpfeed-probe][SUSPEND] ${sym}: 0 OHLC rows in trailing 24h (clock expectation 1,440) — recording paused, slot retained, reversible`);
      }
    }
    if (newlySuspended.length > 0) {
      const next = [...suspended, ...newlySuspended];
      await client.query(
        `UPDATE module_constants SET value = $1::jsonb, updated_at = now(), updated_by = 'perpfeed-daily-probe'
          WHERE module_name = $2 AND constant_name = $3
            AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'`,
        [JSON.stringify(next), MODULE, SUSPENDED_KEY],
      );
      // Fall back to INSERT if the row didn't exist yet.
      await client.query(
        `INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
         VALUES ($1, '*', '*', '*', '*', $2, $3::jsonb, 'perpfeed-daily-probe')
         ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING`,
        [MODULE, SUSPENDED_KEY, JSON.stringify(next)],
      );
      console.warn(`[perpfeed-probe] suspended ${newlySuspended.length} member(s): ${newlySuspended.join(', ')} — takes effect at next archiver universe load`);
    } else {
      console.log(`[perpfeed-probe] all ${members.length - suspended.size} active members alive (${suspended.size} already suspended)`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[perpfeed-probe] failed:', err);
  process.exit(1);
});
