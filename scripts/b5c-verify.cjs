require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const cnt = await c.query("SELECT count(*)::int n, max(bucket_start) maxb, min(bucket_start) minb, count(DISTINCT symbol)::int syms FROM xstock_qd_probe_history");
  console.log('HISTORY_COUNT:', JSON.stringify(cnt.rows[0]));
  const sample = await c.query("SELECT symbol, bucket_start, spread_bps, bid_depth_notional, ask_depth_notional, snap_age_ms, stale, quote_quality FROM xstock_qd_probe_history ORDER BY bucket_start DESC, symbol LIMIT 8");
  console.log('SAMPLE:'); sample.rows.forEach(r => console.log('  ' + JSON.stringify(r)));
  const qq = await c.query("SELECT quote_quality, count(*)::int n FROM xstock_qd_probe_history GROUP BY quote_quality ORDER BY n DESC");
  console.log('QUOTE_QUALITY:', JSON.stringify(qq.rows));
  const fire = await c.query("SELECT fired_at, status, meta FROM scheduled_tasks_audit WHERE task_name='xstock_qd_probe_cron' ORDER BY fired_at DESC LIMIT 3");
  console.log('FIRE_EVIDENCE:'); fire.rows.forEach(r => console.log('  ' + JSON.stringify(r)));
  const consts = await c.query("SELECT module_name, constant_name, value FROM module_constants WHERE module_name='qd_probe' OR constant_name='xstock_qd_probe_history.hot_retention_days' ORDER BY module_name, constant_name");
  console.log('CONSTANTS:', JSON.stringify(consts.rows));
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
