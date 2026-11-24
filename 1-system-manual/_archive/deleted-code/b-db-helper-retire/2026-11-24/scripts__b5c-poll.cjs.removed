require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const h = await c.query("SELECT count(*)::int n, max(bucket_start) maxb, count(DISTINCT symbol)::int syms FROM xstock_qd_probe_history");
  const f = await c.query("SELECT count(*)::int n, max(fired_at) maxf FROM scheduled_tasks_audit WHERE task_name='xstock_qd_probe_cron'");
  console.log(`rows=${h.rows[0].n} syms=${h.rows[0].syms} maxb=${h.rows[0].maxb} fires=${f.rows[0].n} maxfire=${f.rows[0].maxf}`);
  await c.end();
})().catch(e => { console.log('ERR ' + e.message); });
