require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const fire = await c.query("SELECT fired_at, status, meta FROM scheduled_tasks_audit WHERE task_name='xstock_qd_probe_cron' ORDER BY fired_at DESC LIMIT 2");
  console.log('FIRE_META:'); fire.rows.forEach(r => console.log('  ' + JSON.stringify(r.meta) + ' status=' + r.status));
  const snapCnt = await c.query("SELECT count(*)::int n, count(DISTINCT symbol)::int syms, max(captured_at) maxc FROM xstock_spot_ticker_snap");
  console.log('TICKER_SNAP:', JSON.stringify(snapCnt.rows[0]));
  const snapSyms = await c.query("SELECT DISTINCT symbol FROM xstock_spot_ticker_snap ORDER BY symbol LIMIT 12");
  console.log('SNAP_SYMBOLS_SAMPLE:', JSON.stringify(snapSyms.rows.map(r => r.symbol)));
  const recent = await c.query("SELECT symbol, captured_at, bid, ask, bid_qty, ask_qty FROM xstock_spot_ticker_snap ORDER BY captured_at DESC LIMIT 4");
  console.log('SNAP_RECENT:'); recent.rows.forEach(r => console.log('  ' + JSON.stringify(r)));
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
